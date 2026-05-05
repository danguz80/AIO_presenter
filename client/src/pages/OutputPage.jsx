import { useEffect } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { stripChords, isCommentLine, extractInlineComment } from '../utils/chordUtils';
import { resolveFont, injectGoogleFont } from '../utils/fontUtils';

/**
 * Ventana de salida — se abre en una pestaña/ventana separada
 * para enviar a proyector o segunda pantalla.
 */
export default function OutputPage() {
  const { state } = usePresenter();
  const { liveState } = state;
  const cfg = state.outputConfig ?? {};

  useKeyboardRelay();

  useEffect(() => {
    document.title = 'AIO Presenter — Salida';
  }, []);

  // Inyectar Google Fonts cuando cambia la configuración
  useEffect(() => {
    injectGoogleFont(cfg.fontFamily);
    injectGoogleFont(cfg.commentFontFamily);
    injectGoogleFont(cfg.titleFontFamily);
    injectGoogleFont(cfg.artistFontFamily);
  }, [cfg.fontFamily, cfg.commentFontFamily, cfg.titleFontFamily, cfg.artistFontFamily]);

  // Inyección defensiva al mostrar la diapositiva de título
  // (por si la fuente aún no estaba cargada cuando llegó la config)
  useEffect(() => {
    if (slideData?.type === 'title') {
      injectGoogleFont(cfg.titleFontFamily);
      injectGoogleFont(cfg.artistFontFamily);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideData?.type]);

  const { slideData, isBlank, background } = liveState;

  const bgStyle = background.type === 'color'
    ? { backgroundColor: background.color }
    : { backgroundImage: `url(${background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  return (
    <div
      className="w-screen h-screen flex flex-col items-center justify-center select-none overflow-hidden"
      style={bgStyle}
    >
      {isBlank || !slideData ? (
        <div className="w-full h-full" />
      ) : (
        <div className="w-full h-full">
          <SlideContent slideData={slideData} cfg={cfg} />
        </div>
      )}
    </div>
  );
}

// resolveFont importado desde fontUtils

function SlideContent({ slideData, cfg }) {
  const { type } = slideData;

  if (type === 'title') {
    return <TitleSlide slideData={slideData} cfg={cfg} />;
  }

  const lyricsColor      = cfg.lyricsColor      ?? '#ffffff';
  const fontFamily       = resolveFont(cfg.fontFamily ?? 'sans');
  const fontBold         = cfg.fontBold         ?? false;
  const fontItalic       = cfg.fontItalic       ?? false;
  const fontStrokeWidth  = cfg.fontStrokeWidth  ?? 0;
  const fontStrokeColor  = cfg.fontStrokeColor  ?? '#000000';
  const showLabel        = cfg.showLabel        ?? true;
  const showSongTitle    = cfg.showSongTitle    ?? true;
  const showComments     = cfg.showComments     ?? false;
  const commentColor     = cfg.commentColor     ?? '#facc15';
  const commentFontSize  = cfg.commentFontSize  ?? 16;
  const commentFF        = resolveFont(cfg.commentFontFamily ?? 'sans');

  const textShadow = fontStrokeWidth > 0
    ? `0 0 ${fontStrokeWidth}px ${fontStrokeColor}, 0 0 ${fontStrokeWidth}px ${fontStrokeColor}, 0 2px 8px rgba(0,0,0,0.8)`
    : '0 2px 8px rgba(0,0,0,0.8)';

  if (type === 'song') {
    const rawLines = (slideData.content || '').split('\n');
    const lineData = rawLines.map(line => {
      if (isCommentLine(line)) {
        return { visible: '', comment: line.replace(/^\s*\/\/\s?/, ''), isFullComment: true };
      }
      const { visible, comment } = extractInlineComment(line);
      return { visible, comment, isFullComment: false };
    });

    const visibleContent = stripChords(lineData.map(ld => ld.visible).join('\n'));
    const lineCount = visibleContent.split('\n').filter(l => l.trim()).length;

    let fontSize;
    if (cfg.fontSize && cfg.fontSize !== 'auto') {
      fontSize = `${cfg.fontSize}px`;
    } else {
      fontSize = lineCount <= 3 ? 'clamp(2rem, 5vw, 4.5rem)'
               : lineCount <= 5 ? 'clamp(1.6rem, 4vw, 3.5rem)'
               : lineCount <= 7 ? 'clamp(1.3rem, 3.2vw, 2.8rem)'
               : lineCount <= 10 ? 'clamp(1.1rem, 2.6vw, 2.2rem)'
               : 'clamp(0.9rem, 2vw, 1.8rem)';
    }

    const lyricStyle = {
      color:      lyricsColor,
      fontFamily,
      fontWeight: fontBold   ? 'bold'   : 'normal',
      fontStyle:  fontItalic ? 'italic' : 'normal',
      lineHeight: 1.5,
    };

    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center">
        {showLabel && slideData.label && (
          <p className="text-zinc-400 text-sm uppercase tracking-widest mb-4">
            {slideData.label}
          </p>
        )}
        <div className="w-full" style={{ fontSize, textShadow }}>
          {lineData.map((ld, i) => {
            if (ld.isFullComment) {
              if (!showComments) return null;
              return (
                <div key={i} style={{ color: commentColor, fontSize: `${commentFontSize}px`, fontFamily: commentFF, fontStyle: 'italic', lineHeight: 1.4 }}>
                  {ld.comment}
                </div>
              );
            }
            const visibleText = stripChords(ld.visible);
            if (!visibleText.trim() && !ld.comment) return <div key={i} style={{ height: '0.4em' }} />;
            return (
              <div key={i} style={lyricStyle}>
                {visibleText}
                {showComments && ld.comment && (
                  <span style={{ color: commentColor, fontSize: `${commentFontSize}px`, fontFamily: commentFF, fontStyle: 'italic', marginLeft: '0.5em' }}>
                    {ld.comment}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {showSongTitle && slideData.songTitle && (
          <p className="text-zinc-400 text-base mt-6" style={{ fontFamily }}>{slideData.songTitle}</p>
        )}
      </div>
    );
  }

  if (type === 'bible') {
    const lineCount = (slideData.text || '').split('\n').filter(l => l.trim()).length;
    const fontSize = lineCount <= 3 ? 'clamp(1.8rem, 4.5vw, 4rem)'
                   : lineCount <= 6 ? 'clamp(1.4rem, 3.5vw, 3rem)'
                   : 'clamp(1rem, 2.5vw, 2.2rem)';
    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center">
        <p
          className="text-white leading-relaxed whitespace-pre-line w-full"
          style={{ fontSize, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
        >
          {slideData.text}
        </p>
        <p className="text-zinc-300 text-xl mt-6 font-medium">
          {slideData.reference}
        </p>
        {slideData.version && (
          <p className="text-zinc-500 text-sm mt-1">{slideData.version}</p>
        )}
      </div>
    );
  }

  return null;
}

// ─── Diapositiva de título ─────────────────────────────────────────────────
function TitleSlide({ slideData, cfg }) {
  const titleFF   = resolveFont(cfg.titleFontFamily  ?? 'sans');
  const artistFF  = resolveFont(cfg.artistFontFamily ?? 'sans');
  const titleSize = cfg.titleFontSize  ?? 72;
  const titleColor = cfg.titleColor   ?? '#ffffff';
  const showArtist = cfg.titleShowArtist ?? false;
  const artistSize  = cfg.artistFontSize ?? 36;
  const artistColor = cfg.artistColor   ?? '#aaaaaa';
  const strokeWidth = cfg.fontStrokeWidth ?? 0;
  const strokeColor = cfg.fontStrokeColor ?? '#000000';
  const textShadow  = strokeWidth > 0
    ? `0 0 ${strokeWidth}px ${strokeColor}, 0 0 ${strokeWidth}px ${strokeColor}, 0 2px 12px rgba(0,0,0,0.9)`
    : '0 2px 12px rgba(0,0,0,0.9)';

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center gap-4">
      <p
        style={{
          fontFamily:  titleFF,
          fontSize:    `${titleSize}px`,
          color:       titleColor,
          textShadow,
          lineHeight:  1.2,
        }}
      >
        {slideData.songTitle}
      </p>
      {showArtist && slideData.songAuthor && (
        <p
          style={{
            fontFamily: artistFF,
            fontSize:   `${artistSize}px`,
            color:      artistColor,
            textShadow,
            lineHeight: 1.3,
          }}
        >
          {slideData.songAuthor}
        </p>
      )}
    </div>
  );
}

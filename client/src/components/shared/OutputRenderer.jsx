import { useEffect } from 'react';
import { stripChords, isCommentLine, extractInlineComment } from '../../utils/chordUtils';
import { resolveFont, injectGoogleFont } from '../../utils/fontUtils';

/**
 * OutputRenderer — render idéntico al de la ventana /output.
 * Usado tanto en OutputPage (pantalla completa) como en LivePreview (escalado).
 *
 * Props:
 *  - cfg       : outputConfig
 *  - slideData : slide activo (puede ser null)
 *  - isBlank   : boolean
 *  - background: { type, color, url }
 *  - slideIndex, totalSlides: para indicador de progreso
 */
export default function OutputRenderer({ cfg = {}, slideData, isBlank, background = {}, slideIndex, totalSlides, backgroundMedia }) {
  // Inyectar Google Fonts
  useEffect(() => {
    injectGoogleFont(cfg.fontFamily);
    injectGoogleFont(cfg.commentFontFamily);
    injectGoogleFont(cfg.titleFontFamily);
    injectGoogleFont(cfg.artistFontFamily);
  }, [cfg.fontFamily, cfg.commentFontFamily, cfg.titleFontFamily, cfg.artistFontFamily]);

  useEffect(() => {
    if (slideData?.type === 'title') {
      injectGoogleFont(cfg.titleFontFamily);
      injectGoogleFont(cfg.artistFontFamily);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideData?.type]);

  // Indicador de progreso
  const progressEnabled  = cfg.progressEnabled  ?? false;
  const progressPosition = cfg.progressPosition ?? 'bottom-right';
  const progressSize     = cfg.progressSize     ?? 14;
  const progressColor    = cfg.progressColor    ?? '#ffffff';

  const showProgress = progressEnabled && !isBlank && slideData?.type === 'song'
    && totalSlides != null && totalSlides > 0;

  const progressPosStyle = (() => {
    const base = {
      position:        'absolute',
      fontSize:        `${progressSize}px`,
      color:           progressColor,
      fontWeight:      'bold',
      fontFamily:      'monospace',
      textShadow:      '0 1px 4px rgba(0,0,0,0.8)',
      lineHeight:      1,
      padding:         '0.35em 0.6em',
      backgroundColor: 'rgba(0,0,0,0.35)',
      borderRadius:    '0.4em',
    };
    const isTop    = progressPosition.startsWith('top');
    const isBottom = progressPosition.startsWith('bottom');
    const isLeft   = progressPosition.endsWith('left');
    const isRight  = progressPosition.endsWith('right');
    const isCenter = progressPosition.endsWith('center');
    return {
      ...base,
      top:       isTop    ? '1em'  : undefined,
      bottom:    isBottom ? '1em'  : undefined,
      left:      isLeft   ? '1em'  : isCenter ? '50%' : undefined,
      right:     isRight  ? '1em'  : undefined,
      transform: isCenter ? 'translateX(-50%)' : undefined,
    };
  })();

  const bgStyle = background.type === 'color'
    ? { backgroundColor: background.color }
    : background.type === 'image'
      ? { backgroundImage: `url(${background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: '#000000' };

  const hasBgMedia = !isBlank && !!backgroundMedia && (backgroundMedia.mediaType !== 'video' || (cfg.showVideo ?? true));
  const bgFit = cfg.backgroundFit ?? 'contain';

  // La plantilla bíblica puede inyectar su propio fondo por encima del backgroundMedia normal
  const bibleTemplateActive = !isBlank && cfg.bibleTemplateEnabled && slideData?.type === 'bible' && !!cfg.bibleBackground;
  const effectiveBgMedia = bibleTemplateActive ? cfg.bibleBackground : (hasBgMedia ? backgroundMedia : null);
  const hasBg = !!effectiveBgMedia && (effectiveBgMedia.mediaType !== 'video' || (cfg.showVideo ?? true));

  // Logo en pantalla en negro
  const logoEnabled  = cfg.logoEnabled  ?? false;
  const logoMedia    = cfg.logoMedia    ?? null;
  const logoSize     = cfg.logoSize     ?? 30;
  const logoPosition = cfg.logoPosition ?? 'center';
  const logoBgColor  = cfg.logoBgColor  ?? '#000000';
  const logoFit      = cfg.logoFit      ?? 'contain';
  const showLogo     = isBlank && logoEnabled && !!logoMedia;

  // Calcula estilos de posición para el logo
  const logoContainerStyle = (() => {
    const parts = logoPosition.split('-');
    const v = parts[0];
    const h = parts[1] ?? 'center';
    const top    = v === 'top'    ? '5%'  : v === 'bottom' ? 'auto' : '50%';
    const bottom = v === 'bottom' ? '5%'  : 'auto';
    const left   = h === 'left'   ? '5%'  : h === 'right'  ? 'auto' : '50%';
    const right  = h === 'right'  ? '5%'  : 'auto';
    const tx     = h === 'center';
    const ty     = v === 'center';
    const transform = tx && ty ? 'translate(-50%, -50%)'
                   : tx       ? 'translateX(-50%)'
                   : ty       ? 'translateY(-50%)'
                   : 'none';
    return { position: 'absolute', top, bottom, left, right, transform, width: `${logoSize}%`, zIndex: 1 };
  })();

  return (
    <div style={{ ...(showLogo ? { backgroundColor: logoBgColor } : hasBg ? { backgroundColor: '#000' } : bgStyle), width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Capa de fondo multimedia */}
      {hasBg && (
        effectiveBgMedia.mediaType === 'video'
          ? <video key={effectiveBgMedia.url} src={effectiveBgMedia.url} autoPlay loop playsInline data-bg-video="1"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: bgFit, background: '#000', zIndex: 0 }} />
          : <img key={effectiveBgMedia.url} src={effectiveBgMedia.url} alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: bgFit, background: '#000', zIndex: 0 }} />
      )}
      {/* Contenido del slide (texto sobre el fondo) */}
      {!isBlank && slideData && (slideData.type !== 'media' || !hasBg) ? (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          <SlideContent slideData={slideData} cfg={cfg} />
        </div>
      ) : null}
      {/* Logo en pantalla en negro */}
      {showLogo && (
        <div style={logoContainerStyle}>
          {logoMedia.mediaType === 'video' ? (
            <video
              key={logoMedia.url}
              src={logoMedia.url}
              autoPlay
              loop
              muted
              playsInline
              style={{ width: '100%', objectFit: logoFit, display: 'block' }}
            />
          ) : (
            <img
              key={logoMedia.url}
              src={logoMedia.url}
              alt="logo"
              style={{ width: '100%', objectFit: logoFit, display: 'block' }}
            />
          )}
        </div>
      )}
      {showProgress && (
        <div style={{ ...progressPosStyle, zIndex: 2 }}>
          {(slideIndex ?? 0) + 1} / {totalSlides}
        </div>
      )}
    </div>
  );
}

// ─── Contenido del slide ──────────────────────────────────────────────────────
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

    // maxVh: tope de altura por línea según N de líneas
    // Fórmula: ~70vh / (N × lineHeight 1.5) ⇒ el bloque de texto nunca supera ~70% del viewport height
    const maxVh = lineCount <= 3  ? 15
                : lineCount <= 5  ? 9
                : lineCount <= 7  ? 6.5
                : lineCount <= 10 ? 4.5
                : 3.5;
    let fontSize;
    if (cfg.fontSize && cfg.fontSize !== 'auto') {
      // Respetar tamaño fijo del usuario pero caparlo en pantallas bajas (landscape móvil)
      fontSize = `min(${cfg.fontSize}px, ${maxVh}vh)`;
    } else {
      fontSize = lineCount <= 3  ? `clamp(2rem, min(5vw, ${maxVh}vh), 4.5rem)`
               : lineCount <= 5  ? `clamp(1.6rem, min(4vw, ${maxVh}vh), 3.5rem)`
               : lineCount <= 7  ? `clamp(1.3rem, min(3.2vw, ${maxVh}vh), 2.8rem)`
               : lineCount <= 10 ? `clamp(1.1rem, min(2.6vw, ${maxVh}vh), 2.2rem)`
               : `clamp(0.9rem, min(2vw, ${maxVh}vh), 1.8rem)`;
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
    const useTpl        = cfg.bibleTemplateEnabled ?? false;
    const bibleFontFamily = resolveFont(useTpl ? (cfg.bibleFontFamily ?? 'sans') : (cfg.fontFamily ?? 'sans'));
    const bibleColor    = useTpl ? (cfg.bibleColor    ?? '#ffffff') : '#ffffff';
    const bibleAlign    = useTpl ? (cfg.bibleAlignment ?? 'center') : 'center';
    const refPosition   = useTpl ? (cfg.bibleRefPosition ?? 'bottom') : 'bottom';
    const refShowBg     = useTpl ? (cfg.bibleRefShowBg ?? false) : false;
    const refBgColor    = cfg.bibleRefBgColor    ?? '#000000';
    const refBgOpacity  = cfg.bibleRefBgOpacity  ?? 0.6;
    const refColor      = useTpl ? (cfg.bibleRefColor ?? '#cccccc') : '#cccccc';
    const refFontFamily = resolveFont(useTpl ? (cfg.bibleRefFontFamily ?? 'sans') : 'sans');
    const refFontSize   = useTpl ? (cfg.bibleRefFontSize ?? 24) : null; // null = usar clamp auto
    const versionPos    = useTpl ? (cfg.bibleVersionPosition ?? 'inline-right') : 'inline-right';
    const refFs         = refFontSize ? `${refFontSize}px` : 'clamp(0.9rem, 2vw, 1.5rem)';
    const verFs         = refFontSize ? `${Math.round(refFontSize * 0.75)}px` : 'clamp(0.7rem, 1.4vw, 1.1rem)';

    const versionSpan = slideData.version
      ? <span style={{ color: refColor, fontSize: verFs, fontFamily: refFontFamily, fontWeight: 'normal', opacity: 0.8 }}>{slideData.version}</span>
      : null;

    const fontStrokeWidth = cfg.fontStrokeWidth ?? 0;
    const fontStrokeColor = cfg.fontStrokeColor ?? '#000000';
    const textShadow = fontStrokeWidth > 0
      ? `0 0 ${fontStrokeWidth}px ${fontStrokeColor}, 0 0 ${fontStrokeWidth}px ${fontStrokeColor}, 0 2px 8px rgba(0,0,0,0.8)`
      : '0 2px 8px rgba(0,0,0,0.8)';

    const rawText   = slideData.text || '';
    const charLines  = Math.ceil(rawText.length / 46);
    const lineCount  = Math.max(rawText.split('\n').filter(l => l.trim()).length, charLines);
    const bibleMaxVh = lineCount <= 3 ? 13
                     : lineCount <= 5 ? 8
                     : lineCount <= 8 ? 5.5
                     : 4;
    let fontSize;
    if (useTpl && cfg.bibleFontSize && cfg.bibleFontSize !== 'auto') {
      fontSize = `min(${cfg.bibleFontSize}px, ${bibleMaxVh}vh)`;
    } else {
      fontSize = lineCount <= 3 ? `clamp(1.8rem, min(4.5vw, ${bibleMaxVh}vh), 4rem)`
               : lineCount <= 5 ? `clamp(1.4rem, min(3.5vw, ${bibleMaxVh}vh), 3rem)`
               : lineCount <= 8 ? `clamp(1rem, min(2.5vw, ${bibleMaxVh}vh), 2.2rem)`
               : `clamp(0.75rem, min(1.8vw, ${bibleMaxVh}vh), 1.6rem)`;
    }

    const alignItems  = bibleAlign === 'left' ? 'flex-start' : bibleAlign === 'right' ? 'flex-end' : 'center';
    const alignY      = useTpl ? (cfg.bibleAlignmentY ?? 'center') : 'center';
    const textAlign   = bibleAlign;

    // Hex color → rgba para el fondo de la cita
    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    };
    const refBgCss = refShowBg ? hexToRgba(refBgColor, refBgOpacity) : 'transparent';

    // Bloque de cita: ancho completo cuando hay fondo, inline cuando no
    const refBlock = (
      <div style={{
        background: refBgCss,
        borderRadius: 0,
        padding: refShowBg ? '0.5em 1.5em' : '0.4em 1.5em',
        width: '100%',
      }}>
        {/* Fila con referencia + versión según posición */}
        {versionPos === 'inline-right' && (
          <p style={{ color: refColor, fontSize: refFs, fontFamily: refFontFamily, margin: 0, fontWeight: 'bold', textAlign, display: 'flex', alignItems: 'baseline', gap: '0.5em', flexWrap: 'wrap',
            justifyContent: textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center' }}>
            <span>{slideData.reference}</span>
            {versionSpan}
          </p>
        )}
        {versionPos === 'edge-left' && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1em' }}>
            {versionSpan}
            <p style={{ color: refColor, fontSize: refFs, fontFamily: refFontFamily, margin: 0, fontWeight: 'bold', textAlign: 'right', flex: 1 }}>
              {slideData.reference}
            </p>
          </div>
        )}
        {versionPos === 'edge-right' && (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1em' }}>
            <p style={{ color: refColor, fontSize: refFs, fontFamily: refFontFamily, margin: 0, fontWeight: 'bold', textAlign: 'left', flex: 1 }}>
              {slideData.reference}
            </p>
            {versionSpan}
          </div>
        )}
      </div>
    );

    // Cita arriba: pegada al tope sin margen, texto alineado según alignY en el espacio restante
    if (refPosition === 'top') {
      return (
        <div className="w-full h-full flex flex-col" style={{ textAlign }}>
          {/* Cita pegada al tope — sin padding exterior */}
          <div style={{ width: '100%', flexShrink: 0 }}>
            {refBlock}
          </div>
          {/* Texto alineado en Y en el espacio restante */}
          <div style={{ flex: 1, display: 'flex', alignItems: alignY, justifyContent: alignItems, padding: '1rem 4rem' }}>
            <p style={{ color: bibleColor, fontSize, fontFamily: bibleFontFamily, textShadow, lineHeight: 1.65, whiteSpace: 'pre-line', width: '100%' }}>
              {slideData.text}
            </p>
          </div>
        </div>
      );
    }

    // Cita abajo: texto alineado en Y en el espacio restante, cita pegada al fondo
    return (
      <div className="w-full h-full flex flex-col" style={{ textAlign }}>
        {/* Texto alineado en Y en el espacio restante */}
        <div style={{ flex: 1, display: 'flex', alignItems: alignY, justifyContent: alignItems, padding: '1rem 4rem' }}>
          <p style={{ color: bibleColor, fontSize, fontFamily: bibleFontFamily, textShadow, lineHeight: 1.65, whiteSpace: 'pre-line', width: '100%' }}>
            {slideData.text}
          </p>
        </div>
        {/* Cita pegada al fondo — sin padding exterior */}
        <div style={{ width: '100%', flexShrink: 0 }}>
          {refBlock}
        </div>
      </div>
    );
  }

  if (type === 'media') {
    const { url, mediaType } = slideData;
    if (mediaType === 'video') {
      if (!(cfg.showVideo ?? true)) return null;
      return (
        <video
          key={url}
          src={url}
          autoPlay
          loop
          playsInline
          data-media-video="1"
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
        />
      );
    }
    return (
      <img
        key={url}
        src={url}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }}
      />
    );
  }

  return null;
}

// ─── Diapositiva de título ────────────────────────────────────────────────────
function TitleSlide({ slideData, cfg }) {
  const titleFF    = resolveFont(cfg.titleFontFamily  ?? 'sans');
  const artistFF   = resolveFont(cfg.artistFontFamily ?? 'sans');
  const titleSize  = cfg.titleFontSize    ?? 72;
  const titleColor = cfg.titleColor       ?? '#ffffff';
  const showArtist = cfg.titleShowArtist  ?? false;
  const artistSize  = cfg.artistFontSize  ?? 36;
  const artistColor = cfg.artistColor     ?? '#aaaaaa';
  const strokeWidth = cfg.fontStrokeWidth ?? 0;
  const strokeColor = cfg.fontStrokeColor ?? '#000000';
  const textShadow  = strokeWidth > 0
    ? `0 0 ${strokeWidth}px ${strokeColor}, 0 0 ${strokeWidth}px ${strokeColor}, 0 2px 12px rgba(0,0,0,0.9)`
    : '0 2px 12px rgba(0,0,0,0.9)';

  const fontBold   = cfg.fontBold   ?? false;
  const fontItalic = cfg.fontItalic ?? false;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center gap-4">
      <p style={{ fontFamily: titleFF, fontSize: `${titleSize}px`, fontWeight: fontBold ? 'bold' : 'normal', fontStyle: fontItalic ? 'italic' : 'normal', color: titleColor, textShadow, lineHeight: 1.2 }}>
        {slideData.songTitle}
      </p>
      {showArtist && slideData.songAuthor && (
        <p style={{ fontFamily: artistFF, fontSize: `${artistSize}px`, fontWeight: fontBold ? 'bold' : 'normal', fontStyle: fontItalic ? 'italic' : 'normal', color: artistColor, textShadow, lineHeight: 1.3 }}>
          {slideData.songAuthor}
        </p>
      )}
    </div>
  );
}

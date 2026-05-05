import { useEffect } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { stripChords, stripComments, isCommentLine, extractInlineComment } from '../utils/chordUtils';

/**
 * Ventana de salida — se abre en una pestaña/ventana separada
 * para enviar a proyector o segunda pantalla.
 */
export default function OutputPage() {
  const { state } = usePresenter();
  const { liveState } = state;
  const showComments      = state.outputConfig?.showComments      ?? false;
  const commentColor      = state.outputConfig?.commentColor      ?? '#facc15';
  const commentFontSize   = state.outputConfig?.commentFontSize   ?? 16;
  const commentFontFamily = state.outputConfig?.commentFontFamily ?? 'sans';

  useKeyboardRelay();

  // Fullscreen automático si el usuario lo permite
  useEffect(() => {
    document.title = 'AIO Presenter — Salida';
  }, []);

  const { slideData, isBlank, background } = liveState;

  // Estilo de fondo dinámico
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
          <SlideContent
            slideData={slideData}
            showComments={showComments}
            commentColor={commentColor}
            commentFontSize={commentFontSize}
            commentFontFamily={commentFontFamily}
          />
        </div>
      )}
    </div>
  );
}

function SlideContent({ slideData, showComments = false, commentColor = '#facc15', commentFontSize = 16, commentFontFamily = 'sans' }) {
  const { type } = slideData;

  if (type === 'song') {
    // Pre-procesar líneas para separar comentarios del contenido visible
    const rawLines = (slideData.content || '').split('\n');
    const lineData = rawLines.map(line => {
      if (isCommentLine(line)) {
        return { visible: '', comment: line.replace(/^\s*\/\/\s?/, ''), isFullComment: true };
      }
      const { visible, comment } = extractInlineComment(line);
      return { visible, comment, isFullComment: false };
    });

    // Contenido visible (sin comentarios) para calcular tamaño de fuente
    const visibleContent = stripChords(lineData.map(ld => ld.visible).join('\n'));
    const lineCount = visibleContent.split('\n').filter(l => l.trim()).length;
    const fontSize = lineCount <= 3 ? 'clamp(2rem, 5vw, 4.5rem)'
                   : lineCount <= 5 ? 'clamp(1.6rem, 4vw, 3.5rem)'
                   : lineCount <= 7 ? 'clamp(1.3rem, 3.2vw, 2.8rem)'
                   : lineCount <= 10 ? 'clamp(1.1rem, 2.6vw, 2.2rem)'
                   : 'clamp(0.9rem, 2vw, 1.8rem)';

    const commentFF = commentFontFamily === 'serif' ? 'Georgia, serif'
                    : commentFontFamily === 'mono'  ? 'monospace'
                    : 'sans-serif';

    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center">
        {slideData.label && (
          <p className="text-zinc-400 text-sm uppercase tracking-widest mb-4">
            {slideData.label}
          </p>
        )}
        <div className="w-full" style={{ fontSize, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
          {lineData.map((ld, i) => {
            if (ld.isFullComment) {
              if (!showComments) return null;
              return (
                <div key={i} style={{
                  color: commentColor,
                  fontSize: `${commentFontSize}px`,
                  fontFamily: commentFF,
                  fontStyle: 'italic',
                  lineHeight: 1.4,
                }}>
                  {ld.comment}
                </div>
              );
            }
            const visibleText = stripChords(ld.visible);
            if (!visibleText.trim() && !ld.comment) return <div key={i} style={{ height: '0.4em' }} />;
            return (
              <div key={i} className="text-white leading-relaxed">
                {visibleText}
                {showComments && ld.comment && (
                  <span style={{
                    color: commentColor,
                    fontSize: `${commentFontSize}px`,
                    fontFamily: commentFF,
                    fontStyle: 'italic',
                    marginLeft: '0.5em',
                  }}>
                    {ld.comment}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {slideData.songTitle && (
          <p className="text-zinc-400 text-base mt-6">{slideData.songTitle}</p>
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

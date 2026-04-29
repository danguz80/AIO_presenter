import { useEffect, useState } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { stripChords, parseChordLines } from '../utils/chordUtils';

/**
 * Pantalla de Escenario — se abre en una ventana separada para el
 * equipo en tarima. Muestra el slide actual, el siguiente slide y
 * un reloj, con configuración independiente a la pantalla principal.
 */
export default function StagePage() {
  const { state } = usePresenter();
  const { liveState, stageConfig } = state;
  const [time, setTime] = useState(new Date());

  useKeyboardRelay();

  useEffect(() => {
    document.title = 'AIO Presenter — Escenario';
  }, []);

  // Actualizar reloj cada segundo
  useEffect(() => {
    if (!stageConfig.showClock) return;
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [stageConfig.showClock]);

  const { slideData, nextSlideData, isBlank, background: _mainBg } = liveState;
  const { background, showClock, showNextSlide, fontSize } = stageConfig;

  const bgStyle =
    background.type === 'color'
      ? { backgroundColor: background.color }
      : {
          backgroundImage: `url(${background.url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };

  return (
    <div
      className="w-screen h-screen flex flex-col select-none overflow-hidden relative"
      style={bgStyle}
    >
      {/* ── Cabecera: reloj + etiqueta ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/30 shrink-0">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">
          Pantalla de Escenario
        </span>
        {showClock && (
          <span className="text-white font-mono text-lg tabular-nums">
            {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {/* ── Contenido principal ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {isBlank || !slideData ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-white/20 text-2xl font-light">Pantalla vacía</span>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <StageSlideContent slideData={slideData} fontSize={fontSize} />
          </div>
        )}
      </div>

      {/* ── Panel inferior: Siguiente slide ─────────────────────────────── */}
      {showNextSlide && (
        <div className="shrink-0 bg-black/40 border-t border-white/10 px-6 py-3">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
            Siguiente
          </p>
          {nextSlideData && !isBlank ? (
            <NextSlidePreview slideData={nextSlideData} />
          ) : (
            <p className="text-white/20 text-sm italic">— fin —</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Contenido del slide actual ───────────────────────────────────────────────
function StageSlideContent({ slideData, fontSize }) {
  if (slideData.type === 'song') {
    const cleanContent = stripChords(slideData.content || '');
    const lineCount = cleanContent.split('\n').filter(l => l.trim()).length;
    const chordLines = parseChordLines(slideData.content || '');
    const hasAnyChords = chordLines.some(line => line.some(seg => seg.chord));
    // Con acordes cada línea ocupa ~1.6x más de altura → reducir tamaño
    const effectiveLines = hasAnyChords ? Math.ceil(lineCount * 1.6) : lineCount;

    const autoSize =
      effectiveLines <= 3  ? 'clamp(2.2rem, 5.5vw, 5rem)'
      : effectiveLines <= 5  ? 'clamp(1.8rem, 4.2vw, 3.8rem)'
      : effectiveLines <= 7  ? 'clamp(1.4rem, 3.4vw, 3rem)'
      : effectiveLines <= 10 ? 'clamp(1.1rem, 2.6vw, 2.4rem)'
      : 'clamp(0.9rem, 2vw, 1.8rem)';

    const sizeMap = {
      small:  'clamp(0.9rem, 2vw, 1.6rem)',
      medium: 'clamp(1.4rem, 3vw, 2.6rem)',
      large:  'clamp(2rem, 5vw, 4rem)',
      auto:   autoSize,
    };

    const fSize = sizeMap[fontSize] ?? autoSize;

    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center">
        {slideData.label && (
          <p className="text-white/40 text-sm uppercase tracking-widest mb-5">
            {slideData.label}
          </p>
        )}
        <div className="w-full" style={{ fontSize: fSize }}>
          {chordLines.map((line, li) => {
            const lineText = line.map(s => s.text).join('');
            if (!lineText.trim()) return <div key={li} style={{ height: '0.6em' }} />;
            const hasChords = line.some(seg => seg.chord);
            if (!hasChords) {
              return (
                <div key={li} className="text-white leading-relaxed"
                  style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>
                  {lineText}
                </div>
              );
            }
            return (
              <div key={li} className="flex flex-wrap justify-center" style={{ lineHeight: 1.15 }}>
                {line.map((seg, si) => (
                  <span key={si} className="inline-flex flex-col items-start">
                    <span
                      className="font-bold font-mono text-yellow-300"
                      style={{ fontSize: '0.62em', lineHeight: 1, minHeight: '1.1em' }}
                    >
                      {seg.chord || ''}
                    </span>
                    <span
                      className="text-white"
                      style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)', lineHeight: 1.35, whiteSpace: 'pre' }}
                    >
                      {seg.text || (seg.chord ? '\u00a0' : '')}
                    </span>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        {slideData.songTitle && (
          <p className="text-white/30 text-base mt-8">{slideData.songTitle}</p>
        )}
      </div>
    );
  }

  if (slideData.type === 'bible') {
    const lineCount = (slideData.text || '').split('\n').filter(l => l.trim()).length;
    const autoSize =
      lineCount <= 3 ? 'clamp(2rem, 4.8vw, 4.5rem)'
      : lineCount <= 6 ? 'clamp(1.5rem, 3.6vw, 3.2rem)'
      : 'clamp(1.1rem, 2.6vw, 2.4rem)';

    const sizeMap = {
      small:  'clamp(0.9rem, 2vw, 1.6rem)',
      medium: 'clamp(1.4rem, 3vw, 2.6rem)',
      large:  'clamp(2rem, 4.5vw, 4rem)',
      auto:   autoSize,
    };

    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center">
        <p
          className="text-white leading-relaxed whitespace-pre-line w-full"
          style={{ fontSize: sizeMap[fontSize] ?? autoSize, textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
        >
          {slideData.text}
        </p>
        <p className="text-white/60 text-xl mt-6 font-medium">{slideData.reference}</p>
        {slideData.version && (
          <p className="text-white/30 text-sm mt-1">{slideData.version}</p>
        )}
      </div>
    );
  }

  return null;
}

// ─── Preview del siguiente slide ──────────────────────────────────────────────
function NextSlidePreview({ slideData }) {
  if (slideData.type === 'song') {
    return (
      <div className="flex items-baseline gap-3">
        {slideData.label && (
          <span className="text-xs font-medium text-white/50 shrink-0 uppercase tracking-wider">
            {slideData.label}
          </span>
        )}
        <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line line-clamp-2">
          {stripChords(slideData.content)}
        </p>
      </div>
    );
  }

  if (slideData.type === 'bible') {
    return (
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-medium text-white/50 shrink-0">{slideData.reference}</span>
        <p className="text-white/70 text-sm leading-relaxed line-clamp-2">{slideData.text}</p>
      </div>
    );
  }

  return null;
}

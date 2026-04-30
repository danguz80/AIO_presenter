import { useEffect, useState } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { stripChords, parseChordLines } from '../utils/chordUtils';

// Colores por etiqueta (misma paleta que en el controlador)
const LABEL_COLORS = {
  intro:      '#4f46e5',
  verso:      '#2563eb',
  'pre-coro': '#c026d3',
  precoro:    '#c026d3',
  coro:       '#9333ea',
  puente:     '#db2777',
  bridge:     '#db2777',
  outro:      '#e11d48',
  final:      '#e11d48',
  titulo:     '#52525b',
  title:      '#52525b',
};

function getSectionColor(label) {
  if (!label) return '#52525b';
  const key = label.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\d+$/, '').trim();
  return LABEL_COLORS[key] ?? '#52525b';
}

const FONT_PRESETS = {
  sans:      'system-ui, -apple-system, sans-serif',
  serif:     "Georgia, 'Times New Roman', serif",
  mono:      "'Courier New', monospace",
  condensed: "'Arial Narrow', Arial, sans-serif",
};

function resolveFontFamily(family) {
  return FONT_PRESETS[family] ?? `'${family}', system-ui, sans-serif`;
}

function injectGoogleFont(name) {
  const id = `gf-${name.toLowerCase().replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  document.head.appendChild(link);
}

export default function StagePage() {
  const { state } = usePresenter();
  const { liveState, stageConfig, schedule } = state;
  const [time, setTime] = useState(new Date());

  useKeyboardRelay();

  useEffect(() => {
    document.title = 'AIO Presenter — Escenario';
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Inyectar Google Fonts cuando cambia customFonts
  const customFonts = stageConfig.customFonts ?? [];
  useEffect(() => {
    customFonts.forEach(injectGoogleFont);
  }, [customFonts]); // eslint-disable-line

  const {
    slideData, nextSlideData, isBlank,
    slideIndex, totalSlides,
  } = liveState;

  const {
    background,
    showClock        = true,
    showNextSlide    = true,
    showSongTitle    = true,
    showSlideCounter = true,
    showSectionLabel = true,
    showSideLabel    = true,
    lyricsColor  = '#ffffff',
    nextLyricsColor = '#ffffff',
    chordsColor  = '#fde047',
    clockColor   = '#ef4444',
    nextColor    = '#22c55e',
    fontSize     = 36,
    fontFamily   = 'sans',
    fontBold     = true,
    fontItalic   = false,
    fontSizeCounter    = 14,
    fontSizeTitle      = 16,
    fontSizeLabel      = 11,
    fontSizeSideLabel  = 13,
    fontSizeClock      = 22,
    fontSizeNextSong   = 16,
    fontSizeNextLyrics = 32,
    fontSizeChords     = 18,
  } = stageConfig;

  const bgStyle =
    background.type === 'color'
      ? { backgroundColor: background.color }
      : { backgroundImage: `url(${background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  const fontStyles = {
    fontFamily: resolveFontFamily(fontFamily),
    fontWeight: fontBold   ? 'bold'   : 'normal',
    fontStyle:  fontItalic ? 'italic' : 'normal',
  };

  const sz = (val) => typeof val === 'number' ? `${val}pt` : '16pt';

  const hasContent   = !isBlank && !!slideData;
  const label        = slideData?.label;
  const sectionColor = getSectionColor(label);
  const slideNum     = (slideIndex ?? 0) + 1;

  // Siguiente canción del listado del día
  const currentSongId = slideData?.songId;
  const currentIdx    = schedule.findIndex(s => s.song_id === currentSongId);
  const nextSong      = (currentIdx >= 0 && currentIdx < schedule.length - 1)
    ? schedule[currentIdx + 1]
    : null;

  const showTopBar = showSongTitle || showSlideCounter || showSectionLabel;

  return (
    <div
      className="w-screen h-screen flex flex-col select-none overflow-hidden"
      style={bgStyle}
    >
      {/* ── BARRA SUPERIOR ─────────────────────────────────────────────── */}
      {showTopBar && (
        <div
          className="relative flex items-center justify-between px-5 py-2.5 bg-black/70 shrink-0 border-b border-white/10 gap-4"
          style={{ fontFamily: fontStyles.fontFamily }}
        >
        <div className="flex items-center min-w-0 flex-1">
          {showSlideCounter && hasContent && totalSlides != null && (
            <span className="text-white font-mono font-bold shrink-0 tabular-nums" style={{ fontSize: sz(fontSizeCounter) }}>
              {slideNum}/{totalSlides}
            </span>
          )}
          {showSongTitle && hasContent && slideData.songTitle && (
            <span className="text-white font-semibold truncate absolute left-1/2 -translate-x-1/2" style={{ fontSize: sz(fontSizeTitle) }}>
              {slideData.songTitle}{slideData.songKey ? ` - ${slideData.songKey}` : ''}
            </span>
          )}
        </div>
        </div>
      )}

      {/* ── CONTENIDO PRINCIPAL: 50/50 arriba/abajo ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* MITAD SUPERIOR: slide actual */}
        <div className={`flex overflow-hidden ${showNextSlide ? 'flex-1 border-b border-white/10' : 'flex-1'}`}>

          {/* Franja lateral de etiqueta */}
          {showSideLabel && hasContent && label && (
            <div
              className="w-14 shrink-0 flex items-center justify-center"
              style={{ backgroundColor: sectionColor }}
            >
              <span
                className="text-white tracking-widest uppercase select-none"
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  fontFamily: fontStyles.fontFamily,
                  fontWeight: fontStyles.fontWeight,
                  fontSize: sz(fontSizeSideLabel),
                }}
              >
                {label}
              </span>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {!hasContent ? (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-white/20 text-2xl font-light">Pantalla vacía</span>
              </div>
            ) : (
              <StageSlideContent
                slideData={slideData}
                fontSize={fontSize}
                fontStyles={fontStyles}
                lyricsColor={lyricsColor}
                chordsColor={chordsColor}
                chordsSize={fontSizeChords}
              />
            )}
          </div>
        </div>

        {/* MITAD INFERIOR: siguiente slide / siguiente canción */}
        {showNextSlide && (
          <div className="flex-1 flex overflow-hidden bg-black/25">

            {/* Franja lateral de etiqueta del siguiente slide */}
            {showSideLabel && nextSlideData && !isBlank && nextSlideData.label && (
              <div
                className="w-14 shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `${getSectionColor(nextSlideData.label)}88` }}
              >
                <span
                  className="text-white/70 tracking-widest uppercase select-none"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    fontFamily: fontStyles.fontFamily,
                    fontWeight: fontStyles.fontWeight,
                    fontSize: sz(fontSizeSideLabel),
                  }}
                >
                  {nextSlideData.label}
                </span>
              </div>
            )}

            {/* Contenido del panel inferior */}
            <div className="flex-1 overflow-hidden" style={{ opacity: 0.55 }}>
              {nextSlideData && !isBlank ? (
                <StageSlideContent
                  slideData={nextSlideData}
                  fontSize={fontSizeNextLyrics}
                  fontStyles={fontStyles}
                  lyricsColor={nextLyricsColor}
                  chordsColor={chordsColor}
                  chordsSize={fontSizeChords}
                />
              ) : nextSong && !isBlank ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-10 text-center">
                  <span
                    className="text-xs uppercase tracking-widest font-semibold"
                    style={{ color: nextColor }}
                  >
                    Próxima canción
                  </span>
                  <span
                    className="text-3xl font-bold leading-tight"
                    style={{ color: nextColor, fontFamily: fontStyles.fontFamily }}
                  >
                    {nextSong.title}
                  </span>
                  {nextSong.author && (
                    <span className="text-base" style={{ color: `${nextColor}77` }}>
                      {nextSong.author}
                    </span>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-white/20 text-xl italic">— fin —</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── BARRA INFERIOR: próxima canción (centro) + reloj (derecha) ── */}
      {(showClock || nextSong) && (
        <div
          className="shrink-0 bg-black/70 border-t border-white/10 px-5 py-2 flex items-center"
          style={{ fontFamily: fontStyles.fontFamily }}
        >
          {/* Columna izquierda (spacer) */}
          <div className="flex-1" />

          {/* Columna central: título de la próxima canción */}
          {nextSong && (
            <span
              className="font-bold leading-tight text-center"
              style={{ color: nextColor, fontFamily: fontStyles.fontFamily, fontSize: sz(fontSizeNextSong) }}
            >
              {nextSong.title}{nextSong.song_key ? ` - ${nextSong.song_key}` : ''}
            </span>
          )}

          {/* Columna derecha: reloj */}
          <div className="flex-1 flex justify-end">
            {showClock && (
              <span
                className="font-mono font-bold tabular-nums"
                style={{ color: clockColor, fontSize: sz(fontSizeClock) }}
              >
                {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contenido del slide actual ───────────────────────────────────────────────
function StageSlideContent({ slideData, fontSize, fontStyles, lyricsColor, chordsColor, chordsSize = 18 }) {
  if (slideData.type === 'song') {
    const cleanContent  = stripChords(slideData.content || '');
    const lineCount     = cleanContent.split('\n').filter(l => l.trim()).length;
    const chordLines    = parseChordLines(slideData.content || '');
    const hasAnyChords  = chordLines.some(line => line.some(seg => seg.chord));
    const effectiveLines = hasAnyChords ? Math.ceil(lineCount * 1.6) : lineCount;

    const autoSize =
      effectiveLines <= 3  ? 'clamp(2.2rem, 5.5vw, 5rem)'
      : effectiveLines <= 5  ? 'clamp(1.8rem, 4.2vw, 3.8rem)'
      : effectiveLines <= 7  ? 'clamp(1.4rem, 3.4vw, 3rem)'
      : effectiveLines <= 10 ? 'clamp(1.1rem, 2.6vw, 2.4rem)'
      : 'clamp(0.9rem, 2vw, 1.8rem)';

    const fSize = typeof fontSize === 'number' ? `${fontSize}pt` : autoSize;

    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center px-14 text-center"
        style={{ fontSize: fSize, ...fontStyles }}
      >
        <div className="w-full">
          {chordLines.map((line, li) => {
            const lineText = line.map(s => s.text).join('');
            if (!lineText.trim()) return <div key={li} style={{ height: '0.5em' }} />;
            const hasChords = line.some(seg => seg.chord);

            if (!hasChords) {
              return (
                <div
                  key={li}
                  className="leading-relaxed"
                  style={{ color: lyricsColor, textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}
                >
                  {lineText}
                </div>
              );
            }

            return (
              <div key={li} className="flex flex-wrap justify-center" style={{ lineHeight: 1.15 }}>
                {line.map((seg, si) => {
                  const hasRealText = seg.text && seg.text.trim().length > 0;
                  // Para acordes sin texto real debajo, forzar ancho mínimo explícito
                  const outerStyle = (!hasRealText && seg.chord)
                    ? { minWidth: `${(seg.chord.length + 2) * 0.22}em` }
                    : {};
                  return (
                    <span key={si} className="inline-flex flex-col items-start" style={outerStyle}>
                      <span
                        className="font-bold font-mono"
                        style={{ fontSize: `${chordsSize}pt`, lineHeight: 0.85, minHeight: '0.9em', color: chordsColor }}
                      >
                        {seg.chord || ''}
                      </span>
                      <span
                        style={{
                          color: lyricsColor,
                          textShadow: '0 2px 12px rgba(0,0,0,0.7)',
                          lineHeight: 1.15,
                          whiteSpace: 'pre',
                        }}
                      >
                        {hasRealText
                          ? seg.text.replace(/ /g, '\u00a0')
                          : seg.chord
                            ? '\u00a0'
                            : ''}
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
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
          className="leading-relaxed whitespace-pre-line w-full"
          style={{
            fontSize: typeof fontSize === 'number' ? `${fontSize}pt` : autoSize,
            color: lyricsColor,
            textShadow: '0 2px 12px rgba(0,0,0,0.7)',
            ...fontStyles,
          }}
        >
          {slideData.text}
        </p>
        <p className="text-xl mt-6 font-medium" style={{ color: `${lyricsColor}99` }}>
          {slideData.reference}
        </p>
        {slideData.version && (
          <p className="text-sm mt-1" style={{ color: `${lyricsColor}55` }}>
            {slideData.version}
          </p>
        )}
      </div>
    );
  }

  return null;
}

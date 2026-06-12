import { useEffect, useState } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { stripChords, parseChordLines, isCommentLine, extractInlineComment } from '../utils/chordUtils';
import { getLabelColor } from '../utils/labelColors';
import { useTimerDisplay, fmtTimer, useStrobe } from '../hooks/useTimerDisplay';
import { Maximize2 } from 'lucide-react';

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
  if (!name) return;
  const id   = `gf-${name.toLowerCase().replace(/\s+/g, '-')}`;
  const href = `https://fonts.googleapis.com/css2?family=${name.replace(/\s+/g, '+')}&display=swap`;
  const existing = document.getElementById(id);
  if (existing) {
    if (existing.href !== href) existing.href = href;
    return;
  }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export default function StagePage() {
  const { state } = usePresenter();
  const { liveState, stageConfig, schedule, eventPlays, reservasMode } = state;
  const outputCfg = state.outputConfig ?? {};
  const [time, setTime] = useState(new Date());
  const [lastLabel, setLastLabel] = useState(null);
  const timerSeconds = useTimerDisplay(state.timerState);
  const smStrobe = useStrobe(
    !!(state.screenMessage?.visible && state.screenMessage?.strobe &&
      (state.screenMessage.target === 'stage' || state.screenMessage.target === 'both'))
  );

  // El script inline en index.html ya intentó requestFullscreen() antes de que React monte.
  // Aquí solo gestionamos el estado del hint: visible hasta que fullscreen confirme éxito.
  const [showFsHint, setShowFsHint] = useState(() =>
    new URLSearchParams(window.location.search).get('fs') === '1' && !document.fullscreenElement
  );
  useEffect(() => {
    if (!showFsHint) return;
    const onFsChange = () => { if (document.fullscreenElement) setShowFsHint(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [showFsHint]);

  useKeyboardRelay();

  useEffect(() => {
    document.title = 'AIO Presenter — Escenario';
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const customFonts = stageConfig.customFonts ?? [];

  const {
    slideData, nextSlideData, isBlank,
    slideIndex, totalSlides, backgroundMedia,
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
    fontFamilyTitle    = 'sans',
    fontStrokeWidth    = 0,
    fontStrokeColor    = '#000000',
    showComments       = false,
    commentColor       = '#facc15',
    commentFontFamily  = 'sans',
    commentFontSize    = 16,
    showVideo          = true,
  } = stageConfig;

  // ── Inyectar Google Fonts (aquí, después del destructuring) ──────────────
  useEffect(() => {
    customFonts.forEach(injectGoogleFont);
  }, [customFonts]); // eslint-disable-line
  useEffect(() => {
    if (fontFamilyTitle && fontFamilyTitle !== 'sans') injectGoogleFont(fontFamilyTitle);
    if (fontFamily && fontFamily !== 'sans') injectGoogleFont(fontFamily);
  }, [fontFamilyTitle, fontFamily]); // eslint-disable-line
  // Fuentes de la diapositiva de título (outputConfig)
  useEffect(() => {
    if (outputCfg.titleFontFamily)  injectGoogleFont(outputCfg.titleFontFamily);
    if (outputCfg.artistFontFamily) injectGoogleFont(outputCfg.artistFontFamily);
  }, [outputCfg.titleFontFamily, outputCfg.artistFontFamily]); // eslint-disable-line

  const bgStyle =
    background.type === 'color'
      ? { backgroundColor: background.color }
      : { backgroundImage: `url(${background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  const fontStyles = {
    fontFamily: resolveFontFamily(fontFamily),
    fontWeight: fontBold   ? 'bold'   : 'normal',
    fontStyle:  fontItalic ? 'italic' : 'normal',
  };

  const titleFontFamily = resolveFontFamily(fontFamilyTitle ?? fontFamily);

  const sz = (val) => typeof val === 'number' ? `${val}pt` : '16pt';

  const hasBgMedia  = !isBlank && !!backgroundMedia;
  const hasContent   = !isBlank && !!slideData && (slideData.type !== 'media' || !hasBgMedia);
  const label        = slideData?.label;

  // Mantener el último label para que el color de la barra persista entre slides del mismo grupo
  useEffect(() => {
    if (label) setLastLabel(label);
    if (!slideData) setLastLabel(null);
  }, [label, slideData]);

  const effectiveLabel = label || lastLabel;
  const sectionColor = getLabelColor(effectiveLabel);
  const slideNum     = (slideIndex ?? 0) + 1;

  // Siguiente canción del listado del día (saltando separadores y ya tocadas)
  const currentSongId = slideData?.songId;
  const currentIdx    = schedule.findIndex(s => s.song_id === currentSongId);

  // Helper: normalizar label para buscar "reservas" sin importar acento/case
  const normLabel = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const reservasIdx = schedule.findIndex(s => s.item_type === 'separator' && normLabel(s.separator_label).includes('reserva'));
  // Fin de la sección reservas (siguiente separador o fin del array)
  const reservasEndIdx = (() => {
    if (reservasIdx < 0) return -1;
    const next = schedule.findIndex((s, i) => i > reservasIdx && s.item_type === 'separator');
    return next >= 0 ? next : schedule.length;
  })();
  // ¿La canción actual ya está dentro de la sección reservas?
  const currentInReservas = reservasIdx >= 0 && currentIdx > reservasIdx && currentIdx < reservasEndIdx;

  const nextSong = (() => {
    if (reservasMode && reservasIdx >= 0) {
      if (!currentInReservas) {
        // Aún no estamos en reservas: mostrar la primera no tocada de reservas
        for (let i = reservasIdx + 1; i < reservasEndIdx; i++) {
          const it = schedule[i];
          if (!it.song_id) continue;
          if (!eventPlays?.has(it.song_id)) return it;
        }
        // Todas las reservas tocadas → caer a lógica normal desde posición actual
      } else {
        // Dentro de reservas: siguiente no tocada dentro de la sección
        for (let i = currentIdx + 1; i < reservasEndIdx; i++) {
          const it = schedule[i];
          if (!it.song_id) continue;
          if (!eventPlays?.has(it.song_id)) return it;
        }
        // Reservas agotadas → primera no tocada de secciones ANTERIORES a reservas
        for (let i = 0; i < reservasIdx; i++) {
          const it = schedule[i];
          if (it.item_type === 'separator' || !it.song_id) continue;
          if (!eventPlays?.has(it.song_id)) return it;
        }
        return null;
      }
    }
    // Lógica normal: primera no tocada en todo el schedule (excluyendo la actual)
    for (let i = 0; i < schedule.length; i++) {
      const it = schedule[i];
      if (it.item_type === 'separator' || !it.song_id) continue;
      if (it.song_id === currentSongId) continue; // saltar la actual
      if (eventPlays?.has(it.song_id)) continue;
      return it;
    }
    return null;
  })();

  const showTopBar = showSongTitle || showSlideCounter || showSectionLabel;

  return (
    <div
      className="w-screen h-screen flex flex-col select-none overflow-hidden relative"
      style={bgStyle}
    >
      {/* Capa de fondo multimedia (primerPlano=false) */}
      {hasBgMedia && (
        backgroundMedia.mediaType === 'video'
          ? showVideo
            ? <video key={backgroundMedia.url} src={backgroundMedia.url} autoPlay loop muted playsInline data-bg-video="1"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', zIndex: 0 }} />
            : null
          : <img key={backgroundMedia.url} src={backgroundMedia.url} alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', zIndex: 0 }} />
      )}
      {/* ── BARRA SUPERIOR ─────────────────────────────────────────────── */}
      {showTopBar && (
        <div
          className="relative flex items-center justify-between px-5 py-2.5 bg-black/70 shrink-0 border-b border-white/10 gap-4"
          style={{ fontFamily: fontStyles.fontFamily, zIndex: 1 }}
        >
        <div className="flex items-center min-w-0 flex-1">
          {showSlideCounter && hasContent && totalSlides != null && (
            <span className="text-white font-mono font-bold shrink-0 tabular-nums" style={{ fontSize: sz(fontSizeCounter) }}>
              {slideNum}/{totalSlides}
            </span>
          )}
          {showSongTitle && hasContent && slideData.songTitle && (
            <span className="text-white font-semibold truncate absolute left-1/2 -translate-x-1/2" style={{ fontSize: sz(fontSizeTitle), fontFamily: titleFontFamily }}>
              {slideData.songTitle}{slideData.songKey ? ` - ${slideData.songKey}` : ''}
            </span>
          )}
        </div>
        </div>
      )}

      {/* ── CONTENIDO PRINCIPAL: 50/50 arriba/abajo ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0" style={{ position: 'relative', zIndex: 1 }}>

        {/* MITAD SUPERIOR: slide actual */}
        <div className={`flex overflow-hidden ${showNextSlide ? 'flex-1 border-b border-white/10' : 'flex-1'}`}>

          {/* Franja lateral de etiqueta */}
          {showSideLabel && hasContent && (
            <div
              className="w-14 shrink-0 flex items-center justify-center"
              style={{ backgroundColor: sectionColor }}
            >
              {effectiveLabel && (
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
                  {effectiveLabel}
                </span>
              )}
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
                titleFontFamily={titleFontFamily}
                outputCfg={outputCfg}
                lyricsColor={lyricsColor}
                chordsColor={chordsColor}
                chordsSize={fontSizeChords}
                strokeWidth={fontStrokeWidth}
                strokeColor={fontStrokeColor}
                showComments={showComments}
                commentColor={commentColor}
                commentFontFamily={commentFontFamily}
                commentFontSize={commentFontSize}
                showVideo={showVideo}
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
                style={{ backgroundColor: `${getLabelColor(nextSlideData.label)}88` }}
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
                  strokeWidth={fontStrokeWidth}
                  strokeColor={fontStrokeColor}
                  showComments={showComments}
                  commentColor={commentColor}
                  commentFontFamily={commentFontFamily}
                  commentFontSize={commentFontSize}
                  showVideo={showVideo}
                />
              ) : nextSong ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-10 text-center">
                  <span
                    className="text-xs uppercase tracking-widest font-semibold"
                    style={{ color: nextColor }}
                  >
                    Próxima canción
                  </span>
                  <span
                    className="text-3xl font-bold leading-tight"
                    style={{ color: nextColor, fontFamily: titleFontFamily }}
                  >
                    {nextSong.title}{nextSong.song_key ? ` — ${nextSong.song_key}` : ''}
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

      {/* ── Overlay de mensaje/timer EN el área de siguiente slide ── */}
      {(() => {
        const sm = state.screenMessage;
        const tm = state.timerState;
        const showSm = sm?.visible && (sm.target === 'stage' || sm.target === 'both') && sm.text;
        const showTm = tm?.running && (!tm.target || tm.target === 'stage' || tm.target === 'both');
        if (!showSm && !showTm) return null;

        // Si hay área de siguiente slide, el overlay la ocupa exactamente.
        // Si no existe esa área, mostramos una banda fija en la parte inferior.
        const style = showNextSlide
          ? { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', zIndex: 10 }
          : { position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', zIndex: 10 };

        if (showSm) {
          const bg = sm.strobe
            ? (smStrobe ? (sm.bgColor || 'rgba(0,0,0,0.92)') : '#000000')
            : (sm.bgColor || 'rgba(0,0,0,0.92)');
          return (
            <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, padding: '0 5%' }}>
              <span style={{ color: sm.textColor || '#ffffff', fontWeight: 'bold', fontSize: '2.5rem', textAlign: 'center', lineHeight: 1.2 }}>
                {sm.text}
              </span>
            </div>
          );
        }

        // Timer
        const bg = tm.strobe
          ? (smStrobe ? (tm.bgColor || 'rgba(0,0,0,0.92)') : '#000000')
          : (tm.bgColor || 'rgba(0,0,0,0.92)');
        return (
          <div style={{ ...style, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: bg }}>
            <span className="font-mono font-bold tabular-nums" style={{ color: tm.textColor || '#facc15', fontSize: sz(fontSizeNextSong + 20) }}>
              {fmtTimer(timerSeconds)}
            </span>
            {tm.label && (
              <span style={{ color: (tm.textColor || '#facc15') + '99', fontSize: sz(fontSizeNextSong), marginTop: '0.25rem' }}>
                {tm.label}
              </span>
            )}
          </div>
        );
      })()}

      {/* ── BARRA INFERIOR: próxima canción + reloj (siempre visible si hay datos) ── */}
      {(showClock || nextSong) && (
        <div
          className="shrink-0 bg-black/70 border-t border-white/10 px-5 py-2 flex items-center"
          style={{ fontFamily: fontStyles.fontFamily, position: 'relative', zIndex: 11 }}
        >
          <div className="flex-1" />

          {nextSong && (
            <span className="font-bold leading-tight text-center"
              style={{ color: nextColor, fontFamily: titleFontFamily, fontSize: sz(fontSizeNextSong) }}>
              {nextSong.title}{nextSong.song_key ? ` - ${nextSong.song_key}` : ''}
            </span>
          )}

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
      {/* Overlay pantalla completa (si auto-fullscreen falló) */}
      {showFsHint && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center cursor-pointer select-none"
          style={{ background: 'rgba(0,0,0,0.02)' }}
          onClick={() => { document.documentElement.requestFullscreen?.().catch(() => {}); setShowFsHint(false); }}
        >
          <div className="flex flex-col items-center gap-3 px-8 py-5 bg-black/90 rounded-2xl border border-white/20 pointer-events-none">
            <Maximize2 size={28} className="text-white/70" />
            <p className="text-white/90 text-sm font-medium">Clic para activar pantalla completa</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contenido del slide actual ───────────────────────────────────────────────
function StageSlideContent({ slideData, fontSize, fontStyles, titleFontFamily, outputCfg = {}, lyricsColor, chordsColor, chordsSize = 18, strokeWidth = 0, strokeColor = '#000000', showComments = false, commentColor = '#facc15', commentFontFamily = 'sans', commentFontSize = 16, showVideo = true }) {
  const stroke = strokeWidth > 0
    ? `${Array.from({ length: 4 }, (_, i) => {
        const angle = i * 90;
        const x = Math.round(Math.cos(angle * Math.PI / 180) * strokeWidth);
        const y = Math.round(Math.sin(angle * Math.PI / 180) * strokeWidth);
        return `${strokeColor} ${x}px ${y}px 0, ${strokeColor} ${-x}px ${-y}px 0, ${strokeColor} ${x}px ${-y}px 0, ${strokeColor} ${-x}px ${y}px 0`;
      }).join(', ')}, 0 2px 12px rgba(0,0,0,0.7)`
    : '0 2px 12px rgba(0,0,0,0.7)';
  if (slideData.type === 'song') {
    const rawContent = slideData.content || '';
    const rawLines   = rawContent.split('\n');

    // Pre-procesar cada línea: extraer comentarios inline
    const lineData = rawLines.map(line => {
      if (isCommentLine(line)) {
        return { visible: '', comment: line.replace(/^\s*\/\/\s?/, ''), isFullComment: true };
      }
      const { visible, comment } = extractInlineComment(line);
      return { visible, comment, isFullComment: false };
    });

    // Parsear acordes solo sobre la parte visible de cada línea
    const chordLines = parseChordLines(lineData.map(ld => ld.visible).join('\n'));

    // Contar líneas reales (sin comentarios puros, sin vacías) para autosize
    const lineCount     = lineData.filter(ld => !ld.isFullComment && stripChords(ld.visible).trim()).length;
    const hasAnyChords  = chordLines.some(line => line.some(seg => seg.chord));
    const effectiveLines = hasAnyChords ? Math.ceil(lineCount * 1.6) : lineCount;

    const autoSize =
      effectiveLines <= 3  ? 'clamp(2.2rem, 5.5vw, 5rem)'
      : effectiveLines <= 5  ? 'clamp(1.8rem, 4.2vw, 3.8rem)'
      : effectiveLines <= 7  ? 'clamp(1.4rem, 3.4vw, 3rem)'
      : effectiveLines <= 10 ? 'clamp(1.1rem, 2.6vw, 2.4rem)'
      : 'clamp(0.9rem, 2vw, 1.8rem)';

    const fSize = typeof fontSize === 'number' ? `${fontSize}pt` : autoSize;

    const FONT_PRESETS_COMMENT = {
      sans:      'system-ui, -apple-system, sans-serif',
      serif:     "Georgia, 'Times New Roman', serif",
      mono:      "'Courier New', monospace",
      condensed: "'Arial Narrow', Arial, sans-serif",
    };
    const commentFF = FONT_PRESETS_COMMENT[commentFontFamily] ?? `'${commentFontFamily}', system-ui, sans-serif`;

    const commentStyle = {
      color: commentColor,
      fontSize: `${commentFontSize}pt`,
      fontFamily: commentFF,
      fontWeight: 'normal',
      fontStyle: 'italic',
      textShadow: stroke,
    };

    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center px-14 text-center"
        style={{ fontSize: fSize, ...fontStyles }}
      >
        <div className="w-full">
          {lineData.map((ld, li) => {
            // ── Línea de comentario completo ──────────────────────────
            if (ld.isFullComment) {
              if (!showComments) return null;
              return (
                <div key={li} style={{ ...commentStyle, marginBlock: '0.2em' }}>
                  {ld.comment}
                </div>
              );
            }

            const line     = chordLines[li];
            const lineText = line.map(s => s.text).join('');
            const hasChords = line.some(seg => seg.chord);

            // Línea vacía sin comentario inline
            if (!lineText.trim() && !ld.comment && !hasChords) return <div key={li} style={{ height: '0.5em' }} />;

            // Span de comentario inline (reutilizable)
            const inlineComment = showComments && ld.comment
              ? <span style={{ ...commentStyle, marginLeft: '0.5em' }}>{ld.comment}</span>
              : null;

            // ── Línea de letra sin acordes ────────────────────────────
            if (!hasChords) {
              return (
                <div key={li} className="leading-relaxed" style={{ color: lyricsColor, textShadow: stroke }}>
                  {lineText}{inlineComment}
                </div>
              );
            }

            // ── Línea con acordes ─────────────────────────────────────
            return (
              <div key={li} className="flex flex-wrap justify-center" style={{ lineHeight: 1.15 }}>
                {line.map((seg, si) => {
                  const hasRealText = seg.text && seg.text.trim().length > 0;
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
                          textShadow: stroke,
                          lineHeight: 1.15,
                          whiteSpace: 'pre',
                        }}
                      >
                        {hasRealText
                          ? seg.text.replace(/ /g, '\u00a0')
                          : seg.chord ? '\u00a0' : ''}
                      </span>
                    </span>
                  );
                })}
                {inlineComment}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (slideData.type === 'bible') {
    const rawText    = slideData.text || '';
    // Estimar líneas visuales: usar la mayor entre \n reales y estimado por número de caracteres
    const charLines  = Math.ceil(rawText.length / 46); // ~46 chars por línea a font grande
    const lineCount  = Math.max(rawText.split('\n').filter(l => l.trim()).length, charLines);
    const autoSize =
      lineCount <= 3 ? 'clamp(2rem, 4.8vw, 4.5rem)'
      : lineCount <= 5 ? 'clamp(1.5rem, 3.6vw, 3.2rem)'
      : lineCount <= 8 ? 'clamp(1.1rem, 2.6vw, 2.4rem)'
      : 'clamp(0.85rem, 2vw, 1.8rem)';

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
            fontSize: autoSize,
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

  if (slideData.type === 'title') {
    // Usar configuración del outputConfig para la diapositiva de título
    const titleFF   = outputCfg.titleFontFamily
      ? resolveFontFamily(outputCfg.titleFontFamily)
      : (titleFontFamily ?? fontStyles.fontFamily);
    const artistFF  = outputCfg.artistFontFamily
      ? resolveFontFamily(outputCfg.artistFontFamily)
      : titleFF;
    const titleColor  = outputCfg.titleColor  ?? lyricsColor;
    const artistColor = outputCfg.artistColor ?? `${lyricsColor}aa`;
    const titleSize   = outputCfg.titleFontSize  ? `${outputCfg.titleFontSize}px`  : `${Math.max(fontSize, 48)}pt`;
    const artistSize  = outputCfg.artistFontSize ? `${outputCfg.artistFontSize}px` : `${Math.max(Math.round(fontSize * 0.55), 26)}pt`;
    const showArtist  = outputCfg.titleShowArtist ?? true;
    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-14 text-center gap-6">
        <div style={{
          fontFamily: titleFF,
          fontWeight: fontStyles.fontWeight,
          fontStyle:  fontStyles.fontStyle,
          color:      titleColor,
          fontSize:   titleSize,
          textShadow: stroke,
          lineHeight: 1.2,
        }}>
          {slideData.songTitle}
        </div>
        {showArtist && slideData.songAuthor && (
          <div style={{
            fontFamily: artistFF,
            fontWeight: fontStyles.fontWeight,
            fontStyle:  fontStyles.fontStyle,
            color:      artistColor,
            fontSize:   artistSize,
            textShadow: stroke,
            lineHeight: 1.3,
          }}>
            {slideData.songAuthor}
          </div>
        )}
      </div>
    );
  }

  if (slideData.type === 'media') {
    const { url, mediaType, fileName } = slideData;
    if (mediaType === 'video') {
      if (!showVideo) {
        return (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/40">
            <span style={{ fontSize: '2rem' }}>▶</span>
            <span style={{ fontSize: '0.85rem', fontFamily: fontStyles.fontFamily }}>{fileName || 'Video'}</span>
          </div>
        );
      }
      return (
        <video
          key={url}
          src={url}
          autoPlay
          loop
          muted
          playsInline
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

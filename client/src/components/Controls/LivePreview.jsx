import { usePresenter } from '../../context/usePresenter';
import { stripChords, parseChordLines } from '../../utils/chordUtils';

const LABEL_COLORS = {
  intro: '#4f46e5', verso: '#2563eb', 'pre-coro': '#c026d3', precoro: '#c026d3',
  coro: '#9333ea', puente: '#db2777', bridge: '#db2777',
  outro: '#e11d48', final: '#e11d48', titulo: '#52525b', title: '#52525b',
};
function getSectionColor(label) {
  if (!label) return '#52525b';
  const key = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\d+$/, '').trim();
  return LABEL_COLORS[key] ?? '#52525b';
}

export default function LivePreview() {
  const { state } = usePresenter();
  const { liveState, stageConfig, virtualConfig, schedule } = state;
  const { slideData, nextSlideData, isBlank, background } = liveState;

  const live = !isBlank && !!slideData;

  const mainBgStyle = background.type === 'color'
    ? { backgroundColor: background.color }
    : { backgroundImage: `url(${background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  const stageBgStyle = stageConfig.background.type === 'color'
    ? { backgroundColor: stageConfig.background.color }
    : { backgroundImage: `url(${stageConfig.background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  const virtualBgStyle = (() => {
    const bg = virtualConfig.background;
    if (bg.type === 'chromakey') return { backgroundColor: virtualConfig.chromaColor ?? '#00b140' };
    if (bg.type === 'color')     return { backgroundColor: bg.color ?? '#000000' };
    return {
      backgroundImage: 'repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%)',
      backgroundSize:  '12px 12px',
    };
  })();

  const openWindow = (path) =>
    window.open(path, '_blank', 'width=1280,height=720,menubar=no,toolbar=no,location=no');

  return (
    <div className="border-b border-surface-700 p-3 shrink-0 space-y-2">

      {/* ── Fila 1: Principal (ancho completo) ───────────────────────── */}
      <PreviewBox
        label="Principal"
        dotColor="bg-orange-400"
        borderColor={live ? 'border-orange-400' : 'border-surface-600'}
        live={live}
        onClick={() => openWindow('/output')}
      >
        <div className="w-full rounded overflow-hidden flex items-center justify-center"
          style={{ ...mainBgStyle, aspectRatio: '16/9' }}>
          <SlidePreviewContent slideData={slideData} isBlank={isBlank} />
        </div>
      </PreviewBox>

      {/* ── Fila 2: Escenario + Stream ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">

        {/* Escenario */}
        <PreviewBox
          label="Escenario"
          dotColor="bg-orange-400"
          borderColor={live ? 'border-orange-400' : 'border-surface-600'}
          live={live}
          onClick={() => openWindow('/stage')}
        >
          <StagePreview
            stageBgStyle={stageBgStyle}
            slideData={slideData}
            nextSlideData={nextSlideData}
            isBlank={isBlank}
            live={live}
            stageConfig={stageConfig}
            schedule={schedule}
          />
        </PreviewBox>

        {/* Virtual / NDI */}
        <PreviewBox
          label="Stream"
          dotColor="bg-cyan-400"
          borderColor={live ? 'border-cyan-400' : 'border-surface-600'}
          live={live}
          onClick={() => openWindow('/virtual')}
        >
          <div className="w-full rounded overflow-hidden flex items-center justify-center"
            style={{ ...virtualBgStyle, aspectRatio: '16/9' }}>
            {virtualConfig.background.type === 'transparent' && !live
              ? <span className="text-zinc-500 text-[8px]">Transparente</span>
              : <SlidePreviewContent slideData={slideData} isBlank={isBlank}
                  transparent={virtualConfig.background.type === 'transparent'} />
            }
          </div>
        </PreviewBox>

      </div>

    </div>
  );
}

// ─── Preview fiel al StagePage ────────────────────────────────────────────────
function StagePreview({ stageBgStyle, slideData, nextSlideData, isBlank, live, stageConfig, schedule }) {
  const {
    lyricsColor = '#ffffff', nextLyricsColor = '#ffffff',
    chordsColor = '#fde047',
    showSideLabel = true, showSongTitle = true, showSlideCounter = true,
    showClock = true, showNextSlide = true, showSectionLabel = true,
    slideIndex, totalSlides,
  } = stageConfig;

  const currentSongId = live && slideData?.songId;
  const idx = currentSongId ? schedule.findIndex(s => s.song_id === currentSongId) : -1;
  const nextSong = idx >= 0 && idx + 1 < schedule.length ? schedule[idx + 1] : null;

  const sectionColor = getSectionColor(slideData?.label);

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const hasCurrentChords = live && slideData?.type === 'song' &&
    parseChordLines(slideData.content || '').some(l => l.some(s => s.chord));

  const hasNextChords = nextSlideData?.type === 'song' &&
    parseChordLines(nextSlideData.content || '').some(l => l.some(s => s.chord));

  return (
    <div className="w-full rounded overflow-hidden flex flex-col select-none"
      style={{ ...stageBgStyle, aspectRatio: '16/9', fontSize: '7px' }}>

      {/* Top bar */}
      <div className="shrink-0 flex items-center px-1.5 py-0.5 bg-black/30 border-b border-white/10 relative"
        style={{ minHeight: '12px' }}>
        {showSlideCounter && live && (
          <span style={{ color: '#94a3b8', fontSize: '0.85em' }}>
            {(stageConfig.slideIndex ?? 0) + 1}/{stageConfig.totalSlides ?? 1}
          </span>
        )}
        {showSongTitle && live && slideData?.songTitle && (
          <span className="absolute left-1/2 -translate-x-1/2 font-bold truncate max-w-[70%]"
            style={{ color: lyricsColor, fontSize: '1em' }}>
            {slideData.songTitle}{slideData.songKey ? ` - ${slideData.songKey}` : ''}
          </span>
        )}
      </div>

      {/* Main area: 2 halves */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Top half — slide actual */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {showSideLabel && (
            <div className="shrink-0 w-1.5" style={{ backgroundColor: sectionColor }} />
          )}
          <div className="flex-1 flex flex-col items-center justify-center px-1.5 py-0.5 overflow-hidden">
            {!live || !slideData || isBlank ? (
              <span style={{ color: '#52525b', fontSize: '0.9em' }}>Vacío</span>
            ) : (
              <MiniSlideContent
                slideData={slideData}
                lyricsColor={lyricsColor}
                chordsColor={chordsColor}
                hasChords={hasCurrentChords}
              />
            )}
          </div>
        </div>

        {/* Bottom half — siguiente slide / canción */}
        {showNextSlide && (
          <div className="flex-1 flex overflow-hidden min-h-0 border-t border-white/10"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
            {showSideLabel && (
              <div className="shrink-0 w-1.5" style={{ backgroundColor: sectionColor, opacity: 0.45 }} />
            )}
            <div className="flex-1 flex flex-col items-center justify-center px-1.5 py-0.5 overflow-hidden"
              style={{ opacity: 0.55 }}>
              {nextSlideData && live ? (
                <MiniSlideContent
                  slideData={nextSlideData}
                  lyricsColor={nextLyricsColor}
                  chordsColor={chordsColor}
                  hasChords={hasNextChords}
                />
              ) : nextSong ? (
                <span className="font-semibold truncate max-w-full"
                  style={{ color: '#22c55e', fontSize: '0.9em' }}>
                  {nextSong.title}{nextSong.song_key ? ` - ${nextSong.song_key}` : ''}
                </span>
              ) : (
                <span style={{ color: '#ffffff30', fontSize: '0.8em' }}>— fin —</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 flex items-center px-1.5 py-0.5 bg-black/30 border-t border-white/10"
        style={{ minHeight: '12px' }}>
        <div className="flex-1" />
        {nextSong && (
          <span className="absolute left-1/2 -translate-x-1/2 font-semibold truncate max-w-[60%]"
            style={{ color: '#22c55e', fontSize: '0.8em', position: 'relative', transform: 'none', left: 'auto' }}>
            {nextSong.title}{nextSong.song_key ? ` - ${nextSong.song_key}` : ''}
          </span>
        )}
        <div className="flex-1" />
        {showClock && (
          <span className="font-mono ml-auto" style={{ color: '#ef4444', fontSize: '0.8em' }}>
            {nowStr}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Slide content miniatura para StagePreview ────────────────────────────────
function MiniSlideContent({ slideData, lyricsColor, chordsColor, hasChords }) {
  if (slideData.type === 'song') {
    if (hasChords) {
      const chordLines = parseChordLines(slideData.content || '');
      return (
        <div className="text-center w-full overflow-hidden">
          {chordLines.slice(0, 6).map((line, li) => {
            const lineText = line.map(s => s.text).join('');
            if (!lineText.trim()) return <div key={li} style={{ height: '0.3em' }} />;
            const hasC = line.some(s => s.chord);
            if (!hasC) return (
              <div key={li} style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.2 }}>{lineText}</div>
            );
            return (
              <div key={li} className="flex flex-wrap justify-center" style={{ lineHeight: 1 }}>
                {line.map((seg, si) => (
                  <span key={si} className="inline-flex flex-col items-start">
                    <span style={{ color: chordsColor, fontSize: '0.8em', lineHeight: 1, minHeight: '0.9em', fontFamily: 'monospace', fontWeight: 'bold' }}>
                      {seg.chord || ''}
                    </span>
                    <span style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.2, whiteSpace: 'pre' }}>
                      {seg.text || (seg.chord ? '\u00a0' : '')}
                    </span>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="text-center px-1 overflow-hidden">
        <p className="truncate" style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1px' }}>
          {slideData.label}
        </p>
        <p className="whitespace-pre-line line-clamp-4" style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.25 }}>
          {stripChords(slideData.content)}
        </p>
      </div>
    );
  }
  if (slideData.type === 'bible') {
    return (
      <div className="text-center px-1 overflow-hidden">
        <p className="whitespace-pre-line line-clamp-3" style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.25 }}>
          {slideData.text}
        </p>
        <p style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '1px' }}>{slideData.reference}</p>
      </div>
    );
  }
  return null;
}

// ─── Contenedor con label + borde de color ────────────────────────────────────
function PreviewBox({ label, dotColor, borderColor, live, onClick, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${live ? dotColor : 'bg-zinc-600'}`} />
        <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-[8px] text-zinc-500">clic para abrir</span>
      </div>
      <div
        onClick={onClick}
        className={`rounded border-2 overflow-hidden transition-colors cursor-pointer hover:brightness-110 active:scale-[0.99] ${borderColor}`}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Contenido del slide ──────────────────────────────────────────────────────
function SlidePreviewContent({ slideData, isBlank, transparent = false, showChords = false }) {
  if (isBlank || !slideData) {
    return <span className="text-zinc-600 text-[9px]">Vacío</span>;
  }
  const textColor = transparent ? 'text-zinc-800' : 'text-white';

  if (slideData.type === 'song') {
    if (showChords) {
      const chordLines = parseChordLines(slideData.content || '');
      const hasAnyChords = chordLines.some(l => l.some(s => s.chord));
      if (hasAnyChords) {
        return (
          <div className="text-center px-2 w-full">
            {slideData.label && (
              <p className="text-[6px] text-zinc-400 uppercase mb-0.5">{slideData.label}</p>
            )}
            <div className="text-[7px] leading-none">
              {chordLines.map((line, li) => {
                const lineText = line.map(s => s.text).join('');
                if (!lineText.trim()) return <div key={li} style={{ height: '0.4em' }} />;
                const hasChords = line.some(s => s.chord);
                if (!hasChords) {
                  return (
                    <div key={li} className={`${textColor} leading-relaxed`}>{lineText}</div>
                  );
                }
                return (
                  <div key={li} className="flex flex-wrap justify-center" style={{ lineHeight: 1.1 }}>
                    {line.map((seg, si) => (
                      <span key={si} className="inline-flex flex-col items-start">
                        <span className="font-bold font-mono text-yellow-300"
                          style={{ fontSize: '0.75em', lineHeight: 1, minHeight: '1em' }}>
                          {seg.chord || ''}
                        </span>
                        <span className={textColor} style={{ lineHeight: 1.3, whiteSpace: 'pre' }}>
                          {seg.text || (seg.chord ? '\u00a0' : '')}
                        </span>
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
    }
    return (
      <div className="text-center px-2">
        <p className="text-[7px] text-zinc-400 uppercase mb-0.5">{slideData.label}</p>
        <p className={`text-[9px] ${textColor} leading-relaxed whitespace-pre-line line-clamp-4`}>
          {stripChords(slideData.content)}
        </p>
      </div>
    );
  }
  if (slideData.type === 'bible') {
    return (
      <div className="text-center px-2">
        <p className={`text-[9px] ${textColor} leading-relaxed whitespace-pre-line line-clamp-4`}>
          {slideData.text}
        </p>
        <p className="text-[7px] text-zinc-300 mt-0.5">{slideData.reference}</p>
      </div>
    );
  }
  return null;
}

// ─── Siguiente slide (escenario) ──────────────────────────────────────────────
function NextPreviewContent({ slideData }) {
  if (slideData.type === 'song') {
    return (
      <p className="text-white/60 text-[6px] leading-relaxed whitespace-pre-line line-clamp-1">
        <span className="text-white/30 mr-1 uppercase">{slideData.label}</span>
        {stripChords(slideData.content)}
      </p>
    );
  }
  if (slideData.type === 'bible') {
    return (
      <p className="text-white/60 text-[6px] leading-relaxed line-clamp-1">
        <span className="text-white/30 mr-1">{slideData.reference}</span>
        {slideData.text}
      </p>
    );
  }
  return null;
}

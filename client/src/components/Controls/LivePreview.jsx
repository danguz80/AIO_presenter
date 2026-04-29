import { usePresenter } from '../../context/usePresenter';

export default function LivePreview() {
  const { state } = usePresenter();
  const { liveState, stageConfig, virtualConfig } = state;
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
          <div className="w-full rounded overflow-hidden flex flex-col"
            style={{ ...stageBgStyle, aspectRatio: '16/9' }}>
            <div className="flex-1 flex items-center justify-center px-2">
              <SlidePreviewContent slideData={slideData} isBlank={isBlank} />
            </div>
            {stageConfig.showNextSlide && (
              <div className="shrink-0 bg-black/40 px-2 py-0.5 border-t border-white/10">
                {nextSlideData && live
                  ? <NextPreviewContent slideData={nextSlideData} />
                  : <span className="text-white/20 text-[6px]">— fin —</span>
                }
              </div>
            )}
          </div>
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
function SlidePreviewContent({ slideData, isBlank, transparent = false }) {
  if (isBlank || !slideData) {
    return <span className="text-zinc-600 text-[9px]">Vacío</span>;
  }
  const textColor = transparent ? 'text-zinc-800' : 'text-white';

  if (slideData.type === 'song') {
    return (
      <div className="text-center px-2">
        <p className="text-[7px] text-zinc-400 uppercase mb-0.5">{slideData.label}</p>
        <p className={`text-[9px] ${textColor} leading-relaxed whitespace-pre-line line-clamp-4`}>
          {slideData.content}
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
        {slideData.content}
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

import { usePresenter } from '../../context/usePresenter';
import { Play, ChevronRight, Music } from 'lucide-react';

export default function SongDetail() {
  const { state, actions } = usePresenter();
  const { selectedSong, selectedSlide, liveState } = state;

  if (!selectedSong) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
        <Music size={48} strokeWidth={1} />
        <p className="text-sm">Selecciona una canción de la biblioteca</p>
      </div>
    );
  }

  const handleSlideClick = (slide) => {
    actions.selectSlide(slide);
  };

  const handleSend = (slide) => {
    actions.showSlide({
      type:      'song',
      slideData: {
        type:      'song',
        songTitle: selectedSong.title,
        label:     slide.label,
        content:   slide.content,
      },
    });
  };

  const isLive = (slide) =>
    liveState.slideData?.content === slide.content &&
    liveState.slideData?.type    === 'song' &&
    !liveState.isBlank;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Cabecera de la canción */}
      <div className="px-5 py-4 border-b border-surface-700 shrink-0">
        <h2 className="text-lg font-semibold text-white truncate">{selectedSong.title}</h2>
        {selectedSong.author && (
          <p className="text-sm text-zinc-400">{selectedSong.author}</p>
        )}
      </div>

      {/* Grid de slides */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedSong.slides || selectedSong.slides.length === 0 ? (
          <p className="text-zinc-600 text-sm">Esta canción no tiene secciones.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {selectedSong.slides.map((slide) => {
              const active = isLive(slide);
              const selected = selectedSlide?.id === slide.id;
              return (
                <div
                  key={slide.id}
                  onClick={() => handleSlideClick(slide)}
                  className={`
                    group card p-3 cursor-pointer transition-all
                    hover:border-accent/50 hover:bg-surface-700
                    ${selected ? 'border-accent/70 bg-surface-700' : ''}
                    ${active   ? 'border-green-500 bg-green-950/30' : ''}
                  `}
                >
                  {/* Etiqueta */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`
                      text-xs font-medium px-2 py-0.5 rounded
                      ${active ? 'bg-green-500/20 text-green-400' : 'bg-surface-600 text-zinc-400'}
                    `}>
                      {slide.label}
                    </span>
                    {active && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        EN VIVO
                      </span>
                    )}
                  </div>

                  {/* Contenido */}
                  <p className="text-xs text-zinc-300 whitespace-pre-line line-clamp-4 leading-relaxed">
                    {slide.content}
                  </p>

                  {/* Botón enviar */}
                  <button
                    onClick={e => { e.stopPropagation(); handleSend(slide); }}
                    className={`
                      mt-2 w-full flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium
                      transition-colors
                      ${active
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-accent hover:bg-accent-hover text-white opacity-0 group-hover:opacity-100'
                      }
                    `}
                  >
                    {active ? <><ChevronRight size={12} /> En pantalla</> : <><Play size={12} /> Enviar</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

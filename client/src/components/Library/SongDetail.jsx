import { useEffect } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { Music } from 'lucide-react';
import { openKeyRelayReceiver } from '../../hooks/useKeyboardRelay';
import { stripChords } from '../../utils/chordUtils';

export default function SongDetail() {
  const { state, actions } = usePresenter();
  const { selectedSong, selectedSlide, liveState, navigateRequest } = state;

  // Función central de navegación (reutilizada por teclado, relay y móvil)
  const navigate = (dir) => {
    const slides = selectedSong?.slides;
    if (!slides || slides.length === 0) return;
    const currentIndex = selectedSlide
      ? slides.findIndex(s => s.id === selectedSlide.id)
      : -1;
    let nextIndex = null;
    if (dir === 'next') nextIndex = currentIndex < slides.length - 1 ? currentIndex + 1 : currentIndex;
    else if (dir === 'prev') nextIndex = currentIndex > 0 ? currentIndex - 1 : 0;
    if (nextIndex === null || nextIndex === currentIndex) return;
    const slide = slides[nextIndex];
    const nextSlide = slides[nextIndex + 1] || null;
    actions.selectSlide(slide);
    actions.showSlide({
      type:       'song',
      slides,            // para que el servidor guarde el contexto de navegación
      slideIndex: nextIndex,
      slideData: {
        type:      'song',
        songId:    selectedSong.id,
        slideId:   slide.id,
        songTitle: selectedSong.title,
        label:     slide.label,
        content:   slide.content,
      },
      nextSlideData: nextSlide ? {
        type:    'song',
        label:   nextSlide.label,
        content: nextSlide.content,
      } : null,
    });
  };

  // Navegación por teclado: Espacio / → / ↓ = siguiente, ← / ↑ = anterior
  useEffect(() => {
    const handleKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault?.(); navigate('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault?.(); navigate('prev');
      }
    };
    window.addEventListener('keydown', handleKey);
    const relay = openKeyRelayReceiver();
    relay.onmessage = ({ data }) => handleKey(data);
    return () => {
      window.removeEventListener('keydown', handleKey);
      relay.close();
    };
  }, [selectedSong, selectedSlide, actions]);

  if (!selectedSong) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
        <Music size={48} strokeWidth={1} />
        <p className="text-sm">Selecciona una canción de la biblioteca</p>
      </div>
    );
  }

  const handleSlideClick = (slide, index) => {
    const slides    = selectedSong.slides;
    const nextSlide = slides[index + 1] || null;
    actions.selectSlide(slide);
    actions.showSlide({
      type:       'song',
      slides,            // para que el servidor guarde el contexto de navegación
      slideIndex: index,
      slideData: {
        type:      'song',
        songId:    selectedSong.id,
        slideId:   slide.id,
        songTitle: selectedSong.title,
        label:     slide.label,
        content:   slide.content,
      },
      nextSlideData: nextSlide ? {
        type:    'song',
        label:   nextSlide.label,
        content: nextSlide.content,
      } : null,
    });
  };

  const isLive = (slide) =>
    liveState.slideData?.slideId === slide.id &&
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
            {selectedSong.slides.map((slide, index) => {
              const active = isLive(slide);
              const selected = selectedSlide?.id === slide.id;
              return (
                <div
                  key={slide.id}
                  onClick={() => handleSlideClick(slide, index)}
                  className={`
                    group card p-3 cursor-pointer transition-all
                    hover:border-accent/50 hover:bg-surface-700
                    ${selected ? 'border-accent/70 bg-surface-700' : ''}
                    ${active   ? 'border-green-500 bg-green-950/30' : ''}
                  `}
                >
                  {/* Etiqueta + número */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-zinc-500 w-5 text-right shrink-0">
                        {index + 1}
                      </span>
                      {slide.label ? (
                        <span className={`
                          text-xs font-medium px-2 py-0.5 rounded
                          ${active ? 'bg-green-500/20 text-green-400' : 'bg-surface-600 text-zinc-400'}
                        `}>
                          {slide.label}
                        </span>
                      ) : null}
                    </div>
                    {active && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        EN VIVO
                      </span>
                    )}
                  </div>

                  {/* Contenido */}
                  <p className="text-xs text-zinc-300 whitespace-pre-line line-clamp-4 leading-relaxed">
                    {stripChords(slide.content)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

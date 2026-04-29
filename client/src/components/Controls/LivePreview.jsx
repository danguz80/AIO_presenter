import { usePresenter } from '../../context/usePresenter';

/**
 * Mini-pantalla de previsualización de lo que está proyectando ahora mismo.
 */
export default function LivePreview() {
  const { state } = usePresenter();
  const { liveState } = state;
  const { slideData, isBlank, background } = liveState;

  const bgStyle = background.type === 'color'
    ? { backgroundColor: background.color }
    : { backgroundImage: `url(${background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  return (
    <div className="border-b border-surface-700 p-3 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Previsualización
        </span>
        {!isBlank && slideData && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            EN VIVO
          </span>
        )}
      </div>

      {/* Mini pantalla 16:9 */}
      <div
        className="w-full rounded-lg overflow-hidden flex items-center justify-center"
        style={{ ...bgStyle, aspectRatio: '16/9' }}
      >
        {isBlank || !slideData ? (
          <span className="text-zinc-600 text-xs">Pantalla vacía</span>
        ) : slideData.type === 'song' ? (
          <div className="text-center px-3">
            <p className="text-zinc-400 text-[8px] uppercase mb-1">{slideData.label}</p>
            <p className="text-white text-[10px] leading-relaxed whitespace-pre-line line-clamp-4">
              {slideData.content}
            </p>
          </div>
        ) : slideData.type === 'bible' ? (
          <div className="text-center px-3">
            <p className="text-white text-[10px] leading-relaxed whitespace-pre-line line-clamp-4">
              {slideData.text}
            </p>
            <p className="text-zinc-300 text-[8px] mt-1">{slideData.reference}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

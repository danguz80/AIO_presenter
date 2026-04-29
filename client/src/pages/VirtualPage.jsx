import { useEffect } from 'react';
import { usePresenter } from '../context/usePresenter';

/**
 * Salida Virtual — diseñada para usarse como:
 *  - OBS Browser Source (apuntar a http://localhost:5173/virtual)
 *  - Captura de ventana en cualquier software de streaming
 *  - Fuente NDI (si el servidor tiene grandiose + NDI SDK instalados)
 *
 * Soporta fondo transparente, color sólido y chromakey.
 */
export default function VirtualPage() {
  const { state } = usePresenter();
  const { liveState, virtualConfig } = state;

  useEffect(() => {
    document.title = 'AIO Presenter — Virtual/NDI';
    // Aplica clase al <html> para anular el background global de index.css
    document.documentElement.classList.add('virtual-mode');
    return () => {
      document.documentElement.classList.remove('virtual-mode');
    };
  }, []);

  const { slideData, isBlank } = liveState;
  const { background, chromaColor, fontSize } = virtualConfig;

  const bgStyle = (() => {
    if (background.type === 'chromakey') return { backgroundColor: chromaColor ?? '#00b140' };
    if (background.type === 'color')     return { backgroundColor: background.color ?? '#000000' };
    return { backgroundColor: 'transparent' };
  })();

  return (
    <div
      className="w-screen h-screen flex items-center justify-center select-none overflow-hidden"
      style={bgStyle}
    >
      {isBlank || !slideData ? (
        /* Pantalla vacía: transparente o con el color de fondo elegido */
        <div className="w-full h-full" />
      ) : (
        <VirtualSlideContent slideData={slideData} fontSize={fontSize} />
      )}
    </div>
  );
}

// ─── Contenido del slide ──────────────────────────────────────────────────────
function VirtualSlideContent({ slideData, fontSize }) {
  if (slideData.type === 'song') {
    const lineCount = (slideData.content ?? '').split('\n').filter(l => l.trim()).length;
    const autoSize =
      lineCount <= 3  ? 'clamp(2.2rem, 5.5vw, 5rem)'
      : lineCount <= 5 ? 'clamp(1.8rem, 4.2vw, 3.8rem)'
      : lineCount <= 7 ? 'clamp(1.4rem, 3.4vw, 3rem)'
      : lineCount <= 10 ? 'clamp(1.1rem, 2.6vw, 2.4rem)'
      : 'clamp(0.9rem, 2vw, 1.8rem)';

    const sizeMap = {
      small:  'clamp(0.9rem, 2vw, 1.6rem)',
      medium: 'clamp(1.4rem, 3vw, 2.6rem)',
      large:  'clamp(2rem, 5vw, 4rem)',
      auto:   autoSize,
    };

    return (
      <div className="w-full h-full flex flex-col items-center justify-center px-16 text-center">
        {slideData.label && (
          <p className="text-white/50 text-sm uppercase tracking-widest mb-5">
            {slideData.label}
          </p>
        )}
        <p
          className="text-white leading-relaxed whitespace-pre-line w-full"
          style={{
            fontSize:   sizeMap[fontSize] ?? autoSize,
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          }}
        >
          {slideData.content}
        </p>
        {slideData.songTitle && (
          <p className="text-white/30 text-base mt-8">{slideData.songTitle}</p>
        )}
      </div>
    );
  }

  if (slideData.type === 'bible') {
    const lineCount = (slideData.text ?? '').split('\n').filter(l => l.trim()).length;
    const autoSize =
      lineCount <= 3  ? 'clamp(2rem, 4.8vw, 4.5rem)'
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
          style={{
            fontSize:   sizeMap[fontSize] ?? autoSize,
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
          }}
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

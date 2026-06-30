import { useEffect, useState } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import VirtualRenderer from '../components/shared/VirtualRenderer';
import { Maximize2 } from 'lucide-react';

export default function VirtualPage() {
  const { state } = usePresenter();
  const { liveState, virtualConfig } = state;
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
    document.title = 'AIO Presenter — Virtual/NDI';
    document.documentElement.classList.add('virtual-mode');
    return () => document.documentElement.classList.remove('virtual-mode');
  }, []);

  return (
    <div className="w-screen h-screen select-none overflow-hidden bg-transparent" style={{ backgroundColor: 'transparent' }}>
      <VirtualRenderer
        vc={virtualConfig}
        slideData={liveState.slideData}
        isBlank={liveState.isBlank}
        backgroundMedia={liveState.backgroundMedia}
      />
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

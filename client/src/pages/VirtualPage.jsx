import { useEffect } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import VirtualRenderer from '../components/shared/VirtualRenderer';

export default function VirtualPage() {
  const { state } = usePresenter();
  const { liveState, virtualConfig } = state;

  useKeyboardRelay();

  useEffect(() => {
    document.title = 'AIO Presenter — Virtual/NDI';
    document.documentElement.classList.add('virtual-mode');
    return () => document.documentElement.classList.remove('virtual-mode');
  }, []);

  return (
    <div className="w-screen h-screen select-none overflow-hidden">
      <VirtualRenderer
        vc={virtualConfig}
        slideData={liveState.slideData}
        isBlank={liveState.isBlank}
        backgroundMedia={liveState.backgroundMedia}
      />
    </div>
  );
}

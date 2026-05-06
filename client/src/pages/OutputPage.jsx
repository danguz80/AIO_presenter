import { useEffect } from 'react';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { injectGoogleFont } from '../utils/fontUtils';
import OutputRenderer from '../components/shared/OutputRenderer';

/**
 * Ventana de salida — se abre en una pestaña/ventana separada
 * para enviar a proyector o segunda pantalla.
 */
export default function OutputPage() {
  const { state } = usePresenter();
  const { liveState } = state;
  const cfg = state.outputConfig ?? {};

  useKeyboardRelay();

  useEffect(() => {
    document.title = 'AIO Presenter — Salida';
  }, []);

  useEffect(() => {
    injectGoogleFont(cfg.fontFamily);
    injectGoogleFont(cfg.commentFontFamily);
    injectGoogleFont(cfg.titleFontFamily);
    injectGoogleFont(cfg.artistFontFamily);
    injectGoogleFont(cfg.bibleFontFamily);
    injectGoogleFont(cfg.bibleRefFontFamily);
  }, [cfg.fontFamily, cfg.commentFontFamily, cfg.titleFontFamily, cfg.artistFontFamily, cfg.bibleFontFamily, cfg.bibleRefFontFamily]);

  const { slideData, isBlank, background, slideIndex, totalSlides, backgroundMedia } = liveState;

  return (
    <div className="w-screen h-screen select-none overflow-hidden">
      <OutputRenderer
        cfg={cfg}
        slideData={slideData}
        isBlank={isBlank}
        background={background}
        slideIndex={slideIndex}
        totalSlides={totalSlides}
        backgroundMedia={backgroundMedia}
      />
    </div>
  );
}


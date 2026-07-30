import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { useOrgPlanAccess } from '../hooks/useOrgPlanAccess';
import { injectGoogleFont } from '../utils/fontUtils';
import OutputRenderer from '../components/shared/OutputRenderer';
import { useTimerDisplay, fmtTimer, useStrobe } from '../hooks/useTimerDisplay';
import { Smartphone } from 'lucide-react';
import { ensureMediaCached } from '../utils/fsaUtils';
import PlanBlockedScreen from '../components/shared/PlanBlockedScreen';

/**
 * Ventana de salida — se abre en una pestaña/ventana separada
 * para enviar a proyector o segunda pantalla.
 */
export default function OutputPage() {
  const { state, actions } = usePresenter();
  const { liveState } = state;
  const cfg = state.outputConfig ?? {};
  const navigate = useNavigate();
  const [showBtn, setShowBtn] = useState(false);
  const { ready: planReady, blocked: planBlocked } = useOrgPlanAccess();

  useKeyboardRelay();

  useEffect(() => {
    document.title = 'AIO Presenter — Salida';
  }, []);

  // En escritorio (≥ 768px): volver al controlador principal
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    // Solo hacer redirect si llegamos aquí desde móvil (no si la ventana de output se abrió en desktop)
    // Usamos sessionStorage para marcar si fue una apertura directa
    const directOpen = sessionStorage.getItem('output_direct_open');
    if (!directOpen) {
      sessionStorage.setItem('output_direct_open', '1');
      if (mq.matches) return; // apertura directa en desktop → no redirigir
    }
    // Solo redirigir si es desktop real (ancho ≥768 Y alto ≥500) — no redirigir en landscape móvil
    const handler = (e) => { if (e.matches && window.innerHeight >= 500) { sessionStorage.removeItem('output_direct_open'); navigate('/app', { replace: true }); } };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [navigate]);

  // Mostrar botón de control al tocar la pantalla (se oculta solo)
  useEffect(() => {
    if (!showBtn) return;
    const t = setTimeout(() => setShowBtn(false), 4000);
    return () => clearTimeout(t);
  }, [showBtn]);

  useEffect(() => {
    injectGoogleFont(cfg.fontFamily);
    injectGoogleFont(cfg.commentFontFamily);
    injectGoogleFont(cfg.titleFontFamily);
    injectGoogleFont(cfg.artistFontFamily);
    injectGoogleFont(cfg.bibleFontFamily);
    injectGoogleFont(cfg.bibleRefFontFamily);
  }, [cfg.fontFamily, cfg.commentFontFamily, cfg.titleFontFamily, cfg.artistFontFamily, cfg.bibleFontFamily, cfg.bibleRefFontFamily]);

  const { slideData, isBlank, background, slideIndex, totalSlides, backgroundMedia } = liveState;

  // Auto-cachear fondos de video locales cuando cambian (soporte multi-PC con OneDrive/Dropbox)
  const [bgCacheKey, setBgCacheKey] = useState(0);
  useEffect(() => {
    const url  = backgroundMedia?.url;
    const name = backgroundMedia?.fileName || backgroundMedia?.name;
    if (!url?.startsWith('/local-media/') || !name) return;
    const fileName = name || decodeURIComponent(url.replace('/local-media/', ''));
    ensureMediaCached(fileName).then(ok => { if (ok) setBgCacheKey(k => k + 1); }).catch(() => {});
  }, [backgroundMedia?.url]);

  // También pre-cachear titleBackground y bibleBackground al cargar la config
  useEffect(() => {
    const name = cfg.titleBackground?.fileName || cfg.titleBackground?.name;
    if (name && cfg.titleBackground?.url?.startsWith('/local-media/'))
      ensureMediaCached(name).then(ok => { if (ok) setBgCacheKey(k => k + 1); }).catch(() => {});
  }, [cfg.titleBackground?.url]);

  useEffect(() => {
    const name = cfg.bibleBackground?.fileName || cfg.bibleBackground?.name;
    if (name && cfg.bibleBackground?.url?.startsWith('/local-media/'))
      ensureMediaCached(name).then(ok => { if (ok) setBgCacheKey(k => k + 1); }).catch(() => {});
  }, [cfg.bibleBackground?.url]);

  const handleVideoEnded = () => {
    const endAction = liveState.backgroundMedia?.endAction || liveState.slideData?.slideBackground?.endAction || 'loop';
    if (endAction === 'continue') actions.navigate('next');
    else if (endAction === 'first') actions.navigate('first');
  };
  const timerSeconds = useTimerDisplay(state.timerState);
  const smStrobe = useStrobe(!!(state.screenMessage?.visible && state.screenMessage?.strobe &&
    (state.screenMessage.target === 'output' || state.screenMessage.target === 'both')));
  const tmStrobe = useStrobe(!!(state.timerState?.running && state.timerState?.strobe &&
    (!state.timerState.target || state.timerState.target === 'output' || state.timerState.target === 'both')));

  if (!planReady) {
    return <PlanBlockedScreen loading title="Verificando acceso a salidas" />;
  }

  if (planBlocked) {
    return (
      <PlanBlockedScreen
        title="Salidas bloqueadas por tu plan"
        message="Actualiza tu suscripción para volver a abrir la ventana principal de salida."
      />
    );
  }

  return (
    <div
      className="w-screen h-screen select-none overflow-hidden"
      onTouchStart={() => setShowBtn(true)}
    >
      <OutputRenderer
        cfg={cfg}
        slideData={slideData}
        isBlank={isBlank}
        background={background}
        slideIndex={slideIndex}
        totalSlides={totalSlides}
        backgroundMedia={backgroundMedia}
        bgCacheKey={bgCacheKey}
        onVideoEnded={handleVideoEnded}
      />
      {/* Overlay: mensaje a pantalla */}
      {(() => {
        const sm = state.screenMessage;
        const tm = state.timerState;
        if (sm?.visible && (sm.target === 'output' || sm.target === 'both') && sm.text) {
          const bg = sm.strobe
            ? (smStrobe ? (sm.bgColor || 'rgba(0,0,0,0.88)') : '#000000')
            : (sm.bgColor || 'rgba(0,0,0,0.88)');
          return (
            <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none" style={{ background: bg }}>
              <span className="text-4xl font-bold px-10 py-6 text-center max-w-[80%]" style={{ color: sm.textColor || '#ffffff' }}>
                {sm.text}
              </span>
            </div>
          );
        }
        if (tm?.running && (!tm.target || tm.target === 'output' || tm.target === 'both') && !sm?.visible) {
          const bg = tm.strobe
            ? (tmStrobe ? (tm.bgColor || 'rgba(0,0,0,0.88)') : '#000000')
            : (tm.bgColor || 'rgba(0,0,0,0.88)');
          return (
            <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none" style={{ background: bg }}>
              <div className="text-center">
                <span className="font-mono text-7xl font-bold" style={{ color: tm.textColor || '#ffffff' }}>
                  {fmtTimer(timerSeconds)}
                </span>
                {tm.label && <p className="text-xl font-sans font-normal mt-2" style={{ color: (tm.textColor || '#ffffff') + 'aa' }}>{tm.label}</p>}
              </div>
            </div>
          );
        }
        return null;
      })()}
      {/* Botón flotante — solo visible en móvil, aparece al tocar */}
      <div
        className={`md:hidden fixed bottom-6 right-4 z-50 flex flex-col gap-2 transition-opacity duration-300 ${
          showBtn ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <Link
          to="/mobile"
          className="flex items-center gap-2 bg-black/70 text-white text-sm font-medium rounded-full px-4 py-2.5 shadow-lg backdrop-blur-sm border border-white/10 active:scale-95 transition-transform"
        >
          <Smartphone size={16} />
          Control remoto
        </Link>
      </div>
    </div>
  );
}


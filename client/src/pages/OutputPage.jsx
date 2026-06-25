import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { injectGoogleFont } from '../utils/fontUtils';
import OutputRenderer from '../components/shared/OutputRenderer';
import { useTimerDisplay, fmtTimer, useStrobe } from '../hooks/useTimerDisplay';
import { Smartphone, Maximize2 } from 'lucide-react';
import { ensureMediaCached } from '../utils/fsaUtils';

/**
 * Ventana de salida — se abre en una pestaña/ventana separada
 * para enviar a proyector o segunda pantalla.
 */
export default function OutputPage() {
  const { state } = usePresenter();
  const { liveState } = state;
  const cfg = state.outputConfig ?? {};
  const navigate = useNavigate();
  const [showBtn, setShowBtn] = useState(false);

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
  // Si el archivo no está en la cache del SW de este browser, lo busca por nombre en las
  // carpetas FSA configuradas localmente y lo cachea para que el <video> pueda cargarlo.
  const [bgCacheKey, setBgCacheKey] = useState(0);
  useEffect(() => {
    const url  = backgroundMedia?.url;
    const name = backgroundMedia?.fileName || backgroundMedia?.name;
    if (!url?.startsWith('/local-media/') || !name) return;
    const fileName = name || decodeURIComponent(url.replace('/local-media/', ''));
    ensureMediaCached(fileName).then(ok => { if (ok) setBgCacheKey(k => k + 1); }).catch(() => {});
  }, [backgroundMedia?.url]);
  const timerSeconds = useTimerDisplay(state.timerState);
  const smStrobe = useStrobe(!!(state.screenMessage?.visible && state.screenMessage?.strobe &&
    (state.screenMessage.target === 'output' || state.screenMessage.target === 'both')));
  const tmStrobe = useStrobe(!!(state.timerState?.running && state.timerState?.strobe &&
    (!state.timerState.target || state.timerState.target === 'output' || state.timerState.target === 'both')));

  // El script inline en index.html ya intentó requestFullscreen() antes de que React monte.
  // Aquí solo gestionamos el estado del hint: visible hasta que fullscreen confirme éxito.
  const [showFsHint, setShowFsHint] = useState(() =>
    new URLSearchParams(window.location.search).get('fs') === '1' && !document.fullscreenElement
  );
  useEffect(() => {
    if (!showFsHint) return;
    const onFsChange = () => { if (document.fullscreenElement) setShowFsHint(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [showFsHint]);

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
      {/* Overlay pantalla completa (si auto-fullscreen falló) */}
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


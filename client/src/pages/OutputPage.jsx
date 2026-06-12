import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePresenter } from '../context/usePresenter';
import { useKeyboardRelay } from '../hooks/useKeyboardRelay';
import { injectGoogleFont } from '../utils/fontUtils';
import OutputRenderer from '../components/shared/OutputRenderer';
import { useTimerDisplay, fmtTimer, useStrobe } from '../hooks/useTimerDisplay';
import { Smartphone, Maximize2 } from 'lucide-react';

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

  // ── Video sync: arranca countdown cuando un video hace play + reset en loop ─
  useEffect(() => {
    if (!state.timerState?.videoSync) return;

    let disposed   = false;
    let attached   = null; // elemento <video> al que ya enganchamos listeners
    let armed      = true; // evitar doble-disparo mientras el state actualiza

    const doStart = (video) => {
      if (!armed || disposed) return;
      const dur = isFinite(video.duration) && video.duration > 0
        ? Math.floor(video.duration) : 0;
      if (dur <= 0) return;
      armed = false;
      actionsRef.current.setTimerState({
        ...timerStateRef.current,
        type:           'countdown',
        seconds:        dur,
        initialSeconds: dur,
        running:        true,
        startedAt:      Date.now(),
      });
    };

    const detachFrom = (video) => {
      if (!video) return;
      video.removeEventListener('loadedmetadata', video._syncMeta);
      video.removeEventListener('timeupdate',     video._syncTU);
      video._syncMeta = video._syncTU = null;
    };

    const attachTo = (video) => {
      if (attached === video) return; // ya enganchado
      detachFrom(attached);
      attached = video;

      let prevTime = video.currentTime;

      video._syncMeta = () => {
        if (!video.paused && !video.ended) doStart(video);
      };
      video._syncTU = () => {
        const curr = video.currentTime;
        const dur  = video.duration;
        if (isFinite(dur) && dur > 0 && prevTime > dur - 2 && curr < 1) {
          armed = true;
          doStart(video);
        }
        prevTime = curr;
      };
      video.addEventListener('loadedmetadata', video._syncMeta);
      video.addEventListener('timeupdate',     video._syncTU);
    };

    // Polling cada 250ms: busca video, engancha listeners, e intenta arrancar
    const poll = setInterval(() => {
      if (disposed) { clearInterval(poll); return; }

      const video = document.querySelector('video');
      if (!video) return; // aún no hay video en DOM

      attachTo(video); // enganchar si no estaba enganchado

      // Si ya está reproduciéndose y tenemos duración → arrancar
      if (!video.paused && !video.ended) {
        if (isFinite(video.duration) && video.duration > 0) {
          doStart(video);
          if (!armed) clearInterval(poll); // parar polling una vez que arrancó
        }
        // si duration=NaN esperamos loadedmetadata (listener ya adjunto)
      }
    }, 250);

    return () => {
      disposed = true;
      clearInterval(poll);
      detachFrom(attached);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timerState?.videoSync]);

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


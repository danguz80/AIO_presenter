import { useEffect, useRef, useState } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { stripChords, parseChordLines, isCommentLine, stripComments, extractInlineComment } from '../../utils/chordUtils';
import { injectGoogleFont } from '../../utils/fontUtils';
import VirtualRenderer from '../shared/VirtualRenderer';
import OutputRenderer from '../shared/OutputRenderer';
import { useTimerDisplay, fmtTimer } from '../../hooks/useTimerDisplay';
import { Monitor, MonitorOff } from 'lucide-react';
import { ensureMediaCached } from '../../utils/fsaUtils';

import { getLabelColor } from '../../utils/labelColors';

export default function LivePreview() {
  const { state } = usePresenter();
  const { liveState, stageConfig, virtualConfig, schedule, eventPlays, reservasMode } = state;
  const outputCfg    = state.outputConfig  ?? {};
  const displayCfg   = state.displayConfig ?? {};
  const timerSeconds = useTimerDisplay(state.timerState);
  const [bgCacheKey, setBgCacheKey] = useState(0);

  // Medir el contenedor del preview Principal para canvas escalado (ancho + alto)
  const principalRef = useRef(null);
  const [principalW, setPrincipalW] = useState(0);
  const [principalH, setPrincipalH] = useState(0);
  useEffect(() => {
    if (!principalRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0) setPrincipalW(w);
      if (h > 0) setPrincipalH(h);
    });
    ro.observe(principalRef.current);
    return () => ro.disconnect();
  }, []);

  // Medir el contenedor del preview Stream para el canvas escalado (ancho + alto)
  const streamRef = useRef(null);
  const [streamW, setStreamW] = useState(0);
  const [streamH, setStreamH] = useState(0);
  useEffect(() => {
    if (!streamRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0) setStreamW(w);
      if (h > 0) setStreamH(h);
    });
    ro.observe(streamRef.current);
    return () => ro.disconnect();
  }, []);

  // Inyectar Google Fonts cuando cambia la configuración del output (incluyendo título)
  useEffect(() => {
    injectGoogleFont(outputCfg.fontFamily);
    injectGoogleFont(outputCfg.commentFontFamily);
    injectGoogleFont(outputCfg.titleFontFamily);
    injectGoogleFont(outputCfg.artistFontFamily);
  }, [outputCfg.fontFamily, outputCfg.commentFontFamily, outputCfg.titleFontFamily, outputCfg.artistFontFamily]);
  const { slideData, nextSlideData, isBlank, background } = liveState;
  const principalBgMedia = liveState.slideData?.slideBackground || liveState.backgroundMedia;

  // Pre-cachear fondos locales para que el preview principal refleje el output incluso en /local-media/*
  useEffect(() => {
    const bgUrl = principalBgMedia?.url;
    const bgName = principalBgMedia?.fileName || principalBgMedia?.name || (bgUrl?.startsWith('/local-media/') ? decodeURIComponent(bgUrl.replace('/local-media/', '')) : null);
    if (bgName && bgUrl?.startsWith('/local-media/')) {
      ensureMediaCached(bgName).then(ok => { if (ok) setBgCacheKey(k => k + 1); }).catch(() => {});
    }

    const titleName = outputCfg.titleBackground?.fileName || outputCfg.titleBackground?.name;
    if (titleName && outputCfg.titleBackground?.url?.startsWith('/local-media/')) {
      ensureMediaCached(titleName).then(ok => { if (ok) setBgCacheKey(k => k + 1); }).catch(() => {});
    }

    const bibleName = outputCfg.bibleBackground?.fileName || outputCfg.bibleBackground?.name;
    if (bibleName && outputCfg.bibleBackground?.url?.startsWith('/local-media/')) {
      ensureMediaCached(bibleName).then(ok => { if (ok) setBgCacheKey(k => k + 1); }).catch(() => {});
    }
  }, [principalBgMedia?.url, outputCfg.titleBackground?.url, outputCfg.bibleBackground?.url]);

  const live = !isBlank && !!slideData;

  const stageBgStyle = stageConfig.background.type === 'color'
    ? { backgroundColor: stageConfig.background.color }
    : { backgroundImage: `url(${stageConfig.background.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  const virtualBgStyle = (() => {
    const bg = virtualConfig.background;
    if (bg.type === 'chromakey') return { backgroundColor: virtualConfig.chromaColor ?? '#00b140' };
    if (bg.type === 'color')     return { backgroundColor: bg.color ?? '#000000' };
    return {
      backgroundImage: 'repeating-conic-gradient(#3f3f46 0% 25%, #27272a 0% 50%)',
      backgroundSize:  '12px 12px',
    };
  })();

  // ── Refs de ventanas de salida (toggle activar/desactivar) ─────────────
  const outputWinRef = useRef(null);
  const stageWinRef  = useRef(null);
  const [outputsActive, setOutputsActive]       = useState(false);
  const [showReopenBanner, setShowReopenBanner] = useState(
    () => localStorage.getItem('aio_outputs_active') === '1'
  );

  // Detectar cierre manual de las ventanas
  useEffect(() => {
    if (!outputsActive) return;
    const id = setInterval(() => {
      const oClosed = !outputWinRef.current || outputWinRef.current.closed;
      const sClosed = !stageWinRef.current  || stageWinRef.current.closed;
      if (oClosed && sClosed) {
        setOutputsActive(false);
        localStorage.removeItem('aio_outputs_active');
      }
    }, 1500);
    return () => clearInterval(id);
  }, [outputsActive]);

  // Abrir una sola ventana con ?fs=1 y guardar ref
  const openOneOutput = (ref, path, screenId, windowName, resolution) => {
    if (ref.current && !ref.current.closed) { ref.current.focus(); return; }
    const res = resolution ?? { width: 1920, height: 1080 };
    const url = `${path}?fs=1`;

    // Si hay una pantalla específica configurada, obtener sus coordenadas async
    // y abrir la ventana maximizada en esa pantalla.
    // Si no, abrir maximizada en la pantalla actual.
    const openMaximized = (left, top, w, h) => {
      const win = window.open(url, windowName,
        `left=${left},top=${top},width=${w},height=${h},menubar=no,toolbar=no,location=no`);
      ref.current = win;
      try { win?.focus(); } catch(_) {}
    };

    if (screenId && 'getScreenDetails' in window) {
      window.getScreenDetails().then(sd => {
        const [, sLeft, sTop] = (screenId ?? '').split(':');
        const target = Array.from(sd.screens).find(
          s => String(s.left ?? 0) === sLeft && String(s.top ?? 0) === sTop
        );
        if (target) {
          openMaximized(target.left, target.top, target.width, target.height);
        } else {
          openMaximized(0, 0, screen.availWidth, screen.availHeight);
        }
      }).catch(() => openMaximized(0, 0, screen.availWidth, screen.availHeight));
    } else {
      // Sin detección de pantallas: maximizar en la pantalla actual
      openMaximized(0, 0, screen.availWidth, screen.availHeight);
    }
  };

  const hasPrincipal = !!displayCfg.principalScreenId;
  const hasEscenario  = !!displayCfg.escenarioScreenId;
  // Principal abre si está configurado, o si nada está configurado (fallback popup)
  const principalWillOpen = hasPrincipal || (!hasPrincipal && !hasEscenario);
  const escenarioWillOpen = hasEscenario;

  const activateOutputs = () => {
    // Leer config directamente del state en el momento del click (evita cualquier closure stale)
    const cfg = state.displayConfig ?? {};
    const principal = cfg.principalScreenId || null;
    const escenario = cfg.escenarioScreenId || null;
    console.log('[AIO] activateOutputs — principal:', principal, '| escenario:', escenario);

    setOutputsActive(true);
    setShowReopenBanner(false);
    localStorage.setItem('aio_outputs_active', '1');

    if (!principal && !escenario) {
      // Ninguna configurada → popup por defecto solo principal
      openOneOutput(outputWinRef, '/output', null, 'aio-output', cfg.principalResolution);
    } else if (principal && escenario) {
      // Ambas → secuencial
      openOneOutput(outputWinRef, '/output', principal, 'aio-output', cfg.principalResolution);
      setTimeout(() => {
        openOneOutput(stageWinRef, '/stage', escenario, 'aio-stage', cfg.escenarioResolution);
      }, 2800);
    } else if (principal) {
      openOneOutput(outputWinRef, '/output', principal, 'aio-output', cfg.principalResolution);
    } else {
      // Solo escenario
      openOneOutput(stageWinRef, '/stage', escenario, 'aio-stage', cfg.escenarioResolution);
    }
  };

  const deactivateOutputs = () => {
    if (outputWinRef.current && !outputWinRef.current.closed) outputWinRef.current.close();
    if (stageWinRef.current  && !stageWinRef.current.closed)  stageWinRef.current.close();
    outputWinRef.current = null;
    stageWinRef.current  = null;
    setOutputsActive(false);
    setShowReopenBanner(false);
    localStorage.removeItem('aio_outputs_active');
  };

  const toggleOutputs = () => outputsActive ? deactivateOutputs() : activateOutputs();

  // Cuando la ventana de output entra a fullscreen, hacer focus a la de escenario
  // para que el siguiente spacebar la ponga en fullscreen también.
  useEffect(() => {
    if (!outputsActive) return;
    let ch;
    try {
      ch = new BroadcastChannel('aio_fullscreen');
      ch.onmessage = (e) => {
        if (e.data?.type !== 'window:fullscreen') return;
        const path = e.data.path ?? '';
        // Si fue la pantalla principal (/output) → focus a escenario
        if (path.includes('/output') && stageWinRef.current && !stageWinRef.current.closed) {
          try { stageWinRef.current.focus(); } catch(_) {}
        }
        // Si fue escenario (/stage) → devolver focus al controlador
        if (path.includes('/stage')) {
          try { window.focus(); } catch(_) {}
        }
      };
    } catch(_) {}
    return () => { try { ch?.close(); } catch(_) {} };
  }, [outputsActive]);

  // Abrir una ventana de salida de forma individual (clic en preview)
  const openWindow = (path, screenId, windowName, resolution) => {
    const res = resolution ?? { width: 1920, height: 1080 };
    if (screenId && 'getScreenDetails' in window) {
      window.getScreenDetails().then(sd => {
        const [, sLeft, sTop] = (screenId ?? '').split(':');
        const target = Array.from(sd.screens).find(
          s => String(s.left ?? 0) === sLeft && String(s.top ?? 0) === sTop
        );
        if (target) {
          window.open(path, windowName, `left=${target.left},top=${target.top},width=${target.width},height=${target.height},menubar=no,toolbar=no,location=no`);
          return;
        }
        window.open(path, windowName, `width=${res.width},height=${res.height},menubar=no,toolbar=no,location=no`);
      }).catch(() => {
        window.open(path, windowName, `width=${res.width},height=${res.height},menubar=no,toolbar=no,location=no`);
      });
    } else {
      window.open(path, windowName, `width=${res.width},height=${res.height},menubar=no,toolbar=no,location=no`);
    }
  };

  return (
    <div className="flex-1 min-h-0 border-b border-surface-700 p-3 flex flex-col gap-2 overflow-hidden">

      {/* ── Banner de reabrir salidas (cuando estaban activas al cerrar la app) ── */}
      {showReopenBanner && !outputsActive && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-accent/15 border border-accent/30 rounded-lg text-xs shrink-0">
          <Monitor size={12} className="text-accent shrink-0" />
          <span className="flex-1 text-zinc-300">Las salidas estaban activas</span>
          <button
            onClick={activateOutputs}
            className="text-accent font-semibold hover:underline shrink-0"
          >
            Reabrir
          </button>
          <button
            onClick={() => { setShowReopenBanner(false); localStorage.removeItem('aio_outputs_active'); }}
            className="text-zinc-500 hover:text-zinc-300 shrink-0 ml-1"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Botón toggle Activar / Desactivar salidas ─────────────────── */}
      <button
        onClick={toggleOutputs}
        title={outputsActive ? 'Cerrar salidas' : 'Activar salidas configuradas en pantalla completa'}
        className={`shrink-0 flex items-center justify-center gap-2 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
          outputsActive
            ? 'bg-orange-500/20 border-orange-400 text-orange-300 hover:bg-orange-500/30'
            : 'bg-surface-700 border-surface-600 text-zinc-400 hover:border-accent hover:text-accent'
        }`}
      >
        {outputsActive ? <Monitor size={13} /> : <MonitorOff size={13} />}
        {outputsActive ? 'Desactivar salidas' : 'Activar salidas'}
        {outputsActive && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
      </button>
      {/* Indicador de qué salidas se abrirán */}
      {!outputsActive && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="font-semibold text-zinc-400">Abrirá:</span>
            {principalWillOpen
              ? <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">Principal</span>
              : <span className="px-1.5 py-0.5 rounded bg-surface-700 text-zinc-600 border border-surface-600 line-through">Principal</span>
            }
            {escenarioWillOpen
              ? <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">Escenario</span>
              : <span className="px-1.5 py-0.5 rounded bg-surface-700 text-zinc-600 border border-surface-600 line-through">Escenario</span>
            }
          </div>
          {!hasPrincipal && hasEscenario && (
            <p className="text-[10px] text-amber-400 leading-snug">
              ⚠️ Solo Escenario configurado. Ve a Ajustes → Salidas y pulsa “Principal” en tu pantalla.
            </p>
          )}
        </div>
      )}

      {/* ── Principal ───────────────────────────────────────────────── */}
      <PreviewBox
        label="Principal"
        dotColor="bg-orange-400"
        borderColor={live ? 'border-orange-400' : 'border-surface-600'}
        live={live}
        onClick={() => openWindow('/output', displayCfg.principalScreenId, 'aio-output', displayCfg.principalResolution)}
      >
        {/* Canvas escalado: object-fit:contain — escala para caber en ancho Y alto */}
        <div
          ref={principalRef}
          className="w-full h-full relative overflow-hidden"
        >
          {principalW > 0 && principalH > 0 && (() => {
            const res   = displayCfg.principalResolution ?? { width: 1920, height: 1080 };
            const scale = Math.min(principalW / res.width, principalH / res.height);
            const left  = (principalW - res.width  * scale) / 2;
            const top   = (principalH - res.height * scale) / 2;
            return (
              <div style={{
                position:        'absolute',
                top:             `${top}px`,
                left:            `${left}px`,
                width:           `${res.width}px`,
                height:          `${res.height}px`,
                transform:       `scale(${scale})`,
                transformOrigin: 'top left',
                pointerEvents:   'none',
              }}>
                <OutputRenderer
                  cfg={outputCfg}
                  containerWidth={res.width}
                  containerHeight={res.height}
                  slideData={liveState.slideData}
                  isBlank={liveState.isBlank}
                  background={liveState.background}
                  slideIndex={liveState.slideIndex}
                  totalSlides={liveState.totalSlides}
                  backgroundMedia={principalBgMedia}
                  bgCacheKey={bgCacheKey}
                  staticVideoFrame={true}
                />
                {/* Overlay timer/mensaje en preview output */}
                {(() => {
                  const sm = state.screenMessage;
                  const tm = state.timerState;
                  if (sm?.visible && (sm.target === 'output' || sm.target === 'both') && sm.text) {
                    return (
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:50 }}>
                        <span style={{ color:'#fff', fontWeight:'bold', fontSize: res.width * 0.04, textAlign:'center', padding:'0 5%' }}>{sm.text}</span>
                      </div>
                    );
                  }
                  if (tm?.running && (!tm.target || tm.target === 'output' || tm.target === 'both') && (!sm?.visible)) {
                    return (
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', zIndex:50 }}>
                        <span style={{ color:'#fff', fontWeight:'bold', fontFamily:'monospace', fontSize: res.width * 0.1, textAlign:'center' }}>{fmtTimer(timerSeconds)}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            );
          })()}
        </div>
      </PreviewBox>

      {/* ── Escenario ────────────────────────────────────────────────── */}
      <PreviewBox
        label="Escenario"
        dotColor="bg-orange-400"
        borderColor={live ? 'border-orange-400' : 'border-surface-600'}
        live={live}
        onClick={() => openWindow('/stage', displayCfg.escenarioScreenId, 'aio-stage', displayCfg.escenarioResolution)}
      >
        <div className="relative w-full h-full">
          <StagePreview
            stageBgStyle={stageBgStyle}
            slideData={slideData}
            nextSlideData={nextSlideData}
            isBlank={isBlank}
            live={live}
            stageConfig={stageConfig}
            schedule={schedule}
            eventPlays={eventPlays}
            reservasMode={reservasMode}
          />
          {/* Overlay timer/mensaje en preview escenario — replica StagePage: ocupa la mitad inferior */}
          {(() => {
            const sm = state.screenMessage;
            const tm = state.timerState;
            const showSm = sm?.visible && (sm.target === 'stage' || sm.target === 'both') && sm.text;
            const showTm = tm?.running && (!tm.target || tm.target === 'stage' || tm.target === 'both');
            if (!showSm && !showTm) return null;

            const style = { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              zIndex: 50, pointerEvents: 'none' };

            if (showSm) return (
              <div style={{ ...style, background: sm.bgColor || 'rgba(0,0,0,0.92)', padding: '0 4px' }}>
                <span style={{ color: sm.textColor || '#ffffff', fontWeight: 'bold', fontSize: '0.9em', textAlign: 'center', lineHeight: 1.2 }}>{sm.text}</span>
              </div>
            );
            return (
              <div style={{ ...style, background: tm.bgColor || 'rgba(0,0,0,0.92)' }}>
                <span style={{ color: tm.textColor || '#facc15', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.4em' }}>{fmtTimer(timerSeconds)}</span>
                {tm.label && <span style={{ color: (tm.textColor || '#facc15') + '99', fontSize: '0.75em', marginTop: '2px' }}>{tm.label}</span>}
              </div>
            );
          })()}
        </div>
      </PreviewBox>

      {/* ── Stream / NDI ─────────────────────────────────────────────── */}
      <PreviewBox
        label="Stream"
        dotColor="bg-cyan-400"
        borderColor={live ? 'border-cyan-400' : 'border-surface-600'}
        live={live}
        onClick={() => openWindow('/virtual', null, 'aio-virtual', displayCfg.virtualResolution)}
      >
        {/* Canvas escalado: object-fit:contain — escala para caber en ancho Y alto */}
        <div
          ref={streamRef}
          className="w-full h-full relative overflow-hidden"
          style={{ backgroundColor: 'black' }}
        >
          {streamW > 0 && streamH > 0 && (() => {
            const res   = displayCfg.virtualResolution ?? { width: 1920, height: 1080 };
            const scale = Math.min(streamW / res.width, streamH / res.height);
            const left  = (streamW - res.width  * scale) / 2;
            const top   = (streamH - res.height * scale) / 2;
            return (
              <div style={{
                position:        'absolute',
                top:             `${top}px`,
                left:            `${left}px`,
                width:           `${res.width}px`,
                height:          `${res.height}px`,
                transform:       `scale(${scale})`,
                transformOrigin: 'top left',
                pointerEvents:   'none',
              }}>
                <VirtualRenderer
                  vc={virtualConfig}
                  slideData={liveState.slideData}
                  isBlank={liveState.isBlank}
                  backgroundMedia={liveState.backgroundMedia}
                />
              </div>
            );
          })()}
        </div>
      </PreviewBox>

    </div>
  );
}

// ─── Preview fiel al StagePage ────────────────────────────────────────────────
export function StagePreview({ stageBgStyle, slideData, nextSlideData, isBlank, live, stageConfig, schedule, eventPlays, reservasMode, fontBase }) {
  const {
    lyricsColor = '#ffffff', nextLyricsColor = '#ffffff',
    chordsColor = '#fde047',
    showSideLabel = true, showSongTitle = true, showSlideCounter = true,
    showClock = true, showNextSlide = true, showSectionLabel = true,
    slideIndex, totalSlides,
  } = stageConfig;

  const normLabel = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const reservasIdx = schedule.findIndex(s => s.item_type === 'separator' && normLabel(s.separator_label).includes('reserva'));
  const reservasEndIdx = (() => {
    if (reservasIdx < 0) return -1;
    const next = schedule.findIndex((s, i) => i > reservasIdx && s.item_type === 'separator');
    return next >= 0 ? next : schedule.length;
  })();

  const currentSongId = slideData?.songId;
  const idx = currentSongId ? schedule.findIndex(s => s.song_id === currentSongId) : -1;
  const currentInReservas = reservasIdx >= 0 && idx > reservasIdx && idx < reservasEndIdx;

  const nextSong = (() => {
    if (reservasMode && reservasIdx >= 0) {
      if (!currentInReservas) {
        for (let i = reservasIdx + 1; i < reservasEndIdx; i++) {
          const it = schedule[i];
          if (!it.song_id) continue;
          if (!eventPlays?.has(it.song_id)) return it;
        }
      } else {
        for (let i = idx + 1; i < reservasEndIdx; i++) {
          const it = schedule[i];
          if (!it.song_id) continue;
          if (!eventPlays?.has(it.song_id)) return it;
        }
        // Reservas agotadas → primera no tocada de secciones ANTERIORES a reservas
        for (let i = 0; i < reservasIdx; i++) {
          const it = schedule[i];
          if (it.item_type === 'separator' || !it.song_id) continue;
          if (!eventPlays?.has(it.song_id)) return it;
        }
        return null;
      }
    }
    // Lógica normal: primera no tocada en todo el schedule (excluyendo la actual)
    for (let i = 0; i < schedule.length; i++) {
      const it = schedule[i];
      if (it.item_type === 'separator' || !it.song_id) continue;
      if (it.song_id === currentSongId) continue; // saltar la actual
      if (eventPlays?.has(it.song_id)) continue;
      return it;
    }
    return null;
  })();

  const sectionColor = getLabelColor(slideData?.label);

  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  const hasCurrentChords = live && slideData?.type === 'song' &&
    parseChordLines(slideData.content || '').some(l => l.some(s => s.chord));

  const hasNextChords = nextSlideData?.type === 'song' &&
    parseChordLines(nextSlideData.content || '').some(l => l.some(s => s.chord));

  return (
    <div className="w-full h-full flex flex-col select-none overflow-hidden"
      style={{ ...stageBgStyle, fontSize: fontBase ?? '7px' }}>

      {/* Top bar */}
      <div className="shrink-0 flex items-center px-1.5 py-0.5 bg-black/30 border-b border-white/10 relative"
        style={{ minHeight: '1.7em' }}>
        {showSlideCounter && live && (
          <span style={{ color: '#94a3b8', fontSize: '0.85em' }}>
            {(stageConfig.slideIndex ?? 0) + 1}/{stageConfig.totalSlides ?? 1}
          </span>
        )}
        {showSongTitle && live && slideData?.songTitle && (
          <span className="absolute left-1/2 -translate-x-1/2 font-bold truncate max-w-[70%]"
            style={{ color: lyricsColor, fontSize: '1em' }}>
            {slideData.songTitle}{slideData.songKey ? ` - ${slideData.songKey}` : ''}
          </span>
        )}
      </div>

      {/* Main area: 2 halves */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Top half — slide actual */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {showSideLabel && (
            <div className="shrink-0 w-1.5" style={{ backgroundColor: sectionColor }} />
          )}
          <div className="flex-1 flex flex-col items-center justify-center px-1.5 py-0.5 overflow-hidden">
            {!live || !slideData || isBlank ? (
              <span style={{ color: '#52525b', fontSize: '0.9em' }}>Vacío</span>
            ) : (
              <MiniSlideContent
                slideData={slideData}
                lyricsColor={lyricsColor}
                chordsColor={chordsColor}
                hasChords={hasCurrentChords}
                showComments={stageConfig.showComments ?? false}
                commentColor={stageConfig.commentColor ?? '#facc15'}
                showLabel={showSectionLabel}
              />
            )}
          </div>
        </div>

        {/* Bottom half — siguiente slide / canción */}
        {showNextSlide && (
          <div className="flex-1 flex overflow-hidden min-h-0 border-t border-white/10"
            style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
            {showSideLabel && (
              <div className="shrink-0 w-1.5" style={{ backgroundColor: sectionColor, opacity: 0.45 }} />
            )}
            <div className="flex-1 flex flex-col items-center justify-center px-1.5 py-0.5 overflow-hidden"
              style={{ opacity: 0.55 }}>
              {nextSlideData && live ? (
                <MiniSlideContent
                  slideData={nextSlideData}
                  lyricsColor={nextLyricsColor}
                  chordsColor={chordsColor}
                  hasChords={hasNextChords}
                  showComments={stageConfig.showComments ?? false}
                  commentColor={stageConfig.commentColor ?? '#facc15'}
                  showLabel={showSectionLabel}
                />
              ) : nextSong ? (
                <span className="font-semibold truncate max-w-full"
                  style={{ color: '#22c55e', fontSize: '0.9em' }}>
                  {nextSong.title}{nextSong.song_key ? ` - ${nextSong.song_key}` : ''}
                </span>
              ) : (
                <span style={{ color: '#ffffff30', fontSize: '0.8em' }}>— fin —</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar — solo nextSong + reloj, igual que StagePage */}
      <div className="shrink-0 flex items-center px-1.5 py-0.5 bg-black/30 border-t border-white/10"
        style={{ minHeight: '1.7em' }}>
        <div className="flex-1" />
        {nextSong && (
          <span className="font-semibold truncate max-w-[70%] text-center"
            style={{ color: '#22c55e', fontSize: '0.8em' }}>
            {nextSong.title}{nextSong.song_key ? ` - ${nextSong.song_key}` : ''}
          </span>
        )}
        <div className="flex-1" />
        {showClock && (
          <span className="font-mono ml-auto" style={{ color: '#ef4444', fontSize: '0.8em' }}>
            {nowStr}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Slide content miniatura para StagePreview ────────────────────────────────
function MiniSlideContent({ slideData, lyricsColor, chordsColor, hasChords, showComments = false, commentColor = '#facc15', showLabel = true }) {
  if (slideData.type === 'title') {
    return (
      <div className="text-center px-1 overflow-hidden">
        <p className="font-bold line-clamp-2" style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.2 }}>
          {slideData.songTitle}
        </p>
        {slideData.songAuthor && (
          <p className="line-clamp-1" style={{ color: lyricsColor, opacity: 0.65, fontSize: '0.75em', lineHeight: 1.3 }}>
            {slideData.songAuthor}
          </p>
        )}
      </div>
    );
  }
  if (slideData.type === 'song') {
    if (hasChords) {
      const rawLines = (slideData.content || '').split('\n');
      const lineData = rawLines.map(line => {
        if (isCommentLine(line)) return { visible: '', comment: line.replace(/^\s*\/\/\s?/, ''), isFullComment: true };
        const { visible, comment } = extractInlineComment(line);
        return { visible, comment, isFullComment: false };
      });
      const chordLines = parseChordLines(lineData.map(ld => ld.visible).join('\n'));
      return (
        <div className="text-center w-full overflow-hidden">
          {chordLines.slice(0, 6).map((line, li) => {
            const ld = lineData[li] ?? {};
            if (ld.isFullComment) {
              if (!showComments) return null;
              return (
                <div key={li} style={{ color: commentColor, fontSize: '0.75em', lineHeight: 1.2, fontStyle: 'italic' }}>
                  {ld.comment}
                </div>
              );
            }
            const lineText = line.map(s => s.text).join('');
            if (!lineText.trim() && !ld.comment && !line.some(s => s.chord)) return <div key={li} style={{ height: '0.3em' }} />;
            const hasC = line.some(s => s.chord);
            const inlineComment = showComments && ld.comment
              ? <span style={{ color: commentColor, fontSize: '0.75em', fontStyle: 'italic', marginLeft: '0.3em' }}>{ld.comment}</span>
              : null;
            if (!hasC) return (
              <div key={li} style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.2 }}>{lineText}{inlineComment}</div>
            );
            return (
              <div key={li} className="flex flex-wrap justify-center" style={{ lineHeight: 1 }}>
                {line.map((seg, si) => (
                  <span key={si} className="inline-flex flex-col items-start">
                    <span style={{ color: chordsColor, fontSize: '0.8em', lineHeight: 1, minHeight: '0.9em', fontFamily: 'monospace', fontWeight: 'bold' }}>
                      {seg.chord || ''}
                    </span>
                    <span style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.2, whiteSpace: 'pre' }}>
                      {seg.text || (seg.chord ? '\u00a0' : '')}
                    </span>
                  </span>
                ))}
                {inlineComment}
              </div>
            );
          })}
        </div>
      );
    }
    return (
      <div className="text-center px-1 overflow-hidden">
        {showLabel && slideData.label && (
          <p className="truncate" style={{ fontSize: '0.75em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '1px' }}>
            {slideData.label}
          </p>
        )}
        <p className="whitespace-pre-line line-clamp-4" style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.25 }}>
          {stripChords(showComments ? slideData.content : stripComments(slideData.content))}
        </p>
      </div>
    );
  }
  if (slideData.type === 'bible') {
    return (
      <div className="text-center px-1 overflow-hidden">
        <p className="whitespace-pre-line line-clamp-3" style={{ color: lyricsColor, fontSize: '1em', lineHeight: 1.25 }}>
          {slideData.text}
        </p>
        <p style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '1px' }}>{slideData.reference}</p>
      </div>
    );
  }
  return null;
}

// ─── Contenedor con label + borde de color ────────────────────────────────────
function PreviewBox({ label, dotColor, borderColor, live, onClick, children }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-1.5 mb-1 shrink-0">
        <span className={`w-2 h-2 rounded-full ${live ? dotColor : 'bg-zinc-600'}`} />
        <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-[8px] text-zinc-500">clic para abrir</span>
      </div>
      <div
        onClick={onClick}
        className={`flex-1 min-h-0 rounded border-2 overflow-hidden transition-colors cursor-pointer hover:brightness-110 active:scale-[0.99] ${borderColor}`}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Diapositiva de título (miniatura para preview Principal) ─────────────────
function TitlePreviewContent({ slideData, outputCfg }) {
  const PRESETS = { sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'monospace', condensed: 'Arial Narrow, Arial, sans-serif' };
  const resolveFF = (f) => PRESETS[f] ?? `'${f}', system-ui, sans-serif`;

  const titleFF    = resolveFF(outputCfg.titleFontFamily  ?? 'sans');
  const artistFF   = resolveFF(outputCfg.artistFontFamily ?? 'sans');
  const titleColor = outputCfg.titleColor        ?? '#ffffff';
  const artistColor= outputCfg.artistColor       ?? '#aaaaaa';
  const showArtist = outputCfg.titleShowArtist   ?? false;

  // Escalar proporcionalmente al tamaño configurado (ref: 72px título → 10px preview, 36px artista → 6px)
  const titlePx  = Math.max(5, Math.min(20, Math.round(Number(outputCfg.titleFontSize  ?? 72) * 10 / 72)));
  const artistPx = Math.max(4, Math.min(14, Math.round(Number(outputCfg.artistFontSize ?? 36) * 6  / 36)));

  return (
    <div className="text-center px-2 flex flex-col items-center gap-0.5">
      <div style={{ fontSize: `${titlePx}px`, color: titleColor, fontFamily: titleFF, fontWeight: 'bold', lineHeight: 1.3 }}>
        {slideData.songTitle}
      </div>
      {showArtist && slideData.songAuthor && (
        <div style={{ fontSize: `${artistPx}px`, color: artistColor, fontFamily: artistFF, lineHeight: 1.3 }}>
          {slideData.songAuthor}
        </div>
      )}
    </div>
  );
}

// ─── Contenido del slide ──────────────────────────────────────────────────────
function SlidePreviewContent({ slideData, isBlank, transparent = false, showChords = false, showComments = false, commentColor = null, commentFontSize = 16, commentFontFamily = 'sans', lyricsColor = null, fontBold = false, fontItalic = false, fontFamily = 'sans', showLabel = true }) {
  if (isBlank || !slideData) {
    return <span className="text-zinc-600 text-[9px]">Vacío</span>;
  }
  const baseTextColor = transparent ? 'text-zinc-800' : 'text-white';
  // styledComments: solo cuando se pasan datos de estilo (Principal). Stream usa texto plano.
  const styledComments = showComments && commentColor !== null;
  // Si lyricsColor se pasa (Principal), usarlo; si no, usar clase CSS
  const resolvedFF = (() => {
    const { FONT_PRESETS } = { FONT_PRESETS: { sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'monospace', condensed: 'Arial Narrow, Arial, sans-serif' } };
    return FONT_PRESETS[fontFamily] ?? `'${fontFamily}', system-ui, sans-serif`;
  })();
  const lyricInlineStyle = lyricsColor ? {
    color: lyricsColor,
    fontWeight: fontBold   ? 'bold'   : 'normal',
    fontStyle:  fontItalic ? 'italic' : 'normal',
    fontFamily: resolvedFF,
  } : null;

  if (slideData.type === 'song') {
    // Pre-procesar líneas para separar comentarios
    const rawLines = (slideData.content || '').split('\n');
    const lineData = rawLines.map(line => {
      if (isCommentLine(line)) return { visible: '', comment: line.replace(/^\s*\/\/\s?/, ''), isFullComment: true };
      const { visible, comment } = extractInlineComment(line);
      return { visible, comment, isFullComment: false };
    });

    const FONT_PRESETS_CF = { sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'monospace', condensed: 'Arial Narrow, Arial, sans-serif' };
    const commentFF = FONT_PRESETS_CF[commentFontFamily] ?? `'${commentFontFamily}', system-ui, sans-serif`;
    const commentStyle = { color: commentColor ?? '#facc15', fontFamily: commentFF, fontStyle: 'italic' };

    if (showChords) {
      const chordLines = parseChordLines(lineData.map(ld => ld.visible).join('\n'));
      const hasAnyChords = chordLines.some(l => l.some(s => s.chord));
      if (hasAnyChords) {
        return (
          <div className="text-center px-2 w-full">
            {showLabel && slideData.label && (
              <p className="text-zinc-400 uppercase mb-0.5" style={{ fontSize: '0.67em' }}>{slideData.label}</p>
            )}
            <div style={{ fontSize: '0.78em', lineHeight: 'normal' }}>
              {chordLines.map((line, li) => {
                const ld = lineData[li] ?? {};
                if (ld.isFullComment) {
                  if (!showComments) return null;
                  return <div key={li} style={commentStyle}>{ld.comment}</div>;
                }
                const lineText = line.map(s => s.text).join('');
                if (!lineText.trim() && !ld.comment && !line.some(s => s.chord)) return <div key={li} style={{ height: '0.4em' }} />;
                const hasC = line.some(s => s.chord);
                const inlineC = styledComments && ld.comment
                  ? <span style={{ ...commentStyle, marginLeft: '0.2em' }}>{ld.comment}</span>
                  : null;
                if (!hasC) return <div key={li} style={{ lineHeight: 1.2, ...(lyricInlineStyle ?? {}) }} className={lyricInlineStyle ? '' : `${baseTextColor} leading-relaxed`}>{lineText}{inlineC}</div>;
                return (
                  <div key={li} className="flex flex-wrap justify-center" style={{ lineHeight: 1.1 }}>
                    {line.map((seg, si) => (
                      <span key={si} className="inline-flex flex-col items-start">
                        <span className="font-bold font-mono text-yellow-300"
                          style={{ fontSize: '0.75em', lineHeight: 1, minHeight: '1em' }}>
                          {seg.chord || ''}
                        </span>
                        <span style={{ lineHeight: 1.3, whiteSpace: 'pre', ...(lyricInlineStyle ?? { color: transparent ? '#1c1917' : '#ffffff' }) }}>
                          {seg.text || (seg.chord ? '\u00a0' : '')}
                        </span>
                      </span>
                    ))}
                    {inlineC}
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
    }
    // Texto plano (sin acordes)
    return (
      <div className="text-center px-2">
        {showLabel && slideData.label && (
          <p className="text-zinc-400 uppercase mb-0.5" style={{ fontSize: '0.78em' }}>{slideData.label}</p>
        )}
        <div style={{ fontSize: '1em', lineHeight: 1.4 }}>
          {lineData.map((ld, i) => {
            if (ld.isFullComment) {
              if (!showComments) return null;
              return <div key={i} style={commentStyle}>{ld.comment}</div>;
            }
            const vis = stripChords(ld.visible);
            if (!vis.trim() && !ld.comment) return null;
            return (
              <div key={i} style={lyricInlineStyle ?? {}} className={lyricInlineStyle ? '' : baseTextColor}>
                {vis}
                {styledComments && ld.comment && (
                  <span style={{ ...commentStyle, marginLeft: '0.2em' }}>{ld.comment}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (slideData.type === 'bible') {
    return (
      <div className="text-center px-2">
        <p className={`${baseTextColor} leading-relaxed whitespace-pre-line line-clamp-4`}
           style={{ fontSize: '1em' }}>
          {slideData.text}
        </p>
        <p className="text-zinc-300 mt-0.5" style={{ fontSize: '0.78em' }}>{slideData.reference}</p>
      </div>
    );
  }
  return null;
}

// ─── Siguiente slide (escenario) ──────────────────────────────────────────────
function NextPreviewContent({ slideData }) {
  if (slideData.type === 'song') {
    return (
      <p className="text-white/60 text-[6px] leading-relaxed whitespace-pre-line line-clamp-1">
        <span className="text-white/30 mr-1 uppercase">{slideData.label}</span>
        {stripChords(stripComments(slideData.content))}
      </p>
    );
  }
  if (slideData.type === 'bible') {
    return (
      <p className="text-white/60 text-[6px] leading-relaxed line-clamp-1">
        <span className="text-white/30 mr-1">{slideData.reference}</span>
        {slideData.text}
      </p>
    );
  }
  return null;
}

/**
 * Emisor NDI para AIO Presenter.
 *
 * Requiere:
 *   npm install grandiose        (bindings Node.js para el SDK de NDI)
 *   NDI SDK instalado en el sistema: https://ndi.video/download-ndi-sdk/
 *
 * Si no están disponibles, el módulo opera en modo degradado (solo log).
 */

const { renderFrame, NDI_WIDTH, NDI_HEIGHT } = require('./frameRenderer');

const FPS = 30;

// ─── Carga opcional de grandiose ──────────────────────────────────────────────
let grandiose = null;
try {
  grandiose = require('grandiose');
  console.log('[NDI] grandiose cargado correctamente');
} catch {
  console.log('[NDI] grandiose no disponible.');
  console.log('[NDI]   → Para activar NDI: npm install grandiose');
  console.log('[NDI]   → SDK requerido:   https://ndi.video/download-ndi-sdk/');
}

// ─── Estado interno ───────────────────────────────────────────────────────────
let sender        = null;
let frameInterval = null;
let currentLiveState    = null;
let currentVirtualConfig = null;

// ─── Pública: inicializar el sender ──────────────────────────────────────────
async function init() {
  if (!grandiose) {
    return { ok: false, reason: 'grandiose no instalado' };
  }
  try {
    sender = await grandiose.send({
      name:       'AIO Presenter',
      clockVideo: true,
      clockAudio: false,
    });
    console.log('[NDI] ✓ Sender activo: "AIO Presenter"');
    return { ok: true };
  } catch (err) {
    console.error('[NDI] Error al iniciar sender:', err.message);
    return { ok: false, reason: err.message };
  }
}

// ─── Pública: actualizar el estado que se renderiza ──────────────────────────
function updateState(liveState, virtualConfig) {
  currentLiveState     = liveState;
  currentVirtualConfig = virtualConfig;
}

// ─── Pública: comenzar a emitir frames ───────────────────────────────────────
function start() {
  if (!sender || frameInterval) return;
  frameInterval = setInterval(async () => {
    try {
      const data = renderFrame(currentLiveState, currentVirtualConfig);
      if (!data) return;
      await sender.frame({
        xres:            NDI_WIDTH,
        yres:            NDI_HEIGHT,
        frameRateN:      FPS * 1000,
        frameRateD:      1000,
        fourCC:          grandiose.FOURCC_BGRA,
        lineStrideBytes: NDI_WIDTH * 4,
        data,
      });
    } catch { /* ignorar errores de frame individual */ }
  }, Math.floor(1000 / FPS));
  console.log(`[NDI] Emitiendo a ${FPS} fps (${NDI_WIDTH}×${NDI_HEIGHT})`);
}

// ─── Pública: detener emisión ─────────────────────────────────────────────────
function stop() {
  if (frameInterval) {
    clearInterval(frameInterval);
    frameInterval = null;
    console.log('[NDI] Emisión detenida');
  }
}

// ─── Pública: consultar estado ────────────────────────────────────────────────
function getStatus() {
  return {
    grandioseInstalled: !!grandiose,
    senderReady:        !!sender,
    sending:            !!frameInterval,
    sourceName:         'AIO Presenter',
    resolution:         `${NDI_WIDTH}×${NDI_HEIGHT}`,
    fps:                FPS,
  };
}

module.exports = { init, updateState, start, stop, getStatus };

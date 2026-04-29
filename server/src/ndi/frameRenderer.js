/**
 * Renderiza el estado en vivo en un buffer de píxeles BGRA (1920×1080)
 * para ser enviado por NDI.
 *
 * Requiere el paquete npm "canvas" (node-canvas).
 * Si no está instalado, renderFrame devuelve null y NDI no envía frames.
 */

let createCanvas = null;
try {
  ({ createCanvas } = require('canvas'));
  console.log('[NDI] canvas cargado correctamente');
} catch {
  console.log('[NDI] canvas no disponible — instálalo con: npm install canvas');
}

const NDI_WIDTH  = 1920;
const NDI_HEIGHT = 1080;

// ─── Helpers de texto ─────────────────────────────────────────────────────────

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Render principal ─────────────────────────────────────────────────────────

function renderFrame(liveState, virtualConfig) {
  if (!createCanvas) return null;

  const canvas = createCanvas(NDI_WIDTH, NDI_HEIGHT);
  const ctx    = canvas.getContext('2d');

  // ── Fondo ──────────────────────────────────────────────────────────────────
  const bg = virtualConfig?.background ?? { type: 'color', color: '#000000' };
  if (bg.type === 'chromakey') {
    ctx.fillStyle = virtualConfig?.chromaColor ?? '#00b140';
    ctx.fillRect(0, 0, NDI_WIDTH, NDI_HEIGHT);
  } else if (bg.type === 'color') {
    ctx.fillStyle = bg.color ?? '#000000';
    ctx.fillRect(0, 0, NDI_WIDTH, NDI_HEIGHT);
  }
  // transparent → sin relleno (canvas inicia en alpha 0)

  // ── Contenido ──────────────────────────────────────────────────────────────
  const { slideData, isBlank } = liveState ?? {};
  if (!isBlank && slideData) {
    ctx.fillStyle  = '#ffffff';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur  = 14;

    const maxWidth = NDI_WIDTH - 240;

    if (slideData.type === 'song') {
      const rawLines = (slideData.content ?? '').split('\n').filter(l => l.trim());
      const count    = rawLines.length;
      const fontSize = count <= 3 ? 96 : count <= 5 ? 76 : count <= 7 ? 62 : 50;
      ctx.font = `bold ${fontSize}px "Helvetica Neue", Arial, sans-serif`;

      const lineH  = fontSize * 1.42;
      const totalH = count * lineH;
      let y = NDI_HEIGHT / 2 - totalH / 2 + lineH / 2;

      for (const line of rawLines) {
        ctx.fillText(line, NDI_WIDTH / 2, y, maxWidth);
        y += lineH;
      }

      // Etiqueta de sección
      if (slideData.label) {
        ctx.font      = `${30}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.shadowBlur = 0;
        ctx.fillText(
          slideData.label.toUpperCase(),
          NDI_WIDTH / 2,
          NDI_HEIGHT / 2 - totalH / 2 - 50,
        );
      }
    }

    if (slideData.type === 'bible') {
      const fontSize = 68;
      ctx.font = `bold ${fontSize}px "Helvetica Neue", Arial, sans-serif`;

      const lines  = wrapText(ctx, slideData.text ?? '', maxWidth);
      const lineH  = fontSize * 1.42;
      const totalH = lines.length * lineH;
      let y = NDI_HEIGHT / 2 - totalH / 2 + lineH / 2 - lineH * 0.8;

      for (const line of lines) {
        ctx.fillText(line, NDI_WIDTH / 2, y, maxWidth);
        y += lineH;
      }

      // Referencia
      if (slideData.reference) {
        ctx.font      = `${38}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.shadowBlur = 0;
        ctx.fillText(slideData.reference, NDI_WIDTH / 2, y + lineH * 0.3, maxWidth);
      }
    }
  }

  // ── Convertir RGBA → BGRA (formato NDI) ───────────────────────────────────
  const imageData = ctx.getImageData(0, 0, NDI_WIDTH, NDI_HEIGHT);
  const rgba = imageData.data;
  const bgra = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    bgra[i]     = rgba[i + 2]; // B
    bgra[i + 1] = rgba[i + 1]; // G
    bgra[i + 2] = rgba[i];     // R
    bgra[i + 3] = rgba[i + 3]; // A
  }
  return bgra;
}

module.exports = { renderFrame, NDI_WIDTH, NDI_HEIGHT };

import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  Pencil, Type, Circle, ArrowRight, Eraser, Undo2, Trash2, X, Highlighter, Minus, Plus,
} from 'lucide-react';

const COLORS = [
  '#ef4444', // rojo
  '#f97316', // naranja
  '#eab308', // amarillo
  '#22c55e', // verde
  '#3b82f6', // azul
  '#a855f7', // morado
  '#ec4899', // rosa
  '#ffffff', // blanco
  '#94a3b8', // gris
];

const TOOLS = [
  { id: 'pencil',      icon: Pencil,      label: 'Lápiz' },
  { id: 'highlighter', icon: Highlighter, label: 'Resaltador' },
  { id: 'circle',      icon: Circle,      label: 'Círculo' },
  { id: 'arrow',       icon: ArrowRight,  label: 'Flecha' },
  { id: 'text',        icon: Type,        label: 'Texto' },
  { id: 'eraser',      icon: Eraser,      label: 'Goma' },
];

// ── Helpers de dibujo ──────────────────────────────────────────────────────
function drawStroke(ctx, item) {
  if (!item.points?.length) return;
  ctx.save();
  ctx.strokeStyle = item.color;
  ctx.lineWidth   = item.width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  if (item.type === 'highlighter') {
    ctx.globalAlpha = 0.35;
    ctx.lineWidth   = item.width * 4;
  }
  ctx.beginPath();
  ctx.moveTo(item.points[0][0], item.points[0][1]);
  for (let i = 1; i < item.points.length; i++) {
    ctx.lineTo(item.points[i][0], item.points[i][1]);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCircle(ctx, item) {
  if (item.rx == null) return;
  ctx.save();
  ctx.strokeStyle = item.color;
  ctx.lineWidth   = item.width;
  ctx.beginPath();
  ctx.ellipse(item.cx, item.cy, Math.abs(item.rx), Math.abs(item.ry), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx, item) {
  if (item.x2 == null) return;
  const { x1, y1, x2, y2, color, width } = item;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size  = Math.max(10, width * 4);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawText(ctx, item) {
  if (!item.text) return;
  ctx.save();
  ctx.fillStyle  = item.color;
  ctx.font       = `bold ${item.fontSize ?? 16}px sans-serif`;
  ctx.fillText(item.text, item.x, item.y);
  ctx.restore();
}

function drawItem(ctx, item) {
  if (item.type === 'stroke' || item.type === 'highlighter') drawStroke(ctx, item);
  else if (item.type === 'circle')  drawCircle(ctx, item);
  else if (item.type === 'arrow')   drawArrow(ctx, item);
  else if (item.type === 'text')    drawText(ctx, item);
}

function redrawAll(canvas, items, preview = null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const item of items) drawItem(ctx, item);
  if (preview) drawItem(ctx, preview);
}

// ── Distancia punto-a-trazo ──────────────────────────────────────────────────
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function itemIsNear(item, x, y, radius) {
  if (item.type === 'stroke' || item.type === 'highlighter') {
    const pts = item.points ?? [];
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < radius) return true;
    }
    return false;
  }
  if (item.type === 'circle') {
    return Math.hypot(x - item.cx, y - item.cy) < Math.max(Math.abs(item.rx), Math.abs(item.ry)) + radius;
  }
  if (item.type === 'arrow') {
    return distToSegment(x, y, item.x1, item.y1, item.x2, item.y2) < radius;
  }
  if (item.type === 'text') {
    return Math.hypot(x - item.x, y - item.y) < 40;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AnnotationCanvas({ containerRef, annotations, onSave, visible }) {
  const canvasRef    = useRef(null);
  const [items, setItems] = useState(() => annotations ?? []);
  const [tool,  setTool]  = useState('pencil');
  const [color, setColor] = useState('#ef4444');
  const [width, setWidth] = useState(2);
  const [textInput, setTextInput] = useState(null); // { x, y }

  const drawing     = useRef(false);
  const currentPts  = useRef([]);
  const startPt     = useRef(null);
  const preview     = useRef(null);
  const saveTimer   = useRef(null);

  // Sync items cuando llegan anotaciones guardadas del servidor
  useEffect(() => {
    if (annotations) setItems(annotations);
  }, [annotations]);

  // Tamaño del canvas = tamaño del contenido scrollable
  const syncSize = useCallback(() => {
    const container = containerRef?.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const w = container.scrollWidth;
    const h = container.scrollHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
      redrawAll(canvas, items);
    }
  }, [containerRef, items]);

  useLayoutEffect(() => {
    syncSize();
  }, [syncSize, visible]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, syncSize]);

  // Redibujar al cambiar items
  useEffect(() => {
    redrawAll(canvasRef.current, items, preview.current);
  }, [items]);

  // Guardar con debounce
  const triggerSave = useCallback((newItems) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave?.(newItems), 1200);
  }, [onSave]);

  // Coordenadas relativas al canvas (posición absoluta dentro del scroll container)
  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return [src.clientX - rect.left, src.clientY - rect.top];
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDown = useCallback((e) => {
    if (!visible) return;
    e.preventDefault();
    const [x, y] = getPos(e);

    if (tool === 'text') {
      setTextInput({ x, y });
      return;
    }

    drawing.current = true;
    startPt.current = [x, y];
    currentPts.current = [[x, y]];
  }, [visible, tool, getPos]);

  const handleMove = useCallback((e) => {
    if (!visible || !drawing.current) return;
    e.preventDefault();
    const [x, y] = getPos(e);
    const [sx, sy] = startPt.current;

    if (tool === 'pencil' || tool === 'highlighter') {
      currentPts.current.push([x, y]);
      preview.current = { type: tool, color, width, points: [...currentPts.current] };
    } else if (tool === 'circle') {
      preview.current = {
        type: 'circle', color, width,
        cx: (sx + x) / 2, cy: (sy + y) / 2,
        rx: Math.abs(x - sx) / 2, ry: Math.abs(y - sy) / 2,
      };
    } else if (tool === 'arrow') {
      preview.current = { type: 'arrow', color, width, x1: sx, y1: sy, x2: x, y2: y };
    } else if (tool === 'eraser') {
      const radius = 20;
      setItems(prev => {
        const next = prev.filter(it => !itemIsNear(it, x, y, radius));
        if (next.length !== prev.length) triggerSave(next);
        return next;
      });
    }

    redrawAll(canvasRef.current, items, preview.current);
  }, [visible, tool, color, width, getPos, items, triggerSave]);

  const handleUp = useCallback((e) => {
    if (!visible || !drawing.current) return;
    drawing.current = false;
    const newItem = preview.current;
    preview.current = null;
    if (!newItem) return;

    // Filtrar ítems vacíos
    if ((newItem.type === 'stroke' || newItem.type === 'highlighter') && newItem.points?.length < 2) return;
    if (newItem.type === 'circle' && (Math.abs(newItem.rx) < 3 || Math.abs(newItem.ry) < 3)) return;
    if (newItem.type === 'arrow'  && Math.hypot(newItem.x2 - newItem.x1, newItem.y2 - newItem.y1) < 5) return;

    setItems(prev => {
      const next = [...prev, newItem];
      triggerSave(next);
      return next;
    });
  }, [visible, triggerSave]);

  // Undo
  const handleUndo = useCallback(() => {
    setItems(prev => {
      const next = prev.slice(0, -1);
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  // Clear
  const handleClear = useCallback(() => {
    if (!window.confirm('¿Eliminar todas las anotaciones de esta canción?')) return;
    setItems([]);
    triggerSave([]);
  }, [triggerSave]);

  // Confirmar texto
  const handleTextCommit = useCallback((text) => {
    if (!text.trim()) { setTextInput(null); return; }
    const newItem = { type: 'text', color, fontSize: 16 + width * 2, x: textInput.x, y: textInput.y, text };
    setItems(prev => {
      const next = [...prev, newItem];
      triggerSave(next);
      return next;
    });
    setTextInput(null);
  }, [color, width, textInput, triggerSave]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Canvas (intercepta eventos solo si tool !== 'none') */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 pointer-events-auto"
        style={{ touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair' }}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onTouchStart={handleDown}
        onTouchMove={handleMove}
        onTouchEnd={handleUp}
      />

      {/* Input flotante para texto */}
      {textInput && (
        <div
          className="absolute pointer-events-auto"
          style={{ left: textInput.x, top: textInput.y - 24, zIndex: 30 }}
        >
          <input
            autoFocus
            className="bg-transparent border-b border-dashed outline-none text-sm font-bold min-w-[120px]"
            style={{ color, borderColor: color, fontSize: 16 + width * 2 }}
            placeholder="Escribe..."
            onKeyDown={e => { if (e.key === 'Enter') handleTextCommit(e.target.value); if (e.key === 'Escape') setTextInput(null); }}
            onBlur={e => handleTextCommit(e.target.value)}
          />
        </div>
      )}

      {/* Barra de herramientas flotante */}
      <div
        className="pointer-events-auto fixed right-4 top-1/2 -translate-y-1/2 z-30
                   flex flex-col items-center gap-1 bg-[#0f1a2e]/95 border border-white/10
                   rounded-2xl p-2 shadow-2xl"
        style={{ backdropFilter: 'blur(12px)' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Herramientas */}
        {TOOLS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`p-2 rounded-xl transition-colors ${
                tool === t.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/40 hover:bg-white/10 hover:text-white/70'
              }`}
            >
              <Icon size={16} />
            </button>
          );
        })}

        <div className="w-full h-px bg-white/10 my-1" />

        {/* Grosor */}
        <button onClick={() => setWidth(w => Math.max(1, w - 1))} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70"><Minus size={12} /></button>
        <span className="text-[10px] font-mono text-white/50 w-4 text-center">{width}</span>
        <button onClick={() => setWidth(w => Math.min(8, w + 1))} className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white/70"><Plus size={12} /></button>

        <div className="w-full h-px bg-white/10 my-1" />

        {/* Colores */}
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: color === c ? 'white' : 'transparent',
            }}
          />
        ))}

        <div className="w-full h-px bg-white/10 my-1" />

        {/* Undo / Clear */}
        <button onClick={handleUndo} title="Deshacer" className="p-2 rounded-xl text-white/40 hover:bg-white/10 hover:text-white/70">
          <Undo2 size={15} />
        </button>
        <button onClick={handleClear} title="Borrar todo" className="p-2 rounded-xl text-white/40 hover:bg-red-500/20 hover:text-red-400">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

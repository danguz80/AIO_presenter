import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Plus, Minus, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { stripChords, parseChordLine, isCommentLine, extractInlineComment } from '../../utils/chordUtils';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}

// Renderiza contenido en formato ChordPro: acordes encima de la letra.
// Los comentarios (//) se muestran en cursiva, independiente de si se muestran acordes.
function renderContent(content, showChords, chordsColor) {
  const rawLines = content ? content.split('\n') : [];
  return (
    <div className="flex flex-col">
      {rawLines.map((rawLine, li) => {
        // Línea completa de comentario (//): siempre en cursiva gris
        if (isCommentLine(rawLine)) {
          const text = rawLine.replace(/^\s*\/\/\s*/, '');
          return (
            <div key={li} className="italic text-white/40 leading-snug text-[0.85em] min-h-[1.2em]">
              {text || '\u00a0'}
            </div>
          );
        }

        // Separar comentario inline del resto de la línea
        const { visible, comment } = extractInlineComment(rawLine);

        // Sin acordes: letra limpia + comentario inline en cursiva gris
        if (!showChords) {
          const cleanText = visible.replace(/\[[^\]]*\]/g, '').replace(/  +/g, ' ').trimEnd();
          return (
            <div key={li} className="whitespace-pre-wrap leading-relaxed min-h-[1.4em]">
              {cleanText}
              {comment && <span className="italic text-white/40 text-[0.85em] ml-2">{comment}</span>}
            </div>
          );
        }

        const segments = parseChordLine(visible);
        const hasChords = segments.some(s => s.chord);

        return (
          <div key={li} className="flex flex-col">
            {hasChords ? (
              <div className="flex flex-col mb-0.5">
                {/* Fila 1: solo acordes, con minWidth para que no se solapen */}
                <div className="flex flex-wrap leading-none mb-0.5">
                  {segments.map((seg, si) => {
                    const minW = seg.chord
                      ? `${Math.max(seg.chord.length * 0.62 + 1.0, 2.2)}em`
                      : `${(seg.text?.length ?? 0) * 0.55}em`;
                    return (
                      <span key={si} style={{ minWidth: minW }} className="font-bold text-[0.82em]">
                        <span style={{ color: chordsColor }}>{seg.chord ?? ''}</span>
                      </span>
                    );
                  })}
                  {comment && (
                    <span className="italic text-white/40 font-normal text-[0.82em] ml-2">{comment}</span>
                  )}
                </div>
                {/* Fila 2: letra corrida, sin restricciones de ancho de acordes */}
                <div className="leading-relaxed whitespace-pre-wrap">
                  {segments.map(s => s.text).join('')}
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed min-h-[1.4em]">
                {segments.map(s => s.text).join('')}
                {comment && <span className="italic text-white/40 text-[0.85em] ml-2">{comment}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const SECTION_COLOR = '#60a5fa'; // azul uniforme para todas las labels
function sectionColor() { return SECTION_COLOR; }

export default function CancioneroSongDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [song, setSong]       = useState(null);
  const [slides, setSlides]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Opciones de visualización
  const [showChords, setShowChords] = useState(true);
  const [fontSize, setFontSize]     = useState(18); // px
  const chordsColor = '#facc15';

  // Auto-scroll
  const [scrolling, setScrolling]   = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(2.0); // 1.0–10.0 en pasos de 0.1
  const scrollRef = useRef(null);
  const rafRef    = useRef(null);
  const lastTs    = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/songs/${id}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(s => {
        setSong(s);
        setSlides(Array.isArray(s.slides) ? s.slides : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  // Auto-scroll loop
  useEffect(() => {
    if (!scrolling) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTs.current = null;
      return;
    }
    const step = (ts) => {
      if (lastTs.current !== null && scrollRef.current) {
        const dt = ts - lastTs.current;
        const pxPerSec = scrollSpeed * 12 + 3; // speed 1=15px/s … speed 10=123px/s
        scrollRef.current.scrollTop += pxPerSec * dt / 1000;
        // Detener al llegar al fondo
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 2) {
          setScrolling(false);
          lastTs.current = null;
          return;
        }
      }
      lastTs.current = ts;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [scrolling, scrollSpeed]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1a2e] flex items-center justify-center">
        <Loader2 size={32} className="text-yellow-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/cancionero/canciones')} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} className="text-white/70" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{song?.title ?? '—'}</h1>
            {song?.author && <p className="text-xs text-white/40 truncate">{song.author}</p>}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {/* Mostrar acordes */}
          <button
            onClick={() => setShowChords(v => !v)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              showChords
                ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-300'
                : 'bg-white/10 border-white/10 text-white/50'
            }`}
          >
            {showChords ? 'Acordes ✓' : 'Acordes'}
          </button>

          {/* Tamaño fuente */}
          <div className="flex-shrink-0 flex items-center gap-1 bg-white/10 border border-white/10 rounded-lg px-1.5 py-1">
            <button onClick={() => setFontSize(f => Math.max(12, f - 2))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
              <Minus size={13} className="text-white/60" />
            </button>
            <span className="text-xs text-white/60 w-8 text-center">{fontSize}px</span>
            <button onClick={() => setFontSize(f => Math.min(36, f + 2))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
              <Plus size={13} className="text-white/60" />
            </button>
          </div>

          {/* Velocidad scroll */}
          <div className="flex-shrink-0 flex items-center gap-1 bg-white/10 border border-white/10 rounded-lg px-1.5 py-1">
            <button onClick={() => setScrollSpeed(s => Math.max(1.0, Math.round((s - 0.1) * 10) / 10))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
              <ChevronDown size={13} className="text-white/60" />
            </button>
            <span className="text-xs text-white/60 w-8 text-center">{scrollSpeed.toFixed(1)}</span>
            <button onClick={() => setScrollSpeed(s => Math.min(10.0, Math.round((s + 0.1) * 10) / 10))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
              <ChevronUp size={13} className="text-white/60" />
            </button>
          </div>

          {/* Botón scroll */}
          <button
            onClick={() => setScrolling(v => !v)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              scrolling
                ? 'bg-red-500/20 border-red-400/40 text-red-300'
                : 'bg-green-500/20 border-green-400/40 text-green-300'
            }`}
          >
            {scrolling ? <><Pause size={12} /> Pausar</> : <><Play size={12} /> Auto-scroll</>}
          </button>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {slides.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">Esta canción no tiene secciones.</p>
        ) : (
          slides.map(slide => (
            <div key={slide.id}>
              {/* Label de sección */}
              {slide.label && (
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: sectionColor(slide.label) }}>
                  {slide.label}
                </p>
              )}
              {/* Contenido */}
              <p className="leading-relaxed text-white/90" style={{ fontSize: `${fontSize}px` }}>
                {renderContent(slide.content, showChords, chordsColor)}
              </p>
            </div>
          ))
        )}
        {/* Espacio final para scroll */}
        <div className="h-32" />
      </div>
    </div>
  );
}

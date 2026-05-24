import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Plus, Minus, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { stripChords } from '../../utils/chordUtils';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}

// Colorea los acordes dentro del contenido
function renderContent(content, showChords, chordsColor) {
  if (!showChords) {
    return <span className="whitespace-pre-line">{stripChords(content)}</span>;
  }
  // Resaltar [Acorde]
  const parts = content.split(/(\[[^\]]*\])/g);
  return (
    <span className="whitespace-pre-line">
      {parts.map((part, i) =>
        part.startsWith('[') && part.endsWith(']')
          ? <span key={i} style={{ color: chordsColor }} className="font-bold">{part.slice(1, -1)}</span>
          : part
      )}
    </span>
  );
}

const SECTION_COLORS = {
  intro: '#94a3b8', verso: '#60a5fa', coro: '#facc15', puente: '#4ade80',
  pre: '#f97316', outro: '#c084fc', tag: '#fb7185',
};
function sectionColor(label) {
  const l = (label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (const [k, v] of Object.entries(SECTION_COLORS)) { if (l.includes(k)) return v; }
  return '#94a3b8';
}

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
  const [scrollSpeed, setScrollSpeed] = useState(2); // 1–10
  const scrollRef = useRef(null);
  const rafRef    = useRef(null);
  const lastTs    = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/songs/${id}`,        { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/api/songs/${id}/slides`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([s, sl]) => {
      setSong(s);
      setSlides(Array.isArray(sl) ? sl : []);
      setLoading(false);
    }).catch(() => setLoading(false));
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
        const pxPerSec = scrollSpeed * 20; // velocidad base
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
            <button onClick={() => setScrollSpeed(s => Math.max(1, s - 1))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
              <ChevronDown size={13} className="text-white/60" />
            </button>
            <span className="text-xs text-white/60 w-4 text-center">{scrollSpeed}</span>
            <button onClick={() => setScrollSpeed(s => Math.min(10, s + 1))} className="p-0.5 rounded hover:bg-white/10 transition-colors">
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

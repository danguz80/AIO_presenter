import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Plus, Minus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, Pencil
} from 'lucide-react';
import { stripChords, parseChordLine, isCommentLine, extractInlineComment } from '../../utils/chordUtils';
import SongFormModal from '../../components/Library/SongFormModal';
import CancioneroNavbar from './CancioneroNavbar';

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
        // Marcador de cambio de clave {key:X}
        const keyMatch = rawLine.trim().match(/^\{key:([^}]+)\}$/i);
        if (keyMatch) {
          return (
            <div key={li} className="flex items-center gap-1.5 my-1 py-0.5 border-l-2 border-yellow-400/40 pl-2">
              <span className="text-[10px] uppercase tracking-widest text-yellow-400/50">↕ Clave:</span>
              <span className="text-xs font-bold text-yellow-400/70">{keyMatch[1].trim()}</span>
            </div>
          );
        }

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
              /*
               * Doble fila: fila de acordes (flex) + fila de texto (string corrido).
               * Cada columna usa max(ancho_estimado_acorde, ancho_estimado_texto) para
               * que el acorde quede aproximadamente sobre su sílaba.
               * El texto fluye libre sin gaps ni quiebres de palabras.
               */
              <div className="flex flex-col mb-1">
                {/* Fila 1: acordes */}
                <div className="flex flex-wrap leading-none mb-0.5" style={{ fontSize: '0.82em' }}>
                  {segments.map((seg, si) => {
                    // Estimamos el ancho de cada columna combinando acorde y texto
                    const chordW = seg.chord
                      ? Math.max(seg.chord.length * 0.75 + 0.5, 1.8)
                      : 0;
                    const textW = (seg.text?.length ?? 0) * 0.55;
                    const colW  = `${Math.max(chordW, textW)}em`;
                    return (
                      <span
                        key={si}
                        className="font-bold shrink-0"
                        style={{ minWidth: colW, color: chordsColor, lineHeight: 1.2 }}
                      >
                        {seg.chord ?? ''}
                      </span>
                    );
                  })}
                  {comment && (
                    <span className="italic font-normal ml-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {comment}
                    </span>
                  )}
                </div>
                {/* Fila 2: letra corrida, sin restricciones */}
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
  const location = useLocation();

  // Contexto de evento: lista de canciones para navegar prev/next
  const songList   = location.state?.songList   ?? null; // [{id, title}, ...]
  const eventTitle = location.state?.eventTitle ?? null;
  const eventId    = location.state?.eventId    ?? null;
  const currentIdx = songList ? songList.findIndex(s => String(s.id) === String(id)) : -1;
  const prevSong   = songList && currentIdx > 0                   ? songList[currentIdx - 1] : null;
  const nextSong   = songList && currentIdx < songList.length - 1 ? songList[currentIdx + 1] : null;

  const goTo = (song) => {
    if (!song) return;
    setScrolling(false);
    navigate(`/cancionero/canciones/${song.id}`, {
      state: { songList, eventTitle, eventId },
      replace: false,
    });
  };

  const goBack = () => {
    if (eventId) navigate(`/cancionero/eventos/${eventId}`);
    else navigate('/cancionero/canciones');
  };

  const [song, setSong]       = useState(null);
  const [slides, setSlides]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  // Opciones de visualización
  const [showChords, setShowChords] = useState(true);
  // Font-size inicial: 18px móvil / 22px tablet / 26px desktop
  // useLayoutEffect garantiza que window.innerWidth ya tiene el viewport real
  const [fontSize, setFontSize] = useState(18);
  useLayoutEffect(() => {
    const w = window.innerWidth;
    setFontSize(w >= 1024 ? 26 : w >= 768 ? 22 : 18);
  }, []); // solo al montar — los botones ± siguen funcionando desde ahí
  const chordsColor = '#facc15';

  // Auto-scroll
  const [scrolling, setScrolling]     = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(2.0); // 1.0–10.0 en pasos de 0.1
  const scrollRef      = useRef(null);
  const rafRef         = useRef(null);
  const lastTs         = useRef(null);
  const scrollSpeedRef = useRef(scrollSpeed); // siempre actualizado, sin reiniciar el loop
  const accumRef       = useRef(0);           // acumulador de píxeles fraccionarios

  // Mantener el ref sincronizado sin tocar el loop
  useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);

  // Barra espaciadora → toggle scroll; flechas → prev/next canción (solo con lista de evento)
  useEffect(() => {
    const onKey = (e) => {
      if (editOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); setScrolling(v => !v); }
      if (e.code === 'ArrowLeft')  { e.preventDefault(); goTo(prevSong); }
      if (e.code === 'ArrowRight') { e.preventDefault(); goTo(nextSong); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, prevSong, nextSong]);

  // Swipe horizontal → prev/next canción
  const touchStartX = useRef(null);
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 60) return;   // umbral mínimo 60px
    if (dx > 0) goTo(prevSong);      // deslizar derecha → canción anterior
    else        goTo(nextSong);      // deslizar izquierda → canción siguiente
  };

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

  // Auto-scroll loop — solo depende de `scrolling`, no de scrollSpeed
  useEffect(() => {
    if (!scrolling) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTs.current = null;
      return;
    }
    // Resetear acumulador y timestamp al iniciar
    lastTs.current = null;
    accumRef.current = 0;

    const step = (ts) => {
      if (lastTs.current !== null && scrollRef.current) {
        // Cap de 50 ms: evita saltos al volver de segundo plano
        const dt       = Math.min(ts - lastTs.current, 50);
        // Escala lineal: speed 1 = 10px/s … speed 10 = 55px/s
        const pxPerSec = scrollSpeedRef.current * 5 + 5;

        // Acumular píxeles fraccionarios y aplicar solo la parte entera
        // Esto elimina el efecto "entrecortado" a velocidades bajas donde
        // el incremento por frame es < 1px y el navegador redondea scrollTop
        accumRef.current += pxPerSec * dt / 1000;
        const intPx = Math.floor(accumRef.current);
        if (intPx >= 1) {
          scrollRef.current.scrollTop += intPx;
          accumRef.current -= intPx;
        }

        // Detener al llegar al fondo
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 2) {
          setScrolling(false);
          return;
        }
      }
      lastTs.current = ts;
      rafRef.current  = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current   = null;
      lastTs.current   = null;
      accumRef.current = 0;
    };
  }, [scrolling]); // scrollSpeed se lee a través del ref, sin reiniciar el loop

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1a2e] flex items-center justify-center">
        <Loader2 size={32} className="text-yellow-400 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={goBack}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} className="text-white/70" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{song?.title ?? '—'}</h1>
            {/* Breadcrumb: muestra el evento (clickeable) si venimos de ahí, si no el autor */}
            {eventTitle
              ? (
                <button
                  onClick={() => eventId && navigate(`/cancionero/eventos/${eventId}`)}
                  className="text-xs text-yellow-400/60 truncate hover:text-yellow-300 transition-colors text-left max-w-full"
                >
                  {eventTitle}
                </button>
              )
              : song?.author && <p className="text-xs text-white/40 truncate">{song.author}</p>
            }
          </div>
          {/* Prev / next dentro del evento */}
          {songList && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => goTo(prevSong)}
                disabled={!prevSong}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-20"
                title={prevSong?.title ?? ''}
              >
                <ChevronLeft size={18} className="text-white/70" />
              </button>
              <span className="text-xs text-white/30 tabular-nums w-10 text-center">
                {currentIdx + 1}/{songList.length}
              </span>
              <button
                onClick={() => goTo(nextSong)}
                disabled={!nextSong}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-20"
                title={nextSong?.title ?? ''}
              >
                <ChevronRight size={18} className="text-white/70" />
              </button>
            </div>
          )}
          <button
            onClick={() => setEditOpen(true)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Editar canción"
          >
            <Pencil size={17} className="text-white/60" />
          </button>
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 py-5 space-y-6">
        {slides.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">Esta canción no tiene secciones.</p>
        ) : (
          slides.map((slide, idx) => (
            <div key={slide.id}>
              {/* Label de sección: solo cuando cambia respecto al slide anterior */}
              {slide.label && slide.label !== slides[idx - 1]?.label && (
                <p className="font-bold uppercase tracking-widest mb-2"
                  style={{ fontSize: `${Math.round(fontSize * 0.62)}px`, color: sectionColor(slide.label) }}>
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
        <div className="h-16" />
      </div>

      {/* ── A continuación: barra fija inferior ─────────────────────── */}
      {nextSong && (
        <button
          onClick={() => goTo(nextSong)}
          className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white/5 border-t border-white/10 hover:bg-white/10 transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-white/30 leading-none mb-0.5">A continuación...</p>
            <p className="text-sm font-semibold text-white/60 truncate">{nextSong.title}</p>
          </div>
          <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
        </button>
      )}

      {/* ── Modal edición ───────────────────────────────────────────── */}
      {editOpen && song && (
        <SongFormModal
          song={song}
          onClose={() => setEditOpen(false)}
          onSaved={(updatedSong) => {
            if (updatedSong) {
              setSong(updatedSong);
              setSlides(Array.isArray(updatedSong.slides) ? updatedSong.slides : []);
            }
          }}
          onDeleted={() => navigate('/cancionero/canciones')}
        />
      )}
      <CancioneroNavbar />
    </div>
  );
}

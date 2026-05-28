import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Plus, Minus, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, Pencil,
  LayoutList, X, Trash2, Save,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { stripChords, parseChordLine, isCommentLine, extractInlineComment, transposeContent, transposeKey } from '../../utils/chordUtils';
import SongFormModal from '../../components/Library/SongFormModal';
import CancioneroNavbar from './CancioneroNavbar';

const API = import.meta.env.VITE_API_URL || '';
const SOCKET_URL = import.meta.env.VITE_API_URL || window.location.origin;
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}

// ─── Abreviaciones de sección ──────────────────────────────────────────────────
const SECTION_ABBR = {
  'intro': 'I', 'intro 1': 'I1', 'intro 2': 'I2',
  'verso': 'V', 'verso 1': 'V1', 'verso 2': 'V2', 'verso 3': 'V3',
  'estrofa': 'E', 'estrofa 1': 'E1', 'estrofa 2': 'E2',
  'pre-coro': 'PC', 'pre coro': 'PC', 'precoro': 'PC',
  'coro': 'C', 'coro 2': 'C2', 'chorus': 'C',
  'puente': 'Pb', 'bridge': 'Pb',
  'outro': 'O', 'final': 'F', 'tag': 'T', 'ending': 'F',
  'instrumental': 'Inst', 'interludio': 'Int',
};
function labelAbbr(label) {
  if (!label) return '';
  return SECTION_ABBR[label.toLowerCase().trim()] ?? label;
}

// ─── Colores por sección ────────────────────────────────────────────────────────
const SECTION_COLORS = {
  'Intro': '#60a5fa', 'Verse': '#34d399', 'Verso': '#34d399', 'Estrofa': '#34d399',
  'Pre-Coro': '#f59e0b', 'Coro': '#f87171', 'Chorus': '#f87171',
  'Puente': '#a78bfa', 'Bridge': '#a78bfa', 'Final': '#94a3b8',
  'Outro': '#94a3b8', 'Instrumental': '#22d3ee', 'Interludio': '#22d3ee', 'Tag': '#fb923c',
};
function labelColor(label) {
  return SECTION_COLORS[label] ?? '#6b7280';
}

// ─── Modal de Estructura ─────────────────────────────────────────────────────────
function EstructuraModal({ song, slides, onClose, onSaved }) {
  // Etiquetas únicas presentes en los slides (en orden de aparición)
  const availableLabels = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const s of slides) {
      const lbl = s.label?.trim();
      if (lbl && !seen.has(lbl)) { seen.add(lbl); result.push(lbl); }
    }
    return result;
  }, [slides]);

  // Estructura actual guardada (o vacía si no hay)
  const [structure, setStructure] = useState(
    () => Array.isArray(song?.structure) && song.structure.length > 0
      ? [...song.structure]
      : []
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  const dragItem = useRef(null);       // índice en structure siendo arrastrado
  const dragOver = useRef(null);       // índice en structure sobre el que se pasa

  const handleDragStartStructure = (idx) => { dragItem.current = idx; };
  const handleDragOverStructure  = (e, idx) => { e.preventDefault(); dragOver.current = idx; };
  const handleDropStructure      = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    const arr = [...structure];
    const [moved] = arr.splice(dragItem.current, 1);
    arr.splice(dragOver.current, 0, moved);
    setStructure(arr);
    dragItem.current = null;
    dragOver.current = null;
  };

  // Añadir etiqueta desde la paleta
  const addLabel = (lbl) => setStructure(prev => [...prev, lbl]);

  // Eliminar ítem de la estructura
  const removeItem = (idx) => setStructure(prev => prev.filter((_, i) => i !== idx));

  // Limpiar todo
  const clearAll = () => setStructure([]);

  // Guardar
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/songs/${song.id}/structure`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ structure }),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved?.(data.structure);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-[#0f1a2e] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <LayoutList size={18} className="text-purple-300/80" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white">Estructura</h2>
            <p className="text-xs text-white/40 truncate">{song.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X size={16} className="text-white/50" />
          </button>
        </div>

        <div className="flex flex-col gap-0 flex-1 overflow-hidden">
          {/* Paleta de etiquetas disponibles */}
          <div className="px-5 py-4 border-b border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-white/30 mb-3">
              Secciones disponibles — toca para agregar
            </p>
            {availableLabels.length === 0 ? (
              <p className="text-xs text-white/20 italic">Esta canción no tiene secciones etiquetadas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableLabels.map(lbl => (
                  <button
                    key={lbl}
                    onClick={() => addLabel(lbl)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:scale-105 active:scale-95"
                    style={{
                      borderColor: labelColor(lbl) + '60',
                      backgroundColor: labelColor(lbl) + '18',
                      color: labelColor(lbl),
                    }}
                  >
                    <span className="text-[10px] opacity-60">{labelAbbr(lbl)}</span>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Zona de construcción */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-widest text-white/30">
                Estructura — arrastra para reordenar
              </p>
              {structure.length > 0 && (
                <button onClick={clearAll} className="text-[10px] text-white/25 hover:text-red-400 transition-colors flex items-center gap-1">
                  <Trash2 size={10} /> Limpiar
                </button>
              )}
            </div>

            {structure.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-white/10 rounded-xl gap-2">
                <p className="text-xs text-white/25">Agrega secciones desde arriba</p>
                <p className="text-[10px] text-white/15">Ej: Intro · Verso · Pre-Coro · Coro · Puente · Coro</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {structure.map((lbl, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => handleDragStartStructure(idx)}
                    onDragOver={e => handleDragOverStructure(e, idx)}
                    onDrop={handleDropStructure}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-white/5"
                    style={{ borderColor: labelColor(lbl) + '40', backgroundColor: labelColor(lbl) + '0d' }}
                  >
                    {/* Drag handle */}
                    <span className="text-white/20 text-[10px] font-mono w-5 text-center shrink-0">⠿</span>
                    {/* Número */}
                    <span className="text-white/25 text-[10px] w-4 shrink-0">{idx + 1}</span>
                    {/* Abreviación */}
                    <span className="text-[10px] font-bold shrink-0 w-8 text-right" style={{ color: labelColor(lbl) }}>
                      {labelAbbr(lbl)}
                    </span>
                    {/* Label */}
                    <span className="flex-1 text-xs font-semibold text-white">{lbl}</span>
                    {/* Eliminar */}
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-1 rounded hover:bg-red-500/20 transition-colors"
                    >
                      <X size={12} className="text-white/30 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Vista previa abreviada */}
            {structure.length > 0 && (
              <div className="mt-4 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5">Vista previa</p>
                <p className="text-xs font-mono text-white/60 leading-relaxed">
                  {structure.map(labelAbbr).join(' · ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-xs text-white/30">{structure.length} sección{structure.length !== 1 ? 'es' : ''}</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-xs font-semibold transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 ${
                saved
                  ? 'bg-green-500/25 border border-green-400/40 text-green-300'
                  : 'bg-purple-500/25 hover:bg-purple-500/40 border border-purple-400/40 text-purple-200'
              }`}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saved ? '¡Guardado!' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [estructuraOpen, setEstructuraOpen] = useState(false);

  // Transposición global (todos en la org) y capo personal
  const [keyOffset, setKeyOffset]   = useState(0);
  const [capoOffset, setCapoOffset] = useState(0);
  const socketRef = useRef(null);

  // displayOffset: lo que YO veo (keyOffset global - capo personal)
  const displayOffset = useMemo(() => keyOffset - capoOffset, [keyOffset, capoOffset]);

  // Conectar socket y pedir offset actual al montar
  useEffect(() => {
    const token = localStorage.getItem('aio_sync_token');
    const orgId = localStorage.getItem('aio_org_id');
    const sock  = io(SOCKET_URL, { auth: { token, orgId } });
    socketRef.current = sock;

    sock.on('connect', () => {
      sock.emit('song:getKeyOffset', id);
    });
    sock.on('song:keyOffset', ({ songId, offset }) => {
      if (String(songId) === String(id)) setKeyOffset(offset);
    });
    return () => { sock.disconnect(); socketRef.current = null; };
  }, [id]);

  // Cargar capo desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`aio_capo_${id}`);
    setCapoOffset(saved ? parseInt(saved, 10) : 0);
  }, [id]);

  const changeKey = (delta) => {
    const next = keyOffset + delta;
    setKeyOffset(next);
    socketRef.current?.emit('song:setKeyOffset', { songId: id, offset: next });
  };

  const changeCapo = (delta) => {
    const next = Math.max(0, Math.min(11, capoOffset + delta));
    setCapoOffset(next);
    localStorage.setItem(`aio_capo_${id}`, String(next));
  };

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

          {/* ── Key (global, todos la ven) ── */}
          <div className="flex-shrink-0 flex items-center gap-1 bg-yellow-500/10 border border-yellow-400/25 rounded-lg px-1.5 py-1">
            <button
              onClick={() => changeKey(-1)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Bajar semitono (global)"
            >
              <Minus size={13} className="text-yellow-300/70" />
            </button>
            <div className="flex flex-col items-center leading-none" style={{ minWidth: '3rem' }}>
              <span className="text-[8px] uppercase tracking-widest text-yellow-400/50 leading-none">Key</span>
              <span className="text-xs font-bold text-yellow-300 leading-tight">
                {song?.song_key
                  ? transposeKey(song.song_key, keyOffset)
                  : keyOffset === 0 ? '—' : (keyOffset > 0 ? `+${keyOffset}` : `${keyOffset}`)}
              </span>
            </div>
            <button
              onClick={() => changeKey(+1)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Subir semitono (global)"
            >
              <Plus size={13} className="text-yellow-300/70" />
            </button>
          </div>

          {/* ── Capo (personal, solo yo) ── */}
          <div className="flex-shrink-0 flex items-center gap-1 bg-blue-500/10 border border-blue-400/25 rounded-lg px-1.5 py-1">
            <button
              onClick={() => changeCapo(-1)}
              disabled={capoOffset === 0}
              className="p-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-20"
              title="Bajar capo"
            >
              <Minus size={13} className="text-blue-300/70" />
            </button>
            <div className="flex flex-col items-center leading-none" style={{ minWidth: '3rem' }}>
              <span className="text-[8px] uppercase tracking-widest text-blue-400/50 leading-none">Capo</span>
              <span className="text-xs font-bold text-blue-300 leading-tight">
                {capoOffset === 0
                  ? 'Sin'
                  : capoOffset === 1 ? 'Traste 1'
                  : `Traste ${capoOffset}`}
              </span>
            </div>
            <button
              onClick={() => changeCapo(+1)}
              disabled={capoOffset >= 11}
              className="p-0.5 rounded hover:bg-white/10 transition-colors disabled:opacity-20"
              title="Subir capo"
            >
              <Plus size={13} className="text-blue-300/70" />
            </button>
          </div>

          {/* ── Estructura ── */}
          <button
            onClick={() => setEstructuraOpen(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors bg-purple-500/10 border-purple-400/25 text-purple-300 hover:bg-purple-500/20"
            title="Ver / editar estructura de la canción"
          >
            <LayoutList size={13} />
            {song?.structure?.length > 0
              ? song.structure.map(labelAbbr).join('·')
              : 'Estructura'}
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
                {renderContent(transposeContent(slide.content, displayOffset), showChords, chordsColor)}
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
      {estructuraOpen && song && (
        <EstructuraModal
          song={song}
          slides={slides}
          onClose={() => setEstructuraOpen(false)}
          onSaved={(newStructure) => setSong(prev => ({ ...prev, structure: newStructure }))}
        />
      )}
      <CancioneroNavbar />
    </div>
  );
}

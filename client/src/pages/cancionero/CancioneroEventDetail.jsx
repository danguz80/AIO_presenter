import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Clock, Music2, Pencil, Trash2,
  ChevronUp, ChevronDown, X, RefreshCw, Loader2, Music, Plus, Send, Check,
} from 'lucide-react';
import CancioneroNavbar from './CancioneroNavbar';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}
function toDateStr(d) { return String(d).slice(0, 10); }
function formatDate(dateStr) {
  const d = new Date(toDateStr(dateStr) + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function norm(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── Modal de edición de evento ──────────────────────────────────────────────
function EventEditModal({ event, onClose, onSaved }) {
  const [title,       setTitle]       = useState(event?.title || '');
  const [date,        setDate]        = useState(event?.date ? String(event.date).slice(0, 10) : '');
  const [time,        setTime]        = useState(event?.time ? String(event.time).slice(0, 5) : '');
  const [description, setDescription] = useState(event?.description || '');
  const [isRecurring, setIsRecurring] = useState(event?.is_recurring || false);
  const [recurrence,  setRecurrence]  = useState(event?.recurrence || 'weekly');
  const [recurEnd,    setRecurEnd]    = useState(event?.recur_end ? String(event.recur_end).slice(0, 10) : '');
  const [playlist,    setPlaylist]    = useState(
    (event?.songs ?? [])
      .filter(s => s.item_type !== 'separator' && s.song_id)
      .sort((a, b) => a.position - b.position)
      .map(s => ({ song_id: s.song_id, title: s.title, author: s.author }))
  );
  const [allSongs,    setAllSongs]    = useState([]);
  const [songSearch,  setSongSearch]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/songs?limit=9999`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setAllSongs(Array.isArray(data.songs) ? data.songs : Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const filteredSongs = songSearch
    ? allSongs.filter(s => {
        const q = norm(songSearch);
        return norm(s.title).includes(q) || norm(s.author ?? '').includes(q);
      }).slice(0, 8)
    : [];

  const addSong = (song) => {
    if (playlist.find(p => p.song_id === song.id)) return;
    setPlaylist(prev => [...prev, { song_id: song.id, title: song.title, author: song.author }]);
    setSongSearch('');
    searchRef.current?.focus();
  };
  const removeSong = (song_id) => setPlaylist(prev => prev.filter(p => p.song_id !== song_id));
  const moveSong = (idx, dir) => {
    const arr = [...playlist];
    const ni = idx + dir;
    if (ni < 0 || ni >= arr.length) return;
    [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
    setPlaylist(arr);
  };

  const save = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    const body = {
      title: title.trim(),
      date,
      time: time || null,
      description: description.trim() || null,
      is_recurring: isRecurring,
      recurrence:   isRecurring ? recurrence : null,
      recur_end:    isRecurring && recurEnd ? recurEnd : null,
      songs: playlist.map((p, i) => ({ song_id: p.song_id, position: i })),
    };
    try {
      const res = await fetch(`${API}/api/events/${event.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      console.error('[EventEditModal] save:', e);
      alert('Error al guardar el evento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-surface-800 border border-surface-600 rounded-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700 shrink-0">
          <h2 className="font-semibold text-base">Editar evento</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Título */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Título *</label>
            <input
              autoFocus
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej: Servicio dominical"
            />
          </div>

          {/* Fecha + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Fecha *</label>
              <input
                type="date"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Hora</label>
              <input
                type="time"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Descripción</label>
            <textarea
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Notas opcionales..."
            />
          </div>

          {/* Recurrencia */}
          <div className="bg-surface-700/50 rounded-xl p-3 border border-surface-600">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-500"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
              />
              <RefreshCw size={14} className={isRecurring ? 'text-accent' : 'text-zinc-500'} />
              <span className="text-sm font-medium">Evento recurrente</span>
            </label>
            {isRecurring && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Frecuencia</label>
                  <select
                    className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                    value={recurrence}
                    onChange={e => setRecurrence(e.target.value)}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Cada 2 semanas</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Hasta (opcional)</label>
                  <input
                    type="date"
                    className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                    value={recurEnd}
                    onChange={e => setRecurEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Playlist */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
              <Music size={12} />
              <span>Lista de canciones ({playlist.length})</span>
            </div>
            <div className="relative mb-2">
              <input
                ref={searchRef}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                placeholder="Buscar canción para agregar..."
                value={songSearch}
                onChange={e => setSongSearch(e.target.value)}
              />
              {filteredSongs.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-600 rounded-lg overflow-hidden shadow-xl max-h-44 overflow-y-auto">
                  {filteredSongs.map(s => (
                    <button
                      key={s.id}
                      onMouseDown={e => { e.preventDefault(); addSong(s); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-600 flex items-center gap-2"
                    >
                      <Music size={12} className="text-accent shrink-0" />
                      <span className="truncate flex-1">{s.title}</span>
                      {s.author && <span className="text-zinc-500 text-xs shrink-0">{s.author}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {playlist.length > 0 && (
              <div className="flex flex-col gap-1">
                {playlist.map((item, i) => (
                  <div key={item.song_id} className="flex items-center gap-2 bg-surface-700 rounded-lg px-2 py-1.5 group">
                    <span className="text-zinc-500 text-xs w-5 text-center shrink-0">{i + 1}</span>
                    <Music size={12} className="text-accent shrink-0" />
                    <span className="text-sm flex-1 truncate">{item.title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => moveSong(i, -1)} disabled={i === 0} className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs">▲</button>
                      <button onClick={() => moveSong(i, 1)} disabled={i === playlist.length - 1} className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs">▼</button>
                      <button onClick={() => removeSong(item.song_id)} className="text-zinc-500 hover:text-red-400 p-0.5 ml-0.5"><X size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-700 shrink-0">
          <button onClick={onClose} className="text-sm text-zinc-400 hover:text-white px-4 py-2 rounded-lg hover:bg-surface-700">Cancelar</button>
          <button
            onClick={save}
            disabled={!title.trim() || !date || saving}
            className="text-sm bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-lg disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal del evento ─────────────────────────────────────────────
export default function CancioneroEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event,       setEvent]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [editOpen,    setEditOpen]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [publishing,  setPublishing]  = useState(false);

  const isAdmin = (() => {
    try {
      const token = localStorage.getItem('aio_sync_token');
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Boolean(payload.isAdmin);
    } catch { return false; }
  })();

  const loadEvent = () => {
    setLoading(true);
    // Cargamos en un rango amplio y buscamos por ID
    const today = new Date();
    const pastDate = new Date(today); pastDate.setFullYear(today.getFullYear() - 2);
    const futureDate = new Date(today); futureDate.setFullYear(today.getFullYear() + 2);
    const fmt = d => d.toISOString().split('T')[0];
    fetch(`${API}/api/events?start=${fmt(pastDate)}&end=${fmt(futureDate)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        const ev = list.find(e => String(e.id) === String(id));
        setEvent(ev ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadEvent(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      await fetch(`${API}/api/events/${id}`, { method: 'DELETE', headers: authHeaders() });
      navigate('/cancionero/eventos', { replace: true });
    } catch {
      setDeleting(false);
      setConfirmDel(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1a2e] flex items-center justify-center">
        <Loader2 size={32} className="text-yellow-400 animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#0f1a2e] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-white/40">Evento no encontrado.</p>
        <button onClick={() => navigate('/cancionero/eventos')} className="text-sm text-blue-400 underline">
          Volver a eventos
        </button>
      </div>
    );
  }

  const songs = (event.songs ?? [])
    .filter(s => s.item_type !== 'separator' && s.song_id)
    .sort((a, b) => a.position - b.position);

  const songList = songs.map(s => ({ id: s.song_id, title: s.title ?? '' }));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const evDate = new Date(toDateStr(event.date) + 'T12:00:00');
  const diffDays = Math.round((evDate - today) / 86400000);
  const isPast = diffDays < 0;

  return (
    <div className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/cancionero/eventos')}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} className="text-white/70" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{event.title}</h1>
            <p className="text-xs text-white/40 capitalize">{formatDate(event.date)}</p>
          </div>
          {isAdmin && !event?.is_published && (
            <button
              onClick={async () => {
                setPublishing(true);
                try {
                  const res = await fetch(`${API}/api/events/${id}/publish`, {
                    method: 'POST',
                    headers: authHeaders(),
                  });
                  if (res.ok) {
                    const updated = await res.json();
                    setEvent(prev => ({ ...prev, ...updated }));
                  }
                } finally { setPublishing(false); }
              }}
              disabled={publishing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/35 border border-green-400/30 text-green-300 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Publicar evento"
            >
              {publishing ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Publicar
            </button>
          )}
          {event?.is_published && (
            <span className="flex items-center gap-1 text-xs font-semibold text-green-400/80 px-2">
              <Check size={12} /> Publicado
            </span>
          )}
          <button
            onClick={() => { setEditOpen(true); setConfirmDel(false); }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Editar evento"
          >
            <Pencil size={17} className="text-white/60" />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`p-1.5 rounded-lg transition-colors ${
              confirmDel
                ? 'bg-red-600/80 hover:bg-red-600'
                : 'hover:bg-white/10'
            }`}
            title={confirmDel ? 'Confirmar eliminación' : 'Eliminar evento'}
          >
            <Trash2 size={17} className={confirmDel ? 'text-white' : 'text-white/40 hover:text-red-400'} />
          </button>
        </div>
        {confirmDel && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-300 bg-red-900/30 rounded-lg px-3 py-2">
            <span>¿Eliminar este evento? Esta acción no se puede deshacer.</span>
            <button onClick={() => setConfirmDel(false)} className="ml-auto text-white/50 hover:text-white">
              <X size={13} />
            </button>
          </div>
        )}
      </header>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-2xl mx-auto w-full space-y-5">

        {/* Info del evento */}
        {isAdmin && !event?.is_published && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/25">
            <span className="text-amber-300 text-xs font-semibold">Borrador</span>
            <span className="text-xs text-amber-300/60">— Este evento no es visible para los demás miembros aún.</span>
          </div>
        )}

        <div className={`rounded-2xl border-2 p-4 space-y-2 ${
          isPast ? 'border-white/5 bg-white/[0.03]' : 'border-white/10 bg-white/5'
        }`}>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays size={15} className="text-blue-300/70" />
            <span className="text-white/70 capitalize">{formatDate(event.date)}</span>
            {!isPast && diffDays === 0 && <span className="text-yellow-400 font-semibold text-xs ml-1">— Hoy</span>}
            {!isPast && diffDays === 1 && <span className="text-green-400 font-semibold text-xs ml-1">— Mañana</span>}
            {!isPast && diffDays > 1 && <span className="text-blue-300 text-xs ml-1">— En {diffDays} días</span>}
            {isPast && <span className="text-white/30 text-xs ml-1">— Pasado</span>}
          </div>
          {event.time && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={15} className="text-white/30" />
              <span className="text-white/50">{String(event.time).slice(0, 5)}</span>
            </div>
          )}
          {event.is_recurring && (
            <div className="flex items-center gap-2 text-xs text-indigo-300/70">
              <RefreshCw size={13} />
              <span>Recurrente · {event.recurrence === 'weekly' ? 'Semanal' : event.recurrence === 'biweekly' ? 'Cada 2 semanas' : 'Mensual'}</span>
            </div>
          )}
          {event.description && (
            <p className="text-sm text-white/50 mt-1 italic">{event.description}</p>
          )}
        </div>

        {/* Lista de canciones */}
        <div>
          <p className="text-xs text-white/30 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Music2 size={12} /> {songs.length} {songs.length === 1 ? 'canción' : 'canciones'}
          </p>
          {songs.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-8">Sin canciones asignadas</p>
          ) : (
            <div className="space-y-2">
              {songs.map((s, idx) => (
                <button
                  key={s.song_id}
                  onClick={() => navigate(`/cancionero/canciones/${s.song_id}`, {
                    state: { songList, eventTitle: event.title, eventId: event.id },
                  })}
                  className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 transition-colors text-left"
                >
                  <span className="text-white/20 text-xs w-5 text-right shrink-0">{idx + 1}</span>
                  <Music2 size={14} className="text-yellow-400/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.title ?? '—'}</p>
                    {s.author && <p className="text-xs text-white/30 truncate">{s.author}</p>}
                  </div>
                  {s.song_key && (
                    <span className="text-xs font-mono text-yellow-400/60 shrink-0">{s.song_key}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <CancioneroNavbar />

      {/* Modal de edición */}
      {editOpen && (
        <EventEditModal
          event={event}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); loadEvent(); }}
        />
      )}
    </div>
  );
}

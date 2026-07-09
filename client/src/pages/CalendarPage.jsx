import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Calendar,
  Music, Trash2, X, Clock, RefreshCw, ArrowLeft, ExternalLink,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import CancioneroNavbar from './cancionero/CancioneroNavbar';

const DAYS_ES   = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const API_BASE = import.meta.env.VITE_API_URL || '';

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('aio_sync_token');
  const headers = { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(`${API_BASE}${url}`, { ...opts, headers });
}
const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const RECURRENCE_LABEL = { weekly: 'Semanal', biweekly: 'Cada 2 semanas', monthly: 'Mensual' };

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function formatAbsenceShort(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  const weekday = d.toLocaleDateString('es-CL', { weekday: 'short' }).toLowerCase().replace(/\./g, '').trim();
  const day = d.toLocaleDateString('es-CL', { day: '2-digit' });
  const month = d.toLocaleDateString('es-CL', { month: 'short' }).toLowerCase().replace(/\./g, '').trim();
  return `${weekday}-${day}-${month}`;
}
function norm(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ─── EventModal ──────────────────────────────────────────────────────────────
function EventModal({ event, defaultDate, allSongs, onClose, onSaved }) {
  const [title,       setTitle]       = useState(event?.title || '');
  const [date,        setDate]        = useState(
    event?.date ? String(event.date).split('T')[0] : defaultDate
  );
  const [time,        setTime]        = useState(event?.time ? String(event.time).slice(0, 5) : '');
  const [description, setDescription] = useState(event?.description || '');
  const [isRecurring, setIsRecurring] = useState(event?.is_recurring || false);
  const [recurrence,  setRecurrence]  = useState(event?.recurrence || 'weekly');
  const [recurEnd,    setRecurEnd]    = useState(
    event?.recur_end ? String(event.recur_end).split('T')[0] : ''
  );
  const [playlist,    setPlaylist]    = useState(event?.songs || []);
  const [songSearch,  setSongSearch]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const searchRef = useRef(null);

  const filteredSongs = songSearch
    ? allSongs.filter(s => {
        const q = norm(songSearch);
        return norm(s.title).includes(q) || norm(s.author).includes(q);
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
      const url    = event?.id ? `/api/events/${event.id}` : '/api/events';
      const method = event?.id ? 'PUT' : 'POST';
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      console.error('[EventModal] save:', e);
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
          <h2 className="font-semibold text-base">
            {event?.id ? 'Editar evento' : 'Nuevo evento'}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
          {/* Título */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Título *</label>
            <input
              autoFocus
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
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
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Hora</label>
              <input
                type="time"
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Descripción</label>
            <textarea
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors resize-none"
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
                    className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
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
                    className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
                    value={recurEnd}
                    onChange={e => setRecurEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Playlist de canciones */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
              <Music size={12} />
              <span>Lista de canciones ({playlist.length})</span>
            </div>

            {/* Buscador */}
            <div className="relative mb-2">
              <input
                ref={searchRef}
                className="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
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
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-600 transition-colors flex items-center gap-2"
                    >
                      <Music size={12} className="text-accent shrink-0" />
                      <span className="truncate flex-1">{s.title}</span>
                      {s.author && (
                        <span className="text-zinc-500 text-xs shrink-0 truncate max-w-[100px]">
                          {s.author}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {songSearch && filteredSongs.length === 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-sm text-zinc-500">
                  Sin resultados
                </div>
              )}
            </div>

            {/* Items de la playlist */}
            {playlist.length > 0 && (
              <div className="flex flex-col gap-1">
                {playlist.map((item, i) => (
                  <div
                    key={item.song_id}
                    className="flex items-center gap-2 bg-surface-700 rounded-lg px-2 py-1.5 group"
                  >
                    <span className="text-zinc-500 text-xs w-5 text-center shrink-0">{i + 1}</span>
                    <Music size={12} className="text-accent shrink-0" />
                    <span className="text-sm flex-1 truncate">{item.title}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => moveSong(i, -1)}
                        disabled={i === 0}
                        className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs leading-none"
                        title="Subir"
                      >▲</button>
                      <button
                        onClick={() => moveSong(i, 1)}
                        disabled={i === playlist.length - 1}
                        className="text-zinc-500 hover:text-white disabled:opacity-20 p-0.5 text-xs leading-none"
                        title="Bajar"
                      >▼</button>
                      <button
                        onClick={() => removeSong(item.song_id)}
                        className="text-zinc-500 hover:text-red-400 p-0.5 ml-0.5"
                        title="Quitar"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-surface-700 shrink-0">
          <button
            onClick={onClose}
            className="text-sm text-zinc-400 hover:text-white px-4 py-2 rounded-lg hover:bg-surface-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || !date || saving}
            className="text-sm bg-accent hover:bg-accent-hover text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            {saving ? 'Guardando…' : event?.id ? 'Guardar cambios' : 'Crear evento'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CalendarPage ─────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [year,         setYear]         = useState(today.getFullYear());
  const [month,        setMonth]        = useState(today.getMonth());
  const [selectedDay,  setSelectedDay]  = useState(today.getDate());
  const [events,       setEvents]       = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [allSongs,     setAllSongs]     = useState([]);
  const [showModal,    setShowModal]    = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  // Cargar canciones una vez
  useEffect(() => {
    fetch('/api/songs')
      .then(r => r.json())
      .then(setAllSongs)
      .catch(console.error);
  }, []);

  // Cargar eventos y ausencias del mes actual
  const loadEvents = () => {
    const start = `${year}-${pad(month + 1)}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
    Promise.all([
      authFetch(`/api/events?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
      authFetch(`/api/blocked-dates?start=${start}&end=${end}`).then(r => r.json()).catch(() => []),
    ])
      .then(([eventsData, blockedData]) => {
        setEvents(Array.isArray(eventsData) ? eventsData : []);
        setBlockedDates(Array.isArray(blockedData) ? blockedData : []);
      })
      .catch(console.error);
  };

  useEffect(() => { loadEvents(); }, [year, month]); // eslint-disable-line

  // Grilla del calendario
  // getDay(): 0=Dom,1=Lun,...,6=Sáb → para lunes primero: (dow + 6) % 7
  const firstDow   = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Eventos indexados por fecha
  const eventsByDate = {};
  for (const ev of events) {
    const k = String(ev.date).split('T')[0];
    if (!eventsByDate[k]) eventsByDate[k] = [];
    eventsByDate[k].push(ev);
  }

  const blockedByDate = {};
  for (const blk of blockedDates) {
    const k = String(blk.date).slice(0, 10);
    if (!blockedByDate[k]) blockedByDate[k] = [];
    blockedByDate[k].push(blk);
  }

  const blockedByUser = blockedDates.reduce((acc, blk) => {
    const name = String(blk.display_name || '').trim() || `Integrante ${blk.user_id || ''}`.trim();
    if (!acc[name]) acc[name] = [];
    acc[name].push(blk);
    return acc;
  }, {});

  const blockedUsersList = Object.entries(blockedByUser)
    .map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => String(a.date).slice(0, 10).localeCompare(String(b.date).slice(0, 10))),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const todayKey   = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const selKey     = selectedDay ? dateKey(year, month, selectedDay) : null;
  const selEvents  = selKey ? (eventsByDate[selKey] || []) : [];

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  const openNew = () => {
    setEditingEvent(null);
    setShowModal(true);
  };
  const openEdit = async (ev) => {
    // Re-fetch para obtener songs completas si no están cargadas
    if (!ev.songs) {
      const full = await authFetch(`/api/events/${ev.id}`).then(r => r.json());
      setEditingEvent(full);
    } else {
      setEditingEvent(ev);
    }
    setShowModal(true);
  };
  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este evento?')) return;
    await authFetch(`/api/events/${id}`, { method: 'DELETE' });
    loadEvents();
  };

  const openEventDetail = (ev) => {
    if (!ev?.id) return;
    const occurrenceDate = String(ev.occurrence_date ?? ev.date ?? '').slice(0, 10) || null;
    navigate(`/cancionero/eventos/${ev.id}`, {
      state: { occurrence_date: occurrenceDate },
    });
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-surface-900 text-white overflow-hidden">
    <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
      {/* ── Columna izquierda: Calendario ── */}
      <div className="flex flex-col flex-1 min-w-0 p-2 xs:p-3 sm:p-4 md:p-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 sm:mb-4 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft size={16} />
              <span className="hidden xs:inline">Volver</span>
            </Link>
            <div className="w-px h-5 bg-surface-600" />
            <Calendar size={16} className="text-accent" />
            <h1 className="font-bold text-sm sm:text-base">Calendario</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={goToday}
              className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-lg hover:bg-surface-700 transition-colors hidden xs:block"
            >
              Hoy
            </button>
            <button onClick={prevMonth} className="p-1 sm:p-1.5 rounded-lg hover:bg-surface-700 transition-colors">
              <ChevronLeft size={15} />
            </button>
            <span className="font-semibold text-xs sm:text-sm w-28 sm:w-40 text-center select-none">
              {MONTHS_ES[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1 sm:p-1.5 rounded-lg hover:bg-surface-700 transition-colors">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Cabeceras días */}
        <div className="grid grid-cols-7 mb-0.5 sm:mb-1 shrink-0">
          {DAYS_ES.map(d => (
            <div key={d} className="text-center text-[10px] sm:text-xs text-zinc-500 font-medium py-0.5 sm:py-1">{d}</div>
          ))}
        </div>

        {/* Grilla */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 flex-1 overflow-hidden content-start">
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} />;
            const k         = dateKey(year, month, day);
            const isToday   = k === todayKey;
            const isSelected = day === selectedDay;
            const dayEvts   = eventsByDate[k] || [];
            const dayBlocked = blockedByDate[k] || [];

            return (
              <button
                key={k}
                onClick={() => setSelectedDay(day)}
                className={[
                  'relative flex flex-col items-start p-1 xs:p-1.5 rounded-lg xs:rounded-xl border transition-all text-left',
                  'min-h-[44px] xs:min-h-[56px] sm:min-h-[68px] overflow-hidden',
                  isSelected
                    ? 'bg-accent/15 border-accent'
                    : 'border-transparent hover:bg-surface-800 hover:border-surface-600',
                  isToday && !isSelected ? 'ring-1 ring-accent/40' : '',
                ].join(' ')}
              >
                <span className={[
                  'text-xs font-bold mb-0.5 w-5 h-5 flex items-center justify-center rounded-full shrink-0',
                  isToday ? 'bg-accent text-white' : isSelected ? 'text-accent' : 'text-zinc-300',
                ].join(' ')}>
                  {day}
                </span>
                <div className="flex flex-col gap-px w-full overflow-hidden">
                  {dayEvts.slice(0, 2).map(ev => (
                    <button
                      key={ev.id || ev.date + ev.title}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEventDetail(ev);
                      }}
                      className="text-[10px] truncate bg-accent/25 text-accent-light px-1 py-px rounded text-left hover:bg-accent/35 transition-colors"
                      title="Abrir detalle del evento"
                    >
                      {ev.time ? ev.time.slice(0, 5) + ' ' : ''}{ev.title}
                    </button>
                  ))}
                  {dayEvts.length > 2 && (
                    <span className="text-[10px] text-zinc-500">+{dayEvts.length - 2}</span>
                  )}

                  {dayBlocked.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {dayBlocked.slice(0, 4).map((blk, idx) => (
                        <span
                          key={`${blk.id || blk.user_id || 'b'}-${idx}`}
                          className="w-1.5 h-1.5 rounded-full bg-rose-400"
                          title={`${blk.display_name || 'Integrante'} ausente`}
                        />
                      ))}
                      {dayBlocked.length > 4 && (
                        <span className="text-[9px] text-rose-300">+{dayBlocked.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Listado general de ausencias por usuario */}
        <div className="mt-2 sm:mt-3 rounded-xl border border-surface-700 bg-surface-800/70 p-2 sm:p-3 overflow-y-auto max-h-[28vh]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs sm:text-sm font-semibold text-white/85">Ausencias del mes</h2>
            <span className="text-[10px] sm:text-xs text-zinc-400">{blockedDates.length} en total</span>
          </div>

          {blockedUsersList.length === 0 ? (
            <p className="text-xs text-zinc-500">No hay ausencias registradas este mes.</p>
          ) : (
            <div className="space-y-2">
              {blockedUsersList.map(userGroup => (
                <div key={userGroup.name} className="rounded-lg border border-surface-700 bg-surface-700/50 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs sm:text-sm font-semibold text-white">{userGroup.name}</p>
                    <span className="text-[10px] text-zinc-400">{userGroup.items.length} ausencia{userGroup.items.length === 1 ? '' : 's'}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {userGroup.items.map(item => {
                      const label = formatAbsenceShort(item.date);
                      return (
                        <span
                          key={item.id || `${item.user_id}-${item.date}`}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-300/30 bg-rose-500/10 text-rose-200 px-2 py-0.5 text-[10px] sm:text-xs"
                          title={item.reason || ''}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-300" />
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Columna derecha / panel inferior: Panel del día ── */}
      {/* Móvil: panel horizontal bajo el calendario; Desktop: sidebar derecho */}
      <div className={[
        'bg-surface-800 border-surface-700 flex flex-col shrink-0',
        'md:w-72 xl:w-80 md:border-l',
        // En móvil, solo se muestra si hay día seleccionado (como cajón inferior)
        selectedDay
          ? 'h-[40vh] xs:h-[44vh] sm:h-[48vh] md:h-auto border-t md:border-t-0'
          : 'hidden md:flex',
      ].join(' ')}>
        {selectedDay ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
              <span className="font-semibold text-sm">
                {selectedDay} de {MONTHS_ES[month]} {year}
              </span>
              <button
                onClick={openNew}
                className="flex items-center gap-1 text-xs bg-accent hover:bg-accent-hover text-white px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={13} /> Nuevo
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {selEvents.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 mt-10 text-zinc-600">
                  <Calendar size={28} />
                  <p className="text-sm">Sin eventos para este día</p>
                  <button
                    onClick={openNew}
                    className="text-xs text-accent hover:text-accent-light underline mt-1"
                  >
                    + Crear evento
                  </button>
                </div>
              )}

              {selEvents.map(ev => (
                <div
                  key={(ev.id || ev.title) + ev.date}
                  className="bg-surface-700 rounded-xl p-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{ev.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {ev.time && (
                          <span className="flex items-center gap-1 text-xs text-zinc-400">
                            <Clock size={10} />
                            {String(ev.time).slice(0, 5)}
                          </span>
                        )}
                        {ev.is_recurring && (
                          <span className="flex items-center gap-1 text-xs text-purple-400">
                            <RefreshCw size={10} />
                            {RECURRENCE_LABEL[ev.recurrence] || ev.recurrence}
                          </span>
                        )}
                      </div>
                      {ev.description && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{ev.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEventDetail(ev)}
                        className="text-zinc-400 hover:text-cyan-300 p-1 rounded hover:bg-surface-600 transition-colors"
                        title="Abrir en detalle de evento"
                      >
                        <ExternalLink size={13} />
                      </button>
                      <button
                        onClick={() => openEdit(ev)}
                        className="text-zinc-400 hover:text-white p-1 rounded hover:bg-surface-600 transition-colors"
                        title="Editar"
                      >
                        <span className="text-xs">✏️</span>
                      </button>
                      <button
                        onClick={() => handleDelete(ev.id)}
                        className="text-zinc-400 hover:text-red-400 p-1 rounded hover:bg-surface-600 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {ev.songs?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-surface-600 flex flex-col gap-1">
                      {ev.songs.map(s => (
                        <div key={s.song_id} className="flex items-center gap-1.5 text-xs text-zinc-300">
                          <Music size={10} className="text-accent shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-600 px-4">
            <Calendar size={32} />
            <p className="text-sm text-center">Selecciona un día del calendario</p>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <EventModal
          event={editingEvent}
          defaultDate={selKey || ''}
          allSongs={allSongs}
          onClose={() => { setShowModal(false); setEditingEvent(null); }}
          onSaved={() => { setShowModal(false); setEditingEvent(null); loadEvents(); }}
        />
      )}
    </div>{/* end inner flex-row */}
    <CancioneroNavbar />
    </div>
  );
}

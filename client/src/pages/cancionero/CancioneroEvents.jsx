import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Music2, ChevronDown, ChevronUp, Loader2, History, AlertTriangle } from 'lucide-react';
import CancioneroNavbar from './CancioneroNavbar';
import useVolumeKeys from '../../hooks/useVolumeKeys';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}
function pad2(n) { return String(n).padStart(2, '0'); }
function toLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayStr() { return toLocalDateStr(new Date()); }
function futureStr(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}
function pastStr(days) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return toLocalDateStr(d);
}
function toDateStr(d) { return String(d).slice(0, 10); }
function formatDate(dateStr) {
  const d = new Date(toDateStr(dateStr) + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(toDateStr(dateStr) + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return { label: 'Hoy', color: 'text-yellow-400' };
  if (diff === 1) return { label: 'Mañana', color: 'text-green-400' };
  return { label: `En ${diff} días`, color: 'text-blue-300' };
}
function daysAgo(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(toDateStr(dateStr) + 'T00:00:00');
  const diff = Math.round((today - target) / 86400000);
  if (diff === 1) return 'Ayer';
  return `Hace ${diff} días`;
}

export default function CancioneroEvents() {
  const navigate  = useNavigate();
  const scrollRef = useRef(null);
  useVolumeKeys(
    () => scrollRef.current?.scrollBy({ top: -150, behavior: 'smooth' }),
    () => scrollRef.current?.scrollBy({ top:  150, behavior: 'smooth' }),
  );
  const [events,      setEvents]      = useState([]);
  const [pastEvents,  setPastEvents]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState({});
  const [pastOpen,    setPastOpen]    = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState('');
  const [newEv, setNewEv] = useState({
    title: '',
    date: todayStr(),
    time: '',
    description: '',
    is_recurring: false,
    recurrence: 'weekly',
    recur_end: '',
  });
  const [bandConfigs,     setBandConfigs]     = useState([]);
  const [myBlockedDates,  setMyBlockedDates]  = useState([]); // YYYY-MM-DD[]

  const isAdmin = (() => {
    try {
      const token = localStorage.getItem('aio_sync_token');
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Boolean(payload.isAdmin);
    } catch { return false; }
  })();

  const myUserId = (() => {
    try {
      const token = localStorage.getItem('aio_sync_token');
      if (!token) return null;
      return Number(JSON.parse(atob(token.split('.')[1])).userId);
    } catch { return null; }
  })();

  useEffect(() => {
    // Cargar próximos, pasados, band-configs y fechas bloqueadas en paralelo
    Promise.all([
      fetch(`${API}/api/events?start=${todayStr()}&end=${futureStr(90)}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/api/events?start=${pastStr(180)}&end=${pastStr(1)}`,  { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/api/band-configs`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
      fetch(`${API}/api/blocked-dates?start=${todayStr()}&end=${futureStr(90)}`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
    ]).then(([upcoming, past, configs, blocked]) => {
      const upList   = Array.isArray(upcoming) ? upcoming : [];
      const pastList = Array.isArray(past)     ? past     : [];
      const evSortKey = ev => (ev.occurrence_date ? String(ev.occurrence_date) : String(ev.date)).slice(0, 10);
      upList.sort((a, b) => evSortKey(a).localeCompare(evSortKey(b)));
      pastList.sort((a, b) => evSortKey(b).localeCompare(evSortKey(a)));
      // No-admins solo ven eventos publicados
      const visibleUp   = isAdmin ? upList   : upList.filter(e => e.is_published);
      const visiblePast = isAdmin ? pastList : pastList.filter(e => e.is_published);
      setEvents(visibleUp);
      setPastEvents(visiblePast);
      setBandConfigs(Array.isArray(configs) ? configs : []);
      if (myUserId) {
        const blockedArr = Array.isArray(blocked) ? blocked : [];
        setMyBlockedDates(blockedArr.filter(b => Number(b.user_id) === myUserId).map(b => b.date?.slice(0, 10)));
      }
      if (visibleUp.length > 0) {
        const firstDate = toDateStr(visibleUp[0].occurrence_date ?? visibleUp[0].date);
        setExpanded({ [`${visibleUp[0].id}-${firstDate}`]: true });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const createEvent = async () => {
    if (!newEv.title.trim() || !newEv.date) {
      setCreateError('Título y fecha son obligatorios');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch(`${API}/api/events`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEv.title.trim(),
          date: newEv.date,
          time: newEv.time || null,
          description: newEv.description.trim() || null,
          is_recurring: !!newEv.is_recurring,
          recurrence: newEv.is_recurring ? newEv.recurrence : null,
          recur_end: newEv.is_recurring && newEv.recur_end ? newEv.recur_end : null,
          songs: [],
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'No se pudo crear el evento');
      }
      setShowCreate(false);
      setNewEv({
        title: '',
        date: todayStr(),
        time: '',
        description: '',
        is_recurring: false,
        recurrence: 'weekly',
        recur_end: '',
      });
      setLoading(true);
      const [upcoming, past] = await Promise.all([
        fetch(`${API}/api/events?start=${todayStr()}&end=${futureStr(90)}`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API}/api/events?start=${pastStr(180)}&end=${pastStr(1)}`, { headers: authHeaders() }).then(r => r.json()),
      ]);
      const upList = Array.isArray(upcoming) ? upcoming : [];
      const pastList = Array.isArray(past) ? past : [];
      const evSortKey = ev => (ev.occurrence_date ? String(ev.occurrence_date) : String(ev.date)).slice(0, 10);
      upList.sort((a, b) => evSortKey(a).localeCompare(evSortKey(b)));
      pastList.sort((a, b) => evSortKey(b).localeCompare(evSortKey(a)));
      setEvents(isAdmin ? upList : upList.filter(e => e.is_published));
      setPastEvents(isAdmin ? pastList : pastList.filter(e => e.is_published));
    } catch (e) {
      setCreateError(e?.message || 'Error al crear evento');
    } finally {
      setCreating(false);
      setLoading(false);
    }
  };

  // Renderiza una tarjeta de evento (próximo o pasado)
  const renderEvent = (ev, isPast = false) => {
    const evDate = toDateStr(ev.occurrence_date ?? ev.date);
    const key = `${ev.id}-${evDate}`;
    const isOpen = !!expanded[key];
    const songs = (ev.songs ?? []).filter(s => s.item_type !== 'separator' && s.song_id);
    const items = (ev.songs ?? []).sort((a, b) => a.position - b.position);

    // Detectar conflicto: asignado en banda + fecha bloqueada
    const isBlocked = myBlockedDates.includes(evDate);
    const cfg = ev.band_config_id ? bandConfigs.find(c => c.id === Number(ev.band_config_id)) : null;
    const mySlot = cfg ? (cfg.slots || []).find(s => Number(s.userId) === myUserId) : null;
    const hasConflict = !isPast && isBlocked && !!mySlot?.instrument;

    let badge, color;
    if (isPast) {
      badge = daysAgo(evDate);
      color = 'text-white/40';
    } else {
      const d = daysUntil(evDate);
      badge = d.label;
      color = d.color;
    }
    const isToday = badge === 'Hoy';

    return (
      <div
        key={key}
        className={`rounded-2xl border-2 overflow-hidden transition-all ${
          hasConflict
            ? 'border-red-500/60 bg-red-500/10 animate-pulse'
            : isPast
              ? 'border-white/5 bg-white/[0.03] opacity-80'
              : isToday
                ? 'border-yellow-400/30 bg-yellow-500/5'
                : 'border-white/10 bg-white/5'
        }`}
      >
        <button
          onClick={() => toggle(key)}
          className="w-full flex items-start gap-4 p-4 text-left"
        >
          {/* Date badge */}
          <div className={`flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border ${
            hasConflict
              ? 'bg-red-500/20 border-red-400/40'
              : isPast
                ? 'bg-white/5 border-white/10'
                : isToday
                  ? 'bg-yellow-500/20 border-yellow-400/30'
                  : 'bg-blue-500/10 border-blue-400/20'
          }`}>
            <span className={`text-[10px] font-bold uppercase ${
              hasConflict ? 'text-red-300' : isPast ? 'text-white/30' : isToday ? 'text-yellow-300' : 'text-blue-300'
            }`}>
              {new Date(evDate + 'T12:00:00').toLocaleDateString('es', { month: 'short' })}
            </span>
            <span className={`text-xl font-extrabold leading-none ${
              hasConflict ? 'text-red-200' : isPast ? 'text-white/50' : isToday ? 'text-yellow-200' : 'text-white'
            }`}>
              {new Date(evDate + 'T12:00:00').getDate()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-bold text-sm ${
                hasConflict ? 'text-red-200' : isPast ? 'text-white/60' : 'text-white'
              }`}>{ev.title}</p>
              {hasConflict && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/25 border border-red-400/40 text-red-300 uppercase tracking-wide">
                  <AlertTriangle size={9} /> Conflicto
                </span>
              )}
              {isAdmin && !ev.is_published && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/30 text-amber-300">
                  Borrador
                </span>
              )}
              {/* Botón ir al dashboard del evento */}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); navigate(`/cancionero/eventos/${ev.id}`, { state: { occurrence_date: ev.occurrence_date ?? null } }); }}
                className={`shrink-0 text-[10px] border px-1.5 py-0.5 rounded transition-colors ${
                  hasConflict
                    ? 'border-red-400/40 text-red-300/60 hover:text-red-200 hover:border-red-400/70'
                    : 'border-white/10 hover:border-blue-400/40 text-white/25 hover:text-blue-300'
                }`}
                title="Ver dashboard del evento"
              >
                Ver →
              </button>
            </div>
            <p className={`text-xs mt-0.5 capitalize ${
              hasConflict ? 'text-red-300/60' : 'text-white/40'
            }`}>{formatDate(evDate)}</p>
            {hasConflict && (
              <p className="text-[11px] text-red-300/80 mt-1 font-semibold">
                ⚠ Estás bloqueado · asignado como {mySlot.instrument}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className={`font-semibold ${hasConflict ? 'text-red-400' : color}`}>{badge}</span>
              {ev.time && (
                <><span className="text-white/20">·</span>
                <Clock size={11} className="text-white/30" />
                <span className="text-white/40">{ev.time.slice(0, 5)}</span></>
              )}
              {songs.length > 0 && (
                <><span className="text-white/20">·</span>
                <Music2 size={11} className="text-white/30" />
                <span className="text-white/40">{songs.length} canciones</span></>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 self-center text-white/30">
            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {isOpen && items.length > 0 && (
          <div className="border-t border-white/10 px-4 pb-3 pt-2">
            {ev.description && (
              <p className="text-xs text-white/40 mb-3 italic">{ev.description}</p>
            )}
            <ul className="space-y-1">
              {items.map((item, idx) => {
                if (item.item_type === 'separator') {
                  return (
                    <li key={item.id ?? idx} className="pt-2 pb-0.5">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: item.separator_color ?? '#94a3b8' }}
                      >
                        {item.separator_label ?? '─'}
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.id ?? idx}>
                    <button
                      onClick={() => {
                        if (!item.song_id) return;
                        // Pasar la lista de canciones del evento para navegación prev/next
                        const songList = items
                          .filter(i => i.item_type !== 'separator' && i.song_id)
                          .map(i => ({ id: i.song_id, title: i.title ?? '' }));
                        navigate(`/cancionero/canciones/${item.song_id}`, {
                          state: { songList, eventTitle: ev.title, eventId: ev.id },
                        });
                      }}
                      className="group w-full flex items-center gap-2.5 py-1.5 text-left hover:bg-white/5 rounded-lg px-2 -mx-2 transition-colors"
                    >
                      <Music2 size={13} className="text-yellow-400/60 flex-shrink-0" />
                      <span className="flex-1 text-sm text-white/80 truncate">{item.title ?? '—'}</span>
                      {item.author && <span className="text-xs text-white/30 truncate max-w-[100px]">{item.author}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isOpen && items.length === 0 && (
          <div className="border-t border-white/10 px-4 py-3">
            <p className="text-xs text-white/30 text-center">Sin canciones asignadas</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/cancionero')} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} className="text-white/70" />
        </button>
        <h1 className="text-base font-bold flex-1">Eventos</h1>
        <span className="text-xs text-white/30">{events.length} próximos</span>
        {isAdmin && (
          <button
            onClick={() => { setCreateError(''); setShowCreate(true); }}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-yellow-500/15 border border-yellow-400/30 text-yellow-300 hover:bg-yellow-500/25 transition-colors"
          >
            + Nuevo
          </button>
        )}
      </header>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="text-yellow-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Eventos pasados (arriba, colapsable, cerrado por defecto) ── */}
            <div>
              <button
                onClick={() => setPastOpen(v => !v)}
                className="w-full flex items-center gap-2 py-2 text-left group"
              >
                <History size={15} className="text-white/30 group-hover:text-white/50 transition-colors" />
                <span className="text-xs font-semibold text-white/30 group-hover:text-white/50 transition-colors uppercase tracking-wider">
                  Eventos pasados
                </span>
                <span className="text-xs text-white/20 ml-1">({pastEvents.length})</span>
                <div className="flex-1" />
                {pastOpen
                  ? <ChevronUp size={15} className="text-white/30" />
                  : <ChevronDown size={15} className="text-white/30" />}
              </button>

              {pastOpen && (
                <div className="space-y-3 mt-2">
                  {pastEvents.length > 0
                    ? pastEvents.map(ev => renderEvent(ev, true))
                    : (
                      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/40 text-center">
                        Sin eventos pasados
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* ── Eventos futuros (abajo, siempre visibles, ascendente) ── */}
            <div className="mt-6">
              <div className="w-full flex items-center gap-2 py-2 text-left">
                <CalendarDays size={15} className="text-white/30" />
                <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Eventos futuros</span>
                <span className="text-xs text-white/20 ml-1">({events.length})</span>
              </div>

              {events.length > 0 ? (
                <div className="space-y-3 mt-2">
                  {events.map(ev => renderEvent(ev, false))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/40 text-center">
                  Sin eventos futuros
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal crear evento */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => !creating && setShowCreate(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f1a2e] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Nuevo evento</h2>
              <button
                onClick={() => !creating && setShowCreate(false)}
                className="text-xs text-white/50 hover:text-white transition-colors"
              >Cerrar</button>
            </div>
            <div className="p-4 space-y-3">
              {createError && (
                <div className="text-xs text-red-300 bg-red-500/15 border border-red-400/25 rounded-lg px-2.5 py-2">
                  {createError}
                </div>
              )}

              <div>
                <label className="text-xs text-white/50 mb-1 block">Título *</label>
                <input
                  autoFocus
                  value={newEv.title}
                  onChange={e => setNewEv(v => ({ ...v, title: e.target.value }))}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400/40"
                  placeholder="Ej: Culto dominical"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Fecha *</label>
                  <input
                    type="date"
                    value={newEv.date}
                    onChange={e => setNewEv(v => ({ ...v, date: e.target.value }))}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1 block">Hora</label>
                  <input
                    type="time"
                    value={newEv.time}
                    onChange={e => setNewEv(v => ({ ...v, time: e.target.value }))}
                    className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400/40"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-white/50 mb-1 block">Descripción</label>
                <textarea
                  rows={2}
                  value={newEv.description}
                  onChange={e => setNewEv(v => ({ ...v, description: e.target.value }))}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400/40 resize-none"
                  placeholder="Opcional"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newEv.is_recurring}
                  onChange={e => setNewEv(v => ({ ...v, is_recurring: e.target.checked }))}
                  className="w-4 h-4 accent-yellow-500"
                />
                Evento recurrente
              </label>

              {newEv.is_recurring && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Frecuencia</label>
                    <select
                      value={newEv.recurrence}
                      onChange={e => setNewEv(v => ({ ...v, recurrence: e.target.value }))}
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400/40"
                    >
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Cada 2 semanas</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/50 mb-1 block">Hasta (opcional)</label>
                    <input
                      type="date"
                      value={newEv.recur_end}
                      onChange={e => setNewEv(v => ({ ...v, recur_end: e.target.value }))}
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400/40"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex justify-end gap-2">
              <button
                onClick={() => !creating && setShowCreate(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-white/15 text-white/70 hover:bg-white/5 transition-colors"
              >Cancelar</button>
              <button
                onClick={createEvent}
                disabled={creating || !newEv.title.trim() || !newEv.date}
                className="px-3 py-1.5 text-xs rounded-lg bg-yellow-500/80 hover:bg-yellow-500 text-black font-semibold disabled:opacity-50 transition-colors"
              >{creating ? 'Creando…' : 'Crear evento'}</button>
            </div>
          </div>
        </div>
      )}
      <CancioneroNavbar />
    </div>
  );
}

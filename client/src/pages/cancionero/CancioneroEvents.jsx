import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Music2, ChevronDown, ChevronUp, Loader2, History } from 'lucide-react';
import CancioneroNavbar from './CancioneroNavbar';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function futureStr(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function pastStr(days) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
function toDateStr(d) { return String(d).slice(0, 10); }
function formatDate(dateStr) {
  const d = new Date(toDateStr(dateStr) + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((new Date(toDateStr(dateStr) + 'T12:00:00') - today) / 86400000);
  if (diff === 0) return { label: 'Hoy', color: 'text-yellow-400' };
  if (diff === 1) return { label: 'Mañana', color: 'text-green-400' };
  return { label: `En ${diff} días`, color: 'text-blue-300' };
}
function daysAgo(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((today - new Date(toDateStr(dateStr) + 'T12:00:00')) / 86400000);
  if (diff === 1) return 'Ayer';
  return `Hace ${diff} días`;
}

export default function CancioneroEvents() {
  const navigate = useNavigate();
  const [events,      setEvents]      = useState([]);
  const [pastEvents,  setPastEvents]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState({});
  const [pastOpen,    setPastOpen]    = useState(false);

  const isAdmin = (() => {
    try {
      const token = localStorage.getItem('aio_sync_token');
      if (!token) return false;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Boolean(payload.isAdmin);
    } catch { return false; }
  })();

  useEffect(() => {
    // Cargar próximos y pasados en paralelo
    Promise.all([
      fetch(`${API}/api/events?start=${todayStr()}&end=${futureStr(90)}`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/api/events?start=${pastStr(180)}&end=${pastStr(1)}`,  { headers: authHeaders() }).then(r => r.json()),
    ]).then(([upcoming, past]) => {
      const upList   = Array.isArray(upcoming) ? upcoming : [];
      const pastList = Array.isArray(past)     ? past     : [];
      upList.sort((a, b) => a.date.localeCompare(b.date));
      pastList.sort((a, b) => b.date.localeCompare(a.date));
      // No-admins solo ven eventos publicados
      const visibleUp   = isAdmin ? upList   : upList.filter(e => e.is_published);
      const visiblePast = isAdmin ? pastList : pastList.filter(e => e.is_published);
      setEvents(visibleUp);
      setPastEvents(visiblePast);
      if (visibleUp.length > 0) {
        setExpanded({ [`${visibleUp[0].id}-${visibleUp[0].date}`]: true });
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  // Renderiza una tarjeta de evento (próximo o pasado)
  const renderEvent = (ev, isPast = false) => {
    const key = `${ev.id}-${ev.date}`;
    const isOpen = !!expanded[key];
    const songs = (ev.songs ?? []).filter(s => s.item_type !== 'separator' && s.song_id);
    const items = (ev.songs ?? []).sort((a, b) => a.position - b.position);

    let badge, color;
    if (isPast) {
      badge = daysAgo(ev.date);
      color = 'text-white/40';
    } else {
      const d = daysUntil(ev.date);
      badge = d.label;
      color = d.color;
    }
    const isToday = badge === 'Hoy';

    return (
      <div
        key={key}
        className={`rounded-2xl border-2 overflow-hidden transition-all ${
          isPast
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
            isPast
              ? 'bg-white/5 border-white/10'
              : isToday
                ? 'bg-yellow-500/20 border-yellow-400/30'
                : 'bg-blue-500/10 border-blue-400/20'
          }`}>
            <span className={`text-[10px] font-bold uppercase ${
              isPast ? 'text-white/30' : isToday ? 'text-yellow-300' : 'text-blue-300'
            }`}>
              {new Date(toDateStr(ev.date) + 'T12:00:00').toLocaleDateString('es', { month: 'short' })}
            </span>
            <span className={`text-xl font-extrabold leading-none ${
              isPast ? 'text-white/50' : isToday ? 'text-yellow-200' : 'text-white'
            }`}>
              {new Date(toDateStr(ev.date) + 'T12:00:00').getDate()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={`font-bold text-sm ${isPast ? 'text-white/60' : 'text-white'}`}>{ev.title}</p>
              {isAdmin && !ev.is_published && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/30 text-amber-300">
                  Borrador
                </span>
              )}
              {/* Botón ir al dashboard del evento */}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); navigate(`/cancionero/eventos/${ev.id}`); }}
                className="shrink-0 text-[10px] border border-white/10 hover:border-blue-400/40 text-white/25 hover:text-blue-300 px-1.5 py-0.5 rounded transition-colors"
                title="Ver dashboard del evento"
              >
                Ver →
              </button>
            </div>
            <p className="text-xs text-white/40 mt-0.5 capitalize">{formatDate(ev.date)}</p>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className={`font-semibold ${color}`}>{badge}</span>
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
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="text-yellow-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Próximos eventos ─────────────────────────────────── */}
            {events.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-white/30">
                <CalendarDays size={40} />
                <p className="text-sm">No hay eventos programados</p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.map(ev => renderEvent(ev, false))}
              </div>
            )}

            {/* ── Eventos pasados ──────────────────────────────────── */}
            {pastEvents.length > 0 && (
              <div className="mt-8">
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
                  <div className="space-y-3 mt-3">
                    {pastEvents.map(ev => renderEvent(ev, true))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <CancioneroNavbar />
    </div>
  );
}

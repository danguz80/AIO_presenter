import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock, Music2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function futureStr(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
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

export default function CancioneroEvents() {
  const navigate = useNavigate();
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({}); // { [id-date]: bool }

  useEffect(() => {
    fetch(`${API}/api/events?start=${todayStr()}&end=${futureStr(90)}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        // Ordenar por fecha
        list.sort((a, b) => a.date.localeCompare(b.date));
        setEvents(list);
        // Expandir el primero por defecto
        if (list.length > 0) {
          setExpanded({ [`${list[0].id}-${list[0].date}`]: true });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="min-h-screen bg-[#0f1a2e] text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/cancionero')} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} className="text-white/70" />
        </button>
        <h1 className="text-base font-bold flex-1">Próximos eventos</h1>
        <span className="text-xs text-white/30">{events.length} eventos</span>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="text-yellow-400 animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-white/30">
            <CalendarDays size={40} />
            <p className="text-sm">No hay eventos programados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(ev => {
              const key = `${ev.id}-${ev.date}`;
              const isOpen = !!expanded[key];
              const { label, color } = daysUntil(ev.date);
              const songs = (ev.songs ?? []).filter(s => s.item_type !== 'separator' && s.song_id);
              const separators = (ev.songs ?? []).filter(s => s.item_type === 'separator');
              const isToday = label === 'Hoy';

              // Construir lista de items para mostrar (separators como headers)
              const items = (ev.songs ?? []).sort((a, b) => a.position - b.position);

              return (
                <div
                  key={key}
                  className={`rounded-2xl border-2 overflow-hidden transition-all ${
                    isToday ? 'border-yellow-400/30 bg-yellow-500/5' : 'border-white/10 bg-white/5'
                  }`}
                >
                  {/* Evento header */}
                  <button
                    onClick={() => toggle(key)}
                    className="w-full flex items-start gap-4 p-4 text-left"
                  >
                    {/* Date badge */}
                    <div className={`flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border ${
                      isToday ? 'bg-yellow-500/20 border-yellow-400/30' : 'bg-blue-500/10 border-blue-400/20'
                    }`}>
                      <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-yellow-300' : 'text-blue-300'}`}>
                        {new Date(toDateStr(ev.date) + 'T12:00:00').toLocaleDateString('es', { month: 'short' })}
                      </span>
                      <span className={`text-xl font-extrabold leading-none ${isToday ? 'text-yellow-200' : 'text-white'}`}>
                        {new Date(ev.date + 'T00:00:00').getDate()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm">{ev.title}</p>
                      <p className="text-xs text-white/40 mt-0.5 capitalize">
                        {formatDate(ev.date)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <span className={`font-semibold ${color}`}>{label}</span>
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

                  {/* Lista de canciones expandible */}
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
                                onClick={() => item.song_id && navigate(`/cancionero/canciones/${item.song_id}`)}
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}

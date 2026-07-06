import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Music2, CalendarDays, Settings2, Bell,
  LogOut, ChevronRight, Loader2, Building2, Clock, Monitor, X, Check, Users, AlertTriangle,
} from 'lucide-react';
import { io as socketIo } from 'socket.io-client';
import CancioneroNavbar from './CancioneroNavbar';
import DemoPackBanner from '../../components/shared/DemoPackBanner';
import useVolumeKeys from '../../hooks/useVolumeKeys';

const API = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  const token = localStorage.getItem('aio_sync_token');
  return { Authorization: `Bearer ${token}` };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStr() {
  return toLocalDateStr(new Date());
}
function futureStr(days = 60) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}
function toDateStr(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
function formatDate(dateStr) {
  const d = new Date(toDateStr(dateStr) + 'T12:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function formatTime(timeStr) {
  if (!timeStr) return null;
  return timeStr.slice(0, 5);
}
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(toDateStr(dateStr) + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return `En ${diff} días`;
}

const NAV_ITEMS = [
  { id: 'canciones',      icon: Music2,       label: 'Canciones',      route: '/cancionero/canciones',      color: 'yellow' },
  { id: 'eventos',        icon: CalendarDays, label: 'Eventos',        route: '/cancionero/eventos',        color: 'blue'   },
  { id: 'configuracion',  icon: Settings2,    label: 'Configuración',  route: '/cancionero/configuracion',  color: 'slate2' },
  { id: 'notificaciones', icon: Bell,         label: 'Notificaciones', route: 'notif-panel',                color: 'orange' },
];

const COLOR_MAP = {
  yellow:  { card: 'border-yellow-500/30 bg-yellow-500/10 hover:border-yellow-400/60 hover:bg-yellow-500/20', icon: 'bg-yellow-500/20 border-yellow-400/30', text: 'text-yellow-300', badge: '' },
  blue:    { card: 'border-blue-500/30 bg-blue-500/10 hover:border-blue-400/60 hover:bg-blue-500/20',         icon: 'bg-blue-500/20 border-blue-400/30',     text: 'text-blue-300',   badge: '' },
  slate2:  { card: 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',                     icon: 'bg-white/10 border-white/10',           text: 'text-white/60',   badge: '' },
  orange:  { card: 'border-orange-500/30 bg-orange-500/10 hover:border-orange-400/60 hover:bg-orange-500/20', icon: 'bg-orange-500/20 border-orange-400/30', text: 'text-orange-300', badge: '' },
};

function getIsAdmin() {
  try {
    const token = localStorage.getItem('aio_sync_token');
    if (!token) return false;
    return Boolean(JSON.parse(atob(token.split('.')[1])).isAdmin);
  } catch { return false; }
}

export default function CancioneroDashboard() {
  const navigate  = useNavigate();
  const scrollRef = useRef(null);
  useVolumeKeys(
    () => scrollRef.current?.scrollBy({ top: -150, behavior: 'smooth' }),
    () => scrollRef.current?.scrollBy({ top:  150, behavior: 'smooth' }),
  );
  const [user, setUser]   = useState(null);
  const [org, setOrg]     = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bandConfigs, setBandConfigs] = useState([]);
  const [myBlockedDates, setMyBlockedDates] = useState([]);
  const isAdmin = getIsAdmin();
  const [showDemoBanner, setShowDemoBanner] = useState(
    () => localStorage.getItem('aio_demo_banner_dismissed') !== '1'
  );

  // Notificaciones
  const [notifs,       setNotifs]       = useState([]);
  const [notifsOpen,   setNotifsOpen]   = useState(false);
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  const [markingRead,  setMarkingRead]  = useState(false);

  const unreadCount = notifs.filter(n => !n.is_read).length;

  const loadNotifs = useCallback(async (autoOpen = false) => {
    try {
      const res = await fetch(`${API}/api/notifications`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setNotifs(arr);
        if (autoOpen && arr.some(n => !n.is_read)) setNotifsOpen(true);
      }
    } catch {}
    setNotifsLoaded(true);
  }, []);

  const markAllRead = async () => {
    setMarkingRead(true);
    try {
      await fetch(`${API}/api/notifications/read-all`, { method: 'PATCH', headers: authHeaders() });
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    } finally { setMarkingRead(false); }
  };

  const markOneRead = async (id) => {
    try {
      await fetch(`${API}/api/notifications/${id}/read`, { method: 'PATCH', headers: authHeaders() });
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  useEffect(() => {
    Promise.all([
      fetch(`${API}/auth/me`,  { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/auth/org`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/api/events?start=${todayStr()}&end=${futureStr(60)}`, { headers: authHeaders() })
        .then(r => r.json()).catch(() => []),
      fetch(`${API}/api/band-configs`, { headers: authHeaders() })
        .then(r => r.json()).catch(() => []),
      fetch(`${API}/api/blocked-dates?start=${todayStr()}&end=${futureStr(60)}`, { headers: authHeaders() })
        .then(r => r.json()).catch(() => []),
    ]).then(([me, orgData, evs, configs, blocked]) => {
      setUser(me);
      setOrg(orgData);
      setBandConfigs(Array.isArray(configs) ? configs : []);
      // Guardar solo mis propias fechas bloqueadas (filtramos después de tener me.id)
      const blockedArr = Array.isArray(blocked) ? blocked : [];
      const myId = Number(me?.id);
      setMyBlockedDates(blockedArr.filter(b => Number(b.user_id) === myId).map(b => b.date?.slice(0, 10)));
      const evList = Array.isArray(evs) ? evs : [];
      const today = todayStr();
      const visible = evList
        .filter(e => {
          const d = String(e.occurrence_date ?? e.date).slice(0, 10);
          const published = isAdmin ? true : Boolean(e.is_published);
          return published && d >= today;
        })
        .sort((a, b) => {
          const da = String(a.occurrence_date ?? a.date).slice(0, 10);
          const db = String(b.occurrence_date ?? b.date).slice(0, 10);
          return da.localeCompare(db);
        })
        .slice(0, 5);
      setEvents(visible);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Socket — escuchar nuevas notificaciones
  useEffect(() => {
    const orgId = localStorage.getItem('aio_org_id');
    if (!orgId) return;
    const socket = socketIo(API || window.location.origin, { transports: ['websocket'] });
    socket.on('connect', () => socket.emit('join', { orgId }));
    socket.on('notification:new', (data) => {
      setNotifs(prev => [{
        id: Date.now(), // temporal hasta recargar
        type: data.type,
        title: data.title,
        body: null,
        is_read: false,
        metadata: { event_id: data.eventId, date: data.date },
        created_at: new Date().toISOString(),
      }, ...prev]);
      // Auto-expandir panel de notificaciones
      setNotifsOpen(true);
      setNotifsLoaded(true);
    });
    return () => socket.disconnect();
  }, []);

  // Auto-cargar notificaciones al montar (auto-abre si hay no leídas)
  useEffect(() => { loadNotifs(true); }, [loadNotifs]);

  const logout = async () => {
    const token = localStorage.getItem('aio_sync_token');
    if (token) {
      try { await fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch (_) {}
    }
    localStorage.removeItem('aio_sync_token');
    localStorage.removeItem('aio_org_id');
    navigate('/', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1a2e] flex items-center justify-center">
        <Loader2 size={36} className="text-yellow-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-5 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 size={16} className="text-yellow-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white/80 truncate">{org?.name ?? '—'}</span>
        </div>

        {/* Avatar + menú */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate('/app')}
            title="Ir al Modo Presenter"
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-white/10"
          >
            <Monitor size={15} />
            <span className="hidden sm:inline">Presenter</span>
          </button>
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="text-white/30 hover:text-red-400 transition-colors p-1"
          >
            <LogOut size={16} />
          </button>
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full border-2 border-yellow-400/40 object-cover" />
            : <div className="w-8 h-8 rounded-full bg-yellow-500/20 border-2 border-yellow-400/40 flex items-center justify-center text-yellow-300 text-xs font-bold">
                {user?.display_name?.[0]?.toUpperCase() ?? '?'}
              </div>
          }
        </div>
      </header>

      {/* ── Hero greeting ────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <section className="px-5 pt-8 pb-6">
        <p className="text-white/40 text-sm mb-1">Bienvenido,</p>
        <h1 className="text-2xl font-extrabold text-white leading-tight">
          {user?.display_name?.split(' ')[0] ?? 'Músico'} 👋
        </h1>
        <p className="text-white/40 text-sm mt-1">Modo Cancionero · {org?.name ?? ''}</p>
      </section>

      {/* ── Nav grid ─────────────────────────────────────────────────── */}
      <section className="px-5 pb-8">
        <div className="grid grid-cols-2 gap-3">
          {NAV_ITEMS.map(item => {
            const c = COLOR_MAP[item.color];
            const Icon = item.icon;
            const isNotif = item.id === 'notificaciones';
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (isNotif) {
                    if (!notifsLoaded) loadNotifs(false);
                    setNotifsOpen(o => !o);
                  } else if (item.route) {
                    navigate(item.route);
                  }
                }}
                className={`group relative flex flex-col gap-3 p-5 rounded-2xl border-2 text-left transition-all duration-200 active:scale-[0.97] ${c.card}`}
              >
                {c.badge && (
                  <span className="absolute top-2.5 right-2.5 text-[9px] font-bold text-white/30 uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded-full">
                    {c.badge}
                  </span>
                )}
                {isNotif && unreadCount > 0 && (
                  <span className="absolute top-2.5 right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                <div className={`inline-flex p-3 rounded-xl border ${c.icon}`}>
                  <Icon size={22} className={c.text} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{item.label}</p>
                  <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${c.text} opacity-70`}>
                    {isNotif ? (unreadCount > 0 ? `${unreadCount} nuevas` : 'Sin nuevas') : 'Abrir'}
                    <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Pack de inicio (solo si no hay canciones) ─────────── */}
      {showDemoBanner && (
        <DemoPackBanner
          onSongsImported={() => {}}
          onDismiss={() => {
            localStorage.setItem('aio_demo_banner_dismissed', '1');
            setShowDemoBanner(false);
          }}
        />
      )}

      {/* ── Panel de notificaciones ─────────────────────────────────── */}
      {notifsOpen && (
        <section className="px-5 pb-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-orange-300" />
                <span className="text-sm font-semibold">Notificaciones</span>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    disabled={markingRead}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1"
                  >
                    {markingRead ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Marcar leídas
                  </button>
                )}
                <button onClick={() => setNotifsOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>

            {!notifsLoaded ? (
              <div className="flex justify-center py-6">
                <Loader2 size={18} className="text-orange-300 animate-spin" />
              </div>
            ) : notifs.length === 0 ? (
              <p className="text-center text-white/25 text-sm py-8">No hay notificaciones</p>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {notifs.map(n => (
                  <button
                    key={n.id}
                    onClick={() => {
                      markOneRead(n.id);
                      if (n.metadata?.event_id) navigate(`/cancionero/eventos/${n.metadata.event_id}`);
                    }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors ${n.is_read ? 'opacity-50' : ''}`}
                  >
                    <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-orange-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{n.title}</p>
                      <p className="text-xs text-white/40 mt-0.5 truncate">
                        {(() => {
                          // Limpiar body de posibles restos de "Invalid Date"
                          const cleanBody = (n.body || '').replace(/·?\s*Invalid Date/g, '').trim();
                          // Validar que metadata.date sea YYYY-MM-DD antes de usarlo
                          const rawDate = n.metadata?.date ?? '';
                          const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
                          let dateLabel = '';
                          if (isValidFormat) {
                            const d = new Date(rawDate + 'T12:00:00');
                            if (!isNaN(d)) {
                              dateLabel = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
                            }
                          }
                          // Fallback: usar created_at del registro
                          if (!dateLabel && n.created_at) {
                            const d = new Date(n.created_at);
                            if (!isNaN(d)) {
                              dateLabel = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
                            }
                          }
                          if (cleanBody && dateLabel) return `${cleanBody} · ${dateLabel}`;
                          return cleanBody || dateLabel || '';
                        })()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Próximos eventos ─────────────────────────────────────────── */}
      <section className="px-5 pb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Próximos eventos</h2>
          <button
            onClick={() => navigate('/cancionero/eventos')}
            className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            Ver todos
          </button>
        </div>

        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-white/30">
            <CalendarDays size={32} />
            <p className="text-sm">No hay eventos próximos</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map(ev => {
              const badge = daysUntil(ev.occurrence_date ?? ev.date);
              const isToday = badge === 'Hoy';
              const isDraft = isAdmin && !ev.is_published;

              // Asignación del usuario en este evento
              let assignment = null;
              if (user?.id && ev.band_config_id) {
                const cfg = bandConfigs.find(c => c.id === Number(ev.band_config_id));
                if (cfg) {
                  const slot = (cfg.slots || []).find(s => Number(s.userId) === Number(user.id));
                  if (slot?.instrument) {
                    const hasConflict = myBlockedDates.includes(toDateStr(ev.date));
                    assignment = { instrument: slot.instrument, hasConflict };
                  }
                }
              }

              return (
                <button
                  key={`${ev.id}-${ev.date}`}
                  onClick={() => navigate(`/cancionero/eventos/${ev.id}`, { state: { occurrence_date: ev.is_recurring ? toDateStr(ev.date) : (ev.occurrence_date ? toDateStr(ev.occurrence_date) : null) } })}
                  className={`group flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-200 active:scale-[0.98] ${
                    assignment?.hasConflict
                      ? 'border-red-500/40 bg-red-500/5 hover:border-red-400/60 hover:bg-red-500/10'
                      : isDraft
                        ? 'border-amber-400/25 bg-amber-500/5 hover:border-amber-400/40 hover:bg-amber-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  {/* Date badge */}
                  <div className={`flex-shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-xl border ${
                    isToday ? 'bg-yellow-500/20 border-yellow-400/30' : 'bg-blue-500/10 border-blue-400/20'
                  }`}>
                    <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-yellow-300' : 'text-blue-300'}`}>
                      {new Date(toDateStr(ev.date) + 'T12:00:00').toLocaleDateString('es', { month: 'short' })}
                    </span>
                    <span className={`text-lg font-extrabold leading-none ${isToday ? 'text-yellow-200' : 'text-white'}`}>
                      {new Date(toDateStr(ev.date) + 'T12:00:00').getDate()}
                    </span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white text-sm truncate">{ev.title}</p>
                      {isDraft && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/30 text-amber-300 uppercase tracking-wide">
                          Borrador
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-white/40">
                      <span className={`font-medium ${isToday ? 'text-yellow-400' : 'text-blue-300'}`}>{badge}</span>
                      {ev.time && (
                        <>
                          <span>·</span>
                          <Clock size={11} />
                          <span>{formatTime(ev.time)}</span>
                        </>
                      )}
                      {(() => {
                        const songCount = ev.song_count != null
                          ? Number(ev.song_count)
                          : (ev.songs || []).filter(s => s.item_type === 'song' && s.song_id).length;
                        return songCount > 0 ? (
                          <>
                            <span>·</span>
                            <Music2 size={11} />
                            <span>{songCount} canciones</span>
                          </>
                        ) : null;
                      })()}
                    </div>
                    {/* Badge de asignación */}
                    {assignment && (
                      <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        assignment.hasConflict
                          ? 'bg-red-500/20 border-red-400/40 text-red-300'
                          : 'bg-yellow-500/15 border-yellow-400/30 text-yellow-300'
                      }`}>
                        {assignment.hasConflict
                          ? <><AlertTriangle size={9} /> Conflicto · {assignment.instrument}</>
                          : <><Users size={9} /> {assignment.instrument}</>
                        }
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-white/20 group-hover:text-white/40 flex-shrink-0 self-center group-hover:translate-x-0.5 transition-transform" />
                </button>
              );
            })}
          </div>
        )}
      </section>
      </div>{/* end scroll */}
      <CancioneroNavbar />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Music2, CalendarDays, Settings2, Bell,
  LogOut, ChevronRight, Loader2, Building2, Clock, Monitor
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  const token = localStorage.getItem('aio_sync_token');
  return { Authorization: `Bearer ${token}` };
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function futureStr(days = 60) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
}
function formatTime(timeStr) {
  if (!timeStr) return null;
  return timeStr.slice(0, 5);
}
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return `En ${diff} días`;
}

const NAV_ITEMS = [
  { id: 'canciones',      icon: Music2,       label: 'Canciones',      route: '/cancionero/canciones',      color: 'yellow' },
  { id: 'eventos',        icon: CalendarDays, label: 'Eventos',        route: '/cancionero/eventos',        color: 'blue'   },
  { id: 'configuracion',  icon: Settings2,    label: 'Configuración',  route: null,                         color: 'slate'  },
  { id: 'notificaciones', icon: Bell,         label: 'Notificaciones', route: null,                         color: 'slate'  },
];

const COLOR_MAP = {
  yellow: { card: 'border-yellow-500/30 bg-yellow-500/10 hover:border-yellow-400/60 hover:bg-yellow-500/20', icon: 'bg-yellow-500/20 border-yellow-400/30', text: 'text-yellow-300', badge: '' },
  blue:   { card: 'border-blue-500/30 bg-blue-500/10 hover:border-blue-400/60 hover:bg-blue-500/20',         icon: 'bg-blue-500/20 border-blue-400/30',     text: 'text-blue-300',   badge: '' },
  slate:  { card: 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed',                                icon: 'bg-white/10 border-white/10',           text: 'text-white/40',   badge: 'Pronto' },
};

export default function CancioneroDashboard() {
  const navigate = useNavigate();
  const [user, setUser]   = useState(null);
  const [org, setOrg]     = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/auth/me`,  { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/auth/org`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/api/events?start=${todayStr()}&end=${futureStr(60)}`, { headers: authHeaders() })
        .then(r => r.json()).catch(() => []),
    ]).then(([me, orgData, evs]) => {
      setUser(me);
      setOrg(orgData);
      setEvents(Array.isArray(evs) ? evs.filter(e => e.date >= todayStr()).slice(0, 5) : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const logout = () => {
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
    <div className="min-h-screen bg-[#0f1a2e] text-white">
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
            onClick={() => navigate('/mode-select')}
            title="Cambiar modo"
            className="text-white/30 hover:text-white/60 transition-colors p-1"
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
            return (
              <button
                key={item.id}
                onClick={() => item.route && navigate(item.route)}
                disabled={!item.route}
                className={`group relative flex flex-col gap-3 p-5 rounded-2xl border-2 text-left transition-all duration-200 active:scale-[0.97] ${c.card}`}
              >
                {c.badge && (
                  <span className="absolute top-2.5 right-2.5 text-[9px] font-bold text-white/30 uppercase tracking-widest bg-white/10 px-1.5 py-0.5 rounded-full">
                    {c.badge}
                  </span>
                )}
                <div className={`inline-flex p-3 rounded-xl border ${c.icon}`}>
                  <Icon size={22} className={c.text} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{item.label}</p>
                  {item.route && (
                    <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${c.text} opacity-70`}>
                      Abrir <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

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
              const badge = daysUntil(ev.date);
              const isToday = badge === 'Hoy';
              return (
                <button
                  key={`${ev.id}-${ev.date}`}
                  onClick={() => navigate('/cancionero/eventos')}
                  className="group flex items-start gap-4 p-4 rounded-2xl border-2 border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 text-left transition-all duration-200 active:scale-[0.98]"
                >
                  {/* Date badge */}
                  <div className={`flex-shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-xl border ${
                    isToday ? 'bg-yellow-500/20 border-yellow-400/30' : 'bg-blue-500/10 border-blue-400/20'
                  }`}>
                    <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-yellow-300' : 'text-blue-300'}`}>
                      {new Date(ev.date + 'T00:00:00').toLocaleDateString('es', { month: 'short' })}
                    </span>
                    <span className={`text-lg font-extrabold leading-none ${isToday ? 'text-yellow-200' : 'text-white'}`}>
                      {new Date(ev.date + 'T00:00:00').getDate()}
                    </span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{ev.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-white/40">
                      <span className={`font-medium ${isToday ? 'text-yellow-400' : 'text-blue-300'}`}>{badge}</span>
                      {ev.time && (
                        <>
                          <span>·</span>
                          <Clock size={11} />
                          <span>{formatTime(ev.time)}</span>
                        </>
                      )}
                      {ev.songs?.length > 0 && (
                        <>
                          <span>·</span>
                          <Music2 size={11} />
                          <span>{ev.songs.filter(s => s.item_type !== 'separator').length} canciones</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-white/20 group-hover:text-white/40 flex-shrink-0 self-center group-hover:translate-x-0.5 transition-transform" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

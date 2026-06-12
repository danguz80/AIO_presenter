import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Music2, ListChecks, CalendarDays, Monitor, Settings2, ShieldCheck, MessageSquare, X } from 'lucide-react';
import OrgSwitcher from '../../components/shared/OrgSwitcher';
import MessagesPanel from '../../components/Controls/MessagesPanel';

function getIsOwner() {
  try {
    const t = localStorage.getItem('aio_sync_token');
    if (!t) return false;
    return JSON.parse(atob(t.split('.')[1]))?.isOwner === true;
  } catch { return false; }
}

const NAV = [
  { label: 'Inicio',     icon: Home,         route: '/cancionero'                 },
  { label: 'Canciones',  icon: Music2,       route: '/cancionero/canciones'       },
  { label: 'Eventos',    icon: ListChecks,   route: '/cancionero/eventos'         },
  { label: 'Calendario', icon: CalendarDays, route: '/calendar'                   },
  { label: 'Presenter',  icon: Monitor,      route: '/app'                        },
  { label: 'Config',     icon: Settings2,    route: '/cancionero/configuracion'   },
];

export default function CancioneroNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOwner  = getIsOwner();
  const [showMessages, setShowMessages] = useState(false);

  const allItems = isOwner
    ? [...NAV, { label: 'Admin', icon: ShieldCheck, route: '/admin', gold: true }]
    : NAV;

  return (
    <>
      {/* ── Drawer de mensajes ── */}
      {showMessages && (
        <div className="fixed inset-0 z-[9998] flex flex-col bg-[#0a1220]">
          <div className="flex items-center justify-between px-4 py-3 bg-[#0d1929] border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-yellow-400" />
              <span className="text-sm font-semibold text-white/90">Mensajes</span>
            </div>
            <button onClick={() => setShowMessages(false)} className="text-white/40 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <MessagesPanel />
          </div>
        </div>
      )}

      <nav className="flex-shrink-0 bg-[#0a1220]/95 backdrop-blur-sm border-t border-white/10 px-2 py-1 pb-safe">
      {/* Org switcher — visible solo si hay varias orgs */}
      <div className="flex justify-center pt-1 pb-0.5">
        <OrgSwitcher variant="cancionero" />
      </div>
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {allItems.map(item => {
          const Icon = item.icon;
          const isActive =
            item.route === '/cancionero'
              ? location.pathname === '/cancionero'
              : location.pathname.startsWith(item.route);

          return (
            <button
              key={item.label}
              onClick={() => navigate(item.route)}
              className={`relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-colors ${
                isActive
                  ? item.gold ? 'text-yellow-400' : 'text-yellow-400'
                  : item.gold ? 'text-yellow-600/60 hover:text-yellow-400/80' : 'text-white/35 hover:text-white/70'
              }`}
            >
              {isActive && (
                <span className="absolute top-0.5 inset-x-4 h-0.5 bg-yellow-400 rounded-full" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
        {/* Botón Mensajes */}
        <button
          onClick={() => setShowMessages(true)}
          className="relative flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-colors text-white/35 hover:text-yellow-400"
        >
          <MessageSquare size={20} strokeWidth={1.6} />
          <span className="text-[10px] font-medium leading-none">Mensajes</span>
        </button>
      </div>
    </nav>
    </>
  );
}

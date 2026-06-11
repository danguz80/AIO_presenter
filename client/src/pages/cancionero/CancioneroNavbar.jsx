import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Music2, ListChecks, CalendarDays, Monitor, Settings2, ShieldCheck } from 'lucide-react';
import OrgSwitcher from '../../components/shared/OrgSwitcher';

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

  const allItems = isOwner
    ? [...NAV, { label: 'Admin', icon: ShieldCheck, route: '/admin', gold: true }]
    : NAV;

  return (
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
      </div>
    </nav>
  );
}

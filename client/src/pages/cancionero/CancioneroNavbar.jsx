import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Music2, ListChecks, CalendarDays, Monitor, Settings2 } from 'lucide-react';

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

  return (
    <nav className="flex-shrink-0 bg-[#0a1220]/95 backdrop-blur-sm border-t border-white/10 px-2 py-1 pb-safe">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {NAV.map(item => {
          const Icon = item.icon;
          // Marcar activo: ruta exacta para /cancionero, startsWith para el resto
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
                  ? 'text-yellow-400'
                  : 'text-white/35 hover:text-white/70'
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

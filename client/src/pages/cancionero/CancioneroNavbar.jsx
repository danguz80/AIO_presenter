import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Music2, ListChecks, CalendarDays, Monitor } from 'lucide-react';

const NAV = [
  { label: 'Inicio',     icon: Home,         route: '/cancionero'           },
  { label: 'Canciones',  icon: Music2,       route: '/cancionero/canciones' },
  { label: 'Eventos',    icon: ListChecks,   route: '/cancionero/eventos'   },
  { label: 'Calendario', icon: CalendarDays, route: '/calendar'             },
  { label: 'Presenter',  icon: Monitor,      route: '/app'                  },
];

export default function CancioneroNavbar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="flex-shrink-0 bg-[#0a1220]/95 backdrop-blur-sm border-t border-white/10 px-2 py-1 pb-safe">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {NAV.map(item => {
          const Icon = item.icon;
          // Marcar activo: ruta exacta o comienza por la ruta (excepto /cancionero que es exacto)
          const isActive = item.route
            ? item.route === '/cancionero'
              ? location.pathname === '/cancionero'
              : location.pathname.startsWith(item.route)
            : false;

          return (
            <button
              key={item.label}
              onClick={() => item.route && navigate(item.route)}
              disabled={!item.route}
              className={`relative flex flex-col items-center gap-0.5 py-2 px-4 rounded-xl transition-colors ${
                !item.route
                  ? 'opacity-30 cursor-not-allowed'
                  : isActive
                    ? 'text-yellow-400'
                    : 'text-white/35 hover:text-white/70'
              }`}
            >
              {isActive && (
                <span className="absolute top-0.5 inset-x-4 h-0.5 bg-yellow-400 rounded-full" />
              )}
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
              {!item.route && (
                <span className="absolute -top-1 -right-1 text-[7px] font-bold uppercase bg-white/10 text-white/30 px-1 py-0.5 rounded-full leading-none">
                  pronto
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

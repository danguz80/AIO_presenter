import { useNavigate } from 'react-router-dom';
import { MonitorPlay, Music2, ChevronRight, LogOut } from 'lucide-react';

const MODES = [
  {
    id: 'presenter',
    icon: MonitorPlay,
    title: 'Modo Presenter',
    desc: 'Proyección de letras, acordes y Biblias para el culto. Control remoto móvil incluido.',
    accent: 'blue',
    available: true,
    route: '/app',
  },
  {
    id: 'cancionero',
    icon: Music2,
    title: 'Modo Cancionero',
    desc: 'Songbook digital de bolsillo para músicos con acordes y auto-scroll personalizable.',
    accent: 'yellow',
    available: false,
    route: '/cancionero',
  },
];

export default function ModeSelectPage() {
  const navigate = useNavigate();

  const handleSelect = (mode) => {
    if (!mode.available) return;
    navigate(mode.route);
  };

  return (
    <div className="min-h-screen bg-[#1B3166] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <img
          src="/logo-circle.png"
          alt="AIO Presenter"
          className="h-16 w-16 object-contain drop-shadow-xl"
          onError={e => { e.target.style.display = 'none'; }}
        />
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          All in One <span className="text-[#C9A420]">Presenter</span>
        </h1>
      </div>

      {/* Heading */}
      <div className="text-center mb-10">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white">¿Cómo quieres continuar?</h2>
        <p className="mt-2 text-white/50 text-base">Selecciona el modo de trabajo para esta sesión.</p>
      </div>

      {/* Mode cards */}
      <div className="grid sm:grid-cols-2 gap-5 w-full max-w-2xl">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const isBlue = mode.accent === 'blue';
          return (
            <button
              key={mode.id}
              onClick={() => handleSelect(mode)}
              disabled={!mode.available}
              className={`group relative text-left rounded-2xl border-2 p-7 flex flex-col gap-4 transition-all duration-200 ${
                mode.available
                  ? isBlue
                    ? 'border-blue-500/40 bg-blue-600/10 hover:border-blue-400 hover:bg-blue-600/20 hover:shadow-xl hover:shadow-blue-900/30 active:scale-[0.98]'
                    : 'border-yellow-500/40 bg-yellow-600/10 hover:border-yellow-400 hover:bg-yellow-600/20 hover:shadow-xl hover:shadow-yellow-900/30 active:scale-[0.98]'
                  : 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
              }`}
            >
              {/* Icon */}
              <div className={`inline-flex p-3.5 rounded-xl border ${
                isBlue ? 'bg-blue-600/20 border-blue-500/30' : 'bg-yellow-600/20 border-yellow-500/30'
              }`}>
                <Icon size={26} className={isBlue ? 'text-blue-300' : 'text-yellow-300'} />
              </div>

              {/* Text */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-white text-xl">{mode.title}</h3>
                  {!mode.available && (
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-full">
                      Próximamente
                    </span>
                  )}
                </div>
                <p className="text-white/50 text-sm leading-relaxed">{mode.desc}</p>
              </div>

              {/* Arrow */}
              {mode.available && (
                <div className={`flex items-center gap-1 text-sm font-semibold ${isBlue ? 'text-blue-300' : 'text-yellow-300'}`}>
                  Ir al {mode.title.split(' ')[1]}
                  <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer logout */}
      <button
        onClick={() => navigate('/')}
        className="mt-10 flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm transition-colors"
      >
        <LogOut size={14} />
        Volver al inicio
      </button>
    </div>
  );
}

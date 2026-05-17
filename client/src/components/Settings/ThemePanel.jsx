import { usePresenter } from '../../context/usePresenter';

const THEMES = [
  {
    id:      'oscuro',
    label:   'Oscuro',
    bg:      '#18181b',
    accent:  '#6366f1',
  },
  {
    id:      'azul',
    label:   'Azul',
    bg:      '#0a1430',
    accent:  '#38bdf8',
  },
  {
    id:      'verde',
    label:   'Verde',
    bg:      '#09160f',
    accent:  '#10b981',
  },
  {
    id:      'violeta',
    label:   'Violeta',
    bg:      '#140d24',
    accent:  '#a78bfa',
  },
  {
    id:      'rojo',
    label:   'Rojo',
    bg:      '#200a0a',
    accent:  '#f43f5e',
  },
  {
    id:      'ambar',
    label:   'Ámbar',
    bg:      '#201808',
    accent:  '#fbbf24',
  },
];

export default function ThemePanel() {
  const { state, actions } = usePresenter();
  const current = state.appTheme ?? 'oscuro';

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES.map(t => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            onClick={() => actions.setAppTheme(t.id)}
            title={t.label}
            className={`relative rounded-lg overflow-hidden border-2 transition-all ${
              active ? 'border-white scale-105 shadow-lg' : 'border-transparent hover:border-zinc-500'
            }`}
            style={{ aspectRatio: '16/9', background: t.bg }}
          >
            {/* Barra de accent simulando la UI */}
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ background: t.accent }} />
            {/* Sidebar simulado */}
            <div className="absolute left-0 top-1.5 bottom-0 w-2.5 opacity-50"
              style={{ background: t.accent }} />
            {/* Cuadrícula de slides simulada */}
            <div className="absolute inset-0 flex items-end justify-center pb-1 gap-1 px-3">
              {[1,2,3].map(i => (
                <div key={i} className="flex-1 rounded-sm opacity-30"
                  style={{ height: '35%', background: t.accent }} />
              ))}
            </div>
            {/* Nombre del tema */}
            <div className="absolute bottom-1 left-0 right-0 text-center">
              <span className="text-[8px] font-semibold"
                style={{ color: t.accent, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                {t.label}
              </span>
            </div>
            {/* Checkmark si activo */}
            {active && (
              <div className="absolute top-2 right-1.5 w-3 h-3 rounded-full flex items-center justify-center"
                style={{ background: t.accent }}>
                <svg width="6" height="5" viewBox="0 0 6 5" fill="none">
                  <path d="M1 2.5L2.5 4L5 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { EyeOff, Eye, Palette, LayoutTemplate } from 'lucide-react';
import { resolveFont, injectGoogleFont } from '../../utils/fontUtils';

const BG_PRESETS = [
  { color: '#000000', label: 'Negro' },
  { color: '#1a1a2e', label: 'Azul oscuro' },
  { color: '#16213e', label: 'Marino' },
  { color: '#0f3460', label: 'Azul' },
  { color: '#1b1b1b', label: 'Gris' },
  { color: '#1a0a00', label: 'Café' },
];

export default function LiveControls() {
  const { state, actions } = usePresenter();
  const { liveState, outputTemplates = [], outputConfig } = state;
  const [showBgPanel, setShowBgPanel]         = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  // Precargar las fuentes de todas las plantillas guardadas
  useEffect(() => {
    outputTemplates.forEach(t => {
      if (t.config?.fontFamily) injectGoogleFont(t.config.fontFamily);
    });
  }, [outputTemplates]);

  const handleBlank = () => {
    actions.toggleBlank(!liveState.isBlank);
    actions.selectSlide(null);
  };

  const setBackground = (color) => {
    actions.setBackground({ type: 'color', color });
  };

  return (
    <div className="shrink-0 p-3 space-y-3">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
        Controles
      </span>

      {/* Botón Blank/Black */}
      <button
        onClick={handleBlank}
        className={`
          w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors
          ${liveState.isBlank
            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
            : 'bg-surface-700 hover:bg-surface-600 text-zinc-300'
          }
        `}
      >
        {liveState.isBlank
          ? <><Eye size={16} /> Mostrar</>
          : <><EyeOff size={16} /> Borrar todo</>
        }
      </button>

      {/* Selector de fondo */}
      <div>
        <button
          onClick={() => setShowBgPanel(!showBgPanel)}
          className="btn-ghost w-full flex items-center gap-2 justify-center"
        >
          <Palette size={15} />
          Fondo de pantalla
        </button>

        {showBgPanel && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BG_PRESETS.map(preset => (
              <button
                key={preset.color}
                title={preset.label}
                onClick={() => setBackground(preset.color)}
                className={`
                  w-full h-9 rounded-lg border-2 transition-all
                  ${liveState.background.color === preset.color
                    ? 'border-accent scale-105'
                    : 'border-surface-600 hover:border-zinc-400'
                  }
                `}
                style={{ backgroundColor: preset.color }}
              />
            ))}
            {/* Color personalizado */}
            <div className="relative">
              <label className="block w-full h-9 rounded-lg border-2 border-surface-600 hover:border-zinc-400 overflow-hidden cursor-pointer"
                     title="Color personalizado"
                     style={{
                       background: 'linear-gradient(135deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4, #ffeaa7)',
                     }}
              >
                <input
                  type="color"
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  onChange={e => setBackground(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Selector de plantilla principal */}
      {outputTemplates.length > 0 && (
        <div>
          <button
            onClick={() => setShowTemplatePanel(!showTemplatePanel)}
            className="btn-ghost w-full flex items-center gap-2 justify-center"
          >
            <LayoutTemplate size={15} />
            Plantilla principal
          </button>

          {showTemplatePanel && (
            <div className="mt-2 space-y-1">
              {outputTemplates.map(t => {
                // Detectar si esta plantilla está activa comparando sus campos clave
                const isActive = outputConfig?.fontFamily === t.config?.fontFamily
                  && outputConfig?.lyricsColor === t.config?.lyricsColor
                  && outputConfig?.fontBold === t.config?.fontBold;
                return (
                  <button
                    key={t.name}
                    onClick={() => actions.setOutputConfig({ ...outputConfig, ...t.config })}
                    className={`w-full flex items-center gap-2 text-xs rounded px-2 py-2 transition-colors text-left ${
                      isActive ? 'bg-accent text-white' : 'bg-surface-700 text-zinc-300 hover:bg-surface-600'
                    }`}
                  >
                    <LayoutTemplate size={11} className="shrink-0" />
                    <span className="truncate" style={{ fontFamily: resolveFont(t.config?.fontFamily ?? 'sans') }}>{t.name}</span>
                    {t.config?.fontFamily && t.config.fontFamily !== 'sans' && (
                      <span className="ml-auto shrink-0 text-[9px] opacity-50 font-normal" style={{ fontFamily: 'system-ui, sans-serif' }}>
                        {t.config.fontFamily}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

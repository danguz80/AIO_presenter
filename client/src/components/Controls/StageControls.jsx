import { useState } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { Clock, Eye, EyeOff, ChevronDown, ChevronUp, Type } from 'lucide-react';

const BG_PRESETS = [
  { color: '#1e1e2e', label: 'Oscuro azulado' },
  { color: '#0d1117', label: 'Negro suave' },
  { color: '#1a1a1a', label: 'Gris oscuro' },
  { color: '#0f2027', label: 'Teal oscuro' },
  { color: '#1a0a2e', label: 'Violeta oscuro' },
  { color: '#0a1628', label: 'Marino profundo' },
];

const FONT_SIZES = [
  { value: 'auto',   label: 'Auto' },
  { value: 'small',  label: 'Pequeño' },
  { value: 'medium', label: 'Mediano' },
  { value: 'large',  label: 'Grande' },
];

export default function StageControls() {
  const { state, actions } = usePresenter();
  const { stageConfig } = state;
  const [open, setOpen] = useState(false);

  const update = (patch) => {
    actions.setStageConfig({ ...stageConfig, ...patch });
  };

  return (
    <div className="border-t border-surface-700">
      {/* Cabecera colapsable */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
      >
        <span>Config. Escenario</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">

          {/* Toggles */}
          <div className="flex flex-col gap-1.5">
            <ToggleRow
              icon={<Clock size={13} />}
              label="Mostrar reloj"
              value={stageConfig.showClock}
              onChange={(v) => update({ showClock: v })}
            />
            <ToggleRow
              icon={<Eye size={13} />}
              label="Siguiente slide"
              value={stageConfig.showNextSlide}
              onChange={(v) => update({ showNextSlide: v })}
            />
          </div>

          {/* Tamaño de fuente */}
          <div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1.5">
              <Type size={12} />
              Tamaño de texto
            </div>
            <div className="grid grid-cols-4 gap-1">
              {FONT_SIZES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => update({ fontSize: value })}
                  className={`py-1.5 text-xs rounded transition-colors font-medium ${
                    stageConfig.fontSize === value
                      ? 'bg-accent text-white'
                      : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Fondo de escenario */}
          <div>
            <p className="text-xs text-zinc-400 mb-1.5">Fondo de escenario</p>
            <div className="grid grid-cols-3 gap-1.5">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  title={preset.label}
                  onClick={() => update({ background: { type: 'color', color: preset.color } })}
                  className={`w-full h-8 rounded border-2 transition-all ${
                    stageConfig.background.color === preset.color
                      ? 'border-accent scale-105'
                      : 'border-surface-600 hover:border-zinc-400'
                  }`}
                  style={{ backgroundColor: preset.color }}
                />
              ))}
              {/* Color personalizado */}
              <div className="relative col-span-3">
                <label
                  className="flex items-center gap-2 w-full h-8 rounded border-2 border-surface-600 hover:border-zinc-400 overflow-hidden cursor-pointer px-2"
                  title="Color personalizado"
                >
                  <span className="text-xs text-zinc-400">Personalizado</span>
                  <div
                    className="w-5 h-5 rounded ml-auto border border-surface-600 shrink-0"
                    style={{ backgroundColor: stageConfig.background.color }}
                  />
                  <input
                    type="color"
                    value={stageConfig.background.color}
                    onChange={(e) => update({ background: { type: 'color', color: e.target.value } })}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ icon, label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-zinc-300">
        {icon}
        {label}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
          value
            ? 'bg-accent/20 text-accent'
            : 'bg-surface-600 text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {value ? <Eye size={11} /> : <EyeOff size={11} />}
        {value ? 'On' : 'Off'}
      </button>
    </div>
  );
}

import { useState } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { ChevronDown, ChevronUp, Monitor } from 'lucide-react';

const FONT_FAMILIES = [
  { value: 'sans',    label: 'Sans-serif' },
  { value: 'serif',   label: 'Serif' },
  { value: 'mono',    label: 'Mono' },
];

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-300">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${value ? 'bg-accent' : 'bg-surface-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
        />
        <span className="text-[10px] text-zinc-500 font-mono">{value}</span>
      </div>
    </div>
  );
}

function SizeRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-300 shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(8, value - 1))}  className="w-5 h-5 rounded bg-surface-600 text-zinc-300 text-xs hover:bg-surface-500 flex items-center justify-center">−</button>
        <span className="text-xs text-zinc-200 w-7 text-center">{value}</span>
        <button onClick={() => onChange(Math.min(120, value + 1))} className="w-5 h-5 rounded bg-surface-600 text-zinc-300 text-xs hover:bg-surface-500 flex items-center justify-center">+</button>
      </div>
    </div>
  );
}

export default function OutputControls({ defaultOpen = false }) {
  const { state, actions } = usePresenter();
  const { outputConfig } = state;
  const [open, setOpen] = useState(defaultOpen);

  const update = (patch) => {
    actions.setOutputConfig({ ...outputConfig, ...patch });
  };

  const showComments       = outputConfig?.showComments       ?? false;
  const commentColor       = outputConfig?.commentColor       ?? '#facc15';
  const commentFontSize    = outputConfig?.commentFontSize    ?? 16;
  const commentFontFamily  = outputConfig?.commentFontFamily  ?? 'sans';

  return (
    <div className="border-t border-surface-700">
      {/* Cabecera colapsable */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Monitor size={12} />
          Principal (Proyector)
        </div>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">

          {/* COMENTARIOS DE DIRECTOR */}
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider pt-1">Comentarios (//)</p>
          <ToggleRow
            label="Mostrar en pantalla"
            value={showComments}
            onChange={v => update({ showComments: v })}
          />
          {showComments && (
            <>
              <ColorRow label="Color"  value={commentColor}    onChange={v => update({ commentColor: v })} />
              <SizeRow  label="Tamaño" value={commentFontSize} onChange={v => update({ commentFontSize: v })} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-300 shrink-0">Fuente</span>
                <select
                  value={commentFontFamily}
                  onChange={e => update({ commentFontFamily: e.target.value })}
                  className="bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-1.5 py-1 focus:outline-none focus:border-accent"
                >
                  {FONT_FAMILIES.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Las líneas con <span className="font-mono text-zinc-400">//</span> son notas del director.
          </p>

        </div>
      )}
    </div>
  );
}

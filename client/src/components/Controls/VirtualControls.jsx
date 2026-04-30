import { useState } from 'react';
import { usePresenter } from '../../context/usePresenter';
import {
  ChevronDown, ChevronUp, Radio, Copy, CheckCheck,
  Tv, Type, Wifi, WifiOff, AlertCircle,
} from 'lucide-react';

const BG_TYPES = [
  { value: 'transparent', label: 'Transparente', desc: 'Ideal para OBS' },
  { value: 'color',       label: 'Color sólido',  desc: 'Fondo personalizado' },
  { value: 'chromakey',   label: 'Chromakey',     desc: 'Croma (verde/azul)' },
];

const FONT_SIZES = [
  { value: 'auto',   label: 'Auto' },
  { value: 'small',  label: 'Peq' },
  { value: 'medium', label: 'Med' },
  { value: 'large',  label: 'Gra' },
];

const CHROMA_PRESETS = [
  { color: '#00b140', label: 'Verde' },
  { color: '#0047AB', label: 'Azul' },
  { color: '#FF00FF', label: 'Magenta' },
];

const VIRTUAL_URL = `${window.location.origin}/virtual`;

export default function VirtualControls({ defaultOpen = false }) {
  const { state, actions } = usePresenter();
  const { virtualConfig, ndiStatus } = state;
  const [open, setOpen]     = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const update = (patch) => {
    actions.setVirtualConfig({ ...virtualConfig, ...patch });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(VIRTUAL_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="border-t border-surface-700">
      {/* Cabecera colapsable */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Tv size={12} />
          Virtual / NDI
        </div>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">

          {/* URL para OBS */}
          <div>
            <p className="text-xs text-zinc-400 mb-1.5">URL para OBS Browser Source</p>
            <div className="flex items-center gap-1.5 bg-surface-700 rounded px-2 py-1.5">
              <span className="text-[10px] text-zinc-300 flex-1 truncate font-mono">{VIRTUAL_URL}</span>
              <button
                onClick={copyUrl}
                className="text-zinc-400 hover:text-accent transition-colors shrink-0"
                title="Copiar URL"
              >
                {copied ? <CheckCheck size={13} className="text-green-400" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Tipo de fondo */}
          <div>
            <p className="text-xs text-zinc-400 mb-1.5">Modo de fondo</p>
            <div className="flex flex-col gap-1">
              {BG_TYPES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => update({ background: { ...virtualConfig.background, type: value } })}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                    virtualConfig.background.type === value
                      ? 'bg-accent/20 text-accent border border-accent/40'
                      : 'bg-surface-600 text-zinc-300 hover:bg-surface-500 border border-transparent'
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="text-zinc-500 text-[10px]">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color sólido */}
          {virtualConfig.background.type === 'color' && (
            <div>
              <p className="text-xs text-zinc-400 mb-1.5">Color de fondo</p>
              <label className="flex items-center gap-2 bg-surface-600 rounded px-2.5 py-1.5 cursor-pointer hover:bg-surface-500 transition-colors">
                <div
                  className="w-5 h-5 rounded border border-surface-500 shrink-0"
                  style={{ backgroundColor: virtualConfig.background.color ?? '#000000' }}
                />
                <span className="text-xs text-zinc-300 font-mono">
                  {(virtualConfig.background.color ?? '#000000').toUpperCase()}
                </span>
                <input
                  type="color"
                  value={virtualConfig.background.color ?? '#000000'}
                  onChange={(e) => update({ background: { type: 'color', color: e.target.value } })}
                  className="sr-only"
                />
              </label>
            </div>
          )}

          {/* Chromakey */}
          {virtualConfig.background.type === 'chromakey' && (
            <div>
              <p className="text-xs text-zinc-400 mb-1.5">Color de croma</p>
              <div className="flex gap-1.5 mb-1.5">
                {CHROMA_PRESETS.map(({ color, label }) => (
                  <button
                    key={color}
                    title={label}
                    onClick={() => update({ chromaColor: color })}
                    className={`flex-1 h-7 rounded border-2 transition-all text-[9px] font-bold ${
                      virtualConfig.chromaColor === color
                        ? 'border-white scale-105'
                        : 'border-surface-600 hover:border-zinc-400'
                    }`}
                    style={{ backgroundColor: color }}
                  >
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 bg-surface-600 rounded px-2.5 py-1.5 cursor-pointer hover:bg-surface-500 transition-colors">
                <div
                  className="w-5 h-5 rounded border border-surface-500 shrink-0"
                  style={{ backgroundColor: virtualConfig.chromaColor ?? '#00b140' }}
                />
                <span className="text-xs text-zinc-300 font-mono">
                  {(virtualConfig.chromaColor ?? '#00b140').toUpperCase()}
                </span>
                <input
                  type="color"
                  value={virtualConfig.chromaColor ?? '#00b140'}
                  onChange={(e) => update({ chromaColor: e.target.value })}
                  className="sr-only"
                />
              </label>
            </div>
          )}

          {/* Tamaño de fuente */}
          <div>
            <p className="text-xs text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Type size={11} /> Tamaño de texto
            </p>
            <div className="grid grid-cols-4 gap-1">
              {FONT_SIZES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => update({ fontSize: value })}
                  className={`py-1.5 text-xs rounded transition-colors font-medium ${
                    virtualConfig.fontSize === value
                      ? 'bg-accent text-white'
                      : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Estado NDI ───────────────────────────────────────────────── */}
          <div className="border-t border-surface-700 pt-2.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                <Radio size={11} />
                NDI Server
              </p>
              <NdiStatusBadge status={ndiStatus} />
            </div>

            {ndiStatus.grandioseInstalled ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Fuente</span>
                  <span className="text-zinc-300">{ndiStatus.sourceName}</span>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>Resolución</span>
                  <span className="text-zinc-300">{ndiStatus.resolution} @ {ndiStatus.fps}fps</span>
                </div>
                {/* Toggle NDI */}
                <button
                  onClick={() => update({ ndiEnabled: !virtualConfig.ndiEnabled })}
                  className={`w-full py-1.5 rounded text-xs font-medium transition-colors mt-1 ${
                    virtualConfig.ndiEnabled
                      ? 'bg-red-700/60 hover:bg-red-700/80 text-red-200'
                      : 'bg-accent/20 hover:bg-accent/30 text-accent'
                  }`}
                >
                  {virtualConfig.ndiEnabled ? 'Detener emisión NDI' : 'Iniciar emisión NDI'}
                </button>
              </div>
            ) : (
              <div className="bg-surface-700 rounded p-2 space-y-1">
                <p className="text-[10px] text-zinc-400 flex items-start gap-1.5">
                  <AlertCircle size={11} className="text-yellow-500 mt-0.5 shrink-0" />
                  <span>
                    Para usar NDI instala las dependencias en el servidor:
                  </span>
                </p>
                <code className="block text-[9px] bg-surface-800 rounded p-1.5 text-zinc-300 leading-relaxed">
                  cd server<br />
                  npm install grandiose canvas<br />
                  <span className="text-zinc-500"># + NDI SDK: ndi.video/download-ndi-sdk</span>
                </code>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function NdiStatusBadge({ status }) {
  if (!status.grandioseInstalled) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-zinc-500">
        <WifiOff size={10} /> No instalado
      </span>
    );
  }
  if (status.sending) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Emitiendo
      </span>
    );
  }
  if (status.senderReady) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-yellow-400">
        <Wifi size={10} /> Listo
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-red-400">
      <WifiOff size={10} /> Error
    </span>
  );
}

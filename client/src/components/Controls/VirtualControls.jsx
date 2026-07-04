import { useState, useRef } from 'react';
import { usePresenter } from '../../context/usePresenter';
import {
  ChevronDown, ChevronUp, Radio, Copy, CheckCheck,
  Tv, Save, BookOpen, X, Check, LayoutTemplate,
} from 'lucide-react';

// ─── Helpers UI reutilizables ─────────────────────────────────────────────────
function SubSection({ title, children }) {
  return (
    <div className="rounded-xl border border-surface-600/50 bg-surface-800/40 px-3 pt-2.5 pb-3">
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold mb-2.5">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

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
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
        <span className="text-[10px] text-zinc-500 font-mono">{value}</span>
      </div>
    </div>
  );
}

function SizeRow({ label, value, onChange, min = 0, max = 120 }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-300 shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(min, value - 1))}
          className="w-5 h-5 rounded bg-surface-600 text-zinc-300 text-xs hover:bg-surface-500 flex items-center justify-center">−</button>
        <span className="text-xs text-zinc-200 w-7 text-center">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))}
          className="w-5 h-5 rounded bg-surface-600 text-zinc-300 text-xs hover:bg-surface-500 flex items-center justify-center">+</button>
      </div>
    </div>
  );
}

const BG_TYPES = [
  { value: 'transparent', label: 'Transparente', desc: 'Ideal para OBS' },
  { value: 'color',       label: 'Color sólido',  desc: 'Fondo personalizado' },
  { value: 'chromakey',   label: 'Chromakey',     desc: 'Croma (verde/azul)' },
];

const CHROMA_PRESETS = [
  { color: '#00b140', label: 'Verde' },
  { color: '#0047AB', label: 'Azul' },
  { color: '#FF00FF', label: 'Magenta' },
];

const BG_SHAPES = [
  { value: 'rectangle', label: 'Rect' },
  { value: 'rounded',   label: 'Redon' },
  { value: 'pill',      label: 'Píldora' },
];

const FONT_SIZES_PRESETS = [24, 32, 40, 48, 56, 64, 72, 96];

const ALIGN_X = [
  { value: 'left',   label: '⬅ Izq' },
  { value: 'center', label: '↔ Cen' },
  { value: 'right',  label: '➡ Der' },
];
const ALIGN_Y = [
  { value: 'top',    label: '⬆ Sup' },
  { value: 'center', label: '↕ Cen' },
  { value: 'bottom', label: '⬇ Inf' },
];

const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
function getVirtualUrl() {
  const orgId = localStorage.getItem('aio_org_id');
  const presenterPin = localStorage.getItem('aio_presenter_pin') || localStorage.getItem('aio_target_pin');
  const params = new URLSearchParams();
  if (orgId) params.set('orgId', orgId);
  if (presenterPin) params.set('pin', presenterPin);
  params.set('obs', '1');
  params.set('v', BUILD_ID);
  return `${window.location.origin}/virtual?${params.toString()}`;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function VirtualControls({ defaultOpen = false }) {
  const { state, actions } = usePresenter();
  const { virtualConfig, virtualTemplates = [], liveState } = state;
  const [open, setOpen]     = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [templateName, setTemplateName]   = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [saveSuccess,   setSaveSuccess]   = useState(false);
  const successTimer    = useRef(null);

  const activeTemplateName  = virtualConfig?.activeTemplateName ?? null;
  const bibleTemplateName   = virtualConfig?.bibleTemplateName  ?? '';

  const showSuccess = () => {
    setSaveSuccess(true);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSaveSuccess(false), 2500);
  };

  const update = (patch) => {
    actions.setVirtualConfig({ ...virtualConfig, ...patch });
    if (activeTemplateName) { setTemplateDirty(true); setSaveSuccess(false); }
  };

  const applyTemplate = (t) => {
    actions.setVirtualConfig({ ...t.config, activeTemplateName: t.name });
    setTemplateDirty(false); setSaveSuccess(false);
  };

  const overwriteTemplate = () => {
    if (!activeTemplateName) return;
    // eslint-disable-next-line no-unused-vars
    const { activeTemplateName: _omit, ...configToSave } = virtualConfig;
    const next = (virtualTemplates || []).map(t =>
      t.name === activeTemplateName ? { name: activeTemplateName, config: configToSave } : t
    );
    actions.setVirtualTemplates(next);
    setTemplateDirty(false); showSuccess();
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    // eslint-disable-next-line no-unused-vars
    const { activeTemplateName: _omit, ...configToSave } = virtualConfig;
    const newTemplate = { name, config: configToSave };
    const existing = (virtualTemplates || []).findIndex(t => t.name === name);
    const next = existing >= 0
      ? (virtualTemplates || []).map((t, i) => i === existing ? newTemplate : t)
      : [...(virtualTemplates || []), newTemplate];
    actions.setVirtualTemplates(next);
    actions.setVirtualConfig({ ...virtualConfig, activeTemplateName: name });
    setTemplateDirty(false); setTemplateName(''); showSuccess();
  };

  const deleteTemplate = (name) => {
    actions.setVirtualTemplates((virtualTemplates || []).filter(t => t.name !== name));
    if (activeTemplateName === name) {
      actions.setVirtualConfig({ ...virtualConfig, activeTemplateName: null });
      setTemplateDirty(false);
    }
  };

  const copyUrl = () => {
    const url = getVirtualUrl();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const VIRTUAL_URL = getVirtualUrl();
  const vc            = virtualConfig;
  const fontSizePx    = vc?.fontSizePx     ?? 48;
  const fontBold      = vc?.fontBold       ?? false;
  const fontItalic    = vc?.fontItalic     ?? false;
  const fontColor     = vc?.fontColor      ?? '#ffffff';
  const fontStrokeWidth = vc?.fontStrokeWidth ?? 0;
  const fontStrokeColor = vc?.fontStrokeColor ?? '#000000';
  const alignX        = vc?.alignX         ?? 'center';
  const alignY        = vc?.alignY         ?? 'center';
  const textBg        = vc?.textBg         ?? false;
  const textBgColor   = vc?.textBgColor    ?? '#000000';
  const textBgOpacity = vc?.textBgOpacity  ?? 0.5;
  const textBgShape   = vc?.textBgShape    ?? 'rectangle';
  const textBgPadX    = vc?.textBgPadX    ?? 24;
  const textBgPadY    = vc?.textBgPadY    ?? 12;
  // Cita bíblica
  const bibleRefEnabled   = vc?.bibleRefEnabled   ?? false;
  const bibleRefFontSize  = vc?.bibleRefFontSize  ?? 24;
  const bibleRefBgColor   = vc?.bibleRefBgColor   ?? '#000000';
  const bibleRefBgShape   = vc?.bibleRefBgShape   ?? 'rounded';
  const bibleRefBgOpacity = vc?.bibleRefBgOpacity ?? 0.6;
  const bibleRefPosition  = vc?.bibleRefPosition  ?? 'bottom-right';
  const showVideo         = vc?.showVideo         ?? true;

  return (
    <div className="border-t border-surface-700">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
      >
        <div className="flex items-center gap-2"><Tv size={12} /> Virtual</div>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">

          {/* ── PLANTILLAS ─────────────────────────────────────────── */}
          <SubSection title="Plantillas">
            {activeTemplateName && (
              <div className="rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <LayoutTemplate size={11} className="text-accent shrink-0" />
                  <span className="text-[11px] text-zinc-300 flex-1 min-w-0 truncate">
                    <span className="text-accent font-semibold">{activeTemplateName}</span>
                  </span>
                  {saveSuccess ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-400 font-semibold shrink-0">
                      <Check size={11} /> Guardado
                    </span>
                  ) : (
                    <button onClick={overwriteTemplate} disabled={!templateDirty}
                      className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-35 disabled:cursor-not-allowed transition-colors">
                      <Save size={9} /> Guardar
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-1">
              <input type="text" value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveTemplate()}
                placeholder={activeTemplateName ? 'Guardar con otro nombre…' : 'Nombre de plantilla'}
                className="flex-1 bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-2 py-1.5 placeholder-zinc-500 focus:outline-none focus:border-accent" />
              <button onClick={saveTemplate} disabled={!templateName.trim()}
                className="px-2 py-1.5 rounded bg-accent text-white text-xs hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Save size={12} />
              </button>
            </div>
            {(virtualTemplates?.length > 0) && (
              <div className="mt-1">
                <button onClick={() => setTemplatesOpen(v => !v)}
                  className="w-full flex items-center justify-between text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors py-1">
                  <span>{virtualTemplates.length} plantilla{virtualTemplates.length !== 1 ? 's' : ''} guardada{virtualTemplates.length !== 1 ? 's' : ''}</span>
                  {templatesOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                {templatesOpen && (
                  <div className="space-y-1 mt-1">
                    {virtualTemplates.map(t => (
                      <div key={t.name} className="flex items-center gap-1">
                        <button onClick={() => applyTemplate(t)}
                          className="flex-1 flex items-center gap-1.5 text-xs text-zinc-300 bg-surface-600 hover:bg-surface-500 rounded px-2 py-1.5 transition-colors text-left">
                          <BookOpen size={10} className="shrink-0 text-accent" />
                          <span className="truncate flex-1">{t.name}</span>
                        </button>
                        <button onClick={() => deleteTemplate(t.name)}
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-surface-600 transition-colors">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SubSection>

          {/* ── PLANTILLA BÍBLICA ──────────────────────────────────── */}
          {(virtualTemplates?.length > 0) && (
            <SubSection title="Auto: Plantilla bíblica">
              <div className="flex items-center gap-1.5">
                <select
                  value={bibleTemplateName}
                  onChange={e => update({ bibleTemplateName: e.target.value })}
                  className="flex-1 bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-2 py-1.5 focus:outline-none focus:border-accent">
                  <option value="">— Desactivado —</option>
                  {(virtualTemplates || []).map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Se aplica automáticamente al mostrar una cita bíblica y restaura la anterior al salir.
              </p>
            </SubSection>
          )}

          {/* ── URL OBS ────────────────────────────────────────────── */}
          <SubSection title="OBS Browser Source">
            <div className="flex items-center gap-1.5 bg-surface-700 rounded px-2 py-1.5">
              <span className="text-[10px] text-zinc-300 flex-1 truncate font-mono">{VIRTUAL_URL}</span>
              <button onClick={copyUrl} className="text-zinc-400 hover:text-accent transition-colors shrink-0">
                {copied ? <CheckCheck size={13} className="text-green-400" /> : <Copy size={13} />}
              </button>
            </div>
            <ToggleRow label="Reproducir video" value={showVideo} onChange={v => update({ showVideo: v })} />
          </SubSection>

          {/* ── FONDO ──────────────────────────────────────────────── */}
          <SubSection title="Modo de fondo">
            <div className="flex flex-col gap-1">
              {BG_TYPES.map(({ value, label, desc }) => (
                <button key={value}
                  onClick={() => update({ background: { ...vc.background, type: value } })}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                    vc.background.type === value
                      ? 'bg-accent/20 text-accent border border-accent/40'
                      : 'bg-surface-600 text-zinc-300 hover:bg-surface-500 border border-transparent'
                  }`}>
                  <span className="font-medium">{label}</span>
                  <span className="text-zinc-500 text-[10px]">{desc}</span>
                </button>
              ))}
            </div>
            {vc.background.type === 'color' && (
              <ColorRow label="Color de fondo"
                value={vc.background.color ?? '#000000'}
                onChange={v => update({ background: { type: 'color', color: v } })} />
            )}
            {vc.background.type === 'chromakey' && (
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  {CHROMA_PRESETS.map(({ color, label }) => (
                    <button key={color} title={label}
                      onClick={() => update({ chromaColor: color })}
                      className={`flex-1 h-7 rounded border-2 transition-all ${
                        vc.chromaColor === color ? 'border-white scale-105' : 'border-surface-600 hover:border-zinc-400'
                      }`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
                <ColorRow label="Color personalizado" value={vc.chromaColor ?? '#00b140'}
                  onChange={v => update({ chromaColor: v })} />
              </div>
            )}
          </SubSection>

          {/* ── TIPOGRAFÍA ─────────────────────────────────────────── */}
          <SubSection title="Tipografía">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500">Tamaño (px)</span>
              <div className="flex items-center gap-2">
                <input type="range" min={12} max={200} step={2} value={fontSizePx}
                  onChange={e => update({ fontSizePx: Number(e.target.value) })}
                  className="flex-1 accent-accent h-1.5 rounded-full" />
                <span className="text-xs text-zinc-200 w-10 text-right">{fontSizePx}px</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {FONT_SIZES_PRESETS.map(p => (
                  <button key={p} onClick={() => update({ fontSizePx: p })}
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      fontSizePx === p ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
                    }`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => update({ fontBold: !fontBold })}
                className={`flex-1 py-1.5 text-xs rounded font-bold transition-colors ${
                  fontBold ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                }`}><span style={{ fontWeight: 'bold' }}>N</span> Negrita</button>
              <button onClick={() => update({ fontItalic: !fontItalic })}
                className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                  fontItalic ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                }`}><span style={{ fontStyle: 'italic' }}>I</span> Cursiva</button>
            </div>
            <ColorRow label="Color de letra" value={fontColor} onChange={v => update({ fontColor: v })} />
          </SubSection>

          {/* ── BORDE DE TEXTO ─────────────────────────────────────── */}
          <SubSection title="Borde de texto">
            <SizeRow label="Grosor" value={fontStrokeWidth}
              onChange={v => update({ fontStrokeWidth: v })} min={0} max={20} />
            {fontStrokeWidth > 0 && (
              <ColorRow label="Color borde" value={fontStrokeColor}
                onChange={v => update({ fontStrokeColor: v })} />
            )}
          </SubSection>

          {/* ── ALINEACIÓN ─────────────────────────────────────────── */}
          <SubSection title="Alineación">
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500">Horizontal</span>
              <div className="grid grid-cols-3 gap-1">
                {ALIGN_X.map(({ value, label }) => (
                  <button key={value} onClick={() => update({ alignX: value })}
                    className={`py-1.5 text-[10px] rounded transition-colors ${
                      alignX === value ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
                    }`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-zinc-500">Vertical</span>
              <div className="grid grid-cols-3 gap-1">
                {ALIGN_Y.map(({ value, label }) => (
                  <button key={value} onClick={() => update({ alignY: value })}
                    className={`py-1.5 text-[10px] rounded transition-colors ${
                      alignY === value ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
                    }`}>{label}</button>
                ))}
              </div>
            </div>
          </SubSection>

          {/* ── FONDO DE TEXTO ─────────────────────────────────────── */}
          <SubSection title="Fondo del texto">
            <ToggleRow label="Mostrar fondo" value={textBg} onChange={v => update({ textBg: v })} />
            {textBg && (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500">Forma</span>
                  <div className="grid grid-cols-3 gap-1">
                    {BG_SHAPES.map(({ value, label }) => (
                      <button key={value} onClick={() => update({ textBgShape: value })}
                        className={`py-1.5 text-[10px] rounded transition-colors ${
                          textBgShape === value ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
                        }`}>{label}</button>
                    ))}
                  </div>
                </div>
                <ColorRow label="Color fondo" value={textBgColor} onChange={v => update({ textBgColor: v })} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-300 shrink-0">Opacidad</span>
                  <div className="flex items-center gap-2 flex-1">
                    <input type="range" min={0} max={1} step={0.05} value={textBgOpacity}
                      onChange={e => update({ textBgOpacity: parseFloat(e.target.value) })}
                      className="flex-1 accent-accent h-1.5 rounded-full" />
                    <span className="text-xs text-zinc-200 w-9 text-right">{Math.round(textBgOpacity * 100)}%</span>
                  </div>
                </div>
                <SizeRow label="Relleno horiz." value={textBgPadX} onChange={v => update({ textBgPadX: v })} min={0} max={120} />
                <SizeRow label="Relleno vert."  value={textBgPadY} onChange={v => update({ textBgPadY: v })} min={0} max={80}  />
              </>
            )}
          </SubSection>

          {/* ── CITA BÍBLICA (sólo cuando la plantilla activa ES la plantilla bíblica) ── */}
          {bibleTemplateName && activeTemplateName === bibleTemplateName && (
            <SubSection title="Cita Bíblica (referencia)">
              <ToggleRow label="Activar cita bíblica" value={bibleRefEnabled}
                onChange={v => update({ bibleRefEnabled: v })} />
              {bibleRefEnabled && (
                <>
                  {/* Fondo de la cita */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500">Fondo de la cita</span>
                    <div className="grid grid-cols-3 gap-1">
                      {BG_SHAPES.map(({ value, label }) => (
                        <button key={value} onClick={() => update({ bibleRefBgShape: value })}
                          className={`py-1.5 text-[10px] rounded transition-colors ${
                            bibleRefBgShape === value ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
                          }`}>{label}</button>
                      ))}
                    </div>
                    <ColorRow label="Color fondo cita" value={bibleRefBgColor}
                      onChange={v => update({ bibleRefBgColor: v })} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-zinc-300 shrink-0">Opacidad</span>
                      <div className="flex items-center gap-2 flex-1">
                        <input type="range" min={0} max={1} step={0.05} value={bibleRefBgOpacity}
                          onChange={e => update({ bibleRefBgOpacity: parseFloat(e.target.value) })}
                          className="flex-1 accent-accent h-1.5 rounded-full" />
                        <span className="text-xs text-zinc-200 w-9 text-right">{Math.round(bibleRefBgOpacity * 100)}%</span>
                      </div>
                    </div>
                  </div>
                  {/* Posición */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500">Posición respecto al versículo</span>
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { value: 'top-left',    label: '↖ Sup Izq' },
                        { value: 'top-center',  label: '↑ Sup Cen' },
                        { value: 'top-right',   label: '↗ Sup Der' },
                        { value: 'bottom-left', label: '↙ Inf Izq' },
                        { value: 'bottom-center', label: '↓ Inf Cen' },
                        { value: 'bottom-right',  label: '↘ Inf Der' },
                      ].map(({ value, label }) => (
                        <button key={value} onClick={() => update({ bibleRefPosition: value })}
                          className={`py-1.5 text-[9px] rounded transition-colors ${
                            bibleRefPosition === value ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
                          }`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {/* Tamaño de letra */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500">Tamaño letra cita (px)</span>
                    <div className="flex items-center gap-2">
                      <input type="range" min={10} max={80} step={1} value={bibleRefFontSize}
                        onChange={e => update({ bibleRefFontSize: Number(e.target.value) })}
                        className="flex-1 accent-accent h-1.5 rounded-full" />
                      <span className="text-xs text-zinc-200 w-10 text-right">{bibleRefFontSize}px</span>
                    </div>
                  </div>
                </>
              )}
            </SubSection>
          )}

          {/* ── CONTENIDO ──────────────────────────────────────────── */}
          <SubSection title="Contenido">
            <ToggleRow label="Mostrar comentarios (//)" value={vc.showComments ?? false}
              onChange={v => update({ showComments: v })} />
          </SubSection>

        </div>
      )}
    </div>
  );
}


import { useState, useRef } from 'react';
import { usePresenter } from '../../context/usePresenter';
import {
  Clock, Eye, EyeOff, ChevronDown, ChevronUp, Type,
  Hash, Tag, AlignLeft, Rows2, Music2, Plus, X, Save, BookOpen, Check, LayoutTemplate, Film,
} from 'lucide-react';

function injectGoogleFont(name) {
  const id = `gf-${name.toLowerCase().replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/\s+/g, '+')}&display=swap`;
  document.head.appendChild(link);
}

const BG_PRESETS = [
  { color: '#000000', label: 'Negro' },
  { color: '#0d1117', label: 'Negro suave' },
  { color: '#1e1e2e', label: 'Oscuro azulado' },
  { color: '#1a1a1a', label: 'Gris oscuro' },
  { color: '#0f2027', label: 'Teal oscuro' },
  { color: '#1a0a2e', label: 'Violeta oscuro' },
];

const FONT_FAMILIES = [
  { value: 'sans',      label: 'Sans Serif' },
  { value: 'serif',     label: 'Serif' },
  { value: 'mono',      label: 'Monospace' },
  { value: 'condensed', label: 'Condensada' },
];

export default function StageControls({ defaultOpen = false }) {
  const { state, actions } = usePresenter();
  const { stageConfig, stageTemplates = [] } = state;
  const [open, setOpen] = useState(defaultOpen);
  const [fontInput, setFontInput] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [saveSuccess,   setSaveSuccess]   = useState(false);
  const successTimer = useRef(null);

  // Plantilla activa persistida en stageConfig
  const activeTemplateName = stageConfig?.activeTemplateName ?? null;

  const showSuccess = () => {
    setSaveSuccess(true);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSaveSuccess(false), 2500);
  };

  const applyTemplate = (t) => {
    actions.setStageConfig({ ...t.config, activeTemplateName: t.name });
    setTemplateDirty(false);
    setSaveSuccess(false);
  };

  const overwriteTemplate = () => {
    if (!activeTemplateName) return;
    // eslint-disable-next-line no-unused-vars
    const { activeTemplateName: _omit, ...configToSave } = stageConfig;
    const next = stageTemplates.map(t => t.name === activeTemplateName ? { name: activeTemplateName, config: configToSave } : t);
    actions.setStageTemplates(next);
    setTemplateDirty(false);
    showSuccess();
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    // eslint-disable-next-line no-unused-vars
    const { activeTemplateName: _omit, ...configToSave } = stageConfig;
    const newTemplate = { name, config: configToSave };
    const existing = stageTemplates.findIndex(t => t.name === name);
    const next = existing >= 0
      ? stageTemplates.map((t, i) => i === existing ? newTemplate : t)
      : [...stageTemplates, newTemplate];
    actions.setStageTemplates(next);
    actions.setStageConfig({ ...stageConfig, activeTemplateName: name });
    setTemplateDirty(false);
    setTemplateName('');
    showSuccess();
  };

  const deleteTemplate = (name) => {
    actions.setStageTemplates(stageTemplates.filter(t => t.name !== name));
    if (activeTemplateName === name) {
      actions.setStageConfig({ ...stageConfig, activeTemplateName: null });
      setTemplateDirty(false);
    }
  };

  const update = (patch) => {
    actions.setStageConfig({ ...stageConfig, ...patch });
    if (activeTemplateName) {
      setTemplateDirty(true);
      setSaveSuccess(false);
    }
  };

  const {
    showClock, showNextSlide, showSongTitle, showSlideCounter,
    showSectionLabel, showSideLabel,
    lyricsColor, nextLyricsColor, chordsColor, clockColor, nextColor,
    fontFamily, fontBold, fontItalic,
    fontSizeCounter    = 14,
    fontSizeTitle      = 16,
    fontSizeLabel      = 11,
    fontSizeSideLabel  = 13,
    fontSizeClock      = 22,
    fontSizeNextSong   = 16,
    fontSizeNextLyrics = 32,
    fontSize           = 36,
    fontSizeChords     = 18,
    fontFamilyTitle    = 'sans',
    fontStrokeWidth    = 0,
    fontStrokeColor    = '#000000',
    customFonts = [],
    // Comentarios de director (líneas //)
    showComments        = false,
    commentColor        = '#facc15',
    commentFontFamily   = 'sans',
    commentFontSize     = 16,
    showVideo           = true,
  } = stageConfig;

  const addFont = () => {
    const name = fontInput.trim();
    if (!name) return;
    if (customFonts.includes(name)) { setFontInput(''); return; }
    injectGoogleFont(name);
    update({ customFonts: [...customFonts, name] });
    setFontInput('');
  };

  const removeFont = (name) => {
    const next = customFonts.filter(f => f !== name);
    // Si la fuente activa es la eliminada, volver a sans
    const nextFamily = fontFamily === name ? 'sans' : fontFamily;
    update({ customFonts: next, fontFamily: nextFamily });
  };

  // Combinar presets + fuentes personalizadas
  const allFontFamilies = [
    ...FONT_FAMILIES,
    ...customFonts.map(f => ({ value: f, label: f, custom: true })),
  ];

  return (
    <div className="border-t border-surface-700">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
      >
        <span className="flex items-center gap-1.5"><Type size={12} /> Escenario</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">

          {/* PLANTILLAS */}
          <SubSection title="Plantillas">
            {/* Banner plantilla activa */}
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
                    <button
                      onClick={overwriteTemplate}
                      disabled={!templateDirty}
                      title="Sobreescribir esta plantilla con la configuración actual"
                      className="flex items-center gap-1 shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save size={9} /> Guardar
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveTemplate()}
                placeholder={activeTemplateName ? 'Guardar con otro nombre…' : 'Nombre de plantilla'}
                className="flex-1 bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-2 py-1.5 placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
              <button
                onClick={saveTemplate}
                disabled={!templateName.trim()}
                title="Guardar plantilla"
                className="px-2 py-1.5 rounded bg-accent text-white text-xs hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Save size={12} />
              </button>
            </div>

            {stageTemplates.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setTemplatesOpen(v => !v)}
                  className="w-full flex items-center justify-between text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                >
                  <span>{stageTemplates.length} plantilla{stageTemplates.length !== 1 ? 's' : ''} guardada{stageTemplates.length !== 1 ? 's' : ''}</span>
                  {templatesOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                {templatesOpen && (
                  <div className="space-y-1 mt-1">
                    {stageTemplates.map(t => (
                      <div key={t.name} className="flex items-center gap-1">
                        <button
                          onClick={() => applyTemplate(t)}
                          className="flex-1 flex items-center gap-1.5 text-xs text-zinc-300 bg-surface-600 hover:bg-surface-500 rounded px-2 py-1.5 truncate transition-colors text-left"
                        >
                          <BookOpen size={10} className="shrink-0 text-accent" />
                          <span className="truncate">{t.name}</span>
                        </button>
                        <button
                          onClick={() => deleteTemplate(t.name)}
                          className="p-1.5 rounded text-zinc-500 hover:text-red-400 hover:bg-surface-600 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SubSection>

          {/* MOSTRAR / OCULTAR */}
          <SubSection title="Mostrar / Ocultar">
            <ToggleRow icon={<Music2 size={12} />}    label="Título canción"    value={showSongTitle    ?? true}  onChange={v => update({ showSongTitle: v })} />
            <ToggleRow icon={<Hash size={12} />}       label="Contador slides"   value={showSlideCounter ?? true}  onChange={v => update({ showSlideCounter: v })} />
            <ToggleRow icon={<AlignLeft size={12} />}  label="Etiqueta lateral"  value={showSideLabel    ?? true}  onChange={v => update({ showSideLabel: v })} />
            <ToggleRow icon={<Rows2 size={12} />}      label="Siguiente slide"   value={showNextSlide    ?? true}  onChange={v => update({ showNextSlide: v })} />
            <ToggleRow icon={<Clock size={12} />}      label="Reloj"             value={showClock        ?? true}  onChange={v => update({ showClock: v })} />
            <ToggleRow icon={<Film size={12} />}       label="Reproducir video"  value={showVideo        ?? true}  onChange={v => update({ showVideo: v })} />
          </SubSection>

          {/* TIPOGRAFÍA */}
          <SubSection title="Tipografía">
            <p className="text-[10px] text-zinc-500 mb-1">Fuente letras</p>
            <div className="grid grid-cols-2 gap-1 mb-2">
              {allFontFamilies.map(({ value, label, custom }) => (
                <div key={value} className="relative">
                  <button
                    onClick={() => update({ fontFamily: value })}
                    className={`w-full py-1.5 text-xs rounded transition-colors font-medium pr-5 ${
                      (fontFamily ?? 'sans') === value
                        ? 'bg-accent text-white'
                        : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                    }`}
                    style={custom ? { fontFamily: `'${label}', sans-serif` } : {}}
                  >
                    {label}
                  </button>
                  {custom && (
                    <button
                      onClick={() => removeFont(value)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-red-400 transition-colors"
                    >
                      <X size={9} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mb-1 mt-2">Fuente títulos</p>
            <div className="grid grid-cols-2 gap-1 mb-2">
              {allFontFamilies.map(({ value, label, custom }) => (
                <div key={value} className="relative">
                  <button
                    onClick={() => update({ fontFamilyTitle: value })}
                    className={`w-full py-1.5 text-xs rounded transition-colors font-medium pr-5 ${
                      (fontFamilyTitle ?? 'sans') === value
                        ? 'bg-accent text-white'
                        : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                    }`}
                    style={custom ? { fontFamily: `'${label}', sans-serif` } : {}}
                  >
                    {label}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mb-2">
              <button
                onClick={() => update({ fontBold: !fontBold })}
                className={`flex-1 py-1.5 text-xs rounded font-bold transition-colors ${
                  fontBold ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                }`}
              >
                <span style={{ fontWeight: 'bold' }}>N</span> Negrita
              </button>
              <button
                onClick={() => update({ fontItalic: !fontItalic })}
                className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                  fontItalic ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                }`}
              >
                <span style={{ fontStyle: 'italic' }}>I</span> Cursiva
              </button>
            </div>
          </SubSection>

          {/* TAMAÑOS */}
          <SubSection title="Tamaños">
            <SizeRow label="Letras (actual)"   value={fontSize            ?? 36} onChange={v => update({ fontSize: v })} />
            <SizeRow label="Acordes"            value={fontSizeChords      ?? 18} onChange={v => update({ fontSizeChords: v })} />
            <SizeRow label="Letras (sig.)"      value={fontSizeNextLyrics  ?? 32} onChange={v => update({ fontSizeNextLyrics: v })} />
            <SizeRow label="Título canción"     value={fontSizeTitle       ?? 16} onChange={v => update({ fontSizeTitle: v })} />
            <SizeRow label="Contador"           value={fontSizeCounter     ?? 14} onChange={v => update({ fontSizeCounter: v })} />
            <SizeRow label="Franja lateral"     value={fontSizeSideLabel   ?? 13} onChange={v => update({ fontSizeSideLabel: v })} />
            <SizeRow label="Próx. canción"      value={fontSizeNextSong    ?? 16} onChange={v => update({ fontSizeNextSong: v })} />
            <SizeRow label="Reloj"              value={fontSizeClock       ?? 22} onChange={v => update({ fontSizeClock: v })} />
          </SubSection>

          {/* FUENTES PERSONALIZADAS */}
          <SubSection title="Fuentes (Google Fonts)">
            <div className="flex gap-1">
              <input
                type="text"
                value={fontInput}
                onChange={e => setFontInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFont()}
                placeholder="Ej: Montserrat"
                className="flex-1 bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-2 py-1.5 placeholder-zinc-500 focus:outline-none focus:border-accent"
              />
              <button
                onClick={addFont}
                disabled={!fontInput.trim()}
                className="px-2 py-1.5 rounded bg-accent text-white text-xs hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={12} />
              </button>
            </div>
            {customFonts.length === 0 && (
              <p className="text-[10px] text-zinc-600 mt-1">
                Escribe el nombre exacto de una fuente de Google Fonts
              </p>
            )}
          </SubSection>

          {/* COLORES */}
          <SubSection title="Colores">
            <ColorRow label="Letra"              value={lyricsColor     ?? '#ffffff'} onChange={v => update({ lyricsColor: v })} />
            <ColorRow label="Letra Próx. Diap."  value={nextLyricsColor ?? '#ffffff'} onChange={v => update({ nextLyricsColor: v })} />
            <ColorRow label="Acordes"             value={chordsColor     ?? '#fde047'} onChange={v => update({ chordsColor: v })} />
            <ColorRow label="Reloj"               value={clockColor      ?? '#ef4444'} onChange={v => update({ clockColor: v })} />
            <ColorRow label="Próx. canción"       value={nextColor       ?? '#22c55e'} onChange={v => update({ nextColor: v })} />
          </SubSection>

          {/* COMENTARIOS DE DIRECTOR */}
          <SubSection title="Comentarios (//)">
            <ToggleRow
              icon={null}
              label="Mostrar en pantalla"
              value={showComments}
              onChange={v => update({ showComments: v })}
            />
            {showComments && (
              <>
                <ColorRow label="Color" value={commentColor ?? '#facc15'} onChange={v => update({ commentColor: v })} />
                <SizeRow  label="Tamaño" value={commentFontSize ?? 16} onChange={v => update({ commentFontSize: v })} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-300 shrink-0">Fuente</span>
                  <select
                    value={commentFontFamily ?? 'sans'}
                    onChange={e => update({ commentFontFamily: e.target.value })}
                    className="bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-1.5 py-1 focus:outline-none focus:border-accent"
                  >
                    {allFontFamilies.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </SubSection>

          {/* BORDE DE TEXTO */}
          <SubSection title="Borde de texto">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-300 shrink-0">Grosor</span>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={fontStrokeWidth}
                  onChange={e => update({ fontStrokeWidth: Number(e.target.value) })}
                  className="flex-1 accent-accent"
                />
                <span className="text-xs text-zinc-400 w-6 text-right">{fontStrokeWidth}px</span>
              </div>
            </div>
            {fontStrokeWidth > 0 && (
              <ColorRow label="Color borde" value={fontStrokeColor} onChange={v => update({ fontStrokeColor: v })} />
            )}
          </SubSection>

          {/* FONDO */}
          <SubSection title="Fondo">
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
            </div>
            <div className="mt-1.5 relative">
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
          </SubSection>

        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function SubSection({ title, children }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ToggleRow({ icon, label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-zinc-300">
        {icon}{label}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${
          value ? 'bg-accent/20 text-accent' : 'bg-surface-600 text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {value ? <Eye size={10} /> : <EyeOff size={10} />}
        {value ? 'On' : 'Off'}
      </button>
    </div>
  );
}

function SizeRow({ label, value, onChange }) {
  const PT_OPTIONS = [8,9,10,11,12,13,14,16,18,20,22,24,26,28,32,36,40,48,56,64,72,80,96];
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-300 truncate shrink-0">{label}</span>
      <select
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-1.5 py-1 focus:outline-none focus:border-accent"
      >
        {PT_OPTIONS.map(pt => (
          <option key={pt} value={pt}>{pt}pt</option>
        ))}
      </select>
    </div>
  );
}

function ColorRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-300">{label}</span>
      <label className="flex items-center gap-1.5 cursor-pointer group">
        <span className="text-[10px] text-zinc-500 font-mono group-hover:text-zinc-300 transition-colors">
          {value?.toUpperCase()}
        </span>
        <div
          className="w-6 h-6 rounded border-2 border-surface-500 hover:border-zinc-300 transition-colors shrink-0"
          style={{ backgroundColor: value }}
        />
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="sr-only" />
      </label>
    </div>
  );
}

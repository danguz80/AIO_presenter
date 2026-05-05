import { useState } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { ChevronDown, ChevronUp, Monitor, Save, BookOpen, X } from 'lucide-react';
import GoogleFontPicker from '../shared/GoogleFontPicker';
import { resolveFont } from '../../utils/fontUtils';

// ─── Componentes UI reutilizables ─────────────────────────────────────────────
function SubSection({ title, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{title}</p>
      {children}
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

/** Slider + input numérico para tamaños de fuente grandes (proyector) */
function FontSizeControl({ value, onChange, min = 10, max = 300 }) {
  const [raw, setRaw] = useState('');
  const [editing, setEditing] = useState(false);

  const commit = (str) => {
    const n = parseInt(str, 10);
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
    setEditing(false);
    setRaw('');
  };

  const PRESETS = [24, 36, 48, 60, 72, 96, 120, 144];

  return (
    <div className="space-y-2">
      {/* Slider */}
      <div className="flex items-center gap-2">
        <input
          type="range" min={min} max={max} step={1} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-accent h-1.5 rounded-full"
        />
        {/* Input numérico editable */}
        {editing ? (
          <input
            autoFocus
            type="number" min={min} max={max}
            value={raw}
            onChange={e => setRaw(e.target.value)}
            onBlur={() => commit(raw)}
            onKeyDown={e => { if (e.key === 'Enter') commit(raw); if (e.key === 'Escape') { setEditing(false); setRaw(''); } }}
            className="w-14 bg-surface-600 border border-accent text-xs text-zinc-200 rounded px-1.5 py-1 text-center focus:outline-none"
          />
        ) : (
          <button
            onClick={() => { setEditing(true); setRaw(String(value)); }}
            className="w-14 bg-surface-600 border border-surface-500 text-xs text-zinc-200 rounded px-1.5 py-1 text-center hover:border-accent transition-colors"
            title="Haz clic para escribir un valor exacto"
          >
            {value}px
          </button>
        )}
      </div>
      {/* Presets rápidos */}
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              value === p ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
            }`}
          >{p}</button>
        ))}
      </div>
    </div>
  );
}

/** Botones +/− para tamaños pequeños (comentarios, etc.) */
function SizeRow({ label, value, onChange, min = 8, max = 120 }) {
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

// ─── OutputControls ───────────────────────────────────────────────────────────
export default function OutputControls({ defaultOpen = false }) {
  const { state, actions } = usePresenter();
  const { outputConfig, outputTemplates = [] } = state;
  const [open, setOpen]           = useState(defaultOpen);
  const [templateName, setTemplateName] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const update = (patch) => actions.setOutputConfig({ ...outputConfig, ...patch });

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const existing = outputTemplates.findIndex(t => t.name === name);
    const newTemplate = { name, config: { ...outputConfig } };
    const next = existing >= 0
      ? outputTemplates.map((t, i) => i === existing ? newTemplate : t)
      : [...outputTemplates, newTemplate];
    actions.setOutputTemplates(next);
    setTemplateName('');
  };

  const applyTemplate = (t) => actions.setOutputConfig({ ...outputConfig, ...t.config });

  const deleteTemplate = (name) =>
    actions.setOutputTemplates(outputTemplates.filter(t => t.name !== name));

  // Valores con defaults
  const lyricsColor     = outputConfig?.lyricsColor     ?? '#ffffff';
  const fontFamily      = outputConfig?.fontFamily      ?? 'sans';
  const fontBold        = outputConfig?.fontBold        ?? false;
  const fontItalic      = outputConfig?.fontItalic      ?? false;
  const fontStrokeWidth = outputConfig?.fontStrokeWidth ?? 0;
  const fontStrokeColor = outputConfig?.fontStrokeColor ?? '#000000';
  const showLabel       = outputConfig?.showLabel       ?? true;
  const showSongTitle   = outputConfig?.showSongTitle   ?? true;
  const showComments    = outputConfig?.showComments    ?? false;
  const commentColor    = outputConfig?.commentColor    ?? '#facc15';
  const commentFontSize = outputConfig?.commentFontSize ?? 16;
  const commentFamily   = outputConfig?.commentFontFamily ?? 'sans';

  // Diapositiva de título
  const titleSlideEnabled = outputConfig?.titleSlideEnabled ?? false;
  const titleFontFamily   = outputConfig?.titleFontFamily   ?? 'sans';
  const titleFontSize     = outputConfig?.titleFontSize     ?? 72;
  const titleColor        = outputConfig?.titleColor        ?? '#ffffff';
  const titleShowArtist   = outputConfig?.titleShowArtist   ?? false;
  const artistFontFamily  = outputConfig?.artistFontFamily  ?? 'sans';
  const artistFontSize    = outputConfig?.artistFontSize    ?? 36;
  const artistColor       = outputConfig?.artistColor       ?? '#aaaaaa';

  // fontSize: 'auto' o número
  const fontSizeIsAuto = !outputConfig?.fontSize || outputConfig.fontSize === 'auto';
  const fontSizeValue  = fontSizeIsAuto ? 48 : Number(outputConfig.fontSize);

  return (
    <div className="border-t border-surface-700">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-200 transition-colors"
      >
        <div className="flex items-center gap-2"><Monitor size={12} /> Principal (Proyector)</div>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4">

          {/* ── PLANTILLAS ─────────────────────────────────────────── */}
          <SubSection title="Plantillas">
            <div className="flex gap-1">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveTemplate()}
                placeholder="Nombre de plantilla"
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

            {outputTemplates.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setTemplatesOpen(v => !v)}
                  className="w-full flex items-center justify-between text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                >
                  <span>{outputTemplates.length} plantilla{outputTemplates.length !== 1 ? 's' : ''} guardada{outputTemplates.length !== 1 ? 's' : ''}</span>
                  {templatesOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                {templatesOpen && (
                  <div className="space-y-1 mt-1">
                    {outputTemplates.map(t => (
                      <div key={t.name} className="flex items-center gap-1">
                        <button
                          onClick={() => applyTemplate(t)}
                          className="flex-1 flex items-center gap-1.5 text-xs text-zinc-300 bg-surface-600 hover:bg-surface-500 rounded px-2 py-1.5 transition-colors text-left"
                        >
                          <BookOpen size={10} className="shrink-0 text-accent" />
                          <span
                            className="truncate flex-1"
                            style={{ fontFamily: resolveFont(t.config?.fontFamily ?? 'sans') }}
                          >
                            {t.name}
                          </span>
                          {t.config?.fontFamily && t.config.fontFamily !== 'sans' && (
                            <span className="shrink-0 text-[9px] text-zinc-500" style={{ fontFamily: 'system-ui' }}>
                              {t.config.fontFamily}
                            </span>
                          )}
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

          {/* ── MOSTRAR / OCULTAR ──────────────────────────────────── */}
          <SubSection title="Mostrar / Ocultar">
            <ToggleRow label="Etiqueta de sección" value={showLabel}     onChange={v => update({ showLabel: v })} />
            <ToggleRow label="Título de canción"   value={showSongTitle} onChange={v => update({ showSongTitle: v })} />
          </SubSection>

          {/* ── TIPOGRAFÍA ─────────────────────────────────────────── */}
          <SubSection title="Tipografía">
            <GoogleFontPicker label="Fuente" value={fontFamily} onChange={v => update({ fontFamily: v })} />
            <div className="flex gap-1.5 mt-1">
              <button
                onClick={() => update({ fontBold: !fontBold })}
                className={`flex-1 py-1.5 text-xs rounded font-bold transition-colors ${fontBold ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
              >
                <span style={{ fontWeight: 'bold' }}>N</span> Negrita
              </button>
              <button
                onClick={() => update({ fontItalic: !fontItalic })}
                className={`flex-1 py-1.5 text-xs rounded transition-colors ${fontItalic ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
              >
                <span style={{ fontStyle: 'italic' }}>I</span> Cursiva
              </button>
            </div>
          </SubSection>

          {/* ── TAMAÑO DE LETRA ────────────────────────────────────── */}
          <SubSection title="Tamaño de letra">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-300 shrink-0">Modo</span>
              <div className="flex gap-1">
                <button
                  onClick={() => update({ fontSize: 'auto' })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${fontSizeIsAuto ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
                >Auto</button>
                <button
                  onClick={() => update({ fontSize: fontSizeValue })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${!fontSizeIsAuto ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
                >Fijo</button>
              </div>
            </div>
            {fontSizeIsAuto && (
              <p className="text-[10px] text-zinc-500 leading-relaxed">El tamaño se ajusta automáticamente según el número de líneas.</p>
            )}
            {!fontSizeIsAuto && (
              <FontSizeControl value={fontSizeValue} onChange={v => update({ fontSize: v })} />
            )}
          </SubSection>

          {/* ── COLORES ────────────────────────────────────────────── */}
          <SubSection title="Colores">
            <ColorRow label="Letra" value={lyricsColor} onChange={v => update({ lyricsColor: v })} />
          </SubSection>

          {/* ── BORDE DE TEXTO ─────────────────────────────────────── */}
          <SubSection title="Borde de texto">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-300 shrink-0">Grosor</span>
              <div className="flex items-center gap-2 flex-1">
                <input type="range" min={0} max={12} step={1} value={fontStrokeWidth}
                  onChange={e => update({ fontStrokeWidth: Number(e.target.value) })}
                  className="flex-1 accent-accent" />
                <span className="text-xs text-zinc-400 w-6 text-right">{fontStrokeWidth}px</span>
              </div>
            </div>
            {fontStrokeWidth > 0 && (
              <ColorRow label="Color borde" value={fontStrokeColor}
                onChange={v => update({ fontStrokeColor: v })} />
            )}
          </SubSection>

          {/* ── COMENTARIOS (//) ───────────────────────────────────── */}
          <SubSection title="Comentarios (//)">
            <ToggleRow label="Mostrar en pantalla" value={showComments}
              onChange={v => update({ showComments: v })} />
            {showComments && (
              <>
                <ColorRow label="Color"  value={commentColor}    onChange={v => update({ commentColor: v })} />
                <SizeRow  label="Tamaño" value={commentFontSize} onChange={v => update({ commentFontSize: v })} />
                <GoogleFontPicker label="Fuente" value={commentFamily} onChange={v => update({ commentFontFamily: v })} />
              </>
            )}
          </SubSection>
          {/* ── DIAPOSITIVA DE TÍTULO ─────────────────────── */}
          <SubSection title="Diapositiva de título">
            <ToggleRow
              label="Mostrar al proyectar canción"
              value={titleSlideEnabled}
              onChange={v => update({ titleSlideEnabled: v })}
            />
            {titleSlideEnabled && (
              <>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Se muestra automáticamente al cargar una canción. Avanza con la flecha para ver las letras.
                </p>

                {/* Título */}
                <div className="mt-1 space-y-1.5 border-l-2 border-surface-600 pl-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Título</p>
                  <GoogleFontPicker label="Fuente" value={titleFontFamily}
                    onChange={v => update({ titleFontFamily: v })} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-300 shrink-0">Tamaño</span>
                    <div className="flex items-center gap-2 flex-1">
                      <input type="range" min={20} max={200} step={2} value={titleFontSize}
                        onChange={e => update({ titleFontSize: Number(e.target.value) })}
                        className="flex-1 accent-accent" />
                      <span className="text-xs text-zinc-400 w-8 text-right">{titleFontSize}px</span>
                    </div>
                  </div>
                  <ColorRow label="Color" value={titleColor}
                    onChange={v => update({ titleColor: v })} />
                </div>

                {/* Artista */}
                <div className="mt-2 space-y-1.5">
                  <ToggleRow label="Mostrar artista / autor"
                    value={titleShowArtist}
                    onChange={v => update({ titleShowArtist: v })} />
                  {titleShowArtist && (
                    <div className="space-y-1.5 border-l-2 border-surface-600 pl-2">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Artista</p>
                      <GoogleFontPicker label="Fuente" value={artistFontFamily}
                        onChange={v => update({ artistFontFamily: v })} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-300 shrink-0">Tamaño</span>
                        <div className="flex items-center gap-2 flex-1">
                          <input type="range" min={12} max={120} step={2} value={artistFontSize}
                            onChange={e => update({ artistFontSize: Number(e.target.value) })}
                            className="flex-1 accent-accent" />
                          <span className="text-xs text-zinc-400 w-8 text-right">{artistFontSize}px</span>
                        </div>
                      </div>
                      <ColorRow label="Color" value={artistColor}
                        onChange={v => update({ artistColor: v })} />
                    </div>
                  )}
                </div>
              </>
            )}
          </SubSection>
        </div>
      )}
    </div>
  );
}

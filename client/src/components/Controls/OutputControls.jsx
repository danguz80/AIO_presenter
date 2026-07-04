import { useState, useRef, useEffect, useCallback } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { ChevronDown, ChevronUp, Monitor, Save, BookOpen, X, Check, LayoutTemplate, Film, Image } from 'lucide-react';
import GoogleFontPicker from '../shared/GoogleFontPicker';
import { resolveFont } from '../../utils/fontUtils';
import api from '../../hooks/useApi';
import {
  FSA_SUPPORTED, listFolders as fsaListFolders, listMediaFiles,
  cacheMediaFile, generateThumbnail, verifyPermission,
} from '../../utils/fsaUtils';

const SERVER_BASE = (() => {
  const savedIp   = localStorage.getItem('aio_server_ip');
  const savedPort = localStorage.getItem('aio_server_port') || '3001';
  const host      = savedIp || window.location.hostname;
  return `http://${host}:${savedPort}`;
})();

// ─── Miniatura FSA rápida ──────────────────────────────────────────────────────
function FsaThumbMini({ file }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let canceled = false;
    generateThumbnail(file.handle, file.type).then(url => { if (!canceled) setSrc(url); }).catch(() => {});
    return () => { canceled = true; };
  }, [file.handle, file.type]);
  if (!src) return file.type === 'video'
    ? <Film size={16} className="text-zinc-400" />
    : <Image size={16} className="text-zinc-400" />;
  return <img src={src} alt={file.name} className="w-full h-full object-cover" />;
}

// ─── Selector de media FSA ─────────────────────────────────────────────────────
function MediaPickerModal({ onSelect, onClose }) {
  const [fsaFolders,  setFsaFolders]  = useState([]);
  const [selFolder,   setSelFolder]   = useState(null);
  const [files,       setFiles]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [selecting,   setSelecting]   = useState(null);
  const [permError,   setPermError]   = useState(false);

  useEffect(() => {
    if (!FSA_SUPPORTED) return;
    fsaListFolders().then(folders => {
      setFsaFolders(folders);
      if (folders.length > 0) setSelFolder(folders[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selFolder) return;
    setLoading(true);
    setPermError(false);
    (async () => {
      try {
        const perm = await selFolder.handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          const granted = await verifyPermission(selFolder.handle);
          if (granted !== 'granted') { setPermError(true); setLoading(false); return; }
        }
        setFiles(await listMediaFiles(selFolder.handle));
      } catch { setFiles([]); }
      finally { setLoading(false); }
    })();
  }, [selFolder]);

  const handleSelect = async (file) => {
    if (selecting) return;
    setSelecting(file.name);
    try {
      const cacheUrl = await cacheMediaFile(file.handle);
      onSelect({ mediaType: file.type, fileName: file.name, url: cacheUrl });
      onClose();
    } catch { /* ignore */ } finally { setSelecting(null); }
  };

  if (!FSA_SUPPORTED) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-800 border border-surface-600 rounded-xl shadow-2xl p-6 max-w-sm text-center" onClick={e => e.stopPropagation()}>
        <Film size={32} className="text-zinc-500 mx-auto mb-3" />
        <p className="text-sm text-zinc-300 mb-1">Tu navegador no soporta acceso directo a archivos.</p>
        <p className="text-xs text-zinc-500">Usa Chrome o Edge.</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-surface-600 text-zinc-300 rounded-lg text-sm hover:bg-surface-500">Cerrar</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface-800 border border-surface-600 rounded-xl shadow-2xl w-[520px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
          <span className="text-sm font-semibold text-zinc-200">Seleccionar fondo multimedia</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={15} /></button>
        </div>
        {fsaFolders.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            No hay carpetas configuradas.<br/>Agrega carpetas en el panel <strong>Multimedia</strong> primero.
          </div>
        ) : (
          <div className="flex gap-1 px-3 pt-2 flex-wrap shrink-0">
            {fsaFolders.map(f => (
              <button key={f.key} onClick={() => setSelFolder(f)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${selFolder?.key === f.key ? 'bg-accent/20 text-accent border-accent/40' : 'bg-surface-700 text-zinc-400 border-surface-600 hover:text-zinc-200'}`}
              >{f.name}</button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3">
          {permError ? (
            <p className="text-xs text-amber-400 text-center py-6">Sin permiso para leer esta carpeta.<br/>Cierra y vuelve a abrir el selector.</p>
          ) : loading ? (
            <p className="text-xs text-zinc-500 text-center py-6">Cargando...</p>
          ) : files.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">Sin archivos en esta carpeta</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {files.map(file => (
                <button key={file.name} onClick={() => handleSelect(file)} disabled={!!selecting}
                  className="relative aspect-video rounded-lg overflow-hidden border-2 border-surface-600 hover:border-accent bg-surface-700 flex items-center justify-center group disabled:opacity-50"
                  title={file.name}
                >
                  <FsaThumbMini file={file} />
                  {selecting === file.name && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><span className="text-xs text-white">...</span></div>}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
                    {file.type === 'video' ? <Film size={16} className="text-white opacity-0 group-hover:opacity-100" /> : <Image size={16} className="text-white opacity-0 group-hover:opacity-100" />}
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <p className="text-[8px] text-white truncate">{file.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componentes UI reutilizables ─────────────────────────────────────────────
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
  const [open, setOpen]             = useState(defaultOpen);
  const [templateName, setTemplateName] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [saveSuccess,   setSaveSuccess]   = useState(false);
  // null | 'title' | 'bible'
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const successTimer = useRef(null);

  // Plantilla activa: persiste en outputConfig → sobrevive recargas
  const activeTemplateName = outputConfig?.activeTemplateName ?? null;

  const update = (patch) => {
    actions.setOutputConfig({ ...outputConfig, ...patch });
    if (activeTemplateName) {
      setTemplateDirty(true);
      setSaveSuccess(false);
    }
  };

  const showSuccess = () => {
    setSaveSuccess(true);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSaveSuccess(false), 2500);
  };

  const applyTemplate = (t) => {
    actions.setOutputConfig({ ...outputConfig, ...t.config, activeTemplateName: t.name });
    setTemplateDirty(false);
    setSaveSuccess(false);
  };

  const overwriteTemplate = () => {
    if (!activeTemplateName) return;
    // eslint-disable-next-line no-unused-vars
    const { activeTemplateName: _omit, ...configToSave } = outputConfig;
    const newTemplate = { name: activeTemplateName, config: configToSave };
    const next = outputTemplates.map(t => t.name === activeTemplateName ? newTemplate : t);
    actions.setOutputTemplates(next);
    setTemplateDirty(false);
    showSuccess();
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    // eslint-disable-next-line no-unused-vars
    const { activeTemplateName: _omit, ...configToSave } = outputConfig;
    const newTemplate = { name, config: configToSave };
    const existing = outputTemplates.findIndex(t => t.name === name);
    const next = existing >= 0
      ? outputTemplates.map((t, i) => i === existing ? newTemplate : t)
      : [...outputTemplates, newTemplate];
    actions.setOutputTemplates(next);
    actions.setOutputConfig({ ...outputConfig, activeTemplateName: name });
    setTemplateDirty(false);
    setTemplateName('');
    showSuccess();
  };

  const deleteTemplate = (name) => {
    actions.setOutputTemplates(outputTemplates.filter(t => t.name !== name));
    if (activeTemplateName === name) {
      actions.setOutputConfig({ ...outputConfig, activeTemplateName: null });
      setTemplateDirty(false);
    }
  };

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
  const showVideo       = outputConfig?.showVideo       ?? true;
  const backgroundFit   = outputConfig?.backgroundFit   ?? 'contain';
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

  // Indicador de progreso
  const progressEnabled  = outputConfig?.progressEnabled  ?? false;
  const progressPosition = outputConfig?.progressPosition ?? 'bottom-right';
  const progressSize     = outputConfig?.progressSize     ?? 14;
  const progressColor    = outputConfig?.progressColor    ?? '#ffffff';

  // Plantilla Biblia
  const bibleTemplateEnabled = outputConfig?.bibleTemplateEnabled ?? false;
  const bibleFontFamily      = outputConfig?.bibleFontFamily      ?? 'sans';
  const bibleFontSizeRaw     = outputConfig?.bibleFontSize        ?? 'auto';
  const bibleFontSizeIsAuto  = bibleFontSizeRaw === 'auto';
  const bibleFontSizeValue   = bibleFontSizeIsAuto ? 48 : Number(bibleFontSizeRaw);
  const bibleColor           = outputConfig?.bibleColor           ?? '#ffffff';
  const bibleAlignment       = outputConfig?.bibleAlignment       ?? 'center';
  const bibleAlignmentY      = outputConfig?.bibleAlignmentY      ?? 'center';
  const bibleRefPosition     = outputConfig?.bibleRefPosition     ?? 'bottom';
  const bibleRefShowBg       = outputConfig?.bibleRefShowBg       ?? false;
  const bibleRefBgColor      = outputConfig?.bibleRefBgColor      ?? '#000000';
  const bibleRefBgOpacity    = outputConfig?.bibleRefBgOpacity    ?? 0.6;
  const bibleRefColor        = outputConfig?.bibleRefColor        ?? '#cccccc';
  const bibleRefFontFamily   = outputConfig?.bibleRefFontFamily   ?? 'sans';
  const bibleRefFontSize     = outputConfig?.bibleRefFontSize     ?? 24;
  const bibleVersionPosition = outputConfig?.bibleVersionPosition ?? 'inline-right';
  const bibleMaxLines        = outputConfig?.bibleMaxLines        ?? 0;

  // fontSize: 'auto' o número
  const fontSizeIsAuto = !outputConfig?.fontSize || outputConfig.fontSize === 'auto';
  const fontSizeValue  = fontSizeIsAuto ? 48 : Number(outputConfig.fontSize);

  return (
    <>
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

            {/* Input para guardar con otro nombre (o nueva si no hay activa) */}
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
            <ToggleRow label="Reproducir video"    value={showVideo}     onChange={v => update({ showVideo: v })} />
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
          {/* ── INDICADOR DE PROGRESO ────────────────────────────── */}
          <SubSection title="Indicador de progreso">
            <ToggleRow label="Mostrar en pantalla" value={progressEnabled}
              onChange={v => update({ progressEnabled: v })} />
            {progressEnabled && (
              <>
                {/* Posición: grid 3×2 */}
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500">Posición</span>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { key: 'top-left',     label: '↖ Sup Izq' },
                      { key: 'top-center',   label: '↑ Sup Cen' },
                      { key: 'top-right',    label: '↗ Sup Der' },
                      { key: 'bottom-left',  label: '↙ Inf Izq' },
                      { key: 'bottom-center',label: '↓ Inf Cen' },
                      { key: 'bottom-right', label: '↘ Inf Der' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => update({ progressPosition: key })}
                        className={`py-1 text-[10px] rounded transition-colors ${
                          progressPosition === key
                            ? 'bg-accent text-white'
                            : 'bg-surface-600 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <SizeRow label="Tamaño" value={progressSize}
                  onChange={v => update({ progressSize: v })} min={8} max={48} />
                <ColorRow label="Color" value={progressColor}
                  onChange={v => update({ progressColor: v })} />
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

                {/* Fondo multimedia */}
                <div className="mt-2 space-y-1.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Fondo</p>
                  {outputConfig?.titleBackground ? (
                    <div className="flex items-center gap-2 bg-surface-700 rounded-lg px-2 py-1.5">
                      <div className="w-12 h-7 rounded overflow-hidden shrink-0 bg-surface-600 flex items-center justify-center">
                        {outputConfig.titleBackground.mediaType === 'video'
                          ? <Film size={12} className="text-zinc-400" />
                          : <img
                              src={outputConfig.titleBackground.url}
                              alt="" className="w-full h-full object-cover"
                              onError={e => { e.currentTarget.style.display='none'; }}
                            />
                        }
                      </div>
                      <span className="text-[10px] text-zinc-300 flex-1 min-w-0 truncate">{outputConfig.titleBackground.fileName}</span>
                      <button onClick={() => update({ titleBackground: null })}
                        className="text-zinc-500 hover:text-red-400 transition-colors shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMediaPickerTarget('title')}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-400 border border-dashed border-surface-500 hover:border-accent hover:text-accent rounded-lg py-2 transition-colors"
                    >
                      <Film size={11} /> Agregar fondo
                    </button>
                  )}
                  {outputConfig?.titleBackground && (
                    <button
                      onClick={() => setMediaPickerTarget('title')}
                      className="w-full text-[10px] text-zinc-500 hover:text-accent transition-colors"
                    >Cambiar fondo…</button>
                  )}
                </div>
              </>
            )}
          </SubSection>

          {/* ── PLANTILLA ESPECIAL PARA BIBLIA ─────────────────── */}
          <SubSection title="Plantilla especial para Biblia">
            <ToggleRow label="Activar plantilla para Biblia" value={bibleTemplateEnabled}
              onChange={v => update({ bibleTemplateEnabled: v })} />
            {bibleTemplateEnabled && (
              <div className="space-y-3 mt-1">
                {/* Fondo */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Fondo multimedia</p>
                  {outputConfig?.bibleBackground ? (
                    <div className="flex items-center gap-2 bg-surface-700 rounded-lg px-2 py-1.5">
                      <div className="w-12 h-7 rounded overflow-hidden shrink-0 bg-surface-600 flex items-center justify-center">
                        {outputConfig.bibleBackground.mediaType === 'video'
                          ? <Film size={12} className="text-zinc-400" />
                          : <img
                              src={outputConfig.bibleBackground.url}
                              alt="" className="w-full h-full object-cover"
                              onError={e => { e.currentTarget.style.display='none'; }}
                            />
                        }
                      </div>
                      <span className="text-[10px] text-zinc-300 flex-1 min-w-0 truncate">{outputConfig.bibleBackground.fileName}</span>
                      <button onClick={() => update({ bibleBackground: null })} className="text-zinc-500 hover:text-red-400 transition-colors shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMediaPickerTarget('bible')}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-zinc-400 border border-dashed border-surface-500 hover:border-accent hover:text-accent rounded-lg py-2 transition-colors"
                    >
                      <Film size={11} /> Agregar fondo
                    </button>
                  )}
                  {outputConfig?.bibleBackground && (
                    <button onClick={() => setMediaPickerTarget('bible')}
                      className="w-full text-[10px] text-zinc-500 hover:text-accent transition-colors"
                    >Cambiar fondo…</button>
                  )}
                  {/* Ajuste del fondo */}
                  <div className="space-y-1 pt-0.5">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Ajuste del fondo</span>
                    <div className="flex gap-1">
                      {[['contain','Contener'],['cover','Llenar'],['fill','Estirar']].map(([val, lbl]) => (
                        <button key={val}
                          onClick={() => update({ backgroundFit: val })}
                          className={`flex-1 py-1.5 text-xs rounded transition-colors ${
                            backgroundFit === val ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                          }`}
                        >{lbl}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tipografía */}
                <div className="border-l-2 border-surface-600 pl-2 space-y-1.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Tipografía</p>
                  <GoogleFontPicker label="Fuente" value={bibleFontFamily}
                    onChange={v => update({ bibleFontFamily: v })} />
                  <ColorRow label="Color texto" value={bibleColor}
                    onChange={v => update({ bibleColor: v })} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-300 shrink-0">Tamaño</span>
                    <div className="flex gap-1">
                      <button onClick={() => update({ bibleFontSize: 'auto' })}
                        className={`px-2 py-1 text-xs rounded transition-colors ${bibleFontSizeIsAuto ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
                      >Auto</button>
                      <button onClick={() => update({ bibleFontSize: bibleFontSizeValue })}
                        className={`px-2 py-1 text-xs rounded transition-colors ${!bibleFontSizeIsAuto ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
                      >Fijo</button>
                    </div>
                  </div>
                  {!bibleFontSizeIsAuto && (
                    <FontSizeControl value={bibleFontSizeValue} onChange={v => update({ bibleFontSize: v })} />
                  )}
                </div>

                {/* Alineación */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Alineación texto</p>
                  <div className="flex gap-1">
                    {[['left','⬅ Izq'],['center','≡ Cen'],['right','➡ Der']].map(([val, lbl]) => (
                      <button key={val}
                        onClick={() => update({ bibleAlignment: val })}
                        className={`flex-1 py-1.5 text-xs rounded transition-colors ${bibleAlignment === val ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
                      >{lbl}</button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {[['flex-start','↑ Arriba'],['center','↔ Centro'],['flex-end','↓ Abajo']].map(([val, lbl]) => (
                      <button key={val}
                        onClick={() => update({ bibleAlignmentY: val })}
                        className={`flex-1 py-1.5 text-xs rounded transition-colors ${bibleAlignmentY === val ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>

                {/* Posición de la cita */}
                <div className="space-y-1.5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Posición de la cita bíblica</p>
                  <div className="flex gap-1">
                    {[['top','↑ Arriba'],['bottom','↓ Abajo']].map(([val, lbl]) => (
                      <button key={val}
                        onClick={() => update({ bibleRefPosition: val })}
                        className={`flex-1 py-1.5 text-xs rounded transition-colors ${bibleRefPosition === val ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'}`}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>

                {/* Fondo de la cita */}
                <div className="border-l-2 border-surface-600 pl-2 space-y-1.5">
                  <ToggleRow label="Fondo detrás de la cita" value={bibleRefShowBg}
                    onChange={v => update({ bibleRefShowBg: v })} />
                  {bibleRefShowBg && (
                    <>
                      <ColorRow label="Color fondo" value={bibleRefBgColor}
                        onChange={v => update({ bibleRefBgColor: v })} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-zinc-300 shrink-0">Opacidad</span>
                        <div className="flex items-center gap-2 flex-1">
                          <input type="range" min={0} max={1} step={0.05} value={bibleRefBgOpacity}
                            onChange={e => update({ bibleRefBgOpacity: Number(e.target.value) })}
                            className="flex-1 accent-accent" />
                          <span className="text-xs text-zinc-400 w-8 text-right">{Math.round(bibleRefBgOpacity * 100)}%</span>
                        </div>
                      </div>
                    </>
                  )}
                  <ColorRow label="Color cita" value={bibleRefColor}
                    onChange={v => update({ bibleRefColor: v })} />
                  <GoogleFontPicker label="Fuente cita" value={bibleRefFontFamily}
                    onChange={v => update({ bibleRefFontFamily: v })} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-300 shrink-0">Tamaño cita</span>
                    <div className="flex items-center gap-2 flex-1">
                      <input type="range" min={10} max={80} step={1} value={bibleRefFontSize}
                        onChange={e => update({ bibleRefFontSize: Number(e.target.value) })}
                        className="flex-1 accent-accent" />
                      <span className="text-xs text-zinc-400 w-8 text-right">{bibleRefFontSize}px</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Posición de la versión</span>
                    <div className="flex gap-1">
                      {[['edge-left','⇤ Tope izq'],['edge-right','Tope der ⇥'],['inline-right','Contiguo →']].map(([val, lbl]) => (
                        <button key={val}
                          onClick={() => update({ bibleVersionPosition: val })}
                          className={`flex-1 py-1.5 text-[10px] rounded transition-colors ${
                            bibleVersionPosition === val ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-300 hover:bg-surface-500'
                          }`}
                        >{lbl}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-300">Máx. líneas por diap.</span>
                      <span className="text-xs text-zinc-400">
                        {bibleMaxLines === 0 ? 'Auto (sin límite)' : `${bibleMaxLines} líneas`}
                      </span>
                    </div>
                    <input type="range" min={0} max={8} step={1} value={bibleMaxLines}
                      onChange={e => update({ bibleMaxLines: Number(e.target.value) })}
                      className="w-full accent-accent" />
                  </div>
                </div>
              </div>
            )}
          </SubSection>
        </div>
      )}
    </div>
    {mediaPickerTarget && (
      <MediaPickerModal
        onSelect={media => {
          if (mediaPickerTarget === 'title') update({ titleBackground: media });
          if (mediaPickerTarget === 'bible') update({ bibleBackground: media });
          setMediaPickerTarget(null);
        }}
        onClose={() => setMediaPickerTarget(null)}
      />
    )}
    </>
  );
}

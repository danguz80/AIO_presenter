import { useState, useRef, useCallback } from 'react';
import { usePresenter } from '../../context/usePresenter';
import {
  X, Upload, FileText, FileCode, File,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Loader2, Trash2, Layers, FileUp
} from 'lucide-react';
import api from '../../hooks/useApi';

// ── Extensiones aceptadas ─────────────────────────────────────────────────
const ACCEPTED_EXTS   = ['.txt', '.cho', '.chopro', '.chordpro', '.chord', '.show'];
const ACCEPT_ATTR     = ACCEPTED_EXTS.join(',');
const MAX_SIZE_MB     = 5;
const MAX_SIZE_BYTES  = MAX_SIZE_MB * 1024 * 1024;

const FORMAT_LABELS = {
  txt:      'Texto plano',
  cho:      'ChordPro',
  chopro:   'ChordPro',
  chordpro: 'ChordPro',
  chord:    'ChordPro',
  show:     'FreeShow',
};

// ── Componente principal ──────────────────────────────────────────────────
export default function ImportModal({ onClose }) {
  const { actions } = usePresenter();

  // Modo: 'single' | 'batch'
  const [mode, setMode] = useState('single');

  // ── Estado modo individual ────────────────────────────────────────────
  const [stage,        setStage]        = useState('drop');
  const [dragOver,     setDragOver]     = useState(false);
  const [parseError,   setParseError]   = useState('');
  const [saveError,    setSaveError]    = useState('');
  const [parsed,       setParsed]       = useState(null);
  const [title,        setTitle]        = useState('');
  const [author,       setAuthor]       = useState('');
  const [slides,       setSlides]       = useState([]);
  const [expandedIdx,  setExpandedIdx]  = useState(null);
  const inputRef = useRef(null);

  // ── Estado modo lote ──────────────────────────────────────────────────
  const [batchFiles,   setBatchFiles]   = useState([]);   // File[]
  const [batchStage,   setBatchStage]   = useState('pick'); // 'pick' | 'importing' | 'done'
  const [batchResult,  setBatchResult]  = useState(null);
  const [batchDragOver,setBatchDragOver]= useState(false);
  const batchInputRef = useRef(null);

  // ── Validación archivo individual ────────────────────────────────────
  const validateFile = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) return `Formato no soportado: ${ext}`;
    if (file.size > MAX_SIZE_BYTES) return `Supera ${MAX_SIZE_MB} MB`;
    return null;
  };

  // ── Modo individual: procesar ─────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    const err = validateFile(file);
    if (err) { setParseError(err); return; }
    setStage('parsing'); setParseError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      setParsed(data); setTitle(data.title || '');
      setAuthor(data.author || ''); setSlides(data.slides || []);
      setStage('preview');
    } catch (e) {
      setParseError(e?.response?.data?.error || 'Error al procesar el archivo');
      setStage('drop');
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };
  const onDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = ()    => setDragOver(false);
  const onFileInput = (e)   => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const updateSlide = (idx, field, value) =>
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  const removeSlide = (idx) =>
    setSlides(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!title.trim()) { setSaveError('El título es requerido'); return; }
    if (slides.length === 0) { setSaveError('Debe haber al menos una sección'); return; }
    setStage('saving'); setSaveError('');
    try {
      await actions.createSong({
        title: title.trim(), author: author.trim(),
        copyright: parsed?.copyright || '', ccli: parsed?.ccli || '', slides,
      });
      onClose();
    } catch (e) {
      setSaveError(e?.response?.data?.error || 'Error al guardar la canción');
      setStage('preview');
    }
  };

  const resetToDrop = () => {
    setStage('drop'); setParsed(null); setTitle(''); setAuthor('');
    setSlides([]); setParseError(''); setSaveError(''); setExpandedIdx(null);
  };

  // ── Modo lote: agregar archivos ───────────────────────────────────────
  const addBatchFiles = (fileList) => {
    const arr = Array.from(fileList).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return ACCEPTED_EXTS.includes(ext) && f.size <= MAX_SIZE_BYTES;
    });
    setBatchFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !existing.has(f.name))];
    });
  };

  const onBatchDrop = (e) => {
    e.preventDefault(); setBatchDragOver(false);
    addBatchFiles(e.dataTransfer.files);
  };
  const onBatchDragOver  = (e) => { e.preventDefault(); setBatchDragOver(true); };
  const onBatchDragLeave = ()    => setBatchDragOver(false);
  const onBatchInput     = (e)   => { addBatchFiles(e.target.files); e.target.value = ''; };

  // ── Modo lote: importar ───────────────────────────────────────────────
  const handleBatchImport = async () => {
    if (batchFiles.length === 0) return;
    setBatchStage('importing');
    const formData = new FormData();
    for (const file of batchFiles) formData.append('files', file);
    try {
      const res = await api.post('/import/batch', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBatchResult(res.data);
      setBatchStage('done');
      // Recargar lista de canciones
      await actions.reloadSongs?.();
    } catch (e) {
      setBatchResult({ total: batchFiles.length, imported: 0, skipped: batchFiles.length,
        errors: [{ filename: 'general', error: e?.response?.data?.error || e.message }] });
      setBatchStage('done');
    }
  };

  const resetBatch = () => {
    setBatchFiles([]); setBatchStage('pick'); setBatchResult(null);
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-surface-800 border border-surface-600 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700 shrink-0">
          <div>
            <h2 className="font-semibold text-lg">Importar letras</h2>
            <p className="text-xs text-zinc-500 mt-0.5">TXT · ChordPro · FreeShow (.show)</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={18} /></button>
        </div>

        {/* Tabs de modo */}
        <div className="flex shrink-0 border-b border-surface-700">
          {[
            { key: 'single', icon: <FileUp size={14} />,  label: 'Archivo individual' },
            { key: 'batch',  icon: <Layers size={14} />,  label: 'Importar por lote'  },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setMode(t.key); resetToDrop(); resetBatch(); }}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${mode === t.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ MODO INDIVIDUAL ══════════════════════════════════════════ */}
          {mode === 'single' && (
            <>
              {(stage === 'drop' || stage === 'parsing') && (
                <div className="p-6 space-y-4">
                  <div
                    onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                    onClick={() => inputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all
                      ${dragOver ? 'border-accent bg-accent/10' : 'border-surface-600 hover:border-zinc-500 hover:bg-surface-700/50'}`}
                  >
                    <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className="hidden" onChange={onFileInput} />
                    {stage === 'parsing' ? (
                      <><Loader2 size={40} className="text-accent animate-spin" /><p className="text-zinc-300 font-medium">Analizando archivo...</p></>
                    ) : (
                      <>
                        <Upload size={40} className="text-zinc-500" />
                        <div className="text-center">
                          <p className="text-zinc-300 font-medium">Arrastra tu archivo aquí</p>
                          <p className="text-zinc-500 text-sm mt-1">o haz clic para seleccionarlo</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {[
                            { label: 'Texto plano', ext: '.txt',         icon: <FileText size={13} /> },
                            { label: 'ChordPro',    ext: '.cho .chopro', icon: <FileCode size={13} /> },
                            { label: 'FreeShow',    ext: '.show',        icon: <File size={13} /> },
                          ].map(f => (
                            <span key={f.label} className="flex items-center gap-1.5 text-xs bg-surface-700 text-zinc-400 px-3 py-1.5 rounded-full">
                              {f.icon}<span className="font-medium text-zinc-300">{f.label}</span>
                              <span className="text-zinc-600">{f.ext}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {parseError && (
                    <div className="flex items-start gap-2 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />{parseError}
                    </div>
                  )}
                </div>
              )}

              {(stage === 'preview' || stage === 'saving') && parsed && (
                <div className="p-6 space-y-5">
                  <div className="flex items-center gap-3 bg-green-950/40 border border-green-800/50 rounded-lg px-4 py-3">
                    <CheckCircle size={18} className="text-green-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-green-300 font-medium">Archivo procesado correctamente</p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {parsed.filename} · <span className="text-zinc-400">{FORMAT_LABELS[parsed.format] || parsed.format}</span> · {slides.length} secciones
                      </p>
                    </div>
                    <button onClick={resetToDrop} className="btn-ghost text-xs">Cambiar archivo</button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Título *</label>
                      <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título de la canción" autoFocus />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Autor / Artista</label>
                      <input className="input" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Compositor" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-zinc-300">Secciones importadas</span>
                      <span className="text-xs text-zinc-500">{slides.length} sección{slides.length !== 1 ? 'es' : ''}</span>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {slides.map((slide, i) => (
                        <div key={i} className="card overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-700 transition-colors"
                            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
                            <span className="text-xs font-medium text-accent px-2 py-0.5 bg-accent/10 rounded">{slide.label}</span>
                            <p className="flex-1 text-xs text-zinc-400 truncate">{slide.content.split('\n')[0]}</p>
                            <div className="flex items-center gap-1">
                              <button onClick={e => { e.stopPropagation(); removeSlide(i); }}
                                className="p-1 text-zinc-600 hover:text-red-400 rounded" title="Eliminar">
                                <Trash2 size={12} />
                              </button>
                              {expandedIdx === i ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
                            </div>
                          </div>
                          {expandedIdx === i && (
                            <div className="px-3 pb-3 space-y-2 border-t border-surface-700">
                              <input className="input text-xs mt-2" value={slide.label}
                                onChange={e => updateSlide(i, 'label', e.target.value)} placeholder="Etiqueta" />
                              <textarea className="input resize-none text-xs" rows={5} value={slide.content}
                                onChange={e => updateSlide(i, 'content', e.target.value)} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {saveError && (
                    <div className="flex items-start gap-2 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />{saveError}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ══ MODO LOTE ════════════════════════════════════════════════ */}
          {mode === 'batch' && (
            <div className="p-6 space-y-4">

              {/* Pick stage */}
              {batchStage === 'pick' && (
                <>
                  <div
                    onDrop={onBatchDrop} onDragOver={onBatchDragOver} onDragLeave={onBatchDragLeave}
                    onClick={() => batchInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all
                      ${batchDragOver ? 'border-accent bg-accent/10' : 'border-surface-600 hover:border-zinc-500 hover:bg-surface-700/50'}`}
                  >
                    <input ref={batchInputRef} type="file" accept={ACCEPT_ATTR} multiple className="hidden" onChange={onBatchInput} />
                    <Layers size={36} className="text-zinc-500" />
                    <div className="text-center">
                      <p className="text-zinc-300 font-medium">Arrastra todos tus archivos aquí</p>
                      <p className="text-zinc-500 text-sm mt-1">o haz clic para seleccionarlos · puedes elegir cientos a la vez</p>
                    </div>
                  </div>

                  {batchFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-300">{batchFiles.length} archivo{batchFiles.length !== 1 ? 's' : ''} listos</span>
                        <button onClick={resetBatch} className="btn-ghost text-xs text-red-400">Limpiar</button>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
                        {batchFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-surface-700">
                            <span className="text-zinc-300 truncate flex-1">{f.name}</span>
                            <span className="text-zinc-600 ml-2 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                            <button onClick={() => setBatchFiles(prev => prev.filter((_, j) => j !== i))}
                              className="ml-2 text-zinc-600 hover:text-red-400 shrink-0">
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Importing stage */}
              {batchStage === 'importing' && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 size={48} className="text-accent animate-spin" />
                  <p className="text-zinc-300 font-medium text-lg">Importando {batchFiles.length} archivos...</p>
                  <p className="text-zinc-500 text-sm">Esto puede tardar unos segundos</p>
                </div>
              )}

              {/* Done stage */}
              {batchStage === 'done' && batchResult && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-surface-700 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-zinc-200">{batchResult.total}</p>
                      <p className="text-xs text-zinc-500 mt-1">Total</p>
                    </div>
                    <div className="bg-green-950/40 border border-green-800/40 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-green-400">{batchResult.imported}</p>
                      <p className="text-xs text-zinc-500 mt-1">Importadas</p>
                    </div>
                    <div className={`rounded-lg p-4 text-center ${batchResult.skipped > 0 ? 'bg-red-950/40 border border-red-800/40' : 'bg-surface-700'}`}>
                      <p className={`text-2xl font-bold ${batchResult.skipped > 0 ? 'text-red-400' : 'text-zinc-400'}`}>{batchResult.skipped}</p>
                      <p className="text-xs text-zinc-500 mt-1">Con error</p>
                    </div>
                  </div>

                  {batchResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-zinc-400 mb-2">Archivos con error:</p>
                      <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
                        {batchResult.errors.map((e, i) => (
                          <div key={i} className="flex gap-2 text-xs px-2 py-1.5 bg-red-950/30 rounded border border-red-900/40">
                            <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                            <span className="text-zinc-300 font-medium truncate max-w-[50%]">{e.filename}</span>
                            <span className="text-red-400">{e.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button onClick={resetBatch} className="btn-ghost text-sm w-full">Importar más archivos</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-700 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="btn-ghost">
            {batchStage === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>

          {/* Individual: guardar */}
          {mode === 'single' && (stage === 'preview' || stage === 'saving') && (
            <button onClick={handleSave} disabled={stage === 'saving'} className="btn-primary flex items-center gap-2">
              {stage === 'saving' && <Loader2 size={14} className="animate-spin" />}
              {stage === 'saving' ? 'Guardando...' : `Importar canción (${slides.length} secciones)`}
            </button>
          )}

          {/* Lote: importar */}
          {mode === 'batch' && batchStage === 'pick' && batchFiles.length > 0 && (
            <button onClick={handleBatchImport} className="btn-primary flex items-center gap-2">
              <Layers size={14} />
              Importar {batchFiles.length} canciones
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

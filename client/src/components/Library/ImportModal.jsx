import { useState, useRef, useCallback } from 'react';
import { usePresenter } from '../../context/usePresenter';
import {
  X, Upload, FileText, FileCode, File,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  Loader2, Trash2
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

const FORMAT_ICONS = {
  txt:      <FileText size={16} />,
  cho:      <FileCode size={16} />,
  chopro:   <FileCode size={16} />,
  chordpro: <FileCode size={16} />,
  chord:    <FileCode size={16} />,
  show:     <File size={16} />,
};

// ── Componente principal ──────────────────────────────────────────────────
export default function ImportModal({ onClose }) {
  const { actions } = usePresenter();

  const [stage,        setStage]        = useState('drop');   // 'drop' | 'parsing' | 'preview' | 'saving'
  const [dragOver,     setDragOver]     = useState(false);
  const [parseError,   setParseError]   = useState('');
  const [saveError,    setSaveError]    = useState('');

  // Datos parseados (editables)
  const [parsed,       setParsed]       = useState(null);
  const [title,        setTitle]        = useState('');
  const [author,       setAuthor]       = useState('');
  const [slides,       setSlides]       = useState([]);
  const [expandedIdx,  setExpandedIdx]  = useState(null);

  const inputRef = useRef(null);

  // ── Validación de archivo en cliente ────────────────────────────────────
  const validateFile = (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      return `Formato no soportado: ${ext}. Usa: ${ACCEPTED_EXTS.join(', ')}`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `El archivo supera ${MAX_SIZE_MB} MB`;
    }
    return null;
  };

  // ── Enviar archivo al servidor ───────────────────────────────────────────
  const processFile = useCallback(async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setParseError(validationError);
      return;
    }

    setStage('parsing');
    setParseError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      setParsed(data);
      setTitle(data.title || '');
      setAuthor(data.author || '');
      setSlides(data.slides || []);
      setStage('preview');
    } catch (err) {
      setParseError(err?.response?.data?.error || 'Error al procesar el archivo');
      setStage('drop');
    }
  }, []);

  // ── Drag & Drop handlers ─────────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true);  };
  const onDragLeave = ()  => setDragOver(false);

  const onFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input para permitir re-selección del mismo archivo
    e.target.value = '';
  };

  // ── Edición de slides ────────────────────────────────────────────────────
  const updateSlide = (idx, field, value) => {
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const removeSlide = (idx) => {
    setSlides(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Guardar ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!title.trim()) { setSaveError('El título es requerido'); return; }
    if (slides.length === 0) { setSaveError('Debe haber al menos una sección'); return; }

    setStage('saving');
    setSaveError('');
    try {
      await actions.createSong({
        title:     title.trim(),
        author:    author.trim(),
        copyright: parsed?.copyright || '',
        ccli:      parsed?.ccli || '',
        slides,
      });
      onClose();
    } catch (err) {
      setSaveError(err?.response?.data?.error || 'Error al guardar la canción');
      setStage('preview');
    }
  };

  // ── Resetear a la zona de carga ──────────────────────────────────────────
  const resetToDrop = () => {
    setStage('drop');
    setParsed(null);
    setTitle('');
    setAuthor('');
    setSlides([]);
    setParseError('');
    setSaveError('');
    setExpandedIdx(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="bg-surface-800 border border-surface-600 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700 shrink-0">
          <div>
            <h2 className="font-semibold text-lg">Importar letras</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Formatos soportados: TXT · ChordPro · FreeShow (.show)
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X size={18} /></button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ETAPA: DROP ─────────────────────────────────────────────── */}
          {(stage === 'drop' || stage === 'parsing') && (
            <div className="p-6 space-y-4">
              {/* Zona de drag & drop */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => inputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center
                  gap-4 cursor-pointer transition-all
                  ${dragOver
                    ? 'border-accent bg-accent/10 scale-[1.01]'
                    : 'border-surface-600 hover:border-zinc-500 hover:bg-surface-700/50'
                  }
                `}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  className="hidden"
                  onChange={onFileInput}
                />

                {stage === 'parsing' ? (
                  <>
                    <Loader2 size={40} className="text-accent animate-spin" />
                    <p className="text-zinc-300 font-medium">Analizando archivo...</p>
                  </>
                ) : (
                  <>
                    <Upload size={40} className="text-zinc-500" />
                    <div className="text-center">
                      <p className="text-zinc-300 font-medium">
                        Arrastra tu archivo aquí
                      </p>
                      <p className="text-zinc-500 text-sm mt-1">
                        o haz clic para seleccionarlo
                      </p>
                    </div>

                    {/* Badges de formatos */}
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        { label: 'Texto plano', ext: '.txt',      icon: <FileText size={13} /> },
                        { label: 'ChordPro',    ext: '.cho .chopro', icon: <FileCode size={13} /> },
                        { label: 'FreeShow',    ext: '.show',     icon: <File size={13} /> },
                      ].map(f => (
                        <span
                          key={f.label}
                          className="flex items-center gap-1.5 text-xs bg-surface-700 text-zinc-400 px-3 py-1.5 rounded-full"
                        >
                          {f.icon}
                          <span className="font-medium text-zinc-300">{f.label}</span>
                          <span className="text-zinc-600">{f.ext}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Error de parseo */}
              {parseError && (
                <div className="flex items-start gap-2 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {parseError}
                </div>
              )}
            </div>
          )}

          {/* ETAPA: PREVIEW ──────────────────────────────────────────── */}
          {(stage === 'preview' || stage === 'saving') && parsed && (
            <div className="p-6 space-y-5">
              {/* Indicador de éxito + formato detectado */}
              <div className="flex items-center gap-3 bg-green-950/40 border border-green-800/50 rounded-lg px-4 py-3">
                <CheckCircle size={18} className="text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-green-300 font-medium">
                    Archivo procesado correctamente
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {parsed.filename}
                    {' · '}
                    <span className="text-zinc-400">
                      {FORMAT_LABELS[parsed.format] || parsed.format}
                    </span>
                    {' · '}
                    {slides.length} sección{slides.length !== 1 ? 'es' : ''}
                  </p>
                </div>
                <button onClick={resetToDrop} className="btn-ghost text-xs flex items-center gap-1">
                  Cambiar archivo
                </button>
              </div>

              {/* Campos editables de metadatos */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Título *</label>
                  <input
                    className="input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Título de la canción"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Autor / Artista</label>
                  <input
                    className="input"
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    placeholder="Compositor"
                  />
                </div>
              </div>

              {/* Lista de slides importados */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-300">
                    Secciones importadas
                  </span>
                  <span className="text-xs text-zinc-500">
                    {slides.length} sección{slides.length !== 1 ? 'es' : ''}
                  </span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {slides.map((slide, i) => (
                    <div key={i} className="card overflow-hidden">
                      {/* Cabecera del slide */}
                      <div
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-700 transition-colors"
                        onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                      >
                        <span className="text-xs font-medium text-accent px-2 py-0.5 bg-accent/10 rounded">
                          {slide.label}
                        </span>
                        <p className="flex-1 text-xs text-zinc-400 truncate">
                          {slide.content.split('\n')[0]}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={e => { e.stopPropagation(); removeSlide(i); }}
                            className="p-1 text-zinc-600 hover:text-red-400 transition-colors rounded"
                            title="Eliminar sección"
                          >
                            <Trash2 size={12} />
                          </button>
                          {expandedIdx === i
                            ? <ChevronUp size={14} className="text-zinc-500" />
                            : <ChevronDown size={14} className="text-zinc-500" />
                          }
                        </div>
                      </div>

                      {/* Contenido expandido (editable) */}
                      {expandedIdx === i && (
                        <div className="px-3 pb-3 space-y-2 border-t border-surface-700">
                          <input
                            className="input text-xs mt-2"
                            value={slide.label}
                            onChange={e => updateSlide(i, 'label', e.target.value)}
                            placeholder="Etiqueta (ej: Verso 1)"
                          />
                          <textarea
                            className="input resize-none text-xs"
                            rows={5}
                            value={slide.content}
                            onChange={e => updateSlide(i, 'content', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Error de guardado */}
              {saveError && (
                <div className="flex items-start gap-2 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-300">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {saveError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-surface-700 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          {(stage === 'preview' || stage === 'saving') && (
            <button
              onClick={handleSave}
              disabled={stage === 'saving'}
              className="btn-primary flex items-center gap-2"
            >
              {stage === 'saving' && <Loader2 size={14} className="animate-spin" />}
              {stage === 'saving' ? 'Guardando...' : `Importar canción (${slides.length} secciones)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

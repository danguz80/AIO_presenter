import { useState, useRef, useMemo } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { X, Trash2 } from 'lucide-react';

// Colores por tipo de label — hex para usar en style (evita purga de Tailwind)
const LABEL_COLORS = {
  intro:      '#4f46e5',
  verso:      '#2563eb',
  'pre-coro': '#c026d3',
  precoro:    '#c026d3',
  coro:       '#9333ea',
  puente:     '#db2777',
  bridge:     '#db2777',
  outro:      '#e11d48',
  final:      '#e11d48',
  tag:        '#f97316',
  titulo:     '#52525b',
  título:     '#52525b',
};

function getLabelColor(label) {
  const key = label.toLowerCase().replace(/\s*\d+$/, '').trim();
  return LABEL_COLORS[key] || '#3f3f46';
}

// Convierte array de slides → texto editable
// Slides del mismo label separados por línea en blanco.
// Al cambiar de label: línea en blanco + {NuevoLabel}
// Si el label está vacío no se emite encabezado.
function slidesToText(slides) {
  if (!slides || slides.length === 0) return '';
  const lines = [];
  let lastLabel = undefined;
  for (const slide of slides) {
    const lbl = slide.label?.trim() || '';
    if (lbl !== lastLabel) {
      if (lastLabel !== undefined) lines.push('');
      if (lbl) lines.push(`{${lbl}}`);
      lastLabel = lbl;
    } else {
      lines.push(''); // línea en blanco entre slides del mismo label
    }
    lines.push(slide.content);
  }
  return lines.join('\n');
}

// Regex para detectar si una cadena es símbolo de acorde musical (A, Am, G#m, F#, etc.)
const CHORD_SYMBOL_RE = /^[A-G][#b]?(?:m|M|maj|min|dim|aug|sus[24]?|add\d*|dom|alt)?[0-9]*(?:b\d+|#\d+)*(?:\/[A-G][#b]?)?$/;

/**
 * Convierte líneas de sección con corchetes ([Verso], [Coro], etc.)
 * al formato de llaves ({Verso}, {Coro}) que usa el parser interno.
 * Las líneas con un acorde solo ([B], [G#m]) NO se tocan.
 */
function normalizeSectionLabels(text) {
  return text.split('\n').map(line => {
    const m = line.trim().match(/^\[([^\]]+)\]$/);
    if (m && !CHORD_SYMBOL_RE.test(m[1].trim())) {
      return `{${m[1].trim()}}`;
    }
    return line;
  }).join('\n');
}

// Parsea el texto con {labels} o [labels] → array de slides
// Bloque de líneas sin línea en blanco entre ellas = una sola diapositiva
// Si no hay {label}, el slide se guarda con label '' (vacío).
function textToSlides(text) {
  const slides = [];
  const parts = normalizeSectionLabels(text).split(/\n(?=\{[^}]+\})/);

  for (const part of parts) {
    const labelMatch = part.match(/^\{([^}]+)\}/);
    const label = labelMatch ? labelMatch[1].trim() : '';
    const body  = part.replace(/^\{[^}]+\}\n?/, '');

    // Bloques separados por línea(s) en blanco → cada bloque = un slide
    const blocks = body.split(/\n[ \t]*\n/).map(b => b.trim()).filter(b => b.length > 0);
    if (blocks.length === 0) continue;

    for (const block of blocks) {
      slides.push({ label, content: block });
    }
  }

  return slides.length > 0 ? slides : [{ label: '', content: text.trim() }];
}

export default function SongFormModal({ song, onClose }) {
  const { actions } = usePresenter();
  const isEdit = Boolean(song?.id);

  const [title,       setTitle]       = useState(song?.title    || '');
  const [author,      setAuthor]      = useState(song?.author   || '');
  const [songKey,     setSongKey]     = useState(song?.song_key || '');
  const [bpm,         setBpm]         = useState(song?.bpm      ?? '');
  const [timeSig,     setTimeSig]     = useState(song?.time_sig || '');
  const [link,        setLink]        = useState(song?.link     || '');
  const [body,        setBody]        = useState(() => slidesToText(song?.slides));
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [confirmDel,  setConfirmDel]  = useState(false);
  const textareaRef = useRef(null);

  // Labels únicos: primero los del texto editado, luego los del song.slides original
  const uniqueLabels = useMemo(() => {
    const seen   = new Set();
    const result = [];

    // 1. Directo de song.slides (fuente más fiable)
    if (Array.isArray(song?.slides)) {
      for (const s of song.slides) {
        const lbl = s.label?.trim();
        if (lbl && !seen.has(lbl)) { seen.add(lbl); result.push(lbl); }
      }
    }

    // 2. Del texto actual (para canciones nuevas o labels añadidos manualmente)
    for (const line of body.split('\n')) {
      const m = line.trim().match(/^\{([^}]+)\}$/);
      if (!m) continue;
      const lbl = m[1].trim();
      if (lbl && !seen.has(lbl)) { seen.add(lbl); result.push(lbl); }
    }

    console.log('[SongFormModal] uniqueLabels:', result);
    console.log('[SongFormModal] slide labels raw:', song?.slides?.map(s => s.label));
    console.log('[SongFormModal] body first 300:', body.substring(0, 300));
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, song?.slides]);

  const insertLabel = (lbl) => {
    const ta = textareaRef.current;
    if (!ta) return;

    // Reunir todo el contenido de los slides con este label
    const existingContent = (song?.slides || [])
      .filter(s => s.label?.trim() === lbl)
      .map(s => s.content?.trim())
      .filter(Boolean)
      .join('\n\n');

    const start  = ta.selectionStart;
    const end    = ta.selectionEnd;
    const insert = existingContent
      ? `{${lbl}}\n${existingContent}\n\n`
      : `{${lbl}}\n`;
    const newVal = body.slice(0, start) + insert + body.slice(end);
    setBody(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + insert.length, start + insert.length);
    });
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    try {
      await actions.deleteSong(song.id);
      await actions.reloadSongs();
      onClose();
    } catch (err) {
      setError(err?.message || 'Error al borrar');
      setConfirmDel(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('El título es requerido'); return; }
    const slides = textToSlides(body);
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await actions.updateSong(song.id, { title, author, song_key: songKey || null, bpm: bpm !== '' ? bpm : null, time_sig: timeSig || null, link: link || null, slides });
        // Recargar el detalle completo para que el grid de slides se actualice
        await actions.loadSongDetail(song.id);
      } else {
        await actions.createSong({ title, author, song_key: songKey || null, bpm: bpm !== '' ? bpm : null, time_sig: timeSig || null, link: link || null, slides });
      }
      await actions.reloadSongs();
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error al guardar';
      setError(msg);
      console.error('[SongFormModal] Error al guardar:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-surface-800 border border-surface-600 rounded-xl w-full flex flex-col shadow-2xl"
        style={{ height: '85vh', minWidth: '480px', maxWidth: '95vw', width: '1024px', resize: 'horizontal', overflow: 'hidden' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="font-semibold text-lg">
            {isEdit ? 'Editar canción' : 'Nueva canción'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden" style={{ height: 'calc(85vh - 65px)' }}>
          {/* Campos básicos */}
          <div className="px-6 py-4 grid grid-cols-2 gap-4 border-b border-surface-700">
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

          {/* Metadatos */}
          <div className="px-6 py-3 grid grid-cols-4 gap-3 border-b border-surface-700">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Clave</label>
              <input
                className="input"
                value={songKey}
                onChange={e => setSongKey(e.target.value)}
                placeholder="Ej: Am, G, F#m"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">BPM</label>
              <input
                className="input"
                type="number"
                min="20" max="300"
                value={bpm}
                onChange={e => setBpm(e.target.value)}
                placeholder="120"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Compás</label>
              <input
                className="input"
                value={timeSig}
                onChange={e => setTimeSig(e.target.value)}
                placeholder="4/4"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Link</label>
              <input
                className="input"
                type="url"
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="https://open.spotify.com/..."
              />
            </div>
          </div>

          {/* Editor de letra */}
          <div className="flex-1 overflow-hidden flex gap-3 px-6 py-4">
            {/* Textarea */}
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Letra</label>
                <span className="text-xs text-zinc-600">
                  Línea en blanco = nueva diapositiva.{' '}
                  <code className="bg-surface-700 px-1 rounded">{'{Verso}'}</code>{' '}
                  para marcar secciones
                </span>
              </div>
              <textarea
                ref={textareaRef}
                className="input flex-1 resize-none font-mono text-sm leading-relaxed"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={`{Verso 1}\nPrimera línea del verso\nSegunda línea\n\n{Coro}\nLetra del coro`}
                spellCheck={false}
              />
            </div>

            {/* Columna derecha: borrar + etiquetas */}
            <div className="w-36 shrink-0 flex flex-col gap-2 pt-5 border-l border-surface-700 pl-3">
              {/* Botón borrar (solo en edición) */}
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className={`flex items-center justify-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    confirmDel
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-surface-700 hover:bg-red-900/50 text-zinc-400 hover:text-red-400'
                  }`}
                  title={confirmDel ? 'Haz clic para confirmar' : 'Borrar canción'}
                >
                  <Trash2 size={12} />
                  {confirmDel ? '¿Confirmar?' : 'Borrar'}
                </button>
              )}

              {/* Etiquetas */}
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mt-1">Etiquetas</p>
              <div className="flex flex-col overflow-y-auto flex-1">
                {uniqueLabels.length > 0 ? (
                  uniqueLabels.map(lbl => {
                    const color = getLabelColor(lbl);
                    const count = song?.slides?.filter(s => s.label?.trim() === lbl).length || 0;
                    return (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => insertLabel(lbl)}
                        style={{ borderLeftColor: color }}
                        className="border-l-4 w-full text-left px-2 py-1.5 bg-surface-700 hover:bg-surface-600 text-white transition-colors flex items-center justify-between"
                        title={`Insertar {${lbl}}`}
                      >
                        <span className="text-[11px] font-medium truncate">{lbl}</span>
                        {count > 0 && <span className="text-[10px] text-zinc-400 ml-1 shrink-0">{count}</span>}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-[10px] text-zinc-600 leading-tight px-1">
                    Escribe <code className="bg-surface-700 px-0.5 rounded text-zinc-400">{'{Verso}'}</code> para agregar etiquetas
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-surface-700 flex items-center justify-between">
            {error && <span className="text-red-400 text-sm">{error}</span>}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onClose} className="btn-ghost">
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear canción'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

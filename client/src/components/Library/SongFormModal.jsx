import { useState } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { X } from 'lucide-react';

// Convierte array de slides → texto editable
// Slides del mismo label separados por línea en blanco.
// Al cambiar de label: línea en blanco + {NuevoLabel}
function slidesToText(slides) {
  if (!slides || slides.length === 0) return '';
  const lines = [];
  let lastLabel = null;
  for (const slide of slides) {
    if (slide.label !== lastLabel) {
      if (lastLabel !== null) lines.push('');
      lines.push(`{${slide.label}}`);
      lastLabel = slide.label;
    } else {
      lines.push(''); // línea en blanco entre slides del mismo label
    }
    lines.push(slide.content); // el contenido puede tener \n internos
  }
  return lines.join('\n');
}

// Parsea el texto con {labels} → array de slides
// Bloque de líneas sin línea en blanco entre ellas = una sola diapositiva
function textToSlides(text) {
  const slides = [];
  const parts = text.split(/\n(?=\{[^}]+\})/);
  let autoIndex = 0;

  for (const part of parts) {
    const labelMatch = part.match(/^\{([^}]+)\}/);
    const label = labelMatch ? labelMatch[1].trim() : null;
    const body  = part.replace(/^\{[^}]+\}\n?/, '');

    // Bloques separados por línea(s) en blanco → cada bloque = un slide
    const blocks = body.split(/\n[ \t]*\n/).map(b => b.trim()).filter(b => b.length > 0);
    if (blocks.length === 0) continue;

    const effectiveLabel = label || `Verso ${++autoIndex}`;
    for (const block of blocks) {
      slides.push({ label: effectiveLabel, content: block });
    }
  }

  return slides.length > 0 ? slides : [{ label: 'Verso 1', content: text.trim() }];
}

export default function SongFormModal({ song, onClose }) {
  const { actions } = usePresenter();
  const isEdit = Boolean(song?.id);

  const [title,  setTitle]  = useState(song?.title  || '');
  const [author, setAuthor] = useState(song?.author || '');
  const [body,   setBody]   = useState(() => slidesToText(song?.slides));
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('El título es requerido'); return; }
    const slides = textToSlides(body);
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await actions.updateSong(song.id, { title, author, slides });
        // Recargar el detalle completo para que el grid de slides se actualice
        await actions.loadSongDetail(song.id);
      } else {
        await actions.createSong({ title, author, slides });
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
      <div className="bg-surface-800 border border-surface-600 rounded-xl w-full max-w-3xl flex flex-col shadow-2xl" style={{ height: '85vh' }}>
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

          {/* Editor de letra */}
          <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">Letra</label>
              <span className="text-xs text-zinc-600">
                Línea en blanco = nueva diapositiva.{' '}
                <code className="bg-surface-700 px-1 rounded">{'{Verso}'}</code>{' '}
                <code className="bg-surface-700 px-1 rounded">{'{Coro}'}</code>{' '}
                para marcar secciones
              </span>
            </div>
            <textarea
              className="input flex-1 resize-none font-mono text-sm leading-relaxed"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`{Verso 1}\nPrimera línea del verso\nSegunda línea\n\n{Coro}\nLetra del coro`}
              spellCheck={false}
            />
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

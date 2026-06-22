import { useState, useRef, useMemo, useEffect } from 'react';
import { usePresenterOptional } from '../../context/usePresenter';
import { X, Trash2, Tag, Plus, Music2 } from 'lucide-react';
import api from '../../hooks/useApi';
import { getLabelColor } from '../../utils/labelColors';
import { buildScaleChords } from '../../utils/chordUtils';

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
// Versión case-insensitive para el modo acordes (acepta Cm y cm por igual)
const CHORD_MODE_RE   = /^[A-Ga-g][#b]?(?:m|M|maj|min|dim|aug|sus[24]?|add\d*|dom|alt)?[0-9]*(?:b\d+|#\d+)*(?:\/[A-Ga-g][#b]?)?$/;

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
  // {key:X} markers are NOT section labels — exclude them from the split
  const parts = normalizeSectionLabels(text).split(/\n(?=\{(?!key:)[^}]+\})/i);

  for (const part of parts) {
    const labelMatch = part.match(/^\{(?!key:)([^}]+)\}/i);
    const label = labelMatch ? labelMatch[1].trim() : '';
    const body  = labelMatch ? part.replace(/^\{[^}]+\}\n?/, '') : part;

    // Bloques separados por línea(s) en blanco → cada bloque = un slide
    const blocks = body.split(/\n[ \t]*\n/).map(b => b.trim()).filter(b => b.length > 0);
    if (blocks.length === 0) continue;

    for (const block of blocks) {
      slides.push({ label, content: block });
    }
  }

  return slides.length > 0 ? slides : [{ label: '', content: text.trim() }];
}

/**
 * Props opcionales para uso fuera del PresenterContext (ej: modo Cancionero):
 *   onSaved(savedSong)  — se llama tras guardar exitosamente
 *   onDeleted(id)       — se llama tras borrar exitosamente
 */

// Detecta la posición de inicio de la próxima sílaba en `text` a partir de `pos`.
// Reglas simplificadas de silabificación española:
//   - Una consonante entre vocales va con la sílaba siguiente
//   - Dos o más consonantes: el último (o los dos en grupos inseparables) van con la siguiente
//   - Grupos inseparables: bl br cl cr dr fl fr gl gr pl pr tr rr ll ch
//   - Los marcadores [acorde] y {sección} se saltan automáticamente
function findNextSyllablePos(text, pos) {
  const VOWELS = 'aeiouáéíóúüAEIOUÁÉÍÓÚÜ';
  // Grupos consonánticos que van JUNTOS con la siguiente sílaba
  const INSEP = new Set(['bl','br','cl','cr','dr','fl','fr','gl','gr','pl','pr','tr','rr','ll','ch']);
  const isVowel = c => c !== undefined && VOWELS.includes(c);
  const isAlpha = c => c !== undefined && /[a-záéíóúüA-ZÁÉÍÓÚÜñÑ']/.test(c);
  const n = text.length;

  // Salta marcadores [Acorde] y {Sección}
  const skipMarkers = (i) => {
    while (i < n && (text[i] === '[' || text[i] === '{')) {
      const close = text[i] === '[' ? ']' : '}';
      while (i < n && text[i] !== close && text[i] !== '\n') i++;
      if (i < n && text[i] === close) i++;
    }
    return i;
  };

  // Salta separadores (espacios, puntuación, saltos de línea) y marcadores
  const skipSep = (i) => {
    while (i < n && !isAlpha(text[i]) && text[i] !== '[' && text[i] !== '{') i++;
    return skipMarkers(i);
  };

  let i = skipMarkers(pos);

  // Si saltamos un marcador desde `pos`, aterrizamos justo después de él (inicio de sílaba asociada)
  if (i > pos) return i;

  if (i >= n) return n;

  // ── Paso 1: Avanzar más allá de la sílaba actual ────────────────────────────
  if (isVowel(text[i])) {
    // Estamos en la vocal/núcleo: saltarla completa (diptongos incluidos)
    while (i < n && isVowel(text[i])) i++;
  } else if (isAlpha(text[i])) {
    // Estamos en consonante de onset: saltar onset + núcleo vocálico de esta sílaba
    while (i < n && isAlpha(text[i]) && !isVowel(text[i])) i++;
    i = skipMarkers(i);
    // Saltar la vocal del núcleo
    while (i < n && isVowel(text[i])) i++;
  } else {
    // Puntuación u otro no alfanumérico: avanzar uno
    i++;
  }

  i = skipMarkers(i);

  // Si hay separador (espacio, coma, salto de línea...), saltar hasta el próximo alfa
  if (i >= n || !isAlpha(text[i])) return skipSep(i);

  // ── Paso 2: Aplicar reglas de silabificación sobre las consonantes restantes ─
  const cStart = i;
  while (i < n && isAlpha(text[i]) && !isVowel(text[i])) i++;
  i = skipMarkers(i);

  // Sin vocal siguiente en esta palabra → saltar al próximo segmento
  if (i >= n || !isAlpha(text[i])) return skipSep(i);

  const cCount = i - cStart;
  if (cCount <= 1) return cStart;                          // consonante única → va con esta sílaba
  const lastTwo = text.slice(i - 2, i).toLowerCase();
  if (INSEP.has(lastTwo)) return i - 2;                    // grupo inseparable (ll, rr, tr, etc.)
  return i - 1;                                            // resto: último consonante va con la sílaba
}

export default function SongFormModal({ song, onClose, onSaved, onDeleted }) {
  const presenter = usePresenterOptional(); // null fuera del PresenterProvider
  const isEdit = Boolean(song?.id);

  const [title,       setTitle]       = useState(song?.title    || '');
  const [author,      setAuthor]      = useState(song?.author   || '');
  const [songKey,     setSongKey]     = useState(song?.song_key || '');
  const [bpm,         setBpm]         = useState(song?.bpm      ?? '');
  const [timeSig,     setTimeSig]     = useState(song?.time_sig || '');
  const [link,        setLink]        = useState(song?.link     || '');
  const [body,        setBody]        = useState(() => slidesToText(song?.slides));
  const [tags,        setTags]        = useState(song?.tags || []);
  const [allTags,     setAllTags]     = useState([]);
  const [tagInput,    setTagInput]    = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [confirmDel,  setConfirmDel]  = useState(false);
  const textareaRef     = useRef(null);
  const savedCursorPos  = useRef(null);
  const [cursorPos,     setCursorPos]    = useState(0);
  const [keyPickerOpen, setKeyPickerOpen] = useState(false);
  const [chordMode,     setChordMode]     = useState(false);

  // Clave activa: el último marcador {key:X} que aparece antes del cursor en el texto
  const activeKey = useMemo(() => {
    const re = /\{key:([^}]+)\}/gi;
    let current = songKey;
    let match;
    while ((match = re.exec(body)) !== null) {
      if (match.index < cursorPos) current = match[1].trim();
      else break;
    }
    return current || songKey;
  }, [body, cursorPos, songKey]);

  const insertChord = (chord) => {
    const ta  = textareaRef.current;
    const scrollTop = ta?.scrollTop ?? 0;
    const pos = (ta && document.activeElement === ta)
      ? ta.selectionStart
      : (savedCursorPos.current ?? (body || '').length);
    const ins     = `[${chord}]`;
    const newBody = body.slice(0, pos) + ins + body.slice(pos);
    const newPos  = pos + ins.length;
    savedCursorPos.current = newPos;
    setBody(newBody);
    requestAnimationFrame(() => {
      if (ta) { ta.focus({ preventScroll: true }); ta.scrollTop = scrollTop; ta.setSelectionRange(newPos, newPos); }
    });
  };

  // Teclas comunes para el picker de cambio de clave
  const COMMON_KEYS = [
    ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
    ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'],
  ];

  const insertKeyChange = (newKey) => {
    const ta = textareaRef.current;
    const scrollTop = ta?.scrollTop ?? 0;
    const pos = (ta && document.activeElement === ta)
      ? ta.selectionStart
      : (savedCursorPos.current ?? body.length);
    const before = body.slice(0, pos);
    const after  = body.slice(pos);
    const needNlBefore = before.length > 0 && !before.endsWith('\n');
    const needNlAfter  = after.length  > 0 && !after.startsWith('\n');
    const marker  = `${needNlBefore ? '\n' : ''}{key:${newKey}}${needNlAfter ? '\n' : ''}`;
    const newBody = before + marker + after;
    const newPos  = pos + marker.length;
    setBody(newBody);
    setCursorPos(newPos);
    savedCursorPos.current = newPos;
    setKeyPickerOpen(false);
    requestAnimationFrame(() => {
      if (ta) { ta.focus({ preventScroll: true }); ta.scrollTop = scrollTop; ta.setSelectionRange(newPos, newPos); }
    });
  };

  useEffect(() => {
    api.get('/songs/tags').then(r => setAllTags(r.data)).catch(() => {});
  }, []);

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

    const scrollTop = ta.scrollTop;
    const start  = ta.selectionStart;
    const end    = ta.selectionEnd;
    const insert = `{${lbl}}\n`;
    const newVal = body.slice(0, start) + insert + body.slice(end);
    setBody(newVal);
    requestAnimationFrame(() => {
      ta.focus({ preventScroll: true });
      ta.scrollTop = scrollTop;
      ta.setSelectionRange(start + insert.length, start + insert.length);
    });
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    try {
      if (presenter) {
        await presenter.actions.deleteSong(song.id);
        await presenter.actions.reloadSongs();
      } else {
        await api.delete(`/songs/${song.id}`);
      }
      onDeleted?.(song.id);
      onClose();
    } catch (err) {
      setError(err?.message || 'Error al borrar');
      setConfirmDel(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('El título es requerido'); return; }
    const parsedSlides = textToSlides(body);
    // Preservar slideBackground de los slides originales (por posición) para no perderlos al editar
    const slides = parsedSlides.map((s, i) => ({
      ...s,
      slideBackground: song?.slides?.[i]?.slide_background ?? null,
    }));
    setSaving(true);
    setError('');
    const payload = { title, author, song_key: songKey || null, bpm: bpm !== '' ? bpm : null, time_sig: timeSig || null, link: link || null, tags, slides };
    try {
      let savedSong;
      if (presenter) {
        if (isEdit) {
          savedSong = await presenter.actions.updateSong(song.id, payload);
          await presenter.actions.loadSongDetail(song.id);
        } else {
          savedSong = await presenter.actions.createSong(payload);
        }
        await presenter.actions.reloadSongs();
      } else {
        // Fuera del PresenterContext (ej: Cancionero) → API directa
        if (isEdit) {
          const res = await api.put(`/songs/${song.id}`, payload);
          savedSong = res.data;
        } else {
          const res = await api.post('/songs', payload);
          savedSong = res.data;
        }
      }
      onSaved?.(savedSong);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 sm:p-3">
      <div className="bg-surface-800 border border-surface-600 w-full h-[100dvh] flex flex-col shadow-2xl sm:rounded-xl sm:h-[90vh] sm:max-w-[95vw] lg:w-[1080px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-700 shrink-0">
          <h2 className="font-semibold text-lg">
            {isEdit ? 'Editar canción' : 'Nueva canción'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden flex-1">
          {/* ── 3 columnas en desktop, 1 columna en móvil ── */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

          {/* ── Col 1: Acordes ── */}
          <div className="lg:w-52 shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-surface-700">
            {(() => {
              const groups = buildScaleChords(activeKey);
              if (!groups && !songKey) return (
                <div className="hidden lg:flex items-center justify-center h-full p-4 text-xs text-zinc-600 italic text-center">
                  Define una clave para ver acordes
                </div>
              );
              return (
                <div className="flex flex-col h-full">
                  <div className="sticky top-0 z-10 flex items-center px-3 py-2 border-b border-surface-700/50 bg-surface-800/90">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
                      Acordes &nbsp;<span className="font-bold text-accent">{activeKey || '—'}</span>
                      {activeKey && activeKey !== songKey && (
                        <span className="text-zinc-600 ml-1 font-normal">({songKey})</span>
                      )}
                    </span>
                  </div>
                  <div className="overflow-y-auto flex-1 pb-2">
                    {groups && groups.map(group => (
                      <div key={group.label} className="px-2 pt-2 pb-1 border-b border-surface-700/50 last:border-b-0">
                        <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">{group.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {group.chords.map(chord => (
                            <button
                              key={chord}
                              type="button"
                              onClick={() => insertChord(chord)}
                              className="px-2 py-1 rounded-md bg-surface-700 hover:bg-accent/20 border border-surface-600 hover:border-accent/50 text-zinc-300 text-xs font-mono transition-colors"
                            >
                              {chord}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Col 2: Metadatos + Etiquetas + Letra ── */}
          <div className="flex-1 overflow-y-auto min-w-0">
          {/* Campos básicos */}
          <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-surface-700">
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
          <div className="px-4 sm:px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-surface-700">
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

          {/* Etiquetas de categoría */}
          <div className="px-4 sm:px-6 py-3 border-b border-surface-700">
            <label className="flex items-center gap-1 text-xs text-zinc-400 mb-2"><Tag size={11} />Etiquetas</label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 bg-accent/20 border border-accent/40 text-accent text-xs px-2 py-0.5 rounded-full">
                  {t}
                  <button type="button" onClick={() => setTags(prev => prev.filter(x => x !== t))} className="hover:text-white transition-colors"><X size={10} /></button>
                </span>
              ))}
              {/* Sugerencias de tags existentes no aplicadas */}
              {allTags.filter(t => !tags.includes(t)).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags(prev => [...prev, t])}
                  className="flex items-center gap-1 border border-dashed border-surface-500 text-zinc-500 hover:text-zinc-200 hover:border-zinc-400 text-xs px-2 py-0.5 rounded-full transition-colors"
                >
                  <Plus size={9} />{t}
                </button>
              ))}
              {/* Input nueva etiqueta */}
              <input
                className="bg-transparent border-b border-surface-500 focus:border-accent outline-none text-xs text-zinc-300 placeholder-zinc-600 px-1 py-0.5 w-28"
                placeholder="Nueva etiqueta..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                    e.preventDefault();
                    const t = tagInput.trim().replace(/,$/, '');
                    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
                    setTagInput('');
                  }
                }}
              />
            </div>
          </div>

          {/* Editor de letra */}
          <div className="px-4 sm:px-6 pt-2 pb-6 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 flex items-center gap-2">
                  Letra
                  {songKey && (
                    <span className="text-accent font-semibold">{songKey}</span>
                  )}
                  {/* Botón modo acordes */}
                  <button
                    type="button"
                    onClick={() => setChordMode(v => !v)}
                    title="Modo acordes: cada palabra detectada como acorde se envuelve en [] automáticamente al presionar Espacio o Enter"
                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      chordMode
                        ? 'bg-accent/20 border-accent/50 text-accent'
                        : 'bg-surface-700 border-surface-600 text-zinc-400 hover:text-accent hover:border-accent/40'
                    }`}
                  >
                    <Music2 size={10} />
                    {chordMode ? 'Acordes ON' : 'Modo acordes'}
                  </button>
                </label>
                <span className="text-xs text-zinc-600 hidden sm:inline">
                  Línea en blanco = nueva diapositiva.{' '}
                  <code className="bg-surface-700 px-1 rounded">{'{Verso}'}</code>{' '}
                  para marcar secciones
                </span>
              </div>
              <textarea
                ref={textareaRef}
                rows={25}
                className="input resize-none font-mono text-sm leading-relaxed"
                value={body}
                onChange={e => setBody(e.target.value)}
                onBlur={() => { savedCursorPos.current = textareaRef.current?.selectionStart ?? null; }}
                onSelect={() => {
                  const p = textareaRef.current?.selectionStart ?? 0;
                  savedCursorPos.current = p;
                  setCursorPos(p);
                }}
                onClick={() => setCursorPos(textareaRef.current?.selectionStart ?? 0)}
                onKeyUp={() => setCursorPos(textareaRef.current?.selectionStart ?? 0)}
                onKeyDown={e => {
                  // Modo acordes: Space o Enter envuelve la última palabra en [] si es un acorde
                  if (chordMode && (e.key === ' ' || e.key === 'Enter')) {
                    const ta = textareaRef.current;
                    const pos = ta.selectionStart;
                    // Usar ta.value (DOM) en lugar del estado body para evitar closures obsoletos
                    const currentVal = ta.value;
                    const textBefore = currentVal.slice(0, pos);
                    const wordMatch  = textBefore.match(/(\S+)$/);
                    if (wordMatch) {
                      const word = wordMatch[1];
                      if (!word.startsWith('[') && !word.startsWith('{') && CHORD_MODE_RE.test(word)) {
                        e.preventDefault();
                        const wordStart = pos - word.length;
                        const suffix    = e.key === 'Enter' ? '\n' : ' ';
                        const wrapped   = `[${word}]${suffix}`;
                        const newBody   = currentVal.slice(0, wordStart) + wrapped + currentVal.slice(pos);
                        const newPos    = wordStart + wrapped.length;
                        setBody(newBody);
                        setCursorPos(newPos);
                        savedCursorPos.current = newPos;
                        requestAnimationFrame(() => {
                          if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(newPos, newPos); }
                        });
                        return;
                      }
                    }
                  }
                  // Tab → navegación de sílabas
                  if (e.key !== 'Tab') return;
                  e.preventDefault();
                  const ta = textareaRef.current;
                  if (!ta) return;
                  const pos = ta.selectionStart;
                  const next = findNextSyllablePos(body, pos);
                  savedCursorPos.current = next;
                  setCursorPos(next);
                  ta.setSelectionRange(next, next);
                }}
                placeholder={`{Verso 1}\nPrimera línea del verso\nSegunda línea\n\n{Coro}\nLetra del coro`}
                spellCheck={false}
              />
          </div>{/* end editor */}
          </div>{/* end scroll */}

            {/* ── Col 3: Labels + Borrar + Cambio de clave ── */}
            <div className="lg:w-44 shrink-0 flex flex-col gap-2 py-4 border-t lg:border-t-0 lg:border-l border-surface-700 px-3 overflow-y-auto">
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
                {(() => {
                  const DEFAULT_LABELS = ['Intro', 'Verso', 'Pre-Coro', 'Coro', 'Puente', 'Instrumental', 'Interludio', 'Final'];
                  const combined = [
                    ...DEFAULT_LABELS,
                    ...uniqueLabels.filter(l => !DEFAULT_LABELS.includes(l)),
                  ];
                  return combined.map(lbl => {
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
                  });
                })()}
              </div>

              {/* Cambio de clave */}
              {songKey && (
                <>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mt-2">Cambio de clave</p>
                  <button
                    type="button"
                    onClick={() => setKeyPickerOpen(v => !v)}
                    className={`w-full text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                      keyPickerOpen
                        ? 'bg-accent/20 border-accent/50 text-accent'
                        : 'bg-surface-700 border-surface-600 text-zinc-400 hover:text-accent hover:border-accent/40'
                    }`}
                  >
                    {keyPickerOpen ? '✕ Cancelar' : '⇕ Insertar en cursor'}
                  </button>
                  {keyPickerOpen && (
                    <div className="flex flex-col gap-0.5">
                      {COMMON_KEYS.flat().map(k => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => insertKeyChange(k)}
                          className={`w-full text-left px-2 py-1 rounded text-xs font-mono border transition-colors ${
                            k === activeKey
                              ? 'bg-accent/30 border-accent/60 text-accent'
                              : 'bg-surface-700 border-surface-600 text-zinc-300 hover:bg-accent/20'
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-surface-700 flex items-center justify-between shrink-0">
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

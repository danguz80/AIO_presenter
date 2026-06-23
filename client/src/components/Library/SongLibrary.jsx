import { useState, useCallback, useRef, useEffect } from 'react';
import { usePresenter }  from '../../context/usePresenter';
import SongFormModal     from './SongFormModal';
import ImportModal       from './ImportModal';
import { Search, Plus, Music, Trash2, Upload, Loader2, Tag, X, Check, Clock } from 'lucide-react';
import api from '../../hooks/useApi';

// ─── Modal de asignación de etiquetas ────────────────────────────────────────
function LabelPickerModal({ selectedSongs, allTags, onClose, onApply, onRefreshTags }) {
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState('');
  const total = selectedSongs.length;

  // cuántas canciones seleccionadas tienen cada tag
  const tagCount = {};
  for (const song of selectedSongs) {
    for (const t of (song.tags || [])) {
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }

  const toggle = async (tag) => {
    const count = tagCount[tag] || 0;
    const remove = count === total; // si todas lo tienen → quitar, si no → agregar
    setBusy(true);
    try { await onApply(tag, !remove); }
    finally { setBusy(false); }
  };

  const addNew = async () => {
    const t = newTag.trim();
    if (!t) return;
    setBusy(true);
    try {
      await onApply(t, true);
      await onRefreshTags();
      setNewTag('');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-800 border border-surface-600 rounded-lg shadow-xl w-72 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Tag size={14} className="text-accent" />
            Etiquetar {total} canción{total !== 1 ? 'es' : ''}
          </h3>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-200 rounded">
            <X size={14} />
          </button>
        </div>

        {/* Lista de tags existentes */}
        <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
          {allTags.length === 0 && (
            <p className="text-xs text-zinc-500 py-3 text-center">No hay etiquetas aún. Crea la primera.</p>
          )}
          {allTags.map(tag => {
            const count = tagCount[tag] || 0;
            const allHave  = count === total;
            const someHave = count > 0 && count < total;
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                disabled={busy}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-700 text-left w-full transition-colors disabled:opacity-50"
              >
                <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0
                  ${allHave  ? 'bg-accent border-accent' :
                    someHave ? 'bg-accent/40 border-accent' :
                               'border-zinc-600'}`}>
                  {allHave  && <Check size={10} className="text-white" />}
                  {someHave && <span className="w-2 h-0.5 bg-white rounded" />}
                </span>
                <span className="text-sm text-zinc-200 flex-1">{tag}</span>
                <span className="text-xs text-zinc-500">{count}/{total}</span>
              </button>
            );
          })}
        </div>

        {/* Input nueva etiqueta */}
        <div className="flex gap-2 pt-2 border-t border-surface-600">
          <input
            className="input flex-1 text-sm py-1"
            placeholder="Nueva etiqueta..."
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addNew()}
          />
          <button
            onClick={addNew}
            disabled={busy || !newTag.trim()}
            className="btn-primary px-3 py-1 text-xs flex items-center gap-1"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
function formatRelativeDate(dateStr) {
  if (!dateStr) return null;
  const d    = new Date(dateStr);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000); // segundos
  if (diff < 60)           return 'hace un momento';
  if (diff < 3600)         return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400)        return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7)    return `hace ${Math.floor(diff / 86400)} días`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: diff > 86400 * 365 ? 'numeric' : undefined });
}

export default function SongLibrary() {
  const { state, actions } = usePresenter();
  const [search,      setSearch]      = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [showImport,  setShowImport]  = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Multi-selección
  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const lastClickedIdx = useRef(null);

  // Filtro por etiqueta
  const [allTags,        setAllTags]        = useState([]);
  const [activeTagFilter, setActiveTagFilter] = useState(null);

  // Label picker
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  // Cargar todas las etiquetas al montar
  useEffect(() => {
    api.get('/songs/tags').then(r => setAllTags(r.data)).catch(() => {});
  }, []);

  const refreshTags = useCallback(async () => {
    const r = await api.get('/songs/tags');
    setAllTags(r.data);
  }, []);

  const reload = useCallback(async (s, tag) => {
    await actions.reloadSongs(s, tag);
  }, [actions]);

  const handleSearch = useCallback(async (value) => {
    setSearch(value);
    await reload(value, activeTagFilter);
  }, [reload, activeTagFilter]);

  const handleTagFilter = async (tag) => {
    const next = activeTagFilter === tag ? null : tag;
    setActiveTagFilter(next);
    await reload(search, next);
  };

  const handleRowClick = async (song) => {
    if (selectedIds.size > 0) return; // en modo selección el click de fila no carga
    await actions.loadSongDetail(song.id, { broadcast: true });
  };

  const handleCheckbox = (e, song, idx) => {
    e.stopPropagation();
    const songs = state.songs;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedIdx.current !== null) {
        // rango shift+click
        const start = Math.min(lastClickedIdx.current, idx);
        const end   = Math.max(lastClickedIdx.current, idx);
        for (let i = start; i <= end; i++) next.add(songs[i].id);
      } else {
        if (next.has(song.id)) next.delete(song.id);
        else next.add(song.id);
        lastClickedIdx.current = idx;
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    lastClickedIdx.current = null;
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar esta canción?')) return;
    await actions.deleteSong(id);
  };

  const handleEdit = async (e, song) => {
    e.stopPropagation();
    setLoadingEdit(song.id);
    try {
      const res = await api.get(`/songs/${song.id}`);
      setEditingSong(res.data);
      setShowForm(true);
    } catch {
      setEditingSong(song);
      setShowForm(true);
    } finally {
      setLoadingEdit(false);
    }
  };

  const applyTagToSelected = async (tag, add) => {
    await api.patch('/songs/bulk-tag', {
      ids: [...selectedIds],
      addTags:    add ? [tag] : [],
      removeTags: add ? [] : [tag],
    });
    await reload(search, activeTagFilter);
    await refreshTags();
  };

  const selectedSongs = state.songs.filter(s => selectedIds.has(s.id));

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-surface-700">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          Canciones
          <span className="bg-surface-600 text-zinc-300 text-xs font-bold px-1.5 py-0.5 rounded-full">
            {state.songs.length}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowImport(true)}
            className="btn-ghost py-1 px-2 flex items-center gap-1 text-xs"
          >
            <Upload size={13} />Importar
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary py-1 px-2 flex items-center gap-1"
          >
            <Plus size={14} />Nueva
          </button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="px-3 py-2 border-b border-surface-700">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input pl-8"
            placeholder="Buscar canción..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Chips de filtro por etiqueta */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-surface-700">
          {allTags.filter(tag => !['adoración', 'adoracion', 'clásico', 'clasico', 'contemporáneo', 'contemporaneo'].includes(tag.toLowerCase())).map(tag => (
            <button
              key={tag}
              onClick={() => handleTagFilter(tag)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors
                ${activeTagFilter === tag
                  ? 'bg-accent border-accent text-white'
                  : 'border-surface-600 text-zinc-400 hover:border-accent hover:text-zinc-200'}`}
            >
              <Tag size={9} />{tag}
              {activeTagFilter === tag && <X size={9} />}
            </button>
          ))}
        </div>
      )}

      {/* Barra de acción multi-selección */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 border-b border-accent/30">
          <span className="text-xs text-accent font-medium flex-1">
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowLabelPicker(true)}
            className="flex items-center gap-1 text-xs bg-surface-700 hover:bg-surface-600 text-zinc-200 px-2 py-1 rounded"
          >
            <Tag size={11} />Etiquetar
          </button>
          <button onClick={clearSelection} className="p-1 text-zinc-500 hover:text-zinc-200 rounded">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Lista de canciones */}
      <div className="flex-1 overflow-y-auto">
        {state.songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-600 gap-2">
            <Music size={28} />
            <span className="text-sm">Sin canciones</span>
          </div>
        ) : (
          <ul>
            {state.songs.map((song, idx) => {
              const isSelected = selectedIds.has(song.id);
              const isActive   = state.selectedSong?.id === song.id;
              return (
                <li
                  key={song.id}
                  onClick={() => handleRowClick(song)}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-surface-700/50
                    hover:bg-surface-700 transition-colors
                    ${isActive && selectedIds.size === 0 ? 'bg-surface-700 border-l-2 border-l-accent' : ''}
                    ${isSelected ? 'bg-accent/10' : ''}`}
                >
                  {/* Checkbox de selección */}
                  <button
                    onClick={e => handleCheckbox(e, song, idx)}
                    className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors
                      ${isSelected
                        ? 'bg-accent border-accent'
                        : `border-zinc-600 ${selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}`}
                  >
                    {isSelected && <Check size={10} className="text-white" />}
                  </button>

                  <Music size={14} className="text-zinc-500 shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <p className="text-sm text-zinc-100 truncate flex-1 min-w-0">{song.title}</p>
                      {song.song_key && (
                        <span className="shrink-0 text-[10px] font-bold bg-accent/10 text-accent border border-accent/30 rounded px-1 py-px leading-none">{song.song_key}</span>
                      )}
                    </div>
                    {song.author && (
                      <p className="text-xs text-zinc-500 truncate">{song.author}</p>
                    )}
                    {/* Última edición */}
                    {song.updated_at && (
                      <p className="text-[10px] text-zinc-600 truncate flex items-center gap-1 mt-0.5">
                        <Clock size={9} className="shrink-0" />
                        {formatRelativeDate(song.updated_at)}
                        {(song.updated_by_name || song.updated_by_email) && (
                          <span className="text-zinc-700">·</span>
                        )}
                        {song.updated_by_name
                          ? <span className="truncate max-w-[100px]">{song.updated_by_name}</span>
                          : song.updated_by_email
                            ? <span className="truncate max-w-[100px]">{song.updated_by_email.split('@')[0]}</span>
                            : null}
                      </p>
                    )}
                    {song.tags && song.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {song.tags.map(t => (
                          <span
                            key={t}
                            className="text-[10px] bg-surface-600 text-zinc-400 px-1.5 py-0.5 rounded-full"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Acciones hover (solo cuando no hay selección activa) */}
                  {selectedIds.size === 0 && (
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={e => handleEdit(e, song)}
                        className="p-1 text-zinc-400 hover:text-white hover:bg-surface-600 rounded"
                        title="Editar"
                        disabled={loadingEdit === song.id}
                      >
                        {loadingEdit === song.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : '✏️'}
                      </button>
                      <button
                        onClick={e => handleDelete(e, song.id)}
                        className="p-1 text-zinc-400 hover:text-red-400 hover:bg-surface-600 rounded"
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal etiquetas */}
      {showLabelPicker && (
        <LabelPickerModal
          selectedSongs={selectedSongs}
          allTags={allTags}
          onClose={() => setShowLabelPicker(false)}
          onApply={applyTagToSelected}
          onRefreshTags={refreshTags}
        />
      )}

      {showForm && (
        <SongFormModal
          song={editingSong}
          onClose={() => { setShowForm(false); setEditingSong(null); }}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </>
  );
}

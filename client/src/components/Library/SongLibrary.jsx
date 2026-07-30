import { useState, useCallback, useRef, useEffect } from 'react';
import { usePresenter }  from '../../context/usePresenter';
import { useScheduleAdd } from '../../context/ScheduleAddContext';
import SongFormModal     from './SongFormModal';
import ImportModal       from './ImportModal';
import { Search, Plus, Music, Trash2, Upload, Loader2, Tag, X, Check, Clock, Info, GalleryThumbnails } from 'lucide-react';
import api from '../../hooks/useApi';
import EventPickerModal from '../shared/EventPickerModal';
import { addSongToEvent, fetchEventsAround } from '../../utils/eventSongActions';

const API_BASE = import.meta.env.VITE_API_URL || '';

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
  const isAdmin = (() => {
    try {
      const token = localStorage.getItem('aio_sync_token');
      if (!token) return false;
      return JSON.parse(atob(token.split('.')[1]))?.isAdmin === true;
    } catch {
      return false;
    }
  })();
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
  const [draggingSongId, setDraggingSongId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [eventPickerLoading, setEventPickerLoading] = useState(false);
  const [eventPickerEvents, setEventPickerEvents] = useState([]);
  const [eventTargetSong, setEventTargetSong] = useState(null);
  const [eventActionMsg, setEventActionMsg] = useState('');
  const longPressTimerRef = useRef(null);
  const longPressOpenedRef = useRef(false);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const { fn: addToOpenEventFn } = useScheduleAdd() ?? {};

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

  const invertSelection = () => {
    if (!state.songs?.length) return;
    setSelectedIds(prev => {
      const next = new Set();
      for (const song of state.songs) {
        if (!prev.has(song.id)) next.add(song.id);
      }
      return next;
    });
    lastClickedIdx.current = null;
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!isAdmin) return;
    if (!confirm('¿Eliminar esta canción?')) return;
    await actions.deleteSong(id);
  };

  const handleEdit = async (e, song) => {
    e.stopPropagation();
    if (!isAdmin) return;
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

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [contextMenu]);

  const clampMenuPosition = useCallback((x, y) => {
    const margin = 12;
    const menuWidth = 280;
    const menuHeight = 190;
    const vw = window.innerWidth || 360;
    const vh = window.innerHeight || 640;
    return {
      x: Math.min(Math.max(x, margin), Math.max(margin, vw - menuWidth - margin)),
      y: Math.min(Math.max(y, margin), Math.max(margin, vh - menuHeight - margin)),
    };
  }, []);

  const openContextMenu = useCallback((event, song) => {
    event.preventDefault();
    event.stopPropagation();
    longPressOpenedRef.current = false;
    const pos = clampMenuPosition(event.clientX, event.clientY);
    setEventTargetSong(song);
    setContextMenu({ ...pos, song });
  }, [clampMenuPosition]);

  const clearLongPressTimer = useCallback(() => {
    if (!longPressTimerRef.current) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const openContextMenuAt = useCallback((x, y, song) => {
    const pos = clampMenuPosition(x, y);
    setEventTargetSong(song);
    setContextMenu({ ...pos, song });
  }, [clampMenuPosition]);

  const handleSongPointerDown = useCallback((event, song) => {
    if (event.pointerType !== 'touch') return;
    longPressOpenedRef.current = false;
    touchStartRef.current = { x: event.clientX, y: event.clientY };
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressOpenedRef.current = true;
      openContextMenuAt(event.clientX, event.clientY, song);
      setTimeout(() => { longPressOpenedRef.current = false; }, 900);
    }, 480);
  }, [clearLongPressTimer, openContextMenuAt]);

  const handleSongPointerMove = useCallback((event) => {
    if (event.pointerType !== 'touch' || !longPressTimerRef.current) return;
    const dx = Math.abs(event.clientX - touchStartRef.current.x);
    const dy = Math.abs(event.clientY - touchStartRef.current.y);
    if (dx > 12 || dy > 12) clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleSongPointerUp = useCallback((event) => {
    if (event.pointerType === 'touch') clearLongPressTimer();
  }, [clearLongPressTimer]);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  const openEventPicker = useCallback(async () => {
    setEventTargetSong(contextMenu?.song || null);
    setContextMenu(null);
    setEventPickerOpen(true);
    setEventPickerLoading(true);
    try {
      const list = await fetchEventsAround({ apiBase: API_BASE, pastDays: 180, futureDays: 180 });
      setEventPickerEvents(list);
    } catch (err) {
      console.error(err);
      setEventActionMsg('No se pudieron cargar eventos');
    } finally {
      setEventPickerLoading(false);
    }
  }, [contextMenu]);

  const addToOpenEvent = useCallback(async () => {
    const song = contextMenu?.song;
    if (!song) return;
    if (!addToOpenEventFn) {
      setEventActionMsg('No hay evento abierto en el panel de eventos');
      setContextMenu(null);
      return;
    }
    try {
      await addToOpenEventFn({ kind: 'song', song });
      setEventActionMsg(`"${song.title}" agregada al evento abierto`);
    } catch (err) {
      console.error(err);
      setEventActionMsg('No se pudo agregar al evento abierto');
    } finally {
      setContextMenu(null);
    }
  }, [contextMenu, addToOpenEventFn]);

  const addToPickedEvent = useCallback(async (eventItem) => {
    const song = eventTargetSong || contextMenu?.song;
    if (!song) return;
    try {
      const result = await addSongToEvent({ event: eventItem, song, apiBase: API_BASE });
      if (result.duplicate) {
        setEventActionMsg(`"${song.title}" ya estaba en ese evento`);
      } else {
        setEventActionMsg(`"${song.title}" agregada a "${eventItem.title}"`);
      }
    } catch (err) {
      console.error(err);
      setEventActionMsg('No se pudo agregar la canción al evento');
    } finally {
      setEventPickerOpen(false);
      setContextMenu(null);
      setEventTargetSong(null);
    }
  }, [eventTargetSong, contextMenu]);

  useEffect(() => {
    if (!eventActionMsg) return;
    const t = setTimeout(() => setEventActionMsg(''), 2400);
    return () => clearTimeout(t);
  }, [eventActionMsg]);

  const headerLabel = activeTagFilter && activeTagFilter.toLowerCase() !== 'canciones'
    ? 'Presentaciones'
    : 'Canciones';

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-surface-700">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          {headerLabel}
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
          {isAdmin && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary py-1 px-2 flex items-center gap-1"
            >
              <Plus size={14} />Nueva
            </button>
          )}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="px-3 py-2 border-b border-surface-700">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              className="input pl-8"
              placeholder="Buscar canción..."
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
          <button
            onClick={invertSelection}
            disabled={!state.songs.length}
            className="btn-ghost py-1 px-2 text-xs whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            title="Invertir selección"
          >
            Invertir selección
          </button>
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

      {eventActionMsg && (
        <div className="px-3 py-2 text-xs text-emerald-300 bg-emerald-500/10 border-b border-emerald-500/20">
          {eventActionMsg}
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
              const isDragging = draggingSongId === song.id;
              return (
                <li
                  key={song.id}
                  draggable={selectedIds.size === 0}
                  onContextMenu={(e) => openContextMenu(e, song)}
                  onPointerDown={(e) => handleSongPointerDown(e, song)}
                  onPointerMove={handleSongPointerMove}
                  onPointerUp={handleSongPointerUp}
                  onPointerCancel={handleSongPointerUp}
                  onDragStart={(e) => {
                    if (selectedIds.size > 0) {
                      e.preventDefault();
                      return;
                    }
                    const payload = {
                      id: song.id,
                      title: song.title,
                      author: song.author || null,
                    };
                    e.dataTransfer.setData('application/x-aio-song', JSON.stringify(payload));
                    e.dataTransfer.setData('text/plain', song.title || 'song');
                    e.dataTransfer.effectAllowed = 'copy';
                    setDraggingSongId(song.id);
                  }}
                  onDragEnd={() => setDraggingSongId(null)}
                  onClick={(e) => {
                    if (longPressOpenedRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      longPressOpenedRef.current = false;
                      return;
                    }
                    handleRowClick(song);
                  }}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-surface-700/50
                    hover:bg-surface-700 transition-colors
                    ${isActive && selectedIds.size === 0 ? 'bg-surface-700 border-l-2 border-l-accent' : ''}
                    ${isSelected ? 'bg-accent/10' : ''}
                    ${isDragging ? 'opacity-60' : ''}`}
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

                  {(() => {
                    const tags = song.tags || [];
                    if (tags.includes('Canciones')) return <Music size={14} className="text-zinc-500 shrink-0" />;
                    if (tags.some(t => t.toLowerCase() === 'info' || t.toLowerCase() === 'información' || t.toLowerCase() === 'informacion')) return <Info size={14} className="text-blue-400 shrink-0" />;
                    return <GalleryThumbnails size={14} className="text-zinc-500 shrink-0" />;
                  })()}

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
                  {selectedIds.size === 0 && isAdmin && (
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

      {showForm && isAdmin && (
        <SongFormModal
          song={editingSong}
          onClose={() => { setShowForm(false); setEditingSong(null); }}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}

      {contextMenu && (
        <div
          className="fixed z-[95] min-w-[230px] bg-surface-800 border border-surface-600 rounded-xl shadow-2xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-surface-700">
            <p className="text-xs text-zinc-400">Canción</p>
            <p className="text-sm text-zinc-100 font-medium truncate">{contextMenu.song?.title}</p>
          </div>
          <button
            onClick={addToOpenEvent}
            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
              addToOpenEventFn ? 'hover:bg-surface-700 text-zinc-100' : 'text-zinc-500 cursor-not-allowed'
            }`}
            disabled={!addToOpenEventFn}
          >
            Agregar al evento abierto
          </button>
          <button
            onClick={openEventPicker}
            className="w-full text-left px-3 py-2 text-sm hover:bg-surface-700 text-zinc-100"
          >
            Elegir evento por fecha...
          </button>
        </div>
      )}

      {eventPickerOpen && (
        <EventPickerModal
          title="Agregar canción a evento"
          events={eventPickerEvents}
          loading={eventPickerLoading}
          onClose={() => setEventPickerOpen(false)}
          onPick={addToPickedEvent}
        />
      )}
    </>
  );
}

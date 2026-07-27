import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Music2, ChevronRight, Loader2, X, Plus, Tag } from 'lucide-react';
import CancioneroNavbar from './CancioneroNavbar';
import SongFormModal from '../../components/Library/SongFormModal';
import DemoPackBanner from '../../components/shared/DemoPackBanner';
import EventPickerModal from '../../components/shared/EventPickerModal';
import useVolumeKeys from '../../hooks/useVolumeKeys';
import { addSongToEvent, fetchEventsAround } from '../../utils/eventSongActions';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}
function norm(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function CancioneroSongs() {
  const navigate  = useNavigate();
  const isAdmin = (() => {
    try {
      const token = localStorage.getItem('aio_sync_token');
      if (!token) return false;
      return JSON.parse(atob(token.split('.')[1]))?.isAdmin === true;
    } catch {
      return false;
    }
  })();
  const scrollRef = useRef(null);
  useVolumeKeys(
    () => scrollRef.current?.scrollBy({ top: -150, behavior: 'smooth' }),
    () => scrollRef.current?.scrollBy({ top:  150, behavior: 'smooth' }),
  );
  const [songs, setSongs]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const [newSongOpen, setNewSongOpen] = useState(false);
  const [showBanner, setShowBanner]   = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [eventPickerLoading, setEventPickerLoading] = useState(false);
  const [eventPickerEvents, setEventPickerEvents] = useState([]);
  const [eventTargetSong, setEventTargetSong] = useState(null);
  const [eventActionMsg, setEventActionMsg] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState(null);

  const loadSongs = () => {
    setLoading(true);
    fetch(`${API}/api/songs`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.songs ?? [];
        setSongs(list);
        setShowBanner(list.length === 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadSongs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const availableTags = useMemo(() => {
    const set = new Set();
    for (const s of songs) {
      for (const t of (s.tags || [])) {
        const clean = String(t || '').trim();
        if (clean) set.add(clean);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [songs]);

  const filtered = songs.filter(s => {
    const q = norm(query);
    const textMatch = !q || norm(s.title).includes(q) || norm(s.author).includes(q) || (s.tags || []).some(t => norm(t).includes(q));
    const tagMatch = !activeTagFilter || (s.tags || []).some(t => norm(t) === norm(activeTagFilter));
    return textMatch && tagMatch;
  });

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

  useEffect(() => {
    if (!eventActionMsg) return;
    const t = setTimeout(() => setEventActionMsg(''), 2400);
    return () => clearTimeout(t);
  }, [eventActionMsg]);

  const openContextMenu = (event, song) => {
    event.preventDefault();
    event.stopPropagation();
    setEventTargetSong(song);
    setContextMenu({ x: event.clientX, y: event.clientY, song });
  };

  const openEventPicker = async () => {
    setEventTargetSong(contextMenu?.song || null);
    setContextMenu(null);
    setEventPickerOpen(true);
    setEventPickerLoading(true);
    try {
      const list = await fetchEventsAround({ apiBase: API, pastDays: 180, futureDays: 180 });
      setEventPickerEvents(list);
    } catch (err) {
      console.error(err);
      setEventActionMsg('No se pudieron cargar eventos');
    } finally {
      setEventPickerLoading(false);
    }
  };

  const loadOpenEventRef = () => {
    try {
      const raw = localStorage.getItem('aio_open_event_ref');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.id) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const addToOpenEvent = async () => {
    const song = contextMenu?.song;
    const ref = loadOpenEventRef();
    if (!song || !ref) {
      setEventActionMsg('No hay evento abierto en modo Cancionero');
      setContextMenu(null);
      return;
    }

    try {
      const today = String(ref.occurrence_date || new Date().toISOString().slice(0, 10));
      const list = await fetchEventsAround({ apiBase: API, pastDays: 730, futureDays: 730 });
      const match = list.find((ev) => {
        const evDate = String(ev.occurrence_date || ev.date).slice(0, 10);
        if (String(ev.id) !== String(ref.id)) return false;
        if (!ref.occurrence_date) return true;
        return evDate === today;
      });
      if (!match) throw new Error('Evento abierto no encontrado');
      const result = await addSongToEvent({ event: match, song, apiBase: API });
      if (result.duplicate) setEventActionMsg(`"${song.title}" ya estaba en ese evento`);
      else setEventActionMsg(`"${song.title}" agregada al evento abierto`);
    } catch (err) {
      console.error(err);
      setEventActionMsg('No se pudo agregar al evento abierto');
    } finally {
      setContextMenu(null);
    }
  };

  const addToPickedEvent = async (eventItem) => {
    const song = eventTargetSong || contextMenu?.song;
    if (!song) return;
    try {
      const result = await addSongToEvent({ event: eventItem, song, apiBase: API });
      if (result.duplicate) setEventActionMsg(`"${song.title}" ya estaba en ese evento`);
      else setEventActionMsg(`"${song.title}" agregada a "${eventItem.title}"`);
    } catch (err) {
      console.error(err);
      setEventActionMsg('No se pudo agregar la canción al evento');
    } finally {
      setEventPickerOpen(false);
      setContextMenu(null);
      setEventTargetSong(null);
    }
  };

  return (
    <div className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/cancionero')} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} className="text-white/70" />
          </button>
          <h1 className="text-base font-bold flex-1">Canciones</h1>
          <span className="text-xs text-white/30">{songs.length} total</span>
          {isAdmin && (
            <button
              onClick={() => setNewSongOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/35 border border-yellow-400/30 text-yellow-300 text-xs font-semibold transition-colors"
              title="Nueva canción"
            >
              <Plus size={14} /> Nueva
            </button>
          )}
        </div>
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por título, artista o etiqueta…"
              className="w-full bg-white/10 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-yellow-400/50 focus:bg-white/15 transition-colors"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                <X size={14} />
              </button>
            )}
          </div>
          {availableTags.length > 0 && (
            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
              {availableTags.map(tag => {
                const active = activeTagFilter === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveTagFilter(active ? null : tag)}
                    className={`shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-yellow-500/25 border-yellow-400/50 text-yellow-200'
                        : 'bg-white/5 border-white/15 text-white/60 hover:text-white/80 hover:border-white/30'
                    }`}
                  >
                    <Tag size={10} /> {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {eventActionMsg && (
          <div className="mx-4 mt-3 px-3 py-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            {eventActionMsg}
          </div>
        )}
        {/* Banner pack de inicio — visible cuando no hay canciones */}
        {!loading && showBanner && !query && (
          <div className="pt-4">
            <DemoPackBanner
              onSongsImported={() => { loadSongs(); }}
              onDismiss={() => setShowBanner(false)}
            />
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="text-yellow-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-white/30">
            <Music2 size={40} />
            <p className="text-sm">{(query || activeTagFilter) ? 'Sin resultados para tu búsqueda/filtro' : 'No hay canciones'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map(song => (
              <li key={song.id}>
                <button
                  onContextMenu={(e) => openContextMenu(e, song)}
                  onClick={() => navigate(`/cancionero/canciones/${song.id}`)}
                  className="group w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 text-left transition-colors"
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-yellow-500/15 border border-yellow-400/20 flex items-center justify-center">
                    <Music2 size={16} className="text-yellow-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{song.title}</p>
                    {song.author && <p className="text-xs text-white/40 truncate mt-0.5">{song.author}</p>}
                    {song.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {song.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-white/20 group-hover:text-white/50 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CancioneroNavbar />

      {newSongOpen && isAdmin && (
        <SongFormModal
          onClose={() => setNewSongOpen(false)}
          onSaved={(saved) => {
            setNewSongOpen(false);
            loadSongs();
            if (saved?.id) navigate(`/cancionero/canciones/${saved.id}`);
          }}
        />
      )}

      {contextMenu && (
        <div
          className="fixed z-[95] min-w-[240px] bg-[#15233e] border border-white/15 rounded-xl shadow-2xl overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-white/10">
            <p className="text-xs text-white/50">Canción</p>
            <p className="text-sm text-white font-medium truncate">{contextMenu.song?.title}</p>
          </div>
          <button
            onClick={addToOpenEvent}
            className="w-full text-left px-3 py-2 text-sm text-white/90 hover:bg-white/10"
          >
            Agregar al evento abierto
          </button>
          <button
            onClick={openEventPicker}
            className="w-full text-left px-3 py-2 text-sm text-white/90 hover:bg-white/10"
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
    </div>
  );
}

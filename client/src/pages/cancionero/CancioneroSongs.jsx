import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Music2, ChevronRight, Loader2, X, Plus } from 'lucide-react';
import CancioneroNavbar from './CancioneroNavbar';
import SongFormModal from '../../components/Library/SongFormModal';

const API = import.meta.env.VITE_API_URL || 'https://aiopresenter-production.up.railway.app';
function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}

export default function CancioneroSongs() {
  const navigate = useNavigate();
  const [songs, setSongs]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState('');
  const [newSongOpen, setNewSongOpen] = useState(false);

  const loadSongs = () => {
    setLoading(true);
    fetch(`${API}/api/songs`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setSongs(Array.isArray(data) ? data : data.songs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadSongs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = songs.filter(s => {
    const q = query.toLowerCase();
    return !q || s.title?.toLowerCase().includes(q) || s.author?.toLowerCase().includes(q) || s.tags?.some(t => t.toLowerCase().includes(q));
  });

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
          <button
            onClick={() => setNewSongOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/35 border border-yellow-400/30 text-yellow-300 text-xs font-semibold transition-colors"
            title="Nueva canción"
          >
            <Plus size={14} /> Nueva
          </button>
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
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="text-yellow-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-white/30">
            <Music2 size={40} />
            <p className="text-sm">{query ? 'Sin resultados para tu búsqueda' : 'No hay canciones'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map(song => (
              <li key={song.id}>
                <button
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

      {newSongOpen && (
        <SongFormModal
          onClose={() => setNewSongOpen(false)}
          onSaved={(saved) => {
            setNewSongOpen(false);
            loadSongs();
            if (saved?.id) navigate(`/cancionero/canciones/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}

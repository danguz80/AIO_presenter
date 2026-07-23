import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}

function formatDate(dateStr) {
  const iso = String(dateStr).slice(0, 10);
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = d.toLocaleDateString('es-CL', { weekday: 'long' });
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${wd} - ${dd}-${mm}-${yy}`;
}

export default function SongRecentPlays({ songId, limit = 3, compact = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    if (!songId) { setItems([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/song-history/song/${songId}?limit=${limit}`, { headers: authHeaders() });
      const d = await r.json();
      setItems(r.ok && Array.isArray(d) ? d : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [songId, limit]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeDate = async (entryId) => {
    setDeletingId(entryId);
    try {
      const r = await fetch(`${API}/api/song-history/${entryId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (r.ok) {
        setItems(prev => prev.filter(it => it.id !== entryId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (!songId) return null;

  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-[10px] ${compact ? 'text-white/35' : 'text-zinc-500'} uppercase tracking-wide`}>Últimas tocadas</span>
        {loading && <Loader2 size={11} className="animate-spin text-zinc-500" />}
        {!loading && items.length === 0 && (
          <span className={`text-[10px] ${compact ? 'text-white/35' : 'text-zinc-500'}`}>Sin historial</span>
        )}
        {!loading && items.map((it) => (
          <span
            key={it.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border ${compact
              ? 'bg-white/10 border-white/15 text-white/75'
              : 'bg-surface-700 border-surface-600 text-zinc-300'}`}
          >
            {formatDate(it.played_on)}
            <button
              type="button"
              onClick={() => removeDate(it.id)}
              disabled={deletingId === it.id}
              className="opacity-70 hover:opacity-100 transition-opacity"
              title="Eliminar fecha"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

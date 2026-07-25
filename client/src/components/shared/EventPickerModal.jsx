import { useMemo, useState } from 'react';
import { CalendarDays, Clock, Loader2, Search, X } from 'lucide-react';

function datePart(value) {
  return String(value || '').slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(`${datePart(dateStr)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return datePart(dateStr);
  return d.toLocaleDateString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function EventPickerModal({
  title = 'Elegir evento por fecha',
  events = [],
  loading = false,
  onClose,
  onPick,
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...events].sort((a, b) => {
      const da = datePart(a.occurrence_date || a.date);
      const db = datePart(b.occurrence_date || b.date);
      return db.localeCompare(da) || String(a.title || '').localeCompare(String(b.title || ''));
    });
    if (!q) return sorted;
    return sorted.filter((ev) => {
      const date = datePart(ev.occurrence_date || ev.date);
      const hay = `${ev.title || ''} ${date} ${ev.time || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, query]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          <button onClick={onClose} className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-surface-700">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 border-b border-surface-700">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título o fecha..."
              className="w-full bg-surface-700 border border-surface-600 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="py-10 flex items-center justify-center text-zinc-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Cargando eventos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-sm">No se encontraron eventos</div>
          ) : (
            <ul className="divide-y divide-surface-700/70">
              {filtered.map((ev) => {
                const d = ev.occurrence_date || ev.date;
                return (
                  <li key={`${ev.id}-${datePart(d)}`}>
                    <button
                      onClick={() => onPick?.(ev)}
                      className="w-full px-4 py-3 text-left hover:bg-surface-700/70 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-zinc-100 truncate">{ev.title || 'Sin título'}</p>
                        <span className="text-[11px] text-zinc-500 shrink-0">#{ev.id}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={12} /> {formatDate(d)}
                        </span>
                        {ev.time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock size={12} /> {String(ev.time).slice(0, 5)}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

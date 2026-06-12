import { useState } from 'react';
import { Download, Music2, Film, CheckCircle2, Loader2, X, ExternalLink } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

// URL del ZIP con los 3 videos demo — reemplaza con el link real cuando lo subas
const DEMO_VIDEOS_URL = 'https://github.com/danguz80/AIO_presenter/releases/latest/download/demo-videos.zip';

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
}

export default function DemoPackBanner({ onSongsImported, onDismiss }) {
  const [importing, setImporting] = useState(false);
  const [done, setDone]           = useState(false);
  const [msg, setMsg]             = useState('');

  const handleImportSongs = async () => {
    setImporting(true);
    setMsg('');
    try {
      const r = await fetch(`${API}/api/songs/import-demo`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      setMsg(data.inserted > 0
        ? `✓ ${data.inserted} canciones importadas correctamente`
        : data.message);
      setDone(true);
      if (data.inserted > 0) onSongsImported?.();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-4 mb-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-yellow-400/10">
        <div className="flex items-center gap-2">
          <span className="text-base">🎁</span>
          <span className="text-sm font-bold text-yellow-300">Pack de inicio</span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-white/25 hover:text-white/60 p-0.5">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-white/50 leading-relaxed">
          Para que puedas explorar AIO Presenter, hemos preparado un pack con <strong className="text-white/70">3 canciones</strong> listas para presentar y <strong className="text-white/70">3 videos de fondo</strong> descargables.
        </p>

        {/* Canciones */}
        <div className="rounded-xl bg-black/20 border border-white/8 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Music2 size={13} className="text-yellow-400" />
            <span className="text-xs font-semibold text-white/80">Canciones demo</span>
          </div>
          <ul className="space-y-1 pl-1">
            {['Santo', 'Sublime Gracia', 'Grande Es Tu Fidelidad'].map(t => (
              <li key={t} className="text-xs text-white/50 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-yellow-400/50 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          {!done ? (
            <button
              onClick={handleImportSongs}
              disabled={importing}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 text-yellow-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {importing
                ? <><Loader2 size={13} className="animate-spin" /> Importando...</>
                : <><Music2 size={13} /> Importar a mi biblioteca</>}
            </button>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 size={14} /> {msg}
            </div>
          )}
          {msg && !done && <p className="text-xs text-red-400 mt-1">{msg}</p>}
        </div>

        {/* Videos */}
        <div className="rounded-xl bg-black/20 border border-white/8 p-3 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Film size={13} className="text-blue-400" />
            <span className="text-xs font-semibold text-white/80">Videos de fondo</span>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Descarga el ZIP, extrae la carpeta en tu equipo y luego agrégala en <span className="text-white/60">Librería › Media › + Carpeta</span>.
          </p>
          <a
            href={DEMO_VIDEOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 text-xs font-semibold transition-colors"
          >
            <Download size={13} /> Descargar videos demo (.zip)
            <ExternalLink size={11} className="opacity-60" />
          </a>
        </div>
      </div>
    </div>
  );
}

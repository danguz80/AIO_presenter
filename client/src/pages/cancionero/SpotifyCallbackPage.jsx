import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, X } from 'lucide-react';

export default function SpotifyCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Conectando con Spotify…');
  const [playlistUrl, setPlaylistUrl] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;  // evitar doble ejecución en React StrictMode
    ran.current = true;
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code  = params.get('code');
      const state = params.get('state');
      const error = params.get('error');

      if (error) {
        setStatus('error');
        setMessage(`Spotify rechazó la autorización: ${error}`);
        return;
      }
      if (!code) {
        setStatus('error');
        setMessage('No se recibió código de autorización de Spotify.');
        return;
      }

      // Decodificar todo desde el state (base64 URL-safe → JSON)
      let verifier, clientId, redirectUri, playlistName, songs;
      try {
        // Revertir base64 URL-safe a base64 estándar antes de atob
        const b64 = state.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
        verifier     = payload.verifier;
        clientId     = payload.clientId;
        redirectUri  = payload.redirectUri;
        playlistName = payload.playlistName ?? 'Setlist';
        songs        = Array.isArray(payload.songs) ? payload.songs : [];
      } catch (e) {
        setStatus('error');
        setMessage('No se pudo leer los datos del flujo de autorización.');
        return;
      }
      if (!verifier || !clientId) {
        setStatus('error');
        setMessage('Datos incompletos del flujo de autorización.');
        return;
      }

      try {
        // 1. Intercambiar código por access_token
        setMessage('Obteniendo token de Spotify…');
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: verifier,
          }),
        });
        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}));
          throw new Error(`Error obteniendo token: ${errData.error} — ${errData.error_description ?? tokenRes.status}`);
        }
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        // 2. Crear playlist directamente en /v1/me/playlists (no necesita user ID)
        setMessage(`Creando playlist “${playlistName}”…`);
        const createRes = await fetch(`https://api.spotify.com/v1/me/playlists`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: playlistName, public: true, description: 'Generado con AIO Presenter' }),
        });
        if (!createRes.ok) throw new Error('Error creando playlist');
        const playlist = await createRes.json();

        // 4. Extraer track URIs desde los links guardados
        setMessage('Procesando canciones…');

        // Helper: convierte URL de Spotify en URI
        // https://open.spotify.com/track/TRACK_ID?... → spotify:track:TRACK_ID
        const urlToUri = (url) => {
          if (!url) return null;
          try {
            const u = new URL(url);
            // Acepta: open.spotify.com/track/ID  o  spotify:track:ID directamente
            if (u.hostname === 'open.spotify.com') {
              const parts = u.pathname.split('/').filter(Boolean);
              // partes: ['track', 'TRACK_ID'] o ['intl-XX', 'track', 'TRACK_ID']
              const trackIdx = parts.indexOf('track');
              if (trackIdx !== -1 && parts[trackIdx + 1]) {
                return `spotify:track:${parts[trackIdx + 1]}`;
              }
            }
          } catch { /* URL malformada */ }
          // Si ya es un URI spotify:track:...
          if (url.startsWith('spotify:track:')) return url;
          return null;
        };

        const uris = [];
        const skipped = [];
        for (const song of songs) {
          const uri = urlToUri(song.link);
          if (uri) {
            uris.push(uri);
          } else {
            skipped.push(song.title);
          }
        }

        if (uris.length) {
          setMessage('Agregando canciones a la playlist…');
          // Spotify acepta máx 100 URIs por llamada
          for (let i = 0; i < uris.length; i += 100) {
            await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
            });
          }
        }

        const skipMsg = skipped.length
          ? ` (${skipped.length} sin link: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''})`
          : '';
        setPlaylistUrl(playlist.external_urls?.spotify || `https://open.spotify.com/playlist/${playlist.id}`);
        setMessage(`¡Playlist creada con ${uris.length} de ${songs.length} canciones!${skipMsg}`);
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setMessage(err.message || 'Error desconocido al conectar con Spotify.');
      }
    };

    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#0f1a2e] flex items-center justify-center p-6">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
        <div className="flex justify-center">
          {status === 'loading' && <Loader2 size={40} className="text-[#1DB954] animate-spin" />}
          {status === 'success' && <Check size={40} className="text-[#1DB954]" />}
          {status === 'error' && <X size={40} className="text-red-400" />}
        </div>
        <p className={`text-sm font-medium ${status === 'error' ? 'text-red-300' : status === 'success' ? 'text-green-300' : 'text-white/70'}`}>
          {message}
        </p>
        {status === 'success' && playlistUrl && (
          <a
            href={playlistUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full py-2.5 rounded-xl bg-[#1DB954] text-black font-semibold text-sm hover:bg-[#1ed760] transition-colors"
          >
            Abrir en Spotify
          </a>
        )}
        <button
          onClick={() => navigate(-1)}
          className="block w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white/60 text-sm transition-colors"
        >
          Volver
        </button>
      </div>
    </div>
  );
}

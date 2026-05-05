import { useEffect, useRef, useState } from 'react';
import { usePresenter } from '../context/usePresenter';
import { stripChords, stripComments } from '../utils/chordUtils';
import {
  ChevronLeft, ChevronRight, EyeOff, Eye,
  Wifi, WifiOff, Music, Radio, Settings, ArrowLeft, Search, X,
} from 'lucide-react';

// ─── Utilidad: leer/guardar conexión ─────────────────────────────────────────
function getSavedIp()   { return localStorage.getItem('aio_server_ip')   || window.location.hostname; }
function getSavedPort() { return localStorage.getItem('aio_server_port') || '3001'; }

// Normaliza un string para búsqueda: minúsculas + sin tildes/diacríticos
// "Canción" → "cancion", "niño" → "nino"
function norm(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina diacríticos
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MobileControllerPage() {
  const { state, actions } = usePresenter();
  const { liveState, connected, songs } = state;
  const { slideData, nextSlideData, isBlank } = liveState;

  const [tab,         setTab]         = useState('live');
  const [songDetail,  setSongDetail]  = useState(null);
  const [loadingSong, setLoadingSong] = useState(false);
  const [songSearch,  setSongSearch]  = useState('');

  const [cfgIp,    setCfgIp]    = useState(getSavedIp);
  const [cfgPort,  setCfgPort]  = useState(getSavedPort);
  const [cfgSaved, setCfgSaved] = useState(false);

  const [flash,    setFlash]    = useState(null);
  const touchStart = useRef(null);

  useEffect(() => { document.title = 'AIO Remote'; }, []);

  // ── Navegación ──────────────────────────────────────────────────────────
  const trigger = (fn, dir) => { fn(); setFlash(dir); setTimeout(() => setFlash(null), 200); };
  const handlePrev  = () => trigger(() => actions.navigate('prev'), 'prev');
  const handleNext  = () => trigger(() => actions.navigate('next'), 'next');
  const handleBlank = () => trigger(() => actions.toggleBlank(!isBlank), 'blank');

  const onTouchStart = (e) => { if (tab !== 'live') return; touchStart.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(delta) > 60) delta < 0 ? handleNext() : handlePrev();
    touchStart.current = null;
  };

  // ── Canciones ────────────────────────────────────────────────────────────
  const openSong = async (id) => {
    setLoadingSong(true);
    try { setSongDetail(await actions.loadSongDetail(id)); }
    finally { setLoadingSong(false); }
  };

  const sendSlide = (song, slide, slides) => {
    const idx  = slides.findIndex(s => s.id === slide.id);
    const next = slides[idx + 1] || null;
    actions.selectSlide(slide);
    actions.showSlide({
      type:       'song',
      slides,            // el servidor los guarda para poder navegar
      slideIndex: idx,
      slideData:     { type: 'song', songId: song.id, slideId: slide.id, songTitle: song.title, label: slide.label, content: slide.content },
      nextSlideData: next ? { type: 'song', label: next.label, content: next.content } : null,
    });
    setTab('live');
  };

  // ── Ajustes ──────────────────────────────────────────────────────────────
  const saveSettings = () => {
    localStorage.setItem('aio_server_ip',   cfgIp.trim());
    localStorage.setItem('aio_server_port', cfgPort.trim());
    setCfgSaved(true);
    setTimeout(() => window.location.reload(), 600);
  };

  // ── Datos del slide actual ────────────────────────────────────────────────
  const slideText      = slideData && (slideData.type === 'song' ? stripChords(stripComments(slideData.content)) : slideData.text);
  const slideLabel     = slideData && (slideData.type === 'song' ? slideData.label : slideData.reference);
  const slideSongTitle = slideData?.songTitle;
  const nextText       = nextSlideData && (nextSlideData.type === 'song' ? stripChords(stripComments(nextSlideData.content)) : nextSlideData.text);
  const nextLabel      = nextSlideData && (nextSlideData.type === 'song' ? nextSlideData.label : nextSlideData.reference);

  const filteredSongs = (songs || []).filter(s => {
    const q = norm(songSearch);
    return norm(s.title).includes(q) || norm(s.artist).includes(q);
  });

  return (
    <div
      className="h-[100dvh] bg-surface-900 flex flex-col select-none overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-surface-700 shrink-0">
        {tab === 'songs' && songDetail ? (
          <button onClick={() => setSongDetail(null)} className="flex items-center gap-1.5 text-zinc-300">
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Canciones</span>
          </button>
        ) : (
          <span className="text-accent font-bold text-base tracking-tight">AIO Presenter</span>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          {connected
            ? <><Wifi size={13} className="text-green-400" /><span className="text-green-400">Conectado</span></>
            : <><WifiOff size={13} className="text-red-400" /><span className="text-red-400">Sin conexión</span></>
          }
        </div>
      </header>

      {/* ── Contenido ── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

        {/* ──── EN VIVO ──── */}
        {tab === 'live' && (
          <>
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-4 min-h-0 overflow-hidden">
              {isBlank ? (
                <p className="text-zinc-600 text-lg italic">Pantalla en negro</p>
              ) : !slideData ? (
                <p className="text-zinc-600 text-lg italic">Sin contenido</p>
              ) : (
                <div className="w-full text-center">
                  {slideLabel && <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-3">{slideLabel}</p>}
                  <p className="text-white text-xl leading-relaxed whitespace-pre-line overflow-y-auto max-h-52">{slideText}</p>
                  {slideSongTitle && <p className="text-zinc-500 text-sm mt-4">{slideSongTitle}</p>}
                </div>
              )}
            </div>

            {nextSlideData && !isBlank && (
              <div className="shrink-0 mx-4 mb-3 px-4 py-3 bg-surface-800 rounded-xl border border-surface-700">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Siguiente</p>
                {nextLabel && <p className="text-[11px] text-zinc-400 mb-0.5">{nextLabel}</p>}
                <p className="text-zinc-300 text-sm whitespace-pre-line line-clamp-2">{nextText}</p>
              </div>
            )}

            <div className="shrink-0 px-4 pb-3 pt-1 grid grid-cols-3 gap-3">
              <NavBtn flash={flash === 'prev'} onPointerDown={handlePrev}>
                <ChevronLeft size={32} /><span className="text-xs font-medium">Anterior</span>
              </NavBtn>

              <button
                onPointerDown={handleBlank}
                className={`flex flex-col items-center justify-center gap-1 py-6 rounded-2xl border-2 transition-all active:scale-95 ${
                  isBlank ? 'bg-red-950/60 border-red-500 text-red-400'
                  : flash === 'blank' ? 'bg-zinc-700 border-zinc-400 text-white'
                  : 'bg-surface-800 border-surface-600 text-zinc-300'
                }`}
              >
                {isBlank ? <Eye size={28} /> : <EyeOff size={28} />}
                <span className="text-xs font-medium">{isBlank ? 'Mostrar' : 'Negro'}</span>
              </button>

              <NavBtn flash={flash === 'next'} onPointerDown={handleNext}>
                <ChevronRight size={32} /><span className="text-xs font-medium">Siguiente</span>
              </NavBtn>
            </div>

            <p className="shrink-0 text-center text-[10px] text-zinc-700 pb-2">Desliza para navegar</p>
          </>
        )}

        {/* ──── CANCIONES: lista ──── */}
        {tab === 'songs' && !songDetail && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  value={songSearch}
                  onChange={e => setSongSearch(e.target.value)}
                  placeholder="Buscar canción o artista…"
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-9 pr-8 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                />
                {songSearch && (
                  <button onPointerDown={() => setSongSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
              {loadingSong && (
                <div className="flex justify-center pt-8">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!loadingSong && filteredSongs.length === 0 && (
                <p className="text-center text-zinc-600 text-sm pt-10">
                  {(songs || []).length === 0 ? 'Sin canciones en la biblioteca' : 'Sin resultados'}
                </p>
              )}
              {filteredSongs.map(song => (
                <button
                  key={song.id}
                  onClick={() => openSong(song.id)}
                  className="w-full text-left px-4 py-3.5 bg-surface-800 active:bg-surface-700 rounded-xl border border-surface-700 transition-colors"
                >
                  <p className="text-zinc-200 text-sm font-medium leading-snug">{song.title}</p>
                  {song.artist && <p className="text-zinc-500 text-xs mt-0.5">{song.artist}</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ──── CANCIONES: slides de la canción ──── */}
        {tab === 'songs' && songDetail && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700">
              <p className="text-zinc-200 font-semibold">{songDetail.title}</p>
              {songDetail.artist && <p className="text-zinc-500 text-xs mt-0.5">{songDetail.artist}</p>}
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-2">
              {(songDetail.slides || []).map(slide => (
                <button
                  key={slide.id}
                  onClick={() => sendSlide(songDetail, slide, songDetail.slides)}
                  className="w-full text-left px-4 py-3 bg-surface-800 active:bg-surface-700 rounded-xl border border-surface-700 transition-colors"
                >
                  {slide.label && (
                    <span className="inline-block text-[10px] font-semibold text-accent bg-accent/10 border border-accent/30 rounded px-1.5 py-0.5 mb-1.5">
                      {slide.label}
                    </span>
                  )}
                  <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line line-clamp-3">
                    {stripChords(stripComments(slide.content))}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ──── AJUSTES ──── */}
        {tab === 'settings' && (
          <div className="flex-1 overflow-y-auto px-4 pt-6 pb-8">
            <p className="text-zinc-400 text-xs uppercase tracking-widest mb-4">Conexión al servidor</p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Dirección IP</label>
                <input
                  value={cfgIp}
                  onChange={e => setCfgIp(e.target.value)}
                  placeholder="192.168.1.100"
                  inputMode="url"
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-accent font-mono"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Puerto</label>
                <input
                  value={cfgPort}
                  onChange={e => setCfgPort(e.target.value)}
                  placeholder="3001"
                  inputMode="numeric"
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-accent font-mono"
                />
              </div>
            </div>

            <button
              onPointerDown={saveSettings}
              disabled={cfgSaved}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 ${
                cfgSaved
                  ? 'bg-green-900 text-green-300 border border-green-700'
                  : 'bg-accent text-white'
              }`}
            >
              {cfgSaved ? 'Guardado — reconectando…' : 'Guardar y reconectar'}
            </button>

            <div className="mt-6 p-4 bg-surface-800 rounded-xl border border-surface-700">
              <p className="text-zinc-500 text-xs">Conexión actual</p>
              <p className="font-mono text-accent text-sm mt-1">{getSavedIp()}:{getSavedPort()}</p>
              <p className="text-zinc-600 text-xs mt-3 leading-relaxed">
                Cambia la IP si el servidor cambió de dirección en la red WiFi. La app se recarga automáticamente.
              </p>
            </div>
          </div>
        )}

      </div>

      {/* ── Nav inferior ── */}
      <nav className="shrink-0 grid grid-cols-3 bg-surface-800 border-t border-surface-700">
        <TabNavBtn active={tab === 'live'}     onPointerDown={() => setTab('live')}     icon={<Radio size={20} />}    label="En vivo" />
        <TabNavBtn active={tab === 'songs'}    onPointerDown={() => setTab('songs')}    icon={<Music size={20} />}    label="Canciones" />
        <TabNavBtn active={tab === 'settings'} onPointerDown={() => setTab('settings')} icon={<Settings size={20} />} label="Ajustes" />
      </nav>
    </div>
  );
}

// ─── Botón de navegación de slides ───────────────────────────────────────────
function NavBtn({ flash, onPointerDown, children }) {
  return (
    <button
      onPointerDown={onPointerDown}
      className={`flex flex-col items-center justify-center gap-1 py-6 rounded-2xl border-2 transition-all active:scale-95 ${
        flash ? 'bg-accent/30 border-accent text-accent' : 'bg-surface-800 border-surface-600 text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Botón de pestaña inferior ────────────────────────────────────────────────
function TabNavBtn({ active, onPointerDown, icon, label }) {
  return (
    <button
      onPointerDown={onPointerDown}
      className={`flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
        active ? 'text-accent' : 'text-zinc-500'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

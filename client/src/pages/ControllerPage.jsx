import { useState, useEffect, useCallback, useRef } from 'react';
import { usePresenter } from '../context/usePresenter';
import SongLibrary     from '../components/Library/SongLibrary';
import SongDetail      from '../components/Library/SongDetail';
import BibleBrowser    from '../components/Library/BibleBrowser';
import LiveControls    from '../components/Controls/LiveControls';
import LivePreview     from '../components/Controls/LivePreview';
import StageControls   from '../components/Controls/StageControls';
import VirtualControls from '../components/Controls/VirtualControls';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, WifiOff, Music, BookOpen, Smartphone, X, CalendarDays, ChevronLeft, ChevronRight, Clock, RefreshCw, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const RECURRENCE_LABEL = { weekly: 'Semanal', biweekly: 'Cada 2 semanas', monthly: 'Mensual' };
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) {
  // Acepta '2026-05-03', Date, o string ISO — devuelve '03-05-2026'
  const s = String(d).split('T')[0];
  const [y, m, day] = s.split('-');
  return `${day}-${m}-${y}`;
}

export default function ControllerPage() {
  const { state } = usePresenter();
  const [activeTab, setActiveTab] = useState('songs'); // 'songs' | 'bible'
  const [showQR, setShowQR]       = useState(false);
  const [mobileUrl, setMobileUrl] = useState('');

  // Obtener IP local del servidor para construir URL del móvil
  useEffect(() => {
    fetch('/api/network-info')
      .then(r => r.json())
      .then(({ ips }) => {
        const ip = ips?.[0] || window.location.hostname;
        setMobileUrl(`http://${ip}:5173/mobile`);
      })
      .catch(() => {
        setMobileUrl(`http://${window.location.hostname}:5173/mobile`);
      });
  }, []);

  return (
    <div className="flex flex-col h-screen bg-surface-900 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-surface-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-accent font-bold text-lg tracking-tight">AIO Presenter</span>
          <span className="text-xs text-zinc-500 bg-surface-700 px-2 py-0.5 rounded">Beta</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Estado de conexión */}
          <div className="flex items-center gap-1.5 text-xs">
            {state.connected
              ? <><Wifi size={14} className="text-green-400" /><span className="text-green-400">Conectado</span></>
              : <><WifiOff size={14} className="text-red-400" /><span className="text-red-400">Sin conexión</span></>
            }
          </div>

          {/* Botón calendario */}
          <Link
            to="/calendar"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-700"
            title="Calendario"
          >
            <CalendarDays size={15} />
            <span className="hidden sm:inline">Calendario</span>
          </Link>

          {/* Botón móvil */}
          <button
            onClick={() => setShowQR(true)}
            title="Conectar móvil"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-700"
          >
            <Smartphone size={15} />
            <span className="hidden sm:inline">Móvil</span>
          </button>
        </div>
      </header>

      {/* ── Modal QR ── */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-surface-800 border border-surface-600 rounded-2xl p-6 max-w-xs w-full mx-4 text-center shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-white text-sm">Conectar móvil</span>
              <button onClick={() => setShowQR(false)} className="text-zinc-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {mobileUrl ? (
              <>
                <div className="bg-white p-3 rounded-xl inline-block mb-4">
                  <QRCodeSVG value={mobileUrl} size={180} />
                </div>
                <p className="text-zinc-300 text-xs mb-1 font-mono break-all">{mobileUrl}</p>
                <p className="text-zinc-500 text-xs mt-3 leading-relaxed">
                  Conecta tu móvil a la misma red WiFi<br />y escanea el código QR
                </p>
              </>
            ) : (
              <p className="text-zinc-400 text-sm py-6">Obteniendo IP…</p>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs: Canciones / Biblia ── */}
      <div className="flex gap-1 px-4 pt-2 pb-0 bg-surface-800 border-b border-surface-700 shrink-0">
        <TabButton
          active={activeTab === 'songs'}
          onClick={() => setActiveTab('songs')}
          icon={<Music size={13} />}
          label="Canciones"
        />
        <TabButton
          active={activeTab === 'bible'}
          onClick={() => setActiveTab('bible')}
          icon={<BookOpen size={13} />}
          label="Biblia"
        />
      </div>

      {/* ── Layout principal ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel colapsable de Eventos */}
        <EventsPanel />

        {activeTab === 'songs' ? (
          <>
            {/* Columna 1: Biblioteca de canciones (colapsable) */}
            <CollapsibleLibrary />

            {/* Columna 2: Detalle / Slides */}
            <main className="flex-1 flex flex-col overflow-hidden border-r border-surface-700">
              <SongDetail />
            </main>
          </>
        ) : (
          /* Columnas 1+2: Navegador de Biblia */
          <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-700">
            <BibleBrowser />
          </div>
        )}

        {/* Columna 3: Controles en vivo + Preview (siempre visible) */}
        <aside className="w-96 shrink-0 flex flex-col overflow-hidden">
          <LivePreview />
          <LiveControls />
          <StageControls />
          <VirtualControls />
        </aside>
      </div>
    </div>
  );
}

// ─── CollapsibleLibrary ───────────────────────────────────────────
function CollapsibleLibrary() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <div className="w-9 shrink-0 border-r border-surface-700 flex flex-col items-center pt-3 bg-surface-800/50">
        <button
          onClick={() => setOpen(true)}
          title="Abrir biblioteca"
          className="flex flex-col items-center gap-1.5 text-zinc-500 hover:text-accent transition-colors p-1.5 rounded-lg hover:bg-surface-700"
        >
          <Music size={16} />
          <span className="text-[9px] [writing-mode:vertical-rl] tracking-widest uppercase font-medium">Canciones</span>
        </button>
      </div>
    );
  }
  return (
    <aside className="w-72 shrink-0 border-r border-surface-700 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700 shrink-0">
        <div className="flex items-center gap-1.5">
          <Music size={13} className="text-accent" />
          <span className="text-xs font-semibold">Biblioteca</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-white transition-colors p-0.5 rounded"
          title="Colapsar"
        >
          <ChevronLeft size={14} />
        </button>
      </div>
      <SongLibrary />
    </aside>
  );
}

// ─── EventsPanel ─────────────────────────────────────────────────────────────
function EventsPanel() {
  const today = new Date();
  const { actions } = usePresenter();
  const [open,       setOpen]       = useState(false);
  const [year,       setYear]       = useState(today.getFullYear());
  const [month,      setMonth]      = useState(today.getMonth());
  const [events,     setEvents]     = useState([]);
  const [selectedEv, setSelectedEv] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [allSongs,   setAllSongs]   = useState([]);
  const [songSearch,  setSongSearch]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [showSearch,  setShowSearch]  = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [newEv,       setNewEv]       = useState({ title: '', date: '', time: '', is_recurring: false, recurrence: 'weekly' });
  const [createError, setCreateError] = useState('');
  const searchRef = useRef(null);

  // Cargar todas las canciones una vez al abrir
  useEffect(() => {
    if (open && allSongs.length === 0) {
      fetch('/api/songs').then(r => r.json()).then(setAllSongs).catch(() => {});
    }
  }, [open]); // eslint-disable-line

  const fetchEvents = useCallback((y, m) => {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const start   = `${y}-${pad(m + 1)}-01`;
    const end     = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    setLoading(true);
    setSelectedEv(null);
    fetch(`/api/events?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const loadEvents = useCallback(() => fetchEvents(year, month), [year, month, fetchEvents]);

  useEffect(() => { if (open) loadEvents(); }, [open, loadEvents]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const filteredSongs = songSearch
    ? allSongs
        .filter(s => {
          const q = songSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const t = (s.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const a = (s.author || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          return t.includes(q) || a.includes(q);
        })
        .filter(s => !selectedEv?.songs?.find(p => p.song_id === s.id))
        .slice(0, 7)
    : [];

  const addSong = async (song) => {
    const newSongs = [...(selectedEv.songs || []), { song_id: song.id, title: song.title, author: song.author }];
    setSaving(true);
    // Para recurrentes: date = fecha base del evento, occurrence_date = fecha de esta ocurrencia
    const occDate = selectedEv.is_recurring ? String(selectedEv.date).split('T')[0] : null;
    const baseDate = selectedEv.base_date || String(selectedEv.date).split('T')[0];
    try {
      await fetch(`/api/events/${selectedEv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedEv.title, date: baseDate,
          time: selectedEv.time || null, description: selectedEv.description || null,
          is_recurring: selectedEv.is_recurring, recurrence: selectedEv.recurrence || null,
          recur_end: selectedEv.recur_end || null,
          occurrence_date: occDate,
          songs: newSongs.map((p, i) => ({ song_id: p.song_id, position: i })),
        }),
      });
      setSelectedEv(ev => ({ ...ev, songs: newSongs }));
      setEvents(evs => evs.map(e =>
        (e.id === selectedEv.id && String(e.date).split('T')[0] === String(selectedEv.date).split('T')[0])
          ? { ...e, songs: newSongs } : e
      ));
      setSongSearch('');
      searchRef.current?.focus();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const startCreating = () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    setNewEv({ title: '', date: iso, time: '', is_recurring: false, recurrence: 'weekly' });
    setCreateError('');
    setCreating(true);
  };

  const saveNewEvent = async () => {
    if (!newEv.title.trim()) { setCreateError('Escribe un título'); return; }
    if (!newEv.date)         { setCreateError('Elige una fecha'); return; }
    setCreatingBusy(true);
    setCreateError('');
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEv.title.trim(),
          date: newEv.date,
          time: newEv.time || null,
          is_recurring: newEv.is_recurring,
          recurrence: newEv.is_recurring ? newEv.recurrence : null,
          songs: [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await res.json().catch(() => null); // consumir body
      // Navegar al mes del nuevo evento y recargar
      const [evYear, evMonth] = newEv.date.split('-').map(Number);
      setYear(evYear);
      setMonth(evMonth - 1);
      setCreating(false);
      fetchEvents(evYear, evMonth - 1); // forzar recarga aunque el mes no haya cambiado
    } catch (e) {
      console.error(e);
      setCreateError(e.message || 'Error al crear evento');
    }
    finally { setCreatingBusy(false); }
  };

  const removeSong = async (song_id) => {
    const newSongs = (selectedEv.songs || []).filter(p => p.song_id !== song_id);
    setSaving(true);
    const occDate = selectedEv.is_recurring ? String(selectedEv.date).split('T')[0] : null;
    const baseDate = selectedEv.base_date || String(selectedEv.date).split('T')[0];
    try {
      await fetch(`/api/events/${selectedEv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedEv.title, date: baseDate,
          time: selectedEv.time || null, description: selectedEv.description || null,
          is_recurring: selectedEv.is_recurring, recurrence: selectedEv.recurrence || null,
          recur_end: selectedEv.recur_end || null,
          occurrence_date: occDate,
          songs: newSongs.map((p, i) => ({ song_id: p.song_id, position: i })),
        }),
      });
      setSelectedEv(ev => ({ ...ev, songs: newSongs }));
      setEvents(evs => evs.map(e =>
        (e.id === selectedEv.id && String(e.date).split('T')[0] === String(selectedEv.date).split('T')[0])
          ? { ...e, songs: newSongs } : e
      ));
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  if (!open) {
    return (
      <div className="w-9 shrink-0 border-r border-surface-700 flex flex-col items-center pt-3 bg-surface-800/50">
        <button
          onClick={() => setOpen(true)}
          title="Abrir panel de eventos"
          className="flex flex-col items-center gap-1.5 text-zinc-500 hover:text-accent transition-colors p-1.5 rounded-lg hover:bg-surface-700"
        >
          <CalendarDays size={16} />
          <span className="text-[9px] [writing-mode:vertical-rl] tracking-widest uppercase font-medium">Eventos</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-52 shrink-0 border-r border-surface-700 flex flex-col overflow-hidden bg-surface-800/50">

      {/* ── Vista: crear evento ── */}
      {creating ? (
        <>
          <div className="flex items-center gap-1 px-2 py-2.5 border-b border-surface-700 shrink-0">
            <button
              onClick={() => setCreating(false)}
              className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-surface-700 shrink-0"
              title="Cancelar"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-semibold flex-1">Nuevo evento</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
            {createError && (
              <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-2.5 py-1.5">
                {createError}
              </div>
            )}
            {/* Título */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Título</label>
              <input
                autoFocus
                className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                placeholder="Ej: Culto Dominical"
                value={newEv.title}
                onChange={e => setNewEv(v => ({ ...v, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveNewEvent()}
              />
            </div>
            {/* Fecha */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Fecha</label>
              <input
                type="date"
                className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                value={newEv.date}
                onChange={e => setNewEv(v => ({ ...v, date: e.target.value }))}
              />
            </div>
            {/* Hora */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Hora <span className="normal-case text-zinc-600">(opcional)</span></label>
              <input
                type="time"
                className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                value={newEv.time}
                onChange={e => setNewEv(v => ({ ...v, time: e.target.value }))}
              />
            </div>
            {/* Recurrente */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newEv.is_recurring}
                onChange={e => setNewEv(v => ({ ...v, is_recurring: e.target.checked }))}
                className="accent-indigo-500"
              />
              <span className="text-xs text-zinc-300">Recurrente</span>
            </label>
            {newEv.is_recurring && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Frecuencia</label>
                <select
                  className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                  value={newEv.recurrence}
                  onChange={e => setNewEv(v => ({ ...v, recurrence: e.target.value }))}
                >
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Cada 2 semanas</option>
                  <option value="monthly">Mensual</option>
                </select>
              </div>
            )}
          </div>
          <div className="px-3 py-3 border-t border-surface-700 shrink-0">
            <button
              onClick={saveNewEvent}
              disabled={creatingBusy}
              className="w-full py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
            >
              {creatingBusy ? 'Guardando…' : 'Crear evento'}
            </button>
          </div>
        </>
      ) : !selectedEv ? (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-700 shrink-0">
            <div className="flex items-center gap-1.5">
              <CalendarDays size={14} className="text-accent" />
              <span className="text-xs font-semibold">Eventos</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={startCreating}
                className="text-zinc-500 hover:text-accent transition-colors p-0.5 rounded"
                title="Nuevo evento"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors p-0.5 rounded"
                title="Colapsar"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          {/* Selector de mes */}
          <div className="flex items-center justify-between px-2 py-2 border-b border-surface-700 shrink-0">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-surface-700 transition-colors text-zinc-400 hover:text-white">
              <ChevronLeft size={13} />
            </button>
            <span className="text-xs font-medium select-none">{MONTHS_ES[month]} {year}</span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-surface-700 transition-colors text-zinc-400 hover:text-white">
              <ChevronRight size={13} />
            </button>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="text-xs text-zinc-500 text-center py-6">Cargando…</div>}
            {!loading && events.length === 0 && (
              <div className="flex flex-col items-center gap-1 py-8 text-zinc-600">
                <CalendarDays size={22} />
                <span className="text-xs">Sin eventos este mes</span>
              </div>
            )}
            {!loading && events.length > 0 && (
              <div className="flex flex-col gap-px p-2">
                {events.map(ev => {
                  const dateStr = String(ev.date).split('T')[0];
                  const day = parseInt(dateStr.split('-')[2]);
                  return (
                    <button
                      key={ev.id + dateStr}
                      onClick={() => setSelectedEv({ ...ev, date: dateStr })}
                      className="w-full text-left px-2.5 py-2 rounded-lg transition-colors flex items-start gap-2 group hover:bg-surface-700 text-zinc-300"
                    >
                      <span className="shrink-0 w-6 h-6 rounded-md bg-surface-700 flex items-center justify-center text-[11px] font-bold mt-px text-zinc-400">
                        {day}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate leading-tight">{ev.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {ev.time && (
                            <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                              <Clock size={9} />{String(ev.time).slice(0, 5)}
                            </span>
                          )}
                          {ev.is_recurring && (
                            <span className="flex items-center gap-0.5 text-[10px] text-purple-400">
                              <RefreshCw size={9} />{RECURRENCE_LABEL[ev.recurrence] || ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={12} className="shrink-0 mt-1 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Vista: playlist del evento ── */
        <>
          {/* Header con botón volver */}
          <div className="flex items-center gap-1 px-2 py-2.5 border-b border-surface-700 shrink-0">
            <button
              onClick={() => { setSelectedEv(null); setSongSearch(''); setShowSearch(false); }}
              className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-surface-700 shrink-0"
              title="Volver a eventos"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate leading-tight">{selectedEv.title}</p>
              <p className="text-[10px] text-zinc-500 truncate">
                {fmtDate(selectedEv.date)}
                {selectedEv.time ? ' · ' + String(selectedEv.time).slice(0, 5) : ''}
              </p>
            </div>
            {saving
              ? <span className="text-[10px] text-zinc-500 shrink-0">…</span>
              : <button
                  onClick={() => { setShowSearch(s => !s); setTimeout(() => searchRef.current?.focus(), 50); }}
                  className={['shrink-0 p-1 rounded transition-colors',
                    showSearch ? 'text-accent bg-accent/15' : 'text-zinc-400 hover:text-white hover:bg-surface-700'
                  ].join(' ')}
                  title="Agregar canción"
                >
                  <Plus size={14} />
                </button>
            }
          </div>

          {/* Buscador para agregar canciones */}
          {showSearch && (
          <div className="px-2 py-2 border-b border-surface-700 shrink-0 relative">
            <input
              ref={searchRef}
              className="w-full bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
              placeholder="+ Agregar canción…"
              value={songSearch}
              onChange={e => setSongSearch(e.target.value)}
            />
            {filteredSongs.length > 0 && (
              <div className="absolute z-20 left-2 right-2 top-full mt-0.5 bg-surface-700 border border-surface-600 rounded-lg overflow-hidden shadow-xl max-h-52 overflow-y-auto">
                {filteredSongs.map(s => (
                  <button
                    key={s.id}
                    onMouseDown={e => { e.preventDefault(); addSong(s); }}
                    className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-surface-600 transition-colors flex items-center gap-2"
                  >
                    <Music size={10} className="text-accent shrink-0" />
                    <span className="truncate flex-1">{s.title}</span>
                    {s.author && <span className="text-zinc-500 text-[10px] shrink-0 truncate max-w-[60px]">{s.author}</span>}
                  </button>
                ))}
              </div>
            )}
            {songSearch && filteredSongs.length === 0 && (
              <div className="absolute z-20 left-2 right-2 top-full mt-0.5 bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-2 text-xs text-zinc-500">
                Sin resultados
              </div>
            )}
          </div>
          )}

          {/* Canciones */}
          <div className="flex-1 overflow-y-auto">
            {selectedEv.songs?.length > 0 ? (
              <div className="flex flex-col">
                {selectedEv.songs.map((s, i) => (
                  <div key={s.song_id} className="flex items-center border-b border-surface-700/60 last:border-0 group">
                    <button
                      onClick={() => actions.loadSongDetail(s.song_id)}
                      className="flex items-center gap-2 px-2.5 py-2 flex-1 min-w-0 hover:bg-accent/15 transition-colors text-left"
                    >
                      <span className="text-[10px] text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                      <Music size={10} className="text-accent shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] truncate leading-tight group-hover:text-white transition-colors">{s.title}</p>
                        {s.author && <p className="text-[10px] text-zinc-500 truncate">{s.author}</p>}
                      </div>
                    </button>
                    <button
                      onClick={() => removeSong(s.song_id)}
                      className="px-1.5 py-2 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      title="Quitar"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-8 text-zinc-600">
                <Music size={20} />
                <span className="text-xs text-center px-3">Busca canciones arriba para agregar</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Componente Tab ───────────────────────────────────────────────────────────
function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors border-b-2 -mb-px ${
        active
          ? 'text-accent border-accent bg-surface-900/50'
          : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:border-zinc-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

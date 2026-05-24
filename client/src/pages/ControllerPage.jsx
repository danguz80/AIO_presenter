import { useState, useEffect, useCallback, useRef } from 'react';
import { usePresenter } from '../context/usePresenter';
import SongLibrary     from '../components/Library/SongLibrary';
import SongDetail      from '../components/Library/SongDetail';
import BibleBrowser    from '../components/Library/BibleBrowser';
import MediaLibrary    from '../components/Library/MediaLibrary';
import LiveControls    from '../components/Controls/LiveControls';
import LivePreview     from '../components/Controls/LivePreview';
import SettingsPanel   from '../components/Settings/SettingsPanel';
import SongFormModal   from '../components/Library/SongFormModal';
import { ScheduleAddProvider } from '../context/ScheduleAddContext';
import { useScheduleAdd }      from '../context/ScheduleAddContext';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, WifiOff, Music, BookOpen, Film, Smartphone, X, CalendarDays, ChevronLeft, ChevronRight, Clock, RefreshCw, Plus, Pencil, ChevronUp, ChevronDown, Settings, Bookmark, Minus, LayoutTemplate, GripVertical, CheckCircle2, Circle, SkipForward, Save, Check, Home } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const API_BASE = import.meta.env.VITE_API_URL || '';

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('aio_sync_token');
  const headers = { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return fetch(`${API_BASE}${url}`, { ...opts, headers });
}
const RECURRENCE_LABEL = { weekly: 'Semanal', biweekly: 'Cada 2 semanas', monthly: 'Mensual' };

// ─── Hook: panel redimensionable arrastrando el borde ───────────────────────
// reversed=true: arrastrar borde izquierdo (panel en el extremo derecho)
function useResizablePanel(defaultWidth, minWidth = 140, maxWidth = 600, reversed = false) {
  const [width, setWidth] = useState(defaultWidth);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(0);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = width;

    const onMove = (ev) => {
      if (!dragging.current) return;
      const delta = reversed
        ? startX.current - ev.clientX
        : ev.clientX - startX.current;
      setWidth(Math.min(maxWidth, Math.max(minWidth, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, minWidth, maxWidth, reversed]);

  return { width, onMouseDown };
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) {
  // Acepta '2026-05-03', Date, o string ISO — devuelve '03-05-2026'
  const s = String(d).split('T')[0];
  const [y, m, day] = s.split('-');
  return `${day}-${m}-${y}`;
}

export default function ControllerPage() {
  const { state } = usePresenter();
  const navigate = useNavigate();

  // ── Redirigir a /mobile en móvil ──────────────────────────────────────────
  // 3 capas para cubrir Samsung Fold, iPhone, y UA inusuales:
  //  1. Client Hints API (Chromium/Samsung Internet moderno): mobile:true
  //  2. UA string clásico
  //  3. Dispositivo táctil sin ratón (pointer:coarse) con pantalla ≤1279px
  useEffect(() => {
    const isPhone = (
      navigator.userAgentData?.mobile === true
      || /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(pointer: coarse) and (max-width: 1279px)').matches
    );
    const mq = window.matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 499px)');
    if (isPhone || mq.matches) { navigate('/mobile', { replace: true }); return; }
    const handler = (e) => { if (e.matches) navigate('/mobile', { replace: true }); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [navigate]);

  const [activeTab, setActiveTab] = useState('songs'); // 'songs' | 'bible'
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaHeight, setMediaHeight] = useState(220);
  const mediaDragging = useRef(false);
  const mediaStartY   = useRef(0);
  const mediaStartH   = useRef(0);

  const onMediaResizeStart = useCallback((e) => {
    e.preventDefault();
    mediaDragging.current = true;
    mediaStartY.current   = e.clientY;
    mediaStartH.current   = mediaHeight;
    const onMove = (ev) => {
      if (!mediaDragging.current) return;
      const delta = mediaStartY.current - ev.clientY;
      setMediaHeight(Math.min(500, Math.max(120, mediaStartH.current + delta)));
    };
    const onUp = () => {
      mediaDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [mediaHeight]);
  const [mobileUrl, setMobileUrl] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const { width: previewWidth, onMouseDown: onPreviewResize } = useResizablePanel(384, 220, 700, true);

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
    <ScheduleAddProvider>
    <div className="flex flex-col h-screen bg-surface-900 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-surface-700 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            title="Volver al inicio"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-accent transition-colors"
          >
            <Home size={15} />
          </Link>
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

          {/* Botón recargar */}
          <button
            onClick={() => window.location.reload()}
            title="Recargar aplicación"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-700"
          >
            <RefreshCw size={15} />
          </button>

          {/* Botón configuración */}
          <button
            onClick={() => setShowSettings(true)}
            title="Configuración"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-accent transition-colors px-2 py-1 rounded hover:bg-surface-700"
          >
            <Settings size={15} />
            <span className="hidden sm:inline">Configuración</span>
          </button>
        </div>
      </header>

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

            {/* Columna 2: Detalle / Slides + panel multimedia inferior */}
            <main className="flex-1 flex flex-col overflow-hidden border-r border-surface-700">
              <div className="flex-1 overflow-hidden">
                <SongDetail />
              </div>

              {/* ── Panel colapsable Multimedia ── */}
              <div className="shrink-0 border-t border-surface-700">
                {/* Cabecera / pestaña */}
                <button
                  onClick={() => setMediaOpen(v => !v)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 bg-surface-800 hover:bg-surface-700 transition-colors"
                >
                  <Film size={13} className="text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-300">Multimedia</span>
                  <span className="ml-auto">
                    {mediaOpen
                      ? <ChevronDown size={13} className="text-zinc-500" />
                      : <ChevronUp size={13} className="text-zinc-500" />}
                  </span>
                </button>

                {/* Contenido colapsable */}
                {mediaOpen && (
                  <div className="flex flex-col" style={{ height: mediaHeight }}>
                    {/* Handle de redimensionado (borde superior) */}
                    <div
                      onMouseDown={onMediaResizeStart}
                      className="h-1 w-full cursor-row-resize hover:bg-accent/50 transition-colors shrink-0"
                      title="Arrastrar para redimensionar"
                    />
                    <div className="flex-1 overflow-hidden">
                      <MediaLibrary />
                    </div>
                  </div>
                )}
              </div>
            </main>
          </>
        ) : (
          /* Columnas 1+2: Navegador de Biblia */
          <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-700">
            <BibleBrowser />
          </div>
        )}

        {/* Columna 3: Controles en vivo + Preview (redimensionable) */}
        <aside className="shrink-0 flex flex-col overflow-hidden relative" style={{ width: previewWidth }}>
          {/* Handle izquierdo de redimensionado */}
          <div
            onMouseDown={onPreviewResize}
            className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-accent/50 transition-colors z-10"
            title="Arrastrar para redimensionar"
          />
          <LivePreview />
          <LiveControls />
        </aside>
      </div>

      {/* Panel de Configuración */}
      {showSettings && (
        <SettingsPanel
          mobileUrl={mobileUrl}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
    </ScheduleAddProvider>
  );
}

// ─── CollapsibleLibrary ───────────────────────────────────────────
function CollapsibleLibrary() {
  const [open, setOpen] = useState(false);
  const { width, onMouseDown } = useResizablePanel(288, 160, 520);

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
    <aside className="shrink-0 border-r border-surface-700 flex flex-col overflow-hidden relative" style={{ width }}>
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
      {/* Handle de redimensionado */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/50 transition-colors z-10"
        title="Arrastrar para redimensionar"
      />
    </aside>
  );
}

// ─── EventsPanel ─────────────────────────────────────────────────────────────
function EventsPanel() {
  const today = new Date();
  const { state, actions } = usePresenter();
  const [open,       setOpen]       = useState(false);
  const { width: panelWidth, onMouseDown: onResizeMouseDown } = useResizablePanel(280, 160, 480);
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
  const [editingSong, setEditingSong] = useState(null); // song completa para SongFormModal
  // Separadores
  const [showSepForm,      setShowSepForm]      = useState(false);
  const [sepLabel,         setSepLabel]         = useState('');
  const [sepColor,         setSepColor]         = useState('#6366f1');
  // Plantillas
  const [templates,        setTemplates]        = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showSaveTemplate,  setShowSaveTemplate]  = useState(false);
  const [showLoadTemplate,  setShowLoadTemplate]  = useState(false);
  const [templateName,      setTemplateName]      = useState('');
  const [savingTemplate,   setSavingTemplate]   = useState(false);
  const [viewingTemplates, setViewingTemplates] = useState(false);
  // Plantilla activa (para guardar cambios de vuelta a la misma plantilla)
  const [activeTemplate,      setActiveTemplate]      = useState(null); // { id, name }
  const [templateDirty,       setTemplateDirty]       = useState(false);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);
  const [altTemplateName,     setAltTemplateName]     = useState('');
  const [showAltNameInput,    setShowAltNameInput]    = useState(false);
  // Editar evento
  const [editingEv,    setEditingEv]    = useState(false);
  const [editEvData,   setEditEvData]   = useState({});
  const [editEvBusy,   setEditEvBusy]   = useState(false);
  const [editEvError,  setEditEvError]  = useState('');
  // Drag & drop
  const dragSrcIndex  = useRef(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  // Editar separador inline
  const [editingSepIdx,   setEditingSepIdx]   = useState(null);
  const [editingSepLabel, setEditingSepLabel] = useState('');
  const [editingSepColor, setEditingSepColor] = useState('#6366f1');
  const searchRef = useRef(null);

  // ── Helpers de reproducción ────────────────────────────────────────────────
  // Fecha de ocurrencia del evento (null para no recurrentes)
  const occDateForEv = (ev) => ev?.is_recurring ? String(ev.date).split('T')[0] : null;

  // ¿Estamos en o después de la fecha+hora del evento?
  const isAfterEventTime = (ev) => {
    if (!ev) return false;
    const dateStr = String(ev.date).split('T')[0];
    // PostgreSQL TIME viene como "HH:MM:SS" — tomamos solo "HH:MM"
    const timeStr = (ev.time || '00:00').slice(0, 5);
    const eventDt = new Date(`${dateStr}T${timeStr}:00`);
    return new Date() >= eventDt;
  };

  // Cargar plays cuando cambia el evento seleccionado
  useEffect(() => {
    if (selectedEv) {
      actions.loadPlays(selectedEv.id, occDateForEv(selectedEv));
    }
  }, [selectedEv?.id, selectedEv?.date]); // eslint-disable-line

  const playedIds = state.eventPlays; // Set<song_id>
  const reservasMode = state.reservasMode;

  // ¿Existe un separador "reservas" en el schedule actual?
  const normLabel = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hasReservas = (selectedEv?.songs || []).some(
    s => s.item_type === 'separator' && normLabel(s.separator_label).includes('reserva')
  );

  const handleManualMark = async (songId) => {
    if (!selectedEv || !isAfterEventTime(selectedEv)) return;
    const totalSlides = state.selectedSong?.id === songId ? (state.selectedSong?.slides?.length || 0) : 0;
    await actions.markPlayed(selectedEv.id, occDateForEv(selectedEv), songId, totalSlides, totalSlides, true);
  };

  const handleUnmark = async (songId) => {
    if (!selectedEv) return;
    await actions.unmarkPlayed(selectedEv.id, occDateForEv(selectedEv), songId);
  };

  // Publicar el schedule al contexto global cuando cambia el evento seleccionado
  useEffect(() => {
    actions.setSchedule(selectedEv?.songs ?? []);
  }, [selectedEv]); // eslint-disable-line

  // Cargar todas las canciones una vez al abrir
  useEffect(() => {
    if (open && allSongs.length === 0) {
      authFetch('/api/songs').then(r => r.json()).then(setAllSongs).catch(() => {});
    }
  }, [open]); // eslint-disable-line

  // Cargar plantillas de eventos
  useEffect(() => {
    authFetch('/api/event-templates').then(r => r.json()).then(setTemplates).catch(() => {});
  }, []);

  const fetchEvents = useCallback((y, m) => {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const start   = `${y}-${pad(m + 1)}-01`;
    const end     = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    setLoading(true);
    setSelectedEv(null);
    authFetch(`/api/events?start=${start}&end=${end}`)
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

  // ── Helper: guarda la lista de ítems en la API ──────────────────────────────
  const saveItemsToApi = useCallback(async (items) => {
    const occDate  = selectedEv.is_recurring ? String(selectedEv.date).split('T')[0] : null;
    const baseDate = selectedEv.base_date    || String(selectedEv.date).split('T')[0];
    await authFetch(`/api/events/${selectedEv.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: selectedEv.title, date: baseDate,
        time: selectedEv.time || null, description: selectedEv.description || null,
        is_recurring: selectedEv.is_recurring, recurrence: selectedEv.recurrence || null,
        recur_end: selectedEv.recur_end || null, occurrence_date: occDate,
        songs: items.map((p, i) => ({
          song_id:         p.song_id         || null,
          item_type:       p.item_type       || 'song',
          separator_label: p.separator_label || null,
          separator_color: p.separator_color || null,
          media_name:      p.media_name      || null,
          media_type:      p.media_type      || null,
          position: i,
        })),
      }),
    });
  }, [selectedEv]);

  // ── Helper: aplica nueva lista en estado ────────────────────────────────────
  const applyNewItems = useCallback((newItems) => {
    setSelectedEv(ev => ({ ...ev, songs: newItems }));
    setEvents(evs => evs.map(e =>
      (e.id === selectedEv.id && String(e.date).split('T')[0] === String(selectedEv.date).split('T')[0])
        ? { ...e, songs: newItems } : e
    ));
  }, [selectedEv]);

  // ── Agregar archivo multimedia al programa ──────────────────────────────────
  const { setFn: setScheduleAddFn } = useScheduleAdd() ?? {};
  const addMediaItem = useCallback(async (file) => {
    if (!selectedEv) return;
    const newItem = { song_id: null, item_type: 'media', media_name: file.name, media_type: file.mediaType || file.type };
    const newItems = [...(selectedEv.songs || []), newItem];
    setSaving(true);
    try {
      await saveItemsToApi(newItems);
      applyNewItems(newItems);
      if (activeTemplate) setTemplateDirty(true);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }, [selectedEv, saveItemsToApi, applyNewItems, activeTemplate]); // eslint-disable-line

  useEffect(() => {
    setScheduleAddFn?.(selectedEv ? addMediaItem : null);
  }, [selectedEv, addMediaItem]); // eslint-disable-line

  const addSong = async (song) => {
    const newItems = [...(selectedEv.songs || []), { song_id: song.id, title: song.title, author: song.author, item_type: 'song' }];
    setSaving(true);
    try {
      await saveItemsToApi(newItems);
      applyNewItems(newItems);
      if (activeTemplate) setTemplateDirty(true);
      setSongSearch('');
      searchRef.current?.focus();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const addSeparator = async () => {
    if (!sepLabel.trim()) return;
    const newItems = [...(selectedEv.songs || []), {
      item_type: 'separator', separator_label: sepLabel.trim(), separator_color: sepColor, song_id: null,
    }];
    setSaving(true);
    try {
      await saveItemsToApi(newItems);
      applyNewItems(newItems);
      if (activeTemplate) setTemplateDirty(true);
      setSepLabel(''); setSepColor('#6366f1'); setShowSepForm(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const startCreating = () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    setNewEv({ title: '', date: iso, time: '', is_recurring: false, recurrence: 'weekly' });
    setCreateError('');
    setSelectedTemplate(null);
    setCreating(true);
  };

  const saveNewEvent = async () => {
    if (!newEv.title.trim()) { setCreateError('Escribe un título'); return; }
    if (!newEv.date)         { setCreateError('Elige una fecha'); return; }
    setCreatingBusy(true);
    setCreateError('');
    try {
      const templateSongs = selectedTemplate
        ? (selectedTemplate.items || []).map(item => ({
            song_id:         item.song_id         || null,
            item_type:       item.item_type       || 'song',
            separator_label: item.separator_label || null,
            separator_color: item.separator_color || null,
          }))
        : [];
      const res = await authFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEv.title.trim(),
          date: newEv.date,
          time: newEv.time || null,
          is_recurring: newEv.is_recurring,
          recurrence: newEv.is_recurring ? newEv.recurrence : null,
          songs: templateSongs,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await res.json().catch(() => null);
      const [evYear, evMonth] = newEv.date.split('-').map(Number);
      setYear(evYear);
      setMonth(evMonth - 1);
      setCreating(false);
      setSelectedTemplate(null);
      fetchEvents(evYear, evMonth - 1);
    } catch (e) {
      console.error(e);
      setCreateError(e.message || 'Error al crear evento');
    }
    finally { setCreatingBusy(false); }
  };

  const reorderItem = async (index, dir) => {
    const items  = selectedEv.songs || [];
    const newIdx = dir === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= items.length) return;
    const newItems = [...items];
    [newItems[index], newItems[newIdx]] = [newItems[newIdx], newItems[index]];
    setSaving(true);
    try {
      await saveItemsToApi(newItems);
      applyNewItems(newItems);
      if (activeTemplate) setTemplateDirty(true);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const removeItem = async (index) => {
    const newItems = (selectedEv.songs || []).filter((_, i) => i !== index);
    setSaving(true);
    try {
      await saveItemsToApi(newItems);
      applyNewItems(newItems);
      if (activeTemplate) setTemplateDirty(true);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const items = (selectedEv.songs || []).map(s => ({
        item_type:       s.item_type       || 'song',
        song_id:         s.song_id         || null,
        title:           s.title           || null,
        author:          s.author          || null,
        separator_label: s.separator_label || null,
        separator_color: s.separator_color || null,
      }));
      const res  = await authFetch('/api/event-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName.trim(), items }),
      });
      const tpl = await res.json();
      setTemplates(ts => {
        const filtered = ts.filter(t => t.name !== tpl.name);
        return [tpl, ...filtered];
      });
      setActiveTemplate({ id: tpl.id, name: tpl.name });
      setTemplateDirty(false);
      setTemplateName(''); setShowSaveTemplate(false);
    } catch (e) { console.error(e); }
    finally { setSavingTemplate(false); }
  };

  const saveToActiveTemplate = async () => {
    if (!activeTemplate) return;
    setSavingTemplate(true);
    try {
      const items = (selectedEv.songs || []).map(s => ({
        item_type:       s.item_type       || 'song',
        song_id:         s.song_id         || null,
        title:           s.title           || null,
        author:          s.author          || null,
        separator_label: s.separator_label || null,
        separator_color: s.separator_color || null,
      }));
      const res = await authFetch('/api/event-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: activeTemplate.name, items }),
      });
      const tpl = await res.json();
      setTemplates(ts => ts.map(t => t.id === tpl.id || t.name === tpl.name ? tpl : t));
      setActiveTemplate({ id: tpl.id, name: tpl.name });
      setTemplateDirty(false);
      setTemplateSaveSuccess(true);
      setTimeout(() => setTemplateSaveSuccess(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSavingTemplate(false); }
  };

  const saveUnderNewName = async () => {
    if (!altTemplateName.trim()) return;
    setSavingTemplate(true);
    try {
      const items = (selectedEv.songs || []).map(s => ({
        item_type:       s.item_type       || 'song',
        song_id:         s.song_id         || null,
        title:           s.title           || null,
        author:          s.author          || null,
        separator_label: s.separator_label || null,
        separator_color: s.separator_color || null,
      }));
      const res = await authFetch('/api/event-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: altTemplateName.trim(), items }),
      });
      const tpl = await res.json();
      setTemplates(ts => {
        const filtered = ts.filter(t => t.name !== tpl.name);
        return [tpl, ...filtered];
      });
      setActiveTemplate({ id: tpl.id, name: tpl.name });
      setTemplateDirty(false);
      setAltTemplateName('');
      setShowAltNameInput(false);
      setTemplateSaveSuccess(true);
      setTimeout(() => setTemplateSaveSuccess(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSavingTemplate(false); }
  };

  const deleteTemplateById = async (id) => {
    try {
      await authFetch(`/api/event-templates/${id}`, { method: 'DELETE' });
      setTemplates(ts => ts.filter(t => t.id !== id));
      if (selectedTemplate?.id === id) setSelectedTemplate(null);
    } catch (e) { console.error(e); }
  };

  const applyTemplateToExisting = async (tpl, mode = 'replace') => {
    const tplItems = (tpl.items || []).map((item, i) => ({
      song_id:         item.song_id         || null,
      item_type:       item.item_type       || 'song',
      title:           item.title           || null,
      author:          item.author          || null,
      separator_label: item.separator_label || null,
      separator_color: item.separator_color || null,
      position:        i,
    }));
    const newItems = mode === 'replace'
      ? tplItems
      : [...(selectedEv.songs || []), ...tplItems];
    setSaving(true);
    try {
      await saveItemsToApi(newItems);
      applyNewItems(newItems);
      setActiveTemplate({ id: tpl.id, name: tpl.name });
      setTemplateDirty(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); setShowLoadTemplate(false); }
  };

  const saveEditEvent = async () => {
    if (!editEvData.title?.trim()) { setEditEvError('Escribe un título'); return; }
    if (!editEvData.date)          { setEditEvError('Elige una fecha'); return; }
    setEditEvBusy(true); setEditEvError('');
    try {
      const res = await authFetch(`/api/events/${selectedEv.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:        editEvData.title.trim(),
          date:         editEvData.date,
          time:         editEvData.time || null,
          description:  editEvData.description || null,
          is_recurring: editEvData.is_recurring,
          recurrence:   editEvData.is_recurring ? editEvData.recurrence : null,
          recur_end:    editEvData.recur_end || null,
          // sin songs → no modifica la playlist
        }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
      // Actualizar estado local
      const updated = {
        ...selectedEv,
        title:        editEvData.title.trim(),
        date:         editEvData.date,
        time:         editEvData.time || null,
        is_recurring: editEvData.is_recurring,
        recurrence:   editEvData.is_recurring ? editEvData.recurrence : null,
        recur_end:    editEvData.recur_end || null,
      };
      setSelectedEv(updated);
      setEvents(evs => evs.map(e =>
        e.id === selectedEv.id ? { ...e, ...updated } : e
      ));
      setEditingEv(false);
    } catch (e) { setEditEvError(e.message || 'Error al guardar'); }
    finally { setEditEvBusy(false); }
  };

  const deleteEvent = async () => {
    if (!window.confirm(`¿Eliminar el evento "${selectedEv.title}"?`)) return;
    try {
      await authFetch(`/api/events/${selectedEv.id}`, { method: 'DELETE' });
      setSelectedEv(null);
      setEvents(evs => evs.filter(e => e.id !== selectedEv.id));
    } catch (e) { console.error(e); }
  };

  const saveSeparatorEdit = async () => {
    if (!editingSepLabel.trim()) return;
    const items = (selectedEv.songs || []).map((s, i) =>
      i === editingSepIdx
        ? { ...s, separator_label: editingSepLabel.trim(), separator_color: editingSepColor }
        : s
    );
    setSaving(true);
    try {
      await saveItemsToApi(items);
      applyNewItems(items);
      if (activeTemplate) setTemplateDirty(true);
      setEditingSepIdx(null);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDrop = async (toIndex) => {
    const from = dragSrcIndex.current;
    dragSrcIndex.current = null;
    setDragOverIdx(null);
    if (from === null || from === toIndex) return;
    const items    = [...(selectedEv.songs || [])];
    const [moved]  = items.splice(from, 1);
    items.splice(toIndex, 0, moved);
    setSaving(true);
    try {
      await saveItemsToApi(items);
      applyNewItems(items);
      if (activeTemplate) setTemplateDirty(true);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const openEditSong = async (song_id) => {
    try {
      const res = await authFetch(`/api/songs/${song_id}`);
      const data = await res.json();
      setEditingSong(data);
    } catch (e) { console.error(e); }
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
    <>
    <div className="shrink-0 border-r border-surface-700 flex flex-col overflow-hidden bg-surface-800/50 relative" style={{ width: panelWidth }}>
      {/* Handle de redimensionado */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/50 transition-colors z-10"
        title="Arrastrar para redimensionar"
      />

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
            {/* Selector de plantilla */}
            {templates.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <LayoutTemplate size={10} /> Plantilla <span className="normal-case text-zinc-600">(opcional)</span>
                </label>
                <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
                  {templates.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedTemplate(s => s?.id === tpl.id ? null : tpl)}
                      className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                        selectedTemplate?.id === tpl.id
                          ? 'bg-accent/20 border border-accent/50 text-accent'
                          : 'bg-surface-700 border border-surface-600 text-zinc-300 hover:border-accent/30'
                      }`}
                    >
                      <LayoutTemplate size={9} className="shrink-0 opacity-60" />
                      <span className="flex-1 truncate">{tpl.name}</span>
                      <span className="text-[9px] text-zinc-500 shrink-0">{tpl.items?.length || 0} ítems</span>
                    </button>
                  ))}
                </div>
                {selectedTemplate && (
                  <p className="text-[10px] text-accent/80">✓ Se cargará "{selectedTemplate.name}"</p>
                )}
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
      ) : viewingTemplates ? (
        /* ── Vista: gestión de plantillas ── */
        <>
          <div className="flex items-center gap-1 px-2 py-2.5 border-b border-surface-700 shrink-0">
            <button
              onClick={() => setViewingTemplates(false)}
              className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-surface-700 shrink-0"
              title="Volver"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex items-center gap-1.5 flex-1">
              <LayoutTemplate size={13} className="text-accent" />
              <span className="text-xs font-semibold">Plantillas guardadas</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-8 text-zinc-600">
                <LayoutTemplate size={22} />
                <span className="text-xs text-center px-4">No hay plantillas guardadas</span>
                <span className="text-[10px] text-zinc-600 text-center px-4">Abre un evento y usa el ícono 🔖 para guardar uno</span>
              </div>
            ) : (
              <div className="flex flex-col gap-px p-2">
                {templates.map(tpl => (
                  <div key={tpl.id} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-surface-700/50 group">
                    <LayoutTemplate size={13} className="text-accent shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{tpl.name}</p>
                      <div className="flex flex-col gap-0.5 mt-1">
                        {(tpl.items || []).map((item, j) =>
                          item.item_type === 'separator' ? (
                            <div key={j} className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.separator_color || '#6366f1' }} />
                              <span className="text-[9px] font-semibold truncate" style={{ color: item.separator_color || '#6366f1' }}>{item.separator_label}</span>
                            </div>
                          ) : (
                            <div key={j} className="flex items-center gap-1">
                              <Music size={8} className="text-zinc-500 shrink-0" />
                              <span className="text-[9px] text-zinc-400 truncate">{item.title || `Canción #${item.song_id}`}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTemplateById(tpl.id)}
                      className="shrink-0 p-1 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 rounded hover:bg-surface-700"
                      title="Eliminar plantilla"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                onClick={() => setViewingTemplates(true)}
                className="text-zinc-500 hover:text-accent transition-colors p-0.5 rounded"
                title="Ver plantillas"
              >
                <LayoutTemplate size={13} />
              </button>
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
              onClick={() => { setSelectedEv(null); setSongSearch(''); setShowSearch(false); setEditingEv(false); setActiveTemplate(null); setTemplateDirty(false); setTemplateSaveSuccess(false); setAltTemplateName(''); setShowAltNameInput(false); }}
              className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-surface-700 shrink-0"
              title="Volver a eventos"
            >
              <ChevronLeft size={14} />
            </button>
            {editingEv ? (
              /* ── Formulario edición ── */
              <span className="text-xs font-semibold flex-1 text-accent">Editar evento</span>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-tight">{selectedEv.title}</p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {fmtDate(selectedEv.date)}
                  {selectedEv.time ? ' · ' + String(selectedEv.time).slice(0, 5) : ''}
                </p>
              </div>
            )}
            {!editingEv && (saving
              ? <span className="text-[10px] text-zinc-500 shrink-0">…</span>
              : <div className="flex items-center gap-0.5 shrink-0">
                  {/* Ir a reservas */}
                  {hasReservas && (
                    <button
                      onClick={() => actions.setReservasMode(!reservasMode)}
                      className={['p-1 rounded transition-colors',
                        reservasMode ? 'text-amber-400 bg-amber-400/15' : 'text-zinc-400 hover:text-amber-400 hover:bg-surface-700'
                      ].join(' ')}
                      title={reservasMode ? 'Desactivar modo reservas' : 'Ir a reservas'}
                    >
                      <SkipForward size={13} />
                    </button>
                  )}
                  {/* Editar evento */}
                  <button
                    onClick={() => {
                      setEditEvData({
                        title:        selectedEv.title,
                        date:         String(selectedEv.date).split('T')[0],
                        time:         selectedEv.time ? String(selectedEv.time).slice(0,5) : '',
                        description:  selectedEv.description || '',
                        is_recurring: selectedEv.is_recurring || false,
                        recurrence:   selectedEv.recurrence   || 'weekly',
                        recur_end:    selectedEv.recur_end    || '',
                      });
                      setEditEvError('');
                      setEditingEv(true);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-white hover:bg-surface-700 transition-colors"
                    title="Editar evento"
                  >
                    <Pencil size={13} />
                  </button>
                  {/* Cargar plantilla en evento existente */}
                  {templates.length > 0 && (
                    <button
                      onClick={() => setShowLoadTemplate(s => !s)}
                      className={['p-1 rounded transition-colors',
                        showLoadTemplate ? 'text-accent bg-accent/15' : 'text-zinc-400 hover:text-white hover:bg-surface-700'
                      ].join(' ')}
                      title="Cargar plantilla"
                    >
                      <LayoutTemplate size={13} />
                    </button>
                  )}
                  {/* Guardar como plantilla */}
                  {(selectedEv.songs?.length > 0 && !activeTemplate) && (
                    <button
                      onClick={() => { setShowSaveTemplate(s => !s); setTemplateName(''); }}
                      className={['p-1 rounded transition-colors',
                        showSaveTemplate ? 'text-accent bg-accent/15' : 'text-zinc-400 hover:text-white hover:bg-surface-700'
                      ].join(' ')}
                      title="Guardar como plantilla"
                    >
                      <Bookmark size={13} />
                    </button>
                  )}
                  {/* Agregar separador */}
                  <button
                    onClick={() => { setShowSepForm(s => !s); setSepLabel(''); }}
                    className={['p-1 rounded transition-colors',
                      showSepForm ? 'text-accent bg-accent/15' : 'text-zinc-400 hover:text-white hover:bg-surface-700'
                    ].join(' ')}
                    title="Agregar separador de sección"
                  >
                    <Minus size={13} />
                  </button>
                  {/* Agregar canción */}
                  <button
                    onClick={() => { setShowSearch(s => !s); setTimeout(() => searchRef.current?.focus(), 50); }}
                    className={['p-1 rounded transition-colors',
                      showSearch ? 'text-accent bg-accent/15' : 'text-zinc-400 hover:text-white hover:bg-surface-700'
                    ].join(' ')}
                    title="Agregar canción"
                  >
                    <Plus size={14} />
                  </button>
                </div>
            )}
          </div>

          {/* ── Banner plantilla activa ── */}
          {!editingEv && activeTemplate && (
            <div className="px-2 py-1.5 border-b border-surface-700 bg-accent/5 shrink-0">
              <div className="flex items-center gap-1.5">
                <LayoutTemplate size={10} className="text-accent shrink-0" />
                <span className="text-[10px] text-zinc-400 flex-1 min-w-0 truncate">
                  Plantilla: <span className="text-accent font-medium">{activeTemplate.name}</span>
                </span>
                {templateSaveSuccess ? (
                  <span className="text-[10px] text-green-400 font-semibold flex items-center gap-0.5 shrink-0">
                    <Check size={10} /> Guardado
                  </span>
                ) : (
                  <button
                    onClick={saveToActiveTemplate}
                    disabled={!templateDirty || savingTemplate}
                    className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors bg-accent text-white hover:bg-accent-hover disabled:opacity-35 disabled:cursor-not-allowed"
                    title="Sobreescribir plantilla con los cambios actuales"
                  >
                    <Save size={9} />
                    {savingTemplate ? '…' : 'Guardar'}
                  </button>
                )}
                <button
                  onClick={() => { setShowAltNameInput(s => !s); setAltTemplateName(''); }}
                  className={`shrink-0 p-0.5 rounded transition-colors ${showAltNameInput ? 'text-accent bg-accent/15' : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-700'}`}
                  title="Guardar con otro nombre"
                >
                  <Bookmark size={11} />
                </button>
              </div>
              {showAltNameInput && (
                <div className="flex items-center gap-1 mt-1.5">
                  <input
                    autoFocus
                    className="flex-1 min-w-0 bg-surface-700 border border-surface-600 rounded px-2 py-1 text-[10px] focus:outline-none focus:border-accent"
                    placeholder="Guardar con otro nombre…"
                    value={altTemplateName}
                    onChange={e => setAltTemplateName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveUnderNewName()}
                  />
                  <button
                    onClick={saveUnderNewName}
                    disabled={!altTemplateName.trim() || savingTemplate}
                    className="shrink-0 px-2 py-1 rounded bg-surface-600 hover:bg-surface-500 text-zinc-300 text-[10px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {savingTemplate ? '…' : '✓'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Formulario edición de evento ── */}
          {editingEv && (
            <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
              {editEvError && (
                <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-2.5 py-1.5">{editEvError}</div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Título</label>
                <input
                  autoFocus
                  className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                  value={editEvData.title || ''}
                  onChange={e => setEditEvData(v => ({ ...v, title: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveEditEvent()}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Fecha</label>
                <input
                  type="date"
                  className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                  value={editEvData.date || ''}
                  onChange={e => setEditEvData(v => ({ ...v, date: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Hora <span className="normal-case text-zinc-600">(opcional)</span></label>
                <input
                  type="time"
                  className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                  value={editEvData.time || ''}
                  onChange={e => setEditEvData(v => ({ ...v, time: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editEvData.is_recurring || false}
                  onChange={e => setEditEvData(v => ({ ...v, is_recurring: e.target.checked }))}
                  className="accent-indigo-500"
                />
                <span className="text-xs text-zinc-300">Recurrente</span>
              </label>
              {editEvData.is_recurring && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Frecuencia</label>
                  <select
                    className="bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors"
                    value={editEvData.recurrence || 'weekly'}
                    onChange={e => setEditEvData(v => ({ ...v, recurrence: e.target.value }))}
                  >
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Cada 2 semanas</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={saveEditEvent}
                  disabled={editEvBusy}
                  className="w-full py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-xs font-semibold transition-colors"
                >
                  {editEvBusy ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  onClick={deleteEvent}
                  className="w-full py-1.5 rounded-lg border border-red-800/50 text-red-400 hover:bg-red-900/20 text-xs font-medium transition-colors"
                >
                  Eliminar evento
                </button>
                <button
                  onClick={() => setEditingEv(false)}
                  className="w-full py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Buscador para agregar canciones */}
          {!editingEv && showSearch && (
          <div className="px-2 py-2 border-b border-surface-700 shrink-0 relative">            <input
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

          {/* Panel: cargar plantilla en evento existente */}
          {!editingEv && showLoadTemplate && (
          <div className="px-2 py-2.5 border-b border-surface-700 shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <LayoutTemplate size={11} className="text-accent shrink-0" />
              <span className="text-[10px] text-zinc-400 flex-1 font-medium">Cargar plantilla</span>
              <button onClick={() => setShowLoadTemplate(false)} className="text-zinc-500 hover:text-white text-xs rounded hover:bg-surface-700 transition-colors p-0.5">✕</button>
            </div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {templates.map(tpl => (
                <div key={tpl.id} className="flex items-center gap-1 bg-surface-700 rounded-lg px-2 py-1.5">
                  <span className="flex-1 text-xs text-zinc-200 truncate">{tpl.name}</span>
                  <span className="text-[9px] text-zinc-500 shrink-0 mr-1">{tpl.items?.length || 0}</span>
                  <button
                    onClick={() => applyTemplateToExisting(tpl, 'append')}
                    className="shrink-0 px-1.5 py-0.5 rounded text-[10px] text-zinc-300 bg-surface-600 hover:bg-surface-500 transition-colors"
                    title="Agregar al final de la lista actual"
                  >+ Agregar</button>
                  <button
                    onClick={() => applyTemplateToExisting(tpl, 'replace')}
                    className="shrink-0 px-1.5 py-0.5 rounded text-[10px] text-white bg-accent/80 hover:bg-accent transition-colors"
                    title="Reemplazar toda la lista con esta plantilla"
                  >Reemplazar</button>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Formulario: guardar como plantilla */}
          {!editingEv && showSaveTemplate && (
          <div className="px-2 py-2 border-b border-surface-700 shrink-0 flex gap-1.5 items-center">
            <Bookmark size={11} className="text-accent shrink-0" />
            <input
              autoFocus
              className="flex-1 min-w-0 bg-surface-700 border border-surface-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              placeholder="Nombre de plantilla…"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveAsTemplate()}
            />
            <button
              onClick={saveAsTemplate}
              disabled={!templateName.trim() || savingTemplate}
              className="px-1.5 py-1 bg-accent/80 hover:bg-accent rounded text-white text-xs disabled:opacity-40 transition-colors"
            >{savingTemplate ? '…' : '✓'}</button>
            <button onClick={() => setShowSaveTemplate(false)} className="px-1 py-1 text-zinc-500 hover:text-white text-xs rounded hover:bg-surface-700 transition-colors">✕</button>
          </div>
          )}

          {/* Formulario: agregar separador */}
          {!editingEv && showSepForm && (
          <div className="px-2 py-2 border-b border-surface-700 shrink-0 flex gap-1.5 items-center">
            <input
              autoFocus
              className="flex-1 min-w-0 bg-surface-700 border border-surface-600 rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              placeholder="Nombre de sección…"
              value={sepLabel}
              onChange={e => setSepLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSeparator()}
            />
            <input
              type="color"
              value={sepColor}
              onChange={e => setSepColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-surface-500 bg-transparent shrink-0"
              title="Color del separador"
            />
            <button
              onClick={addSeparator}
              disabled={!sepLabel.trim() || saving}
              className="px-1.5 py-1 bg-accent/80 hover:bg-accent rounded text-white text-xs disabled:opacity-40 transition-colors"
            >✓</button>
            <button onClick={() => { setShowSepForm(false); setSepLabel(''); }} className="px-1 py-1 text-zinc-500 hover:text-white text-xs rounded hover:bg-surface-700 transition-colors">✕</button>
          </div>
          )}

          {/* Lista de canciones + separadores */}
          {!editingEv && <div className="flex-1 overflow-y-auto">
            {selectedEv.songs?.length > 0 ? (
              <div className="flex flex-col">
                {selectedEv.songs.map((s, i) => {
                  const isDragOver = dragOverIdx === i;
                  const dragProps = {
                    draggable: true,
                    onDragStart: () => { dragSrcIndex.current = i; },
                    onDragOver:  (e) => { e.preventDefault(); setDragOverIdx(i); },
                    onDragLeave: () => setDragOverIdx(null),
                    onDrop:      () => handleDrop(i),
                    onDragEnd:   () => { dragSrcIndex.current = null; setDragOverIdx(null); },
                  };

                  if (s.item_type === 'separator') {
                    // Modo edición inline
                    if (editingSepIdx === i) {
                      return (
                        <div key={s.id || `sep_${i}`} className="flex items-center gap-1 border-b border-surface-700/60 px-1 py-1">
                          <input
                            autoFocus
                            className="flex-1 min-w-0 bg-surface-700 border border-accent/50 rounded px-2 py-1 text-xs focus:outline-none"
                            value={editingSepLabel}
                            onChange={e => setEditingSepLabel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveSeparatorEdit(); if (e.key === 'Escape') setEditingSepIdx(null); }}
                          />
                          <input
                            type="color"
                            value={editingSepColor}
                            onChange={e => setEditingSepColor(e.target.value)}
                            className="w-7 h-7 rounded cursor-pointer border border-surface-500 bg-transparent shrink-0"
                          />
                          <button onClick={saveSeparatorEdit} disabled={!editingSepLabel.trim() || saving} className="px-1.5 py-1 bg-accent/80 hover:bg-accent rounded text-white text-xs disabled:opacity-40 transition-colors">✓</button>
                          <button onClick={() => setEditingSepIdx(null)} className="px-1 py-1 text-zinc-500 hover:text-white text-xs rounded hover:bg-surface-700 transition-colors">✕</button>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={s.id || `sep_${i}`}
                        {...dragProps}
                        className={`flex items-center gap-1 border-b border-surface-700/60 last:border-0 group transition-colors ${isDragOver ? 'bg-accent/10 border-t-2 border-t-accent' : ''}`}
                      >
                        {/* Grip handle */}
                        <div className="pl-1 cursor-grab active:cursor-grabbing text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0">
                          <GripVertical size={12} />
                        </div>
                        {/* Visualización separador: fondo de color */}
                        <div className="flex-1 flex items-center justify-center px-2 py-1 min-w-0 rounded-sm mx-1 my-1" style={{ backgroundColor: s.separator_color || '#6366f1' }}>
                          <span className="text-[11px] font-semibold tracking-wide truncate text-white drop-shadow-sm">
                            {s.separator_label}
                          </span>
                        </div>
                        {/* Editar */}
                        <button
                          onClick={() => { setEditingSepIdx(i); setEditingSepLabel(s.separator_label || ''); setEditingSepColor(s.separator_color || '#6366f1'); }}
                          className="px-1 py-1 text-zinc-600 hover:text-accent transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                          title="Editar separador"
                        ><Pencil size={10} /></button>
                        {/* Quitar */}
                        <button onClick={() => removeItem(i)} className="px-1 py-1 text-zinc-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0" title="Quitar separador"><X size={11} /></button>
                      </div>
                    );
                  }
                  // Ítem multimedia (video / imagen)
                  if (s.item_type === 'media') {
                    return (
                      <div
                        key={`media_${i}`}
                        {...dragProps}
                        className={`flex items-center border-b border-surface-700/60 last:border-0 group transition-colors ${isDragOver ? 'bg-accent/10 border-t-2 border-t-accent' : ''}`}
                      >
                        <div className="pl-1 cursor-grab active:cursor-grabbing text-zinc-600 group-hover:text-zinc-400 shrink-0">
                          <GripVertical size={12} />
                        </div>
                        <button
                          onClick={() => window.dispatchEvent(new CustomEvent('aio:play-media', { detail: { name: s.media_name, mediaType: s.media_type } }))}
                          className="flex items-center gap-2 px-1.5 py-2 flex-1 min-w-0 hover:bg-accent/15 transition-colors text-left"
                        >
                          <span className="text-[11px] text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                          <Film size={12} className="text-purple-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] truncate leading-tight group-hover:text-white transition-colors">{s.media_name}</p>
                            <p className="text-[10px] text-zinc-500 capitalize">{s.media_type}</p>
                          </div>
                        </button>
                        <button
                          onClick={() => removeItem(i)}
                          className="px-1.5 py-2 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                          title="Quitar"
                        ><X size={11} /></button>
                      </div>
                    );
                  }

                  // Canción normal
                  const isPlayed   = playedIds.has(s.song_id);
                  const canMark    = isAfterEventTime(selectedEv);
                  return (
                    <div
                      key={s.song_id || `song_${i}`}
                      {...dragProps}
                      className={`flex items-center border-b border-surface-700/60 last:border-0 group transition-colors
                        ${isDragOver ? 'bg-accent/10 border-t-2 border-t-accent' : ''}
                        ${isPlayed   ? 'opacity-50' : ''}`}
                    >
                      {/* Grip handle */}
                      <div className="pl-1 cursor-grab active:cursor-grabbing text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0">
                        <GripVertical size={12} />
                      </div>
                      <button
                        onClick={() => actions.loadSongDetail(s.song_id)}
                        className="flex items-center gap-2 px-1.5 py-2 flex-1 min-w-0 hover:bg-accent/15 transition-colors text-left"
                      >
                        <span className="text-[11px] text-zinc-600 w-4 text-right shrink-0">{i + 1}</span>
                        <Music size={12} className="text-accent shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] truncate leading-tight group-hover:text-white transition-colors">{s.title}</p>
                          {s.author && <p className="text-[11px] text-zinc-500 truncate">{s.author}</p>}
                          {s.tags && s.tags.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {s.tags.map(t => (
                                <span key={t} className="text-[10px] bg-surface-600 text-zinc-400 px-1 py-px rounded-full leading-none">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>
                      {/* Indicador tocada / botón marcar */}
                      <button
                        onClick={() => isPlayed ? handleUnmark(s.song_id) : handleManualMark(s.song_id)}
                        disabled={!canMark && !isPlayed}
                        title={isPlayed ? 'Quitar marca de tocada' : canMark ? 'Marcar como tocada' : 'Disponible solo durante/después del evento'}
                        className={`px-1 py-2 transition-colors shrink-0 opacity-0 group-hover:opacity-100
                          ${isPlayed
                            ? 'text-green-400 hover:text-zinc-500 opacity-100'
                            : canMark
                              ? 'text-zinc-600 hover:text-green-400'
                              : 'text-zinc-700 cursor-not-allowed'}`}
                      >
                        {isPlayed ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                      </button>
                      {/* Editar */}
                      <button
                        onClick={() => openEditSong(s.song_id)}
                        className="px-1 py-2 text-zinc-600 hover:text-accent transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                        title="Editar canción"
                      ><Pencil size={10} /></button>
                      {/* Quitar */}
                      <button
                        onClick={() => removeItem(i)}
                        className="px-1.5 py-2 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                        title="Quitar"
                      ><X size={11} /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-8 text-zinc-600">
                <Music size={20} />
                <span className="text-xs text-center px-3">Busca canciones arriba para agregar</span>
              </div>
            )}
          </div>}
        </>
      )}
    </div>

    {/* Modal edición de canción */}
    {editingSong && (
      <SongFormModal
        song={editingSong}
        onClose={async () => {
          // refrescar datos de la canción editada en la playlist
          try {
            const res = await authFetch(`/api/songs/${editingSong.id}`);
            const updated = await res.json();
            setSelectedEv(ev => ({
              ...ev,
              songs: (ev.songs || []).map(p =>
                p.song_id === updated.id ? { ...p, title: updated.title, author: updated.author } : p
              ),
            }));
          } catch (_) {}
          setEditingSong(null);
        }}
      />
    )}
    </>
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

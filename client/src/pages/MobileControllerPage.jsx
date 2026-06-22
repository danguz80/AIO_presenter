import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePresenter } from '../context/usePresenter';
import OutputControls  from '../components/Controls/OutputControls';
import StageControls   from '../components/Controls/StageControls';
import VirtualControls from '../components/Controls/VirtualControls';
import ThemePanel      from '../components/Settings/ThemePanel';
import DisplaysPanel   from '../components/Settings/DisplaysPanel';
import SyncPanel       from '../components/Settings/SyncPanel';
import MediaLibrary    from '../components/Library/MediaLibrary';
import MessagesPanel   from '../components/Controls/MessagesPanel';
import OrgSwitcher     from '../components/shared/OrgSwitcher';
import { stripChords, stripComments, isCommentLine, extractInlineComment, buildScaleChords, parseChordLines } from '../utils/chordUtils';
import { getLabelColor } from '../utils/labelColors';
import useVolumeKeys from '../hooks/useVolumeKeys';
import {
  ChevronLeft, ChevronRight, EyeOff, Eye,
  Wifi, WifiOff, Music, Music2, Radio, Settings, ArrowLeft, Search, X, RefreshCw,
  CalendarDays, BookOpen, Clock,
  Pencil, Trash2, Plus, Check, ChevronUp, ChevronDown, LayoutTemplate, SkipForward, Minus,
  CheckCircle2, Circle, MonitorPlay, MessageSquare,
} from 'lucide-react';

// ─── Utilidad: leer/guardar conexión ─────────────────────────────────────────
function getSavedIp()   { return localStorage.getItem('aio_server_ip')   || window.location.hostname; }
function getSavedPort() { return localStorage.getItem('aio_server_port') || '3001'; }
// En HTTPS (produccion) usa URL relativa para evitar Mixed Content.
// En HTTP (dev LAN) usa la IP y puerto del servidor guardados.
function getApiBase() {
  // 1. Si hay URL de backend configurada en build (prod): usarla solo si es HTTPS
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl?.startsWith('https:')) return envUrl;
  // 2. Si la pagina es HTTPS pero no hay URL configurada: same-origin (requiere proxy nginx)
  if (window.location.protocol === 'https:') return '';
  // 3. HTTP (dev LAN): IP y puerto guardados
  return `http://${getSavedIp()}:${getSavedPort()}`;
}

// Normaliza un string para búsqueda: minúsculas + sin tildes/diacríticos
// "Canción" → "cancion", "niño" → "nino"
function norm(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // elimina diacríticos
    .toLowerCase();
}

// ─── Utilidad: dividir versos bíblicos largos ───────────────────────────────
function splitBibleVerse(text, threshold = 170) {
  if (!text || text.length <= threshold) return null;
  const mid = Math.floor(text.length / 2);
  for (const delim of ['.', ';', ',']) {
    const idx = text.lastIndexOf(delim, mid);
    if (idx > text.length * 0.25 && idx < text.length * 0.75)
      return [text.slice(0, idx + 1).trim(), text.slice(idx + 1).trim()];
  }
  const spaceIdx = text.lastIndexOf(' ', mid);
  if (spaceIdx > 0) return [text.slice(0, spaceIdx).trim(), text.slice(spaceIdx + 1).trim()];
  return null;
}

// ─── Helpers para editar letras de canciones ─────────────────────────────────
function slidesToText(slides) {
  if (!slides || slides.length === 0) return '';
  const lines = [];
  let lastLabel;
  for (const slide of slides) {
    const lbl = slide.label?.trim() || '';
    if (lbl !== lastLabel) {
      if (lastLabel !== undefined) lines.push('');
      if (lbl) lines.push(`{${lbl}}`);
      lastLabel = lbl;
    } else {
      lines.push('');
    }
    lines.push(slide.content);
  }
  return lines.join('\n');
}

function textToSlides(text) {
  const normSections = text.split('\n').map(line => {
    const m = line.trim().match(/^\[([^\]]+)\]$/);
    if (m) {
      const sym = /^[A-G][#b]?(?:m|M|maj|min|dim|aug|sus[24]?|add\d*)?[0-9]*(?:\/[A-G][#b]?)?$/.test(m[1].trim());
      if (!sym) return `{${m[1].trim()}}`;
    }
    return line;
  }).join('\n');

  const slides = [];
  const parts = normSections.split(/\n(?=\{[^}]+\})/);
  for (const part of parts) {
    const labelMatch = part.match(/^\{([^}]+)\}/);
    const label = labelMatch ? labelMatch[1].trim() : '';
    const body  = part.replace(/^\{[^}]+\}\n?/, '');
    const blocks = body.split(/\n[ \t]*\n/).map(b => b.trim()).filter(b => b.length > 0);
    if (blocks.length === 0) continue;
    for (const block of blocks) slides.push({ label, content: block });
  }
  return slides.length > 0 ? slides : [{ label: '', content: text.trim() }];
}

// ─── Categorías de libros bíblicos (índice en canon protestante 66 libros) ────
const BOOK_CATEGORIES = [
  { label: 'Pentateuco',         start: 0,  end: 5,  bg: 'bg-emerald-900/50 border-emerald-700/40', text: 'text-emerald-100', accent: 'text-emerald-400' },
  { label: 'Historia',           start: 5,  end: 17, bg: 'bg-amber-900/50 border-amber-700/40',    text: 'text-amber-100',   accent: 'text-amber-400'   },
  { label: 'Poesía y sabiduría', start: 17, end: 22, bg: 'bg-violet-900/50 border-violet-700/40',  text: 'text-violet-100',  accent: 'text-violet-400'  },
  { label: 'Profetas mayores',   start: 22, end: 27, bg: 'bg-orange-900/50 border-orange-700/40',  text: 'text-orange-100',  accent: 'text-orange-400'  },
  { label: 'Profetas menores',   start: 27, end: 39, bg: 'bg-yellow-900/50 border-yellow-700/40',  text: 'text-yellow-100',  accent: 'text-yellow-400'  },
  { label: 'Evangelios',         start: 39, end: 43, bg: 'bg-blue-900/50 border-blue-700/40',      text: 'text-blue-100',    accent: 'text-blue-400'    },
  { label: 'Historia NT',        start: 43, end: 44, bg: 'bg-teal-900/50 border-teal-700/40',      text: 'text-teal-100',    accent: 'text-teal-400'    },
  { label: 'Epístolas paulinas', start: 44, end: 57, bg: 'bg-sky-900/50 border-sky-700/40',        text: 'text-sky-100',     accent: 'text-sky-400'     },
  { label: 'Cartas generales',   start: 57, end: 65, bg: 'bg-rose-900/50 border-rose-700/40',      text: 'text-rose-100',    accent: 'text-rose-400'    },
  { label: 'Profecía NT',        start: 65, end: 66, bg: 'bg-red-900/50 border-red-700/40',        text: 'text-red-100',     accent: 'text-red-400'     },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function MobileControllerPage() {
  const { state, actions } = usePresenter();
  const { internalMessages } = state;

  // ── Toast de mensajes internos ───────────────────────────────────────────────
  const [msgToast,      setMsgToast]      = useState(null);
  const [showMessages,  setShowMessages]  = useState(false);
  const lastMsgId = useRef(null);
  useEffect(() => {
    if (!internalMessages?.length) return;
    const last = internalMessages[internalMessages.length - 1];
    if (last && last.id !== lastMsgId.current && !last.own) {
      lastMsgId.current = last.id;
      setMsgToast(last);
      // Sin auto-dismiss — el usuario lo cierra manualmente
    }
  }, [internalMessages]);
  const { liveState, connected, songs, schedule, reservasMode, stageConfig, eventPlays, eventPlaysContext } = state;
  const { slideData, nextSlideData, isBlank } = liveState;
  const navigate = useNavigate();

  // Solo redirigir a /app si es escritorio real (no táctil, pantalla grande)
  useEffect(() => {
    // Misma detección triple que ControllerPage
    const isPhone = (
      navigator.userAgentData?.mobile === true
      || /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || window.matchMedia('(pointer: coarse) and (max-width: 1279px)').matches
    );
    if (isPhone) return; // teléfono o tablet pequeña → permanecer en /mobile
    // Solo escritorio real (≥1280px de ancho Y ≥600px de alto): volver al controlador
    const mq = window.matchMedia('(min-width: 1280px) and (min-height: 600px)');
    if (mq.matches) { navigate('/app', { replace: true }); return; }
    const handler = (e) => { if (e.matches) navigate('/app', { replace: true }); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [navigate]);

  const [tab,              setTab]              = useState('live');

  // ── Paneles del acordeón ─────────────────────────────────────────────────
  const [openPanels, setOpenPanels] = useState(new Set([]));  // todos cerrados al inicio
  const togglePanel = (name) => setOpenPanels(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const [songDetail,       setSongDetail]       = useState(null);
  const [songOriginTab,    setSongOriginTab]    = useState('songs');
  const [songEditMode,     setSongEditMode]     = useState(false);
  const [songEditData,     setSongEditData]     = useState({});
  const [songEditSaving,   setSongEditSaving]   = useState(false);
  const [songEditError,    setSongEditError]    = useState('');
  const [activeSongSlideId,setActiveSongSlideId] = useState(null);
  const [loadingSong,      setLoadingSong]      = useState(false);
  const [songSearch,       setSongSearch]       = useState('');

  const [cfgIp,    setCfgIp]    = useState(getSavedIp);
  const [cfgPort,  setCfgPort]  = useState(getSavedPort);
  const [cfgSaved, setCfgSaved] = useState(false);

  const [flash,    setFlash]    = useState(null);
  const [liveView, setLiveView] = useState('control'); // 'control' | 'stage'
  const [stageTime, setStageTime] = useState(() => new Date());
  const [stageLastLabel, setStageLastLabel] = useState(null);
  const touchStart      = useRef(null);
  const songEditBodyRef  = useRef(null);
  const savedCursorPos   = useRef(null);
  const slideGridRef     = useRef(null);

  const insertChord = (chord) => {
    const ta  = songEditBodyRef.current;
    const scrollTop = ta?.scrollTop ?? 0;
    const pos = (ta && document.activeElement === ta)
      ? ta.selectionStart
      : (savedCursorPos.current ?? (songEditData.body || '').length);
    const ins     = `[${chord}]`;
    const body    = songEditData.body || '';
    const newBody = body.slice(0, pos) + ins + body.slice(pos);
    const newPos  = pos + ins.length;
    savedCursorPos.current = newPos;
    setSongEditData(p => ({ ...p, body: newBody }));
    requestAnimationFrame(() => {
      if (ta) { ta.focus({ preventScroll: true }); ta.scrollTop = scrollTop; ta.setSelectionRange(newPos, newPos); }
    });
  };

  // ── Eventos ──────────────────────────────────────────────────────────────
  const [events,          setEvents]          = useState([]);
  const [eventsLoading,   setEventsLoading]   = useState(false);
  const [eventDetail,     setEventDetail]     = useState(null);
  const [eventFormMode,   setEventFormMode]   = useState(null);   // null | 'create' | 'edit'
  const [eventFormData,   setEventFormData]   = useState({ title: '', date: '', time: '', description: '' });
  const [eventEditMode,   setEventEditMode]   = useState(false);  // editar playlist
  const [eventEditSongs,  setEventEditSongs]  = useState([]);
  const [eventSongPicker,    setEventSongPicker]    = useState(false);
  const [eventPickerQ,       setEventPickerQ]       = useState('');
  const [eventTemplatePicker,setEventTemplatePicker]= useState(false);
  const [eventTemplates,     setEventTemplates]     = useState([]);
  const [showEventSepForm,   setShowEventSepForm]   = useState(false);
  const [eventSepLabel,      setEventSepLabel]      = useState('');
  const [eventSaving,        setEventSaving]        = useState(false);
  const [confirmDeleteId,    setConfirmDeleteId]    = useState(null);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const today = new Date();
      // Desde el 1 del mes actual (no desde "hace 7 días") para no perder eventos del inicio del mes
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const end   = new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().split('T')[0];
      const res   = await fetch(`${getApiBase()}/api/events?start=${start}&end=${end}`);
      if (res.ok) setEvents(await res.json());
      else console.error('[Events] HTTP', res.status, await res.text().catch(() => ''));
    } catch (err) { console.error('[Events] fetch error:', err?.message || err); }
    finally { setEventsLoading(false); }
  }, []);

  const loadEventTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/event-templates`);
      if (res.ok) setEventTemplates(await res.json());
    } catch { /* noop */ }
  }, []);

  const apiBase = getApiBase;

  const authHeaders = () => {
    const token = localStorage.getItem('aio_sync_token');
    return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
  };

  const saveEventForm = async () => {
    if (!eventFormData.title || !eventFormData.date) return;
    setEventSaving(true);
    try {
      const isEdit = eventFormMode === 'edit';
      const url    = isEdit ? `${apiBase()}/api/events/${eventDetail.id}` : `${apiBase()}/api/events`;
      const body   = {
        ...eventFormData,
        is_recurring: false,
        songs: isEdit ? (eventDetail?.songs || []) : [],
        ...(isEdit && eventDetail?.occurrence_date ? { occurrence_date: eventDetail.occurrence_date } : {}),
      };
      const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      if (res.ok) {
        if (isEdit) setEventDetail(prev => ({ ...prev, ...eventFormData }));
        setEventFormMode(null);
        loadEvents();
      }
    } catch { /* noop */ }
    finally { setEventSaving(false); }
  };

  const deleteEventById = async (id) => {
    try {
      await fetch(`${apiBase()}/api/events/${id}`, { method: 'DELETE', headers: authHeaders() });
      setConfirmDeleteId(null);
      setEventDetail(null);
      loadEvents();
    } catch { /* noop */ }
  };

  const saveSongs = async () => {
    setEventSaving(true);
    try {
      const dateStr = String(eventDetail.occurrence_date || eventDetail.date).split('T')[0];
      const res = await fetch(`${apiBase()}/api/events/${eventDetail.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          title: eventDetail.title,
          date: dateStr,
          time: eventDetail.time || null,
          description: eventDetail.description || null,
          is_recurring: eventDetail.is_recurring || false,
          songs: eventEditSongs,
          ...(eventDetail.occurrence_date ? { occurrence_date: eventDetail.occurrence_date } : {}),
        }),
      });
      if (res.ok) {
        setEventDetail(prev => ({ ...prev, songs: eventEditSongs }));
        setEventEditMode(false);
        loadEvents();
        actions.setSchedule(eventEditSongs); // actualizar schedule en tiempo real
      }
    } catch { /* noop */ }
    finally { setEventSaving(false); }
  };

  // ── Biblia ───────────────────────────────────────────────────────────────
  const [bibleVersions, setBibleVersions]     = useState([]);
  const [bibleVersion,  setBibleVersion]       = useState(null); // {id, name}
  const [bibleBooks,    setBibleBooks]         = useState([]);
  const [bibleBook,     setBibleBook]          = useState(null); // {id, name, abbrev}
  const [bibleChapters, setBibleChapters]      = useState([]);
  const [bibleChapter,  setBibleChapter]       = useState(null);
  const [bibleVerses,   setBibleVerses]        = useState([]);
  const [bibleSearch,   setBibleSearch]        = useState('');
  const [bibleResults,  setBibleResults]       = useState([]);
  const [bibleSearching,setBibleSearching]     = useState(false);
  const [bibleMode,     setBibleMode]          = useState('nav'); // 'nav' | 'search'
  const [activeVerse,   setActiveVerse]        = useState(null);  // verso proyectado actualmente
  const [activeSplit,   setActiveSplit]         = useState(null);  // { verse, part2, list } cuando se divide un verso largo
  const [verseHistory,  setVerseHistory]        = useState([]);    // historial de versículos proyectados
  const bibleSearchTimer = useRef(null);

  const loadBibleVersions = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/bible/versions`);
      if (res.ok) {
        const v = await res.json();
        setBibleVersions(v);
        if (v.length) {
          const rv1960 = v.find(b => /rv.?1960|reina.?valera.*1960/i.test(b.name)) || v[0];
          setBibleVersion(rv1960);
        }
      }
    } catch { /* sin conexión */ }
  }, []);

  const loadBibleBooks = useCallback(async (versionId) => {
    try {
      const res = await fetch(`${getApiBase()}/api/bible/${versionId}/books`);
      if (res.ok) setBibleBooks(await res.json());
    } catch { /* sin conexión */ }
  }, []);

  const loadBibleChapters = useCallback(async (versionId, bookId) => {
    try {
      const res = await fetch(`${getApiBase()}/api/bible/${versionId}/books/${bookId}/chapters`);
      if (res.ok) setBibleChapters(await res.json());
    } catch { /* sin conexión */ }
  }, []);

  const loadBibleVerses = useCallback(async (versionId, bookId, chapter) => {
    try {
      const res = await fetch(`${getApiBase()}/api/bible/${versionId}/books/${bookId}/chapters/${chapter}`);
      if (res.ok) setBibleVerses(await res.json());
    } catch { /* sin conexión */ }
  }, []);

  const searchBible = useCallback(async (q, versionId) => {
    if (!q.trim() || !versionId) { setBibleResults([]); return; }
    setBibleSearching(true);
    try {
      const res = await fetch(`${getApiBase()}/api/bible/search?q=${encodeURIComponent(q)}&versionId=${versionId}`);
      if (res.ok) setBibleResults(await res.json());
    } catch { /* sin conexión */ }
    finally { setBibleSearching(false); }
  }, []);

  const makeVerseSD = (text, ref, version) => ({ type: 'bible', text, reference: ref, version });

  const sendVerse = (verse, list = []) => {
    setActiveVerse(verse);
    const ref  = `${verse.book_name} ${verse.chapter}:${verse.verse}`;
    // Registrar en historial (mueve al tope si ya existe)
    setVerseHistory(prev => {
      const entry = { ...verse, ref, ts: Date.now() };
      return [entry, ...prev.filter(h => h.id !== verse.id)].slice(0, 60);
    });
    const i    = list.findIndex(v => v.id === verse.id);
    const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    const nextSD = next ? makeVerseSD(next.text, `${next.book_name} ${next.chapter}:${next.verse}`, next.version) : null;
    const parts = splitBibleVerse(verse.text || '');
    if (parts) {
      const [p1, p2] = parts;
      setActiveSplit({ verse, part2: p2, list });
      actions.showSlide({
        type: 'bible',
        slideData:     makeVerseSD(p1, ref, verse.version),
        nextSlideData: makeVerseSD(p2, ref, verse.version),
      });
    } else {
      setActiveSplit(null);
      actions.showSlide({
        type: 'bible',
        slideData:     makeVerseSD(verse.text, ref, verse.version),
        nextSlideData: nextSD,
      });
    }
  };

  useEffect(() => { document.title = 'AIO Remote'; }, []);

  // Reloj para la vista escenario
  useEffect(() => {
    const id = setInterval(() => setStageTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pantalla completa al entrar/salir de vista escenario
  useEffect(() => {
    if (liveView === 'stage') {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [liveView]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && liveView === 'stage') setLiveView('control');
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [liveView]);

  // Cargar eventos al abrir esa tab
  // Cargar eventos al abrir el panel acordeón
  useEffect(() => { if (openPanels.has('eventos')) loadEvents(); }, [openPanels, loadEvents]);

  // Cargar plays al abrir detalle de evento
  useEffect(() => {
    if (eventDetail) {
      const occDate = eventDetail.is_recurring
        ? String(eventDetail.occurrence_date || eventDetail.date).split('T')[0]
        : null;
      actions.loadPlays(eventDetail.id, occDate);
    }
  }, [eventDetail?.id]); // eslint-disable-line

  // Publicar el schedule al contexto global cuando se abre/cierra un evento desde móvil
  // (necesario para que StagePage pueda mostrar la siguiente canción del listado)
  useEffect(() => {
    actions.setSchedule(eventDetail ? (eventDetail.songs ?? []) : []);
  }, [eventDetail?.id, eventDetail?.songs?.length]); // eslint-disable-line

  // Sincronizar diapo activa cuando el servidor navega (flechas prev/next)
  useEffect(() => {
    if (slideData?.type === 'song' && slideData.slideId) {
      setActiveSongSlideId(slideData.slideId);
    }
  }, [slideData]);

  // Auto-scroll a la diapo activa cuando cambia (centrada dentro del panel)
  useEffect(() => {
    if (!activeSongSlideId || !slideGridRef.current) return;
    const container = slideGridRef.current;
    const el = container.querySelector(`[data-slide-id="${activeSongSlideId}"]`);
    if (!el) return;
    const containerTop    = container.getBoundingClientRect().top;
    const elTop           = el.getBoundingClientRect().top;
    const elOffsetInCont  = elTop - containerTop + container.scrollTop;
    const targetScroll    = elOffsetInCont - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [activeSongSlideId]);

  // Cargar versiones de Biblia al abrir el panel acordeón
  useEffect(() => { if (openPanels.has('biblia') && !bibleVersions.length) loadBibleVersions(); }, [openPanels, bibleVersions.length, loadBibleVersions]);

  // Cargar libros al seleccionar versión
  useEffect(() => { if (bibleVersion) loadBibleBooks(bibleVersion.id); }, [bibleVersion, loadBibleBooks]);

  // Cargar capítulos al seleccionar libro
  useEffect(() => {
    if (bibleVersion && bibleBook) loadBibleChapters(bibleVersion.id, bibleBook.id);
  }, [bibleVersion, bibleBook, loadBibleChapters]);

  // Cargar versículos al seleccionar capítulo
  useEffect(() => {
    if (bibleVersion && bibleBook && bibleChapter) loadBibleVerses(bibleVersion.id, bibleBook.id, bibleChapter);
  }, [bibleVersion, bibleBook, bibleChapter, loadBibleVerses]);

  // Búsqueda bíblica con debounce
  useEffect(() => {
    clearTimeout(bibleSearchTimer.current);
    bibleSearchTimer.current = setTimeout(() => {
      searchBible(bibleSearch, bibleVersion?.id);
    }, 400);
    return () => clearTimeout(bibleSearchTimer.current);
  }, [bibleSearch, bibleVersion, searchBible]);

  // ── Navegación ──────────────────────────────────────────────────────────
  const trigger = (fn, dir) => { fn(); setFlash(dir); setTimeout(() => setFlash(null), 200); };
  const handlePrev  = () => trigger(() => actions.navigate('prev'), 'prev');
  const handleNext  = () => trigger(() => actions.navigate('next'), 'next');

  const handleBlank = () => trigger(() => actions.toggleBlank(!isBlank), 'blank');

  // Swipe + tap: tap izquierdo = anterior, tap derecho = siguiente
  const onTouchStart = (e) => {
    if (tab !== 'live') return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 60) {
      // Swipe horizontal
      dx < 0 ? handleNext() : handlePrev();
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      // Tap — ignorar si el toque fue sobre un elemento interactivo
      const el = e.target;
      if (!el.closest('button, input, select, textarea, a, [role="button"], label')) {
        e.changedTouches[0].clientX > window.innerWidth / 2 ? handleNext() : handlePrev();
      }
    }
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
    setActiveSongSlideId(slide.id);
    actions.selectSlide(slide);
    actions.showSlide({
      type:       'song',
      slides,            // el servidor los guarda para poder navegar
      slideIndex: idx,
      slideData:     { type: 'song', songId: song.id, slideId: slide.id, songTitle: song.title, label: slide.label, content: slide.content },
      nextSlideData: next ? { type: 'song', label: next.label, content: next.content } : null,
    });
  };

  // ── Ajustes ──────────────────────────────────────────────────────────────
  const saveSettings = () => {
    localStorage.setItem('aio_server_ip',   cfgIp.trim());
    localStorage.setItem('aio_server_port', cfgPort.trim());
    setCfgSaved(true);
    setTimeout(() => window.location.reload(), 600);
  };

  // Auto-abrir panel Grid cuando se selecciona una canción
  useEffect(() => {
    if (songDetail) {
      setOpenPanels(prev => new Set([...prev, 'grid']));
    }
  }, [songDetail?.id]);

  // ── Datos del slide actual ────────────────────────────────────────────────
  const slideText      = slideData && (slideData.type === 'song' ? stripChords(stripComments(slideData.content)) : slideData.text);
  const slideLabel     = slideData && (slideData.type === 'song' ? slideData.label : slideData.reference);
  const slideSongTitle = slideData?.songTitle;
  const nextText       = nextSlideData && (nextSlideData.type === 'song' ? stripChords(stripComments(nextSlideData.content)) : nextSlideData.text);
  const nextLabel      = nextSlideData && (nextSlideData.type === 'song' ? nextSlideData.label : nextSlideData.reference);

  // Persistir la última etiqueta de sección para la vista escenario
  useEffect(() => {
    if (slideLabel) setStageLastLabel(slideLabel);
    if (!slideData) setStageLastLabel(null);
  }, [slideLabel, slideData]);

  // ── Stage view: valores computados ────────────────────────────────────────
  const sc = stageConfig ?? {};
  const stageEffectiveLabel = slideLabel || stageLastLabel;
  const stageSectionColor   = stageEffectiveLabel ? getLabelColor(stageEffectiveLabel) : 'transparent';

  // Próxima canción en el programa (misma lógica que StagePage)
  const stageNextSong = (() => {
    if (!schedule?.length) return null;
    const currentSongId = slideData?.songId;
    if (reservasMode) {
      // Buscar primera canción no tocada tras la actual en la lista
      let foundCurrent = false;
      for (const it of schedule) {
        if (it.item_type === 'separator' || !it.song_id) continue;
        if (it.song_id === currentSongId) { foundCurrent = true; continue; }
        if (foundCurrent && !eventPlays?.has(it.song_id)) return it;
      }
      return null;
    }
    for (const it of schedule) {
      if (it.item_type === 'separator' || !it.song_id) continue;
      if (it.song_id === currentSongId) continue;
      if (eventPlays?.has(it.song_id)) continue;
      return it;
    }
    return null;
  })();

  const filteredSongs = (songs || []).filter(s => {
    const q = norm(songSearch);
    return norm(s.title).includes(q) || norm(s.artist).includes(q);
  });

  return (
    <div
      className="h-[100dvh] bg-surface-900 flex flex-col select-none overflow-hidden mobile-controller-root"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Drawer: MessagesPanel ── */}
      {showMessages && (
        <div className="fixed inset-0 z-[9998] flex flex-col bg-surface-900">
          <div className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-surface-700 shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-accent" />
              <span className="text-sm font-semibold text-zinc-100">Mensajes</span>
            </div>
            <button onClick={() => setShowMessages(false)} className="text-zinc-400 hover:text-white p-1">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <MessagesPanel />
          </div>
        </div>
      )}
      {/* ── Toast: mensaje interno ── */}
      {msgToast && (
        <div className="fixed top-3 left-3 right-3 z-[9999] flex items-start gap-3 bg-zinc-800 border border-accent/40 rounded-2xl px-4 py-3 shadow-xl">
          <MessageSquare size={20} className="text-accent shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-accent truncate">{msgToast.from}</p>
            <p className="text-base text-white/90 leading-snug mt-0.5">{msgToast.text}</p>
          </div>
          <button className="text-zinc-400 hover:text-white shrink-0 p-1" onClick={() => setMsgToast(null)}><X size={18} /></button>
        </div>
      )}
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-3 xs:px-4 py-2 xs:py-3 bg-surface-800 border-b border-surface-700 shrink-0">
        {songDetail ? (
          songEditMode ? (
            <button onClick={() => { setSongEditMode(false); setSongEditError(''); }} className="flex items-center gap-1.5 text-zinc-300">
              <ArrowLeft size={16} />
              <span className="text-sm font-medium">Canción</span>
            </button>
          ) : (
            <button onClick={() => { setSongDetail(null); setActiveSongSlideId(null); setSongEditMode(false); setSongOriginTab('songs'); }} className="flex items-center gap-1.5 text-zinc-300">
              <ArrowLeft size={16} />
              <span className="text-sm font-medium">{songOriginTab === 'events' ? 'Setlist' : 'Canciones'}</span>
            </button>
          )
        ) : eventFormMode ? (
          <button onClick={() => setEventFormMode(null)} className="flex items-center gap-1.5 text-zinc-400">
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Eventos</span>
          </button>
        ) : (
          <span className="text-accent font-bold text-base tracking-tight">AIO Presenter</span>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          {songDetail && songEditMode ? (
            <button
              onClick={async () => {
                if (!songEditData.title?.trim()) { setSongEditError('El título es requerido'); return; }
                setSongEditSaving(true); setSongEditError('');
                try {
                  const slides = textToSlides(songEditData.body).map((s, i) => ({
                    ...s,
                    slideBackground: songDetail.slides?.[i]?.slide_background ?? null,
                  }));
                  await actions.updateSong(songDetail.id, {
                    title:    songEditData.title.trim(),
                    author:   songEditData.author || null,
                    song_key: songEditData.songKey || null,
                    bpm:      songEditData.bpm !== '' ? songEditData.bpm : null,
                    time_sig: songEditData.timeSig || null,
                    link:     songEditData.link || null,
                    slides,
                  });
                  const refreshed = await actions.loadSongDetail(songDetail.id);
                  if (refreshed) setSongDetail(refreshed);
                  await actions.reloadSongs();
                  setSongEditMode(false);
                } catch (err) {
                  setSongEditError(err?.response?.data?.error || err?.message || 'Error al guardar');
                } finally { setSongEditSaving(false); }
              }}
              disabled={songEditSaving}
              className="flex items-center gap-1 text-accent text-sm font-semibold disabled:opacity-40"
            >
              <Check size={15} /> {songEditSaving ? 'Guardando…' : 'Guardar'}
            </button>
          ) : (
            <>
              <Link
                to="/output"
                className="flex items-center gap-1 text-zinc-400 text-xs mr-1"
                title="Ver pantalla de salida"
              >
                <MonitorPlay size={14} />
                <span className="hidden xs:inline">Pantalla</span>
              </Link>
              <button
                onClick={() => navigate('/cancionero')}
                title="Ir al Modo Cancionero"
                className="flex items-center gap-1 text-zinc-400 text-xs mr-1 hover:text-yellow-400 transition-colors"
              >
                <Music2 size={14} />
                <span className="hidden xs:inline">Cancionero</span>
              </button>
              {connected
                ? <><Wifi size={13} className="text-green-400" /><span className="text-green-400">Conectado</span></>
                : <><WifiOff size={13} className="text-red-400" /><span className="text-red-400">Sin conexión</span></>
              }
              <button
                onClick={() => window.location.reload()}
                title="Recargar aplicación"
                className="text-zinc-400 hover:text-accent transition-colors p-1"
              >
                <RefreshCw size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Paneles colapsables ── */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-surface-700/60">

        {/* ──── PANEL: NAVBAR ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('navbar')}
          >
            <div className="flex items-center gap-2.5">
              <Music2 size={15} className={openPanels.has('navbar') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('navbar') ? 'text-zinc-100' : 'text-zinc-400'}`}>Navegación</span>
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('navbar') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('navbar') && (
            <div className="px-4 py-3 flex flex-col gap-2 bg-surface-900/40">
              {/* Mensajes */}
              <button onClick={() => { setShowMessages(true); togglePanel('navbar'); }} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-zinc-300 text-sm font-medium transition-colors active:scale-95 text-left w-full">
                <MessageSquare size={16} className="text-accent" /> Mensajes
              </button>
              {/* Calendario */}
              <button onClick={() => navigate('/calendar')} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-800 hover:bg-surface-700 text-zinc-300 text-sm font-medium transition-colors active:scale-95 text-left w-full">
                <CalendarDays size={16} className="text-zinc-400" /> Calendario
              </button>
              {/* OrgSwitcher — solo si hay más de 1 org (el componente se oculta solo si hay 1) */}
              <div className="px-1 py-1">
                <OrgSwitcher variant="presenter" />
              </div>
            </div>
          )}
        </div>

        {/* ──── PANEL: SALIDAS ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('salidas')}
          >
            <div className="flex items-center gap-2.5">
              <Radio size={15} className={openPanels.has('salidas') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('salidas') ? 'text-zinc-100' : 'text-zinc-400'}`}>Salidas</span>
              {slideData && !isBlank && <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />}
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('salidas') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('salidas') && (
            <div className="overflow-y-auto max-h-[60vh]">
              {/* Stage view (fullscreen overlay, sigue siendo fixed) */}
              {liveView === 'stage' && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Barra superior: volver + franja color + título + tonalidad + etiqueta */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.6)' }}>
                    <button
                      onClick={() => setLiveView('control')}
                      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', color: 'rgba(255,255,255,0.5)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <ChevronLeft size={16} />
                      <span>Volver</span>
                    </button>
                    {stageEffectiveLabel && (
                      <div style={{ width: 3, flexShrink: 0, background: stageSectionColor }} />
                    )}
                    <div style={{ flex: 1, padding: '8px 10px', minWidth: 0 }}>
                      {slideSongTitle ? (
                        <p style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {slideSongTitle}{slideData?.songKey ? ` — ${slideData.songKey}` : ''}
                        </p>
                      ) : (
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: 0 }}>Sin contenido</p>
                      )}
                      {stageEffectiveLabel && (
                        <p style={{ color: stageSectionColor, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '2px 0 0', fontWeight: 600 }}>
                          {stageEffectiveLabel}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Área 50/50: slide actual (arriba) + siguiente (abajo) */}
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      {isBlank ? (
                        <p style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', fontSize: 15 }}>Pantalla en negro</p>
                      ) : !slideData ? (
                        <p style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', fontSize: 15 }}>Sin contenido activo</p>
                      ) : slideData.type !== 'song' ? (
                        <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'pre-line', textAlign: 'center', margin: 0 }}>
                          {slideText}
                        </p>
                      ) : (
                        <StageMobileSlide
                          content={slideData.content}
                          chordsColor={sc.chordsColor || '#fde047'}
                          lyricsColor={sc.lyricsColor || '#ffffff'}
                          showComments={sc.showComments ?? false}
                          commentColor={sc.commentColor || '#facc15'}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(255,255,255,0.03)', opacity: isBlank ? 0.3 : 1 }}>
                      {nextSlideData && !isBlank ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'stretch', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {nextSlideData.label && (
                              <div style={{ width: 3, flexShrink: 0, background: `${getLabelColor(nextSlideData.label)}70` }} />
                            )}
                            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, padding: '4px 10px', fontWeight: 600 }}>
                              {nextSlideData.label ? `↓ ${nextSlideData.label}` : '↓ Siguiente'}
                            </p>
                          </div>
                          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 16px', overflow: 'hidden' }}>
                            {nextSlideData.type !== 'song' ? (
                              <p style={{ color: '#fde047', fontSize: 19, margin: 0, whiteSpace: 'pre-line', textAlign: 'center', fontWeight: 600 }}>{nextText}</p>
                            ) : (
                              <StageMobileSlide
                                content={nextSlideData.content}
                                chordsColor={sc.chordsColor || '#fde047'}
                                lyricsColor='#fde047'
                                showComments={false}
                                commentColor='#facc15'
                              />
                            )}
                          </div>
                        </div>
                      ) : stageNextSong ? (
                        <div style={{ textAlign: 'center', padding: '16px' }}>
                          <p style={{ color: 'rgba(34,197,94,0.55)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px', fontWeight: 600 }}>Próxima canción</p>
                          <p style={{ color: '#22c55e', fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                            {stageNextSong.title}{stageNextSong.song_key ? ` — ${stageNextSong.song_key}` : ''}
                          </p>
                          {stageNextSong.author && (
                            <p style={{ color: 'rgba(34,197,94,0.45)', fontSize: 12, margin: '5px 0 0' }}>{stageNextSong.author}</p>
                          )}
                        </div>
                      ) : (
                        <p style={{ color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', fontSize: 14 }}>— fin —</p>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.5)', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {stageNextSong ? (
                        <p style={{ color: '#22c55e', fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ↑ {stageNextSong.title}{stageNextSong.song_key ? ` — ${stageNextSong.song_key}` : ''}
                        </p>
                      ) : (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>—</span>
                      )}
                    </div>
                    <p style={{ flexShrink: 0, color: sc.clockColor || '#ef4444', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, margin: 0, letterSpacing: '0.05em' }}>
                      {stageTime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </p>
                  </div>
                </div>
              )}

              {/* Vista compacta del estado actual */}
              <div className="px-4 py-3">
                {isBlank ? (
                  <p className="text-zinc-500 italic text-sm">Pantalla en negro</p>
                ) : !slideData ? (
                  <p className="text-zinc-500 italic text-sm">Sin contenido activo</p>
                ) : (
                  <div>
                    {slideLabel && <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{slideLabel}</p>}
                    <p className="text-white text-base leading-relaxed whitespace-pre-line">{slideText}</p>
                    {slideSongTitle && <p className="text-zinc-500 text-xs mt-2">{slideSongTitle}</p>}
                  </div>
                )}
                {nextSlideData && !isBlank && (
                  <div className="mt-3 px-3 py-2 bg-surface-800 rounded-xl border border-surface-700">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Siguiente</p>
                    {nextLabel && <p className="text-[11px] text-zinc-400 mb-0.5">{nextLabel}</p>}
                    <p className="text-zinc-300 text-sm whitespace-pre-line line-clamp-2">{nextText}</p>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="px-4 pb-3 flex flex-col gap-2">
                {/* Ver pantalla de salida */}
                <Link
                  to="/output"
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-zinc-300 text-sm font-medium active:bg-surface-700 transition-colors"
                >
                  <MonitorPlay size={16} /> Ver pantalla de salida
                </Link>

                {/* Vista escenario */}
                <button
                  onPointerDown={() => setLiveView('stage')}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-surface-600 bg-surface-800 text-zinc-300 text-sm font-medium active:bg-surface-700 transition-colors"
                >
                  <Radio size={16} /> Vista escenario
                </button>

                {/* Marcar como tocada */}
                {slideData?.type === 'song' && slideData?.songId && eventPlaysContext && (
                  <button
                    onClick={async () => {
                      const id = slideData.songId;
                      if (eventPlays?.has(id)) {
                        await actions.unmarkPlayed(eventPlaysContext.eventId, eventPlaysContext.occurrenceDate, id);
                      } else {
                        await actions.markPlayed(eventPlaysContext.eventId, eventPlaysContext.occurrenceDate, id, 0, 0, true);
                      }
                    }}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all active:scale-95 ${
                      eventPlays?.has(slideData.songId)
                        ? 'bg-green-950/60 border-green-500 text-green-400'
                        : 'bg-surface-800 border-surface-600 text-zinc-400'
                    }`}
                  >
                    {eventPlays?.has(slideData.songId)
                      ? <><CheckCircle2 size={16} /> Tocada</>
                      : <><Circle size={16} /> Marcar como tocada</>
                    }
                  </button>
                )}

                {/* Reservas */}
                {(() => {
                  const normLabel = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                  const hasReservas = (schedule || []).some(s => s.item_type === 'separator' && normLabel(s.separator_label).includes('reserva'));
                  if (!hasReservas) return null;
                  return (
                    <button
                      onPointerDown={() => actions.setReservasMode(!reservasMode)}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all active:scale-95 ${
                        reservasMode
                          ? 'bg-amber-950/60 border-amber-500 text-amber-400'
                          : 'bg-surface-800 border-surface-600 text-zinc-400'
                      }`}
                    >
                      <SkipForward size={16} />
                      {reservasMode ? 'Desactivar reservas' : 'Ir a reservas'}
                    </button>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ──── PANEL: GRID (diapositivas de la canción) ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('grid')}
          >
            <div className="flex items-center gap-2.5">
              <LayoutTemplate size={15} className={openPanels.has('grid') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('grid') ? 'text-zinc-100' : 'text-zinc-400'}`}>Grid</span>
              {songDetail && <span className="text-xs text-zinc-500 font-normal truncate ml-1">{songDetail.title}</span>}
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('grid') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('grid') && (
            <div ref={slideGridRef} className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {!songDetail ? (
                <p className="text-zinc-500 text-sm p-4 text-center italic">Selecciona una canción para ver sus diapositivas</p>
              ) : (
                <div className="px-4 py-3 space-y-2">
                  {(songDetail.titleEnabled ?? true) && (
                    <div
                      onClick={() => sendSlide(songDetail, { type: 'title' }, songDetail.slides, -1)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer active:scale-95 transition-all ${
                        false
                          ? 'bg-accent/15 border-accent text-accent'
                          : 'bg-surface-800 border-surface-700 text-zinc-300'
                      }`}
                    >
                      <span className="text-xs font-bold text-zinc-500 w-5 text-center">T</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{songDetail.title}</p>
                        {songDetail.author && <p className="text-xs text-zinc-500 truncate">{songDetail.author}</p>}
                      </div>
                    </div>
                  )}
                  {(songDetail.slides || []).map((slide, idx) => {
                    const labelColor = getLabelColor(slide.label);
                    const isActive   = activeSongSlideId === slide.id;
                    return (
                      <div
                        key={idx}
                        data-slide-id={slide.id}
                        onClick={() => sendSlide(songDetail, slide, songDetail.slides, idx)}
                        className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border cursor-pointer active:scale-95 transition-all ${
                          isActive ? 'bg-accent/15 border-accent' : 'bg-surface-800 border-surface-700'
                        }`}
                      >
                        <span className="text-xs text-zinc-600 w-5 text-center pt-0.5 shrink-0">{idx + 1}</span>
                        {slide.label && (
                          <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none" style={{ background: `${labelColor}22`, color: labelColor, border: `1px solid ${labelColor}40` }}>
                            {slide.label}
                          </span>
                        )}
                        <p className="flex-1 text-zinc-300 leading-relaxed whitespace-pre-line line-clamp-3"
                          style={{ fontSize: 'clamp(0.85rem, 3.5vw, 1rem)' }}>
                          {stripChords(stripComments(slide.content || ''))}
                        </p>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ──── PANEL: CANCIONES ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('canciones')}
          >
            <div className="flex items-center gap-2.5">
              <Music size={15} className={openPanels.has('canciones') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('canciones') ? 'text-zinc-100' : 'text-zinc-400'}`}>Canciones</span>
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('canciones') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('canciones') && (
            <div className="overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {/* ── Búsqueda — siempre visible salvo en modo edición ── */}
              {!songEditMode && (
                <div className="px-4 pt-3 pb-2 border-b border-surface-700/40">
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
              )}
              {/* ── Lista de canciones ── */}
              {(!songDetail || songSearch) && !songEditMode && (
                <div className="px-4 pb-4 pt-3 space-y-1.5">
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
              )}
              {/* ── Detalle de la canción seleccionada ── */}
              {songDetail && !songSearch && (
                <div className="flex flex-col">
            {!songEditMode ? (
              /* ── Vista de slides (modo lectura) ── */
              <>
                <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-zinc-200 font-semibold">{songDetail.title}</p>
                    {songDetail.artist && <p className="text-zinc-500 text-xs mt-0.5">{songDetail.artist}</p>}
                  </div>
                  <button
                    onClick={() => {
                      setSongEditData({
                        title:   songDetail.title   || '',
                        author:  songDetail.artist  || '',
                        songKey: songDetail.song_key|| '',
                        bpm:     songDetail.bpm     ?? '',
                        timeSig: songDetail.time_sig|| '',
                        link:    songDetail.link    || '',
                        body:    slidesToText(songDetail.slides),
                      });
                      setSongEditError('');
                      setSongEditMode(true);
                    }}
                    className="shrink-0 p-1.5 rounded-lg text-zinc-400 active:bg-surface-700 transition-colors"
                    title="Editar canción"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-2">
                  {(songDetail.slides || []).map(slide => (
                    <button
                      key={slide.id}
                      data-slide-id={slide.id}
                      onClick={() => sendSlide(songDetail, slide, songDetail.slides)}
                      className={`w-full text-left px-4 py-5 rounded-xl border-2 transition-colors ${
                        activeSongSlideId === slide.id
                          ? 'bg-accent/10 border-accent shadow-[0_0_0_1px_var(--accent)]'
                          : 'bg-surface-800 active:bg-surface-700 border-surface-700'
                      }`}
                    >
                      {slide.label && (
                        <span className={`inline-block text-[10px] font-semibold rounded px-1.5 py-0.5 mb-2 border ${
                          activeSongSlideId === slide.id
                            ? 'text-accent bg-accent/20 border-accent/50'
                            : 'text-accent bg-accent/10 border-accent/30'
                        }`}>
                          {slide.label}
                        </span>
                      )}
                      <MobileSlideContent content={slide.content} />
                    </button>
                  ))}
                </div>
                {/* Barra de controles: anterior / ocultar / siguiente */}
                <div className="shrink-0 px-4 pb-3 pt-2 grid grid-cols-3 gap-2 border-t border-surface-700">
                  <NavBtn flash={flash === 'prev'} onPointerDown={handlePrev}>
                    <ChevronLeft size={26} /><span className="text-xs font-medium">Anterior</span>
                  </NavBtn>
                  <button
                    onPointerDown={handleBlank}
                    className={`flex flex-col items-center justify-center gap-1 py-4 rounded-2xl border-2 transition-all active:scale-95 ${
                      isBlank ? 'bg-red-950/60 border-red-500 text-red-400'
                      : flash === 'blank' ? 'bg-zinc-700 border-zinc-400 text-white'
                      : 'bg-surface-800 border-surface-600 text-zinc-300'
                    }`}
                  >
                    {isBlank ? <Eye size={22} /> : <EyeOff size={22} />}
                    <span className="text-xs font-medium">{isBlank ? 'Mostrar' : 'Negro'}</span>
                  </button>
                  <NavBtn flash={flash === 'next'} onPointerDown={handleNext}>
                    <ChevronRight size={26} /><span className="text-xs font-medium">Siguiente</span>
                  </NavBtn>
                </div>
              </>
            ) : (
              /* ── Formulario de edición ── */
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {songEditError ? (
                  <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded-xl px-3 py-2">{songEditError}</p>
                ) : null}
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block">Título *</label>
                  <input
                    value={songEditData.title}
                    onChange={e => setSongEditData(p => ({ ...p, title: e.target.value }))}
                    className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-accent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 text-xs mb-1.5 block">Artista</label>
                    <input
                      value={songEditData.author}
                      onChange={e => setSongEditData(p => ({ ...p, author: e.target.value }))}
                      className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs mb-1.5 block">Tonalidad</label>
                    <input
                      value={songEditData.songKey}
                      onChange={e => setSongEditData(p => ({ ...p, songKey: e.target.value }))}
                      placeholder="Ej: C, G#m…"
                      className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                    />
                  </div>
                </div>
                {/* Paleta de acordes */}
                {(() => {
                  const groups = buildScaleChords(songEditData.songKey);
                  if (!groups) return null;
                  return (
                    <div>
                      <p className="text-zinc-400 text-xs mb-1.5">
                        Acordes — <span className="text-accent font-semibold">{songEditData.songKey}</span>
                        <span className="text-zinc-600 ml-1.5">Toca para insertar donde está el cursor</span>
                      </p>
                      <div className="bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
                        {groups.map(group => (
                          <div key={group.label} className="px-3 pt-2 pb-2.5 border-b border-surface-700/50 last:border-b-0">
                            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">{group.label}</p>
                            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                              {group.chords.map(chord => (
                                <button
                                  key={chord}
                                  type="button"
                                  onPointerDown={e => e.preventDefault()}
                                  onClick={() => insertChord(chord)}
                                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-surface-700 active:bg-accent/30 border border-surface-600 active:border-accent/50 text-zinc-200 text-xs font-mono font-medium transition-colors"
                                >
                                  {chord}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block">
                    Letras
                    <span className="ml-1.5 text-zinc-600 normal-case">
                      &#8202;&#8202;use &#123;Coro&#125;, &#123;Verso&#125;… para etiquetar secciones
                    </span>
                  </label>
                  <textarea
                    ref={songEditBodyRef}
                    value={songEditData.body}
                    onChange={e => setSongEditData(p => ({ ...p, body: e.target.value }))}
                    onBlur={() => { savedCursorPos.current = songEditBodyRef.current?.selectionStart ?? null; }}
                    onSelect={() => { savedCursorPos.current = songEditBodyRef.current?.selectionStart ?? null; }}
                    rows={20}
                    spellCheck={false}
                    className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent resize-none font-mono leading-relaxed"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-zinc-400 text-xs mb-1.5 block">BPM</label>
                    <input
                      type="number"
                      value={songEditData.bpm}
                      onChange={e => setSongEditData(p => ({ ...p, bpm: e.target.value }))}
                      className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs mb-1.5 block">Compás</label>
                    <input
                      value={songEditData.timeSig}
                      onChange={e => setSongEditData(p => ({ ...p, timeSig: e.target.value }))}
                      placeholder="4/4"
                      className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs mb-1.5 block">Link</label>
                    <input
                      value={songEditData.link}
                      onChange={e => setSongEditData(p => ({ ...p, link: e.target.value }))}
                      placeholder="https://…"
                      className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <div className="h-4" />
              </div>
            )}
          </div>
              )}
              </div>
          )}
        </div>

        {/* ──── PANEL: EVENTOS ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('eventos')}
          >
            <div className="flex items-center gap-2.5">
              <CalendarDays size={15} className={openPanels.has('eventos') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('eventos') ? 'text-zinc-100' : 'text-zinc-400'}`}>Eventos</span>
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('eventos') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('eventos') && (
            <div className="overflow-y-auto" style={{ maxHeight: '65vh' }}>
        {/* ──── EVENTOS: formulario crear/editar ──── */}
        {eventFormMode && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-300">
                {eventFormMode === 'create' ? 'Nuevo evento' : 'Editar evento'}
              </p>
              <button
                onClick={saveEventForm}
                disabled={!eventFormData.title || !eventFormData.date || eventSaving}
                className="flex items-center gap-1.5 text-sm font-semibold text-accent disabled:opacity-40"
              >
                <Check size={16} /> {eventSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Título *</label>
                <input
                  value={eventFormData.title}
                  onChange={e => setEventFormData(p => ({ ...p, title: e.target.value }))}
                  placeholder="Nombre del evento"
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Fecha *</label>
                <input
                  type="date"
                  value={eventFormData.date}
                  onChange={e => setEventFormData(p => ({ ...p, date: e.target.value }))}
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Hora</label>
                <input
                  type="time"
                  value={eventFormData.time}
                  onChange={e => setEventFormData(p => ({ ...p, time: e.target.value }))}
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Descripción</label>
                <textarea
                  value={eventFormData.description}
                  onChange={e => setEventFormData(p => ({ ...p, description: e.target.value }))}
                  placeholder="Notas opcionales…"
                  rows={3}
                  className="w-full bg-surface-800 border border-surface-600 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ──── EVENTOS: lista ──── */}
        {!eventFormMode && !eventDetail && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700 flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Próximos eventos</p>
              <div className="flex items-center gap-2">
                <button onPointerDown={loadEvents} className="text-zinc-500 text-xs">Actualizar</button>
                <button
                  onPointerDown={() => {
                    const today = new Date().toISOString().split('T')[0];
                    setEventFormData({ title: '', date: today, time: '', description: '' });
                    setEventFormMode('create');
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs font-semibold"
                >
                  <Plus size={13} /> Nuevo
                </button>
              </div>
            </div>
            {confirmDeleteId && (
              <div className="mx-4 mt-3 p-3 bg-red-950/50 border border-red-700/50 rounded-xl flex items-center gap-2">
                <p className="flex-1 text-sm text-red-300">¿Eliminar este evento?</p>
                <button onClick={() => deleteEventById(confirmDeleteId)} className="text-xs font-bold text-red-400 px-2 py-1 rounded bg-red-900/50">Sí, borrar</button>
                <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-zinc-400 px-2 py-1">Cancelar</button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-2">
              {eventsLoading && (
                <div className="flex justify-center pt-8">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!eventsLoading && events.length === 0 && (
                <p className="text-center text-zinc-600 text-sm pt-10">Sin eventos próximos</p>
              )}
              {!eventsLoading && events.map(ev => (
                <div
                  key={ev.occurrence_date ? `${ev.id}-${ev.occurrence_date}` : ev.id}
                  className="bg-surface-800 rounded-xl border border-surface-700 overflow-hidden"
                >
                  <button
                    onClick={() => { setConfirmDeleteId(null); setEventDetail(ev); }}
                    className="w-full text-left px-4 py-3.5 active:bg-surface-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-zinc-200 text-sm font-medium leading-snug truncate">{ev.title}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">
                          {new Date(String(ev.occurrence_date || ev.date).slice(0,10) + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {ev.time && ` · ${String(ev.time).slice(0,5)}`}
                        </p>
                      </div>
                      {(ev.songs || []).length > 0 && (
                        <span className="shrink-0 text-[10px] bg-surface-700 text-zinc-400 rounded-full px-2 py-0.5 border border-surface-600">
                          {ev.songs.length} canc.
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex border-t border-surface-700/60">
                    <button
                      onClick={() => {
                        const dateStr = String(ev.occurrence_date || ev.date).split('T')[0];
                        setEventFormData({ title: ev.title, date: dateStr, time: ev.time ? String(ev.time).slice(0,5) : '', description: ev.description || '' });
                        setEventDetail(ev);
                        setEventFormMode('edit');
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-zinc-400 text-xs active:bg-surface-700 transition-colors"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                    <div className="w-px bg-surface-700/60" />
                    <button
                      onClick={() => setConfirmDeleteId(ev.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-red-400 text-xs active:bg-red-950/30 transition-colors"
                    >
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ──── EVENTOS: playlist del evento ──── */}
        {!eventFormMode && eventDetail && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => { setEventDetail(null); setEventEditMode(false); }} className="flex items-center gap-1.5 text-accent text-sm">
                  <ArrowLeft size={14} /> Eventos
                </button>
                {!eventEditMode ? (
                  <button
                    onClick={() => { setEventEditSongs(eventDetail.songs || []); setEventEditMode(true); }}
                    className="flex items-center gap-1.5 text-zinc-400 text-xs"
                  >
                    <Pencil size={13} /> Editar lista
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEventEditMode(false)} className="text-zinc-500 text-xs">Cancelar</button>
                    <button
                      onClick={saveSongs}
                      disabled={eventSaving}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs font-semibold disabled:opacity-40"
                    >
                      <Check size={13} /> {eventSaving ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-zinc-200 font-semibold text-sm leading-snug">{eventDetail.title}</p>
              <p className="text-zinc-500 text-xs mt-0.5">
                {new Date(String(eventDetail.occurrence_date || eventDetail.date).slice(0,10) + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
                {eventDetail.time && ` · ${String(eventDetail.time).slice(0,5)}`}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-1.5 relative">
              {/* Song picker overlay */}
              {eventSongPicker && (
                <div className="absolute inset-0 z-20 bg-surface-900 flex flex-col">
                  <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700 flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                      <input
                        value={eventPickerQ}
                        onChange={e => setEventPickerQ(e.target.value)}
                        placeholder="Buscar canción…"
                        autoFocus
                        className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-8 pr-8 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                      />
                      {eventPickerQ && (
                        <button onPointerDown={() => setEventPickerQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"><X size={13} /></button>
                      )}
                    </div>
                    <button onClick={() => { setEventSongPicker(false); setEventPickerQ(''); }} className="text-zinc-400 text-xs shrink-0">Cerrar</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
                    {(songs || [])
                      .filter(s => { const q = norm(eventPickerQ); return !q || norm(s.title).includes(q) || norm(s.artist || '').includes(q); })
                      .map(s => (
                        <button
                          key={s.id}
                          onClick={() => setEventEditSongs(prev => [...prev, { song_id: s.id, item_type: 'song', title: s.title, author: s.artist, song_key: s.song_key }])}
                          className="w-full text-left px-4 py-3 bg-surface-800 active:bg-surface-700 rounded-xl border border-surface-700 transition-colors"
                        >
                          <p className="text-zinc-200 text-sm font-medium">{s.title}</p>
                          {s.artist && <p className="text-zinc-500 text-xs mt-0.5">{s.artist}</p>}
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Template picker overlay */}
              {eventTemplatePicker && (
                <div className="absolute inset-0 z-20 bg-surface-900 flex flex-col">
                  <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700 flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-300">Cargar plantilla</p>
                    <button onClick={() => setEventTemplatePicker(false)} className="text-zinc-400 text-xs">Cerrar</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                    {eventTemplates.length === 0 && (
                      <p className="text-center text-zinc-600 text-sm pt-8">No hay plantillas guardadas</p>
                    )}
                    {eventTemplates.map(tpl => (
                      <div key={tpl.id} className="bg-surface-800 rounded-xl border border-surface-700 overflow-hidden">
                        <div className="px-4 py-3">
                          <p className="text-zinc-200 text-sm font-medium">{tpl.name}</p>
                          <p className="text-zinc-500 text-xs mt-0.5">{(tpl.items || []).length} ít.</p>
                        </div>
                        <div className="flex border-t border-surface-700/60">
                          <button
                            onClick={() => {
                              setEventEditSongs(prev => [
                                ...prev,
                                ...(tpl.items || []).map(it => ({ song_id: it.song_id, item_type: it.item_type || 'song', title: it.title, author: it.author, separator_label: it.separator_label, separator_color: it.separator_color }))
                              ]);
                              setEventTemplatePicker(false);
                            }}
                            className="flex-1 py-2.5 text-zinc-300 text-xs active:bg-surface-700 transition-colors"
                          >+ Agregar al final</button>
                          <div className="w-px bg-surface-700/60" />
                          <button
                            onClick={() => {
                              setEventEditSongs((tpl.items || []).map(it => ({ song_id: it.song_id, item_type: it.item_type || 'song', title: it.title, author: it.author, separator_label: it.separator_label, separator_color: it.separator_color })));
                              setEventTemplatePicker(false);
                            }}
                            className="flex-1 py-2.5 text-accent text-xs font-semibold active:bg-accent/10 transition-colors"
                          >Reemplazar lista</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista en modo edición */}
              {eventEditMode && (
                <>
                  {eventEditSongs.length === 0 && (
                    <p className="text-center text-zinc-600 text-sm pt-6">Lista vacía</p>
                  )}
                  {eventEditSongs.map((item, idx) => (
                    <div key={`edit-${idx}`} className="flex items-center gap-2 bg-surface-800 rounded-xl border border-surface-700 px-3 py-2.5">
                      <div className="flex flex-col">
                        <button
                          onClick={() => setEventEditSongs(prev => { if (idx<=0) return prev; const a=[...prev]; [a[idx-1],a[idx]]=[a[idx],a[idx-1]]; return a; })}
                          disabled={idx === 0}
                          className="p-0.5 text-zinc-500 disabled:opacity-20"
                        ><ChevronUp size={15} /></button>
                        <button
                          onClick={() => setEventEditSongs(prev => { if (idx>=prev.length-1) return prev; const a=[...prev]; [a[idx],a[idx+1]]=[a[idx+1],a[idx]]; return a; })}
                          disabled={idx === eventEditSongs.length - 1}
                          className="p-0.5 text-zinc-500 disabled:opacity-20"
                        ><ChevronDown size={15} /></button>
                      </div>
                      {item.item_type === 'separator' ? (
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-px bg-surface-600" />
                          {item.separator_label && <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.separator_label}</span>}
                          <div className="flex-1 h-px bg-surface-600" />
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-200 text-sm font-medium truncate">{item.title}</p>
                          {item.author && <p className="text-zinc-500 text-xs">{item.author}</p>}
                        </div>
                      )}
                      <button onClick={() => setEventEditSongs(prev => prev.filter((_,i) => i !== idx))} className="p-1.5 text-red-400 shrink-0">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => { setEventPickerQ(''); setEventSongPicker(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-600 text-zinc-500 text-sm active:bg-surface-800 transition-colors"
                  >
                    <Plus size={16} /> Agregar canción
                  </button>
                  <button
                    onClick={() => { setShowEventSepForm(s => !s); setEventSepLabel(''); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-surface-600 text-zinc-500 text-sm active:bg-surface-800 transition-colors"
                  >
                    <Minus size={16} /> Agregar separador
                  </button>
                  {showEventSepForm && (
                    <div className="flex items-center gap-2 px-1">
                      <input
                        value={eventSepLabel}
                        onChange={e => setEventSepLabel(e.target.value)}
                        placeholder="Nombre de sección (ej: Reservas)…"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter' && eventSepLabel.trim()) {
                            setEventEditSongs(prev => [...prev, { item_type: 'separator', separator_label: eventSepLabel.trim(), separator_color: '#6366f1' }]);
                            setEventSepLabel('');
                            setShowEventSepForm(false);
                          }
                        }}
                        className="flex-1 bg-surface-800 border border-surface-600 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => {
                          if (!eventSepLabel.trim()) return;
                          setEventEditSongs(prev => [...prev, { item_type: 'separator', separator_label: eventSepLabel.trim(), separator_color: '#6366f1' }]);
                          setEventSepLabel('');
                          setShowEventSepForm(false);
                        }}
                        className="shrink-0 px-3 py-2.5 rounded-xl bg-accent/20 border border-accent/40 text-accent text-sm"
                      ><Check size={16} /></button>
                    </div>
                  )}
                  <button
                    onClick={() => { loadEventTemplates(); setEventTemplatePicker(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-accent/30 text-accent/70 text-sm active:bg-accent/5 transition-colors"
                  >
                    <LayoutTemplate size={16} /> Cargar plantilla
                  </button>
                </>
              )}

              {/* Lista en modo lectura */}
              {!eventEditMode && (
                <>
                  {(eventDetail.songs || []).length === 0 && (
                    <p className="text-center text-zinc-600 text-sm pt-10">Sin canciones en este evento</p>
                  )}
                  {(eventDetail.songs || []).map((item, idx) => {
                    if (item.item_type === 'separator') {
                      return (
                        <div key={`sep-${idx}`} className="flex items-center gap-2 py-1.5 px-1">
                          <div className="flex-1 h-px bg-surface-600" />
                          {item.separator_label && <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{item.separator_label}</span>}
                          <div className="flex-1 h-px bg-surface-600" />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={item.id || `song-${idx}`}
                        className="flex items-stretch bg-surface-800 rounded-xl border border-surface-700 overflow-hidden"
                      >
                        <button
                          onClick={async () => {
                            const detail = await actions.loadSongDetail(item.song_id);
                            if (detail) { setSongOriginTab('events'); setSongDetail(detail); setTab('songs'); }
                          }}
                          className="flex-1 text-left px-4 py-3 active:bg-surface-700 transition-colors min-w-0"
                        >
                          <p className={`text-sm font-medium leading-snug ${eventPlays?.has(item.song_id) ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{item.title}</p>
                          {item.author && <p className="text-zinc-500 text-xs mt-0.5">{item.author}</p>}
                          {item.song_key && <span className="inline-block mt-1 text-[9px] font-bold bg-accent/10 text-accent border border-accent/30 rounded px-1.5 py-0.5">{item.song_key}</span>}
                        </button>
                        <button
                          onClick={async () => {
                            const occDate = eventDetail.is_recurring
                              ? String(eventDetail.occurrence_date || eventDetail.date).split('T')[0]
                              : null;
                            if (eventPlays?.has(item.song_id)) {
                              await actions.unmarkPlayed(eventDetail.id, occDate, item.song_id);
                            } else {
                              await actions.markPlayed(eventDetail.id, occDate, item.song_id, 0, 0, true);
                            }
                          }}
                          className={`shrink-0 px-4 flex items-center justify-center border-l border-surface-700 active:bg-surface-700 transition-colors ${
                            eventPlays?.has(item.song_id) ? 'text-green-400' : 'text-zinc-600'
                          }`}
                        >
                          {eventPlays?.has(item.song_id) ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
            </div>
          )}
        </div>

        {/* ──── PANEL: MULTIMEDIA (próximamente) ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('multimedia')}
          >
            <div className="flex items-center gap-2.5">
              <Radio size={15} className={openPanels.has('multimedia') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('multimedia') ? 'text-zinc-100' : 'text-zinc-400'}`}>Multimedia</span>
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('multimedia') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('multimedia') && (
            <div style={{ height: '65vh' }}>
              <MediaLibrary />
            </div>
          )}
        </div>

        {/* ──── PANEL: BIBLIA ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('biblia')}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen size={15} className={openPanels.has('biblia') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('biblia') ? 'text-zinc-100' : 'text-zinc-400'}`}>Biblia</span>
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('biblia') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('biblia') && (
            <div className="overflow-y-auto" style={{ maxHeight: '65vh' }}>
        {/* ──── BIBLIA ──── */}
        {true && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Selector de versión + toggle modo */}
            <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700 flex gap-1.5 items-center">
              <select
                value={bibleVersion?.id || ''}
                onChange={e => {
                  const v = bibleVersions.find(b => b.id === parseInt(e.target.value, 10));
                  setBibleVersion(v);
                  setBibleBook(null); setBibleChapter(null); setBibleVerses([]); setActiveVerse(null); setActiveSplit(null);
                }}
                className="flex-1 min-w-0 bg-surface-700 border border-surface-600 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-accent"
              >
                {bibleVersions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {/* Ocultar pantalla */}
              <button
                onPointerDown={handleBlank}
                title={isBlank ? 'Mostrar pantalla' : 'Ocultar pantalla'}
                className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                  isBlank
                    ? 'bg-red-950 border-red-500 text-red-400'
                    : 'bg-surface-700 border-surface-600 text-zinc-400'
                }`}
              >
                {isBlank ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              {/* Historial */}
              <button
                onPointerDown={() => { setBibleMode(m => m === 'history' ? 'nav' : 'history'); setActiveVerse(null); setActiveSplit(null); }}
                title="Historial de versículos"
                className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                  bibleMode === 'history'
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-surface-700 border-surface-600 text-zinc-400'
                }`}
              >
                <Clock size={15} />
              </button>
              {/* Buscar */}
              <button
                onPointerDown={() => { setBibleMode(m => m === 'search' ? 'nav' : 'search'); setActiveVerse(null); setActiveSplit(null); }}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  bibleMode === 'search'
                    ? 'bg-accent/20 border-accent/40 text-accent'
                    : 'bg-surface-700 border-surface-600 text-zinc-400'
                }`}
              >
                <Search size={12} />
                Buscar
              </button>
            </div>

            {/* ── Modo búsqueda ── */}
            {bibleMode === 'search' && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="px-4 pt-3 pb-2 shrink-0">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                    <input
                      value={bibleSearch}
                      onChange={e => setBibleSearch(e.target.value)}
                      placeholder="Buscar versículo…"
                      className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-8 pr-8 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent"
                      autoFocus
                    />
                    {bibleSearch && (
                      <button onPointerDown={() => { setBibleSearch(''); setBibleResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
                  {bibleSearching && (
                    <div className="flex justify-center pt-8">
                      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!bibleSearching && bibleSearch && bibleResults.length === 0 && (
                    <p className="text-center text-zinc-600 text-sm pt-10">Sin resultados</p>
                  )}
                  {bibleResults.map(v => (
                    <button
                      key={v.id}
                      onClick={() => sendVerse(v, bibleResults)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        activeVerse?.id === v.id
                          ? 'bg-accent/15 border-accent/50'
                          : 'bg-surface-800 active:bg-surface-700 border-surface-700'
                      }`}
                    >
                      <p className="text-[10px] text-accent font-semibold mb-1">{v.book_name} {v.chapter}:{v.verse} — {v.version}</p>
                      <p className="text-zinc-300 text-sm leading-relaxed line-clamp-3">{v.text}</p>
                    </button>
                  ))}
                </div>
                {(activeVerse || activeSplit) && (
                  <div className="shrink-0 border-t border-surface-700 px-3 py-2.5 flex items-center gap-2 bg-surface-900/80">
                    {activeSplit ? (
                      <>
                        <span className="text-[10px] font-bold text-zinc-500 shrink-0">1/2</span>
                        <p className="flex-1 text-center text-xs text-accent font-semibold truncate">
                          {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse}
                        </p>
                        <button
                          onClick={() => {
                            const { verse: sv, part2, list: sl } = activeSplit;
                            const ref = `${sv.book_name} ${sv.chapter}:${sv.verse}`;
                            const si  = sl.findIndex(v => v.id === sv.id);
                            const nx  = si >= 0 && si < sl.length - 1 ? sl[si + 1] : null;
                            actions.showSlide({
                              type: 'bible',
                              slideData:     makeVerseSD(part2, ref, sv.version),
                              nextSlideData: nx ? makeVerseSD(nx.text, `${nx.book_name} ${nx.chapter}:${nx.verse}`, nx.version) : null,
                            });
                            setActiveSplit(null);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs font-bold"
                        >Parte 2 <ChevronRight size={13} /></button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { const i = bibleResults.findIndex(v => v.id === activeVerse.id); if (i > 0) sendVerse(bibleResults[i - 1], bibleResults); }}
                          disabled={bibleResults.findIndex(v => v.id === activeVerse.id) <= 0}
                          className="p-1.5 rounded-lg bg-surface-700 border border-surface-600 text-zinc-300 disabled:opacity-30"
                        ><ChevronLeft size={16} /></button>
                        <p className="flex-1 text-center text-xs text-accent font-semibold truncate">
                          {activeVerse.book_name} {activeVerse.chapter}:{activeVerse.verse}
                        </p>
                        <button
                          onClick={() => { const i = bibleResults.findIndex(v => v.id === activeVerse.id); if (i < bibleResults.length - 1) sendVerse(bibleResults[i + 1], bibleResults); }}
                          disabled={bibleResults.findIndex(v => v.id === activeVerse.id) >= bibleResults.length - 1}
                          className="p-1.5 rounded-lg bg-surface-700 border border-surface-600 text-zinc-300 disabled:opacity-30"
                        ><ChevronRight size={16} /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Modo historial ── */}
            {bibleMode === 'history' && (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-1.5">
                  {(() => {
                    const cutoff = Date.now() - 30 * 60 * 1000;
                    const recent = verseHistory.filter(h => h.ts >= cutoff);
                    if (recent.length === 0) {
                      return (
                        <p className="text-center text-zinc-600 text-sm pt-10">
                          Sin versículos proyectados en los últimos 30 min
                        </p>
                      );
                    }
                    return recent.map(h => (
                      <button
                        key={`${h.id}-${h.ts}`}
                        onClick={() => sendVerse(h, recent)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                          activeVerse?.id === h.id
                            ? 'bg-accent/15 border-accent/50'
                            : 'bg-surface-800 active:bg-surface-700 border-surface-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-[10px] text-accent font-semibold">{h.ref} — {h.version}</p>
                          <span className="text-[9px] text-zinc-600 shrink-0">
                            {new Date(h.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-zinc-300 text-sm leading-relaxed line-clamp-2">{h.text}</p>
                      </button>
                    ));
                  })()}
                </div>
                {(activeVerse || activeSplit) && (
                  <div className="shrink-0 border-t border-surface-700 px-3 py-2.5 flex items-center gap-2 bg-surface-900/80">
                    {activeSplit ? (
                      <>
                        <span className="text-[10px] font-bold text-zinc-500 shrink-0">1/2</span>
                        <p className="flex-1 text-center text-xs text-accent font-semibold truncate">
                          {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse}
                        </p>
                        <button
                          onClick={() => {
                            const { verse: sv, part2, list: sl } = activeSplit;
                            const ref = `${sv.book_name} ${sv.chapter}:${sv.verse}`;
                            const si  = sl.findIndex(v => v.id === sv.id);
                            const nx  = si >= 0 && si < sl.length - 1 ? sl[si + 1] : null;
                            actions.showSlide({
                              type: 'bible',
                              slideData:     makeVerseSD(part2, ref, sv.version),
                              nextSlideData: nx ? makeVerseSD(nx.text, `${nx.book_name} ${nx.chapter}:${nx.verse}`, nx.version) : null,
                            });
                            setActiveSplit(null);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs font-bold"
                        >Parte 2 <ChevronRight size={13} /></button>
                      </>
                    ) : (
                      <p className="flex-1 text-center text-xs text-accent font-semibold truncate">
                        ▶ {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Modo navegación ── */}
            {bibleMode === 'nav' && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Breadcrumb */}
                {(bibleBook || bibleChapter) && (
                  <div className="px-4 py-2.5 shrink-0 border-b border-surface-700 flex items-center gap-2">
                    <button
                      onPointerDown={() => {
                        if (bibleChapter) { setBibleChapter(null); setBibleVerses([]); setActiveVerse(null); setActiveSplit(null); }
                        else { setBibleBook(null); setBibleChapter(null); setBibleVerses([]); setActiveVerse(null); setActiveSplit(null); }
                      }}
                      className="flex items-center gap-1.5 text-accent text-sm font-medium"
                    >
                      <ArrowLeft size={14} />
                      {bibleChapter ? bibleBook.name : 'Libros'}
                    </button>
                    {bibleChapter && (
                      <span className="text-zinc-500 text-xs">› Cap. {bibleChapter}</span>
                    )}
                  </div>
                )}

                {/* Pasos 1 y 2 (libros / capítulos) */}
                {!(bibleBook && bibleChapter) && (
                  <div className="flex-1 overflow-y-auto p-3">
                    {/* Paso 1: libros agrupados por categoría */}
                    {!bibleBook && (
                      <div className="space-y-4">
                        {bibleBooks.length === 0 && (
                          <p className="text-center text-zinc-600 text-sm pt-10">Selecciona una versión</p>
                        )}
                        {BOOK_CATEGORIES.map(cat => {
                          const catBooks = bibleBooks.slice(cat.start, cat.end);
                          if (catBooks.length === 0) return null;
                          return (
                            <div key={cat.label}>
                              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 px-1 ${cat.accent}`}>{cat.label}</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {catBooks.map(b => (
                                  <button
                                    key={b.id}
                                    onClick={() => { setBibleBook(b); setBibleChapter(null); setBibleVerses([]); setActiveVerse(null); setActiveSplit(null); }}
                                    className={`px-3 py-2.5 rounded-xl border text-left transition-colors active:opacity-60 ${cat.bg}`}
                                  >
                                    <p className={`text-xs font-medium leading-tight ${cat.text}`}>{b.name}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Paso 2: grilla de capítulos */}
                    {bibleBook && !bibleChapter && (
                      <div className="grid grid-cols-5 gap-1.5">
                        {bibleChapters.map(c => (
                          <button
                            key={c}
                            onClick={() => { setBibleChapter(c); setActiveVerse(null); setActiveSplit(null); }}
                            className="aspect-square flex items-center justify-center bg-surface-800 active:bg-surface-700 rounded-xl border border-surface-700 text-zinc-200 text-sm font-semibold transition-colors"
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Paso 3: lista de versículos con su propio scroll + barra prev/next */}
                {bibleBook && bibleChapter && (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                      {bibleVerses.length === 0 && (
                        <div className="flex justify-center pt-8">
                          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {bibleVerses.map(v => (
                        <button
                          key={v.id}
                          onClick={() => sendVerse(v, bibleVerses)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors flex gap-2.5 ${
                            activeVerse?.id === v.id
                              ? 'bg-accent/15 border-accent/50'
                              : 'bg-surface-800 active:bg-surface-700 border-surface-700'
                          }`}
                        >
                          <span className="text-[10px] font-bold text-accent mt-0.5 w-5 shrink-0 text-right">{v.verse}</span>
                          <p className="text-zinc-300 text-sm leading-relaxed">{v.text}</p>
                        </button>
                      ))}
                    </div>
                    {(activeVerse || activeSplit) && (
                      <div className="shrink-0 border-t border-surface-700 px-3 py-2.5 flex items-center gap-2 bg-surface-900/80">
                        {activeSplit ? (
                          <>
                            <span className="text-[10px] font-bold text-zinc-500 shrink-0">1/2</span>
                            <p className="flex-1 text-center text-xs text-accent font-semibold truncate">
                              {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse}
                            </p>
                            <button
                              onClick={() => {
                                const { verse: sv, part2, list: sl } = activeSplit;
                                const ref = `${sv.book_name} ${sv.chapter}:${sv.verse}`;
                                const si  = sl.findIndex(v => v.id === sv.id);
                                const nx  = si >= 0 && si < sl.length - 1 ? sl[si + 1] : null;
                                actions.showSlide({
                                  type: 'bible',
                                  slideData:     makeVerseSD(part2, ref, sv.version),
                                  nextSlideData: nx ? makeVerseSD(nx.text, `${nx.book_name} ${nx.chapter}:${nx.verse}`, nx.version) : null,
                                });
                                setActiveSplit(null);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs font-bold"
                            >Parte 2 <ChevronRight size={13} /></button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { const i = bibleVerses.findIndex(v => v.id === activeVerse.id); if (i > 0) sendVerse(bibleVerses[i - 1], bibleVerses); }}
                              disabled={bibleVerses.findIndex(v => v.id === activeVerse.id) <= 0}
                              className="p-1.5 rounded-lg bg-surface-700 border border-surface-600 text-zinc-300 disabled:opacity-30"
                            ><ChevronLeft size={16} /></button>
                            <p className="flex-1 text-center text-xs text-accent font-semibold truncate">
                              {activeVerse.book_name} {activeVerse.chapter}:{activeVerse.verse}
                            </p>
                            <button
                              onClick={() => { const i = bibleVerses.findIndex(v => v.id === activeVerse.id); if (i < bibleVerses.length - 1) sendVerse(bibleVerses[i + 1], bibleVerses); }}
                              disabled={bibleVerses.findIndex(v => v.id === activeVerse.id) >= bibleVerses.length - 1}
                              className="p-1.5 rounded-lg bg-surface-700 border border-surface-600 text-zinc-300 disabled:opacity-30"
                            ><ChevronRight size={16} /></button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
            </div>
          )}
        </div>

        {/* ──── PANEL: AJUSTES ──── */}
        <div>
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-surface-800/40 active:bg-surface-700/60 transition-colors"
            onClick={() => togglePanel('ajustes')}
          >
            <div className="flex items-center gap-2.5">
              <Settings size={15} className={openPanels.has('ajustes') ? 'text-accent' : 'text-zinc-500'} />
              <span className={`text-sm font-semibold ${openPanels.has('ajustes') ? 'text-zinc-100' : 'text-zinc-400'}`}>Ajustes</span>
            </div>
            <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${openPanels.has('ajustes') ? 'rotate-180' : ''}`} />
          </button>
          {openPanels.has('ajustes') && (
            <div className="overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {/* Ajustes de salida, escenario y virtual */}
              <OutputControls />
              <StageControls />
              <VirtualControls />

              {/* Tema de color */}
              <MobileSettingsSection title="Tema de color">
                <ThemePanel />
              </MobileSettingsSection>

              {/* Salidas */}
              <MobileSettingsSection title="Salidas">
                <DisplaysPanel />
              </MobileSettingsSection>

              {/* Sincronización */}
              <MobileSettingsSection title="Sincronización">
                <SyncPanel />
              </MobileSettingsSection>

              {/* Conexión al servidor */}
              <MobileSettingsSection title="Conexión al servidor">
                <div className="space-y-3 mb-4">
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
                <div className="mt-4 p-3 bg-surface-800 rounded-xl border border-surface-700">
                  <p className="text-zinc-500 text-xs">Conexión actual</p>
                  <p className="font-mono text-accent text-sm mt-1">{getSavedIp()}:{getSavedPort()}</p>
                </div>
              </MobileSettingsSection>
            </div>
          )}
        </div>

      </div>

      {/* ── Nav inferior fija: Anterior / Negro / Siguiente ── */}
      <div className="shrink-0 grid grid-cols-3 gap-2 px-3 py-2 bg-surface-900 border-t border-surface-700 mobile-nav-safe">
        <NavBtn flash={flash === 'prev'} onPointerDown={handlePrev}>
          <ChevronLeft size={26} /><span className="text-xs font-medium">Anterior</span>
        </NavBtn>
        <button
          onPointerDown={handleBlank}
          className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border-2 transition-all active:scale-95 ${
            isBlank ? 'bg-red-950/60 border-red-500 text-red-400'
            : flash === 'blank' ? 'bg-zinc-700 border-zinc-400 text-white'
            : 'bg-surface-800 border-surface-600 text-zinc-300'
          }`}
        >
          {isBlank ? <Eye size={24} /> : <EyeOff size={24} />}
          <span className="text-xs font-medium">{isBlank ? 'Mostrar' : 'Negro'}</span>
        </button>
        <NavBtn flash={flash === 'next'} onPointerDown={handleNext}>
          <ChevronRight size={26} /><span className="text-xs font-medium">Siguiente</span>
        </NavBtn>
      </div>
    </div>
  );
}

// ─── Renderizador de slide para vista escenario móvil ────────────────────────
function StageMobileSlide({ content, chordsColor, lyricsColor, showComments, commentColor, compact = false }) {
  if (!content) return null;
  const rawLines = content.split('\n');
  const lineData = rawLines.map(line => {
    if (isCommentLine(line)) {
      return { visible: '', comment: line.replace(/^\s*\/\/\s?/, ''), isFullComment: true };
    }
    const { visible, comment } = extractInlineComment(line);
    return { visible, comment, isFullComment: false };
  });
  const chordLines = parseChordLines(lineData.map(ld => ld.visible).join('\n'));
  const lyricSize  = compact ? 13 : 20;
  const chordSize  = compact ? 10 : 13;
  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      {lineData.map((ld, li) => {
        if (ld.isFullComment) {
          if (!showComments) return null;
          return (
            <div key={li} style={{ color: commentColor, fontSize: compact ? 10 : 13, fontStyle: 'italic', lineHeight: 1.5 }}>
              {ld.comment}
            </div>
          );
        }
        const line     = chordLines[li] || [];
        const lineText = line.map(s => s.text).join('');
        const hasChords = line.some(s => s.chord);
        if (!lineText.trim() && !ld.comment && !hasChords) {
          return <div key={li} style={{ height: compact ? 4 : 8 }} />;
        }
        const inlineComment = (showComments && ld.comment)
          ? <span style={{ color: commentColor, fontSize: compact ? 10 : 12, fontStyle: 'italic', marginLeft: 8 }}>{ld.comment}</span>
          : null;
        if (!hasChords) {
          return (
            <div key={li} style={{ color: lyricsColor, fontSize: lyricSize, lineHeight: 1.5 }}>
              {lineText}{inlineComment}
            </div>
          );
        }
        return (
          <div key={li} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', lineHeight: 1.2, marginBottom: compact ? 2 : 4 }}>
            {line.map((seg, si) => {
              const hasText = seg.text && seg.text.trim().length > 0;
              return (
                <span
                  key={si}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    minWidth: (!hasText && seg.chord) ? `${(seg.chord.length + 2) * 0.55}ch` : undefined,
                  }}
                >
                  {/* Siempre reservar espacio del acorde para alinear sílabas en la misma altura */}
                  <span style={{ color: chordsColor, fontSize: chordSize, fontWeight: 700, fontFamily: 'monospace', lineHeight: 0.9, display: 'block', minHeight: `${chordSize + 3}px` }}>
                    {seg.chord || ''}
                  </span>
                  {seg.text && (
                    <span style={{ color: lyricsColor, fontSize: lyricSize }}>
                      {seg.text}
                    </span>
                  )}
                </span>
              );
            })}
            {showComments && ld.comment && (
              <span style={{ color: commentColor, fontSize: compact ? 10 : 12, fontStyle: 'italic', alignSelf: 'flex-end', marginLeft: 6 }}>
                {ld.comment}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Botón de navegación de slides ───────────────────────────────────────────
function NavBtn({ flash, onPointerDown, children }) {
  return (
    <button
      onPointerDown={onPointerDown}
      className={`flex flex-col items-center justify-center gap-1 py-4 xs:py-5 sm:py-6 rounded-2xl border-2 transition-all active:scale-95 ${
        flash ? 'bg-accent/30 border-accent text-accent' : 'bg-surface-800 border-surface-600 text-zinc-300'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Contenido de slide: letras + comentarios (sin acordes) ─────────────────
function MobileSlideContent({ content }) {
  if (!content) return null;
  return (
    <div className="space-y-0.5">
      {content.split('\n').map((rawLine, i) => {
        // Línea completa de comentario (//)
        if (isCommentLine(rawLine)) {
          const text = rawLine.replace(/^\s*\/\/\s*/, '');
          return (
            <p key={i} className="text-sm text-zinc-500 italic leading-snug">
              {text || '—'}
            </p>
          );
        }

        const { visible, comment } = extractInlineComment(rawLine);
        const lyric = visible.replace(/\[[^\]]*\]/g, '').replace(/  +/g, ' ').trimEnd();

        // Línea vacía → separador visual
        if (!lyric.trim()) {
          return <div key={i} className="h-2" />;
        }

        return (
          <p key={i} className="text-lg text-zinc-200 leading-snug">
            {lyric}
            {comment && (
              <span className="text-[10px] text-zinc-500 italic ml-1.5">{comment}</span>
            )}
          </p>
        );
      })}
    </div>
  );
}

// ─── Botón de pestaña inferior ────────────────────────────────────────────────
function TabNavBtn({ active, onPointerDown, icon, label }) {
  return (
    <button
      onPointerDown={onPointerDown}
      className={`flex flex-col items-center justify-center gap-0.5 xs:gap-1 py-2 xs:py-3 transition-colors ${
        active ? 'text-accent' : 'text-zinc-500'
      }`}
    >
      {/* Ícono: ligeramente más pequeño en fold phones */}
      <span className="[&>svg]:w-4 [&>svg]:h-4 xs:[&>svg]:w-[18px] xs:[&>svg]:h-[18px]">{icon}</span>
      {/* Etiqueta: oculta en fold phones (<320 px), visible en ≥ 360 px */}
      <span className="text-[9px] xs:text-[10px] font-medium hidden fold:block">{label}</span>
    </button>
  );
}

// ─── Sub-sección colapsable para el panel Ajustes móvil ──────────────────────
function MobileSettingsSection({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-surface-700">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-surface-700/30 transition-colors"
      >
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</span>
        <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

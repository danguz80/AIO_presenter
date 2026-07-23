import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { StagePreview } from '../components/Controls/LivePreview';
import OrgSwitcher     from '../components/shared/OrgSwitcher';
import { stripChords, stripComments, isCommentLine, extractInlineComment, buildScaleChords, parseChordLines } from '../utils/chordUtils';
import { getLabelColor } from '../utils/labelColors';
import { splitBibleVerseSmart } from '../utils/bibleSplit';
import useVolumeKeys from '../hooks/useVolumeKeys';
import { forceRefreshApp } from '../utils/forceRefreshApp';
import { APP_VERSION } from '../version';
import {
  ChevronLeft, ChevronRight, EyeOff, Eye,
  Wifi, WifiOff, Music, Music2, Radio, Settings, ArrowLeft, Search, X, RefreshCw,
  CalendarDays, BookOpen, Clock,
  Pencil, Trash2, Plus, Check, ChevronUp, ChevronDown, LayoutTemplate, SkipForward, Minus,
  CheckCircle2, Circle, MonitorPlay, MessageSquare,
} from 'lucide-react';

const BUILD_VERSION = APP_VERSION;

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

// ─── Parsear contenido de diapo: comentarios + acordes-solo ──────────────────
function parseSlideContent(content) {
  return (content || '').split('\n').map(line => {
    if (isCommentLine(line)) {
      return { kind: 'comment', text: line.replace(/^\s*\/\/\s?/, '') };
    }
    const { visible } = extractInlineComment(line);
    const text = stripChords(visible);
    if (!text.trim() && /\[/.test(visible)) {
      const chords = [...visible.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
      return chords.length ? { kind: 'chord', chords } : null;
    }
    return text.trim() ? { kind: 'lyric', text } : null;
  }).filter(Boolean);
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

function buildOrderedSlides(rawSlides = [], structItems = []) {
  if (!Array.isArray(rawSlides) || rawSlides.length === 0) return [];
  if (!Array.isArray(structItems) || structItems.length === 0) return rawSlides;

  // Misma estrategia de SongDetail: consumir bloques por ocurrencia de etiqueta.
  const blocks = [];
  for (const s of rawSlides) {
    const lbl = s.label?.trim() ?? '';
    const last = blocks[blocks.length - 1];
    if (!last || last.label !== lbl) blocks.push({ label: lbl, slides: [s] });
    else last.slides.push(s);
  }

  const blocksByLabel = {};
  for (const b of blocks) {
    if (!blocksByLabel[b.label]) blocksByLabel[b.label] = [];
    blocksByLabel[b.label].push(b.slides);
  }

  const nextIdxByLabel = {};
  const result = [];
  for (const lbl of structItems) {
    const arr = blocksByLabel[lbl] ?? [];
    if (arr.length === 0) continue;
    const idx = nextIdxByLabel[lbl] ?? 0;
    result.push(...arr[Math.min(idx, arr.length - 1)]);
    nextIdxByLabel[lbl] = idx + 1;
  }
  return result.length > 0 ? result : rawSlides;
}

function resolveSlidesForSongDetail(song) {
  const rawSlides = Array.isArray(song?.slides) ? song.slides : [];
  if (!song) return rawSlides;
  const allStructures = Array.isArray(song.structures) && song.structures.length > 0
    ? song.structures
    : (Array.isArray(song.structure) && song.structure.length > 0
      ? [{ name: 'Estructura 1', items: song.structure }]
      : []);
  if (!allStructures.length) return rawSlides;
  const saved = localStorage.getItem(`aio_active_struct_${song.id}`);
  const idx = saved !== null ? Math.max(0, parseInt(saved, 10) || 0) : 0;
  const items = allStructures[Math.min(idx, allStructures.length - 1)]?.items ?? [];
  return buildOrderedSlides(rawSlides, items);
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
  const { liveState, connected, songs, schedule, reservasMode, stageConfig, eventPlays, eventPlaysContext, remoteSongSelected } = state;
  const { slideData, nextSlideData, isBlank } = liveState || {};
  const navigate = useNavigate();

  // Leer PIN desde parámetro URL (?pin=abc123) — al escanear el QR del PC
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const pinFromUrl = params.get('pin');
    if (pinFromUrl && pinFromUrl.length >= 4) {
      const existing = localStorage.getItem('aio_target_pin');
      if (existing !== pinFromUrl) {
        localStorage.setItem('aio_target_pin', pinFromUrl);
        // Limpiar el param de la URL y recargar para reconectar el socket con el nuevo PIN
        window.history.replaceState({}, '', '/mobile');
        forceRefreshApp('/mobile');
      }
    }
  }, []);

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
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    if (typeof mq.addListener === 'function') {
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }
    return undefined;
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
  const [activeStructIdx,  setActiveStructIdx]  = useState(0);
  const [songEditMode,     setSongEditMode]     = useState(false);
  const [songEditData,     setSongEditData]     = useState({});
  const [songEditSaving,   setSongEditSaving]   = useState(false);
  const [songEditError,    setSongEditError]    = useState('');
  const [activeSongSlideIndex, setActiveSongSlideIndex] = useState(null); // -1 = título
  const [loadingSong,      setLoadingSong]      = useState(false);
  const [songSearch,       setSongSearch]       = useState('');

  const [cfgIp,    setCfgIp]    = useState(getSavedIp);
  const [cfgPort,  setCfgPort]  = useState(getSavedPort);
  const [cfgSaved, setCfgSaved] = useState(false);

  const [flash,    setFlash]    = useState(null);
  const [liveView, setLiveView] = useState('control'); // 'control' | 'stage'
  const [stageTime, setStageTime] = useState(() => new Date());
  const [stageLastLabel, setStageLastLabel] = useState(null);

  // PIN del presentador al que este dispositivo está vinculado
  const [pinInput,     setPinInput]     = useState('');
  const [pinDetecting, setPinDetecting] = useState(false);
  // currentPin: el PIN del presentador objetivo (aio_target_pin, lo setea el usuario)
  const currentPin = localStorage.getItem('aio_target_pin') || '';
  const touchStart      = useRef(null);
  const songEditBodyRef  = useRef(null);
  const savedCursorPos   = useRef(null);
  const slideGridRef     = useRef(null);
  const seenSlideIdxBySongRef = useRef(new Map());
  const autoMarkedSongIdsRef  = useRef(new Set());

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
  const today0 = new Date();
  const [eventsYear,  setEventsYear]  = useState(today0.getFullYear());
  const [eventsMonth, setEventsMonth] = useState(today0.getMonth()); // 0-indexed

  const [pastEventsOpen, setPastEventsOpen] = useState(false);

  const MONTHS_ES_MOB = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const loadEvents = useCallback(async (y, m) => {
    setEventsLoading(true);
    try {
      const pad   = n => String(n).padStart(2, '0');
      const last  = new Date(y, m + 1, 0).getDate();
      const start = `${y}-${pad(m + 1)}-01`;
      const end   = `${y}-${pad(m + 1)}-${pad(last)}`;
      const token = localStorage.getItem('aio_sync_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res   = await fetch(`${getApiBase()}/api/events?start=${start}&end=${end}`, { headers });
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

  // Auto-detectar el PIN del presentador activo en la red local
  const autoDetectPin = async () => {
    setPinDetecting(true);
    try {
      const orgId = localStorage.getItem('aio_org_id') || '';
      const res  = await fetch(`${getApiBase()}/api/presenter/pins?orgId=${orgId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Error');
      const { pins } = await res.json();
      if (pins && pins.length > 0) {
        setPinInput(pins[0]);
      } else {
        setFlash({ type: 'warn', msg: 'No se encontró ningún presentador activo' });
        setTimeout(() => setFlash(null), 3000);
      }
    } catch {
      setFlash({ type: 'warn', msg: 'No se pudo detectar. Intenta manualmente.' });
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setPinDetecting(false);
    }
  };

  // Vincular con el presentador usando el PIN ingresado
  const applyPresenterPin = (pin) => {
    const clean = (pin || '').trim().toLowerCase().slice(0, 6);
    if (!clean) return;
    localStorage.setItem('aio_target_pin', clean);
    forceRefreshApp('/mobile');
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
        loadEvents(eventsYear, eventsMonth);
      }
    } catch { /* noop */ }
    finally { setEventSaving(false); }
  };

  const deleteEventById = async (id) => {
    try {
      await fetch(`${apiBase()}/api/events/${id}`, { method: 'DELETE', headers: authHeaders() });
      setConfirmDeleteId(null);
      setEventDetail(null);
      loadEvents(eventsYear, eventsMonth);
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
        loadEvents(eventsYear, eventsMonth);
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
  const verseListRef     = useRef(null);
  const [activeVerseList, setActiveVerseList] = useState([]); // lista activa al momento de sendVerse

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

  const makeVerseSD = (text, ref, version, fullText = null, fullReference = null) => ({
    type: 'bible',
    text,
    reference: ref,
    version,
    ...(fullText ? { fullText } : {}),
    ...(fullReference ? { fullReference } : {}),
  });

  const sendVerse = (verse, list = []) => {
    setActiveVerse(verse);
    setActiveVerseList(list);
    const baseRef = `${verse.book_name} ${verse.chapter}:${verse.verse}`;
    // Registrar en historial (mueve al tope si ya existe)
    setVerseHistory(prev => {
      const entry = { ...verse, ref: baseRef, ts: Date.now() };
      return [entry, ...prev.filter(h => h.id !== verse.id)].slice(0, 60);
    });
    const i    = list.findIndex(v => v.id === verse.id);
    const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    const nextBaseRef = next ? `${next.book_name} ${next.chapter}:${next.verse}` : null;
    const nextSD = next ? makeVerseSD(next.text, nextBaseRef, next.version, next.text, nextBaseRef) : null;

    // Usar bibleMaxLines del outputConfig (mismo criterio que escritorio)
    const maxLines = state.outputConfig?.bibleMaxLines ?? 0;
    const pages = splitBibleVerseSmart(verse.text || '', maxLines, {
      charsPerLine: 46,
      minFirstLines: 4,
      minSecondLines: 2,
    });

    if (pages.length > 1) {
      const total = pages.length;
      const pageRef = (n) => total > 1 ? `${baseRef} (${n + 1}/${total})` : baseRef;
      // activeSplit: { verse, pages, pageIdx, list }
      setActiveSplit({ verse, pages, pageIdx: 0, list });
      actions.showSlide({
        type: 'bible',
        slideData:     makeVerseSD(pages[0], pageRef(0), verse.version, verse.text, baseRef),
        nextSlideData: makeVerseSD(pages[1], pageRef(1), verse.version, verse.text, baseRef),
      });
    } else {
      setActiveSplit(null);
      actions.showSlide({
        type: 'bible',
        slideData:     makeVerseSD(verse.text, baseRef, verse.version, verse.text, baseRef),
        nextSlideData: nextSD,
      });
    }
  };

  // Carga el capítulo completo de un versículo del historial y navega a él,
  // dejando al usuario listo para seguir avanzando con los botones normales.
  const navigateToVerseInContext = async (histVerse) => {
    try {
      // 1. Encontrar la versión (match por abbreviation, que es el campo "version" en el verso)
      let versions = bibleVersions;
      if (!versions.length) {
        const r = await fetch(`${getApiBase()}/api/bible/versions`);
        if (r.ok) { versions = await r.json(); setBibleVersions(versions); }
      }
      const version = versions.find(v => v.abbreviation === histVerse.version) ?? versions[0];
      if (!version) return;

      // 2. Cargar libros para esa versión
      let books = (bibleVersion?.id === version.id && bibleBooks.length) ? bibleBooks : null;
      if (!books) {
        const r = await fetch(`${getApiBase()}/api/bible/${version.id}/books`);
        if (!r.ok) return;
        books = await r.json();
        setBibleBooks(books);
      }
      const book = books.find(b => b.name === histVerse.book_name);
      if (!book) return;

      // 3. Cargar los versículos del capítulo
      const r = await fetch(`${getApiBase()}/api/bible/${version.id}/books/${book.id}/chapters/${histVerse.chapter}`);
      if (!r.ok) return;
      const verses = await r.json();

      // 4. Encontrar el verso exacto dentro del capítulo
      const target = verses.find(v => v.verse === histVerse.verse) ?? verses[0];
      if (!target) return;

      // 5. Actualizar todo el estado de navegación para que el usuario pueda continuar
      setBibleVersion(version);
      setBibleBook(book);
      setBibleChapter(histVerse.chapter);
      setBibleVerses(verses);
      setBibleMode('nav');

      // 6. Proyectar y dejar lista la lista completa del capítulo
      sendVerse(target, verses);
    } catch { /* sin conexión */ }
  };

  // Scroll versículo activo al centro de la lista
  useEffect(() => {
    if (!activeVerse || !verseListRef.current) return;
    const el = verseListRef.current.querySelector(`[data-verse-id="${activeVerse.id}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [activeVerse]);

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

  // Cargar eventos al abrir el panel acordeón o cambiar de mes
  useEffect(() => { if (openPanels.has('eventos')) loadEvents(eventsYear, eventsMonth); }, [openPanels, eventsYear, eventsMonth, loadEvents]); // eslint-disable-line

  // Cargar plays al abrir detalle de evento
  useEffect(() => {
    if (eventDetail) {
      const occDate = eventDetail.is_recurring
        ? String(eventDetail.occurrence_date || eventDetail.date).split('T')[0]
        : null;
      actions.loadPlays(eventDetail.id, occDate);
    }
  }, [eventDetail?.id]); // eslint-disable-line

  useEffect(() => {
    seenSlideIdxBySongRef.current = new Map();
    autoMarkedSongIdsRef.current = new Set();
  }, [eventPlaysContext?.eventId, eventPlaysContext?.occurrenceDate]);

  // Publicar el schedule al contexto global cuando se abre/cierra un evento desde móvil
  // (necesario para que StagePage pueda mostrar la siguiente canción del listado)
  useEffect(() => {
    actions.setSchedule(eventDetail ? (eventDetail.songs ?? []) : []);
  }, [eventDetail?.id, eventDetail?.songs?.length]); // eslint-disable-line

  // Sincronizar diapo activa cuando el servidor navega (flechas prev/next)
  // Si está en negro, limpiar la selección
  useEffect(() => {
    if (isBlank) {
      setActiveSongSlideIndex(null);
    } else if (slideData?.type === 'song') {
      if (Number.isInteger(liveState?.slideIndex)) setActiveSongSlideIndex(liveState.slideIndex);
      else setActiveSongSlideIndex(null);
    } else if (slideData?.type === 'title') {
      setActiveSongSlideIndex(-1);
    } else if (slideData?.type === 'bible' && slideData.reference) {
      // Sincronizar versículo activo en móvil cuando el PC navega bíblicamente.
      // La referencia puede ser "Libro cap:verso" o "Libro cap:verso (N/M)" (multi-página)
      const match = slideData.reference.trim().match(/^(.+?)\s+(\d+):(\d+)/);
      if (match && bibleVerses.length) {
        const verseNum = parseInt(match[3], 10);
        const v = bibleVerses.find(vv => vv.verse === verseNum);
        if (v && v.id !== activeVerse?.id) {
          setActiveVerse(v);
          setActiveVerseList(bibleVerses);
        }
      }
    }
  }, [slideData, isBlank, liveState?.slideIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll a la diapo activa cuando cambia (centrada dentro del panel)
  useEffect(() => {
    if (!Number.isInteger(activeSongSlideIndex) || activeSongSlideIndex < 0 || !slideGridRef.current) return;
    const container = slideGridRef.current;
    const el = container.querySelector(`[data-slide-idx="${activeSongSlideIndex}"]`);
    if (!el) return;
    const containerTop    = container.getBoundingClientRect().top;
    const elTop           = el.getBoundingClientRect().top;
    const elOffsetInCont  = elTop - containerTop + container.scrollTop;
    const targetScroll    = elOffsetInCont - container.clientHeight / 2 + el.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [activeSongSlideIndex]);

  // Al abrir cualquier canción, ir al tope del grid
  useEffect(() => {
    if (!songDetail) return;
    const t = setTimeout(() => {
      slideGridRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }, 150);
    return () => clearTimeout(t);
  }, [songDetail?.id]); // eslint-disable-line

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
  const handlePrev  = () => {
    // ── Modo Biblia: navegar dentro de activeVerseList / páginas ──────────
    if (slideData?.type === 'bible') {
      if (!activeVerse) { trigger(() => actions.navigate('prev'), 'prev'); return; }
      if (activeSplit) {
        const { verse: sv, pages, pageIdx, list } = activeSplit;
        if (pageIdx > 0) {
          // Retroceder a la página anterior del mismo versículo
          const total = pages.length;
          const newIdx = pageIdx - 1;
          const pageRef = (n) => `${sv.book_name} ${sv.chapter}:${sv.verse} (${n + 1}/${total})`;
          setActiveSplit({ ...activeSplit, pageIdx: newIdx });
          setFlash('prev'); setTimeout(() => setFlash(null), 200);
          actions.showSlide({
            type: 'bible',
            slideData:     makeVerseSD(pages[newIdx], pageRef(newIdx), sv.version, sv.text, `${sv.book_name} ${sv.chapter}:${sv.verse}`),
            nextSlideData: makeVerseSD(pages[newIdx + 1], pageRef(newIdx + 1), sv.version, sv.text, `${sv.book_name} ${sv.chapter}:${sv.verse}`),
          });
          return;
        }
        // Página 0: ir al versículo anterior de la lista
        const i = list.findIndex(v => v.id === sv.id);
        if (i > 0) { setFlash('prev'); setTimeout(() => setFlash(null), 200); sendVerse(list[i - 1], list); }
        return;
      }
      const list = activeVerseList;
      const i = list.findIndex(v => v.id === activeVerse.id);
      if (i > 0) { setFlash('prev'); setTimeout(() => setFlash(null), 200); sendVerse(list[i - 1], list); }
      return;
    }
    const slides = effectiveSongSlides;
    // Si el servidor tiene activa una canción diferente a la cargada en el móvil,
    // navegar localmente (enviar navigate haría que el servidor naviegue la canción anterior)
    if (slides?.length && songDetail && slideData?.type === 'song' && slideData.songId && songDetail.id !== slideData.songId) {
      const currentIdx = Number.isInteger(activeSongSlideIndex) ? activeSongSlideIndex : 0;
      const newIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
      setFlash('prev'); setTimeout(() => setFlash(null), 200);
      if (slides[newIdx]) sendSlide(songDetail, slides[newIdx], slides, { slideIndexOverride: newIdx });
      return;
    }
    trigger(() => actions.navigate('prev'), 'prev');
  };
  const handleNext  = () => {
    // ── Modo Biblia: navegar dentro de activeVerseList / páginas ──────────
    if (slideData?.type === 'bible') {
      if (!activeVerse) { trigger(() => actions.navigate('next'), 'next'); return; }
      if (activeSplit) {
        const { verse: sv, pages, pageIdx, list } = activeSplit;
        const total = pages.length;
        const pageRef = (n) => total > 1 ? `${sv.book_name} ${sv.chapter}:${sv.verse} (${n + 1}/${total})` : `${sv.book_name} ${sv.chapter}:${sv.verse}`;
        if (pageIdx < total - 1) {
          // Avanzar a la siguiente página del mismo versículo
          const newIdx = pageIdx + 1;
          setActiveSplit({ ...activeSplit, pageIdx: newIdx });
          const si  = list.findIndex(v => v.id === sv.id);
          const nx  = si >= 0 && si < list.length - 1 ? list[si + 1] : null;
          actions.showSlide({
            type: 'bible',
            slideData:     makeVerseSD(pages[newIdx], pageRef(newIdx), sv.version, sv.text, `${sv.book_name} ${sv.chapter}:${sv.verse}`),
            nextSlideData: newIdx < total - 1
              ? makeVerseSD(pages[newIdx + 1], pageRef(newIdx + 1), sv.version, sv.text, `${sv.book_name} ${sv.chapter}:${sv.verse}`)
              : (nx ? makeVerseSD(nx.text, `${nx.book_name} ${nx.chapter}:${nx.verse}`, nx.version) : null),
          });
          setFlash('next'); setTimeout(() => setFlash(null), 200);
          return;
        }
        // Última página: ir al siguiente versículo
        const si = list.findIndex(v => v.id === sv.id);
        if (si >= 0 && si < list.length - 1) {
          setFlash('next'); setTimeout(() => setFlash(null), 200);
          sendVerse(list[si + 1], list);
        }
        return;
      }
      const list = activeVerseList;
      const i = list.findIndex(v => v.id === activeVerse.id);
      if (i >= 0 && i < list.length - 1) {
        setFlash('next'); setTimeout(() => setFlash(null), 200);
        sendVerse(list[i + 1], list);
      }
      return;
    }
    const slides = effectiveSongSlides;
    // Si el servidor tiene activa una canción diferente a la cargada en el móvil,
    // navegar localmente en lugar de enviar navigate (evita proyectar slides de la canción anterior)
    if (slides?.length && songDetail && slideData?.type === 'song' && slideData.songId && songDetail.id !== slideData.songId) {
      const currentIdx = Number.isInteger(activeSongSlideIndex) ? activeSongSlideIndex : -1;
      const newIdx = currentIdx < 0 ? 0 : currentIdx + 1;
      if (newIdx < slides.length) {
        setFlash('next'); setTimeout(() => setFlash(null), 200);
        sendSlide(songDetail, slides[newIdx], slides, { slideIndexOverride: newIdx });
      }
      return;
    }
    // Misma canción: lógica original con auto-avance al final del setlist
    const isAtLastSlide = Number.isInteger(liveState?.slideIndex) && slides?.length > 0 && liveState.slideIndex === (slides.length - 1);
    if (slideData?.type === 'song' && isAtLastSlide && schedule?.length) {
      const currentIdx = schedule.findIndex(it => String(it.song_id) === String(songDetail.id));
      let nextItem = null;
      if (currentIdx >= 0) {
        for (let i = currentIdx + 1; i < schedule.length; i++) {
          if (schedule[i].item_type === 'separator') break; // No cruzar secciones
          if (schedule[i].song_id) { nextItem = schedule[i]; break; }
        }
      }
      if (nextItem) {
        setFlash('next'); setTimeout(() => setFlash(null), 200);
        setLoadingSong(true);
        actions.loadSongDetail(nextItem.song_id).then(detail => { // eslint-disable-line
          setSongDetail(detail);
          const nextSlides = resolveSlidesForSongDetail(detail);
          // showTitle=true: el auto-avance SÍ muestra la diapositiva de título
          if (nextSlides?.length > 0) sendSlide(detail, nextSlides[0], nextSlides, { showTitle: true, slideIndexOverride: 0 }); // eslint-disable-line
        }).finally(() => setLoadingSong(false));
        return;
      }
    }
    trigger(() => actions.navigate('next'), 'next');
  };

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
    }
    touchStart.current = null;
  };

  // ── Canciones ────────────────────────────────────────────────────────────
  const openSong = async (id) => {
    setActiveSongSlideIndex(null);   // limpiar indicador activo al cambiar canción
    setLoadingSong(true);
    try { setSongDetail(await actions.loadSongDetail(id)); }
    finally { setLoadingSong(false); }
  };

  // PC seleccionó una canción → el móvil la abre y cambia al tab de canciones
  useEffect(() => {
    if (!remoteSongSelected?.songId) return;
    openSong(remoteSongSelected.songId);
    setTab('songs');
  }, [remoteSongSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  // showTitle=false (default): el clic directo NO muestra diapositiva de título
  // showTitle=true: el auto-avance SÍ muestra diapositiva de título
  const sendSlide = (song, slide, slides, opts = {}) => {
    const { showTitle = false, slideIndexOverride = null } = opts || {};
    // Slide de título → enviar como 'title-direct' para que el servidor no lo intercepte
    if (slide.type === 'title') {
      const firstSlide = slides?.[0] || null;
      setActiveSongSlideIndex(-1);
      actions.showSlide({
        type: 'title-direct',
        slides,
        slideData: { type: 'title', songId: song.id, songTitle: song.title, songKey: song.song_key || null },
        nextSlideData: firstSlide ? { type: 'song', label: firstSlide.label, content: firstSlide.content } : null,
      });
      return;
    }
    const idx = Number.isInteger(slideIndexOverride)
      ? Math.max(0, Math.min(slides.length - 1, slideIndexOverride))
      : slides.findIndex(s => s.id === slide.id);
    const next = slides[idx + 1] || null;
    setActiveSongSlideIndex(idx);
    actions.selectSlide(slide);
    actions.showSlide({
      type:                'song',
      slides,
      slideIndex:          idx,
      skipTitleIntercept:  !showTitle,  // true = ir directo al slide sin mostrar título
      slideData:           { type: 'song', songId: song.id, slideId: slide.id, slideIndex: idx, songTitle: song.title, songKey: song.song_key || null, slideBackground: slide.slide_background || null, label: slide.label, content: slide.content },
      nextSlideData:       next ? { type: 'song', label: next.label, content: next.content } : null,
    });

  };

  // playsCtx debe declararse ANTES del useEffect que lo usa en su dependency array
  // para evitar TDZ en el bundle de producción (const no es hoisted).
  const playsCtx = useMemo(() => {
    if (eventPlaysContext?.eventId) {
      return {
        eventId: eventPlaysContext.eventId,
        occurrenceDate: eventPlaysContext.occurrenceDate || null,
      };
    }
    if (eventDetail?.id) {
      return {
        eventId: eventDetail.id,
        occurrenceDate: eventDetail.is_recurring
          ? String(eventDetail.occurrence_date || eventDetail.date).split('T')[0]
          : null,
      };
    }
    return null;
  }, [eventPlaysContext?.eventId, eventPlaysContext?.occurrenceDate, eventDetail?.id, eventDetail?.is_recurring, eventDetail?.occurrence_date, eventDetail?.date]);

  // allStructures y effectiveSongSlides también deben declararse ANTES del useEffect
  // auto-mark que los usa en su dependency array (mismo problema TDZ que playsCtx).
  const allStructures = useMemo(() => {
    if (!songDetail) return [];
    if (Array.isArray(songDetail.structures) && songDetail.structures.length > 0) return songDetail.structures;
    if (Array.isArray(songDetail.structure) && songDetail.structure.length > 0) {
      return [{ name: 'Estructura 1', items: songDetail.structure }];
    }
    return [];
  }, [songDetail?.id, songDetail?.structures, songDetail?.structure]);

  const effectiveSongSlides = useMemo(() => {
    const rawSlides = Array.isArray(songDetail?.slides) ? songDetail.slides : [];
    const items = allStructures[Math.min(activeStructIdx, Math.max(0, allStructures.length - 1))]?.items ?? [];
    return buildOrderedSlides(rawSlides, items);
  }, [songDetail?.id, songDetail?.slides, allStructures, activeStructIdx]);

  // Auto-marcar como tocada al 50% al navegar en vivo (botones prev/next o click slide)
  useEffect(() => {
    if (slideData?.type !== 'song') return;
    const songId = slideData?.songId;
    const idx = Number.isInteger(liveState?.slideIndex) ? liveState.slideIndex : null;
    if (!songId || idx == null || idx < 0) return;
    if (!playsCtx?.eventId) return;
    if (eventPlays?.has(songId) || autoMarkedSongIdsRef.current.has(songId)) return;

    const total = (songDetail?.id === songId && effectiveSongSlides.length > 0)
      ? effectiveSongSlides.length
      : (Number.isInteger(liveState?.totalSlides) ? liveState.totalSlides : 0);
    if (!total || total <= 0) return;

    let seenSet = seenSlideIdxBySongRef.current.get(songId);
    if (!seenSet) {
      seenSet = new Set();
      seenSlideIdxBySongRef.current.set(songId, seenSet);
    }
    seenSet.add(idx);

    const seen = seenSet.size;
    const pct = seen / total;
    if (pct >= 0.5) {
      autoMarkedSongIdsRef.current.add(songId);
      actions.markPlayed(playsCtx.eventId, playsCtx.occurrenceDate || null, songId, seen, total, false)
        .catch(() => {
          autoMarkedSongIdsRef.current.delete(songId);
        });
    }
  }, [
    slideData?.type,
    slideData?.songId,
    liveState?.slideIndex,
    liveState?.totalSlides,
    playsCtx?.eventId,
    playsCtx?.occurrenceDate,
    eventPlays,
    songDetail?.id,
    effectiveSongSlides.length,
  ]);

  // ── Ajustes ──────────────────────────────────────────────────────────────
  const saveSettings = () => {
    localStorage.setItem('aio_server_ip',   cfgIp.trim());
    localStorage.setItem('aio_server_port', cfgPort.trim());
    setCfgSaved(true);
    setTimeout(() => forceRefreshApp('/mobile'), 600);
  };

  // Auto-abrir panel Grid cuando se selecciona una canción
  useEffect(() => {
    if (songDetail) {
      setOpenPanels(prev => new Set([...prev, 'grid']));
    }
  }, [songDetail?.id]);

  // Auto-cargar songDetail cuando hay un slide de canción activo pero songDetail es null o diferente
  useEffect(() => {
    const activeSongId = slideData?.songId;
    if (!activeSongId) return;
    if (slideData?.type !== 'song' && slideData?.type !== 'title') return;
    if (songDetail?.id === activeSongId) return;
    openSong(activeSongId);
  }, [slideData?.songId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantener la estructura activa por canción (igual que en escritorio)
  useEffect(() => {
    if (!songDetail?.id) return;
    const saved = localStorage.getItem(`aio_active_struct_${songDetail.id}`);
    setActiveStructIdx(saved !== null ? Math.max(0, parseInt(saved, 10) || 0) : 0);
  }, [songDetail?.id]);

  useEffect(() => {
    if (!songDetail?.id) return;
    localStorage.setItem(`aio_active_struct_${songDetail.id}`, String(activeStructIdx));
  }, [activeStructIdx, songDetail?.id]);

  // Si el escritorio ya está proyectando esta canción, elegir automáticamente
  // la estructura del móvil que mejor coincide con el estado en vivo (total/index/slideId).
  useEffect(() => {
    if (!songDetail?.id) return;
    if (!allStructures.length || allStructures.length === 1) return;
    if (slideData?.songId !== songDetail.id) return;

    const liveTotal = Number.isInteger(liveState?.totalSlides) ? liveState.totalSlides : null;
    const liveIdx = Number.isInteger(liveState?.slideIndex) ? liveState.slideIndex : null;
    const liveSlideId = slideData?.slideId || null;
    if (liveTotal == null && liveIdx == null && !liveSlideId) return;

    const rawSlides = Array.isArray(songDetail.slides) ? songDetail.slides : [];
    const candidates = allStructures.map((s, i) => {
      const slides = buildOrderedSlides(rawSlides, s?.items ?? []);
      let score = 0;

      if (liveTotal != null && slides.length === liveTotal) score += 100;

      if (liveSlideId) {
        const idxs = [];
        for (let j = 0; j < slides.length; j++) {
          if (String(slides[j]?.id) === String(liveSlideId)) idxs.push(j);
        }
        if (idxs.length > 0) score += 20;
        if (liveIdx != null && idxs.length > 0) {
          if (idxs.includes(liveIdx)) {
            score += 80;
          } else {
            const minDiff = Math.min(...idxs.map(v => Math.abs(v - liveIdx)));
            score += Math.max(0, 30 - minDiff);
          }
        }
      }

      if (i === activeStructIdx) score += 1; // desempate estable
      return { i, score };
    });

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best && best.i !== activeStructIdx) {
      setActiveStructIdx(best.i);
    }
  }, [
    songDetail?.id,
    songDetail?.slides,
    allStructures,
    activeStructIdx,
    slideData?.songId,
    slideData?.slideId,
    liveState?.slideIndex,
    liveState?.totalSlides,
  ]);

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
  const stageBgStyle = (() => {
    const bg = sc.background ?? { type: 'color', color: '#000000' };
    return bg.type === 'color'
      ? { backgroundColor: bg.color ?? '#000000' }
      : { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  })();
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
            <button onClick={() => { setSongDetail(null); setActiveSongSlideIndex(null); setSongEditMode(false); setSongOriginTab('songs'); }} className="flex items-center gap-1.5 text-zinc-300">
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
          <div className="flex flex-col leading-tight">
            <span className="text-accent font-bold text-base tracking-tight">AIO Presenter</span>
            <span className="text-[10px] text-zinc-500">v{BUILD_VERSION}</span>
          </div>
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
                  const cleanedLinks = (Array.isArray(songDetail.links) ? songDetail.links : (Array.isArray(songDetail.song_links) ? songDetail.song_links : []))
                    .map((l, i) => ({
                      title: String(l?.title || l?.link_title || '').trim() || `Link ${i + 1}`,
                      url: String(l?.url || '').trim(),
                    }))
                    .filter(l => l.url);
                  await actions.updateSong(songDetail.id, {
                    title:    songEditData.title.trim(),
                    author:   songEditData.author || null,
                    song_key: songEditData.songKey || null,
                    bpm:      songEditData.bpm !== '' ? songEditData.bpm : null,
                    time_sig: songEditData.timeSig || null,
                    links:    cleanedLinks,
                    link:     cleanedLinks[0]?.url || songEditData.link || null,
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
                onClick={() => forceRefreshApp('/mobile')}
                title="Forzar refresh"
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
              {/* Stage view (fullscreen overlay con StagePreview proporcional) */}
              {liveView === 'stage' && (() => {
                const availW = window.innerWidth;
                const availH = window.innerHeight;
                // Escala proporcional: StagePreview está diseñado para 7px en ~260px de ancho
                const fontPx = Math.max(10, Math.round(7 * Math.min(availW, availH * 16 / 9) / 260));
                return (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Barra mínima con botón Volver */}
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.75)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px' }}>
                      <button
                        onClick={() => setLiveView('control')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.6)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        <ChevronLeft size={16} /> Volver
                      </button>
                    </div>
                    {/* Vista de escenario proporcional */}
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      <StagePreview
                        stageBgStyle={stageBgStyle}
                        slideData={slideData}
                        nextSlideData={nextSlideData}
                        isBlank={isBlank}
                        live={!isBlank && !!slideData}
                        stageConfig={stageConfig ?? {}}
                        schedule={schedule ?? []}
                        eventPlays={eventPlays}
                        reservasMode={reservasMode}
                        fontBase={`${fontPx}px`}
                      />
                    </div>
                  </div>
                );
              })()}

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

              {/* ── Vincular presentador por PIN ── */}
              <div className="mx-4 mb-3 rounded-xl border border-surface-600 bg-surface-900/60 overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between border-b border-surface-700">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Presentador vinculado</span>
                  {currentPin
                    ? <span className="text-xs font-mono font-bold text-accent bg-accent/15 px-2 py-0.5 rounded">{currentPin}</span>
                    : <span className="text-xs text-zinc-600 italic">sin vincular</span>
                  }
                </div>
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="PIN (6 car.)"
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.toLowerCase().slice(0, 6))}
                    className="flex-1 bg-surface-800 border border-surface-600 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-600 font-mono outline-none focus:border-accent"
                  />
                  <button
                    onClick={autoDetectPin}
                    disabled={pinDetecting}
                    className="px-2.5 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-zinc-300 active:bg-surface-600 shrink-0"
                    title="Auto-detectar presentador en la red"
                  >
                    {pinDetecting ? '...' : 'Auto'}
                  </button>
                  <button
                    onClick={() => applyPresenterPin(pinInput)}
                    disabled={!pinInput || pinInput.length < 4}
                    className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold active:bg-accent/80 disabled:opacity-40 shrink-0"
                  >
                    Vincular
                  </button>
                </div>
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
                {slideData?.type === 'song' && slideData?.songId && playsCtx && (
                  <button
                    onClick={async () => {
                      const id = slideData.songId;
                      if (eventPlays?.has(id)) {
                        await actions.unmarkPlayed(playsCtx.eventId, playsCtx.occurrenceDate, id);
                        autoMarkedSongIdsRef.current.delete(id);
                        seenSlideIdxBySongRef.current.delete(id);
                      } else {
                        await actions.markPlayed(playsCtx.eventId, playsCtx.occurrenceDate, id, 0, 0, true);
                        autoMarkedSongIdsRef.current.add(id);
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
                      onClick={() => sendSlide(songDetail, { type: 'title' }, effectiveSongSlides)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer active:scale-95 transition-all ${
                        ((activeSongSlideIndex === -1 && slideData?.songId === songDetail?.id) || (slideData?.type === 'title' && slideData?.songId === songDetail?.id && !isBlank))
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
                  {(effectiveSongSlides || []).map((slide, idx) => {
                    const labelColor = getLabelColor(slide.label);
                    const isActive   = activeSongSlideIndex === idx;
                    return (
                      <div
                        key={`${slide.id}-${idx}`}
                        data-slide-idx={idx}
                        onClick={() => sendSlide(songDetail, slide, effectiveSongSlides, { slideIndexOverride: idx })}
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
                        <div className="flex-1 text-zinc-300 leading-relaxed min-w-0" style={{ fontSize: 'clamp(0.85rem, 3.5vw, 1rem)' }}>
                          {(() => {
                            const parsed = parseSlideContent(slide.content);
                            const hasLyrics = parsed.some(l => l.kind === 'lyric');
                            return parsed
                              .filter(l => l.kind === 'comment' || (hasLyrics ? l.kind === 'lyric' : l.kind === 'chord'))
                              .slice(0, 4)
                              .map((l, idx) => {
                                if (l.kind === 'comment') return <div key={idx} style={{ color: sc.commentColor ?? '#facc15', fontStyle: 'italic' }}>{l.text}</div>;
                                if (l.kind === 'chord')   return <div key={idx} style={{ color: sc.chordsColor ?? '#fde047', fontWeight: '600' }}>{l.chords.join(' — ')}</div>;
                                return <div key={idx}>{l.text}</div>;
                              });
                          })()}
                        </div>
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
                  {allStructures.length > 1 && (
                    <div className="mb-1">
                      <select
                        value={activeStructIdx}
                        onChange={(e) => setActiveStructIdx(parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-surface-800 border border-surface-600 rounded-xl px-3 py-2 text-xs text-zinc-200"
                      >
                        {allStructures.map((s, i) => (
                          <option key={i} value={i}>{s.name || `Estructura ${i + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(effectiveSongSlides || []).map((slide, idx) => (
                    <button
                      key={`${slide.id}-${idx}`}
                      data-slide-idx={idx}
                      onClick={() => sendSlide(songDetail, slide, effectiveSongSlides, { slideIndexOverride: idx })}
                      className={`w-full text-left px-4 py-5 rounded-xl border-2 transition-colors ${
                        activeSongSlideIndex === idx
                          ? 'bg-accent/10 border-accent shadow-[0_0_0_1px_var(--accent)]'
                          : 'bg-surface-800 active:bg-surface-700 border-surface-700'
                      }`}
                    >
                      {slide.label && (
                        <span className={`inline-block text-[10px] font-semibold rounded px-1.5 py-0.5 mb-2 border ${
                          activeSongSlideIndex === idx
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
            <div className="px-4 pt-3 pb-2 shrink-0 border-b border-surface-700">
              {/* Selector de mes */}
              <div className="flex items-center justify-between mb-2">
                <button
                  onPointerDown={() => {
                    if (eventsMonth === 0) { setEventsYear(y => y - 1); setEventsMonth(11); }
                    else setEventsMonth(m => m - 1);
                  }}
                  className="p-1.5 rounded-lg active:bg-surface-700 text-zinc-400"
                ><ChevronLeft size={15} /></button>
                <span className="text-sm font-semibold text-zinc-200">{MONTHS_ES_MOB[eventsMonth]} {eventsYear}</span>
                <button
                  onPointerDown={() => {
                    if (eventsMonth === 11) { setEventsYear(y => y + 1); setEventsMonth(0); }
                    else setEventsMonth(m => m + 1);
                  }}
                  className="p-1.5 rounded-lg active:bg-surface-700 text-zinc-400"
                ><ChevronRight size={15} /></button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">Eventos del mes</p>
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
                <p className="text-center text-zinc-600 text-sm pt-10">Sin eventos este mes</p>
              )}
              {!eventsLoading && events.length > 0 && (() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const evKey = ev => String(ev.occurrence_date || ev.date).slice(0, 10);
                const upcoming = events
                  .filter(ev => evKey(ev) >= todayStr)
                  .sort((a, b) => evKey(a).localeCompare(evKey(b)));
                const past = events
                  .filter(ev => evKey(ev) < todayStr)
                  .sort((a, b) => evKey(b).localeCompare(evKey(a)));

                const renderEvCard = (ev) => (
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
                );

                return (
                  <>
                    {upcoming.length === 0 && past.length === 0 && (
                      <p className="text-center text-zinc-600 text-sm pt-10">Sin eventos este mes</p>
                    )}
                    {upcoming.map(renderEvCard)}
                    {past.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setPastEventsOpen(v => !v)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-800/50 border border-surface-700/50 text-zinc-500 text-xs font-semibold mb-2"
                        >
                          {pastEventsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          Eventos Pasados ({past.length})
                        </button>
                        {pastEventsOpen && (
                          <div className="space-y-2 opacity-60">
                            {past.map(renderEvCard)}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
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
                              autoMarkedSongIdsRef.current.delete(item.song_id);
                              seenSlideIdxBySongRef.current.delete(item.song_id);
                            } else {
                              await actions.markPlayed(eventDetail.id, occDate, item.song_id, 0, 0, true);
                              autoMarkedSongIdsRef.current.add(item.song_id);
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
            <div className="flex flex-col overflow-hidden" style={{ height: '65vh' }}>
        {/* ──── BIBLIA ──── */}
        {true && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
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
                  <div className="shrink-0 border-t border-surface-700 px-3 py-2.5 flex items-center justify-center gap-2 bg-surface-900/80">
                    {activeSplit ? (
                      <span className="text-xs text-accent font-semibold">
                        {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse} &middot; {activeSplit.pageIdx + 1}/{activeSplit.pages.length}
                      </span>
                    ) : (
                      <span className="text-xs text-accent font-semibold">
                        {activeVerse.book_name} {activeVerse.chapter}:{activeVerse.verse}
                      </span>
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
                        onClick={() => navigateToVerseInContext(h)}
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
                  <div className="shrink-0 border-t border-surface-700 px-3 py-2.5 flex items-center justify-center bg-surface-900/80">
                    {activeSplit ? (
                      <span className="text-xs text-accent font-semibold">
                        {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse} &middot; {activeSplit.pageIdx + 1}/{activeSplit.pages.length}
                      </span>
                    ) : (
                      <p className="text-xs text-accent font-semibold truncate">
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
                    <div ref={verseListRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                      {bibleVerses.length === 0 && (
                        <div className="flex justify-center pt-8">
                          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {bibleVerses.map(v => (
                        <button
                          key={v.id}
                          data-verse-id={v.id}
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
                      <div className="shrink-0 border-t border-surface-700 px-3 py-2.5 flex items-center justify-center gap-2 bg-surface-900/80">
                        {activeSplit ? (
                          <span className="text-xs text-accent font-semibold">
                            {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse} · {activeSplit.pageIdx + 1}/{activeSplit.pages.length}
                          </span>
                        ) : (
                          <span className="text-xs text-accent font-semibold">
                            {activeVerse?.book_name} {activeVerse?.chapter}:{activeVerse?.verse}
                          </span>
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
              {/* Vincular presentador por PIN (acceso persistente desde Ajustes) */}
              <MobileSettingsSection title="Vincular presentador (PIN)">
                <div className="mb-3 rounded-xl border border-surface-600 bg-surface-900/60 overflow-hidden">
                  <div className="px-3 py-2 flex items-center justify-between border-b border-surface-700">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Presentador vinculado</span>
                    {currentPin
                      ? <span className="text-xs font-mono font-bold text-accent bg-accent/15 px-2 py-0.5 rounded">{currentPin}</span>
                      : <span className="text-xs text-zinc-600 italic">sin vincular</span>
                    }
                  </div>
                  <div className="px-3 py-2.5 flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="PIN (6 car.)"
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value.toLowerCase().slice(0, 6))}
                      className="flex-1 bg-surface-800 border border-surface-600 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-zinc-600 font-mono outline-none focus:border-accent"
                    />
                    <button
                      onClick={autoDetectPin}
                      disabled={pinDetecting}
                      className="px-2.5 py-1.5 rounded-lg bg-surface-700 border border-surface-600 text-xs text-zinc-300 active:bg-surface-600 shrink-0"
                      title="Auto-detectar presentador en la red"
                    >
                      {pinDetecting ? '...' : 'Auto'}
                    </button>
                    <button
                      onClick={() => applyPresenterPin(pinInput)}
                      disabled={!pinInput || pinInput.length < 4}
                      className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold active:bg-accent/80 disabled:opacity-40 shrink-0"
                    >
                      Vincular
                    </button>
                  </div>
                </div>
              </MobileSettingsSection>

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
  const lastFireRef = useRef(0);
  const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
  const fire = (e) => {
    e?.preventDefault?.();
    const now = Date.now();
    if (now - lastFireRef.current < 180) return;
    lastFireRef.current = now;
    onPointerDown?.();
  };

  return (
    <button
      onPointerDown={supportsPointer ? fire : undefined}
      onClick={!supportsPointer ? fire : undefined}
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

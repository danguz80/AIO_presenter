import { useEffect, useReducer, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../hooks/useApi';
import { PresenterContext } from './presenterContextInstance';

// ─── stageConfig por defecto + persistencia en localStorage ─────────────────
const DEFAULT_STAGE_CONFIG = {
  background:       { type: 'color', color: '#1e1e2e' },
  showClock:        true,
  showNextSlide:    true,
  showSongTitle:    true,
  showSlideCounter: true,
  showSectionLabel: true,
  showSideLabel:    true,
  lyricsColor:  '#ffffff',
  nextLyricsColor: '#ffffff',
  chordsColor:  '#fde047',
  clockColor:   '#ef4444',
  nextColor:    '#22c55e',
  fontSize:        36,
  fontFamily:      'sans',
  fontFamilyTitle: 'sans',
  fontBold:        true,
  fontItalic:      false,
  fontStrokeWidth: 0,
  fontStrokeColor: '#000000',
  fontSizeCounter:    14,
  fontSizeTitle:      16,
  fontSizeLabel:      11,
  fontSizeSideLabel:  13,
  fontSizeClock:      22,
  fontSizeNextSong:   16,
  fontSizeNextLyrics: 32,
  fontSizeChords:     18,
  customFonts: [],
};

function loadStageConfig() {
  try {
    const saved = localStorage.getItem('aio_stage_config');
    if (saved) return { ...DEFAULT_STAGE_CONFIG, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_STAGE_CONFIG;
}

// ─── Estado inicial ───────────────────────────────────────────────────────────
const initialState = {
  // Biblioteca
  songs:    [],
  schedule: [],

  // Selección en el controlador
  selectedSong:  null,   // canción completa con slides
  selectedSlide: null,   // slide activo en previsualización

  // Estado en vivo
  liveState: {
    type:          null,
    slideData:     null,
    nextSlideData: null,
    isBlank:       false,
    slideIndex:    null,
    totalSlides:   null,
    background:    { color: '#000000', type: 'color' },
  },

  // Configuración pantalla de escenario
  stageConfig: loadStageConfig(),

  // Plantillas de pantalla de escenario (se cargan desde el servidor al conectar)
  stageTemplates: [],


  // Configuración salida virtual / NDI
  virtualConfig: {
    background:  { type: 'transparent' },
    chromaColor: '#00b140',
    fontSize:    'auto',
    fontSizePx:  48,
    fontFamily:  'sans',
    fontBold:    false,
    fontItalic:  false,
    fontColor:   '#ffffff',
    fontStrokeWidth: 0,
    fontStrokeColor: '#000000',
    alignX:      'center',
    alignY:      'center',
    textBg:         false,
    textBgColor:    '#000000',
    textBgOpacity:  0.5,
    textBgShape:    'rectangle',
    textBgPadX:     24,
    textBgPadY:     12,
    showComments: false,
    // Cita bíblica (referencia)
    bibleRefEnabled:   false,
    bibleRefFontSize:  24,
    bibleRefBgColor:   '#000000',
    bibleRefBgShape:   'rounded',
    bibleRefBgOpacity: 0.6,
    bibleRefPosition:  'bottom-right',
  },

  // Configuración pantalla principal (proyector)
  outputConfig: {
    // Tipografía letras
    lyricsColor:      '#ffffff',
    fontFamily:       'sans',
    fontBold:         false,
    fontItalic:       false,
    fontSize:         'auto',
    fontStrokeWidth:  0,
    fontStrokeColor:  '#000000',
    // Elementos visibles
    showLabel:        true,
    showSongTitle:    true,
    // Comentarios
    showComments:      false,
    commentColor:      '#facc15',
    commentFontSize:   16,
    commentFontFamily: 'sans',
    // Diapositiva de título
    titleSlideEnabled:  false,
    titleFontFamily:    'sans',
    titleFontSize:      72,
    titleColor:         '#ffffff',
    titleShowArtist:    false,
    artistFontFamily:   'sans',
    artistFontSize:     36,
    artistColor:        '#aaaaaa',
    // Indicador de progreso de diapositivas
    progressEnabled:  false,
    progressPosition: 'bottom-right',
    progressSize:     14,
    progressColor:    '#ffffff',
    // Ajuste de fondo multimedia
    backgroundFit: 'contain',
    // Plantilla especial para Biblia
    bibleTemplateEnabled: false,
    bibleBackground:      null,
    bibleFontFamily:      'sans',
    bibleFontSize:        'auto',
    bibleColor:           '#ffffff',
    bibleAlignment:       'center',
    bibleAlignmentY:      'center',
    bibleRefPosition:     'bottom',
    bibleRefShowBg:       false,
    bibleRefBgColor:      '#000000',
    bibleRefBgOpacity:    0.6,
    bibleRefColor:        '#cccccc',
    bibleRefFontFamily:   'sans',
    bibleRefFontSize:     24,
    bibleVersionPosition: 'inline-right',
    // Logo en pantalla en negro (blank)
    logoEnabled:   false,
    logoMedia:     null,   // { url, mediaType, fileName }
    logoSize:      30,     // % del ancho de pantalla
    logoPosition:  'center',
    logoBgColor:   '#000000',
    logoFit:       'contain',
  },

  // Plantillas de la pantalla principal
  outputTemplates: [],
  // Plantillas streaming/virtual
  virtualTemplates: [],

  // Canciones tocadas del evento activo: Set de song_ids
  eventPlays: new Set(),        // song_ids ya tocadas
  eventPlaysContext: null,      // { eventId, occurrenceDate } para saber a qué evento pertenecen

  // Configuración de asignación de pantallas físicas
  displayConfig: {
    principalScreenId:   null,
    escenarioScreenId:   null,
    principalResolution: { width: 1920, height: 1080 },
    escenarioResolution: { width: 1920, height: 1080 },
    virtualResolution:   { width: 1920, height: 1080 },
    virtualOutputs:      [],
  },

  // Modo reservas: nextSong salta al separador de reservas
  reservasMode: false,

  // Tema de color de la UI
  appTheme: localStorage.getItem('aio_theme') ?? 'oscuro',

  // Solicitud de navegación desde móvil (u otro cliente)
  navigateRequest: null, // { dir: 'next'|'prev', ts: number }

  // Canción pendiente de cargar (sincronización desde otro cliente)
  pendingSongId:  null,
  pendingSlideId: null,
  // Bloquea la auto-sincronización cuando el usuario eligió una canción explícitamente
  syncLocked: false,

  // Canción seleccionada remotamente (PC → móvil)
  remoteSongSelected: null, // { songId, ts }

  // Socket
  connected: false,
  // Mensajería
  connectedUsers: [],
  internalMessages: [],
  screenMessage: { text: '', target: 'both', visible: false },
  timerState: { type: 'countdown', seconds: 0, running: false, label: '' },
};

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'SET_SONGS':
      return { ...state, songs: action.payload };
    case 'ADD_SONG':
      return { ...state, songs: [action.payload, ...state.songs] };
    case 'UPDATE_SONG':
      return {
        ...state,
        songs: state.songs.map(s => s.id === action.payload.id ? action.payload : s),
      };
    case 'DELETE_SONG': {
      const keepSelected = state.selectedSong?.id !== action.payload;
      return {
        ...state,
        songs: state.songs.filter(s => s.id !== action.payload),
        selectedSong: keepSelected ? state.selectedSong : null,
        selectedSlide: keepSelected ? state.selectedSlide : null,
      };
    }
    case 'SET_SELECTED_SONG':
      // Limpiar pendingSongId para cancelar cualquier fetch obsoleto en vuelo
      // (el cleanup del efecto pendingSong pondrá cancelled=true).
      // syncLocked=true: impide que SYNC_LIVE_SONG sobreescriba esta selección
      // hasta que el móvil reproduzca la misma canción que el PC tiene abierta.
      return { ...state, selectedSong: action.payload, selectedSlide: null, pendingSongId: null, pendingSlideId: null, syncLocked: true };
    case 'SET_SELECTED_SLIDE':
      return { ...state, selectedSlide: action.payload };
    case 'SET_LIVE_STATE':
      return { ...state, liveState: action.payload };
    case 'SYNC_LIVE_SONG': {
      const { songId, slideId } = action.payload;
      if (state.selectedSong?.id === songId) {
        // El móvil está en la misma canción que el PC → desbloquear sync
        // (si el usuario tenía syncLocked, ahora ambos coinciden, se puede volver a seguir)
        return state.syncLocked ? { ...state, syncLocked: false } : state;
      }
      // Canción diferente: si el usuario bloqueó el sync, ignorar
      if (state.syncLocked) return state;
      // Auto-sincronizar: marcar pendiente de carga
      return { ...state, pendingSongId: songId, pendingSlideId: slideId };
    }
    case 'SET_STAGE_CONFIG':
      return { ...state, stageConfig: { ...DEFAULT_STAGE_CONFIG, ...state.stageConfig, ...action.payload } };
    case 'SET_STAGE_TEMPLATES':
      return { ...state, stageTemplates: action.payload };
    case 'SET_SCHEDULE':
      return { ...state, schedule: action.payload };
    case 'SET_VIRTUAL_CONFIG':
      return { ...state, virtualConfig: { ...state.virtualConfig, ...action.payload } };
    case 'SET_VIRTUAL_TEMPLATES':
      return { ...state, virtualTemplates: action.payload };
    case 'SET_OUTPUT_CONFIG':
      return { ...state, outputConfig: { ...state.outputConfig, ...action.payload } };
    case 'SET_OUTPUT_TEMPLATES':
      return { ...state, outputTemplates: action.payload };
    case 'NAVIGATE':
      return { ...state, navigateRequest: action.payload };
    case 'SET_PENDING_SONG':
      // La canción se sincronizó desde el móvil → desbloquear para seguir sincronizando
      return { ...state, selectedSong: action.payload.song, selectedSlide: action.payload.slide, pendingSongId: null, pendingSlideId: null, syncLocked: false };
    case 'SET_REMOTE_SONG_SELECTED':
      return { ...state, remoteSongSelected: action.payload };
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };
    case 'SET_EVENT_PLAYS':
      return { ...state, eventPlays: new Set(action.payload.ids), eventPlaysContext: action.payload.ctx };
    case 'ADD_EVENT_PLAY':
      return { ...state, eventPlays: new Set([...state.eventPlays, action.payload]) };
    case 'REMOVE_EVENT_PLAY': {
      const next = new Set(state.eventPlays);
      next.delete(action.payload);
      return { ...state, eventPlays: next };
    }
    case 'SET_RESERVAS_MODE':
      return { ...state, reservasMode: action.payload };
    case 'SET_DISPLAY_CONFIG':
      return { ...state, displayConfig: { ...state.displayConfig, ...action.payload } };
    case 'SET_APP_THEME':
      return { ...state, appTheme: action.payload };
    case 'SET_CONNECTED_USERS':
      return { ...state, connectedUsers: action.payload };
    case 'ADD_INTERNAL_MSG':
      return { ...state, internalMessages: [...state.internalMessages.slice(-49), action.payload] };
    case 'SET_SCREEN_MSG':
      return { ...state, screenMessage: action.payload };
    case 'SET_TIMER_STATE':
      return { ...state, timerState: action.payload };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

export function PresenterProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef  = useRef(null);
  const scheduleRef = useRef(initialState.schedule);
  const preBibleTemplateRef = useRef(null); // plantilla activa antes de entrar en modo bíblico
  // Refs estables para usar en listeners de video (evitar closures obsoletos)
  const timerStateRef = useRef(state.timerState);
  const socketSetTimerRef = useRef(null); // se llena cuando el socket está listo

  useEffect(() => { timerStateRef.current = state.timerState; }, [state.timerState]);

  // Mantener scheduleRef sincronizado con el estado
  useEffect(() => { scheduleRef.current = state.schedule; }, [state.schedule]);

  // Conectar Socket.io
  useEffect(() => {
    // En producción usa VITE_API_URL; en desarrollo usa IP/puerto guardado en localStorage
    let backendUrl;
    if (import.meta.env.VITE_API_URL) {
      backendUrl = import.meta.env.VITE_API_URL;
    } else {
      const savedIp   = localStorage.getItem('aio_server_ip');
      const savedPort = localStorage.getItem('aio_server_port') || '3001';
      const host      = savedIp || window.location.hostname;
      backendUrl = `http://${host}:${savedPort}`;
    }
    const token = localStorage.getItem('aio_sync_token');
    const orgId = localStorage.getItem('aio_org_id');
    // PIN de sesión del presentador: identifica esta instancia de ControllerPage.
    // Todos los dispositivos que quieran controlar este presentador deben usar el mismo PIN.
    let presenterPin = localStorage.getItem('aio_presenter_pin');
    if (!presenterPin) {
      presenterPin = Math.random().toString(16).slice(2, 8) + Math.random().toString(16).slice(2, 6);
      presenterPin = presenterPin.slice(0, 6);
      localStorage.setItem('aio_presenter_pin', presenterPin);
    }
    const socket = io(backendUrl, {
      autoConnect: true,
      auth: { token: token || undefined, orgId: orgId || undefined, presenterPin },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch({ type: 'SET_CONNECTED', payload: true });
      // Re-emitir schedule al reconectar
      if (scheduleRef.current?.length > 0) {
        socket.emit('schedule:update', scheduleRef.current);
      }
      // Registrar usuario para mensajería
      try {
        const tok = localStorage.getItem('aio_sync_token');
        if (tok) {
          const p = JSON.parse(atob(tok.split('.')[1]));
          socket.emit('user:register', { name: p.displayName || p.email || 'Usuario', avatar: p.avatar || null });
        }
      } catch { /* ignore */ }
    });
    socket.on('disconnect',   () => dispatch({ type: 'SET_CONNECTED', payload: false }));
    socket.on('live:state', (data) => {
      dispatch({ type: 'SET_LIVE_STATE', payload: data });
      // Si el slide activo cambió desde otro cliente (móvil o navegación server-side),
      // sincronizar selectedSong y selectedSlide para actualizar la grilla del controlador
      if (data.slideData?.type === 'song' && data.slideData.songId) {
        dispatch({ type: 'SYNC_LIVE_SONG', payload: data.slideData });
      }
    });
    socket.on('stage:config',    (data) => dispatch({ type: 'SET_STAGE_CONFIG',    payload: data }));
    socket.on('stage:templates', (data) => dispatch({ type: 'SET_STAGE_TEMPLATES', payload: data }));
    socket.on('schedule:update',  (data) => dispatch({ type: 'SET_SCHEDULE',        payload: data }));
    socket.on('virtual:config',  (data) => dispatch({ type: 'SET_VIRTUAL_CONFIG',  payload: data }));
    socket.on('output:config',   (data) => dispatch({ type: 'SET_OUTPUT_CONFIG',   payload: data }));
    socket.on('output:templates',  (data) => dispatch({ type: 'SET_OUTPUT_TEMPLATES',  payload: data }));
    socket.on('virtual:templates', (data) => dispatch({ type: 'SET_VIRTUAL_TEMPLATES', payload: data }));
    socket.on('navigate',          (dir)  => dispatch({ type: 'NAVIGATE',          payload: { dir, ts: Date.now() } }));
    socket.on('event:plays',       (data) => dispatch({ type: 'SET_EVENT_PLAYS',   payload: data }));
    socket.on('event:reservas_mode', (mode) => dispatch({ type: 'SET_RESERVAS_MODE', payload: mode }));
    socket.on('display:config',      (data) => dispatch({ type: 'SET_DISPLAY_CONFIG', payload: data }));
    socket.on('app:theme',           (theme) => dispatch({ type: 'SET_APP_THEME',     payload: theme }));
    // Mensajería
    socket.on('users:connected',     (data) => dispatch({ type: 'SET_CONNECTED_USERS', payload: data }));
    socket.on('msg:internal:receive',(data) => dispatch({ type: 'ADD_INTERNAL_MSG',   payload: data }));
    socket.on('msg:screen',          (data) => dispatch({ type: 'SET_SCREEN_MSG',     payload: data }));
    socket.on('msg:timer',           (data) => dispatch({ type: 'SET_TIMER_STATE',    payload: data }));
    socket.on('song:selected',         ({ songId, ts }) => dispatch({ type: 'SET_REMOTE_SONG_SELECTED', payload: { songId, ts } }));
    return () => socket.disconnect();
  }, []);

  // Cargar canciones al iniciar
  useEffect(() => {
    api.get('/songs').then(res => {
      dispatch({ type: 'SET_SONGS', payload: res.data });
    }).catch(console.error);
  }, []);

  // Cuando otro cliente cambia la canción activa, cargar el detalle completo
  // para sincronizar la grilla del controlador de escritorio.
  // IMPORTANTE: solo depende de pendingSongId (no de pendingSlideId) para evitar
  // lanzar múltiples fetch concurrentes por cada slide navegado, y usa `cancelled`
  // para descartar respuestas obsoletas si la canción vuelve a cambiar antes de
  // que resuelva el fetch anterior.
  useEffect(() => {
    if (!state.pendingSongId) return;
    const songId  = state.pendingSongId;
    const slideId = state.pendingSlideId; // valor al momento de iniciar el fetch
    let cancelled = false;
    api.get(`/songs/${songId}`).then(res => {
      if (cancelled) return; // respuesta obsoleta — ignorar
      const song  = res.data;
      const slide = song.slides?.find(s => s.id === slideId) || null;
      dispatch({ type: 'SET_PENDING_SONG', payload: { song, slide } });
    }).catch(console.error);
    return () => { cancelled = true; }; // cancelar si cambia la canción antes de resolver
  }, [state.pendingSongId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-swap de plantilla bíblica (siempre activo) ───────────────────────
  useEffect(() => {
    const type             = state.liveState?.slideData?.type;
    const bibleTemplateName = state.virtualConfig?.bibleTemplateName;
    const activeTemplate   = state.virtualConfig?.activeTemplateName ?? null;
    const templates        = state.virtualTemplates ?? [];

    if (!bibleTemplateName) return;

    if (type === 'bible') {
      if (activeTemplate !== bibleTemplateName) {
        preBibleTemplateRef.current = activeTemplate;
        const t = templates.find(tp => tp.name === bibleTemplateName);
        if (t) {
          const newConfig = { ...t.config, activeTemplateName: t.name };
          dispatch({ type: 'SET_VIRTUAL_CONFIG', payload: newConfig });
          socketRef.current?.emit('virtual:config', newConfig);
        }
      }
    } else if (type !== null) {
      // Saliendo del modo bíblico
      if (activeTemplate === bibleTemplateName) {
        const prev = preBibleTemplateRef.current;
        preBibleTemplateRef.current = null;
        if (prev) {
          const t = templates.find(tp => tp.name === prev);
          const newConfig = t
            ? { ...t.config, activeTemplateName: t.name }
            : { ...state.virtualConfig, activeTemplateName: prev };
          dispatch({ type: 'SET_VIRTUAL_CONFIG', payload: newConfig });
          socketRef.current?.emit('virtual:config', newConfig);
        } else {
          const newConfig = { ...state.virtualConfig, activeTemplateName: null };
          dispatch({ type: 'SET_VIRTUAL_CONFIG', payload: newConfig });
          socketRef.current?.emit('virtual:config', newConfig);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.liveState?.slideData?.type]);

  // ─── Acciones ────────────────────────────────────────────────────────────
  const actions = {
    loadSongDetail: async (id, { broadcast = false } = {}) => {
      const res = await api.get(`/songs/${id}`);
      dispatch({ type: 'SET_SELECTED_SONG', payload: res.data });
      if (broadcast) {
        socketRef.current?.emit('song:selected', { songId: id, ts: Date.now() });
      }
      return res.data;
    },

    createSong: async (data) => {
      const res = await api.post('/songs', data);
      dispatch({ type: 'ADD_SONG', payload: res.data });
      return res.data;
    },

    updateSong: async (id, data) => {
      const res = await api.put(`/songs/${id}`, data);
      dispatch({ type: 'UPDATE_SONG', payload: res.data });
      // Si era la canción seleccionada, refrescar el detalle completo (con slides)
      dispatch({ type: 'SET_SELECTED_SONG', payload: res.data });
      return res.data;
    },

    deleteSong: async (id) => {
      await api.delete(`/songs/${id}`);
      dispatch({ type: 'DELETE_SONG', payload: id });
    },

    selectSlide: (slide) => {
      dispatch({ type: 'SET_SELECTED_SLIDE', payload: slide });
    },

    showSlide: (slideData) => {
      socketRef.current?.emit('live:show', slideData);
    },

    toggleBlank: (isBlank) => {
      socketRef.current?.emit('live:blank', isBlank);
    },

    setBackground: (bg) => {
      socketRef.current?.emit('live:background', bg);
    },

    setStageConfig: (config) => {
      try { localStorage.setItem('aio_stage_config', JSON.stringify(config)); } catch { /* ignore */ }
      socketRef.current?.emit('stage:config', config);
      dispatch({ type: 'SET_STAGE_CONFIG', payload: config });
    },

    setStageTemplates: (templates) => {
      socketRef.current?.emit('stage:templates', templates);
      dispatch({ type: 'SET_STAGE_TEMPLATES', payload: templates });
    },

    setSchedule: (songs) => {
      const list = songs ?? [];
      socketRef.current?.emit('schedule:update', list);
      dispatch({ type: 'SET_SCHEDULE', payload: list });
    },

    setVirtualConfig: (config) => {
      dispatch({ type: 'SET_VIRTUAL_CONFIG', payload: config });
      socketRef.current?.emit('virtual:config', config);
    },

    setVirtualTemplates: (templates) => {
      socketRef.current?.emit('virtual:templates', templates);
      dispatch({ type: 'SET_VIRTUAL_TEMPLATES', payload: templates });
    },

    setOutputConfig: (config) => {
      dispatch({ type: 'SET_OUTPUT_CONFIG', payload: config });
      socketRef.current?.emit('output:config', config);
    },

    setOutputTemplates: (templates) => {
      socketRef.current?.emit('output:templates', templates);
      dispatch({ type: 'SET_OUTPUT_TEMPLATES', payload: templates });
    },

    navigate: (dir) => {
      socketRef.current?.emit('navigate', dir);
    },

    loadPlays: async (eventId, occurrenceDate) => {
      try {
        const q = occurrenceDate ? `?occurrence_date=${occurrenceDate}` : '';
        const res = await api.get(`/events/${eventId}/plays${q}`);
        const ids = res.data.map(p => p.song_id);
        const ctx = { eventId, occurrenceDate };
        dispatch({ type: 'SET_EVENT_PLAYS', payload: { ids, ctx } });
        socketRef.current?.emit('event:plays', { ids, ctx });
        return res.data;
      } catch { return []; }
    },

    markPlayed: async (eventId, occurrenceDate, songId, slidesShown, totalSlides, manual = false) => {
      await api.post(`/events/${eventId}/plays`, {
        song_id: songId,
        occurrence_date: occurrenceDate || null,
        slides_shown: slidesShown,
        total_slides: totalSlides,
        manual,
      });
      dispatch({ type: 'ADD_EVENT_PLAY', payload: songId });
      const ctx = state.eventPlaysContext;
      if (ctx) {
        const ids = [...state.eventPlays, songId];
        socketRef.current?.emit('event:plays', { ids, ctx });
      }
    },

    unmarkPlayed: async (eventId, occurrenceDate, songId) => {
      const q = occurrenceDate ? `?occurrence_date=${occurrenceDate}` : '';
      await api.delete(`/events/${eventId}/plays/${songId}${q}`);
      dispatch({ type: 'REMOVE_EVENT_PLAY', payload: songId });
      const ctx = state.eventPlaysContext;
      if (ctx) {
        const ids = [...state.eventPlays].filter(id => id !== songId);
        socketRef.current?.emit('event:plays', { ids, ctx });
      }
    },

    reloadSongs: async (search, labelFilter) => {
      const q = [];
      if (search) q.push(`search=${encodeURIComponent(search)}`);
      if (labelFilter) q.push(`tag=${encodeURIComponent(labelFilter)}`);
      const params = q.length ? `?${q.join('&')}` : '';
      const res = await api.get(`/songs${params}`);
      dispatch({ type: 'SET_SONGS', payload: res.data });
    },

    setReservasMode: (mode) => {
      dispatch({ type: 'SET_RESERVAS_MODE', payload: mode });
      socketRef.current?.emit('event:reservas_mode', mode);
    },

    setDisplayConfig: (config) => {
      dispatch({ type: 'SET_DISPLAY_CONFIG', payload: config });
      socketRef.current?.emit('settings:displays:save', config);
    },

    setAppTheme: (theme) => {
      dispatch({ type: 'SET_APP_THEME', payload: theme });
      socketRef.current?.emit('settings:theme', theme);
    },

    // ── Mensajería ────────────────────────────────────────────────────────
    sendInternalMsg: ({ text, toSocketId }) => {
      socketRef.current?.emit('msg:internal:send', { text, toSocketId: toSocketId || null });
    },

    setScreenMessage: (data) => {
      socketRef.current?.emit('msg:screen', data);
      dispatch({ type: 'SET_SCREEN_MSG', payload: data });
    },

    setTimerState: (data) => {
      socketRef.current?.emit('msg:timer', data);
      dispatch({ type: 'SET_TIMER_STATE', payload: data });
      socketSetTimerRef.current = data; // mantener ref actualizada
    },

    registerUser: (name, avatar) => {
      socketRef.current?.emit('user:register', { name, avatar });
    },
  };

  // ── Video sync: cuando videoSync=true, espera q un video haga play en este DOM ─
  useEffect(() => {
    if (!state.timerState?.videoSync) return;

    let disposed = false;
    let attached = null; // video actualmente monitorizado

    // Solo videos de contenido (data-media-video). Ignora fondos (data-bg-video).
    const getBgVideo = () => {
      const all = Array.from(document.querySelectorAll('video'));
      if (all.length === 0) return null;
      // Prioridad 1: slide de medios explícitamente marcado
      const media = all.find(v => v.dataset.mediaVideo === '1');
      if (media) return media;
      // Prioridad 2: ninguno marcado (ej. LivePreview) → excluir fondos, tomar el más grande
      const nonBg = all.filter(v => v.dataset.bgVideo !== '1');
      if (nonBg.length === 0) return null;
      return nonBg.reduce((best, v) =>
        v.getBoundingClientRect().width > best.getBoundingClientRect().width ? v : best
      );
    };

    const emitTimer = (data) => {
      socketRef.current?.emit('msg:timer', data);
      dispatch({ type: 'SET_TIMER_STATE', payload: data });
    };

    const startTimer = (dur) => {
      if (disposed) return;
      emitTimer({
        ...timerStateRef.current,
        type:           'countdown',
        seconds:        dur,
        initialSeconds: dur,
        running:        true,
        startedAt:      Date.now(),
      });
    };

    const detachFrom = (v) => {
      if (!v) return;
      if (v._vsMeta) { v.removeEventListener('loadedmetadata', v._vsMeta); v._vsMeta = null; }
      if (v._vsTU)   { v.removeEventListener('timeupdate',     v._vsTU);   v._vsTU   = null; }
      if (v._vsPlay) { v.removeEventListener('play',           v._vsPlay); v._vsPlay = null; }
    };

    const attachTo = (video) => {
      if (attached === video) return;
      detachFrom(attached);
      attached = video;

      let prevTime  = video.currentTime;
      let prevSrc   = video.src;
      let debounceT = null;

      const tryStart = () => {
        if (disposed) return;
        const dur = isFinite(video.duration) && video.duration > 0
          ? Math.floor(video.duration) : 0;
        if (dur <= 0) return;
        startTimer(dur);
      };

      video._vsPlay = () => {
        if (video.src !== prevSrc) {
          prevSrc  = video.src;
          prevTime = 0;
          clearTimeout(debounceT);
          debounceT = setTimeout(tryStart, 150);
          return;
        }
        if (isFinite(video.duration) && video.duration > 0) tryStart();
      };

      video._vsMeta = () => {
        if (!video.paused && !video.ended) {
          if (video.src !== prevSrc) prevSrc = video.src;
          tryStart();
        }
      };

      video._vsTU = () => {
        const curr = video.currentTime;
        const dur  = video.duration;
        if (video.src !== prevSrc) {
          prevSrc  = video.src;
          prevTime = curr;
          if (isFinite(dur) && dur > 0) tryStart();
          return;
        }
        // Loop: tiempo saltó hacia atrás cerca del final — reset directo sin guards
        if (isFinite(dur) && dur > 0 && prevTime > dur - 2 && curr < 1) {
          startTimer(Math.floor(dur));
        }
        prevTime = curr;
      };

      video.addEventListener('play',           video._vsPlay);
      video.addEventListener('loadedmetadata', video._vsMeta);
      video.addEventListener('timeupdate',     video._vsTU);

      if (!video.paused && !video.ended && isFinite(video.duration) && video.duration > 0) {
        tryStart();
      }
    };

    // Polling 300ms: detecta aparición/cambio del video activo
    const poll = setInterval(() => {
      if (disposed) { clearInterval(poll); return; }
      const video = getBgVideo();
      if (!video) return;
      if (attached && attached === video && attached._prevPollSrc !== video.src) {
        attached._prevPollSrc = video.src;
        detachFrom(attached);
        attached = null;
      }
      attachTo(video);
      if (attached) attached._prevPollSrc = video.src;
    }, 300);

    return () => {
      disposed = true;
      clearInterval(poll);
      detachFrom(attached);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timerState?.videoSync]);

  return (
    <PresenterContext.Provider value={{ state, actions }}>
      {children}
    </PresenterContext.Provider>
  );
}

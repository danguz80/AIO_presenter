import { createContext, useEffect, useReducer, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../hooks/useApi';

export const PresenterContext = createContext(null);

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
    ndiEnabled:  false,
    showComments: false,
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
  },

  // Plantillas de la pantalla principal
  outputTemplates: [],

  // Estado NDI (del servidor)
  ndiStatus: {
    grandioseInstalled: false,
    senderReady:        false,
    sending:            false,
    sourceName:         'AIO Presenter',
    resolution:         '1920×1080',
    fps:                30,
  },

  // Canciones tocadas del evento activo: Set de song_ids
  eventPlays: new Set(),        // song_ids ya tocadas
  eventPlaysContext: null,      // { eventId, occurrenceDate } para saber a qué evento pertenecen

  // Modo reservas: nextSong salta al separador de reservas
  reservasMode: false,

  // Solicitud de navegación desde móvil (u otro cliente)
  navigateRequest: null, // { dir: 'next'|'prev', ts: number }

  // Canción pendiente de cargar (sincronización desde otro cliente)
  pendingSongId:  null,
  pendingSlideId: null,

  // Socket
  connected: false,
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
      return { ...state, selectedSong: action.payload, selectedSlide: null };
    case 'SET_SELECTED_SLIDE':
      return { ...state, selectedSlide: action.payload };
    case 'SET_LIVE_STATE':
      return { ...state, liveState: action.payload };
    case 'SYNC_LIVE_SONG': {
      // Si es una canción diferente: marcar pendiente de carga
      const { songId, slideId } = action.payload;
      if (state.selectedSong?.id !== songId) {
        return { ...state, pendingSongId: songId, pendingSlideId: slideId };
      }
      // Misma canción: NO sobreescribir selectedSlide (el usuario controla su selección).
      // El indicador "en vivo" (verde) ya se actualiza con SET_LIVE_STATE.
      return state;
    }
    case 'SET_STAGE_CONFIG':
      return { ...state, stageConfig: { ...DEFAULT_STAGE_CONFIG, ...state.stageConfig, ...action.payload } };
    case 'SET_STAGE_TEMPLATES':
      return { ...state, stageTemplates: action.payload };
    case 'SET_SCHEDULE':
      return { ...state, schedule: action.payload };
    case 'SET_VIRTUAL_CONFIG':
      return { ...state, virtualConfig: { ...state.virtualConfig, ...action.payload } };
    case 'SET_OUTPUT_CONFIG':
      return { ...state, outputConfig: { ...state.outputConfig, ...action.payload } };
    case 'SET_OUTPUT_TEMPLATES':
      return { ...state, outputTemplates: action.payload };
    case 'SET_NDI_STATUS':
      return { ...state, ndiStatus: action.payload };
    case 'NAVIGATE':
      return { ...state, navigateRequest: action.payload };
    case 'SET_PENDING_SONG':
      return { ...state, selectedSong: action.payload.song, selectedSlide: action.payload.slide, pendingSongId: null, pendingSlideId: null };
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
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

export function PresenterProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef  = useRef(null);
  const scheduleRef = useRef(initialState.schedule);

  // Mantener scheduleRef sincronizado con el estado
  useEffect(() => { scheduleRef.current = state.schedule; }, [state.schedule]);

  // Conectar Socket.io
  useEffect(() => {
    // Conectar directamente al backend (sin pasar por el proxy de Vite)
    // Usa IP guardada en localStorage para que funcione como PWA instalada
    const savedIp   = localStorage.getItem('aio_server_ip');
    const savedPort = localStorage.getItem('aio_server_port') || '3001';
    const host      = savedIp || window.location.hostname;
    const backendUrl = `http://${host}:${savedPort}`;
    const socket = io(backendUrl, { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch({ type: 'SET_CONNECTED', payload: true });
      // Re-emitir schedule al reconectar (el servidor lo pierde al reiniciarse)
      if (scheduleRef.current?.length > 0) {
        socket.emit('schedule:update', scheduleRef.current);
      }
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
    socket.on('output:templates', (data) => dispatch({ type: 'SET_OUTPUT_TEMPLATES', payload: data }));
    socket.on('ndi:status',      (data) => dispatch({ type: 'SET_NDI_STATUS',      payload: data }));
    socket.on('navigate',          (dir)  => dispatch({ type: 'NAVIGATE',          payload: { dir, ts: Date.now() } }));
    socket.on('event:plays',       (data) => dispatch({ type: 'SET_EVENT_PLAYS',   payload: data }));
    socket.on('event:reservas_mode', (mode) => dispatch({ type: 'SET_RESERVAS_MODE', payload: mode }));
    return () => socket.disconnect();
  }, []);

  // Cargar canciones al iniciar
  useEffect(() => {
    api.get('/songs').then(res => {
      dispatch({ type: 'SET_SONGS', payload: res.data });
    }).catch(console.error);
  }, []);

  // Cuando otro cliente cambia la canción activa, cargar el detalle completo
  // para sincronizar la grilla del controlador de escritorio
  useEffect(() => {
    if (!state.pendingSongId) return;
    const songId   = state.pendingSongId;
    const slideId  = state.pendingSlideId;
    api.get(`/songs/${songId}`).then(res => {
      const song  = res.data;
      const slide = song.slides?.find(s => s.id === slideId) || null;
      dispatch({ type: 'SET_PENDING_SONG', payload: { song, slide } });
    }).catch(console.error);
  }, [state.pendingSongId, state.pendingSlideId]);

  // ─── Acciones ────────────────────────────────────────────────────────────
  const actions = {
    loadSongDetail: async (id) => {
      const res = await api.get(`/songs/${id}`);
      dispatch({ type: 'SET_SELECTED_SONG', payload: res.data });
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
  };

  return (
    <PresenterContext.Provider value={{ state, actions }}>
      {children}
    </PresenterContext.Provider>
  );
}

import { createContext, useEffect, useReducer, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../hooks/useApi';

export const PresenterContext = createContext(null);

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
    background:    { color: '#000000', type: 'color' },
  },

  // Configuración pantalla de escenario
  stageConfig: {
    background:    { type: 'color', color: '#1e1e2e' },
    showClock:     true,
    showNextSlide: true,
    fontSize:      'auto',
  },

  // Configuración salida virtual / NDI
  virtualConfig: {
    background:  { type: 'transparent' },
    chromaColor: '#00b140',
    fontSize:    'auto',
    ndiEnabled:  false,
  },

  // Estado NDI (del servidor)
  ndiStatus: {
    grandioseInstalled: false,
    senderReady:        false,
    sending:            false,
    sourceName:         'AIO Presenter',
    resolution:         '1920×1080',
    fps:                30,
  },

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
      // Si ya es la misma canción, solo actualizar el slide seleccionado
      const { songId, slideId } = action.payload;
      if (state.selectedSong?.id === songId) {
        const slide = state.selectedSong.slides?.find(s => s.id === slideId) || null;
        return { ...state, selectedSlide: slide };
      }
      // Si es una canción diferente: marcar pendiente de carga
      return { ...state, pendingSongId: songId, pendingSlideId: slideId };
    }
    case 'SET_STAGE_CONFIG':
      return { ...state, stageConfig: action.payload };
    case 'SET_VIRTUAL_CONFIG':
      return { ...state, virtualConfig: action.payload };
    case 'SET_NDI_STATUS':
      return { ...state, ndiStatus: action.payload };
    case 'NAVIGATE':
      return { ...state, navigateRequest: action.payload };
    case 'SET_PENDING_SONG':
      return { ...state, selectedSong: action.payload.song, selectedSlide: action.payload.slide, pendingSongId: null, pendingSlideId: null };
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

export function PresenterProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef(null);

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

    socket.on('connect',      () => dispatch({ type: 'SET_CONNECTED', payload: true }));
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
    socket.on('virtual:config',  (data) => dispatch({ type: 'SET_VIRTUAL_CONFIG',  payload: data }));
    socket.on('ndi:status',      (data) => dispatch({ type: 'SET_NDI_STATUS',      payload: data }));
    socket.on('navigate',        (dir)  => dispatch({ type: 'NAVIGATE', payload: { dir, ts: Date.now() } }));
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
      socketRef.current?.emit('stage:config', config);
    },

    setVirtualConfig: (config) => {
      socketRef.current?.emit('virtual:config', config);
    },

    navigate: (dir) => {
      socketRef.current?.emit('navigate', dir);
    },

    reloadSongs: async (search) => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/songs${params}`);
      dispatch({ type: 'SET_SONGS', payload: res.data });
    },
  };

  return (
    <PresenterContext.Provider value={{ state, actions }}>
      {children}
    </PresenterContext.Provider>
  );
}

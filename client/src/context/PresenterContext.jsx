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
    type:      null,
    slideData: null,
    isBlank:   false,
    background: { color: '#000000', type: 'color' },
  },

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
    const socket = io('http://localhost:3001', { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect',     () => dispatch({ type: 'SET_CONNECTED', payload: true }));
    socket.on('disconnect',  () => dispatch({ type: 'SET_CONNECTED', payload: false }));
    socket.on('live:state',  (data) => dispatch({ type: 'SET_LIVE_STATE', payload: data }));

    return () => socket.disconnect();
  }, []);

  // Cargar canciones al iniciar
  useEffect(() => {
    api.get('/songs').then(res => {
      dispatch({ type: 'SET_SONGS', payload: res.data });
    }).catch(console.error);
  }, []);

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

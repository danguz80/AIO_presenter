import axios from 'axios';

// En producción VITE_API_URL = 'https://api.aiopresenter.com'
// En desarrollo queda vacío y Vite hace proxy de /api → localhost:3001
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

// Adjuntar JWT automáticamente en cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('aio_sync_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

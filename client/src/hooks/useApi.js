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

export default api;

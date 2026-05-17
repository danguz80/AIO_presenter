import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Aplicar tema guardado antes de que React renderice (evita flash)
const savedTheme = localStorage.getItem('aio_theme') ?? 'oscuro';
document.documentElement.classList.add(`theme-${savedTheme}`);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

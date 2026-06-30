import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// ── Fix: Chrome en Galaxy Z Fold cover screen ─────────────────────────────────
// Chrome ignora width=device-width y usa un viewport de 980px en la pantalla
// externa del Z Fold (screen.width=412). El resultado es que todo aparece al
// 42% del tamaño correcto. Compensamos con CSS zoom aplicado al <html> antes
// de que React renderice: zoom = innerWidth/screen.width = 980/412 = 2.38,
// lo que cancela exactamente el factor de escala del browser.
;(function () {
  var sw = window.screen.width;
  var vw = window.innerWidth;
  if (sw > 100 && sw < 700 && vw > sw * 1.2) {
    var html = document.documentElement;
    html.style.width = sw + 'px';
    html.style.zoom  = String(vw / sw);
    html.style.overflowX = 'hidden';
    html.dataset.viewportFix = 'zfold';   // marca para CSS si fuera necesario
  }
})();

// Service Worker para servir archivos locales FSA en ventanas separadas
// No registrar el SW en la página virtual para evitar que OBS cargue una versión cacheada antigua.
if ('serviceWorker' in navigator && window.location.pathname !== '/virtual') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.warn('[SW] Registro fallido:', err)
    );
  });
}

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

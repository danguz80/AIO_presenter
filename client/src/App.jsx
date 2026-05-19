import { useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { PresenterProvider } from './context/PresenterContext';
import { usePresenter } from './context/usePresenter';
import LandingPage          from './pages/LandingPage';
import LoginPage            from './pages/LoginPage';
import ModeSelectPage       from './pages/ModeSelectPage';
import ControllerPage       from './pages/ControllerPage';
import OutputPage           from './pages/OutputPage';
import StagePage            from './pages/StagePage';
import VirtualPage          from './pages/VirtualPage';
import MobileControllerPage from './pages/MobileControllerPage';
import CalendarPage         from './pages/CalendarPage';

// Intercepta sync_token / sync_error de la URL (redirect post-OAuth) y redirige a /app
function OAuthCallbackHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('sync_token');
    const err   = params.get('sync_error');
    if (!token && !err) return;

    if (token) {
      localStorage.setItem('aio_sync_token', token);
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.orgId) localStorage.setItem('aio_org_id', String(payload.orgId));
      } catch { /* token mal formado — ignorar */ }
    }

    // Redirigir a /app preservando solo el error si lo hay
    const dest = err ? `/app?sync_error=${err}` : '/app';
    navigate(dest, { replace: true });
  }, [navigate]);
  return null;
}

// Aplica la clase del tema al <html> cada vez que cambia en el contexto
function ThemeApplier() {
  const { state } = usePresenter();
  const theme = state.appTheme ?? 'oscuro';
  useEffect(() => {
    const html = document.documentElement;
    // Quitar clases de tema anteriores y aplicar la nueva
    const classes = Array.from(html.classList).filter(c => !c.startsWith('theme-'));
    html.className = [...classes, `theme-${theme}`].join(' ');
    localStorage.setItem('aio_theme', theme);
  }, [theme]);
  return null;
}

export default function App() {
  return (
    <PresenterProvider>
      <OAuthCallbackHandler />
      <ThemeApplier />
      <Routes>
        {/* Páginas públicas (sin PresenterProvider) */}
        <Route path="/"            element={<LandingPage />} />
        <Route path="/login"        element={<LoginPage />} />
        <Route path="/mode-select" element={<ModeSelectPage />} />
        {/* App principal */}
        <Route path="/app"         element={<ControllerPage />} />
        <Route path="/output"      element={<OutputPage />} />
        <Route path="/stage"       element={<StagePage />} />
        <Route path="/virtual"     element={<VirtualPage />} />
        <Route path="/mobile"      element={<MobileControllerPage />} />
        <Route path="/calendar"    element={<CalendarPage />} />
      </Routes>
    </PresenterProvider>
  );
}

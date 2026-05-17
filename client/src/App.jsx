import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { PresenterProvider } from './context/PresenterContext';
import { usePresenter } from './context/usePresenter';
import ControllerPage       from './pages/ControllerPage';
import OutputPage           from './pages/OutputPage';
import StagePage            from './pages/StagePage';
import VirtualPage          from './pages/VirtualPage';
import MobileControllerPage from './pages/MobileControllerPage';
import CalendarPage         from './pages/CalendarPage';

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
      <ThemeApplier />
      <Routes>
        <Route path="/"          element={<ControllerPage />} />
        <Route path="/output"    element={<OutputPage />} />
        <Route path="/stage"     element={<StagePage />} />
        <Route path="/virtual"   element={<VirtualPage />} />
        <Route path="/mobile"    element={<MobileControllerPage />} />
        <Route path="/calendar"  element={<CalendarPage />} />
      </Routes>
    </PresenterProvider>
  );
}

import { Routes, Route } from 'react-router-dom';
import { PresenterProvider } from './context/PresenterContext';
import ControllerPage       from './pages/ControllerPage';
import OutputPage           from './pages/OutputPage';
import StagePage            from './pages/StagePage';
import VirtualPage          from './pages/VirtualPage';
import MobileControllerPage from './pages/MobileControllerPage';
import CalendarPage         from './pages/CalendarPage';

export default function App() {
  return (
    <PresenterProvider>
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

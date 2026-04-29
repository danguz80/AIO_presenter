import { Routes, Route } from 'react-router-dom';
import { PresenterProvider } from './context/PresenterContext';
import ControllerPage  from './pages/ControllerPage';
import OutputPage      from './pages/OutputPage';
import StagePage       from './pages/StagePage';
import VirtualPage     from './pages/VirtualPage';

export default function App() {
  return (
    <PresenterProvider>
      <Routes>
        <Route path="/"        element={<ControllerPage />} />
        <Route path="/output"  element={<OutputPage />} />
        <Route path="/stage"   element={<StagePage />} />
        <Route path="/virtual" element={<VirtualPage />} />
      </Routes>
    </PresenterProvider>
  );
}

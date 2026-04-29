import { Routes, Route } from 'react-router-dom';
import { PresenterProvider } from './context/PresenterContext';
import ControllerPage  from './pages/ControllerPage';
import OutputPage      from './pages/OutputPage';

export default function App() {
  return (
    <PresenterProvider>
      <Routes>
        <Route path="/"       element={<ControllerPage />} />
        <Route path="/output" element={<OutputPage />} />
      </Routes>
    </PresenterProvider>
  );
}

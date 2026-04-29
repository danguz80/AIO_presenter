import { useState } from 'react';
import { usePresenter } from '../context/usePresenter';
import SongLibrary     from '../components/Library/SongLibrary';
import SongDetail      from '../components/Library/SongDetail';
import BibleBrowser    from '../components/Library/BibleBrowser';
import LiveControls    from '../components/Controls/LiveControls';
import LivePreview     from '../components/Controls/LivePreview';
import StageControls   from '../components/Controls/StageControls';
import VirtualControls from '../components/Controls/VirtualControls';
import { Wifi, WifiOff, Music, BookOpen } from 'lucide-react';

export default function ControllerPage() {
  const { state } = usePresenter();
  const [activeTab, setActiveTab] = useState('songs'); // 'songs' | 'bible'

  return (
    <div className="flex flex-col h-screen bg-surface-900 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-surface-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-accent font-bold text-lg tracking-tight">AIO Presenter</span>
          <span className="text-xs text-zinc-500 bg-surface-700 px-2 py-0.5 rounded">Beta</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Estado de conexión */}
          <div className="flex items-center gap-1.5 text-xs">
            {state.connected
              ? <><Wifi size={14} className="text-green-400" /><span className="text-green-400">Conectado</span></>
              : <><WifiOff size={14} className="text-red-400" /><span className="text-red-400">Sin conexión</span></>
            }
          </div>
        </div>
      </header>

      {/* ── Tabs: Canciones / Biblia ── */}
      <div className="flex gap-1 px-4 pt-2 pb-0 bg-surface-800 border-b border-surface-700 shrink-0">
        <TabButton
          active={activeTab === 'songs'}
          onClick={() => setActiveTab('songs')}
          icon={<Music size={13} />}
          label="Canciones"
        />
        <TabButton
          active={activeTab === 'bible'}
          onClick={() => setActiveTab('bible')}
          icon={<BookOpen size={13} />}
          label="Biblia"
        />
      </div>

      {/* ── Layout principal ── */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'songs' ? (
          <>
            {/* Columna 1: Biblioteca de canciones */}
            <aside className="w-72 shrink-0 border-r border-surface-700 flex flex-col overflow-hidden">
              <SongLibrary />
            </aside>

            {/* Columna 2: Detalle / Slides */}
            <main className="flex-1 flex flex-col overflow-hidden border-r border-surface-700">
              <SongDetail />
            </main>
          </>
        ) : (
          /* Columnas 1+2: Navegador de Biblia */
          <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-700">
            <BibleBrowser />
          </div>
        )}

        {/* Columna 3: Controles en vivo + Preview (siempre visible) */}
        <aside className="w-96 shrink-0 flex flex-col overflow-hidden">
          <LivePreview />
          <LiveControls />
          <StageControls />
          <VirtualControls />
        </aside>
      </div>
    </div>
  );
}

// ─── Componente Tab ───────────────────────────────────────────────────────────
function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors border-b-2 -mb-px ${
        active
          ? 'text-accent border-accent bg-surface-900/50'
          : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:border-zinc-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

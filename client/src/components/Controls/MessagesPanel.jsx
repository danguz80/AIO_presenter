/**
 * MessagesPanel — Panel de mensajería en el Presenter
 * Secciones:
 *  1. Internos     — mensajes entre operadores conectados
 *  2. A Pantallas  — texto superpuesto en output/stage
 *  3. Personalizados — cronómetros y cuentas regresivas
 */
import { useState, useEffect, useRef } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { useTimerDisplay, fmtTimer } from '../../hooks/useTimerDisplay';
import {
  MessageSquare, Monitor, Timer, Send, Users, Eye, EyeOff,
  Play, Pause, RotateCcw, Clock, AlarmClock, Tv2, Trash2,
} from 'lucide-react';

// ─── Tab wrapper ──────────────────────────────────────────────────────────────
function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors rounded-lg
        ${active ? 'bg-accent/20 text-accent' : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-700'}`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

// ─── 1. Mensajes Internos ─────────────────────────────────────────────────────
function InternalMessages() {
  const { state, actions } = usePresenter();
  const { connectedUsers, internalMessages } = state;
  const [text, setText]       = useState('');
  const [toUser, setToUser]   = useState('all');
  const scrollRef             = useRef(null);

  // Obtener mi propio socketId aproximado desde el último mensaje own
  const myId = internalMessages.findLast?.(m => m.own)?.fromId || null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [internalMessages]);

  const send = () => {
    if (!text.trim()) return;
    actions.sendInternalMsg({ text: text.trim(), toSocketId: toUser === 'all' ? null : toUser });
    setText('');
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Usuarios conectados */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1.5">
          <Users size={10} className="inline mr-1" />Conectados ({connectedUsers.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {connectedUsers.length === 0 && (
            <span className="text-xs text-zinc-600">Solo tú</span>
          )}
          {connectedUsers.map(u => (
            <span key={u.socketId} className="flex items-center gap-1 text-[11px] bg-surface-700 text-zinc-300 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              {u.name}
            </span>
          ))}
        </div>
      </div>

      {/* Historial */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-48 pr-1">
        {internalMessages.length === 0 && (
          <p className="text-xs text-zinc-600 text-center py-4">Sin mensajes aún</p>
        )}
        {internalMessages.map(msg => (
          <div key={msg.id} className={`flex flex-col gap-0.5 ${msg.own ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-zinc-500">
              {msg.own ? 'Tú' : msg.from}
              {msg.private && ' · privado'}
            </span>
            <div className={`px-3 py-1.5 rounded-xl text-xs max-w-[85%] ${
              msg.own
                ? 'bg-accent text-white rounded-br-none'
                : 'bg-surface-700 text-zinc-200 rounded-bl-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Destinatario */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-zinc-500 shrink-0">Para:</label>
        <select
          value={toUser}
          onChange={e => setToUser(e.target.value)}
          className="flex-1 bg-surface-700 border border-surface-600 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
        >
          <option value="all">Todos</option>
          {connectedUsers.map(u => (
            <option key={u.socketId} value={u.socketId}>{u.name}</option>
          ))}
        </select>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Escribe un mensaje..."
          className="flex-1 bg-surface-700 border border-surface-600 text-zinc-200 text-xs rounded-lg px-3 py-2 placeholder-zinc-500 focus:outline-none focus:border-accent"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="p-2 bg-accent hover:bg-accent/80 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── 2. Mensajes a Pantallas ──────────────────────────────────────────────────
function ScreenMessages() {
  const { state, actions } = usePresenter();
  const msg = state.screenMessage || { text: '', target: 'both', visible: false };
  const [text, setText]     = useState(msg.text || '');
  const [target, setTarget] = useState(msg.target || 'both');

  const update = (patch) => {
    const next = { ...msg, text, target, ...patch };
    actions.setScreenMessage(next);
  };

  const toggleVisible = () => update({ visible: !msg.visible });
  const show          = () => { update({ text, target, visible: true  }); };
  const hide          = () => { update({ text, target, visible: false }); };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Texto superpuesto en pantalla</p>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        placeholder="Texto a mostrar en la pantalla..."
        className="bg-surface-700 border border-surface-600 text-zinc-200 text-sm rounded-xl px-3 py-2.5 placeholder-zinc-500 focus:outline-none focus:border-accent resize-none"
      />

      {/* Destino */}
      <div className="grid grid-cols-3 gap-2">
        {[['output', 'Principal', Monitor], ['stage', 'Escenario', Tv2], ['both', 'Ambas', Eye]].map(([val, label, Icon]) => (
          <button
            key={val}
            onClick={() => setTarget(val)}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs transition-colors ${
              target === val
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-surface-600 bg-surface-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Estado actual */}
      {msg.visible && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/15 border border-green-500/30 rounded-xl text-green-400 text-xs">
          <Eye size={12} />
          Mostrando en pantalla{msg.target === 'both' ? 's' : msg.target === 'output' ? ' principal' : ' de escenario'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={show}
          disabled={!text.trim()}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent hover:bg-accent/80 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
        >
          <Eye size={14} /> Mostrar
        </button>
        <button
          onClick={hide}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-zinc-300 text-sm font-semibold border border-surface-600 transition-colors"
        >
          <EyeOff size={14} /> Ocultar
        </button>
      </div>
    </div>
  );
}

// ─── 3. Mensajes Personalizados (Timer / Countdown) ───────────────────────────
function CustomMessages() {
  const { state, actions } = usePresenter();
  const timer = state.timerState || { type: 'countdown', seconds: 0, running: false, label: '' };

  // Fix 4: usar hook para display — correcto al remontar aunque esté corriendo
  const timerDisplay = useTimerDisplay(timer);

  // Inputs de configuración — solo se usan para nuevo timer (no sincronizan con running)
  const initialSecs = timer.initialSeconds ?? timer.seconds ?? 0;
  const [inputMin, setInputMin]   = useState(Math.floor(initialSecs / 60));
  const [inputSec, setInputSec]   = useState(initialSecs % 60);
  const [label, setLabel]         = useState(timer.label || '');
  const [timerType, setTimerType] = useState(timer.type || 'countdown');

  // Cuando el timer se resetea (running=false y seconds cambia desde afuera), sync inputs
  useEffect(() => {
    if (!timer.running) {
      const secs = timer.initialSeconds ?? timer.seconds ?? 0;
      setInputMin(Math.floor(secs / 60));
      setInputSec(secs % 60);
      setTimerType(timer.type || 'countdown');
      setLabel(timer.label || '');
    }
  }, [timer.running, timer.initialSeconds, timer.seconds, timer.type, timer.label]);

  const totalSeconds = inputMin * 60 + Number(inputSec);

  const dispatch = (patch) => {
    const next = { ...timer, ...patch };
    actions.setTimerState(next);
  };

  const start = () => {
    const secs = timerType === 'timer' ? 0 : totalSeconds;
    dispatch({ type: timerType, seconds: secs, running: true, label, startedAt: Date.now(), initialSeconds: secs });
  };

  const pause  = () => dispatch({ running: false, seconds: timerDisplay });
  const resume = () => dispatch({ running: true, startedAt: Date.now(), initialSeconds: timerDisplay });
  const reset  = () => {
    const secs = timerType === 'timer' ? 0 : totalSeconds;
    dispatch({ type: timerType, seconds: secs, running: false, label, startedAt: null, initialSeconds: secs });
  };
  const clear  = () => {
    dispatch({ type: timerType, seconds: 0, running: false, label: '', startedAt: null, initialSeconds: 0 });
    setInputMin(0); setInputSec(0); setLabel('');
  };
  const useVideoTime = () => {
    const video = document.querySelector('video');
    if (video && isFinite(video.duration) && video.duration > 0) {
      const remaining = Math.max(0, Math.floor(video.duration - video.currentTime));
      setInputMin(Math.floor(remaining / 60));
      setInputSec(remaining % 60);
    } else {
      const dur = state.liveState?.slideData?.duration || 0;
      if (dur > 0) { setInputMin(Math.floor(dur / 60)); setInputSec(dur % 60); }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Tipo */}
      <div className="grid grid-cols-2 gap-2">
        {[['countdown', 'Cuenta regresiva', AlarmClock], ['timer', 'Cronómetro', Clock]].map(([val, lbl, Icon]) => (
          <button
            key={val}
            onClick={() => { setTimerType(val); dispatch({ type: val, running: false }); }}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              timerType === val
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-surface-600 bg-surface-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon size={13} /> {lbl}
          </button>
        ))}
      </div>

      {/* Etiqueta */}
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="Etiqueta (ej: Ofrenda, Inicio servicio...)"
        className="bg-surface-700 border border-surface-600 text-zinc-200 text-xs rounded-lg px-3 py-2 placeholder-zinc-500 focus:outline-none focus:border-accent"
      />

      {/* Tiempo inicial (solo cuenta regresiva) */}
      {timerType === 'countdown' && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 flex-1">
            <input
              type="number" min={0} max={99}
              value={inputMin}
              onChange={e => setInputMin(Number(e.target.value))}
              className="w-14 text-center bg-surface-700 border border-surface-600 text-zinc-200 text-sm rounded-lg px-2 py-2 focus:outline-none focus:border-accent"
            />
            <span className="text-zinc-500 text-sm">m</span>
            <input
              type="number" min={0} max={59}
              value={inputSec}
              onChange={e => setInputSec(Number(e.target.value))}
              className="w-14 text-center bg-surface-700 border border-surface-600 text-zinc-200 text-sm rounded-lg px-2 py-2 focus:outline-none focus:border-accent"
            />
            <span className="text-zinc-500 text-sm">s</span>
          </div>
          <button
            onClick={useVideoTime}
            title="Usar tiempo restante del video actual"
            className="text-[10px] text-zinc-500 hover:text-accent border border-surface-600 rounded-lg px-2 py-1.5 transition-colors"
          >
            🎬 Video
          </button>
        </div>
      )}

      {/* Display grande */}
      <div className={`text-center py-4 rounded-2xl border font-mono text-4xl font-bold tracking-widest ${
        timer.running ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-surface-700 border-surface-600 text-zinc-300'
      }`}>
        {fmtTimer(timerDisplay)}
        {label && <p className="text-xs font-sans font-normal text-zinc-500 mt-1">{label}</p>}
      </div>

      {/* Controles: Play/Pausa | Reiniciar | Borrar */}
      <div className="grid grid-cols-4 gap-2">
        {!timer.running ? (
          <button onClick={start} className="col-span-2 flex items-center justify-center gap-2 py-2.5 bg-accent hover:bg-accent/80 text-white rounded-xl text-sm font-semibold transition-colors">
            <Play size={14} /> Iniciar
          </button>
        ) : (
          <>
            <button onClick={pause} className="flex items-center justify-center gap-1 py-2.5 bg-yellow-500/80 hover:bg-yellow-500 text-black rounded-xl text-sm font-semibold transition-colors">
              <Pause size={14} />
            </button>
            <button onClick={resume} className="flex items-center justify-center gap-1 py-2.5 bg-accent hover:bg-accent/80 text-white rounded-xl text-sm font-semibold transition-colors" style={{ display: timer.running ? 'none' : 'flex' }}>
              <Play size={14} />
            </button>
          </>
        )}
        <button onClick={reset} title="Reiniciar" className="flex items-center justify-center gap-1 py-2.5 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-xl text-sm border border-surface-600 transition-colors">
          <RotateCcw size={14} />
        </button>
        <button onClick={clear} title="Borrar timer de pantallas" className="col-span-1 flex items-center justify-center gap-1 py-2.5 bg-red-900/40 hover:bg-red-800/60 text-red-400 hover:text-red-300 rounded-xl text-sm border border-red-800/40 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
      {timer.running && (
        <p className="text-[10px] text-zinc-500 text-center">Timer corriendo en pantallas. <button onClick={pause} className="underline hover:text-zinc-300">Pausar</button> · <button onClick={clear} className="underline text-red-400 hover:text-red-300">Borrar</button></p>
      )}
    </div>
  );
}

// ─── Panel principal ──────────────────────────────────────────────────────────
export default function MessagesPanel() {
  const [tab, setTab] = useState('internal');

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Tabs */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl">
        <Tab active={tab === 'internal'} onClick={() => setTab('internal')} icon={MessageSquare} label="Internos" />
        <Tab active={tab === 'screen'}   onClick={() => setTab('screen')}   icon={Monitor}       label="Pantallas" />
        <Tab active={tab === 'custom'}   onClick={() => setTab('custom')}   icon={Timer}         label="Timers" />
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'internal' && <InternalMessages />}
        {tab === 'screen'   && <ScreenMessages />}
        {tab === 'custom'   && <CustomMessages />}
      </div>
    </div>
  );
}

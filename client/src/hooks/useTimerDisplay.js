import { useEffect, useState } from 'react';

/**
 * Calcula los segundos actuales de un timer basándose en startedAt.
 */
export function useTimerDisplay(timerState) {
  const computeCurrent = () => {
    if (!timerState?.running || !timerState?.startedAt) {
      return timerState?.seconds ?? 0;
    }
    const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
    const initial = timerState.initialSeconds ?? timerState.seconds ?? 0;
    if (timerState.type === 'timer') {
      return initial + elapsed;
    }
    return Math.max(0, initial - elapsed);
  };

  const [current, setCurrent] = useState(computeCurrent);

  useEffect(() => {
    setCurrent(computeCurrent());
    if (!timerState?.running) return;
    const id = setInterval(() => setCurrent(computeCurrent()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState?.running, timerState?.startedAt, timerState?.initialSeconds, timerState?.type]);

  return current;
}

export function fmtTimer(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Efecto estrobo: alterna true/false cada intervalMs cuando active=true.
 */
export function useStrobe(active, intervalMs = 250) {
  const [bright, setBright] = useState(true);
  useEffect(() => {
    setBright(true);
    if (!active) return;
    const id = setInterval(() => setBright(v => !v), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return bright;
}

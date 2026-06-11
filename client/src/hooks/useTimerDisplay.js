import { useEffect, useState } from 'react';

/**
 * Calcula los segundos actuales de un timer basándose en startedAt.
 * Así cualquier pantalla que recibe el estado inicial puede mostrarlo corriendo
 * sin depender de broadcasts por segundo.
 *
 * @param {object} timerState  { type, seconds, running, startedAt, initialSeconds }
 * @returns {number}           segundos actuales a mostrar
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
    // countdown
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

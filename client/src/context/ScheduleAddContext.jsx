import { createContext, useContext, useState, useCallback } from 'react';

/**
 * ScheduleAddContext — conecta MediaLibrary con EventsPanel.
 * MediaLibrary consulta `fn` para saber si hay un evento activo.
 * EventsPanel expone `setFn` para registrar la función de agregar.
 */
const Ctx = createContext(null);

export function ScheduleAddProvider({ children }) {
  const [fn, setFnState] = useState(null);
  // useCallback estable para que setFn no cambie en cada render
  const setFn = useCallback((handler) => {
    setFnState(() => handler ?? null);
  }, []);
  return <Ctx.Provider value={{ fn, setFn }}>{children}</Ctx.Provider>;
}

export function useScheduleAdd() {
  return useContext(Ctx);
}

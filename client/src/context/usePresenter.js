import { useContext } from 'react';
import { PresenterContext } from './PresenterContext';

export function usePresenter() {
  const ctx = useContext(PresenterContext);
  if (!ctx) throw new Error('usePresenter debe usarse dentro de PresenterProvider');
  return ctx;
}

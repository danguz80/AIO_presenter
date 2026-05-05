import { useEffect } from 'react';

const CHANNEL_NAME = 'aio-keyboard-relay';
const NAV_KEYS = [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'];

/**
 * Retransmite teclas de navegación desde ventanas de salida al controlador.
 *
 * mode='sender'   → escucha keydown en esta ventana y lo emite por BroadcastChannel.
 *                   Usar en OutputPage, StagePage, VirtualPage.
 */
export function useKeyboardRelay() {
  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL_NAME);

    const relay = (e) => {
      if (!NAV_KEYS.includes(e.key)) return;
      e.preventDefault();
      ch.postMessage({ key: e.key });
    };

    window.addEventListener('keydown', relay);
    return () => {
      window.removeEventListener('keydown', relay);
      ch.close();
    };
  }, []);
}

/**
 * Devuelve un BroadcastChannel abierto que emite mensajes { key } cuando
 * llega una tecla retransmitida desde otra ventana.
 * El caller es responsable de subscribirse a ch.onmessage y de cerrar el canal.
 */
export function openKeyRelayReceiver() {
  return new BroadcastChannel(CHANNEL_NAME);
}

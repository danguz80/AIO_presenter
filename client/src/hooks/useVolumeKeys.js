import { useEffect, useRef } from 'react';

/**
 * Captura los botones de volumen del celular (Android Chrome).
 * Llama a onUp al pulsar Subir Volumen y onDown al pulsar Bajar Volumen.
 * Cancela el cambio de volumen real con preventDefault().
 *
 * ⚠️ Solo funciona en Android (Chrome). En iOS el sistema intercepta
 *    los botones de volumen antes de que lleguen al navegador.
 */
export default function useVolumeKeys(onUp, onDown) {
  // Refs para siempre tener la versión más reciente de los callbacks
  const upRef   = useRef(onUp);
  const downRef = useRef(onDown);
  upRef.current   = onUp;
  downRef.current = onDown;

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'AudioVolumeUp' || e.key === 'VolumeUp') {
        e.preventDefault();
        upRef.current?.();
      } else if (e.key === 'AudioVolumeDown' || e.key === 'VolumeDown') {
        e.preventDefault();
        downRef.current?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

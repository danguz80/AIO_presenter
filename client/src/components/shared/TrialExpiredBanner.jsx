/**
 * TrialExpiredBanner — se muestra automáticamente cuando cualquier request
 * recibe 402 TRIAL_EXPIRED o SUBSCRIPTION_INACTIVE del servidor.
 * Se escucha el evento global 'aio:plan-required' emitido por el interceptor de axios.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, X, CreditCard } from 'lucide-react';

export default function TrialExpiredBanner() {
  const [visible, setVisible] = useState(false);
  const [code, setCode]       = useState(null);
  const navigate              = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      setCode(e.detail?.code || 'TRIAL_EXPIRED');
      setVisible(true);
    };
    window.addEventListener('aio:plan-required', handler);
    return () => window.removeEventListener('aio:plan-required', handler);
  }, []);

  if (!visible) return null;

  const isExpired = code === 'TRIAL_EXPIRED';
  const message   = isExpired
    ? 'Tu período de prueba gratuita ha terminado.'
    : 'Tu suscripción está inactiva.';

  return (
    <div className="fixed inset-x-0 bottom-20 z-[9998] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 bg-red-900/95 backdrop-blur border border-red-500/40 text-white rounded-2xl shadow-2xl px-4 py-3 max-w-sm w-full">
        <AlertCircle size={18} className="text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{message}</p>
          <p className="text-xs text-white/50 leading-tight mt-0.5">Suscríbete para seguir usando AIO Presenter.</p>
        </div>
        <button
          onClick={() => {
            setVisible(false);
            navigate('/cancionero/configuracion');
          }}
          className="shrink-0 flex items-center gap-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs px-3 py-1.5 rounded-xl transition-colors"
        >
          <CreditCard size={12} />
          Ver planes
        </button>
        <button onClick={() => setVisible(false)} className="shrink-0 text-white/30 hover:text-white/60">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

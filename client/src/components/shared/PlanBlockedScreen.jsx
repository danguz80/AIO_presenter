import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CreditCard } from 'lucide-react';

export default function PlanBlockedScreen({ title, message, loading = false }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0b0f] text-white px-6">
      <div className="max-w-md w-full rounded-3xl border border-red-500/30 bg-red-950/80 backdrop-blur px-6 py-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className="text-red-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold leading-tight">{title || 'Salidas desactivadas'}</p>
            <p className="text-sm text-white/70 mt-1 leading-snug">
              {message || (loading ? 'Verificando acceso...' : 'Tu plan actual no permite abrir salidas.')}
            </p>
          </div>
        </div>
        {!loading && (
          <button
            onClick={() => navigate('/cancionero/configuracion')}
            className="mt-5 inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            <CreditCard size={14} />
            Ver planes
          </button>
        )}
      </div>
    </div>
  );
}
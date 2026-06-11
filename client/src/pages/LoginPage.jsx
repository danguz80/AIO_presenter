import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Ícono de Google
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M44.5 20H24v8.5h11.7C34.1 33.4 29.6 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l6-6C34.5 6.3 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.2-4z" fill="#4285F4"/>
      <path d="M6.3 14.7l7 5.1C15.1 16.2 19.2 13 24 13c3 0 5.7 1.1 7.8 2.9l6-6C34.5 6.3 29.6 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z" fill="#EA4335"/>
      <path d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.5-5.5C29.8 35 27 36 24 36c-5.6 0-10.3-3.8-11.9-9l-6.9 5.3C9.5 39.5 16.2 44 24 44z" fill="#34A853"/>
      <path d="M43.6 20H24v8.5h11.7c-.8 2.3-2.3 4.2-4.3 5.5l6.5 5.5C41.5 36.3 44 30.6 44 24c0-1.3-.1-2.7-.4-4z" fill="#FBBC05"/>
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Mostrar error si viene de un redirect OAuth fallido
  const syncError = new URLSearchParams(window.location.search).get('sync_error');

  const handleGoogleLogin = () => {
    setLoading(true);
    fetch(`${API}/auth/google/url`)
      .then(r => r.json())
      .then(({ url }) => { if (url) window.location.href = url; else setLoading(false); })
      .catch(() => setLoading(false));
  };

  return (
    <div className="min-h-screen bg-[#1B3166] flex flex-col items-center justify-center px-4">
      {/* Fondo decorativo */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#C9A420]/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Botón volver */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-5 left-5 flex items-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors"
      >
        <ArrowLeft size={16} />
        Volver
      </button>

      {/* Card */}
      <div className="relative z-10 bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-10 w-full max-w-sm flex flex-col items-center gap-6 shadow-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo-circle.png"
            alt="AIO Presenter"
            className="h-16 w-16 object-contain drop-shadow-xl"
            onError={e => { e.target.style.display = 'none'; }}
          />
          <div className="text-center">
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              All in One <span className="text-[#C9A420]">Presenter</span>
            </h1>
            <p className="text-xs text-white/40 mt-0.5 uppercase tracking-widest">
              Proyección para iglesias
            </p>
          </div>
        </div>

        {/* Separador */}
        <hr className="w-full border-white/10" />

        {/* Error de OAuth */}
        {syncError && (
          <div className="w-full bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 text-red-300 text-sm text-center">
            {decodeURIComponent(syncError)}
          </div>
        )}

        {/* Heading */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-white">Bienvenido de vuelta</h2>
          <p className="text-sm text-white/50 mt-1">Inicia sesión para continuar</p>
        </div>

        {/* Botón Google */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-xl text-sm transition-all shadow-lg active:scale-[0.98] disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? 'Redirigiendo…' : 'Continuar con Google'}
        </button>

        {/* Separador con texto */}
        <div className="flex items-center gap-3 w-full">
          <hr className="flex-1 border-white/10" />
          <span className="text-xs text-white/30">¿No tienes cuenta?</span>
          <hr className="flex-1 border-white/10" />
        </div>

        {/* Registro */}
        <button
          onClick={() => navigate('/register')}
          className="w-full py-3 rounded-xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-sm font-semibold transition-all"
        >
          Crear cuenta gratis — 30 días
        </button>

        <p className="text-center text-xs text-white/25 leading-relaxed">
          Al continuar aceptas nuestros términos de uso y política de privacidad.
        </p>
      </div>
    </div>
  );
}

import { useEffect, useState, Component } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { PresenterProvider } from './context/PresenterContext';
import { usePresenter } from './context/usePresenter';
import LandingPage          from './pages/LandingPage';
import LoginPage            from './pages/LoginPage';
import ModeSelectPage       from './pages/ModeSelectPage';
import ControllerPage       from './pages/ControllerPage';
import OutputPage           from './pages/OutputPage';
import StagePage            from './pages/StagePage';
import VirtualPage          from './pages/VirtualPage';
import MobileControllerPage from './pages/MobileControllerPage';
import CalendarPage         from './pages/CalendarPage';
import OrgSelectPage           from './pages/cancionero/OrgSelectPage';
import CancioneroDashboard     from './pages/cancionero/CancioneroDashboard';
import CancioneroSongs         from './pages/cancionero/CancioneroSongs';
import CancioneroSongDetail    from './pages/cancionero/CancioneroSongDetail';
import CancioneroEvents        from './pages/cancionero/CancioneroEvents';
import CancioneroEventDetail   from './pages/cancionero/CancioneroEventDetail';
import CancioneroSettings      from './pages/cancionero/CancioneroSettings';
import SpotifyCallbackPage     from './pages/cancionero/SpotifyCallbackPage';
import AdminPage               from './pages/AdminPage';
import TrialExpiredBanner      from './components/shared/TrialExpiredBanner';
import { forceRefreshApp }     from './utils/forceRefreshApp';

const BUILD_VERSION = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

// Intercepta sync_token / sync_error de la URL (redirect post-OAuth) y redirige a /app
function OAuthCallbackHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('sync_token');
    const err    = params.get('sync_error');
    const hasErr = params.has('sync_error');
    const subId  = params.get('subscription_id');
    const planType = params.get('plan_type');
    const paypalCancel = params.get('paypal_cancel');

    // Si el usuario canceló el pago en PayPal → no loguear, volver a landing
    if (paypalCancel === 'true') {
      window.location.replace('/?paypal_cancelled=true');
      return;
    }

    // Activar suscripción PayPal si viene de redirect de aprobación
    if (subId) {
      const savedToken = token || localStorage.getItem('aio_sync_token');
      if (savedToken) {
        // Guardar el token antes de activar (puede ser nuevo usuario del trial)
        if (token) {
          localStorage.setItem('aio_sync_token', token);
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.orgId) localStorage.setItem('aio_org_id', String(payload.orgId));
          } catch { /* token mal formado — ignorar */ }
        }
        const mode = params.get('mode');
        const redirectAfter = mode === 'cancionero' ? '/cancionero' : '/app';
        const apiUrl = import.meta.env.VITE_API_URL || '';
        fetch(`${apiUrl}/paypal/activate`, {
          method : 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
          body   : JSON.stringify({ subscriptionId: subId, planType: planType || 'monthly' }),
        }).then(r => r.json()).then(d => {
          if (d.ok) window.location.replace(redirectAfter);
        }).catch(() => { window.location.replace(redirectAfter); });
      } else {
        navigate('/app', { replace: true });
      }
      return;
    }

    if (!token && !hasErr) return;

    if (token) {
      localStorage.setItem('aio_sync_token', token);
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.orgId) localStorage.setItem('aio_org_id', String(payload.orgId));
      } catch { /* token mal formado — ignorar */ }
    }

    // Redirigir según modo
    const mode = params.get('mode');
    let dest;
    if (hasErr)                     dest = `/login?sync_error=${encodeURIComponent(err || 'Error desconocido')}`;
    else if (mode === 'cancionero') dest = '/cancionero';
    else                            dest = '/mode-select';
    console.log('[OAuthCallback] token presente:', !!token, '| hasErr:', hasErr, '| dest:', dest);
    window.location.replace(dest);
  }, [navigate]);
  return null;
}

// Aplica la clase del tema al <html> cada vez que cambia en el contexto
function ThemeApplier() {
  const { state } = usePresenter();
  const theme = state.appTheme ?? 'oscuro';
  useEffect(() => {
    const html = document.documentElement;
    // Quitar clases de tema anteriores y aplicar la nueva
    const classes = Array.from(html.classList).filter(c => !c.startsWith('theme-'));
    html.className = [...classes, `theme-${theme}`].join(' ');
    localStorage.setItem('aio_theme', theme);
  }, [theme]);
  return null;
}

// Verifica que el JWT en localStorage exista y no haya expirado
function isAuthenticated() {
  const token = localStorage.getItem('aio_sync_token');
  if (!token) return false;
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return !exp || Date.now() / 1000 < exp;
  } catch {
    return false;
  }
}

// Caché de sesión para evitar fetch repetido en cada navegación de ruta
let _authCacheToken  = null;
let _authCacheResult = null; // 'ok' | 'denied' | null

// Guard de ruta: verifica JWT local y confirma con el servidor que el usuario sigue activo
function RequireAuth({ children }) {
  const [status, setStatus] = useState(() => {
    const token = localStorage.getItem('aio_sync_token');
    if (_authCacheToken && _authCacheToken === token && _authCacheResult) {
      return _authCacheResult; // resultado cacheado → sin fetch, sin pantalla negra
    }
    return 'checking';
  });

  useEffect(() => {
    if (status !== 'checking') return; // ya resuelto desde caché
    if (!isAuthenticated()) { setStatus('denied'); return; }
    const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const token = localStorage.getItem('aio_sync_token');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error('no autorizado');
        _authCacheToken  = token;
        _authCacheResult = 'ok';
        setStatus('ok');
      })
      .catch(() => {
        localStorage.removeItem('aio_sync_token');
        localStorage.removeItem('aio_org_id');
        _authCacheToken  = null;
        _authCacheResult = null;
        setStatus('denied');
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-surface-900 text-zinc-100 flex items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-surface-700 bg-surface-800 p-5">
          <p className="text-sm font-semibold">Conectando...</p>
          <p className="text-xs text-zinc-400 mt-1">Validando sesión ({BUILD_VERSION})</p>
        </div>
      </div>
    );
  }
  if (status === 'denied')   return <Navigate to="/" replace />;
  return children;
}

// Banner de actualización cuando el SW activa una nueva versión
function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let mounted = true;
    let regRef = null;

    const inspectRegistration = (reg) => {
      if (!reg) return;
      regRef = reg;

      if (reg.waiting && navigator.serviceWorker.controller) {
        setReady(true);
      }

      const handleUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        const onState = () => {
          if (!mounted) return;
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setReady(true);
          }
        };
        if (typeof installing.addEventListener === 'function') {
          installing.addEventListener('statechange', onState);
        } else {
          installing.onstatechange = onState;
        }
      };

      if (typeof reg.addEventListener === 'function') {
        reg.addEventListener('updatefound', handleUpdateFound);
      } else {
        reg.onupdatefound = handleUpdateFound;
      }
    };

    const onControllerChange = () => {
      // Se activó el nuevo SW y ya tomamos control de la página.
      if (mounted) setReady(false);
    };

    if (typeof navigator.serviceWorker.addEventListener === 'function') {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    }

    navigator.serviceWorker.getRegistration()
      .then((reg) => {
        if (!mounted) return;
        inspectRegistration(reg);
        reg?.update?.().catch(() => {});
      })
      .catch(() => {});

    const intervalId = setInterval(() => {
      regRef?.update?.().catch(() => {});
    }, 60000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
      if (typeof navigator.serviceWorker.removeEventListener === 'function') {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    };
  }, []);

  const applyUpdate = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }
    } catch {
      // no-op
    }
    await forceRefreshApp(window.location.pathname);
  };

  // En móvil: aplicar update automáticamente sin pedir confirmación.
  // El código viejo en caché puede crashear; así se reemplaza de inmediato.
  useEffect(() => {
    if (!ready) return;
    const isMobile = /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile/i.test(navigator.userAgent)
      || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
    if (isMobile) {
      applyUpdate();
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2 bg-accent text-white text-xs shadow-lg">
      <span>¡Nueva versión disponible! (build {BUILD_VERSION})</span>
      <button
        onClick={applyUpdate}
        className="flex items-center gap-1 font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded transition-colors"
      >
        <RefreshCw size={12} />
        Actualizar
      </button>
    </div>
  );
}

// ErrorBoundary: captura cualquier crash de render y muestra mensaje en pantalla
// en vez de pantalla blanca. Imprescindible para diagnosticar y sobrevivir crashes de PWA.
class MobileErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err) {
    return { error: err };
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div style={{ minHeight: '100dvh', background: '#0f0f14', color: '#f4f4f5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'sans-serif' }}>
          <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '8px' }}>Error al cargar la app</p>
          <p style={{ fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '16px', wordBreak: 'break-all', maxWidth: '90vw', textAlign: 'center' }}>{msg}</p>
          <button
            onClick={() => forceRefreshApp(window.location.pathname)}
            style={{ background: 'var(--accent,#6366f1)', color: '#fff', border: 'none', borderRadius: '12px', padding: '10px 20px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}
          >
            Reintentar
          </button>
          <p style={{ fontSize: '0.65rem', color: '#52525b', marginTop: '12px' }}>build {BUILD_VERSION}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <PresenterProvider>
      <UpdateBanner />
      <OAuthCallbackHandler />
      <ThemeApplier />
      <TrialExpiredBanner />
      <Routes>
        {/* Páginas públicas (sin PresenterProvider) */}
        <Route path="/"            element={<LandingPage />} />
        <Route path="/login"        element={<LoginPage />} />
        <Route path="/mode-select" element={<ModeSelectPage />} />
        {/* App principal — requiere autenticación */}
        <Route path="/app"      element={<RequireAuth><ControllerPage /></RequireAuth>} />
        <Route path="/mobile"   element={<MobileErrorBoundary><RequireAuth><MobileControllerPage /></RequireAuth></MobileErrorBoundary>} />
        <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
        {/* Cancionero — requiere autenticación */}
        <Route path="/cancionero/select-org"         element={<RequireAuth><OrgSelectPage /></RequireAuth>} />
        <Route path="/cancionero"                    element={<RequireAuth><CancioneroDashboard /></RequireAuth>} />
        <Route path="/cancionero/canciones"          element={<RequireAuth><CancioneroSongs /></RequireAuth>} />
        <Route path="/cancionero/canciones/:id"      element={<RequireAuth><CancioneroSongDetail /></RequireAuth>} />
        <Route path="/cancionero/eventos"            element={<RequireAuth><CancioneroEvents /></RequireAuth>} />
        <Route path="/cancionero/eventos/:id"        element={<RequireAuth><CancioneroEventDetail /></RequireAuth>} />
        <Route path="/cancionero/configuracion"         element={<RequireAuth><CancioneroSettings /></RequireAuth>} />
        {/* Spotify OAuth callback — sin RequireAuth: llega desde redirect de Spotify (127.0.0.1) */}
        <Route path="/spotify-callback" element={<SpotifyCallbackPage />} />
        {/* Panel de administración del owner */}
        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
        {/* Páginas de display — abiertas en pantallas secundarias, sin auth */}
        <Route path="/output"  element={<OutputPage />} />
        <Route path="/stage"   element={<StagePage />} />
        <Route path="/virtual" element={<VirtualPage />} />
      </Routes>
    </PresenterProvider>
  );
}

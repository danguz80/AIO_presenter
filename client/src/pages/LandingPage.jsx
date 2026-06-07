import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Music2, BookOpen, Users, RefreshCw, Smartphone, Zap,
  Check, ChevronRight, Star, Play, Menu, X, ChevronDown,
  MonitorPlay, Clock, Calendar, Wifi,
} from 'lucide-react';

// ─── Colores de marca ─────────────────────────────────────────────────────────
// Navy: #1B3166  |  Gold: #C9A420  |  Light navy: #243E82

const PLANS = [
  {
    id: 'monthly',
    label: 'Mensual',
    price: '$6',
    period: '/mes',
    usdYear: null,
    badge: null,
    features: [
      'Modo Presenter completo',
      'Modo Cancionero',
      'Hasta 500 canciones',
      'Gestión de eventos y cultos',
      'Asistencia de músicos',
      'App móvil remota',
      'Soporte por email',
    ],
    cta: 'Empezar prueba gratis',
    variant: 'outline',
  },
  {
    id: 'annual',
    label: 'Anual',
    price: '$60',
    period: '/año',
    usdYear: 'Equivale a $5/mes — ahorras $12',
    badge: 'Más popular',
    features: [
      'Todo lo del plan mensual',
      'Canciones ilimitadas',
      'Múltiples usuarios',
      'Acceso prioritario a novedades',
      'Soporte prioritario',
      '2 meses gratis incluidos',
    ],
    cta: 'Empezar prueba gratis',
    variant: 'solid',
  },
];

const FEATURES = [
  {
    icon: MonitorPlay,
    title: 'Modo Presenter',
    desc: 'Proyección profesional de letras, acordes y Biblias para el culto. Control total desde el escritorio o el móvil.',
    color: 'from-blue-600 to-blue-800',
  },
  {
    icon: Music2,
    title: 'Modo Cancionero',
    desc: 'Songbook digital de bolsillo para cada músico. Ve exactamente lo que se proyectará el domingo, con acordes y desplazamiento automático personalizable.',
    color: 'from-yellow-500 to-yellow-700',
  },
  {
    icon: RefreshCw,
    title: 'Sincronización total',
    desc: 'Una sola base de datos. Cualquier cambio en el Presenter se refleja al instante en el Cancionero. Sin doble trabajo.',
    color: 'from-emerald-500 to-emerald-700',
  },
  {
    icon: Users,
    title: 'Gestión de músicos',
    desc: 'Registra la asistencia de cada músico a cada culto y configura anticipadamente la banda según las ausencias.',
    color: 'from-purple-500 to-purple-700',
  },
  {
    icon: BookOpen,
    title: 'Biblias integradas',
    desc: 'Proyecta versículos al vuelo desde múltiples versiones bíblicas, sin salir de la aplicación.',
    color: 'from-rose-500 to-rose-700',
  },
  {
    icon: Smartphone,
    title: 'Control móvil',
    desc: 'Maneja la presentación desde tu teléfono. Vista de escenario con acordes para el líder de alabanza.',
    color: 'from-cyan-500 to-cyan-700',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Crea tu cuenta',
    desc: 'Regístrate con Google en segundos. Los primeros 30 días son completamente gratis, sin tarjeta de crédito.',
  },
  {
    step: '02',
    title: 'Elige tu modo',
    desc: 'Selecciona si necesitas el Presenter para proyecciones o el Cancionero para los músicos. Puedes usar ambos.',
  },
  {
    step: '03',
    title: 'Importa tus canciones',
    desc: 'Sube tu biblioteca en formato ChordPro o escribe directamente. Organiza por etiquetas, tonalidad y sección.',
  },
  {
    step: '04',
    title: 'Presenta con confianza',
    desc: 'Gestiona el culto desde el escritorio, controla desde el móvil y deja que los músicos sigan desde su app.',
  },
];

// ─── Screenshot mockup (placeholder visual) ──────────────────────────────────
function AppMockup() {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Sombra ambiental */}
      <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-3xl translate-y-4" />
      {/* Ventana */}
      <div className="relative bg-[#0f172a] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Barra de título */}
        <div className="flex items-center gap-1.5 px-4 py-3 bg-[#1e293b] border-b border-white/10">
          <div className="w-3 h-3 rounded-full bg-red-500/70" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <div className="w-3 h-3 rounded-full bg-green-500/70" />
          <span className="ml-3 text-xs text-white/30 font-mono">AIO Presenter — Culto Domingo</span>
        </div>
        {/* Contenido simulado */}
        <div className="flex h-64 sm:h-80">
          {/* Sidebar */}
          <div className="w-40 sm:w-52 shrink-0 bg-[#1e293b] border-r border-white/10 p-3 flex flex-col gap-1.5">
            <div className="h-5 bg-white/5 rounded mb-2" />
            {['Coro', 'Verso 1', 'Pre-coro', 'Coro', 'Verso 2', 'Puente', 'Coro Final'].map((s, i) => (
              <div key={i} className={`h-7 rounded flex items-center px-2 gap-1.5 ${i === 0 ? 'bg-blue-600/40 border border-blue-500/40' : 'bg-white/5'}`}>
                <div className={`w-1.5 h-full rounded ${i === 0 ? 'bg-blue-400' : 'bg-white/10'}`} style={{ height: 14 }} />
                <span className="text-[10px] text-white/50">{s}</span>
              </div>
            ))}
          </div>
          {/* Stage preview */}
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-6 text-center gap-2">
            <div className="text-[9px] text-yellow-400/60 uppercase tracking-widest mb-1">Coro</div>
            <div className="space-y-1">
              <div className="flex justify-center gap-3 text-[11px] font-mono text-yellow-400">
                <span>G</span><span className="ml-3">C</span><span className="ml-6">D</span>
              </div>
              <p className="text-white text-xs sm:text-sm leading-relaxed">Grande es tu fidelidad</p>
              <div className="flex justify-center gap-3 text-[11px] font-mono text-yellow-400 mt-1">
                <span>Em</span><span className="ml-4">C</span>
              </div>
              <p className="text-white text-xs sm:text-sm leading-relaxed">Dios eterno y sempiterno eres tú</p>
            </div>
          </div>
          {/* Next slide */}
          <div className="w-28 sm:w-36 shrink-0 bg-[#0d1a2d] border-l border-white/10 flex flex-col p-2 gap-1">
            <span className="text-[8px] text-white/30 uppercase tracking-wider mb-1">Siguiente</span>
            {[1,2,3].map(i => (
              <div key={i} className="h-14 bg-white/5 rounded border border-white/5 p-1.5">
                <div className="h-1.5 bg-white/10 rounded w-3/4 mb-1" />
                <div className="h-1.5 bg-white/10 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
        {/* Barra inferior */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#1e293b] border-t border-white/10">
          <div className="flex gap-2">
            <div className="h-7 w-20 bg-white/10 rounded" />
            <div className="h-7 w-24 bg-blue-600/40 border border-blue-500/40 rounded" />
            <div className="h-7 w-20 bg-white/10 rounded" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-[10px] text-white/30">En vivo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mockup del Cancionero móvil ──────────────────────────────────────────────
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-48">
      <div className="absolute inset-0 bg-yellow-500/20 blur-2xl rounded-3xl" />
      <div className="relative bg-[#0f172a] rounded-3xl border-4 border-white/20 overflow-hidden shadow-2xl aspect-[9/19]">
        <div className="h-4 bg-black flex justify-center pt-1">
          <div className="w-10 h-1.5 bg-white/20 rounded-full" />
        </div>
        <div className="p-3 flex flex-col h-full gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-white/40">Cancionero</span>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-2.5 flex-1 flex flex-col gap-1.5">
            <div className="text-[8px] text-yellow-400/70 uppercase tracking-widest">Coro</div>
            <div className="space-y-1">
              <div className="flex gap-2 text-[8px] font-mono text-yellow-400"><span>G</span><span>C</span><span>D</span></div>
              <div className="text-[9px] text-white/80 leading-relaxed">Grande es tu fidelidad</div>
              <div className="flex gap-2 text-[8px] font-mono text-yellow-400"><span>Em</span><span>C</span></div>
              <div className="text-[9px] text-white/80 leading-relaxed">Dios eterno y sempiterno</div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-white/30">Auto-scroll</span>
            <div className="w-8 h-3 bg-yellow-500/40 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── Componente principal ─────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [inviteRedirecting, setInviteRedirecting] = useState(false);
  const [trialLoading, setTrialLoading] = useState(null); // plan id que está cargando

  // Iniciar prueba gratis: Google OAuth con mode=trial
  const startTrial = (plan = 'monthly') => {
    if (trialLoading) return;
    setTrialLoading(plan);
    fetch(`${API}/auth/google/url?mode=trial&plan=${encodeURIComponent(plan)}`)
      .then(r => r.json())
      .then(({ url }) => { if (url) window.location.href = url; else setTrialLoading(null); })
      .catch(() => setTrialLoading(null));
  };

  // Si llega con ?invite=CODE, redirigir directamente a Google OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (!invite) return;
    setInviteRedirecting(true);
    fetch(`${API}/auth/google/url?invite=${encodeURIComponent(invite)}`)
      .then(r => r.json())
      .then(({ url }) => { if (url) window.location.href = url; })
      .catch(() => setInviteRedirecting(false));
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  if (inviteRedirecting) {
    return (
      <div className="min-h-screen bg-[#1B3166] flex flex-col items-center justify-center gap-4 text-white">
        <img src="/logo-circle.png" alt="AIO Presenter" className="h-16 w-16 object-contain animate-pulse" onError={e => { e.target.style.display='none'; }} />
        <p className="text-lg font-semibold">Redirigiendo a Google para aceptar la invitación…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased">

      {/* ── NAVBAR ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur shadow-sm border-b border-gray-200' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          {/* Logo: circle+texto en oscuro, horizontal en claro */}
          <a onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-3 cursor-pointer">
            {scrolled ? (
              <img
                src="/logo-horizontal.png"
                alt="AIO Presenter"
                className="h-14 object-contain"
                onError={e => { e.target.style.display='none'; }}
              />
            ) : (
              <>
                <img
                  src="/logo-circle.png"
                  alt="AIO Presenter"
                  className="h-14 w-14 object-contain shrink-0"
                  onError={e => { e.target.style.display='none'; }}
                />
                <span className="text-white font-bold text-base leading-tight">
                  All in One<br />
                  <span className="text-[#C9A420]">Presenter</span>
                </span>
              </>
            )}
          </a>

          {/* Nav links — desktop */}
          <nav className="hidden md:flex items-center gap-6">
            {[['Características', 'features'], ['Cómo funciona', 'how'], ['Precios', 'precios']].map(([label, id]) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={`text-sm font-medium transition-colors hover:text-[#C9A420] ${scrolled ? 'text-gray-600' : 'text-white/80'}`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${scrolled ? 'text-[#1B3166] hover:bg-gray-100' : 'text-white hover:text-white/80'}`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => scrollTo('precios')}
              className="text-sm font-bold px-5 py-2 rounded-lg bg-[#C9A420] text-white hover:bg-[#b8931c] transition-colors shadow-md"
            >
              Prueba gratis
            </button>
          </div>

          {/* Mobile menu button */}
          <button onClick={() => setMenuOpen(v => !v)} className={`md:hidden p-2 ${scrolled ? 'text-gray-700' : 'text-white'}`}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 px-4 py-4 flex flex-col gap-3 shadow-lg">
            {[['Características', 'features'], ['Cómo funciona', 'how'], ['Precios', 'precios']].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} className="text-left text-gray-700 font-medium py-1">{label}</button>
            ))}
            <hr className="border-gray-200 my-1" />
            <button onClick={() => navigate('/login')} className="text-left text-[#1B3166] font-semibold py-1">Iniciar sesión</button>
            <button
              onClick={() => scrollTo('precios')}
              className="w-full py-2.5 rounded-lg bg-[#C9A420] text-white font-bold text-sm"
            >
              Prueba gratis 30 días
            </button>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#1B3166] pt-16">
        {/* Fondo decorativo */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#C9A420]/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center text-center gap-8">
          {/* Logo principal hero: circle grande (fondo azul, perfecto sobre navy) */}
          <div className="flex flex-col items-center gap-5">
            <img
              src="/logo-circle.png"
              alt="AIO Presenter"
              className="h-36 w-36 sm:h-44 sm:w-44 object-contain drop-shadow-2xl"
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-3 border border-white/20">
              <img
                src="/logo-horizontal.png"
                alt="All in One Presenter"
                className="w-56 sm:w-72 lg:w-80 object-contain"
                onError={e => { e.target.parentElement.style.display = 'none'; }}
              />
            </div>
          </div>

          {/* Headline */}
          <p className="max-w-2xl text-white/80 text-lg sm:text-xl leading-relaxed">
            La plataforma completa para gestionar las alabanzas y proyecciones de tu iglesia.
            Presenter profesional, songbook digital para músicos y todo sincronizado en tiempo real.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <button
              onClick={() => scrollTo('precios')}
              className="group flex items-center gap-2 px-8 py-3.5 bg-[#C9A420] hover:bg-[#b8931c] text-white font-bold rounded-xl text-base shadow-lg shadow-yellow-900/30 transition-all active:scale-95"
            >
              Probar gratis 30 días
              <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 px-8 py-3.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-base border border-white/20 backdrop-blur transition-all active:scale-95"
            >
              Iniciar sesión
            </button>
          </div>

          {/* Badge de prueba gratis */}
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <Check size={14} className="text-green-400" />
            30 días gratis · Sin tarjeta de crédito · Cancela cuando quieras
          </div>

          {/* App mockup */}
          <div className="w-full mt-4">
            <AppMockup />
          </div>
        </div>

        {/* Scroll indicator */}
        <button onClick={() => scrollTo('features')} className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 hover:text-white/60 transition-colors animate-bounce">
          <ChevronDown size={28} />
        </button>
      </section>

      {/* ── LOGO STRIP ── */}
      <div className="bg-gray-50 border-y border-gray-200 py-6 px-4">
        <p className="text-center text-sm text-gray-400 mb-4">
          Diseñado para iglesias que quieren llevar su alabanza al siguiente nivel
        </p>
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-6 items-center text-gray-300 text-sm font-medium">
          {['Bandas de alabanza', 'Iglesias locales', 'Músicos en formación', 'Directores de culto', 'Proyeccionistas'].map(label => (
            <span key={label} className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1 shadow-sm border border-gray-200 text-gray-500 text-xs">
              <Check size={12} className="text-[#C9A420]" /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── CARACTERÍSTICAS ── */}
      <section id="features" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#C9A420] uppercase tracking-widest mb-3">Características</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1B3166]">Todo lo que tu iglesia necesita</h2>
            <p className="mt-3 text-gray-500 max-w-xl mx-auto">Una sola plataforma para el proyeccionista, el líder de alabanza y cada músico del equipo.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="group relative bg-white rounded-2xl border border-gray-200 p-6 hover:border-[#C9A420]/40 hover:shadow-lg transition-all duration-300">
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${color} mb-4 shadow-md`}>
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="font-bold text-[#1B3166] text-lg mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LOS 2 MODOS ── */}
      <section className="py-24 px-4 sm:px-6 bg-[#1B3166] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#C9A420] uppercase tracking-widest mb-3">Two in One</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold">Una app, dos mundos</h2>
            <p className="mt-3 text-white/60 max-w-xl mx-auto">Elige el modo según tu rol. Ambos comparten la misma biblioteca, por lo que nunca tendrás que editar una canción dos veces.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Presenter */}
            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-8 hover:border-blue-400/40 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-600/30 rounded-xl border border-blue-500/30">
                  <MonitorPlay size={24} className="text-blue-300" />
                </div>
                <div>
                  <h3 className="font-bold text-xl">Modo Presenter</h3>
                  <span className="text-xs text-blue-300/70">Para el proyeccionista y el director</span>
                </div>
              </div>
              <ul className="space-y-2.5">
                {[
                  'Proyección de letras y acordes en pantalla',
                  'Gestión de slides por sección (Coro, Verso, Puente…)',
                  'Textos bíblicos en tiempo real',
                  'Vista de escenario para el líder',
                  'Control remoto desde el celular',
                  'Fondos, transiciones y tipografías personalizables',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                    <Check size={14} className="text-blue-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Cancionero */}
            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-8 hover:border-yellow-400/40 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-yellow-600/30 rounded-xl border border-yellow-500/30">
                  <Music2 size={24} className="text-yellow-300" />
                </div>
                <div>
                  <h3 className="font-bold text-xl">Modo Cancionero</h3>
                  <span className="text-xs text-yellow-300/70">Para cada músico del equipo</span>
                </div>
              </div>
              <ul className="space-y-2.5">
                {[
                  'Songbook digital de bolsillo en tu celular',
                  'Ve exactamente lo que se proyectará el domingo',
                  'Acordes, cifrado y letra completa',
                  'Auto-scroll con velocidad personalizable',
                  'Acceso sin conexión (modo offline)',
                  'Gestión de asistencia a cultos',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                    <Check size={14} className="text-yellow-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex items-center gap-2 text-xs text-yellow-400/70 bg-yellow-500/10 rounded-lg p-2.5 border border-yellow-500/20">
                <Zap size={13} />
                <span>Próximamente disponible — en desarrollo activo</span>
              </div>
            </div>
          </div>

          {/* Visual de los dos modos */}
          <div className="mt-16 grid md:grid-cols-2 gap-8 items-center">
            <div className="text-center">
              <AppMockup />
              <p className="mt-4 text-sm text-white/40">Modo Presenter — escritorio</p>
            </div>
            <div className="flex flex-col items-center gap-4">
              <PhoneMockup />
              <p className="text-sm text-white/40">Modo Cancionero — móvil</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section id="how" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#C9A420] uppercase tracking-widest mb-3">Cómo funciona</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1B3166]">Listo para el domingo en minutos</h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {HOW_IT_WORKS.map(({ step, title, desc }) => (
              <div key={step} className="bg-white rounded-2xl border border-gray-200 p-6 flex gap-5 hover:border-[#C9A420]/40 hover:shadow-md transition-all">
                <span className="text-4xl font-black text-[#C9A420]/20 shrink-0 leading-none">{step}</span>
                <div>
                  <h3 className="font-bold text-[#1B3166] text-base mb-1">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRECIOS ── */}
      <section id="precios" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-xs font-bold text-[#C9A420] uppercase tracking-widest mb-3">Planes y precios</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1B3166]">Simple y transparente</h2>
            <p className="mt-3 text-gray-500 max-w-lg mx-auto">
              Comienza con 30 días gratis, sin tarjeta de crédito. Cancela en cualquier momento.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-8 flex flex-col gap-6 transition-all ${
                  plan.variant === 'solid'
                    ? 'border-[#C9A420] bg-[#1B3166] text-white shadow-2xl shadow-blue-900/20 scale-105'
                    : 'border-gray-200 bg-white text-gray-900 hover:border-[#C9A420]/50 hover:shadow-md'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#C9A420] text-white text-xs font-bold px-4 py-1 rounded-full shadow">
                    {plan.badge}
                  </span>
                )}

                <div>
                  <p className={`text-sm font-semibold uppercase tracking-widest mb-3 ${plan.variant === 'solid' ? 'text-[#C9A420]' : 'text-gray-400'}`}>{plan.label}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-5xl font-black">{plan.price}</span>
                    <span className={`text-lg mb-1 ${plan.variant === 'solid' ? 'text-white/60' : 'text-gray-400'}`}>{plan.period}</span>
                  </div>
                  {plan.usdYear && (
                    <p className={`text-sm mt-1 ${plan.variant === 'solid' ? 'text-green-300' : 'text-green-600'}`}>{plan.usdYear}</p>
                  )}
                </div>

                <ul className="space-y-2.5 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check size={15} className={`mt-0.5 shrink-0 ${plan.variant === 'solid' ? 'text-[#C9A420]' : 'text-[#C9A420]'}`} />
                      <span className={plan.variant === 'solid' ? 'text-white/80' : 'text-gray-600'}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => startTrial(plan.id)}
                  disabled={!!trialLoading}
                  className={`w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait ${
                    plan.variant === 'solid'
                      ? 'bg-[#C9A420] hover:bg-[#b8931c] text-white shadow-lg'
                      : 'bg-[#1B3166] hover:bg-[#243E82] text-white'
                  }`}
                >
                  {trialLoading === plan.id ? 'Redirigiendo a Google…' : plan.cta}
                </button>
                <p className={`text-center text-xs ${plan.variant === 'solid' ? 'text-white/40' : 'text-gray-400'}`}>
                  30 días gratis · Sin tarjeta de crédito
                </p>
              </div>
            ))}
          </div>

          {/* FAQ rápido */}
          <div className="mt-12 max-w-2xl mx-auto space-y-4">
            {[
              ['¿Necesito descargar algo?', 'No. AIO Presenter es 100% web. Funciona desde cualquier navegador en tu computador o teléfono.'],
              ['¿Puedo usar ambos modos con un solo plan?', 'Sí. Un plan incluye tanto el Modo Presenter como el Modo Cancionero para todos tus músicos.'],
              ['\u00bfQué pasa cuando termina la prueba?', 'Al finalizar los 30 días de prueba gratuita, comienza tu primer ciclo de pago. El primer cobro real ocurre al día 60 (es decir, 30 días después de que termine el trial). Puedes cancelar antes de ese momento sin ningún cargo.'],
            ].map(([q, a]) => (
              <details key={q} className="group bg-gray-50 rounded-xl border border-gray-200 px-5 py-4">
                <summary className="flex items-center justify-between cursor-pointer font-semibold text-[#1B3166] text-sm list-none">
                  {q}
                  <ChevronDown size={16} className="text-gray-400 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="mt-3 text-gray-500 text-sm leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-br from-[#1B3166] to-[#0d1f45] text-white text-center">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
          <img src="/logo-circle.png" alt="AIO" className="h-16 w-16 object-contain" onError={e => { e.target.style.display='none'; }} />
          <h2 className="text-3xl sm:text-4xl font-extrabold">Lleva tu alabanza al siguiente nivel</h2>
          <p className="text-white/60 text-lg">
            Empieza hoy, gratis. Sin compromisos ni tarjeta de crédito.
          </p>
          <button
            onClick={() => startTrial('monthly')}
            disabled={!!trialLoading}
            className="group flex items-center gap-2 px-10 py-4 bg-[#C9A420] hover:bg-[#b8931c] text-white font-bold rounded-xl text-lg shadow-xl shadow-yellow-900/30 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait"
          >
            {trialLoading ? 'Redirigiendo a Google…' : 'Crear cuenta gratis'}
            {!trialLoading && <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform" />}
          </button>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-white/40">
            <span className="flex items-center gap-1"><Check size={13} className="text-green-400" /> 30 días de prueba</span>
            <span className="flex items-center gap-1"><Check size={13} className="text-green-400" /> Sin tarjeta de crédito</span>
            <span className="flex items-center gap-1"><Check size={13} className="text-green-400" /> Cancela cuando quieras</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0d1f45] text-white/40 text-sm py-10 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="AIO" className="h-7 w-7 object-contain" onError={e => { e.target.style.display='none'; }} />
            <span className="font-semibold text-white/60">AIO Presenter</span>
            <span className="text-xs">— Proyección de letras y Biblias para iglesias</span>
          </div>
          <div className="flex gap-5 text-xs">
            <button onClick={() => navigate('/login')} className="hover:text-white transition-colors">Iniciar sesión</button>
            <button onClick={() => scrollTo('precios')} className="hover:text-white transition-colors">Planes</button>
            <button onClick={() => scrollTo('features')} className="hover:text-white transition-colors">Características</button>
          </div>
          <p className="text-xs">© {new Date().getFullYear()} AIO Presenter. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}

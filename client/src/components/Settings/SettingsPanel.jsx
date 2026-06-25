import { useState, useEffect } from 'react';
import { X, Smartphone, ChevronDown, CreditCard, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import StageControls   from '../Controls/StageControls';
import OutputControls  from '../Controls/OutputControls';
import VirtualControls from '../Controls/VirtualControls';
import DisplaysPanel   from './DisplaysPanel';
import ThemePanel      from './ThemePanel';
import SyncPanel       from './SyncPanel';
import GeneralPanel    from './GeneralPanel';

export default function SettingsPanel({ mobileUrl, onClose }) {
  const [showQR,      setShowQR]      = useState(false);
  const [showGeneral, setShowGeneral] = useState(false);
  const [showSalidas, setShowSalidas] = useState(false);
  const [showTema,    setShowTema]    = useState(false);
  const [showSync,    setShowSync]    = useState(false);
  const [showPlan,    setShowPlan]    = useState(false);

  // Info de plan de la org
  const [org,          setOrg]          = useState(null);
  const [user,         setUser]         = useState(null);
  const [paypalConfig, setPaypalConfig] = useState(null);
  const [subscribing,  setSubscribing]  = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling,   setCancelling]   = useState(false);

  const API = import.meta.env.VITE_API_URL || '';
  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}` };
  }

  useEffect(() => {
    const h = authHeaders();
    fetch(`${API}/auth/org`, { headers: h })
      .then(r => r.ok ? r.json() : null).then(o => { if (o?.id) setOrg(o); }).catch(() => {});
    fetch(`${API}/auth/me`, { headers: h })
      .then(r => r.ok ? r.json() : null).then(u => { if (u?.id) setUser(u); }).catch(() => {});
    fetch(`${API}/paypal/config`)
      .then(r => r.ok ? r.json() : null).then(pc => { if (pc?.clientId) setPaypalConfig(pc); }).catch(() => {});
  }, []);

  const subscribe = async (planType) => {
    setSubscribing(planType);
    try {
      const r = await fetch(`${API}/paypal/create-subscription`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ planType }),
      });
      const d = await r.json();
      if (r.ok && d.approvalUrl) window.location.href = d.approvalUrl;
      else alert(d.error || 'Error al iniciar suscripción');
    } catch { alert('Error de conexión'); }
    setSubscribing(null);
  };

  const cancelSubscription = async () => {
    setCancelling(true);
    try {
      const r = await fetch(`${API}/paypal/cancel`, { method: 'POST', headers: authHeaders() });
      if (r.ok) { setOrg(o => ({ ...o, plan: 'cancelled' })); setConfirmCancel(false); }
      else { const d = await r.json(); alert(d.error || 'Error al cancelar'); }
    } finally { setCancelling(false); }
  };

  const plan      = org?.effective_plan || org?.plan || 'trial';
  const trialEnds = org?.trial_ends ? new Date(org.trial_ends) : null;
  const daysLeft  = trialEnds ? Math.max(0, Math.ceil((trialEnds - Date.now()) / 86400000)) : 0;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer derecho */}
      <aside className="fixed top-0 right-0 z-50 h-full w-80 bg-surface-800 border-l border-surface-700 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
          <span className="text-sm font-semibold text-white">Configuración</span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-surface-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">

          {/* Sección: Móvil */}
          <div className="border-b border-surface-700 px-4 py-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Control móvil</p>
            <button
              onClick={() => setShowQR(v => !v)}
              className="flex items-center gap-2 w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
            >
              <Smartphone size={15} />
              Conectar móvil (QR)
            </button>

            {showQR && (
              <div className="mt-3 text-center">
                {mobileUrl ? (
                  <>
                    {(() => {
                      const pin = localStorage.getItem('aio_presenter_pin');
                      const qrUrl = pin ? `${mobileUrl}?pin=${pin}` : mobileUrl;
                      return (
                        <>
                          <div className="bg-white p-3 rounded-xl inline-block mb-2">
                            <QRCodeSVG value={qrUrl} size={160} />
                          </div>
                          <p className="text-zinc-500 text-xs leading-relaxed mb-2">
                            Escanea desde la app móvil para vincular<br />automáticamente
                          </p>
                          {pin && (
                            <div className="px-3 py-2 bg-surface-800 rounded-lg border border-surface-600">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">PIN de este presentador</p>
                              <p className="text-2xl font-mono font-bold text-accent tracking-widest">{pin}</p>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <p className="text-zinc-400 text-sm py-4">Obteniendo IP…</p>
                )}
              </div>
            )}
          </div>

          <OutputControls />
          <StageControls />
          <VirtualControls />

          {/* Sección: General (colapsable) */}
          <div className="border-b border-surface-700">
            <button
              onClick={() => setShowGeneral(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-surface-700/50 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">General</span>
              <ChevronDown
                size={14}
                className={`text-zinc-500 transition-transform duration-200 ${showGeneral ? 'rotate-180' : ''}`}
              />
            </button>
            {showGeneral && (
              <div className="px-4 pb-4">
                <GeneralPanel />
              </div>
            )}
          </div>

          {/* Sección: Tema (colapsable) */}
          <div className="border-b border-surface-700">
            <button
              onClick={() => setShowTema(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-surface-700/50 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tema de color</span>
              <ChevronDown
                size={14}
                className={`text-zinc-500 transition-transform duration-200 ${showTema ? 'rotate-180' : ''}`}
              />
            </button>
            {showTema && (
              <div className="px-4 pb-4">
                <ThemePanel />
              </div>
            )}
          </div>

          {/* Sección: Salidas (colapsable) */}
          <div className="border-b border-surface-700">
            <button
              onClick={() => setShowSalidas(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-surface-700/50 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Salidas</span>
              <ChevronDown
                size={14}
                className={`text-zinc-500 transition-transform duration-200 ${showSalidas ? 'rotate-180' : ''}`}
              />
            </button>
            {showSalidas && (
              <div className="px-4 pb-4">
                <DisplaysPanel />
              </div>
            )}
          </div>

          {/* Sección: Plan y suscripción (colapsable) */}
          <div className="border-b border-surface-700">
            <button
              onClick={() => setShowPlan(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-surface-700/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Plan</span>
                {plan === 'pro' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold">PRO</span>}
                {plan === 'trial' && daysLeft > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-bold">{daysLeft}d</span>}
                {plan === 'trial' && daysLeft === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">EXPIRADO</span>}
              </div>
              <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${showPlan ? 'rotate-180' : ''}`} />
            </button>
            {showPlan && (
              <div className="px-4 pb-4 space-y-3">
                {/* Estado */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                  plan === 'pro' ? 'border-green-500/25 bg-green-500/10 text-green-300'
                  : plan === 'trial' && daysLeft > 0 ? 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300'
                  : 'border-red-500/25 bg-red-500/10 text-red-300'
                }`}>
                  <CreditCard size={13} />
                  <div>
                    <div>
                      {plan === 'pro' ? '\u2713 Plan Pro Activado'
                        : plan === 'trial' && daysLeft > 0 ? `Prueba gratuita \u2014 ${daysLeft} d\u00eda${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`
                        : plan === 'trial' ? 'Prueba expirada \u2014 suscr\u00edbete para continuar'
                        : 'Suscripci\u00f3n inactiva'}
                    </div>
                    {plan === 'pro' && org?.updated_at && (() => {
                      const base = new Date(org.updated_at);
                      const renewal = new Date(base);
                      if (org.paypal_plan_type === 'annual') renewal.setFullYear(renewal.getFullYear() + 1);
                      else renewal.setMonth(renewal.getMonth() + 1);
                      return <div className="text-[10px] opacity-60 mt-0.5">Renueva el {renewal.toLocaleDateString('es-CL')}</div>;
                    })()}
                  </div>
                </div>

                {/* Botones suscribirse */}
                {user?.is_admin && plan !== 'pro' && paypalConfig?.clientId && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => subscribe('monthly')}
                      disabled={!!subscribing}
                      className="flex flex-col items-center py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {subscribing === 'monthly' ? <Loader2 size={12} className="animate-spin text-yellow-400 mb-0.5" /> : <CreditCard size={12} className="text-yellow-400 mb-0.5" />}
                      <span className="text-xs font-bold text-white">$6 / mes</span>
                    </button>
                    <button
                      onClick={() => subscribe('annual')}
                      disabled={!!subscribing}
                      className="flex flex-col items-center py-2.5 rounded-lg border border-yellow-400/25 bg-yellow-500/8 hover:bg-yellow-500/15 transition-colors disabled:opacity-50"
                    >
                      {subscribing === 'annual' ? <Loader2 size={12} className="animate-spin text-yellow-400 mb-0.5" /> : <CreditCard size={12} className="text-yellow-400 mb-0.5" />}
                      <span className="text-xs font-bold text-white">$60 / año</span>
                      <span className="text-[10px] text-white/40">$5/mes</span>
                    </button>
                  </div>
                )}

                {/* Cancelar */}
                {user?.is_admin && plan === 'pro' && (
                  !confirmCancel
                    ? <button onClick={() => setConfirmCancel(true)} className="w-full py-1.5 text-xs text-red-400/50 hover:text-red-400 border border-red-500/15 hover:border-red-500/25 rounded-lg transition-colors">Cancelar suscripción</button>
                    : <div className="space-y-1.5">
                        <p className="text-xs text-red-300 text-center">¿Seguro que quieres cancelar?</p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmCancel(false)} className="flex-1 py-1.5 text-xs border border-white/10 text-white/40 rounded-lg hover:bg-white/5">No</button>
                          <button onClick={cancelSubscription} disabled={cancelling} className="flex-1 py-1.5 text-xs bg-red-500/15 border border-red-500/25 text-red-300 rounded-lg hover:bg-red-500/25 disabled:opacity-50">
                            {cancelling ? <Loader2 size={10} className="animate-spin mx-auto" /> : 'Sí, cancelar'}
                          </button>
                        </div>
                      </div>
                )}
              </div>
            )}
          </div>

          {/* Sección: Sincronización con la nube (colapsable) */}
          <div className="border-b border-surface-700">
            <button
              onClick={() => setShowSync(v => !v)}
              className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-surface-700/50 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sincronización</span>
              <ChevronDown
                size={14}
                className={`text-zinc-500 transition-transform duration-200 ${showSync ? 'rotate-180' : ''}`}
              />
            </button>
            {showSync && (
              <div className="px-4 pb-4">
                <SyncPanel />
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

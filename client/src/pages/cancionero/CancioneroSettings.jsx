import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Users, Calendar, Building2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Check, Plus, Trash2, Save, Loader2, Lock, X, CheckCircle2, HelpCircle,
  Mail, Send, ShieldCheck, UserPlus, Clock, Copy, LogOut,
  CreditCard, Smartphone, AlertCircle, ExternalLink,
} from 'lucide-react';
import CancioneroNavbar from './CancioneroNavbar';

const API = import.meta.env.VITE_API_URL || '';
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}`,
  };
}

const INSTRUMENTS = [
  'Voz (soprano)', 'Voz (alto)', 'Voz (tenor)', 'Voz (barítono)',
  'Coros', 'Guitarra eléctrica', 'Guitarra acústica',
  'Bajo eléctrico', 'Batería', 'Teclado', 'Piano', 'Sintetizador',
  'Violín', 'Trompeta', 'Saxofón', 'Trombón',
  'Percusión', 'Cajón', 'Ukulele', 'Mandolina', 'Otro',
];

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const DAYS_ES = ['L','M','X','J','V','S','D'];

function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

// ─── Mi Perfil ────────────────────────────────────────────────────────────────
function ProfileSection({ user, onSaved }) {
  const navigate = useNavigate();
  const [instruments, setInstruments] = useState(user?.instruments || []);
  const [savedInstruments, setSavedInstruments] = useState(user?.instruments || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setInstruments(user?.instruments || []);
    setSavedInstruments(user?.instruments || []);
  }, [user]);

  const isDirty = JSON.stringify([...instruments].sort()) !== JSON.stringify([...savedInstruments].sort());

  const toggle = (inst) =>
    setInstruments(prev =>
      prev.includes(inst) ? prev.filter(i => i !== inst) : [...prev, inst]
    );

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ instruments }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSaved?.(updated);
        setSavedInstruments(updated.instruments || instruments);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Avatar + datos básicos */}
      <div className="flex items-center gap-4">
        {user?.avatar_url
          ? <img src={user.avatar_url} alt="" className="w-20 h-20 rounded-full border-2 border-yellow-400/30 object-cover flex-shrink-0" />
          : (
            <div className="w-20 h-20 rounded-full bg-yellow-500/15 border-2 border-yellow-400/25 flex items-center justify-center flex-shrink-0">
              <User size={32} className="text-yellow-400/50" />
            </div>
          )
        }
        <div className="min-w-0">
          <p className="text-base font-bold text-white truncate">{user?.display_name || '—'}</p>
          <p className="text-sm text-white/40 truncate">{user?.email || ''}</p>
          {user?.is_admin && (
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 font-semibold uppercase tracking-wider">
              Admin
            </span>
          )}
        </div>
      </div>

      {/* Selector de instrumentos */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-3">
          Instrumentos y roles
        </p>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENTS.map(inst => {
            const active = instruments.includes(inst);
            return (
              <button
                key={inst}
                onClick={() => toggle(inst)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                  active
                    ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-300'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:border-white/25'
                }`}
              >
                {active && <Check size={10} />}
                {inst}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving || !isDirty}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 border ${
          !isDirty
            ? 'bg-green-500/15 border-green-400/35 text-green-300 cursor-default'
            : 'bg-yellow-500/15 border-yellow-400/35 text-yellow-300 hover:bg-yellow-500/25'
        }`}
      >
        {saving
          ? <Loader2 size={14} className="animate-spin" />
          : !isDirty
            ? <><Check size={14} /> Perfil guardado</>
            : <><Save size={14} /> Guardar perfil</>
        }
      </button>

      <button
        onClick={async () => {
          const token = localStorage.getItem('aio_sync_token');
          if (token) {
            try { await fetch(`${API}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch (_) {}
          }
          localStorage.removeItem('aio_sync_token'); localStorage.removeItem('aio_org_id'); navigate('/');
        }}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 border border-red-500/20 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
      >
        <LogOut size={14} /> Cerrar sesión
      </button>
    </div>
  );
}

// ─── Mis dispositivos (sesiones activas) ─────────────────────────────────────
function SessionsSection({ currentIat }) {
  const [sessions, setSessions]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [closingId, setClosingId]   = useState(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/sessions`, { headers: authHeaders() });
      if (r.ok) setSessions(await r.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const closeSession = async (id) => {
    setClosingId(id);
    try {
      await fetch(`${API}/auth/sessions/${id}`, { method: 'DELETE', headers: authHeaders() });
      setSessions(s => s.filter(x => x.id !== id));
    } finally {
      setClosingId(null);
    }
  };

  const fmt = (dateStr) => {
    if (!dateStr) return 'Sin actividad';
    const d   = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'Hace un momento';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`;
    return `Hace ${Math.floor(diff / 86400000)} días`;
  };

  if (loading) return (
    <div className="flex justify-center py-4">
      <Loader2 size={16} className="animate-spin text-white/30" />
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-3">
        Mis dispositivos ({sessions.length}/{3})
      </p>
      {sessions.length === 0 && (
        <p className="text-xs text-white/30 text-center py-2">Sin sesiones registradas</p>
      )}
      {sessions.map(s => (
        <div key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
          s.is_current ? 'border-green-500/30 bg-green-500/8' : 'border-white/8 bg-white/3'
        }`}>
          <Smartphone size={14} className={s.is_current ? 'text-green-400' : 'text-white/30'} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/70 truncate">
              {s.last_ip || 'IP desconocida'}
              {s.is_current && <span className="ml-2 text-[10px] text-green-400 font-semibold">• este dispositivo</span>}
            </p>
            <p className="text-[10px] text-white/30">{fmt(s.last_seen)}</p>
          </div>
          {!s.is_current && (
            <button
              onClick={() => closeSession(s.id)}
              disabled={closingId === s.id}
              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 disabled:opacity-40"
            >
              {closingId === s.id ? <Loader2 size={10} className="animate-spin" /> : 'Cerrar'}
            </button>
          )}
        </div>
      ))}
      {sessions.length >= 3 && (
        <p className="text-[10px] text-yellow-400/60 text-center pt-1">
          Límite de 3 dispositivos alcanzado. Cierra uno para poder iniciar sesión en otro.
        </p>
      )}
    </div>
  );
}

// ─── Plan y suscripción ───────────────────────────────────────────────────────
function PlanSection({ org, isAdmin }) {
  const [config, setConfig]         = useState(null);
  const [subscribing, setSubscribing] = useState(null); // 'monthly' | 'annual' | null
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    fetch(`${API}/paypal/config`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.clientId) setConfig(d); })
      .catch(() => {});
  }, []);

  const subscribe = async (planType) => {
    setSubscribing(planType);
    try {
      const r = await fetch(`${API}/paypal/create-subscription`, {
        method : 'POST',
        headers: authHeaders(),
        body   : JSON.stringify({ planType }),
      });
      const d = await r.json();
      if (r.ok && d.approvalUrl) {
        window.location.href = d.approvalUrl;
      } else {
        alert(d.error || 'Error al iniciar suscripción');
      }
    } catch {
      alert('Error de conexión');
    }
    setSubscribing(null);
  };

  const cancelSubscription = async () => {
    setCancelling(true);
    try {
      const r = await fetch(`${API}/paypal/cancel`, { method: 'POST', headers: authHeaders() });
      if (r.ok) window.location.reload();
      else {
        const d = await r.json();
        alert(d.error || 'Error al cancelar');
      }
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };

  const plan        = org?.effective_plan || org?.plan || 'trial';
  const trialEnds   = org?.trial_ends ? new Date(org.trial_ends) : null;
  const daysLeft    = trialEnds ? Math.max(0, Math.ceil((trialEnds - Date.now()) / 86400000)) : 0;
  const trialExpired = plan === 'trial' && daysLeft === 0;

  const PLAN_LABELS = {
    trial     : { label: 'Prueba gratuita', color: 'text-yellow-300', bg: 'bg-yellow-500/15 border-yellow-400/25' },
    pro       : { label: '\u2713 Plan Pro Activado', color: 'text-green-300',  bg: 'bg-green-500/15 border-green-400/25'  },
    cancelled : { label: 'Cancelado',        color: 'text-red-300',    bg: 'bg-red-500/15 border-red-400/25'      },
    suspended : { label: 'Suspendido',       color: 'text-orange-300', bg: 'bg-orange-500/15 border-orange-400/25'},
    expired   : { label: 'Expirado',         color: 'text-red-300',    bg: 'bg-red-500/15 border-red-400/25'      },
  };
  const planInfo = PLAN_LABELS[plan] || PLAN_LABELS.trial;

  return (
    <div className="space-y-4">
      {/* Estado actual del plan */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${planInfo.bg}`}>
        <CreditCard size={16} className={planInfo.color} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${planInfo.color}`}>{planInfo.label}</p>
          {plan === 'trial' && !trialExpired && (
            <p className="text-xs text-white/40">Quedan {daysLeft} día{daysLeft !== 1 ? 's' : ''} de prueba</p>
          )}
          {trialExpired && (
            <p className="text-xs text-red-300/70">Tu prueba ha terminado — suscríbete para continuar</p>
          )}
          {plan === 'pro' && (
            <p className="text-xs text-white/40">Hasta 5 miembros</p>
          )}
          {plan === 'pro' && org?.updated_at && (() => {
            const base = new Date(org.updated_at);
            const renewal = new Date(base);
            if (org.paypal_plan_type === 'annual') renewal.setFullYear(renewal.getFullYear() + 1);
            else renewal.setMonth(renewal.getMonth() + 1);
            return <p className="text-xs text-green-300/60">Renueva el {renewal.toLocaleDateString('es-CL')}</p>;
          })()}
        </div>
      </div>

      {/* Botones de suscripción (solo admin, si no es pro activo) */}
      {isAdmin && plan !== 'pro' && config?.clientId && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
            Suscribirse
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => subscribe('monthly')}
              disabled={!!subscribing}
              className="flex flex-col items-center py-3 px-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {subscribing === 'monthly'
                ? <Loader2 size={14} className="animate-spin text-yellow-400 mb-1" />
                : <CreditCard size={14} className="text-yellow-400 mb-1" />
              }
              <span className="text-xs font-bold text-white">$6 / mes</span>
              <span className="text-[10px] text-white/40">mensual</span>
            </button>
            <button
              onClick={() => subscribe('annual')}
              disabled={!!subscribing}
              className="flex flex-col items-center py-3 px-2 rounded-xl border border-yellow-400/30 bg-yellow-500/8 hover:bg-yellow-500/15 transition-colors disabled:opacity-50 relative"
            >
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] bg-yellow-500 text-black font-bold px-2 py-0.5 rounded-full">MÁS POPULAR</span>
              {subscribing === 'annual'
                ? <Loader2 size={14} className="animate-spin text-yellow-400 mb-1" />
                : <CreditCard size={14} className="text-yellow-400 mb-1" />
              }
              <span className="text-xs font-bold text-white">$60 / año</span>
              <span className="text-[10px] text-white/40">$5/mes</span>
            </button>
          </div>
          <p className="text-[10px] text-white/30 text-center">
            Pago seguro con PayPal · Cancela en cualquier momento
          </p>
        </div>
      )}

      {/* Sin PayPal configurado */}
      {isAdmin && plan !== 'pro' && !config?.clientId && (
        <p className="text-xs text-white/30 text-center py-2">
          Suscripciones no disponibles aún
        </p>
      )}

      {/* Cancelar suscripción activa */}
      {isAdmin && plan === 'pro' && (
        <div>
          {!confirmCancel ? (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full py-2 rounded-xl text-xs text-red-400/50 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 hover:bg-red-500/8 transition-colors"
            >
              Cancelar suscripción
            </button>
          ) : (
            <div className="p-3 rounded-xl border border-red-500/25 bg-red-500/8 space-y-2">
              <p className="text-xs text-red-300 text-center">¿Seguro que quieres cancelar?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs border border-white/15 text-white/50 hover:bg-white/8"
                >
                  No, volver
                </button>
                <button
                  onClick={cancelSubscription}
                  disabled={cancelling}
                  className="flex-1 py-1.5 rounded-lg text-xs bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={10} className="animate-spin mx-auto" /> : 'Sí, cancelar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Equipo (solo admin) ──────────────────────────────────────────────────────
function TeamSection({ members: initialMembers, onMembersUpdated }) {
  const [members, setMembers]       = useState(initialMembers || []);
  const [invitations, setInvitations] = useState([]);
  const [inviteLink, setInviteLink]     = useState(null);
  const [copied, setCopied]             = useState(false);
  const [copiedId, setCopiedId]         = useState(null);
  const [loadingInv, setLoadingInv] = useState(true);

  // Campos del formulario de invitación
  const [firstName, setFirstName]   = useState('');
  const [lastName, setLastName]     = useState('');
  const [email, setEmail]           = useState('');
  const [sending, setSending]       = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const [editingId, setEditingId]   = useState(null); // memberId o `inv:${id}`
  const [savingInst, setSavingInst] = useState(null);

  useEffect(() => { setMembers(initialMembers || []); }, [initialMembers]);

  const loadInvitations = useCallback(async () => {
    setLoadingInv(true);
    try {
      const r = await fetch(`${API}/auth/invitations`, { headers: authHeaders() });
      const d = await r.json();
      setInvitations(Array.isArray(d) ? d : []);
    } catch {}
    setLoadingInv(false);
  }, []);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const sendInvite = async () => {
    if (!email.trim()) return;
    setSending(true);
    setSendResult(null);
    const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null;
    try {
      const r = await fetch(`${API}/auth/invite`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email: email.trim(), display_name: displayName, instruments: [] }),
      });
      const d = await r.json();
      if (r.ok) {
        const link = d.inviteUrl || (d.invitation?.code
          ? `${window.location.origin}/?invite=${d.invitation.code}`
          : null);
        const msg = d.emailSent
          ? `Email enviado a ${email.trim()}. También puedes copiar el link:`
          : 'Invitación creada. Copia el link y envíalo manualmente:';
        setSendResult({ ok: true, msg });
        setInviteLink(link);
        setEmail(''); setFirstName(''); setLastName('');
        loadInvitations();
        onMembersUpdated?.();
      } else {
        setSendResult({ ok: false, msg: d.error || 'Error al enviar' });
      }
    } catch {
      setSendResult({ ok: false, msg: 'Error de conexión' });
    }
    setSending(false);
  };

  const copyLink = (id, url) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const reinviteMember = async (member) => {
    try {
      const r = await fetch(`${API}/auth/invite`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email: member.email, display_name: member.display_name, instruments: member.instruments || [] }),
      });
      const d = await r.json();
      if (r.ok && d.inviteUrl) { copyLink(`reinv:${member.id}`, d.inviteUrl); loadInvitations(); onMembersUpdated?.(); }
    } catch {}
  };

  const revokeInvite = async (id) => {
    await fetch(`${API}/auth/invitations/${id}`, { method: 'DELETE', headers: authHeaders() });
    setInvitations(prev => prev.filter(i => i.id !== id));
    onMembersUpdated?.();
  };

  const removeMember = async (id) => {
    await fetch(`${API}/auth/members/${id}`, { method: 'DELETE', headers: authHeaders() });
    setMembers(prev => prev.filter(m => m.id !== id));
    onMembersUpdated?.();
  };

  // Toggle instrumento — funciona para miembros reales e invitados pendientes
  const toggleInstrument = (id, inst, current, isPending) => {
    const next = current.includes(inst) ? current.filter(i => i !== inst) : [...current, inst];
    if (isPending) {
      setInvitations(prev => prev.map(inv => inv.id === id ? { ...inv, instruments: next } : inv));
    } else {
      setMembers(prev => prev.map(m => m.id === id ? { ...m, instruments: next } : m));
    }
  };

  // Guardar instrumentos de miembro real
  const saveInstruments = async (member) => {
    setSavingInst(member.id);
    try {
      const r = await fetch(`${API}/auth/members/${member.id}/instruments`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ instruments: member.instruments || [] }),
      });
      if (r.ok) {
        const updated = await r.json();
        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, instruments: updated.instruments } : m));
        onMembersUpdated?.();
        setEditingId(null);
      }
    } finally { setSavingInst(null); }
  };

  // Guardar instrumentos de invitado pendiente
  const saveInvitationInstruments = async (inv) => {
    setSavingInst(`inv:${inv.id}`);
    try {
      const r = await fetch(`${API}/auth/invitations/${inv.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ instruments: inv.instruments || [] }),
      });
      if (r.ok) {
        onMembersUpdated?.();
        setEditingId(null);
      }
    } finally { setSavingInst(null); }
  };

  const pending = invitations.filter(i => !i.used_at);

  // Renderiza el panel de instrumentos (compartido para reales y pendientes)
  const renderInstrumentPanel = (id, name, instruments, isPending, invObj) => (
    <div className="px-3 pb-3 pt-2 border-t border-white/10 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
        Instrumentos {isPending ? '(pre-configurar para cuando acepte)' : `de ${name}`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {INSTRUMENTS.map(inst => {
          const active = (instruments || []).includes(inst);
          return (
            <button
              key={inst}
              onClick={() => toggleInstrument(id, inst, instruments || [], isPending)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                active
                  ? 'bg-yellow-500/20 border-yellow-400/40 text-yellow-300'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:border-white/25'
              }`}
            >
              {active && <Check size={9} />}
              {inst}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => isPending ? saveInvitationInstruments(invObj) : saveInstruments({ id, instruments })}
        disabled={savingInst === (isPending ? `inv:${id}` : id)}
        className="w-full py-2 rounded-xl text-xs font-semibold bg-yellow-500/15 border border-yellow-400/35 text-yellow-300 hover:bg-yellow-500/25 transition-colors flex items-center justify-center gap-1.5"
      >
        {savingInst === (isPending ? `inv:${id}` : id) ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
        Guardar instrumentos
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── Invitar por email ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-2">Invitar a la banda</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Nombre"
            className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-yellow-400/50"
          />
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Apellido"
            className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-yellow-400/50"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendInvite()}
            placeholder="correo@ejemplo.com"
            className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-yellow-400/50"
          />
          <button
            onClick={sendInvite}
            disabled={sending || !email.trim()}
            className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 bg-yellow-500/15 border-yellow-400/35 text-yellow-300 hover:bg-yellow-500/25 disabled:opacity-40"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Invitar
          </button>
        </div>
        {sendResult && (
          <div className="mt-1.5 space-y-1.5">
            <p className={`text-xs ${sendResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {sendResult.ok ? '✓ ' : '✗ '}{sendResult.msg}
            </p>
            {inviteLink && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <p className="flex-1 text-xs text-white/50 truncate">{inviteLink}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex-shrink-0 flex items-center gap-1 text-xs text-yellow-300 hover:text-yellow-200 transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Miembros + invitados pendientes ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-2">Miembros del equipo</p>
        {loadingInv && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-white/30" /></div>}
        <div className="space-y-2">
          {/* Miembros reales (excluir pendientes, ya se muestran abajo desde invitations) */}
          {members.filter(m => !m.is_pending).map(member => {
            const isEditing = editingId === member.id;
            return (
              <div key={member.id} className="border border-white/10 rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setEditingId(isEditing ? null : member.id)}
                >
                  {member.avatar_url
                    ? <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"><User size={14} className="text-white/35" /></div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/90 truncate">{member.display_name}</p>
                    <p className="text-[10px] text-white/30 truncate">
                      {(member.instruments || []).length > 0 ? (member.instruments || []).join(', ') : 'Sin instrumentos'}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); reinviteMember(member); }}
                    className="p-1.5 hover:text-yellow-300 text-white/20 transition-colors flex-shrink-0"
                    title="Copiar link de invitación"
                  >
                    {copiedId === `reinv:${member.id}` ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); removeMember(member.id); }}
                    className="p-1 hover:text-red-400 text-white/15 transition-colors flex-shrink-0"
                    title="Eliminar miembro"
                  >
                    <X size={13} />
                  </button>
                  {isEditing ? <ChevronUp size={14} className="text-white/30 flex-shrink-0" /> : <ChevronDown size={14} className="text-white/30 flex-shrink-0" />}
                </div>
                {isEditing && renderInstrumentPanel(member.id, member.display_name, member.instruments, false, null)}
              </div>
            );
          })}

          {/* Invitados pendientes */}
          {pending.map(inv => {
            const editKey = `inv:${inv.id}`;
            const isEditing = editingId === editKey;
            const displayName = inv.display_name || inv.email;
            return (
              <div key={inv.id} className="border border-dashed border-yellow-400/25 rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setEditingId(isEditing ? null : editKey)}
                >
                  <div className="w-8 h-8 rounded-full bg-yellow-500/10 border border-yellow-400/25 flex items-center justify-center flex-shrink-0">
                    <Clock size={13} className="text-yellow-400/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-white/70 truncate">{displayName}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400/70 font-semibold flex-shrink-0">pendiente</span>
                    </div>
                    <p className="text-[10px] text-white/25 truncate">
                      {(inv.instruments || []).length > 0 ? (inv.instruments || []).join(', ') : 'Sin instrumentos pre-configurados'}
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); if (inv.inviteUrl) copyLink(inv.id, inv.inviteUrl); }}
                    className="p-1.5 hover:text-yellow-300 text-white/20 transition-colors flex-shrink-0"
                    title="Copiar link de invitación"
                  >
                    {copiedId === inv.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); revokeInvite(inv.id); }}
                    className="p-1 hover:text-red-400 text-white/15 transition-colors flex-shrink-0"
                    title="Revocar invitación"
                  >
                    <X size={13} />
                  </button>
                  {isEditing ? <ChevronUp size={14} className="text-white/30 flex-shrink-0" /> : <ChevronDown size={14} className="text-white/30 flex-shrink-0" />}
                </div>
                {isEditing && renderInstrumentPanel(inv.id, displayName, inv.instruments, true, inv)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Banda ────────────────────────────────────────────────────────────────────
function BandSection({ members, org, isAdmin, onOrgUpdated }) {
  const [bandName, setBandName]   = useState(org?.band_name || '');
  const [savedBandName, setSavedBandName] = useState(org?.band_name || '');
  const [savingName, setSavingName] = useState(false);
  const [spotifyClientId, setSpotifyClientId] = useState(org?.spotify_client_id || '');
  const [savedSpotifyId,  setSavedSpotifyId]  = useState(org?.spotify_client_id || '');
  const [savingSpotify,   setSavingSpotify]   = useState(false);
  const [showSpotifyHelp, setShowSpotifyHelp] = useState(false);
  const [configs, setConfigs]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [openId, setOpenId]   = useState(null);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    setBandName(org?.band_name || '');
    setSavedBandName(org?.band_name || '');
    setSpotifyClientId(org?.spotify_client_id || '');
    setSavedSpotifyId(org?.spotify_client_id || '');
  }, [org]);

  const isBandNameDirty = bandName !== savedBandName;
  const isSpotifyDirty  = spotifyClientId !== savedSpotifyId;

  const saveBandName = async () => {
    setSavingName(true);
    try {
      const res = await fetch(`${API}/auth/org`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ band_name: bandName }),
      });
      if (res.ok) setSavedBandName(bandName);
    } finally { setSavingName(false); }
  };

  const saveSpotifyId = async () => {
    setSavingSpotify(true);
    try {
      const res = await fetch(`${API}/auth/org`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ spotify_client_id: spotifyClientId.trim() || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSavedSpotifyId(updated.spotify_client_id || '');
        setSpotifyClientId(updated.spotify_client_id || '');
        onOrgUpdated?.(updated);
      }
    } finally { setSavingSpotify(false); }
  };

  useEffect(() => {
    fetch(`${API}/api/band-configs`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setConfigs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const addConfig = async () => {
    const count = configs.length;
    const name  = count === 0 ? 'Configuración normal' : `Configuración ${count + 1}`;
    const slots = members.map(m => ({
      userId:     m.id,
      userName:   m.display_name,
      avatarUrl:  m.avatar_url,
      instrument: (m.instruments || [])[0] || '',
    }));
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/band-configs`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, slots }),
      });
      if (res.ok) {
        const newCfg = await res.json();
        setConfigs(prev => [...prev, newCfg]);
        setOpenId(newCfg.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteConfig = async (id) => {
    await fetch(`${API}/api/band-configs/${id}`, { method: 'DELETE', headers: authHeaders() });
    setConfigs(prev => prev.filter(c => c.id !== id));
    if (openId === id) setOpenId(null);
  };

  const updateSubtitle = (configId, subtitle) =>
    setConfigs(prev => prev.map(c => c.id === configId ? { ...c, subtitle } : c));

  const updateSlot = (configId, userId, instrument) =>
    setConfigs(prev => prev.map(c => {
      if (c.id !== configId) return c;
      return { ...c, slots: c.slots.map(s => s.userId === userId ? { ...s, instrument } : s) };
    }));

  const moveSlot = (configId, idx, dir) =>
    setConfigs(prev => prev.map(c => {
      if (c.id !== configId) return c;
      const slots = [...c.slots];
      const target = idx + dir;
      if (target < 0 || target >= slots.length) return c;
      [slots[idx], slots[target]] = [slots[target], slots[idx]];
      return { ...c, slots };
    }));

  const addSlot = (configId, member) =>
    setConfigs(prev => prev.map(c => {
      if (c.id !== configId) return c;
      if (c.slots.some(s => s.userId === member.id)) return c;
      return { ...c, slots: [...c.slots, {
        userId:     member.id,
        userName:   member.display_name,
        avatarUrl:  member.avatar_url,
        instrument: (member.instruments || [])[0] || '',
      }]};
    }));

  const removeSlot = (configId, userId) =>
    setConfigs(prev => prev.map(c => {
      if (c.id !== configId) return c;
      return { ...c, slots: c.slots.filter(s => s.userId !== userId) };
    }));

  const updateName = (configId, name) =>
    setConfigs(prev => prev.map(c => c.id === configId ? { ...c, name } : c));

  const saveConfig = async (config) => {
    setSaving(true);
    try {
      await fetch(`${API}/api/band-configs/${config.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ name: config.name, subtitle: config.subtitle ?? null, slots: config.slots }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-yellow-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Nombre de la banda (solo admin) */}
      {isAdmin && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-2">Nombre de la banda</p>
          <div className="flex gap-2">
            <input
              value={bandName}
              onChange={e => setBandName(e.target.value)}
              placeholder="Ej: Alabanza Central"
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-yellow-400/50"
            />
            <button
              onClick={saveBandName}
              disabled={savingName || !isBandNameDirty}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                !isBandNameDirty
                  ? 'bg-green-500/15 border-green-400/35 text-green-300 cursor-default'
                  : 'bg-yellow-500/15 border-yellow-400/35 text-yellow-300 hover:bg-yellow-500/25'
              }`}
            >
              {savingName
                ? <Loader2 size={12} className="animate-spin" />
                : !isBandNameDirty ? <Check size={12} /> : <Save size={12} />
              }
            </button>
          </div>
        </div>
      )}

      {!isAdmin && (org?.band_name) && (
        <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-white/40 mb-0.5">Nombre de la banda</p>
          <p className="text-sm font-semibold text-white">{org.band_name}</p>
        </div>
      )}

      {/* Spotify Client ID — solo admin */}
      {isAdmin && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-white/40">Spotify Client ID <span className="text-green-400/60">(para crear playlists)</span></p>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-green-400/40"
              placeholder="ej: 4f3a9c2b1e8d..."
              value={spotifyClientId}
              onChange={e => setSpotifyClientId(e.target.value)}
              spellCheck={false}
            />
            <button
              onClick={saveSpotifyId}
              disabled={savingSpotify || !isSpotifyDirty}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 disabled:opacity-40 ${
                !isSpotifyDirty
                  ? 'bg-green-500/15 border-green-400/35 text-green-300 cursor-default'
                  : 'bg-green-500/15 border-green-400/35 text-green-300 hover:bg-green-500/25'
              }`}
            >
              {savingSpotify
                ? <Loader2 size={12} className="animate-spin" />
                : !isSpotifyDirty ? <Check size={12} /> : <Save size={12} />
              }
            </button>
          </div>
          {/* Ayuda paso a paso */}
          <button
            type="button"
            onClick={() => setShowSpotifyHelp(v => !v)}
            className="flex items-center gap-1 text-[10px] text-green-400/60 hover:text-green-300 transition-colors"
          >
            {showSpotifyHelp ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {showSpotifyHelp ? 'Ocultar instrucciones' : '¿Cómo obtener el Client ID?'}
          </button>

          {showSpotifyHelp && (
            <div className="rounded-xl border border-green-400/15 bg-green-500/5 px-4 py-3 space-y-3 text-xs text-white/60">
              <p className="font-semibold text-green-300/80 text-[11px] uppercase tracking-wider">Configuración de Spotify — paso a paso</p>

              {/* Requisito: cuenta gratuita basta */}
              <div className="rounded-lg bg-green-500/10 border border-green-400/20 px-3 py-2 text-green-200/70 text-[10px]">
                ✅ <strong className="text-green-300">Cuenta gratuita o Premium</strong> — la creación de playlists via API funciona con cualquier cuenta de Spotify, no se requiere Premium.
              </div>

              <ol className="space-y-2.5 list-none">
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold flex items-center justify-center">1</span>
                  <span>Ve a <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-green-300 underline underline-offset-2">developer.spotify.com/dashboard</a> e inicia sesión con tu cuenta de Spotify.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold flex items-center justify-center">2</span>
                  <span>Haz clic en <strong className="text-white/80">Create app</strong> y rellena el nombre y descripción (cualquier valor).</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold flex items-center justify-center">3</span>
                  <div className="flex flex-col gap-1.5">
                    <span>En <strong className="text-white/80">Redirect URIs</strong> agrega esta URL:</span>
                    <code className="block bg-black/30 rounded px-2 py-1 text-green-200/80 text-[10px] break-all font-mono">{window.location.origin}/cancionero/spotify-callback</code>
                  </div>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold flex items-center justify-center">4</span>
                  <span>Marca <strong className="text-white/80">Web API</strong> en <em>APIs used</em>, acepta los términos y guarda.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-bold flex items-center justify-center">5</span>
                  <span>Copia el <strong className="text-white/80">Client ID</strong> que aparece en la página de la app y pégalo arriba.</span>
                </li>
              </ol>

              <div className="rounded-lg bg-yellow-500/10 border border-yellow-400/20 px-3 py-2 text-yellow-200/70 text-[10px]">
                <strong className="text-yellow-300">Modo desarrollo (límite 25 usuarios):</strong> Una app nueva en Spotify solo permite los usuarios que tú agreges explícitamente. Ve a <strong className="text-white/70">Settings → User Management</strong> dentro de tu app y añade los correos de las cuentas de Spotify que van a usarla.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Separador */}
      <div className="border-t border-white/10 pt-1" />

      {configs.length === 0 && (
        <p className="text-sm text-white/25 text-center py-3">Aún no hay configuraciones. Crea la primera.</p>
      )}

      {configs.map((config, idx) => (
        <div key={config.id} className="border border-white/10 rounded-xl overflow-hidden">
          {/* Header de la config */}
          <div
            className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => setOpenId(openId === config.id ? null : config.id)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{config.name}</p>
              <p className="text-xs text-white/30">
                {(config.slots || []).length} músicos{config.subtitle ? ` · ${config.subtitle}` : ''}
              </p>
            </div>
            {idx > 0 && (
              <button
                onClick={e => { e.stopPropagation(); deleteConfig(config.id); }}
                className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/25 hover:text-red-400 transition-colors"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            )}
            {openId === config.id
              ? <ChevronUp size={16} className="text-white/35 flex-shrink-0" />
              : <ChevronDown size={16} className="text-white/35 flex-shrink-0" />
            }
          </div>

          {openId === config.id && (
            <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-4">
              {/* Nombre y subtítulo editables */}
              <input
                value={config.name}
                onChange={e => updateName(config.id, e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-yellow-400/50"
                placeholder="Nombre de la configuración"
              />
              <input
                value={config.subtitle || ''}
                onChange={e => updateSubtitle(config.id, e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white/60 placeholder-white/20 focus:outline-none focus:border-yellow-400/40"
                placeholder="Subtítulo opcional (ej: Domingo de alabanza)"
              />

              {/* Slots de músicos */}
              <div className="space-y-2.5">
                {(config.slots || []).map((slot, idx, arr) => (
                  <div key={slot.userId} className="flex items-center gap-2">
                    {/* Botones subir/bajar */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveSlot(config.id, idx, -1)}
                        disabled={idx === 0}
                        className="p-0.5 rounded text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => moveSlot(config.id, idx, 1)}
                        disabled={idx === arr.length - 1}
                        className="p-0.5 rounded text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    {slot.avatarUrl
                      ? <img src={slot.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                          <User size={14} className="text-white/35" />
                        </div>
                    }
                    <p className="text-xs font-medium text-white/70 flex-1 min-w-0 truncate">{slot.userName}</p>
                    <select
                      value={slot.instrument || ''}
                      onChange={e => updateSlot(config.id, slot.userId, e.target.value)}
                      className="text-xs bg-white/10 border border-white/10 rounded-lg px-2 py-1.5 text-white/70 min-w-0"
                      style={{ maxWidth: '9rem' }}
                    >
                      <option value="">— Sin instrumento —</option>
                      {(() => {
                        const member = members.find(m => m.id === slot.userId);
                        const opts   = (member?.instruments?.length)
                          ? member.instruments
                          : INSTRUMENTS;
                        const list = (slot.instrument && !opts.includes(slot.instrument))
                          ? [slot.instrument, ...opts]
                          : opts;
                        return list.map(i => <option key={i} value={i}>{i}</option>);
                      })()}
                    </select>
                    <button
                      onClick={() => removeSlot(config.id, slot.userId)}
                      title="Quitar músico"
                      className="p-1 rounded-lg hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}

                {/* Agregar músico que no está en la config */}
                {(() => {
                  const slotIds = new Set((config.slots || []).map(s => s.userId));
                  const available = members.filter(m => !slotIds.has(m.id));
                  if (!available.length) return null;
                  return (
                    <div className="flex items-center gap-2 pt-1">
                      <UserPlus size={13} className="text-white/25 flex-shrink-0" />
                      <select
                        defaultValue=""
                        onChange={e => {
                          const m = members.find(mb => String(mb.id) === e.target.value);
                          if (m) { addSlot(config.id, m); e.target.value = ''; }
                        }}
                        className="flex-1 text-xs bg-white/5 border border-dashed border-white/15 rounded-lg px-2 py-1.5 text-white/40 focus:outline-none focus:border-yellow-400/40"
                      >
                        <option value="">Agregar músico…</option>
                        {available.map(m => (
                          <option key={m.id} value={m.id}>{m.display_name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </div>

              <button
                onClick={() => saveConfig(config)}
                disabled={saving}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-yellow-500/15 border border-yellow-400/35 text-yellow-300 hover:bg-yellow-500/25 transition-colors flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <><Save size={12} /> Guardar configuración</>}
              </button>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={addConfig}
        disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-dashed border-white/15 text-white/35 hover:text-white/65 hover:border-white/25 transition-colors flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        {configs.length === 0 ? 'Crear Configuración normal' : 'Agregar nueva configuración'}
      </button>
    </div>
  );
}

// ─── Mi Calendario ────────────────────────────────────────────────────────────
function CalendarSection({ myUserId }) {
  const today = new Date();
  const [year, setYear]           = useState(today.getFullYear());
  const [month, setMonth]         = useState(today.getMonth());
  const [blocked, setBlocked]     = useState([]);       // estado local (con cambios pendientes)
  const [savedBlocked, setSavedBlocked] = useState([]); // estado en BD
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const fetchBlocked = useCallback(async () => {
    setLoading(true);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const start   = `${year}-${pad(month + 1)}-01`;
    const end     = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
    try {
      const res  = await fetch(`${API}/api/blocked-dates?start=${start}&end=${end}`, { headers: authHeaders() });
      const data = await res.json();
      const arr  = Array.isArray(data) ? data : [];
      setBlocked(arr);
      setSavedBlocked(arr);
    } catch {}
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchBlocked(); }, [fetchBlocked]);

  // Toggle solo en estado local — no hace llamadas API
  const toggleDate = (key) => {
    const mine = blocked.find(b => b.date?.slice(0, 10) === key && b.user_id === myUserId);
    if (mine) {
      setBlocked(prev => prev.filter(b => b.id !== mine.id));
    } else {
      setBlocked(prev => [...prev, { id: `pending-${key}`, user_id: myUserId, date: key, display_name: 'Tú' }]);
    }
  };

  // Guardar: diff entre local y BD → POST/DELETE en paralelo
  const saveBlockedDates = async () => {
    setSaving(true);
    const savedMine = savedBlocked.filter(b => b.user_id === myUserId);
    const localMine = blocked.filter(b => b.user_id === myUserId);
    const savedKeys = new Set(savedMine.map(b => b.date?.slice(0, 10)));
    const localKeys = new Set(localMine.map(b => b.date?.slice(0, 10)));
    const toAdd    = [...localKeys].filter(k => !savedKeys.has(k));
    const toDelete = savedMine.filter(b => !localKeys.has(b.date?.slice(0, 10)));
    try {
      await Promise.all([
        ...toAdd.map(key =>
          fetch(`${API}/api/blocked-dates`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ date: key }),
          })
        ),
        ...toDelete.map(b =>
          fetch(`${API}/api/blocked-dates/${b.id}`, { method: 'DELETE', headers: authHeaders() })
        ),
      ]);
      await fetchBlocked(); // recarga desde BD
    } catch {}
    setSaving(false);
  };

  // ¿Hay cambios sin guardar (solo propios)?
  const myLocalDates = blocked.filter(b => b.user_id === myUserId).map(b => b.date?.slice(0, 10)).sort().join(',');
  const mySavedDates = savedBlocked.filter(b => b.user_id === myUserId).map(b => b.date?.slice(0, 10)).sort().join(',');
  const isDirty = myLocalDates !== mySavedDates;

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Grilla del mes (Lunes primero)
  const firstDow    = new Date(year, month, 1).getDay(); // 0=Dom
  const startOffset = (firstDow + 6) % 7;               // 0=Lun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="space-y-4">
      {/* Navegación de mes */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <ChevronLeft size={16} className="text-white/60" />
        </button>
        <p className="text-sm font-semibold text-white">{MONTHS_ES[month]} {year}</p>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <ChevronRight size={16} className="text-white/60" />
        </button>
      </div>

      {/* Cabecera de días */}
      <div className="grid grid-cols-7 gap-1">
        {DAYS_ES.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-white/30 py-1">{d}</div>
        ))}

        {/* Celdas de días */}
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const key        = dateStr(year, month, day);
          const myBlock    = blocked.find(b => b.date?.slice(0, 10) === key && b.user_id === myUserId);
          const othersBlk  = blocked.filter(b => b.date?.slice(0, 10) === key && b.user_id !== myUserId);
          const isToday    = key === todayStr;
          // Estado pendiente: en local pero no en BD, o en BD pero no en local
          const inSaved = savedBlocked.some(b => b.date?.slice(0, 10) === key && b.user_id === myUserId);
          const isPendingAdd    = !!myBlock && !inSaved;
          const isPendingRemove = !myBlock && inSaved;

          return (
            <button
              key={key}
              onClick={() => toggleDate(key)}
              className={`relative aspect-square rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                isPendingAdd
                  ? 'bg-red-500/25 border border-dashed border-red-400/70 text-red-300'
                  : myBlock
                    ? 'bg-red-500/25 border border-red-400/50 text-red-300'
                    : isPendingRemove
                      ? 'bg-white/5 border border-dashed border-red-400/40 text-white/40 line-through'
                      : isToday
                        ? 'bg-yellow-500/20 border border-yellow-400/40 text-yellow-300'
                        : 'hover:bg-white/10 text-white/60'
              }`}
            >
              {day}
              {othersBlk.length > 0 && (
                <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/35">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500/40 border border-red-400/50" />
          No disponible (yo)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          No disponible (otros)
        </span>
        <span className="flex items-center gap-1.5 text-yellow-400/50">
          Toca para bloquear/desbloquear
        </span>
      </div>

      {/* Lista de fechas bloqueadas este mes */}
      {loading && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-white/30" /></div>}
      {!loading && blocked.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/25 mb-2">Este mes</p>
          {blocked.map(b => {
            const dateKey = b.date?.slice(0, 10);
            const isPending = String(b.id).startsWith('pending-');
            return (
              <div
                key={b.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                  isPending ? 'bg-amber-500/10 border border-dashed border-amber-400/30' : 'bg-white/5'
                }`}
              >
                <Lock size={12} className={b.user_id === myUserId ? 'text-red-400 flex-shrink-0' : 'text-orange-400 flex-shrink-0'} />
                <span className="flex-1 text-xs text-white/65">
                  {(() => {
                    if (!dateKey) return '—';
                    const d = new Date(dateKey + 'T12:00:00');
                    if (isNaN(d)) return dateKey;
                    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' });
                  })()}
                  {isPending && <span className="ml-1 text-amber-400/70 text-[10px]">(sin guardar)</span>}
                </span>
                <span className="text-xs text-white/30 truncate max-w-[5rem]">{b.display_name || 'Tú'}</span>
                {b.user_id === myUserId && (
                  <button
                    onClick={() => toggleDate(dateKey)}
                    className="p-0.5 hover:text-red-400 text-white/20 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Botón Guardar — visible cuando hay cambios pendientes */}
      {isDirty && (
        <button
          onClick={saveBlockedDates}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-yellow-400/40 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-300 font-semibold text-sm transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      )}
    </div>
  );
}

// ─── Organización ────────────────────────────────────────────────────────────
function OrgSection({ orgs, onSwitch }) {
  const currentOrgId = Number(localStorage.getItem('aio_org_id'));
  const [switching, setSwitching] = useState(null);
  const navigate = useNavigate();

  // Renombrar org activa
  const isAdmin = (() => { try { return JSON.parse(atob(localStorage.getItem('aio_sync_token').split('.')[1]))?.isAdmin === true; } catch { return false; } })();
  const activeOrg = orgs.find(o => o.id === currentOrgId);
  const [renaming, setRenaming]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [renameError, setRenameError] = useState(null);

  // Crear nueva org
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState(null);

  const selectOrg = async (org) => {
    if (switching || org.id === currentOrgId) return;
    setSwitching(org.id);
    try {
      const res = await fetch(`${API}/auth/switch-org/${org.id}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const { token: newToken } = await res.json();
      localStorage.setItem('aio_sync_token', newToken);
      localStorage.setItem('aio_org_id', String(org.id));
      onSwitch?.();
      navigate('/cancionero', { replace: true });
    } catch {
      setSwitching(null);
    }
  };

  const saveRename = async (e) => {
    e.preventDefault();
    if (!newName.trim() || saving) return;
    setSaving(true); setRenameError(null);
    try {
      const res = await fetch(`${API}/auth/org`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      // Actualizar nombre en la lista local y cerrar
      setRenaming(false);
      window.location.reload();
    } catch (err) {
      setRenameError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createOrg = async (e) => {
    e.preventDefault();
    if (!createName.trim() || creating) return;
    setCreating(true); setCreateError(null);
    try {
      const res = await fetch(`${API}/auth/orgs`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear');
      localStorage.setItem('aio_sync_token', data.token);
      localStorage.setItem('aio_org_id', String(data.org.id));
      navigate('/cancionero', { replace: true });
    } catch (err) {
      setCreateError(err.message);
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Org activa con opción de renombrar (solo admin) */}
      {activeOrg && isAdmin && (
        <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-xl px-4 py-3">
          {!renaming ? (
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-yellow-400/60 font-semibold uppercase tracking-wider mb-0.5">Org activa</p>
                <p className="text-sm font-bold text-yellow-200">{activeOrg.name}</p>
              </div>
              <button
                onClick={() => { setNewName(activeOrg.name); setRenaming(true); }}
                className="text-xs text-yellow-400/60 hover:text-yellow-300 px-2 py-1 rounded-lg hover:bg-yellow-500/10 transition-colors"
              >
                Renombrar
              </button>
            </div>
          ) : (
            <form onSubmit={saveRename} className="space-y-2">
              <p className="text-xs text-yellow-400/60 font-semibold uppercase tracking-wider">Nuevo nombre</p>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                maxLength={80}
                className="w-full bg-white/10 border border-yellow-400/30 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-yellow-400/60"
              />
              {renameError && <p className="text-red-400 text-xs">{renameError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={!newName.trim() || saving}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-bold rounded-lg py-2 text-xs transition-colors">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Guardar
                </button>
                <button type="button" onClick={() => setRenaming(false)}
                  className="px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors">
                  <X size={14} />
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Lista de otras orgs para cambiar */}
      {orgs.filter(o => o.id !== currentOrgId).map(org => {
        const isLoading = switching === org.id;
        return (
          <button
            key={org.id}
            onClick={() => selectOrg(org)}
            disabled={!!switching}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10">
              {isLoading
                ? <Loader2 size={16} className="animate-spin text-yellow-300" />
                : <Building2 size={16} className="text-white/40" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-white/80">{org.name}</p>
              <p className="text-[10px] text-white/30 capitalize">{org.role}</p>
            </div>
            <ChevronRight size={14} className="text-white/25 flex-shrink-0" />
          </button>
        );
      })}

      {/* Crear nueva org */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 hover:border-yellow-400/35 rounded-xl px-4 py-3 text-white/35 hover:text-yellow-400/70 transition-all text-sm"
        >
          <Plus size={14} />
          Crear nueva organización
        </button>
      ) : (
        <form onSubmit={createOrg} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Nueva organización</p>
            <button type="button" onClick={() => { setShowCreate(false); setCreateName(''); setCreateError(null); }} className="text-white/30 hover:text-white/60">
              <X size={15} />
            </button>
          </div>
          <input
            autoFocus
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            placeholder="Nombre de la iglesia o grupo..."
            maxLength={80}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-yellow-400/50"
          />
          {createError && <p className="text-red-400 text-xs">{createError}</p>}
          <button type="submit" disabled={!createName.trim() || creating}
            className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-bold rounded-lg py-2.5 text-sm transition-colors">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {creating ? 'Creando...' : 'Crear organización'}
          </button>
        </form>
      )}
    </div>
  );
}

// ─── Tarjeta acordeón ─────────────────────────────────────────────────────────
function SectionCard({ icon: Icon, title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-yellow-500/15 border border-yellow-400/20 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-yellow-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{title}</p>
          {subtitle && <p className="text-xs text-white/35 truncate">{subtitle}</p>}
        </div>
        {open
          ? <ChevronUp size={16} className="text-white/30 flex-shrink-0" />
          : <ChevronDown size={16} className="text-white/30 flex-shrink-0" />
        }
      </button>

      {open && (
        <div className="px-4 pb-5 pt-2 border-t border-white/10">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function CancioneroSettings() {
  const navigate = useNavigate();
  const [user, setUser]       = useState(null);
  const [members, setMembers] = useState([]);
  const [orgs, setOrgs]       = useState([]);
  const [org, setOrg]         = useState(null);

  const loadData = useCallback(() => {
    const h = authHeaders();
    Promise.all([
      fetch(`${API}/auth/me`,          { headers: h }).then(r => r.json()),
      fetch(`${API}/auth/org/members`, { headers: h }).then(r => r.json()),
      fetch(`${API}/auth/my-orgs`,     { headers: h }).then(r => r.json()),
      fetch(`${API}/auth/org`,         { headers: h }).then(r => r.json()),
    ]).then(([u, m, o, orgData]) => {
      if (u?.id) setUser(u);
      if (Array.isArray(m)) {
        // deduplicar: un pendiente no debe aparecer si ya existe miembro real con mismo email o display_name
        const real = m.filter(x => !x.is_pending);
        const realKeys = new Set([
          ...real.map(x => x.email?.toLowerCase()).filter(Boolean),
          ...real.map(x => x.display_name?.toLowerCase()).filter(Boolean),
        ]);
        const pending = m.filter(x => x.is_pending && !realKeys.has(x.email?.toLowerCase()) && !realKeys.has(x.display_name?.toLowerCase()));
        setMembers([...real, ...pending]);
      } else {
        setMembers([]);
      }
      setOrgs(Array.isArray(o) ? o : []);
      if (orgData?.id) setOrg(orgData);
    }).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="h-screen bg-[#0f1a2e] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-[#0f1a2e]/95 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/cancionero')} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft size={20} className="text-white/70" />
        </button>
        <h1 className="text-base font-bold flex-1">Configuraciones</h1>
      </header>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3 max-w-2xl mx-auto w-full">
        <SectionCard
          icon={User}
          title="Mi Perfil"
          subtitle={user?.display_name || 'Cargando...'}
          defaultOpen
        >
          {user
            ? <ProfileSection user={user} onSaved={setUser} />
            : <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-yellow-400" /></div>
          }
        </SectionCard>

        <SectionCard
          icon={Smartphone}
          title="Mis dispositivos"
          subtitle="Sesiones activas (máx. 3)"
        >
          <SessionsSection />
        </SectionCard>

        {(user?.is_admin || org?.plan) && (
          <SectionCard
            icon={CreditCard}
            title="Plan y suscripción"
            subtitle={org?.plan === 'pro' ? 'Pro activo' : org?.plan === 'trial' ? 'Prueba gratuita' : (org?.plan || 'Trial')}
          >
            {org
              ? <PlanSection org={org} isAdmin={user?.is_admin} />
              : <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-white/30" /></div>
            }
          </SectionCard>
        )}

        <SectionCard
          icon={Users}
          title="Banda"
          subtitle={org?.band_name || 'Configura los músicos por servicio'}
        >
          <BandSection members={members} org={org} isAdmin={user?.is_admin} onOrgUpdated={setOrg} />
        </SectionCard>

        {user?.is_admin && (
          <SectionCard
            icon={UserPlus}
            title="Equipo"
            subtitle="Invitar músicos y configurar sus instrumentos"
          >
            <TeamSection members={members} onMembersUpdated={loadData} />
          </SectionCard>
        )}

        <SectionCard
          icon={Calendar}
          title="Mi Calendario"
          subtitle="Bloquea fechas en que no puedes asistir"
        >
          <CalendarSection myUserId={user?.id} />
        </SectionCard>

        <SectionCard
          icon={Building2}
          title="Organización"
          subtitle={orgs.find(o => o.id === Number(localStorage.getItem('aio_org_id')))?.name || 'Gestionar organización'}
        >
          <OrgSection orgs={orgs} />
        </SectionCard>
      </div>

      <CancioneroNavbar />
    </div>
  );
}

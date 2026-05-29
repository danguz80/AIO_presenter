import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, Users, Calendar, Building2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Check, Plus, Trash2, Save, Loader2, Lock, X, CheckCircle2, HelpCircle,
  Mail, Send, ShieldCheck, UserPlus, Clock,
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
  'Bajo eléctrico', 'Batería', 'Teclado', 'Piano',
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
    </div>
  );
}

// ─── Equipo (solo admin) ──────────────────────────────────────────────────────
function TeamSection({ members: initialMembers, onMembersUpdated }) {
  const [members, setMembers]           = useState(initialMembers || []);
  const [invitations, setInvitations]   = useState([]);
  const [loadingInv, setLoadingInv]     = useState(true);
  const [email, setEmail]               = useState('');
  const [sending, setSending]           = useState(false);
  const [sendResult, setSendResult]     = useState(null); // { ok, msg }
  const [editingId, setEditingId]       = useState(null); // userId con panel de inst abierto
  const [savingInst, setSavingInst]     = useState(null);

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
    try {
      const r = await fetch(`${API}/auth/invite`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setSendResult({ ok: true, msg: d.emailSent ? `Invitación enviada a ${email.trim()}` : `Invitación creada (email no configurado)` });
        setEmail('');
        loadInvitations();
      } else {
        setSendResult({ ok: false, msg: d.error || 'Error al enviar' });
      }
    } catch {
      setSendResult({ ok: false, msg: 'Error de conexión' });
    }
    setSending(false);
  };

  const revokeInvite = async (id) => {
    await fetch(`${API}/auth/invitations/${id}`, { method: 'DELETE', headers: authHeaders() });
    setInvitations(prev => prev.filter(i => i.id !== id));
  };

  const toggleInstrument = (memberId, inst, current) => {
    const next = current.includes(inst) ? current.filter(i => i !== inst) : [...current, inst];
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, instruments: next } : m));
  };

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
    } finally {
      setSavingInst(null);
    }
  };

  const pending = invitations.filter(i => !i.used_at);
  const used    = invitations.filter(i => i.used_at);

  return (
    <div className="space-y-5">
      {/* ── Invitar por email ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-2">Invitar a la banda</p>
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
          <p className={`mt-1.5 text-xs ${sendResult.ok ? 'text-green-400' : 'text-red-400'}`}>
            {sendResult.ok ? '✓ ' : '✗ '}{sendResult.msg}
          </p>
        )}
      </div>

      {/* ── Invitaciones pendientes ── */}
      {loadingInv
        ? <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-white/30" /></div>
        : pending.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/25 mb-2">Pendientes</p>
            <div className="space-y-1.5">
              {pending.map(inv => (
                <div key={inv.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  <Clock size={12} className="text-yellow-400/60 flex-shrink-0" />
                  <span className="flex-1 text-xs text-white/70 truncate">{inv.email}</span>
                  <span className="text-[10px] text-white/30">
                    {new Date(inv.expires_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="p-0.5 hover:text-red-400 text-white/20 transition-colors"
                    title="Revocar invitación"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      }

      {/* ── Miembros actuales + edición de instrumentos ── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/35 mb-2">Miembros del equipo</p>
        <div className="space-y-2">
          {members.map(member => {
            const isEditing = editingId === member.id;
            return (
              <div key={member.id} className="border border-white/10 rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setEditingId(isEditing ? null : member.id)}
                >
                  {member.avatar_url
                    ? <img src={member.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                        <User size={14} className="text-white/35" />
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/90 truncate">{member.display_name}</p>
                    <p className="text-[10px] text-white/30 truncate">
                      {(member.instruments || []).length > 0
                        ? (member.instruments || []).join(', ')
                        : 'Sin instrumentos configurados'}
                    </p>
                  </div>
                  {isEditing ? <ChevronUp size={14} className="text-white/30 flex-shrink-0" /> : <ChevronDown size={14} className="text-white/30 flex-shrink-0" />}
                </div>

                {isEditing && (
                  <div className="px-3 pb-3 pt-2 border-t border-white/10 space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Instrumentos de {member.display_name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {INSTRUMENTS.map(inst => {
                        const active = (member.instruments || []).includes(inst);
                        return (
                          <button
                            key={inst}
                            onClick={() => toggleInstrument(member.id, inst, member.instruments || [])}
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
                      onClick={() => saveInstruments(member)}
                      disabled={savingInst === member.id}
                      className="w-full py-2 rounded-xl text-xs font-semibold bg-yellow-500/15 border border-yellow-400/35 text-yellow-300 hover:bg-yellow-500/25 transition-colors flex items-center justify-center gap-1.5"
                    >
                      {savingInst === member.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                      Guardar instrumentos
                    </button>
                  </div>
                )}
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

  const updateSlot = (configId, userId, instrument) =>
    setConfigs(prev => prev.map(c => {
      if (c.id !== configId) return c;
      return { ...c, slots: c.slots.map(s => s.userId === userId ? { ...s, instrument } : s) };
    }));

  const updateName = (configId, name) =>
    setConfigs(prev => prev.map(c => c.id === configId ? { ...c, name } : c));

  const saveConfig = async (config) => {
    setSaving(true);
    try {
      await fetch(`${API}/api/band-configs/${config.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ name: config.name, slots: config.slots }),
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
              <p className="text-xs text-white/30">{(config.slots || []).length} músicos</p>
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
              {/* Nombre editable */}
              <input
                value={config.name}
                onChange={e => updateName(config.id, e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-yellow-400/50"
                placeholder="Nombre de la configuración"
              />

              {/* Slots de músicos */}
              <div className="space-y-2.5">
                {(config.slots || []).map(slot => (
                  <div key={slot.userId} className="flex items-center gap-3">
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
                      {/* Mostrar solo los instrumentos configurados en el perfil del músico */}
                      {(() => {
                        const member = members.find(m => m.id === slot.userId);
                        const opts   = (member?.instruments?.length)
                          ? member.instruments
                          : INSTRUMENTS;
                        // Si el valor actual no está en la lista, incluirlo igual
                        const list = (slot.instrument && !opts.includes(slot.instrument))
                          ? [slot.instrument, ...opts]
                          : opts;
                        return list.map(i => <option key={i} value={i}>{i}</option>);
                      })()}
                    </select>
                  </div>
                ))}
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

  return (
    <div className="space-y-2">
      {orgs.map(org => {
        const isActive  = org.id === currentOrgId;
        const isLoading = switching === org.id;
        return (
          <button
            key={org.id}
            onClick={() => selectOrg(org)}
            disabled={isActive || !!switching}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
              isActive
                ? 'bg-yellow-500/15 border-yellow-400/40 cursor-default'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isActive ? 'bg-yellow-500/20' : 'bg-white/10'
            }`}>
              {isLoading
                ? <Loader2 size={16} className="animate-spin text-yellow-300" />
                : <Building2 size={16} className={isActive ? 'text-yellow-300' : 'text-white/40'} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${isActive ? 'text-yellow-200' : 'text-white/80'}`}>
                {org.name}
              </p>
              {isActive && (
                <p className="text-[10px] text-yellow-400/60 font-medium">Organización actual</p>
              )}
            </div>
            {isActive && <CheckCircle2 size={16} className="text-yellow-400 flex-shrink-0" />}
          </button>
        );
      })}
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
      setMembers(Array.isArray(m) ? m : []);
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

        {orgs.length > 1 && (
          <SectionCard
            icon={Building2}
            title="Organización"
            subtitle={orgs.find(o => o.id === Number(localStorage.getItem('aio_org_id')))?.name || 'Cambiar organización'}
          >
            <OrgSection orgs={orgs} />
          </SectionCard>
        )}
      </div>

      <CancioneroNavbar />
    </div>
  );
}

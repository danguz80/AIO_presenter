/**
 * AdminPage.jsx — Panel de administración del owner
 * Solo accesible desde /admin. Requiere que el JWT pertenezca al owner (ADMIN_EMAIL).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, CreditCard, Shield, Plus, Trash2,
  ChevronDown, ChevronUp, RefreshCw, AlertCircle, Check, X
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('aio_sync_token')}`,
  };
}

function planBadge(plan) {
  const map = {
    pro      : 'bg-green-500/20 text-green-300',
    trial    : 'bg-yellow-500/20 text-yellow-300',
    cancelled: 'bg-red-500/20 text-red-300',
    suspended: 'bg-orange-500/20 text-orange-300',
  };
  return map[plan] || 'bg-zinc-500/20 text-zinc-300';
}

// ─── Modal para crear licencia ────────────────────────────────────────────────
function LicenseModal({ orgId, orgName, onClose, onCreated }) {
  const [type, setType]         = useState('permanent');
  const [expiresAt, setExpires] = useState('');
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      const r = await fetch(`${API}/admin/licenses`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ org_id: orgId, type, expires_at: expiresAt || null, note }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error'); setSaving(false); return; }
      onCreated(d);
      onClose();
    } catch { setError('Error de conexión'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a2744] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-white font-bold mb-1">Nueva licencia</h3>
        <p className="text-white/40 text-xs mb-4">{orgName}</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/50 block mb-1">Tipo</label>
            <select
              value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="permanent">Permanente (sin vencimiento)</option>
              <option value="timed">Con fecha límite</option>
            </select>
          </div>

          {type === 'timed' && (
            <div>
              <label className="text-xs text-white/50 block mb-1">Vence el</label>
              <input
                type="date" value={expiresAt} onChange={e => setExpires(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-white/50 block mb-1">Nota (opcional)</label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Ej: Uso interno, iglesia aliada..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm text-white/40 border border-white/10 hover:bg-white/5"
          >Cancelar</button>
          <button
            onClick={save} disabled={saving || (type === 'timed' && !expiresAt)}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-400/30 hover:bg-yellow-500/30 disabled:opacity-50"
          >{saving ? 'Guardando...' : 'Crear licencia'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de organización ──────────────────────────────────────────────────
function OrgCard({ org, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail]     = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showLicModal, setShowLicModal]   = useState(false);
  const [revoking, setRevoking]           = useState(null);
  const [changingPlan, setChangingPlan]   = useState(false);

  const loadDetail = async () => {
    if (detail) { setExpanded(v => !v); return; }
    setLoadingDetail(true);
    try {
      const r = await fetch(`${API}/admin/orgs/${org.id}`, { headers: authHeaders() });
      const d = await r.json();
      setDetail(d);
      setExpanded(true);
    } catch {}
    setLoadingDetail(false);
  };

  const revokeLicense = async (licId) => {
    setRevoking(licId);
    await fetch(`${API}/admin/licenses/${licId}`, { method: 'DELETE', headers: authHeaders() });
    setDetail(d => ({
      ...d,
      licenses: d.licenses.map(l => l.id === licId ? { ...l, revoked_at: new Date().toISOString() } : l),
    }));
    setRevoking(null);
    onRefresh();
  };

  const changePlan = async (newPlan) => {
    setChangingPlan(true);
    await fetch(`${API}/admin/orgs/${org.id}/plan`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ plan: newPlan }),
    });
    onRefresh();
    setChangingPlan(false);
  };

  const hasActiveLicense = !!org.active_license;

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/4 transition-colors"
        onClick={loadDetail}
      >
        <Building2 size={16} className="text-white/30 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{org.name}</span>
            {org.band_name && <span className="text-xs text-white/40">· {org.band_name}</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${planBadge(org.plan)}`}>
              {org.plan?.toUpperCase()}
            </span>
            {hasActiveLicense && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold flex items-center gap-1">
                <Shield size={8} />
                {org.active_license.type === 'permanent' ? 'Licencia permanente'
                  : `Licencia hasta ${new Date(org.active_license.expires_at).toLocaleDateString('es-CL')}`}
              </span>
            )}
            <span className="text-[10px] text-white/25 flex items-center gap-1">
              <Users size={9} /> {org.member_count}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-white/30">
          {loadingDetail ? <RefreshCw size={14} className="animate-spin" />
            : expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Detalle expandido */}
      {expanded && detail && (
        <div className="px-4 pb-4 border-t border-white/8 space-y-4 pt-3">

          {/* Acciones rápidas de plan */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-white/40">Cambiar plan:</span>
            {['trial', 'pro', 'cancelled'].map(p => (
              <button
                key={p}
                onClick={() => changePlan(p)}
                disabled={changingPlan || org.plan === p}
                className={`text-[10px] px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                  org.plan === p
                    ? 'border-white/20 text-white/50 cursor-default'
                    : 'border-white/15 text-white/60 hover:bg-white/10'
                }`}
              >{p}</button>
            ))}
          </div>

          {/* Miembros */}
          <div>
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Miembros ({detail.members.length})
            </p>
            <div className="space-y-1">
              {detail.members.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <img src={m.avatar_url} alt="" className="w-5 h-5 rounded-full opacity-70" onError={e => e.target.style.display='none'} />
                  <span className="text-white/70">{m.display_name}</span>
                  <span className="text-white/30">{m.email}</span>
                  {m.is_admin && <span className="text-[9px] bg-yellow-500/20 text-yellow-300 px-1 rounded">admin</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Licencias */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Licencias</p>
              <button
                onClick={() => setShowLicModal(true)}
                className="flex items-center gap-1 text-[10px] text-yellow-400 hover:text-yellow-300"
              >
                <Plus size={10} /> Nueva
              </button>
            </div>
            {detail.licenses.length === 0 && (
              <p className="text-xs text-white/25 italic">Sin licencias</p>
            )}
            {detail.licenses.map(l => (
              <div key={l.id} className={`flex items-center gap-2 py-1.5 text-xs ${l.revoked_at ? 'opacity-30' : ''}`}>
                <Shield size={11} className={l.revoked_at ? 'text-red-400' : 'text-blue-400'} />
                <span className="text-white/70 flex-1">
                  {l.type === 'permanent' ? 'Permanente' : `Hasta ${new Date(l.expires_at).toLocaleDateString('es-CL')}`}
                  {l.note && <span className="text-white/40 ml-1">· {l.note}</span>}
                </span>
                {l.revoked_at
                  ? <span className="text-[9px] text-red-400">Revocada</span>
                  : <button
                      onClick={() => revokeLicense(l.id)}
                      disabled={revoking === l.id}
                      className="text-red-400/50 hover:text-red-400 transition-colors"
                    ><Trash2 size={11} /></button>
                }
              </div>
            ))}
          </div>

          {/* Suscripción PayPal */}
          {detail.org.paypal_subscription_id && (
            <div className="text-xs text-white/40 border-t border-white/8 pt-2">
              <span className="text-white/60">PayPal:</span> {detail.org.paypal_subscription_id}
              <span className="ml-2 text-white/30">({detail.org.paypal_plan_type})</span>
            </div>
          )}
        </div>
      )}

      {showLicModal && (
        <LicenseModal
          orgId={org.id}
          orgName={org.name}
          onClose={() => setShowLicModal(false)}
          onCreated={() => { onRefresh(); setDetail(null); setExpanded(false); }}
        />
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate();
  const [orgs, setOrgs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [filter, setFilter]   = useState('all'); // 'all' | 'pro' | 'trial' | 'licensed'
  const [search, setSearch]   = useState('');

  const loadOrgs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/admin/orgs`, { headers: authHeaders() });
      if (r.status === 403) { navigate('/'); return; }
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error'); setLoading(false); return; }
      setOrgs(Array.isArray(d) ? d : []);
    } catch { setError('Error de conexión'); }
    setLoading(false);
  }, [navigate]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const filtered = orgs.filter(o => {
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'pro'      ? o.plan === 'pro' :
      filter === 'trial'    ? o.plan === 'trial' :
      filter === 'licensed' ? !!o.active_license : true;
    const matchSearch = !search ||
      o.name?.toLowerCase().includes(search.toLowerCase()) ||
      o.band_name?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const stats = {
    total   : orgs.length,
    pro     : orgs.filter(o => o.plan === 'pro').length,
    trial   : orgs.filter(o => o.plan === 'trial').length,
    licensed: orgs.filter(o => o.active_license).length,
  };

  return (
    <div className="min-h-screen bg-[#0d1929] text-white">
      {/* Header */}
      <div className="border-b border-white/8 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-yellow-400" />
          <div>
            <h1 className="text-base font-bold text-white">Panel de Administración</h1>
            <p className="text-xs text-white/40">AIO Presenter — Owner</p>
          </div>
        </div>
        <button
          onClick={loadOrgs}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total orgs', value: stats.total,    color: 'text-white' },
            { label: 'Pro',        value: stats.pro,      color: 'text-green-400' },
            { label: 'Trial',      value: stats.trial,    color: 'text-yellow-400' },
            { label: 'Licencias',  value: stats.licensed, color: 'text-blue-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/4 border border-white/8 rounded-xl px-3 py-2 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-white/40">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar organización..."
            className="flex-1 min-w-40 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/25"
          />
          {['all', 'pro', 'trial', 'licensed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f
                  ? 'bg-yellow-500/20 border-yellow-400/30 text-yellow-300'
                  : 'border-white/10 text-white/40 hover:text-white hover:border-white/20'
              }`}
            >
              {{all:'Todas', pro:'Pro', trial:'Trial', licensed:'Con licencia'}[f]}
            </button>
          ))}
        </div>

        {/* Lista de orgs */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {loading && !orgs.length ? (
          <div className="text-center py-12 text-white/30">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-white/30">Sin resultados</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(org => (
              <OrgCard key={org.id} org={org} onRefresh={loadOrgs} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

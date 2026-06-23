/**
 * AdminPage.jsx — Panel de administración del owner
 * Solo accesible desde /admin. Requiere que el JWT pertenezca al owner (ADMIN_EMAIL).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, CreditCard, Shield, Plus, Trash2,
  ChevronDown, ChevronUp, RefreshCw, AlertCircle, Check, X, Mail, Send,
  Monitor, Music2, BookOpen, Upload, Globe
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
  const [deleting, setDeleting] = useState(false);

  const deleteOrg = async () => {
    if (!window.confirm(`¿Eliminar la organización "${org.name}" y todos sus datos? Esta acción es irreversible.`)) return;
    setDeleting(true);
    await fetch(`${API}/admin/orgs/${org.id}`, { method: 'DELETE', headers: authHeaders() });
    onRefresh();
  };

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
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); deleteOrg(); }}
            disabled={deleting}
            className="text-red-400/40 hover:text-red-400 transition-colors p-1"
            title="Eliminar organización"
          ><Trash2 size={13} /></button>
          <span className="text-white/30">
            {loadingDetail ? <RefreshCw size={14} className="animate-spin" />
              : expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
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

// ─── Helper: auth headers without Content-Type (for FormData uploads) ─────────
// Omitting Content-Type lets the browser set it automatically with the correct
// multipart boundary required for FormData requests.
function multipartHeaders() {
  const h = authHeaders();
  delete h['Content-Type'];
  return h;
}

// ─── Sección de gestión de Biblia ─────────────────────────────────────────────
function BibleSection() {
  const [versions,   setVersions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState(false);
  const [importing,  setImporting]  = useState(false);
  const [deleting,   setDeleting]   = useState(null);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState('');
  const [loadError,  setLoadError]  = useState('');

  // Import form fields
  const [abbrev,    setAbbrev]   = useState('');
  const [vName,     setVName]    = useState('');
  const [language,  setLanguage] = useState('es');
  const [file,      setFile]     = useState(null);

  const loadVersions = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const r = await fetch(`${API}/admin/bible/versions`, { headers: authHeaders() });
      const d = await r.json();
      if (r.ok) setVersions(Array.isArray(d) ? d : []);
      else setLoadError(d.error || 'Error al cargar versiones');
    } catch { setLoadError('No se pudo conectar al servidor'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const handleImport = async () => {
    if (!abbrev || !vName || !file) return;
    setImporting(true); setResult(null); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('abbreviation', abbrev);
      fd.append('name', vName);
      fd.append('language', language);
      const r = await fetch(`${API}/admin/bible/import`, {
        method: 'POST',
        headers: multipartHeaders(),
        body: fd,
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al importar'); }
      else {
        setResult(d);
        setAbbrev(''); setVName(''); setLanguage('es'); setFile(null);
        loadVersions();
      }
    } catch (e) { setError(e instanceof TypeError ? 'No se pudo conectar al servidor' : 'Error inesperado al importar'); }
    setImporting(false);
  };

  const [deleteError, setDeleteError] = useState('');
  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Eliminar la versión "${name}" y todos sus versículos? Esta acción es irreversible.`)) return;
    setDeleting(id); setDeleteError('');
    try {
      const r = await fetch(`${API}/admin/bible/versions/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) { const d = await r.json(); setDeleteError(d.error || 'Error al eliminar'); }
      else loadVersions();
    } catch { setDeleteError('No se pudo conectar al servidor'); }
    setDeleting(null);
  };

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/4 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <BookOpen size={15} className="text-blue-400" />
          Gestión de Biblia
          {!loading && (
            <span className="text-[11px] font-normal text-white/40">
              ({versions.length} versión{versions.length !== 1 ? 'es' : ''})
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-4">

          {/* Versiones existentes */}
          {loading ? (
            <p className="text-xs text-white/30">Cargando...</p>
          ) : loadError ? (
            <p className="text-xs text-red-400">{loadError}</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-white/30 italic">Sin versiones cargadas. Importa tu primer archivo de Biblia.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Versiones en la base de datos</p>
              {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
              {versions.map(v => (
                <div key={v.id} className="flex items-center gap-3 text-xs bg-white/4 rounded-lg px-3 py-2">
                  <Globe size={11} className="text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-white/90">{v.abbreviation}</span>
                    <span className="text-white/50 ml-2">{v.name}</span>
                    <span className="text-white/30 ml-2">· {v.language}</span>
                  </div>
                  <div className="text-white/30 shrink-0 text-[10px]">
                    {v.book_count} libros · {v.verse_count.toLocaleString()} versículos
                  </div>
                  <button
                    onClick={() => handleDelete(v.id, v.name)}
                    disabled={deleting === v.id}
                    className="text-red-400/40 hover:text-red-400 transition-colors shrink-0"
                    title="Eliminar versión"
                  >
                    {deleting === v.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario de importación */}
          <div className="border-t border-white/8 pt-3 space-y-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Importar versión desde archivo JSON</p>
            <p className="text-[10px] text-white/30 leading-relaxed">
              Formatos soportados: <strong className="text-white/50">thiagobodruk/bible</strong> (array de 66 libros) o
              <strong className="text-white/50"> formato unificado</strong> (objeto con campo "books").
              Consulta la documentación para conocer la estructura esperada.
            </p>

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="bible-abbrev" className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Abreviatura *</label>
                <input
                  id="bible-abbrev"
                  type="text" value={abbrev} onChange={e => setAbbrev(e.target.value.toUpperCase())}
                  placeholder="RVR60"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="bible-name" className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Nombre *</label>
                <input
                  id="bible-name"
                  type="text" value={vName} onChange={e => setVName(e.target.value)}
                  placeholder="Reina-Valera 1960"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25"
                />
              </div>
              <div>
                <label htmlFor="bible-language" className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Idioma</label>
                <select
                  id="bible-language"
                  value={language} onChange={e => setLanguage(e.target.value)}
                  className="w-full bg-[#0d1929] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="es">Español (es)</option>
                  <option value="en">Inglés (en)</option>
                  <option value="pt">Portugués (pt)</option>
                  <option value="fr">Francés (fr)</option>
                  <option value="de">Alemán (de)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="bible-file" className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Archivo JSON *</label>
                <label htmlFor="bible-file" className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/60 cursor-pointer hover:bg-white/8 transition-colors">
                  <Upload size={13} className="shrink-0" />
                  <span className="truncate">{file ? file.name : 'Seleccionar archivo .json...'}</span>
                  <input
                    id="bible-file"
                    type="file" accept=".json" className="hidden"
                    onChange={e => setFile(e.target.files[0] || null)}
                  />
                </label>
              </div>
            </div>

            {error  && <p className="text-xs text-red-400">{error}</p>}
            {result && (
              <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                <Check size={13} />
                Importado: <strong>{result.name}</strong> — {result.booksImported} libros, {result.versesImported.toLocaleString()} versículos
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing || !abbrev || !vName || !file}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-blue-500/30 transition-colors"
            >
              {importing
                ? <><RefreshCw size={13} className="animate-spin" /> Importando...</>
                : <><Upload size={13} /> Importar versión</>
              }
            </button>
          </div>
        </div>
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
  const [filter, setFilter]   = useState('all');
  const [search, setSearch]   = useState('');

  // Estado del formulario de licencia pendiente
  const [pendingEmail, setPendingEmail]     = useState('');
  const [pendingType, setPendingType]       = useState('permanent');
  const [pendingExpires, setPendingExpires] = useState('');
  const [pendingMembers, setPendingMembers] = useState(5);
  const [pendingNote, setPendingNote]       = useState('');
  const [pendingList, setPendingList]       = useState([]);
  const [savingPending, setSavingPending]   = useState(false);
  const [pendingError, setPendingError]     = useState('');
  const [pendingOk, setPendingOk]           = useState('');
  const [showPendingForm, setShowPendingForm] = useState(false);

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

  const loadPending = useCallback(async () => {
    try {
      const r = await fetch(`${API}/admin/pending-licenses`, { headers: authHeaders() });
      const d = await r.json();
      if (r.ok) setPendingList(Array.isArray(d) ? d : []);
    } catch {}
  }, []);

  useEffect(() => { loadOrgs(); loadPending(); }, [loadOrgs, loadPending]);

  const createPendingLicense = async () => {
    if (!pendingEmail) return;
    setSavingPending(true); setPendingError(''); setPendingOk('');
    try {
      const r = await fetch(`${API}/admin/pending-licenses`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          email: pendingEmail,
          license_type: pendingType,
          expires_at: pendingExpires || null,
          max_members: pendingMembers,
          note: pendingNote,
        }),
      });
      const d = await r.json();
      if (!r.ok) { setPendingError(d.error || 'Error'); setSavingPending(false); return; }
      setPendingOk(`Licencia creada para ${pendingEmail}. Dile que se registre en aiopresenter.com`);
      setPendingEmail(''); setPendingNote(''); setPendingExpires(''); setPendingMembers(5);
      setPendingType('permanent');
      loadPending();
    } catch { setPendingError('Error de conexión'); }
    setSavingPending(false);
  };

  const deletePending = async (id) => {
    await fetch(`${API}/admin/pending-licenses/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadPending();
  };

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/app')}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/8"
            title="Modo Presenter"
          ><Monitor size={13} /><span className="hidden sm:inline">Presenter</span></button>
          <button
            onClick={() => navigate('/cancionero')}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-yellow-400 transition-colors px-2 py-1 rounded hover:bg-white/8"
            title="Modo Cancionero"
          ><Music2 size={13} /><span className="hidden sm:inline">Cancionero</span></button>
          <button
            onClick={loadOrgs}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/8"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
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

        {/* ── Otorgar licencia a nueva org ── */}
        <div className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowPendingForm(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/4 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Mail size={15} className="text-yellow-400" />
              Otorgar licencia a nueva organización
            </div>
            {showPendingForm ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
          </button>

          {showPendingForm && (
            <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-3">
              <p className="text-xs text-white/40">El usuario se registra en aiopresenter.com con este email y se le crea la org automáticamente con la licencia aplicada.</p>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Email del futuro admin *</label>
                  <input
                    type="email" value={pendingEmail} onChange={e => setPendingEmail(e.target.value)}
                    placeholder="pastor@iglesia.cl"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Tipo de licencia</label>
                  <select
                    value={pendingType} onChange={e => setPendingType(e.target.value)}
                    className="w-full bg-[#0d1929] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="permanent">Permanente</option>
                    <option value="timed">Con fecha de expiración</option>
                  </select>
                </div>
                {pendingType === 'timed' && (
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Expira el</label>
                    <input
                      type="date" value={pendingExpires} onChange={e => setPendingExpires(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Máx. miembros</label>
                  <input
                    type="number" min={1} max={50} value={pendingMembers} onChange={e => setPendingMembers(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">Nota (opcional)</label>
                  <input
                    type="text" value={pendingNote} onChange={e => setPendingNote(e.target.value)}
                    placeholder="Ej: Iglesia amiga, acceso regalo"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25"
                  />
                </div>
              </div>

              {pendingError && <p className="text-xs text-red-400">{pendingError}</p>}
              {pendingOk    && <p className="text-xs text-green-400">{pendingOk}</p>}

              <button
                onClick={createPendingLicense}
                disabled={savingPending || !pendingEmail}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 border border-yellow-400/30 text-yellow-300 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-yellow-500/30 transition-colors"
              >
                <Send size={13} />
                {savingPending ? 'Guardando...' : 'Crear licencia pendiente'}
              </button>

              {/* Lista de licencias pendientes */}
              {pendingList.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider">Pendientes ({pendingList.filter(p => !p.redeemed_at).length}) · Canjeadas ({pendingList.filter(p => p.redeemed_at).length})</p>
                  {pendingList.map(p => (
                    <div key={p.id} className={`flex items-center gap-2 text-xs py-1.5 ${p.redeemed_at ? 'opacity-40' : ''}`}>
                      <Mail size={11} className={p.redeemed_at ? 'text-green-400' : 'text-yellow-400'} />
                      <span className="text-white/80 flex-1">{p.email}</span>
                      <span className="text-white/30">{p.license_type === 'permanent' ? 'permanente' : `hasta ${new Date(p.expires_at).toLocaleDateString('es-CL')}`}</span>
                      <span className="text-white/25">·{p.max_members} miembros</span>
                      {p.redeemed_at
                        ? <span className="text-[9px] text-green-400">Canjeada · {p.redeemed_org_name}</span>
                        : <button onClick={() => deletePending(p.id)} className="text-red-400/50 hover:text-red-400"><Trash2 size={11} /></button>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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

        {/* ── Gestión de Biblia ── */}
        <BibleSection />

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

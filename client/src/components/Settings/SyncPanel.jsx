import { useState, useEffect, useCallback } from 'react';
import {
  CloudUpload, RefreshCw, LogIn, LogOut, CheckCircle,
  AlertCircle, Users, Folder, ChevronRight, Shield,
  X, Loader2, HardDrive, Cloud, UploadCloud, Link2, Copy, Trash2, Plus, Clock, Building2,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function authFetch(path, opts = {}) {
  const token = localStorage.getItem('aio_sync_token');
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
}

// ─── Barra de estado ──────────────────────────────────────────────────────────
function StatusBar({ status }) {
  if (!status) return null;
  const isError = status.type === 'error';
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${isError ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}`}>
      {isError ? <AlertCircle size={13} className="shrink-0 mt-0.5" /> : <CheckCircle size={13} className="shrink-0 mt-0.5" />}
      <span>{status.msg}</span>
    </div>
  );
}

// ─── Selector de carpeta de Drive ─────────────────────────────────────────────
function FolderPicker({ folderId, onSave }) {
  const [search, setSearch]     = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [manual, setManual]     = useState(folderId || '');
  const [mode, setMode]         = useState('search'); // 'search' | 'manual'

  const doSearch = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/sync/folder?name=${encodeURIComponent(search)}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-[10px]">
        <button
          onClick={() => setMode('search')}
          className={`px-2 py-0.5 rounded ${mode === 'search' ? 'bg-accent text-white' : 'bg-surface-700 text-zinc-400 hover:text-white'}`}
        >Buscar carpeta</button>
        <button
          onClick={() => setMode('manual')}
          className={`px-2 py-0.5 rounded ${mode === 'manual' ? 'bg-accent text-white' : 'bg-surface-700 text-zinc-400 hover:text-white'}`}
        >ID manual</button>
      </div>

      {mode === 'search' ? (
        <>
          <div className="flex gap-1">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Nombre de la carpeta…"
              className="flex-1 bg-surface-700 text-white text-xs rounded px-2 py-1.5 border border-surface-600 focus:border-accent outline-none"
            />
            <button onClick={doSearch} disabled={loading}
              className="px-2 py-1.5 bg-surface-700 hover:bg-surface-600 rounded border border-surface-600 text-zinc-300 hover:text-white transition-colors">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {results.map(f => (
                <li key={f.id}>
                  <button
                    onClick={() => onSave(f.id)}
                    className={`flex items-center gap-2 w-full px-2 py-1 rounded text-xs text-left hover:bg-surface-600 transition-colors ${folderId === f.id ? 'bg-accent/20 text-accent' : 'text-zinc-300'}`}
                  >
                    <Folder size={11} className="shrink-0" />
                    <span className="truncate">{f.name}</span>
                    {folderId === f.id && <CheckCircle size={10} className="ml-auto shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="flex gap-1">
          <input
            value={manual}
            onChange={e => setManual(e.target.value)}
            placeholder="ID de la carpeta de Google Drive"
            className="flex-1 bg-surface-700 text-white text-xs rounded px-2 py-1.5 border border-surface-600 focus:border-accent outline-none font-mono"
          />
          <button onClick={() => onSave(manual.trim())} disabled={!manual.trim()}
            className="px-2 py-1.5 bg-accent hover:bg-accent-hover rounded text-white text-xs transition-colors disabled:opacity-40">
            OK
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Panel de organizaciones ──────────────────────────────────────────────────
function OrgsPanel({ currentUser }) {
  const [orgs, setOrgs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [renaming, setRenaming]     = useState(false);
  const [newName, setNewName]       = useState('');
  const [creating, setCreating]     = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [status, setStatus]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/auth/my-orgs');
      if (res.ok) {
        const data = await res.json();
        setOrgs(data);
        const active = data.find(o => o.is_active);
        if (active && !newName) setNewName(active.name);
      }
    } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const renameOrg = async () => {
    if (!newName.trim()) return;
    setRenaming(true);
    try {
      const res = await authFetch('/auth/org', { method: 'PATCH', body: { name: newName.trim() } });
      if (res.ok) {
        setOrgs(prev => prev.map(o => o.is_active ? { ...o, name: newName.trim() } : o));
        setStatus({ type: 'ok', msg: 'Nombre actualizado' });
      } else {
        const d = await res.json();
        setStatus({ type: 'error', msg: d.error || 'Error' });
      }
    } catch { setStatus({ type: 'error', msg: 'Error al actualizar' }); }
    finally { setRenaming(false); setTimeout(() => setStatus(null), 3000); }
  };

  const switchOrg = async (orgId) => {
    try {
      const res = await authFetch(`/auth/switch-org/${orgId}`, { method: 'POST' });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem('aio_sync_token', token);
        window.location.reload();
      }
    } catch { /* ignore */ }
  };

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      const res = await authFetch('/auth/orgs', { method: 'POST', body: { name: newOrgName.trim() } });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem('aio_sync_token', token);
        window.location.reload();
      } else {
        const d = await res.json();
        setStatus({ type: 'error', msg: d.error || 'Error' });
        setTimeout(() => setStatus(null), 3000);
      }
    } finally { setCreating(false); }
  };

  if (loading) return (
    <div className="text-xs text-zinc-500 py-2 text-center">
      <Loader2 size={12} className="inline animate-spin mr-1" />Cargando…
    </div>
  );

  const activeOrg = orgs.find(o => o.is_active);

  return (
    <div className="space-y-2.5">
      {/* Nombre de la org activa (solo admin) */}
      {currentUser.is_admin && (
        <div className="bg-surface-700 rounded-lg p-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold text-zinc-300">
            Nombre de la organización activa
          </p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && renameOrg()}
              placeholder="Nombre de la organización"
              className="flex-1 bg-surface-600 text-white text-xs rounded px-2 py-1.5 border border-surface-500 focus:border-accent outline-none"
            />
            <button
              onClick={renameOrg}
              disabled={renaming || !newName.trim() || newName.trim() === activeOrg?.name}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-white text-xs transition-colors disabled:opacity-40"
            >
              {renaming ? <Loader2 size={11} className="animate-spin" /> : 'Guardar'}
            </button>
          </div>
          {status && (
            <p className={`text-[10px] ${status.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{status.msg}</p>
          )}
        </div>
      )}

      {/* Lista de orgs cuando hay más de una */}
      {orgs.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Mis organizaciones</p>
          {orgs.map(org => (
            <div
              key={org.id}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${
                org.is_active
                  ? 'bg-accent/10 border-accent/30'
                  : 'bg-surface-700 border-surface-600'
              }`}
            >
              <Building2 size={13} className={org.is_active ? 'text-accent shrink-0' : 'text-zinc-500 shrink-0'} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{org.name}</p>
                <p className="text-[9px] text-zinc-500 capitalize">{org.role}</p>
              </div>
              {org.is_active
                ? <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-semibold shrink-0">Activa</span>
                : <button
                    onClick={() => switchOrg(org.id)}
                    className="text-[10px] text-accent hover:text-accent-hover border border-accent/30 hover:bg-accent/10 px-2 py-0.5 rounded transition-colors shrink-0"
                  >Cambiar</button>
              }
            </div>
          ))}
        </div>
      )}

      {/* Crear nueva organización (solo admin) */}
      {currentUser.is_admin && (
        <div className="bg-surface-700 rounded-lg p-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold text-zinc-300">Nueva organización</p>
          <div className="flex gap-2">
            <input
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createOrg()}
              placeholder="Nombre de la nueva organización"
              className="flex-1 bg-surface-600 text-white text-xs rounded px-2 py-1.5 border border-surface-500 focus:border-accent outline-none"
            />
            <button
              onClick={createOrg}
              disabled={creating || !newOrgName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-white text-xs transition-colors disabled:opacity-40"
            >
              {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            </button>
          </div>
          <p className="text-[9px] text-zinc-600 leading-relaxed">
            Serás admin de la nueva org. Los datos (canciones, eventos, multimedia) son independientes por organización.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Panel de invitaciones (admin) ───────────────────────────────────────────
function InvitationsPanel() {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [form, setForm]               = useState({ label: '', email: '', role: 'pull_only', expires_in_days: '' });
  const [copied, setCopied]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/sync/invitations');
      if (res.ok) setInvitations(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const flags = roleToFlags(form.role);
      const body = {
        label: form.label || undefined,
        email: form.email || undefined,
        can_push: flags.can_push,
        can_push_all: flags.can_push_all,
        can_pull: flags.can_pull,
        expires_in_days: form.expires_in_days ? parseInt(form.expires_in_days, 10) : undefined,
      };
      const res = await authFetch('/api/sync/invitations', { method: 'POST', body });
      if (res.ok) {
        const inv = await res.json();
        setInvitations(prev => [inv, ...prev]);
        setForm({ label: '', email: '', role: 'pull_only', expires_in_days: '' });
      }
    } finally { setCreating(false); }
  };

  const revoke = async (id) => {
    if (!window.confirm('¿Revocar esta invitación?')) return;
    await authFetch(`/api/sync/invitations/${id}`, { method: 'DELETE' });
    setInvitations(prev => prev.filter(i => i.id !== id));
  };

  const copyLink = (link, id) => {
    navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired  = (inv) => inv.expires_at && new Date(inv.expires_at) < new Date();
  const isUsed     = (inv) => !!inv.used_at;
  const isPending  = (inv) => !isUsed(inv) && !isExpired(inv);

  return (
    <div className="space-y-3">
      {/* Formulario nueva invitación */}
      <div className="bg-surface-700 rounded-lg p-2.5 space-y-2">
        <p className="text-[10px] font-semibold text-zinc-300">Nueva invitación</p>
        <input
          value={form.label}
          onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
          placeholder="Descripción (ej: Para Juan)"
          className="w-full bg-surface-600 text-white text-xs rounded px-2 py-1.5 border border-surface-500 focus:border-accent outline-none"
        />
        <input
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="Email (opcional, restringe a esa cuenta)"
          className="w-full bg-surface-600 text-white text-xs rounded px-2 py-1.5 border border-surface-500 focus:border-accent outline-none"
        />
        <div>
          <p className="text-[9px] text-zinc-500 mb-1">Permisos</p>
          <RoleSelector value={form.role} onChange={role => setForm(f => ({ ...f, role }))} />
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="number" min="1" max="365"
            value={form.expires_in_days}
            onChange={e => setForm(f => ({ ...f, expires_in_days: e.target.value }))}
            placeholder="Expira en X días (vacío = sin límite)"
            className="flex-1 bg-surface-600 text-white text-xs rounded px-2 py-1.5 border border-surface-500 focus:border-accent outline-none"
          />
          <button
            onClick={create} disabled={creating}
            className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-white text-xs font-medium transition-colors disabled:opacity-40"
          >
            {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
            Crear
          </button>
        </div>
      </div>

      {/* Lista de invitaciones */}
      {loading
        ? <div className="text-xs text-zinc-500 py-2 text-center"><Loader2 size={12} className="inline animate-spin mr-1" />Cargando…</div>
        : invitations.length === 0
          ? <p className="text-[10px] text-zinc-600 text-center py-1">Sin invitaciones creadas</p>
          : <div className="space-y-1.5">
              {invitations.map(inv => (
                <div key={inv.id} className={`rounded-lg p-2.5 space-y-1.5 border ${
                  isUsed(inv) ? 'bg-surface-700/50 border-surface-600/50 opacity-60'
                  : isExpired(inv) ? 'bg-red-900/20 border-red-800/30'
                  : 'bg-surface-700 border-surface-600'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{inv.label || <span className="text-zinc-500 italic">Sin descripción</span>}</p>
                      {inv.email && <p className="text-[9px] text-zinc-500 truncate">{inv.email}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isPending(inv) && (
                        <button onClick={() => copyLink(inv.link, inv.id)}
                          className="text-zinc-400 hover:text-accent transition-colors" title="Copiar enlace">
                          {copied === inv.id ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
                        </button>
                      )}
                      <button onClick={() => revoke(inv.id)}
                        className="text-zinc-500 hover:text-red-400 transition-colors" title="Revocar">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <RoleBadge u={inv} />
                    {isUsed(inv)
                      ? <span className="text-[9px] bg-green-900/30 text-green-400 px-1.5 py-0.5 rounded-full">Usada · {inv.used_by_name || inv.used_by_email}</span>
                      : isExpired(inv)
                        ? <span className="text-[9px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded-full">Expirada</span>
                        : <span className="text-[9px] bg-surface-600 text-zinc-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Clock size={8} />
                            {inv.expires_at ? `Expira ${new Date(inv.expires_at).toLocaleDateString('es')}` : 'Sin expiración'}
                          </span>
                    }
                  </div>
                </div>
              ))}
            </div>
      }
    </div>
  );
}

// ─── Panel de usuarios (admin) ────────────────────────────────────────────────
function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/sync/users');
      if (res.ok) setUsers(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRole = async (id, role) => {
    const flags = roleToFlags(role);
    await authFetch(`/api/sync/users/${id}`, { method: 'PATCH', body: flags });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...flags } : u));
  };

  const removeUser = async (id, name) => {
    if (!window.confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return;
    const res = await authFetch(`/api/sync/users/${id}`, { method: 'DELETE' });
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id));
  };

  if (loading) return <div className="text-xs text-zinc-500 py-2 text-center"><Loader2 size={12} className="inline animate-spin mr-1" />Cargando…</div>;

  return (
    <div className="space-y-2">
      {users.map(u => (
        <div key={u.id} className="bg-surface-700 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            {u.avatar_url
              ? <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />
              : <div className="w-6 h-6 rounded-full bg-surface-600 flex items-center justify-center text-[9px] text-zinc-400">{u.email[0].toUpperCase()}</div>
            }
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{u.display_name || u.email}</p>
              <p className="text-[9px] text-zinc-500 truncate">{u.email}</p>
            </div>
            {u.is_admin
              ? <span className="ml-auto text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-semibold shrink-0">Admin</span>
              : <button
                  onClick={() => removeUser(u.id, u.display_name || u.email)}
                  className="ml-auto text-[9px] text-red-400 hover:text-red-300 hover:bg-red-900/30 px-1.5 py-0.5 rounded transition-colors shrink-0"
                  title="Eliminar usuario"
                >✕ Eliminar</button>
            }
          </div>
          <div className="mt-1">
            <RoleSelector value={flagsToRole(u)} onChange={role => setRole(u.id, role)} disabled={u.is_admin && !u.id} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sistema de roles ─────────────────────────────────────────────────────────
const ROLES = [
  { id: 'pull_only',     label: 'Puede bajar'      },
  { id: 'push_only',     label: 'Puede subir'       },
  { id: 'bidirectional', label: 'Puede subir/bajar' },
  { id: 'admin',         label: 'Admin'             },
];

function roleToFlags(role) {
  switch (role) {
    case 'admin':         return { can_pull: true,  can_push: true,  can_push_all: true,  is_admin: true  };
    case 'bidirectional': return { can_pull: true,  can_push: true,  can_push_all: false, is_admin: false };
    case 'push_only':     return { can_pull: false, can_push: true,  can_push_all: false, is_admin: false };
    case 'pull_only':
    default:              return { can_pull: true,  can_push: false, can_push_all: false, is_admin: false };
  }
}

function flagsToRole(u) {
  if (u.is_admin || u.can_push_all) return 'admin';
  if (u.can_push && (u.can_pull ?? true)) return 'bidirectional';
  if (u.can_push) return 'push_only';
  return 'pull_only';
}

function RoleSelector({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {ROLES.map(r => (
        <button
          key={r.id}
          type="button"
          onClick={() => !disabled && onChange(r.id)}
          className={`px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-colors ${
            value === r.id
              ? 'bg-accent/20 border-accent/50 text-accent'
              : 'bg-surface-600 border-surface-500 text-zinc-400 hover:text-white hover:border-zinc-500'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function RoleBadge({ u }) {
  const role = flagsToRole(u);
  const r = ROLES.find(x => x.id === role) || ROLES[0];
  const colors = {
    pull_only:     'bg-blue-900/30 text-blue-300',
    push_only:     'bg-green-900/30 text-green-300',
    bidirectional: 'bg-accent/15 text-accent',
    admin:         'bg-orange-900/30 text-orange-300',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${colors[role]}`}>{r.label}</span>
  );
}

function PermToggle({ label, value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
        value ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-surface-600 border-surface-500 text-zinc-400 hover:text-white'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-accent' : 'bg-zinc-600'}`} />
      {label}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function SyncPanel() {
  const [user, setUser]               = useState(null);
  const [syncInfo, setSyncInfo]         = useState(null);
  const [status, setStatus]             = useState(null);
  const [loading, setLoading]           = useState(false);
  const [inviteCode, setInviteCode]     = useState(''); // código de invitación al hacer login
  const [showUsers, setShowUsers]               = useState(false);
  const [showInvitations, setShowInvitations]   = useState(false);
  const [showOrgs, setShowOrgs]                 = useState(false);
  const [showFolder, setShowFolder]             = useState(false);
  const [checkingAuth, setCheckingAuth]     = useState(true);
  const [driveBackupProgress, setDriveBackupProgress] = useState(null); // { current, total, title }

  // Leer token/invite/error de URL al cargar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('sync_token');
    const err    = params.get('sync_error');
    const invite = params.get('invite');
    if (token) {
      localStorage.setItem('aio_sync_token', token);
      // Extraer orgId del payload del JWT para usarlo en Socket.io
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.orgId) localStorage.setItem('aio_org_id', String(payload.orgId));
      } catch { /* si el token está mal formado, ignorar */ }
      const clean = window.location.href
        .replace(/[?&]sync_token=[^&]+/, '')
        .replace(/[?&]sync_error=[^&]+/, '')
        .replace(/[?&]invite=[^&]+/, '');
      window.history.replaceState({}, '', clean);
    }
    if (invite) setInviteCode(invite);
    if (err) setStatus({ type: 'error', msg: decodeURIComponent(err) });
  }, []);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('aio_sync_token');
    if (!token) { setCheckingAuth(false); return; }
    try {
      const res = await authFetch('/auth/me');
      if (!res.ok) { localStorage.removeItem('aio_sync_token'); setCheckingAuth(false); return; }
      setUser(await res.json());
    } catch { /* servidor no configurado */ }
    setCheckingAuth(false);
  }, []);

  const loadSyncInfo = useCallback(async () => {
    if (!localStorage.getItem('aio_sync_token')) return;
    try {
      const res = await authFetch('/api/sync/status');
      if (res.ok) setSyncInfo(await res.json());
    } catch { /* silenciar */ }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => { if (user) loadSyncInfo(); }, [user, loadSyncInfo]);

  const handleLogin = async () => {
    try {
      const url = new URL(`${API}/auth/google/url`);
      if (inviteCode.trim()) url.searchParams.set('invite', inviteCode.trim());
      const res = await fetch(url.toString());
      if (!res.ok) {
        const d = await res.json();
        setStatus({ type: 'error', msg: d.error || 'Error al obtener URL de autenticación' });
        return;
      }
      const { url: authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('aio_sync_token');
    localStorage.removeItem('aio_org_id');
    setUser(null); setSyncInfo(null);
    setStatus({ type: 'ok', msg: 'Sesión cerrada' });
  };

  const syncAction = async (endpoint, label) => {
    setLoading(true); setStatus(null);
    try {
      const res  = await authFetch(`/api/sync/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      const parts = [];
      if (data.uploaded  != null) parts.push(`${data.uploaded} subidas`);
      if (data.downloaded != null) parts.push(`${data.downloaded} descargadas`);
      if (data.pushed    != null) parts.push(`${data.pushed} subidas`);
      if (data.skipped   != null) parts.push(`${data.skipped} sin cambios`);
      if (data.backupFolder) parts.push(`carpeta: ${data.backupFolder}`);
      setStatus({ type: 'ok', msg: `${label} completado. ${parts.join(', ') || data.message || ''}` });
      await loadSyncInfo();
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally { setLoading(false); }
  };

  const downloadLocalBackup = async () => {
    setLoading(true); setStatus(null);
    try {
      const token = localStorage.getItem('aio_sync_token');
      const res = await fetch(`${API}/api/sync/backup/local`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const blob = await res.blob();
      const cd   = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `aio_backup_${new Date().toISOString().slice(0,10)}.json`;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setStatus({ type: 'ok', msg: `Backup descargado: ${filename}` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally { setLoading(false); }
  };

  const backupToDrive = async () => {
    setLoading(true); setStatus(null); setDriveBackupProgress({ current: 0, total: 0, title: '' });
    try {
      const token = localStorage.getItem('aio_sync_token');
      const res = await fetch(`${API}/api/sync/backup/drive`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error desconocido');
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // guardar línea incompleta
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.status === 'start') {
            setDriveBackupProgress({ current: 0, total: event.total, title: '' });
          } else if (event.status === 'progress') {
            setDriveBackupProgress({ current: event.current, total: event.total, title: event.title });
          } else if (event.status === 'done') {
            setStatus({ type: 'ok', msg: `Backup en Drive completado: ${event.total} canciones → carpeta "${event.backupFolder}"` });
            setDriveBackupProgress(null);
          } else if (event.status === 'error') {
            throw new Error(event.error);
          }
        }
      }
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
      setDriveBackupProgress(null);
    } finally { setLoading(false); }
  };

  const restoreFromBackup = async (file) => {
    if (!file) return;
    setLoading(true); setStatus(null);
    try {
      const text = await file.text();
      let backup;
      try { backup = JSON.parse(text); }
      catch { throw new Error('El archivo no es un JSON válido'); }
      if (!backup?.aio_backup_version || !Array.isArray(backup.songs)) {
        throw new Error('Archivo de backup inválido o incompatible');
      }
      if (!window.confirm(
        `¿Restaurar ${backup.songs.length} canciones desde "${file.name}"?\n\nLas canciones existentes se actualizarán; las nuevas se crearán. No se elimina nada.`
      )) { setLoading(false); return; }
      const res  = await authFetch('/api/sync/backup/restore', { method: 'POST', body: backup });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      setStatus({ type: 'ok', msg: `Restauración completada: ${data.created} creadas, ${data.updated} actualizadas, ${data.skipped} omitidas` });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally { setLoading(false); }
  };

  const saveFolder = async (id) => {
    await authFetch('/api/sync/config', { method: 'PATCH', body: { drive_folder_id: id } });
    setUser(prev => ({ ...prev, drive_folder_id: id }));
    setSyncInfo(prev => prev ? { ...prev, configured: true } : prev);
    setShowFolder(false);
    setStatus({ type: 'ok', msg: 'Carpeta guardada' });
  };

  if (checkingAuth) {
    return <div className="py-4 text-center"><Loader2 size={16} className="inline animate-spin text-zinc-500" /></div>;
  }

  // ── Sin autenticar ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Conecta con Google Drive para sincronizar tu biblioteca de canciones entre dispositivos.
        </p>
        <StatusBar status={status} />
        {/* Campo de código de invitación */}
        <div className="relative">
          <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            placeholder="Código de invitación (si lo tienes)"
            className="w-full bg-surface-700 text-white text-xs rounded-lg pl-7 pr-3 py-2 border border-surface-600 focus:border-accent outline-none"
          />
        </div>
        <button
          onClick={handleLogin}
          className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-white hover:bg-zinc-100 text-zinc-800 rounded-lg text-sm font-medium transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Iniciar sesión con Google
        </button>
        <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
          Requiere configurar <code className="text-zinc-500">GOOGLE_CLIENT_ID</code> y <code className="text-zinc-500">GOOGLE_CLIENT_SECRET</code> en el .env del servidor.
        </p>
      </div>
    );
  }

  const canPull    = user.can_pull ?? true;
  const canPush    = user.can_push || user.is_admin;
  const canPushAll = user.can_push_all || user.is_admin;

  // ── Autenticado ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Usuario */}
      <div className="flex items-center gap-2 bg-surface-700 rounded-lg p-2">
        {user.avatar_url
          ? <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
          : <div className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center text-xs text-accent font-bold">{user.email[0].toUpperCase()}</div>
        }
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white truncate">{user.display_name || user.email}</p>
          <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
        </div>
        {user.is_admin && <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-semibold shrink-0 flex items-center gap-0.5"><Shield size={9} />Admin</span>}
        <button onClick={handleLogout} title="Cerrar sesión" className="text-zinc-500 hover:text-red-400 transition-colors shrink-0 ml-1">
          <LogOut size={13} />
        </button>
      </div>

      {/* Organización */}
      <div>
        <button
          onClick={() => setShowOrgs(v => !v)}
          className="flex items-center justify-between w-full text-[10px] font-semibold text-zinc-400 uppercase tracking-wider hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1"><Building2 size={11} />Organización</span>
          <ChevronRight size={11} className={`transition-transform ${showOrgs ? 'rotate-90' : ''}`} />
        </button>
        {showOrgs && (
          <div className="mt-2">
            <OrgsPanel currentUser={user} />
          </div>
        )}
      </div>

      {/* Carpeta de Drive */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Carpeta de canciones</span>
          {user.is_admin && (
            <button onClick={() => setShowFolder(v => !v)} className="text-[10px] text-accent hover:underline">
              {showFolder ? 'Cerrar' : (syncInfo?.configured ? 'Cambiar' : 'Configurar')}
            </button>
          )}
        </div>
        {syncInfo?.configured
          ? <p className="text-[10px] text-zinc-400">{user.is_admin ? '✓ Carpeta configurada' : '✓ Carpeta del admin configurada'}</p>
          : <p className="text-[10px] text-amber-400">⚠ No configurada — {user.is_admin ? 'configura una carpeta de Drive' : 'el admin aún no configuró la carpeta de Drive'}</p>
        }
        {showFolder && user.is_admin && (
          <div className="mt-2">
            <FolderPicker folderId={user.drive_folder_id} onSave={saveFolder} />
          </div>
        )}
      </div>

      {/* Estado */}
      {syncInfo && (
        <div className="bg-surface-700 rounded-lg px-3 py-2 text-[10px] text-zinc-400 space-y-0.5">
          <div className="flex justify-between">
            <span>Último sync</span>
            <span className="text-zinc-300">{syncInfo.user?.last_sync_at ? new Date(syncInfo.user.last_sync_at).toLocaleString('es') : 'Nunca'}</span>
          </div>
          <div className="flex justify-between">
            <span>Pendientes de sincronizar</span>
            <span className={syncInfo.pendingCount > 0 ? 'text-amber-400 font-medium' : 'text-zinc-300'}>{syncInfo.pendingCount}</span>
          </div>
        </div>
      )}

      <StatusBar status={status} />

      {/* Acciones de sincronización */}
      <div className="space-y-1.5">
        {canPush && canPull && (
          <button
            onClick={() => syncAction('smart', 'Sincronización')}
            disabled={loading || !syncInfo?.configured}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sincronizar
            {syncInfo?.pendingCount > 0 && <span className="bg-white/20 px-1.5 rounded-full text-[10px]">{syncInfo.pendingCount}</span>}
          </button>
        )}
        {canPull && !canPush && (
          <button
            onClick={() => syncAction('pull', 'Descarga')}
            disabled={loading || !syncInfo?.configured}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Bajar canciones
          </button>
        )}
        {canPush && !canPull && (
          <button
            onClick={() => syncAction('push', 'Subida')}
            disabled={loading || !syncInfo?.configured}
            className="flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Subir canciones
            {syncInfo?.pendingCount > 0 && <span className="bg-white/20 px-1.5 rounded-full text-[10px]">{syncInfo.pendingCount}</span>}
          </button>
        )}
        {!canPush && !canPull && (
          <p className="text-[10px] text-zinc-500 text-center py-1">Sin permisos de sincronización. Solicita acceso al administrador.</p>
        )}

        {canPushAll && (
          <button
            onClick={() => {
              if (!window.confirm('⚠️ Esto reemplazará TODA la biblioteca en Google Drive con tus canciones locales.\n¿Continuar?')) return;
              syncAction('replace-all', 'Reemplazo total');
            }}
            disabled={loading || !syncInfo?.configured}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800/40 rounded-lg text-xs text-red-300 hover:text-red-200 transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} />}
            Reemplazar toda la biblioteca en la nube
          </button>
        )}
      </div>

      {/* Copias de seguridad */}
      <div>
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Copias de seguridad</p>
        <div className="space-y-1.5">
          <button
            onClick={downloadLocalBackup}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <HardDrive size={13} />}
            Guardar backup local (.json)
          </button>
          {canPush && (
            <>
              <button
                onClick={backupToDrive}
                disabled={loading || !syncInfo?.configured}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg text-xs text-zinc-300 hover:text-white transition-colors disabled:opacity-40"
              >
                {loading && driveBackupProgress !== null
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Cloud size={13} />}
                Guardar backup en Drive
              </button>
              {driveBackupProgress !== null && (
                <div className="space-y-1 px-0.5">
                  <div className="flex justify-between text-[10px] text-zinc-400">
                    <span className="truncate max-w-[70%]">{driveBackupProgress.title || 'Preparando…'}</span>
                    <span className="shrink-0 tabular-nums">
                      {driveBackupProgress.total > 0
                        ? `${driveBackupProgress.current} / ${driveBackupProgress.total} · ${Math.round(driveBackupProgress.current / driveBackupProgress.total * 100)}%`
                        : '…'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: driveBackupProgress.total > 0 ? `${(driveBackupProgress.current / driveBackupProgress.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
          {/* Restaurar desde archivo */}
          <label className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer
            ${loading ? 'opacity-40 pointer-events-none' : 'bg-surface-700 hover:bg-surface-600 text-zinc-300 hover:text-white'}`}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
            Restaurar desde backup (.json)
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={loading}
              onChange={e => { restoreFromBackup(e.target.files?.[0]); e.target.value = ''; }}
            />
          </label>
        </div>
      </div>

      {/* Panel admin: usuarios e invitaciones */}
      {user.is_admin && (
        <div className="space-y-2">
          {/* Usuarios */}
          <div>
            <button
              onClick={() => setShowUsers(v => !v)}
              className="flex items-center justify-between w-full text-[10px] font-semibold text-zinc-400 uppercase tracking-wider hover:text-white transition-colors"
            >
              <span className="flex items-center gap-1"><Users size={11} />Gestionar usuarios</span>
              <ChevronRight size={11} className={`transition-transform ${showUsers ? 'rotate-90' : ''}`} />
            </button>
            {showUsers && (
              <div className="mt-2">
                <UsersPanel />
              </div>
            )}
          </div>
          {/* Invitaciones */}
          <div>
            <button
              onClick={() => setShowInvitations(v => !v)}
              className="flex items-center justify-between w-full text-[10px] font-semibold text-zinc-400 uppercase tracking-wider hover:text-white transition-colors"
            >
              <span className="flex items-center gap-1"><Link2 size={11} />Invitaciones</span>
              <ChevronRight size={11} className={`transition-transform ${showInvitations ? 'rotate-90' : ''}`} />
            </button>
            {showInvitations && (
              <div className="mt-2">
                <InvitationsPanel />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

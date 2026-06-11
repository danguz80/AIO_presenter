/**
 * OrgSwitcher — muestra la org activa y permite cambiar si el usuario pertenece a varias.
 * Props:
 *   variant: 'cancionero' | 'presenter'  (afecta colores)
 */
import { useState, useEffect, useRef } from 'react';
import { Building2, ChevronDown, CheckCircle2, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  const t = localStorage.getItem('aio_sync_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function getActiveOrgId() {
  try {
    const t = localStorage.getItem('aio_sync_token');
    if (!t) return null;
    return JSON.parse(atob(t.split('.')[1]))?.orgId ?? null;
  } catch { return null; }
}

export default function OrgSwitcher({ variant = 'cancionero' }) {
  const [orgs, setOrgs]           = useState([]);
  const [open, setOpen]           = useState(false);
  const [switching, setSwitching] = useState(null);
  const activeOrgId               = getActiveOrgId();
  const ref                       = useRef(null);

  useEffect(() => {
    fetch(`${API}/auth/my-orgs`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setOrgs(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Cerrar al clic fuera
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeOrg = orgs.find(o => o.id === activeOrgId);

  // Si solo tiene 1 org, mostrar el nombre sin dropdown
  if (orgs.length <= 1) {
    if (!activeOrg) return null;
    return (
      <span className={`flex items-center gap-1 text-xs truncate max-w-[120px] ${
        variant === 'presenter' ? 'text-zinc-400' : 'text-white/40'
      }`}>
        <Building2 size={11} />
        <span className="truncate">{activeOrg.name}</span>
      </span>
    );
  }

  const switchOrg = async (org) => {
    if (org.id === activeOrgId || switching) return;
    setSwitching(org.id);
    try {
      const res = await fetch(`${API}/auth/switch-org/${org.id}`, {
        method: 'POST', headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const { token } = await res.json();
      localStorage.setItem('aio_sync_token', token);
      localStorage.setItem('aio_org_id', String(org.id));
      // Reload para que todo el contexto se reinicie con la nueva org
      window.location.reload();
    } catch {
      setSwitching(null);
    }
  };

  const baseBtn = variant === 'presenter'
    ? 'flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-surface-700 max-w-[150px]'
    : 'flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-2 py-1 rounded hover:bg-white/10 max-w-[150px]';

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className={baseBtn}>
        <Building2 size={13} className="shrink-0" />
        <span className="truncate">{activeOrg?.name ?? 'Organización'}</span>
        <ChevronDown size={11} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 w-56 rounded-xl border shadow-2xl overflow-hidden ${
          variant === 'presenter'
            ? 'bg-surface-800 border-surface-700 top-full left-0'
            : 'bg-[#0d1929] border-white/10 bottom-full left-0 mb-1'
        }`}>
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Cambiar organización
          </p>
          {orgs.map(org => {
            const isActive  = org.id === activeOrgId;
            const isLoading = switching === org.id;
            return (
              <button
                key={org.id}
                onClick={() => switchOrg(org)}
                disabled={!!switching}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors text-sm
                  ${isActive
                    ? 'text-yellow-400 bg-yellow-500/10'
                    : 'text-white/70 hover:bg-white/8 hover:text-white'}
                  ${switching && !isLoading ? 'opacity-40' : ''}`}
              >
                {isLoading
                  ? <Loader2 size={14} className="animate-spin text-yellow-400 shrink-0" />
                  : isActive
                    ? <CheckCircle2 size={14} className="text-yellow-400 shrink-0" />
                    : <Building2 size={14} className="text-white/30 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium leading-tight">{org.name}</p>
                  <p className="text-[10px] text-white/30 capitalize leading-tight">{org.role}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

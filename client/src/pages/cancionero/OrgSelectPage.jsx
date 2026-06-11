import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronRight, Loader2, ArrowLeft, CheckCircle2, Plus, X } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

export default function OrgSelectPage() {
  const navigate = useNavigate();
  const [orgs, setOrgs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError]         = useState(null);

  // Crear nueva org
  const [showCreate, setShowCreate] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState(null);

  const currentOrgId = Number(localStorage.getItem('aio_org_id'));

  useEffect(() => {
    const token = localStorage.getItem('aio_sync_token');
    fetch(`${API}/auth/my-orgs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setOrgs(data); setLoading(false); })
      .catch(() => { setError('No se pudieron cargar las organizaciones'); setLoading(false); });
  }, []);

  const selectOrg = async (org) => {
    if (switching) return;
    setSwitching(org.id);
    try {
      const token = localStorage.getItem('aio_sync_token');
      const res = await fetch(`${API}/auth/switch-org/${org.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al cambiar organización');
      const { token: newToken } = await res.json();
      localStorage.setItem('aio_sync_token', newToken);
      localStorage.setItem('aio_org_id', String(org.id));
      navigate('/cancionero', { replace: true });
    } catch {
      setError('Error al cambiar de organización. Intenta de nuevo.');
      setSwitching(null);
    }
  };

  const createOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = localStorage.getItem('aio_sync_token');
      const res = await fetch(`${API}/auth/orgs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear organización');
      localStorage.setItem('aio_sync_token', data.token);
      localStorage.setItem('aio_org_id', String(data.org.id));
      navigate('/cancionero', { replace: true });
    } catch (err) {
      setCreateError(err.message);
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1B3166] flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <img
          src="/logo-circle.png"
          alt="AIO Presenter"
          className="h-14 w-14 object-contain drop-shadow-xl"
          onError={e => { e.target.style.display = 'none'; }}
        />
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          All in One <span className="text-[#C9A420]">Presenter</span>
        </h1>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-white">Elige tu organización</h2>
          <p className="mt-2 text-white/50 text-sm">Selecciona a qué organización quieres acceder en modo Cancionero.</p>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 size={32} className="text-yellow-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm text-center mb-4">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {orgs.map(org => {
            const isActive  = org.id === currentOrgId;
            const isLoading = switching === org.id;
            return (
              <button
                key={org.id}
                onClick={() => selectOrg(org)}
                disabled={!!switching}
                className={`group flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-200
                  ${isActive
                    ? 'border-yellow-400/60 bg-yellow-500/10 hover:bg-yellow-500/20'
                    : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'}
                  ${switching && !isLoading ? 'opacity-50' : ''}
                  active:scale-[0.98]`}
              >
                <div className={`flex-shrink-0 p-2.5 rounded-xl border ${
                  isActive ? 'bg-yellow-500/20 border-yellow-400/30' : 'bg-white/10 border-white/10'
                }`}>
                  {isLoading
                    ? <Loader2 size={22} className="text-yellow-400 animate-spin" />
                    : <Building2 size={22} className={isActive ? 'text-yellow-300' : 'text-white/60'} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-base truncate">{org.name}</p>
                  <p className="text-white/40 text-xs capitalize">{org.role} {isActive ? '· activa' : ''}</p>
                </div>
                {isActive
                  ? <CheckCircle2 size={18} className="text-yellow-400 flex-shrink-0" />
                  : <ChevronRight size={18} className="text-white/30 group-hover:text-white/60 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                }
              </button>
            );
          })}
        </div>

        {/* Crear nueva organización */}
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 border-2 border-dashed border-white/15 hover:border-yellow-400/40 rounded-2xl p-4 text-white/40 hover:text-yellow-400/80 transition-all text-sm"
          >
            <Plus size={16} />
            Crear nueva organización
          </button>
        ) : (
          <form onSubmit={createOrg} className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold text-sm">Nueva organización</p>
              <button type="button" onClick={() => { setShowCreate(false); setNewOrgName(''); setCreateError(null); }} className="text-white/30 hover:text-white/60">
                <X size={16} />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              placeholder="Nombre de la iglesia o grupo..."
              maxLength={80}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-yellow-400/50"
            />
            {createError && (
              <p className="text-red-400 text-xs">{createError}</p>
            )}
            <button
              type="submit"
              disabled={!newOrgName.trim() || creating}
              className="flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-bold rounded-xl py-2.5 text-sm transition-colors"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {creating ? 'Creando...' : 'Crear organización'}
            </button>
          </form>
        )}

        <button
          onClick={() => navigate('/mode-select')}
          className="mt-8 w-full flex items-center justify-center gap-2 text-white/30 hover:text-white/60 text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          Volver a selección de modo
        </button>
      </div>
    </div>
  );
}

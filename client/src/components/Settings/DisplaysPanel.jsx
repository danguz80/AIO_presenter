import { useState, useEffect, useCallback } from 'react';
import { usePresenter } from '../../context/usePresenter';
import { Monitor, RefreshCw, Plus, Trash2, ExternalLink, Tv2, Clapperboard } from 'lucide-react';

/**
 * Panel de configuración de salidas de pantalla.
 * Detecta monitores físicos via window.getScreenDetails() (Chrome/Edge)
 * y permite asignar cuál es Principal y cuál es Escenario.
 * También gestiona salidas virtuales adicionales.
 */
export default function DisplaysPanel() {
  const { state, actions } = usePresenter();
  const cfg = state.displayConfig ?? {};

  const principalScreenId   = cfg.principalScreenId   ?? null;
  const escenarioScreenId   = cfg.escenarioScreenId   ?? null;
  const principalResolution = cfg.principalResolution ?? { width: 1920, height: 1080 };
  const escenarioResolution = cfg.escenarioResolution ?? { width: 1920, height: 1080 };
  const virtualResolution   = cfg.virtualResolution   ?? { width: 1920, height: 1080 };
  const virtualOutputs      = cfg.virtualOutputs      ?? [];

  const RESOLUTIONS = [
    { label: '1280×720',   width: 1280, height: 720  },
    { label: '1920×1080',  width: 1920, height: 1080 },
    { label: '2560×1440',  width: 2560, height: 1440 },
    { label: '3840×2160',  width: 3840, height: 2160 },
  ];

  const setResolution = (key, res) => actions.setDisplayConfig({ [key]: res });

  const ResolutionPicker = ({ label, configKey, current }) => (
    <div className="mt-2">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {RESOLUTIONS.map(r => {
          const active = current.width === r.width && current.height === r.height;
          return (
            <button key={r.label} onClick={() => setResolution(configKey, { width: r.width, height: r.height })}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${active ? 'bg-accent text-white' : 'bg-surface-600 text-zinc-400 hover:bg-surface-500 hover:text-zinc-200'}`}>
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const [screens, setScreens]           = useState([]);
  const [apiState, setApiState]         = useState('idle'); // 'idle'|'loading'|'granted'|'denied'|'unsupported'

  // ── Detectar pantallas ──────────────────────────────────────────────────
  const detectScreens = useCallback(async () => {
    setApiState('loading');

    if (!('getScreenDetails' in window)) {
      // Fallback: sólo se conoce la pantalla actual
      setScreens([{
        id:       'primary:0:0',
        label:    'Pantalla actual',
        width:    window.screen.width,
        height:   window.screen.height,
        left:     0,
        top:      0,
        isPrimary: true,
      }]);
      setApiState('unsupported');
      return;
    }

    try {
      const sd = await window.getScreenDetails();
      const list = Array.from(sd.screens).map((s, i) => ({
        id:       `screen:${s.left ?? 0}:${s.top ?? 0}`,
        label:    s.label || `Monitor ${i + 1}`,
        width:    s.width,
        height:   s.height,
        left:     s.left  ?? 0,
        top:      s.top   ?? 0,
        isPrimary: s.isPrimary ?? i === 0,
      }));
      setScreens(list);
      setApiState('granted');

      // Escuchar cambios de monitores
      sd.addEventListener('screenschange', detectScreens);
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setApiState('denied');
      } else {
        setApiState('unsupported');
      }
      setScreens([{
        id:       'primary:0:0',
        label:    'Pantalla actual',
        width:    window.screen.width,
        height:   window.screen.height,
        left:     0,
        top:      0,
        isPrimary: true,
      }]);
    }
  }, []);

  useEffect(() => { detectScreens(); }, [detectScreens]);

  // ── Asignar rol ────────────────────────────────────────────────────────
  const assign = (screenId, role) => {
    let newPrincipal = principalScreenId;
    let newEscenario = escenarioScreenId;

    if (role === 'principal') {
      newPrincipal = (newPrincipal === screenId) ? null : screenId;
      if (newEscenario === screenId) newEscenario = null;
    } else {
      newEscenario = (newEscenario === screenId) ? null : screenId;
      if (newPrincipal === screenId) newPrincipal = null;
    }

    actions.setDisplayConfig({ principalScreenId: newPrincipal, escenarioScreenId: newEscenario });
  };

  // ── Abrir ventana en pantalla específica ───────────────────────────────
  const openOnScreen = (path, screenId, windowName) => {
    const screen = screens.find(s => s.id === screenId);
    const features = screen
      ? `left=${screen.left},top=${screen.top},width=${screen.width},height=${screen.height},menubar=no,toolbar=no,location=no,status=no`
      : 'width=1280,height=720,menubar=no,toolbar=no,location=no';
    window.open(path, windowName ?? path, features);
  };

  // ── Salidas virtuales ─────────────────────────────────────────────────
  const addVirtual = () => {
    const idx = virtualOutputs.length + 1;
    const newOutputs = [...virtualOutputs, { id: `virtual-${Date.now()}`, name: `Virtual ${idx}`, enabled: true }];
    actions.setDisplayConfig({ virtualOutputs: newOutputs });
  };

  const removeVirtual = (id) => {
    const newOutputs = virtualOutputs.filter(v => v.id !== id);
    actions.setDisplayConfig({ virtualOutputs: newOutputs });
  };

  const renameVirtual = (id, name) => {
    const newOutputs = virtualOutputs.map(v => v.id === id ? { ...v, name } : v);
    actions.setDisplayConfig({ virtualOutputs: newOutputs });
  };

  // ── Helpers UI ─────────────────────────────────────────────────────────
  const roleOf = (screenId) => {
    if (screenId === principalScreenId) return 'principal';
    if (screenId === escenarioScreenId) return 'escenario';
    return null;
  };

  const ROLE_STYLES = {
    principal: 'bg-orange-500/20 border-orange-400 text-orange-300',
    escenario: 'bg-blue-500/20 border-blue-400 text-blue-300',
  };

  return (
    <div className="space-y-4">

      {/* ── Pantallas físicas ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Pantallas físicas
          </span>
          <button
            onClick={detectScreens}
            title="Volver a detectar"
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded"
          >
            <RefreshCw size={12} className={apiState === 'loading' ? 'animate-spin' : ''} />
          </button>
        </div>

        {apiState === 'denied' && (
          <p className="text-[10px] text-amber-400 mb-2 leading-snug">
            Permiso denegado. Abre los ajustes del navegador y permite "Gestión de ventanas" para este sitio, luego pulsa refrescar.
          </p>
        )}
        {apiState === 'unsupported' && screens.length === 1 && (
          <p className="text-[10px] text-zinc-500 mb-2 leading-snug">
            Tu navegador no soporta detección de múltiples monitores. Usa Chrome o Edge para esta función.
          </p>
        )}

        <div className="space-y-2">
          {screens.map(s => {
            const role = roleOf(s.id);
            return (
              <div
                key={s.id}
                className={`rounded-lg border p-2.5 transition-colors ${
                  role ? ROLE_STYLES[role] : 'bg-surface-700 border-surface-600'
                }`}
              >
                {/* Info del monitor */}
                <div className="flex items-start gap-2 mb-2">
                  <Monitor size={14} className="mt-0.5 shrink-0 text-zinc-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{s.label}</p>
                    <p className="text-[10px] text-zinc-500">{s.width}×{s.height}{s.isPrimary ? ' · Principal del SO' : ''}</p>
                  </div>
                  {role && (
                    <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                      role === 'principal' ? 'bg-orange-500/40 text-orange-200' : 'bg-blue-500/40 text-blue-200'
                    }`}>
                      {role === 'principal' ? 'Principal' : 'Escenario'}
                    </span>
                  )}
                </div>

                {/* Botones de asignación */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => assign(s.id, 'principal')}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] rounded transition-colors ${
                      role === 'principal'
                        ? 'bg-orange-500 text-white'
                        : 'bg-surface-600 text-zinc-400 hover:bg-surface-500 hover:text-zinc-200'
                    }`}
                  >
                    <Tv2 size={10} />
                    Principal
                  </button>
                  <button
                    onClick={() => assign(s.id, 'escenario')}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] rounded transition-colors ${
                      role === 'escenario'
                        ? 'bg-blue-500 text-white'
                        : 'bg-surface-600 text-zinc-400 hover:bg-surface-500 hover:text-zinc-200'
                    }`}
                  >
                    <Clapperboard size={10} />
                    Escenario
                  </button>
                  {role && (
                    <button
                      title="Abrir en esta pantalla"
                      onClick={() => openOnScreen(
                        role === 'principal' ? '/output' : '/stage',
                        s.id,
                        role === 'principal' ? 'aio-output' : 'aio-stage'
                      )}
                      className="px-2 py-1 text-[10px] bg-surface-600 hover:bg-accent text-zinc-300 hover:text-white rounded transition-colors flex items-center gap-1"
                    >
                      <ExternalLink size={10} />
                      Abrir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Advertencia: Escenario configurado pero Principal no */}
        {escenarioScreenId && !principalScreenId && (
          <div className="mt-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300 leading-snug">
            ⚠️ Tu pantalla está asignada como <strong>Escenario</strong>, pero no hay ninguna pantalla asignada como <strong>Principal</strong>.<br />
            Para proyectar el contenido principal haz clic en el botón <strong>Principal</strong> de la pantalla detectada.
          </div>
        )}

        {/* Resoluciones por salida */}
        <ResolutionPicker label="Resolución Principal" configKey="principalResolution" current={principalResolution} />
        <ResolutionPicker label="Resolución Escenario" configKey="escenarioResolution" current={escenarioResolution} />
      </div>

      {/* ── Salidas virtuales ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Salidas virtuales
          </span>
          <button
            onClick={addVirtual}
            className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Plus size={12} />
            Añadir
          </button>
        </div>

        <ResolutionPicker label="Resolución virtual" configKey="virtualResolution" current={virtualResolution} />

        {virtualOutputs.length === 0 ? (
          <p className="text-[10px] text-zinc-600 italic mt-2">No hay salidas virtuales. Pulsa Añadir para crear una.</p>
        ) : (
          <div className="space-y-1.5 mt-2">
            {virtualOutputs.map(v => (
              <div key={v.id} className="flex items-center gap-2 bg-surface-700 border border-surface-600 rounded-lg px-2.5 py-2">
                <input
                  type="text"
                  value={v.name}
                  onChange={e => renameVirtual(v.id, e.target.value)}
                  className="flex-1 bg-transparent text-xs text-zinc-200 outline-none min-w-0"
                />
                <button
                  title="Abrir salida virtual"
                  onClick={() => window.open('/virtual', `aio-virtual-${v.id}`, 'width=1280,height=720,menubar=no,toolbar=no,location=no')}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-surface-600"
                >
                  <ExternalLink size={11} />
                </button>
                <button
                  title="Eliminar"
                  onClick={() => removeVirtual(v.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-surface-600"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

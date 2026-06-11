import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen, Plus, Trash2, Film, Image, Play, RefreshCw,
  FolderX, X, Layers, MonitorCheck, Terminal, Download,
  ShieldCheck, AlertTriangle,
} from 'lucide-react';
import api from '../../hooks/useApi';
import { usePresenter } from '../../context/usePresenter';
import { useScheduleAdd } from '../../context/ScheduleAddContext';
import {
  FSA_SUPPORTED,
  pickFolder,
  saveFolder,
  listFolders as fsaListFolders,
  removeFolder as fsaRemoveFolder,
  listMediaFiles,
  generateThumbnail,
  cacheMediaFile,
  verifyPermission,
  fetchFoldersFromDb,
  saveFolderToDb,
  removeFolderFromDb,
} from '../../utils/fsaUtils';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Prefijo por org para que cada organización tenga su propio namespace en IndexedDB
function getOrgPrefix() {
  try {
    const t = localStorage.getItem('aio_sync_token');
    if (!t) return '';
    const { orgId } = JSON.parse(atob(t.split('.')[1]));
    return orgId ? `org${orgId}:` : '';
  } catch { return ''; }
}

const SERVER_BASE = (() => {
  const savedIp   = localStorage.getItem('aio_server_ip');
  const savedPort = localStorage.getItem('aio_server_port') || '3001';
  const host      = savedIp || 'localhost';
  return `http://${host}:${savedPort}`;
})();

const INSTALLER_URL = 'https://raw.githubusercontent.com/danguz80/AIO_presenter/main/server/scripts/install-mac-service.command';

const RELEASES_BASE = 'https://github.com/danguz80/AIO_presenter/releases/latest/download';

const DOWNLOAD_URLS = {
  'mac-arm64': `${RELEASES_BASE}/aio-presenter-server-mac-arm64`,
  'mac-x64':   `${RELEASES_BASE}/aio-presenter-server-mac-x64`,
  'win-x64':   `${RELEASES_BASE}/aio-presenter-server-win-x64.exe`,
};

/** Detecta el OS del browser */
const clientOs = (() => {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua))  return 'windows';
  if (/Mac/i.test(ua))  return 'mac';
  return 'other';
})();

function thumbUrl(filePath) {
  return `${SERVER_BASE}/api/media/thumbnail?filePath=${encodeURIComponent(filePath)}`;
}

// ── Helpers para primerPlano en FSA mode (localStorage) ─────────────────────
const getFsaPrimerPlano = (folderKey) =>
  JSON.parse(localStorage.getItem(`aio-media-primerPlano:${folderKey}`) ?? 'true');
const setFsaPrimerPlano = (folderKey, val) =>
  localStorage.setItem(`aio-media-primerPlano:${folderKey}`, JSON.stringify(val));

// ── Pantalla de configuración primera vez ────────────────────────────────────
function LocalServerSetup({ onRetry, retrying }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isMac = clientOs === 'mac';
  const isWin = clientOs === 'windows';

  // ── Contenido por OS ──────────────────────────────────────────────────────
  const osConfig = isMac ? {
    icon:      '🍎',
    title:     'macOS detectado',
    steps: [
      {
        label: 'Descarga el instalador para tu Mac',
        body: (
          <div className="flex flex-col gap-1.5">
            <a href={DOWNLOAD_URLS['mac-arm64']}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors w-fit">
              <Download size={12} /> Descargar (Apple Silicon — M1/M2/M3/M4)
            </a>
            <a href={DOWNLOAD_URLS['mac-x64']}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-zinc-300 transition-colors w-fit">
              <Download size={12} /> Descargar (Mac Intel)
            </a>
            <p className="text-[10px] text-zinc-600">¿No sabes cuál? Elige Apple Silicon si tu Mac es de 2020 en adelante.</p>
          </div>
        ),
      },
      {
        label: 'Abre Terminal y ejecuta el archivo descargado',
        body: (
          <div>
            <p className="text-xs text-zinc-500">Arrastra el archivo descargado al Terminal y presiona <kbd className="bg-surface-700 text-zinc-300 px-1 rounded text-[10px]">Enter</kbd>.</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">Si macOS pide permiso, haz clic en "Abrir".</p>
          </div>
        ),
      },
      {
        label: 'Sigue las instrucciones en pantalla',
        body: <p className="text-xs text-zinc-500">El instalador te pedirá la URL de tu base de datos y configurará el servidor automáticamente.</p>,
      },
    ],
  } : isWin ? {
    icon:  '🪟',
    title: 'Windows detectado',
    steps: [
      {
        label: 'Descarga el instalador para Windows',
        body: (
          <a href={DOWNLOAD_URLS['win-x64']}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors w-fit">
            <Download size={12} /> Descargar (.exe — Windows 64 bits)
          </a>
        ),
      },
      {
        label: 'Haz doble clic en el archivo descargado',
        body: (
          <div>
            <p className="text-xs text-zinc-500">Se abrirá una ventana de consola con instrucciones paso a paso.</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">Si Windows SmartScreen avisa, haz clic en "Más información" → "Ejecutar de todas formas".</p>
          </div>
        ),
      },
      {
        label: 'Sigue las instrucciones en pantalla',
        body: <p className="text-xs text-zinc-500">El instalador configurará el servidor y lo registrará para inicio automático con Windows.</p>,
      },
    ],
  } : {
    icon:  '💻',
    title: 'Sistema detectado',
    steps: [
      {
        label: 'Descarga el instalador para tu sistema',
        body: (
          <div className="flex flex-col gap-1">
            <a href={DOWNLOAD_URLS['mac-arm64']} className="text-xs text-accent hover:underline"><Download size={10} className="inline mr-1" />macOS Apple Silicon</a>
            <a href={DOWNLOAD_URLS['mac-x64']}   className="text-xs text-accent hover:underline"><Download size={10} className="inline mr-1" />macOS Intel</a>
            <a href={DOWNLOAD_URLS['win-x64']}   className="text-xs text-accent hover:underline"><Download size={10} className="inline mr-1" />Windows 64 bits</a>
          </div>
        ),
      },
    ],
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center overflow-y-auto py-4">
      <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
        <MonitorCheck size={24} className="text-amber-400" />
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-200 mb-1">
          Configura el acceso a medios locales
        </p>
        <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">
          Para ver tus videos e imágenes, instala el servidor local de AIO Presenter.
          Solo se hace <strong className="text-zinc-400">una vez</strong>.{' '}
          <span className="text-zinc-600">{osConfig.icon} {osConfig.title}</span>
        </p>
      </div>

      {/* Pasos */}
      <div className="w-full max-w-sm space-y-3 text-left">
        {osConfig.steps.map((s, i) => (
          <Step key={i} n={i + 1} label={s.label}>{s.body}</Step>
        ))}
        <Step n={osConfig.steps.length + 1} label="Haz clic en 'Ya lo instalé'">
          <p className="text-xs text-zinc-500">La biblioteca de medios aparecerá automáticamente.</p>
        </Step>
      </div>

      <button
        onClick={onRetry}
        disabled={retrying}
        className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-zinc-300 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={12} className={retrying ? 'animate-spin' : ''} />
        {retrying ? 'Verificando…' : 'Ya lo instalé — verificar conexión'}
      </button>

      {/* Sección avanzada para desarrolladores */}
      <button
        onClick={() => setShowAdvanced(v => !v)}
        className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {showAdvanced ? '▲' : '▼'} Opciones para desarrolladores
      </button>
      {showAdvanced && (
        <div className="w-full max-w-sm bg-surface-900 rounded-lg p-3 text-left space-y-2">
          <p className="text-[11px] text-zinc-500">Desde la carpeta del proyecto:</p>
          <code className="block text-[11px] text-zinc-300 font-mono bg-black/30 rounded px-3 py-2 select-all">
            cd server && npm run install-service
          </code>
          <p className="text-[11px] text-zinc-600">O para iniciar sin instalar (temporal):</p>
          <code className="block text-[11px] text-zinc-300 font-mono bg-black/30 rounded px-3 py-2 select-all">
            cd server && npm start
          </code>
        </div>
      )}
    </div>
  );
}

function Step({ n, label, children }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 shrink-0 rounded-full bg-surface-700 border border-surface-500 flex items-center justify-center text-[11px] font-bold text-zinc-400 mt-0.5">
        {n}
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-zinc-300 mb-1">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ── Modal para ingresar ruta de carpeta ──────────────────────────────────────
function AddFolderModal({ onAdd, onClose }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) { setError('Ingresa una ruta'); return; }
    setLoading(true);
    setError('');
    try {
      await onAdd(trimmed);
      onClose();
    } catch (err) {
      setError(err.message || 'Error al agregar carpeta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form
        className="bg-surface-800 border border-surface-600 rounded-xl p-5 w-[420px] shadow-2xl"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white">Agregar carpeta multimedia</span>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={15} />
          </button>
        </div>
        <label className="block text-xs text-zinc-400 mb-1">Ruta absoluta de la carpeta</label>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setError(''); }}
          placeholder="/Users/usuario/Videos  o  C:\Videos"
          className="w-full bg-surface-700 border border-surface-500 text-sm text-zinc-100 rounded-lg px-3 py-2 focus:outline-none focus:border-accent font-mono"
        />
        {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-xs rounded-lg bg-surface-700 text-zinc-300 hover:bg-surface-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 text-xs rounded-lg bg-accent hover:bg-accent-hover text-white font-semibold transition-colors disabled:opacity-50"
          >
            {loading ? 'Verificando…' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Miniatura FSA (modo directo — thumbnail async con IntersectionObserver) ──
function FsaMediaThumb({ file, isActive, onSend, onAddToEvent }) {
  const [thumb, setThumb] = useState(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  const isVideo = file.type === 'video';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let canceled = false;
    generateThumbnail(file.handle, file.type)
      .then(url => { if (!canceled) setThumb(url); })
      .catch(() => {});
    return () => { canceled = true; };
  }, [visible, file.handle, file.type]);

  return (
    <div
      ref={ref}
      className="relative group"
      draggable
      onDragStart={e => {
        const url = `/local-media/${encodeURIComponent(file.name)}`;
        e.dataTransfer.setData('application/aio-media', JSON.stringify({
          type: file.type,
          name: file.name,
          url,
        }));
        e.dataTransfer.effectAllowed = 'copy';
        // Caché el archivo en background para que el SW lo pueda servir al proyectar
        cacheMediaFile(file.handle).catch(() => {});
      }}
    >
      <button
        onClick={() => onSend(file)}
        className={`w-full rounded-lg overflow-hidden border-2 transition-all aspect-video flex items-center justify-center bg-surface-700 ${
          isActive
            ? 'border-accent shadow-lg shadow-accent/30'
            : 'border-surface-600 hover:border-zinc-500'
        }`}
        title={file.name}
      >
        {thumb ? (
          <img src={thumb} alt={file.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center gap-1">
            {isVideo
              ? <Film size={20} className="text-zinc-500" />
              : <Image size={20} className="text-zinc-500" />}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
          <Play size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <p className="text-[9px] text-white truncate">{file.name}</p>
        </div>
        {isActive && <div className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full shadow" />}
      </button>
      {onAddToEvent && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToEvent(file); }}
          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-purple-600/90 hover:bg-purple-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow z-10"
          title="Agregar al programa del evento"
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}

// ── Miniatura servidor (modo fallback — URL desde servidor local) ─────────────
function MediaThumb({ file, isActive, onSend, onAddToEvent }) {
  const isVideo = file.type === 'video';
  const url = thumbUrl(file.path);

  return (
    <div className="relative group">
      <button
        onClick={() => onSend(file)}
        draggable
        onDragStart={e => {
          const mediaUrl = `${SERVER_BASE}/api/media/serve?filePath=${encodeURIComponent(file.path)}`;
          e.dataTransfer.setData('application/aio-media', JSON.stringify({
            type: file.type, path: file.path, name: file.name, url: mediaUrl,
          }));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        className={`w-full rounded-lg overflow-hidden border-2 transition-all aspect-video flex items-center justify-center bg-surface-700 ${
          isActive
            ? 'border-accent shadow-lg shadow-accent/30'
            : 'border-surface-600 hover:border-zinc-500'
        }`}
        title={file.name}
      >
        <img
          src={url}
          alt={file.name}
          className="w-full h-full object-cover"
          onError={e => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextSibling.style.display = 'flex';
          }}
        />
        <div className="absolute inset-0 items-center justify-center flex-col gap-1 hidden" aria-hidden>
          {isVideo ? <Film size={20} className="text-zinc-400" /> : <Image size={20} className="text-zinc-400" />}
          <span className="text-[9px] text-zinc-500 text-center break-all px-1 line-clamp-2">{file.name}</span>
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
          <Play size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <p className="text-[9px] text-white truncate">{file.name}</p>
        </div>
        {isActive && <div className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full shadow" />}
      </button>
      {onAddToEvent && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToEvent(file); }}
          className="absolute top-1 left-1 w-5 h-5 rounded-full bg-purple-600/90 hover:bg-purple-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow z-10"
          title="Agregar al programa del evento"
        >
          <Plus size={10} />
        </button>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function MediaLibrary() {
  const { state, actions } = usePresenter();

  // 'fsa' = File System Access API (Chrome/Edge, sin servidor)
  // 'server' = servidor local (Firefox / fallback manual)
  const [mode, setMode] = useState(() => FSA_SUPPORTED ? 'fsa' : 'server');

  // Carpetas:
  //   FSA mode:    { key, name, handle, permissionState }
  //   Server mode: { name, path, primerPlano }
  const [folders, setFolders]           = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);

  // Archivos:
  //   FSA mode:    { name, ext, type, handle }
  //   Server mode: { name, path, type }
  const [files, setFiles]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter]             = useState('all'); // 'all' | 'image' | 'video'
  const [localServerUp, setLocalServerUp] = useState(null); // null=checking, true, false
  const [sendError, setSendError]       = useState(null);
  const [restoringPermissions, setRestoringPermissions] = useState(false);
  // Para forzar re-render cuando cambia primerPlano en localStorage
  const [primerPlanoVersion, setPrimerPlanoVersion] = useState(0);

  // Archivo activo en output
  const activeFileName = state.liveState?.slideData?.type === 'media'
    ? state.liveState.slideData.fileName ?? null
    : null;
  const activeFilePath = state.liveState?.slideData?.type === 'media'
    ? state.liveState.slideData.filePath ?? null
    : state.liveState?.backgroundMedia?.filePath ?? null;

  // ── FSA: cargar carpetas — BD (autoritative) + handles locales (IndexedDB) ──
  const loadFsaFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const token   = localStorage.getItem('aio_sync_token');
      const handles = await fsaListFolders();

      // Función interna: construir lista a partir de handles de IndexedDB
      const buildFromHandles = async (list) => {
        return Promise.all(
          list.map(async (h) => {
            try {
              const perm = await h.handle.queryPermission({ mode: 'read' });
              return { ...h, permissionState: perm };
            } catch {
              return { ...h, permissionState: 'error' };
            }
          })
        );
      };

      // Si hay token, BD es la fuente de verdad compartida entre dispositivos
      if (token) {
        const dbFolders = await fetchFoldersFromDb(API_BASE, token);
        // Si la BD devuelve carpetas, usarlas como fuente de verdad
        if (dbFolders.length > 0) {
          const prefix = getOrgPrefix();
          const merged = await Promise.all(
            dbFolders.map(async ({ id, name }) => {
              const idbKey  = `${prefix}db-folder:${id}`;
              const byKey   = handles.find(h => h.key === idbKey);
              const byName  = handles.find(h => h.name === name);
              const entry   = byKey ?? byName;
              if (entry) {
                try {
                  const perm = await entry.handle.queryPermission({ mode: 'read' });
                  return { key: idbKey, dbId: id, name, handle: entry.handle, permissionState: perm };
                } catch {
                  return { key: idbKey, dbId: id, name, handle: null, permissionState: 'prompt' };
                }
              }
              return { key: idbKey, dbId: id, name, handle: null, permissionState: 'prompt' };
            })
          );
          setFolders(merged);
          setSelectedFolder(prev => {
            if (!prev) return merged[0] ?? null;
            return merged.find(f => f.key === prev.key) ?? merged[0] ?? null;
          });
          return;
        }
        // BD vacía o no disponible — usar IndexedDB como fallback para no perder acceso local
        if (handles.length > 0) {
          const withPerms = await buildFromHandles(handles);
          setFolders(withPerms);
          setSelectedFolder(prev => {
            if (!prev) return withPerms[0] ?? null;
            return withPerms.find(f => f.key === prev.key) ?? withPerms[0] ?? null;
          });
          return;
        }
        setFolders([]);
        setSelectedFolder(null);
      } else {
        // Sin sesión: usar solo IndexedDB
        const withPerms = await buildFromHandles(handles);
        setFolders(withPerms);
        setSelectedFolder(prev => {
          if (!prev) return withPerms[0] ?? null;
          return withPerms.find(f => f.key === prev.key) ?? withPerms[0] ?? null;
        });
      }
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  // ── Server: cargar carpetas desde servidor local ───────────────────────────
  const loadServerFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch(`${SERVER_BASE}/api/media/folders`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLocalServerUp(true);
      setFolders(data);
      setSelectedFolder(prev => {
        if (!prev) return data[0] ?? null;
        return data.find(f => f.path === prev.path) ?? data[0] ?? null;
      });
    } catch {
      setLocalServerUp(false);
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  // Carga inicial cuando cambia el modo
  useEffect(() => {
    setFolders([]);
    setSelectedFolder(null);
    setFiles([]);
    if (mode === 'fsa') loadFsaFolders();
    else loadServerFolders();
  }, [mode, loadFsaFolders, loadServerFolders]);

  // Cargar archivos cuando cambia la carpeta seleccionada
  useEffect(() => {
    if (!selectedFolder) { setFiles([]); return; }
    setLoading(true);
    if (mode === 'fsa') {
      listMediaFiles(selectedFolder.handle)
        .then(data => setFiles(data))
        .catch(() => setFiles([]))
        .finally(() => setLoading(false));
    } else {
      fetch(`${SERVER_BASE}/api/media/files?folder=${encodeURIComponent(selectedFolder.path)}`)
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => setFiles(data))
        .catch(() => setFiles([]))
        .finally(() => setLoading(false));
    }
  }, [selectedFolder, mode]);

  // ── FSA: seleccionar carpeta (puede requerir permiso o handle nulo) ─────────
  const handleSelectFsaFolder = async (folder) => {
    // Sin handle local: carpeta viene de BD pero no de este dispositivo — pedir re-selección
    if (!folder.handle) {
      try {
        const handle = await pickFolder();
        await saveFolder(handle, folder.key);
        const perm = await handle.queryPermission({ mode: 'read' });
        const updated = { ...folder, handle, permissionState: perm };
        setFolders(prev => prev.map(f => f.key === folder.key ? updated : f));
        setSelectedFolder(updated);
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Error re-seleccionando carpeta:', err);
      }
      return;
    }
    if (folder.permissionState !== 'granted') {
      try {
        const perm = await verifyPermission(folder.handle);
        if (perm !== 'granted') return;
        setFolders(prev =>
          prev.map(f => f.key === folder.key ? { ...f, permissionState: 'granted' } : f)
        );
        folder = { ...folder, permissionState: 'granted' };
      } catch { return; }
    }
    setSelectedFolder(folder);
  };

  // ── FSA: restaurar permisos de todas las carpetas en lote ─────────────────
  const handleRestoreAllPermissions = async () => {
    setRestoringPermissions(true);
    const pending = folders.filter(f => f.permissionState !== 'granted');
    const updated = [...folders];
    for (const folder of pending) {
      try {
        let handle = folder.handle;
        if (!handle) {
          // Sin handle: pedir al usuario que re-seleccione esta carpeta
          handle = await pickFolder();
          await saveFolder(handle, folder.key);
        }
        const perm = await verifyPermission(handle);
        const idx = updated.findIndex(f => f.key === folder.key);
        if (idx >= 0) updated[idx] = { ...updated[idx], handle, permissionState: perm };
      } catch (err) {
        if (err.name === 'AbortError') break; // usuario canceló
      }
    }
    setFolders(updated);
    const firstGranted = updated.find(f => f.permissionState === 'granted');
    if (firstGranted) setSelectedFolder(firstGranted);
    setRestoringPermissions(false);
  };

  // ── FSA: agregar carpeta con selector nativo ───────────────────────────────
  const handleAddFolderFsa = async () => {
    try {
      const handle = await pickFolder();
      const token  = localStorage.getItem('aio_sync_token');
      let dbId = null;
      if (token) {
        try {
          const saved = await saveFolderToDb(handle.name, API_BASE, token);
          dbId = saved.id;
        } catch (e) {
          console.warn('No se pudo guardar carpeta en BD:', e);
        }
      }
      const idbKey = dbId ? `${getOrgPrefix()}db-folder:${dbId}` : undefined;
      const key    = await saveFolder(handle, idbKey);
      const perm   = await handle.queryPermission({ mode: 'read' });
      const newFolder = { key, dbId, name: handle.name, handle, permissionState: perm };
      setFolders(prev => [...prev, newFolder]);
      setSelectedFolder(newFolder);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Error al agregar carpeta FSA:', err);
    }
  };

  // ── Server: agregar carpeta con ruta de texto ──────────────────────────────
  const handleAddFolderServer = async (folderPath) => {
    const res = await fetch(`${SERVER_BASE}/api/media/folders`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ folderPath }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Error al agregar carpeta');
    }
    const data = await res.json();
    setFolders(data);
    const added = data.find(f => f.path === folderPath);
    if (added) setSelectedFolder(added);
  };

  // ── Eliminar carpeta ───────────────────────────────────────────────────────
  const handleRemoveFolder = async (folder) => {
    if (!window.confirm(`¿Quitar "${folder.name}" de la lista?`)) return;
    if (mode === 'fsa') {
      await fsaRemoveFolder(folder.key);
      if (folder.dbId) {
        const token = localStorage.getItem('aio_sync_token');
        if (token) await removeFolderFromDb(folder.dbId, API_BASE, token);
      }
      const updated = folders.filter(f => f.key !== folder.key);
      setFolders(updated);
      setSelectedFolder(prev => prev?.key === folder.key ? updated[0] ?? null : prev);
    } else {
      const res = await fetch(`${SERVER_BASE}/api/media/folders`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ folderPath: folder.path }),
      });
      const data = res.ok ? await res.json() : folders.filter(f => f.path !== folder.path);
      setFolders(data);
      setSelectedFolder(prev => prev?.path === folder.path ? data[0] ?? null : prev);
    }
  };

  // ── Toggle primerPlano ────────────────────────────────────────────────────
  const handleTogglePrimerPlano = async (folder) => {
    if (mode === 'fsa') {
      const current = getFsaPrimerPlano(folder.key);
      setFsaPrimerPlano(folder.key, !current);
      setPrimerPlanoVersion(v => v + 1); // fuerza re-render
    } else {
      const newVal = !(folder.primerPlano ?? true);
      try {
        const res = await api.patch('/media/folders', { folderPath: folder.path, primerPlano: newVal });
        setFolders(res.data);
        setSelectedFolder(prev =>
          prev?.path === folder.path ? { ...prev, primerPlano: newVal } : prev
        );
      } catch (err) {
        console.error('Error toggling primerPlano:', err);
      }
    }
  };

  // ── Enviar media al output ────────────────────────────────────────────────
  const handleSendMedia = useCallback(async (file) => {
    setSendError(null);
    if (mode === 'fsa') {
      try {
        const cacheKey    = await cacheMediaFile(file.handle);
        const primerPlano = selectedFolder ? getFsaPrimerPlano(selectedFolder.key) : true;
        actions.showSlide({
          type: 'media',
          slideData: {
            type: 'media', mediaType: file.type,
            fileName: file.name, url: cacheKey, primerPlano,
          },
          nextSlideData: null,
        });
      } catch (err) {
        console.error('Error caching media file:', err);
        setSendError(`No se pudo cargar "${file.name}"`);
      }
    } else {
      const primerPlano = selectedFolder?.primerPlano ?? true;
      actions.showSlide({
        type: 'media',
        slideData: {
          type: 'media', mediaType: file.type,
          filePath: file.path, fileName: file.name,
          url: `${SERVER_BASE}/api/media/serve?filePath=${encodeURIComponent(file.path)}`,
          primerPlano,
        },
        nextSlideData: null,
      });
    }
  }, [mode, selectedFolder, actions]); // eslint-disable-line

  // ── Agregar al programa del evento (ScheduleAddContext) ──────────────────
  const { fn: addToEventFn } = useScheduleAdd() ?? {};
  const handleAddToEvent = useCallback((file) => {
    if (addToEventFn) addToEventFn(file);
  }, [addToEventFn]);

  // ── Reproducir media desde click en EventsPanel ──────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const { name } = e.detail || {};
      if (!name) return;
      const file = files.find(f => f.name === name);
      if (file) {
        handleSendMedia(file);
      } else {
        setSendError(`Abre la carpeta con "${name}" en la Biblioteca Multimedia para reproducirlo`);
      }
    };
    window.addEventListener('aio:play-media', handler);
    return () => window.removeEventListener('aio:play-media', handler);
  }, [files, handleSendMedia]);

  // ── Derived values ────────────────────────────────────────────────────────
  const filteredFiles = filter === 'all' ? files : files.filter(f => f.type === filter);
  const imageCount    = files.filter(f => f.type === 'image').length;
  const videoCount    = files.filter(f => f.type === 'video').length;

  // primerPlano para la carpeta seleccionada
  // eslint-disable-next-line no-unused-vars
  const primerPlanoValue = selectedFolder
    ? mode === 'fsa'
      ? getFsaPrimerPlano(selectedFolder.key)  // re-read cuando primerPlanoVersion cambia
      : (selectedFolder.primerPlano ?? true)
    : true;
  void primerPlanoVersion; // evita warning de unused

  const folderKey = (f) => mode === 'fsa' ? f.key : f.path;
  const isSelectedFolder = (f) => mode === 'fsa'
    ? selectedFolder?.key === f.key
    : selectedFolder?.path === f.path;

  // ── Si modo servidor y no está levantado ─────────────────────────────────
  if (mode === 'server' && localServerUp === false) {
    return (
      <div className="flex flex-col h-full">
        <LocalServerSetup onRetry={loadServerFolders} retrying={loadingFolders} />
        {FSA_SUPPORTED && (
          <div className="p-3 border-t border-surface-700 text-center">
            <button
              onClick={() => setMode('fsa')}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              ⚡ Cambiar a modo sin servidor (File System Access)
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Columna izquierda: Carpetas ──────────────────────────────── */}
      <aside className="w-44 shrink-0 bg-surface-800 border-r border-surface-700 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Carpetas</span>
          <div className="flex gap-1">
            <button
              onClick={mode === 'fsa' ? loadFsaFolders : loadServerFolders}
              disabled={loadingFolders}
              title="Actualizar"
              className="text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={loadingFolders ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={mode === 'fsa' ? handleAddFolderFsa : () => setShowAddModal(true)}
              title="Agregar carpeta"
              className="text-zinc-500 hover:text-accent transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* Banner de restaurar permisos — solo en FSA mode cuando hay carpetas bloqueadas */}
          {mode === 'fsa' && folders.length > 0 && folders.some(f => f.permissionState !== 'granted') && (
            <button
              onClick={handleRestoreAllPermissions}
              disabled={restoringPermissions}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 border-b border-yellow-500/20 text-yellow-400 text-[10px] transition-colors disabled:opacity-60"
              title="Restaurar acceso a todas las carpetas bloqueadas"
            >
              <ShieldCheck size={11} className="shrink-0" />
              <span className="flex-1 text-left truncate">
                {restoringPermissions ? 'Restaurando…' : 'Restaurar acceso a carpetas'}
              </span>
            </button>
          )}
          {folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-3 text-center">
              <FolderX size={24} className="text-zinc-600" />
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                {mode === 'fsa'
                  ? 'Haz clic en + para elegir una carpeta'
                  : 'Agrega carpetas con videos e imágenes'}
              </p>
              <button
                onClick={mode === 'fsa' ? handleAddFolderFsa : () => setShowAddModal(true)}
                className="text-[10px] text-accent hover:text-accent-hover transition-colors"
              >
                + Agregar carpeta
              </button>
            </div>
          ) : (
            folders.map(folder => {
              const needsPermission = mode === 'fsa' && folder.permissionState !== 'granted';
              return (
                <div
                  key={folderKey(folder)}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors relative ${
                    isSelectedFolder(folder)
                      ? 'bg-surface-700 text-white'
                      : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'
                  }`}
                  onClick={() => mode === 'fsa'
                    ? handleSelectFsaFolder(folder)
                    : setSelectedFolder(folder)
                  }
                  title={needsPermission ? 'Clic para conceder acceso a esta carpeta' : folder.name}
                >
                  <FolderOpen size={13} className="shrink-0" />
                  <span className="text-xs truncate flex-1 leading-tight">{folder.name}</span>
                  {needsPermission && (
                    <ShieldCheck size={11} className="text-yellow-500 shrink-0" title="Permiso pendiente — haz clic para conceder acceso" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveFolder(folder); }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0"
                    title="Quitar carpeta"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Indicador de modo + botón para cambiar */}
        <div className="px-3 py-2 border-t border-surface-700">
          <button
            onClick={() => setMode(m => m === 'fsa' ? 'server' : 'fsa')}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors w-full text-left"
            title={mode === 'fsa' ? 'Cambiar a modo servidor local' : 'Cambiar a modo sin servidor'}
          >
            {mode === 'fsa' ? '⚡ Modo directo' : '🖥 Modo servidor'}
          </button>
        </div>
      </aside>

      {/* ── Área principal: Archivos ──────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Barra de filtros */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-700 bg-surface-800 shrink-0 flex-wrap">
          {[
            { key: 'all',   label: `Todo (${files.length})` },
            { key: 'image', label: `Imágenes (${imageCount})` },
            { key: 'video', label: `Videos (${videoCount})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                filter === key
                  ? 'bg-accent text-white'
                  : 'bg-surface-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}

          {selectedFolder && (
            <button
              onClick={() => handleTogglePrimerPlano(selectedFolder)}
              title={primerPlanoValue
                ? 'Primer Plano: ON — el media reemplaza al slide activo'
                : 'Primer Plano: OFF — el media va de fondo; el slide activo se superpone'}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors shrink-0 ${
                primerPlanoValue
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'bg-surface-700 text-zinc-400 border-surface-600 hover:text-zinc-200'
              }`}
            >
              <Layers size={11} />
              Primer Plano
            </button>
          )}

          {sendError && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-red-400">
              <AlertTriangle size={11} /> {sendError}
            </span>
          )}
        </div>

        {/* Grid de archivos */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3">
          {!selectedFolder ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <FolderOpen size={36} className="text-zinc-700" />
              <p className="text-sm text-zinc-500">Selecciona una carpeta para ver sus archivos</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-zinc-500 text-sm">
              <RefreshCw size={16} className="animate-spin" />
              Cargando…
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <Image size={28} className="text-zinc-700" />
              <p className="text-sm text-zinc-500">
                {files.length === 0
                  ? 'No hay imágenes ni videos en esta carpeta'
                  : 'No hay archivos del tipo seleccionado'}
              </p>
            </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {filteredFiles.map(file =>
                mode === 'fsa' ? (
                  <FsaMediaThumb
                    key={file.name}
                    file={file}
                    isActive={file.name === activeFileName}
                    onSend={handleSendMedia}
                    onAddToEvent={addToEventFn ? handleAddToEvent : undefined}
                  />
                ) : (
                  <MediaThumb
                    key={file.path}
                    file={file}
                    isActive={file.path === activeFilePath}
                    onSend={handleSendMedia}
                    onAddToEvent={addToEventFn ? handleAddToEvent : undefined}
                  />
                )
              )}
            </div>
          )}
        </div>
      </main>

      {mode === 'server' && showAddModal && (
        <AddFolderModal
          onAdd={handleAddFolderServer}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

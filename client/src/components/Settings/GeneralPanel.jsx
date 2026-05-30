import { useState, useEffect, useCallback } from 'react';
import { Film, Image, X, Trash2, AlertTriangle } from 'lucide-react';
import { usePresenter } from '../../context/usePresenter';
import {
  FSA_SUPPORTED,
  listFolders as fsaListFolders,
  listMediaFiles,
  generateThumbnail,
  cacheMediaFile,
  verifyPermission,
  fetchFoldersFromDb,
} from '../../utils/fsaUtils';

const API_BASE = import.meta.env.VITE_API_URL || '';

const SERVER_BASE = (() => {
  const savedIp   = localStorage.getItem('aio_server_ip');
  const savedPort = localStorage.getItem('aio_server_port') || '3001';
  const host      = savedIp || window.location.hostname;
  return `http://${host}:${savedPort}`;
})();

// ─── Posiciones ────────────────────────────────────────────────────────────────
const POSITIONS = [
  'top-left',    'top-center',    'top-right',
  'center-left', 'center',        'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];
function posStyle(pos) {
  const parts = pos.split('-');
  const v = parts[0];
  const h = parts[1] ?? 'center'; // 'center' sola → h implícito = 'center'
  const top    = v === 'top'    ? '5%'  : v === 'bottom' ? 'auto' : '50%';
  const bottom = v === 'bottom' ? '5%'  : 'auto';
  const left   = h === 'left'   ? '5%'  : h === 'right'  ? 'auto' : '50%';
  const right  = h === 'right'  ? '5%'  : 'auto';
  const tx     = h === 'center';
  const ty     = v === 'center';
  const transform = tx && ty ? 'translate(-50%, -50%)'
                 : tx       ? 'translateX(-50%)'
                 : ty       ? 'translateY(-50%)'
                 : 'none';
  return { position: 'absolute', top, bottom, left, right, transform };
}

// ─── Thumbnail con blob URL temporal para FSA ─────────────────────────────────
function FsaThumb({ fileHandle, type, className }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    generateThumbnail(fileHandle, type).then(url => {
      if (!cancelled) setSrc(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [fileHandle, type]);
  if (!src) return null;
  return <img src={src} alt="" className={className} />;
}

// ─── Modal selector de media (FSA + servidor) ────────────────────────────────
function LogoPickerModal({ onSelect, onClose }) {
  const [folders,    setFolders]    = useState([]);
  const [selFolder,  setSelFolder]  = useState(null);
  const [files,      setFiles]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [thumbs,     setThumbs]     = useState({});  // name → dataURL (server mode)
  const [selecting,  setSelecting]  = useState(null); // nombre del archivo en proceso

  const mode = FSA_SUPPORTED ? 'fsa' : 'server';

  // ── Cargar carpetas ────────────────────────────────────────────────────────
  const loadFolders = useCallback(async () => {
    if (mode === 'fsa') {
      const token   = localStorage.getItem('aio_sync_token');
      const handles = await fsaListFolders();

      if (token) {
        const dbFolders = await fetchFoldersFromDb(API_BASE, token);
        if (dbFolders.length > 0) {
          const merged = await Promise.all(
            dbFolders.map(async ({ id, name }) => {
              const idbKey = `db-folder:${id}`;
              const entry  = handles.find(h => h.key === idbKey) ?? handles.find(h => h.name === name);
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
          setSelFolder(merged[0] ?? null);
          return;
        }
      }
      // Sin token o BD vacía → solo IndexedDB
      const withPerms = await Promise.all(handles.map(async h => {
        try {
          const perm = await h.handle.queryPermission({ mode: 'read' });
          return { ...h, permissionState: perm };
        } catch { return { ...h, permissionState: 'error' }; }
      }));
      setFolders(withPerms);
      setSelFolder(withPerms[0] ?? null);
    } else {
      // Modo servidor
      try {
        const res = await fetch(`${SERVER_BASE}/api/media/folders`);
        const data = res.ok ? await res.json() : [];
        setFolders(data);
        setSelFolder(data[0] ?? null);
      } catch { setFolders([]); }
    }
  }, [mode]);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // ── Cargar archivos al cambiar carpeta ─────────────────────────────────────
  useEffect(() => {
    if (!selFolder) { setFiles([]); return; }
    setLoading(true);
    if (mode === 'fsa') {
      if (!selFolder.handle) { setFiles([]); setLoading(false); return; }
      listMediaFiles(selFolder.handle)
        .then(data => setFiles(data))
        .catch(() => setFiles([]))
        .finally(() => setLoading(false));
    } else {
      fetch(`${SERVER_BASE}/api/media/files?folder=${encodeURIComponent(selFolder.path)}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => setFiles(data))
        .catch(() => setFiles([]))
        .finally(() => setLoading(false));
    }
  }, [selFolder, mode]);

  // ── Seleccionar carpeta FSA (puede necesitar permiso) ─────────────────────
  const handleSelectFolder = async (folder) => {
    if (mode !== 'fsa') { setSelFolder(folder); return; }
    if (!folder.handle || folder.permissionState !== 'granted') {
      try {
        const perm = await verifyPermission(folder.handle);
        if (perm !== 'granted') return;
        folder = { ...folder, permissionState: 'granted' };
        setFolders(prev => prev.map(f => f.key === folder.key ? folder : f));
      } catch { return; }
    }
    setSelFolder(folder);
  };

  // ── Seleccionar archivo ────────────────────────────────────────────────────
  const handleSelectFile = async (file) => {
    if (selecting) return;
    setSelecting(file.name);
    try {
      if (mode === 'fsa') {
        // Cachear el archivo para que OutputRenderer lo sirva vía SW
        const cacheUrl = await cacheMediaFile(file.handle);
        onSelect({ url: cacheUrl, mediaType: file.type, fileName: file.name });
      } else {
        onSelect({
          url:      `${SERVER_BASE}/api/media/serve?filePath=${encodeURIComponent(file.path)}`,
          filePath: file.path,
          mediaType: file.type,
          fileName:  file.name,
        });
      }
      onClose();
    } catch (e) {
      console.error('Error seleccionando logo:', e);
    } finally {
      setSelecting(null);
    }
  };

  const folderKey = mode === 'fsa' ? 'key' : 'path';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-surface-800 border border-surface-600 rounded-xl shadow-2xl w-[480px] max-h-[65vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700 shrink-0">
          <span className="text-sm font-semibold text-zinc-200">Seleccionar logo</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X size={15} /></button>
        </div>
        {/* Carpetas */}
        <div className="flex gap-1 px-3 pt-2 flex-wrap shrink-0">
          {folders.map(f => (
            <button
              key={f[folderKey]}
              onClick={() => handleSelectFolder(f)}
              className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                selFolder?.[folderKey] === f[folderKey]
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'bg-surface-700 text-zinc-400 border-surface-600 hover:text-zinc-200'
              }`}
            >
              {f.name}
              {mode === 'fsa' && f.permissionState !== 'granted' && (
                <AlertTriangle size={9} className="inline ml-1 text-yellow-500" />
              )}
            </button>
          ))}
          {folders.length === 0 && (
            <p className="text-xs text-zinc-500 italic py-1 px-1">Sin carpetas configuradas</p>
          )}
        </div>
        {/* Aviso permiso necesario */}
        {mode === 'fsa' && selFolder && selFolder.permissionState !== 'granted' && (
          <p className="text-[11px] text-yellow-400 px-4 pt-2">
            Clic en la carpeta para conceder acceso de lectura
          </p>
        )}
        {/* Grid de archivos */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-xs text-zinc-500 text-center py-6">Cargando...</p>
          ) : files.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">Sin archivos en esta carpeta</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {files.map(file => (
                <button
                  key={file.name}
                  onClick={() => handleSelectFile(file)}
                  disabled={!!selecting}
                  className="relative aspect-video rounded-lg overflow-hidden border-2 border-surface-600 hover:border-accent bg-surface-700 flex items-center justify-center group disabled:opacity-60"
                  title={file.name}
                >
                  {mode === 'fsa' ? (
                    <FsaThumb
                      fileHandle={file.handle}
                      type={file.type}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={`${SERVER_BASE}/api/media/thumbnail?filePath=${encodeURIComponent(file.path)}`}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
                    {selecting === file.name ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : file.type === 'video' ? (
                      <Film  size={14} className="text-white opacity-0 group-hover:opacity-100" />
                    ) : (
                      <Image size={14} className="text-white opacity-0 group-hover:opacity-100" />
                    )}
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <p className="text-[8px] text-white truncate">{file.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel General ────────────────────────────────────────────────────────────
export default function GeneralPanel() {
  const { state, actions } = usePresenter();
  const cfg = state.outputConfig ?? {};

  const logoEnabled  = cfg.logoEnabled  ?? false;
  const logoMedia    = cfg.logoMedia    ?? null;
  const logoSize     = cfg.logoSize     ?? 30;
  const logoPosition = cfg.logoPosition ?? 'center';
  const logoBgColor  = cfg.logoBgColor  ?? '#000000';
  const logoFit      = cfg.logoFit      ?? 'contain';

  const [showPicker, setShowPicker] = useState(false);

  const update = (patch) => actions.setOutputConfig({ ...cfg, ...patch });

  const thumbSrc = logoMedia?.filePath
    ? `${SERVER_BASE}/api/media/thumbnail?filePath=${encodeURIComponent(logoMedia.filePath)}`
    : null;

  return (
    <div className="space-y-5">

      {/* ── Sección: Logo en pantalla en negro ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Logo en pantalla en negro</p>
          {/* Toggle enable */}
          <button
            onClick={() => update({ logoEnabled: !logoEnabled })}
            className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${logoEnabled ? 'bg-accent' : 'bg-surface-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${logoEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Selección de logo */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPicker(true)}
            className="flex-1 flex items-center gap-2 px-3 py-2 bg-surface-700 hover:bg-surface-600 border border-surface-600 hover:border-accent rounded-lg text-xs text-zinc-300 hover:text-white transition-colors"
          >
            {logoMedia ? (
              <>
                {logoMedia.mediaType === 'video' ? <Film size={12} className="text-accent shrink-0" /> : <Image size={12} className="text-accent shrink-0" />}
                <span className="truncate">{logoMedia.fileName}</span>
              </>
            ) : (
              <>
                <Image size={12} className="text-zinc-500 shrink-0" />
                <span className="text-zinc-500">Seleccionar logo…</span>
              </>
            )}
          </button>
          {logoMedia && (
            <button
              onClick={() => update({ logoMedia: null, logoEnabled: false })}
              className="p-2 rounded-lg bg-surface-700 hover:bg-red-900/40 border border-surface-600 hover:border-red-500/50 text-zinc-500 hover:text-red-400 transition-colors"
              title="Quitar logo"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {/* Preview */}
        {logoMedia && (
          <div
            className="relative w-full rounded-lg overflow-hidden border border-surface-600"
            style={{ height: '120px', backgroundColor: logoBgColor }}
          >
            <div style={{ ...posStyle(logoPosition), width: `${logoSize}%` }}>
              {logoMedia.mediaType === 'video' ? (
                <video
                  src={logoMedia.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ width: '100%', objectFit: logoFit, display: 'block' }}
                />
              ) : (
                <img
                  src={thumbSrc || logoMedia.url}
                  alt="logo"
                  style={{ width: '100%', objectFit: logoFit, display: 'block' }}
                />
              )}
            </div>
          </div>
        )}

        {/* Opciones (solo si hay logo) */}
        {logoMedia && (
          <div className="space-y-3">
            {/* Color de fondo */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-300">Color de fondo</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={logoBgColor}
                  onChange={e => update({ logoBgColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                />
                <span className="text-[10px] text-zinc-500 font-mono">{logoBgColor}</span>
              </div>
            </div>

            {/* Tamaño */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-300">Tamaño</span>
                <span className="text-[10px] text-zinc-500 font-mono">{logoSize}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={logoSize}
                onChange={e => update({ logoSize: Number(e.target.value) })}
                className="w-full accent-accent h-1.5 rounded-full"
              />
            </div>

            {/* Ajuste (contain / cover) */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-300">Ajuste</span>
              <div className="flex gap-1">
                {['contain', 'cover'].map(f => (
                  <button
                    key={f}
                    onClick={() => update({ logoFit: f })}
                    className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                      logoFit === f
                        ? 'bg-accent/20 text-accent border-accent/40'
                        : 'bg-surface-700 text-zinc-400 border-surface-600 hover:text-zinc-200'
                    }`}
                  >
                    {f === 'contain' ? 'Ajustar' : 'Rellenar'}
                  </button>
                ))}
              </div>
            </div>

            {/* Posición — grilla 3×3 */}
            <div className="space-y-1">
              <span className="text-xs text-zinc-300">Posición</span>
              <div className="grid grid-cols-3 gap-1 w-full">
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => update({ logoPosition: pos })}
                    className={`h-7 rounded border transition-colors text-[10px] ${
                      logoPosition === pos
                        ? 'bg-accent/25 border-accent text-accent'
                        : 'bg-surface-700 border-surface-600 text-zinc-600 hover:text-zinc-300'
                    }`}
                    title={pos}
                  >
                    <span className="pointer-events-none select-none">
                      {pos === 'top-left' ? '↖' : pos === 'top-center' ? '↑' : pos === 'top-right' ? '↗'
                       : pos === 'center-left' ? '←' : pos === 'center' ? '●' : pos === 'center-right' ? '→'
                       : pos === 'bottom-left' ? '↙' : pos === 'bottom-center' ? '↓' : '↘'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal selector */}
      {showPicker && (
        <LogoPickerModal
          onSelect={media => update({ logoMedia: media, logoEnabled: true })}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

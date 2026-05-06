import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderOpen, Plus, Trash2, Film, Image, Play, RefreshCw, FolderX, X, Layers } from 'lucide-react';
import { usePresenter } from '../../context/usePresenter';
import api from '../../hooks/useApi';

const SERVER_BASE = (() => {
  const savedIp   = localStorage.getItem('aio_server_ip');
  const savedPort = localStorage.getItem('aio_server_port') || '3001';
  const host      = savedIp || window.location.hostname;
  return `http://${host}:${savedPort}`;
})();

function thumbUrl(filePath) {
  return `${SERVER_BASE}/api/media/thumbnail?filePath=${encodeURIComponent(filePath)}`;
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

// ── Miniatura de archivo ─────────────────────────────────────────────────────
function MediaThumb({ file, isActive, onSend }) {
  const isVideo = file.type === 'video';
  const url = thumbUrl(file.path);

  return (
    <button
      onClick={() => onSend(file)}
      draggable
      onDragStart={e => {
        const url = `${SERVER_BASE}/api/media/serve?filePath=${encodeURIComponent(file.path)}`;
        e.dataTransfer.setData('application/aio-media', JSON.stringify({
          type: file.type, path: file.path, name: file.name, url,
        }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className={`group relative rounded-lg overflow-hidden border-2 transition-all aspect-video flex items-center justify-center bg-surface-700 ${
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
      {/* Fallback icono (oculto por defecto, visible si falla la carga) */}
      <div className="absolute inset-0 items-center justify-center flex-col gap-1 hidden" aria-hidden>
        {isVideo ? <Film size={20} className="text-zinc-400" /> : <Image size={20} className="text-zinc-400" />}
        <span className="text-[9px] text-zinc-500 text-center break-all px-1 line-clamp-2">{file.name}</span>
      </div>
      {/* Overlay hover */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center pointer-events-none">
        <Play size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
      </div>
      {/* Label inferior */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <p className="text-[9px] text-white truncate">{file.name}</p>
      </div>
      {isActive && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full shadow" />
      )}
    </button>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function MediaLibrary() {
  const { state, actions } = usePresenter();
  const [folders, setFolders]         = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null); // { name, path }
  const [files, setFiles]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [showAddModal, setShowAddModal]     = useState(false);
  const [filter, setFilter]           = useState('all'); // 'all' | 'image' | 'video'

  const activeFilePath = state.liveState?.slideData?.type === 'media'
    ? state.liveState.slideData.filePath
    : state.liveState?.backgroundMedia?.filePath ?? null;

  // Cargar carpetas guardadas
  const loadFolders = useCallback(async () => {
    setLoadingFolders(true);
    try {
      const res = await api.get('/media/folders');
      setFolders(res.data);
      // Si había una carpeta seleccionada, mantenerla si sigue existiendo
      setSelectedFolder(prev => {
        if (!prev) return res.data[0] || null;
        return res.data.find(f => f.path === prev.path) || res.data[0] || null;
      });
    } catch (err) {
      console.error('Error cargando carpetas:', err);
    } finally {
      setLoadingFolders(false);
    }
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // Cargar archivos cuando cambia la carpeta seleccionada
  useEffect(() => {
    if (!selectedFolder) { setFiles([]); return; }
    setLoading(true);
    api.get(`/media/files?folder=${encodeURIComponent(selectedFolder.path)}`)
      .then(res => setFiles(res.data))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [selectedFolder]);

  const handleAddFolder = async (folderPath) => {
    const res = await api.post('/media/folders', { folderPath });
    setFolders(res.data);
    const added = res.data.find(f => f.path === folderPath);
    if (added) setSelectedFolder(added);
  };

  const handleRemoveFolder = async (folder) => {
    if (!window.confirm(`¿Quitar "${folder.name}" de la lista?`)) return;
    const res = await api.delete('/media/folders', { data: { folderPath: folder.path } });
    setFolders(res.data);
    setSelectedFolder(prev => {
      if (prev?.path === folder.path) return res.data[0] || null;
      return prev;
    });
  };

  const handleTogglePrimerPlano = async (folder) => {
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
  };

  const handleSendMedia = (file) => {
    const primerPlano = selectedFolder?.primerPlano ?? true;
    actions.showSlide({
      type: 'media',
      slideData: {
        type:      'media',
        mediaType: file.type,
        filePath:  file.path,
        fileName:  file.name,
        url: `${SERVER_BASE}/api/media/serve?filePath=${encodeURIComponent(file.path)}`,
        primerPlano,
      },
      nextSlideData: null,
    });
  };

  const filteredFiles = filter === 'all'
    ? files
    : files.filter(f => f.type === filter);

  const imageCount = files.filter(f => f.type === 'image').length;
  const videoCount = files.filter(f => f.type === 'video').length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Columna izquierda: Carpetas ────────────────────────────────── */}
      <aside className="w-44 shrink-0 bg-surface-800 border-r border-surface-700 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-surface-700">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Carpetas</span>
          <div className="flex gap-1">
            <button
              onClick={loadFolders}
              disabled={loadingFolders}
              title="Actualizar"
              className="text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={loadingFolders ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              title="Agregar carpeta"
              className="text-zinc-500 hover:text-accent transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-3 text-center">
              <FolderX size={24} className="text-zinc-600" />
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Agrega carpetas con videos e imágenes
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-[10px] text-accent hover:text-accent-hover transition-colors"
              >
                + Agregar carpeta
              </button>
            </div>
          ) : (
            folders.map(folder => (
              <div
                key={folder.path}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors relative ${
                  selectedFolder?.path === folder.path
                    ? 'bg-surface-700 text-white'
                    : 'text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'
                }`}
                onClick={() => setSelectedFolder(folder)}
              >
                <FolderOpen size={13} className="shrink-0" />
                <span className="text-xs truncate flex-1 leading-tight">{folder.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveFolder(folder); }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all shrink-0"
                  title="Quitar carpeta"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Área principal: Archivos ───────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Barra de filtros */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-700 bg-surface-800 shrink-0">
          {[{key:'all',label:`Todo (${files.length})`},{key:'image',label:`Imágenes (${imageCount})`},{key:'video',label:`Videos (${videoCount})`}].map(({ key, label }) => (
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

          {/* Toggle Primer Plano para la carpeta seleccionada */}
          {selectedFolder && (
            <button
              onClick={() => handleTogglePrimerPlano(selectedFolder)}
              title={(selectedFolder.primerPlano ?? true)
                ? 'Primer Plano: ON — el media reemplaza al slide activo'
                : 'Primer Plano: OFF — el media va de fondo; el slide activo se superpone'}
              className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors shrink-0 ${
                (selectedFolder.primerPlano ?? true)
                  ? 'bg-accent/20 text-accent border-accent/40'
                  : 'bg-surface-700 text-zinc-400 border-surface-600 hover:text-zinc-200'
              }`}
            >
              <Layers size={11} />
              Primer Plano
            </button>
          )}

          {selectedFolder && (
            <span
              className="ml-auto text-[10px] text-zinc-600 font-mono truncate max-w-xs"
              title={selectedFolder.path}
            >
              {selectedFolder.path}
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
                  : 'No hay archivos del tipo seleccionado'
                }
              </p>
            </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {filteredFiles.map(file => (
                <MediaThumb
                  key={file.path}
                  file={file}
                  isActive={file.path === activeFilePath}
                  onSend={handleSendMedia}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {showAddModal && (
        <AddFolderModal
          onAdd={handleAddFolder}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

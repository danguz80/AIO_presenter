/**
 * fsaUtils.js — File System Access API
 *
 * Permite al browser leer carpetas locales directamente (OneDrive, Finder, etc.)
 * SIN necesidad de un servidor local.
 *
 * Soporte: Chrome/Edge 86+, Safari 15.2+ (parcial), Firefox NO soportado.
 */

// ── Detección de soporte ──────────────────────────────────────────────────────
export const FSA_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// ── Nombre de la cache para servir media al OutputPage via Service Worker ─────
export const MEDIA_CACHE_NAME = 'aio-local-media';
export const MEDIA_CACHE_PREFIX = '/local-media/';

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB — almacenamiento de handles (persiste entre sesiones)
// ─────────────────────────────────────────────────────────────────────────────
const DB_NAME    = 'aio-fsa-handles';
const DB_VERSION = 1;
const STORE      = 'handles';

function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db  = await openHandleDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
  });
}

async function idbGet(key) {
  const db = await openHandleDB();
  return new Promise((res, rej) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

async function idbGetAll() {
  const db = await openHandleDB();
  return new Promise((res, rej) => {
    const result = [];
    const cursor = db.transaction(STORE).objectStore(STORE).openCursor();
    cursor.onsuccess = (e) => {
      const c = e.target.result;
      if (c) { result.push({ key: c.key, handle: c.value }); c.continue(); }
      else res(result);
    };
    cursor.onerror = () => rej(cursor.error);
  });
}

async function idbDelete(key) {
  const db = await openHandleDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = res;
    tx.onerror    = () => rej(tx.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Permisos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica (y opcionalmente solicita) permiso de lectura para un handle.
 * Debe llamarse desde un gesto del usuario (click).
 * @returns {'granted'|'denied'|'prompt'}
 */
export async function verifyPermission(handle) {
  const opts = { mode: 'read' };
  let state = await handle.queryPermission(opts);
  if (state === 'granted') return 'granted';
  state = await handle.requestPermission(opts);
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carpetas — guardar/listar/eliminar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Abre el selector de carpeta nativo del sistema operativo.
 * @returns {FileSystemDirectoryHandle}
 */
export async function pickFolder() {
  if (!FSA_SUPPORTED) throw new Error('Tu navegador no soporta acceso a archivos locales. Usa Chrome o Edge.');
  return window.showDirectoryPicker({ mode: 'read', id: 'aio-media' });
}

/** Guarda un handle de carpeta en IndexedDB */
export async function saveFolder(handle, customKey) {
  const key = customKey ?? `folder:${handle.name}:${Date.now()}`;
  await idbSet(key, { key, name: handle.name, handle });
  return key;
}

/** Lista todas las carpetas guardadas */
export async function listFolders() {
  const all = await idbGetAll();
  return all.map(({ key, handle }) => ({
    key,
    name:   handle.name,
    handle: handle.handle,
  }));
}

/** Elimina una carpeta guardada */
export async function removeFolder(key) {
  await idbDelete(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Archivos — listar contenido de una carpeta
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.ogv']);

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/**
 * Lista todos los archivos de imagen y video en el handle de carpeta.
 * @returns {Array<{name, ext, type, handle}>}
 */
export async function listMediaFiles(dirHandle) {
  const files = [];
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind !== 'file') continue;
    const ext = extOf(name);
    if (IMAGE_EXTS.has(ext)) files.push({ name, ext, type: 'image', handle: entry });
    if (VIDEO_EXTS.has(ext)) files.push({ name, ext, type: 'video', handle: entry });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// URLs de objeto — para preview/thumbnail en la ventana actual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una URL de objeto temporal para preview.
 * IMPORTANTE: llama URL.revokeObjectURL(url) cuando ya no se necesite.
 */
export async function getObjectURL(fileHandle) {
  const file = await fileHandle.getFile();
  return URL.createObjectURL(file);
}

/**
 * Genera una miniatura de un video o imagen.
 * Para videos: captura el frame en el segundo 2.
 * Para imágenes: devuelve directamente la object URL.
 * @returns {Promise<string>} URL de la miniatura (no requiere revoke, es data URL)
 */
export async function generateThumbnail(fileHandle, type) {
  const file = await fileHandle.getFile();
  const objUrl = URL.createObjectURL(file);

  if (type === 'image') {
    // Para imágenes retornamos la object URL directamente
    return objUrl; // el llamador debe revocarla
  }

  // Para videos: capturar frame con canvas
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted  = true;
    video.preload = 'metadata';
    video.src    = objUrl;

    const cleanup = () => URL.revokeObjectURL(objUrl);

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(2, video.duration * 0.1);
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = 320;
        canvas.height = Math.round(320 * video.videoHeight / (video.videoWidth || 1));
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        cleanup();
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        cleanup();
        resolve(null);
      }
    });

    video.addEventListener('error', () => { cleanup(); resolve(null); });

    // timeout por si el video no carga
    setTimeout(() => { cleanup(); resolve(null); }, 5000);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache API — para servir archivos a OutputPage via Service Worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Almacena un archivo en Cache API con la ruta /local-media/<nombre>.
 * El Service Worker intercepta estas rutas y las sirve desde la cache.
 * Esto permite que OutputPage (ventana separada) cargue el archivo.
 *
 * @returns {string} URL de la cache (/local-media/<nombre-codificado>)
 */
export async function cacheMediaFile(fileHandle) {
  const file      = await fileHandle.getFile();
  const cacheKey  = MEDIA_CACHE_PREFIX + encodeURIComponent(fileHandle.name);
  const cache     = await caches.open(MEDIA_CACHE_NAME);
  await cache.put(cacheKey, new Response(file.stream(), {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  }));
  return cacheKey;
}

/**
 * Limpia archivos de media de la cache que ya no se usan.
 * Llamar periódicamente o al desmontar el componente.
 */
export async function clearMediaCache() {
  await caches.delete(MEDIA_CACHE_NAME);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync con backend DB — carpetas compartidas entre dispositivos
// ─────────────────────────────────────────────────────────────────────────────

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Obtiene las carpetas guardadas en la BD para la organización */
export async function fetchFoldersFromDb(apiBase, token) {
  try {
    const res = await fetch(`${apiBase}/api/media/db-folders`, { headers: authHeaders(token) });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Guarda una carpeta en la BD. Devuelve { id, name } */
export async function saveFolderToDb(name, apiBase, token) {
  const res = await fetch(`${apiBase}/api/media/db-folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Error guardando carpeta en BD');
  return res.json();
}

/** Elimina una carpeta de la BD por id */
export async function removeFolderFromDb(id, apiBase, token) {
  try {
    await fetch(`${apiBase}/api/media/db-folders/${id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
  } catch (e) {
    console.warn('removeFolderFromDb error:', e);
  }
}

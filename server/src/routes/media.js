const express      = require('express');
const router       = express.Router();
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const crypto       = require('crypto');
const { execFile } = require('child_process');
const pool         = require('../config/database');

// ─── Directorios de caché persistentes en ~/.aio_presenter ─────────────────
const APP_DATA_DIR  = path.join(os.homedir(), '.aio_presenter');
const TRANSCODE_DIR = path.join(APP_DATA_DIR, 'transcoded');
const THUMB_DIR     = path.join(APP_DATA_DIR, 'thumbnails');
fs.mkdirSync(TRANSCODE_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR,     { recursive: true });

// ─── Transcoding .mov → .mp4 (avconvert nativo macOS) ───────────────────────
const transcoding = new Map();

function getTranscodedMp4(inputPath) {
  const hash    = crypto.createHash('md5').update(inputPath).digest('hex');
  const outPath = path.join(TRANSCODE_DIR, `${hash}.mp4`);

  if (fs.existsSync(outPath)) return Promise.resolve(outPath);
  if (transcoding.has(inputPath)) return transcoding.get(inputPath);

  const promise = new Promise((resolve, reject) => {
    execFile('/usr/bin/avconvert', [
      '--source', inputPath,
      '--output', outPath,
      '--preset', 'Preset1280x720',
      '--replace',
    ], (err) => {
      transcoding.delete(inputPath);
      if (err) return reject(err);
      resolve(outPath);
    });
  });

  transcoding.set(inputPath, promise);
  return promise;
}

// ─── Generación de miniaturas con qlmanage (nativo macOS) ────────────────────
const thumbGenerating = new Map();

function generateThumbnail(filePath) {
  const hash      = crypto.createHash('md5').update(filePath).digest('hex');
  const thumbPath = path.join(THUMB_DIR, `${hash}.png`);

  if (fs.existsSync(thumbPath)) return Promise.resolve(thumbPath);
  if (thumbGenerating.has(filePath)) return thumbGenerating.get(filePath);

  // qlmanage escribe <nombre.ext>.png en el directorio de salida
  // usamos un subdirectorio temporal por hash para evitar colisiones de nombre
  const tmpDir = path.join(THUMB_DIR, `tmp_${hash}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const promise = new Promise((resolve, reject) => {
    execFile('/usr/bin/qlmanage', ['-t', '-s', '320', '-o', tmpDir, filePath], () => {
      thumbGenerating.delete(filePath);
      try {
        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.png'));
        if (files.length > 0) {
          fs.renameSync(path.join(tmpDir, files[0]), thumbPath);
          fs.rmSync(tmpDir, { recursive: true, force: true });
          resolve(thumbPath);
        } else {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          reject(new Error('qlmanage no generó miniatura'));
        }
      } catch (e) { reject(e); }
    });
  });

  thumbGenerating.set(filePath, promise);
  return promise;
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.ogv']);

// ─── GET /api/media/folders — listar carpetas guardadas ──────────────────────
router.get('/folders', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'mediaFolders'"
    );
    const folders = rows.length > 0 ? rows[0].value : [];
    res.json(Array.isArray(folders) ? folders : []);
  } catch (err) {
    console.error('media/folders GET error:', err);
    res.status(500).json({ error: 'Error al obtener carpetas' });
  }
});

// ─── POST /api/media/folders — agregar carpeta ───────────────────────────────
router.post('/folders', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath || typeof folderPath !== 'string') {
    return res.status(400).json({ error: 'folderPath requerido' });
  }
  // Validar que existe y es directorio
  try {
    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'La ruta no es una carpeta' });
    }
  } catch {
    return res.status(400).json({ error: 'La carpeta no existe o no es accesible' });
  }

  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'mediaFolders'"
    );
    const current = rows.length > 0 && Array.isArray(rows[0].value) ? rows[0].value : [];
    // Evitar duplicados
    if (current.some(f => f.path === folderPath)) {
      return res.status(409).json({ error: 'La carpeta ya está en la lista' });
    }
    const name    = path.basename(folderPath);
    const updated = [...current, { name, path: folderPath }];
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('mediaFolders', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(updated)]
    );
    res.json(updated);
  } catch (err) {
    console.error('media/folders POST error:', err);
    res.status(500).json({ error: 'Error al guardar carpeta' });
  }
});

// ─── DELETE /api/media/folders — eliminar carpeta por ruta ──────────────────
router.delete('/folders', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'folderPath requerido' });
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'mediaFolders'"
    );
    const current = rows.length > 0 && Array.isArray(rows[0].value) ? rows[0].value : [];
    const updated = current.filter(f => f.path !== folderPath);
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('mediaFolders', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(updated)]
    );
    res.json(updated);
  } catch (err) {
    console.error('media/folders DELETE error:', err);
    res.status(500).json({ error: 'Error al eliminar carpeta' });
  }
});

// ─── GET /api/media/files?folder=<path> — listar archivos de una carpeta ────
router.get('/files', (req, res) => {
  const { folder } = req.query;
  if (!folder || typeof folder !== 'string') {
    return res.status(400).json({ error: 'folder requerido' });
  }
  try {
    const stat = fs.statSync(folder);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'No es una carpeta' });
    }
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile())
      .map(e => {
        const ext  = path.extname(e.name).toLowerCase();
        const type = IMAGE_EXTS.has(ext) ? 'image' : VIDEO_EXTS.has(ext) ? 'video' : null;
        return type ? { name: e.name, path: path.join(folder, e.name), type } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    res.json(files);
  } catch (err) {
    console.error('media/files GET error:', err);
    res.status(500).json({ error: 'Error al leer la carpeta' });
  }
});

// ─── GET /api/media/thumbnail?filePath=<filePath> — miniatura ───────────────
router.get('/thumbnail', async (req, res) => {
  const { filePath } = req.query;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath requerido' });
  }
  try { fs.accessSync(filePath, fs.constants.R_OK); }
  catch { return res.status(404).json({ error: 'Archivo no encontrado' }); }

  const ext = path.extname(filePath).toLowerCase();

  if (IMAGE_EXTS.has(ext)) {
    // Imágenes: servir directamente
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                   '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
                   '.svg': 'image/svg+xml' }[ext];
    if (mime) res.setHeader('Content-Type', mime);
    return res.sendFile(filePath);
  }

  if (VIDEO_EXTS.has(ext)) {
    try {
      const thumbPath = await generateThumbnail(filePath);
      res.setHeader('Content-Type', 'image/png');
      return res.sendFile(thumbPath);
    } catch (err) {
      console.error('Error generando miniatura:', err);
      return res.status(500).json({ error: 'No se pudo generar miniatura' });
    }
  }

  res.status(415).json({ error: 'Tipo no soportado' });
});

const MIME_MAP = {
  '.mp4':  'video/mp4',
  '.mov':  'video/mp4',   // QuickTime → servir como mp4 para compatibilidad con Chromium
  '.avi':  'video/x-msvideo',
  '.mkv':  'video/x-matroska',
  '.webm': 'video/webm',
  '.m4v':  'video/mp4',
  '.ogv':  'video/ogg',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.bmp':  'image/bmp',
  '.svg':  'image/svg+xml',
};

// ─── GET /api/media/serve?filePath=<filePath> — servir archivo ───────────────
router.get('/serve', async (req, res) => {
  const { filePath } = req.query;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'filePath requerido' });
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }

  const ext = path.extname(filePath).toLowerCase();

  // .mov → transcodar a mp4 con avconvert (caché en /tmp)
  if (ext === '.mov') {
    try {
      const mp4Path = await getTranscodedMp4(filePath);
      res.setHeader('Content-Type', 'video/mp4');
      return res.sendFile(mp4Path);
    } catch (err) {
      console.error('Error transcoding .mov:', err);
      // Si falla el transcoding, intentar servir el original con tipo mp4
      res.setHeader('Content-Type', 'video/mp4');
      return res.sendFile(filePath);
    }
  }

  const mime = MIME_MAP[ext];
  if (mime) res.setHeader('Content-Type', mime);
  res.sendFile(filePath);
});

// ─── PATCH /api/media/folders — actualizar primerPlano de una carpeta ────────
router.patch('/folders', async (req, res) => {
  const { folderPath, primerPlano } = req.body;
  if (!folderPath || typeof primerPlano !== 'boolean') {
    return res.status(400).json({ error: 'folderPath y primerPlano (boolean) requeridos' });
  }
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'mediaFolders'"
    );
    const current = rows.length > 0 && Array.isArray(rows[0].value) ? rows[0].value : [];
    const updated = current.map(f => f.path === folderPath ? { ...f, primerPlano } : f);
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('mediaFolders', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(updated)]
    );
    res.json(updated);
  } catch (err) {
    console.error('media/folders PATCH error:', err);
    res.status(500).json({ error: 'Error al actualizar carpeta' });
  }
});

module.exports = router;

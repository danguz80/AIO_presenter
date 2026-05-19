const multer   = require('multer');
const path     = require('path');
const { parseTxt }       = require('../utils/parsers/txtParser');
const { parseChordPro }  = require('../utils/parsers/chordproParser');
const { parseFreeShow }  = require('../utils/parsers/showParser');
const pool               = require('../config/database');

// ─── Multer: almacenamiento en memoria (sin escribir disco) ─────────────────
const ALLOWED_EXTENSIONS = new Set(['.txt', '.cho', '.chopro', '.chordpro', '.chord', '.show']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Extensión no soportada: ${ext}. Usa: ${[...ALLOWED_EXTENSIONS].join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
}).single('file');

// ─── Expande slides: cada estrofa (párrafo) → diapositiva propia ────────────
/**
 * Dado un array de { label, content }, genera un nuevo array donde
 * cada párrafo (grupo de líneas separado por línea en blanco) del content
 * se convierte en una diapositiva separada con el mismo label.
 * Si el content no tiene párrafos delimitados, se mantiene como uno solo.
 */
function expandByLines(slides) {
  const result = [];
  for (const slide of slides) {
    // Separar en párrafos por líneas en blanco
    const paragraphs = (slide.content || '')
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (paragraphs.length === 0) continue;

    for (const para of paragraphs) {
      result.push({ label: slide.label, content: para });
    }
  }
  return result.length > 0 ? result : slides;
}

// ─── Selección de parser ─────────────────────────────────────────────────────
function getParser(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.txt':
      return parseTxt;
    case '.cho':
    case '.chopro':
    case '.chordpro':
    case '.chord':
      return parseChordPro;
    case '.show':
      return parseFreeShow;
    default:
      return null;
  }
}

// ─── POST /api/import/preview ────────────────────────────────────────────────
/**
 * Parsea el archivo subido y devuelve una vista previa sin guardar en DB.
 * El cliente puede editar y luego llamar POST /api/songs para guardar.
 */
const previewImport = (req, res) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el límite de 5 MB'
        : err.message;
      return res.status(400).json({ error: msg });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const { originalname, buffer, encoding } = req.file;

    // Decodificar buffer a string (soporta UTF-8 y latin-1)
    let content;
    try {
      content = buffer.toString('utf8');
      // Detección simple de latin-1: si hay caracteres mal decodificados, intentar latin1
      if (/\uFFFD/.test(content)) {
        content = buffer.toString('latin1');
      }
    } catch {
      return res.status(400).json({ error: 'No se pudo leer el archivo' });
    }

    const parser = getParser(originalname);
    if (!parser) {
      return res.status(400).json({ error: 'Formato de archivo no soportado' });
    }

    try {
      const result = parser(content, originalname);

      // Validar que el resultado tenga al menos un slide con contenido
      if (!result.slides || result.slides.length === 0) {
        return res.status(422).json({ error: 'No se encontraron secciones con letra en el archivo' });
      }

      // Expandir: cada línea no vacía dentro de un slide = diapositiva independiente
      result.slides = expandByLines(result.slides);

      res.json({
        filename: originalname,
        format:   path.extname(originalname).replace('.', '').toLowerCase(),
        ...result,
      });
    } catch (parseErr) {
      console.error('[Import] Error al parsear:', parseErr.message);
      res.status(422).json({ error: parseErr.message || 'Error al procesar el archivo' });
    }
  });
};

// ─── POST /api/import/batch ───────────────────────────────────────────────────
// Acepta hasta 1000 archivos, los parsea y guarda directamente en DB.
// Response: { total, imported, skipped, errors: [{filename, error}] }

const uploadBatch = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
}).array('files', 1000);

const batchImport = (req, res) => {
  uploadBatch(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }

    const results = { total: req.files.length, imported: 0, skipped: 0, errors: [] };

    for (const file of req.files) {
      const { originalname, buffer } = file;
      try {
        // Decodificar
        let content = buffer.toString('utf8');
        if (/\uFFFD/.test(content)) content = buffer.toString('latin1');

        const parser = getParser(originalname);
        if (!parser) throw new Error('Formato no soportado');

        const parsed = parser(content, originalname);
        if (!parsed.slides || parsed.slides.length === 0) throw new Error('Sin secciones con letra');

        parsed.slides = expandByLines(parsed.slides);

        const { title, author, copyright, ccli } = parsed;
        if (!title) throw new Error('No se pudo detectar el título');

        // Guardar en DB (transacción)
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const songRes = await client.query(
            `INSERT INTO songs (title, author, copyright, ccli, language, tags, organization_id)
             VALUES ($1,$2,$3,$4,'es','{}', $5) RETURNING id`,
            [title, author || null, copyright || null, ccli || null, req.user.orgId]
          );
          const songId = songRes.rows[0].id;
          for (let i = 0; i < parsed.slides.length; i++) {
            const { label, content: sc } = parsed.slides[i];
            await client.query(
              'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
              [songId, label, sc, i]
            );
          }
          await client.query('COMMIT');
          results.imported++;
        } catch (dbErr) {
          await client.query('ROLLBACK');
          throw dbErr;
        } finally {
          client.release();
        }
      } catch (e) {
        results.skipped++;
        results.errors.push({ filename: originalname, error: e.message });
      }
    }

    res.json(results);
  });
};

module.exports = { previewImport, batchImport };

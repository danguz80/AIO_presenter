const multer   = require('multer');
const path     = require('path');
const { parseTxt }       = require('../utils/parsers/txtParser');
const { parseChordPro }  = require('../utils/parsers/chordproParser');
const { parseFreeShow }  = require('../utils/parsers/showParser');

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

// ─── Expande slides: cada línea de contenido → diapositiva propia ───────────
/**
 * Dado un array de { label, content }, genera un nuevo array donde
 * cada línea no vacía del content se convierte en una diapositiva separada
 * con el mismo label. Esto permite proyectar línea a línea.
 */
function expandByLines(slides) {
  const result = [];
  for (const slide of slides) {
    const lines = (slide.content || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    if (lines.length === 0) continue;
    for (const line of lines) {
      result.push({ label: slide.label, content: line });
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

module.exports = { previewImport };

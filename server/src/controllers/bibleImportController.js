/**
 * bibleImportController.js
 *
 * Handles Bible data import into the database.
 *
 * Supported JSON formats:
 *
 * Format A — "thiagobodruk/bible" (array of 66 books in canonical order):
 *   [{ "abbrev": "gn", "book": "Genesis", "chapters": [["verse1", "verse2"], ...] }, ...]
 *
 * Format B — Unified (with explicit book metadata):
 *   {
 *     "version": "RVR60",
 *     "name": "Reina-Valera 1960",
 *     "language": "es",
 *     "books": [{
 *       "number": 1, "name": "Génesis", "abbrev": "Gn", "testament": "OT",
 *       "chapters": [["verse1", "verse2"], ...]
 *     }, ...]
 *   }
 */

const multer = require('multer');
const pool   = require('../config/database');

// ─── Canonical 66-book list (used for Format A) ─────────────────────────────
const CANONICAL_BOOKS = [
  { n:  1, name:'Génesis',           abbrev:'Gn',  testament:'OT' },
  { n:  2, name:'Éxodo',             abbrev:'Ex',  testament:'OT' },
  { n:  3, name:'Levítico',          abbrev:'Lv',  testament:'OT' },
  { n:  4, name:'Números',           abbrev:'Nm',  testament:'OT' },
  { n:  5, name:'Deuteronomio',      abbrev:'Dt',  testament:'OT' },
  { n:  6, name:'Josué',             abbrev:'Jos', testament:'OT' },
  { n:  7, name:'Jueces',            abbrev:'Jue', testament:'OT' },
  { n:  8, name:'Rut',               abbrev:'Rt',  testament:'OT' },
  { n:  9, name:'1 Samuel',          abbrev:'1S',  testament:'OT' },
  { n: 10, name:'2 Samuel',          abbrev:'2S',  testament:'OT' },
  { n: 11, name:'1 Reyes',           abbrev:'1R',  testament:'OT' },
  { n: 12, name:'2 Reyes',           abbrev:'2R',  testament:'OT' },
  { n: 13, name:'1 Crónicas',        abbrev:'1Cr', testament:'OT' },
  { n: 14, name:'2 Crónicas',        abbrev:'2Cr', testament:'OT' },
  { n: 15, name:'Esdras',            abbrev:'Esd', testament:'OT' },
  { n: 16, name:'Nehemías',          abbrev:'Neh', testament:'OT' },
  { n: 17, name:'Ester',             abbrev:'Est', testament:'OT' },
  { n: 18, name:'Job',               abbrev:'Job', testament:'OT' },
  { n: 19, name:'Salmos',            abbrev:'Sal', testament:'OT' },
  { n: 20, name:'Proverbios',        abbrev:'Pr',  testament:'OT' },
  { n: 21, name:'Eclesiastés',       abbrev:'Ec',  testament:'OT' },
  { n: 22, name:'Cantares',          abbrev:'Cnt', testament:'OT' },
  { n: 23, name:'Isaías',            abbrev:'Is',  testament:'OT' },
  { n: 24, name:'Jeremías',          abbrev:'Jer', testament:'OT' },
  { n: 25, name:'Lamentaciones',     abbrev:'Lm',  testament:'OT' },
  { n: 26, name:'Ezequiel',          abbrev:'Ez',  testament:'OT' },
  { n: 27, name:'Daniel',            abbrev:'Dn',  testament:'OT' },
  { n: 28, name:'Oseas',             abbrev:'Os',  testament:'OT' },
  { n: 29, name:'Joel',              abbrev:'Jl',  testament:'OT' },
  { n: 30, name:'Amós',              abbrev:'Am',  testament:'OT' },
  { n: 31, name:'Abdías',            abbrev:'Abd', testament:'OT' },
  { n: 32, name:'Jonás',             abbrev:'Jon', testament:'OT' },
  { n: 33, name:'Miqueas',           abbrev:'Mi',  testament:'OT' },
  { n: 34, name:'Nahúm',             abbrev:'Nah', testament:'OT' },
  { n: 35, name:'Habacuc',           abbrev:'Hab', testament:'OT' },
  { n: 36, name:'Sofonías',          abbrev:'Sof', testament:'OT' },
  { n: 37, name:'Hageo',             abbrev:'Hag', testament:'OT' },
  { n: 38, name:'Zacarías',          abbrev:'Zac', testament:'OT' },
  { n: 39, name:'Malaquías',         abbrev:'Mal', testament:'OT' },
  { n: 40, name:'Mateo',             abbrev:'Mt',  testament:'NT' },
  { n: 41, name:'Marcos',            abbrev:'Mr',  testament:'NT' },
  { n: 42, name:'Lucas',             abbrev:'Lc',  testament:'NT' },
  { n: 43, name:'Juan',              abbrev:'Jn',  testament:'NT' },
  { n: 44, name:'Hechos',            abbrev:'Hch', testament:'NT' },
  { n: 45, name:'Romanos',           abbrev:'Ro',  testament:'NT' },
  { n: 46, name:'1 Corintios',       abbrev:'1Co', testament:'NT' },
  { n: 47, name:'2 Corintios',       abbrev:'2Co', testament:'NT' },
  { n: 48, name:'Gálatas',           abbrev:'Gá',  testament:'NT' },
  { n: 49, name:'Efesios',           abbrev:'Ef',  testament:'NT' },
  { n: 50, name:'Filipenses',        abbrev:'Flp', testament:'NT' },
  { n: 51, name:'Colosenses',        abbrev:'Col', testament:'NT' },
  { n: 52, name:'1 Tesalonicenses',  abbrev:'1Ts', testament:'NT' },
  { n: 53, name:'2 Tesalonicenses',  abbrev:'2Ts', testament:'NT' },
  { n: 54, name:'1 Timoteo',         abbrev:'1Ti', testament:'NT' },
  { n: 55, name:'2 Timoteo',         abbrev:'2Ti', testament:'NT' },
  { n: 56, name:'Tito',              abbrev:'Tit', testament:'NT' },
  { n: 57, name:'Filemón',           abbrev:'Flm', testament:'NT' },
  { n: 58, name:'Hebreos',           abbrev:'He',  testament:'NT' },
  { n: 59, name:'Santiago',          abbrev:'Stg', testament:'NT' },
  { n: 60, name:'1 Pedro',           abbrev:'1P',  testament:'NT' },
  { n: 61, name:'2 Pedro',           abbrev:'2P',  testament:'NT' },
  { n: 62, name:'1 Juan',            abbrev:'1Jn', testament:'NT' },
  { n: 63, name:'2 Juan',            abbrev:'2Jn', testament:'NT' },
  { n: 64, name:'3 Juan',            abbrev:'3Jn', testament:'NT' },
  { n: 65, name:'Judas',             abbrev:'Jud', testament:'NT' },
  { n: 66, name:'Apocalipsis',       abbrev:'Ap',  testament:'NT' },
];

// ─── Multer — JSON only, max 50 MB ──────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    // Validate by extension; actual JSON validity is checked after parsing
    const ok = /\.json$/i.test(file.originalname);
    cb(ok ? null : new Error('Solo se aceptan archivos .json'), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
}).single('file');

// ─── Batch-insert helper ─────────────────────────────────────────────────────
async function batchInsertVerses(client, rows) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk  = rows.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let pi = 1;
    for (const r of chunk) {
      values.push(`($${pi++},$${pi++},$${pi++},$${pi++})`);
      params.push(r.bookId, r.chapter, r.verse, r.text);
    }
    await client.query(
      `INSERT INTO bible_verses (book_id, chapter, verse, text)
       VALUES ${values.join(',')}
       ON CONFLICT (book_id, chapter, verse) DO NOTHING`,
      params
    );
  }
}

// ─── Parse raw JSON into a canonical structure ───────────────────────────────
// Returns: { books: [{ meta: {n,name,abbrev,testament}, chapters: [[str,...]] }] }
function parseJSON(raw) {
  // Format B: object with "books" array
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.books)) {
    const books = raw.books.map((b, i) => {
      const bookNumber = b.number || (i + 1);
      return {
        meta: {
          n:         bookNumber,
          name:      b.name || `Book ${i + 1}`,
          abbrev:    b.abbrev || '',
          // Use explicit testament if provided, otherwise derive from canonical book number
          testament: b.testament || (bookNumber <= 39 ? 'OT' : 'NT'),
        },
        chapters: b.chapters || [],
      };
    });
    return {
      versionOverride: raw.version ? { abbreviation: raw.version, name: raw.name || raw.version, language: raw.language || 'es' } : null,
      books,
    };
  }

  // Format A: array of 66 books (thiagobodruk/bible format, canonical order)
  // Books must be in canonical order (Genesis=1 … Revelation=66)
  if (Array.isArray(raw)) {
    const books = raw.map((srcBook, i) => ({
      meta: CANONICAL_BOOKS[i] || { n: i + 1, name: `Book ${i + 1}`, abbrev: '', testament: i < 39 ? 'OT' : 'NT' },
      chapters: srcBook.chapters || [],
    }));
    return { versionOverride: null, books };
  }

  throw new Error('Formato JSON no reconocido. Se esperaba un array (formato thiagobodruk) o un objeto con campo "books".');
}

// ─── Normalize verse text from string or object form ─────────────────────────
function normalizeVerseText(raw) {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && raw.text) return String(raw.text).trim();
  return '';
}

// ─── GET /admin/bible/versions ───────────────────────────────────────────────
const listVersions = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT bv.id, bv.abbreviation, bv.name, bv.language,
             COUNT(bb.id)::int AS book_count,
             (SELECT COUNT(*) FROM bible_verses bver2
              JOIN bible_books bb2 ON bver2.book_id = bb2.id
              WHERE bb2.version_id = bv.id)::int AS verse_count
      FROM bible_versions bv
      LEFT JOIN bible_books bb ON bb.version_id = bv.id
      GROUP BY bv.id
      ORDER BY bv.language, bv.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE /admin/bible/versions/:id ───────────────────────────────────────
const deleteVersion = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    await pool.query('DELETE FROM bible_versions WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── POST /admin/bible/import ────────────────────────────────────────────────
const importBible = (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 50 MB' : err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });

    // Version metadata from form fields
    const abbreviation = (req.body.abbreviation || '').trim().toUpperCase();
    const name         = (req.body.name         || '').trim();
    const language     = (req.body.language     || 'es').trim().toLowerCase();

    if (!abbreviation) return res.status(400).json({ error: 'El campo "abbreviation" es obligatorio' });
    if (!name)         return res.status(400).json({ error: 'El campo "name" es obligatorio' });

    // Parse JSON file
    let raw;
    try {
      const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      raw = JSON.parse(text);
    } catch {
      return res.status(422).json({ error: 'El archivo no es un JSON válido' });
    }

    let parsed;
    try {
      parsed = parseJSON(raw);
    } catch (parseErr) {
      return res.status(422).json({ error: parseErr.message });
    }

    if (!parsed.books || parsed.books.length === 0) {
      return res.status(422).json({ error: 'No se encontraron libros en el archivo' });
    }

    // Import inside a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert version
      const { rows: [version] } = await client.query(
        `INSERT INTO bible_versions (abbreviation, name, language)
         VALUES ($1, $2, $3)
         ON CONFLICT (abbreviation) DO UPDATE
           SET name = EXCLUDED.name, language = EXCLUDED.language
         RETURNING id`,
        [abbreviation, name, language]
      );
      const versionId = version.id;

      // Remove existing books/verses for this version (clean reimport)
      await client.query('DELETE FROM bible_books WHERE version_id = $1', [versionId]);

      let totalVerses = 0;
      for (const bookData of parsed.books) {
        const { meta, chapters } = bookData;

        // Insert book
        const { rows: [book] } = await client.query(
          `INSERT INTO bible_books (version_id, book_number, name, abbrev, testament)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [versionId, meta.n, meta.name, meta.abbrev || '', meta.testament || (meta.n <= 39 ? 'OT' : 'NT')]
        );
        const bookId = book.id;

        // Collect verse rows
        const verseRows = [];
        for (let ci = 0; ci < chapters.length; ci++) {
          const chapterVerses = chapters[ci];
          if (!Array.isArray(chapterVerses)) continue;
          for (let vi = 0; vi < chapterVerses.length; vi++) {
            const text = normalizeVerseText(chapterVerses[vi]);
            if (!text) continue;
            verseRows.push({ bookId, chapter: ci + 1, verse: vi + 1, text });
          }
        }

        await batchInsertVerses(client, verseRows);
        totalVerses += verseRows.length;
      }

      await client.query('COMMIT');

      res.json({
        ok:          true,
        versionId,
        abbreviation,
        name,
        booksImported:  parsed.books.length,
        versesImported: totalVerses,
      });
    } catch (dbErr) {
      await client.query('ROLLBACK');
      console.error('[BibleImport] Error DB:', dbErr.message);
      res.status(500).json({ error: dbErr.message });
    } finally {
      client.release();
    }
  });
};

module.exports = { listVersions, deleteVersion, importBible };

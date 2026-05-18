const pool = require('../config/database');

// GET /api/bible/versions
const getVersions = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bible_versions ORDER BY language, name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener versiones' });
  }
};

// GET /api/bible/:versionId/books
const getBooks = async (req, res) => {
  try {
    const { versionId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM bible_books WHERE version_id = $1 ORDER BY book_number ASC',
      [versionId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener libros' });
  }
};

// GET /api/bible/:versionId/books/:bookId/chapters
const getChapters = async (req, res) => {
  try {
    const { bookId } = req.params;
    const { rows } = await pool.query(
      'SELECT DISTINCT chapter FROM bible_verses WHERE book_id = $1 ORDER BY chapter ASC',
      [bookId]
    );
    res.json(rows.map(r => r.chapter));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener capítulos' });
  }
};

// GET /api/bible/:versionId/books/:bookId/chapters/:chapter
const getVerses = async (req, res) => {
  try {
    const { bookId, chapter } = req.params;
    const { rows } = await pool.query(
      `SELECT bv.id, bv.chapter, bv.verse, bv.text,
              bb.name as book_name, bb.abbrev as book_abbrev,
              bver.abbreviation as version
       FROM bible_verses bv
       JOIN bible_books bb ON bv.book_id = bb.id
       JOIN bible_versions bver ON bb.version_id = bver.id
       WHERE bv.book_id = $1 AND bv.chapter = $2
       ORDER BY bv.verse ASC`,
      [bookId, chapter]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener versículos' });
  }
};

// GET /api/bible/search?q=texto&versionId=1
// Soporta tanto búsqueda por texto como por referencia bíblica (ej. "Juan 3:16", "Mt 5:3-10")
const searchVerses = async (req, res) => {
  try {
    const { q, versionId } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Búsqueda mínima de 2 caracteres' });
    }

    // ── Detectar referencia bíblica: "Libro cap" o "Libro cap:ver" o "Libro cap:ver-ver"
    // Ejemplos: "Juan 3:16", "1 Co 13:4-7", "Gn 1", "Apocalipsis 22:20"
    const refMatch = q.trim().match(/^(.+?)\s+(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?$/);

    if (refMatch) {
      const bookHint  = refMatch[1];
      const chapter   = parseInt(refMatch[2], 10);
      const verseFrom = refMatch[3] ? parseInt(refMatch[3], 10) : null;
      const verseTo   = refMatch[4] ? parseInt(refMatch[4], 10) : (verseFrom !== null ? verseFrom : null);

      let refQuery = `
        SELECT bv.id, bv.chapter, bv.verse, bv.text,
               bb.name as book_name, bb.abbrev as book_abbrev,
               bver.abbreviation as version, bver.id as version_id
        FROM bible_verses bv
        JOIN bible_books bb ON bv.book_id = bb.id
        JOIN bible_versions bver ON bb.version_id = bver.id
        WHERE (bb.name ILIKE $1 OR bb.abbrev ILIKE $1)
          AND bv.chapter = $2
      `;
      // Búsqueda "starts with" para el libro: "Juan" matchea "Juan" pero no "1 Juan"
      const params = [`${bookHint}%`, chapter];

      if (verseFrom !== null) {
        params.push(verseFrom);
        params.push(verseTo);
        refQuery += ` AND bv.verse BETWEEN $${params.length - 1} AND $${params.length}`;
      }

      if (versionId) {
        params.push(parseInt(versionId, 10));
        refQuery += ` AND bver.id = $${params.length}`;
      }

      refQuery += ' ORDER BY bb.book_number, bv.chapter, bv.verse LIMIT 50';
      const { rows } = await pool.query(refQuery, params);

      // Si no hubo resultados con starts-with, intentar con contains (ej. "Cor" → "1 Corintios")
      if (rows.length === 0) {
        params[0] = `%${bookHint}%`;
        const { rows: rows2 } = await pool.query(refQuery, params);
        return res.json(rows2);
      }

      return res.json(rows);
    }

    // ── Búsqueda por texto libre
    if (q.trim().length < 3) {
      return res.status(400).json({ error: 'Búsqueda mínima de 3 caracteres' });
    }

    let textQuery = `
      SELECT bv.id, bv.chapter, bv.verse, bv.text,
             bb.name as book_name, bb.abbrev as book_abbrev,
             bver.abbreviation as version, bver.id as version_id
      FROM bible_verses bv
      JOIN bible_books bb ON bv.book_id = bb.id
      JOIN bible_versions bver ON bb.version_id = bver.id
      WHERE bv.text ILIKE $1
    `;
    const params = [`%${q}%`];

    if (versionId) {
      params.push(parseInt(versionId, 10));
      textQuery += ` AND bver.id = $${params.length}`;
    }

    textQuery += ' ORDER BY bb.book_number, bv.chapter, bv.verse LIMIT 100';
    const { rows } = await pool.query(textQuery, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en la búsqueda' });
  }
};

module.exports = { getVersions, getBooks, getChapters, getVerses, searchVerses };

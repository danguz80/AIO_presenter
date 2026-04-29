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
const searchVerses = async (req, res) => {
  try {
    const { q, versionId } = req.query;
    if (!q || q.length < 3) {
      return res.status(400).json({ error: 'Búsqueda mínima de 3 caracteres' });
    }

    let query = `
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
      params.push(versionId);
      query += ` AND bver.id = $${params.length}`;
    }

    query += ' ORDER BY bb.book_number, bv.chapter, bv.verse LIMIT 100';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error en la búsqueda' });
  }
};

module.exports = { getVersions, getBooks, getChapters, getVerses, searchVerses };

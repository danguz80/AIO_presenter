const pool = require('../config/database');

// GET /api/songs
const getAllSongs = async (req, res) => {
  try {
    const { search, tag } = req.query;
    const orgId = req.user.orgId;
    const params = [orgId];

    let query = `
      SELECT s.id, s.title, s.author, s.copyright, s.ccli, s.language, s.tags,
             s.song_key, s.bpm, s.time_sig, s.link, s.created_at
      FROM songs s
      WHERE s.organization_id = $1
    `;

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (s.title ILIKE $${params.length} OR s.author ILIKE $${params.length})`;
    }
    if (tag) {
      params.push(tag);
      query += ` AND $${params.length} = ANY(s.tags)`;
    }

    query += ' ORDER BY s.title ASC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[Songs] getAllSongs:', err.message);
    res.status(500).json({ error: 'Error al obtener canciones' });
  }
};

// GET /api/songs/:id
const getSongById = async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.orgId;
    const songResult = await pool.query(
      'SELECT * FROM songs WHERE id = $1 AND organization_id = $2',
      [id, orgId]
    );
    if (songResult.rows.length === 0) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }

    const slidesResult = await pool.query(
      'SELECT * FROM song_slides WHERE song_id = $1 ORDER BY position ASC',
      [id]
    );

    res.json({ ...songResult.rows[0], slides: slidesResult.rows });
  } catch (err) {
    console.error('[Songs] getSongById:', err.message);
    res.status(500).json({ error: 'Error al obtener canción' });
  }
};

// POST /api/songs
const createSong = async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, author, copyright, ccli, language, tags, slides, song_key, bpm, time_sig, link } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const orgId = req.user.orgId;

    await client.query('BEGIN');

    const songResult = await client.query(
      `INSERT INTO songs (title, author, copyright, ccli, language, tags, song_key, bpm, time_sig, link, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [title, author || null, copyright || null, ccli || null, language || 'es', tags || [],
       song_key || null, bpm ? parseInt(bpm) : null, time_sig || null, link || null, orgId]
    );
    const song = songResult.rows[0];

    if (slides && slides.length > 0) {
      for (let i = 0; i < slides.length; i++) {
        const { label, content, slideBackground } = slides[i];
        await client.query(
          'INSERT INTO song_slides (song_id, label, content, position, slide_background) VALUES ($1, $2, $3, $4, $5)',
          [song.id, label, content, i, slideBackground ? JSON.stringify(slideBackground) : null]
        );
      }
    }

    await client.query('COMMIT');
    const fullSong = await pool.query(
      'SELECT * FROM song_slides WHERE song_id = $1 ORDER BY position ASC',
      [song.id]
    );
    res.status(201).json({ ...song, slides: fullSong.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Songs] createSong:', err.message);
    res.status(500).json({ error: 'Error al crear canción' });
  } finally {
    client.release();
  }
};

// PUT /api/songs/:id
const updateSong = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const orgId = req.user.orgId;
    const { title, author, copyright, ccli, language, tags, slides, song_key, bpm, time_sig, link } = req.body;

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE songs SET title=$1, author=$2, copyright=$3, ccli=$4, language=$5, tags=$6,
       song_key=$7, bpm=$8, time_sig=$9, link=$10, updated_at=NOW()
       WHERE id=$11 AND organization_id=$12 RETURNING *`,
      [title, author || null, copyright || null, ccli || null, language || 'es', tags || [],
       song_key || null, bpm ? parseInt(bpm) : null, time_sig || null, link || null, id, orgId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Canción no encontrada' });
    }

    if (slides) {
      await client.query('DELETE FROM song_slides WHERE song_id = $1', [id]);
      for (let i = 0; i < slides.length; i++) {
        const { label, content, slideBackground } = slides[i];
        await client.query(
          'INSERT INTO song_slides (song_id, label, content, position, slide_background) VALUES ($1, $2, $3, $4, $5)',
          [id, label, content, i, slideBackground ? JSON.stringify(slideBackground) : null]
        );
      }
    }

    await client.query('COMMIT');
    const updatedSlides = await pool.query(
      'SELECT * FROM song_slides WHERE song_id = $1 ORDER BY position ASC',
      [id]
    );
    res.json({ ...result.rows[0], slides: updatedSlides.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Songs] updateSong:', err.message);
    res.status(500).json({ error: 'Error al actualizar canción' });
  } finally {
    client.release();
  }
};

// DELETE /api/songs/:id
const deleteSong = async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.user.orgId;
    const result = await pool.query(
      'DELETE FROM songs WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    res.json({ message: 'Canción eliminada', id: result.rows[0].id });
  } catch (err) {
    console.error('[Songs] deleteSong:', err.message);
    res.status(500).json({ error: 'Error al eliminar canción' });
  }
};

// GET /api/songs/tags
const getAllTags = async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const { rows } = await pool.query(
      `SELECT DISTINCT unnest(tags) AS tag FROM songs
       WHERE tags IS NOT NULL AND organization_id = $1 ORDER BY tag ASC`,
      [orgId]
    );
    res.json(rows.map(r => r.tag));
  } catch (err) {
    console.error('[Songs] getAllTags:', err.message);
    res.status(500).json({ error: 'Error al obtener etiquetas' });
  }
};

// PATCH /api/songs/bulk-tag
const bulkTag = async (req, res) => {
  const client = await pool.connect();
  try {
    const { ids, addTags = [], removeTags = [] } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids requerido' });
    }
    const orgId = req.user.orgId;
    await client.query('BEGIN');
    for (const id of ids) {
      if (addTags.length > 0) {
        await client.query(
          `UPDATE songs SET tags = (
             SELECT array_agg(DISTINCT t ORDER BY t)
             FROM unnest(COALESCE(tags, '{}') || $1::text[]) t
           ) WHERE id = $2 AND organization_id = $3`,
          [addTags, id, orgId]
        );
      }
      if (removeTags.length > 0) {
        await client.query(
          `UPDATE songs SET tags = (
             SELECT COALESCE(array_agg(t ORDER BY t), '{}')
             FROM unnest(COALESCE(tags, '{}')) t
             WHERE t != ALL($1::text[])
           ) WHERE id = $2 AND organization_id = $3`,
          [removeTags, id, orgId]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ updated: ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Songs] bulkTag:', err.message);
    res.status(500).json({ error: 'Error al etiquetar canciones' });
  } finally {
    client.release();
  }
};

module.exports = { getAllSongs, getSongById, createSong, updateSong, deleteSong, getAllTags, bulkTag };

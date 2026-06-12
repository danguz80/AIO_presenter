const pool = require('../config/database');

/** Fallback: si no hay JWT, usa la primera org disponible */
async function resolveOrgId(user) {
  if (user?.orgId) return user.orgId;
  const { rows } = await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 1');
  return rows[0]?.id ?? null;
}

// GET /api/songs
const getAllSongs = async (req, res) => {
  try {
    const { search, tag } = req.query;
    const orgId = await resolveOrgId(req.user);
    const params = [orgId];

    let query = `
      SELECT s.id, s.title, s.author, s.copyright, s.ccli, s.language, s.tags,
             s.song_key, s.bpm, s.time_sig, s.link, s.structure, s.created_at,
             s.updated_at, su.email AS updated_by_email, su.display_name AS updated_by_name
      FROM songs s
      LEFT JOIN sync_users su ON su.id = s.updated_by
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
    const orgId = await resolveOrgId(req.user);
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
      `INSERT INTO songs (title, author, copyright, ccli, language, tags, song_key, bpm, time_sig, link, organization_id, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [title, author || null, copyright || null, ccli || null, language || 'es', tags || [],
       song_key || null, bpm ? parseInt(bpm) : null, time_sig || null, link || null, orgId,
       req.user?.userId || null]
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
       song_key=$7, bpm=$8, time_sig=$9, link=$10, updated_at=NOW(), updated_by=$11
       WHERE id=$12 AND organization_id=$13 RETURNING *`,
      [title, author || null, copyright || null, ccli || null, language || 'es', tags || [],
       song_key || null, bpm ? parseInt(bpm) : null, time_sig || null, link || null,
       req.user?.userId || null, id, orgId]
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
    const orgId = await resolveOrgId(req.user);
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

// ─── POST /api/songs/import-demo ────────────────────────────────────────────
// Inserta 3 canciones demo en la org del usuario (solo si no existen ya).
const DEMO_SONGS = [
  {
    title: 'Santo',
    author: 'Dominio Público',
    song_key: 'G',
    tags: ['demo', 'adoración'],
    slides: [
      { label: 'Verso 1', content: 'Santo, Santo, Santo\nEs el Señor Dios Todopoderoso\nQue era, que es, y que ha de venir' },
      { label: 'Coro',    content: 'Santo, Santo, Santo\nSanto es el Señor\nToda la tierra está llena de Tu gloria' },
      { label: 'Verso 2', content: 'Digno eres Tú, Señor nuestro Dios\nDe recibir la gloria, la honra y el poder\nPorque Tú creaste todas las cosas' },
    ],
  },
  {
    title: 'Sublime Gracia',
    author: 'John Newton',
    song_key: 'D',
    tags: ['demo', 'himno'],
    slides: [
      { label: 'Verso 1', content: 'Sublime gracia del Señor\nQue a un pecador salvó\nFui ciego mas hoy veo yo\nPerdido y Él me halló' },
      { label: 'Verso 2', content: 'Su gracia me enseñó a temer\nMis dudas ahuyentó\nOh cuán precioso fue a mi ser\nCuando Él me transformó' },
      { label: 'Verso 3', content: 'En los peligros o aflicción\nQue yo he tenido aquí\nSu gracia siempre me libró\nY me guiará hasta el fin' },
      { label: 'Verso 4', content: 'Y cuando en Sión por siglos mil\nBrillando esté cual sol\nYo cantaré por siempre allí\nSu amor que me salvó' },
    ],
  },
  {
    title: 'Grande Es Tu Fidelidad',
    author: 'Thomas O. Chisholm',
    song_key: 'A',
    tags: ['demo', 'alabanza'],
    slides: [
      { label: 'Verso 1', content: 'Oh Dios eterno, Tu misericordia\nNi una sombra de duda tendrá\nTu compasión y bondad nunca fallan\nY por los siglos el mismo serás' },
      { label: 'Coro',    content: 'Grande es Tu fidelidad\nGrande es Tu fidelidad\nMañana tras mañana nuevas misericordias veré\nTodo lo necesario de Tu mano recibiré\nGrande es Tu fidelidad Señor en mí' },
      { label: 'Verso 2', content: 'Tú me has dado la dicha del cielo\nY la dulce promesa de vida eternal\nCon Tu espíritu, fuerza y esperanza\nSoy perdonado, llamado a vivir para Ti' },
    ],
  },
];

const importDemo = async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.orgId;

    // Verificar cuáles ya existen (por tag 'demo')
    const { rows: existing } = await pool.query(
      `SELECT title FROM songs WHERE organization_id = $1 AND 'demo' = ANY(tags)`,
      [orgId]
    );
    const existingTitles = new Set(existing.map(r => r.title));

    const toInsert = DEMO_SONGS.filter(s => !existingTitles.has(s.title));
    if (toInsert.length === 0) {
      return res.json({ inserted: 0, message: 'Las canciones demo ya están en tu biblioteca.' });
    }

    await client.query('BEGIN');
    const inserted = [];
    for (const song of toInsert) {
      const { rows: [s] } = await client.query(
        `INSERT INTO songs (title, author, song_key, language, tags, organization_id)
         VALUES ($1, $2, $3, 'es', $4, $5) RETURNING *`,
        [song.title, song.author, song.song_key, song.tags, orgId]
      );
      for (let i = 0; i < song.slides.length; i++) {
        const sl = song.slides[i];
        await client.query(
          `INSERT INTO song_slides (song_id, label, content, position) VALUES ($1, $2, $3, $4)`,
          [s.id, sl.label, sl.content, i]
        );
      }
      inserted.push(s);
    }
    await client.query('COMMIT');

    res.json({ inserted: inserted.length, songs: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Songs] importDemo:', err.message);
    res.status(500).json({ error: 'Error al importar canciones demo' });
  } finally {
    client.release();
  }
};

module.exports = { getAllSongs, getSongById, createSong, updateSong, deleteSong, getAllTags, bulkTag, updateStructure, importDemo };

// PATCH /api/songs/:id/structure
async function updateStructure(req, res) {
  const { id } = req.params;
  const orgId = req.user.orgId;
  const { structure, structures } = req.body;
  if (!Array.isArray(structure)) return res.status(400).json({ error: 'structure debe ser un array' });
  const structuresToSave = Array.isArray(structures) ? structures : [];
  try {
    const { rows } = await pool.query(
      `UPDATE songs SET structure = $1, structures = $2, updated_at = NOW()
         WHERE id = $3 AND organization_id = $4
         RETURNING id, structure, structures`,
      [structure, JSON.stringify(structuresToSave), id, orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Canción no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Songs] updateStructure:', err.message);
    res.status(500).json({ error: 'Error al guardar estructura' });
  }
}

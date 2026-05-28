const pool = require('../config/database');

// GET /api/songs/:id/annotations  — devuelve las anotaciones del usuario autenticado
const getAnnotations = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT data FROM song_annotations WHERE song_id = $1 AND user_id = $2',
      [id, userId]
    );
    res.json({ data: rows[0]?.data ?? [] });
  } catch (err) {
    console.error('getAnnotations:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

// PUT /api/songs/:id/annotations  — guarda (upsert) las anotaciones del usuario
const upsertAnnotations = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const { id } = req.params;
    const { data } = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: 'data debe ser un array' });

    const { rows } = await pool.query(
      `INSERT INTO song_annotations (song_id, user_id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (song_id, user_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
       RETURNING data`,
      [id, userId, JSON.stringify(data)]
    );
    res.json({ data: rows[0].data });
  } catch (err) {
    console.error('upsertAnnotations:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

module.exports = { getAnnotations, upsertAnnotations };

const pool = require('../config/database');

// GET /api/events/:id/plays?occurrence_date=YYYY-MM-DD
// Devuelve las canciones marcadas como tocadas para un evento/ocurrencia
async function getPlays(req, res) {
  try {
    const { id } = req.params;
    const { occurrence_date } = req.query;
    const { rows } = await pool.query(
      `SELECT esp.*, s.title, s.author
       FROM event_song_plays esp
       JOIN songs s ON s.id = esp.song_id
       WHERE esp.event_id = $1
         AND (($2::date IS NULL AND esp.occurrence_date IS NULL)
              OR esp.occurrence_date = $2::date)
       ORDER BY esp.played_at ASC`,
      [id, occurrence_date || null]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Plays] getPlays:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// POST /api/events/:id/plays
// Body: { song_id, occurrence_date, slides_shown, total_slides, manual }
// Usa UPSERT para actualizar si ya existe (puede volver a tocarse con más diapositivas)
async function upsertPlay(req, res) {
  try {
    const { id } = req.params;
    const { song_id, occurrence_date = null, slides_shown = 0, total_slides = 0, manual = false } = req.body;
    if (!song_id) return res.status(400).json({ error: 'song_id requerido' });

    const { rows } = await pool.query(
      `INSERT INTO event_song_plays (event_id, occurrence_date, song_id, played_at, slides_shown, total_slides, manual)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6)
       ON CONFLICT (event_id, occurrence_date, song_id)
       DO UPDATE SET played_at    = NOW(),
                     slides_shown = GREATEST(event_song_plays.slides_shown, EXCLUDED.slides_shown),
                     total_slides = EXCLUDED.total_slides,
                     manual       = event_song_plays.manual OR EXCLUDED.manual
       RETURNING *`,
      [id, occurrence_date, song_id, slides_shown, total_slides, manual]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Plays] upsertPlay:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/events/:id/plays/:song_id?occurrence_date=YYYY-MM-DD
// Permite desmarcar una canción como tocada
async function deletePlay(req, res) {
  try {
    const { id, song_id } = req.params;
    const { occurrence_date } = req.query;
    await pool.query(
      `DELETE FROM event_song_plays
       WHERE event_id = $1 AND song_id = $2
         AND (($3::date IS NULL AND occurrence_date IS NULL) OR occurrence_date = $3::date)`,
      [id, song_id, occurrence_date || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Plays] deletePlay:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/event-plays/history?event_id=&limit=50
// Historial global de reproducciones (para consultar después)
async function getHistory(req, res) {
  try {
    const { event_id, limit = 50 } = req.query;
    let query = `
      SELECT esp.*, s.title, s.author, e.title AS event_title, e.date AS event_date
      FROM event_song_plays esp
      JOIN songs s ON s.id = esp.song_id
      JOIN events e ON e.id = esp.event_id
    `;
    const params = [];
    if (event_id) {
      params.push(event_id);
      query += ` WHERE esp.event_id = $${params.length}`;
    }
    params.push(parseInt(limit));
    query += ` ORDER BY esp.played_at DESC LIMIT $${params.length}`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[Plays] getHistory:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getPlays, upsertPlay, deletePlay, getHistory };

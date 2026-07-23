const pool = require('../config/database');

function parseMonthToDate(monthStr, end = false) {
  if (!/^\d{4}-\d{2}$/.test(String(monthStr || ''))) return null;
  const [y, m] = String(monthStr).split('-').map(Number);
  if (m < 1 || m > 12) return null;
  if (!end) return `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

async function addSongHistoryEntry({ orgId, songId, playedOn, source = 'auto', userId = null }) {
  if (!orgId || !songId || !playedOn) return;
  await pool.query(
    `INSERT INTO song_play_history (organization_id, song_id, played_on, source, created_by)
     VALUES ($1, $2, $3::date, $4, $5)
     ON CONFLICT (organization_id, song_id, played_on)
     DO UPDATE SET source = CASE
       WHEN song_play_history.source = 'manual' OR EXCLUDED.source = 'manual' THEN 'manual'
       ELSE song_play_history.source
     END`,
    [orgId, songId, playedOn, source, userId]
  );
}

async function getSongRecentHistory(req, res) {
  try {
    const orgId = req.user.orgId;
    const songId = Number(req.params.songId);
    const limit = Math.max(1, Math.min(10, Number(req.query.limit || 3)));
    if (!songId) return res.status(400).json({ error: 'songId inválido' });

    const { rows } = await pool.query(
      `SELECT id, song_id, played_on, source, created_at
       FROM song_play_history
       WHERE organization_id = $1 AND song_id = $2
       ORDER BY played_on DESC, id DESC
       LIMIT $3`,
      [orgId, songId, limit]
    );

    res.json(rows);
  } catch (err) {
    console.error('[SongHistory] getSongRecentHistory:', err.message);
    res.status(500).json({ error: 'Error al obtener historial de canción' });
  }
}

async function deleteSongHistoryEntry(req, res) {
  try {
    const orgId = req.user.orgId;
    const entryId = Number(req.params.id);
    if (!entryId) return res.status(400).json({ error: 'id inválido' });

    const { rowCount } = await pool.query(
      'DELETE FROM song_play_history WHERE id = $1 AND organization_id = $2',
      [entryId, orgId]
    );

    if (!rowCount) return res.status(404).json({ error: 'Entrada no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[SongHistory] deleteSongHistoryEntry:', err.message);
    res.status(500).json({ error: 'Error al eliminar fecha del historial' });
  }
}

async function getSongHistoryReport(req, res) {
  try {
    const orgId = req.user.orgId;
    const mode = String(req.query.mode || 'all');
    let startDate = null;
    let endDate = null;

    if (mode === 'year') {
      const year = Number(req.query.year);
      if (!year || year < 2000 || year > 2100) return res.status(400).json({ error: 'year inválido' });
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    } else if (mode === 'month') {
      const month = String(req.query.month || '');
      startDate = parseMonthToDate(month, false);
      endDate = parseMonthToDate(month, true);
      if (!startDate || !endDate) return res.status(400).json({ error: 'month inválido (YYYY-MM)' });
    } else if (mode === 'range') {
      const from = parseMonthToDate(String(req.query.from || ''), false);
      const to = parseMonthToDate(String(req.query.to || ''), true);
      if (!from || !to) return res.status(400).json({ error: 'rango inválido (from/to en YYYY-MM)' });
      if (from > to) return res.status(400).json({ error: 'from no puede ser mayor que to' });
      startDate = from;
      endDate = to;
    }

    const params = [orgId];
    let whereDate = '';
    if (startDate && endDate) {
      params.push(startDate, endDate);
      whereDate = ` AND h.played_on BETWEEN $2::date AND $3::date`;
    }

    const query = `
      SELECT
        s.id AS song_id,
        s.title,
        s.author,
        COUNT(h.id)::int AS plays_count,
        MIN(h.played_on) AS first_played_on,
        MAX(h.played_on) AS last_played_on,
        ARRAY_AGG(TO_CHAR(h.played_on, 'YYYY-MM-DD') ORDER BY h.played_on DESC) AS played_dates
      FROM song_play_history h
      JOIN songs s ON s.id = h.song_id
      WHERE h.organization_id = $1
      ${whereDate}
      GROUP BY s.id, s.title, s.author
      ORDER BY LOWER(s.title) ASC
    `;

    const { rows } = await pool.query(query, params);

    const yearsRes = await pool.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM played_on)::int AS year
       FROM song_play_history
       WHERE organization_id = $1
       ORDER BY year DESC`,
      [orgId]
    );

    res.json({
      rows,
      years: yearsRes.rows.map(r => r.year),
      filter: { mode, startDate, endDate },
    });
  } catch (err) {
    console.error('[SongHistory] getSongHistoryReport:', err.message);
    res.status(500).json({ error: 'Error al obtener reporte de historial' });
  }
}

module.exports = {
  addSongHistoryEntry,
  getSongRecentHistory,
  deleteSongHistoryEntry,
  getSongHistoryReport,
};

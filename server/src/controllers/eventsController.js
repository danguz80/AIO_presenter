const pool = require('../config/database');

/**
 * Genera todas las fechas de un evento recurrente dentro del rango [start, end].
 */
function expandRecurring(baseDate, recurrence, recurEnd, start, end) {
  const dates = [];
  let current = new Date(baseDate + 'T00:00:00');
  const startBound = new Date(start + 'T00:00:00');
  const endBound   = recurEnd
    ? new Date(Math.min(new Date(recurEnd + 'T00:00:00'), new Date(end + 'T00:00:00')))
    : new Date(end + 'T00:00:00');

  while (current <= endBound) {
    if (current >= startBound) {
      dates.push(current.toISOString().split('T')[0]);
    }
    if (recurrence === 'weekly')        current.setDate(current.getDate() + 7);
    else if (recurrence === 'biweekly') current.setDate(current.getDate() + 14);
    else if (recurrence === 'monthly')  current.setMonth(current.getMonth() + 1);
    else break;
  }
  return dates;
}

// GET /api/events?start=YYYY-MM-DD&end=YYYY-MM-DD
async function getEvents(req, res) {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'Parámetros start y end requeridos' });

  const songSelect = `
    COALESCE(
      json_agg(
        json_build_object(
          'id', es.id,
          'song_id', es.song_id,
          'position', es.position,
          'notes', es.notes,
          'title', s.title,
          'author', s.author,
          'song_key', s.song_key
        ) ORDER BY es.position
      ) FILTER (WHERE es.id IS NOT NULL),
      '[]'
    ) AS songs
  `;

  try {
    // Eventos no recurrentes (occurrence_date siempre NULL para estos)
    const { rows: single } = await pool.query(
      `SELECT e.*, ${songSelect}
       FROM events e
       LEFT JOIN event_songs es ON es.event_id = e.id AND es.occurrence_date IS NULL
       LEFT JOIN songs s ON s.id = es.song_id
       WHERE e.is_recurring = false AND e.date BETWEEN $1 AND $2
       GROUP BY e.id
       ORDER BY e.date, e.time`,
      [start, end]
    );

    // Eventos recurrentes (solo metadatos, sin canciones)
    const { rows: recurring } = await pool.query(
      `SELECT e.* FROM events e
       WHERE e.is_recurring = true
         AND e.date <= $2
         AND (e.recur_end IS NULL OR e.recur_end >= $1)`,
      [start, end]
    );

    // Canciones de recurrentes agrupadas por (event_id, occurrence_date)
    let recurSongMap = {};
    if (recurring.length > 0) {
      const { rows: rs } = await pool.query(
        `SELECT es.event_id, es.occurrence_date::text AS occ_date,
           COALESCE(
             json_agg(
               json_build_object('id', es.id, 'song_id', es.song_id, 'position', es.position,
                                 'notes', es.notes, 'title', s.title, 'author', s.author,
                                 'song_key', s.song_key)
               ORDER BY es.position
             ) FILTER (WHERE es.id IS NOT NULL),
             '[]'
           ) AS songs
         FROM event_songs es
         LEFT JOIN songs s ON s.id = es.song_id
         WHERE es.event_id = ANY($1::int[])
         GROUP BY es.event_id, es.occurrence_date`,
        [recurring.map(e => e.id)]
      );
      for (const row of rs) {
        if (!recurSongMap[row.event_id]) recurSongMap[row.event_id] = {};
        recurSongMap[row.event_id][row.occ_date || '__base__'] = row.songs;
      }
    }

    // Expandir recurrentes: cada fecha obtiene sus canciones propias o las base
    const expanded = [];
    for (const ev of recurring) {
      const baseDateStr = ev.date instanceof Date
        ? ev.date.toISOString().split('T')[0]
        : String(ev.date).split('T')[0];
      const recurEndStr = ev.recur_end
        ? (ev.recur_end instanceof Date ? ev.recur_end.toISOString().split('T')[0] : String(ev.recur_end).split('T')[0])
        : null;
      const dates = expandRecurring(baseDateStr, ev.recurrence, recurEndStr, start, end);
      const evMap = recurSongMap[ev.id] || {};
      for (const d of dates) {
        const songs = evMap[d] || evMap['__base__'] || [];
        expanded.push({ ...ev, date: d, base_date: baseDateStr, songs });
      }
    }

    const all = [...single, ...expanded].sort((a, b) => {
      const da = String(a.date).split('T')[0];
      const db = String(b.date).split('T')[0];
      return da.localeCompare(db) || (a.time || '').localeCompare(b.time || '');
    });

    res.json(all);
  } catch (err) {
    console.error('[Events] getEvents:', err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/events/:id
async function getEventById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT e.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', es.id, 'song_id', es.song_id, 'position', es.position,
              'notes', es.notes, 'title', s.title, 'author', s.author
            ) ORDER BY es.position
          ) FILTER (WHERE es.id IS NOT NULL),
          '[]'
        ) AS songs
       FROM events e
       LEFT JOIN event_songs es ON es.event_id = e.id
       LEFT JOIN songs s ON s.id = es.song_id
       WHERE e.id = $1
       GROUP BY e.id`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/events
async function createEvent(req, res) {
  const { title, date, time, description, is_recurring, recurrence, recur_end, songs = [] } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'title y date son requeridos' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO events (title, date, time, description, is_recurring, recurrence, recur_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, date, time || null, description || null, is_recurring || false, recurrence || null, recur_end || null]
    );
    const event = rows[0];
    for (let i = 0; i < songs.length; i++) {
      await client.query(
        `INSERT INTO event_songs (event_id, song_id, position, notes) VALUES ($1, $2, $3, $4)`,
        [event.id, songs[i].song_id, i, songs[i].notes || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(event);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

// PUT /api/events/:id
async function updateEvent(req, res) {
  const { id } = req.params;
  const { title, date, time, description, is_recurring, recurrence, recur_end, songs, occurrence_date } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE events
       SET title=$1, date=$2, time=$3, description=$4, is_recurring=$5,
           recurrence=$6, recur_end=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [title, date, time || null, description || null, is_recurring, recurrence || null, recur_end || null, id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Evento no encontrado' });
    }
    if (Array.isArray(songs)) {
      if (occurrence_date) {
        // Solo actualizar canciones para esta ocurrencia específica
        await client.query(
          'DELETE FROM event_songs WHERE event_id=$1 AND occurrence_date=$2',
          [id, occurrence_date]
        );
        for (let i = 0; i < songs.length; i++) {
          await client.query(
            `INSERT INTO event_songs (event_id, song_id, position, notes, occurrence_date) VALUES ($1, $2, $3, $4, $5)`,
            [id, songs[i].song_id, i, songs[i].notes || null, occurrence_date]
          );
        }
      } else {
        // Evento no recurrente: canciones sin occurrence_date
        await client.query('DELETE FROM event_songs WHERE event_id=$1 AND occurrence_date IS NULL', [id]);
        for (let i = 0; i < songs.length; i++) {
          await client.query(
            `INSERT INTO event_songs (event_id, song_id, position, notes) VALUES ($1, $2, $3, $4)`,
            [id, songs[i].song_id, i, songs[i].notes || null]
          );
        }
      }
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

// DELETE /api/events/:id
async function deleteEvent(req, res) {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM events WHERE id=$1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getEvents, getEventById, createEvent, updateEvent, deleteEvent };

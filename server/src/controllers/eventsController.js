const pool = require('../config/database');

/**
 * Devuelve el orgId del usuario autenticado, o el id de la primera org
 * si la petición es anónima (sin JWT). Permite acceso de lectura sin login.
 */
async function resolveOrgId(user) {
  if (user?.orgId) return user.orgId;
  const { rows } = await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 1');
  return rows[0]?.id ?? null;
}

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
  const orgId = await resolveOrgId(req.user);

  const songSelect = `
    COALESCE(
      json_agg(
        json_build_object(
          'id', es.id,
          'song_id', es.song_id,
          'position', es.position,
          'notes', es.notes,
          'item_type', es.item_type,
          'separator_label', es.separator_label,
          'separator_color', es.separator_color,
          'media_name', es.media_name,
          'media_type', es.media_type,
          'title', s.title,
          'author', s.author,
          'song_key', s.song_key,
          'tags', s.tags
        ) ORDER BY es.position
      ) FILTER (WHERE es.id IS NOT NULL),
      '[]'
    ) AS songs
  `;

  try {
    // Eventos no recurrentes
    const { rows: single } = await pool.query(
      `SELECT e.*, ${songSelect}
       FROM events e
       LEFT JOIN event_songs es ON es.event_id = e.id AND es.occurrence_date IS NULL
       LEFT JOIN songs s ON s.id = es.song_id
       WHERE e.is_recurring = false AND e.date BETWEEN $1 AND $2 AND e.organization_id = $3
       GROUP BY e.id
       ORDER BY e.date, e.time`,
      [start, end, orgId]
    );

    // Eventos recurrentes
    const { rows: recurring } = await pool.query(
      `SELECT e.* FROM events e
       WHERE e.is_recurring = true
         AND e.date <= $1
         AND (e.recur_end IS NULL OR e.recur_end >= $2)
         AND e.organization_id = $3`,
      [end, start, orgId]
    );

    // Canciones de recurrentes agrupadas por (event_id, occurrence_date)
    let recurSongMap = {};
    if (recurring.length > 0) {
      const { rows: rs } = await pool.query(
        `SELECT es.event_id, es.occurrence_date::text AS occ_date,
           COALESCE(
             json_agg(
               json_build_object('id', es.id, 'song_id', es.song_id, 'position', es.position,
                                 'notes', es.notes, 'item_type', es.item_type,
                                 'separator_label', es.separator_label,
                                 'separator_color', es.separator_color,
                                 'media_name', es.media_name, 'media_type', es.media_type,
                                 'title', s.title, 'author', s.author,
                                 'song_key', s.song_key, 'tags', s.tags)
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
  const orgId = await resolveOrgId(req.user);
  try {
    const { rows } = await pool.query(
      `SELECT e.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', es.id, 'song_id', es.song_id, 'position', es.position,
              'notes', es.notes, 'title', s.title, 'author', s.author,
              'item_type', es.item_type, 'separator_label', es.separator_label,
              'separator_color', es.separator_color,
              'media_name', es.media_name, 'media_type', es.media_type,
              'song_key', s.song_key, 'tags', s.tags
            ) ORDER BY es.position
          ) FILTER (WHERE es.id IS NOT NULL),
          '[]'
        ) AS songs
       FROM events e
       LEFT JOIN event_songs es ON es.event_id = e.id
       LEFT JOIN songs s ON s.id = es.song_id
       WHERE e.id = $1 AND e.organization_id = $2
       GROUP BY e.id`,
      [id, orgId]
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
  const orgId = req.user.orgId;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO events (title, date, time, description, is_recurring, recurrence, recur_end, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, date, time || null, description || null, is_recurring || false, recurrence || null, recur_end || null, orgId]
    );
    const event = rows[0];
    for (let i = 0; i < songs.length; i++) {
      const item = songs[i];
      if (item.item_type === 'separator') {
        await client.query(
          `INSERT INTO event_songs (event_id, song_id, item_type, separator_label, separator_color, position, notes)
           VALUES ($1, NULL, 'separator', $2, $3, $4, $5)`,
          [event.id, item.separator_label || '', item.separator_color || '#6366f1', i, item.notes || null]
        );
      } else if (item.item_type === 'media') {
        await client.query(
          `INSERT INTO event_songs (event_id, song_id, item_type, media_name, media_type, position, notes)
           VALUES ($1, NULL, 'media', $2, $3, $4, $5)`,
          [event.id, item.media_name || '', item.media_type || '', i, item.notes || null]
        );
      } else {
        await client.query(
          `INSERT INTO event_songs (event_id, song_id, item_type, position, notes) VALUES ($1, $2, 'song', $3, $4)`,
          [event.id, item.song_id, i, item.notes || null]
        );
      }
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
  const orgId = req.user.orgId;
  const { title, date, time, description, is_recurring, recurrence, recur_end, songs, occurrence_date } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE events
       SET title=$1, date=$2, time=$3, description=$4, is_recurring=$5,
           recurrence=$6, recur_end=$7, updated_at=NOW()
       WHERE id=$8 AND organization_id=$9 RETURNING *`,
      [title, date, time || null, description || null, is_recurring, recurrence || null, recur_end || null, id, orgId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Evento no encontrado' });
    }
    if (Array.isArray(songs)) {
      if (occurrence_date) {
        await client.query(
          'DELETE FROM event_songs WHERE event_id=$1 AND occurrence_date=$2',
          [id, occurrence_date]
        );
        for (let i = 0; i < songs.length; i++) {
          const item = songs[i];
          if (item.item_type === 'separator') {
            await client.query(
              `INSERT INTO event_songs (event_id, song_id, item_type, separator_label, separator_color, position, notes, occurrence_date)
               VALUES ($1, NULL, 'separator', $2, $3, $4, $5, $6)`,
              [id, item.separator_label || '', item.separator_color || '#6366f1', i, item.notes || null, occurrence_date]
            );
          } else if (item.item_type === 'media') {
            await client.query(
              `INSERT INTO event_songs (event_id, song_id, item_type, media_name, media_type, position, notes, occurrence_date)
               VALUES ($1, NULL, 'media', $2, $3, $4, $5, $6)`,
              [id, item.media_name || '', item.media_type || '', i, item.notes || null, occurrence_date]
            );
          } else {
            await client.query(
              `INSERT INTO event_songs (event_id, song_id, item_type, position, notes, occurrence_date) VALUES ($1, $2, 'song', $3, $4, $5)`,
              [id, item.song_id, i, item.notes || null, occurrence_date]
            );
          }
        }
      } else {
        await client.query('DELETE FROM event_songs WHERE event_id=$1 AND occurrence_date IS NULL', [id]);
        for (let i = 0; i < songs.length; i++) {
          const item = songs[i];
          if (item.item_type === 'separator') {
            await client.query(
              `INSERT INTO event_songs (event_id, song_id, item_type, separator_label, separator_color, position, notes)
               VALUES ($1, NULL, 'separator', $2, $3, $4, $5)`,
              [id, item.separator_label || '', item.separator_color || '#6366f1', i, item.notes || null]
            );
          } else if (item.item_type === 'media') {
            await client.query(
              `INSERT INTO event_songs (event_id, song_id, item_type, media_name, media_type, position, notes)
               VALUES ($1, NULL, 'media', $2, $3, $4, $5)`,
              [id, item.media_name || '', item.media_type || '', i, item.notes || null]
            );
          } else {
            await client.query(
              `INSERT INTO event_songs (event_id, song_id, item_type, position, notes) VALUES ($1, $2, 'song', $3, $4)`,
              [id, item.song_id, i, item.notes || null]
            );
          }
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
  const orgId = req.user.orgId;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM events WHERE id=$1 AND organization_id=$2',
      [id, orgId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/events/:id/publish — publicar evento y crear notificaciones
async function publishEvent(req, res) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins pueden publicar eventos' });
  const { id } = req.params;
  const orgId  = req.user.orgId;
  try {
    // Marcar como publicado
    const { rows } = await pool.query(
      `UPDATE events
          SET is_published = true, published_at = NOW()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, title, date, is_published, published_at`,
      [id, orgId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Evento no encontrado' });
    const event = rows[0];

    // Obtener todos los miembros de la org
    const { rows: members } = await pool.query(
      `SELECT u.id, u.instruments
         FROM user_organizations uo
         JOIN sync_users u ON u.id = uo.user_id
        WHERE uo.organization_id = $1`,
      [orgId]
    );

    // Obtener la primera configuración de banda activa (si existe)
    const { rows: bandSlots } = await pool.query(
      `SELECT slots FROM band_configs WHERE organization_id = $1 ORDER BY position ASC LIMIT 1`,
      [orgId]
    );
    const slotsMap = {};
    if (bandSlots.length > 0 && Array.isArray(bandSlots[0].slots)) {
      for (const slot of bandSlots[0].slots) {
        if (slot.userId) slotsMap[slot.userId] = slot.instrument || '';
      }
    }

    // Calcular dateStr de forma robusta
    const dateStr = event.date instanceof Date
      ? event.date.toISOString().slice(0, 10)
      : String(event.date).slice(0, 10);

    // Crear notificación para cada miembro
    // body solo incluye instrumento; la fecha se muestra en el frontend desde metadata.date
    for (const member of members) {
      const instrument = slotsMap[member.id] || (member.instruments?.[0] ?? '');
      const body = instrument ? `Tu instrumento: ${instrument}` : null;
      await pool.query(
        `INSERT INTO notifications (user_id, organization_id, type, title, body, metadata)
         VALUES ($1, $2, 'event_published', $3, $4, $5)`,
        [
          member.id, orgId,
          `Nuevo evento: ${event.title}`,
          body,
          JSON.stringify({ event_id: event.id, date: dateStr, instrument }),
        ]
      );
    }

    // Emitir via socket a todos los de la org
    const io = req.app.get('io');
    if (io) {
      io.to(`org:${orgId}`).emit('notification:new', {
        type:  'event_published',
        title: `Nuevo evento: ${event.title}`,
        date:  dateStr,
        eventId: event.id,
      });
    }

    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getEvents, getEventById, createEvent, updateEvent, deleteEvent, publishEvent };

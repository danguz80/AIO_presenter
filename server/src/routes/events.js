const express = require('express');
const router = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  publishEvent,
  unpublishEvent,
} = require('../controllers/eventsController');

// Lectura: auth opcional (fallback a primera org si no hay token)
// Escritura: requiere JWT
router.get('/',                optionalAuth, getEvents);
router.get('/:id',             optionalAuth, getEventById);
router.post('/',               requireAuth,  createEvent);
router.put('/:id',             requireAuth,  updateEvent);
router.delete('/:id',          requireAuth,  deleteEvent);
router.post('/:id/publish',    requireAuth,  publishEvent);
router.post('/:id/unpublish',  requireAuth,  unpublishEvent);

function toDateStr(v) {
  return String(v || '').slice(0, 10);
}

function parseTimeSig(value) {
  const m = String(value || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return { num: 4, den: 4 };
  const num = Math.max(1, Math.min(32, Number(m[1]) || 4));
  const den = Number(m[2]) || 4;
  const validDen = [1, 2, 4, 8, 16, 32].includes(den) ? den : 4;
  return { num, den: validDen };
}

function encodeVlq(value) {
  let v = Math.max(0, value | 0);
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return Buffer.from(bytes);
}

function buildTrackChunk(events) {
  const chunks = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - lastTick);
    lastTick = ev.tick;
    chunks.push(encodeVlq(delta));
    chunks.push(ev.data);
  }
  const endOfTrack = Buffer.concat([encodeVlq(0), Buffer.from([0xff, 0x2f, 0x00])]);
  const trackData = Buffer.concat([...chunks, endOfTrack]);

  const trackHeader = Buffer.alloc(8);
  trackHeader.write('MTrk', 0, 'ascii');
  trackHeader.writeUInt32BE(trackData.length, 4);
  return Buffer.concat([trackHeader, trackData]);
}

function buildMidi(globalEvents, songTracks = [], ticksPerQuarter = 480) {
  const header = Buffer.alloc(14);
  header.write('MThd', 0, 'ascii');
  header.writeUInt32BE(6, 4);
  header.writeUInt16BE(1, 8); // format 1
  header.writeUInt16BE(1 + songTracks.length, 10);
  header.writeUInt16BE(ticksPerQuarter, 12);

  const globalTrack = buildTrackChunk(globalEvents);
  const otherTracks = songTracks.map((evs) => buildTrackChunk(evs));

  return Buffer.concat([header, globalTrack, ...otherTracks]);
}

function tempoMeta(bpm) {
  const safeBpm = Math.max(20, Math.min(400, Number(bpm) || 120));
  const usPerQuarter = Math.round(60000000 / safeBpm);
  return Buffer.from([
    0xff, 0x51, 0x03,
    (usPerQuarter >> 16) & 0xff,
    (usPerQuarter >> 8) & 0xff,
    usPerQuarter & 0xff,
  ]);
}

function timeSigMeta(num, den) {
  const denPow = Math.log2(den);
  const nn = Math.max(1, Math.min(32, num | 0));
  const dd = Number.isFinite(denPow) ? Math.max(0, Math.min(7, denPow | 0)) : 2;
  return Buffer.from([0xff, 0x58, 0x04, nn, dd, 24, 8]);
}

function markerMeta(text) {
  const raw = Buffer.from(String(text || 'Cancion'), 'utf8');
  const payload = raw.length > 120 ? raw.subarray(0, 120) : raw;
  return Buffer.concat([Buffer.from([0xff, 0x06]), encodeVlq(payload.length), payload]);
}

function trackNameMeta(text) {
  const raw = Buffer.from(String(text || 'AIO Presenter Export'), 'utf8');
  const payload = raw.length > 120 ? raw.subarray(0, 120) : raw;
  return Buffer.concat([Buffer.from([0xff, 0x03]), encodeVlq(payload.length), payload]);
}

// GET /api/events/:id/ableton-session?occurrence_date=YYYY-MM-DD&bars=4
// Exporta un MIDI con cambios de tempo/compas por cancion, importable en Ableton Live.
router.get('/:id/ableton-session', requireAuth, async (req, res) => {
  const pool = require('../config/database');
  const orgId = req.user.orgId;
  const eventId = Number(req.params.id);
  const occurrenceDate = req.query.occurrence_date ? toDateStr(req.query.occurrence_date) : null;
  const barsPerSong = Math.max(1, Math.min(64, Number(req.query.bars) || 4));

  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'ID de evento invalido' });

  try {
    const { rows: evRows } = await pool.query(
      `SELECT id, title, date, is_recurring
         FROM events
        WHERE id = $1 AND organization_id = $2`,
      [eventId, orgId]
    );
    if (!evRows.length) return res.status(404).json({ error: 'Evento no encontrado' });
    const ev = evRows[0];

    const querySongs = async (occDateOrNull) => {
      const q = occDateOrNull
        ? `SELECT es.position, es.item_type, es.song_id,
                  COALESCE(es.separator_label, '') AS separator_label,
                  COALESCE(s.title, 'Cancion') AS title,
                  s.bpm, s.time_sig
             FROM event_songs es
             LEFT JOIN songs s ON s.id = es.song_id
            WHERE es.event_id = $1 AND es.occurrence_date = $2
            ORDER BY es.position`
        : `SELECT es.position, es.item_type, es.song_id,
                  COALESCE(es.separator_label, '') AS separator_label,
                  COALESCE(s.title, 'Cancion') AS title,
                  s.bpm, s.time_sig
             FROM event_songs es
             LEFT JOIN songs s ON s.id = es.song_id
            WHERE es.event_id = $1 AND es.occurrence_date IS NULL
            ORDER BY es.position`;
      const params = occDateOrNull ? [eventId, occDateOrNull] : [eventId];
      const { rows } = await pool.query(q, params);
      return rows;
    };

    let items = occurrenceDate && ev.is_recurring
      ? await querySongs(occurrenceDate)
      : await querySongs(null);

    if ((!items || items.length === 0) && occurrenceDate && ev.is_recurring) {
      items = await querySongs(null);
    }

    const songItems = (items || []).filter(i => i.item_type === 'song' && i.song_id);
    if (!songItems.length) {
      return res.status(400).json({ error: 'El evento no tiene canciones para exportar' });
    }

    const tpq = 480;
    const events = [];
    const songTracks = [];
    let tick = 0;
    events.push({ tick: 0, data: trackNameMeta(`AIO Session - ${ev.title || 'Evento'}`) });

    for (let idx = 0; idx < songItems.length; idx++) {
      const song = songItems[idx];
      const bpm = Number(song.bpm) || 120;
      const { num, den } = parseTimeSig(song.time_sig);
      const title = `${idx + 1}. ${song.title || 'Cancion'} (${bpm} BPM ${num}/${den})`;

      events.push({ tick, data: markerMeta(title) });
      events.push({ tick, data: tempoMeta(bpm) });
      events.push({ tick, data: timeSigMeta(num, den) });

      // Un track por canción (nombre = título). Un note corto evita que DAWs oculten el track vacío.
      const channel = idx % 16;
      const pitch = 60 + (idx % 12);
      songTracks.push([
        { tick: 0, data: trackNameMeta(song.title || `Cancion ${idx + 1}`) },
        { tick: 0, data: tempoMeta(bpm) },
        { tick: 0, data: timeSigMeta(num, den) },
        { tick: 0, data: Buffer.from([0x90 + channel, pitch, 0x32]) },
        { tick: tpq / 2, data: Buffer.from([0x80 + channel, pitch, 0x00]) },
      ]);

      const quarterPerBar = (num * 4) / den;
      const ticksPerBar = Math.round(quarterPerBar * tpq);
      tick += ticksPerBar * barsPerSong;
    }

    const midi = buildMidi(events, songTracks, tpq);
    const datePart = toDateStr(occurrenceDate || ev.date) || 'evento';
    const safeTitle = String(ev.title || 'evento')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'evento';
    const fileName = `aio_${safeTitle}_${datePart}_ableton.mid`;

    res.setHeader('Content-Type', 'audio/midi');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(midi);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error exportando a Ableton' });
  }
});

// PATCH /api/events/:id/band-config — asignar configuración de banda (admin)
router.patch('/:id/band-config', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Solo admins' });
  const pool = require('../config/database');
  const { band_config_id, occurrence_date } = req.body;
  try {
    // Verificar que el evento pertenece a la org
    const { rows: evRows } = await pool.query(
      'SELECT id, is_recurring FROM events WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.user.orgId]
    );
    if (!evRows.length) return res.status(404).json({ error: 'Evento no encontrado' });

    if (occurrence_date && evRows[0].is_recurring) {
      // Guardar por ocurrencia específica
      const { rows } = await pool.query(
        `INSERT INTO event_occurrence_band_configs (event_id, occurrence_date, band_config_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id, occurrence_date) DO UPDATE SET band_config_id = EXCLUDED.band_config_id
         RETURNING event_id AS id, band_config_id`,
        [req.params.id, occurrence_date, band_config_id ?? null]
      );
      return res.json(rows[0]);
    }

    // Evento no recurrente o sin occurrence_date: actualizar el evento base
    const { rows } = await pool.query(
      `UPDATE events SET band_config_id = $1
        WHERE id = $2 AND organization_id = $3
        RETURNING id, band_config_id`,
      [band_config_id ?? null, req.params.id, req.user.orgId]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

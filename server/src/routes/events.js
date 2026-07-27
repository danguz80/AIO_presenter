const express = require('express');
const router = express.Router();
const zlib = require('zlib');
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

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeAbletonVersion(value) {
  const raw = String(value || '11.3').trim();
  const parts = raw.match(/\d+/g) || ['11', '3'];
  const major = parts[0] || '11';
  const minor = parts[1] || '3';
  const patch = parts[2] || '0';
  return `${major}.${minor}.${patch}`;
}

function sanitizeFileName(value) {
  return String(value || 'evento')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || 'evento';
}

function buildAbletonAlsXml({ event, songs, creatorVersion, warnings = [] }) {
  const creator = `Ableton Live ${normalizeAbletonVersion(creatorVersion)}`;
  const sceneXml = songs.map((song, index) => {
    const title = escapeXml(song.title || `Cancion ${index + 1}`);
    const bpm = Number(song.bpm) || 120;
    const { num, den } = parseTimeSig(song.time_sig);
    return `\n      <scene index="${index}" name="${title}" tempo="${bpm}" time_signature="${num}/${den}">\n        <clipslot index="0">\n          <clip name="${title}" tempo="${bpm}" time_signature="${num}/${den}" />\n        </clipslot>\n      </scene>`;
  }).join('');

  const warningsXml = warnings.length
    ? `\n    <warnings>${warnings.map((warning) => `<warning>${escapeXml(warning)}</warning>`).join('')}</warnings>`
    : '';

  const trackXml = songs.map((song, index) => {
    const title = escapeXml(song.title || `Cancion ${index + 1}`);
    const bpm = Number(song.bpm) || 120;
    const { num, den } = parseTimeSig(song.time_sig);
    return `\n      <miditrack index="${index}">\n        <name value="${title}" />\n        <devicechain>\n          <mixer />\n          <clipslots>\n            <clipslot index="${index}">\n              <clip name="${title}" tempo="${bpm}" time_signature="${num}/${den}" />\n            </clipslot>\n          </clipslots>\n        </devicechain>\n      </miditrack>`;
  }).join('');

  const eventTitle = escapeXml(event.title || 'Evento');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<Ableton Creator="${creator}" MajorVersion="5" MinorVersion="0" SchemaChangeCount="0" Revision="1">\n  <liveset>\n    <name value="${eventTitle}" />\n    <mastertrack>\n      <tempo>\n        <manual value="120" />\n      </tempo>\n      <time_signature>\n        <manual numerator="4" denominator="4" />\n      </time_signature>\n    </mastertrack>\n    <tracks>${trackXml}\n    </tracks>\n    <scenes>${sceneXml}\n    </scenes>${warningsXml}\n  </liveset>\n</Ableton>`;
}

// GET /api/events/:id/ableton-session?occurrence_date=YYYY-MM-DD&bars=4
// Exporta un ALS gzip XML con escenas por canción, utilizable en Ableton Live.
router.get('/:id/ableton-session', requireAuth, async (req, res) => {
  const pool = require('../config/database');
  const orgId = req.user.orgId;
  const eventId = Number(req.params.id);
  const occurrenceDate = req.query.occurrence_date ? toDateStr(req.query.occurrence_date) : null;

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

    const { rows: userRows } = await pool.query(
      `SELECT COALESCE(ableton_version, '11.3') AS ableton_version
         FROM sync_users
        WHERE id = $1 AND organization_id = $2`,
      [req.user.userId, orgId]
    );
    const creatorVersion = userRows[0]?.ableton_version || '11.3';

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

    const warnings = songItems
      .filter((song) => !Number(song.bpm) || !String(song.time_sig || '').trim())
      .map((song) => `"${song.title || 'Cancion'}" usara 120 BPM y 4/4 por defecto`);

    const xml = buildAbletonAlsXml({
      event: ev,
      songs: songItems,
      creatorVersion,
      warnings,
    });
    const als = zlib.gzipSync(Buffer.from(xml, 'utf8'));
    const datePart = toDateStr(occurrenceDate || ev.date) || 'evento';
    const safeTitle = sanitizeFileName(ev.title || 'evento');
    const fileName = `aio_${safeTitle}_${datePart}_ableton.als`;

    if (warnings.length) {
      res.setHeader('X-AIO-Ableton-Warnings', encodeURIComponent(warnings.join(' | ')));
    }
    res.setHeader('Access-Control-Expose-Headers', 'X-AIO-Ableton-Warnings, Content-Disposition');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(als);
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

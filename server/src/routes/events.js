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
  const ver = normalizeAbletonVersion(creatorVersion);
  const creator = `Ableton Live ${ver}`;
  const minorVersion = '11.0_11300';

  // Validar entrada
  if (!songs || songs.length === 0) {
    songs = [{ title: 'Cancion 1', bpm: 120, time_sig: '4/4' }];
  }

  // Contador global de IDs - CRÍTICO para evitar duplicados
  let nextId = 1000;
  const getNextId = () => nextId++;

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  lines.push(`<Ableton MajorVersion="5" MinorVersion="${minorVersion}" SchemaChangeCount="7" Creator="${creator}" Revision="">`);
  lines.push('  <LiveSet>');
  lines.push('    <NextPointeeId Value="10000" />');
  lines.push(`    <Name Value="${escapeXml(event.title || 'Evento')}" />`);

  // MasterTrack - estructura mínima pero válida
  lines.push('    <MasterTrack>');
  lines.push('      <LomId Value="0" />');
  lines.push('      <IsContentSelectedInDocument Value="false" />');
  lines.push('      <PreferredContentViewMode Value="0" />');
  lines.push('      <Tempo>');
  lines.push('        <LomId Value="0" />');
  lines.push('        <Manual Value="120" />');
  lines.push('        <MidiControllerRange>');
  lines.push('          <Min Value="60" />');
  lines.push('          <Max Value="200" />');
  lines.push('        </MidiControllerRange>');
  lines.push(`        <AutomationTarget Id="${getNextId()}" />`);
  lines.push(`        <ModulationTarget Id="${getNextId()}" />`);
  lines.push('      </Tempo>');
  lines.push('      <TimeSignature>');
  lines.push('        <TimeSignatures>');
  lines.push(`          <RemoteableTimeSignature Id="${getNextId()}"><Numerator Value="4" /><Denominator Value="4" /></RemoteableTimeSignature>`);
  lines.push('        </TimeSignatures>');
  lines.push('      </TimeSignature>');
  lines.push('      <DeviceChain>');
  lines.push('        <Mixer>');
  lines.push(`          <LomId Value="0" /><LomIdView Value="0" /><IsExpanded Value="true" /><On><LomId Value="0" /><Manual Value="true" /><AutomationTarget Id="${getNextId()}" /><ModulationTarget Id="${getNextId()}" /></On><ModulationSourceCount Value="0" /><ParametersListWrapper LomId="0" /><Pointee Id="${getNextId()}" /><LastSelectedTimeableIndex Value="0" /><LastSelectedClipEnvelopeIndex Value="0" /><LastPresetRef><Value /></LastPresetRef><LockedScripts /><IsFolded Value="false" /><ShouldShowPresetName Value="true" /><UserName Value="" /><Annotation Value="" /><SourceContext><Value /></SourceContext><ControllerTargets /><Volume><LomId Value="0" /><Manual Value="1" /><MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1.99526238" /></MidiControllerRange><AutomationTarget Id="${getNextId()}" /><ModulationTarget Id="${getNextId()}" /></Volume><Pan><LomId Value="0" /><Manual Value="0" /><MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange><AutomationTarget Id="${getNextId()}" /><ModulationTarget Id="${getNextId()}" /></Pan><SpeakerOn><LomId Value="0" /><Manual Value="true" /><AutomationTarget Id="${getNextId()}" /><ModulationTarget Id="${getNextId()}" /></SpeakerOn><SoloSink Value="false" /><PanMode Value="0" /><CrossFadeState><LomId Value="0" /><Manual Value="1" /><AutomationTarget Id="${getNextId()}" /><ModulationTarget Id="${getNextId()}" /></CrossFadeState><SendInfos /><ReceiveInfos /><ClipSendDelays /><HasUnlimitedSends Value="false" />`);
  lines.push('        </Mixer>');
  lines.push('        <MainSequencer>');
  lines.push(`          <LomId Value="0" /><LomIdView Value="0" /><IsExpanded Value="true" /><On><LomId Value="0" /><Manual Value="true" /><AutomationTarget Id="${getNextId()}" /><ModulationTarget Id="${getNextId()}" /></On><ModulationSourceCount Value="0" /><ParametersListWrapper LomId="0" /><Pointee Id="${getNextId()}" /><LastSelectedTimeableIndex Value="0" /><LastSelectedClipEnvelopeIndex Value="0" /><LastPresetRef><Value /></LastPresetRef><LockedScripts /><IsFolded Value="false" /><ShouldShowPresetName Value="true" /><UserName Value="" /><Annotation Value="" /><SourceContext><Value /></SourceContext><ControllerTargets />`);
  lines.push('        </MainSequencer>');
  lines.push('        <DevicesChain>');
  lines.push('          <Devices />');
  lines.push('          <SignalModulations />');
  lines.push('        </DevicesChain>');
  lines.push('      </DeviceChain>');
  lines.push('    </MasterTrack>');

  // Tracks - una por canción
  lines.push('    <Tracks>');
  songs.forEach((song, trackIdx) => {
    const title = escapeXml(song.title || `Cancion ${trackIdx + 1}`);
    const trackId = getNextId();

    lines.push(`      <MidiTrack Id="${trackId}">`);
    lines.push(`        <LomId Value="0" />`);
    lines.push(`        <IsContentSelectedInDocument Value="false" />`);
    lines.push(`        <PreferredContentViewMode Value="0" />`);
    lines.push(`        <Name><EffectiveName Value="${title}" /></Name>`);
    lines.push(`        <ColorIndex Value="0" />`);
    lines.push(`        <TrackGroupId Value="-1" />`);
    
    // ClipSlotList - debe haber exactamente N slots (uno por scene)
    lines.push(`        <ClipSlotList>`);
    songs.forEach((s, slotIdx) => {
      const clipSlotId = getNextId();
      lines.push(`          <ClipSlot Id="${clipSlotId}">`);
      
      // Solo el slot que corresponde a esta canción tiene un clip
      if (slotIdx === trackIdx) {
        const midiClipId = getNextId();
        lines.push(`            <Value>`);
        lines.push(`              <MidiClip Id="${midiClipId}" Time="0">`);
        lines.push(`                <LomId Value="0" />`);
        lines.push(`                <CurrentStart Value="0" />`);
        lines.push(`                <CurrentEnd Value="8" />`);
        lines.push(`                <Loop><LoopStart Value="0" /><LoopEnd Value="8" /><LoopOn Value="true" /></Loop>`);
        lines.push(`                <Name Value="${escapeXml(s.title || `Cancion ${slotIdx + 1}`)}" />`);
        lines.push(`                <Notes><KeyTracks /><PerNoteEventStore><EventLists /></PerNoteEventStore></Notes>`);
        lines.push(`              </MidiClip>`);
        lines.push(`            </Value>`);
      } else {
        lines.push(`            <Value />`);
      }
      lines.push(`            <HideSourceChain Value="false" />`);
      lines.push(`          </ClipSlot>`);
    });
    lines.push(`        </ClipSlotList>`);
    
    lines.push(`        <DeviceChain>`);
    lines.push(`          <Mixer><LomId Value="0" /><On><LomId Value="0" /><Manual Value="true" /></On></Mixer>`);
    lines.push(`        </DeviceChain>`);
    lines.push(`      </MidiTrack>`);
  });
  lines.push('    </Tracks>');

  // Scenes - una por canción
  lines.push('    <Scenes>');
  songs.forEach((song, idx) => {
    const title = escapeXml(song.title || `Cancion ${idx + 1}`);
    const bpm = Number(song.bpm) || 120;
    const sceneId = getNextId();
    
    lines.push(`      <Scene Id="${sceneId}">`);
    lines.push(`        <Name Value="${title}" />`);
    lines.push(`        <Tempo Value="${bpm}" />`);
    lines.push(`      </Scene>`);
  });
  lines.push('    </Scenes>');

  lines.push('  </LiveSet>');
  lines.push('</Ableton>');
  return lines.join('\n');
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

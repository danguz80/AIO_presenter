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

  if (!songs || songs.length === 0) {
    songs = [{ title: 'Cancion 1', bpm: 120, time_sig: '4/4' }];
  }

  let nextId = 1000;
  const getNextId = () => nextId++;

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<Ableton MajorVersion="5" MinorVersion="${minorVersion}" SchemaChangeCount="7" Creator="${creator}" Revision="">`);
  lines.push('  <LiveSet>');
  lines.push(`    <NextPointeeId Value="${10000 + songs.length * 100}" />`);
  lines.push(`    <OverwriteProtectionNumber Value="0" />`);
  lines.push(`    <LomId Value="0" />`);
  lines.push(`    <LomIdView Value="0" />`);

  // ESTRUCTURA CORRECTA DE ABLETON:
  // - 1 MIDI TRACK ÚNICA
  // - N SCENES (una por canción, cada una con su propio BPM/compás)
  // - MainSequencer de la pista tiene N ClipSlots (uno por scene)
  // - Slot[i] contiene MidiClip con la canción i
  
  const numSongs = songs.length;

  // TRACKS - SOLO UNA PISTA MIDI
  lines.push('    <Tracks>');
  
  const trackId = getNextId();
  lines.push(`      <MidiTrack Id="${trackId}">`);
  lines.push(`        <LomId Value="0" />`);
  lines.push(`        <LomIdView Value="0" />`);
  lines.push(`        <IsContentSelectedInDocument Value="false" />`);
  lines.push(`        <PreferredContentViewMode Value="0" />`);
  lines.push(`        <TrackDelay><Value Value="0" /><IsValueSampleBased Value="false" /></TrackDelay>`);
  lines.push(`        <Name><EffectiveName Value="Instrumentos" /><UserName Value="" /><Annotation Value="" /><MemorizedFirstClipName Value="" /></Name>`);
  lines.push(`        <Color Value="0" />`);
  lines.push(`        <AutomationEnvelopes><Envelopes /></AutomationEnvelopes>`);
  lines.push(`        <TrackGroupId Value="-1" />`);
  lines.push(`        <TrackUnfolded Value="true" />`);
  lines.push(`        <DevicesListWrapper LomId="0" />`);
  lines.push(`        <ClipSlotsListWrapper LomId="0" />`);
  lines.push(`        <ViewData Value="{}" />`);
  lines.push(`        <TakeLanes><TakeLanes /><IsExpanded Value="true" /></TakeLanes>`);
  lines.push(`        <LinkedTrackGroupId Value="-1" />`);
  lines.push(`        <SavedPlayingSlot Value="0" />`);
  lines.push(`        <SavedPlayingOffset Value="0" />`);
  lines.push(`        <Freeze Value="false" />`);
  lines.push(`        <VelocityDetail Value="0" />`);
  lines.push(`        <NeedArrangerRefreeze Value="true" />`);
  lines.push(`        <PostProcessFreezeClips Value="0" />`);
  
  // DeviceChain con MainSequencer
  lines.push(`        <DeviceChain>`);
  lines.push(`          <AutomationLanes><AutomationLanes /><IsExpanded Value="false" /></AutomationLanes>`);
  lines.push(`          <ClipEnvelopeChooserViewState><SelectedDevice Value="0" /><SelectedEnvelope Value="0" /><PreferModulationVisible Value="false" /></ClipEnvelopeChooserViewState>`);
  lines.push(`          <AudioInputRouting><Target Value="MidiIn/External.All/-1" /><UpperDisplayString Value="Ext: All Ins" /><LowerDisplayString Value="" /></AudioInputRouting>`);
  lines.push(`          <MidiInputRouting><Target Value="MidiIn/External.All/-1" /><UpperDisplayString Value="Ext: All Ins" /><LowerDisplayString Value="" /></MidiInputRouting>`);
  lines.push(`          <AudioOutputRouting><Target Value="AudioOut/Master" /><UpperDisplayString Value="Master" /><LowerDisplayString Value="" /></AudioOutputRouting>`);
  lines.push(`          <MidiOutputRouting><Target Value="MidiOut/None" /><UpperDisplayString Value="None" /><LowerDisplayString Value="" /></MidiOutputRouting>`);
  
  // Mixer
  lines.push(`          <Mixer><LomId Value="0" /><LomIdView Value="0" /><IsExpanded Value="true" /><On><LomId Value="0" /><Manual Value="true" /></On><ModulationSourceCount Value="0" /><ParametersListWrapper LomId="0" /><Pointee Id="${getNextId()}" /><LastSelectedTimeableIndex Value="0" /><LastSelectedClipEnvelopeIndex Value="0" /><LastPresetRef><Value /></LastPresetRef><LockedScripts /><IsFolded Value="false" /><ShouldShowPresetName Value="true" /><UserName Value="" /><Annotation Value="" /><SourceContext><Value /></SourceContext><ControllerTargets /><Volume><LomId Value="0" /><Manual Value="1" /></Volume><Pan><LomId Value="0" /><Manual Value="0" /></Pan><SpeakerOn><LomId Value="0" /><Manual Value="true" /></SpeakerOn><SoloSink Value="false" /><PanMode Value="0" /><CrossFadeState><LomId Value="0" /><Manual Value="1" /></CrossFadeState><SendInfos /><ReceiveInfos /><ClipSendDelays /><HasUnlimitedSends Value="false" /></Mixer>`);
  
  // MainSequencer con N ClipSlots (uno por escena/canción)
  lines.push(`          <MainSequencer>`);
  lines.push(`            <LomId Value="0" />`);
  lines.push(`            <LomIdView Value="0" />`);
  lines.push(`            <IsExpanded Value="true" />`);
  lines.push(`            <On><LomId Value="0" /><Manual Value="true" /></On>`);
  lines.push(`            <ModulationSourceCount Value="0" />`);
  lines.push(`            <ParametersListWrapper LomId="0" />`);
  lines.push(`            <Pointee Id="${getNextId()}" />`);
  lines.push(`            <LastSelectedTimeableIndex Value="0" />`);
  lines.push(`            <LastSelectedClipEnvelopeIndex Value="0" />`);
  lines.push(`            <LastPresetRef><Value /></LastPresetRef>`);
  lines.push(`            <LockedScripts />`);
  lines.push(`            <IsFolded Value="false" />`);
  lines.push(`            <ShouldShowPresetName Value="true" />`);
  lines.push(`            <UserName Value="" />`);
  lines.push(`            <Annotation Value="" />`);
  lines.push(`            <SourceContext><Value /></SourceContext>`);
  
  // ClipSlotList con N ClipSlots (uno por canción)
  lines.push(`            <ClipSlotList>`);
  for (let i = 0; i < numSongs; i++) {
    const clipSlotOuterId = getNextId();
    const song = songs[i];
    const midiClipId = getNextId();
    
    lines.push(`              <ClipSlot Id="${clipSlotOuterId}">`);
    lines.push(`                <LomId Value="0" />`);
    lines.push(`                <ClipSlot>`);
    lines.push(`                  <Value>`);
    lines.push(`                    <MidiClip Id="${midiClipId}" Time="0">`);
    lines.push(`                      <LomId Value="0" />`);
    lines.push(`                      <CurrentStart Value="0" />`);
    lines.push(`                      <CurrentEnd Value="8" />`);
    lines.push(`                      <Loop><LoopStart Value="0" /><LoopEnd Value="8" /><LoopOn Value="true" /></Loop>`);
    lines.push(`                      <Name Value="${escapeXml(song.title || `Cancion ${i + 1}`)}" />`);
    lines.push(`                      <Notes><KeyTracks /><PerNoteEventStore><EventLists /></PerNoteEventStore></Notes>`);
    lines.push(`                    </MidiClip>`);
    lines.push(`                  </Value>`);
    lines.push(`                </ClipSlot>`);
    lines.push(`                <HasStop Value="true" />`);
    lines.push(`              </ClipSlot>`);
  }
  lines.push(`            </ClipSlotList>`);
  
  lines.push(`            <MonitoringEnum Value="1" />`);
  lines.push(`          </MainSequencer>`);
  
  // FreezeSequencer con 1 ClipSlot
  lines.push(`          <FreezeSequencer><LomId Value="0" /><LomIdView Value="0" /><IsExpanded Value="true" /><On><LomId Value="0" /><Manual Value="true" /></On><ModulationSourceCount Value="0" /><ParametersListWrapper LomId="0" /><Pointee Id="${getNextId()}" /><LastSelectedTimeableIndex Value="0" /><LastSelectedClipEnvelopeIndex Value="0" /><LastPresetRef><Value /></LastPresetRef><LockedScripts /><IsFolded Value="false" /><ShouldShowPresetName Value="true" /><UserName Value="" /><Annotation Value="" /><SourceContext><Value /></SourceContext><ClipSlotList><ClipSlot Id="${getNextId()}"><LomId Value="0" /><ClipSlot><Value /></ClipSlot><HasStop Value="true" /></ClipSlot></ClipSlotList><MonitoringEnum Value="1" /></FreezeSequencer>`);
  
  // DeviceChain vacío
  lines.push(`          <DeviceChain><Devices /><SignalModulations /></DeviceChain>`);
  lines.push(`        </DeviceChain>`);
  
  lines.push(`      </MidiTrack>`);
  
  lines.push('    </Tracks>');

  // MasterTrack mínimo
  lines.push('    <MasterTrack>');
  lines.push(`      <LomId Value="0" />`);
  lines.push(`      <LomIdView Value="0" />`);
  lines.push(`      <IsContentSelectedInDocument Value="false" />`);
  lines.push(`      <PreferredContentViewMode Value="0" />`);
  lines.push(`      <Name><EffectiveName Value="Master" /></Name>`);
  lines.push(`      <Color Value="0" />`);
  lines.push(`      <TrackGroupId Value="-1" />`);
  lines.push(`      <ClipSlotsListWrapper LomId="0" />`);
  lines.push(`      <DeviceChain>`);
  lines.push(`        <Mixer><LomId Value="0" /></Mixer>`);
  lines.push(`      </DeviceChain>`);
  lines.push('    </MasterTrack>');

  // SCENES - una por canción con su propio BPM y compás
  lines.push('    <Scenes>');
  songs.forEach((song, idx) => {
    const sceneId = getNextId();
    const title = escapeXml(song.title || `Cancion ${idx + 1}`);
    const bpm = Number(song.bpm) || 120;
    
    lines.push(`      <Scene Id="${sceneId}">`);
    lines.push(`        <FollowAction><FillDuration Value="0.25" /><Type Value="0" /><DurationUnit Value="2" /></FollowAction>`);
    lines.push(`        <Name Value="${title}" />`);
    lines.push(`        <Annotation Value="" />`);
    lines.push(`        <Color Value="-1" />`);
    lines.push(`        <Tempo Value="${bpm}" />`);
    lines.push(`        <IsTempoEnabled Value="true" />`);
    lines.push(`        <TimeSignatureId Value="0" />`);
    lines.push(`        <IsTimeSignatureEnabled Value="true" />`);
    lines.push(`        <LomId Value="0" />`);
    lines.push(`        <ClipSlotsListWrapper LomId="0" />`);
    lines.push(`      </Scene>`);
  });
  lines.push('    </Scenes>');

  // Elementos finales - vacíos
  lines.push('    <PreHearTrack></PreHearTrack>');
  lines.push('    <SendsPre></SendsPre>');

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

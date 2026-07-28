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
  const ver = normalizeAbletonVersion(creatorVersion); // e.g. "11.3.0"
  const creator = `Ableton Live ${ver}`;
  // MinorVersion is the DOCUMENT FORMAT version extracted from real Live 11.3 files.
  // Real format: "11.0_11300" for Live 11.3.x (major_minor_build).
  const minorVersion = '11.0_11300';

  let nextGlobalId = 1000; // Global ID counter to ensure uniqueness across the document
  const getNextId = () => nextGlobalId++;

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  lines.push(`<Ableton MajorVersion="5" MinorVersion="${minorVersion}" SchemaChangeCount="7" Creator="${creator}" Revision="">`);
  lines.push('  <LiveSet>');
  // NextPointeeId must be greater than every Id attribute used in the document.
  // We use a fixed high value to avoid collisions regardless of song count.
  lines.push('    <NextPointeeId Value="10000" />');
  lines.push(`    <Name Value="${escapeXml(event.title || 'Evento')}" />`);

  // MasterTrack: global tempo fallback (each scene overrides it per-clip)
  lines.push('    <MasterTrack>');
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
  lines.push(`          <RemoteableTimeSignature Id="${getNextId()}">`);
  lines.push('            <Numerator Value="4" />');
  lines.push('            <Denominator Value="4" />');
  lines.push('          </RemoteableTimeSignature>');
  lines.push('        </TimeSignatures>');
  lines.push('      </TimeSignature>');
  lines.push('    </MasterTrack>');

  // Tracks — one MidiTrack per song
  lines.push('    <Tracks>');
  songs.forEach((song, index) => {
    const title = escapeXml(song.title || `Cancion ${index + 1}`);
    const bpm = Number(song.bpm) || 120;
    const { num, den } = parseTimeSig(song.time_sig);
    lines.push(`      <MidiTrack Id="${index}">`);
    lines.push(`        <LomId Value="0" />`);
    lines.push(`        <IsContentSelectedInDocument Value="false" />`);
    lines.push(`        <PreferredContentViewMode Value="0" />`);
    lines.push(`        <TrackDelay><Value Value="0" /><IsValueSampleBased Value="false" /></TrackDelay>`);
    lines.push(`        <Name><EffectiveName Value="${title}" /><UserName Value="" /><Annotation Value="" /><MemorizedFirstClipName Value="" /></Name>`);
    lines.push(`        <ColorIndex Value="0" />`);
    lines.push(`        <AutomationEnvelopes><Envelopes /></AutomationEnvelopes>`);
    lines.push(`        <TrackGroupId Value="-1" />`);
    lines.push(`        <TrackUnfolded Value="true" />`);
    lines.push(`        <DevicesListWrapper LomId="0" />`);
    lines.push(`        <ClipSlotsListWrapper LomId="0" />`);
    lines.push(`        <ViewData Value="{}" />`);
    lines.push(`        <TakeLanes><TakeLanes /><IsExpanded Value="true" /></TakeLanes>`);
    lines.push(`        <LinkedTrackGroupId Value="-1" />`);
    lines.push(`        <SavedPlayingSlot Value="-1" />`);
    lines.push(`        <SavedPlayingOffset Value="0" />`);
    lines.push(`        <Freeze Value="false" />`);
    lines.push(`        <VelocityDetail Value="0" />`);
    lines.push(`        <NeedArrangerRefreeze Value="true" />`);
    lines.push(`        <PostProcessFreezeClips Value="0" />`);
    lines.push(`        <DeviceChain>`);
    lines.push(`          <AutomationLanes><AutomationLanes /><IsExpanded Value="false" /></AutomationLanes>`);
    lines.push(`          <ClipEnvelopeChooserViewState><SelectedDevice Value="0" /><SelectedEnvelope Value="0" /><PreferModulationVisible Value="false" /></ClipEnvelopeChooserViewState>`);
    lines.push(`          <AudioInputRouting><Target Value="AudioIn/External/S0" /><UpperDisplayString Value="Ext. In" /><LowerDisplayString Value="1" /><MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="16" /></MpeSettings></AudioInputRouting>`);
    lines.push(`          <MidiInputRouting><Target Value="MidiIn/External.All/-1" /><UpperDisplayString Value="Ext: All Ins" /><LowerDisplayString Value="" /><MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="16" /></MpeSettings></MidiInputRouting>`);
    lines.push(`          <AudioOutputRouting><Target Value="AudioOut/Master" /><UpperDisplayString Value="Master" /><LowerDisplayString Value="" /><MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="16" /></MpeSettings></AudioOutputRouting>`);
    lines.push(`          <MidiOutputRouting><Target Value="MidiOut/None" /><UpperDisplayString Value="None" /><LowerDisplayString Value="" /><MpeSettings><ZoneType Value="0" /><FirstNoteChannel Value="1" /><LastNoteChannel Value="16" /></MpeSettings></MidiOutputRouting>`);
    lines.push(`          <Mixer>`);
    lines.push(`            <LomId Value="0" />`);
    lines.push(`            <LomIdView Value="0" />`);
    lines.push(`            <IsExpanded Value="true" />`);
    lines.push(`            <On><LomId Value="0" /><Manual Value="true" /><AutomationTarget Id="${2 + index * 4}" /><ModulationTarget Id="${3 + index * 4}" /></On>`);
    lines.push(`            <ModulationSourceCount Value="0" />`);
    lines.push(`            <ParametersListWrapper LomId="0" />`);
    lines.push(`            <Pointee Id="${100 + index}" />`);
    lines.push(`            <LastSelectedTimeableIndex Value="0" />`);
    lines.push(`            <LastSelectedClipEnvelopeIndex Value="0" />`);
    lines.push(`            <LastPresetRef><Value /></LastPresetRef>`);
    lines.push(`            <LockedScripts />`);
    lines.push(`            <IsFolded Value="false" />`);
    lines.push(`            <ShouldShowPresetName Value="true" />`);
    lines.push(`            <UserName Value="" />`);
    lines.push(`            <Annotation Value="" />`);
    lines.push(`            <SourceContext><Value /></SourceContext>`);
    lines.push(`            <ControllerTargets />`);
    lines.push(`            <Volume><LomId Value="0" /><Manual Value="1" /><MidiControllerRange><Min Value="0.0003162277571" /><Max Value="1.99526238" /></MidiControllerRange><AutomationTarget Id="${4 + index * 4}" /><ModulationTarget Id="${5 + index * 4}" /></Volume>`);
    lines.push(`            <Pan><LomId Value="0" /><Manual Value="0" /><MidiControllerRange><Min Value="-1" /><Max Value="1" /></MidiControllerRange><AutomationTarget Id="${6 + index * 4}" /><ModulationTarget Id="${7 + index * 4}" /></Pan>`);
    lines.push(`            <SpeakerOn><LomId Value="0" /><Manual Value="true" /><AutomationTarget Id="${8 + index * 4}" /><ModulationTarget Id="${9 + index * 4}" /></SpeakerOn>`);
    lines.push(`            <SoloSink Value="false" />`);
    lines.push(`            <PanMode Value="0" />`);
    lines.push(`            <CrossFadeState><LomId Value="0" /><Manual Value="1" /><AutomationTarget Id="${10 + index * 4}" /><ModulationTarget Id="${11 + index * 4}" /></CrossFadeState>`);
    lines.push(`            <SendInfos />`);
    lines.push(`            <ReceiveInfos />`);
    lines.push(`            <ClipSendDelays />`);
    lines.push(`            <HasUnlimitedSends Value="false" />`);
    lines.push(`          </Mixer>`);
    lines.push(`          <MainSequencer>`);
    lines.push(`            <LomId Value="0" />`);
    lines.push(`            <LomIdView Value="0" />`);
    lines.push(`            <IsExpanded Value="true" />`);
    lines.push(`            <On><LomId Value="0" /><Manual Value="true" /><AutomationTarget Id="${20 + index * 4}" /><ModulationTarget Id="${21 + index * 4}" /></On>`);
    lines.push(`            <ModulationSourceCount Value="0" />`);
    lines.push(`            <ParametersListWrapper LomId="0" />`);
    lines.push(`            <Pointee Id="${200 + index}" />`);
    lines.push(`            <LastSelectedTimeableIndex Value="0" />`);
    lines.push(`            <LastSelectedClipEnvelopeIndex Value="0" />`);
    lines.push(`            <LastPresetRef><Value /></LastPresetRef>`);
    lines.push(`            <LockedScripts />`);
    lines.push(`            <IsFolded Value="false" />`);
    lines.push(`            <ShouldShowPresetName Value="true" />`);
    lines.push(`            <UserName Value="" />`);
    lines.push(`            <Annotation Value="" />`);
    lines.push(`            <SourceContext><Value /></SourceContext>`);
    lines.push(`            <ControllerTargets />`);
    lines.push(`            <ClipTimeable><ArrangerAutomation><Events /><AutomationTransformViewState><IsTransformPending Value="false" /><TimeAndValueTransforms /></AutomationTransformViewState></ArrangerAutomation></ClipTimeable>`);
    lines.push(`            <ClipSlotList>`);
    // One ClipSlot per scene/song
    songs.forEach((s, si) => {
      const sTitle = escapeXml(s.title || `Cancion ${si + 1}`);
      const sBpm = Number(s.bpm) || 120;
      const { num: sNum, den: sDen } = parseTimeSig(s.time_sig);
      const active = si === index ? 'true' : 'false';
      const clipSlotId = getNextId();
      const midiClipId = getNextId();
      const tsId = getNextId();
      const followAction1Id = getNextId();
      const followAction2Id = getNextId();
      lines.push(`              <ClipSlot Id="${clipSlotId}">`);
      lines.push(`                <Value>`);
      if (si === index) {
        // Only the matching slot has a clip; others are empty
        lines.push(`                  <MidiClip Id="${midiClipId}" Time="0">`);
        lines.push(`                    <LomId Value="0" />`);
        lines.push(`                    <LomIdView Value="0" />`);
        lines.push(`                    <CurrentStart Value="0" />`);
        lines.push(`                    <CurrentEnd Value="8" />`);
        lines.push(`                    <Loop><LoopStart Value="0" /><LoopEnd Value="8" /><StartRelative Value="0" /><LoopOn Value="true" /><OutMarker Value="8" /><HiddenLoopStart Value="0" /><HiddenLoopEnd Value="8" /></Loop>`);
        lines.push(`                    <Name Value="${sTitle}" />`);
        lines.push(`                    <Annotation Value="" />`);
        lines.push(`                    <Color Value="-1" />`);
        lines.push(`                    <LaunchMode Value="0" />`);
        lines.push(`                    <LaunchQuantisation Value="0" />`);
        lines.push(`                    <TimeSignature><TimeSignatures><RemoteableTimeSignature Id="${tsId}"><Numerator Value="${sNum}" /><Denominator Value="${sDen}" /></RemoteableTimeSignature></TimeSignatures></TimeSignature>`);
        lines.push(`                    <Envelopes><Envelopes /></Envelopes>`);
        lines.push(`                    <ScrollerTimePreserver><LeftTime Value="0" /><RightTime Value="16" /></ScrollerTimePreserver>`);
        lines.push(`                    <TimeSelection><AnchorTime Value="0" /><OtherTime Value="0" /></TimeSelection>`);
        lines.push(`                    <Legato Value="false" />`);
        lines.push(`                    <Ram Value="false" />`);
        lines.push(`                    <SnapToGrid Value="true" />`);
        lines.push(`                    <Disabled Value="false" />`);
        lines.push(`                    <VelocityAmount Value="0" />`);
        lines.push(`                    <FollowAction><FillDuration Value="0.25" /><IsLinked Value="true" /><LoopIterations Value="1" /><Type Value="0" /><DurationUnit Value="2" /><FollowActionA><FollowAction Id="${followAction1Id}"><IsEnabled Value="false" /><Chance Value="100" /><JumpIndexExpression Value="0" /></FollowAction></FollowActionA><FollowActionB><FollowAction Id="${followAction2Id}"><IsEnabled Value="false" /><Chance Value="0" /><JumpIndexExpression Value="0" /></FollowAction></FollowActionB></FollowAction>`);
        lines.push(`                    <Grid><FixedNumerator Value="1" /><FixedDenominator Value="16" /><GridIntervalPixels Value="20" /><Ntoles Value="3" /><SnapToGrid Value="true" /><Fixed Value="false" /></Grid>`);
        lines.push(`                    <FreezeStart Value="0" />`);
        lines.push(`                    <FreezeEnd Value="0" />`);
        lines.push(`                    <IsWarped Value="false" />`);
        lines.push(`                    <NoteEditorFoldInZoom Value="-1" />`);
        lines.push(`                    <NoteEditorFoldInScroll Value="0" />`);
        lines.push(`                    <NoteEditorFoldOutZoom Value="-1" />`);
        lines.push(`                    <NoteEditorFoldOutScroll Value="0" />`);
        lines.push(`                    <NoteEditorFoldScaleZoom Value="-1" />`);
        lines.push(`                    <NoteEditorFoldScaleScroll Value="0" />`);
        lines.push(`                    <ScaleInformation><RootNote Value="0" /><Name Value="Major" /></ScaleInformation>`);
        lines.push(`                    <IsInKey Value="false" />`);
        lines.push(`                    <NoteSpellingPreference Value="3" />`);
        lines.push(`                    <PreferFlatRootNote Value="false" />`);
        lines.push(`                    <ExpressionGrid><FixedNumerator Value="1" /><FixedDenominator Value="16" /><GridIntervalPixels Value="20" /><Ntoles Value="3" /><SnapToGrid Value="true" /><Fixed Value="false" /></ExpressionGrid>`);
        lines.push(`                    <Notes><KeyTracks /><PerNoteEventStore><EventLists /></PerNoteEventStore><NoteIdCounter Value="0" /></Notes>`);
        lines.push(`                    <PerNoteEventLookAheadAmount Value="-1" />`);
        lines.push(`                    <BankSelectCoarse Value="-1" />`);
        lines.push(`                    <BankSelectFine Value="-1" />`);
        lines.push(`                    <ProgramChange Value="-1" />`);
        lines.push(`                    <NoteEditorKeyboardFoldStartNote Value="36" />`);
        lines.push(`                    <NoteEditorKeyboardFoldEndNote Value="72" />`);
        lines.push(`                  </MidiClip>`);
      }
      lines.push(`                </Value>`);
      lines.push(`                <HideSourceChain Value="false" />`);
      lines.push(`              </ClipSlot>`);
    });
    lines.push(`            </ClipSlotList>`);
    lines.push(`            <MonitoringEnum Value="1" />`);
    lines.push(`            <VoiceCount Value="6" />`);
    lines.push(`            <InstrumentChain><Devices /><SignalModulations /><AutomationTransformViewState><IsTransformPending Value="false" /><TimeAndValueTransforms /></AutomationTransformViewState></InstrumentChain>`);
    lines.push(`            <NoteEditorPlayingClipStartNode Value="-1" />`);
    lines.push(`            <MidiInputFilterType Value="0" />`);
    lines.push(`          </MainSequencer>`);
    lines.push(`          <FreezeSequencer><LomId Value="0" /><LomIdView Value="0" /><IsExpanded Value="true" /><On><LomId Value="0" /><Manual Value="true" /></On><ModulationSourceCount Value="0" /><ParametersListWrapper LomId="0" /><Pointee Id="${300 + index}" /><LastSelectedTimeableIndex Value="0" /><LastSelectedClipEnvelopeIndex Value="0" /><LastPresetRef><Value /></LastPresetRef><LockedScripts /><IsFolded Value="false" /><ShouldShowPresetName Value="true" /><UserName Value="" /><Annotation Value="" /><SourceContext><Value /></SourceContext><ControllerTargets /><ClipTimeable><ArrangerAutomation><Events /><AutomationTransformViewState><IsTransformPending Value="false" /><TimeAndValueTransforms /></AutomationTransformViewState></ArrangerAutomation></ClipTimeable><MonitoringEnum Value="1" /><VoiceCount Value="0" /></FreezeSequencer>`);
    lines.push(`          <DevicesChain><Devices /><SignalModulations /><AutomationTransformViewState><IsTransformPending Value="false" /><TimeAndValueTransforms /></AutomationTransformViewState></DevicesChain>`);
    lines.push(`        </DeviceChain>`);
    lines.push(`        <ReWireSlaveMidiTargetId Value="-1" />`);
    lines.push(`        <PitchNote Value="60" />`);
    lines.push(`        <PitchOctave Value="0" />`);
    lines.push(`        <TrackIsMuted Value="false" />`);
    lines.push(`        <TrackIsSoloed Value="false" />`);
    lines.push(`        <DevicesGroupExpanded Value="true" />`);
    lines.push(`        <MidiPitchDisplayMode Value="0" />`);
    lines.push(`      </MidiTrack>`);
  });
  lines.push('    </Tracks>');

  // Scenes — one per song, named exactly as the song title
  lines.push('    <Scenes>');
  songs.forEach((song, index) => {
    const title = escapeXml(song.title || `Cancion ${index + 1}`);
    const bpm = Number(song.bpm) || 120;
    const { num, den } = parseTimeSig(song.time_sig);
    const sceneId = getNextId();
    const tsId = getNextId();
    const controlTargetId = getNextId();
    lines.push(`      <Scene Id="${sceneId}">`);
    lines.push(`        <Name Value="${title}" />`);
    lines.push(`        <Annotation Value="" />`);
    lines.push(`        <Color Value="-1" />`);
    lines.push(`        <Tempo Value="${bpm}" />`);
    lines.push(`        <TimeSignature>`);
    lines.push(`          <TimeSignatures>`);
    lines.push(`            <RemoteableTimeSignature Id="${tsId}">`);
    lines.push(`              <Numerator Value="${num}" />`);
    lines.push(`              <Denominator Value="${den}" />`);
    lines.push(`            </RemoteableTimeSignature>`);
    lines.push(`          </TimeSignatures>`);
    lines.push(`        </TimeSignature>`);
    lines.push(`        <IsTempoEnabled Value="true" />`);
    lines.push(`        <IsTimeSignatureEnabled Value="true" />`);
    lines.push(`        <ClipSlotsListWrapper LomId="0" />`);
    lines.push(`        <SceneActivationTarget><RemoteableControlTarget Id="${controlTargetId}" /></SceneActivationTarget>`);
    lines.push(`        <IsManualViewMode Value="false" />`);
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

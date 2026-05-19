/**
 * Migración: lee datos de la BD local (PostgreSQL 17 local)
 * y los copia a Railway (la BD remota configurada en DATABASE_URL).
 *
 * Uso:
 *   DB_LOCAL_PASSWORD=tu_contraseña node scripts/migrateLocalToRailway.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const localPool = new Pool({
  host:     'localhost',
  port:     5432,
  database: process.env.DB_NAME     || 'aio_presenter',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_LOCAL_PASSWORD || process.env.DB_PASSWORD || '',
});

const remotePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ORG_ID = 1;

(async () => {
  console.log('Conectando a BD local...');
  await localPool.query('SELECT 1');
  console.log('✅ BD local OK');

  await remotePool.query('SELECT 1');
  console.log('✅ Railway OK');

  // ── Contar datos locales ────────────────────────────────────────────────────
  const [songsCount, eventsCount, bibleBooksCount, bibleVersesCount] = await Promise.all([
    localPool.query('SELECT COUNT(*) FROM songs'),
    localPool.query('SELECT COUNT(*) FROM events'),
    localPool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='bible_books'").then(r =>
      r.rows[0].count > 0 ? localPool.query('SELECT COUNT(*) FROM bible_books') : { rows: [{ count: 0 }] }
    ),
    localPool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='bible_verses'").then(r =>
      r.rows[0].count > 0 ? localPool.query('SELECT COUNT(*) FROM bible_verses') : { rows: [{ count: 0 }] }
    ),
  ]);

  console.log('\n=== BD LOCAL ===');
  console.log('Canciones:      ', songsCount.rows[0].count);
  console.log('Eventos:        ', eventsCount.rows[0].count);
  console.log('Libros Biblia:  ', bibleBooksCount.rows[0].count);
  console.log('Versículos:     ', bibleVersesCount.rows[0].count);

  const args = process.argv.slice(2);
  if (!args.includes('--migrate')) {
    console.log('\nEjecuta con --migrate para copiar los datos a Railway.');
    console.log('Ejemplo: DB_LOCAL_PASSWORD=tupassword node scripts/migrateLocalToRailway.js --migrate');
    process.exit(0);
  }

  // ── MIGRAR CANCIONES ────────────────────────────────────────────────────────
  console.log('\nMigrando canciones...');
  const { rows: songs } = await localPool.query(`
    SELECT s.*, 
      COALESCE(json_agg(ss ORDER BY ss.position) FILTER (WHERE ss.id IS NOT NULL), '[]') AS slides
    FROM songs s
    LEFT JOIN song_slides ss ON ss.song_id = s.id
    GROUP BY s.id
  `);

  let songsMigrated = 0, songsSkipped = 0;
  for (const song of songs) {
    // Ver si ya existe en Railway (por título exacto)
    const { rows: existing } = await remotePool.query(
      'SELECT id FROM songs WHERE lower(title)=lower($1) AND organization_id=$2',
      [song.title, ORG_ID]
    );
    if (existing.length > 0) { songsSkipped++; continue; }

    const { rows: [newSong] } = await remotePool.query(`
      INSERT INTO songs (title, author, copyright, ccli, song_key, tags, drive_file_id, drive_synced_at, organization_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id
    `, [
      song.title, song.author || null, song.copyright || null, song.ccli || null,
      song.song_key || null, song.tags || [],
      song.drive_file_id || null, song.drive_synced_at || null,
      ORG_ID, song.created_at, song.updated_at,
    ]);

    for (const slide of (song.slides || [])) {
      await remotePool.query(
        'INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)',
        [newSong.id, slide.label || '', slide.content || '', slide.position ?? 0]
      );
    }
    songsMigrated++;
    if (songsMigrated % 50 === 0) console.log(`  ${songsMigrated} canciones migradas...`);
  }
  console.log(`✅ Canciones: ${songsMigrated} migradas, ${songsSkipped} omitidas (ya existían)`);

  // ── MIGRAR EVENTOS ──────────────────────────────────────────────────────────
  console.log('\nMigrando eventos...');
  const { rows: events } = await localPool.query('SELECT * FROM events ORDER BY date');
  let eventsMigrated = 0, eventsSkipped = 0;
  const eventIdMap = {}; // local_id → remote_id

  for (const ev of events) {
    const { rows: existing } = await remotePool.query(
      'SELECT id FROM events WHERE title=$1 AND date=$2 AND organization_id=$3',
      [ev.title, ev.date, ORG_ID]
    );
    if (existing.length > 0) {
      eventIdMap[ev.id] = existing[0].id;
      eventsSkipped++;
      continue;
    }
    const { rows: [newEv] } = await remotePool.query(`
      INSERT INTO events (title, date, recurrence, organization_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `, [ev.title, ev.date, ev.recurrence || null, ORG_ID, ev.created_at, ev.updated_at]);
    eventIdMap[ev.id] = newEv.id;
    eventsMigrated++;
  }
  console.log(`✅ Eventos: ${eventsMigrated} migrados, ${eventsSkipped} omitidos`);

  // ── MIGRAR event_songs (setlists) si existe ─────────────────────────────────
  const hasEventSongs = await localPool.query(
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='event_songs'"
  );
  if (parseInt(hasEventSongs.rows[0].count) > 0) {
    console.log('\nMigrando setlists de eventos...');
    const { rows: eventSongs } = await localPool.query('SELECT * FROM event_songs ORDER BY event_id, position');
    let esm = 0;
    for (const es of eventSongs) {
      const remoteEventId = eventIdMap[es.event_id];
      if (!remoteEventId) continue;
      const { rows: songMatch } = await remotePool.query(
        'SELECT id FROM songs WHERE drive_file_id=$1 AND organization_id=$2',
        [es.drive_file_id || '', ORG_ID]
      );
      if (!songMatch.length) continue;
      await remotePool.query(
        'INSERT INTO event_songs (event_id, song_id, position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [remoteEventId, songMatch[0].id, es.position || 0]
      ).catch(() => {});
      esm++;
    }
    console.log(`✅ Setlists: ${esm} entradas migradas`);
  }

  // ── BIBLIA ──────────────────────────────────────────────────────────────────
  const hasBible = await localPool.query(
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='bible_verses'"
  );
  if (parseInt(hasBible.rows[0].count) > 0) {
    const { rows: [vCount] } = await localPool.query('SELECT COUNT(*) FROM bible_verses');
    const { rows: [remoteVCount] } = await remotePool.query(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='bible_verses'"
    ).then(r => parseInt(r.rows[0].count) > 0
      ? remotePool.query('SELECT COUNT(*) FROM bible_verses')
      : { rows: [{ count: 0 }] }
    );

    console.log(`\nBiblia local: ${vCount.count} versículos | Railway: ${remoteVCount.count} versículos`);
    if (parseInt(remoteVCount.count) === 0 && parseInt(vCount.count) > 0) {
      console.log('La Biblia existe solo localmente — usa el script seedBible.js para importarla a Railway.');
    }
  }

  console.log('\n✅ Migración completada.');
  process.exit(0);
})().catch(e => {
  console.error('\nError:', e.message);
  process.exit(1);
});

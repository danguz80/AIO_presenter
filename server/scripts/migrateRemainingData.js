/**
 * Migra datos faltantes a Railway:
 *  - Crea tablas event_templates y event_song_plays (si no existen)
 *  - Migra event_songs (con mapeo de IDs local→Railway)
 *  - Migra app_settings faltantes
 *  - Migra song_slides faltantes
 *  - Migra event_templates
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const local = new Pool({
  host: 'localhost', port: 5432,
  database: process.env.DB_NAME || 'aio_presenter',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});
const remote = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ORG_ID = 1;

(async () => {
  console.log('Conectando...');
  await Promise.all([local.query('SELECT 1'), remote.query('SELECT 1')]);
  console.log('✅ Conexiones OK\n');

  // ─────────────────────────────────────────────────
  // 1. Crear tablas faltantes en Railway
  // ─────────────────────────────────────────────────
  console.log('1. Creando tablas faltantes en Railway...');

  await remote.query(`
    CREATE TABLE IF NOT EXISTS event_templates (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      items      JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      organization_id INTEGER
    )
  `);

  await remote.query(`
    CREATE TABLE IF NOT EXISTS event_song_plays (
      id              SERIAL PRIMARY KEY,
      event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      occurrence_date DATE,
      song_id         INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      played_at       TIMESTAMP DEFAULT NOW(),
      slides_shown    INTEGER DEFAULT 0,
      total_slides    INTEGER DEFAULT 0,
      manual          BOOLEAN DEFAULT FALSE,
      UNIQUE (event_id, occurrence_date, song_id)
    )
  `);

  console.log('   ✅ Tablas creadas (o ya existían)');

  // ─────────────────────────────────────────────────
  // 2. Construir mapas de IDs: local_song_id → railway_song_id
  // ─────────────────────────────────────────────────
  console.log('\n2. Construyendo mapa de IDs de canciones...');
  const localSongs  = await local.query('SELECT id, title, author FROM songs ORDER BY id');
  const remoteSongs = await remote.query('SELECT id, title, author FROM songs ORDER BY id');

  // Mapa por (title+author) → remote_id
  const remoteMap = new Map();
  for (const s of remoteSongs.rows) {
    const key = `${(s.title||'').trim().toLowerCase()}||${(s.author||'').trim().toLowerCase()}`;
    remoteMap.set(key, s.id);
  }
  // También mapa por título solo (fallback)
  const remoteTitleMap = new Map();
  for (const s of remoteSongs.rows) {
    const key = (s.title||'').trim().toLowerCase();
    if (!remoteTitleMap.has(key)) remoteTitleMap.set(key, s.id);
  }

  const songIdMap = new Map(); // local_id → remote_id
  let songMapped = 0, songMissed = 0;
  for (const s of localSongs.rows) {
    const key = `${(s.title||'').trim().toLowerCase()}||${(s.author||'').trim().toLowerCase()}`;
    let remoteId = remoteMap.get(key) || remoteTitleMap.get((s.title||'').trim().toLowerCase());
    if (remoteId) {
      songIdMap.set(s.id, remoteId);
      songMapped++;
    } else {
      songMissed++;
      if (songMissed <= 5) console.log(`   ⚠️  Sin mapeo: "${s.title}" (local id=${s.id})`);
    }
  }
  console.log(`   Mapeadas: ${songMapped}, sin mapear: ${songMissed}`);

  // ─────────────────────────────────────────────────
  // 3. Construir mapa de IDs de eventos
  // ─────────────────────────────────────────────────
  console.log('\n3. Construyendo mapa de IDs de eventos...');
  const localEvents  = await local.query('SELECT id, title, date FROM events ORDER BY id');
  const remoteEvents = await remote.query('SELECT id, title, date FROM events ORDER BY id');

  const eventIdMap = new Map(); // local_id → remote_id
  for (const le of localEvents.rows) {
    const leDate = le.date instanceof Date
      ? le.date.toISOString().split('T')[0]
      : String(le.date).split('T')[0];
    for (const re of remoteEvents.rows) {
      const reDate = re.date instanceof Date
        ? re.date.toISOString().split('T')[0]
        : String(re.date).split('T')[0];
      if (le.title === re.title && leDate === reDate) {
        eventIdMap.set(le.id, re.id);
        break;
      }
    }
  }
  console.log(`   Eventos mapeados: ${eventIdMap.size} de ${localEvents.rows.length}`);
  for (const [lid, rid] of eventIdMap) {
    console.log(`   local_id=${lid} → remote_id=${rid}`);
  }

  // ─────────────────────────────────────────────────
  // 4. Migrar event_songs
  // ─────────────────────────────────────────────────
  console.log('\n4. Migrando event_songs...');
  const localEventSongs = await local.query(
    'SELECT * FROM event_songs ORDER BY event_id, position'
  );

  let esMigrated = 0, esSkipped = 0;
  for (const es of localEventSongs.rows) {
    const remoteEventId = eventIdMap.get(es.event_id);
    const remoteSongId  = es.song_id ? songIdMap.get(es.song_id) : null;

    if (es.item_type !== 'separator' && es.song_id && !remoteSongId) {
      console.log(`   ⚠️  Saltando: local song_id=${es.song_id} sin mapeo`);
      esSkipped++;
      continue;
    }
    if (!remoteEventId) {
      console.log(`   ⚠️  Saltando: local event_id=${es.event_id} sin mapeo`);
      esSkipped++;
      continue;
    }

    try {
      await remote.query(
        `INSERT INTO event_songs
           (event_id, song_id, position, notes, item_type, separator_label, separator_color, occurrence_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [
          remoteEventId,
          remoteSongId || null,
          es.position,
          es.notes || null,
          es.item_type || 'song',
          es.separator_label || null,
          es.separator_color || null,
          es.occurrence_date || null,
        ]
      );
      esMigrated++;
    } catch (e) {
      console.log(`   ❌ Error insertando event_song id=${es.id}: ${e.message}`);
      esSkipped++;
    }
  }
  console.log(`   ✅ event_songs migrados: ${esMigrated}, saltados: ${esSkipped}`);

  // ─────────────────────────────────────────────────
  // 5. Migrar event_templates
  // ─────────────────────────────────────────────────
  console.log('\n5. Migrando event_templates...');
  const localTemplates = await local.query('SELECT * FROM event_templates ORDER BY id');
  const remoteTemplatesCount = await remote.query('SELECT COUNT(*) FROM event_templates');

  if (parseInt(remoteTemplatesCount.rows[0].count) > 0) {
    console.log('   ⏭️  Ya existen templates en Railway, saltando');
  } else {
    for (const t of localTemplates.rows) {
      await remote.query(
        `INSERT INTO event_templates (name, items, organization_id, created_at) VALUES ($1,$2,$3,$4)`,
        [t.name, JSON.stringify(t.items), ORG_ID, t.created_at]
      );
    }
    console.log(`   ✅ ${localTemplates.rows.length} template(s) migrado(s)`);
  }

  // ─────────────────────────────────────────────────
  // 6. Migrar app_settings faltantes
  // ─────────────────────────────────────────────────
  console.log('\n6. Migrando app_settings faltantes...');
  const localSettings  = await local.query('SELECT * FROM app_settings ORDER BY key');
  const remoteSettings = await remote.query('SELECT key FROM app_settings');
  const existingKeys   = new Set(remoteSettings.rows.map(r => r.key));

  let settingsMigrated = 0;
  for (const s of localSettings.rows) {
    if (existingKeys.has(s.key)) {
      // Actualizar si ya existe (puede tener valor viejo)
      await remote.query(
        `UPDATE app_settings SET value=$1 WHERE key=$2`,
        [JSON.stringify(s.value), s.key]
      );
    } else {
      await remote.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)`,
        [s.key, JSON.stringify(s.value)]
      );
    }
    settingsMigrated++;
  }
  console.log(`   ✅ app_settings sincronizados: ${settingsMigrated}`);

  // ─────────────────────────────────────────────────
  // 7. Migrar song_slides faltantes
  // ─────────────────────────────────────────────────
  console.log('\n7. Verificando song_slides faltantes...');
  const localSlides  = await local.query('SELECT COUNT(*) FROM song_slides');
  const remoteSlides = await remote.query('SELECT COUNT(*) FROM song_slides');
  const localCount   = parseInt(localSlides.rows[0].count);
  const remoteCount  = parseInt(remoteSlides.rows[0].count);

  if (localCount === remoteCount) {
    console.log(`   ✅ song_slides iguales (${remoteCount}), nada que migrar`);
  } else {
    console.log(`   Local: ${localCount}, Railway: ${remoteCount}. Migrando faltantes...`);

    // Obtener slides de canciones que no tienen slides en Railway
    const missing = await remote.query(
      `SELECT s.id as remote_id, s.title
       FROM songs s
       LEFT JOIN song_slides ss ON ss.song_id = s.id
       WHERE ss.id IS NULL
       ORDER BY s.id`
    );
    console.log(`   Canciones sin slides en Railway: ${missing.rows.length}`);

    let slidesMigrated = 0;
    for (const remSong of missing.rows) {
      // Encontrar el local_id por título
      const localSong = await local.query(
        `SELECT s.id FROM songs s
         LEFT JOIN song_slides ss ON ss.song_id = s.id
         WHERE s.title = $1 AND ss.id IS NOT NULL
         LIMIT 1`,
        [remSong.title]
      );
      if (!localSong.rows.length) continue;
      const localSongId = localSong.rows[0].id;

      const slides = await local.query(
        'SELECT * FROM song_slides WHERE song_id=$1 ORDER BY position',
        [localSongId]
      );
      for (const sl of slides.rows) {
        await remote.query(
          `INSERT INTO song_slides (song_id, label, content, position) VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [remSong.remote_id, sl.label, sl.content, sl.position]
        );
        slidesMigrated++;
      }
    }
    console.log(`   ✅ song_slides migrados: ${slidesMigrated}`);
  }

  // ─────────────────────────────────────────────────
  // Resumen final
  // ─────────────────────────────────────────────────
  console.log('\n=== RESUMEN FINAL ===');
  const counts = await remote.query(`
    SELECT
      (SELECT COUNT(*) FROM event_songs) as event_songs,
      (SELECT COUNT(*) FROM event_templates) as event_templates,
      (SELECT COUNT(*) FROM app_settings) as app_settings,
      (SELECT COUNT(*) FROM song_slides) as song_slides
  `);
  console.log('Railway ahora:');
  console.table(counts.rows[0]);

  process.exit(0);
})().catch(e => { console.error('ERROR FATAL:', e.message); process.exit(1); });

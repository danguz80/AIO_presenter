require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const local  = new Pool({ host:'localhost', port:5432, database: process.env.DB_NAME||'aio_presenter', user: process.env.DB_USER||'postgres', password: process.env.DB_PASSWORD||'' });
const remote = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  // Obtener todos los slides con background en local
  const slides = await local.query(
    `SELECT ss.id, ss.label, ss.position, ss.slide_background, s.title
     FROM song_slides ss JOIN songs s ON s.id = ss.song_id
     WHERE ss.slide_background IS NOT NULL`
  );
  console.log('Slides con background a migrar:', slides.rows.length);

  let ok = 0;
  for (const sl of slides.rows) {
    // Encontrar canción en Railway por título
    const rs = await remote.query('SELECT id FROM songs WHERE title=$1 LIMIT 1', [sl.title]);
    if (!rs.rows.length) { console.log('Sin mapeo canción:', sl.title); continue; }
    const remSongId = rs.rows[0].id;

    // Encontrar el slide en Railway por posición + label
    const rsl = await remote.query(
      'SELECT id FROM song_slides WHERE song_id=$1 AND label=$2 AND position=$3 LIMIT 1',
      [remSongId, sl.label, sl.position]
    );
    if (!rsl.rows.length) { console.log('Slide no encontrado:', sl.title, sl.label); continue; }

    await remote.query('UPDATE song_slides SET slide_background=$1 WHERE id=$2',
      [JSON.stringify(sl.slide_background), rsl.rows[0].id]);
    console.log('✅', sl.title, '[' + sl.label + '] background migrado');
    ok++;
  }
  console.log('\nTotal migrados:', ok);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

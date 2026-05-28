require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../src/config/database');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS song_annotations (
      id         SERIAL PRIMARY KEY,
      song_id    INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES sync_users(id) ON DELETE CASCADE,
      data       JSONB   NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(song_id, user_id)
    );
  `);
  console.log('✅  Tabla song_annotations creada (o ya existía).');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });

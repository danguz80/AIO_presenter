require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'aio_presenter',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_song_plays (
        id              SERIAL PRIMARY KEY,
        event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        occurrence_date DATE,                        -- NULL para eventos no recurrentes
        song_id         INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        played_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        slides_shown    INTEGER NOT NULL DEFAULT 0,
        total_slides    INTEGER NOT NULL DEFAULT 0,
        manual          BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (event_id, occurrence_date, song_id)  -- una sola entrada por canción/evento/ocurrencia
      );
    `);
    console.log('✅ Tabla event_song_plays creada (o ya existía)');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => { console.error(err); process.exit(1); });

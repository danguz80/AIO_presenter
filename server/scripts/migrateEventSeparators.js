/**
 * Migración: soporte para separadores en event_songs + tabla event_templates
 * Ejecutar una sola vez: node server/scripts/migrateEventSeparators.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/database');

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Iniciando migración…');

    // Columnas para separadores en event_songs
    await client.query(`
      ALTER TABLE event_songs ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'song';
    `);
    await client.query(`
      ALTER TABLE event_songs ADD COLUMN IF NOT EXISTS separator_label TEXT;
    `);
    await client.query(`
      ALTER TABLE event_songs ADD COLUMN IF NOT EXISTS separator_color VARCHAR(20) DEFAULT '#6366f1';
    `);

    // Hacer song_id nullable para soportar separadores
    const { rows } = await client.query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'event_songs' AND column_name = 'song_id'
    `);
    if (rows.length > 0 && rows[0].is_nullable === 'NO') {
      await client.query(`ALTER TABLE event_songs ALTER COLUMN song_id DROP NOT NULL`);
      console.log('  ✓ event_songs.song_id ahora es nullable');
    } else {
      console.log('  · event_songs.song_id ya era nullable');
    }

    // Tabla de plantillas de eventos
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_templates (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        items      JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Migración completada correctamente');
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

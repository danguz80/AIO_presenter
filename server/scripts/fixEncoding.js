/**
 * fixEncoding.js
 * Repara los datos de la tabla songs que fueron importados con doble codificación UTF-8.
 *
 * Problema: los caracteres especiales (á, é, ñ, etc.) fueron leídos como Latin-1
 * y luego almacenados como UTF-8, generando secuencias dobles como C3 8C C2 81
 * en vez del correcto C3 A1 (para á).
 *
 * Solución: Buffer.from(str, 'latin1').toString('utf8').normalize('NFC')
 * Esto revierte el proceso y deja los caracteres correctos en NFC.
 */

require('dotenv').config();
const pool = require('../src/config/database');

function fix(str) {
  if (!str || typeof str !== 'string') return str;
  try {
    const fixed = Buffer.from(str, 'latin1').toString('utf8').normalize('NFC');
    // Si el resultado tiene caracteres de reemplazo (U+FFFD), el original ya era correcto
    if (fixed.includes('\uFFFD')) return str.normalize('NFC');
    return fixed;
  } catch {
    return str;
  }
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows: songs } = await client.query(
      'SELECT id, title, author FROM songs'
    );

    console.log(`\nCorrigiendo ${songs.length} canciones...\n`);
    let fixed = 0;

    for (const song of songs) {
      const newTitle  = fix(song.title);
      const newAuthor = fix(song.author);

      const changed = newTitle !== song.title || newAuthor !== song.author;

      if (changed) {
        await client.query(
          'UPDATE songs SET title = $1, author = $2 WHERE id = $3',
          [newTitle, newAuthor, song.id]
        );
        console.log(`  ✓ [${song.id}] "${song.title}" → "${newTitle}"`);
        fixed++;
      }
    }

    // También corregir los slides
    const { rows: slides } = await client.query(
      'SELECT id, label, content FROM song_slides'
    );
    console.log(`\nCorrigiendo ${slides.length} slides...\n`);
    let fixedSlides = 0;

    for (const slide of slides) {
      const newLabel   = fix(slide.label);
      const newContent = fix(slide.content);

      if (newLabel !== slide.label || newContent !== slide.content) {
        await client.query(
          'UPDATE song_slides SET label = $1, content = $2 WHERE id = $3',
          [newLabel, newContent, slide.id]
        );
        fixedSlides++;
      }
    }

    console.log(`\n✅ Listo: ${fixed} canciones y ${fixedSlides} slides corregidos.\n`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

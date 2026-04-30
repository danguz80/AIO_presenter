/**
 * fixBracketLabels.js
 *
 * Migración: detecta slides cuyo contenido empieza con una línea "[Label]"
 * que no es un acorde (ej: [Verso], [Coro], [Pre-Coro 2]) y la mueve
 * al campo `label` del slide, actualizando también el `content`.
 *
 * Uso: node scripts/fixBracketLabels.js
 *      node scripts/fixBracketLabels.js --dry-run   (solo muestra, no modifica)
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../src/config/database');

const DRY_RUN = process.argv.includes('--dry-run');

// Misma regex que en SongFormModal y chordproParser
const CHORD_SYMBOL_RE = /^[A-G][#b]?(?:m|M|maj|min|dim|aug|sus[24]?|add\d*|dom|alt)?[0-9]*(?:b\d+|#\d+)*(?:\/[A-G][#b]?)?$/;

function isChordSymbol(str) {
  return CHORD_SYMBOL_RE.test(str.trim());
}

/**
 * Dado el contenido de un slide, detecta si la PRIMERA línea es una etiqueta
 * de sección entre corchetes (no acorde) y la extrae.
 *
 * Retorna { newLabel, newContent } o null si no hay nada que cambiar.
 */
function extractBracketLabel(currentLabel, content) {
  if (!content) return null;
  const lines = content.split('\n');
  const first = lines[0].trim();

  // ¿La primera línea es exactamente [AlgoQueNoEsAcorde]?
  const m = first.match(/^\[([^\]]+)\]$/);
  if (!m) return null;
  const inner = m[1].trim();
  if (isChordSymbol(inner)) return null;

  // Si el label actual ya coincide (sin distinguir mayúsculas), no hay que cambiar
  if (currentLabel && currentLabel.toLowerCase() === inner.toLowerCase()) {
    // Solo quitar la línea del contenido si está duplicada
    const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
    if (rest === content.trimStart().replace(/^\[[^\]]+\]\n?/, '')) {
      return { newLabel: currentLabel, newContent: rest };
    }
    return null;
  }

  // Nuevo label: el texto del corchete, primera letra en mayúscula
  const newLabel = inner.charAt(0).toUpperCase() + inner.slice(1);
  const newContent = lines.slice(1).join('\n').replace(/^\n+/, '');
  return { newLabel, newContent };
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows: slides } = await client.query(
      'SELECT id, song_id, label, content FROM song_slides ORDER BY song_id, position'
    );

    let fixed = 0;
    let skipped = 0;

    for (const slide of slides) {
      const result = extractBracketLabel(slide.label, slide.content);
      if (!result) { skipped++; continue; }

      const { newLabel, newContent } = result;
      console.log(
        `[slide ${slide.id} / song ${slide.song_id}]  label: "${slide.label}" → "${newLabel}"` +
        (DRY_RUN ? '  (dry-run)' : '')
      );

      if (!DRY_RUN) {
        await client.query(
          'UPDATE song_slides SET label = $1, content = $2 WHERE id = $3',
          [newLabel, newContent, slide.id]
        );
      }
      fixed++;
    }

    console.log(`\nTotal slides revisados : ${slides.length}`);
    console.log(`Slides modificados     : ${fixed}`);
    console.log(`Sin cambios            : ${skipped}`);
    if (DRY_RUN) console.log('\n⚠️  Modo dry-run: NO se escribió nada en la BD.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

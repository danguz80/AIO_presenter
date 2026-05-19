/**
 * Elimina libros duplicados en Railway: conserva solo los que tienen versículos.
 * Uso: node scripts/cleanDuplicateBooks.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const remote = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  // ── Estado antes ──────────────────────────────────────────────────────────
  const { rows: [before] } = await remote.query('SELECT COUNT(*) FROM bible_books');
  const { rows: [vBefore] } = await remote.query('SELECT COUNT(*) FROM bible_verses');
  console.log(`Antes → libros: ${before.count}  versículos: ${vBefore.count}`);

  // ── Encontrar duplicados: mismo (version_id, book_number) ─────────────────
  const { rows: dups } = await remote.query(`
    SELECT version_id, book_number, COUNT(*) as cnt, array_agg(id ORDER BY id) as ids
    FROM bible_books
    GROUP BY version_id, book_number
    HAVING COUNT(*) > 1
  `);
  console.log(`Grupos duplicados: ${dups.length}`);

  if (dups.length === 0) {
    console.log('No hay duplicados. Nada que limpiar.');
    process.exit(0);
  }

  // ── Para cada duplicado: conservar el de ID menor, borrar el resto (CASCADE borra sus versículos) ─
  let deleted = 0;
  for (const dup of dups) {
    const ids = dup.ids; // array ordenado [id_menor, id_mayor, ...]
    const toDelete = ids.slice(1); // conservar ids[0], borrar el resto
    await remote.query('DELETE FROM bible_books WHERE id = ANY($1)', [toDelete]);
    deleted += toDelete.length;
  }

  const { rows: [after] } = await remote.query('SELECT COUNT(*) FROM bible_books');
  const { rows: [vAfter] } = await remote.query('SELECT COUNT(*) FROM bible_verses');
  console.log(`\nEliminados: ${deleted} libros duplicados`);
  console.log(`Después  → libros: ${after.count}  versículos: ${vAfter.count}`);
  process.exit(0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });

/**
 * Migración rápida de la Biblia (bible_versions, bible_books, bible_verses)
 * desde la BD local a Railway. Usa inserts por lotes para máxima velocidad.
 *
 * Uso: node scripts/migrateBibleFast.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const BATCH = 500; // filas por INSERT

const local = new Pool({
  host: 'localhost', port: 5432, database: 'aio_presenter',
  user: 'postgres',
  password: process.env.DB_LOCAL_PASSWORD || process.env.DB_PASSWORD || '',
});

const remote = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Inserta filas en lotes usando multi-value INSERT
async function batchInsert(pool, table, columns, rows, onConflict = '') {
  if (!rows.length) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let pi = 1;
    for (const row of chunk) {
      values.push(`(${columns.map(() => `$${pi++}`).join(',')})`);
      params.push(...row);
    }
    await pool.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')} ${onConflict}`,
      params
    );
    inserted += chunk.length;
  }
  return inserted;
}

(async () => {
  console.log('Conectando...');
  await local.query('SELECT 1');
  await remote.query('SELECT 1');
  console.log('✅ Conexiones OK\n');

  // ── 1. Crear tablas en Railway si no existen ────────────────────────────────
  await remote.query(`
    CREATE TABLE IF NOT EXISTS bible_versions (
      id           SERIAL PRIMARY KEY,
      abbreviation VARCHAR(20),
      name         VARCHAR(100) NOT NULL,
      language     VARCHAR(10) DEFAULT 'es'
    )
  `);
  await remote.query(`
    CREATE TABLE IF NOT EXISTS bible_books (
      id          SERIAL PRIMARY KEY,
      version_id  INTEGER REFERENCES bible_versions(id) ON DELETE CASCADE,
      book_number INTEGER,
      name        VARCHAR(100),
      abbrev      VARCHAR(20),
      testament   VARCHAR(10)
    )
  `);
  await remote.query(`
    CREATE TABLE IF NOT EXISTS bible_verses (
      id       SERIAL PRIMARY KEY,
      book_id  INTEGER REFERENCES bible_books(id) ON DELETE CASCADE,
      chapter  INTEGER,
      verse    INTEGER,
      text     TEXT
    )
  `);

  // ── 2. Verificar si ya hay datos en Railway ─────────────────────────────────
  const { rows: [rvCount] } = await remote.query('SELECT COUNT(*) FROM bible_verses');
  if (parseInt(rvCount.count) > 0) {
    console.log(`Railway ya tiene ${rvCount.count} versículos. Nada que migrar.`);
    process.exit(0);
  }

  // ── 3. Leer versiones locales ───────────────────────────────────────────────
  console.log('Leyendo versiones...');
  const { rows: versions } = await local.query('SELECT * FROM bible_versions ORDER BY id');
  console.log(`  ${versions.length} versiones encontradas`);

  const versionIdMap = {}; // local_id → remote_id
  for (const v of versions) {
    // Usar upsert para evitar duplicados por abbreviation
    const { rows: [rv] } = await remote.query(
      `INSERT INTO bible_versions (abbreviation, name, language)
       VALUES ($1, $2, $3)
       ON CONFLICT (abbreviation) DO UPDATE SET name=EXCLUDED.name
       RETURNING id`,
      [v.abbreviation || null, v.name, v.language || 'es']
    );
    versionIdMap[v.id] = rv.id;
  }
  console.log('  Versiones migradas/mapeadas:', Object.keys(versionIdMap).length);

  // ── 4. Leer libros locales ──────────────────────────────────────────────────
  console.log('\nLeyendo libros...');
  const { rows: books } = await local.query('SELECT * FROM bible_books ORDER BY id');
  console.log(`  ${books.length} libros encontrados`);

  const bookIdMap = {}; // local_id → remote_id
  // Insertar todos los libros en un solo lote
  for (const book of books) {
    const remoteVersionId = versionIdMap[book.version_id] || null;
    const { rows: [rb] } = await remote.query(
      `INSERT INTO bible_books (version_id, book_number, name, abbrev, testament)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [remoteVersionId, book.book_number, book.name, book.abbrev || null, book.testament || null]
    );
    bookIdMap[book.id] = rb.id;
  }
  console.log(`  ${books.length} libros migrados`);

  // ── 5. Leer y migrar versículos en lotes ────────────────────────────────────
  console.log('\nMigrando versículos...');
  const { rows: [total] } = await local.query('SELECT COUNT(*) FROM bible_verses');
  const totalCount = parseInt(total.count);
  console.log(`  Total: ${totalCount} versículos`);

  const PAGE = 5000; // leer de local de 5000 en 5000
  let offset = 0;
  let migrated = 0;

  while (offset < totalCount) {
    const { rows: verses } = await local.query(
      'SELECT book_id, chapter, verse, text FROM bible_verses ORDER BY id LIMIT $1 OFFSET $2',
      [PAGE, offset]
    );
    if (!verses.length) break;

    // Mapear book_id local → remote
    const rows = verses.map(v => [bookIdMap[v.book_id], v.chapter, v.verse, v.text]);
    const inserted = await batchInsert(
      remote,
      'bible_verses',
      ['book_id', 'chapter', 'verse', 'text'],
      rows
    );
    migrated += inserted;
    offset += PAGE;
    process.stdout.write(`\r  ${migrated}/${totalCount} versículos migrados...`);
  }

  console.log(`\n✅ Biblia migrada: ${migrated} versículos, ${books.length} libros`);
  process.exit(0);
})().catch(e => {
  console.error('\nError:', e.message);
  process.exit(1);
});

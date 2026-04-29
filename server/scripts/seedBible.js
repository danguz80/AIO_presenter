/**
 * seedBible.js — Inserta los 66 libros para cada versión en bible_books
 * y carga versículos desde GitHub (RVR y KJV).
 *
 * Fuentes:
 *   RVR: https://github.com/thiagobodruk/bible  (es_rvr.json)
 *   KJV: https://github.com/aruljohn/Bible-kjv  (un JSON por libro)
 *
 * Uso: node scripts/seedBible.js [--only-books]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../src/config/database');
const https = require('https');

const BOOKS = [
  { n:  1, name:'Génesis',        abbrev:'Gn',  testament:'OT' },
  { n:  2, name:'Éxodo',          abbrev:'Ex',  testament:'OT' },
  { n:  3, name:'Levítico',       abbrev:'Lv',  testament:'OT' },
  { n:  4, name:'Números',        abbrev:'Nm',  testament:'OT' },
  { n:  5, name:'Deuteronomio',   abbrev:'Dt',  testament:'OT' },
  { n:  6, name:'Josué',          abbrev:'Jos', testament:'OT' },
  { n:  7, name:'Jueces',         abbrev:'Jue', testament:'OT' },
  { n:  8, name:'Rut',            abbrev:'Rt',  testament:'OT' },
  { n:  9, name:'1 Samuel',       abbrev:'1S',  testament:'OT' },
  { n: 10, name:'2 Samuel',       abbrev:'2S',  testament:'OT' },
  { n: 11, name:'1 Reyes',        abbrev:'1R',  testament:'OT' },
  { n: 12, name:'2 Reyes',        abbrev:'2R',  testament:'OT' },
  { n: 13, name:'1 Crónicas',     abbrev:'1Cr', testament:'OT' },
  { n: 14, name:'2 Crónicas',     abbrev:'2Cr', testament:'OT' },
  { n: 15, name:'Esdras',         abbrev:'Esd', testament:'OT' },
  { n: 16, name:'Nehemías',       abbrev:'Neh', testament:'OT' },
  { n: 17, name:'Ester',          abbrev:'Est', testament:'OT' },
  { n: 18, name:'Job',            abbrev:'Job', testament:'OT' },
  { n: 19, name:'Salmos',         abbrev:'Sal', testament:'OT' },
  { n: 20, name:'Proverbios',     abbrev:'Pr',  testament:'OT' },
  { n: 21, name:'Eclesiastés',    abbrev:'Ec',  testament:'OT' },
  { n: 22, name:'Cantares',       abbrev:'Cnt', testament:'OT' },
  { n: 23, name:'Isaías',         abbrev:'Is',  testament:'OT' },
  { n: 24, name:'Jeremías',       abbrev:'Jer', testament:'OT' },
  { n: 25, name:'Lamentaciones',  abbrev:'Lm',  testament:'OT' },
  { n: 26, name:'Ezequiel',       abbrev:'Ez',  testament:'OT' },
  { n: 27, name:'Daniel',         abbrev:'Dn',  testament:'OT' },
  { n: 28, name:'Oseas',          abbrev:'Os',  testament:'OT' },
  { n: 29, name:'Joel',           abbrev:'Jl',  testament:'OT' },
  { n: 30, name:'Amós',           abbrev:'Am',  testament:'OT' },
  { n: 31, name:'Abdías',         abbrev:'Abd', testament:'OT' },
  { n: 32, name:'Jonás',          abbrev:'Jon', testament:'OT' },
  { n: 33, name:'Miqueas',        abbrev:'Mi',  testament:'OT' },
  { n: 34, name:'Nahúm',          abbrev:'Nah', testament:'OT' },
  { n: 35, name:'Habacuc',        abbrev:'Hab', testament:'OT' },
  { n: 36, name:'Sofonías',       abbrev:'Sof', testament:'OT' },
  { n: 37, name:'Hageo',          abbrev:'Hag', testament:'OT' },
  { n: 38, name:'Zacarías',       abbrev:'Zac', testament:'OT' },
  { n: 39, name:'Malaquías',      abbrev:'Mal', testament:'OT' },
  { n: 40, name:'Mateo',          abbrev:'Mt',  testament:'NT' },
  { n: 41, name:'Marcos',         abbrev:'Mr',  testament:'NT' },
  { n: 42, name:'Lucas',          abbrev:'Lc',  testament:'NT' },
  { n: 43, name:'Juan',           abbrev:'Jn',  testament:'NT' },
  { n: 44, name:'Hechos',         abbrev:'Hch', testament:'NT' },
  { n: 45, name:'Romanos',        abbrev:'Ro',  testament:'NT' },
  { n: 46, name:'1 Corintios',    abbrev:'1Co', testament:'NT' },
  { n: 47, name:'2 Corintios',    abbrev:'2Co', testament:'NT' },
  { n: 48, name:'Gálatas',        abbrev:'Gá',  testament:'NT' },
  { n: 49, name:'Efesios',        abbrev:'Ef',  testament:'NT' },
  { n: 50, name:'Filipenses',     abbrev:'Flp', testament:'NT' },
  { n: 51, name:'Colosenses',     abbrev:'Col', testament:'NT' },
  { n: 52, name:'1 Tesalonicenses',abbrev:'1Ts',testament:'NT' },
  { n: 53, name:'2 Tesalonicenses',abbrev:'2Ts',testament:'NT' },
  { n: 54, name:'1 Timoteo',      abbrev:'1Ti', testament:'NT' },
  { n: 55, name:'2 Timoteo',      abbrev:'2Ti', testament:'NT' },
  { n: 56, name:'Tito',           abbrev:'Tit', testament:'NT' },
  { n: 57, name:'Filemón',        abbrev:'Flm', testament:'NT' },
  { n: 58, name:'Hebreos',        abbrev:'He',  testament:'NT' },
  { n: 59, name:'Santiago',       abbrev:'Stg', testament:'NT' },
  { n: 60, name:'1 Pedro',        abbrev:'1P',  testament:'NT' },
  { n: 61, name:'2 Pedro',        abbrev:'2P',  testament:'NT' },
  { n: 62, name:'1 Juan',         abbrev:'1Jn', testament:'NT' },
  { n: 63, name:'2 Juan',         abbrev:'2Jn', testament:'NT' },
  { n: 64, name:'3 Juan',         abbrev:'3Jn', testament:'NT' },
  { n: 65, name:'Judas',          abbrev:'Jud', testament:'NT' },
  { n: 66, name:'Apocalipsis',    abbrev:'Ap',  testament:'NT' },
];

// Nombres de archivos KJV en GitHub (mismo orden que BOOKS)
const KJV_FILES = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  '1Samuel','2Samuel','1Kings','2Kings','1Chronicles','2Chronicles','Ezra','Nehemiah',
  'Esther','Job','Psalms','Proverbs','Ecclesiastes','SongofSolomon','Isaiah','Jeremiah',
  'Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah',
  'Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi',
  'Matthew','Mark','Luke','John','Acts','Romans','1Corinthians','2Corinthians','Galatians',
  'Ephesians','Philippians','Colossians','1Thessalonians','2Thessalonians',
  '1Timothy','2Timothy','Titus','Philemon','Hebrews','James',
  '1Peter','2Peter','1John','2John','3John','Jude','Revelation',
];

function getBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AIOPresenter/1.0' } }, (res) => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function seedBooks(versionId) {
  const client = await pool.connect();
  try {
    for (const b of BOOKS) {
      await client.query(
        `INSERT INTO bible_books (version_id, book_number, name, abbrev, testament)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING`,
        [versionId, b.n, b.name, b.abbrev, b.testament]
      );
    }
    console.log(`  ✓ ${BOOKS.length} libros para version_id=${versionId}`);
  } finally { client.release(); }
}

async function insertVerses(bookId, chapters) {
  // chapters: array of arrays of strings (RVR) or array of {chapter, verses:[{verse,text}]} (KJV)
  const client = await pool.connect();
  try {
    for (let ci = 0; ci < chapters.length; ci++) {
      const chNum = ci + 1;
      const verses = chapters[ci]; // array of strings (RVR) or array of {verse,text} (KJV)
      for (let vi = 0; vi < verses.length; vi++) {
        const vNum = vi + 1;
        const text = typeof verses[vi] === 'string' ? verses[vi].trim() : verses[vi].text.trim();
        await client.query(
          `INSERT INTO bible_verses (book_id, chapter, verse, text)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (book_id, chapter, verse) DO NOTHING`,
          [bookId, chNum, vNum, text]
        );
      }
    }
  } finally { client.release(); }
}

async function seedRVR(versionId) {
  console.log('\n→ Descargando RVR (es_rvr.json)...');
  const buf = await getBuffer('https://raw.githubusercontent.com/thiagobodruk/bible/master/json/es_rvr.json');
  const raw = JSON.parse(buf.toString('utf-8').replace(/^\uFEFF/, ''));

  const { rows: books } = await pool.query(
    'SELECT id, book_number FROM bible_books WHERE version_id=$1 ORDER BY book_number', [versionId]
  );

  for (const book of books) {
    const srcBook = raw[book.book_number - 1];
    if (!srcBook) { process.stdout.write('?'); continue; }
    await insertVerses(book.id, srcBook.chapters);
    process.stdout.write('.');
  }
  console.log('\n  ✓ RVR completado');
}

async function seedKJV(versionId) {
  console.log('\n→ Descargando KJV (un archivo por libro)...');
  const { rows: books } = await pool.query(
    'SELECT id, book_number FROM bible_books WHERE version_id=$1 ORDER BY book_number', [versionId]
  );

  for (const book of books) {
    const fileName = KJV_FILES[book.book_number - 1];
    if (!fileName) { process.stdout.write('?'); continue; }
    try {
      const buf = await getBuffer(`https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/${fileName}.json`);
      const data = JSON.parse(buf.toString('utf-8'));
      // data.chapters = [{chapter:'1', verses:[{verse:'1', text:'...'}]}]
      const chapters = data.chapters.map(ch => ch.verses);
      await insertVerses(book.id, chapters);
      process.stdout.write('.');
    } catch(e) {
      process.stdout.write('E');
    }
  }
  console.log('\n  ✓ KJV completado');
}

async function main() {
  const onlyBooks = process.argv.includes('--only-books');
  const { rows: versions } = await pool.query('SELECT * FROM bible_versions ORDER BY id');
  console.log('Versiones:', versions.map(v => `${v.id}:${v.abbreviation}`).join(', '));

  console.log('\n→ Insertando libros...');
  for (const v of versions) await seedBooks(v.id);

  if (!onlyBooks) {
    const rvr = versions.find(v => v.abbreviation === 'RVR60');
    const kjv = versions.find(v => v.abbreviation === 'KJV');
    if (rvr) await seedRVR(rvr.id);
    if (kjv) await seedKJV(kjv.id);
  }

  console.log('\n✅ Seed completado.');
  await pool.end();
}

main().catch(err => { console.error('ERROR:', err.message); pool.end(); process.exit(1); });


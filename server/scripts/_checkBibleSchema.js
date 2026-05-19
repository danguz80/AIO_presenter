require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const localPool = new Pool({
  host: 'localhost', port: 5432, database: 'aio_presenter',
  user: 'postgres', password: process.env.DB_LOCAL_PASSWORD || process.env.DB_PASSWORD || '',
});
(async () => {
  const tables = await localPool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'bible%' ORDER BY table_name"
  );
  console.log('Tablas:', tables.rows.map(r => r.table_name));
  const cols = await localPool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='bible_verses' ORDER BY ordinal_position"
  );
  console.log('Cols bible_verses:', cols.rows.map(r => r.column_name));
  const cols2 = await localPool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='bible_books' ORDER BY ordinal_position"
  );
  console.log('Cols bible_books:', cols2.rows.map(r => r.column_name));
  const cols3 = await localPool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='bible_versions' ORDER BY ordinal_position"
  );
  console.log('Cols bible_versions:', cols3.rows.map(r => r.column_name));
  const sample = await localPool.query('SELECT * FROM bible_versions LIMIT 5');
  console.log('Sample bible_versions:', JSON.stringify(sample.rows));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

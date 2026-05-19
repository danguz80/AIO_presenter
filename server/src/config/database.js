const { Pool } = require('pg');
require('dotenv').config();

// Railway inyecta DATABASE_URL automáticamente.
// En desarrollo se usan las variables individuales.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      client_encoding: 'UTF8',
    })
  : new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME     || 'aio_presenter',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
      client_encoding: 'UTF8',
    });

pool.on('connect', () => {
  console.log('[DB] Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Error en el pool:', err.message);
});

module.exports = pool;

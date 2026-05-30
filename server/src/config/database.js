const { Pool } = require('pg');
require('dotenv').config();

// Configuración robusta del pool para evitar ETIMEDOUT en Railway
const POOL_CONFIG = {
  max:                  5,      // máx conexiones simultáneas (Railway tiene límite)
  idleTimeoutMillis:    30000,  // cerrar conexión inactiva tras 30 s
  connectionTimeoutMillis: 10000, // error si no consigue conexión en 10 s
  keepAlive:            true,
  keepAliveInitialDelayMillis: 10000,
};

// Railway inyecta DATABASE_URL automáticamente.
// En desarrollo se usan las variables individuales.
const pool = process.env.DATABASE_URL
  ? new Pool({
      ...POOL_CONFIG,
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      client_encoding: 'UTF8',
    })
  : new Pool({
      ...POOL_CONFIG,
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

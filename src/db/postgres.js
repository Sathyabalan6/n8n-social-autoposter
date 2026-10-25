const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('../logger');

let pool = null;

function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGDATABASE));
}

function getPool() {
  if (!pool && isPostgresConfigured()) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      host: process.env.PGHOST,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      max: parseInt(process.env.PG_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
    });

    pool.on('error', (err) => {
      logger.error({ err: err.message }, 'Unexpected error on idle PostgreSQL client');
    });
  }
  return pool;
}

async function runPostgresMigrations() {
  const p = getPool();
  if (!p) return;
  logger.info('Applying enterprise PostgreSQL migrations...');
  const schemaPath = path.join(__dirname, 'postgres-schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await p.connect();
  try {
    await client.query(sql);
    logger.info('Enterprise PostgreSQL migrations applied successfully.');
  } finally {
    client.release();
  }
}

async function checkPostgresHealth() {
  const p = getPool();
  if (!p) return { configured: false, status: 'disabled' };
  try {
    const res = await p.query('SELECT 1 as healthy');
    return { configured: true, status: 'connected', latencyMs: 0, healthy: res.rows[0]?.healthy === 1 };
  } catch (err) {
    return { configured: true, status: 'error', error: err.message };
  }
}

module.exports = {
  isPostgresConfigured,
  getPool,
  runPostgresMigrations,
  checkPostgresHealth
};

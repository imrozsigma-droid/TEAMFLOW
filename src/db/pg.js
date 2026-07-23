/**
 * 🗄️ PostgreSQL Direct Client
 * Used for migrations and raw SQL queries.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Missing DATABASE_URL in .env\n' +
    'Get it from: Supabase Dashboard → Project Settings → Database → Connection string'
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  options: '-c timezone=UTC',
  min: 2,
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  application_name: process.env.npm_package_name || 'backend',
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

export async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn('⚠️ Slow query (' + duration + 'ms):', text.substring(0, 100));
  }
  return result;
}

export default pool;

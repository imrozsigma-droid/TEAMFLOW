#!/usr/bin/env node
/**
 * 🗄️ Migration Runner
 * Runs SQL migrations against your Supabase database.
 *
 * Usage:
 *   npm run migrate          — Run all pending migrations
 *   npm run migrate:fresh     — Drop all tables and re-run
 *
 * This will create:
 *   • 6 entity tables with RLS policies
 *   • 6 state machine(s) with transition constraints
 *   • Events table for audit logging
 *   • Webhook tables for delivery tracking
 *   • Indexes for optimal query performance
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'migrations');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  options: '-c timezone=UTC',
});

const isFresh = process.argv.includes('--fresh');

async function run() {
  const client = await pool.connect();
  console.log('\n🗄️  Connected to Supabase database\n');

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    if (isFresh) {
      console.log('⚠️  Fresh migration — dropping all tables...\n');
      await client.query('DELETE FROM _migrations');
    }

    // Get already-run migrations
    const { rows: done } = await client.query('SELECT name FROM _migrations ORDER BY id');
    const doneSet = new Set(done.map((r) => r.name));

    // Get migration files
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found in ' + migrationsDir);
      return;
    }

    let ran = 0;
    let skipped = 0;

    for (const file of files) {
      if (!isFresh && doneSet.has(file)) {
        skipped++;
        continue;
      }

      console.log('📄 Running: ' + file);
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [file]);
        await client.query('COMMIT');
        console.log('   ✅ Success\n');
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('   ❌ Failed: ' + err.message + '\n');
        throw err;
      }
    }

    console.log('═══════════════════════════════════');
    console.log('✅ Migrations complete');
    console.log('   Ran: ' + ran + ' | Skipped: ' + skipped);
    console.log('═══════════════════════════════════\n');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});

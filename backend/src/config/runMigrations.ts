import fs from 'fs';
import path from 'path';
import pool from './database';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Migrations');

/**
 * Apply the idempotent schema bootstrap (backend/src/db/schema.sql) on startup.
 *
 * The file uses IF NOT EXISTS / ON CONFLICT throughout, so it is safe to run on
 * every boot against both fresh and existing databases. It reconciles the
 * historical init.sql vs add_*.sql split (feature tables) and removes the legacy
 * budget_shares table.
 *
 * We resolve the SQL path relative to this module so it works under both
 * ts-node-dev (src/) and the compiled build (dist/, populated by the build's
 * copy step).
 */
export async function runMigrations(): Promise<void> {
  const candidates = [
    path.join(__dirname, '../db/schema.sql'), // dist/db or src/db relative to config
    path.join(process.cwd(), 'src/db/schema.sql'),
    path.join(process.cwd(), 'dist/db/schema.sql'),
  ];

  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    logger.error('Schema bootstrap file not found; skipping migrations', undefined, {
      searched: candidates,
    });
    throw new Error('schema.sql not found — cannot ensure database schema');
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    // node-postgres runs multiple semicolon-separated statements in a single
    // (non-parameterized) query call.
    await pool.query(sql);
    logger.info('Database schema ensured (migrations applied)', { schemaPath });
  } catch (error) {
    logger.error('Failed to apply schema bootstrap', error as Error);
    throw error;
  }
}

export default runMigrations;

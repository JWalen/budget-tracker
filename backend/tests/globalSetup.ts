// Jest globalSetup — runs ONCE before any test suite, in a clean Node context
// with no per-test mocks. Provisions the test database with the converged
// production schema: base tables (database/init.sql) then the additive bootstrap
// (schema.sql via runMigrations). Idempotent, so it's safe against an existing DB.
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export default async function globalSetup(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    'postgresql://budget_user:budget_pass@localhost:5432/budget_test';

  const pool = new Pool({ connectionString });
  try {
    // Base tables. init.sql uses bare CREATE TABLE, so on a DB that already has
    // them the first statement throws 42P07 — treat that as "already provisioned".
    const initSql = path.resolve(__dirname, '../../database/init.sql');
    if (fs.existsSync(initSql)) {
      try {
        await pool.query(fs.readFileSync(initSql, 'utf-8'));
      } catch (e: any) {
        if (e.code !== '42P07' && e.code !== '42710') throw e;
      }
    }

    // Additive/idempotent bootstrap (organizations, notifications, receipts,
    // constraints, drops budget_shares, …).
    const candidates = [
      path.resolve(__dirname, '../src/db/schema.sql'),
      path.resolve(__dirname, '../dist/db/schema.sql'),
    ];
    const schemaPath = candidates.find((p) => fs.existsSync(p));
    if (schemaPath) {
      await pool.query(fs.readFileSync(schemaPath, 'utf-8'));
    }
  } finally {
    await pool.end();
  }
}

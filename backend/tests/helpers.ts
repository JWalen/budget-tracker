import { query } from '../src/config/database';
import bcrypt from 'bcryptjs';

export const testUser = {
  email: 'test@example.com',
  password: 'Test123!Pass',
  name: 'Test User',
};

// Reference/seed tables that hold shared data (not per-user) and must survive a
// clean between tests.
const PRESERVE_TABLES = new Set([
  'currencies',
  'budget_templates',
  'system_settings',
  'email_config',
]);

export const cleanDatabase = async () => {
  // Truncate every user-data table dynamically. Doing this from the live schema
  // (rather than a hardcoded list) means a dropped table like budget_shares can't
  // make the whole TRUNCATE fail with 42P01 and silently truncate nothing — the
  // bug that let user rows accumulate across tests and throw duplicate-key errors.
  const result = await query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const tables = result.rows
    .map((r: any) => r.tablename)
    .filter((t: string) => !PRESERVE_TABLES.has(t));

  if (tables.length === 0) return;

  const list = tables.map((t: string) => `"${t}"`).join(', ');
  await query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
};

export const createTestUser = async (overrides: Partial<typeof testUser> = {}) => {
  const data = { ...testUser, ...overrides };
  const passwordHash = await bcrypt.hash(data.password, 10);
  const result = await query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, mfa_enabled, is_admin',
    [data.email, passwordHash, data.name]
  );
  return result.rows[0];
};

export const createTestCategory = async (userId: number, type: 'income' | 'expense' = 'expense') => {
  const result = await query(
    'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, `Test ${type}`, type, '#3b82f6']
  );
  return result.rows[0];
};

export const createTestTransaction = async (userId: number, categoryId: number, overrides: any = {}) => {
  const defaults = {
    amount: 100.00,
    description: 'Test transaction',
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
  };
  
  const data = { ...defaults, ...overrides };
  
  const result = await query(
    'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, categoryId, data.amount, data.description, data.date, data.type]
  );
  return result.rows[0];
};

export const getAuthToken = (userId: number): string => {
  const jwt = require('jsonwebtoken');
  // Must match what TokenService issues and verifyAccessToken checks: type +
  // issuer + audience, signed HS256. A bare { userId } token is now rejected.
  return jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: 'budget-tracker', audience: 'budget-tracker-api' }
  );
};

import { query } from '../src/config/database';
import bcrypt from 'bcryptjs';

export const testUser = {
  email: 'test@example.com',
  password: 'Test123!Pass',
  name: 'Test User',
};

export const cleanDatabase = async () => {
  // Use TRUNCATE CASCADE to clean all tables efficiently and handle foreign keys
  // List tables that should be preserved if any (e.g. migrations, but we don't have them here)
  const tables = [
    'refresh_tokens',
    'login_attempts',
    'pay_period_bills',
    'bill_payments',
    'pay_periods',
    'debts',
    'bills',
    'budgets',
    'recurring_transactions',
    'transactions',
    'match_rules',
    'budget_shares',
    'spending_limits',
    'spending_alerts',
    'approval_requests',
    'allowance_transactions',
    'family_members',
    'account_balances',
    'bank_accounts',
    'categories',
    'users',
  ];

  try {
    // Disable triggers temporarily to speed up deletion if needed, but TRUNCATE CASCADE is usually enough
    await query(`TRUNCATE TABLE ${tables.join(', ')} CASCADE`);
  } catch (error: any) {
    if (error.code !== '42P01') { // 42P01 is "undefined_table"
      console.error('Error cleaning database:', error);
      throw error;
    }
  }
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
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

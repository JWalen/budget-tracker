import request from 'supertest';
import express from 'express';
import dashboardRoutes from '../../../src/routes/dashboard';
import { cleanDatabase, createTestUser, getAuthToken } from '../../helpers';
import { query } from '../../../src/config/database';

const app = express();
app.use(express.json());
app.use('/api/dashboard', dashboardRoutes);

describe('Dashboard API', () => {
  let userId: number;
  let token: string;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    token = getAuthToken(userId);
  });

  const setupTestData = async () => {
    // Create income category
    const incomeCat = await query(
      'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, 'Salary', 'income', '#22c55e']
    );

    // Create expense category
    const expenseCat = await query(
      'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, 'Food', 'expense', '#f97316']
    );

    // Create income transaction
    await query(
      'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, incomeCat.rows[0].id, 5000, 'March Salary', '2026-03-15', 'income']
    );

    // Create expense transactions
    await query(
      'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, expenseCat.rows[0].id, 200, 'Groceries', '2026-03-10', 'expense']
    );
    await query(
      'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, expenseCat.rows[0].id, 50, 'Lunch', '2026-03-12', 'expense']
    );

    return { incomeCatId: incomeCat.rows[0].id, expenseCatId: expenseCat.rows[0].id };
  };

  describe('GET /api/dashboard/summary', () => {
    it('should return correct income/expense totals', async () => {
      await setupTestData();

      const response = await request(app)
        .get('/api/dashboard/summary?month=3&year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.income).toBe(5000);
      expect(response.body.expenses).toBe(250);
    });

    it('should calculate correct balance', async () => {
      await setupTestData();

      const response = await request(app)
        .get('/api/dashboard/summary?month=3&year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.balance).toBe(4750); // 5000 - 250
    });

    it('should include spending by category', async () => {
      await setupTestData();

      const response = await request(app)
        .get('/api/dashboard/summary?month=3&year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.byCategory).toBeDefined();
      expect(Array.isArray(response.body.byCategory)).toBe(true);
      expect(response.body.byCategory.length).toBeGreaterThan(0);
      expect(response.body.byCategory[0]).toHaveProperty('name');
      expect(response.body.byCategory[0]).toHaveProperty('total');
    });

    it('should exclude categories with exclude_from_income from income totals', async () => {
      // Create an excluded income category
      const excludedCat = await query(
        'INSERT INTO categories (user_id, name, type, color, exclude_from_income) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [userId, 'Reimbursement', 'income', '#999999', true]
      );

      // Add a regular income
      const regularCat = await query(
        'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, 'Salary', 'income', '#22c55e']
      );

      await query(
        'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, regularCat.rows[0].id, 3000, 'Salary', '2026-03-15', 'income']
      );
      await query(
        'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, excludedCat.rows[0].id, 500, 'Reimbursement', '2026-03-20', 'income']
      );

      const response = await request(app)
        .get('/api/dashboard/summary?month=3&year=2026')
        .set('Authorization', `Bearer ${token}`);

      // Should only include the regular salary, not the reimbursement
      expect(response.body.income).toBe(3000);
    });

    it('should return zero totals for month with no transactions', async () => {
      const response = await request(app)
        .get('/api/dashboard/summary?month=1&year=2025')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.income).toBe(0);
      expect(response.body.expenses).toBe(0);
      expect(response.body.balance).toBe(0);
    });

    it('should not return other users data', async () => {
      await setupTestData();
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .get('/api/dashboard/summary?month=3&year=2026')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.body.income).toBe(0);
      expect(response.body.expenses).toBe(0);
    });

    it('should reject without auth', async () => {
      const response = await request(app).get('/api/dashboard/summary');
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/dashboard/trend', () => {
    it('should return trend data', async () => {
      await setupTestData();

      const response = await request(app)
        .get('/api/dashboard/trend')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should reject without auth', async () => {
      const response = await request(app).get('/api/dashboard/trend');
      expect(response.status).toBe(401);
    });
  });
});

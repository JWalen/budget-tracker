import request from 'supertest';
import express from 'express';
import budgetRoutes from '../../../src/routes/budgets';
import { cleanDatabase, createTestUser, createTestCategory, getAuthToken } from '../../helpers';

const app = express();
app.use(express.json());
// Mock middleware to simulate what app.ts does
app.use((req, res, next) => {
  // @ts-ignore
  req.user = { id: req.headers['mock-user-id'] }; 
  next();
});
app.use('/api/budgets', budgetRoutes);

describe('Budgets API', () => {
  let userId: number;
  let token: string;
  let categoryId: number;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    token = getAuthToken(userId);
    const category = await createTestCategory(userId, 'expense');
    categoryId = category.id;
  });

  describe('POST /api/budgets', () => {
    it('should create a budget with valid data', async () => {
      const budgetData = {
        category_id: categoryId,
        amount_limit: 500.00,
        month: 2,
        year: 2026,
      };

      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send(budgetData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(Number(response.body.amount_limit)).toBe(500.00);
      expect(response.body.month).toBe(2);
      expect(response.body.year).toBe(2026);
    });

    it('should reject budget without authentication', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          category_id: categoryId,
          amount_limit: 500.00,
          month: 2,
          year: 2026,
        });

      expect(response.status).toBe(401);
    });

    it('should update existing budget on conflict (upsert)', async () => {
      // Create first budget
      await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: categoryId,
          amount_limit: 500.00,
          month: 2,
          year: 2026,
        });

      // Update same budget
      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: categoryId,
          amount_limit: 600.00,
          month: 2,
          year: 2026,
        });

      expect(response.status).toBe(201);
      expect(Number(response.body.amount_limit)).toBe(600.00);
    });
  });

  describe('GET /api/budgets', () => {
    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      await query(
        'INSERT INTO budgets (user_id, category_id, amount_limit, month, year) VALUES ($1, $2, $3, $4, $5)',
        [userId, categoryId, 500.00, 2, 2026]
      );
    });

    it('should get all user budgets for a specific month', async () => {
      const response = await request(app)
        .get('/api/budgets?month=2&year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(Number(response.body[0].amount_limit)).toBe(500.00);
    });

    it('should include category information', async () => {
      const response = await request(app)
        .get('/api/budgets?month=2&year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body[0]).toHaveProperty('category_name');
      expect(response.body[0]).toHaveProperty('category_color');
    });

    it('should not return other users budgets', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherCategory = await createTestCategory(otherUser.id);
      const { query } = require('../../../src/config/database');
      await query(
        'INSERT INTO budgets (user_id, category_id, amount_limit, month, year) VALUES ($1, $2, $3, $4, $5)',
        [otherUser.id, otherCategory.id, 1000.00, 2, 2026]
      );

      const response = await request(app)
        .get('/api/budgets?month=2&year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.every((b: any) => b.user_id === userId)).toBe(true);
    });
  });

  describe('PUT /api/budgets/:id', () => {
    let budgetId: number;

    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      const result = await query(
        'INSERT INTO budgets (user_id, category_id, amount_limit, month, year) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, categoryId, 500.00, 2, 2026]
      );
      budgetId = result.rows[0].id;
    });

    it('should update own budget', async () => {
      const response = await request(app)
        .put(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount_limit: 750.00 });

      expect(response.status).toBe(200);
      expect(Number(response.body.amount_limit)).toBe(750.00);
    });

    it('should not update other users budget', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .put(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ amount_limit: 999.00 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/budgets/:id', () => {
    let budgetId: number;

    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      const result = await query(
        'INSERT INTO budgets (user_id, category_id, amount_limit, month, year) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [userId, categoryId, 500.00, 2, 2026]
      );
      budgetId = result.rows[0].id;
    });

    it('should delete own budget', async () => {
      const response = await request(app)
        .delete(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should not delete other users budget', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });
});

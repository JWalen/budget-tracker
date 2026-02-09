import request from 'supertest';
import express from 'express';
import budgetRoutes from '../../../src/routes/budgets';
import { cleanDatabase, createTestUser, createTestCategory, getAuthToken } from '../../helpers';

const app = express();
app.use(express.json());
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
        amount: 500.00,
        period: 'monthly',
      };

      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send(budgetData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.amount).toBe('500.00');
      expect(response.body.period).toBe('monthly');
    });

    it('should reject budget without authentication', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .send({
          category_id: categoryId,
          amount: 500.00,
          period: 'monthly',
        });

      expect(response.status).toBe(401);
    });

    it('should reject budget with negative amount', async () => {
      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: categoryId,
          amount: -500.00,
          period: 'monthly',
        });

      expect(response.status).toBe(400);
    });

    it('should reject duplicate budget for same category', async () => {
      // Create first budget
      await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: categoryId,
          amount: 500.00,
          period: 'monthly',
        });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: categoryId,
          amount: 600.00,
          period: 'monthly',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /api/budgets', () => {
    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      await query(
        'INSERT INTO budgets (user_id, category_id, amount, period) VALUES ($1, $2, $3, $4)',
        [userId, categoryId, 500.00, 'monthly']
      );
    });

    it('should get all user budgets', async () => {
      const response = await request(app)
        .get('/api/budgets')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should include category information', async () => {
      const response = await request(app)
        .get('/api/budgets')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body[0]).toHaveProperty('category_name');
      expect(response.body[0]).toHaveProperty('category_color');
    });

    it('should not return other users budgets', async () => {
      const otherUser = await createTestUser();
      const otherCategory = await createTestCategory(otherUser.id);
      const { query } = require('../../../src/config/database');
      await query(
        'INSERT INTO budgets (user_id, category_id, amount, period) VALUES ($1, $2, $3, $4)',
        [otherUser.id, otherCategory.id, 1000.00, 'monthly']
      );

      const response = await request(app)
        .get('/api/budgets')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.every((b: any) => b.user_id === userId)).toBe(true);
    });
  });

  describe('PUT /api/budgets/:id', () => {
    let budgetId: number;

    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      const result = await query(
        'INSERT INTO budgets (user_id, category_id, amount, period) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, categoryId, 500.00, 'monthly']
      );
      budgetId = result.rows[0].id;
    });

    it('should update own budget', async () => {
      const response = await request(app)
        .put(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 750.00 });

      expect(response.status).toBe(200);
      expect(response.body.amount).toBe('750.00');
    });

    it('should not update other users budget', async () => {
      const otherUser = await createTestUser();
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .put(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ amount: 999.00 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/budgets/:id', () => {
    let budgetId: number;

    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      const result = await query(
        'INSERT INTO budgets (user_id, category_id, amount, period) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, categoryId, 500.00, 'monthly']
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
      const otherUser = await createTestUser();
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/budgets/${budgetId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });
});

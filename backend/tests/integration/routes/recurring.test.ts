import request from 'supertest';
import express from 'express';
import recurringRoutes from '../../../src/routes/recurring';
import { cleanDatabase, createTestUser, createTestCategory, getAuthToken } from '../../helpers';
import { query } from '../../../src/config/database';

const app = express();
app.use(express.json());
app.use('/api/recurring', recurringRoutes);

describe('Recurring Transactions API', () => {
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

  const createRecurring = async (overrides: any = {}) => {
    const defaults = {
      category_id: categoryId,
      amount: 100.00,
      description: 'Test recurring',
      type: 'expense',
      frequency: 'monthly',
      next_date: '2026-03-01',
      active: true,
    };
    const data = { ...defaults, ...overrides };
    const result = await query(
      `INSERT INTO recurring_transactions (user_id, category_id, amount, description, type, frequency, next_date, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, data.category_id, data.amount, data.description, data.type, data.frequency, data.next_date, data.active]
    );
    return result.rows[0];
  };

  describe('GET /api/recurring', () => {
    beforeEach(async () => {
      await createRecurring({ description: 'Netflix', amount: 15 });
      await createRecurring({ description: 'Gym', amount: 50 });
    });

    it('should get all recurring transactions', async () => {
      const response = await request(app)
        .get('/api/recurring')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should include category info', async () => {
      const response = await request(app)
        .get('/api/recurring')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body[0]).toHaveProperty('category_name');
      expect(response.body[0]).toHaveProperty('category_color');
    });

    it('should not return other users recurring transactions', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherCategory = await createTestCategory(otherUser.id);
      await query(
        `INSERT INTO recurring_transactions (user_id, category_id, amount, description, type, frequency, next_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [otherUser.id, otherCategory.id, 200, 'Other user', 'expense', 'monthly', '2026-03-01']
      );

      const response = await request(app)
        .get('/api/recurring')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.every((r: any) => r.user_id === userId)).toBe(true);
    });
  });

  describe('POST /api/recurring', () => {
    it('should create recurring transaction with valid data', async () => {
      const response = await request(app)
        .post('/api/recurring')
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: categoryId,
          amount: 25.00,
          description: 'Spotify',
          type: 'expense',
          frequency: 'monthly',
          next_date: '2026-04-01',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.description).toBe('Spotify');
      expect(response.body).toHaveProperty('category_name');
    });

    it('should reject without auth', async () => {
      const response = await request(app)
        .post('/api/recurring')
        .send({
          category_id: categoryId,
          amount: 25,
          description: 'Test',
          type: 'expense',
          frequency: 'monthly',
          next_date: '2026-04-01',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/recurring/:id', () => {
    let recurringId: number;

    beforeEach(async () => {
      const rec = await createRecurring();
      recurringId = rec.id;
    });

    it('should update own recurring transaction', async () => {
      const response = await request(app)
        .put(`/api/recurring/${recurringId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          category_id: categoryId,
          amount: 200,
          description: 'Updated',
          type: 'expense',
          frequency: 'weekly',
          next_date: '2026-03-15',
          active: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Updated');
      expect(response.body.frequency).toBe('weekly');
    });

    it('should not update other users recurring transaction', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .put(`/api/recurring/${recurringId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          category_id: categoryId,
          amount: 999,
          description: 'Hacked',
          type: 'expense',
          frequency: 'daily',
          next_date: '2026-01-01',
          active: false,
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/recurring/:id', () => {
    let recurringId: number;

    beforeEach(async () => {
      const rec = await createRecurring();
      recurringId = rec.id;
    });

    it('should delete own recurring transaction', async () => {
      const response = await request(app)
        .delete(`/api/recurring/${recurringId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should not delete other users recurring transaction', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/recurring/${recurringId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/recurring/process', () => {
    it('should process due recurring transactions', async () => {
      // Create a recurring transaction with past next_date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await createRecurring({
        description: 'Due payment',
        next_date: yesterday.toISOString().split('T')[0],
      });

      const response = await request(app)
        .post('/api/recurring/process')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.processed).toBe(1);
      expect(response.body.transactions.length).toBe(1);
      expect(response.body.transactions[0].description).toBe('Due payment');
    });

    it('should not process inactive recurring transactions', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await createRecurring({
        description: 'Inactive',
        next_date: yesterday.toISOString().split('T')[0],
        active: false,
      });

      const response = await request(app)
        .post('/api/recurring/process')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.processed).toBe(0);
    });

    it('should not process future recurring transactions', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      await createRecurring({
        description: 'Future',
        next_date: future.toISOString().split('T')[0],
      });

      const response = await request(app)
        .post('/api/recurring/process')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.processed).toBe(0);
    });
  });
});

import request from 'supertest';
import express from 'express';
import transactionRoutes from '../../../src/routes/transactions';
import { cleanDatabase, testUser, createTestUser, createTestCategory, getAuthToken } from '../../helpers';

const app = express();
app.use(express.json());
app.use('/api/transactions', transactionRoutes);

describe('Transactions API', () => {
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

  describe('POST /api/transactions', () => {
    it('should create a transaction with valid data', async () => {
      const transactionData = {
        amount: 50.00,
        description: 'Grocery shopping',
        date: '2026-02-08',
        type: 'expense',
        category_id: categoryId,
      };

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send(transactionData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.amount).toBe('50.00');
      expect(response.body.description).toBe('Grocery shopping');
    });

    it('should reject transaction without authentication', async () => {
      const response = await request(app)
        .post('/api/transactions')
        .send({
          amount: 50.00,
          description: 'Test',
          date: '2026-02-08',
          type: 'expense',
          category_id: categoryId,
        });

      expect(response.status).toBe(401);
    });

    it('should reject transaction with negative amount', async () => {
      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: -50.00,
          description: 'Invalid',
          date: '2026-02-08',
          type: 'expense',
          category_id: categoryId,
        });

      expect(response.status).toBe(400);
    });

    it('should reject transaction with invalid category', async () => {
      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 50.00,
          description: 'Test',
          date: '2026-02-08',
          type: 'expense',
          category_id: 99999, // Non-existent category
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/transactions', () => {
    beforeEach(async () => {
      // Create test transactions
      const { query } = require('../../../src/config/database');
      await query(
        'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, categoryId, 100.00, 'Transaction 1', '2026-02-01', 'expense']
      );
      await query(
        'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, categoryId, 50.00, 'Transaction 2', '2026-02-05', 'expense']
      );
    });

    it('should get all user transactions', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter transactions by date range', async () => {
      const response = await request(app)
        .get('/api/transactions?start_date=2026-02-01&end_date=2026-02-03')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].description).toBe('Transaction 1');
    });

    it('should filter transactions by category', async () => {
      const response = await request(app)
        .get(`/api/transactions?category_id=${categoryId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.every((t: any) => t.category_id === categoryId)).toBe(true);
    });

    it('should not return other users transactions', async () => {
      // Create another user with transactions
      const otherUser = await createTestUser();
      const otherCategory = await createTestCategory(otherUser.id);
      const { query } = require('../../../src/config/database');
      await query(
        'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [otherUser.id, otherCategory.id, 200.00, 'Other user transaction', '2026-02-01', 'expense']
      );

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.every((t: any) => t.user_id === userId)).toBe(true);
    });
  });

  describe('PUT /api/transactions/:id', () => {
    let transactionId: number;

    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      const result = await query(
        'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [userId, categoryId, 100.00, 'Original', '2026-02-01', 'expense']
      );
      transactionId = result.rows[0].id;
    });

    it('should update own transaction', async () => {
      const response = await request(app)
        .put(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          amount: 150.00,
          description: 'Updated',
        });

      expect(response.status).toBe(200);
      expect(response.body.amount).toBe('150.00');
      expect(response.body.description).toBe('Updated');
    });

    it('should not update other users transaction', async () => {
      const otherUser = await createTestUser();
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .put(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ amount: 999.00 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/transactions/:id', () => {
    let transactionId: number;

    beforeEach(async () => {
      const { query } = require('../../../src/config/database');
      const result = await query(
        'INSERT INTO transactions (user_id, category_id, amount, description, date, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [userId, categoryId, 100.00, 'To Delete', '2026-02-01', 'expense']
      );
      transactionId = result.rows[0].id;
    });

    it('should delete own transaction', async () => {
      const response = await request(app)
        .delete(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);

      // Verify deletion
      const { query } = require('../../../src/config/database');
      const result = await query('SELECT * FROM transactions WHERE id = $1', [transactionId]);
      expect(result.rows.length).toBe(0);
    });

    it('should not delete other users transaction', async () => {
      const otherUser = await createTestUser();
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });
});

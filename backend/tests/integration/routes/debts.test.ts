import request from 'supertest';
import express from 'express';
import debtRoutes from '../../../src/routes/debts';
import { cleanDatabase, createTestUser, createTestCategory, getAuthToken } from '../../helpers';
import { query } from '../../../src/config/database';

const app = express();
app.use(express.json());
app.use('/api/debts', debtRoutes);

describe('Debts API', () => {
  let userId: number;
  let token: string;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    token = getAuthToken(userId);
  });

  const createDebt = async (overrides: any = {}) => {
    const defaults = {
      name: 'Credit Card',
      type: 'credit_card',
      balance: 1000.00,
    };
    const data = { ...defaults, ...overrides };
    const result = await query(
      'INSERT INTO debts (user_id, name, type, balance) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, data.name, data.type, data.balance]
    );
    return result.rows[0];
  };

  describe('GET /api/debts', () => {
    beforeEach(async () => {
      await createDebt({ name: 'Credit Card', type: 'credit_card' });
      await createDebt({ name: 'Student Loan', type: 'loan' });
    });

    it('should get all user debts', async () => {
      const response = await request(app)
        .get('/api/debts')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should filter debts by type', async () => {
      const response = await request(app)
        .get('/api/debts?type=loan')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].type).toBe('loan');
    });

    it('should not return other users debts', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);
      await query(
        'INSERT INTO debts (user_id, name, type, balance) VALUES ($1, $2, $3, $4)',
        [otherUser.id, 'Other Debt', 'loan', 500]
      );

      const response = await request(app)
        .get('/api/debts')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.every((d: any) => d.user_id === userId)).toBe(true);
    });
  });

  describe('POST /api/debts', () => {
    it('should create debt with valid data', async () => {
      const response = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Car Loan', type: 'loan', balance: 15000 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Car Loan');
      expect(Number(response.body.balance)).toBe(15000);
    });

    it('should reject without auth', async () => {
      const response = await request(app)
        .post('/api/debts')
        .send({ name: 'Test', type: 'loan', balance: 100 });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/debts/:id', () => {
    let debtId: number;

    beforeEach(async () => {
      const debt = await createDebt();
      debtId = debt.id;
    });

    it('should update own debt', async () => {
      const response = await request(app)
        .put(`/api/debts/${debtId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Card', type: 'credit_card', balance: 800, is_paid: false });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Card');
      expect(Number(response.body.balance)).toBe(800);
    });

    it('should not update other users debt', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .put(`/api/debts/${debtId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked', type: 'loan', balance: 0 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/debts/:id', () => {
    let debtId: number;

    beforeEach(async () => {
      const debt = await createDebt();
      debtId = debt.id;
    });

    it('should delete own debt', async () => {
      const response = await request(app)
        .delete(`/api/debts/${debtId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should not delete other users debt', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/debts/${debtId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/debts/:id/payment', () => {
    let debtId: number;

    beforeEach(async () => {
      const debt = await createDebt({ balance: 500 });
      debtId = debt.id;
    });

    it('should reduce debt balance', async () => {
      const response = await request(app)
        .post(`/api/debts/${debtId}/payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 200 });

      expect(response.status).toBe(200);
      expect(Number(response.body.debt.balance)).toBe(300);
      expect(response.body.debt.is_paid).toBe(false);
    });

    it('should mark debt as paid when balance reaches 0', async () => {
      const response = await request(app)
        .post(`/api/debts/${debtId}/payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 500 });

      expect(response.status).toBe(200);
      expect(Number(response.body.debt.balance)).toBe(0);
      expect(response.body.debt.is_paid).toBe(true);
    });

    it('should optionally create transaction', async () => {
      const category = await createTestCategory(userId, 'expense');

      const response = await request(app)
        .post(`/api/debts/${debtId}/payment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100, create_transaction: true, category_id: category.id });

      expect(response.status).toBe(200);
      expect(response.body.transaction).not.toBeNull();
      expect(response.body.transaction.amount).toBe('100.00');
    });

    it('should not pay other users debt', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .post(`/api/debts/${debtId}/payment`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ amount: 100 });

      expect(response.status).toBe(404);
    });
  });
});

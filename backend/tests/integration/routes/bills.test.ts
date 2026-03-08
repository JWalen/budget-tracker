import request from 'supertest';
import express from 'express';
import billRoutes from '../../../src/routes/bills';
import { cleanDatabase, createTestUser, createTestCategory, getAuthToken } from '../../helpers';
import { query } from '../../../src/config/database';

const app = express();
app.use(express.json());
app.use('/api/bills', billRoutes);

describe('Bills API', () => {
  let userId: number;
  let token: string;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    token = getAuthToken(userId);
  });

  const createBill = async (overrides: any = {}) => {
    const defaults = {
      name: 'Electric Bill',
      amount: 150.00,
      due_date: 15,
    };
    const data = { ...defaults, ...overrides };
    const result = await query(
      'INSERT INTO bills (user_id, name, amount, due_date) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, data.name, data.amount, data.due_date]
    );
    return result.rows[0];
  };

  describe('GET /api/bills', () => {
    beforeEach(async () => {
      await createBill({ name: 'Electric', amount: 150, due_date: 15 });
      await createBill({ name: 'Internet', amount: 60, due_date: 20 });
    });

    it('should get all active bills', async () => {
      const response = await request(app)
        .get('/api/bills?month=3&year=2026')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should reject without auth', async () => {
      const response = await request(app).get('/api/bills');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/bills', () => {
    it('should create bill with valid data', async () => {
      const response = await request(app)
        .post('/api/bills')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Rent', amount: 1200, due_date: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Rent');
      expect(Number(response.body.amount)).toBe(1200);
    });

    it('should reject without auth', async () => {
      const response = await request(app)
        .post('/api/bills')
        .send({ name: 'Test', amount: 100, due_date: 1 });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/bills/:id', () => {
    let billId: number;

    beforeEach(async () => {
      const bill = await createBill();
      billId = bill.id;
    });

    it('should update own bill', async () => {
      const response = await request(app)
        .put(`/api/bills/${billId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Bill', amount: 200, due_date: 20 });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Bill');
      expect(Number(response.body.amount)).toBe(200);
    });

    it('should not update other users bill', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .put(`/api/bills/${billId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked', amount: 0, due_date: 1 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/bills/:id', () => {
    let billId: number;

    beforeEach(async () => {
      const bill = await createBill();
      billId = bill.id;
    });

    it('should delete own bill', async () => {
      const response = await request(app)
        .delete(`/api/bills/${billId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should not delete other users bill', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/bills/${billId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/bills/:id/pay', () => {
    let billId: number;

    beforeEach(async () => {
      const bill = await createBill({ amount: 100 });
      billId = bill.id;
    });

    it('should mark bill as paid', async () => {
      const response = await request(app)
        .post(`/api/bills/${billId}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ month: 3, year: 2026 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('bill_id');
      expect(Number(response.body.amount_paid)).toBe(100);
    });

    it('should not pay other users bill', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .post(`/api/bills/${billId}/pay`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ month: 3, year: 2026 });

      expect(response.status).toBe(404);
    });

    it('should optionally create transaction when paying', async () => {
      const category = await createTestCategory(userId, 'expense');

      const response = await request(app)
        .post(`/api/bills/${billId}/pay`)
        .set('Authorization', `Bearer ${token}`)
        .send({ month: 3, year: 2026, create_transaction: true, category_id: category.id });

      expect(response.status).toBe(200);
      expect(response.body.transaction_id).not.toBeNull();
    });
  });
});

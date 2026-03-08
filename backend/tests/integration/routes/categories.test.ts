import request from 'supertest';
import express from 'express';
import categoryRoutes from '../../../src/routes/categories';
import { cleanDatabase, createTestUser, createTestCategory, getAuthToken } from '../../helpers';

const app = express();
app.use(express.json());
app.use('/api/categories', categoryRoutes);

describe('Categories API', () => {
  let userId: number;
  let token: string;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    token = getAuthToken(userId);
  });

  describe('GET /api/categories', () => {
    beforeEach(async () => {
      await createTestCategory(userId, 'expense');
      await createTestCategory(userId, 'income');
    });

    it('should get all user categories', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should not return other users categories', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      await createTestCategory(otherUser.id, 'expense');

      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.every((c: any) => c.user_id === userId)).toBe(true);
    });

    it('should reject without auth', async () => {
      const response = await request(app).get('/api/categories');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/categories', () => {
    it('should create category with valid data', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Groceries', type: 'expense', color: '#22c55e' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Groceries');
      expect(response.body.type).toBe('expense');
    });

    it('should reject without auth', async () => {
      const response = await request(app)
        .post('/api/categories')
        .send({ name: 'Test', type: 'expense', color: '#000000' });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/categories/:id', () => {
    let categoryId: number;

    beforeEach(async () => {
      const cat = await createTestCategory(userId, 'expense');
      categoryId = cat.id;
    });

    it('should update own category', async () => {
      const response = await request(app)
        .put(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated', color: '#ef4444', icon: 'star', exclude_from_income: false });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated');
      expect(response.body.color).toBe('#ef4444');
    });

    it('should not update other users category', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .put(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ name: 'Hacked', color: '#000000', icon: 'tag', exclude_from_income: false });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    let categoryId: number;

    beforeEach(async () => {
      const cat = await createTestCategory(userId, 'expense');
      categoryId = cat.id;
    });

    it('should delete own category', async () => {
      const response = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should not delete other users category', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const otherToken = getAuthToken(otherUser.id);

      const response = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });
  });
});

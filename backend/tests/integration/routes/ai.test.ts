import request from 'supertest';
import express from 'express';
import aiRoutes from '../../../src/routes/ai';
import { query } from '../../../src/config/database';
import {
  cleanDatabase,
  createTestUser,
  createTestCategory,
  createTestTransaction,
  getAuthToken,
} from '../../helpers';

const app = express();
app.use(express.json());
app.use('/api/ai', aiRoutes);

// Covers POST /api/ai/apply-categories — applying accepted AI suggestions and
// learning them as reusable auto-categorization (match_rules) rows. This path
// does not call the LLM, so it runs without an AI key configured.
describe('AI apply-categories', () => {
  let userId: number;
  let token: string;
  let categoryId: number;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    token = getAuthToken(userId);
    categoryId = (await createTestCategory(userId, 'expense')).id;
  });

  it('applies the category and learns a rule from the merchant substring', async () => {
    const tx = await createTestTransaction(userId, categoryId, {
      description: 'SQ *BLUE BOTTLE 0123 SF',
      category_id: null,
    });

    const res = await request(app)
      .post('/api/ai/apply-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ transactionId: tx.id, categoryId, merchant: 'BLUE BOTTLE' }] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 1, rulesCreated: 1 });

    const txRow = await query('SELECT category_id FROM transactions WHERE id = $1', [tx.id]);
    expect(txRow.rows[0].category_id).toBe(categoryId);

    const rule = await query(
      `SELECT pattern, target_type, target_id, category_id FROM match_rules WHERE user_id = $1`,
      [userId]
    );
    expect(rule.rows).toHaveLength(1);
    expect(rule.rows[0]).toMatchObject({
      pattern: 'BLUE BOTTLE',
      target_type: 'category',
      target_id: categoryId,
      category_id: categoryId,
    });
  });

  it('does not create a duplicate rule for a merchant already learned', async () => {
    const tx1 = await createTestTransaction(userId, categoryId, { description: 'AMZN Mktp US*111' });
    const tx2 = await createTestTransaction(userId, categoryId, { description: 'AMZN Mktp US*222' });

    const first = await request(app)
      .post('/api/ai/apply-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ transactionId: tx1.id, categoryId, merchant: 'AMZN Mktp' }] });
    expect(first.body.rulesCreated).toBe(1);

    const second = await request(app)
      .post('/api/ai/apply-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ transactionId: tx2.id, categoryId, merchant: 'AMZN Mktp' }] });
    expect(second.body).toEqual({ updated: 1, rulesCreated: 0 });

    const rules = await query('SELECT COUNT(*)::int AS n FROM match_rules WHERE user_id = $1', [userId]);
    expect(rules.rows[0].n).toBe(1);
  });

  it('applies without learning a rule when createRules is false', async () => {
    const tx = await createTestTransaction(userId, categoryId, { description: 'STARBUCKS 55' });
    const res = await request(app)
      .post('/api/ai/apply-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ transactionId: tx.id, categoryId, merchant: 'STARBUCKS' }], createRules: false });

    expect(res.body).toEqual({ updated: 1, rulesCreated: 0 });
    const rules = await query('SELECT COUNT(*)::int AS n FROM match_rules WHERE user_id = $1', [userId]);
    expect(rules.rows[0].n).toBe(0);
  });

  it('skips rule creation when the merchant is not a substring of the description', async () => {
    const tx = await createTestTransaction(userId, categoryId, { description: 'POS PURCHASE 9931' });
    const res = await request(app)
      .post('/api/ai/apply-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ transactionId: tx.id, categoryId, merchant: 'Walmart' }] });

    expect(res.body).toEqual({ updated: 1, rulesCreated: 0 });
  });

  it('does not touch another user\'s transaction', async () => {
    const other = await createTestUser({ email: 'other@example.com' });
    const otherCat = await createTestCategory(other.id, 'expense');
    const foreignTx = await createTestTransaction(other.id, otherCat.id, { description: 'THEIRS' });

    const res = await request(app)
      .post('/api/ai/apply-categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ transactionId: foreignTx.id, categoryId, merchant: 'THEIRS' }] });

    expect(res.body).toEqual({ updated: 0, rulesCreated: 0 });
    const rules = await query('SELECT COUNT(*)::int AS n FROM match_rules WHERE user_id = $1', [userId]);
    expect(rules.rows[0].n).toBe(0);
  });
});

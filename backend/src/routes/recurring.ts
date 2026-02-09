import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';

const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get all recurring transactions
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `SELECT r.*, c.name as category_name, c.color as category_color
       FROM recurring_transactions r
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id = $1
       ORDER BY r.next_date`,
      [budgetUserId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create recurring transaction
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, amount, description, type, frequency, next_date } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `INSERT INTO recurring_transactions (user_id, category_id, amount, description, type, frequency, next_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [budgetUserId, category_id, amount, description, type, frequency, next_date]
    );

    const fullResult = await query(
      `SELECT r.*, c.name as category_name, c.color as category_color
       FROM recurring_transactions r
       LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(fullResult.rows[0]);
  } catch (error) {
    console.error('Create recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update recurring transaction
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category_id, amount, description, type, frequency, next_date, active } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `UPDATE recurring_transactions
       SET category_id = $1, amount = $2, description = $3, type = $4, frequency = $5, next_date = $6, active = $7
       WHERE id = $8 AND user_id = $9 RETURNING *`,
      [category_id, amount, description, type, frequency, next_date, active, id, budgetUserId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete recurring transaction
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM recurring_transactions WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }
    res.json({ message: 'Recurring transaction deleted' });
  } catch (error) {
    console.error('Delete recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Process due recurring transactions (creates actual transactions)
router.post('/process', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const budgetUserId = (req as any).budgetUserId;

    // Get all due recurring transactions for this user
    const dueRecurring = await query(
      `SELECT * FROM recurring_transactions
       WHERE user_id = $1 AND active = true AND next_date <= $2`,
      [budgetUserId, today]
    );

    const created = [];

    for (const rec of dueRecurring.rows) {
      // Create the transaction
      const txResult = await query(
        `INSERT INTO transactions (user_id, category_id, amount, description, date, type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [budgetUserId, rec.category_id, rec.amount, rec.description, rec.next_date, rec.type]
      );
      created.push(txResult.rows[0]);

      // Calculate next date
      let nextDate = new Date(rec.next_date);
      switch (rec.frequency) {
        case 'daily':
          nextDate.setDate(nextDate.getDate() + 1);
          break;
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'biweekly':
          nextDate.setDate(nextDate.getDate() + 14);
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case 'yearly':
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
      }

      // Update next_date
      await query(
        'UPDATE recurring_transactions SET next_date = $1 WHERE id = $2',
        [nextDate.toISOString().split('T')[0], rec.id]
      );
    }

    res.json({ processed: created.length, transactions: created });
  } catch (error) {
    console.error('Process recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

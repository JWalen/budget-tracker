import { Router, Response } from 'express';
import pool, { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import { nextOccurrence, toDateString, todayDateString } from '../utils/dateUtils';

const logger = new LoggerClass('Recurring');
const router = Router();

const VALID_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];

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
    logger.error('Get recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create recurring transaction
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, amount, description, type, frequency, next_date } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (!VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    // Verify category ownership
    if (category_id !== undefined && category_id !== null) {
      const catCheck = await query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [category_id, budgetUserId]
      );
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }

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
    logger.error('Create recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update recurring transaction
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { category_id, amount, description, type, frequency, next_date, active } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    // Confirm the recurring transaction exists and belongs to this budget first,
    // so a cross-user id gets a clean 404 (not a 400 from the category check that
    // happens to fire because the attacker doesn't own the referenced category).
    const owned = await query(
      'SELECT id FROM recurring_transactions WHERE id = $1 AND user_id = $2',
      [id, budgetUserId]
    );
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Invalid type' });
    }

    if (!VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    // Verify category ownership
    if (category_id !== undefined && category_id !== null) {
      const catCheck = await query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [category_id, budgetUserId]
      );
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }

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
    logger.error('Update recurring error:', error);
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
    logger.error('Delete recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Process due recurring transactions (creates actual transactions)
router.post('/process', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const today = todayDateString();
    const budgetUserId = (req as any).budgetUserId;

    // Get candidate due recurring transactions for this user
    const dueRecurring = await query(
      `SELECT id FROM recurring_transactions
       WHERE user_id = $1 AND active = true AND next_date <= $2`,
      [budgetUserId, today]
    );

    const created = [];
    const client = await pool.connect();

    try {
      for (const candidate of dueRecurring.rows) {
        try {
          await client.query('BEGIN');

          // Lock the row and re-verify it is still due; skip rows locked by concurrent processes
          const locked = await client.query(
            `SELECT * FROM recurring_transactions
             WHERE id = $1 AND user_id = $2 AND active = true AND next_date <= $3
             FOR UPDATE SKIP LOCKED`,
            [candidate.id, budgetUserId, today]
          );

          if (locked.rows.length === 0) {
            await client.query('ROLLBACK');
            continue;
          }

          const rec = locked.rows[0];

          // Calculate next date based on frequency (month-end safe, no UTC shift).
          const nextDate = nextOccurrence(new Date(rec.next_date), rec.frequency);
          if (!nextDate) {
            // Unknown frequency - leave row unchanged and skip (no transaction, no advance)
            logger.warn('Skipping recurring transaction with invalid frequency', {
              id: rec.id,
              frequency: rec.frequency,
            });
            await client.query('ROLLBACK');
            continue;
          }

          // Create the transaction
          const txResult = await client.query(
            `INSERT INTO transactions (user_id, category_id, amount, description, date, type)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [budgetUserId, rec.category_id, rec.amount, rec.description, rec.next_date, rec.type]
          );

          // Update next_date
          await client.query(
            'UPDATE recurring_transactions SET next_date = $1 WHERE id = $2',
            [toDateString(nextDate), rec.id]
          );

          await client.query('COMMIT');
          created.push(txResult.rows[0]);
        } catch (itemError) {
          await client.query('ROLLBACK').catch(() => {});
          logger.error('Process recurring item error:', itemError);
        }
      }
    } finally {
      client.release();
    }

    res.json({ processed: created.length, transactions: created });
  } catch (error) {
    logger.error('Process recurring error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

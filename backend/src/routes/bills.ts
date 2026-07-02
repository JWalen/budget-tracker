import { Router, Response } from 'express';
import pool, { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import { handleRouteError } from '../utils/apiError';

const logger = new LoggerClass('Bills');
const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get all bills with payment status for a given month/year
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `SELECT b.*,
        c.name as category_name, c.color as category_color,
        bp.id as payment_id, bp.amount_paid, bp.payment_date, bp.transaction_id
      FROM bills b
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN bill_payments bp ON bp.bill_id = b.id AND bp.month = $2 AND bp.year = $3
      WHERE b.user_id = $1 AND b.is_active = true
      ORDER BY b.due_date ASC`,
      [budgetUserId, m, y]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get bills error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get bill status summary for a month
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `SELECT b.id, b.name, b.amount, b.due_date,
        CASE WHEN bp.id IS NOT NULL THEN true ELSE false END as is_paid
      FROM bills b
      LEFT JOIN bill_payments bp ON bp.bill_id = b.id AND bp.month = $2 AND bp.year = $3
      WHERE b.user_id = $1 AND b.is_active = true
      ORDER BY b.due_date ASC`,
      [budgetUserId, m, y]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get bill status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create bill
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { name, amount, due_date, category_id, auto_match_pattern } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const result = await query(
      `INSERT INTO bills (user_id, name, amount, due_date, category_id, auto_match_pattern)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [budgetUserId, name, amount, due_date, category_id || null, auto_match_pattern || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    return handleRouteError(res, error, 'Could not create the bill. Please check the details and try again.', logger);
  }
});

// Update bill
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, amount, due_date, category_id, auto_match_pattern, is_active } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `UPDATE bills
       SET name = $1, amount = $2, due_date = $3, category_id = $4, auto_match_pattern = $5, is_active = $6
       WHERE id = $7 AND user_id = $8 RETURNING *`,
      [name, amount, due_date, category_id || null, auto_match_pattern || null, is_active !== false, id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete bill
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM bills WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json({ message: 'Bill deleted' });
  } catch (error) {
    logger.error('Delete bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark bill as paid for a month
router.post('/:id/pay', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { month, year, transaction_id, create_transaction, category_id } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const numericMonth = Number(month);
    if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
      return res.status(400).json({ error: 'Invalid month' });
    }

    const numericYear = Number(year);
    if (!Number.isInteger(numericYear)) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    // Verify bill belongs to user
    const billResult = await query(
      'SELECT * FROM bills WHERE id = $1 AND user_id = $2',
      [id, budgetUserId]
    );

    if (billResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = billResult.rows[0];

    // Verify a supplied transaction_id belongs to this user
    if (transaction_id !== undefined && transaction_id !== null) {
      const txCheck = await query(
        'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
        [transaction_id, budgetUserId]
      );
      if (txCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid transaction' });
      }
    }

    // Verify category ownership if used to create a transaction
    if (create_transaction && !transaction_id && category_id !== undefined && category_id !== null) {
      const catCheck = await query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [category_id, budgetUserId]
      );
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }

    let txId = transaction_id;
    let paymentRow;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Optionally create a new transaction
      if (create_transaction && !txId) {
        const today = new Date().toISOString().split('T')[0];
        const txResult = await client.query(
          `INSERT INTO transactions (user_id, category_id, amount, description, date, type)
           VALUES ($1, $2, $3, $4, $5, 'expense') RETURNING *`,
          [budgetUserId, category_id || bill.category_id, bill.amount, `Bill: ${bill.name}`, today]
        );
        txId = txResult.rows[0].id;
      }

      // Create bill payment record
      const paymentResult = await client.query(
        `INSERT INTO bill_payments (bill_id, transaction_id, amount_paid, payment_date, month, year)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)
         ON CONFLICT (bill_id, month, year) DO UPDATE
         SET transaction_id = $2, amount_paid = $3, payment_date = CURRENT_DATE
         RETURNING *`,
        [id, txId || null, bill.amount, month, year]
      );
      paymentRow = paymentResult.rows[0];

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }

    res.json(paymentRow);
  } catch (error) {
    return handleRouteError(res, error, 'Could not record the bill payment. Please try again.', logger);
  }
});

export default router;

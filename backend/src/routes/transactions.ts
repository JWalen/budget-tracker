import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Transactions');

const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get transactions with optional filters
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, type, category_id, account_id } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    let sql = `
      SELECT t.*,
        c.name as category_name,
        c.color as category_color,
        a.name as account_name,
        a.color as account_color,
        a.account_type
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN bank_accounts a ON t.account_id = a.id
      WHERE t.user_id = $1
    `;
    const params: any[] = [budgetUserId];
    let paramIndex = 2;

    if (month && year) {
      sql += ` AND EXTRACT(MONTH FROM t.date) = $${paramIndex} AND EXTRACT(YEAR FROM t.date) = $${paramIndex + 1}`;
      params.push(month, year);
      paramIndex += 2;
    }

    if (req.query.start_date && req.query.end_date) {
      sql += ` AND t.date >= $${paramIndex} AND t.date <= $${paramIndex + 1}`;
      params.push(req.query.start_date, req.query.end_date);
      paramIndex += 2;
    }

    if (type) {
      sql += ` AND t.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (category_id) {
      sql += ` AND t.category_id = $${paramIndex}`;
      params.push(category_id);
      paramIndex++;
    }

    if (account_id) {
      sql += ` AND t.account_id = $${paramIndex}`;
      params.push(account_id);
      paramIndex++;
    }

    sql += ' ORDER BY t.date DESC, t.created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create transaction
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, account_id, amount, description, date, type } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    if (amount < 0) {
      return res.status(400).json({ error: 'Amount cannot be negative' });
    }

    const result = await query(
      `INSERT INTO transactions (user_id, category_id, account_id, amount, description, date, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [budgetUserId, category_id, account_id, amount, description, date, type]
    );

    // Fetch with category and account info
    const fullResult = await query(
      `SELECT t.*,
        c.name as category_name,
        c.color as category_color,
        a.name as account_name,
        a.color as account_color,
        a.account_type
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN bank_accounts a ON t.account_id = a.id
       WHERE t.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(fullResult.rows[0]);
  } catch (error: any) {
    logger.error('Create transaction error:', error);
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid category or account' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update transaction
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const budgetUserId = (req as any).budgetUserId;

    if (updates.amount !== undefined && updates.amount < 0) {
      return res.status(400).json({ error: 'Amount cannot be negative' });
    }

    // Dynamic update query
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Allowed fields to update
    const allowedFields = ['category_id', 'account_id', 'amount', 'description', 'date', 'type'];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramIndex}`);
        params.push(updates[field]);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id, budgetUserId);

    const result = await query(
      `UPDATE transactions
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Fetch with category and account info
    const fullResult = await query(
      `SELECT t.*,
        c.name as category_name,
        c.color as category_color,
        a.name as account_name,
        a.color as account_color,
        a.account_type
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN bank_accounts a ON t.account_id = a.id
       WHERE t.id = $1`,
      [id]
    );

    res.json(fullResult.rows[0]);
  } catch (error: any) {
    logger.error('Update transaction error:', error);
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid category or account' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete transaction
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ message: 'Transaction deleted' });
  } catch (error) {
    logger.error('Delete transaction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Debts');
const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get debts with optional filters
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, is_paid } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    let sql = 'SELECT * FROM debts WHERE user_id = $1';
    const params: any[] = [budgetUserId];
    let paramIndex = 2;

    if (type) {
      sql += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (is_paid !== undefined) {
      sql += ` AND is_paid = $${paramIndex}`;
      params.push(is_paid === 'true');
      paramIndex++;
    }

    sql += ' ORDER BY is_paid ASC, created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logger.error('Get debts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create debt
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, balance, original_amount, interest_rate, minimum_payment, due_date, contact, notes } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `INSERT INTO debts (user_id, name, type, balance, original_amount, interest_rate, minimum_payment, due_date, contact, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [budgetUserId, name, type, balance, original_amount || null, interest_rate || null, minimum_payment || null, due_date || null, contact || null, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create debt error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update debt
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, balance, original_amount, interest_rate, minimum_payment, due_date, contact, notes, is_paid } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `UPDATE debts
       SET name = $1, type = $2, balance = $3, original_amount = $4, interest_rate = $5,
           minimum_payment = $6, due_date = $7, contact = $8, notes = $9, is_paid = $10
       WHERE id = $11 AND user_id = $12 RETURNING *`,
      [name, type, balance, original_amount || null, interest_rate || null, minimum_payment || null, due_date || null, contact || null, notes || null, is_paid || false, id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update debt error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete debt
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM debts WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    res.json({ message: 'Debt deleted' });
  } catch (error) {
    logger.error('Delete debt error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Log payment on a debt
router.post('/:id/payment', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, create_transaction, category_id } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    // Get current debt
    const debtResult = await query(
      'SELECT * FROM debts WHERE id = $1 AND user_id = $2',
      [id, budgetUserId]
    );

    if (debtResult.rows.length === 0) {
      return res.status(404).json({ error: 'Debt not found' });
    }

    const debt = debtResult.rows[0];
    const newBalance = Math.max(0, parseFloat(debt.balance) - parseFloat(amount));
    const isPaid = newBalance === 0;

    // Update debt balance
    await query(
      'UPDATE debts SET balance = $1, is_paid = $2 WHERE id = $3',
      [newBalance, isPaid, id]
    );

    let transaction = null;

    // Optionally create an expense transaction
    if (create_transaction) {
      const today = new Date().toISOString().split('T')[0];
      const txResult = await query(
        `INSERT INTO transactions (user_id, category_id, amount, description, date, type)
         VALUES ($1, $2, $3, $4, $5, 'expense') RETURNING *`,
        [budgetUserId, category_id || null, amount, `Payment: ${debt.name}`, today]
      );
      transaction = txResult.rows[0];
    }

    const updated = await query('SELECT * FROM debts WHERE id = $1', [id]);

    res.json({ debt: updated.rows[0], transaction });
  } catch (error) {
    logger.error('Debt payment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

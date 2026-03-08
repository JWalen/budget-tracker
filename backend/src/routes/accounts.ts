import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Accounts');
const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get all accounts for the user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `SELECT
        a.*,
        COUNT(DISTINCT t.id) as transaction_count,
        MAX(t.date) as last_transaction_date
      FROM bank_accounts a
      LEFT JOIN transactions t ON t.account_id = a.id
      WHERE a.user_id = $1
      GROUP BY a.id
      ORDER BY a.is_active DESC, a.name`,
      [budgetUserId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get accounts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single account with details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { id } = req.params;

    const accountResult = await query(
      'SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2',
      [id, budgetUserId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get recent transactions for this account
    const transactionsResult = await query(
      `SELECT t.*, c.name as category_name, c.color as category_color
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.account_id = $1
      ORDER BY t.date DESC
      LIMIT 10`,
      [id]
    );

    // Get balance history
    const balanceResult = await query(
      `SELECT * FROM account_balances
      WHERE account_id = $1
      ORDER BY date DESC
      LIMIT 30`,
      [id]
    );

    res.json({
      account: accountResult.rows[0],
      recentTransactions: transactionsResult.rows,
      balanceHistory: balanceResult.rows
    });
  } catch (error) {
    logger.error('Get account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new account
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { name, account_type, account_number_last4, institution, balance, color } = req.body;

    if (!name || !account_type) {
      return res.status(400).json({ error: 'Name and account type are required' });
    }

    const result = await query(
      `INSERT INTO bank_accounts (
        user_id, name, account_type, account_number_last4,
        institution, balance, color
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        budgetUserId,
        name,
        account_type,
        account_number_last4 || null,
        institution || null,
        balance || 0,
        color || '#0ea5e9'
      ]
    );

    // Record initial balance
    if (balance) {
      await query(
        `INSERT INTO account_balances (account_id, balance, date)
        VALUES ($1, $2, CURRENT_DATE)
        ON CONFLICT (account_id, date) DO UPDATE SET balance = $2`,
        [result.rows[0].id, balance]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update account
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { id } = req.params;
    const { name, account_type, account_number_last4, institution, balance, color, is_active } = req.body;

    const result = await query(
      `UPDATE bank_accounts
      SET name = $1, account_type = $2, account_number_last4 = $3,
          institution = $4, balance = $5, color = $6, is_active = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND user_id = $9
      RETURNING *`,
      [
        name,
        account_type,
        account_number_last4,
        institution,
        balance,
        color,
        is_active,
        id,
        budgetUserId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Update balance history
    if (balance !== undefined) {
      await query(
        `INSERT INTO account_balances (account_id, balance, date)
        VALUES ($1, $2, CURRENT_DATE)
        ON CONFLICT (account_id, date) DO UPDATE SET balance = $2`,
        [id, balance]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete account
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update account balance (reconciliation)
router.post('/:id/reconcile', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { id } = req.params;
    const { balance, date } = req.body;

    if (balance === undefined) {
      return res.status(400).json({ error: 'Balance is required' });
    }

    // Update account balance
    await query(
      `UPDATE bank_accounts
      SET balance = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND user_id = $3`,
      [balance, id, budgetUserId]
    );

    // Record balance in history
    await query(
      `INSERT INTO account_balances (account_id, balance, date)
      VALUES ($1, $2, $3)
      ON CONFLICT (account_id, date) DO UPDATE SET balance = $2`,
      [id, balance, date || new Date()]
    );

    res.json({ message: 'Account reconciled successfully' });
  } catch (error) {
    logger.error('Reconcile account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
import { Router, Response } from 'express';
import { query } from '../config/database';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import { handleRouteError } from '../utils/apiError';

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
    return handleRouteError(res, error, 'Could not create the account. Please check the details and try again.', logger);
  }
});

// Update account
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { id } = req.params;
    const { name, account_type, account_number_last4, institution, balance, color, is_active } = req.body;

    // Reject a non-numeric balance up front (would otherwise 500 on the cast).
    if (balance !== undefined && !Number.isFinite(Number(balance))) {
      return res.status(400).json({ error: 'Balance must be a number' });
    }

    // COALESCE keeps existing values for any field the client omits — a partial
    // update like { is_active: false } must not null out name/balance/color.
    const result = await query(
      `UPDATE bank_accounts
      SET name = COALESCE($1, name),
          account_type = COALESCE($2, account_type),
          account_number_last4 = COALESCE($3, account_number_last4),
          institution = COALESCE($4, institution),
          balance = COALESCE($5, balance),
          color = COALESCE($6, color),
          is_active = COALESCE($7, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND user_id = $9
      RETURNING *`,
      [
        name ?? null,
        account_type ?? null,
        account_number_last4 ?? null,
        institution ?? null,
        balance ?? null,
        color ?? null,
        is_active ?? null,
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
    return handleRouteError(res, error, 'Could not delete the account. If transactions still reference it, remove or reassign them first.', logger);
  }
});

// Update account balance (reconciliation)
router.post('/:id/reconcile', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { id } = req.params;
    const { balance, date } = req.body;

    const newBalance = Number(balance);
    if (balance === undefined || balance === null || balance === '' || !Number.isFinite(newBalance)) {
      return res.status(400).json({ error: 'A valid balance is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update account balance — scoped to the owner. Check rowCount BEFORE writing
      // to balance history, otherwise a foreign account id would poison the victim's
      // account_balances (IDOR write).
      const updateResult = await client.query(
        `UPDATE bank_accounts
        SET balance = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND user_id = $3`,
        [newBalance, id, budgetUserId]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Account not found' });
      }

      // Record balance in history
      await client.query(
        `INSERT INTO account_balances (account_id, balance, date)
        VALUES ($1, $2, $3)
        ON CONFLICT (account_id, date) DO UPDATE SET balance = $2`,
        [id, newBalance, date || new Date()]
      );

      await client.query('COMMIT');
      res.json({ message: 'Account reconciled successfully' });
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleRouteError(res, error, 'Could not reconcile the account. Please try again.', logger);
  }
});

export default router;
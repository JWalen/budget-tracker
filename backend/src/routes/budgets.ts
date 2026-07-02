import { Router, Response } from 'express';
import pool, { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import { handleRouteError } from '../utils/apiError';

const logger = new LoggerClass('Budgets');

const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get budgets for a month with spending progress
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `SELECT
        b.*,
        c.name as category_name,
        c.color as category_color,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON t.category_id = b.category_id
        AND t.user_id = b.user_id
        AND EXTRACT(MONTH FROM t.date) = b.month
        AND EXTRACT(YEAR FROM t.date) = b.year
        AND t.type = 'expense'
      WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
      GROUP BY b.id, c.name, c.color
      ORDER BY c.name`,
      [budgetUserId, m, y]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Get budgets error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or update budget
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, amount_limit, month, year } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const numericLimit = Number(amount_limit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0) {
      return res.status(400).json({ error: 'Amount limit must be a non-negative number' });
    }

    const numericMonth = Number(month);
    if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
      return res.status(400).json({ error: 'Invalid month' });
    }

    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    // Verify category ownership
    const catCheck = await query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [category_id, budgetUserId]
    );
    if (catCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Upsert budget
    const result = await query(
      `INSERT INTO budgets (user_id, category_id, amount_limit, month, year)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, category_id, month, year)
       DO UPDATE SET amount_limit = $3
       RETURNING *`,
      [budgetUserId, category_id, amount_limit, month, year]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    return handleRouteError(res, error, 'Could not save the budget. A budget for this category and month may already exist.', logger);
  }
});

// Update budget for all months in a year
router.put('/update-all-months', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, amount_limit, year } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const numericLimit = Number(amount_limit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0) {
      return res.status(400).json({ error: 'Amount limit must be a non-negative number' });
    }

    const numericYear = Number(year);
    if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    // Verify category ownership
    const catCheck = await query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [category_id, budgetUserId]
    );
    if (catCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Update all existing budgets for this category in the specified year
    const result = await query(
      `UPDATE budgets
       SET amount_limit = $1
       WHERE user_id = $2 AND category_id = $3 AND year = $4
       RETURNING *`,
      [amount_limit, budgetUserId, category_id, year]
    );

    res.json({
      message: `Updated ${result.rows.length} budget(s) for the year ${year}`,
      updatedCount: result.rows.length
    });
  } catch (error) {
    logger.error('Update all months budget error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a single budget
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount_limit } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const numericLimit = Number(amount_limit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0) {
      return res.status(400).json({ error: 'Amount limit must be a non-negative number' });
    }

    const result = await query(
      `UPDATE budgets
       SET amount_limit = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [amount_limit, id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    return handleRouteError(res, error, 'Could not update the budget. Please try again.', logger);
  }
});

// Copy budgets to multiple months
router.post('/copy', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { sourceMonth, sourceYear, targetMonths, targetYear } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    // Validate target months
    if (!Array.isArray(targetMonths) || targetMonths.length === 0) {
      return res.status(400).json({ error: 'targetMonths must be a non-empty array' });
    }
    for (const tm of targetMonths) {
      const n = Number(tm);
      if (!Number.isInteger(n) || n < 1 || n > 12) {
        return res.status(400).json({ error: 'Invalid target month' });
      }
    }

    // Get all budgets from source month
    const sourceBudgets = await query(
      `SELECT category_id, amount_limit
       FROM budgets
       WHERE user_id = $1 AND month = $2 AND year = $3`,
      [budgetUserId, sourceMonth, sourceYear]
    );

    if (sourceBudgets.rows.length === 0) {
      return res.status(400).json({ error: 'No budgets found in source month' });
    }

    // Copy budgets to each target month atomically
    let copiedCount = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const targetMonth of targetMonths) {
        for (const budget of sourceBudgets.rows) {
          await client.query(
            `INSERT INTO budgets (user_id, category_id, amount_limit, month, year)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, category_id, month, year)
             DO UPDATE SET amount_limit = $3`,
            [budgetUserId, budget.category_id, budget.amount_limit, targetMonth, targetYear]
          );
          copiedCount++;
        }
      }
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK').catch(() => {});
      throw txError;
    } finally {
      client.release();
    }

    res.json({
      message: `Successfully copied ${sourceBudgets.rows.length} budget(s) to ${targetMonths.length} month(s)`,
      copiedCount
    });
  } catch (error) {
    logger.error('Copy budgets error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete budget
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.json({ message: 'Budget deleted' });
  } catch (error) {
    logger.error('Delete budget error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

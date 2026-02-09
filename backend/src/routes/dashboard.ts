import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware } from '../middleware/sharing';

const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get dashboard summary for a month
router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();
    const budgetUserId = (req as any).budgetUserId;

    // Get totals (exclude income categories marked as exclude_from_income)
    const totalsResult = await query(
      `SELECT
        t.type,
        COALESCE(SUM(t.amount), 0) as total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
        AND EXTRACT(MONTH FROM t.date) = $2
        AND EXTRACT(YEAR FROM t.date) = $3
        AND NOT (t.type = 'income' AND c.exclude_from_income = true)
      GROUP BY t.type`,
      [budgetUserId, m, y]
    );

    const totals: { income: number; expense: number } = { income: 0, expense: 0 };
    for (const row of totalsResult.rows) {
      totals[row.type as 'income' | 'expense'] = parseFloat(row.total);
    }

    // Get spending by category (including uncategorized)
    const categoryResult = await query(
      `WITH category_spending AS (
        -- Categorized expenses
        SELECT
          c.id::text as id,
          c.name,
          c.color,
          COALESCE(SUM(t.amount), 0) as total
        FROM categories c
        LEFT JOIN transactions t ON t.category_id = c.id
          AND EXTRACT(MONTH FROM t.date) = $2
          AND EXTRACT(YEAR FROM t.date) = $3
          AND t.type = 'expense'
        WHERE c.user_id = $1 AND c.type = 'expense'
        GROUP BY c.id, c.name, c.color
        HAVING COALESCE(SUM(t.amount), 0) > 0

        UNION ALL

        -- Uncategorized expenses
        SELECT
          'uncategorized' as id,
          'Uncategorized' as name,
          '#6b7280' as color,
          COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE user_id = $1
          AND category_id IS NULL
          AND type = 'expense'
          AND EXTRACT(MONTH FROM date) = $2
          AND EXTRACT(YEAR FROM date) = $3
        HAVING COALESCE(SUM(amount), 0) > 0
      )
      SELECT * FROM category_spending
      ORDER BY total DESC`,
      [budgetUserId, m, y]
    );

    // Get budget status
    const budgetResult = await query(
      `SELECT
        b.id,
        b.amount_limit,
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
      GROUP BY b.id, b.amount_limit, c.name, c.color`,
      [budgetUserId, m, y]
    );

    res.json({
      income: totals.income,
      expenses: totals.expense,
      balance: totals.income - totals.expense,
      byCategory: categoryResult.rows.map(row => ({
        ...row,
        total: parseFloat(row.total)
      })),
      budgets: budgetResult.rows,
    });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get spending trend (last 6 months)
router.get('/trend', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `SELECT
        EXTRACT(YEAR FROM t.date) as year,
        EXTRACT(MONTH FROM t.date) as month,
        t.type,
        COALESCE(SUM(t.amount), 0) as total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
        AND t.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
        AND NOT (t.type = 'income' AND c.exclude_from_income = true)
      GROUP BY EXTRACT(YEAR FROM t.date), EXTRACT(MONTH FROM t.date), t.type
      ORDER BY year, month`,
      [budgetUserId]
    );

    // Format data for chart
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trendData: { [key: string]: { month: string; income: number; expenses: number } } = {};

    for (const row of result.rows) {
      const key = `${row.year}-${row.month}`;
      if (!trendData[key]) {
        trendData[key] = {
          month: monthNames[parseInt(row.month) - 1],
          income: 0,
          expenses: 0,
        };
      }
      if (row.type === 'income') {
        trendData[key].income = parseFloat(row.total);
      } else {
        trendData[key].expenses = parseFloat(row.total);
      }
    }

    res.json(Object.values(trendData));
  } catch (error) {
    console.error('Get trend error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

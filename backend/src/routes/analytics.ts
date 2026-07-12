import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';

const router = Router();
const logger = new LoggerClass('Analytics');

router.use(authMiddleware);
router.use(sharingMiddleware);

/**
 * @swagger
 * /analytics/spending-trends:
 *   get:
 *     summary: Get spending trends over time
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/spending-trends', async (req: AuthRequest, res: Response) => {
  try {
    const { months = 6 } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    const m = Math.min(Math.max(parseInt(months as string, 10) || 6, 1), 60);

    const result = await query(
      `SELECT
        DATE_TRUNC('month', date) as month,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE user_id = $1
         AND date >= CURRENT_DATE - INTERVAL '${m} months'
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY month DESC`,
      [budgetUserId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Spending trends error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/category-breakdown:
 *   get:
 *     summary: Get spending breakdown by category
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/category-breakdown', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    const m = month !== undefined ? parseInt(month as string, 10) : new Date().getMonth() + 1;
    const y = year !== undefined ? parseInt(year as string, 10) : new Date().getFullYear();

    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1970 || y > 9999) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }

    const result = await query(
      `SELECT
        c.id,
        c.name,
        c.color,
        c.icon,
        SUM(t.amount) as total,
        COUNT(t.id) as transaction_count,
        AVG(t.amount) as average_amount
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1 
         AND t.type = 'expense'
         AND EXTRACT(MONTH FROM t.date) = $2
         AND EXTRACT(YEAR FROM t.date) = $3
       GROUP BY c.id, c.name, c.color, c.icon
       ORDER BY total DESC`,
      [budgetUserId, m, y]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Category breakdown error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/budget-variance:
 *   get:
 *     summary: Get budget vs actual variance
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/budget-variance', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();

    const result = await query(
      `SELECT 
        b.id,
        b.amount_limit as budget,
        c.name as category,
        c.color,
        COALESCE(SUM(t.amount), 0) as spent,
        b.amount_limit - COALESCE(SUM(t.amount), 0) as remaining,
        CASE 
          WHEN b.amount_limit > 0 THEN 
            (COALESCE(SUM(t.amount), 0) / b.amount_limit * 100)
          ELSE 0 
        END as percentage_used
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       LEFT JOIN transactions t ON t.category_id = b.category_id
         AND t.user_id = b.user_id
         AND EXTRACT(MONTH FROM t.date) = b.month
         AND EXTRACT(YEAR FROM t.date) = b.year
         AND t.type = 'expense'
       WHERE b.user_id = $1 
         AND b.month = $2 
         AND b.year = $3
       GROUP BY b.id, b.amount_limit, c.name, c.color
       ORDER BY percentage_used DESC`,
      [budgetUserId, m, y]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Budget variance error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/cash-flow:
 *   get:
 *     summary: Get daily cash flow for a month
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/cash-flow', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    const m = month !== undefined ? parseInt(month as string, 10) : new Date().getMonth() + 1;
    const y = year !== undefined ? parseInt(year as string, 10) : new Date().getFullYear();

    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1970 || y > 9999) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }

    const result = await query(
      `SELECT
        DATE(date) as day,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END) as net
       FROM transactions
       WHERE user_id = $1
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR FROM date) = $3
       GROUP BY DATE(date)
       ORDER BY day`,
      [budgetUserId, m, y]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Cash flow error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/summary:
 *   get:
 *     summary: Get comprehensive financial summary
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const month = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const budgetUserId = (req as any).budgetUserId;

    const m: number = month || new Date().getMonth() + 1;
    const y: number = year || new Date().getFullYear();

    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(y) || y < 1970 || y > 9999) {
      return res.status(400).json({ error: 'Invalid month or year' });
    }

    // Get current month stats
    const currentMonth = await query(
      `SELECT 
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        COUNT(CASE WHEN type = 'expense' THEN 1 END) as expense_count,
        COUNT(CASE WHEN type = 'income' THEN 1 END) as income_count
       FROM transactions
       WHERE user_id = $1 
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR FROM date) = $3`,
      [budgetUserId, m, y]
    );

    // Get previous month stats for comparison
    const prevMonth: number = m === 1 ? 12 : (m - 1);
    const prevYear: number = m === 1 ? (y - 1) : y;

    const previousMonth = await query(
      `SELECT 
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income
       FROM transactions
       WHERE user_id = $1 
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR FROM date) = $3`,
      [budgetUserId, prevMonth, prevYear]
    );

    // Get budget totals
    const budgetStats = await query(
      `SELECT 
        SUM(amount_limit) as total_budget,
        COUNT(*) as budget_count
       FROM budgets
       WHERE user_id = $1 AND month = $2 AND year = $3`,
      [budgetUserId, m, y]
    );

    // Top spending categories
    const topCategories = await query(
      `SELECT 
        c.name,
        c.color,
        SUM(t.amount) as total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1 
         AND t.type = 'expense'
         AND EXTRACT(MONTH FROM t.date) = $2
         AND EXTRACT(YEAR FROM t.date) = $3
       GROUP BY c.id, c.name, c.color
       ORDER BY total DESC
       LIMIT 5`,
      [budgetUserId, m, y]
    );

    const current = currentMonth.rows[0];
    const previous = previousMonth.rows[0];
    const budgets = budgetStats.rows[0];

    const expenseChange = previous.expenses > 0 
      ? ((current.expenses - previous.expenses) / previous.expenses * 100)
      : 0;

    const incomeChange = previous.income > 0
      ? ((current.income - previous.income) / previous.income * 100)
      : 0;

    res.json({
      current: {
        expenses: parseFloat(current.expenses || 0),
        income: parseFloat(current.income || 0),
        net: parseFloat(current.income || 0) - parseFloat(current.expenses || 0),
        expense_count: parseInt(current.expense_count || 0),
        income_count: parseInt(current.income_count || 0),
      },
      changes: {
        expenses: expenseChange,
        income: incomeChange,
      },
      budgets: {
        total: parseFloat(budgets.total_budget || 0),
        count: parseInt(budgets.budget_count || 0),
        spent: parseFloat(current.expenses || 0),
        remaining: parseFloat(budgets.total_budget || 0) - parseFloat(current.expenses || 0),
      },
      topCategories: topCategories.rows,
    });
  } catch (error) {
    logger.error('Summary error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/income-vs-expenses:
 *   get:
 *     summary: Get income vs expenses comparison over time
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/income-vs-expenses', async (req: AuthRequest, res: Response) => {
  try {
    const { months = 12 } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    const m = Math.min(Math.max(parseInt(months as string, 10) || 12, 1), 60);

    const result = await query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', date), 'Mon YYYY') as month,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END) as savings
       FROM transactions
       WHERE user_id = $1
         AND date >= CURRENT_DATE - INTERVAL '${m} months'
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY DATE_TRUNC('month', date) DESC
       LIMIT ${m}`,
      [budgetUserId]
    );

    res.json(result.rows.reverse());
  } catch (error) {
    logger.error('Income vs expenses error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/export/csv:
 *   get:
 *     summary: Export analytics data to CSV
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year, type = 'summary' } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();

    let data: any[] = [];
    let filename = '';
    let headers: string[] = [];

    if (type === 'summary') {
      // Export comprehensive summary
      const result = await query(
        `SELECT 
          DATE(t.date) as date,
          t.type,
          t.amount,
          t.description,
          c.name as category,
          a.name as account
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN bank_accounts a ON t.account_id = a.id
         WHERE t.user_id = $1
           AND EXTRACT(MONTH FROM t.date) = $2
           AND EXTRACT(YEAR FROM t.date) = $3
         ORDER BY t.date DESC`,
        [budgetUserId, m, y]
      );

      data = result.rows;
      headers = ['Date', 'Type', 'Amount', 'Description', 'Category', 'Account'];
      filename = `transactions_${y}_${m}.csv`;
    } else if (type === 'category-breakdown') {
      const result = await query(
        `SELECT 
          c.name as category,
          SUM(t.amount) as total,
          COUNT(t.id) as transaction_count,
          AVG(t.amount) as average_amount
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = $1 
           AND t.type = 'expense'
           AND EXTRACT(MONTH FROM t.date) = $2
           AND EXTRACT(YEAR FROM t.date) = $3
         GROUP BY c.name
         ORDER BY total DESC`,
        [budgetUserId, m, y]
      );

      data = result.rows;
      headers = ['Category', 'Total', 'Transaction Count', 'Average Amount'];
      filename = `category_breakdown_${y}_${m}.csv`;
    } else if (type === 'budget-performance') {
      const result = await query(
        `SELECT 
          c.name as category,
          b.amount_limit as budget,
          COALESCE(SUM(t.amount), 0) as spent,
          b.amount_limit - COALESCE(SUM(t.amount), 0) as remaining,
          CASE 
            WHEN b.amount_limit > 0 THEN 
              ROUND((COALESCE(SUM(t.amount), 0) / b.amount_limit * 100)::numeric, 2)
            ELSE 0 
          END as percentage_used
         FROM budgets b
         JOIN categories c ON b.category_id = c.id
         LEFT JOIN transactions t ON t.category_id = b.category_id
           AND t.user_id = b.user_id
           AND EXTRACT(MONTH FROM t.date) = b.month
           AND EXTRACT(YEAR FROM t.date) = b.year
           AND t.type = 'expense'
         WHERE b.user_id = $1 
           AND b.month = $2 
           AND b.year = $3
         GROUP BY b.id, b.amount_limit, c.name
         ORDER BY percentage_used DESC`,
        [budgetUserId, m, y]
      );

      data = result.rows;
      headers = ['Category', 'Budget', 'Spent', 'Remaining', 'Percentage Used'];
      filename = `budget_performance_${y}_${m}.csv`;
    }

    // Convert to CSV
    const csvRows: string[] = [];
    csvRows.push(headers.join(','));

    data.forEach((row) => {
      const values = headers.map((header) => {
        const key = header.toLowerCase().replace(/ /g, '_');
        let value = row[key];
        
        // Handle special formatting
        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'number') {
          value = value.toFixed(2);
        } else {
          value = String(value);
          // Neutralize CSV/formula injection: prefix a single quote when the
          // value begins with a character a spreadsheet may interpret as a formula.
          if (/^[=+\-@\t\r]/.test(value)) {
            value = `'${value}`;
          }
          value = value.replace(/"/g, '""'); // Escape quotes
        }

        return `"${value}"`;
      });
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logger.error('Export CSV error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

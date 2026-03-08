import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Reports');
const router = Router();
router.use(authMiddleware);
router.use(sharingMiddleware);

// Expense Summary Report
router.get('/expense-summary', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { startDate, endDate } = req.query;

    const result = await query(
      `SELECT
        c.id,
        c.name,
        c.color,
        c.type,
        COALESCE(SUM(t.amount), 0) as total,
        COUNT(t.id) as transactionCount
      FROM categories c
      LEFT JOIN transactions t ON c.id = t.category_id
        AND t.user_id = $1
        AND t.date >= $2
        AND t.date <= $3
        AND t.type = 'expense'
      WHERE c.user_id = $1
        AND c.type = 'expense'
      GROUP BY c.id, c.name, c.color, c.type
      ORDER BY total ASC`,
      [budgetUserId, startDate, endDate]
    );

    const totalResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1
        AND date >= $2
        AND date <= $3
        AND type = 'expense'`,
      [budgetUserId, startDate, endDate]
    );

    res.json({
      categories: result.rows,
      totalExpenses: totalResult.rows[0]?.total || 0
    });
  } catch (error) {
    logger.error('Expense summary report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Income vs Expense Report
router.get('/income-expense', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { startDate, endDate } = req.query;

    // Get totals
    const totalsResult = await query(
      `SELECT
        type,
        COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1
        AND date >= $2
        AND date <= $3
      GROUP BY type`,
      [budgetUserId, startDate, endDate]
    );

    // Get monthly breakdown
    const monthlyResult = await query(
      `SELECT
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        type,
        COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1
        AND date >= $2
        AND date <= $3
      GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date), type
      ORDER BY year, month`,
      [budgetUserId, startDate, endDate]
    );

    const totals = totalsResult.rows.reduce((acc, row) => {
      acc[row.type] = parseFloat(row.total);
      return acc;
    }, { income: 0, expense: 0 });

    // Process monthly data
    const monthlyMap = new Map();
    monthlyResult.rows.forEach(row => {
      const key = `${row.year}-${row.month}`;
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          year: row.year,
          month: row.month,
          monthName: new Date(row.year, row.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
          income: 0,
          expenses: 0
        });
      }
      const month = monthlyMap.get(key);
      if (row.type === 'income') {
        month.income = parseFloat(row.total);
      } else {
        month.expenses = parseFloat(row.total);
      }
    });

    res.json({
      totalIncome: totals.income,
      totalExpenses: totals.expense,
      netIncome: totals.income + totals.expense,
      monthlyBreakdown: Array.from(monthlyMap.values())
    });
  } catch (error) {
    logger.error('Income/expense report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Category Trend Report
router.get('/category-trend', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { startDate, endDate, category_id } = req.query;

    let categoryFilter = '';
    const params: any[] = [budgetUserId, startDate, endDate];

    if (category_id && category_id !== 'undefined') {
      categoryFilter = 'AND t.category_id = $4';
      params.push(category_id);
    }

    const result = await query(
      `SELECT
        DATE_TRUNC('month', t.date) as month,
        c.name as category_name,
        c.color,
        COALESCE(SUM(t.amount), 0) as total,
        COUNT(t.id) as transaction_count
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1
        AND t.date >= $2
        AND t.date <= $3
        ${categoryFilter}
      GROUP BY DATE_TRUNC('month', t.date), c.name, c.color
      ORDER BY month`,
      params
    );

    res.json({
      trends: result.rows.map(row => ({
        ...row,
        monthName: new Date(row.month).toLocaleString('default', { month: 'long', year: 'numeric' })
      }))
    });
  } catch (error) {
    logger.error('Category trend report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Budget Performance Report
router.get('/budget-performance', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { startDate, endDate } = req.query;

    const startMonth = new Date(startDate as string).getMonth() + 1;
    const startYear = new Date(startDate as string).getFullYear();
    const endMonth = new Date(endDate as string).getMonth() + 1;
    const endYear = new Date(endDate as string).getFullYear();

    const result = await query(
      `SELECT
        b.id,
        b.amount_limit as limit,
        c.name as categoryName,
        c.color,
        COALESCE(SUM(t.amount), 0) as spent
      FROM budgets b
      JOIN categories c ON b.category_id = c.id
      LEFT JOIN transactions t ON c.id = t.category_id
        AND t.user_id = $1
        AND t.date >= $2
        AND t.date <= $3
        AND t.type = 'expense'
      WHERE b.user_id = $1
        AND ((b.year = $4 AND b.month >= $5) OR (b.year = $6 AND b.month <= $7) OR (b.year > $4 AND b.year < $6))
      GROUP BY b.id, b.amount_limit, c.name, c.color
      ORDER BY c.name`,
      [budgetUserId, startDate, endDate, startYear, startMonth, endYear, endMonth]
    );

    res.json({
      budgets: result.rows.map(row => ({
        ...row,
        limit: parseFloat(row.limit),
        spent: parseFloat(row.spent)
      }))
    });
  } catch (error) {
    logger.error('Budget performance report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bill Payment Report
router.get('/bill-payment', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { startDate, endDate } = req.query;

    const result = await query(
      `SELECT
        b.name as bill_name,
        b.amount as bill_amount,
        b.due_date,
        bp.payment_date,
        bp.amount_paid,
        bp.month,
        bp.year
      FROM bills b
      LEFT JOIN bill_payments bp ON b.id = bp.bill_id
        AND bp.payment_date >= $2
        AND bp.payment_date <= $3
      WHERE b.user_id = $1
        AND b.is_active = true
      ORDER BY bp.payment_date DESC`,
      [budgetUserId, startDate, endDate]
    );

    res.json({
      payments: result.rows
    });
  } catch (error) {
    logger.error('Bill payment report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cash Flow Report
router.get('/cash-flow', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const { startDate, endDate } = req.query;

    const result = await query(
      `SELECT
        DATE_TRUNC('week', date) as week,
        type,
        COALESCE(SUM(amount), 0) as total
      FROM transactions
      WHERE user_id = $1
        AND date >= $2
        AND date <= $3
      GROUP BY DATE_TRUNC('week', date), type
      ORDER BY week`,
      [budgetUserId, startDate, endDate]
    );

    // Process weekly data
    const weeklyMap = new Map();
    result.rows.forEach(row => {
      const weekStr = new Date(row.week).toISOString().split('T')[0];
      if (!weeklyMap.has(weekStr)) {
        weeklyMap.set(weekStr, {
          week: weekStr,
          weekDisplay: `Week of ${new Date(row.week).toLocaleDateString()}`,
          income: 0,
          expenses: 0,
          net: 0
        });
      }
      const week = weeklyMap.get(weekStr);
      if (row.type === 'income') {
        week.income = parseFloat(row.total);
      } else {
        week.expenses = parseFloat(row.total);
      }
      week.net = week.income + week.expenses;
    });

    res.json({
      cashFlow: Array.from(weeklyMap.values())
    });
  } catch (error) {
    logger.error('Cash flow report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
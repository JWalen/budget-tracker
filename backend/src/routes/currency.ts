import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { tenantMiddleware, TenantRequest } from '../middleware/tenant';
import {
  getSupportedCurrencies,
  getExchangeRate,
  convertCurrency,
  getExchangeRateTrends,
} from '../services/currency';
import { LoggerClass } from '../services/logger';

const router = Router();
const logger = new LoggerClass('Currency');

// ISO 4217 currency codes are three uppercase letters. Validate before using
// values to build external exchange-rate API URLs (prevents URL manipulation).
const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/;
const isValidCurrencyCode = (code: unknown): code is string =>
  typeof code === 'string' && CURRENCY_CODE_REGEX.test(code);

router.use(authMiddleware);
router.use(tenantMiddleware);

/**
 * @swagger
 * /currency/list:
 *   get:
 *     summary: Get supported currencies
 *     tags: [Currency]
 */
router.get('/list', async (req: TenantRequest, res: Response) => {
  try {
    const currencies = await getSupportedCurrencies();
    res.json(currencies);
  } catch (error) {
    logger.error('List currencies error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /currency/rate:
 *   get:
 *     summary: Get exchange rate
 *     tags: [Currency]
 */
router.get('/rate', async (req: TenantRequest, res: Response) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'From and to currencies required' });
    }

    if (!isValidCurrencyCode(from) || !isValidCurrencyCode(to)) {
      return res.status(400).json({ error: 'Invalid currency code' });
    }

    const rate = await getExchangeRate(from as string, to as string);
    
    res.json({
      from,
      to,
      rate,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Get rate error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /currency/convert:
 *   post:
 *     summary: Convert amount between currencies
 *     tags: [Currency]
 */
router.post('/convert', async (req: TenantRequest, res: Response) => {
  try {
    const { amount, from, to } = req.body;

    if (!amount || !from || !to) {
      return res.status(400).json({ error: 'Amount, from, and to currencies required' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    if (!isValidCurrencyCode(from) || !isValidCurrencyCode(to)) {
      return res.status(400).json({ error: 'Invalid currency code' });
    }

    const convertedAmount = await convertCurrency(numericAmount, from, to);
    const rate = await getExchangeRate(from, to);

    res.json({
      originalAmount: numericAmount,
      originalCurrency: from,
      convertedAmount,
      targetCurrency: to,
      exchangeRate: rate,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Convert error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /currency/trends:
 *   get:
 *     summary: Get exchange rate trends
 *     tags: [Currency]
 */
router.get('/trends', async (req: TenantRequest, res: Response) => {
  try {
    const { from, to, days = 30 } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'From and to currencies required' });
    }

    if (!isValidCurrencyCode(from) || !isValidCurrencyCode(to)) {
      return res.status(400).json({ error: 'Invalid currency code' });
    }

    const trends = await getExchangeRateTrends(
      from as string,
      to as string,
      parseInt(days as string, 10)
    );

    res.json(trends);
  } catch (error) {
    logger.error('Get trends error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /currency/user/default:
 *   get:
 *     summary: Get user's default currency
 *     tags: [Currency]
 */
router.get('/user/default', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await query('SELECT default_currency FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ defaultCurrency: result.rows[0].default_currency });
  } catch (error) {
    logger.error('Get default currency error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /currency/user/default:
 *   put:
 *     summary: Set user's default currency
 *     tags: [Currency]
 */
router.put('/user/default', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { currency } = req.body;

    if (!currency) {
      return res.status(400).json({ error: 'Currency is required' });
    }

    await query('UPDATE users SET default_currency = $1 WHERE id = $2', [currency, userId]);

    res.json({ message: 'Default currency updated', defaultCurrency: currency });
  } catch (error) {
    logger.error('Set default currency error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /currency/summary:
 *   get:
 *     summary: Get multi-currency summary for user
 *     tags: [Currency]
 */
router.get('/summary', async (req: TenantRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const organizationId = req.organizationId!;

    // Get user's default currency
    const userResult = await query('SELECT default_currency FROM users WHERE id = $1', [userId]);
    const defaultCurrency = userResult.rows[0].default_currency;

    // Get transactions grouped by currency
    const result = await query(
      `SELECT 
        currency,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE organization_id = $1
       GROUP BY currency`,
      [organizationId]
    );

    // Convert all to default currency
    const summaryPromises = result.rows.map(async (row) => {
      // Same source/target currency for both totals, so fetch the rate once.
      const rate = await getExchangeRate(row.currency, defaultCurrency);

      return {
        currency: row.currency,
        totalExpenses: parseFloat(row.total_expenses),
        totalIncome: parseFloat(row.total_income),
        transactionCount: parseInt(row.transaction_count),
        convertedExpenses: parseFloat(row.total_expenses) * rate,
        convertedIncome: parseFloat(row.total_income) * rate,
      };
    });

    const summary = await Promise.all(summaryPromises);

    // Calculate totals
    const totals = summary.reduce(
      (acc, curr) => ({
        totalExpenses: acc.totalExpenses + curr.convertedExpenses,
        totalIncome: acc.totalIncome + curr.convertedIncome,
        totalTransactions: acc.totalTransactions + curr.transactionCount,
      }),
      { totalExpenses: 0, totalIncome: 0, totalTransactions: 0 }
    );

    res.json({
      defaultCurrency,
      byCurrency: summary,
      totals: {
        ...totals,
        net: totals.totalIncome - totals.totalExpenses,
      },
    });
  } catch (error) {
    logger.error('Get currency summary error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

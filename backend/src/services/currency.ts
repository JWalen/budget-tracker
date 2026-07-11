import axios from 'axios';
import NodeCache from 'node-cache';
import { query } from '../config/database';
import { LoggerClass } from './logger';

const logger = new LoggerClass('Currency');

// Cache exchange rates for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// Free API: exchangerate-api.com (1,500 requests/month on free tier)
const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest/';
const BACKUP_API_URL = 'https://open.er-api.com/v6/latest/';

/**
 * Get exchange rate between two currencies
 */
export const getExchangeRate = async (fromCurrency: string, toCurrency: string): Promise<number> => {
  try {
    // If same currency, rate is 1
    if (fromCurrency === toCurrency) {
      return 1.0;
    }

    const cacheKey = `${fromCurrency}_${toCurrency}`;
    const cached = cache.get<number>(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Check database cache (last 24 hours)
    const today = new Date().toISOString().split('T')[0];
    const dbResult = await query(
      'SELECT rate FROM exchange_rates WHERE from_currency = $1 AND to_currency = $2 AND date = $3',
      [fromCurrency, toCurrency, today]
    );

    if (dbResult.rows.length > 0) {
      const rate = parseFloat(dbResult.rows[0].rate);
      cache.set(cacheKey, rate);
      return rate;
    }

    // Fetch from API
    try {
      const response = await axios.get(`${EXCHANGE_API_URL}${fromCurrency}`, { timeout: 5000 });
      const rates = response.data.rates;
      
      if (!rates || !rates[toCurrency]) {
        throw new Error('Currency not found');
      }

      const rate = rates[toCurrency];

      // Cache in database
      await query(
        'INSERT INTO exchange_rates (from_currency, to_currency, rate, date) VALUES ($1, $2, $3, $4) ON CONFLICT (from_currency, to_currency, date) DO UPDATE SET rate = $3',
        [fromCurrency, toCurrency, rate, today]
      );

      // Cache in memory
      cache.set(cacheKey, rate);

      return rate;
    } catch (error) {
      // Try backup API
      logger.warn('Primary exchange API failed, trying backup', error as Error);
      
      const backupResponse = await axios.get(`${BACKUP_API_URL}${fromCurrency}`, { timeout: 5000 });
      const rates = backupResponse.data.rates;
      
      if (!rates || !rates[toCurrency]) {
        throw new Error('Currency not found in backup API');
      }

      const rate = rates[toCurrency];
      
      await query(
        'INSERT INTO exchange_rates (from_currency, to_currency, rate, date) VALUES ($1, $2, $3, $4) ON CONFLICT (from_currency, to_currency, date) DO UPDATE SET rate = $3',
        [fromCurrency, toCurrency, rate, today]
      );

      cache.set(cacheKey, rate);

      return rate;
    }
  } catch (error) {
    // Do NOT silently fall back to 1.0 — that reports e.g. EUR↔JPY at par and
    // produces wrong money with no signal. Surface the failure so the route can
    // return a 5xx and the UI can say "rates unavailable". Same-currency (rate 1)
    // is handled up front and never reaches here.
    logger.error('Get exchange rate error', error as Error);
    throw new Error('Exchange rate unavailable');
  }
};

/**
 * Convert amount from one currency to another
 */
export const convertCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> => {
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return amount * rate;
};

/**
 * Get all supported currencies
 */
export const getSupportedCurrencies = async () => {
  try {
    const result = await query('SELECT * FROM currencies WHERE is_active = true ORDER BY code');
    return result.rows;
  } catch (error) {
    logger.error('Get currencies error', error as Error);
    return [];
  }
};

/**
 * Get historical exchange rate
 */
export const getHistoricalRate = async (
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<number> => {
  try {
    const result = await query(
      'SELECT rate FROM exchange_rates WHERE from_currency = $1 AND to_currency = $2 AND date = $3',
      [fromCurrency, toCurrency, date]
    );

    if (result.rows.length > 0) {
      return parseFloat(result.rows[0].rate);
    }

    // If not in database, use current rate as fallback
    return await getExchangeRate(fromCurrency, toCurrency);
  } catch (error) {
    logger.error('Get historical rate error', error as Error);
    return 1.0;
  }
};

/**
 * Convert transaction to user's default currency
 */
export const convertTransactionAmount = async (
  amount: number,
  transactionCurrency: string,
  userDefaultCurrency: string,
  transactionDate?: Date
): Promise<{ convertedAmount: number; exchangeRate: number }> => {
  if (transactionCurrency === userDefaultCurrency) {
    return { convertedAmount: amount, exchangeRate: 1.0 };
  }

  let exchangeRate: number;

  if (transactionDate) {
    const dateStr = transactionDate.toISOString().split('T')[0];
    exchangeRate = await getHistoricalRate(transactionCurrency, userDefaultCurrency, dateStr);
  } else {
    exchangeRate = await getExchangeRate(transactionCurrency, userDefaultCurrency);
  }

  const convertedAmount = amount * exchangeRate;

  return { convertedAmount, exchangeRate };
};

/**
 * Batch convert multiple transactions
 */
export const batchConvertTransactions = async (
  transactions: Array<{ amount: number; currency: string; date?: Date }>,
  targetCurrency: string
): Promise<Array<{ originalAmount: number; convertedAmount: number; exchangeRate: number }>> => {
  const results = await Promise.all(
    transactions.map(async (t) => {
      const { convertedAmount, exchangeRate } = await convertTransactionAmount(
        t.amount,
        t.currency,
        targetCurrency,
        t.date
      );

      return {
        originalAmount: t.amount,
        convertedAmount,
        exchangeRate,
      };
    })
  );

  return results;
};

/**
 * Get exchange rate trends over time
 */
export const getExchangeRateTrends = async (
  fromCurrency: string,
  toCurrency: string,
  days: number = 30
): Promise<Array<{ date: string; rate: number }>> => {
  try {
    const result = await query(
      `SELECT date, rate FROM exchange_rates 
       WHERE from_currency = $1 AND to_currency = $2 
       AND date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY date DESC`,
      [fromCurrency, toCurrency]
    );

    return result.rows.map((row) => ({
      date: row.date,
      rate: parseFloat(row.rate),
    }));
  } catch (error) {
    logger.error('Get exchange rate trends error', error as Error);
    return [];
  }
};

import { Pool } from 'pg';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Database');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors
pool.on('error', (err, client) => {
  logger.error('Unexpected database pool error', err);
  // Don't exit - let pool handle reconnection
});

pool.on('connect', (client) => {
  logger.debug('New database client connected to pool');
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool');
});

// Enhanced query function with error handling and logging
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries
    if (duration > 1000) {
      logger.warn('Slow query detected', {
        duration: `${duration}ms`,
        query: text.substring(0, 100),
        params: params?.length,
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Database query error', error as Error, {
      duration: `${duration}ms`,
      query: text.substring(0, 200),
    });
    throw error;
  }
};

export default pool;

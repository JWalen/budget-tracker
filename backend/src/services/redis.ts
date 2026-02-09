import Redis from 'ioredis';
import { LoggerClass } from './logger';

const logger = new LoggerClass('Redis');

let redis: Redis | null = null;

export const initRedis = (): Redis | null => {
  // Only initialize if Redis URL is provided
  if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
    logger.warn('Redis URL not configured in production');
    return null;
  }

  if (!process.env.REDIS_URL) {
    logger.info('Redis not configured, caching disabled');
    return null;
  }

  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (error) => {
      logger.error('Redis connection error', error);
    });

    redis.on('ready', () => {
      logger.info('Redis ready for commands');
    });

    // Connect immediately
    redis.connect().catch((error) => {
      logger.error('Failed to connect to Redis', error);
    });

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis', error as Error);
    return null;
  }
};

// Cache helper functions
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (!redis) return null;

    try {
      const value = await redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key: ${key}`, error as Error);
      return null;
    }
  },

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
    if (!redis) return false;

    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error(`Cache set error for key: ${key}`, error as Error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    if (!redis) return false;

    try {
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key: ${key}`, error as Error);
      return false;
    }
  },

  async delPattern(pattern: string): Promise<number> {
    if (!redis) return 0;

    try {
      const keys = await redis.keys(pattern);
      if (keys.length === 0) return 0;
      return await redis.del(...keys);
    } catch (error) {
      logger.error(`Cache delete pattern error: ${pattern}`, error as Error);
      return 0;
    }
  },

  async exists(key: string): Promise<boolean> {
    if (!redis) return false;

    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Cache exists error for key: ${key}`, error as Error);
      return false;
    }
  },
};

export const getRedis = (): Redis | null => redis;

export default redis;

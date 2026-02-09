import { Response, NextFunction } from 'express';
import { redisClient } from '../services/redis';
import { TenantRequest } from './tenant';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Cache');
const DEFAULT_TTL = 300; // 5 minutes

/**
 * Cache middleware for GET requests
 * @param ttl Time to live in seconds (default: 300)
 * @param keyGenerator Optional function to generate custom cache key
 */
export const cacheMiddleware = (ttl: number = DEFAULT_TTL, keyGenerator?: (req: TenantRequest) => string) => {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip if Redis not available
    if (!redisClient) {
      return next();
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator 
        ? keyGenerator(req)
        : `cache:${req.userId}:${req.organizationId}:${req.originalUrl}`;

      // Try to get from cache
      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        logger.info(`Cache hit: ${cacheKey}`);
        return res.json(JSON.parse(cachedData));
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = (data: any) => {
        // Cache the response
        redisClient.setex(cacheKey, ttl, JSON.stringify(data))
          .catch((error) => {
            logger.error('Cache write error', error as Error);
          });

        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', error as Error);
      next();
    }
  };
};

/**
 * Invalidate cache by pattern
 */
export const invalidateCache = async (pattern: string) => {
  if (!redisClient) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.info(`Invalidated ${keys.length} cache keys matching: ${pattern}`);
    }
  } catch (error) {
    logger.error('Cache invalidation error', error as Error);
  }
};

/**
 * Invalidate user cache
 */
export const invalidateUserCache = async (userId: number) => {
  await invalidateCache(`cache:${userId}:*`);
};

/**
 * Invalidate organization cache
 */
export const invalidateOrganizationCache = async (organizationId: number) => {
  await invalidateCache(`cache:*:${organizationId}:*`);
};

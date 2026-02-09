import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { TenantRequest } from './tenant';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('UsageLimits');

export interface PlanLimits {
  transactions_per_month: number;
  budgets: number;
  categories: number;
  users: number;
  receipts_per_month: number;
  [key: string]: number;
}

/**
 * Get user's current plan and limits
 */
export async function getUserPlanLimits(userId: number, organizationId: number): Promise<PlanLimits | null> {
  try {
    const result = await query(
      `SELECT sp.limits
       FROM subscriptions s
       JOIN subscription_plans sp ON s.plan_id = sp.id
       WHERE (s.user_id = $1 OR s.organization_id = $2) 
         AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId, organizationId]
    );

    if (result.rows.length === 0) {
      // Default to free plan limits
      const freePlan = await query(
        "SELECT limits FROM subscription_plans WHERE name = 'free'"
      );
      return freePlan.rows[0]?.limits || null;
    }

    return result.rows[0].limits;
  } catch (error) {
    logger.error('Get plan limits error', error as Error);
    return null;
  }
}

/**
 * Get current usage for a resource type
 */
export async function getCurrentUsage(
  userId: number,
  organizationId: number,
  resourceType: string
): Promise<number> {
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await query(
      `SELECT count FROM usage_tracking 
       WHERE user_id = $1 AND resource_type = $2 AND period_start = $3`,
      [userId, resourceType, periodStart]
    );

    return result.rows[0]?.count || 0;
  } catch (error) {
    logger.error('Get usage error', error as Error);
    return 0;
  }
}

/**
 * Increment usage counter for a resource
 */
export async function incrementUsage(
  userId: number,
  organizationId: number,
  resourceType: string,
  amount: number = 1
): Promise<void> {
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    await query(
      `INSERT INTO usage_tracking (user_id, resource_type, count, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, resource_type, period_start)
       DO UPDATE SET count = usage_tracking.count + $3, updated_at = NOW()`,
      [userId, resourceType, amount, periodStart, periodEnd]
    );
  } catch (error) {
    logger.error('Increment usage error', error as Error);
  }
}

/**
 * Check if adding a resource would exceed limits
 */
export async function checkLimit(
  userId: number,
  organizationId: number,
  resourceType: string,
  amount: number = 1
): Promise<{ allowed: boolean; current: number; limit: number; message?: string }> {
  try {
    const limits = await getUserPlanLimits(userId, organizationId);
    if (!limits) {
      return { allowed: false, current: 0, limit: 0, message: 'Could not retrieve plan limits' };
    }

    const limitKey = resourceType.replace(/_per_month$/, '');
    const limit = limits[limitKey] || limits[resourceType];

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, current: 0, limit: -1 };
    }

    // For monthly limits, check current usage
    if (resourceType.includes('_per_month')) {
      const current = await getCurrentUsage(userId, organizationId, resourceType);
      const allowed = (current + amount) <= limit;
      
      return {
        allowed,
        current,
        limit,
        message: allowed ? undefined : `Monthly limit of ${limit} ${resourceType.replace('_per_month', '')} reached`
      };
    }

    // For absolute limits (budgets, categories), count current resources
    let current = 0;
    
    if (resourceType === 'budgets') {
      const result = await query(
        'SELECT COUNT(*) as count FROM budgets WHERE organization_id = $1',
        [organizationId]
      );
      current = parseInt(result.rows[0].count, 10);
    } else if (resourceType === 'categories') {
      const result = await query(
        'SELECT COUNT(*) as count FROM categories WHERE organization_id = $1',
        [organizationId]
      );
      current = parseInt(result.rows[0].count, 10);
    } else if (resourceType === 'users') {
      const result = await query(
        'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = $1',
        [organizationId]
      );
      current = parseInt(result.rows[0].count, 10);
    }

    const allowed = (current + amount) <= limit;

    return {
      allowed,
      current,
      limit,
      message: allowed ? undefined : `Limit of ${limit} ${resourceType} reached`
    };
  } catch (error) {
    logger.error('Check limit error', error as Error);
    return { allowed: false, current: 0, limit: 0, message: 'Error checking limits' };
  }
}

/**
 * Middleware to check resource limits before creation
 */
export const checkResourceLimit = (resourceType: string) => {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId!;
      const organizationId = req.organizationId!;

      const limitCheck = await checkLimit(userId, organizationId, resourceType);

      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: 'Plan limit exceeded',
          message: limitCheck.message,
          current: limitCheck.current,
          limit: limitCheck.limit,
          upgradeUrl: '/subscription/plans'
        });
      }

      next();
    } catch (error) {
      logger.error('Check resource limit middleware error', error as Error);
      res.status(500).json({ error: 'Server error' });
    }
  };
};

/**
 * Middleware to track usage after successful creation
 */
export const trackUsage = (resourceType: string) => {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to track usage after response
    res.json = function (body: any) {
      // Only track on successful creation (201) or success (200)
      if (res.statusCode === 200 || res.statusCode === 201) {
        const userId = req.userId!;
        const organizationId = req.organizationId!;
        
        // Track usage asynchronously (don't wait)
        incrementUsage(userId, organizationId, resourceType).catch((error) => {
          logger.error('Track usage error', error as Error);
        });
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Get usage summary for dashboard
 */
export async function getUsageSummary(userId: number, organizationId: number) {
  try {
    const limits = await getUserPlanLimits(userId, organizationId);
    if (!limits) {
      return null;
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get current usage
    const usageResult = await query(
      'SELECT resource_type, count FROM usage_tracking WHERE user_id = $1 AND period_start = $2',
      [userId, periodStart]
    );

    const usage: Record<string, number> = {};
    usageResult.rows.forEach((row) => {
      usage[row.resource_type] = row.count;
    });

    // Get resource counts
    const [budgetsResult, categoriesResult, membersResult] = await Promise.all([
      query('SELECT COUNT(*) as count FROM budgets WHERE organization_id = $1', [organizationId]),
      query('SELECT COUNT(*) as count FROM categories WHERE organization_id = $1', [organizationId]),
      query('SELECT COUNT(*) as count FROM organization_members WHERE organization_id = $1', [organizationId])
    ]);

    return {
      limits,
      usage: {
        transactions: usage.transactions_per_month || 0,
        receipts: usage.receipts_per_month || 0,
        budgets: parseInt(budgetsResult.rows[0].count, 10),
        categories: parseInt(categoriesResult.rows[0].count, 10),
        users: parseInt(membersResult.rows[0].count, 10)
      },
      percentages: {
        transactions: limits.transactions_per_month === -1 ? 0 : 
          ((usage.transactions_per_month || 0) / limits.transactions_per_month) * 100,
        receipts: limits.receipts_per_month === -1 ? 0 :
          ((usage.receipts_per_month || 0) / limits.receipts_per_month) * 100,
        budgets: limits.budgets === -1 ? 0 :
          (parseInt(budgetsResult.rows[0].count, 10) / limits.budgets) * 100,
        categories: limits.categories === -1 ? 0 :
          (parseInt(categoriesResult.rows[0].count, 10) / limits.categories) * 100,
        users: limits.users === -1 ? 0 :
          (parseInt(membersResult.rows[0].count, 10) / limits.users) * 100
      }
    };
  } catch (error) {
    logger.error('Get usage summary error', error as Error);
    return null;
  }
}

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('TenantMiddleware');

export interface TenantRequest extends Request {
  userId?: number;
  organizationId?: number;
  userRole?: string;
  isOwner?: boolean;
}

/**
 * Tenant isolation middleware
 * Resolves the active organization for the current user
 * Sets organizationId and userRole on the request
 */
export const tenantMiddleware = async (
  req: TenantRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return next(); // Auth middleware should handle this
    }

    // Get organization ID from header (for organization switching)
    const orgIdHeader = req.headers['x-organization-id'] as string;
    
    let organizationId: number;
    let userRole: string;

    if (orgIdHeader) {
      // User is explicitly selecting an organization
      const orgId = parseInt(orgIdHeader, 10);
      
      // Verify user has access to this organization
      const memberResult = await query(
        `SELECT om.role, o.id, o.owner_id
         FROM organization_members om
         JOIN organizations o ON om.organization_id = o.id
         WHERE om.organization_id = $1 AND om.user_id = $2`,
        [orgId, userId]
      );

      if (memberResult.rows.length === 0) {
        return res.status(403).json({ error: 'No access to this organization' });
      }

      organizationId = memberResult.rows[0].id;
      userRole = memberResult.rows[0].role;
      req.isOwner = memberResult.rows[0].owner_id === userId;
    } else {
      // Default to user's personal organization or first organization
      const orgResult = await query(
        `SELECT om.organization_id, om.role, o.owner_id
         FROM organization_members om
         JOIN organizations o ON om.organization_id = o.id
         WHERE om.user_id = $1
         ORDER BY 
           CASE WHEN o.slug LIKE 'personal-%' THEN 0 ELSE 1 END,
           om.joined_at ASC
         LIMIT 1`,
        [userId]
      );

      if (orgResult.rows.length === 0) {
        // User has no organization - this shouldn't happen after migration
        logger.error('User has no organization', { userId });
        return res.status(500).json({ error: 'No organization found' });
      }

      organizationId = orgResult.rows[0].organization_id;
      userRole = orgResult.rows[0].role;
      req.isOwner = orgResult.rows[0].owner_id === userId;
    }

    // Set on request for route handlers
    req.organizationId = organizationId;
    req.userRole = userRole;

    next();
  } catch (error) {
    logger.error('Tenant middleware error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Require specific role in organization
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    const userRole = req.userRole;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: userRole 
      });
    }

    next();
  };
};

/**
 * Require organization owner
 */
export const requireOwner = (req: TenantRequest, res: Response, next: NextFunction) => {
  if (!req.isOwner && req.userRole !== 'owner') {
    return res.status(403).json({ error: 'Only organization owner can perform this action' });
  }
  next();
};

/**
 * Check if user can write (not just viewer)
 */
export const requireWriteAccess = (req: TenantRequest, res: Response, next: NextFunction) => {
  if (req.userRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot modify data' });
  }
  next();
};

import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from './auth';

/**
 * Shared-budget access is modeled on Households (organizations).
 *
 * Budget data is scoped per user (transactions.user_id, budgets.user_id, ...).
 * A "household" is an `organizations` row whose members are listed in
 * `organization_members`. A user may view/edit another user's budget when both
 * users are members of the same household. The requester's household role
 * determines whether they get read-only ('view') or read-write ('edit') access.
 *
 * The active budget owner is selected client-side and sent via the
 * `X-Budget-Owner` header. When it is absent or equal to the caller, the caller
 * simply operates on their own data.
 */
export const sharingMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const budgetOwnerHeader = req.headers['x-budget-owner'] as string | undefined;

    // No header, or pointing at self → operate on own data.
    if (!budgetOwnerHeader || parseInt(budgetOwnerHeader, 10) === req.userId) {
      (req as any).budgetUserId = req.userId;
      (req as any).shareRole = 'owner';
      return next();
    }

    const ownerId = parseInt(budgetOwnerHeader, 10);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      return res.status(400).json({ error: 'Invalid budget owner' });
    }

    // Grant access if the caller and the target owner share a household.
    // Pick the most privileged role across shared households (owner > admin > member > viewer).
    const shareResult = await query(
      `SELECT me.role AS role
         FROM organization_members me
         JOIN organization_members owner
           ON me.organization_id = owner.organization_id
        WHERE me.user_id = $1
          AND owner.user_id = $2
        ORDER BY CASE me.role
                   WHEN 'owner' THEN 0
                   WHEN 'admin' THEN 1
                   WHEN 'member' THEN 2
                   WHEN 'viewer' THEN 3
                   ELSE 4
                 END
        LIMIT 1`,
      [req.userId, ownerId]
    );

    if (shareResult.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this budget' });
    }

    const role = shareResult.rows[0].role;
    (req as any).budgetUserId = ownerId;
    // Viewers get read-only; every other household role can edit.
    (req as any).shareRole = role === 'viewer' ? 'view' : 'edit';
    next();
  } catch (error) {
    console.error('Sharing middleware error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const requireEditAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  const role = (req as any).shareRole;
  if (role === 'view') {
    return res.status(403).json({ error: 'You have view-only access to this budget' });
  }
  next();
};

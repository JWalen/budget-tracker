import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AuthRequest } from './auth';

export const sharingMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const budgetOwnerId = req.headers['x-budget-owner'] as string;

    if (!budgetOwnerId || parseInt(budgetOwnerId) === req.userId) {
      // Using own budget
      (req as any).budgetUserId = req.userId;
      (req as any).shareRole = 'owner';
      return next();
    }

    const ownerId = parseInt(budgetOwnerId);

    // Check if the current user has access to this budget
    const shareResult = await query(
      `SELECT role FROM budget_shares
       WHERE owner_id = $1 AND shared_with_id = $2 AND status = 'accepted'`,
      [ownerId, req.userId]
    );

    if (shareResult.rows.length === 0) {
      return res.status(403).json({ error: 'You do not have access to this budget' });
    }

    (req as any).budgetUserId = ownerId;
    (req as any).shareRole = shareResult.rows[0].role;
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

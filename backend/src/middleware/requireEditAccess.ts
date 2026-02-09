import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const requireEditAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  const shareRole = (req as any).shareRole;

  // If user is viewing someone else's budget with 'view' permission only
  if (shareRole === 'view') {
    return res.status(403).json({ error: 'You have read-only access to this budget' });
  }

  // User owns the budget or has 'edit' permission
  next();
};
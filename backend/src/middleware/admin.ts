import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { query } from '../config/database';

export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);

    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

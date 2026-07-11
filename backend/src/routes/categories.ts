import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import { handleRouteError } from '../utils/apiError';

const logger = new LoggerClass('Categories');

const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get all categories
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'SELECT * FROM categories WHERE user_id = $1 ORDER BY type, name',
      [budgetUserId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create category
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, color, icon, exclude_from_income } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const result = await query(
      'INSERT INTO categories (user_id, name, type, color, icon, exclude_from_income) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [budgetUserId, name, type, color || '#6366f1', icon || 'tag', exclude_from_income || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    return handleRouteError(res, error, 'Could not create the category. If the name already exists, try a different one.', logger);
  }
});

// Update category
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, color, icon, exclude_from_income } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (type !== undefined && type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'Invalid type' });
    }

    // COALESCE preserves existing color/icon when omitted (previously nulled them);
    // `type` is now actually persisted (it was validated but never written before).
    const result = await query(
      `UPDATE categories
       SET name = $1,
           type = COALESCE($2, type),
           color = COALESCE($3, color),
           icon = COALESCE($4, icon),
           exclude_from_income = COALESCE($5, exclude_from_income)
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [name.trim(), type ?? null, color ?? null, icon ?? null,
       exclude_from_income ?? null, id, budgetUserId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    return handleRouteError(res, error, 'Could not update the category. Please try again.', logger);
  }
});

// Delete category
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted' });
  } catch (error) {
    return handleRouteError(res, error, 'Could not delete the category. If transactions still use it, reassign them first.', logger);
  }
});

export default router;

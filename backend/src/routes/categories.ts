import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';

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
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create category
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, color, icon, exclude_from_income } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'INSERT INTO categories (user_id, name, type, color, icon, exclude_from_income) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [budgetUserId, name, type, color || '#6366f1', icon || 'tag', exclude_from_income || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update category
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color, icon, exclude_from_income } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'UPDATE categories SET name = $1, color = $2, icon = $3, exclude_from_income = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
      [name, color, icon, exclude_from_income || false, id, budgetUserId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Server error' });
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
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

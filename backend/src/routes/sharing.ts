import { Router, Response } from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import logger from '../config/logger';

const router = Router();

router.use(authMiddleware);

// GET /api/sharing — Get all shares for the current user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const [myShares, sharedWithMe] = await Promise.all([
      query(
        `SELECT bs.id, bs.shared_with_id, bs.shared_with_email, bs.role, bs.status, bs.invite_token, bs.created_at,
                u.name as shared_with_name
         FROM budget_shares bs
         LEFT JOIN users u ON u.id = bs.shared_with_id
         WHERE bs.owner_id = $1
         ORDER BY bs.created_at DESC`,
        [userId]
      ),
      query(
        `SELECT bs.id, bs.owner_id, bs.role, bs.status, bs.created_at,
                u.name as owner_name, u.email as owner_email
         FROM budget_shares bs
         JOIN users u ON u.id = bs.owner_id
         WHERE bs.shared_with_id = $1 AND bs.status = 'accepted'
         ORDER BY bs.created_at DESC`,
        [userId]
      ),
    ]);

    res.json({
      myShares: myShares.rows,
      sharedWithMe: sharedWithMe.rows,
    });
  } catch (error) {
    logger.error('Get shares error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sharing/pending — Get pending invites for the current user
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) {
      return res.json([]);
    }
    const email = userResult.rows[0].email;

    const pending = await query(
      `SELECT bs.id, bs.owner_id, bs.role, bs.invite_token, bs.created_at,
              u.name as owner_name, u.email as owner_email
       FROM budget_shares bs
       JOIN users u ON u.id = bs.owner_id
       WHERE bs.shared_with_email = $1 AND bs.status = 'pending'
       ORDER BY bs.created_at DESC`,
      [email]
    );

    res.json(pending.rows);
  } catch (error) {
    logger.error('Get pending invites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sharing/invite — Invite someone to share your budget
router.post('/invite', async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    const userId = req.userId;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (role && !['view', 'edit'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "view" or "edit"' });
    }

    // Check not inviting self
    const selfResult = await query('SELECT email FROM users WHERE id = $1', [userId]);
    if (selfResult.rows[0]?.email === email) {
      return res.status(400).json({ error: 'You cannot share with yourself' });
    }

    // Check for existing share
    const existing = await query(
      'SELECT id FROM budget_shares WHERE owner_id = $1 AND shared_with_email = $2',
      [userId, email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You already have a share with this email' });
    }

    // Check if the invited user already exists
    const invitedUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    const sharedWithId = invitedUser.rows.length > 0 ? invitedUser.rows[0].id : null;

    const inviteToken = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `INSERT INTO budget_shares (owner_id, shared_with_id, shared_with_email, role, status, invite_token)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, sharedWithId, email, role || 'view', 'pending', inviteToken]
    );

    logger.info('Budget share invite created', { ownerId: userId, email, role });
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Invite share error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/sharing/accept/:token — Accept a share invite
router.post('/accept/:token', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.params;

    const shareResult = await query(
      `SELECT bs.*, u.email as owner_email FROM budget_shares bs
       JOIN users u ON u.id = bs.owner_id
       WHERE bs.invite_token = $1 AND bs.status = 'pending'`,
      [token]
    );

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    const share = shareResult.rows[0];

    // Verify the accepting user matches the invite email
    const userResult = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows[0]?.email !== share.shared_with_email) {
      return res.status(403).json({ error: 'This invite is not for your account' });
    }

    await query(
      `UPDATE budget_shares SET shared_with_id = $1, status = 'accepted', updated_at = NOW()
       WHERE id = $2`,
      [req.userId, share.id]
    );

    logger.info('Budget share accepted', { shareId: share.id, userId: req.userId });
    res.json({ message: 'Invite accepted' });
  } catch (error) {
    logger.error('Accept invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/sharing/:id — Update share role
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const shareId = parseInt(req.params.id);
    const { role } = req.body;

    if (!['view', 'edit'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "view" or "edit"' });
    }

    const result = await query(
      `UPDATE budget_shares SET role = $1, updated_at = NOW()
       WHERE id = $2 AND owner_id = $3 RETURNING *`,
      [role, shareId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update share error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/sharing/:id — Revoke or leave a share
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const shareId = parseInt(req.params.id);

    // Allow deletion if user is the owner or the shared-with user
    const result = await query(
      `DELETE FROM budget_shares WHERE id = $1 AND (owner_id = $2 OR shared_with_id = $2) RETURNING *`,
      [shareId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    logger.info('Budget share removed', { shareId, userId: req.userId });
    res.json({ message: 'Share removed' });
  } catch (error) {
    logger.error('Delete share error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

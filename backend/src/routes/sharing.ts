import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import logger from '../config/logger';

const router = Router();

router.use(authMiddleware);

/**
 * Shared-budget access is now modeled on Households (organizations). This router
 * exposes the data the budget switcher needs: the set of other users whose
 * budgets the caller can access because they share a household.
 *
 * Household membership itself (inviting/removing members) is managed via
 * /api/organizations. The legacy budget_shares invite/accept endpoints are gone.
 */

// GET /api/sharing — budgets available to the caller via shared households.
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const sharedWithMe = await query(
      `SELECT DISTINCT ON (other.id)
              other.id    AS owner_id,
              other.name  AS owner_name,
              other.email AS owner_email,
              CASE WHEN me.role = 'viewer' THEN 'view' ELSE 'edit' END AS role
         FROM organization_members me
         JOIN organization_members co
           ON co.organization_id = me.organization_id
          AND co.user_id <> me.user_id
         JOIN users other ON other.id = co.user_id
        WHERE me.user_id = $1
        ORDER BY other.id,
                 CASE me.role
                   WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3
                 END`,
      [req.userId]
    );

    res.json({ myShares: [], sharedWithMe: sharedWithMe.rows });
  } catch (error) {
    logger.error('Get shares error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/sharing/pending — pending household invitations addressed to the caller.
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) return res.json([]);
    const email = userResult.rows[0].email;

    const pending = await query(
      `SELECT oi.id, oi.token, oi.role, oi.created_at,
              o.id AS organization_id, o.name AS household_name,
              u.name AS owner_name, u.email AS owner_email
         FROM organization_invitations oi
         JOIN organizations o ON o.id = oi.organization_id
         LEFT JOIN users u ON u.id = o.owner_id
        WHERE oi.email = $1 AND oi.accepted_at IS NULL AND oi.expires_at > NOW()
        ORDER BY oi.created_at DESC`,
      [email]
    );

    res.json(pending.rows);
  } catch (error) {
    logger.error('Get pending invites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// The legacy budget_shares invite/accept/update/delete endpoints have been
// removed. Household membership is managed through /api/organizations.
const gone = (_req: AuthRequest, res: Response) =>
  res.status(410).json({ error: 'Budget sharing is now managed through Households (Organizations).' });

router.post('/invite', gone);
router.post('/accept/:token', gone);
router.put('/:id', gone);
router.delete('/:id', gone);

export default router;

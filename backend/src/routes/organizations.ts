import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { tenantMiddleware, requireOwner, requireWriteAccess, TenantRequest } from '../middleware/tenant';
import { LoggerClass } from '../services/logger';
import crypto from 'crypto';

const router = Router();
const logger = new LoggerClass('Organizations');

// Apply auth to all routes
router.use(authMiddleware);

/**
 * @swagger
 * /organizations:
 *   get:
 *     summary: Get user's organizations
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT o.*, om.role, om.joined_at,
              (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY 
         CASE WHEN o.slug LIKE 'personal-%' THEN 0 ELSE 1 END,
         om.joined_at ASC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get organizations error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /organizations/{id}:
 *   get:
 *     summary: Get organization details
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', tenantMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const userId = req.userId!;

    // Verify user has access
    const result = await query(
      `SELECT o.*, om.role,
              (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count,
              (SELECT json_agg(json_build_object(
                'id', u.id,
                'name', u.name,
                'email', u.email,
                'role', om2.role,
                'joined_at', om2.joined_at
              )) FROM organization_members om2
              JOIN users u ON om2.user_id = u.id
              WHERE om2.organization_id = o.id) as members
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE o.id = $1 AND om.user_id = $2`,
      [orgId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get organization error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /organizations:
 *   post:
 *     summary: Create new organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Generate unique slug
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await query('SELECT id FROM organizations WHERE slug = $1', [slug]);
      if (existing.rows.length === 0) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create organization
    const orgResult = await query(
      'INSERT INTO organizations (name, slug, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name, slug, userId]
    );

    const organization = orgResult.rows[0];

    // Add creator as owner
    await query(
      'INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)',
      [organization.id, userId, 'owner']
    );

    res.status(201).json(organization);
  } catch (error) {
    logger.error('Create organization error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /organizations/{id}:
 *   patch:
 *     summary: Update organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id', tenantMiddleware, requireOwner, async (req: TenantRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id, 10);

    // Prevent header/param mismatch (IDOR): tenantMiddleware authorized the
    // X-Organization-Id header org, but this handler acts on the URL :id.
    if (req.organizationId !== orgId) {
      return res.status(403).json({ error: 'Organization mismatch' });
    }

    const { name, settings } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (settings) {
      updates.push(`settings = $${paramCount}`);
      values.push(JSON.stringify(settings));
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(orgId);

    const result = await query(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update organization error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /organizations/{id}/members:
 *   get:
 *     summary: Get organization members
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/members', tenantMiddleware, async (req: TenantRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const userId = req.userId!;

    // Verify user has access to this organization
    const accessCheck = await query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [orgId, userId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No access to this organization' });
    }

    // Get all members
    const result = await query(
      `SELECT u.id, u.name, u.email, om.role, om.joined_at
       FROM organization_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.organization_id = $1
       ORDER BY om.joined_at ASC`,
      [orgId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get organization members error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /organizations/{id}/invite:
 *   post:
 *     summary: Invite user to organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/invite', tenantMiddleware, requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const userId = req.userId!;
    const { email, role } = req.body;

    // Prevent header/param mismatch (IDOR): tenantMiddleware authorized the
    // X-Organization-Id header org, but this handler acts on the URL :id.
    if (req.organizationId !== orgId) {
      return res.status(403).json({ error: 'Organization mismatch' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const inviteRole = role || 'member';
    const validRoles = ['admin', 'member', 'viewer'];

    if (!validRoles.includes(inviteRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent privilege escalation: only owners/admins may invite privileged roles
    if (
      (inviteRole === 'owner' || inviteRole === 'admin') &&
      req.userRole !== 'owner' &&
      req.userRole !== 'admin'
    ) {
      return res.status(403).json({ error: 'Insufficient permissions to invite this role' });
    }

    // Check if user already invited or member
    const existing = await query(
      `SELECT id FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND accepted_at IS NULL
       UNION
       SELECT om.id FROM organization_members om
       JOIN users u ON om.user_id = u.id
       WHERE om.organization_id = $1 AND u.email = $2`,
      [orgId, email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already invited or member' });
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create invitation
    await query(
      `INSERT INTO organization_invitations 
       (organization_id, email, role, invited_by, token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, email, inviteRole, userId, token, expiresAt]
    );

    // TODO: Send invitation email with token

    res.status(201).json({ 
      message: 'Invitation sent',
      inviteUrl: `${process.env.FRONTEND_URL}/invite/${token}`
    });
  } catch (error) {
    logger.error('Invite user error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /organizations/{id}/members/{userId}:
 *   delete:
 *     summary: Remove member from organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/members/:userId', tenantMiddleware, requireWriteAccess, async (req: TenantRequest, res: Response) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    const removeUserId = parseInt(req.params.userId, 10);
    const currentUserId = req.userId!;

    // Prevent header/param mismatch (IDOR): tenantMiddleware authorized the
    // X-Organization-Id header org, but this handler acts on the URL :id.
    if (req.organizationId !== orgId) {
      return res.status(403).json({ error: 'Organization mismatch' });
    }

    // Can't remove organization owner
    const orgResult = await query('SELECT owner_id FROM organizations WHERE id = $1', [orgId]);
    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    if (orgResult.rows[0].owner_id === removeUserId) {
      return res.status(400).json({ error: 'Cannot remove organization owner' });
    }

    // Members can only remove themselves
    if (req.userRole === 'member' && removeUserId !== currentUserId) {
      return res.status(403).json({ error: 'Members can only remove themselves' });
    }

    await query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [orgId, removeUserId]
    );

    res.json({ message: 'Member removed' });
  } catch (error) {
    logger.error('Remove member error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /organizations/accept-invite/{token}:
 *   post:
 *     summary: Accept organization invitation
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 */
router.post('/accept-invite/:token', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.params;
    const userId = req.userId!;

    // Get invitation
    const inviteResult = await query(
      `SELECT i.*, u.email as user_email
       FROM organization_invitations i
       JOIN users u ON u.id = $1
       WHERE i.token = $2 AND i.accepted_at IS NULL AND i.expires_at > NOW()`,
      [userId, token]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const invitation = inviteResult.rows[0];

    // Verify email matches
    if (invitation.email !== invitation.user_email) {
      return res.status(403).json({ error: 'Invitation was sent to a different email' });
    }

    // Add user to organization (ignore if already a member to avoid duplicate-membership errors)
    await query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [invitation.organization_id, userId, invitation.role]
    );

    // Mark invitation as accepted
    await query(
      'UPDATE organization_invitations SET accepted_at = NOW() WHERE id = $1',
      [invitation.id]
    );

    res.json({ message: 'Invitation accepted', organizationId: invitation.organization_id });
  } catch (error) {
    logger.error('Accept invitation error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

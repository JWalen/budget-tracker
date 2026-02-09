import { Router, Response } from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendEmail, emailTemplates } from '../services/email';

const router = Router();

router.use(authMiddleware);

// Get all shares (mine + shared with me)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    // Shares I own
    const myShares = await query(
      `SELECT bs.*, u.name as shared_with_name
       FROM budget_shares bs
       LEFT JOIN users u ON bs.shared_with_id = u.id
       WHERE bs.owner_id = $1
       ORDER BY bs.created_at DESC`,
      [req.userId]
    );

    // Shares with me
    const sharedWithMe = await query(
      `SELECT bs.*, u.name as owner_name, u.email as owner_email
       FROM budget_shares bs
       JOIN users u ON bs.owner_id = u.id
       WHERE bs.shared_with_id = $1 AND bs.status = 'accepted'
       ORDER BY bs.created_at DESC`,
      [req.userId]
    );

    res.json({
      myShares: myShares.rows,
      sharedWithMe: sharedWithMe.rows,
    });
  } catch (error) {
    console.error('Get shares error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Invite a user by email
router.post('/invite', async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    if (!['edit', 'view'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "edit" or "view"' });
    }

    // Can't invite yourself
    const meResult = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
    if (meResult.rows[0].email === email) {
      return res.status(400).json({ error: 'You cannot invite yourself' });
    }

    // Get inviter details
    const inviterResult = await query('SELECT name, email FROM users WHERE id = $1', [req.userId]);
    const inviter = inviterResult.rows[0];

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    // Check if user already exists
    const userResult = await query('SELECT id, name FROM users WHERE email = $1', [email]);
    const sharedWithId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
    const inviteeName = userResult.rows.length > 0 ? userResult.rows[0].name : email.split('@')[0];

    const result = await query(
      `INSERT INTO budget_shares (owner_id, shared_with_id, shared_with_email, role, status, invite_token)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, sharedWithId, email, role, sharedWithId ? 'accepted' : 'pending', inviteToken]
    );

    // Send invitation email if the user doesn't exist yet (pending status)
    if (!sharedWithId) {
      const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3456'}/invite/${inviteToken}`;
      const emailData = emailTemplates.budgetShareInvite({
        inviterName: inviter.name || inviter.email,
        inviteeName: inviteeName,
        role: role as 'view' | 'edit',
        inviteUrl: inviteUrl
      });

      try {
        await sendEmail({
          to: email,
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text
        });
        console.log(`Invitation email sent to ${email}`);
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError);
        // Don't fail the invitation if email fails - the invite link can still be shared manually
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Already shared with this email' });
    }
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update share role
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const result = await query(
      'UPDATE budget_shares SET role = $1 WHERE id = $2 AND owner_id = $3 RETURNING *',
      [role, id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update share error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Revoke or leave a share
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Can delete if I'm the owner or the shared-with user
    const result = await query(
      'DELETE FROM budget_shares WHERE id = $1 AND (owner_id = $2 OR shared_with_id = $2) RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json({ message: 'Share removed' });
  } catch (error) {
    console.error('Delete share error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pending invites for my email
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const meResult = await query('SELECT email FROM users WHERE id = $1', [req.userId]);
    const email = meResult.rows[0].email;

    const result = await query(
      `SELECT bs.*, u.name as owner_name, u.email as owner_email
       FROM budget_shares bs
       JOIN users u ON bs.owner_id = u.id
       WHERE bs.shared_with_email = $1 AND bs.status = 'pending'
       ORDER BY bs.created_at DESC`,
      [email]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get pending invites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept invite
router.post('/accept/:token', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.params;

    const result = await query(
      `UPDATE budget_shares SET shared_with_id = $1, status = 'accepted'
       WHERE invite_token = $2 AND status = 'pending' RETURNING *`,
      [req.userId, token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite not found or already accepted' });
    }

    // Send notification email to the owner
    const share = result.rows[0];
    const [ownerResult, accepterResult] = await Promise.all([
      query('SELECT name, email FROM users WHERE id = $1', [share.owner_id]),
      query('SELECT name, email FROM users WHERE id = $1', [req.userId])
    ]);

    const owner = ownerResult.rows[0];
    const accepter = accepterResult.rows[0];

    const emailData = emailTemplates.budgetShareAccepted({
      ownerName: owner.name || owner.email.split('@')[0],
      accepterName: accepter.name || accepter.email.split('@')[0],
      accepterEmail: accepter.email
    });

    try {
      await sendEmail({
        to: owner.email,
        subject: emailData.subject,
        html: emailData.html
      });
      console.log(`Acceptance notification sent to ${owner.email}`);
    } catch (emailError) {
      console.error('Failed to send acceptance notification:', emailError);
      // Don't fail the acceptance if email fails
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

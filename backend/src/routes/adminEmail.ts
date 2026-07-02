import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { sendEmail, testEmailConfig } from '../services/email';
import { query } from '../config/database';
import EncryptionService from '../services/encryption';
import { LoggerClass } from '../services/logger';

// Encrypt a provider secret for storage; returns null for empty/masked values so
// callers can COALESCE-preserve the existing value.
const encSecret = (v?: string): string | null => {
  if (!v || v.includes('*')) return null; // masked/blank → don't overwrite
  return EncryptionService.encryptAPIKey(v);
};

const logger = new LoggerClass('AdminEmail');
const router = Router();

// All routes require authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

// Get current email configuration (sanitized)
router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    const config = {
      provider: process.env.EMAIL_PROVIDER || 'none',
      from: process.env.EMAIL_FROM || 'noreply@budgetapp.com',
      fromName: process.env.EMAIL_FROM_NAME || 'Budget Tracker',
      // Mask sensitive data
      sendgridConfigured: !!process.env.SENDGRID_API_KEY,
      smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
      resendConfigured: !!process.env.RESEND_API_KEY,
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: process.env.SMTP_PORT || '587',
      smtpUser: process.env.SMTP_USER || '',
    };

    res.json(config);
  } catch (error) {
    logger.error('Get email config error:', error);
    res.status(500).json({ error: 'Failed to get email configuration' });
  }
});

// Update email configuration
router.post('/config', async (req: AuthRequest, res: Response) => {
  try {
    const { provider, from, fromName, sendgridApiKey, smtpHost, smtpPort, smtpUser, smtpPass, resendApiKey } = req.body;

    // Store configuration in database for persistence
    // First, check if config exists
    const existing = await query('SELECT * FROM email_config WHERE id = 1');

    // Encrypt provider secrets at rest. null means "not provided" → preserve.
    const encSendgrid = encSecret(sendgridApiKey);
    const encSmtpPass = encSecret(smtpPass);
    const encResend = encSecret(resendApiKey);

    if (existing.rows.length === 0) {
      // Create initial config
      await query(
        `INSERT INTO email_config (id, provider, from_email, from_name, sendgrid_api_key, smtp_host, smtp_port, smtp_user, smtp_pass, resend_api_key)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [provider, from, fromName, encSendgrid, smtpHost, smtpPort, smtpUser, encSmtpPass, encResend]
      );
    } else {
      // Update existing config; COALESCE preserves stored secrets when a new
      // value isn't supplied (e.g. the UI sent a masked placeholder).
      await query(
        `UPDATE email_config SET
         provider = $1, from_email = $2, from_name = $3,
         sendgrid_api_key = COALESCE($4, sendgrid_api_key), smtp_host = $5, smtp_port = $6,
         smtp_user = $7, smtp_pass = COALESCE($8, smtp_pass), resend_api_key = COALESCE($9, resend_api_key),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [provider, from, fromName, encSendgrid, smtpHost, smtpPort, smtpUser, encSmtpPass, encResend]
      );
    }

    // Update environment variables for current session
    process.env.EMAIL_PROVIDER = provider;
    process.env.EMAIL_FROM = from;
    process.env.EMAIL_FROM_NAME = fromName;

    if (sendgridApiKey) process.env.SENDGRID_API_KEY = sendgridApiKey;
    if (smtpHost) process.env.SMTP_HOST = smtpHost;
    if (smtpPort) process.env.SMTP_PORT = smtpPort;
    if (smtpUser) process.env.SMTP_USER = smtpUser;
    if (smtpPass) process.env.SMTP_PASS = smtpPass;
    if (resendApiKey) process.env.RESEND_API_KEY = resendApiKey;

    res.json({ success: true, message: 'Email configuration updated successfully' });
  } catch (error) {
    logger.error('Update email config error:', error);
    res.status(500).json({ error: 'Failed to update email configuration' });
  }
});

// Test email configuration
router.post('/test', async (req: AuthRequest, res: Response) => {
  try {
    const { testEmail } = req.body;
    const email = testEmail || process.env.EMAIL_FROM || 'test@example.com';

    const success = await sendEmail({
      to: email,
      subject: 'Budget Tracker - Test Email',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0ea5e9;">Email Configuration Test</h2>
          <p>This is a test email from your Budget Tracker application.</p>
          <p>If you're receiving this email, your email configuration is working correctly!</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
            <p style="margin: 0;"><strong>Configuration Details:</strong></p>
            <p style="margin: 5px 0;">Provider: ${process.env.EMAIL_PROVIDER}</p>
            <p style="margin: 5px 0;">From: ${process.env.EMAIL_FROM}</p>
            <p style="margin: 5px 0;">From Name: ${process.env.EMAIL_FROM_NAME}</p>
          </div>
        </div>
      `
    });

    if (success) {
      res.json({ success: true, message: `Test email sent successfully to ${email}` });
    } else {
      res.status(400).json({ error: 'Failed to send test email. Check your configuration.' });
    }
  } catch (error) {
    logger.error('Test email error:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// Get email statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    // Get email-related statistics
    const stats = await query(`
      SELECT
        (SELECT COUNT(*) FROM organization_invitations WHERE accepted_at IS NULL) as pending_invites,
        (SELECT COUNT(*) FROM organization_invitations WHERE accepted_at IS NOT NULL) as accepted_invites,
        (SELECT COUNT(*) FROM organization_invitations WHERE created_at > NOW() - INTERVAL '24 hours') as invites_last_24h,
        (SELECT COUNT(*) FROM organization_invitations WHERE created_at > NOW() - INTERVAL '7 days') as invites_last_7d
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    logger.error('Get email stats error:', error);
    res.status(500).json({ error: 'Failed to get email statistics' });
  }
});

export default router;
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { query, pool } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import EncryptionService from '../services/encryption';
import { LoggerClass } from '../services/logger';
import TokenService from '../services/tokenService';

const router = Router();
const logger = new LoggerClass('Auth');

// Options for the refresh-token cookie. `Secure` requires HTTPS: it's on in
// production and whenever the desktop app serves over TLS (server mode), but off
// for plain-HTTP loopback (standalone) where a Secure cookie would never be sent.
const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Password requirements: min 12 chars, 1 uppercase, 1 lowercase, 1 number
export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 12 characters and include uppercase, lowercase, and a number';
export const validatePassword = (password: string): boolean => {
  return typeof password === 'string' &&
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password);
};

// A constant bcrypt hash used to equalize response timing when a user is not
// found on login (prevents timing-based account enumeration).
const DUMMY_BCRYPT_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3g7q5x2mZ8x0j1wZ7fJc3z0xhq2m4Hy';

// Check rate limiting. Scoped so an attacker on a DIFFERENT IP can't lock a
// victim out of their own account: we block on per-IP volume (brute force from
// one source) and per-email-from-the-same-IP (targeted), never on failures for
// an email coming from other IPs.
const checkRateLimit = async (email: string, ip: string): Promise<boolean> => {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE ip_address = $2) AS ip_count,
       COUNT(*) FILTER (WHERE email = $1 AND ip_address = $2) AS email_ip_count
     FROM login_attempts
     WHERE success = false
     AND created_at > NOW() - INTERVAL '15 minutes'`,
    [email, ip]
  );
  const ipCount = parseInt(result.rows[0].ip_count, 10);
  const emailIpCount = parseInt(result.rows[0].email_ip_count, 10);
  // Allow up to 5 targeted attempts per (email, IP) and 15 total from one IP.
  return emailIpCount < 5 && ipCount < 15;
};

// Log login attempt
const logAttempt = async (email: string, ip: string, success: boolean) => {
  await query(
    'INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)',
    [email, ip, success]
  );
};

// Basic email shape check (defence-in-depth; the DB has its own constraints).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Register
router.post('/register', async (req: Request, res: Response) => {
  // Allow operators to close public sign-up in production without a code change.
  // Defaults to open so existing/dev deployments are unaffected.
  if (process.env.REGISTRATION_ENABLED === 'false') {
    return res.status(403).json({ error: 'Registration is disabled' });
  }

  const { email, password, name } = req.body;

  // Validate inputs up front (previously email/name were unvalidated, so a
  // missing name hit the NOT NULL constraint as a 500).
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    return res.status(400).json({ error: 'Name is required (1–100 characters)' });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  const client = await pool.connect();
  try {
    // Hash password with cost factor 12 (before the transaction — CPU-bound).
    const passwordHash = await bcrypt.hash(password, 12);

    await client.query('BEGIN');

    // Create user. First-ever user becomes admin, evaluated atomically inside the
    // INSERT so two concurrent registrations can't both win the admin bootstrap.
    let result;
    try {
      result = await client.query(
        `INSERT INTO users (email, password_hash, name, is_admin)
         VALUES ($1, $2, $3, NOT EXISTS (SELECT 1 FROM users))
         RETURNING id, email, name, mfa_enabled, is_admin`,
        [normalizedEmail, passwordHash, cleanName]
      );
    } catch (e: any) {
      if (e.code === '23505') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Email already registered' });
      }
      throw e;
    }

    const user = result.rows[0];

    // Create default categories for new user
    const defaultCategories = [
      { name: 'Salary', type: 'income', color: '#22c55e' },
      { name: 'Freelance', type: 'income', color: '#10b981' },
      { name: 'Other Income', type: 'income', color: '#14b8a6' },
      { name: 'Food & Dining', type: 'expense', color: '#f97316' },
      { name: 'Transportation', type: 'expense', color: '#eab308' },
      { name: 'Shopping', type: 'expense', color: '#ec4899' },
      { name: 'Bills & Utilities', type: 'expense', color: '#8b5cf6' },
      { name: 'Entertainment', type: 'expense', color: '#06b6d4' },
      { name: 'Health', type: 'expense', color: '#ef4444' },
      { name: 'Other', type: 'expense', color: '#6b7280' },
    ];

    for (const cat of defaultCategories) {
      await client.query(
        'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4)',
        [user.id, cat.name, cat.type, cat.color]
      );
    }

    // Create a personal household (organization) so household-scoped features
    // (notifications, receipts, templates, currency) and shared-budget access work.
    const org = await client.query(
      `INSERT INTO organizations (name, slug, owner_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET owner_id = EXCLUDED.owner_id
       RETURNING id`,
      [`${cleanName}'s Household`, `personal-${user.id}`, user.id]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (organization_id, user_id) DO NOTHING`,
      [org.rows[0].id, user.id]
    );

    await client.query('COMMIT');

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = await TokenService.generateTokenPair(
      user.id,
      user.email,
      req.ip,
      req.headers['user-agent']
    );

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    // Log registration event
    logger.auth('register', user.id, true, { email: user.email });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, mfa_enabled: false, is_admin: user.is_admin },
      accessToken,
      expiresIn,
    });
  } catch (error) {
    // Roll back if we failed before COMMIT; a no-op if already committed.
    try { await client.query('ROLLBACK'); } catch { /* already committed/closed */ }
    logger.error('Register error', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error' });
    }
  } finally {
    client.release();
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, mfaCode } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Check rate limit
    const allowed = await checkRateLimit(email, ip);
    if (!allowed) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    }

    // Find user
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Perform a dummy compare so the response time matches the found-user path
      // (prevents timing-based account enumeration).
      await bcrypt.compare(password || '', DUMMY_BCRYPT_HASH);
      await logAttempt(email, ip, false);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await logAttempt(email, ip, false);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check MFA if enabled
    if (user.mfa_enabled) {
      if (!mfaCode) {
        return res.status(200).json({ requiresMfa: true });
      }

      // Decrypt MFA secret for verification
      const decryptedSecret = user.mfa_secret ?
        EncryptionService.decryptMFASecret(user.mfa_secret) : null;

      if (!decryptedSecret) {
        return res.status(500).json({ error: 'MFA configuration error' });
      }

      const isValid = authenticator.verify({ token: mfaCode, secret: decryptedSecret });
      if (!isValid) {
        await logAttempt(email, ip, false);
        return res.status(401).json({ error: 'Invalid MFA code' });
      }
    }

    await logAttempt(email, ip, true);

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = await TokenService.generateTokenPair(
      user.id,
      user.email,
      ip,
      req.headers['user-agent']
    );

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    // Log login event
    logger.auth('login', user.id, true, { email: user.email });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, mfa_enabled: user.mfa_enabled, is_admin: user.is_admin },
      accessToken,
      expiresIn,
    });
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT id, email, name, mfa_enabled, is_admin FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Setup MFA - generate secret and QR code
router.post('/mfa/setup', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query('SELECT email, mfa_enabled FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }

    // Generate secret
    const secret = authenticator.generateSecret();

    // Encrypt and store secret temporarily (not enabled yet)
    const encryptedSecret = EncryptionService.encryptMFASecret(secret);
    await query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [encryptedSecret, req.userId]);

    // Generate QR code
    const otpauth = authenticator.keyuri(user.email, 'Budget Tracker', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    res.json({ secret, qrCode });
  } catch (error) {
    logger.error('MFA setup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Enable MFA - verify code and activate
router.post('/mfa/enable', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;

    const userResult = await query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is already enabled' });
    }

    if (!user.mfa_secret) {
      return res.status(400).json({ error: 'Please set up MFA first' });
    }

    // Decrypt secret and verify the code
    const decryptedSecret = EncryptionService.decryptMFASecret(user.mfa_secret);
    const isValid = authenticator.verify({ token: code, secret: decryptedSecret });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    }

    // Enable MFA
    await query('UPDATE users SET mfa_enabled = true WHERE id = $1', [req.userId]);

    res.json({ message: 'MFA enabled successfully' });
  } catch (error) {
    logger.error('MFA enable error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Disable MFA
router.post('/mfa/disable', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code, password } = req.body;

    const userResult = await query('SELECT password_hash, mfa_secret, mfa_enabled FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA is not enabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Decrypt secret and verify MFA code
    const decryptedSecret = EncryptionService.decryptMFASecret(user.mfa_secret);
    const isValid = authenticator.verify({ token: code, secret: decryptedSecret });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid MFA code' });
    }

    // Disable MFA
    await query('UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1', [req.userId]);

    res.json({ message: 'MFA disabled successfully' });
  } catch (error) {
    logger.error('MFA disable error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate new password
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }

    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.userId]);

    // Revoke all existing sessions so a compromised/old session can't survive a
    // password change. The client should re-authenticate.
    await TokenService.revokeAllUserTokens(req.userId!);

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Refresh access token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' });
    }

    const result = await TokenService.refreshAccessToken(
      refreshToken,
      req.ip,
      req.headers['user-agent']
    );

    if (!result) {
      // Clear invalid cookie
      res.clearCookie('refreshToken', {
      httpOnly: refreshCookieOptions.httpOnly,
      secure: refreshCookieOptions.secure,
      sameSite: refreshCookieOptions.sameSite,
    });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    res.json({
      accessToken: result.accessToken,
      expiresIn: result.expiresIn
    });
  } catch (error) {
    logger.error('Token refresh error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      // Revoke the refresh token
      await TokenService.revokeRefreshToken(refreshToken, req.userId);
    }

    // Clear the cookie
    res.clearCookie('refreshToken', {
      httpOnly: refreshCookieOptions.httpOnly,
      secure: refreshCookieOptions.secure,
      sameSite: refreshCookieOptions.sameSite,
    });

    // Log logout event
    logger.auth('logout', req.userId!, true);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout from all devices
router.post('/logout-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Revoke all refresh tokens for the user
    await TokenService.revokeAllUserTokens(req.userId!);

    // Clear the current cookie
    res.clearCookie('refreshToken', {
      httpOnly: refreshCookieOptions.httpOnly,
      secure: refreshCookieOptions.secure,
      sameSite: refreshCookieOptions.sameSite,
    });

    // Log logout event
    logger.auth('logout', req.userId!, true, { allDevices: true });

    res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    logger.error('Logout all error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get active sessions
router.get('/sessions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await TokenService.getUserSessions(req.userId!);

    res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        current: s.ip_address === req.ip && s.user_agent === req.headers['user-agent']
      }))
    });
  } catch (error) {
    logger.error('Get sessions error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Revoke a specific session
router.delete('/sessions/:sessionId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.params;

    // Revoke by id, scoped to the user (tokens are stored hashed, so we can't
    // round-trip the stored value back through revokeRefreshToken).
    const revoked = await TokenService.revokeSessionById(parseInt(sessionId, 10), req.userId!);
    if (!revoked) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ message: 'Session revoked' });
  } catch (error) {
    logger.error('Revoke session error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

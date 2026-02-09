import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import EncryptionService from '../services/encryption';
import { LoggerClass } from '../services/logger';
import TokenService from '../services/tokenService';

const router = Router();
const logger = new LoggerClass('Auth');

// Password requirements: min 8 chars, 1 uppercase, 1 lowercase, 1 number
const validatePassword = (password: string): boolean => {
  return password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password);
};

// Check rate limiting
const checkRateLimit = async (email: string, ip: string): Promise<boolean> => {
  const result = await query(
    `SELECT COUNT(*) as count FROM login_attempts
     WHERE (email = $1 OR ip_address = $2)
     AND success = false
     AND created_at > NOW() - INTERVAL '15 minutes'`,
    [email, ip]
  );
  return parseInt(result.rows[0].count) < 5;
};

// Log login attempt
const logAttempt = async (email: string, ip: string, success: boolean) => {
  await query(
    'INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)',
    [email, ip, success]
  );
};

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validate password strength
    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with uppercase, lowercase, and number',
      });
    }

    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password with cost factor 12
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, mfa_enabled, is_admin',
      [email, passwordHash, name]
    );

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
      await query(
        'INSERT INTO categories (user_id, name, type, color) VALUES ($1, $2, $3, $4)',
        [user.id, cat.name, cat.type, cat.color]
      );
    }

    // Auto-link pending budget share invites
    await query(
      `UPDATE budget_shares SET shared_with_id = $1, status = 'accepted'
       WHERE shared_with_email = $2 AND status = 'pending'`,
      [user.id, email]
    );

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = await TokenService.generateTokenPair(
      user.id,
      user.email,
      req.ip,
      req.headers['user-agent']
    );

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Log registration event
    logger.auth('register', user.id, true, { email: user.email });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, mfa_enabled: false, is_admin: user.is_admin },
      accessToken,
      expiresIn,
    });
  } catch (error) {
    logger.error('Register error', error);
    res.status(500).json({ error: 'Server error' });
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

    // Auto-link pending budget share invites
    await query(
      `UPDATE budget_shares SET shared_with_id = $1, status = 'accepted'
       WHERE shared_with_email = $2 AND status = 'pending' AND shared_with_id IS NULL`,
      [user.id, email]
    );

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = await TokenService.generateTokenPair(
      user.id,
      user.email,
      ip,
      req.headers['user-agent']
    );

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

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
      return res.status(400).json({
        error: 'Password must be at least 8 characters with uppercase, lowercase, and number',
      });
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

    res.json({ message: 'Password changed successfully' });
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
      res.clearCookie('refreshToken');
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
    res.clearCookie('refreshToken');

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
    res.clearCookie('refreshToken');

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

    // Verify the session belongs to the user
    const result = await query(
      'SELECT token FROM refresh_tokens WHERE id = $1 AND user_id = $2',
      [sessionId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Revoke the token
    await TokenService.revokeRefreshToken(result.rows[0].token, req.userId);

    res.json({ message: 'Session revoked' });
  } catch (error) {
    logger.error('Revoke session error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

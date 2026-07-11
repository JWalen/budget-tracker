import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/database';
import { LoggerClass } from './logger';

const logger = new LoggerClass('TokenService');

interface TokenPayload {
  userId: number;
  email?: string;
  type: 'access' | 'refresh';
}

interface RefreshTokenData {
  id: number;
  user_id: number;
  token: string;
  expires_at: Date;
  revoked_at?: Date;
  ip_address?: string;
  user_agent?: string;
}

export class TokenService {
  private static readonly ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
  private static readonly REFRESH_TOKEN_EXPIRY = '7d'; // 7 days
  private static readonly MAX_SESSIONS_PER_USER = 5; // Maximum concurrent sessions

  /**
   * Generate both access and refresh tokens
   */
  static async generateTokenPair(
    userId: number,
    email?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    try {
      // Generate access token (short-lived)
      const accessToken = this.generateAccessToken(userId, email);

      // Generate refresh token (long-lived)
      const refreshToken = await this.generateRefreshToken(userId, ipAddress, userAgent);

      // Calculate expiry time in seconds
      const expiresIn = 15 * 60; // 15 minutes in seconds

      logger.info('Token pair generated', { userId });

      return {
        accessToken,
        refreshToken,
        expiresIn
      };
    } catch (error) {
      logger.error('Failed to generate token pair', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate access token (JWT)
   */
  private static generateAccessToken(userId: number, email?: string): string {
    const payload: TokenPayload = {
      userId,
      email,
      type: 'access'
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    return jwt.sign(payload, secret, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'budget-tracker',
      audience: 'budget-tracker-api'
    });
  }

  /**
   * Generate refresh token and store in database
   */
  private static async generateRefreshToken(
    userId: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    // Generate cryptographically secure random token
    const tokenValue = crypto.randomBytes(64).toString('hex');

    const payload: TokenPayload = {
      userId,
      type: 'refresh'
    };

    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET not configured');
    }

    // Create JWT with the random token as subject
    const refreshToken = jwt.sign(payload, secret, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
      subject: tokenValue,
      issuer: 'budget-tracker',
      audience: 'budget-tracker-refresh'
    });

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // Clean up old sessions if limit exceeded
    await this.cleanupExcessSessions(userId);

    // Store the HASH of the token value, never the value itself.
    await query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, this.hashToken(tokenValue), expiresAt, ipAddress || null, userAgent || null]
    );

    // Update user's active sessions count
    await query(
      `UPDATE users
       SET active_sessions = (SELECT COUNT(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP),
           last_login = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    return refreshToken;
  }

  // Refresh tokens are stored HASHED at rest (sha256 of the random token value),
  // so a DB read never yields a usable session token. The plaintext value only
  // ever lives in the httpOnly cookie as the JWT subject.
  private static hashToken(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  // Normalize a revoke input to the stored token value. Logout passes the whole
  // refresh JWT (from the cookie); its `sub` is the token value we hashed.
  private static tokenValueFrom(input: string): string {
    if (input.split('.').length === 3) {
      try {
        const decoded = jwt.decode(input) as { sub?: string } | null;
        if (decoded?.sub) return decoded.sub;
      } catch { /* fall through — treat as a raw value */ }
    }
    return input;
  }

  /**
   * Verify and decode access token
   */
  static verifyAccessToken(token: string): TokenPayload | null {
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET not configured');
      }

      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],   // pin the algorithm — never accept alg:none or a swapped alg
        issuer: 'budget-tracker',
        audience: 'budget-tracker-api'
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      logger.warn('Access token verification failed', { error });
      return null;
    }
  }

  /**
   * Verify refresh token and generate new access token
   */
  static async refreshAccessToken(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; expiresIn: number } | null> {
    try {
      const secret = process.env.JWT_REFRESH_SECRET;
      if (!secret) {
        throw new Error('JWT_REFRESH_SECRET not configured');
      }

      // Verify the refresh token JWT
      const decoded = jwt.verify(refreshToken, secret, {
        issuer: 'budget-tracker',
        audience: 'budget-tracker-refresh'
      }) as TokenPayload & { sub: string };

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Look up by the hash of the JWT subject (that's what we stored).
      const result = await query(
        `SELECT * FROM refresh_tokens
         WHERE token = $1
         AND user_id = $2
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`,
        [this.hashToken(decoded.sub), decoded.userId]
      );

      if (result.rows.length === 0) {
        logger.warn('Refresh token not found or expired', { userId: decoded.userId });
        return null;
      }

      // Get user details for new access token
      const userResult = await query(
        'SELECT id, email FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        logger.warn('User not found for refresh token', { userId: decoded.userId });
        return null;
      }

      const user = userResult.rows[0];

      // Generate new access token
      const accessToken = this.generateAccessToken(user.id, user.email);

      // Update last activity
      await query(
        'UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      logger.info('Access token refreshed', { userId: user.id });

      return {
        accessToken,
        expiresIn: 15 * 60 // 15 minutes in seconds
      };
    } catch (error) {
      logger.error('Refresh token verification failed', error);
      return null;
    }
  }

  /**
   * Revoke a refresh token
   */
  static async revokeRefreshToken(token: string, userId?: number): Promise<boolean> {
    try {
      // Accept either the raw token value or the full refresh JWT (logout passes
      // the cookie JWT). Normalize, then hash to match the stored value. This also
      // fixes logout, which previously passed the JWT against the stored subject
      // and silently matched nothing.
      const hashed = this.hashToken(this.tokenValueFrom(token));
      let query_str = 'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token = $1';
      const params: any[] = [hashed];

      if (userId) {
        query_str += ' AND user_id = $2';
        params.push(userId);
      }

      const result = await query(query_str, params);

      if (result.rowCount && result.rowCount > 0) {
        logger.info('Refresh token revoked', { userId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to revoke refresh token', error);
      return false;
    }
  }

  /**
   * Revoke a specific session by its refresh_tokens row id (scoped to the user).
   * Used by the "revoke session" UI — avoids hashing a value already read from
   * the DB (which is itself the stored hash).
   */
  static async revokeSessionById(sessionId: number, userId: number): Promise<boolean> {
    try {
      const result = await query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
        [sessionId, userId]
      );
      return !!(result.rowCount && result.rowCount > 0);
    } catch (error) {
      logger.error('Failed to revoke session by id', error);
      return false;
    }
  }

  /**
   * Revoke all refresh tokens for a user (logout from all devices)
   */
  static async revokeAllUserTokens(userId: number): Promise<void> {
    try {
      await query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
        [userId]
      );

      await query(
        'UPDATE users SET active_sessions = 0 WHERE id = $1',
        [userId]
      );

      logger.info('All tokens revoked for user', { userId });
    } catch (error) {
      logger.error('Failed to revoke all user tokens', error);
      throw error;
    }
  }

  /**
   * Clean up excess sessions for a user
   */
  private static async cleanupExcessSessions(userId: number): Promise<void> {
    try {
      // Count active sessions
      const countResult = await query(
        'SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [userId]
      );

      const sessionCount = parseInt(countResult.rows[0].count);

      if (sessionCount >= this.MAX_SESSIONS_PER_USER) {
        // Revoke oldest sessions
        await query(
          `UPDATE refresh_tokens
           SET revoked_at = CURRENT_TIMESTAMP
           WHERE id IN (
             SELECT id FROM refresh_tokens
             WHERE user_id = $1 AND revoked_at IS NULL
             ORDER BY created_at ASC
             LIMIT $2
           )`,
          [userId, sessionCount - this.MAX_SESSIONS_PER_USER + 1]
        );

        logger.info('Cleaned up excess sessions', { userId, removed: sessionCount - this.MAX_SESSIONS_PER_USER + 1 });
      }
    } catch (error) {
      logger.error('Failed to cleanup excess sessions', error);
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await query(
        'DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP OR revoked_at IS NOT NULL'
      );

      if (result.rowCount && result.rowCount > 0) {
        logger.info('Cleaned up expired tokens', { count: result.rowCount });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired tokens', error);
    }
  }

  /**
   * Get active sessions for a user
   */
  static async getUserSessions(userId: number): Promise<any[]> {
    try {
      const result = await query(
        `SELECT id, created_at, expires_at, ip_address, user_agent
         FROM refresh_tokens
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get user sessions', error);
      return [];
    }
  }
}

export default TokenService;
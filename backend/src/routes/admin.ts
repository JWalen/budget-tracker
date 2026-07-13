import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { EncryptionService } from '../services/encryption';
import TokenService from '../services/tokenService';
import { validatePassword, PASSWORD_POLICY_MESSAGE } from './auth';
import logger from '../config/logger';
import fs from 'fs/promises';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

// All admin routes require auth + admin
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/stats — Comprehensive system statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const [
      usersResult,
      transactionsResult,
      financialsResult,
      growthResult,
      activeUsersResult,
      sharingResult,
      systemHealthResult,
      storageResult
    ] = await Promise.all([
      query('SELECT COUNT(*) as count, COUNT(CASE WHEN is_admin THEN 1 END) as admin_count FROM users'),
      query('SELECT COUNT(*) as count FROM transactions'),
      query(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expenses
        FROM transactions
      `),
      query(`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM') as month,
          COUNT(*) as count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month
      `),
      // Active users in last 24h, 7d, 30d
      query(`
        SELECT
          COUNT(CASE WHEN last_activity > NOW() - INTERVAL '24 hours' THEN 1 END) as active_24h,
          COUNT(CASE WHEN last_activity > NOW() - INTERVAL '7 days' THEN 1 END) as active_7d,
          COUNT(CASE WHEN last_activity > NOW() - INTERVAL '30 days' THEN 1 END) as active_30d,
          COUNT(CASE WHEN mfa_enabled THEN 1 END) as mfa_enabled
        FROM users
      `),
      // Household (organization) sharing stats
      query(`
        SELECT
          (SELECT COUNT(*) FROM organizations) as total_households,
          (SELECT COUNT(*) FROM organization_members) as total_memberships,
          (SELECT COUNT(*) FROM organizations o
             WHERE (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) > 1
          ) as shared_households
      `),
      // System health
      query(`
        SELECT
          COUNT(*) as active_sessions,
          pg_database_size(current_database()) as db_size
        FROM refresh_tokens
        WHERE expires_at > NOW() AND revoked_at IS NULL
      `),
      // Storage breakdown
      query(`
        SELECT
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `)
    ]);

    // Check encryption configuration
    const encryptionStatus = EncryptionService.validateConfiguration();

    res.json({
      users: {
        total: parseInt(usersResult.rows[0].count),
        admins: parseInt(usersResult.rows[0].admin_count),
        active24h: parseInt(activeUsersResult.rows[0].active_24h),
        active7d: parseInt(activeUsersResult.rows[0].active_7d),
        active30d: parseInt(activeUsersResult.rows[0].active_30d),
        mfaEnabled: parseInt(activeUsersResult.rows[0].mfa_enabled)
      },
      transactions: {
        total: parseInt(transactionsResult.rows[0].count),
        totalIncome: parseFloat(financialsResult.rows[0].total_income),
        totalExpenses: parseFloat(financialsResult.rows[0].total_expenses)
      },
      sharing: {
        totalShares: parseInt(sharingResult.rows[0].total_shares),
        sharingUsers: parseInt(sharingResult.rows[0].sharing_users),
        viewingUsers: parseInt(sharingResult.rows[0].viewing_users)
      },
      system: {
        activeSessions: parseInt(systemHealthResult.rows[0].active_sessions),
        databaseSize: systemHealthResult.rows[0].db_size,
        encryptionValid: encryptionStatus.valid,
        encryptionWarnings: encryptionStatus.warnings,
        storageBreakdown: storageResult.rows
      },
      userGrowth: growthResult.rows
    });
  } catch (error) {
    logger.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users — List all users with detailed information
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const searchParam = `%${search}%`;

    const [result, countResult] = await Promise.all([
      query(
        `SELECT
          u.id, u.email, u.name, u.is_admin, u.mfa_enabled, u.created_at,
          u.last_login, u.last_activity, u.active_sessions,
          COUNT(DISTINCT t.id) as transaction_count,
          COUNT(DISTINCT om_owner.id) as households_owned,
          COUNT(DISTINCT om_member.id) as households_joined,
          COUNT(DISTINCT a.id) as accounts_count,
          COALESCE(SUM(DISTINCT a.balance), 0) as total_balance
        FROM users u
        LEFT JOIN transactions t ON t.user_id = u.id
        LEFT JOIN organization_members om_owner ON om_owner.user_id = u.id AND om_owner.role = 'owner'
        LEFT JOIN organization_members om_member ON om_member.user_id = u.id AND om_member.role <> 'owner'
        LEFT JOIN bank_accounts a ON a.user_id = u.id
        WHERE u.name ILIKE $1 OR u.email ILIKE $1
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3`,
        [searchParam, limit, offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM users WHERE name ILIKE $1 OR email ILIKE $1`,
        [searchParam]
      )
    ]);

    res.json({
      users: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
      }
    });
  } catch (error) {
    logger.error('Admin users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id — Update user details
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { email, name, is_admin } = req.body;

    // Don't allow removing own admin status
    if (userId === req.userId && is_admin === false) {
      return res.status(400).json({ error: 'Cannot remove your own admin status' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (is_admin !== undefined) {
      updates.push(`is_admin = $${paramCount++}`);
      values.push(is_admin);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(userId);

    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, name, is_admin, mfa_enabled, created_at, last_login`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info('Admin updated user', { adminId: req.userId, targetUserId: userId, updates });
    res.json(result.rows[0]);
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'That email address is already in use' });
    }
    logger.error('Admin update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — Delete a user
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users/:id/reset-password — Reset a user's password
router.post('/users/:id/reset-password', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { password } = req.body;

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    // Enforce the same password policy as the auth routes.
    if (!validatePassword(password)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }

    const userResult = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);

    // Revoke the target user's existing sessions so the reset actually locks out
    // any active attacker session.
    await TokenService.revokeAllUserTokens(userId);

    res.json({ message: 'Password reset successfully. The user must log in again.' });
  } catch (error) {
    logger.error('Admin reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/activity — Recent activity and suspicious behavior
router.get('/activity', async (req: AuthRequest, res: Response) => {
  try {
    const [recentLogins, recentSignups, suspiciousResult] = await Promise.all([
      query(`
        SELECT la.email, la.ip_address, la.success, la.created_at
        FROM login_attempts la
        ORDER BY la.created_at DESC
        LIMIT 50
      `),
      query(`
        SELECT id, name, email, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 20
      `),
      query(`
        SELECT email, ip_address, COUNT(*) as attempt_count,
          MAX(created_at) as last_attempt
        FROM login_attempts
        WHERE success = false
          AND created_at > NOW() - INTERVAL '1 hour'
        GROUP BY email, ip_address
        HAVING COUNT(*) >= 5
        ORDER BY attempt_count DESC
      `),
    ]);

    res.json({
      recentLogins: recentLogins.rows,
      recentSignups: recentSignups.rows,
      suspiciousActivity: suspiciousResult.rows,
    });
  } catch (error) {
    logger.error('Admin activity error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users/:id/toggle-mfa — Enable/Disable MFA for user
router.post('/users/:id/toggle-mfa', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await query(
      `UPDATE users
       SET mfa_enabled = NOT mfa_enabled,
           mfa_secret = CASE WHEN mfa_enabled THEN NULL ELSE mfa_secret END
       WHERE id = $1
       RETURNING mfa_enabled`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info('Admin toggled MFA', {
      adminId: req.userId,
      targetUserId: userId,
      mfaEnabled: result.rows[0].mfa_enabled
    });

    res.json({ mfa_enabled: result.rows[0].mfa_enabled });
  } catch (error) {
    logger.error('Admin toggle MFA error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/logs — View the DB-backed error log. Reads from the error_logs
// table (not files) so it works in the packaged desktop app too, and is the place
// to look when something like an AI request fails.
router.get('/logs', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const level = req.query.level as string;
    const search = req.query.search as string;

    const conds: string[] = [];
    const params: any[] = [];
    if (level && level !== 'all') { params.push(level); conds.push(`level = $${params.length}`); }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conds.push(`(LOWER(message) LIKE $${params.length} OR LOWER(COALESCE(context,'')) LIKE $${params.length} OR LOWER(COALESCE(path,'')) LIKE $${params.length})`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const totalRes = await query(`SELECT COUNT(*)::int AS n FROM error_logs ${where}`, params);
    const total = totalRes.rows[0].n;

    params.push(limit, (page - 1) * limit);
    const rows = await query(
      `SELECT id, level, context, message, detail, status_code, method, path, user_id, request_id, created_at
       FROM error_logs ${where}
       ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Shape rows for the admin log viewer (it expects timestamp/level/message).
    const logs = rows.rows.map((r: any) => ({
      timestamp: r.created_at,
      level: r.level,
      context: r.context,
      message: r.message,
      detail: r.detail,
      statusCode: r.status_code,
      method: r.method,
      path: r.path,
      userId: r.user_id,
      requestId: r.request_id,
    }));

    res.json({ logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    logger.error('Admin logs error:', error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// DELETE /api/admin/logs — Clear the error log.
router.delete('/logs', async (_req: AuthRequest, res: Response) => {
  try {
    await query('DELETE FROM error_logs');
    res.json({ message: 'Logs cleared' });
  } catch (error) {
    logger.error('Clear logs error:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// GET /api/admin/shares — View all household (organization) memberships that grant
// a non-owner access to someone else's household.
router.get('/shares', async (req: AuthRequest, res: Response) => {
  try {
    const shares = await query(`
      SELECT
        om.id,
        om.role,
        om.joined_at as created_at,
        o.id as organization_id,
        o.name as household_name,
        owner.email as owner_email,
        owner.name as owner_name,
        member.email as shared_email,
        member.name as shared_name
      FROM organization_members om
      JOIN organizations o ON o.id = om.organization_id
      JOIN users owner ON owner.id = o.owner_id
      JOIN users member ON member.id = om.user_id
      WHERE om.role <> 'owner'
      ORDER BY om.joined_at DESC
    `);

    res.json(shares.rows);
  } catch (error) {
    logger.error('Admin shares error:', error);
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

// DELETE /api/admin/shares/:id — Revoke a household membership (cannot remove an owner)
router.delete('/shares/:id', async (req: AuthRequest, res: Response) => {
  try {
    const shareId = parseInt(req.params.id);
    if (!Number.isInteger(shareId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const result = await query(
      `DELETE FROM organization_members WHERE id = $1 AND role <> 'owner' RETURNING *`,
      [shareId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    logger.info('Admin revoked household membership', { adminId: req.userId, membershipId: shareId });
    res.json({ message: 'Share revoked successfully' });
  } catch (error) {
    logger.error('Admin revoke share error:', error);
    res.status(500).json({ error: 'Failed to revoke share' });
  }
});

// GET /api/admin/config — Get system configuration
router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    // Get environment configuration (sanitized)
    const config = {
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || '5432',
        name: process.env.DB_NAME || 'budget_tracker',
        user: process.env.DB_USER || 'postgres'
      },
      email: {
        configured: !!process.env.EMAIL_USER,
        host: process.env.EMAIL_HOST || 'not configured',
        port: process.env.EMAIL_PORT || 'not configured',
        from: process.env.EMAIL_FROM || 'not configured'
      },
      security: {
        jwtConfigured: !!process.env.JWT_SECRET && !process.env.JWT_SECRET.includes('change_this'),
        refreshConfigured: !!process.env.JWT_REFRESH_SECRET && !process.env.JWT_REFRESH_SECRET.includes('change_this'),
        encryptionConfigured: !!process.env.ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY.includes('change_this'),
        mfaEncryptionConfigured: !!process.env.MFA_ENCRYPTION_KEY && !process.env.MFA_ENCRYPTION_KEY.includes('change_this'),
        corsOrigin: process.env.CORS_ORIGIN || '*',
        sessionTimeout: process.env.SESSION_TIMEOUT || '7d',
        refreshTimeout: process.env.REFRESH_TIMEOUT || '30d'
      },
      features: {
        mfaEnabled: process.env.MFA_ENABLED !== 'false',
        emailNotifications: process.env.EMAIL_NOTIFICATIONS === 'true',
        aiEnabled: process.env.AI_ENABLED !== 'false',
        backupEnabled: process.env.BACKUP_ENABLED !== 'false'
      }
    };

    res.json(config);
  } catch (error) {
    logger.error('Admin config error:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// POST /api/admin/backup — Create database backup
router.post('/backup', async (req: AuthRequest, res: Response) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.sql`;
    const backupsDir = path.join(process.cwd(), 'backups');
    // Validate filename to prevent path traversal
    const safeFilename = path.basename(filename);
    const filepath = path.join(backupsDir, safeFilename);

    // Create backups directory if it doesn't exist
    await fs.mkdir(backupsDir, { recursive: true });

    // Use pg_dump to create backup (spawn is safer than exec for this)
    const dbUrl = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

    try {
      // Use spawn instead of exec for better security
      const { spawn } = require('child_process');
      await new Promise<void>((resolve, reject) => {
        const child = spawn('pg_dump', [dbUrl], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        const writeStream = require('fs').createWriteStream(filepath);
        child.stdout.pipe(writeStream);
        
        let stderr = '';
        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        child.on('close', (code: number) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`pg_dump failed: ${stderr}`));
          }
        });
        
        child.on('error', reject);
      });
    } catch (error) {
      // If pg_dump is not available, create a simple SQL export
      const tables = ['users', 'transactions', 'categories', 'budgets', 'bank_accounts', 'organizations', 'organization_members'];
      let sqlContent = '-- Budget Tracker Database Backup\n';
      sqlContent += `-- Created: ${new Date().toISOString()}\n\n`;

      for (const table of tables) {
        const result = await query(`SELECT * FROM ${table}`);
        if (result.rows.length > 0) {
          sqlContent += `-- Table: ${table}\n`;
          const columns = Object.keys(result.rows[0]).join(', ');
          sqlContent += `-- Columns: ${columns}\n`;

          for (const row of result.rows) {
            const values = Object.values(row).map(v =>
              v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
            ).join(', ');
            sqlContent += `INSERT INTO ${table} (${columns}) VALUES (${values});\n`;
          }
          sqlContent += '\n';
        }
      }

      await fs.writeFile(filepath, sqlContent);
    }

    // Get file size
    const stats = await fs.stat(filepath);

    // Encrypt the backup if encryption is configured
    if (process.env.BACKUP_ENCRYPTION_KEY && !process.env.BACKUP_ENCRYPTION_KEY.includes('change_this')) {
      const backupContent = await fs.readFile(filepath, 'utf-8');
      const encryptedBackup = EncryptionService.encrypt(backupContent, 'backup');
      await fs.writeFile(filepath + '.enc', encryptedBackup);
      await fs.unlink(filepath); // Remove unencrypted backup

      logger.info('Admin created encrypted backup', { adminId: req.userId, filename: filename + '.enc' });

      res.json({
        message: 'Encrypted backup created successfully',
        filename: filename + '.enc',
        size: (await fs.stat(filepath + '.enc')).size,
        encrypted: true
      });
    } else {
      logger.info('Admin created backup', { adminId: req.userId, filename });

      res.json({
        message: 'Backup created successfully',
        filename,
        size: stats.size,
        encrypted: false
      });
    }
  } catch (error) {
    logger.error('Admin backup error:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// GET /api/admin/backups — List available backups
router.get('/backups', async (req: AuthRequest, res: Response) => {
  try {
    const backupsDir = path.join(process.cwd(), 'backups');

    try {
      await fs.access(backupsDir);
    } catch {
      return res.json({ backups: [] });
    }

    const files = await fs.readdir(backupsDir);
    const backups = await Promise.all(
      files
        .filter(f => f.startsWith('backup-') && (f.endsWith('.sql') || f.endsWith('.sql.enc')))
        .map(async (file) => {
          const stats = await fs.stat(path.join(backupsDir, file));
          return {
            filename: file,
            size: stats.size,
            created: stats.ctime,
            encrypted: file.endsWith('.enc')
          };
        })
    );

    backups.sort((a, b) => b.created.getTime() - a.created.getTime());

    res.json({ backups });
  } catch (error) {
    logger.error('Admin list backups error:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// GET /api/admin/transactions/overview — Transaction oversight
router.get('/transactions/overview', async (req: AuthRequest, res: Response) => {
  try {
    const [
      duplicates,
      largeTransactions,
      unusualPatterns,
      categoryBreakdown
    ] = await Promise.all([
      // Find potential duplicate transactions
      query(`
        SELECT
          t1.*,
          u.email,
          u.name as user_name,
          COUNT(*) OVER (PARTITION BY t1.user_id, t1.amount, DATE(t1.date)) as duplicate_count
        FROM transactions t1
        JOIN users u ON u.id = t1.user_id
        WHERE EXISTS (
          SELECT 1 FROM transactions t2
          WHERE t2.user_id = t1.user_id
          AND t2.amount = t1.amount
          AND t2.id != t1.id
          AND DATE(t2.date) = DATE(t1.date)
        )
        ORDER BY t1.date DESC
        LIMIT 20
      `),

      // Large transactions
      query(`
        SELECT
          t.*,
          u.email,
          u.name as user_name,
          c.name as category_name
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE ABS(t.amount) > 5000
        ORDER BY ABS(t.amount) DESC
        LIMIT 20
      `),

      // Unusual spending patterns
      query(`
        SELECT
          u.id,
          u.email,
          u.name,
          DATE(t.date) as transaction_date,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) as daily_spending
        FROM users u
        JOIN transactions t ON t.user_id = u.id
        WHERE t.date > NOW() - INTERVAL '30 days'
        GROUP BY u.id, u.email, u.name, DATE(t.date)
        HAVING COUNT(*) > 20 OR SUM(CASE WHEN t.type = 'expense' THEN ABS(t.amount) ELSE 0 END) > 10000
        ORDER BY transaction_count DESC, daily_spending DESC
        LIMIT 20
      `),

      // Category breakdown across all users
      query(`
        SELECT
          c.name as category,
          COUNT(DISTINCT t.user_id) as users,
          COUNT(t.id) as transaction_count,
          SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) as total_income,
          SUM(CASE WHEN t.type = 'expense' THEN ABS(t.amount) ELSE 0 END) as total_expenses
        FROM categories c
        LEFT JOIN transactions t ON t.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY transaction_count DESC
      `)
    ]);

    res.json({
      potentialDuplicates: duplicates.rows,
      largeTransactions: largeTransactions.rows,
      unusualPatterns: unusualPatterns.rows,
      categoryBreakdown: categoryBreakdown.rows
    });
  } catch (error) {
    logger.error('Admin transactions overview error:', error);
    res.status(500).json({ error: 'Failed to get transaction overview' });
  }
});

// POST /api/admin/cleanup — Clean up old data
router.post('/cleanup', async (req: AuthRequest, res: Response) => {
  try {
    const { type, days = 30 } = req.body;
    let result;

    switch (type) {
      case 'logs':
        // Clean old log files
        const logDir = path.join(process.cwd(), 'logs');
        try {
          const files = await fs.readdir(logDir);
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);

          let deletedCount = 0;
          for (const file of files) {
            if (file.startsWith('application-') && file.endsWith('.log')) {
              const filePath = path.join(logDir, file);
              const stats = await fs.stat(filePath);
              if (stats.mtime < cutoffDate) {
                await fs.unlink(filePath);
                deletedCount++;
              }
            }
          }
          result = { message: `Deleted ${deletedCount} old log files` };
        } catch (error) {
          result = { message: 'No log files to clean' };
        }
        break;

      case 'sessions':
        // Clean expired sessions
        const sessionResult = await query(
          `DELETE FROM refresh_tokens
           WHERE expires_at < NOW() OR revoked_at IS NOT NULL
           RETURNING id`
        );
        result = { message: `Cleaned ${sessionResult.rowCount} expired sessions` };
        break;

      case 'login_attempts':
        // Clean old login attempts
        const loginResult = await query(
          `DELETE FROM login_attempts
           WHERE created_at < NOW() - MAKE_INTERVAL(days => $1)
           RETURNING id`,
          [days]
        );
        result = { message: `Cleaned ${loginResult.rowCount} old login attempts` };
        break;

      default:
        return res.status(400).json({ error: 'Invalid cleanup type' });
    }

    logger.info('Admin performed cleanup', { adminId: req.userId, type, days });
    res.json(result);
  } catch (error) {
    logger.error('Admin cleanup error:', error);
    res.status(500).json({ error: 'Failed to perform cleanup' });
  }
});

// POST /api/admin/users/:id/impersonate — Impersonate a user (view as user)
router.post('/users/:id/impersonate', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    // Get user details
    const userResult = await query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.warn('Admin initiated impersonation', {
      adminId: req.userId,
      targetUserId: userId
    });

    // In a real implementation, you would generate a special token here
    // For now, we'll just return the user info
    res.json({
      message: 'Ready to impersonate user',
      user: userResult.rows[0],
      note: 'Use the budget switcher to view as this user'
    });
  } catch (error) {
    logger.error('Admin impersonate error:', error);
    res.status(500).json({ error: 'Failed to impersonate user' });
  }
});

import AIAssistant from '../services/aiAssistant';

// Provider API keys are stored encrypted in these settings. They are never
// returned to the client — only a boolean "configured" flag is exposed.
const AI_KEY_SETTINGS: Record<string, string> = {
  claude: 'ai_anthropic_api_key',
  openai: 'ai_openai_api_key',
};

// GET /api/admin/ai/settings — Get AI configuration
router.get('/ai/settings', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await query("SELECT key, value FROM system_settings WHERE key LIKE 'ai_%'");

    // Convert rows to object, omitting the encrypted key material.
    const config: any = {};
    settings.rows.forEach(row => {
      if (row.key === AI_KEY_SETTINGS.claude || row.key === AI_KEY_SETTINGS.openai) return;
      config[row.key] = row.value;
    });

    // Report which providers have a key configured (without exposing the key).
    const configured = {
      claude: settings.rows.some(r => r.key === AI_KEY_SETTINGS.claude && r.value),
      openai: settings.rows.some(r => r.key === AI_KEY_SETTINGS.openai && r.value),
    };

    res.json({
      config,
      keysConfigured: configured,
      available: await AIAssistant.isAvailable(),
    });
  } catch (error) {
    logger.error('Get AI settings error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/ai/settings — Update AI configuration
router.post('/ai/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { ai_enabled, ai_provider, ai_model, anthropic_api_key, openai_api_key } = req.body;

    if (ai_provider !== undefined && !['claude', 'openai'].includes(ai_provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be "claude" or "openai".' });
    }

    await query('BEGIN');

    const upsert = (key: string, value: string, type: string) =>
      query(
        'INSERT INTO system_settings (key, value, type) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value, type]
      );

    if (ai_enabled !== undefined) {
      await upsert('ai_enabled', String(ai_enabled), 'boolean');
    }
    if (ai_provider !== undefined) {
      await upsert('ai_provider', ai_provider, 'string');
    }
    if (ai_model !== undefined) {
      await upsert('ai_model', ai_model, 'string');
    }

    // API keys: only update when a non-empty value is supplied so a blank field
    // doesn't wipe an existing key. Stored encrypted at rest.
    if (typeof anthropic_api_key === 'string' && anthropic_api_key.trim()) {
      await upsert(AI_KEY_SETTINGS.claude, EncryptionService.encryptAPIKey(anthropic_api_key.trim()), 'string');
    }
    if (typeof openai_api_key === 'string' && openai_api_key.trim()) {
      await upsert(AI_KEY_SETTINGS.openai, EncryptionService.encryptAPIKey(openai_api_key.trim()), 'string');
    }

    await query('COMMIT');

    // Reflect the change immediately rather than waiting for the config TTL.
    AIAssistant.invalidateConfigCache();
    res.json({ success: true });
  } catch (error) {
    await query('ROLLBACK');
    logger.error('Update AI settings error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/ai/models — List the models actually available to the key.
// Accepts an apiKey being entered in the form, or falls back to the stored key.
router.post('/ai/models', async (req: AuthRequest, res: Response) => {
  try {
    const provider = req.body.provider === 'openai' ? 'openai' : 'claude';
    let apiKey: string | null =
      typeof req.body.apiKey === 'string' && req.body.apiKey.trim() ? req.body.apiKey.trim() : null;
    if (!apiKey) {
      const row = await query('SELECT value FROM system_settings WHERE key = $1', [AI_KEY_SETTINGS[provider]]);
      if (row.rows[0]?.value) {
        try { apiKey = EncryptionService.decryptAPIKey(row.rows[0].value); } catch { apiKey = null; }
      }
    }
    if (!apiKey) return res.status(400).json({ error: 'Enter an API key first, then fetch models.' });

    let models: Array<{ value: string; label: string }> = [];
    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      });
      if (!r.ok) {
        return res.status(r.status === 401 ? 401 : 502).json({
          error: r.status === 401 ? 'Anthropic rejected that API key.' : 'Could not fetch models from Anthropic.',
        });
      }
      const data: any = await r.json();
      models = (data.data || []).map((m: any) => ({ value: m.id, label: m.display_name || m.id }));
    } else {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) {
        return res.status(r.status === 401 ? 401 : 502).json({
          error: r.status === 401 ? 'OpenAI rejected that API key.' : 'Could not fetch models from OpenAI.',
        });
      }
      const data: any = await r.json();
      models = (data.data || [])
        .filter((m: any) => /^(gpt|o[0-9]|chatgpt)/i.test(m.id))
        .map((m: any) => ({ value: m.id, label: m.id }))
        .sort((a: any, b: any) => a.value.localeCompare(b.value));
    }
    res.json({ models });
  } catch (error) {
    logger.error('Fetch AI models error', error as Error);
    res.status(502).json({ error: 'Could not reach the AI provider to list models. Check your connection and key.' });
  }
});

// DELETE /api/admin/ai/settings/key/:provider — Remove a stored provider key
router.delete('/ai/settings/key/:provider', async (req: AuthRequest, res: Response) => {
  try {
    const settingKey = AI_KEY_SETTINGS[req.params.provider];
    if (!settingKey) {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    await query('DELETE FROM system_settings WHERE key = $1', [settingKey]);
    AIAssistant.invalidateConfigCache();
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete AI key error', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/system/updates — Check for application updates
router.get('/system/updates', async (req: AuthRequest, res: Response) => {
  try {
    // Prefer the real installed app version (the desktop shell passes it via
    // APP_VERSION); fall back to package.json for non-desktop deployments.
    const packageJson = require('../../package.json');
    const currentVersion = process.env.APP_VERSION || packageJson.version || '1.0.0';
    const repo = 'JWalen/budget-tracker'; // Hardcoded correct repo

    // Fetch latest release from GitHub
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Budget-Tracker-App'
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    // Use native fetch (not axios): in the packaged desktop backend, axios's
    // `timeout` didn't always abort a stalled DNS/connect, so the request could
    // hang indefinitely. AbortSignal.timeout aborts the whole operation.
    const ghResp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!ghResp.ok) {
      throw new Error(`GitHub returned ${ghResp.status}`);
    }
    const release: any = await ghResp.json();
    const response = { data: release };

    const latestVersion = response.data.tag_name.replace(/^v/, '');

    // Proper semver comparison — only flag an update when the release is strictly
    // newer (a plain !== also fires when the local build is ahead of the release).
    const parse = (v: string) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const isNewer = (cand: string, cur: string) => {
      const a = parse(cand), b = parse(cur);
      for (let i = 0; i < 3; i++) { if ((a[i] || 0) > (b[i] || 0)) return true; if ((a[i] || 0) < (b[i] || 0)) return false; }
      return false;
    };
    const hasUpdate = isNewer(latestVersion, currentVersion);

    res.json({
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseUrl: response.data.html_url,
      releaseNotes: response.data.body,
      publishedAt: response.data.published_at
    });
  } catch (error) {
    // Read package.json for fallback
    const packageJson = require('../../package.json');
    const currentVersion = packageJson.version || '1.0.0';

    logger.error('Check updates error:', error);
    // Return current version even if check fails
    res.json({
      currentVersion,
      hasUpdate: false,
      error: 'Failed to check for updates'
    });
  }
});

// NOTE: The in-app "one-click update" endpoint was removed for security.
// It spawned a shell that ran `git pull` + `docker compose` against a mounted
// host Docker socket, which is effectively remote code execution on the host
// from a web session. Deployments/updates are now an out-of-band operator
// action (see PRODUCTION-DEPLOYMENT.md). The docker.sock/project bind mounts
// were also removed from docker-compose.yml.
router.post('/system/update', async (_req: AuthRequest, res: Response) => {
  res.status(410).json({
    error: 'In-app updates have been disabled. Update the deployment from the host (git pull + docker compose up -d --build).',
  });
});

export default router;

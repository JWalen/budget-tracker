import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);
const logger = new LoggerClass('BackupSchedule');

router.use(authMiddleware);

// Get backup history
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const isAdmin = (req as any).user?.is_admin;

    let result;
    if (isAdmin) {
      // Admin sees all backups
      result = await query(
        `SELECT bh.*, u.name as user_name, u.email as user_email
         FROM backup_history bh
         LEFT JOIN users u ON bh.user_id = u.id
         ORDER BY bh.created_at DESC
         LIMIT 100`
      );
    } else {
      // Regular user sees only their backups
      result = await query(
        `SELECT * FROM backup_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );
    }

    // Format file sizes
    const backups = result.rows.map(backup => ({
      ...backup,
      size: formatFileSize(backup.file_size || 0)
    }));

    res.json(backups);
  } catch (error) {
    logger.error('Get backup history error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get backup schedules
router.get('/schedules', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const result = await query(
      `SELECT * FROM backup_schedules
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get backup schedules error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create backup schedule
router.post('/schedules', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { name, frequency, time, storageType, retentionDays, enabled } = req.body;

    // Calculate next run time
    const nextRun = calculateNextRun(frequency, time);

    const result = await query(
      `INSERT INTO backup_schedules
       (user_id, name, frequency, schedule_time, storage_type, retention_days, enabled, next_run)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, name, frequency, time, storageType, retentionDays, enabled !== false, nextRun]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create backup schedule error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update backup schedule
router.put('/schedules/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { enabled } = req.body;

    const result = await query(
      `UPDATE backup_schedules
       SET enabled = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [enabled, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update backup schedule error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete backup schedule
router.delete('/schedules/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM backup_schedules WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    logger.error('Delete backup schedule error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get backup configuration
router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    // Check for user-specific or global config
    const result = await query(
      `SELECT * FROM backup_config
       WHERE user_id = $1 OR is_global = true
       ORDER BY is_global ASC, created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Return default config
      return res.json({
        type: 'local',
        path: '/backups',
        credentials: {}
      });
    }

    // Don't send sensitive credentials to frontend
    const config = result.rows[0];
    const sanitizedConfig = {
      type: config.storage_type,
      path: config.storage_path,
      credentials: config.storage_type === 'local' ? {} : { configured: true }
    };

    res.json(sanitizedConfig);
  } catch (error) {
    logger.error('Get backup config error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save backup configuration
router.post('/config', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { type, path: storagePath, credentials } = req.body;

    // Upsert configuration
    await query(
      `INSERT INTO backup_config (user_id, storage_type, storage_path, credentials)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET
         storage_type = $2,
         storage_path = $3,
         credentials = $4,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, type, storagePath || null, JSON.stringify(credentials || {})]
    );

    res.json({ message: 'Configuration saved' });
  } catch (error) {
    logger.error('Save backup config error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download backup immediately without saving
router.post('/download-now', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { isAdminBackup } = req.body;
    const isAdmin = (req as any).user?.is_admin;

    // Only admins can create admin backups
    const createAdminBackup = isAdminBackup && isAdmin;

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `backup-${createAdminBackup ? 'full' : `user${userId}`}-${timestamp}.json`;

    // Get data to backup
    let backupData;
    if (createAdminBackup) {
      // Full system backup
      backupData = await createFullBackup();
    } else {
      // User-specific backup
      backupData = await createUserBackup(userId!);
    }

    // Return the backup data directly for download
    res.json({
      filename,
      data: backupData,
    });
  } catch (error) {
    logger.error('Download backup error:', error as Error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Create manual backup
router.post('/create', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { storageType, isAdminBackup } = req.body;
    const isAdmin = (req as any).user?.is_admin;

    // Only admins can create admin backups
    const createAdminBackup = isAdminBackup && isAdmin;

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `backup-${createAdminBackup ? 'full' : `user${userId}`}-${timestamp}.json`;

    // Record backup start
    const backupRecord = await query(
      `INSERT INTO backup_history
       (user_id, filename, storage_type, is_admin_backup, status)
       VALUES ($1, $2, $3, $4, 'in_progress')
       RETURNING id`,
      [userId, filename, storageType || 'local', createAdminBackup]
    );
    const backupId = backupRecord.rows[0].id;

    try {
      // Get data to backup
      let backupData;
      if (createAdminBackup) {
        // Full system backup
        backupData = await createFullBackup();
      } else {
        // User-specific backup
        backupData = await createUserBackup(userId!);
      }

      // Save to configured storage
      const { path: savedPath, size } = await saveBackup(filename, backupData, storageType, userId!);

      // Update backup record
      await query(
        `UPDATE backup_history
         SET status = 'success',
             file_size = $1,
             storage_path = $2,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [size, savedPath, backupId]
      );

      res.json({
        message: 'Backup created successfully',
        filename,
        size: formatFileSize(size)
      });
    } catch (error) {
      // Record failure
      await query(
        `UPDATE backup_history
         SET status = 'failed',
             error_message = $1,
             completed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [(error as Error).message, backupId]
      );
      throw error;
    }
  } catch (error) {
    logger.error('Create backup error:', error as Error);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Helper functions
function calculateNextRun(frequency: string, time: string): Date {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date();

  next.setHours(hours, minutes, 0, 0);

  switch (frequency) {
    case 'hourly':
      next.setTime(now.getTime() + 3600000); // Add 1 hour
      break;
    case 'daily':
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return next;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function createUserBackup(userId: number): Promise<any> {
  const backup: any = {
    version: '1.0',
    created_at: new Date().toISOString(),
    user_id: userId,
    data: {}
  };

  // Tables with direct user_id
  const directTables = [
    'categories',
    'bank_accounts',
    'family_members',
    'transactions',
    'recurring_transactions',
    'budgets',
    'bills',
    'debts',
    'pay_periods',
    'match_rules'
  ];

  for (const table of directTables) {
    const result = await query(
      `SELECT * FROM ${table} WHERE user_id = $1`,
      [userId]
    );
    backup.data[table] = result.rows;
  }

  // Bill payments - need to join through bills table
  const billPaymentsResult = await query(
    `SELECT bp.* FROM bill_payments bp
     JOIN bills b ON bp.bill_id = b.id
     WHERE b.user_id = $1`,
    [userId]
  );
  backup.data.bill_payments = billPaymentsResult.rows;

  // Pay period bills - need to join through pay_periods table
  const payPeriodBillsResult = await query(
    `SELECT ppb.* FROM pay_period_bills ppb
     JOIN pay_periods pp ON ppb.pay_period_id = pp.id
     WHERE pp.user_id = $1`,
    [userId]
  );
  backup.data.pay_period_bills = payPeriodBillsResult.rows;

  // Account balances - join through bank_accounts
  const accountBalancesResult = await query(
    `SELECT ab.* FROM account_balances ab
     JOIN bank_accounts ba ON ab.account_id = ba.id
     WHERE ba.user_id = $1`,
    [userId]
  );
  backup.data.account_balances = accountBalancesResult.rows;

  // Spending limits - join through family_members
  const spendingLimitsResult = await query(
    `SELECT sl.* FROM spending_limits sl
     JOIN family_members fm ON sl.member_id = fm.id
     WHERE fm.user_id = $1`,
    [userId]
  );
  backup.data.spending_limits = spendingLimitsResult.rows;

  // Spending alerts
  const spendingAlertsResult = await query(
    `SELECT * FROM spending_alerts WHERE user_id = $1`,
    [userId]
  );
  backup.data.spending_alerts = spendingAlertsResult.rows;

  // Approval requests - join through family_members
  const approvalRequestsResult = await query(
    `SELECT ar.* FROM approval_requests ar
     JOIN family_members fm ON ar.member_id = fm.id
     WHERE fm.user_id = $1`,
    [userId]
  );
  backup.data.approval_requests = approvalRequestsResult.rows;

  // Allowance transactions - join through family_members
  const allowanceTransactionsResult = await query(
    `SELECT at.* FROM allowance_transactions at
     JOIN family_members fm ON at.member_id = fm.id
     WHERE fm.user_id = $1`,
    [userId]
  );
  backup.data.allowance_transactions = allowanceTransactionsResult.rows;

  return backup;
}

async function createFullBackup(): Promise<any> {
  // Get all data for admin backup
  const tables = [
    'users',
    'categories',
    'bank_accounts',
    'account_balances',
    'family_members',
    'transactions',
    'recurring_transactions',
    'budgets',
    'bills',
    'bill_payments',
    'debts',
    'pay_periods',
    'pay_period_bills',
    'match_rules',
    'budget_shares',
    'spending_limits',
    'spending_alerts',
    'approval_requests',
    'allowance_transactions'
  ];

  const backup: any = {
    version: '1.0',
    created_at: new Date().toISOString(),
    is_full_backup: true,
    data: {}
  };

  for (const table of tables) {
    const result = await query(`SELECT * FROM ${table}`);
    backup.data[table] = result.rows;
  }

  return backup;
}

async function saveBackup(filename: string, data: any, storageType: string, userId: number): Promise<{ path: string, size: number }> {
  const jsonData = JSON.stringify(data, null, 2);
  const size = Buffer.byteLength(jsonData);

  let backupDir: string;

  // Determine backup directory based on storage type
  if (storageType === 'server') {
    // Server storage - use configured server path or default
    backupDir = process.env.SERVER_BACKUP_DIR || '/var/backups/budget';
  } else if (storageType === 'local') {
    // Local storage - use configured local path
    backupDir = process.env.LOCAL_BACKUP_DIR || '/backups';
  } else {
    // Default to temp directory for other types (will be implemented later)
    backupDir = process.env.BACKUP_DIR || '/tmp/backups';
  }

  // Create directory if it doesn't exist
  await fs.mkdir(backupDir, { recursive: true });

  const filePath = path.join(backupDir, filename);
  await fs.writeFile(filePath, jsonData);

  return { path: filePath, size };
}

// Restore backup data
router.post('/restore', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const backupData = req.body;

    // Validate backup structure
    if (!backupData || !backupData.version || !backupData.data) {
      return res.status(400).json({ error: 'Invalid backup format' });
    }

    // Start a transaction for atomic restore
    await query('BEGIN');

    try {
      // Delete existing user data (in reverse order of foreign key dependencies)
      const deleteTables = [
        'pay_period_bills',
        'bill_payments',
        'pay_periods',
        'debts',
        'bills',
        'budgets',
        'recurring_transactions',
        'transactions',
        'match_rules',
        'categories'
      ];

      for (const table of deleteTables) {
        if (table === 'pay_period_bills') {
          await query(
            `DELETE FROM pay_period_bills ppb
             USING pay_periods pp
             WHERE ppb.pay_period_id = pp.id AND pp.user_id = $1`,
            [userId]
          );
        } else if (table === 'bill_payments') {
          await query(
            `DELETE FROM bill_payments bp
             USING bills b
             WHERE bp.bill_id = b.id AND b.user_id = $1`,
            [userId]
          );
        } else {
          await query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
        }
      }

      // Restore data from backup
      const restoreTables = [
        'categories',
        'match_rules',
        'transactions',
        'recurring_transactions',
        'budgets',
        'bills',
        'debts',
        'pay_periods',
        'bill_payments',
        'pay_period_bills'
      ];

      for (const table of restoreTables) {
        const data = backupData.data[table] || [];

        if (data.length === 0) continue;

        for (const row of data) {
          // Ensure user_id is set correctly
          if (table === 'bill_payments' || table === 'pay_period_bills') {
            // These tables don't have user_id, just insert as is
            const columns = Object.keys(row);
            const values = columns.map(col => row[col]);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

            await query(
              `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
              values
            );
          } else {
            // Set user_id to current user
            row.user_id = userId;
            const columns = Object.keys(row);
            const values = columns.map(col => row[col]);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

            // For tables with ID, we need to handle potential conflicts
            if (row.id) {
              await query(
                `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
                 ON CONFLICT (id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')}`,
                values
              );
            } else {
              // If no ID, let the database generate one
              const columnsNoId = columns.filter(k => k !== 'id');
              const valuesNoId = columnsNoId.map(col => row[col]);
              const placeholdersNoId = columnsNoId.map((_, i) => `$${i + 1}`).join(', ');

              await query(
                `INSERT INTO ${table} (${columnsNoId.join(', ')}) VALUES (${placeholdersNoId})`,
                valuesNoId
              );
            }
          }
        }
      }

      await query('COMMIT');
      res.json({ message: 'Backup restored successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error('Restore backup error:', error as Error);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

export default router;

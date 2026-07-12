import { Router, Response } from 'express';
import pool, { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logErrorToDb } from '../services/errorLog';

const router = Router();
const logger = new LoggerClass('BackupSchedule');

router.use(authMiddleware);

// Real admin check — authMiddleware only sets req.userId, never req.user,
// so admin status must be resolved from the database.
async function isUserAdmin(userId: number | undefined): Promise<boolean> {
  if (!userId) return false;
  const result = await query('SELECT is_admin FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 && result.rows[0].is_admin === true;
}

// Get backup history
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const isAdmin = await isUserAdmin(userId);

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
    const isAdmin = await isUserAdmin(userId);

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
    logErrorToDb({ context: 'Backup', message: `Download-now failed: ${(error as Error).message}`, detail: (error as Error).stack, statusCode: 500, method: req.method, path: req.originalUrl, userId: req.userId ?? null });
    res.status(500).json({ error: 'Failed to create backup' });
  }
});

// Create manual backup
router.post('/create', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { storageType, isAdminBackup } = req.body;
    const isAdmin = await isUserAdmin(userId);

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
    logErrorToDb({ context: 'Backup', message: `Create backup failed: ${(error as Error).message}`, detail: (error as Error).stack, statusCode: 500, method: req.method, path: req.originalUrl, userId: req.userId ?? null });
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Helper functions
export function calculateNextRun(frequency: string, time: string): Date {
  const now = new Date();
  const next = new Date();

  // Guard against missing/malformed time to avoid a 500 on time.split(':')
  const [rawHours, rawMinutes] = (time || '00:00').split(':');
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  next.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0
  );

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

export async function createUserBackup(userId: number): Promise<any> {
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
    backup.data[table] = await dumpTable(table, 'WHERE user_id = $1', [userId]);
  }

  // Child tables reached via a join to a user-owned parent. Each is best-effort
  // so a single missing/renamed table can't fail the whole backup.
  backup.data.bill_payments = await safeRows(
    `SELECT bp.* FROM bill_payments bp JOIN bills b ON bp.bill_id = b.id WHERE b.user_id = $1`,
    [userId], 'bill_payments');
  backup.data.pay_period_bills = await safeRows(
    `SELECT ppb.* FROM pay_period_bills ppb JOIN pay_periods pp ON ppb.pay_period_id = pp.id WHERE pp.user_id = $1`,
    [userId], 'pay_period_bills');
  backup.data.account_balances = await safeRows(
    `SELECT ab.* FROM account_balances ab JOIN bank_accounts ba ON ab.account_id = ba.id WHERE ba.user_id = $1`,
    [userId], 'account_balances');
  backup.data.spending_limits = await safeRows(
    `SELECT sl.* FROM spending_limits sl JOIN family_members fm ON sl.member_id = fm.id WHERE fm.user_id = $1`,
    [userId], 'spending_limits');
  backup.data.spending_alerts = await safeRows(
    `SELECT * FROM spending_alerts WHERE user_id = $1`,
    [userId], 'spending_alerts');
  backup.data.approval_requests = await safeRows(
    `SELECT ar.* FROM approval_requests ar JOIN family_members fm ON ar.member_id = fm.id WHERE fm.user_id = $1`,
    [userId], 'approval_requests');
  backup.data.allowance_transactions = await safeRows(
    `SELECT at.* FROM allowance_transactions at JOIN family_members fm ON at.member_id = fm.id WHERE fm.user_id = $1`,
    [userId], 'allowance_transactions');

  return backup;
}

// Non-secret columns we're willing to export from the users table. A full backup
// must never carry password_hash, mfa_secret, or any other credential material.
// We intersect this allow-list with the columns that ACTUALLY exist (schemas
// drift across versions — e.g. older DBs have no `currency`/`updated_at`), so the
// SELECT can never reference a missing column and 500 the whole backup.
const USER_SAFE_COLUMNS = [
  'id', 'email', 'name', 'is_admin', 'mfa_enabled',
  'currency', 'default_currency', 'created_at', 'updated_at',
  'last_login', 'last_activity',
];

async function usersExportColumns(): Promise<string> {
  try {
    const r = await query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = ANY($1::text[])`,
      [USER_SAFE_COLUMNS]
    );
    const cols = r.rows.map((row: any) => row.column_name);
    return cols.length ? cols.join(', ') : 'id, email, name';
  } catch {
    return 'id, email, name';
  }
}

// Dump a table in full, but never let one missing/broken table fail the whole
// backup — skip it (empty) and record why.
async function dumpTable(table: string, where = '', params: any[] = []): Promise<any[]> {
  return safeRows(`SELECT * FROM ${table} ${where}`, params, table);
}

// Run an arbitrary backup query, returning [] (and logging) instead of throwing
// so one problematic table can't fail the entire backup.
async function safeRows(sql: string, params: any[], label: string): Promise<any[]> {
  try {
    const result = await query(sql, params);
    return result.rows;
  } catch (e) {
    logger.warn(`Backup: skipping "${label}" (${(e as Error).message})`);
    return [];
  }
}

export async function createFullBackup(): Promise<any> {
  // Get all data for admin backup. `users` uses an explicit non-secret column
  // list; every other table is dumped in full. `budget_shares` is intentionally
  // absent — it is dropped on every boot (schema.sql) and would 500 the query.
  const tables = [
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

  // users: only the non-secret columns that actually exist (never password_hash
  // / mfa_secret). Uses an explicit projection, not dumpTable's SELECT *.
  const userCols = await usersExportColumns();
  try {
    const usersResult = await query(`SELECT ${userCols} FROM users`);
    backup.data.users = usersResult.rows;
  } catch (e) {
    logger.warn(`Backup: users projection failed (${(e as Error).message})`);
    backup.data.users = [];
  }

  for (const table of tables) {
    backup.data[table] = await dumpTable(table);
  }

  return backup;
}

export async function saveBackup(filename: string, data: any, storageType: string, userId: number): Promise<{ path: string, size: number }> {
  const jsonData = JSON.stringify(data, null, 2);
  const size = Buffer.byteLength(jsonData);

  // Determine backup directory based on storage type. The desktop app sets
  // BACKUP_DIR to a writable folder under its data directory; the historical
  // defaults ('/backups', '/var/backups/budget') are Docker mount points that
  // are NOT writable on a normal machine, which is why saving previously failed.
  let backupDir: string;
  if (storageType === 'server') {
    backupDir = process.env.SERVER_BACKUP_DIR || process.env.BACKUP_DIR || '/var/backups/budget';
  } else if (storageType === 'local') {
    backupDir = process.env.LOCAL_BACKUP_DIR || process.env.BACKUP_DIR || '/backups';
  } else {
    backupDir = process.env.BACKUP_DIR || '/tmp/backups';
  }

  // Write to the chosen directory, but never hard-fail on an unwritable path —
  // fall back to a guaranteed-writable temp dir so the backup is still saved and
  // remains downloadable from history.
  const writeInto = async (dir: string): Promise<string> => {
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, filename);
    await fs.writeFile(p, jsonData);
    return p;
  };

  try {
    return { path: await writeInto(backupDir), size };
  } catch (err) {
    const fallbackDir = path.join(os.tmpdir(), 'budget-backups');
    logger.warn(`Backup dir "${backupDir}" not writable (${(err as Error).message}); falling back to ${fallbackDir}`);
    return { path: await writeInto(fallbackDir), size };
  }
}

// Allow-listed columns per restorable table. Column identifiers can never be
// interpolated from attacker-controlled JSON keys — only names in these sets
// are ever placed into SQL. Values remain fully parameterized.
const RESTORE_ALLOWED_COLUMNS: Record<string, Set<string>> = {
  categories: new Set([
    'id', 'user_id', 'name', 'type', 'color', 'icon', 'exclude_from_income', 'created_at'
  ]),
  match_rules: new Set([
    'id', 'user_id', 'name', 'pattern', 'target_type', 'target_id', 'category_id', 'created_at'
  ]),
  transactions: new Set([
    'id', 'user_id', 'category_id', 'account_id', 'member_id', 'amount', 'description', 'date', 'type', 'created_at'
  ]),
  recurring_transactions: new Set([
    'id', 'user_id', 'category_id', 'amount', 'description', 'type', 'frequency', 'next_date', 'active', 'created_at'
  ]),
  budgets: new Set([
    'id', 'user_id', 'category_id', 'amount_limit', 'month', 'year', 'created_at'
  ]),
  bills: new Set([
    'id', 'user_id', 'name', 'amount', 'due_date', 'category_id', 'auto_match_pattern', 'is_active', 'created_at'
  ]),
  debts: new Set([
    'id', 'user_id', 'name', 'type', 'balance', 'original_amount', 'interest_rate',
    'minimum_payment', 'due_date', 'contact', 'notes', 'is_paid', 'created_at'
  ]),
  pay_periods: new Set([
    'id', 'user_id', 'name', 'amount', 'date', 'is_recurring', 'frequency', 'created_at'
  ]),
  bill_payments: new Set([
    'id', 'bill_id', 'transaction_id', 'amount_paid', 'payment_date', 'month', 'year', 'created_at'
  ]),
  pay_period_bills: new Set([
    'id', 'pay_period_id', 'bill_id', 'month', 'year', 'amount_override', 'created_at'
  ]),
};

// Restore backup data
router.post('/restore', requireEditAccess, async (req: AuthRequest, res: Response) => {
  const backupData = req.body;

  // Validate backup structure
  if (!backupData || !backupData.version || !backupData.data) {
    return res.status(400).json({ error: 'Invalid backup format' });
  }

  const userId = req.userId!;
  // Use a dedicated client so BEGIN/DELETE/INSERT/COMMIT are truly atomic.
  // The shared pool `query()` may run each statement on a different connection,
  // which would make the destructive delete non-atomic and risk data loss.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
        await client.query(
          `DELETE FROM pay_period_bills ppb
           USING pay_periods pp
           WHERE ppb.pay_period_id = pp.id AND pp.user_id = $1`,
          [userId]
        );
      } else if (table === 'bill_payments') {
        await client.query(
          `DELETE FROM bill_payments bp
           USING bills b
           WHERE bp.bill_id = b.id AND b.user_id = $1`,
          [userId]
        );
      } else {
        await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
      }
    }

    // Restore data from backup.
    //
    // SECURITY: we never honor a client-supplied `id`. IDs are global serials, so
    // trusting them let an attacker's backup collide with (and ON CONFLICT-overwrite)
    // another user's rows, and also left the table's sequence behind the inserted ids.
    // Instead every row is INSERTed fresh with a DB-generated id, and foreign keys are
    // remapped through per-table old->new id maps built as we go. References to tables
    // that are NOT part of a per-user backup (bank_accounts, family_members) are verified
    // to belong to the caller and nulled out otherwise.
    //
    // Order matters: parents before the children that reference them.
    const restoreOrder = [
      'categories',
      'bills',
      'pay_periods',
      'transactions',
      'recurring_transactions',
      'budgets',
      'debts',
      'match_rules',
      'bill_payments',
      'pay_period_bills',
    ];

    // old id -> new id, per parent table
    const idMap: Record<string, Map<number, number>> = {
      categories: new Map(),
      bills: new Map(),
      pay_periods: new Map(),
      transactions: new Map(),
    };

    // Ownership sets for tables referenced but not restored here.
    const ownedAccounts = new Set<number>(
      (await client.query('SELECT id FROM bank_accounts WHERE user_id = $1', [userId])).rows.map(r => r.id)
    );
    const ownedMembers = new Set<number>(
      (await client.query('SELECT id FROM family_members WHERE user_id = $1', [userId])).rows.map(r => r.id)
    );

    const remap = (map: Map<number, number>, oldVal: any): number | null => {
      if (oldVal == null) return null;
      const mapped = map.get(Number(oldVal));
      return mapped == null ? null : mapped;
    };

    for (const table of restoreOrder) {
      const data = backupData.data[table] || [];
      if (!Array.isArray(data) || data.length === 0) continue;

      const allowedColumns = RESTORE_ALLOWED_COLUMNS[table];
      const hasUserId = allowedColumns.has('user_id');

      for (const row of data) {
        if (!row || typeof row !== 'object') continue;

        const oldId = row.id != null ? Number(row.id) : null;

        // Build the insert payload from allow-listed, non-id columns only.
        const insert: Record<string, any> = {};
        for (const col of Object.keys(row)) {
          if (!allowedColumns.has(col) || col === 'id') continue;
          insert[col] = row[col];
        }

        // Force ownership to the caller.
        if (hasUserId) insert.user_id = userId;

        // Remap foreign keys through the id maps / ownership checks.
        if ('category_id' in insert) insert.category_id = remap(idMap.categories, insert.category_id);
        if ('transaction_id' in insert) insert.transaction_id = remap(idMap.transactions, insert.transaction_id);
        if ('bill_id' in insert) {
          insert.bill_id = remap(idMap.bills, insert.bill_id);
          // bill_id is the required parent for these child tables — skip orphans.
          if (insert.bill_id == null) continue;
        }
        if ('pay_period_id' in insert) {
          insert.pay_period_id = remap(idMap.pay_periods, insert.pay_period_id);
          if (insert.pay_period_id == null) continue;
        }
        if ('account_id' in insert && insert.account_id != null && !ownedAccounts.has(Number(insert.account_id))) {
          insert.account_id = null;
        }
        if ('member_id' in insert && insert.member_id != null && !ownedMembers.has(Number(insert.member_id))) {
          insert.member_id = null;
        }
        // match_rules.target_id only remaps when it points at a bill we just restored.
        if (table === 'match_rules' && 'target_id' in insert) {
          if (row.target_type === 'bill') {
            insert.target_id = remap(idMap.bills, insert.target_id);
          } else if (row.target_type === 'category') {
            insert.target_id = remap(idMap.categories, insert.target_id);
          }
        }

        const columns = Object.keys(insert);
        if (columns.length === 0) continue;
        const values = columns.map(c => insert[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        const result = await client.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          values
        );

        // Record old->new id for parents so children can remap.
        if (oldId != null && idMap[table]) {
          idMap[table].set(oldId, result.rows[0].id);
        }
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Backup restored successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Restore backup error:', error as Error);
    res.status(500).json({ error: 'Failed to restore backup' });
  } finally {
    client.release();
  }
});

// Download a previously created backup file by history id. Ownership is enforced
// (admin backups additionally require an admin caller). Streams the stored file
// with an auth-checked handler — the frontend must fetch this with the Bearer
// token, not window.open (which sends no Authorization header).
router.get('/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid backup id' });
    }

    const historyResult = await query(
      'SELECT * FROM backup_history WHERE id = $1',
      [id]
    );
    const record = historyResult.rows[0];
    if (!record) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // Authorization: the owner, or any admin for admin backups.
    const isOwner = record.user_id === req.userId;
    const admin = await isUserAdmin(req.userId);
    if (!isOwner && !(record.is_admin_backup && admin)) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    if (record.status !== 'success' || !record.storage_path) {
      return res.status(409).json({ error: 'Backup file is not available for download' });
    }

    let data: Buffer;
    try {
      data = await fs.readFile(record.storage_path);
    } catch {
      return res.status(410).json({ error: 'Backup file is no longer on disk' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`);
    res.send(data);
  } catch (error) {
    logger.error('Download backup error:', error as Error);
    res.status(500).json({ error: 'Failed to download backup' });
  }
});

export default router;

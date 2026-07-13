import { Router, Response } from 'express';
import pool, { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { LoggerClass } from '../services/logger';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const logger = new LoggerClass('Backup');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const adminUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function generateInserts(tableName: string, rows: any[]): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const lines = rows.map(row => {
    const vals = columns.map(c => escapeValue(row[c])).join(', ');
    return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${vals});`;
  });
  return lines.join('\n');
}

function parseInserts(sql: string): { table: string; columns: string[]; values: string }[] {
  const results: { table: string; columns: string[]; values: string }[] = [];
  const regex = /INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+?)\);/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    results.push({
      table: match[1],
      columns: match[2].split(',').map(c => c.trim()),
      values: match[3],
    });
  }
  return results;
}

function parseValues(valStr: string): string[] {
  const result: string[] = [];
  let current = '';
  let inString = false;
  let i = 0;
  while (i < valStr.length) {
    const ch = valStr[i];
    if (inString) {
      if (ch === "'" && i + 1 < valStr.length && valStr[i + 1] === "'") {
        current += "''";
        i += 2;
        continue;
      }
      if (ch === "'") {
        current += "'";
        inString = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === "'") {
        inString = true;
        current += "'";
        i++;
        continue;
      }
      if (ch === ',') {
        result.push(current.trim());
        current = '';
        i++;
        continue;
      }
      current += ch;
      i++;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function sqlToJs(val: string): any {
  if (val === 'NULL') return null;
  if (val === 'TRUE') return true;
  if (val === 'FALSE') return false;
  if (val.startsWith("'") && val.endsWith("'")) {
    return val.slice(1, -1).replace(/''/g, "'");
  }
  const num = Number(val);
  if (!isNaN(num)) return num;
  return val;
}

// ── User tables in FK order ─────────────────────────────────────────────────

const USER_TABLES = [
  'categories',
  'transactions',
  'budgets',
  'recurring_transactions',
  'debts',
  'bills',
  'bill_payments',
  'match_rules',
  'budget_shares',
];

// Explicit non-secret columns for the users table — password_hash and
// mfa_secret must never be included in any export.
const USERS_EXPORT_COLUMNS = [
  'id',
  'email',
  'name',
  'mfa_enabled',
  'is_admin',
  'active_sessions',
  'last_login',
  'last_activity',
  'created_at',
].join(', ');

// Allow-listed columns per restorable user table. Column identifiers parsed
// from an uploaded backup file are attacker-controlled, so only names present
// in these sets are ever interpolated into SQL. Values stay parameterized.
const RESTORE_ALLOWED_COLUMNS: Record<string, Set<string>> = {
  categories: new Set([
    'id', 'user_id', 'name', 'type', 'color', 'icon', 'exclude_from_income', 'created_at'
  ]),
  transactions: new Set([
    'id', 'user_id', 'category_id', 'account_id', 'member_id', 'amount', 'description', 'date', 'type', 'created_at'
  ]),
  budgets: new Set([
    'id', 'user_id', 'category_id', 'amount_limit', 'month', 'year', 'created_at'
  ]),
  recurring_transactions: new Set([
    'id', 'user_id', 'category_id', 'amount', 'description', 'type', 'frequency', 'next_date', 'active', 'created_at'
  ]),
  debts: new Set([
    'id', 'user_id', 'name', 'type', 'balance', 'original_amount', 'interest_rate',
    'minimum_payment', 'due_date', 'contact', 'notes', 'is_paid', 'created_at'
  ]),
  bills: new Set([
    'id', 'user_id', 'name', 'amount', 'due_date', 'category_id', 'auto_match_pattern', 'is_active', 'created_at'
  ]),
  bill_payments: new Set([
    'id', 'bill_id', 'transaction_id', 'amount_paid', 'payment_date', 'month', 'year', 'created_at'
  ]),
  match_rules: new Set([
    'id', 'user_id', 'name', 'pattern', 'target_type', 'target_id', 'category_id', 'created_at'
  ]),
};

// All tables for admin backup (in FK order)
const ALL_TABLES = [
  'users',
  'refresh_tokens',
  'login_attempts',
  'categories',
  'bank_accounts',
  'account_balances',
  'family_members',
  'transactions',
  'budgets',
  'recurring_transactions',
  'debts',
  'bills',
  'bill_payments',
  'match_rules',
  'budget_shares',
  'pay_periods',
  'pay_period_bills',
  'spending_limits',
  'spending_alerts',
  'approval_requests',
  'allowance_transactions',
  'email_config',
  'backup_config',
  'backup_schedules',
  'backup_history',
];

// ── Router setup ─────────────────────────────────────────────────────────────

const router = Router();
router.use(authMiddleware);

// ── Per-user export ──────────────────────────────────────────────────────────

router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const [
      categories,
      transactions,
      budgets,
      recurring,
      debts,
      bills,
      billPayments,
      matchRules,
      budgetShares,
    ] = await Promise.all([
      query('SELECT * FROM categories WHERE user_id = $1 ORDER BY id', [userId]),
      query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY id', [userId]),
      query('SELECT * FROM budgets WHERE user_id = $1 ORDER BY id', [userId]),
      query('SELECT * FROM recurring_transactions WHERE user_id = $1 ORDER BY id', [userId]),
      query('SELECT * FROM debts WHERE user_id = $1 ORDER BY id', [userId]),
      query('SELECT * FROM bills WHERE user_id = $1 ORDER BY id', [userId]),
      query(
        'SELECT bp.* FROM bill_payments bp JOIN bills b ON bp.bill_id = b.id WHERE b.user_id = $1 ORDER BY bp.id',
        [userId]
      ),
      query('SELECT * FROM match_rules WHERE user_id = $1 ORDER BY id', [userId]),
      query('SELECT * FROM budget_shares WHERE owner_id = $1 ORDER BY id', [userId]),
    ]);

    const date = new Date().toISOString().split('T')[0];
    let sql = '';
    sql += `-- Budget App Backup\n`;
    sql += `-- Format: per-user\n`;
    sql += `-- Version: 1\n`;
    sql += `-- User: ${user.email}\n`;
    sql += `-- Date: ${date}\n\n`;

    const tableData: [string, any[]][] = [
      ['categories', categories.rows],
      ['transactions', transactions.rows],
      ['budgets', budgets.rows],
      ['recurring_transactions', recurring.rows],
      ['debts', debts.rows],
      ['bills', bills.rows],
      ['bill_payments', billPayments.rows],
      ['match_rules', matchRules.rows],
      ['budget_shares', budgetShares.rows],
    ];

    for (const [table, rows] of tableData) {
      if (rows.length) {
        sql += `-- Table: ${table}\n`;
        sql += generateInserts(table, rows);
        sql += '\n\n';
      }
    }

    const username = user.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `budget-backup-${username}-${date}.sql`;

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);
  } catch (error) {
    logger.error('Backup export error:', error);
    res.status(500).json({ error: 'Failed to export backup' });
  }
});

// ── Per-user restore (legacy .sql format) ────────────────────────────────────
// The primary /restore lives in backupSchedule.ts and takes the JSON backup that
// the app downloads. This legacy handler stays at /restore-sql so old .sql
// exports can still be restored, but it no longer shadows the JSON restore.

router.post('/restore-sql', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const userId = req.userId!;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const sql = req.file.buffer.toString('utf-8');
    if (!sql.includes('-- Format: per-user')) {
      return res.status(400).json({ error: 'Invalid backup file. Expected per-user format.' });
    }

    const inserts = parseInserts(sql);
    const grouped: Record<string, { columns: string[]; values: string }[]> = {};
    for (const ins of inserts) {
      if (!grouped[ins.table]) grouped[ins.table] = [];
      grouped[ins.table].push({ columns: ins.columns, values: ins.values });
    }

    // ID maps for FK remapping
    const idMaps: Record<string, Map<number, number>> = {
      categories: new Map(),
      transactions: new Map(),
      bills: new Map(),
      debts: new Map(),
    };

    let totalRestored = 0;

    await client.query('BEGIN');

    // Process tables in FK order
    const restoreOrder = [
      'categories',
      'transactions',
      'budgets',
      'recurring_transactions',
      'debts',
      'bills',
      'bill_payments',
      'match_rules',
    ];

    for (const table of restoreOrder) {
      const rows = grouped[table];
      if (!rows) continue;

      const allowedColumns = RESTORE_ALLOWED_COLUMNS[table];
      if (!allowedColumns) continue; // never touch a non-allow-listed table

      for (const row of rows) {
        const vals = parseValues(row.values);
        const colVals: Record<string, any> = {};
        row.columns.forEach((col, i) => {
          // Only accept allow-listed column identifiers — never arbitrary keys
          // parsed from the uploaded file.
          if (allowedColumns.has(col)) {
            colVals[col] = sqlToJs(vals[i]);
          }
        });

        // Store original ID for remapping
        const originalId = colVals['id'];

        // Skip id column — let DB assign new serials
        delete colVals['id'];

        // Replace user_id / owner_id with current user
        if ('user_id' in colVals) colVals['user_id'] = userId;
        if ('owner_id' in colVals) colVals['owner_id'] = userId;

        // Remap FK references
        if ('category_id' in colVals && colVals['category_id'] !== null) {
          const mapped = idMaps.categories.get(colVals['category_id']);
          colVals['category_id'] = mapped ?? null;
        }

        if (table === 'bill_payments') {
          if ('bill_id' in colVals && colVals['bill_id'] !== null) {
            const mapped = idMaps.bills.get(colVals['bill_id']);
            if (!mapped) continue; // skip if bill wasn't restored
            colVals['bill_id'] = mapped;
          }
          if ('transaction_id' in colVals && colVals['transaction_id'] !== null) {
            const mapped = idMaps.transactions.get(colVals['transaction_id']);
            colVals['transaction_id'] = mapped ?? null;
          }
        }

        if (table === 'match_rules' && 'target_id' in colVals) {
          const targetType = colVals['target_type'];
          if (targetType === 'category') {
            const mapped = idMaps.categories.get(colVals['target_id']);
            if (mapped) colVals['target_id'] = mapped;
          } else if (targetType === 'bill') {
            const mapped = idMaps.bills.get(colVals['target_id']);
            if (mapped) colVals['target_id'] = mapped;
          } else if (targetType === 'debt') {
            const mapped = idMaps.debts.get(colVals['target_id']);
            if (mapped) colVals['target_id'] = mapped;
          }
        }

        const cols = Object.keys(colVals);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const values = cols.map(c => colVals[c]);

        // Use ON CONFLICT DO NOTHING for tables with unique constraints
        let conflict = '';
        if (table === 'budgets') conflict = ' ON CONFLICT DO NOTHING';
        if (table === 'bill_payments') conflict = ' ON CONFLICT DO NOTHING';

        const insertSql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})${conflict} RETURNING id`;
        const result = await client.query(insertSql, values);

        if (result.rows.length > 0) {
          const newId = result.rows[0].id;
          if (idMaps[table] && originalId != null) {
            idMaps[table].set(originalId, newId);
          }
          totalRestored++;
        }
      }
    }

    await client.query('COMMIT');
    res.json({ totalRestored });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Backup restore error:', error);
    res.status(500).json({ error: 'Failed to restore backup' });
  } finally {
    client.release();
  }
});

// ── Admin routes ─────────────────────────────────────────────────────────────

const adminRouter = Router();
adminRouter.use(adminMiddleware);

// ── Admin full export ────────────────────────────────────────────────────────

adminRouter.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const date = new Date().toISOString().split('T')[0];

    // Read init.sql for schema
    const initSqlPath = path.resolve(__dirname, '../../../database/init.sql');
    let schemaSql = '';
    try {
      schemaSql = fs.readFileSync(initSqlPath, 'utf-8');
    } catch {
      // If file not found, try alternative path in Docker
      try {
        schemaSql = fs.readFileSync('/app/database/init.sql', 'utf-8');
      } catch {
        // Generate minimal schema comment
        schemaSql = '-- Schema not available, restore with caution\n';
      }
    }

    let sql = '';
    sql += `-- Budget App Full Database Backup\n`;
    sql += `-- Format: admin-full\n`;
    sql += `-- Version: 1\n`;
    sql += `-- Date: ${date}\n\n`;

    // Disable FK checks during restore
    sql += `SET session_replication_role = 'replica';\n\n`;

    // Drop tables in reverse FK order
    const reverseTables = [...ALL_TABLES].reverse();
    for (const table of reverseTables) {
      sql += `DROP TABLE IF EXISTS ${table} CASCADE;\n`;
    }
    sql += '\n';

    // Create tables from schema
    sql += `-- Schema\n`;
    sql += schemaSql;
    sql += '\n\n';

    // Insert data for all tables
    for (const table of ALL_TABLES) {
      // Never export password_hash / mfa_secret — select explicit columns for users.
      const selectCols = table === 'users' ? USERS_EXPORT_COLUMNS : '*';
      const result = await query(`SELECT ${selectCols} FROM ${table} ORDER BY id`);
      if (result.rows.length) {
        sql += `-- Table: ${table} (${result.rows.length} rows)\n`;
        sql += generateInserts(table, result.rows);
        sql += '\n\n';
      }
    }

    // Reset sequences
    sql += `-- Reset sequences\n`;
    for (const table of ALL_TABLES) {
      const seqResult = await query(
        `SELECT COALESCE(MAX(id), 0) + 1 as next_val FROM ${table}`
      );
      const nextVal = seqResult.rows[0].next_val;
      sql += `SELECT setval('${table}_id_seq', ${nextVal}, false);\n`;
    }
    sql += '\n';

    // Re-enable FK checks
    sql += `SET session_replication_role = 'origin';\n`;

    const filename = `budget-full-backup-${date}.sql`;

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);
  } catch (error) {
    logger.error('Admin backup export error:', error);
    res.status(500).json({ error: 'Failed to export database backup' });
  }
});

// ── Admin full restore ───────────────────────────────────────────────────────

adminRouter.post('/restore', adminUpload.single('file'), async (_req: AuthRequest, res: Response) => {
  // SECURITY: This handler previously read an uploaded file, split it on ';',
  // and executed each fragment via client.query(stmt) — i.e. it ran arbitrary,
  // attacker-supplied SQL (DROP TABLE, arbitrary DDL/DML, etc.) with full DB
  // privileges. There is no safe way to whitelist arbitrary SQL statements, so
  // the feature has been disabled. A safe replacement would parse a known JSON
  // structure and insert only allow-listed table + column identifiers (the same
  // approach used by the per-user /restore and backupSchedule restore handlers).
  logger.warn('Admin backup restore invoked but is disabled for safety (arbitrary SQL execution)');
  return res.status(501).json({
    error: 'Admin full restore is disabled for security reasons. Arbitrary SQL execution from uploaded files is not supported.'
  });
});

router.use('/admin', adminRouter);

export default router;

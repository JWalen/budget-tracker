import { query } from '../config/database';
import TokenService from './tokenService';
import { LoggerClass } from './logger';
import {
  createUserBackup,
  saveBackup,
  calculateNextRun,
} from '../routes/backupSchedule';

const logger = new LoggerClass('Scheduler');

// Lightweight in-process scheduler for periodic maintenance. Runs one pass at
// startup (after a short delay) and then on a fixed interval. Single-instance
// only — if this app is ever scaled to multiple replicas, move these to a proper
// job runner with locking to avoid duplicate work.

const HOUR = 60 * 60 * 1000;

async function runMaintenance(): Promise<void> {
  // 1. Purge expired/revoked refresh tokens (otherwise refresh_tokens grows
  //    unbounded — rows were only ever UPDATEd, never deleted).
  await TokenService.cleanupExpiredTokens();

  // 2. Trim old login attempts (used only for short-window rate limiting).
  try {
    const result = await query(
      "DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '7 days'"
    );
    if (result.rowCount && result.rowCount > 0) {
      logger.info('Cleaned up old login attempts', { count: result.rowCount });
    }
  } catch (error) {
    logger.error('Login attempt cleanup failed', error as Error);
  }

  // 3. Expire stale notifications (keep the table bounded).
  try {
    await query(
      "DELETE FROM notifications WHERE is_read = true AND created_at < NOW() - INTERVAL '90 days'"
    );
  } catch (error) {
    // Non-fatal: table may not have is_read in older schemas.
    logger.debug('Notification cleanup skipped', { error: (error as Error).message });
  }
}

// Run any backup schedules whose next_run has passed. Each schedule produces a
// per-user backup written to the configured storage, records a backup_history
// row, advances next_run, and prunes history past its retention window.
async function runDueBackups(): Promise<void> {
  let due;
  try {
    const result = await query(
      `SELECT * FROM backup_schedules
       WHERE enabled = true AND next_run IS NOT NULL AND next_run <= NOW()`
    );
    due = result.rows;
  } catch (error) {
    logger.error('Failed to load due backup schedules', error as Error);
    return;
  }

  for (const schedule of due) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `backup-user${schedule.user_id}-${timestamp}.json`;
    let historyId: number | null = null;
    try {
      const rec = await query(
        `INSERT INTO backup_history (user_id, schedule_id, filename, storage_type, is_admin_backup, status)
         VALUES ($1, $2, $3, $4, false, 'in_progress') RETURNING id`,
        [schedule.user_id, schedule.id, filename, schedule.storage_type || 'local']
      );
      historyId = rec.rows[0].id;

      const data = await createUserBackup(schedule.user_id);
      const { path: savedPath, size } = await saveBackup(filename, data, schedule.storage_type || 'local', schedule.user_id);

      await query(
        `UPDATE backup_history SET status = 'success', file_size = $1, storage_path = $2, completed_at = NOW() WHERE id = $3`,
        [size, savedPath, historyId]
      );

      // Prune this user's history past the retention window.
      if (schedule.retention_days) {
        await query(
          `DELETE FROM backup_history
           WHERE user_id = $1 AND created_at < NOW() - ($2 || ' days')::interval`,
          [schedule.user_id, String(schedule.retention_days)]
        );
      }

      logger.info('Scheduled backup completed', { scheduleId: schedule.id, userId: schedule.user_id, size });
    } catch (error) {
      logger.error('Scheduled backup failed', error as Error);
      if (historyId) {
        await query(
          `UPDATE backup_history SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
          [(error as Error).message?.slice(0, 500) || 'unknown', historyId]
        ).catch(() => {});
      }
    } finally {
      // Always advance next_run so a failing schedule doesn't hot-loop every tick.
      try {
        const next = calculateNextRun(schedule.frequency, schedule.schedule_time || '03:00');
        await query(
          'UPDATE backup_schedules SET last_run = NOW(), next_run = $1, updated_at = NOW() WHERE id = $2',
          [next, schedule.id]
        );
      } catch (e) {
        logger.error('Failed to advance backup schedule next_run', e as Error);
      }
    }
  }
}

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  await runMaintenance().catch((e) => logger.error('Maintenance pass failed', e as Error));
  await runDueBackups().catch((e) => logger.error('Backup pass failed', e as Error));
}

// Backups can be scheduled hourly, so poll more often than the hourly maintenance
// (a due schedule is picked up within this interval).
const BACKUP_POLL = 10 * 60 * 1000; // 10 minutes

export function startScheduler(): void {
  // First pass shortly after boot, then on the poll interval. Maintenance is
  // cheap and idempotent, so running it every poll (not strictly hourly) is fine.
  const kickoff = setTimeout(() => {
    tick();
    timer = setInterval(tick, BACKUP_POLL);
    timer.unref();
  }, 30_000);
  kickoff.unref();
  logger.info('Maintenance + backup scheduler started', { pollMs: BACKUP_POLL });
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

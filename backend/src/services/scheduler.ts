import { query } from '../config/database';
import TokenService from './tokenService';
import { LoggerClass } from './logger';

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

let timer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  // First pass shortly after boot, then hourly.
  const kickoff = setTimeout(() => {
    runMaintenance().catch((e) => logger.error('Maintenance pass failed', e as Error));
    timer = setInterval(() => {
      runMaintenance().catch((e) => logger.error('Maintenance pass failed', e as Error));
    }, HOUR);
    timer.unref();
  }, 30_000);
  kickoff.unref();
  logger.info('Maintenance scheduler started (hourly)');
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

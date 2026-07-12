import { query } from '../config/database';

// DB-backed error log. Unlike the winston file logs, this works in the packaged
// desktop app (where file logging is disabled and the working dir is read-only)
// and is queryable from the admin panel for troubleshooting.

export interface ErrorLogEntry {
  level?: 'error' | 'warn';
  context?: string;
  message: string;
  detail?: string;        // stack trace or JSON detail
  statusCode?: number;
  method?: string;
  path?: string;
  userId?: number | null;
  requestId?: string;
}

// Keep the table bounded (best-effort; runs occasionally).
const MAX_ROWS = 2000;
let sinceTrim = 0;

// Record an error to the DB. Best-effort: never throws, so logging a failure
// can't cascade into another failure.
export async function logErrorToDb(entry: ErrorLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO error_logs (level, context, message, detail, status_code, method, path, user_id, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        entry.level || 'error',
        entry.context || null,
        (entry.message || '').slice(0, 4000),
        entry.detail ? entry.detail.slice(0, 8000) : null,
        entry.statusCode ?? null,
        entry.method || null,
        entry.path ? entry.path.slice(0, 500) : null,
        entry.userId ?? null,
        entry.requestId || null,
      ]
    );

    // Prune old rows occasionally.
    if (++sinceTrim >= 100) {
      sinceTrim = 0;
      await query(
        `DELETE FROM error_logs WHERE id < (
           SELECT COALESCE(MIN(id), 0) FROM (
             SELECT id FROM error_logs ORDER BY id DESC LIMIT $1
           ) keep
         )`,
        [MAX_ROWS]
      ).catch(() => {});
    }
  } catch {
    // swallow — logging must never break the request path
  }
}

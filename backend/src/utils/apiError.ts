import { Response } from 'express';

/**
 * Central error helpers so API responses carry useful, actionable messages
 * instead of a bare "Server error". Two pieces:
 *   - mapPgError:      Postgres error codes -> friendly {status, message}
 *   - handleRouteError: log + send a useful JSON body (pg-mapped when possible),
 *                       echoing the request id for support correlation.
 */

interface MappedError {
  status: number;
  message: string;
}

interface MinimalLogger {
  error: (message: string, error?: any, meta?: any) => void;
}

/**
 * Translate a Postgres/driver error into a user-facing status + message.
 * Returns null when the error isn't a recognized database constraint error,
 * so the caller can fall back to its own message.
 */
export function mapPgError(error: any): MappedError | null {
  switch (error?.code) {
    case '23505': // unique_violation
      return { status: 409, message: friendlyUnique(error) };
    case '23503': // foreign_key_violation
      return { status: 400, message: friendlyForeignKey(error) };
    case '23502': // not_null_violation
      return {
        status: 400,
        message: error?.column
          ? `Missing required field: ${humanize(error.column)}.`
          : 'A required field is missing.',
      };
    case '22P02': // invalid_text_representation (e.g. non-numeric where a number is expected)
      return { status: 400, message: 'A field has an invalid value (a number or valid format was expected).' };
    case '23514': // check_violation
      return { status: 400, message: 'A value is outside the allowed range.' };
    case '22001': // string_data_right_truncation
      return { status: 400, message: 'A text value is too long.' };
    case '22003': // numeric_value_out_of_range
      return { status: 400, message: 'A number is too large.' };
    default:
      return null;
  }
}

function friendlyUnique(error: any): string {
  // detail e.g.: Key (email)=(a@b.com) already exists.
  const m = String(error?.detail || '').match(/Key \(([^)]+)\)=/);
  return m ? `That ${humanize(m[1])} is already in use.` : 'That value already exists.';
}

function friendlyForeignKey(error: any): string {
  const detail = String(error?.detail || '');
  // On DELETE: "Key (id)=(5) is still referenced from table "transactions"."
  if (/still referenced/.test(detail)) {
    const t = detail.match(/referenced from table "([^"]+)"/);
    return t
      ? `Can't delete this — it's still used by ${humanize(t[1])}.`
      : "Can't delete this — it's still in use elsewhere.";
  }
  // On INSERT/UPDATE: "Key (category_id)=(5) is not present in table "categories"."
  const m = detail.match(/Key \(([^)]+)\)=/);
  const field = m ? humanize(m[1].replace(/_id$/, '')) : 'referenced item';
  return `The selected ${field} doesn't exist.`;
}

// category_id -> "category", "bank accounts" -> "bank accounts"
function humanize(name: string): string {
  return name.replace(/_id$/, '').replace(/_/g, ' ').trim();
}

/**
 * Log the error and send a useful JSON response.
 * - Known DB constraint errors -> mapped 4xx with a specific message.
 * - Otherwise -> 500 with the provided fallback (make it specific, e.g.
 *   "Couldn't create the budget. Please try again.").
 * The response always includes the request id (when present) so a user-reported
 * failure can be tied to a server log line.
 */
export function handleRouteError(
  res: Response,
  error: any,
  fallback: string,
  logger?: MinimalLogger
): Response {
  if (logger) logger.error(fallback, error);

  const requestId = (res.req as any)?.requestId;
  const withId = (body: Record<string, unknown>) =>
    requestId ? { ...body, requestId } : body;

  const mapped = mapPgError(error);
  if (mapped) {
    return res.status(mapped.status).json(withId({ error: mapped.message }));
  }
  return res.status(500).json(withId({ error: fallback }));
}

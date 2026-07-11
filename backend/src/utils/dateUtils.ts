// Date helpers for money/schedule math.
//
// Two recurring pitfalls these avoid:
//   1. `Date.setMonth(m + 1)` overflows month-ends — Jan 31 -> Mar 3, Oct 31 -> Dec 1 —
//      silently skipping a month for anything dated the 29th–31st.
//   2. Round-tripping a DATE through `toISOString()` shifts the day by one whenever the
//      server timezone is east of UTC, so a stored `next_date` regresses each cycle.
//
// Everything here works on LOCAL date components and never routes through UTC.

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Format a Date as YYYY-MM-DD using its local components (never UTC). */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Add `months` to a date, clamping the day to the target month's last valid day. */
export function addMonthsClamped(d: Date, months: number): Date {
  const day = d.getDate();
  const anchor = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  anchor.setDate(Math.min(day, lastDay));
  return anchor;
}

/**
 * Next occurrence for a recurring frequency, or null for an unknown frequency.
 * Monthly/yearly clamp to month-end so the day-of-month never drifts across a short month.
 */
export function nextOccurrence(d: Date, frequency: string): Date | null {
  const r = new Date(d.getTime());
  switch (frequency) {
    case 'daily': r.setDate(r.getDate() + 1); return r;
    case 'weekly': r.setDate(r.getDate() + 7); return r;
    case 'biweekly': r.setDate(r.getDate() + 14); return r;
    case 'monthly': return addMonthsClamped(d, 1);
    case 'yearly': return addMonthsClamped(d, 12);
    default: return null;
  }
}

/** Today's date as YYYY-MM-DD in the server's local timezone (not UTC). */
export function todayDateString(): string {
  return toDateString(new Date());
}

/**
 * Normalize a date-ish value (a `YYYY-MM-DD` string, a fuller ISO string, or a
 * Date/pg DATE) to a bare `YYYY-MM-DD` without any UTC round-trip. Use this to
 * compare dates from different sources (CSV strings vs DB DATE columns) — going
 * through `new Date(x).toISOString()` shifts the day in non-UTC timezones and
 * makes equal dates miscompare.
 */
export function toDateOnly(value: string | Date): string {
  if (value instanceof Date) return toDateString(value);
  const s = String(value).trim();
  // Fast path: leading YYYY-MM-DD is already what we want.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : toDateString(d);
}

/** Extract 1-based month and full year from a `YYYY-MM-DD`-ish value (local, no UTC shift). */
export function monthYearOf(value: string | Date): { month: number; year: number } {
  const iso = toDateOnly(value);
  const [y, m] = iso.split('-');
  return { month: Number(m), year: Number(y) };
}

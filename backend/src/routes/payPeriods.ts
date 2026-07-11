import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import { addMonthsClamped, toDateString } from '../utils/dateUtils';

const logger = new LoggerClass('PayPeriods');
const router = Router();

router.use(authMiddleware);
router.use(sharingMiddleware);

// Get pay periods for a month window (15th prior month through end of month)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month as string) || new Date().getMonth() + 1;
    const y = parseInt(year as string) || new Date().getFullYear();
    const budgetUserId = (req as any).budgetUserId;

    // Window: 15th of prior month through end of current month
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const startDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-15`;

    // Calculate the last day of the current month
    const lastDay = new Date(y, m, 0).getDate(); // Day 0 of next month = last day of current month
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get pay periods in the date window
    const ppResult = await query(
      `SELECT * FROM pay_periods
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [budgetUserId, startDate, endDate]
    );

    // Get bill assignments for this month/year
    const billsResult = await query(
      `SELECT ppb.*, b.name as bill_name, b.amount as bill_amount, b.due_date as bill_due_date
       FROM pay_period_bills ppb
       JOIN bills b ON b.id = ppb.bill_id
       WHERE ppb.pay_period_id = ANY($1::int[]) AND ppb.month = $2 AND ppb.year = $3`,
      [ppResult.rows.map(pp => pp.id), m, y]
    );

    // Merge bills into pay periods
    const payPeriods = ppResult.rows.map(pp => ({
      ...pp,
      bills: billsResult.rows.filter(b => b.pay_period_id === pp.id),
    }));

    res.json(payPeriods);
  } catch (error) {
    logger.error('Get pay periods error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create pay period
router.post('/', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { name, amount, date, is_recurring, frequency } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const validationError = validatePayPeriodInput({ name, amount, date, is_recurring, frequency });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const result = await query(
      `INSERT INTO pay_periods (user_id, name, amount, date, is_recurring, frequency)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [budgetUserId, name, amount, date, is_recurring || false, is_recurring ? frequency : null]
    );

    const created = result.rows[0];

    // If recurring, auto-generate future instances (3 months out)
    if (is_recurring && frequency) {
      const generated = await generateRecurringInstances(budgetUserId, created);
      res.status(201).json({ payPeriod: created, generated });
      return;
    }

    res.status(201).json(created);
  } catch (error) {
    logger.error('Create pay period error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update pay period
router.put('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, amount, date, is_recurring, frequency } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const validationError = validatePayPeriodInput({ name, amount, date, is_recurring, frequency });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const result = await query(
      `UPDATE pay_periods
       SET name = $1, amount = $2, date = $3, is_recurring = $4, frequency = $5
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [name, amount, date, is_recurring || false, is_recurring ? frequency : null, id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update pay period error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete pay period (cascades assignments)
router.delete('/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM pay_periods WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    res.json({ message: 'Pay period deleted' });
  } catch (error) {
    logger.error('Delete pay period error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Assign bill to pay period (upsert — allows moving between pay periods)
router.post('/:id/bills', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { bill_id, month, year, amount_override } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    // Verify pay period belongs to user
    const ppCheck = await query(
      'SELECT id FROM pay_periods WHERE id = $1 AND user_id = $2',
      [id, budgetUserId]
    );
    if (ppCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    // Verify bill belongs to user
    const billCheck = await query(
      'SELECT id FROM bills WHERE id = $1 AND user_id = $2',
      [bill_id, budgetUserId]
    );
    if (billCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const result = await query(
      `INSERT INTO pay_period_bills (pay_period_id, bill_id, month, year, amount_override)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (bill_id, month, year) DO UPDATE
       SET pay_period_id = $1, amount_override = $5
       RETURNING *`,
      [id, bill_id, month, year, amount_override || null]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Assign bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unassign bill from pay period
router.delete('/:id/bills/:billId', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id, billId } = req.params;
    const { month, year } = req.query;
    const budgetUserId = (req as any).budgetUserId;

    // Verify pay period belongs to user
    const ppCheck = await query(
      'SELECT id FROM pay_periods WHERE id = $1 AND user_id = $2',
      [id, budgetUserId]
    );
    if (ppCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pay period not found' });
    }

    const result = await query(
      `DELETE FROM pay_period_bills
       WHERE pay_period_id = $1 AND bill_id = $2 AND month = $3 AND year = $4
       RETURNING id`,
      [id, billId, month, year]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ message: 'Bill unassigned' });
  } catch (error) {
    logger.error('Unassign bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate future recurring instances
router.post('/generate', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;

    // Get all recurring pay periods
    const recurring = await query(
      'SELECT * FROM pay_periods WHERE user_id = $1 AND is_recurring = true',
      [budgetUserId]
    );

    let totalGenerated = 0;
    for (const pp of recurring.rows) {
      const generated = await generateRecurringInstances(budgetUserId, pp);
      totalGenerated += generated.length;
    }

    res.json({ message: `Generated ${totalGenerated} pay period instances` });
  } catch (error) {
    logger.error('Generate pay periods error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper: generate recurring instances 3 months out from the latest existing instance
async function generateRecurringInstances(userId: number, basePP: any): Promise<any[]> {
  if (!basePP.is_recurring || !basePP.frequency) return [];

  // Find the latest instance with the same name for this user
  const latestResult = await query(
    `SELECT date FROM pay_periods
     WHERE user_id = $1 AND name = $2
     ORDER BY date DESC LIMIT 1`,
    [userId, basePP.name]
  );

  const latestDate = latestResult.rows.length > 0
    ? new Date(latestResult.rows[0].date)
    : new Date(basePP.date);

  const threeMonthsOut = new Date();
  threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);

  const generated: any[] = [];
  let nextDate = new Date(latestDate);

  // Safety cap: at most ~1 year of instances at the finest (weekly) cadence.
  // Prevents an unbounded/infinite loop if getNextDate ever fails to advance.
  let iterations = 0;
  const MAX_ITERATIONS = 60;

  while (iterations++ < MAX_ITERATIONS) {
    const advanced = getNextDate(nextDate, basePP.frequency);
    // If the date did not advance (unknown/invalid frequency), stop rather than loop forever.
    if (advanced.getTime() <= nextDate.getTime()) break;
    nextDate = advanced;
    if (nextDate > threeMonthsOut) break;

    // Check if this date already exists
    const nextDateStr = toDateString(nextDate);
    const existing = await query(
      `SELECT id FROM pay_periods
       WHERE user_id = $1 AND name = $2 AND date = $3`,
      [userId, basePP.name, nextDateStr]
    );

    if (existing.rows.length === 0) {
      const result = await query(
        `INSERT INTO pay_periods (user_id, name, amount, date, is_recurring, frequency)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, basePP.name, basePP.amount, nextDateStr, true, basePP.frequency]
      );
      generated.push(result.rows[0]);
    }
  }

  return generated;
}

function getNextDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      // Month-end safe: Jan 31 -> Feb 28/29, not Mar 3.
      return addMonthsClamped(current, 1);
    case 'semimonthly':
      // 1st and 15th pattern
      if (next.getDate() < 15) {
        next.setDate(15);
      } else {
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
      }
      break;
    default:
      // Unknown/invalid frequency: return the date unchanged so callers can
      // detect non-advancement and stop (see generateRecurringInstances).
      break;
  }
  return next;
}

// Allowed recurring frequencies (mirrors the DB CHECK constraint on pay_periods.frequency)
export const VALID_PAY_PERIOD_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'semimonthly'];

// Validate pay-period write payloads. Returns an error string, or null if valid.
function validatePayPeriodInput(input: {
  name?: unknown;
  amount?: unknown;
  date?: unknown;
  is_recurring?: unknown;
  frequency?: unknown;
}): string | null {
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    return 'Name is required';
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Amount must be a positive number';
  }
  if (!input.date || isNaN(new Date(input.date as string).getTime())) {
    return 'A valid date is required';
  }
  if (input.is_recurring) {
    if (!input.frequency || !VALID_PAY_PERIOD_FREQUENCIES.includes(input.frequency as string)) {
      return `Recurring pay periods require a frequency of: ${VALID_PAY_PERIOD_FREQUENCIES.join(', ')}`;
    }
  }
  return null;
}

export default router;

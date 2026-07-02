import { Router, Response } from 'express';
import { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validators, validateDateRange } from '../middleware/validation';
import { body } from 'express-validator';
import { LoggerClass } from '../services/logger';

const logger = new LoggerClass('Family');
const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all family members for the user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const members = await query(
      `SELECT fm.*,
        COALESCE(
          (SELECT SUM(ABS(t.amount))
           FROM transactions t
           WHERE t.member_id = fm.id
           AND t.type = 'expense'
           AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', CURRENT_DATE)
          ), 0
        ) as current_month_spending
       FROM family_members fm
       WHERE fm.user_id = $1
       ORDER BY
         CASE fm.role
           WHEN 'parent' THEN 1
           WHEN 'spouse' THEN 2
           WHEN 'child' THEN 3
           ELSE 4
         END,
         fm.name`,
      [req.userId]
    );

    res.json(members.rows);
  } catch (error) {
    logger.error('Get family members error:', error);
    res.status(500).json({ error: 'Failed to fetch family members' });
  }
});

// Create a new family member
router.post('/',
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('role').isIn(['parent', 'spouse', 'child', 'other']),
    body('email').optional().isEmail().normalizeEmail(),
    body('birth_date').optional().isISO8601(),
    body('allowance_amount').optional().isFloat({ min: 0 }),
    body('allowance_frequency').optional().isIn(['weekly', 'biweekly', 'monthly']),
    body('spending_limit').optional().isFloat({ min: 0 }),
    body('avatar_color').optional().matches(/^#[0-9A-F]{6}$/i),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        name, role, email, birth_date, allowance_amount,
        allowance_frequency, spending_limit, avatar_color
      } = req.body;

      const result = await query(
        `INSERT INTO family_members
         (user_id, name, role, email, birth_date, allowance_amount,
          allowance_frequency, spending_limit, avatar_color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.userId, name, role, email || null, birth_date || null,
         allowance_amount || null, allowance_frequency || null,
         spending_limit || null, avatar_color || '#0ea5e9']
      );

      // If allowance is set, create allowance transaction schedule
      if (allowance_amount && allowance_frequency) {
        await createAllowanceSchedule(result.rows[0].id, allowance_amount, allowance_frequency);
      }

      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Email already exists' });
      }
      logger.error('Create family member error:', error);
      res.status(500).json({ error: 'Failed to create family member' });
    }
  }
);

// Update a family member
router.put('/:id',
  [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('role').optional().isIn(['parent', 'spouse', 'child', 'other']),
    body('email').optional().isEmail().normalizeEmail(),
    body('birth_date').optional().isISO8601(),
    body('allowance_amount').optional().isFloat({ min: 0 }),
    body('allowance_frequency').optional().isIn(['weekly', 'biweekly', 'monthly']),
    body('spending_limit').optional().isFloat({ min: 0 }),
    body('avatar_color').optional().matches(/^#[0-9A-F]{6}$/i),
    body('is_active').optional().isBoolean(),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Verify ownership
      const ownership = await query(
        'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
        [id, req.userId]
      );

      if (ownership.rows.length === 0) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      // Whitelist updatable columns. Never interpolate raw request keys into SQL —
      // doing so allows SQL injection and mass-assignment (e.g. reassigning user_id).
      const ALLOWED_FIELDS = new Set([
        'name',
        'role',
        'email',
        'birth_date',
        'allowance_amount',
        'allowance_frequency',
        'spending_limit',
        'avatar_color',
        'is_active',
      ]);

      const fields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      Object.entries(req.body).forEach(([key, value]) => {
        if (value !== undefined && ALLOWED_FIELDS.has(key)) {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      values.push(id, req.userId);
      const updateQuery = `
        UPDATE family_members
        SET ${fields.join(', ')}
        WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await query(updateQuery, values);

      // Update allowance schedule if changed
      if (req.body.allowance_amount !== undefined || req.body.allowance_frequency !== undefined) {
        await updateAllowanceSchedule(
          id,
          req.body.allowance_amount || result.rows[0].allowance_amount,
          req.body.allowance_frequency || result.rows[0].allowance_frequency
        );
      }

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Update family member error:', error);
      res.status(500).json({ error: 'Failed to update family member' });
    }
  }
);

// Delete a family member
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM family_members WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Family member not found' });
    }

    res.json({ message: 'Family member deleted successfully' });
  } catch (error) {
    logger.error('Delete family member error:', error);
    res.status(500).json({ error: 'Failed to delete family member' });
  }
});

// Get spending limits for a family member
router.get('/:id/limits', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const ownership = await query(
      'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Family member not found' });
    }

    const limits = await query(
      `SELECT sl.*, c.name as category_name, b.month, b.year
       FROM spending_limits sl
       LEFT JOIN categories c ON sl.category_id = c.id
       LEFT JOIN budgets b ON sl.budget_id = b.id
       WHERE sl.member_id = $1
       ORDER BY sl.period, c.name`,
      [id]
    );

    res.json(limits.rows);
  } catch (error) {
    logger.error('Get spending limits error:', error);
    res.status(500).json({ error: 'Failed to fetch spending limits' });
  }
});

// Set spending limit for a family member
router.post('/:id/limits',
  [
    body('category_id').optional().isInt({ min: 1 }),
    body('budget_id').optional().isInt({ min: 1 }),
    body('limit_amount').isFloat({ min: 0 }),
    body('period').isIn(['daily', 'weekly', 'monthly']),
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { category_id, budget_id, limit_amount, period } = req.body;

      // Verify ownership
      const ownership = await query(
        'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
        [id, req.userId]
      );

      if (ownership.rows.length === 0) {
        return res.status(404).json({ error: 'Family member not found' });
      }

      if (!category_id && !budget_id) {
        return res.status(400).json({ error: 'Either category_id or budget_id is required' });
      }

      // Postgres does not allow two ON CONFLICT targets in one statement.
      // Choose the conflict target based on which unique key applies:
      //   - category limits conflict on (member_id, category_id, period)
      //   - budget limits conflict on (member_id, budget_id)
      const conflictClause = category_id
        ? 'ON CONFLICT (member_id, category_id, period)'
        : 'ON CONFLICT (member_id, budget_id)';

      const result = await query(
        `INSERT INTO spending_limits (member_id, category_id, budget_id, limit_amount, period, reset_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ${conflictClause}
         DO UPDATE SET limit_amount = $4, updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [id, category_id || null, budget_id || null, limit_amount, period, getResetDate(period)]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Set spending limit error:', error);
      res.status(500).json({ error: 'Failed to set spending limit' });
    }
  }
);

// Get spending report for a family member
router.get('/:id/spending', validateDateRange, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, month, year } = req.query;

    // Verify ownership
    const ownership = await query(
      'SELECT id FROM family_members WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    );

    if (ownership.rows.length === 0) {
      return res.status(404).json({ error: 'Family member not found' });
    }

    let dateFilter = '';
    const params: any[] = [id];

    if (startDate && endDate) {
      dateFilter = 'AND t.date BETWEEN $2 AND $3';
      params.push(startDate, endDate);
    } else if (month && year) {
      dateFilter = 'AND EXTRACT(MONTH FROM t.date) = $2 AND EXTRACT(YEAR FROM t.date) = $3';
      params.push(month, year);
    } else {
      // Default to current month
      dateFilter = "AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', CURRENT_DATE)";
    }

    const spending = await query(
      `SELECT
        c.name as category,
        c.color,
        COUNT(t.id) as transaction_count,
        SUM(ABS(t.amount)) as total_amount,
        AVG(ABS(t.amount)) as avg_amount
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.member_id = $1 AND t.type = 'expense' ${dateFilter}
       GROUP BY c.id, c.name, c.color
       ORDER BY total_amount DESC`,
      params
    );

    const totals = await query(
      `SELECT
        COUNT(*) as total_transactions,
        SUM(ABS(amount)) as total_spent
       FROM transactions
       WHERE member_id = $1 AND type = 'expense' ${dateFilter}`,
      params
    );

    res.json({
      spending: spending.rows,
      totals: totals.rows[0],
    });
  } catch (error) {
    logger.error('Get spending report error:', error);
    res.status(500).json({ error: 'Failed to fetch spending report' });
  }
});

// Helper functions
async function createAllowanceSchedule(memberId: string, amount: number, frequency: string) {
  const nextDate = calculateNextAllowanceDate(frequency);

  await query(
    `INSERT INTO allowance_transactions (member_id, amount, next_payment_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_id)
     DO UPDATE SET amount = $2, next_payment_date = $3, is_active = true`,
    [memberId, amount, nextDate]
  );
}

async function updateAllowanceSchedule(memberId: string, amount: number, frequency: string | null) {
  if (!frequency) {
    // Disable allowance if frequency is removed
    await query(
      'UPDATE allowance_transactions SET is_active = false WHERE member_id = $1',
      [memberId]
    );
    return;
  }

  const nextDate = calculateNextAllowanceDate(frequency);

  await query(
    `INSERT INTO allowance_transactions (member_id, amount, next_payment_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (member_id)
     DO UPDATE SET amount = $2, next_payment_date = $3, is_active = true`,
    [memberId, amount, nextDate]
  );
}

function calculateNextAllowanceDate(frequency: string): Date {
  const today = new Date();
  let nextDate = new Date();

  switch (frequency) {
    case 'weekly':
      nextDate.setDate(today.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(today.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(today.getMonth() + 1);
      break;
  }

  return nextDate;
}

function getResetDate(period: string): Date {
  const today = new Date();
  let resetDate = new Date();

  switch (period) {
    case 'daily':
      resetDate.setDate(today.getDate() + 1);
      resetDate.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      resetDate.setDate(today.getDate() + (7 - today.getDay()));
      resetDate.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      resetDate.setMonth(today.getMonth() + 1);
      resetDate.setDate(1);
      resetDate.setHours(0, 0, 0, 0);
      break;
  }

  return resetDate;
}

export default router;
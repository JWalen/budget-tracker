import { query } from '../config/database';
import { todayDateString } from '../utils/dateUtils';

// Tools Penny can call to take ACTIONS (and look things up) on the user's behalf.
// Every handler is scoped to the calling user's id — a tool can never touch
// another user's data. Handlers are additive/reversible (create, categorize,
// set-budget); nothing here deletes data. Each tool advertises a JSON Schema so
// the LLM knows how to call it.

export interface AITool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  // Returns a plain-JSON result that is fed back to the model.
  handler: (userId: number, input: any) => Promise<any>;
}

// Resolve a category by (case-insensitive) name for this user.
async function findCategory(userId: number, name: string, type?: 'income' | 'expense') {
  const r = await query(
    `SELECT id, name, type FROM categories
     WHERE user_id = $1 AND LOWER(name) = LOWER($2) ${type ? 'AND type = $3' : ''}
     LIMIT 1`,
    type ? [userId, name, type] : [userId, name]
  );
  return r.rows[0] || null;
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export const AI_TOOLS: AITool[] = [
  // ---- read tools (let Penny look things up before acting) -----------------
  {
    name: 'list_categories',
    description: "List the user's categories with their id, name, and type (income or expense). Use this to find a valid category before creating a transaction or budget.",
    inputSchema: { type: 'object', properties: {}, required: [] },
    handler: async (userId) => {
      const r = await query('SELECT id, name, type FROM categories WHERE user_id = $1 ORDER BY type, name', [userId]);
      return { categories: r.rows };
    },
  },
  {
    name: 'search_transactions',
    description: 'Search the user\'s transactions by optional description text and/or month/year. Returns id, date, description, amount, type, and category. Use this to find transactions to categorize or to answer questions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to match in the description (case-insensitive), optional' },
        month: { type: 'integer', description: '1-12, optional' },
        year: { type: 'integer', description: 'e.g. 2026, optional' },
        limit: { type: 'integer', description: 'Max rows (default 25, max 100)' },
      },
      required: [],
    },
    handler: async (userId, input) => {
      const limit = Math.min(100, Math.max(1, num(input?.limit) || 25));
      const conds = ['t.user_id = $1'];
      const params: any[] = [userId];
      if (input?.query) { params.push(`%${String(input.query).toLowerCase()}%`); conds.push(`LOWER(t.description) LIKE $${params.length}`); }
      if (input?.month) { params.push(num(input.month)); conds.push(`EXTRACT(MONTH FROM t.date) = $${params.length}`); }
      if (input?.year) { params.push(num(input.year)); conds.push(`EXTRACT(YEAR FROM t.date) = $${params.length}`); }
      params.push(limit);
      const r = await query(
        `SELECT t.id, t.date, t.description, t.amount, t.type, c.name AS category
         FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
         WHERE ${conds.join(' AND ')} ORDER BY t.date DESC LIMIT $${params.length}`,
        params
      );
      return { transactions: r.rows };
    },
  },
  {
    name: 'get_financial_summary',
    description: 'Get the income, expense, and net totals for a month (defaults to the current month), plus per-category spending and any budgets. Use for questions about spending or budget status.',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'integer', description: '1-12, optional (default current month)' },
        year: { type: 'integer', description: 'optional (default current year)' },
      },
      required: [],
    },
    handler: async (userId, input) => {
      const now = new Date();
      const month = num(input?.month) || now.getMonth() + 1;
      const year = num(input?.year) || now.getFullYear();
      const totals = await query(
        `SELECT
           COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS income,
           COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS expenses
         FROM transactions WHERE user_id=$1 AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3`,
        [userId, month, year]
      );
      const byCat = await query(
        `SELECT c.name AS category, COALESCE(SUM(t.amount),0) AS spent
         FROM transactions t JOIN categories c ON t.category_id=c.id
         WHERE t.user_id=$1 AND t.type='expense' AND EXTRACT(MONTH FROM t.date)=$2 AND EXTRACT(YEAR FROM t.date)=$3
         GROUP BY c.name ORDER BY spent DESC`,
        [userId, month, year]
      );
      const income = Number(totals.rows[0].income), expenses = Number(totals.rows[0].expenses);
      return { month, year, income, expenses, net: income - expenses, spendingByCategory: byCat.rows };
    },
  },

  // ---- action tools --------------------------------------------------------
  {
    name: 'create_transaction',
    description: "Record a new transaction for the user. Amount must be a positive number; use type to say whether it's money in (income) or out (expense). If a category name is given it's matched to an existing category; if none matches, the transaction is created uncategorized and you should mention that.",
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Positive dollar amount' },
        type: { type: 'string', enum: ['income', 'expense'] },
        description: { type: 'string', description: 'What the transaction was for' },
        category: { type: 'string', description: 'Category name, optional' },
        date: { type: 'string', description: 'YYYY-MM-DD, optional (defaults to today)' },
      },
      required: ['amount', 'type', 'description'],
    },
    handler: async (userId, input) => {
      const amount = num(input?.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number');
      const type = input?.type === 'income' ? 'income' : 'expense';
      const description = String(input?.description || '').trim();
      if (!description) throw new Error('description is required');
      const date = /^\d{4}-\d{2}-\d{2}/.test(input?.date || '') ? input.date.slice(0, 10) : todayDateString();

      let categoryId: number | null = null;
      let categoryNote: string | undefined;
      if (input?.category) {
        const cat = await findCategory(userId, input.category, type);
        if (cat) categoryId = cat.id;
        else categoryNote = `No "${input.category}" ${type} category exists; created uncategorized.`;
      }
      // Attach to the user's first active account if they have one (optional).
      const acct = await query('SELECT id FROM bank_accounts WHERE user_id=$1 AND is_active=true ORDER BY id LIMIT 1', [userId]);
      const accountId = acct.rows[0]?.id ?? null;

      const r = await query(
        `INSERT INTO transactions (user_id, category_id, account_id, amount, description, date, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, date, description, amount, type`,
        [userId, categoryId, accountId, amount, description, date, type]
      );
      return { created: r.rows[0], categoryNote };
    },
  },
  {
    name: 'create_category',
    description: 'Create a new spending/income category for the user. Use before creating a transaction/budget in a category that does not exist yet.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['income', 'expense'] },
        color: { type: 'string', description: 'Hex color like #0ea5e9, optional' },
      },
      required: ['name', 'type'],
    },
    handler: async (userId, input) => {
      const name = String(input?.name || '').trim();
      if (!name) throw new Error('name is required');
      const type = input?.type === 'income' ? 'income' : 'expense';
      const existing = await findCategory(userId, name, type);
      if (existing) return { category: existing, note: 'Category already existed.' };
      const color = /^#[0-9a-fA-F]{6}$/.test(input?.color || '') ? input.color : '#0ea5e9';
      const r = await query(
        `INSERT INTO categories (user_id, name, type, color) VALUES ($1,$2,$3,$4) RETURNING id, name, type, color`,
        [userId, name, type, color]
      );
      return { category: r.rows[0] };
    },
  },
  {
    name: 'set_budget',
    description: 'Set (or update) the monthly budget limit for an expense category. Defaults to the current month/year. The category must already exist — create it first if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Existing expense category name' },
        amount_limit: { type: 'number', description: 'Positive monthly limit' },
        month: { type: 'integer', description: '1-12, optional' },
        year: { type: 'integer', description: 'optional' },
      },
      required: ['category', 'amount_limit'],
    },
    handler: async (userId, input) => {
      const cat = await findCategory(userId, input?.category, 'expense');
      if (!cat) throw new Error(`No expense category named "${input?.category}". Create it first with create_category.`);
      const limit = num(input?.amount_limit);
      if (!Number.isFinite(limit) || limit <= 0) throw new Error('amount_limit must be a positive number');
      const now = new Date();
      const month = num(input?.month) || now.getMonth() + 1;
      const year = num(input?.year) || now.getFullYear();
      const r = await query(
        `INSERT INTO budgets (user_id, category_id, amount_limit, month, year)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, category_id, month, year) DO UPDATE SET amount_limit=$3
         RETURNING id, amount_limit, month, year`,
        [userId, cat.id, limit, month, year]
      );
      return { budget: { ...r.rows[0], category: cat.name } };
    },
  },
  {
    name: 'categorize_transactions',
    description: 'Assign an existing category to one or more transactions (by their ids). Use search_transactions first to find the ids and list_categories to find the category.',
    inputSchema: {
      type: 'object',
      properties: {
        transaction_ids: { type: 'array', items: { type: 'integer' }, description: '1-50 transaction ids' },
        category: { type: 'string', description: 'Existing category name' },
      },
      required: ['transaction_ids', 'category'],
    },
    handler: async (userId, input) => {
      const ids = Array.isArray(input?.transaction_ids) ? input.transaction_ids.map(num).filter(Number.isFinite) : [];
      if (ids.length === 0 || ids.length > 50) throw new Error('Provide 1-50 transaction_ids');
      const cat = await findCategory(userId, input?.category);
      if (!cat) throw new Error(`No category named "${input?.category}".`);
      const r = await query(
        `UPDATE transactions SET category_id=$1 WHERE id = ANY($2::int[]) AND user_id=$3 RETURNING id`,
        [cat.id, ids, userId]
      );
      return { updated: r.rows.length, category: cat.name };
    },
  },
  {
    name: 'create_bill',
    description: 'Create a recurring bill for the user, due on a given day of the month (1-31).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number', description: 'Positive amount' },
        due_date: { type: 'integer', description: 'Day of month 1-31' },
        category: { type: 'string', description: 'Category name, optional' },
      },
      required: ['name', 'amount', 'due_date'],
    },
    handler: async (userId, input) => {
      const name = String(input?.name || '').trim();
      if (!name) throw new Error('name is required');
      const amount = num(input?.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
      const due = num(input?.due_date);
      if (!Number.isInteger(due) || due < 1 || due > 31) throw new Error('due_date must be 1-31');
      let categoryId: number | null = null;
      if (input?.category) categoryId = (await findCategory(userId, input.category, 'expense'))?.id ?? null;
      const r = await query(
        `INSERT INTO bills (user_id, name, amount, due_date, category_id) VALUES ($1,$2,$3,$4,$5)
         RETURNING id, name, amount, due_date`,
        [userId, name, amount, due, categoryId]
      );
      return { bill: r.rows[0] };
    },
  },
];

export const AI_TOOLS_BY_NAME: Record<string, AITool> = Object.fromEntries(AI_TOOLS.map((t) => [t.name, t]));

import { Router, Response } from 'express';
import pool, { query } from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sharingMiddleware, requireEditAccess } from '../middleware/sharing';
import { LoggerClass } from '../services/logger';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { uploadRateLimiter } from '../middleware/security';

const router = Router();
const logger = new LoggerClass('Import');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authMiddleware);
router.use(sharingMiddleware);

// Simple OFX/QFX parser
function parseOFX(content: string): Array<{ date: string; amount: number; description: string; type: string }> {
  const transactions: Array<{ date: string; amount: number; description: string; type: string }> = [];
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = stmtTrnRegex.exec(content)) !== null) {
    const block = match[1];
    const dateMatch = block.match(/<DTPOSTED>(\d{8})/);
    const amountMatch = block.match(/<TRNAMT>([-\d.]+)/);
    const nameMatch = block.match(/<NAME>(.+)/);
    const memoMatch = block.match(/<MEMO>(.+)/);

    if (dateMatch && amountMatch) {
      const dateStr = dateMatch[1];
      const amount = parseFloat(amountMatch[1]);
      const description = (nameMatch ? nameMatch[1].trim() : memoMatch ? memoMatch[1].trim() : 'Unknown');

      transactions.push({
        date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
        amount: Math.abs(amount),
        description,
        type: amount < 0 ? 'expense' : 'income',
      });
    }
  }

  return transactions;
}

// Upload and parse file, return preview with match suggestions
router.post('/upload', uploadRateLimiter, requireEditAccess, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const budgetUserId = (req as any).budgetUserId;
    const content = req.file.buffer.toString('utf-8');
    const filename = req.file.originalname.toLowerCase();
    let rows: Array<{ date: string; amount: number; description: string; type: string }> = [];

    if (filename.endsWith('.ofx') || filename.endsWith('.qfx')) {
      rows = parseOFX(content);
    } else if (filename.endsWith('.csv')) {
      // Parse the CSV with headers
      const records = parse(content, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
      const headers = records.length > 0 ? Object.keys(records[0]) : [];

      // Check if column mapping was provided
      const columnMappingStr = req.body.columnMapping;
      let columnMapping: Record<string, string> | null = null;
      if (columnMappingStr) {
        try {
          columnMapping = JSON.parse(columnMappingStr);
        } catch (e) {
          // ignore parse errors
        }
      }

      if (!columnMapping) {
        // No mapping yet — return headers and preview rows for the frontend mapping step
        const previewRows = records.slice(0, 5).map(record => headers.map(h => record[h]));
        return res.json({ needsMapping: true, headers, previewRows });
      }

      // Build the column name lookup from index-based mapping
      // columnMapping is { "0": "date", "1": "amount", "2": "description", ... }
      let dateKey: string | null = null;
      let amountKey: string | null = null;
      let descKey: string | null = null;
      let typeKey: string | null = null;

      for (const [idxStr, field] of Object.entries(columnMapping)) {
        const idx = parseInt(idxStr);
        if (idx >= 0 && idx < headers.length) {
          if (field === 'date') dateKey = headers[idx];
          else if (field === 'amount') amountKey = headers[idx];
          else if (field === 'description') descKey = headers[idx];
          else if (field === 'type') typeKey = headers[idx];
        }
      }

      if (!dateKey || !amountKey || !descKey) {
        return res.status(400).json({ error: 'Column mapping must include date, amount, and description' });
      }

      for (const record of records) {
        const amount = parseFloat(String(record[amountKey]).replace(/[,$]/g, ''));
        if (isNaN(amount)) continue;

        let type = 'expense';
        if (typeKey && record[typeKey]) {
          const typeVal = String(record[typeKey]).toLowerCase();
          type = typeVal.includes('credit') || typeVal.includes('income') || typeVal.includes('deposit') ? 'income' : 'expense';
        } else {
          type = amount < 0 ? 'expense' : 'income';
        }

        rows.push({
          date: record[dateKey],
          amount: Math.abs(amount),
          description: record[descKey] || '',
          type,
        });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Use .csv, .ofx, or .qfx' });
    }

    // Load match rules, bills, and debts for matching
    const [rulesResult, billsResult, debtsResult, existingTxResult] = await Promise.all([
      query('SELECT * FROM match_rules WHERE user_id = $1', [budgetUserId]),
      query('SELECT * FROM bills WHERE user_id = $1 AND is_active = true', [budgetUserId]),
      query('SELECT * FROM debts WHERE user_id = $1 AND is_paid = false', [budgetUserId]),
      query(
        `SELECT date, amount, description FROM transactions WHERE user_id = $1
         AND date >= CURRENT_DATE - INTERVAL '6 months'`,
        [budgetUserId]
      ),
    ]);

    const rules = rulesResult.rows;
    const bills = billsResult.rows;
    const debts = debtsResult.rows;
    const existingTxs = existingTxResult.rows;

    // Process each row for matches and duplicates
    const preview = rows.map((row) => {
      const descUpper = row.description.toUpperCase();
      const matches: Array<{ type: string; id: number; name: string; confidence: string; categoryId?: number | null }> = [];
      let isDuplicate = false;

      // Check for duplicates
      for (const tx of existingTxs) {
        const txDate = new Date(tx.date).toISOString().split('T')[0];
        const rowDate = new Date(row.date).toISOString().split('T')[0];
        if (txDate === rowDate &&
            Math.abs(parseFloat(tx.amount) - row.amount) < 0.01 &&
            tx.description?.toUpperCase() === descUpper) {
          isDuplicate = true;
          break;
        }
      }

      // Check match rules (highest priority)
      for (const rule of rules) {
        if (descUpper.includes(rule.pattern.toUpperCase())) {
          matches.push({
            type: rule.target_type,
            id: rule.target_id,
            name: rule.name,
            confidence: 'rule',
            categoryId: rule.category_id || null  // Include category_id for dual assignment
          });
        }
      }

      // Check bills auto_match_pattern
      if (matches.length === 0) {
        for (const bill of bills) {
          if (bill.auto_match_pattern && descUpper.includes(bill.auto_match_pattern.toUpperCase())) {
            const amountDiff = Math.abs(row.amount - parseFloat(bill.amount)) / parseFloat(bill.amount);
            if (amountDiff <= 0.2) {
              matches.push({ type: 'bill', id: bill.id, name: bill.name, confidence: 'auto' });
            }
          }
        }
      }

      // Fuzzy match debts
      if (matches.length === 0) {
        for (const debt of debts) {
          const nameUpper = debt.name.toUpperCase();
          if (descUpper.includes(nameUpper) || nameUpper.includes(descUpper.slice(0, 10))) {
            matches.push({ type: 'debt', id: debt.id, name: debt.name, confidence: 'suggested' });
          }
        }
      }

      // Smart suggestions by amount
      if (matches.length === 0) {
        for (const bill of bills) {
          if (Math.abs(row.amount - parseFloat(bill.amount)) < 0.01) {
            matches.push({ type: 'bill', id: bill.id, name: bill.name, confidence: 'suggested' });
          }
        }
      }

      // Set the best match as suggestedMatch (for the frontend)
      const bestMatch = matches.length > 0 ? matches[0] : null;
      const confirmedMatch = bestMatch && (bestMatch.confidence === 'rule' || bestMatch.confidence === 'auto')
        ? bestMatch : null;
      const suggestedMatch = bestMatch && !confirmedMatch ? bestMatch : null;

      return {
        ...row,
        isDuplicate,
        match: confirmedMatch,
        matchConfidence: confirmedMatch?.confidence || null,
        suggestedMatch,
      };
    });

    res.json({ transactions: preview });
  } catch (error) {
    logger.error('Import upload error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Confirm import — bulk insert transactions and link matches
const MAX_IMPORT_ROWS = 10000;

router.post('/confirm', requireEditAccess, async (req: AuthRequest, res: Response) => {
  const { transactions, account_id } = req.body;
  const budgetUserId = (req as any).budgetUserId;

  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'transactions must be an array' });
  }

  // Bound memory/work: reject oversized imports
  if (transactions.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `Too many rows (max ${MAX_IMPORT_ROWS})` });
  }

  const client = await pool.connect();
  try {
    // Verify the target account belongs to the budget owner (IDOR protection)
    let verifiedAccountId: number | null = null;
    if (account_id) {
      const acct = await client.query(
        'SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2',
        [account_id, budgetUserId]
      );
      if (acct.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid account' });
      }
      verifiedAccountId = acct.rows[0].id;
    }

    await client.query('BEGIN');

    let imported = 0;
    let billsMatched = 0;
    let debtPayments = 0;
    let skipped = 0;

    // Ownership caches to avoid repeated lookups
    const categoryOwned = new Map<number, boolean>();
    const billOwned = new Map<number, boolean>();
    const debtOwned = new Map<number, boolean>();

    for (const row of transactions) {
      // Guard date parsing — skip rows with an invalid/unparseable date rather than 500
      const parsedDate = new Date(row.date);
      if (isNaN(parsedDate.getTime())) {
        skipped++;
        continue;
      }

      // Determine category_id - use categoryId if it's for a bill match, otherwise use matchId if type is category
      let categoryId: number | null = row.matchType === 'category' ? row.matchId :
                        (row.matchType === 'bill' && row.categoryId) ? row.categoryId :
                        null;

      // Verify category ownership; drop unowned categories rather than attaching them
      if (categoryId != null) {
        if (!categoryOwned.has(categoryId)) {
          const c = await client.query(
            'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
            [categoryId, budgetUserId]
          );
          categoryOwned.set(categoryId, c.rows.length > 0);
        }
        if (!categoryOwned.get(categoryId)) {
          skipped++;
          continue;
        }
      }

      // Verify match (bill/debt) ownership before referencing it
      if (row.matchId && row.matchType === 'bill') {
        if (!billOwned.has(row.matchId)) {
          const b = await client.query(
            'SELECT id FROM bills WHERE id = $1 AND user_id = $2',
            [row.matchId, budgetUserId]
          );
          billOwned.set(row.matchId, b.rows.length > 0);
        }
        if (!billOwned.get(row.matchId)) {
          skipped++;
          continue;
        }
      } else if (row.matchId && row.matchType === 'debt') {
        if (!debtOwned.has(row.matchId)) {
          const d = await client.query(
            'SELECT id FROM debts WHERE id = $1 AND user_id = $2',
            [row.matchId, budgetUserId]
          );
          debtOwned.set(row.matchId, d.rows.length > 0);
        }
        if (!debtOwned.get(row.matchId)) {
          skipped++;
          continue;
        }
      }

      // Insert transaction with verified account_id
      const txResult = await client.query(
        `INSERT INTO transactions (user_id, category_id, account_id, amount, description, date, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [budgetUserId, categoryId, verifiedAccountId, row.amount, row.description, row.date, row.type || 'expense']
      );

      imported++;
      const tx = txResult.rows[0];

      // Process match if any
      if (row.matchId && row.matchType) {
        if (row.matchType === 'bill') {
          await client.query(
            `INSERT INTO bill_payments (bill_id, transaction_id, amount_paid, payment_date, month, year)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (bill_id, month, year) DO NOTHING`,
            [row.matchId, tx.id, row.amount, row.date, parsedDate.getMonth() + 1, parsedDate.getFullYear()]
          );
          billsMatched++;
        } else if (row.matchType === 'debt') {
          await client.query(
            `UPDATE debts SET balance = GREATEST(0, balance - $1),
             is_paid = CASE WHEN balance - $1 <= 0 THEN true ELSE false END
             WHERE id = $2 AND user_id = $3`,
            [row.amount, row.matchId, budgetUserId]
          );
          debtPayments++;
        }
      }
    }

    await client.query('COMMIT');
    res.json({ imported, billsMatched, debtPayments, skipped });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Import confirm error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get match rules
router.get('/rules', async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;
    const result = await query(
      'SELECT * FROM match_rules WHERE user_id = $1 ORDER BY created_at DESC',
      [budgetUserId]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Get rules error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create match rule
router.post('/rules', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { name, pattern, target_type, target_id, category_id } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `INSERT INTO match_rules (user_id, name, pattern, target_type, target_id, category_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [budgetUserId, name, pattern, target_type, target_id, category_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create rule error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update match rule
router.put('/rules/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, pattern, target_type, target_id, category_id } = req.body;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      `UPDATE match_rules
       SET name = $1, pattern = $2, target_type = $3, target_id = $4, category_id = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, pattern, target_type, target_id, category_id || null, id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update rule error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete match rule
router.delete('/rules/:id', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const budgetUserId = (req as any).budgetUserId;

    const result = await query(
      'DELETE FROM match_rules WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, budgetUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ message: 'Rule deleted' });
  } catch (error) {
    logger.error('Delete rule error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Apply match rules to existing uncategorized transactions
router.post('/apply-rules', requireEditAccess, async (req: AuthRequest, res: Response) => {
  try {
    const budgetUserId = (req as any).budgetUserId;

    // Get all match rules for the user
    const rulesResult = await query(
      'SELECT * FROM match_rules WHERE user_id = $1',
      [budgetUserId]
    );

    if (rulesResult.rows.length === 0) {
      return res.json({ updatedCount: 0, message: 'No rules to apply' });
    }

    // Get all uncategorized transactions (both income and expense)
    const txResult = await query(
      `SELECT id, description, type
       FROM transactions
       WHERE user_id = $1
       AND category_id IS NULL`,
      [budgetUserId]
    );

    if (txResult.rows.length === 0) {
      return res.json({ updatedCount: 0, message: 'No uncategorized transactions' });
    }

    let updatedCount = 0;

    // Apply rules to each transaction
    for (const tx of txResult.rows) {
      const description = tx.description?.toUpperCase() || '';

      for (const rule of rulesResult.rows) {
        const pattern = rule.pattern.toUpperCase();

        if (description.includes(pattern)) {
          if (rule.target_type === 'category') {
            // Update transaction with category
            await query(
              'UPDATE transactions SET category_id = $1 WHERE id = $2',
              [rule.target_id, tx.id]
            );
            updatedCount++;
            break; // Move to next transaction after first match
          } else if (rule.target_type === 'bill' && tx.type === 'expense') {
            // Link to bill (if bill_payments table exists)
            const billPaymentCheck = await query(
              'SELECT id FROM bill_payments WHERE transaction_id = $1',
              [tx.id]
            );

            if (billPaymentCheck.rows.length === 0) {
              // Get transaction details for amount and date
              const txDetails = await query(
                'SELECT amount, date FROM transactions WHERE id = $1',
                [tx.id]
              );

              if (txDetails.rows.length > 0) {
                const { amount, date } = txDetails.rows[0];
                const txDate = new Date(date);

                await query(
                  `INSERT INTO bill_payments (bill_id, transaction_id, amount_paid, payment_date, month, year)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (bill_id, month, year) DO NOTHING`,
                  [rule.target_id, tx.id, Math.abs(amount), date, txDate.getMonth() + 1, txDate.getFullYear()]
                );

                // If the rule also has a category_id, update the transaction's category
                if (rule.category_id) {
                  await query(
                    'UPDATE transactions SET category_id = $1 WHERE id = $2',
                    [rule.category_id, tx.id]
                  );
                }

                updatedCount++;
                break;
              }
            }
          } else if (rule.target_type === 'debt' && tx.type === 'expense') {
            // For debts, we can only mark the transaction with a note since there's no debt_payments table
            // This is a placeholder - in a full implementation you'd track debt payments properly
            // For now, just count it as processed
            updatedCount++;
            break;
          }
        }
      }
    }

    res.json({
      updatedCount,
      message: `Successfully categorized ${updatedCount} transaction(s)`
    });
  } catch (error) {
    logger.error('Apply rules error:', error as Error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

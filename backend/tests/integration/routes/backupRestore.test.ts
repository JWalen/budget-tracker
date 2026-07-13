import request from 'supertest';
import express from 'express';
import backupScheduleRoutes, { createUserBackup } from '../../../src/routes/backupSchedule';
import { query } from '../../../src/config/database';
import { cleanDatabase, createTestUser, createTestCategory, createTestTransaction, getAuthToken } from '../../helpers';

const app = express();
app.use(express.json());
app.use('/api/backup', backupScheduleRoutes);

// End-to-end validation of the download → restore round-trip: the file the app
// downloads (createUserBackup JSON) must be restorable via POST /backup/restore.
describe('Backup download → restore round-trip', () => {
  let userId: number;
  let token: string;
  let categoryId: number;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    token = getAuthToken(userId);
    categoryId = (await createTestCategory(userId, 'expense')).id;
    await createTestTransaction(userId, categoryId, { description: 'Coffee at Blue Bottle', amount: 4.5 });
    await createTestTransaction(userId, categoryId, { description: 'Groceries', amount: 62.1 });
  });

  it('restores categories and transactions from a downloaded JSON backup', async () => {
    // 1. Build the exact payload the app downloads.
    const backup = await createUserBackup(userId);
    const fileBuf = Buffer.from(JSON.stringify(backup), 'utf-8');

    // 2. Simulate data loss.
    await query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    await query('DELETE FROM categories WHERE user_id = $1', [userId]);
    const gone = await query('SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1', [userId]);
    expect(gone.rows[0].n).toBe(0);

    // 3. Restore via the same multipart upload the UI uses.
    const res = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fileBuf, 'backup.json');

    expect(res.status).toBe(200);

    // 4. The data is back, and the transaction is re-linked to its category
    //    (FK remapped to the newly-inserted category id).
    const cats = await query('SELECT id, name FROM categories WHERE user_id = $1', [userId]);
    expect(cats.rows.length).toBe(1);
    const txs = await query('SELECT description, amount, category_id FROM transactions WHERE user_id = $1 ORDER BY description', [userId]);
    expect(txs.rows.map((t: any) => t.description)).toEqual(['Coffee at Blue Bottle', 'Groceries']);
    expect(txs.rows.every((t: any) => t.category_id === cats.rows[0].id)).toBe(true);
  });

  it('is idempotent — restoring the same backup twice does not duplicate rows', async () => {
    const backup = await createUserBackup(userId);
    const fileBuf = Buffer.from(JSON.stringify(backup), 'utf-8');

    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/api/backup/restore')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', fileBuf, 'backup.json');
      expect(res.status).toBe(200);
    }

    const txs = await query('SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1', [userId]);
    expect(txs.rows[0].n).toBe(2); // not 4
  });

  it('restores account-linked transactions and transfers without FK errors', async () => {
    const a = await query(`INSERT INTO bank_accounts (user_id, name, account_type) VALUES ($1,'Checking','checking') RETURNING id`, [userId]);
    const b = await query(`INSERT INTO bank_accounts (user_id, name, account_type) VALUES ($1,'Savings','savings') RETURNING id`, [userId]);
    const accA = a.rows[0].id, accB = b.rows[0].id;
    await query(`INSERT INTO transactions (user_id, category_id, account_id, amount, description, date, type) VALUES ($1,$2,$3,20,'Gas',CURRENT_DATE,'expense')`, [userId, categoryId, accA]);
    await query(`INSERT INTO transactions (user_id, account_id, transfer_account_id, amount, description, date, type) VALUES ($1,$2,$3,100,'To savings',CURRENT_DATE,'transfer')`, [userId, accA, accB]);

    const backup = await createUserBackup(userId);
    const fileBuf = Buffer.from(JSON.stringify(backup), 'utf-8');

    await query('DELETE FROM transactions WHERE user_id = $1', [userId]); // accounts remain

    const res = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fileBuf, 'backup.json');
    expect(res.status).toBe(200);

    // Restore rebuilds bank_accounts too, so links point at the REMAPPED ids
    // (looked up by name), not the originals.
    const checkingId = (await query(`SELECT id FROM bank_accounts WHERE user_id = $1 AND name = 'Checking'`, [userId])).rows[0].id;
    const savingsId = (await query(`SELECT id FROM bank_accounts WHERE user_id = $1 AND name = 'Savings'`, [userId])).rows[0].id;

    const gas = await query(`SELECT account_id FROM transactions WHERE user_id = $1 AND description = 'Gas'`, [userId]);
    expect(gas.rows.length).toBe(1);
    expect(gas.rows[0].account_id).toBe(checkingId);

    const xfer = await query(`SELECT account_id, transfer_account_id FROM transactions WHERE user_id = $1 AND type = 'transfer'`, [userId]);
    expect(xfer.rows.length).toBe(1);
    expect(xfer.rows[0].account_id).toBe(checkingId);
    expect(xfer.rows[0].transfer_account_id).toBe(savingsId);
  });

  it('fully restores bank accounts and family members onto a wiped database', async () => {
    // Build a rich dataset: two accounts (one linked to an expense + a transfer),
    // a family member with an allowance and a spending limit.
    const a = await query(`INSERT INTO bank_accounts (user_id,name,account_type,balance) VALUES ($1,'Checking','checking',500) RETURNING id`, [userId]);
    const b = await query(`INSERT INTO bank_accounts (user_id,name,account_type) VALUES ($1,'Savings','savings') RETURNING id`, [userId]);
    const accA = a.rows[0].id, accB = b.rows[0].id;
    await query(`INSERT INTO transactions (user_id,category_id,account_id,amount,description,date,type) VALUES ($1,$2,$3,20,'Gas',CURRENT_DATE,'expense')`, [userId, categoryId, accA]);
    await query(`INSERT INTO transactions (user_id,account_id,transfer_account_id,amount,description,date,type) VALUES ($1,$2,$3,100,'To savings',CURRENT_DATE,'transfer')`, [userId, accA, accB]);
    const m = await query(`INSERT INTO family_members (user_id,name,role) VALUES ($1,'Kid','child') RETURNING id`, [userId]);
    const memId = m.rows[0].id;
    await query(`INSERT INTO allowance_transactions (member_id,amount,next_payment_date) VALUES ($1,10,CURRENT_DATE)`, [memId]);
    await query(`INSERT INTO spending_limits (member_id,category_id,limit_amount,period) VALUES ($1,$2,50,'weekly')`, [memId, categoryId]);
    await query(`INSERT INTO account_balances (account_id,balance,date) VALUES ($1,500,CURRENT_DATE)`, [accA]);

    const backup = await createUserBackup(userId);
    const fileBuf = Buffer.from(JSON.stringify(backup), 'utf-8');

    // Wipe EVERYTHING (fresh-machine simulation), children before parents.
    await query(`DELETE FROM account_balances ab USING bank_accounts ba WHERE ab.account_id=ba.id AND ba.user_id=$1`, [userId]);
    await query(`DELETE FROM spending_limits sl USING family_members fm WHERE sl.member_id=fm.id AND fm.user_id=$1`, [userId]);
    await query(`DELETE FROM allowance_transactions at USING family_members fm WHERE at.member_id=fm.id AND fm.user_id=$1`, [userId]);
    await query('DELETE FROM transactions WHERE user_id=$1', [userId]);
    await query('DELETE FROM bank_accounts WHERE user_id=$1', [userId]);
    await query('DELETE FROM family_members WHERE user_id=$1', [userId]);
    await query('DELETE FROM categories WHERE user_id=$1', [userId]);

    const res = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fileBuf, 'backup.json');
    expect(res.status).toBe(200);

    // Accounts back
    const accts = await query('SELECT name FROM bank_accounts WHERE user_id=$1 ORDER BY name', [userId]);
    expect(accts.rows.map((r: any) => r.name)).toEqual(['Checking', 'Savings']);
    // Family member + its children back
    const mem = await query('SELECT id, name FROM family_members WHERE user_id=$1', [userId]);
    expect(mem.rows.length).toBe(1);
    const newMemId = mem.rows[0].id;
    const allow = await query('SELECT amount FROM allowance_transactions WHERE member_id=$1', [newMemId]);
    expect(allow.rows.length).toBe(1);
    const lim = await query('SELECT limit_amount FROM spending_limits WHERE member_id=$1', [newMemId]);
    expect(lim.rows.length).toBe(1);
    // Transfer restored and re-linked to the NEW account ids (remapped, not the old ones)
    const xfer = await query(`SELECT t.account_id, t.transfer_account_id FROM transactions t WHERE t.user_id=$1 AND t.type='transfer'`, [userId]);
    expect(xfer.rows.length).toBe(1);
    const checkingId = (await query(`SELECT id FROM bank_accounts WHERE user_id=$1 AND name='Checking'`, [userId])).rows[0].id;
    const savingsId = (await query(`SELECT id FROM bank_accounts WHERE user_id=$1 AND name='Savings'`, [userId])).rows[0].id;
    expect(xfer.rows[0].account_id).toBe(checkingId);
    expect(xfer.rows[0].transfer_account_id).toBe(savingsId);
    // account_balances re-linked
    const bal = await query(`SELECT ab.balance FROM account_balances ab WHERE ab.account_id=$1`, [checkingId]);
    expect(bal.rows.length).toBe(1);
  });

  it('rejects a file that is not a valid backup', async () => {
    const res = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('this is not a backup', 'utf-8'), 'bad.json');
    expect(res.status).toBe(400);
  });
});

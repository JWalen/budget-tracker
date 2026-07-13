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

    const gas = await query(`SELECT account_id FROM transactions WHERE user_id = $1 AND description = 'Gas'`, [userId]);
    expect(gas.rows.length).toBe(1);
    expect(gas.rows[0].account_id).toBe(accA); // account still exists → link preserved

    const xfer = await query(`SELECT account_id, transfer_account_id FROM transactions WHERE user_id = $1 AND type = 'transfer'`, [userId]);
    expect(xfer.rows.length).toBe(1);
    expect(xfer.rows[0].account_id).toBe(accA);
    expect(xfer.rows[0].transfer_account_id).toBe(accB);
  });

  it('rejects a file that is not a valid backup', async () => {
    const res = await request(app)
      .post('/api/backup/restore')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('this is not a backup', 'utf-8'), 'bad.json');
    expect(res.status).toBe(400);
  });
});

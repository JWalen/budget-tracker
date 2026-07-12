import { createUserBackup, createFullBackup } from '../../../src/routes/backupSchedule';
import { cleanDatabase, createTestUser, createTestCategory, createTestTransaction } from '../../helpers';

// Guards the backup builders against the schema-drift bug that made admin backups
// fail ("Failed to create backup"): createFullBackup selected users.currency /
// users.updated_at, columns that don't exist on the shipped schema.
describe('Backup builders', () => {
  let userId: number;

  beforeEach(async () => {
    await cleanDatabase();
    const user = await createTestUser();
    userId = user.id;
    const cat = await createTestCategory(userId, 'expense');
    await createTestTransaction(userId, cat.id, { description: 'Coffee' });
  });

  it('createUserBackup includes the user\'s data and never throws', async () => {
    const backup = await createUserBackup(userId);
    expect(backup.data).toBeDefined();
    expect(Array.isArray(backup.data.categories)).toBe(true);
    expect(backup.data.transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('createFullBackup succeeds and excludes secret columns', async () => {
    const backup = await createFullBackup();
    expect(backup.is_full_backup).toBe(true);
    expect(Array.isArray(backup.data.users)).toBe(true);
    const sampleUser = backup.data.users[0] || {};
    // Non-secret projection only.
    expect(sampleUser).not.toHaveProperty('password_hash');
    expect(sampleUser).not.toHaveProperty('mfa_secret');
    expect(sampleUser).toHaveProperty('email');
  });
});

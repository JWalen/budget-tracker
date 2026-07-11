import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only-do-not-use-in-production';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing-only-do-not-use-in-prod';
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || 'postgresql://budget_user:budget_pass@localhost:5432/budget_test';

// Disable logging during tests
process.env.LOG_TO_CONSOLE = 'false';
process.env.LOG_TO_FILE = 'false';

// Global test timeout
jest.setTimeout(15000);

// Mock external services
jest.mock('../src/services/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  emailTemplates: {
    budgetShareInvite: jest.fn().mockReturnValue({
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: 'Test',
    }),
  },
}));

// Clean up after all tests
afterAll(async () => {
  // Close database connections
  await new Promise(resolve => setTimeout(resolve, 500));
});

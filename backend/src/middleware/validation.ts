import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

// Validation error handler
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Common validators
export const validators = {
  // User authentication
  register: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password')
      .isLength({ min: 12 })
      .withMessage('Password must be at least 12 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number, and special character'),
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
    handleValidationErrors,
  ],

  login: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
    handleValidationErrors,
  ],

  // Transaction validators
  transaction: [
    body('description').trim().isLength({ min: 1, max: 500 }).withMessage('Description required (max 500 chars)'),
    body('amount')
      .isFloat({ min: 0.01, max: 999999999.99 })
      .withMessage('Amount must be between 0.01 and 999,999,999.99'),
    body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
    body('date').isISO8601().toDate().withMessage('Valid date required'),
    body('category_id').optional().isInt({ min: 1 }).withMessage('Invalid category ID'),
    body('account_id').optional().isInt({ min: 1 }).withMessage('Invalid account ID'),
    handleValidationErrors,
  ],

  // Budget validators
  budget: [
    body('category_id').isInt({ min: 1 }).withMessage('Valid category ID required'),
    body('amount')
      .isFloat({ min: 0, max: 999999999.99 })
      .withMessage('Budget amount must be between 0 and 999,999,999.99'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be between 2020 and 2100'),
    handleValidationErrors,
  ],

  // Category validators
  category: [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Category name required (max 100 chars)'),
    body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
    body('color').matches(/^#[0-9A-F]{6}$/i).withMessage('Valid hex color required'),
    body('icon').optional().isLength({ max: 50 }).withMessage('Icon name too long'),
    handleValidationErrors,
  ],

  // Date range validators
  dateRange: [
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be 1-12'),
    query('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Invalid year'),
    handleValidationErrors,
  ],

  // ID parameter validator
  idParam: [
    param('id').isInt({ min: 1 }).withMessage('Valid ID required'),
    handleValidationErrors,
  ],

  // Pagination validators
  pagination: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    handleValidationErrors,
  ],

  // Email validator
  email: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    handleValidationErrors,
  ],

  // Import validators
  importConfig: [
    body('columnMapping').isObject().withMessage('Column mapping required'),
    body('dateFormat').optional().isIn(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).withMessage('Invalid date format'),
    handleValidationErrors,
  ],

  // Account validators
  account: [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Account name required (max 100 chars)'),
    body('account_type').isIn(['checking', 'savings', 'credit', 'investment', 'other']).withMessage('Invalid account type'),
    body('institution').optional().trim().isLength({ max: 100 }).withMessage('Institution name too long'),
    body('account_number_last4').optional().matches(/^\d{4}$/).withMessage('Last 4 digits must be exactly 4 numbers'),
    body('balance').optional().isFloat({ min: -999999999.99, max: 999999999.99 }).withMessage('Invalid balance'),
    body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Invalid hex color'),
    handleValidationErrors,
  ],

  // Sharing validators
  sharing: [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('role').isIn(['view', 'edit']).withMessage('Role must be view or edit'),
    handleValidationErrors,
  ],

  // Bill validators
  bill: [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Bill name required (max 100 chars)'),
    body('amount').isFloat({ min: 0.01, max: 999999999.99 }).withMessage('Invalid amount'),
    body('due_day').isInt({ min: 1, max: 31 }).withMessage('Due day must be 1-31'),
    body('category_id').optional().isInt({ min: 1 }).withMessage('Invalid category ID'),
    handleValidationErrors,
  ],

  // Debt validators
  debt: [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Debt name required'),
    body('initial_amount').isFloat({ min: 0.01, max: 999999999.99 }).withMessage('Invalid initial amount'),
    body('current_balance').isFloat({ min: 0, max: 999999999.99 }).withMessage('Invalid current balance'),
    body('interest_rate').optional().isFloat({ min: 0, max: 100 }).withMessage('Interest rate must be 0-100%'),
    body('minimum_payment').optional().isFloat({ min: 0 }).withMessage('Invalid minimum payment'),
    handleValidationErrors,
  ],
};

// Custom validators for complex validations
export const validateDateRange = (req: Request, res: Response, next: NextFunction) => {
  const { startDate, endDate } = req.query;

  if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (start > end) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }

    // Check if date range is too large (more than 1 year)
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 366) {
      return res.status(400).json({ error: 'Date range cannot exceed 1 year' });
    }
  }

  next();
};

// Validate amount based on transaction type
export const validateTransactionAmount = (req: Request, res: Response, next: NextFunction) => {
  const { type, amount } = req.body;

  if (type && amount) {
    const numAmount = parseFloat(amount);

    // Ensure expense amounts are negative and income amounts are positive
    if (type === 'expense' && numAmount > 0) {
      req.body.amount = -Math.abs(numAmount);
    } else if (type === 'income' && numAmount < 0) {
      req.body.amount = Math.abs(numAmount);
    }
  }

  next();
};

// Validate budget doesn't exceed reasonable limits
export const validateBudgetLimit = (req: Request, res: Response, next: NextFunction) => {
  const { amount } = req.body;

  if (amount && parseFloat(amount) > 1000000) {
    return res.status(400).json({
      error: 'Budget amount exceeds maximum limit of $1,000,000. Please contact support for higher limits.'
    });
  }

  next();
};
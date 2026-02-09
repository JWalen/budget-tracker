-- Fix missing columns and tables for the budget tracker application

-- Add account_id to transactions if it doesn't exist
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;

-- Add category_id to match_rules if it doesn't exist
ALTER TABLE match_rules
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- Create account_balances table for tracking historical balances
CREATE TABLE IF NOT EXISTS account_balances (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    balance DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, date)
);

-- Create family_members table for family budget tracking
CREATE TABLE IF NOT EXISTS family_members (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('parent', 'spouse', 'child', 'other')),
    email VARCHAR(255) UNIQUE,
    birth_date DATE,
    allowance_amount DECIMAL(10, 2),
    allowance_frequency VARCHAR(20) CHECK (allowance_frequency IN ('weekly', 'biweekly', 'monthly', NULL)),
    spending_limit DECIMAL(10, 2),
    avatar_color VARCHAR(7) DEFAULT '#0ea5e9',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spending_limits table for category-specific limits per family member
CREATE TABLE IF NOT EXISTS spending_limits (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE,
    limit_amount DECIMAL(10, 2) NOT NULL,
    period VARCHAR(20) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
    current_spent DECIMAL(10, 2) DEFAULT 0,
    reset_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, category_id, period),
    UNIQUE(member_id, budget_id)
);

-- Create spending_alerts table for notifications
CREATE TABLE IF NOT EXISTS spending_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id INTEGER REFERENCES family_members(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    budget_id INTEGER REFERENCES budgets(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('budget_50', 'budget_75', 'budget_90', 'budget_exceeded', 'limit_reached', 'unusual_spending')),
    threshold_amount DECIMAL(10, 2),
    current_amount DECIMAL(10, 2),
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create approval_requests table for child spending approvals
CREATE TABLE IF NOT EXISTS approval_requests (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    transaction_data JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    reason TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '48 hours')
);

-- Add member_id to transactions for tracking who made the purchase
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL;

-- Create allowance_transactions table for automatic allowances
CREATE TABLE IF NOT EXISTS allowance_transactions (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    next_payment_date DATE NOT NULL,
    last_payment_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_budget_shares_shared ON budget_shares(shared_with_id, status);
CREATE INDEX IF NOT EXISTS idx_categories_user_type ON categories(user_id, type);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month, year);
CREATE INDEX IF NOT EXISTS idx_spending_alerts_user ON spending_alerts(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status, expires_at);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_family_members_updated_at BEFORE UPDATE ON family_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_spending_limits_updated_at BEFORE UPDATE ON spending_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
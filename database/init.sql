-- Users table with MFA support
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    mfa_secret VARCHAR(255),
    mfa_enabled BOOLEAN DEFAULT false,
    is_admin BOOLEAN DEFAULT false,
    active_sessions INTEGER DEFAULT 0,
    last_login TIMESTAMP,
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens for session management
CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

-- Login attempts for rate limiting
CREATE TABLE login_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, created_at);

-- Categories table (fully customizable per user)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    color VARCHAR(7) DEFAULT '#6366f1',
    icon VARCHAR(50) DEFAULT 'tag',
    exclude_from_income BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_user_type ON categories(user_id, type);

-- Bank accounts table
CREATE TABLE bank_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    account_number_last4 VARCHAR(4),
    institution VARCHAR(100),
    balance DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(7) DEFAULT '#0ea5e9',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bank_accounts_user_id ON bank_accounts(user_id);

-- Account balance history for tracking
CREATE TABLE account_balances (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    balance DECIMAL(10,2) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, date)
);

-- Family members table for family budget tracking
CREATE TABLE family_members (
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

-- Transactions table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
    member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description VARCHAR(255),
    date DATE NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_user_type ON transactions(user_id, type);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_member ON transactions(member_id);

-- Budgets table (optional limits per category per month)
CREATE TABLE budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    amount_limit DECIMAL(12, 2) NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, category_id, month, year)
);

CREATE INDEX idx_budgets_user_period ON budgets(user_id, year, month);
CREATE INDEX idx_budgets_user_month ON budgets(user_id, month, year);

-- Recurring transactions table
CREATE TABLE recurring_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description VARCHAR(255),
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'yearly')),
    next_date DATE NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recurring_next_date ON recurring_transactions(next_date, active);

-- Debts table
CREATE TABLE debts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('owe', 'owed', 'loan', 'credit_card')),
    balance DECIMAL(12, 2) NOT NULL,
    original_amount DECIMAL(12, 2),
    interest_rate DECIMAL(5, 2),
    minimum_payment DECIMAL(12, 2),
    due_date INTEGER CHECK (due_date >= 1 AND due_date <= 31),
    contact VARCHAR(255),
    notes TEXT,
    is_paid BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_debts_user ON debts(user_id, is_paid);

-- Bills table
CREATE TABLE bills (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    due_date INTEGER NOT NULL CHECK (due_date >= 1 AND due_date <= 31),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    auto_match_pattern VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bills_user ON bills(user_id, is_active);

-- Bill payments table
CREATE TABLE bill_payments (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    amount_paid DECIMAL(12, 2) NOT NULL,
    payment_date DATE NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bill_id, month, year)
);

CREATE INDEX idx_bill_payments_bill ON bill_payments(bill_id, year, month);

-- Match rules for bank import auto-matching
CREATE TABLE match_rules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    pattern VARCHAR(255) NOT NULL,
    target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('bill', 'debt', 'category')),
    target_id INTEGER NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_match_rules_user ON match_rules(user_id);

-- Pay periods (income buckets for bill assignment)
CREATE TABLE pay_periods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    frequency VARCHAR(20) CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'semimonthly')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pay_periods_user_date ON pay_periods(user_id, date);

-- Bill assignments to pay periods
CREATE TABLE pay_period_bills (
    id SERIAL PRIMARY KEY,
    pay_period_id INTEGER REFERENCES pay_periods(id) ON DELETE CASCADE,
    bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    amount_override DECIMAL(12, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bill_id, month, year)
);

CREATE INDEX idx_pay_period_bills_pp ON pay_period_bills(pay_period_id, year, month);

-- Spending limits table for category-specific limits per family member
CREATE TABLE spending_limits (
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

-- Spending alerts table for notifications
CREATE TABLE spending_alerts (
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

CREATE INDEX idx_spending_alerts_user ON spending_alerts(user_id, is_read);

-- Approval requests table for child spending approvals
CREATE TABLE approval_requests (
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

CREATE INDEX idx_approval_requests_status ON approval_requests(status, expires_at);

-- Allowance transactions table for automatic allowances
CREATE TABLE allowance_transactions (
    id SERIAL PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    next_payment_date DATE NOT NULL,
    last_payment_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email configuration table
CREATE TABLE email_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    provider VARCHAR(20) DEFAULT 'none',
    from_email VARCHAR(255) DEFAULT 'noreply@budgetapp.com',
    from_name VARCHAR(100) DEFAULT 'Budget Tracker',
    sendgrid_api_key TEXT,
    smtp_host VARCHAR(255),
    smtp_port INTEGER DEFAULT 587,
    smtp_user VARCHAR(255),
    smtp_pass TEXT,
    resend_api_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_config_single_row CHECK (id = 1)
);

-- Insert default email configuration
INSERT INTO email_config (id, provider, from_email, from_name)
VALUES (1, 'none', 'noreply@budgetapp.com', 'Budget Tracker')
ON CONFLICT (id) DO NOTHING;

-- Backup configuration table
CREATE TABLE backup_config (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    storage_type VARCHAR(20) NOT NULL CHECK (storage_type IN ('local', 'network', 's3', 'gdrive', 'dropbox')),
    storage_path VARCHAR(500),
    credentials JSONB,
    is_global BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backup_config_user ON backup_config(user_id);

-- Backup schedules table
CREATE TABLE backup_schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
    schedule_time TIME,
    schedule_day INTEGER,
    storage_type VARCHAR(20) NOT NULL,
    retention_days INTEGER DEFAULT 30,
    enabled BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backup_schedules_user ON backup_schedules(user_id);
CREATE INDEX idx_backup_schedules_next_run ON backup_schedules(next_run) WHERE enabled = true;

-- Backup history table
CREATE TABLE backup_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    schedule_id INTEGER REFERENCES backup_schedules(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    storage_type VARCHAR(20) NOT NULL,
    storage_path VARCHAR(500),
    file_size BIGINT,
    is_admin_backup BOOLEAN DEFAULT false,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'success', 'failed')),
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backup_history_user ON backup_history(user_id);
CREATE INDEX idx_backup_history_created ON backup_history(created_at DESC);

-- Function to update updated_at timestamps
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

-- Function to clean up expired refresh tokens
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < CURRENT_TIMESTAMP OR revoked_at IS NOT NULL;

    UPDATE users u
    SET active_sessions = (
        SELECT COUNT(*)
        FROM refresh_tokens rt
        WHERE rt.user_id = u.id
        AND rt.revoked_at IS NULL
        AND rt.expires_at > CURRENT_TIMESTAMP
    )
    WHERE u.id IN (
        SELECT DISTINCT user_id
        FROM refresh_tokens
    );
END;
$$ LANGUAGE plpgsql;

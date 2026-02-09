-- Migration script to add pay periods tables to existing database
-- Run this with: docker exec -i budget-db psql -U postgres -d budget < database/add_pay_periods.sql

-- Pay periods (income buckets for bill assignment)
CREATE TABLE IF NOT EXISTS pay_periods (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    frequency VARCHAR(20) CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'semimonthly')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pay_periods_user_date') THEN
        CREATE INDEX idx_pay_periods_user_date ON pay_periods(user_id, date);
    END IF;
END $$;

-- Bill assignments to pay periods
CREATE TABLE IF NOT EXISTS pay_period_bills (
    id SERIAL PRIMARY KEY,
    pay_period_id INTEGER REFERENCES pay_periods(id) ON DELETE CASCADE,
    bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    amount_override DECIMAL(12, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bill_id, month, year)
);

-- Create index if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pay_period_bills_pp') THEN
        CREATE INDEX idx_pay_period_bills_pp ON pay_period_bills(pay_period_id, year, month);
    END IF;
END $$;

-- Verify tables were created
SELECT 'pay_periods table created' AS status WHERE EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'pay_periods'
);

SELECT 'pay_period_bills table created' AS status WHERE EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'pay_period_bills'
);
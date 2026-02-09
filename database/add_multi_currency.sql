-- Multi-currency support

-- Supported currencies
CREATE TABLE currencies (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    decimal_places INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exchange rates cache
CREATE TABLE exchange_rates (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(20,10) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_currency, to_currency, date)
);

CREATE INDEX idx_exchange_rates_from ON exchange_rates(from_currency);
CREATE INDEX idx_exchange_rates_to ON exchange_rates(to_currency);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(date);

-- User/organization default currency
ALTER TABLE users ADD COLUMN default_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE organizations ADD COLUMN default_currency VARCHAR(3) DEFAULT 'USD';

-- Add currency to transactions (nullable for backwards compatibility)
ALTER TABLE transactions ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE transactions ADD COLUMN exchange_rate DECIMAL(20,10) DEFAULT 1.0;
ALTER TABLE transactions ADD COLUMN original_amount DECIMAL(10,2);

-- Add currency to budgets
ALTER TABLE budgets ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';

-- Add currency to receipts
ALTER TABLE receipts ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';

CREATE INDEX idx_transactions_currency ON transactions(currency);
CREATE INDEX idx_budgets_currency ON budgets(currency);

-- Insert common currencies
INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
('USD', 'US Dollar', '$', 2),
('EUR', 'Euro', '€', 2),
('GBP', 'British Pound', '£', 2),
('JPY', 'Japanese Yen', '¥', 0),
('CAD', 'Canadian Dollar', 'CA$', 2),
('AUD', 'Australian Dollar', 'A$', 2),
('CHF', 'Swiss Franc', 'CHF', 2),
('CNY', 'Chinese Yuan', '¥', 2),
('INR', 'Indian Rupee', '₹', 2),
('MXN', 'Mexican Peso', 'MX$', 2),
('BRL', 'Brazilian Real', 'R$', 2),
('ZAR', 'South African Rand', 'R', 2),
('SGD', 'Singapore Dollar', 'S$', 2),
('NZD', 'New Zealand Dollar', 'NZ$', 2),
('KRW', 'South Korean Won', '₩', 0),
('SEK', 'Swedish Krona', 'kr', 2),
('NOK', 'Norwegian Krone', 'kr', 2),
('DKK', 'Danish Krone', 'kr', 2),
('RUB', 'Russian Ruble', '₽', 2),
('TRY', 'Turkish Lira', '₺', 2);

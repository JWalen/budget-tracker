-- Subscription plans and billing tables

-- Subscription plans (Free, Pro, Business, Enterprise)
CREATE TABLE subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
    price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0,
    stripe_price_id_monthly VARCHAR(100),
    stripe_price_id_yearly VARCHAR(100),
    features JSONB NOT NULL DEFAULT '{}',
    limits JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default plans
INSERT INTO subscription_plans (name, display_name, description, price_monthly, price_yearly, features, limits) VALUES
('free', 'Free', 'Perfect for getting started', 0.00, 0.00, 
  '{"transactions": true, "budgets": true, "categories": true, "reports_basic": true}',
  '{"users": 1, "transactions_per_month": 100, "budgets": 1, "categories": 10, "data_retention_days": 30}'
),
('pro', 'Pro', 'For serious budgeters', 9.99, 99.99,
  '{"transactions": true, "budgets": true, "categories": true, "reports_advanced": true, "receipts": true, "multi_currency": true, "email_support": true}',
  '{"users": 1, "transactions_per_month": -1, "budgets": -1, "categories": -1, "data_retention_days": -1, "receipts_per_month": 50}'
),
('business', 'Business', 'For teams and families', 29.99, 299.99,
  '{"transactions": true, "budgets": true, "categories": true, "reports_advanced": true, "receipts": true, "multi_currency": true, "collaboration": true, "priority_support": true, "api_access": true}',
  '{"users": 5, "transactions_per_month": -1, "budgets": -1, "categories": -1, "data_retention_days": -1, "receipts_per_month": -1}'
);

-- User subscriptions
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES subscription_plans(id),
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start TIMESTAMP,
    current_period_end TIMESTAMP,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMP,
    trial_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Usage tracking for plan limits
CREATE TABLE usage_tracking (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    resource_type VARCHAR(50) NOT NULL, -- 'transactions', 'receipts', 'api_calls', etc.
    count INTEGER DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, resource_type, period_start)
);

CREATE INDEX idx_usage_tracking_user_period ON usage_tracking(user_id, period_start);

-- Payment history
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
    stripe_payment_intent_id VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) NOT NULL, -- 'succeeded', 'failed', 'refunded', etc.
    payment_method VARCHAR(50), -- 'card', 'paypal', etc.
    receipt_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);

-- Stripe webhooks log (for debugging)
CREATE TABLE stripe_webhooks (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stripe_webhooks_event_type ON stripe_webhooks(event_type);
CREATE INDEX idx_stripe_webhooks_processed ON stripe_webhooks(processed);

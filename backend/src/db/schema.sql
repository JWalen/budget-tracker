-- ============================================================================
-- Idempotent schema bootstrap.
--
-- This file is executed by the backend on every startup (see
-- backend/src/config/runMigrations.ts). It is ADDITIVE and idempotent: every
-- statement uses IF NOT EXISTS / ON CONFLICT so it is safe to run repeatedly
-- against both fresh databases (after init.sql runs via the docker entrypoint)
-- and pre-existing databases.
--
-- It reconciles the historical split between init.sql and the various
-- database/add_*.sql files, which previously left fresh installs missing the
-- Households, Notifications, Receipts, Budget Template, Currency and system
-- settings tables. It also removes the legacy budget_shares table (sharing is
-- now modeled on Households / organizations).
-- ============================================================================

-- --- Households (organizations) --------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}',
    default_currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

CREATE TABLE IF NOT EXISTS organization_members (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id);

CREATE TABLE IF NOT EXISTS organization_invitations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, email)
);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_token ON organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_organization_invitations_email ON organization_invitations(email);

-- --- Notifications ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    email_enabled BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    budget_alerts BOOLEAN DEFAULT true,
    transaction_alerts BOOLEAN DEFAULT true,
    collaboration_alerts BOOLEAN DEFAULT true,
    weekly_summary BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);

-- --- Receipts ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    thumbnail_path VARCHAR(500),
    s3_key VARCHAR(500),
    s3_bucket VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    ocr_text TEXT,
    ocr_data JSONB,
    amount DECIMAL(10,2),
    merchant VARCHAR(255),
    date DATE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_organization ON receipts(organization_id);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);

CREATE TABLE IF NOT EXISTS receipt_tags (
    id SERIAL PRIMARY KEY,
    receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(receipt_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_receipt_tags_receipt ON receipt_tags(receipt_id);

-- --- Budget templates -------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('50-30-20', 'zero-based', 'envelope', 'custom')),
    is_public BOOLEAN DEFAULT false,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rules JSONB NOT NULL DEFAULT '{}',
    categories JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_budget_templates_public ON budget_templates(is_public);

CREATE TABLE IF NOT EXISTS user_budget_templates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES budget_templates(id) ON DELETE CASCADE,
    customizations JSONB DEFAULT '{}',
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, template_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_user_budget_templates_user ON user_budget_templates(user_id);

-- --- Multi-currency ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS currencies (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    decimal_places INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(20,10) NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_currency, to_currency, date)
);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date);

-- --- System settings --------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT,
    type VARCHAR(20) DEFAULT 'string',
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- Additive columns (safe on existing tables) -----------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(20,10) DEFAULT 1.0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS original_amount DECIMAL(10,2);
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';
ALTER TABLE match_rules ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE;

-- --- Remove legacy sharing model (replaced by Households) --------------------
DROP TABLE IF EXISTS budget_shares CASCADE;

-- --- Seeds (idempotent) -----------------------------------------------------
INSERT INTO email_config (id, provider, from_email, from_name)
VALUES (1, 'none', 'noreply@budgetapp.com', 'Budget Tracker')
ON CONFLICT (id) DO NOTHING;

INSERT INTO system_settings (key, value, type, description) VALUES
('ai_enabled', 'false', 'boolean', 'Master switch for AI features'),
('ai_model', 'mistral', 'string', 'Selected Ollama model to use'),
('ai_auto_gpu', 'true', 'boolean', 'Automatically use GPU if detected')
ON CONFLICT (key) DO NOTHING;

INSERT INTO currencies (code, name, symbol, decimal_places) VALUES
('USD', 'US Dollar', '$', 2), ('EUR', 'Euro', '€', 2), ('GBP', 'British Pound', '£', 2),
('JPY', 'Japanese Yen', '¥', 0), ('CAD', 'Canadian Dollar', 'CA$', 2), ('AUD', 'Australian Dollar', 'A$', 2),
('CHF', 'Swiss Franc', 'CHF', 2), ('CNY', 'Chinese Yuan', '¥', 2), ('INR', 'Indian Rupee', '₹', 2),
('MXN', 'Mexican Peso', 'MX$', 2), ('BRL', 'Brazilian Real', 'R$', 2), ('ZAR', 'South African Rand', 'R', 2),
('SGD', 'Singapore Dollar', 'S$', 2), ('NZD', 'New Zealand Dollar', 'NZ$', 2), ('KRW', 'South Korean Won', '₩', 0),
('SEK', 'Swedish Krona', 'kr', 2), ('NOK', 'Norwegian Krone', 'kr', 2), ('DKK', 'Danish Krone', 'kr', 2),
('RUB', 'Russian Ruble', '₽', 2), ('TRY', 'Turkish Lira', '₺', 2)
ON CONFLICT (code) DO NOTHING;

-- Seed the public budget templates only if none exist yet.
INSERT INTO budget_templates (name, description, type, is_public, rules, categories)
SELECT '50/30/20 Rule',
       'Allocate 50% to needs, 30% to wants, and 20% to savings and debt repayment',
       '50-30-20', true,
       '{"needs": 50, "wants": 30, "savings": 20}',
       '[{"name":"Housing","percentage":25,"type":"needs"},{"name":"Utilities","percentage":5,"type":"needs"},{"name":"Groceries","percentage":10,"type":"needs"},{"name":"Transportation","percentage":10,"type":"needs"},{"name":"Entertainment","percentage":15,"type":"wants"},{"name":"Dining Out","percentage":10,"type":"wants"},{"name":"Shopping","percentage":5,"type":"wants"},{"name":"Savings","percentage":15,"type":"savings"},{"name":"Debt Payment","percentage":5,"type":"savings"}]'
WHERE NOT EXISTS (SELECT 1 FROM budget_templates WHERE is_public = true);

-- --- Backfill a personal household for any user that has none ----------------
-- Ensures every user has an organization + owner membership so household-scoped
-- routes (currency/notifications/receipts/templates) and shared-budget access work.
DO $$
DECLARE
    u RECORD;
    new_org_id INTEGER;
BEGIN
    FOR u IN
        SELECT usr.id, usr.name
        FROM users usr
        WHERE NOT EXISTS (
            SELECT 1 FROM organization_members om WHERE om.user_id = usr.id
        )
    LOOP
        INSERT INTO organizations (name, slug, owner_id)
        VALUES (COALESCE(NULLIF(u.name, ''), 'My') || '''s Household', 'personal-' || u.id, u.id)
        ON CONFLICT (slug) DO UPDATE SET owner_id = EXCLUDED.owner_id
        RETURNING id INTO new_org_id;

        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES (new_org_id, u.id, 'owner')
        ON CONFLICT (organization_id, user_id) DO NOTHING;
    END LOOP;
END $$;

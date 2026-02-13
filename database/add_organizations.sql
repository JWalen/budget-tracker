-- Multi-tenancy and organization management schema

-- Organizations table (for team collaboration)
CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_organizations_owner ON organizations(owner_id);
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Organization members (users who belong to organizations)
CREATE TABLE organization_members (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_organization_members_org ON organization_members(organization_id);
CREATE INDEX idx_organization_members_user ON organization_members(user_id);

-- Organization invitations (pending invites)
CREATE TABLE organization_invitations (
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

CREATE INDEX idx_organization_invitations_token ON organization_invitations(token);
CREATE INDEX idx_organization_invitations_email ON organization_invitations(email);

-- Add organization_id to existing tables for multi-tenancy

-- Budgets belong to organizations
ALTER TABLE budgets ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_budgets_organization ON budgets(organization_id);

-- Categories belong to organizations
ALTER TABLE categories ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_categories_organization ON categories(organization_id);

-- Transactions belong to organizations
ALTER TABLE transactions ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_transactions_organization ON transactions(organization_id);

-- Recurring transactions belong to organizations
ALTER TABLE recurring_transactions ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_recurring_transactions_organization ON recurring_transactions(organization_id);

-- Pay periods belong to organizations
ALTER TABLE pay_periods ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_pay_periods_organization ON pay_periods(organization_id);

-- Budget allocations belong to organizations
ALTER TABLE budget_allocations ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX idx_budget_allocations_organization ON budget_allocations(organization_id);

-- Update subscription to track organization-level subscriptions
-- ALTER TABLE subscriptions ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
-- CREATE INDEX idx_subscriptions_organization ON subscriptions(organization_id);

-- Migration helper: Create default personal organization for existing users
-- This will run after the schema is applied
DO $$
DECLARE
    user_record RECORD;
    new_org_id INTEGER;
BEGIN
    FOR user_record IN SELECT id, name, email FROM users LOOP
        -- Create personal organization for each user
        INSERT INTO organizations (name, slug, owner_id)
        VALUES (
            user_record.name || '''s Budget',
            'personal-' || user_record.id,
            user_record.id
        )
        RETURNING id INTO new_org_id;
        
        -- Add user as owner of their organization
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES (new_org_id, user_record.id, 'owner');
        
        -- Move user's existing data to their organization
        UPDATE budgets SET organization_id = new_org_id WHERE user_id = user_record.id;
        UPDATE categories SET organization_id = new_org_id WHERE user_id = user_record.id;
        UPDATE transactions SET organization_id = new_org_id WHERE user_id = user_record.id;
        UPDATE recurring_transactions SET organization_id = new_org_id WHERE user_id = user_record.id;
        
        -- Move pay_periods if they exist
        UPDATE pay_periods SET organization_id = new_org_id WHERE user_id = user_record.id;
        
        -- Move budget_allocations if they exist
        UPDATE budget_allocations SET organization_id = new_org_id 
        WHERE budget_id IN (SELECT id FROM budgets WHERE user_id = user_record.id);
        
        -- Move subscription to organization
        -- UPDATE subscriptions SET organization_id = new_org_id WHERE user_id = user_record.id;
    END LOOP;
END $$;

-- After migration, we can make organization_id NOT NULL on key tables
-- (Commented out for safety - uncomment after verifying migration)
-- ALTER TABLE budgets ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE categories ALTER COLUMN organization_id SET NOT NULL;
-- ALTER TABLE transactions ALTER COLUMN organization_id SET NOT NULL;

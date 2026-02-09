-- Budget templates

CREATE TABLE budget_templates (
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

CREATE INDEX idx_budget_templates_type ON budget_templates(type);
CREATE INDEX idx_budget_templates_public ON budget_templates(is_public);
CREATE INDEX idx_budget_templates_created_by ON budget_templates(created_by);

-- User's saved templates
CREATE TABLE user_budget_templates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES budget_templates(id) ON DELETE CASCADE,
    customizations JSONB DEFAULT '{}',
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, template_id, organization_id)
);

CREATE INDEX idx_user_budget_templates_user ON user_budget_templates(user_id);
CREATE INDEX idx_user_budget_templates_org ON user_budget_templates(organization_id);

-- Insert default templates
INSERT INTO budget_templates (name, description, type, is_public, rules, categories) VALUES
(
  '50/30/20 Rule',
  'Allocate 50% to needs, 30% to wants, and 20% to savings and debt repayment',
  '50-30-20',
  true,
  '{"needs": 50, "wants": 30, "savings": 20}',
  '[
    {"name": "Housing", "percentage": 25, "type": "needs"},
    {"name": "Utilities", "percentage": 5, "type": "needs"},
    {"name": "Groceries", "percentage": 10, "type": "needs"},
    {"name": "Transportation", "percentage": 10, "type": "needs"},
    {"name": "Entertainment", "percentage": 15, "type": "wants"},
    {"name": "Dining Out", "percentage": 10, "type": "wants"},
    {"name": "Shopping", "percentage": 5, "type": "wants"},
    {"name": "Savings", "percentage": 15, "type": "savings"},
    {"name": "Debt Payment", "percentage": 5, "type": "savings"}
  ]'
),
(
  'Zero-Based Budget',
  'Every dollar has a job - assign all income to categories',
  'zero-based',
  true,
  '{"method": "assign_all_income", "allow_unallocated": false}',
  '[
    {"name": "Income", "percentage": 0, "is_income": true},
    {"name": "Housing", "percentage": 30},
    {"name": "Utilities", "percentage": 8},
    {"name": "Groceries", "percentage": 12},
    {"name": "Transportation", "percentage": 10},
    {"name": "Insurance", "percentage": 8},
    {"name": "Healthcare", "percentage": 5},
    {"name": "Debt Payment", "percentage": 10},
    {"name": "Savings", "percentage": 10},
    {"name": "Entertainment", "percentage": 5},
    {"name": "Miscellaneous", "percentage": 2}
  ]'
),
(
  'Envelope System',
  'Cash-like budget with specific amounts for each category',
  'envelope',
  true,
  '{"track_spending": true, "prevent_overspend": true}',
  '[
    {"name": "Groceries", "amount": 500},
    {"name": "Gas", "amount": 200},
    {"name": "Entertainment", "amount": 150},
    {"name": "Dining Out", "amount": 200},
    {"name": "Clothing", "amount": 100},
    {"name": "Personal Care", "amount": 75},
    {"name": "Gifts", "amount": 100}
  ]'
),
(
  'Aggressive Savings',
  'Maximize savings with minimal lifestyle expenses',
  'custom',
  true,
  '{"savings_priority": "high", "lifestyle_spending": "low"}',
  '[
    {"name": "Housing", "percentage": 20},
    {"name": "Utilities", "percentage": 5},
    {"name": "Groceries", "percentage": 10},
    {"name": "Transportation", "percentage": 8},
    {"name": "Insurance", "percentage": 7},
    {"name": "Savings", "percentage": 35},
    {"name": "Investments", "percentage": 10},
    {"name": "Entertainment", "percentage": 3},
    {"name": "Miscellaneous", "percentage": 2}
  ]'
);

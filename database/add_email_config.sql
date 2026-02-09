-- Create email configuration table
CREATE TABLE IF NOT EXISTS email_config (
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

-- Insert default configuration if not exists
INSERT INTO email_config (id, provider, from_email, from_name)
VALUES (1, 'none', 'noreply@budgetapp.com', 'Budget Tracker')
ON CONFLICT (id) DO NOTHING;
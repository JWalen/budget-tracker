-- System settings table for global configuration (AI, registration, etc.)
CREATE TABLE system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT,
    type VARCHAR(20) DEFAULT 'string', -- string, boolean, number, json
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initial seed for AI settings
INSERT INTO system_settings (key, value, type, description) VALUES
('ai_enabled', 'false', 'boolean', 'Master switch for AI features'),
('ai_model', 'mistral', 'string', 'Selected Ollama model to use'),
('ai_auto_gpu', 'true', 'boolean', 'Automatically use GPU if detected');

-- Add backup scheduling and configuration tables

-- Backup configuration table
CREATE TABLE IF NOT EXISTS backup_config (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    storage_type VARCHAR(20) NOT NULL CHECK (storage_type IN ('local', 'network', 's3', 'gdrive', 'dropbox')),
    storage_path VARCHAR(500),
    credentials JSONB,
    is_global BOOLEAN DEFAULT false,  -- Admin can set global backup config
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_backup_config_user ON backup_config(user_id);

-- Backup schedules table
CREATE TABLE IF NOT EXISTS backup_schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
    schedule_time TIME,
    schedule_day INTEGER, -- Day of week (1-7) for weekly, day of month (1-31) for monthly
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
CREATE TABLE IF NOT EXISTS backup_history (
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
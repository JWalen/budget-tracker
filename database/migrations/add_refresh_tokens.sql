-- Migration: Add refresh tokens table for JWT authentication
-- Date: 2026-02-08

-- Create refresh_tokens table for managing JWT refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP DEFAULT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

-- Add active_sessions column to users table if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'active_sessions') THEN
        ALTER TABLE users ADD COLUMN active_sessions INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add last_activity column to users table if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'last_activity') THEN
        ALTER TABLE users ADD COLUMN last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Add last_login column to users table if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users' AND column_name = 'last_login') THEN
        ALTER TABLE users ADD COLUMN last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Create function to auto-cleanup expired tokens (optional, can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM refresh_tokens
    WHERE expires_at < CURRENT_TIMESTAMP OR revoked_at IS NOT NULL;

    -- Update active sessions count for affected users
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

-- Add comment for documentation
COMMENT ON TABLE refresh_tokens IS 'Stores JWT refresh tokens for user sessions management';
COMMENT ON COLUMN refresh_tokens.token IS 'The refresh token value (hashed)';
COMMENT ON COLUMN refresh_tokens.expires_at IS 'When this refresh token expires';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'When this token was revoked (null if active)';
COMMENT ON COLUMN refresh_tokens.ip_address IS 'IP address from which token was created';
COMMENT ON COLUMN refresh_tokens.user_agent IS 'User agent string from token creation';
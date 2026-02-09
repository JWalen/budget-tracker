-- Receipt management tables

-- Receipts table
CREATE TABLE receipts (
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_receipts_user ON receipts(user_id);
CREATE INDEX idx_receipts_organization ON receipts(organization_id);
CREATE INDEX idx_receipts_transaction ON receipts(transaction_id);
CREATE INDEX idx_receipts_date ON receipts(date);
CREATE INDEX idx_receipts_merchant ON receipts(merchant);

-- Receipt tags for organization
CREATE TABLE receipt_tags (
    id SERIAL PRIMARY KEY,
    receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
    tag VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(receipt_id, tag)
);

CREATE INDEX idx_receipt_tags_receipt ON receipt_tags(receipt_id);
CREATE INDEX idx_receipt_tags_tag ON receipt_tags(tag);

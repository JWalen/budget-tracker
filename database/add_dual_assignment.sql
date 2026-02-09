-- Add support for dual assignment (bill + category) in match rules
ALTER TABLE match_rules
ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE;

-- Add comment to clarify usage
COMMENT ON COLUMN match_rules.category_id IS 'Optional category ID when target_type is "bill" to also categorize the transaction';
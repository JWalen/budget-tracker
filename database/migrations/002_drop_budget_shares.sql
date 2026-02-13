-- Migration to remove legacy budget sharing functionality
-- Budget sharing is now replaced by Households which provides better organization and control

-- Drop the budget_shares table
DROP TABLE IF EXISTS budget_shares CASCADE;

-- Clean up any related indexes (should be dropped with the table, but being explicit)
DROP INDEX IF EXISTS idx_budget_shares_shared CASCADE;

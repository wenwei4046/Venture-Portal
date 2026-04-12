-- ============================================================================
-- 20260101000060_remove_savings_rename_subsidiary.sql
-- Remove savings terminology: rename subsidiary_savings → subsidiary,
-- delete savings_interest + savings_principal categories
-- ============================================================================

-- 1. Rename enum value: subsidiary_savings → subsidiary
ALTER TYPE fund_source_type RENAME VALUE 'subsidiary_savings' TO 'subsidiary';

-- 2. Delete unused statement categories
DELETE FROM statement_categories WHERE code IN ('savings_interest', 'savings_principal');

-- 3. Update generateStatements to use loan_repayment for fund source interest
-- (handled in app code, not SQL)

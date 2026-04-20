-- ============================================================================
-- 20260101000185_rename_hv_leftover_constraints_indexes.sql
-- Phase 9 polish — rename 3 naming leftovers from the hv_operating_fund →
-- venture_pool table rename (migration 156). Postgres does not auto-rename
-- constraints or indexes when a table is renamed.
--
-- Not touched: hv_share_has_no_company check constraint — "HV" there refers
-- to the group entity (HV Sdn Bhd), not the pool rename.
-- ============================================================================

BEGIN;

-- PK constraint (and its backing index of the same name)
ALTER TABLE venture_pool RENAME CONSTRAINT hv_operating_fund_pkey TO venture_pool_pkey;

-- FK constraint
ALTER TABLE venture_pool RENAME CONSTRAINT hv_operating_fund_created_by_fkey TO venture_pool_created_by_fkey;

-- Plain btree index on (transaction_type, created_at DESC)
ALTER INDEX idx_hv_fund_type_date RENAME TO idx_venture_pool_type_date;

COMMIT;

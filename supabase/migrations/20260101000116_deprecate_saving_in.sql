-- ============================================================================
-- 20260101000116_deprecate_saving_in.sql
-- Mark hv_operating_fund transaction_type 'saving_in' as deprecated.
--
-- Phase 7 Step 2 (mig 101) stopped writing saving_in — Director salary 5%
-- now stays in Director Pool. Historical rows with saving_in remain for
-- audit. Postgres enums don't support value removal, so this is a comment-
-- only marker. dashboard_summary already excludes saving_in from
-- pool balance sums (it wasn't in the SUM(...) predicate since mig 101).
-- ============================================================================

COMMENT ON TYPE hv_fund_txn_type IS
    'Transaction types for hv_operating_fund ledger. NOTE: saving_in is DEPRECATED since Phase 7 — 5% director saving now lands in Director dept_pool, not here. Historical rows preserved.';

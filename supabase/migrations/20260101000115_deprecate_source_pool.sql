-- ============================================================================
-- 20260101000115_deprecate_source_pool.sql
-- Phase 7 Step 16 — mark payment_vouchers.source_pool as DEPRECATED.
--
-- The column is no longer written by the app (createPaymentVoucher now sets
-- it to NULL for new rows). All pool reads come from payment_voucher_sources.
-- The column itself is kept for historical rows so nothing rewrites audit
-- trail; a Phase 8 cleanup can drop it once sufficient time has passed.
-- ============================================================================

BEGIN;

COMMENT ON COLUMN payment_vouchers.source_pool IS
    'DEPRECATED (Phase 7 Step 16): use payment_voucher_sources subtable. Historical rows keep their value as audit; new rows are written NULL. To be dropped in Phase 8.';

COMMIT;

-- ============================================================================
-- 20260101000062_payment_source_pool.sql
-- Add source_pool to payment_vouchers for Debit direction
-- (mirrors target_pool which is used for Credit direction)
-- ============================================================================

ALTER TABLE payment_vouchers
    ADD COLUMN source_pool TEXT;

COMMENT ON COLUMN payment_vouchers.source_pool IS
    'For debit direction: which pool the outgoing funds are drawn from (hv_operating_fund, salary_pool, dept_pool_{name})';

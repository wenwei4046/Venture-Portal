-- ============================================================================
-- 20260101000205_per_source_category_code.sql
-- Move category_code from payment_vouchers (voucher-level) to
-- payment_voucher_sources (per pool source). User's motivating example:
-- one invoice = Computer RM 3000 + Logistics RM 100, split Venture 50/50 and
-- Marketing 50/50 → 4 source rows, 2 categories, 1 voucher.
--
-- Strategy
-- --------
-- 1. Add payment_voucher_sources.category_code (nullable, FK to payment_categories)
-- 2. Backfill: copy each voucher's category_code onto all its existing source rows
-- 3. Credit vouchers currently have ONLY a voucher-level category_code and no
--    source rows (mig 103 backfill only created rows for vouchers with source_pool
--    IS NOT NULL, which excludes credit). Create one source row per credit voucher
--    using target_pool as the "source" value. This unifies the data model — every
--    voucher has ≥1 source row, category lives there.
-- 4. Drop payment_vouchers.category_code (decision A1: per-source is authoritative)
--
-- Sum-matches trigger on payment_voucher_sources checks sum == voucher.amount for
-- approved/paid vouchers. Credit backfill inserts single row with
-- amount=voucher.amount so invariant holds.
-- ============================================================================

BEGIN;

-- 1) Add column
ALTER TABLE payment_voucher_sources
    ADD COLUMN category_code VARCHAR(30) REFERENCES payment_categories(code);

COMMENT ON COLUMN payment_voucher_sources.category_code IS
    'P&L category per source row. Replaces payment_vouchers.category_code (dropped in same mig). One voucher can now carry multiple categories (e.g., Computer + Logistics on one invoice).';

-- 2) Backfill existing debit rows from parent voucher's category_code
UPDATE payment_voucher_sources pvs
SET category_code = pv.category_code
FROM payment_vouchers pv
WHERE pvs.voucher_id = pv.id
  AND pv.category_code IS NOT NULL;

-- 3) Credit vouchers: create one source row per voucher (pool = target_pool)
INSERT INTO payment_voucher_sources (voucher_id, pool, amount, category_code, created_at)
SELECT pv.id, pv.target_pool, pv.amount, pv.category_code, pv.created_at
FROM payment_vouchers pv
WHERE pv.direction = 'credit'
  AND pv.target_pool IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM payment_voucher_sources pvs WHERE pvs.voucher_id = pv.id
  );

-- 4) Drop the voucher-level column (A1: per-source is authoritative)
ALTER TABLE payment_vouchers DROP COLUMN category_code;

COMMIT;

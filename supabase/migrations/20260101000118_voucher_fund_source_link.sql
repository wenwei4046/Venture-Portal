-- ============================================================================
-- 20260101000118_voucher_fund_source_link.sql
-- Payment Voucher → Fund Source repayment (correct business direction).
--
-- Context:
--   Migration 110 tied voucher.loan_id → loans table (HV lending to subs).
--   That was semantically wrong: a Debit voucher = HV pays OUT, so the
--   "this voucher is a loan repayment" path must target fund_sources
--   (subsidiary savings / director loans — where HV is the borrower).
--
-- This migration adds payment_vouchers.fund_source_id (nullable, new). The
-- legacy loan_id column stays for backward compatibility (no data expected
-- post-wipe, but keep to avoid breaking any stragglers). New vouchers use
-- fund_source_id; executeVoucher writes to fund_source_repayments instead of
-- repayments when fund_source_id is set.
-- ============================================================================

BEGIN;

ALTER TABLE payment_vouchers
    ADD COLUMN IF NOT EXISTS fund_source_id UUID REFERENCES fund_sources(id);

CREATE INDEX IF NOT EXISTS idx_pv_fund_source ON payment_vouchers(fund_source_id)
    WHERE fund_source_id IS NOT NULL;

COMMENT ON COLUMN payment_vouchers.fund_source_id IS
    'When set, executeVoucher inserts fund_source_repayments rows from repayment_breakdown. HV repaying subsidiary savings / director loans.';

COMMIT;

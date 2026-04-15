-- ============================================================================
-- 20260101000110_voucher_loan_link.sql
-- Phase 7 Step 12b — Loan repayment auto-sync on Debit voucher
--
-- When a Finance user marks a Debit voucher as a loan repayment:
--   voucher.loan_id = <loan>
--   voucher.repayment_breakdown = { principal, interest, penalty }
--
-- On executeVoucher, the action inserts a repayments row (one per payment_type
-- in the breakdown, amounts > 0) and clears matching overdue_records for that
-- loan's current period. Pool/bank debits still go through the usual multi-
-- source voucher flow — loan_id + breakdown are pure sync, no money-path
-- divergence.
-- ============================================================================

BEGIN;

ALTER TABLE payment_vouchers ADD COLUMN IF NOT EXISTS loan_id UUID REFERENCES loans(id);
CREATE INDEX IF NOT EXISTS idx_pv_loan ON payment_vouchers(loan_id)
    WHERE loan_id IS NOT NULL;

ALTER TABLE payment_vouchers ADD COLUMN IF NOT EXISTS repayment_breakdown JSONB;

COMMENT ON COLUMN payment_vouchers.loan_id IS
    'Phase 7 Step 12b: when set, executeVoucher inserts one or more repayments rows using repayment_breakdown and clears matching overdue_records.';

COMMENT ON COLUMN payment_vouchers.repayment_breakdown IS
    'Phase 7 Step 12b: JSON shape { principal, interest, penalty } — each numeric in MYR. Sums to voucher.amount. NULL for non-loan vouchers.';

COMMIT;

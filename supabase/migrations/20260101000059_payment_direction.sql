-- ============================================================================
-- 20260101000059_payment_direction.sql
-- Add direction (debit/credit) to payment_vouchers
-- debit = money out (HV pays someone)
-- credit = money in (HV receives payment from subsidiary)
-- ============================================================================

ALTER TABLE payment_vouchers
    ADD COLUMN direction TEXT NOT NULL DEFAULT 'debit'
    CONSTRAINT pv_valid_direction CHECK (direction IN ('debit', 'credit'));

COMMENT ON COLUMN payment_vouchers.direction IS
    'debit = HV pays out (expense, repayment, salary). credit = HV receives (subsidiary repayment, billing collection).';

-- Add 'receive_payment' to voucher type enum for incoming payments
ALTER TYPE payment_voucher_type ADD VALUE IF NOT EXISTS 'receive_payment';

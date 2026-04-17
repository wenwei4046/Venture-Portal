-- ============================================================================
-- 20260101000136_payroll_bank_transfer.sql
-- Spec 4 (HR Payroll Redesign) — add payroll_bank_transfer enum value
-- HOUZS Venture Portal
--
-- ADD VALUE runs in its own migration (and thus its own transaction). The
-- accompanying trigger that references the new value lives in 20260101000138,
-- because Postgres forbids using a just-added enum value in the same tx.
-- ============================================================================

ALTER TYPE payment_voucher_type ADD VALUE IF NOT EXISTS 'payroll_bank_transfer';

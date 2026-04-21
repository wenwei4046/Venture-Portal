-- Mig 196: Add 'loan_disbursement' to payment_voucher_type enum
--
-- Must be a standalone migration. PostgreSQL forbids ALTER TYPE ADD VALUE
-- from sharing a transaction with other DDL that references the new value
-- downstream. Mig 197+ will use it.
--
-- Background: approve_single_voucher maps voucher_type → journal debit
-- account via CASE. Loan disbursements today ride under 'other' → 5050 G&A,
-- which is wrong (they should post to 1020 Loans Receivable). Adding this
-- enum value so mig 199's refreshed CASE map can route correctly.

ALTER TYPE payment_voucher_type ADD VALUE IF NOT EXISTS 'loan_disbursement';

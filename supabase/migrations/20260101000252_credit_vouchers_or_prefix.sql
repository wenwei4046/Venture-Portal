-- 20260101000252_credit_vouchers_or_prefix.sql
--
-- Renames all credit-direction (incoming-money) payment vouchers from the
-- HV-PV-YYYYMM-NNNN scheme to HV-OR-YYYYMM-NNNN. PV (Payment Voucher) is
-- traditionally outgoing money; OR (Official Receipt) is incoming. The
-- product asked for the distinction in the document numbers so receipts
-- and payments are visually distinct in lists, search, and audit trails.
--
-- Scope:
--   - direction='credit' rows ONLY. Debit rows keep HV-PV-.
--   - All historical rows are renamed in this same migration so legacy
--     data doesn't carry the old prefix forever.
--   - voucher_no is unique across the table; the NNNN sequence is global
--     (mig 250 trigger keeps journal_entry_no_seq in sync). Renaming
--     payment_vouchers.voucher_no does NOT change journal_entries.entry_no
--     — those stay as JE-YYYYMM-NNNN (a separate ID scheme).
--
-- The TS side (payments/actions.ts:createPaymentVoucher) is patched
-- alongside this migration so new credit vouchers receive HV-OR- at
-- creation time. The mig 251 voucher_no uniqueness check is unaffected
-- because the rename is bijective.

BEGIN;

UPDATE payment_vouchers
   SET voucher_no = REPLACE(voucher_no, 'HV-PV-', 'HV-OR-')
 WHERE direction = 'credit'
   AND voucher_no LIKE 'HV-PV-%';

COMMIT;

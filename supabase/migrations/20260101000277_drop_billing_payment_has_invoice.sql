-- Drop the obsolete billing_payment_has_invoice CHECK constraint.
--
-- It enforced the OLD 1:1 invariant: every billing_payment voucher must settle
-- exactly one invoice via payment_vouchers.invoice_id (NOT NULL).
--
-- Consolidated receipts (mig 276) break that invariant by design: ONE
-- billing_payment voucher settles N invoices of the same company, with
-- invoice_id = NULL on the voucher and the N invoices linking back via
-- invoices.settlement_voucher_id. The constraint rejected that insert with:
--   new row for relation "payment_vouchers" violates check constraint
--   "billing_payment_has_invoice"
--
-- Single-invoice settlement still sets invoice_id at the application layer
-- (createPaymentVoucher always passes the invoice_id for billing_payment
-- vouchers), so that path keeps its linkage. The cross-table consolidated
-- linkage cannot be expressed as a CHECK (no subqueries), so the obsolete
-- constraint is simply dropped rather than rewritten.
alter table payment_vouchers
  drop constraint if exists billing_payment_has_invoice;

-- ============================================================================
-- 20260101000160_create_invoice_scaffolding.sql
-- Stage 4 scaffolding: enum values + invoice columns for the Create Invoice form
-- HOUZS Venture Portal
--
-- Why: Finance's new "Create Invoice" button (Stage 4 UI) bills a single
-- subsidiary on demand for one of the 5 Department Pools. Needs:
--   - 2 extra billing_mode values so HR/Finance/Director Office/Director/
--     Marketing each have a distinct mode
--   - invoice metadata columns that mirror what Finance expects on a real
--     invoice (invoice date + due date, free-form description, external
--     reference number). Mirrors the Payment form's layout plus Finance
--     inputs I added.
--
-- ALTER TYPE ADD VALUE can't be used in the same transaction as DML that
-- references the new value. Migration 161 holds the trigger body that uses
-- hr_attribution / finance_attribution — keep those separated.
-- ============================================================================

ALTER TYPE billing_mode ADD VALUE IF NOT EXISTS 'hr_attribution';
ALTER TYPE billing_mode ADD VALUE IF NOT EXISTS 'finance_attribution';

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS invoice_date  DATE,
    ADD COLUMN IF NOT EXISTS due_date      DATE,
    ADD COLUMN IF NOT EXISTS description   TEXT,
    ADD COLUMN IF NOT EXISTS reference_no  TEXT;

COMMENT ON COLUMN invoices.invoice_date IS
    'Stage 4: invoice issue date (what prints on the invoice, distinct from period_month).';
COMMENT ON COLUMN invoices.due_date IS
    'Stage 4: payment due date shown on the invoice.';
COMMENT ON COLUMN invoices.description IS
    'Stage 4: free-form memo entered by Finance on the Create Invoice form.';
COMMENT ON COLUMN invoices.reference_no IS
    'Stage 4: external reference (PO number, contract ref) optionally supplied by Finance.';

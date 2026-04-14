-- ============================================================================
-- 20260101000069_invoice_payment_link.sql
-- Tighten the payment_vouchers → invoices link so billing payments carry a
-- real FK (not just reference_type='invoice' / reference_id). Unlocks:
--   - Outstanding AR views (JOIN vouchers where status='paid')
--   - UI dropdown of open invoices when creating a billing_payment voucher
--   - Auto-mark invoice status='paid' when its voucher is executed
-- HOUZS Venture Portal — Roadmap #3
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Column + FK
-- ----------------------------------------------------------------------------

ALTER TABLE payment_vouchers
    ADD COLUMN invoice_id UUID REFERENCES invoices(id);

COMMENT ON COLUMN payment_vouchers.invoice_id IS
    'When voucher_type=billing_payment, the invoice this voucher settles. NULL for non-billing vouchers.';

-- ----------------------------------------------------------------------------
-- 2. Backfill from the polymorphic reference
-- ----------------------------------------------------------------------------

UPDATE payment_vouchers
SET invoice_id = reference_id
WHERE reference_type = 'invoice'
  AND reference_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM invoices WHERE invoices.id = payment_vouchers.reference_id);

-- ----------------------------------------------------------------------------
-- 3. Index for the "paid/open invoices" lookups
-- ----------------------------------------------------------------------------

CREATE INDEX idx_pv_invoice ON payment_vouchers(invoice_id)
    WHERE invoice_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Constraint: billing_payment must link to an invoice
-- ----------------------------------------------------------------------------
-- Only enforce going forward. Old rows that predate this migration without an
-- invoice_id would fail NOT VALID; we mark the constraint as not-yet-validated
-- so they can be backfilled separately, but new inserts are gated immediately.

ALTER TABLE payment_vouchers
    ADD CONSTRAINT billing_payment_has_invoice
    CHECK (voucher_type <> 'billing_payment' OR invoice_id IS NOT NULL)
    NOT VALID;

-- ----------------------------------------------------------------------------
-- 5. Trigger: mark invoice as paid when its voucher is executed
-- ----------------------------------------------------------------------------
-- Fires on payment_vouchers UPDATE when status crosses into 'paid'. The linked
-- invoice moves from issued → paid (or draft → paid for regenerated cases).
-- paid_via_netting is left untouched — that's a separate netting workflow.

CREATE OR REPLACE FUNCTION mark_invoice_paid_on_voucher_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'paid'
       AND (OLD.status IS DISTINCT FROM 'paid')
       AND NEW.invoice_id IS NOT NULL THEN
        UPDATE invoices
        SET status = 'paid'
        WHERE id = NEW.invoice_id
          AND status IN ('draft', 'issued');
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mark_invoice_paid_on_voucher_paid IS
    'When a billing_payment voucher becomes paid, mark its linked invoice paid. Roadmap #3.';

CREATE TRIGGER trg_pv_mark_invoice_paid
    AFTER UPDATE OF status ON payment_vouchers
    FOR EACH ROW
    WHEN (NEW.status = 'paid')
    EXECUTE FUNCTION mark_invoice_paid_on_voucher_paid();

-- ----------------------------------------------------------------------------
-- 6. Trigger: also fire on INSERT for auto-paid vouchers (credit direction
--     auto-completes to 'paid' on creation — handled in payments/actions.ts).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mark_invoice_paid_on_voucher_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'paid' AND NEW.invoice_id IS NOT NULL THEN
        UPDATE invoices
        SET status = 'paid'
        WHERE id = NEW.invoice_id
          AND status IN ('draft', 'issued');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pv_mark_invoice_paid_on_insert
    AFTER INSERT ON payment_vouchers
    FOR EACH ROW
    WHEN (NEW.status = 'paid')
    EXECUTE FUNCTION mark_invoice_paid_on_voucher_insert();

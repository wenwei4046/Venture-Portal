-- Partial payments (2026-08-11): the mark-invoice-paid triggers flipped an
-- invoice to 'paid' the moment ANY paid voucher carried its invoice_id — the
-- app-level skip for partial receipts was bypassed and HV-INV-202607-0039
-- went 'paid' off a RM 6,503.38 receipt against a RM 27,359.20 total (money
-- trail itself was correct: JE, pool credit and bank bump all partial).
--
-- Both functions now flip ONLY when the invoice's non-voided credit receipts
-- (linked via payment_vouchers.invoice_id) cover the full total, so the DB
-- enforces the same rule as the app no matter which path inserts the voucher.
-- The AFTER trigger sees its own NEW row in the SUM.

CREATE OR REPLACE FUNCTION mark_invoice_paid_on_voucher_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid' AND NEW.invoice_id IS NOT NULL THEN
        UPDATE invoices i
        SET status = 'paid'
        WHERE i.id = NEW.invoice_id
          AND i.status IN ('draft', 'issued')
          AND (
            SELECT COALESCE(SUM(pv.amount), 0)
            FROM payment_vouchers pv
            WHERE pv.invoice_id = NEW.invoice_id
              AND pv.direction = 'credit'
              AND pv.status <> 'voided'
          ) >= i.total_amount - 0.005;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_invoice_paid_on_voucher_paid()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paid'
       AND (OLD.status IS DISTINCT FROM 'paid')
       AND NEW.invoice_id IS NOT NULL THEN
        UPDATE invoices i
        SET status = 'paid'
        WHERE i.id = NEW.invoice_id
          AND i.status IN ('draft', 'issued')
          AND (
            SELECT COALESCE(SUM(pv.amount), 0)
            FROM payment_vouchers pv
            WHERE pv.invoice_id = NEW.invoice_id
              AND pv.direction = 'credit'
              AND pv.status <> 'voided'
          ) >= i.total_amount - 0.005;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Data fix: the one invoice wrongly flipped by the old trigger goes back to
-- issued — its RM 6,503.38 receipt stays and counts toward the balance.
UPDATE invoices
SET status = 'issued'
WHERE invoice_no = 'HV-INV-202607-0039'
  AND status = 'paid'
  AND settlement_voucher_id IS NULL;

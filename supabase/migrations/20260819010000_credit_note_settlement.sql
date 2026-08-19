-- Credit notes become real (2026-08-19, user: "要，然后我要有办法print 这张cn
-- 出来"). Until now a CN was a bare row: nothing listed it, approval had no
-- UI, it never posted GL and never reduced what the invoice collects. The app
-- side now: lists CNs on /billing, approve posts Dr <cn.category> / Cr 3030
-- (segment from the CN's pool), settle collects total − receipts − approved
-- CNs, and a per-CN PDF exists. DB side here:
--
-- (1) The mark-invoice-paid triggers (last touched 20260811010000) must treat
--     an invoice as fully collected when receipts cover total − approved CNs,
--     not the raw total — else a partial receipt that completes a credited
--     invoice would never flip it to paid.
-- (2) cn_no_delete blocked ALL deletes; Finance needs to bin a mis-entered
--     DRAFT (same UX as draft invoices). Approved CNs stay undeletable —
--     they have a JE behind them.

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
          ) >= i.total_amount
             - (
               SELECT COALESCE(SUM(cn.amount), 0)
               FROM credit_notes cn
               WHERE cn.invoice_id = NEW.invoice_id
                 AND cn.status = 'approved'
             )
             - 0.005;
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
          ) >= i.total_amount
             - (
               SELECT COALESCE(SUM(cn.amount), 0)
               FROM credit_notes cn
               WHERE cn.invoice_id = NEW.invoice_id
                 AND cn.status = 'approved'
             )
             - 0.005;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP POLICY IF EXISTS cn_no_delete ON credit_notes;
CREATE POLICY cn_delete_draft ON credit_notes
    FOR DELETE
    USING (
        status = 'draft'
        AND current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role])
    );

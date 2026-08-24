-- 2026-08-24: Monthly R&P 未收 goes INVOICE-based (user: paid = knocked off).
-- The GL-3030-per-segment view was polluted by old lump settle JEs posted in
-- the wrong segment (e.g. JE-202605-0051, whole batch under 'corporate').
-- This RPC returns dated events per invoice so the report can compute the
-- true outstanding as at each month end:
--   billed    = invoice total at invoice_date (fallback period_month)
--   collected = each direct receipt at its payment_date, PLUS (for invoices
--               settled by a batch voucher, which has no invoice_id link)
--               the residual total − direct receipts − CNs at the settlement
--               voucher's payment_date — verified to zero out all 140 paid
--               invoices with no double count (single settles link both ways
--               so their residual clamps to 0)
--   credited  = each approved CN at approved_at (fallback created_at)
-- Role scoping mirrors dept_invoice_settlements: dept_manager forced to own
-- segment; finance/principal pass p_segment (NULL = all segments).
CREATE OR REPLACE FUNCTION public.rnp_invoice_events(p_segment text DEFAULT NULL)
 RETURNS TABLE(
   invoice_id uuid,
   invoice_no text,
   company_id uuid,
   party_fallback text,
   event_kind text,
   amount numeric,
   event_date date
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_seg  text;
BEGIN
    v_role := current_user_role();
    IF v_role = 'dept_manager' THEN
        v_seg := current_user_segment()::text;
        IF v_seg IS NULL THEN
            RAISE EXCEPTION 'rnp_invoice_events: caller has no segment';
        END IF;
    ELSIF v_role IN ('finance', 'principal') THEN
        v_seg := p_segment;  -- NULL = consolidated (all segments)
    ELSE
        RAISE EXCEPTION 'rnp_invoice_events: role % may not read', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN QUERY
    WITH scoped AS (
        SELECT i.id, i.invoice_no AS inv_no, i.company_id AS co_id,
               i.billable_to_freetext_name AS freetext,
               i.total_amount, i.invoice_date, i.period_month,
               i.settlement_voucher_id,
               COALESCE((SELECT SUM(pv.amount) FROM payment_vouchers pv
                         WHERE pv.invoice_id = i.id
                           AND pv.direction = 'credit'
                           AND pv.status <> 'voided'), 0) AS direct_receipts,
               COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn
                         WHERE cn.invoice_id = i.id
                           AND cn.status = 'approved'), 0) AS credit_sum
        FROM invoices i
        WHERE i.status IN ('issued', 'paid', 'paid_via_netting')
          AND (v_seg IS NULL
               OR billing_mode_to_segment((i.billing_mode)::text) = v_seg::gl_segment)
    )
    SELECT s.id, s.inv_no, s.co_id, s.freetext,
           'billed'::text, s.total_amount::numeric,
           COALESCE(s.invoice_date, s.period_month)::date
    FROM scoped s
    UNION ALL
    SELECT s.id, s.inv_no, s.co_id, s.freetext,
           'collected'::text, pv.amount::numeric, pv.payment_date::date
    FROM scoped s
    JOIN payment_vouchers pv ON pv.invoice_id = s.id
    WHERE pv.direction = 'credit' AND pv.status <> 'voided'
    UNION ALL
    SELECT s.id, s.inv_no, s.co_id, s.freetext,
           'credited'::text, cn.amount::numeric,
           COALESCE(cn.approved_at::date, cn.created_at::date)
    FROM scoped s
    JOIN credit_notes cn ON cn.invoice_id = s.id
    WHERE cn.status = 'approved'
    UNION ALL
    SELECT s.id, s.inv_no, s.co_id, s.freetext,
           'collected'::text,
           GREATEST(s.total_amount - s.direct_receipts - s.credit_sum, 0)::numeric,
           sv.payment_date::date
    FROM scoped s
    JOIN payment_vouchers sv ON sv.id = s.settlement_voucher_id
    WHERE GREATEST(s.total_amount - s.direct_receipts - s.credit_sum, 0) > 0;
END;
$function$;

-- 20261031030100_whose_sale_asks.sql
--
-- WHOSE SALE? — THE FEED ASKS (2026-10-31; the rule and its parts: 20261031030000). A bill the ERP feed OPENS is asked
-- whose sale it is: erp_sync_check_seller holds it when its paper is already on another salesperson's order, until HR
-- answers on Comm Cal › the month › Whose sale. Applied once that tab is live — before it, a held bill would only vanish
-- from its month with nowhere to answer it.
--
-- erp_sync_after_delivery — production's body (md5 bd437686…, refused otherwise) with ONE block added at its end: a
-- delivery that opened a bill (`created …`) asks. In a block of its own: a fault there is a `whose_sale_check_failed`
-- warning on the delivery, never the delivery's failure, and never the audit trail's (the trail is written first).
--
-- Reversal: re-apply erp_sync_after_delivery from tests/member-sql/whose-sale-production.sql (production's body as of
-- 2026-10-31, md5 bd437686…).

BEGIN;

DO $guard$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(p.prosrc) INTO v_md5
      FROM pg_proc p
     WHERE p.oid = 'public.erp_sync_after_delivery(uuid, text, jsonb, jsonb, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'bd437686f00688e1491f47096ca21001' THEN
        RAISE EXCEPTION 'erp_sync_after_delivery has changed on this database (md5 %) — compare it with 20261031030100 before applying', v_md5;
    END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.erp_sync_after_delivery(p_sub_department_id uuid, p_doc_no text, p_order jsonb, p_result jsonb, p_before jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_status TEXT := p_result->>'status';
    v_event  UUID := NULLIF(p_result->>'eventId', '')::UUID;
    v_bill   UUID;
    v_period DATE;
    v_after  JSONB;
BEGIN
    IF p_doc_no IS NULL OR v_status IS NULL OR v_status NOT IN ('applied', 'held') THEN
        RETURN p_result;
    END IF;
    BEGIN
        SELECT o.id, o.period_month INTO v_bill, v_period
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id AND b.sub_department_id = p_sub_department_id
         WHERE o.order_no = p_doc_no AND o.source = 'erp_sync';
        IF p_before IS NULL AND v_bill IS NULL THEN
            RETURN p_result;
        END IF;
        IF COALESCE((p_order->>'deleted')::BOOLEAN, FALSE) THEN
            v_after := COALESCE(p_before, '{}'::JSONB) || JSONB_BUILD_OBJECT('deleted', TRUE, 'status', 'DELETED', 'commissionable', 0);
        ELSE
            v_after := erp_order_state(p_order, erp_sync_scheme_of(p_sub_department_id));
        END IF;
        IF v_status = 'applied' AND v_bill IS NOT NULL THEN
            PERFORM erp_sync_note_adjustment(v_bill, p_order, v_event);
        END IF;
        PERFORM erp_sync_note_change(p_sub_department_id, p_doc_no, v_bill, v_event, v_status,
                    COALESCE(v_period, NULLIF(p_result->>'periodMonth', '')::DATE),
                    p_before, v_after, NULLIF(p_order->>'snapshotAt', '')::TIMESTAMPTZ);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'erp_sync_after_delivery(%): %', p_doc_no, SQLERRM;
        IF v_event IS NOT NULL THEN
            UPDATE erp_sync_events
               SET warnings = ARRAY_APPEND(warnings, 'change_trail_failed')
             WHERE id = v_event;
        END IF;
    END;
    -- (20261031030100) A bill this delivery opened, on a paper another salesperson's order already carries, waits for
    -- HR to say whose sale it is. A block of its own: a fault here is a warning on the delivery, never its failure.
    IF v_status = 'applied' AND v_bill IS NOT NULL AND COALESCE(p_result->>'message', '') LIKE 'created%' THEN
        BEGIN
            PERFORM erp_sync_check_seller(v_bill, v_event);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'erp_sync_check_seller(%): %', p_doc_no, SQLERRM;
            IF v_event IS NOT NULL THEN
                UPDATE erp_sync_events
                   SET warnings = ARRAY_APPEND(warnings, 'whose_sale_check_failed')
                 WHERE id = v_event;
            END IF;
        END;
    END IF;
    RETURN p_result;
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';

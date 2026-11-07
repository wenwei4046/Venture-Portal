-- 20261107183000_whose_sale_paper_changed.sql
--
-- WHOSE SALE? — THE PAPER CHANGED BEFORE HR ANSWERED (2026-11-07, IT-0009 — JAMES SEOW: "HC-SO-2610-457 · HC11703 I
-- got create in ERP, but didn't show at houzs venture app, I key it at 31/10/2026 (PWCC)").
--
-- What happened. The ERP opened HC-SO-2610-457 at 15:31:35 (UTC) with Ref No. HC10865 — a paper already on LUCAS's
-- HC-SO-011582 (30 Apr 2026). The check (20261031030000) held it, as it should: *Whose sale? HC10865 is on Lucas's
-- HC-SO-011582*. Two seconds later the ERP saved it again with HC11703 — the paper James meant — and five more saves
-- followed. Nobody else's order carries HC11703, so there was nothing left to ask; but the check is asked once, on the
-- delivery that OPENS a bill, and an `updated` delivery never looked at the question again. The bill stayed out of
-- James's October (Revenue app, his sales, KPI) under the check's name, waiting for an answer to a question about a
-- paper the bill no longer carried. On 2026-11-07 it was the only one of the 3 waiting questions whose evidence was gone.
--
-- The rule this adds: a delivery APPLIED to a bill the portal already had (not `created`) whose paper question still
-- WAITS asks the evidence again (sales_order_seller_evidence, the same rule) —
--   * nothing found any more (the Ref No. changed, the other order went): nothing is left to ask. The question comes
--     off, and the bill counts again if it is held under the check's own name (`Whose sale check`, nobody's hand on
--     it — revenue_include_order, as HR's *Their own sale* does). A bill counted by hand meanwhile simply loses its
--     question. The delivery says `whose_sale_cleared`.
--   * still found, but not what was asked: the question's evidence and the held bill's note say what is found now, so
--     HR answers about the paper the bill carries. Nothing on the delivery.
-- Untouched: a question HR has answered (theirs / not theirs is HR's word), a bill whose exclusion is somebody's own
-- (a person's *Don't count this bill*, HR's *Not theirs*), a month whose run has paid, the `erp_moved` kind, and a bill
-- only updated that was never asked (the rule stays: asked on the delivery that opens it).
--
-- 1. erp_sync_recheck_seller(order, event) — the above. DEFINER; a signed-in caller (a replay) needs Revenue · Edit on
--    the month page's tab, as erp_sync_check_seller.
-- 2. erp_sync_after_delivery — PRODUCTION's body (md5 bd763c20…, refused otherwise), one block put in before the
--    20261031040000 move block, by text replacement of the live body (pg_get_functiondef), nothing else moved. In a
--    block of its own: a fault is the delivery's `whose_sale_recheck_failed` warning, never its failure.
-- 3. HC-SO-2610-457 itself is let go by the next delivery of it, or by hand: SELECT erp_sync_recheck_seller('<id>').
--    This migration lets it go (the one waiting question whose evidence is gone on 2026-11-07).
--
-- Reversal: re-apply erp_sync_after_delivery from 20261031040000 (md5 bd763c20…); DROP FUNCTION
-- erp_sync_recheck_seller(uuid, uuid). A question let go is not put back (ask it again with erp_sync_check_seller).

BEGIN;

DO $guard$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(p.prosrc) INTO v_md5
      FROM pg_proc p
     WHERE p.oid = 'public.erp_sync_after_delivery(uuid, text, jsonb, jsonb, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'bd763c208900b9eaa63e85bbd5cf4a7a' THEN
        RAISE EXCEPTION 'erp_sync_after_delivery has changed on this database (md5 %) — compare it with 20261107183000 before applying', v_md5;
    END IF;
END
$guard$;

-- ── 1. Asking again ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.erp_sync_recheck_seller(p_order_id UUID, p_event_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_me    public.sales_orders%ROWTYPE;
    v_c     public.sales_order_seller_checks%ROWTYPE;
    v_ev    JSONB;
    v_first JSONB;
    v_held  BOOLEAN;
BEGIN
    -- As erp_sync_check_seller: the feed calls it with no sign-in; anybody else holds what takes a bill out by hand.
    IF auth.uid() IS NOT NULL THEN
        IF NOT COALESCE(public.has_any_action(ARRAY['revenue.edit']), FALSE) THEN
            RAISE EXCEPTION 'Not open to your account.' USING ERRCODE = '42501';
        END IF;
        PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']);
    END IF;
    SELECT * INTO v_c FROM public.sales_order_seller_checks
     WHERE order_id = p_order_id AND kind = 'paper' AND status = 'waiting' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_me FROM public.sales_orders WHERE id = p_order_id;
    IF NOT FOUND OR public.commission_order_period_locked(v_c.sub_department_id, v_me.period_month) THEN
        RETURN NULL;
    END IF;
    -- Held by the check itself — nobody's hand on it since.
    SELECT EXISTS (SELECT 1 FROM public.sales_order_exclusions x
                    WHERE x.order_id = p_order_id AND x.excluded_by IS NULL AND x.excluded_by_name = 'Whose sale check')
      INTO v_held;

    v_ev := public.sales_order_seller_evidence(p_order_id);
    IF JSONB_ARRAY_LENGTH(COALESCE(v_ev->'orders', '[]'::JSONB)) = 0 THEN
        -- Nothing left to ask: the question comes off, and the bill counts as if it had never been held.
        DELETE FROM public.sales_order_seller_checks WHERE order_id = p_order_id AND kind = 'paper';
        IF v_held THEN
            PERFORM public.revenue_include_order(p_order_id);
        END IF;
        IF p_event_id IS NOT NULL THEN
            UPDATE public.erp_sync_events SET warnings = ARRAY_APPEND(warnings, 'whose_sale_cleared') WHERE id = p_event_id;
        END IF;
        RETURN JSONB_BUILD_OBJECT('orderNo', v_me.order_no, 'cleared', TRUE,
                                  'counts', (SELECT NOT o.cancelled FROM public.sales_orders o WHERE o.id = p_order_id));
    END IF;

    IF (v_ev->'orders') IS DISTINCT FROM (v_c.evidence->'orders') THEN
        -- Still asked, about what the bill carries now.
        v_first := v_ev->'orders'->0;
        UPDATE public.sales_order_seller_checks
           SET evidence = v_ev, seller_name = v_first->>'seller'
         WHERE order_id = p_order_id AND kind = 'paper';
        IF v_held THEN
            UPDATE public.sales_order_exclusions
               SET note = LEFT(FORMAT('Whose sale? %s is on %s''s %s%s',
                                      v_first->'papers'->>0, v_first->>'seller', v_first->>'docNo',
                                      CASE WHEN v_first->>'soldOn' IS NULL THEN ''
                                           ELSE ' (' || TO_CHAR((v_first->>'soldOn')::DATE, 'FMDD Mon YYYY') || ')' END), 500)
             WHERE order_id = p_order_id;
        END IF;
    END IF;
    RETURN JSONB_BUILD_OBJECT('orderNo', v_me.order_no, 'cleared', FALSE);
END
$fn$;

COMMENT ON FUNCTION public.erp_sync_recheck_seller(UUID, UUID) IS
    'Whose sale? A waiting paper question asked again on a later delivery of its bill: nothing found any more (the Ref No. changed) → the question comes off and a bill held by the check counts again (whose_sale_cleared); found but different → the question''s evidence and the held bill''s note follow. An answered question, a hand-made exclusion, a paid month: untouched. Called by erp_sync_after_delivery for an applied delivery that did not open the bill (20261107183000, IT-0009); a signed-in caller needs Revenue · Edit on the month page.';

REVOKE ALL ON FUNCTION public.erp_sync_recheck_seller(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_recheck_seller(UUID, UUID) TO authenticated, service_role;

-- ── 2. The receiver asks it — production's body, one block put in ───────────

DO $swap$
DECLARE
    v_def    TEXT := pg_get_functiondef('public.erp_sync_after_delivery(uuid, text, jsonb, jsonb, jsonb)'::regprocedure);
    v_anchor TEXT := E'    -- (20261031040000) A bill the portal had, given by the ERP to another salesperson';
    v_block  TEXT := E'    -- (20261107183000) A bill the portal had, still waiting on whose sale it is: asked again, so a Ref No. changed\n'
                  || E'    -- since leaves nothing to ask (IT-0009). A block of its own, as above.\n'
                  || E'    IF v_status = ''applied'' AND v_bill IS NOT NULL AND COALESCE(p_result->>''message'', '''') NOT LIKE ''created%'' THEN\n'
                  || E'        BEGIN\n'
                  || E'            PERFORM erp_sync_recheck_seller(v_bill, v_event);\n'
                  || E'        EXCEPTION WHEN OTHERS THEN\n'
                  || E'            RAISE WARNING ''erp_sync_recheck_seller(%): %'', p_doc_no, SQLERRM;\n'
                  || E'            IF v_event IS NOT NULL THEN\n'
                  || E'                UPDATE erp_sync_events\n'
                  || E'                   SET warnings = ARRAY_APPEND(warnings, ''whose_sale_recheck_failed'')\n'
                  || E'                 WHERE id = v_event;\n'
                  || E'            END IF;\n'
                  || E'        END;\n'
                  || E'    END IF;\n';
BEGIN
    IF (LENGTH(v_def) - LENGTH(REPLACE(v_def, v_anchor, ''))) / LENGTH(v_anchor) <> 1 THEN
        RAISE EXCEPTION 'erp_sync_after_delivery: the 20261031040000 block is not there exactly once';
    END IF;
    EXECUTE REPLACE(v_def, v_anchor, v_block || v_anchor);
END
$swap$;

-- ── 3. HC-SO-2610-457 (IT-0009), and any other question whose paper is gone ─

SELECT public.erp_sync_recheck_seller(c.order_id)
  FROM public.sales_order_seller_checks c
 WHERE c.kind = 'paper' AND c.status = 'waiting';

COMMIT;

NOTIFY pgrst, 'reload schema';

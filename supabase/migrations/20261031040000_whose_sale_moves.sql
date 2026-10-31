-- 20261031040000_whose_sale_moves.sql
--
-- WHOSE SALE? — A BILL THE ERP GIVES TO SOMEBODY ELSE (2026-10-31; the rule and its parts: 20261031030000 /
-- 20261031030100. The user, asked whether the portal should also stop a bill the ERP moves to another salesperson after
-- the portal has it — on 9 Sep the ERP moved 362 orders of salespeople who had left to SHAWN, none of them portal bills,
-- and the change trail holds no such move since it began on 13 Oct — answered "do 1"; then, told the plain version
-- would let the sale follow the ERP until HR answered: "我要先拦住 然后hr take action 才continue").
--
-- Until now the receiver rewrote a bill's salesperson from the ERP on every save, silently: KINGSLEY's bill became
-- SHAWN's sale in its month the moment somebody changed the ERP's salesperson. Now such a delivery is STOPPED: the bill
-- stays KINGSLEY's — kept through revenue_move_order, the Move a bill to another salesperson rule (pinned: every later
-- save keeps it; its Open Bill pick and shares as that rule says) — and HR is asked on Comm Cal › the month › Whose
-- sale: *Keep KINGSLEY's* leaves it so (HR's note on the move); *SHAWN's now* takes the pin off, and the bill goes where
-- the ERP puts it.
--
-- 1. sales_order_seller_checks takes a second kind, `erp_moved` — one question a bill; its evidence {from {staffId,
--    name}, to {staffId, name}, movedAt}.
-- 2. erp_sync_note_seller_move(order, before, after, event) — stops it: a counting bill of the feed with a salesperson,
--    in a month no run has paid, NOT moved on Comm Cal already (by hand, or kept by an earlier question — its holder is
--    the portal's then, whatever the ERP says), whose ERP salesperson before was one of OUR people (an alias) and is now
--    somebody else. Writes the question, keeps the bill with whom it was, marks the delivery `whose_sale_moved`.
--    Moved AGAIN before HR answers (its question waiting, its pin as the stop left it), the question follows the ERP:
--    given on to another of ours, it is asked about them now — still kept, the pin's note saying so; given back to whom
--    it was kept for (as 9 Sep's handover to SHAWN was undone on 10 Sep), nothing is left to ask and the stop comes off,
--    its question and its pin (`whose_sale_move_undone`) — unless the pin took a part of the bill or its Open Bill pick,
--    which only Move's own way gives back: HR answers that one. Given to somebody not ours, it stays as it was asked.
-- 3. erp_sync_after_delivery — 20261031030100's body (md5 9bd424e8…, refused otherwise) with one more block after the
--    whose-sale one: an APPLIED delivery of a bill the portal had (not `created`) whose `salespersonId` changed asks.
--    In a block of its own: a fault is a `whose_sale_move_failed` warning, never the delivery's failure.
-- 4. revenue_answer_seller_move(order, keep, note) — HR's answer, Revenue · Edit on the month page's tab.
--
-- Reversal: re-apply erp_sync_after_delivery from 20261031030100; answer every `erp_moved` question still waiting (or
-- take its pin off with revenue_move_order(order, NULL)); DROP FUNCTION revenue_answer_seller_move(uuid, boolean, text),
-- erp_sync_note_seller_move(uuid, jsonb, jsonb, uuid); DELETE the `erp_moved` questions; put the kind check back to
-- ('paper').

BEGIN;

DO $guard$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(p.prosrc) INTO v_md5
      FROM pg_proc p
     WHERE p.oid = 'public.erp_sync_after_delivery(uuid, text, jsonb, jsonb, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '9bd424e8d5a67294379a2263a26a4ea5' THEN
        RAISE EXCEPTION 'erp_sync_after_delivery has changed on this database (md5 %) — compare it with 20261031040000 before applying', v_md5;
    END IF;
END
$guard$;

-- ── 1. A move is a question of its own kind ─────────────────────────────────

ALTER TABLE public.sales_order_seller_checks DROP CONSTRAINT IF EXISTS sales_order_seller_checks_kind_check;
ALTER TABLE public.sales_order_seller_checks
    ADD CONSTRAINT sales_order_seller_checks_kind_check CHECK (kind IN ('paper', 'erp_moved'));

-- ── 2. Asking it ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.erp_sync_note_seller_move(p_order_id UUID, p_before JSONB, p_after JSONB,
                                                           p_event_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_me        public.sales_orders%ROWTYPE;
    v_pin       public.sales_order_reassignments%ROWTYPE;
    v_asked     public.sales_order_seller_checks%ROWTYPE;
    v_sub       UUID;
    v_from      UUID;
    v_now       UUID;
    v_from_name TEXT;
    v_to_name   TEXT;
    v_ev        JSONB;
BEGIN
    -- The feed calls it with no sign-in; a held delivery replayed, as whoever replays it (as erp_sync_check_seller).
    IF auth.uid() IS NOT NULL THEN
        IF NOT COALESCE(public.has_any_action(ARRAY['revenue.edit']), FALSE) THEN
            RAISE EXCEPTION 'Not open to your account.' USING ERRCODE = '42501';
        END IF;
        PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']);
    END IF;
    SELECT * INTO v_me FROM public.sales_orders WHERE id = p_order_id;
    IF NOT FOUND OR v_me.source <> 'erp_sync' OR v_me.cancelled OR v_me.order_total <= 0 OR v_me.staff_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM public.sales_import_batches b WHERE b.id = v_me.batch_id;
    IF v_sub IS NULL OR public.commission_order_period_locked(v_sub, v_me.period_month) THEN
        RETURN NULL;
    END IF;
    SELECT r.* INTO v_pin FROM public.sales_order_reassignments r WHERE r.order_id = p_order_id;
    IF FOUND THEN
        -- Moved on Comm Cal already — by hand, or kept by HR's answer: its holder is the portal's, whatever the ERP says
        -- — nothing to ask. Only a bill this check stopped, its question still waiting and its pin as the stop left it,
        -- follows the ERP's later moves.
        SELECT c.* INTO v_asked FROM public.sales_order_seller_checks c
         WHERE c.order_id = p_order_id AND c.kind = 'erp_moved' AND c.status = 'waiting';
        IF NOT FOUND OR v_pin.staff_id IS DISTINCT FROM NULLIF(v_asked.evidence->'from'->>'staffId', '')::UUID THEN
            RETURN NULL;
        END IF;
        SELECT a.staff_id INTO v_now
          FROM public.comm_agent_aliases a
         WHERE a.erp_salesperson_id = NULLIF(BTRIM(p_after->>'salespersonId'), '') AND a.staff_id IS NOT NULL
         LIMIT 1;
        -- Given to somebody not ours, or to whom it is asked about already: it stays as it was asked.
        IF v_now IS NULL OR v_now IS NOT DISTINCT FROM NULLIF(v_asked.evidence->'to'->>'staffId', '')::UUID THEN
            RETURN NULL;
        END IF;
        IF v_now = v_pin.staff_id THEN
            -- Given back before HR answered (as 9 Sep's handover to SHAWN was undone on 10 Sep): nothing is left to ask,
            -- and the stop comes off — its question and its pin; the bill is theirs already and stays so. A pin that
            -- took a part of the bill or its Open Bill pick is left for HR: only Move's own way gives those back.
            IF v_pin.share_taken_pct IS NOT NULL OR v_pin.open_bill_rank IS NOT NULL THEN
                RETURN NULL;
            END IF;
            DELETE FROM public.sales_order_seller_checks WHERE order_id = p_order_id AND kind = 'erp_moved';
            DELETE FROM public.sales_order_reassignments WHERE order_id = p_order_id;
            IF p_event_id IS NOT NULL THEN
                UPDATE public.erp_sync_events SET warnings = ARRAY_APPEND(warnings, 'whose_sale_move_undone') WHERE id = p_event_id;
            END IF;
            RETURN JSONB_BUILD_OBJECT('undone', TRUE, 'staffId', v_now);
        END IF;
        -- Given on to another of ours: still kept, and asked about where the ERP puts it now — so "LUCAS's now" sends it
        -- to LUCAS, and the closes asked first are LUCAS's.
        SELECT s.employee_name INTO v_to_name FROM public.hr_staff_costs s WHERE s.id = v_now;
        v_ev := JSONB_BUILD_OBJECT('from', v_asked.evidence->'from',
            'to', JSONB_BUILD_OBJECT('staffId', v_now, 'name', COALESCE(v_to_name, p_after->>'salesperson', '(somebody)')),
            'movedAt', NOW());
        UPDATE public.sales_order_seller_checks
           SET staff_id = v_now, evidence = v_ev, event_id = p_event_id, asked_at = NOW()
         WHERE order_id = p_order_id AND kind = 'erp_moved';
        PERFORM public.revenue_move_order(p_order_id, v_pin.staff_id,
            LEFT(FORMAT('Kept as %s''s until HR answers — the ERP gave it to %s', v_ev->'from'->>'name', v_ev->'to'->>'name'), 500));
        IF p_event_id IS NOT NULL THEN
            UPDATE public.erp_sync_events SET warnings = ARRAY_APPEND(warnings, 'whose_sale_moved') WHERE id = p_event_id;
        END IF;
        RETURN v_ev;
    END IF;
    -- Whose it was: the ERP's salesperson before, one of ours through its alias.
    SELECT a.staff_id INTO v_from
      FROM public.comm_agent_aliases a
     WHERE a.erp_salesperson_id = NULLIF(BTRIM(p_before->>'salespersonId'), '') AND a.staff_id IS NOT NULL
     LIMIT 1;
    IF v_from IS NULL OR v_from = v_me.staff_id THEN
        RETURN NULL;
    END IF;
    SELECT s.employee_name INTO v_from_name FROM public.hr_staff_costs s WHERE s.id = v_from;
    SELECT s.employee_name INTO v_to_name FROM public.hr_staff_costs s WHERE s.id = v_me.staff_id;
    v_ev := JSONB_BUILD_OBJECT(
        'from', JSONB_BUILD_OBJECT('staffId', v_from, 'name', COALESCE(v_from_name, p_before->>'salesperson', '(somebody)')),
        'to', JSONB_BUILD_OBJECT('staffId', v_me.staff_id, 'name', COALESCE(v_to_name, p_after->>'salesperson', '(somebody)')),
        'movedAt', NOW());

    INSERT INTO public.sales_order_seller_checks (order_id, kind, sub_department_id, staff_id, seller_name, evidence, event_id)
    VALUES (p_order_id, 'erp_moved', v_sub, v_me.staff_id, v_ev->'from'->>'name', v_ev, p_event_id)
    ON CONFLICT (order_id, kind) DO UPDATE
       SET staff_id = EXCLUDED.staff_id, seller_name = EXCLUDED.seller_name, evidence = EXCLUDED.evidence,
           event_id = EXCLUDED.event_id, status = 'waiting', asked_at = NOW(),
           decided_by = NULL, decided_by_name = NULL, decided_at = NULL, note = NULL;
    -- Stopped: the bill stays with whom it was until HR answers — the Move rule, as if HR had moved it back by hand.
    PERFORM public.revenue_move_order(p_order_id, v_from,
        LEFT(FORMAT('Kept as %s''s until HR answers — the ERP gave it to %s', v_ev->'from'->>'name', v_ev->'to'->>'name'), 500));
    IF p_event_id IS NOT NULL THEN
        UPDATE public.erp_sync_events SET warnings = ARRAY_APPEND(warnings, 'whose_sale_moved') WHERE id = p_event_id;
    END IF;
    RETURN v_ev;
END
$fn$;

COMMENT ON FUNCTION public.erp_sync_note_seller_move(UUID, JSONB, JSONB, UUID) IS
    'Whose sale? A bill the ERP gave to another salesperson after the portal had it is stopped: kept with whom it was (revenue_move_order — pinned) and asked (kind erp_moved) until HR answers (revenue_answer_seller_move). Only a counting bill of the feed, its month unpaid, not moved on Comm Cal already, whose ERP salesperson was one of ours before. Moved again while it waits, the question follows the ERP: given on to another of ours, asked about them; given back to whom it was kept for, the question and its pin come off (whose_sale_move_undone) unless the pin took a share or an Open Bill pick. Called by erp_sync_after_delivery (20261031040000).';

REVOKE ALL ON FUNCTION public.erp_sync_note_seller_move(UUID, JSONB, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_note_seller_move(UUID, JSONB, JSONB, UUID) TO authenticated, service_role;

-- ── 3. erp_sync_after_delivery — 20261031030100's body, one block added ──────

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
    -- (20261031040000) A bill the portal had, given by the ERP to another salesperson: kept with whom it was until HR
    -- answers. A block of its own, as above.
    IF v_status = 'applied' AND v_bill IS NOT NULL AND p_before IS NOT NULL AND v_after IS NOT NULL
       AND COALESCE(p_result->>'message', '') NOT LIKE 'created%'
       AND NULLIF(BTRIM(p_before->>'salespersonId'), '') IS DISTINCT FROM NULLIF(BTRIM(v_after->>'salespersonId'), '') THEN
        BEGIN
            PERFORM erp_sync_note_seller_move(v_bill, p_before, v_after, v_event);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'erp_sync_note_seller_move(%): %', p_doc_no, SQLERRM;
            IF v_event IS NOT NULL THEN
                UPDATE erp_sync_events
                   SET warnings = ARRAY_APPEND(warnings, 'whose_sale_move_failed')
                 WHERE id = v_event;
            END IF;
        END;
    END IF;
    RETURN p_result;
END;
$function$;

-- ── 4. HR's answer ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_answer_seller_move(p_order_id UUID, p_keep BOOLEAN, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_me    UUID := auth.uid();
    v_c     public.sales_order_seller_checks%ROWTYPE;
    v_note  TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
    v_who   TEXT;
    v_from  UUID;
    v_to    UUID;
    v_pin   UUID;
    v_order public.sales_orders%ROWTYPE;
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['revenue.edit']), FALSE) THEN
        RAISE EXCEPTION 'Answering whose sale a bill is is not open to your account.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']);
    IF p_keep IS NULL THEN
        RAISE EXCEPTION 'Keep it where it was, or where the ERP put it?' USING ERRCODE = '22023';
    END IF;
    IF LENGTH(COALESCE(v_note, '')) > 500 THEN
        RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_c FROM public.sales_order_seller_checks WHERE order_id = p_order_id AND kind = 'erp_moved' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is not waiting on a move.' USING ERRCODE = '22023';
    END IF;
    v_from := NULLIF(v_c.evidence->'from'->>'staffId', '')::UUID;
    v_to := NULLIF(v_c.evidence->'to'->>'staffId', '')::UUID;
    SELECT r.staff_id INTO v_pin FROM public.sales_order_reassignments r WHERE r.order_id = p_order_id;
    SELECT COALESCE(NULLIF(BTRIM(s.employee_name), ''), NULLIF(BTRIM(u.name), ''), u.email, 'HR') INTO v_who
      FROM public.users u
      LEFT JOIN LATERAL (SELECT x.employee_name FROM public.hr_staff_costs x WHERE x.user_id = u.id AND x.status = 'active'
                          ORDER BY x.created_at, x.id LIMIT 1) s ON TRUE
     WHERE u.id = v_me;
    v_who := COALESCE(v_who, 'HR');

    IF p_keep THEN
        -- It stays with whom it was — kept already when the move was stopped; the Move rule writes HR's word on it (or
        -- moves it back, if it was let go meanwhile: 23RUN on a paid month, 23EXC on a bill that does not count).
        PERFORM public.revenue_move_order(p_order_id, v_from,
            LEFT(FORMAT('Kept as %s''s — the ERP gave it to %s%s', v_c.evidence->'from'->>'name', v_c.evidence->'to'->>'name',
                        CASE WHEN v_note IS NULL THEN '' ELSE ': ' || v_note END), 500));
    ELSIF v_pin IS NOT NULL THEN
        -- Let go: the pin comes off, and the bill goes where the ERP puts it (revenue_move_order with nobody named).
        PERFORM public.revenue_move_order(p_order_id, NULL, NULL);
    END IF;

    UPDATE public.sales_order_seller_checks
       SET status = CASE WHEN p_keep THEN 'not_theirs' ELSE 'theirs' END,
           decided_by = v_me, decided_by_name = v_who, decided_at = NOW(), note = v_note
     WHERE order_id = p_order_id AND kind = 'erp_moved';

    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
    RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no,
                              'status', CASE WHEN p_keep THEN 'not_theirs' ELSE 'theirs' END,
                              'counts', NOT v_order.cancelled,
                              'staffId', v_order.staff_id);
END
$fn$;

COMMENT ON FUNCTION public.revenue_answer_seller_move(UUID, BOOLEAN, TEXT) IS
    'Whose sale? HR''s answer on a bill the ERP gave to another salesperson, kept with whom it was meanwhile: keep = it stays so (revenue_move_order, pinned, HR''s word on it); not keep = the pin comes off and it goes where the ERP puts it. May be answered again either way while the month''s run has not paid. Revenue · Edit on the month page''s tab (20261031040000).';

REVOKE ALL ON FUNCTION public.revenue_answer_seller_move(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_answer_seller_move(UUID, BOOLEAN, TEXT) TO authenticated;

-- The guard the scan reads (tab-write-guards.test.ts): the answer asks the month's page in the database, as the app's
-- gate in front of it does (requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.revenue_answer_seller_move(uuid, boolean, text)',
  $$ARRAY['/revenue/[sub]/[period]']$$, ARRAY['revenue.edit']);

COMMIT;

NOTIFY pgrst, 'reload schema';

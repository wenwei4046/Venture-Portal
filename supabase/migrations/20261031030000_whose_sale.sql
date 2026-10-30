-- 20261031030000_whose_sale.sql
--
-- WHOSE SALE? (2026-10-31 — the user, on SHAWN: "其实他还有帮一些 salesperson，就是那些已经离职的 salesperson 在处理
-- 单子。如果没有人接手的话，他们好像是把那些 salesperson 的单移到了他的身上 … 主要目的是要能够分开哪些是真正他自己开的
-- 单，哪些是他只是帮人家处理的单，要不然会变成 double claim 的问题"; shown what was found and the fix proposed: "do that
-- as well. so that can differentiate"; and on the word share: a Share order request — two salespeople, 50% each — is a
-- normal sale; the ERP's Shared with is somebody else's order handled, never a sale).
--
-- What happened. An order sold by somebody who left keeps a customer to look after. AutoCount's orders are view-only in
-- the ERP, so whoever looks after it keys it again as a NEW order — and the ERP's new order is the keyer's: the
-- salesperson defaults to whoever keys it and its list offers only salespeople still active (SalesOrderNew.tsx). The feed
-- sends that order as the keyer's new sale of the month. In September HR took eight of SHAWN's out by hand ("help resign
-- person create", RM 47,666); in October six more were counting — STEPHY's HC12110 (HC-SO-008712, Oct 2025, the same
-- RM 7,794), YANG's HC9882+ZNT4864, WEI HOW's HC14399, and ZNT6186, which the August claim form had already paid WEI HOW.
-- The Double claims check could not see most of them: their first order was never a bill of the portal's.
--
-- The rule this adds: a bill the feed OPENS whose paper number is already on ANOTHER salesperson's order — a bill of the
-- portal's (the ERP's, or a claim form's row), or an older order of the ERP's own — is held (it does not count: out of the
-- month's sales, the Revenue app, override, KPI and Open Bill, exactly as *Don't count this bill*) until HR answers on Comm
-- Cal › the month › Whose sale: *Their own sale* counts it, *Not theirs* keeps it out in HR's name. Nothing else holds a
-- bill: a salesperson missing from a fair's booth list is said beside the papers, never alone (the lists are not whole —
-- 106 of 575 September–October bills were sold by somebody the booth did not list, 2026-10-31). The ERP's Shared with
-- ("collaborator_staff_ids" — who may work an order) is said too: it is who HANDLES an order, never a part of its sale,
-- and nothing here or anywhere reads it as one (a Share order is `sales_order_shares`, untouched).
--
-- 1. erp_order_papers — the ERP's orders the portal never had as bills, by paper: whose each was. Loaded from the ERP's
--    database (scm.mfg_sales_orders, company 1: 3,643 orders on 2026-10-31) by scripts/load-erp-order-papers.mjs, never
--    edited here; papers = sales_order_bill_refs(doc_no, ref_no), as a bill's (20261031013000). RLS on, nobody's to read
--    but the functions below.
-- 2. sales_order_seller_checks — one question per bill: the evidence when it was asked, waiting / theirs / not_theirs,
--    who answered. RLS on, no client grant: read through revenue_seller_checks, answered through
--    revenue_answer_seller_check.
-- 3. sales_order_seller_evidence(order) — the other salespeople's orders on the bill's papers, dated before it: the
--    portal's bills of every source, and erp_order_papers' orders the portal has no bill of. The same person is never
--    evidence — by staff, the ERP's salesperson id, the alias of it, or the name. The booth said only beside them.
-- 4. erp_sync_check_seller(order, event) — asks it once, for a counting bill with a salesperson, in a month no run has
--    paid: writes the question, takes the bill out through revenue_exclude_order (its Open Bill pick, the day's order and
--    the batch follow, as by hand) under the check's own name, and marks the delivery `whose_sale`.
-- 5. erp_sync_after_delivery — production's body (md5 bd437686…, refused otherwise) with ONE block added at its end: a
--    delivery that opened a bill (`created …`) asks. In a block of its own: a fault there is a `whose_sale_check_failed`
--    warning on the delivery, never the delivery's failure, and never the audit trail's.
-- 6. revenue_seller_checks(sub, period) — the tab's reader, Revenue · View (or Edit).
-- 7. revenue_answer_seller_check(order, theirs, note) — HR's answer, Revenue · Edit on the month page's tab.
--
-- Reversal: re-apply erp_sync_after_delivery from tests/member-sql/whose-sale-production.sql (production's body as of
-- 2026-10-31, md5 bd437686…); count the held bills again (revenue_include_order for every check still `waiting`); then
-- DROP FUNCTION revenue_answer_seller_check(uuid, boolean, text), revenue_seller_checks(uuid, date),
-- erp_sync_check_seller(uuid, uuid), sales_order_seller_evidence(uuid); DROP TABLE sales_order_seller_checks,
-- erp_order_papers; DELETE FROM audit_tables WHERE table_name IN ('sales_order_seller_checks', 'erp_order_papers').

BEGIN;

-- ── 0. The body this was written from ───────────────────────────────────────

DO $guard$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(p.prosrc) INTO v_md5
      FROM pg_proc p
     WHERE p.oid = 'public.erp_sync_after_delivery(uuid, text, jsonb, jsonb, jsonb)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'bd437686f00688e1491f47096ca21001' THEN
        RAISE EXCEPTION 'erp_sync_after_delivery has changed on this database (md5 %) — compare it with 20261031030000 before applying', v_md5;
    END IF;
END
$guard$;

-- ── 1. The ERP's orders, by paper ───────────────────────────────────────────

CREATE TABLE public.erp_order_papers (
    doc_no             TEXT PRIMARY KEY,
    ref_no             TEXT,
    papers             TEXT[] GENERATED ALWAYS AS (sales_order_bill_refs(doc_no, ref_no)) STORED,
    so_date            DATE,
    erp_created_at     TIMESTAMPTZ,
    erp_salesperson_id TEXT,
    salesperson_name   TEXT,
    salesperson_active BOOLEAN,
    shared_with        TEXT[] NOT NULL DEFAULT '{}',
    status             TEXT,
    total              NUMERIC(15, 2),
    loaded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.erp_order_papers IS
    'The ERP''s sales orders by paper number — whose sale each was (salesperson, active or not, as the ERP had them) and who may work it there (shared_with = the ERP''s Shared with, collaborator_staff_ids: never a part of the sale). Loaded from scm.mfg_sales_orders (company 1) by scripts/load-erp-order-papers.mjs, never edited here; read by sales_order_seller_evidence for the orders the portal has no bill of (20261031030000).';

CREATE INDEX erp_order_papers_papers_idx ON public.erp_order_papers USING GIN (papers);

ALTER TABLE public.erp_order_papers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_order_papers FROM anon, authenticated;

SELECT public.audit_register('erp_order_papers', 'ERP order papers', 'Revenue', '{}', 'none',
    p_reason => 'A copy of the ERP''s orders by paper number, loaded from the ERP and never edited here: the ERP is its record');

-- ── 2. The questions ────────────────────────────────────────────────────────

CREATE TABLE public.sales_order_seller_checks (
    order_id          UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    kind              TEXT NOT NULL CHECK (kind IN ('paper')),
    sub_department_id UUID NOT NULL,
    staff_id          UUID,
    seller_name       TEXT,
    evidence          JSONB NOT NULL DEFAULT '{}'::JSONB,
    status            TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'theirs', 'not_theirs')),
    asked_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_id          UUID,
    decided_by        UUID,
    decided_by_name   TEXT,
    decided_at        TIMESTAMPTZ,
    note              TEXT CHECK (note IS NULL OR LENGTH(note) <= 500),
    PRIMARY KEY (order_id, kind)
);

COMMENT ON TABLE public.sales_order_seller_checks IS
    'Whose sale? One question per bill the feed opened on a paper another salesperson''s order already carries: what was found when it was asked (evidence), waiting / theirs / not_theirs, and who answered. Written by erp_sync_check_seller and revenue_answer_seller_check, read by revenue_seller_checks (20261031030000).';

CREATE INDEX sales_order_seller_checks_sub ON public.sales_order_seller_checks (sub_department_id, status);

ALTER TABLE public.sales_order_seller_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_order_seller_checks FROM anon, authenticated;

SELECT public.audit_register('sales_order_seller_checks', 'Whose sale checks', 'Revenue', '{revenue}', 'all',
    p_keys => '{order_id}', p_labels => '{seller_name}');

-- ── 3. The evidence ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_order_seller_evidence(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_me     public.sales_orders%ROWTYPE;
    v_papers TEXT[];
    v_today  DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
    v_orders JSONB;
    v_booth  JSONB;
BEGIN
    SELECT * INTO v_me FROM public.sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN JSONB_BUILD_OBJECT('orders', '[]'::JSONB, 'booth', NULL);
    END IF;
    -- A bill whose Ref No. names no paper carries its own number, which only ever matches itself.
    v_papers := ARRAY(SELECT p FROM UNNEST(v_me.bill_refs) p
                       WHERE p IS DISTINCT FROM public.sales_order_bill_ref(v_me.order_no, NULL));
    IF COALESCE(CARDINALITY(v_papers), 0) = 0 THEN
        RETURN JSONB_BUILD_OBJECT('orders', '[]'::JSONB, 'booth', NULL);
    END IF;

    WITH portal AS (
        -- Another bill of the portal's on one of these papers, written for somebody else, before this one.
        SELECT o.order_no AS doc_no,
               CASE WHEN o.source = 'erp_sync' THEN 'bill' ELSE 'claim_form' END AS source,
               o.order_date AS sold_on, o.period_month, o.order_total AS total,
               COALESCE(s.employee_name, NULLIF(BTRIM(o.agent_name), ''), '(no salesperson)') AS seller,
               (s.id IS NOT NULL AND (s.status::TEXT IS DISTINCT FROM 'active' OR s.resignation_date < v_today)) AS seller_left,
               ARRAY(SELECT x FROM UNNEST(o.bill_refs) x WHERE x = ANY (v_papers) ORDER BY x) AS shared_papers,
               -- The ERP's Shared with on that order names this bill's salesperson: they look after it.
               COALESCE((o.raw->'header'->'collaborator_staff_ids') ? v_me.erp_salesperson_id, FALSE) AS handled_by_seller,
               o.cancelled
          FROM public.sales_orders o
          LEFT JOIN public.hr_staff_costs s ON s.id = o.staff_id
         WHERE o.bill_refs && v_papers
           AND o.id <> v_me.id
           AND (o.order_date < v_me.order_date OR (o.order_date = v_me.order_date AND o.created_at < v_me.created_at))
           AND NOT (o.staff_id IS NOT NULL AND o.staff_id = v_me.staff_id)
           AND NOT (o.erp_salesperson_id IS NOT NULL AND o.erp_salesperson_id = v_me.erp_salesperson_id)
           AND NOT (o.staff_id IS NULL AND o.agent_key = v_me.agent_key)
    ), erp AS (
        -- An order of the ERP's the portal has no bill of — an AutoCount order still open, say — on one of these papers,
        -- opened before this one, whose salesperson is somebody else.
        SELECT e.doc_no, 'erp'::TEXT AS source, e.so_date AS sold_on, NULL::DATE AS period_month, e.total,
               COALESCE(NULLIF(BTRIM(e.salesperson_name), ''), '(no salesperson)') AS seller,
               (e.salesperson_active IS FALSE) AS seller_left,
               ARRAY(SELECT x FROM UNNEST(e.papers) x WHERE x = ANY (v_papers) ORDER BY x) AS shared_papers,
               (v_me.erp_salesperson_id IS NOT NULL AND v_me.erp_salesperson_id = ANY (e.shared_with)) AS handled_by_seller,
               (UPPER(COALESCE(e.status, '')) = 'CANCELLED') AS cancelled
          FROM public.erp_order_papers e
         WHERE e.papers && v_papers
           AND e.doc_no <> v_me.order_no
           AND NOT EXISTS (SELECT 1 FROM public.sales_orders x WHERE x.order_no = e.doc_no AND x.source = 'erp_sync')
           AND COALESCE(e.so_date, '-infinity'::DATE) <= v_me.order_date
           AND (e.erp_created_at IS NULL OR v_me.erp_created_at IS NULL OR e.erp_created_at < v_me.erp_created_at)
           AND NOT (e.erp_salesperson_id IS NOT NULL AND e.erp_salesperson_id = v_me.erp_salesperson_id)
           AND NOT EXISTS (SELECT 1 FROM public.comm_agent_aliases a
                            WHERE a.erp_salesperson_id = e.erp_salesperson_id AND a.staff_id = v_me.staff_id)
           AND UPPER(REGEXP_REPLACE(BTRIM(COALESCE(e.salesperson_name, '')), '\s+', ' ', 'g')) IS DISTINCT FROM v_me.agent_key
    )
    SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
               'source', x.source, 'docNo', x.doc_no, 'papers', TO_JSONB(x.shared_papers), 'soldOn', x.sold_on,
               'month', x.period_month, 'seller', x.seller, 'sellerLeft', x.seller_left,
               'handledBySeller', x.handled_by_seller, 'total', x.total, 'cancelled', x.cancelled)
             ORDER BY x.sold_on NULLS FIRST, x.doc_no), '[]'::JSONB)
      INTO v_orders
      FROM (SELECT * FROM portal UNION ALL SELECT * FROM erp) x;

    -- Beside them, never alone: the fair's booth listed others and not this salesperson.
    IF JSONB_ARRAY_LENGTH(v_orders) > 0 AND COALESCE(v_me.raw->'fair'->>'projectId', '') ~ '^[0-9]+$' THEN
        SELECT JSONB_BUILD_OBJECT('fair', v_me.raw->'fair'->>'name',
                                  'staff', JSONB_AGG(bs.name ORDER BY bs.name))
          INTO v_booth
          FROM public.erp_booth_staff bs
         WHERE bs.erp_project_id = (v_me.raw->'fair'->>'projectId')::BIGINT
        HAVING COUNT(*) > 0 AND NOT BOOL_OR(bs.erp_salesperson_id IS NOT DISTINCT FROM v_me.erp_salesperson_id);
    END IF;

    RETURN JSONB_BUILD_OBJECT('orders', v_orders, 'booth', v_booth);
END
$fn$;

COMMENT ON FUNCTION public.sales_order_seller_evidence(UUID) IS
    'Whose sale? The other salespeople''s orders on a bill''s papers, dated before it — the portal''s bills (claim forms included) and erp_order_papers'' orders the portal has no bill of — and, beside them only, the fair booth that did not list its salesperson. {orders: [{source, docNo, papers, soldOn, month, seller, sellerLeft, handledBySeller, total, cancelled}], booth}. Nobody''s to call: erp_sync_check_seller asks it (20261031030000).';

REVOKE ALL ON FUNCTION public.sales_order_seller_evidence(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_order_seller_evidence(UUID) TO service_role;

-- ── 4. Asking it ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.erp_sync_check_seller(p_order_id UUID, p_event_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_me    public.sales_orders%ROWTYPE;
    v_sub   UUID;
    v_ev    JSONB;
    v_first JSONB;
    v_note  TEXT;
BEGIN
    -- The feed calls it with no sign-in; a held delivery replayed calls it as whoever replays it, who holds the action
    -- that takes a bill out by hand — on the month's page, as Don't count this bill asks (the guard stands aside inside
    -- the receiver, whose own gate stood for it). No page of the app calls it.
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
    IF EXISTS (SELECT 1 FROM public.sales_order_seller_checks c WHERE c.order_id = p_order_id AND c.kind = 'paper') THEN
        RETURN NULL;
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM public.sales_import_batches b WHERE b.id = v_me.batch_id;
    IF v_sub IS NULL OR public.commission_order_period_locked(v_sub, v_me.period_month) THEN
        RETURN NULL;
    END IF;

    v_ev := public.sales_order_seller_evidence(p_order_id);
    IF JSONB_ARRAY_LENGTH(COALESCE(v_ev->'orders', '[]'::JSONB)) = 0 THEN
        RETURN NULL;
    END IF;
    v_first := v_ev->'orders'->0;
    v_note := LEFT(FORMAT('Whose sale? %s is on %s''s %s%s',
                          v_first->'papers'->>0, v_first->>'seller', v_first->>'docNo',
                          CASE WHEN v_first->>'soldOn' IS NULL THEN ''
                               ELSE ' (' || TO_CHAR((v_first->>'soldOn')::DATE, 'FMDD Mon YYYY') || ')' END), 500);

    INSERT INTO public.sales_order_seller_checks (order_id, kind, sub_department_id, staff_id, seller_name, evidence, event_id)
    VALUES (p_order_id, 'paper', v_sub, v_me.staff_id, v_first->>'seller', v_ev, p_event_id);
    -- Out exactly as by hand — its Open Bill pick, the day's order and the batch follow — under the check's name.
    PERFORM public.revenue_exclude_order(p_order_id, v_note);
    UPDATE public.sales_order_exclusions
       SET excluded_by = NULL, excluded_by_name = 'Whose sale check'
     WHERE order_id = p_order_id;
    IF p_event_id IS NOT NULL THEN
        UPDATE public.erp_sync_events SET warnings = ARRAY_APPEND(warnings, 'whose_sale') WHERE id = p_event_id;
    END IF;
    RETURN v_ev;
END
$fn$;

COMMENT ON FUNCTION public.erp_sync_check_seller(UUID, UUID) IS
    'Whose sale? Asked once per bill: a counting bill with a salesperson, in a month no run has paid, whose papers another salesperson''s order already carries (sales_order_seller_evidence) is held — taken out through revenue_exclude_order under the name ''Whose sale check'' — until HR answers (revenue_answer_seller_check). Called by erp_sync_after_delivery for a bill a delivery opened; a signed-in caller (a replay) needs Revenue · Edit (20261031030000).';

REVOKE ALL ON FUNCTION public.erp_sync_check_seller(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_check_seller(UUID, UUID) TO authenticated, service_role;

-- ── 5. erp_sync_after_delivery — production's body, one block added ──────────

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
    -- (20261031030000) A bill this delivery opened, on a paper another salesperson's order already carries, waits for
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

-- ── 6. The tab's reader ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_seller_checks(p_sub_department UUID, p_period DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['revenue.view', 'revenue.edit']), FALSE) THEN
        RAISE EXCEPTION 'Comm Cal is not open to your account.' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE((
        SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                   'orderId', o.id, 'orderNo', o.order_no, 'refNo', public.sales_order_ref_no(o.raw->'header'),
                   'orderDate', o.order_date, 'periodMonth', o.period_month, 'customer', o.customer_name,
                   'total', o.order_total, 'staffId', o.staff_id,
                   'staffName', COALESCE(s.employee_name, NULLIF(BTRIM(o.agent_name), '')),
                   'kind', c.kind, 'status', c.status, 'evidence', c.evidence, 'sellerName', c.seller_name,
                   'askedAt', c.asked_at, 'decidedByName', c.decided_by_name, 'decidedAt', c.decided_at, 'note', c.note,
                   'counts', NOT o.cancelled,
                   'held', EXISTS (SELECT 1 FROM public.sales_order_exclusions x WHERE x.order_id = o.id))
                 ORDER BY (c.status = 'waiting') DESC, c.asked_at DESC, o.order_no)
          FROM public.sales_order_seller_checks c
          JOIN public.sales_orders o ON o.id = c.order_id
          LEFT JOIN public.hr_staff_costs s ON s.id = o.staff_id
         WHERE c.sub_department_id = p_sub_department
           AND o.period_month = DATE_TRUNC('month', p_period)::DATE
    ), '[]'::JSONB);
END
$fn$;

COMMENT ON FUNCTION public.revenue_seller_checks(UUID, DATE) IS
    'Comm Cal › the month › Whose sale: every question on the month''s bills — the bill, its salesperson, what was found, waiting / theirs / not_theirs and who answered. Revenue · View or Edit (20261031030000).';

REVOKE ALL ON FUNCTION public.revenue_seller_checks(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_seller_checks(UUID, DATE) TO authenticated;

-- ── 7. HR's answer ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_answer_seller_check(p_order_id UUID, p_theirs BOOLEAN, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_me     UUID := auth.uid();
    v_c      public.sales_order_seller_checks%ROWTYPE;
    v_o      public.sales_orders%ROWTYPE;
    v_note   TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
    v_who    TEXT;
    v_seller TEXT;
    v_first  JSONB;
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['revenue.edit']), FALSE) THEN
        RAISE EXCEPTION 'Answering whose sale a bill is is not open to your account.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']);
    IF p_theirs IS NULL THEN
        RAISE EXCEPTION 'Their own sale, or not theirs?' USING ERRCODE = '22023';
    END IF;
    IF LENGTH(COALESCE(v_note, '')) > 500 THEN
        RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_c FROM public.sales_order_seller_checks WHERE order_id = p_order_id AND kind = 'paper' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is not waiting on whose sale it is.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_o FROM public.sales_orders WHERE id = p_order_id;
    SELECT COALESCE(NULLIF(BTRIM(s.employee_name), ''), NULLIF(BTRIM(u.name), ''), u.email, 'HR') INTO v_who
      FROM public.users u
      LEFT JOIN LATERAL (SELECT x.employee_name FROM public.hr_staff_costs x WHERE x.user_id = u.id AND x.status = 'active'
                          ORDER BY x.created_at, x.id LIMIT 1) s ON TRUE
     WHERE u.id = v_me;
    v_who := COALESCE(v_who, 'HR');
    SELECT COALESCE(s.employee_name, NULLIF(BTRIM(v_o.agent_name), ''), 'the salesperson') INTO v_seller
      FROM (SELECT 1) one LEFT JOIN public.hr_staff_costs s ON s.id = v_o.staff_id;
    v_first := v_c.evidence->'orders'->0;

    IF p_theirs THEN
        -- Their own sale: it counts as if it had never been held (23RUN when the month's run has paid).
        IF EXISTS (SELECT 1 FROM public.sales_order_exclusions WHERE order_id = p_order_id) THEN
            PERFORM public.revenue_include_order(p_order_id);
        END IF;
    ELSE
        -- Not theirs: it stays out — now in HR's name, saying whose it was.
        IF NOT EXISTS (SELECT 1 FROM public.sales_order_exclusions WHERE order_id = p_order_id) AND NOT v_o.cancelled THEN
            PERFORM public.revenue_exclude_order(p_order_id, NULL);
        END IF;
        UPDATE public.sales_order_exclusions
           SET excluded_by = v_me, excluded_by_name = v_who,
               note = LEFT(FORMAT('Not %s''s sale — %s''s %s%s', v_seller,
                                  COALESCE(v_first->>'seller', v_c.seller_name, 'another salesperson'),
                                  COALESCE(v_first->>'docNo', 'order'),
                                  CASE WHEN v_note IS NULL THEN '' ELSE ': ' || v_note END), 500)
         WHERE order_id = p_order_id;
    END IF;

    UPDATE public.sales_order_seller_checks
       SET status = CASE WHEN p_theirs THEN 'theirs' ELSE 'not_theirs' END,
           decided_by = v_me, decided_by_name = v_who, decided_at = NOW(), note = v_note
     WHERE order_id = p_order_id AND kind = 'paper';

    RETURN JSONB_BUILD_OBJECT('orderNo', v_o.order_no,
                              'status', CASE WHEN p_theirs THEN 'theirs' ELSE 'not_theirs' END,
                              'counts', (SELECT NOT o.cancelled FROM public.sales_orders o WHERE o.id = p_order_id));
END
$fn$;

COMMENT ON FUNCTION public.revenue_answer_seller_check(UUID, BOOLEAN, TEXT) IS
    'Whose sale? HR''s answer on a held bill: theirs = it counts (revenue_include_order), not theirs = it stays out in HR''s name, saying whose it was. May be answered again either way while the month''s run has not paid. Revenue · Edit on the month page''s tab (20261031030000).';

REVOKE ALL ON FUNCTION public.revenue_answer_seller_check(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_answer_seller_check(UUID, BOOLEAN, TEXT) TO authenticated;

-- The guard the scan reads (tab-write-guards.test.ts): the answer asks the month's page in the database, as the app's
-- gate in front of it does (requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')). The body above carries it
-- already; this only checks it is there.
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

SELECT pg_temp.tab_guard('public.revenue_answer_seller_check(uuid, boolean, text)',
  $$ARRAY['/revenue/[sub]/[period]']$$, ARRAY['revenue.edit']);

COMMIT;

NOTIFY pgrst, 'reload schema';

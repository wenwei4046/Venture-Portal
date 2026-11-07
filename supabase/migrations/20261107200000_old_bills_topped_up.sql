-- ============================================================================
-- 20261107200000_old_bills_topped_up.sql
-- An old bill topped up is the collector's (2026-11-07).
-- ============================================================================
--
-- The user, of ZNT4813 (HC-SO-010734: Junie's bill of 10 Mar 2026, RM 800 of RM 6,000 paid; Junie has left; Shawn
-- collected RM 3,200 on 2 Nov 2026): "如果那个 order 之前 below depo，but 离职了 shawn 帮忙 handle 这样就是有 com" —
-- "bc that time below depo is without comm out". Asked how: built into the system (做进系统); the commission is the
-- person who collected the payment that topped it up (只认收补款的人 — nobody recorded, nobody until HR picks);
-- back-pay only the bills that were below their deposit before (只有补那种之前 below depo 的那种); each ERP document on
-- its own (ZNT4813's linked PG10672 was at exactly its 30% in March, so it does not come — 只拿 ZNT4813).
--
-- Until now a document dated before the feed window (erp_feed_settings.min_order_date, Fair 2026-08-01) never came in:
-- the ERP did not send it (vp.since) and the receiver answered skipped. Such a bill was settled by hand in its month.
-- One still under its deposit then paid nobody — and when its salesperson has left and somebody tops it up later,
-- nobody ever would. Now, when the ERP sends one (Houzs-ERP: an order dated before vp.since is sent when its
-- salesperson is no longer active and money was received on it since; `salesperson.active` and each payment's
-- `collected_by_name` travel with it), erp_sync_old_bill() asks:
--
--   its salesperson has left            salesperson.active is false (the ERP's word; missing → not asked)
--   under its deposit before            the payments dated before the month the portal pays from
--                                       (comm_first_paid_month — Sep 2026) reach less than Rules' deposit
--                                       (comm_schemes.deposit_threshold_pct, Fair 30%) of the bill
--   topped up past it since             a payment dated in or after that month takes it to the deposit
--   whose                               that payment's collector, when the portal knows them (comm_agent_aliases by
--                                       their ERP id) and they still work here; else nobody — HR moves it
--
-- and ingest_erp_sales_order() then takes the bill in: in the first month still open from that payment's month — not
-- paid by a run, not closed to the feed, not one its collector is closed in (with no collector, not one anybody is
-- closed in, so the month HR picks somebody in is still open for them) — up to the office's own month; none open:
-- held, its payload kept, as a late key-in is. On the collector (never the departed salesperson, nor anybody their
-- name matches); `erp_salesperson_id` / `agent_name` stay the ERP's, so the bill still says whose sale it was. Once in,
-- it is a bill like any other: it keeps its month, its re-sends are written (never removed by the window), a change
-- after its commission was given is a drop or an upsell, HR's Move / Share / Don't count work on it. Comm Cal shows it
-- as Top up deposit · Mar 2026 bill · Junie (lib/commission/row-origin.ts).
--
-- A document that does not qualify is skipped as before; the feed's log says why ("dated before the feed window
-- (2026-08-01) — its salesperson still works here").
--
-- ingest_erp_sales_order is made again from PRODUCTION's body (2026-11-07 19:40, md5 of prosrc d08d228c…, the body
-- 20261031210000 left) with seven statements swapped — refused if production's body has changed since.
--
-- PGlite: tests/member-sql/validate-old-bills-topped-up.mjs (production's body, md5-checked; the migration verbatim,
-- twice).

BEGIN;

-- Production's body (2026-11-07, pg_get_functiondef, md5 of prosrc), or this migration's own once it has run.
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
    FROM pg_proc WHERE oid = to_regprocedure('public.ingest_erp_sales_order(jsonb, uuid)');
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'public.ingest_erp_sales_order(jsonb, uuid) is not on this database';
  END IF;
  IF v_md5 IS DISTINCT FROM 'd08d228c1fa90d19379cc31b027f20f7' AND v_md5 IS DISTINCT FROM 'd8395b13f77fd3f4b3380b8ec0be9954' THEN
    RAISE EXCEPTION 'public.ingest_erp_sales_order is md5 %, not the body this migration was written from', v_md5;
  END IF;
END $$;

-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused
-- (20261031210000's).
CREATE OR REPLACE FUNCTION pg_temp.swap_text(p_src text, p_old text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pat   text := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_n     integer;
  v_found text;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A statement this migration swaps is there % times, not once — production changed since it was written: %', v_n, left(p_old, 80);
  END IF;
  v_found := (regexp_match(p_src, '(' || v_pat || ')'))[1];
  RETURN replace(p_src, v_found, p_new);
END
$fn$;

-- ── 1. The rule: is this delivery an old bill topped up, and whose ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_sync_old_bill(p_sub_department_id uuid, p_order jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
    v_total        NUMERIC := COALESCE(NULLIF(p_order->>'total', '')::NUMERIC, 0);
    v_cutover      DATE := comm_first_paid_month(p_sub_department_id);
    v_threshold    NUMERIC;
    v_needed       NUMERIC;
    -- The ERP's word on whether its salesperson still works there (Houzs-ERP, 2026-11-07); missing is no answer.
    v_active       TEXT := CASE WHEN JSONB_TYPEOF(p_order->'raw'->'salesperson') = 'object'
                                THEN p_order->'raw'->'salesperson'->>'active' END;
    v_seller       TEXT := COALESCE(NULLIF(BTRIM(p_order->>'salespersonName'), ''), '(no salesperson)');
    v_sold         DATE := NULLIF(p_order->>'orderDate', '')::DATE;
    v_today        DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
    v_pay          RECORD;
    v_before       NUMERIC := 0;
    v_paid         NUMERIC := 0;
    v_prev         NUMERIC;
    v_crossed      BOOLEAN := FALSE;
    v_cross_day    DATE;
    v_cross_amount NUMERIC;
    v_cross_id     TEXT;
    v_collector    TEXT;
    v_collector_nm TEXT;
    v_staff        UUID;
    v_staff_nm     TEXT;
    v_pct          TEXT;
    v_reason       TEXT;
    v_summary      TEXT;
BEGIN
    SELECT s.deposit_threshold_pct INTO v_threshold FROM comm_schemes s WHERE s.id = erp_sync_scheme_of(p_sub_department_id);
    v_needed := v_total * v_threshold;
    v_pct := TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM TO_CHAR(COALESCE(v_threshold, 0) * 100, 'FM990.99'))) || '%';

    -- The payments in the order they were paid. Those dated before the month the portal pays from were what the bill
    -- had when its month was settled by hand; the first one dated since that takes it to its deposit is the top-up.
    FOR v_pay IN
        SELECT NULLIF(e->>'paid_at', '')::DATE AS paid_at,
               COALESCE(NULLIF(e->>'amount_sen', '')::NUMERIC, 0) / 100 AS amount,
               NULLIF(BTRIM(e->>'collected_by'), '') AS collected_by,
               NULLIF(BTRIM(e->>'collected_by_name'), '') AS collected_by_name,
               e->>'id' AS id
          FROM JSONB_ARRAY_ELEMENTS(CASE WHEN JSONB_TYPEOF(p_order->'raw'->'payments') = 'array'
                                         THEN p_order->'raw'->'payments' ELSE '[]'::JSONB END) e
         ORDER BY NULLIF(e->>'paid_at', '')::DATE NULLS FIRST, e->>'created_at', e->>'id'
    LOOP
        v_prev := v_paid;
        v_paid := v_paid + v_pay.amount;
        IF v_cutover IS NULL OR v_pay.paid_at IS NULL OR v_pay.paid_at < v_cutover THEN
            v_before := v_before + v_pay.amount;
        ELSIF NOT v_crossed AND v_needed IS NOT NULL AND v_prev < v_needed AND v_paid >= v_needed THEN
            v_crossed := TRUE;
            v_cross_day := v_pay.paid_at;
            v_cross_amount := v_pay.amount;
            v_cross_id := v_pay.id;
            v_collector := v_pay.collected_by;
            v_collector_nm := v_pay.collected_by_name;
        END IF;
    END LOOP;

    IF v_cutover IS NULL THEN
        v_reason := 'the portal pays from no month yet';
    ELSIF v_threshold IS NULL OR v_threshold <= 0 THEN
        v_reason := 'Rules hold no bill for its deposit';
    ELSIF v_total <= 0 THEN
        v_reason := 'it is worth nothing';
    ELSIF v_active IS DISTINCT FROM 'false' THEN
        v_reason := CASE WHEN v_active IS NULL THEN 'the ERP did not say whether its salesperson has left'
                         ELSE 'its salesperson still works here' END;
    ELSIF v_before >= v_needed THEN
        v_reason := 'it had its ' || v_pct || ' deposit before ' || TO_CHAR(v_cutover, 'FMMonth YYYY')
                    || ' (RM ' || TO_CHAR(v_before, 'FM999,999,990.00') || ' of RM ' || TO_CHAR(v_total, 'FM999,999,990.00')
                    || '), so its commission was settled by hand then';
    ELSIF NOT v_crossed THEN
        v_reason := 'not topped up past its ' || v_pct || ' deposit since ' || TO_CHAR(v_cutover, 'FMMonth YYYY')
                    || ' (RM ' || TO_CHAR(v_paid, 'FM999,999,990.00') || ' of RM ' || TO_CHAR(v_total, 'FM999,999,990.00') || ' paid)';
    END IF;

    -- Whose: the person who collected that payment, when the portal knows them and they still work here.
    IF v_reason IS NULL AND v_collector IS NOT NULL THEN
        SELECT a.staff_id, s.employee_name INTO v_staff, v_staff_nm
          FROM comm_agent_aliases a
          JOIN hr_staff_costs s ON s.id = a.staff_id
         WHERE a.erp_salesperson_id = v_collector
           AND s.status::TEXT = 'active' AND (s.resignation_date IS NULL OR s.resignation_date >= v_today)
         ORDER BY a.staff_id
         LIMIT 1;
    END IF;

    IF v_reason IS NULL THEN
        v_summary := 'old bill: ' || v_seller || ' (left) sold it on ' || COALESCE(TO_CHAR(v_sold, 'FMDD Mon YYYY'), 'an earlier day')
                     || ', RM ' || TO_CHAR(v_before, 'FM999,999,990.00') || ' of RM ' || TO_CHAR(v_total, 'FM999,999,990.00')
                     || ' paid before ' || TO_CHAR(v_cutover, 'FMMonth YYYY') || '; topped up past its ' || v_pct || ' deposit on '
                     || TO_CHAR(v_cross_day, 'FMDD Mon YYYY') || ' (RM ' || TO_CHAR(v_cross_amount, 'FM999,999,990.00') || '), '
                     || CASE WHEN v_staff IS NOT NULL THEN 'collected by ' || v_staff_nm || ', whose it is now'
                             WHEN v_collector IS NULL THEN 'the ERP not saying who collected it — nobody''s until HR moves it'
                             ELSE 'collected by ' || COALESCE(v_collector_nm, 'somebody')
                                  || ', whom the portal does not pay — nobody''s until HR moves it' END;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'counts', v_reason IS NULL,
        'reason', v_reason,
        'summary', v_summary,
        'total', v_total,
        'threshold', v_threshold,
        'needed', v_needed,
        'paidBefore', v_before,
        'paidNow', v_paid,
        'cutover', v_cutover,
        'crossedOn', v_cross_day,
        'crossingPaymentId', v_cross_id,
        'crossingAmount', v_cross_amount,
        'collectorErpId', v_collector,
        'collectorName', COALESCE(v_staff_nm, v_collector_nm),
        'collectorStaffId', CASE WHEN v_reason IS NULL THEN v_staff END,
        'sellerName', v_seller,
        'sellerErpId', NULLIF(BTRIM(p_order->>'salespersonId'), ''));
END;
$function$;

COMMENT ON FUNCTION public.erp_sync_old_bill(uuid, jsonb) IS
  'An old bill topped up (2026-11-07): for a delivery dated before the feed window, whether it is a departed salesperson''s bill (salesperson.active false) that was under Rules'' deposit before the month the portal pays from and was topped up past it by a payment dated since — and whose: that payment''s collector (comm_agent_aliases by ERP id, still working here), else nobody. counts / reason / summary and the facts. Read by ingest_erp_sales_order only.';

-- The receiver runs as the service role, and as whoever replays a held delivery — as the receiver's other helpers.
REVOKE ALL ON FUNCTION public.erp_sync_old_bill(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_sync_old_bill(uuid, jsonb) TO authenticated, service_role;

-- ── 2. The receiver takes it in ─────────────────────────────────────────────────────────────────────────────────────
DO $made$
DECLARE
  v_oid regprocedure := to_regprocedure('public.ingest_erp_sales_order(jsonb, uuid)');
  v_def text;
  -- Each old text starts at its first character: a leading run of whitespace would take the line break before it.
  v_swaps text[] := ARRAY[
    -- (a) Two more declarations.
    $o$-- (20261013010000) What the portal knew of the document before this delivery.
    v_before        JSONB;
BEGIN$o$,
    $n$-- (20261013010000) What the portal knew of the document before this delivery.
    v_before        JSONB;
    -- (20261107200000) An old bill topped up (erp_sync_old_bill): what the rule found, and whether this is one.
    v_old           JSONB;
    v_is_old        BOOLEAN := FALSE;
BEGIN$n$,

    -- (b) An old bill already has its month: never a late key-in.
    $o$IF NOT v_found AND (erp_sync_period_locked(v_period) OR erp_sync_period_closed(v_period)) THEN$o$,
    $n$IF NOT v_found AND NOT v_is_old AND (erp_sync_period_locked(v_period) OR erp_sync_period_closed(v_period)) THEN$n$,

    -- (c) Nor does the feed window turn it away, or remove it.
    $o$IF v_floor IS NOT NULL AND v_order_date < v_floor THEN$o$,
    $n$IF v_floor IS NOT NULL AND v_order_date < v_floor AND NOT v_is_old THEN$n$,

    -- (d) A document turned away says why it is no old bill topped up, when the rule was asked.
    $o$'dated before the feed window (' || v_floor || ')',$o$,
    $n$'dated before the feed window (' || v_floor || ')'
                            -- (20261107200000)
                            || COALESCE(' — ' || COALESCE(v_old->>'reason',
                                   CASE WHEN v_excluded THEN 'not a sale in the ERP (' || LOWER(v_status) || ')' END), ''),$n$,

    -- (e) Whose it is: the collector's, never the departed salesperson's.
    $o$IF v_staff_id IS NULL AND NOT v_excluded THEN
        v_warnings := ARRAY_APPEND(v_warnings, 'unmatched_salesperson');
    END IF;$o$,
    $n$-- (20261107200000) An old bill is whoever collected the payment that topped it up — never its departed
    -- salesperson's, nor anybody their name matches; nobody the portal pays, nobody until HR moves it (a move is
    -- kept through every re-send by sales_orders_reassigned).
    IF v_is_old THEN
        v_staff_id := COALESCE(NULLIF(v_old->>'collectorStaffId', '')::UUID, CASE WHEN v_found THEN v_existing.staff_id END);
    END IF;
    IF v_staff_id IS NULL AND NOT v_excluded THEN
        v_warnings := ARRAY_APPEND(v_warnings, CASE WHEN v_is_old THEN 'old_bill_no_collector' ELSE 'unmatched_salesperson' END);
    END IF;$n$,

    -- (f) The log says whose it was and who collected the money.
    $o$-- (20261012200000)
                             || CASE WHEN v_sold_in IS NULL THEN ''$o$,
    $n$-- (20261107200000)
                             || CASE WHEN v_is_old AND NOT v_found THEN ' — ' || COALESCE(v_old->>'summary', 'an old bill topped up') ELSE '' END
                             -- (20261012200000)
                             || CASE WHEN v_sold_in IS NULL THEN ''$n$,

    -- (g) The rule, and the month it lands in.
    $o$-- ── A late key-in lands in a month still open (20261012200000) ─────────$o$,
    $n$-- ── An old bill topped up (20261107200000) ─────────────────────────────
    -- The user, 2026-11-07, of ZNT4813 (Junie's bill of 10 Mar 2026, RM 800 of RM 6,000 paid; Shawn collected RM 3,200
    -- on 2 Nov): "如果那个 order 之前 below depo，but 离职了 shawn 帮忙 handle 这样就是有 com" — "bc that time below depo
    -- is without comm out". A document dated before the feed window was settled by hand in its month and never kept
    -- here. One whose salesperson has left, still under its deposit when the portal started paying and topped up past it
    -- since, paid nobody: it comes in now, whoever collected that payment's (erp_sync_old_bill), in the first month still
    -- open from that payment's month — not paid, not closed to the feed, not one its collector is closed in (with no
    -- collector, not one anybody is), never past the office's own month; none open, held, as a late key-in is. A bill
    -- that came in so keeps its month, and its re-sends are written, never removed by the window.
    SELECT min_order_date INTO v_floor FROM erp_feed_settings WHERE sub_department_id = v_sub_id;
    IF v_floor IS NOT NULL AND v_order_date < v_floor AND (NOT v_found OR v_existing.order_date < v_floor) THEN
        v_old := erp_sync_old_bill(v_sub_id, p_order);
        IF v_found THEN
            v_is_old := TRUE;
            v_period := v_existing.period_month;
        ELSIF COALESCE((v_old->>'counts')::BOOLEAN, FALSE) AND NOT v_excluded THEN
            v_try := GREATEST(DATE_TRUNC('month', (v_old->>'crossedOn')::DATE)::DATE, comm_first_paid_month(v_sub_id));
            WHILE v_try <= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE)::DATE LOOP
                -- Each month's lock in calendar order, as every writer takes them.
                PERFORM lock_commission_order_periods(v_sub_id, ARRAY[v_try]);
                -- (The CASE in brackets: an IF's condition otherwise ends at the first THEN.)
                IF NOT erp_sync_period_locked(v_try) AND NOT erp_sync_period_closed(v_try)
                   AND NOT (CASE WHEN v_old->>'collectorStaffId' IS NOT NULL
                                 THEN comm_staff_month_closed(v_sub_id, v_try, (v_old->>'collectorStaffId')::UUID)
                                 ELSE EXISTS (SELECT 1 FROM comm_salesperson_closes c
                                               WHERE c.sub_department_id = v_sub_id AND c.period_month = v_try
                                                 AND c.reopened_at IS NULL) END) THEN
                    v_is_old := TRUE;
                    v_period := v_try;
                    EXIT;
                END IF;
                v_try := (v_try + INTERVAL '1 month')::DATE;
            END LOOP;
            IF NOT v_is_old THEN
                RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no,
                                    DATE_TRUNC('month', (v_old->>'crossedOn')::DATE)::DATE, 'held',
                                    'an old bill topped up, and no month from '
                                    || TO_CHAR((v_old->>'crossedOn')::DATE, 'FMMonth YYYY') || ' on is open — reopen one and replay',
                                    '{}', v_snapshot, p_order, p_replay_of), v_before);
            END IF;
        END IF;
    END IF;

    -- ── A late key-in lands in a month still open (20261012200000) ─────────$n$
  ];
  i integer;
BEGIN
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = v_oid) = 'd8395b13f77fd3f4b3380b8ec0be9954' THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(v_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, v_swaps[2 * i - 1], v_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $made$;

-- What this migration made is what it was written to make.
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
    FROM pg_proc WHERE oid = to_regprocedure('public.ingest_erp_sales_order(jsonb, uuid)');
  IF v_md5 IS DISTINCT FROM 'd8395b13f77fd3f4b3380b8ec0be9954' THEN
    RAISE EXCEPTION 'public.ingest_erp_sales_order ended as md5 %, not the body this migration makes', v_md5;
  END IF;
END $$;

COMMIT;

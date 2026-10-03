-- 20261003170000_bill_ref_no.sql
--
-- THE PAPER BESIDE THE DOCUMENT (user 2026-10-03). A fair sale starts on a
-- handwritten bill — HC13369 — and the back office keys it into the ERP days
-- later as a sales order with a number of its own, HC-SO-2609-400, typing the
-- paper's number into the order's Ref No. A bill in the portal is the ERP's
-- document; the paper number is how anybody checks it back against the paper,
-- and it is what the double-claim check matches on (sales_order_bill_ref,
-- 20260926010000; sales_orders.bill_ref, 20260926110000).
--
-- WHICH FIELD IS THE REF NO. The ERP keeps two. Its order forms write "Ref
-- No." into `customer_so_no` (SalesOrderNew / SalesOrderDetail, customerSoNo),
-- and an order the ERP opened itself has `ref` NULL — every order since
-- 2026-09-08 (backend/src/lib/delivery-sheet-feed.ts says so in as many words).
-- `ref` is filled on the orders brought over from AutoCount, the same value as
-- customer_so_no on all but a handful (2 since August, neither in a month the
-- portal pays); no order carries `ref` alone. The check read customer_so_no
-- only — right today, but one comment in the ERP (customer-ref.ts) still calls
-- customer_so_no transitional, and if the ERP ever wrote `ref` instead, every
-- bill would fall back to its own HC-SO number, which matches nothing: Double
-- claims would show none, and say nothing about why.
--
-- 1. sales_order_ref_no(header) — THE Ref No.: customer_so_no, else ref. The
--    form's field first, because an edit lands there and leaves an AutoCount
--    order's `ref` behind (the ERP's own header shows ref first, and so shows
--    the old number on such an order).
-- 2. sales_orders.bill_ref reads it. Changed in place (Postgres 17, SET
--    EXPRESSION): the column keeps its place and every row is worked out
--    again. Not one of the 1,116 bills changes (counted 2026-10-03).
-- 3. ref_no(sales_orders) and paper_no(sales_orders) — computed fields: the
--    Ref No. as the ERP has it, and the paper number the double-claim check
--    matches the bill on, or NULL when it has none to match (an ERP document
--    whose Ref No. is empty or names no paper — "-", "ZNT", "6760" — falls back
--    to its own number, which only ever matches itself). A bill worked out by
--    hand carries its paper as its own number.
-- 4. erp_sync_note_adjustment reads bill_ref rather than working the paper
--    out again from customer_so_no: one rule, one place.
-- 5. revenue_month_orders gains ref_no and paper_no, for the Ref No. column on
--    All bills and the salesperson ledgers. Dropped and recreated because the
--    return type grows; otherwise the body is 20260927050000's.
--
-- Reversal: re-apply revenue_month_orders from 20260927050000 (DROP first —
-- the type shrinks) and erp_sync_note_adjustment from 20260927020000; ALTER
-- the column back to sales_order_bill_ref(order_no, raw->'header'->>
-- 'customer_so_no'); then DROP FUNCTION paper_no(sales_orders),
-- ref_no(sales_orders), sales_order_ref_no(JSONB).

BEGIN;

-- ── 1. The Ref No. ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sales_order_ref_no(p_header JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(NULLIF(BTRIM(p_header->>'customer_so_no'), ''),
                    NULLIF(BTRIM(p_header->>'ref'), ''));
$fn$;

COMMENT ON FUNCTION sales_order_ref_no(JSONB) IS
    'The Ref No. on an ERP sales order header — the handwritten bill''s number, as typed: customer_so_no (what the ERP''s order forms write), else ref (AutoCount''s copy). NULL when neither has anything.';

REVOKE ALL ON FUNCTION sales_order_ref_no(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales_order_ref_no(JSONB) TO authenticated, service_role;

-- ── 2. bill_ref reads it ─────────────────────────────────────────────────────

ALTER TABLE public.sales_orders
    ALTER COLUMN bill_ref
    SET EXPRESSION AS (sales_order_bill_ref(order_no, sales_order_ref_no(raw->'header')));

COMMENT ON COLUMN public.sales_orders.bill_ref IS
    'The paper this bill is on: sales_order_bill_ref(order_no, sales_order_ref_no(raw.header)) — the first paper number in the Ref No. (customer_so_no, else ref), else the order''s own number — worked out by Postgres on every write (20260926110000, 20261003170000). What revenue_possible_double_claims groups by.';

-- ── 3. ref_no / paper_no ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ref_no(o sales_orders)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT sales_order_ref_no(o.raw->'header');
$fn$;

COMMENT ON FUNCTION ref_no(sales_orders) IS
    'The bill''s Ref No. as the ERP has it (sales_order_ref_no) — the handwritten bill''s number, HC13369 on HC-SO-2609-400. NULL for a bill the ERP did not send. A computed field: PostgREST selects it as ref_no.';

CREATE OR REPLACE FUNCTION paper_no(o sales_orders)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT CASE
               WHEN o.source = 'erp_sync' AND o.bill_ref = sales_order_bill_ref(o.order_no, NULL) THEN NULL
               ELSE o.bill_ref
           END;
$fn$;

COMMENT ON FUNCTION paper_no(sales_orders) IS
    'The paper number the double-claim check matches this bill on (bill_ref), or NULL when an ERP document''s Ref No. is empty or names no paper and the check could only fall back to the document''s own number. A bill worked out by hand carries its paper as its own number. A computed field: PostgREST selects it as paper_no.';

REVOKE ALL ON FUNCTION ref_no(sales_orders) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION paper_no(sales_orders) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ref_no(sales_orders) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION paper_no(sales_orders) TO authenticated, service_role;

-- ── 4. erp_sync_note_adjustment — 20260927020000's, reading bill_ref ────────

CREATE OR REPLACE FUNCTION erp_sync_note_adjustment(p_order_id UUID, p_order JSONB, p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_row       sales_orders%ROWTYPE;
    v_sub       UUID;
    v_scheme    UUID;
    v_ref       TEXT;
    v_status    TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED'));
    v_new       NUMERIC(15, 2);
    v_settled   NUMERIC(15, 2);
    v_staff     UUID;
    v_hand_id   UUID;
    v_confirmed NUMERIC(15, 2);
    v_delta     NUMERIC(15, 2);
    v_today     DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
BEGIN
    SELECT * INTO v_row FROM sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_row.batch_id;
    SELECT s.id INTO v_scheme
      FROM comm_schemes s
     WHERE s.sub_department_id = v_sub AND s.is_active AND s.effective_to IS NULL
     ORDER BY s.effective_from DESC
     LIMIT 1;
    IF v_scheme IS NULL THEN
        RETURN;
    END IF;
    -- The paper, as the double-claim check reads it (20261003170000).
    v_ref := v_row.bill_ref;

    -- What the ERP says now: its lines in groups the scheme pays on — nothing
    -- at all once it is deleted, cancelled, a draft or on hold.
    IF COALESCE((p_order->>'deleted')::BOOLEAN, FALSE)
       OR v_status IN ('CANCELLED', 'DRAFT', 'ON_HOLD')
       OR COALESCE((p_order->>'onHold')::BOOLEAN, FALSE)
       -- (20260927020000) Nor for a bill somebody took out by hand.
       OR sales_order_excluded_by_hand(v_row.id) THEN
        v_new := 0;
    ELSE
        SELECT COALESCE(ROUND(SUM(COALESCE((l->>'amount')::NUMERIC, 0)), 2), 0) INTO v_new
          FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_order->'lines', '[]'::JSONB)) l
          JOIN comm_item_groups g
            ON g.scheme_id = v_scheme
           AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(COALESCE(l->>'itemGroup', '')))
           AND g.commissionable;
    END IF;

    -- What was settled, and whose it is:
    -- (a) a run paid it — what that run paid on;
    SELECT r.product_revenue, r.staff_id INTO v_settled, v_staff
      FROM comm_order_releases r
      JOIN comm_runs c ON c.id = r.run_id AND c.status IN ('applied', 'locked')
     WHERE r.sub_department_id = v_sub AND r.order_no = v_row.order_no
     ORDER BY r.released_at DESC
     LIMIT 1;

    -- (b) its month was worked out by hand — the row under the same paper in
    --     that month's committed (imported) batch, and the person it paid;
    IF v_settled IS NULL THEN
        SELECT m.id, m.staff_id INTO v_hand_id, v_staff
          FROM sales_orders m
          JOIN sales_import_batches b ON b.id = m.batch_id
         WHERE b.sub_department_id = v_sub
           AND b.status = 'committed'
           AND b.source = 'file'
           AND b.period_month = v_row.period_month
           AND NOT m.cancelled
           AND m.bill_ref = v_ref
         ORDER BY m.order_total DESC
         LIMIT 1;
        IF v_hand_id IS NOT NULL THEN
            SELECT COALESCE(SUM(ml.line_amount), 0) INTO v_settled
              FROM sales_order_lines ml
              JOIN comm_item_groups g
                ON g.scheme_id = v_scheme
               AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(ml.item_group))
               AND g.commissionable
             WHERE ml.order_id = v_hand_id;
        END IF;
    END IF;

    -- (c) the bill itself, as its closed month froze it.
    IF v_settled IS NULL
       AND EXISTS (SELECT 1 FROM sales_import_batches b WHERE b.id = v_row.batch_id AND b.status = 'committed')
       AND erp_feed_month_closed(v_sub, v_row.period_month) THEN
        IF v_row.cancelled THEN
            v_settled := 0;
        ELSE
            SELECT COALESCE(SUM(l.line_amount), 0) INTO v_settled
              FROM sales_order_lines l
              JOIN comm_item_groups g
                ON g.scheme_id = v_scheme
               AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(l.item_group))
               AND g.commissionable
             WHERE l.order_id = v_row.id;
        END IF;
        v_staff := v_row.staff_id;
    END IF;

    IF v_settled IS NULL OR v_staff IS NULL THEN
        RETURN;
    END IF;

    -- Drops and upsells already answered on it are part of what was settled:
    -- a confirmed one was paid; a dismissed one said the ERP's figure stands.
    SELECT COALESCE(SUM(u.amount), 0) INTO v_confirmed
      FROM comm_upsales u
     WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
       AND u.status IN ('confirmed', 'dismissed');
    v_settled := v_settled + v_confirmed;
    v_delta := ROUND(v_new - v_settled, 2);

    IF ABS(v_delta) < 0.01 THEN
        -- The ERP is back to what was settled: nothing to ask any more.
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub AND erp_doc_no = v_row.order_no AND status = 'pending';
        RETURN;
    END IF;

    INSERT INTO comm_upsales (
        sub_department_id, period_month, staff_id, amount, sold_on, original_ref, note,
        kind, status, source, erp_doc_no, erp_event_id, settled_amount, erp_amount, original_period, created_by)
    VALUES (
        v_sub, DATE_TRUNC('month', v_today)::DATE, v_staff, v_delta, v_today, v_ref,
        'The ERP changed ' || v_row.order_no || ' after ' || TO_CHAR(v_row.period_month, 'FMMonth YYYY') || ' was settled',
        CASE WHEN v_delta > 0 THEN 'upsale' ELSE 'drop' END, 'pending', 'erp', v_row.order_no, p_event_id,
        v_settled, v_new, v_row.period_month, NULL)
    ON CONFLICT (sub_department_id, erp_doc_no) WHERE status = 'pending' AND erp_doc_no IS NOT NULL
    DO UPDATE SET amount         = EXCLUDED.amount,
                  kind           = EXCLUDED.kind,
                  staff_id       = EXCLUDED.staff_id,
                  period_month   = EXCLUDED.period_month,
                  sold_on        = EXCLUDED.sold_on,
                  note           = EXCLUDED.note,
                  erp_event_id   = EXCLUDED.erp_event_id,
                  settled_amount = EXCLUDED.settled_amount,
                  erp_amount     = EXCLUDED.erp_amount;
EXCEPTION WHEN OTHERS THEN
    -- A delivery is never lost over its bookkeeping: the held event keeps the
    -- payload, and the drop or upsell can still be recorded by hand.
    RAISE WARNING 'erp_sync_note_adjustment(%): %', p_order_id, SQLERRM;
END;
$fn$;

COMMENT ON FUNCTION erp_sync_note_adjustment(UUID, JSONB, UUID) IS
    'Called by ingest_erp_sales_order when it holds a delivery for a bill of a settled month: the delivery''s commissionable amount (0 when the ERP no longer counts it, or somebody took the bill out by hand) minus what was settled (a run''s product_revenue, else the hand-worked row under the same paper, else the bill as its closed month froze it, plus drops/upsells already confirmed or dismissed) becomes one pending comm_upsales row per document in the current month. The paper is the bill''s bill_ref. Never raises.';

-- ── 5. revenue_month_orders + ref_no, paper_no ──────────────────────────────

DROP FUNCTION IF EXISTS revenue_month_orders(UUID, DATE);

CREATE FUNCTION public.revenue_month_orders(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(order_id uuid, order_no text, order_date date, event_date date, customer_name text, debtor_code text, venue text, venue_group_key text, venue_group_name text, organizer text, location text, brand_code text, order_total numeric, paid_amount numeric, balance numeric, cancelled boolean, excluded_reason text, erp_status text, erp_on_hold boolean, sequence_in_day integer, staff_id uuid, employee_name text, employee_code text, agent_name text, line_count integer, line_amount numeric, commissionable numeric, margin_revenue numeric, margin_cost numeric, margin_pct numeric, margin_source text, lines_without_cost integer, lines_without_brand integer, open_bill_rank smallint, open_bill_auto boolean, deposit_required numeric, deposit_met boolean, ref_no text, paper_no text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH scheme AS (
        SELECT s.id,
               s.enable_kpi,
               s.deposit_threshold_pct AS pct,
               CASE WHEN COALESCE(s.revenue_cost_divisor, 1) > 0
                    THEN s.revenue_cost_divisor ELSE 1 END AS cost_divisor
          FROM comm_schemes s
         WHERE s.sub_department_id = p_sub_department_id AND s.is_active
         ORDER BY s.effective_from DESC
         LIMIT 1
    ), batch AS (
        SELECT b.id
          FROM sales_import_batches b
         WHERE b.sub_department_id = p_sub_department_id
           AND b.period_month = p_period
           AND b.status = 'committed'
    ), organiser AS (
        -- The organiser belongs to THIS month's fair, not to the hall: the
        -- same venue has a different organiser from month to month. One row
        -- per place, chosen as venue_event_organiser chooses: an undated fair
        -- first, then the earliest start (20260926100000: read once here, not
        -- once per bill).
        SELECT DISTINCT ON (e.venue_key) e.venue_key, og.name
          FROM comm_venue_events e
          JOIN comm_organisers og ON og.id = e.organiser_id
         WHERE e.period_month = DATE_TRUNC('month', p_period)::DATE
         ORDER BY e.venue_key, (e.start_date IS NULL) DESC, e.start_date
    ), kpi AS (
        -- What each bill's KPI items take off its sales (2026-09-27), in force
        -- at the month's end as the run reads them; none while KPI is off.
        SELECT h.order_id, SUM(h.qty * h.unit_amount) AS amount
          FROM scheme sc
          CROSS JOIN LATERAL comm_kpi_hits(
              sc.id,
              CASE WHEN sc.enable_kpi
                   THEN ARRAY(SELECT o.id FROM sales_orders o JOIN batch ON batch.id = o.batch_id)
                   ELSE '{}'::UUID[] END,
              (DATE_TRUNC('month', p_period) + INTERVAL '1 month - 1 day')::DATE) h
         GROUP BY h.order_id
    )
    SELECT
        o.id, o.order_no, o.order_date, o.event_date, o.customer_name, o.debtor_code,
        o.venue,
        -- The spelling stays on the row; the PLACE is what groups and filters.
        COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue)),
        COALESCE(canon.display_name, own.display_name),
        org.name,
        o.location, o.brand_code,
        o.order_total, COALESCE(o.paid_amount, 0), o.balance,
        o.cancelled, o.excluded_reason, o.erp_status, o.erp_on_hold, o.sequence_in_day,
        o.staff_id, st.employee_name, st.employee_code, o.agent_name,
        COALESCE(l.n, 0)::INTEGER,
        COALESCE(l.amount, 0),
        -- What the rate is paid on, and what the margin is taken on: the
        -- bill's MAIN sales — its commissionable lines less its KPI items.
        COALESCE(l.main, 0),
        COALESCE(l.main, 0),
        l.margin_cost,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct
            WHEN l.margin_cost IS NULL OR COALESCE(l.main, 0) <= 0 THEN NULL
            ELSE ROUND((l.main - l.margin_cost) / l.main, 6)
        END,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN 'manual'
            WHEN l.margin_cost IS NULL OR COALESCE(l.main, 0) <= 0 THEN 'none'
            ELSE 'cost'
        END,
        COALESCE(l.no_cost, 0)::INTEGER,
        COALESCE(l.no_brand, 0)::INTEGER,
        t.bill_rank, t.auto_suggested,
        CASE WHEN sc.pct IS NULL THEN NULL ELSE ROUND(o.order_total * sc.pct, 2) END,
        CASE WHEN sc.pct IS NULL THEN TRUE
             ELSE COALESCE(o.paid_amount, 0) + 0.005 >= o.order_total * sc.pct END,
        -- The paper beside the document (20261003170000): the Ref No. as the
        -- ERP has it, and the paper number the double-claim check reads.
        ref_no(o),
        paper_no(o)
      FROM sales_orders o
      JOIN batch ON batch.id = o.batch_id
      CROSS JOIN scheme sc
      LEFT JOIN hr_staff_costs st ON st.id = o.staff_id
      LEFT JOIN comm_venues own ON own.venue_key = venue_key(o.venue)
      LEFT JOIN comm_venues canon ON canon.venue_key = own.canonical_key
      -- venue_group_key(o.venue), spelled out: the canonical place when a
      -- human folded this spelling into one, else the spelling's own key.
      LEFT JOIN organiser org
             ON org.venue_key = COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue))
      LEFT JOIN kpi k ON k.order_id = o.id
      LEFT JOIN LATERAL (
          SELECT g.n, g.amount, g.margin_cost, g.no_cost, g.no_brand,
                 -- comm_kpi_hits pays only what the bill's sales cover.
                 COALESCE(g.goods, 0) - COALESCE(k.amount, 0) AS main
            FROM (
              SELECT
                  COUNT(*) AS n,
                  SUM(sl.line_amount) AS amount,
                  -- Every line in a commissionable group. A free giveaway is
                  -- in it: its cost is real and that is how giving it away is
                  -- meant to hurt the margin.
                  SUM(sl.line_amount) FILTER (WHERE ig.commissionable) AS goods,
                  -- NULL when ANY line of that base has no cost. A partial
                  -- cost would show as a fat margin and the engine would
                  -- disagree - it refuses to judge an incomplete bill at all.
                  --
                  -- Each line divided by its SKU's own ratio, else the
                  -- scheme's (2026-09-27), exactly as marginBase() divides it:
                  -- this is the cost the MARGIN is taken on, not the cost on
                  -- the invoice.
                  CASE WHEN COUNT(*) FILTER (WHERE ig.commissionable AND sl.cost_amount IS NULL) > 0
                       THEN NULL
                       ELSE ROUND(
                            COALESCE(SUM(sl.cost_amount / COALESCE(cr.ratio, sc.cost_divisor))
                                     FILTER (WHERE ig.commissionable), 0),
                            2) END AS margin_cost,
                  COUNT(*) FILTER (WHERE sl.cost_amount IS NULL) AS no_cost,
                  COUNT(*) FILTER (WHERE sl.brand_code IS NULL) AS no_brand
                FROM sales_order_lines sl
                LEFT JOIN comm_item_groups ig
                       ON ig.scheme_id = sc.id
                      AND UPPER(BTRIM(ig.item_group)) = UPPER(BTRIM(sl.item_group))
                LEFT JOIN comm_cost_ratios cr
                       ON cr.scheme_id = sc.id
                      AND UPPER(BTRIM(cr.product_code)) = UPPER(BTRIM(sl.product_code))
               WHERE sl.order_id = o.id
            ) g
      ) l ON TRUE
      LEFT JOIN sales_order_open_bill_tags t ON t.order_id = o.id
     ORDER BY o.order_date, o.sequence_in_day NULLS LAST, o.order_no;
$function$;

COMMENT ON FUNCTION revenue_month_orders(UUID, DATE) IS
    'A month''s sales orders as the commission engine reads them: commissionable value, the margin base and its verdict (manual / cost / none) on the scheme''s cost basis (revenue_cost_divisor), the venue as written plus the PLACE it belongs to and the organiser of THAT MONTH''S fair there, the Open Bill rank, the deposit-gate verdict, why an excluded bill is excluded when the ERP is not the reason, and the paper beside the document: its Ref No. (ref_no) and the paper number the double-claim check reads from it (paper_no).';

COMMIT;

NOTIFY pgrst, 'reload schema';

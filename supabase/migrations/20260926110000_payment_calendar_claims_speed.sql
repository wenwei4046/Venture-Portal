-- 20260926110000_payment_calendar_claims_speed.sql
--
-- THREE FUNCTIONS THAT REDID THE SAME WORK FOR EVERY ROW (2026-09-26), the
-- same family as 20260926100000. None of them changes an answer; each now does
-- its expensive part once.
--
-- 1. payroll_statutory_coverage (HR › Payment, read twice by payment_cycle —
--    once for the month's coverage, once more for every month on the rail).
--    A legacy statutory PV (one without lines) is matched to people by
--    payroll_statutory_legacy_scopes(PV, month, scheme), and that was asked
--    for every PERSON × PV — and when a PV's description does not say its
--    scope, each ask re-reads the whole month's statutory_people to compare
--    totals. August: 23.6 ms a call, paid twice per Payment page. The answer
--    depends only on the PV and its scheme, so it is now asked once per PV and
--    joined to the people. Same rows (a set: every reader filters or looks it
--    up), and the same refusal for a PV whose scope is ambiguous — it is asked
--    for exactly the PVs it was asked for before.
--
-- 2. revenue_fair_calendar (Venues › Fair calendar, the Comm Cal workbench).
--    For every BILL with a fair it called erp_feed_month_closed twice — a
--    SECURITY DEFINER function Postgres cannot inline, each call its own query
--    plus comm_first_paid_month's. The answer depends only on (sub-department,
--    month), and all the bills with a fair touch a handful of those pairs.
--    NOW: erp_feed_month_closed runs once per distinct pair, and the bills are
--    tallied in one pass grouped by fair instead of once per fair. The pairs
--    are built from the same bills and fairs, so every bill finds both of its
--    own (all four columns are NOT NULL).
--
-- 3. revenue_possible_double_claims (Comm Cal and every month page). For every
--    bill — twice, once as live and once as paid — it opened the ERP's whole
--    raw document (jsonb, ~2.3 KB compressed, out of line) to read
--    header.customer_so_no, then ran sales_order_bill_ref's regexes. The
--    reference is a fact of the row, so it is now STORED on the row:
--    sales_orders.bill_ref, generated from exactly that expression
--    (sales_order_bill_ref is IMMUTABLE) and kept current by Postgres on every
--    insert and every ERP re-send, like paid_amount. Nothing writes it: every
--    INSERT INTO sales_orders (the ingest functions, the file import) names its
--    columns. Should sales_order_bill_ref ever change, drop and re-add this
--    column so every row is worked out again.
--
-- Checked 2026-09-26 on production inside BEGIN … ROLLBACK, as the Principal:
-- old and new answers identical — payroll_statutory_coverage and payment_cycle
-- for every month from April to October 2026, revenue_fair_calendar row for
-- row and in order, revenue_possible_double_claims for every sub-department.
--
-- Reversal: re-apply payroll_statutory_coverage from 20260911120000,
-- revenue_fair_calendar and revenue_possible_double_claims from
-- 20260926010000, then ALTER TABLE sales_orders DROP COLUMN bill_ref.

-- ── 1. payroll_statutory_coverage ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payroll_statutory_coverage(p_period date)
 RETURNS TABLE(row_id uuid, scope text, scheme text, voucher_id uuid, amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT l.payroll_row_id, l.scope, l.scheme, l.voucher_id, l.amount
    FROM payroll_statutory_voucher_lines l JOIN payment_vouchers pv ON pv.id = l.voucher_id
    WHERE l.period_month = p_period AND pv.status <> 'voided'
    UNION ALL
    -- Legacy vouchers have no lines. Read their historical scope correctly
    -- before and after both shares moved to the same HR custody pool. Which
    -- scopes a legacy PV covers is a fact of the PV and its scheme, so it is
    -- asked once per PV, not once for every person on it (20260926110000).
    (WITH people AS MATERIALIZED (
         SELECT p.row_id, p.scope, p.scheme, p.amount
           FROM payroll_statutory_people(p_period) p
          WHERE p.amount > 0
     ), legacy AS MATERIALIZED (
         SELECT pv.id, s.scheme, payroll_statutory_legacy_scopes(pv.id, p_period, s.scheme) AS scopes
           FROM payroll_runs r
           JOIN payment_vouchers pv ON pv.reference_type = 'payroll_statutory' AND pv.reference_id = r.id
           JOIN (SELECT DISTINCT people.scheme FROM people) s
             ON pv.payee_name = CASE s.scheme WHEN 'KWSP' THEN 'KWSP' WHEN 'SOCSO' THEN 'PERKESO (SOCSO)'
                 WHEN 'EIS' THEN 'PERKESO (EIS)' WHEN 'PCB' THEN 'LHDN' ELSE 'SKBBK' END
          WHERE r.period_month = p_period AND r.status <> 'rejected'
            AND pv.status <> 'voided'
            AND NOT EXISTS (SELECT 1 FROM payroll_statutory_voucher_lines l WHERE l.voucher_id = pv.id)
     )
     SELECT p.row_id, p.scope, p.scheme, lg.id, p.amount
       FROM people p
       JOIN legacy lg ON lg.scheme = p.scheme
      WHERE p.scope = ANY(lg.scopes))
$function$;

-- ── 2. revenue_fair_calendar ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_fair_calendar()
 RETURNS TABLE(fair_id uuid, venue_key text, display_name text, period_month date, start_date date, end_date date, organiser_id uuid, organiser_name text, erp_organiser_text text, source text, notes text, bills integer, sales_value numeric, bills_to_move integer, value_to_move numeric, confirmed_to_move integer, confirmed_value_to_move numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH bill AS MATERIALIZED (
        -- Every bill with a fair, in a committed batch, beside its fair's month.
        SELECT x.fair_event_id, x.order_total, x.fair_source, x.period_month,
               b.sub_department_id, e.period_month AS fair_month
          FROM sales_orders x
          JOIN sales_import_batches b ON b.id = x.batch_id AND b.status = 'committed'
          JOIN comm_venue_events e    ON e.id = x.fair_event_id
    ), closed AS MATERIALIZED (
        -- Whether a month is closed to the feed depends on (sub-department,
        -- month) alone: asked once per pair, not twice per bill (20260926110000).
        SELECT m.sub_department_id, m.period_month,
               erp_feed_month_closed(m.sub_department_id, m.period_month) AS is_closed
          FROM (SELECT bl.sub_department_id, bl.period_month FROM bill bl
                UNION
                SELECT bl.sub_department_id, bl.fair_month FROM bill bl) m
    ), tally AS (
        -- A bill still waiting to move is one the calendar CAN move: not in a
        -- month closed to the feed, on either side (20260926010000).
        SELECT so.fair_event_id,
               COUNT(*)                                            AS bills,
               SUM(so.order_total)                                 AS value,
               COUNT(*) FILTER (WHERE so.waiting)                  AS moving,
               SUM(so.order_total) FILTER (WHERE so.waiting)       AS moving_value,
               COUNT(*) FILTER (WHERE so.waiting AND so.fair_source = 'manual')
                                                                   AS confirmed,
               SUM(so.order_total) FILTER (WHERE so.waiting AND so.fair_source = 'manual')
                                                                   AS confirmed_value
          FROM (
              SELECT bl.fair_event_id, bl.order_total, bl.fair_source,
                     bl.period_month <> bl.fair_month
                       AND NOT own_month.is_closed
                       AND NOT fair_month.is_closed AS waiting
                FROM bill bl
                JOIN closed own_month  ON own_month.sub_department_id = bl.sub_department_id
                                      AND own_month.period_month = bl.period_month
                JOIN closed fair_month ON fair_month.sub_department_id = bl.sub_department_id
                                      AND fair_month.period_month = bl.fair_month
          ) so
         GROUP BY so.fair_event_id
    )
    SELECT e.id,
           e.venue_key,
           COALESCE(v.display_name, e.venue_key),
           e.period_month,
           e.start_date,
           e.end_date,
           e.organiser_id,
           og.name,
           e.erp_organiser_text,
           e.source,
           e.notes,
           COALESCE(o.bills, 0)::INTEGER,
           COALESCE(o.value, 0),
           COALESCE(o.moving, 0)::INTEGER,
           COALESCE(o.moving_value, 0),
           COALESCE(o.confirmed, 0)::INTEGER,
           COALESCE(o.confirmed_value, 0)
      FROM comm_venue_events e
      LEFT JOIN comm_venues v      ON v.venue_key = e.venue_key
      LEFT JOIN comm_organisers og ON og.id = e.organiser_id
      LEFT JOIN tally o            ON o.fair_event_id = e.id
     ORDER BY COALESCE(e.start_date, e.period_month) DESC,
              COALESCE(v.display_name, e.venue_key);
$function$;

-- ── 3. sales_orders.bill_ref + revenue_possible_double_claims ──────────────

ALTER TABLE public.sales_orders
    ADD COLUMN bill_ref TEXT
    GENERATED ALWAYS AS (sales_order_bill_ref(order_no, raw->'header'->>'customer_so_no')) STORED;

COMMENT ON COLUMN public.sales_orders.bill_ref IS
    'The paper this bill is on: sales_order_bill_ref(order_no, raw.header.customer_so_no), worked out by Postgres on every write (20260926110000). What revenue_possible_double_claims groups by.';

CREATE OR REPLACE FUNCTION public.revenue_possible_double_claims(p_sub_department_id uuid)
 RETURNS TABLE(bill_ref text, order_id uuid, order_no text, period_month date, order_date date, staff_id uuid, employee_name text, agent_name text, order_total numeric, source text, paid_by_run boolean, dismissed boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH live AS (
        -- Every bill a run could pay: in its month's committed batch, not
        -- excluded, and worth something (a "refer" document at RM 0 pays nobody).
        -- The paper number is read from the row, not rebuilt from the raw
        -- document for every bill (20260926110000).
        SELECT o.id, o.order_no, o.period_month, o.order_date, o.staff_id, o.agent_name,
               o.order_total, o.source, o.bill_ref AS ref
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id
         WHERE b.sub_department_id = p_sub_department_id
           AND b.status = 'committed'
           AND NOT o.cancelled
           AND o.order_total > 0
    ), paid AS (
        -- Every bill a run has paid, wherever its row sits now.
        SELECT DISTINCT ON (o.id)
               o.id, o.order_no, r.order_period_month AS period_month, o.order_date, o.staff_id,
               o.agent_name, o.order_total, o.source, o.bill_ref AS ref
          FROM comm_order_releases r
          JOIN comm_runs c ON c.id = r.run_id AND c.status IN ('applied', 'locked')
          JOIN sales_orders o ON o.order_no = r.order_no
          JOIN sales_import_batches b ON b.id = o.batch_id
                                     AND b.sub_department_id = r.sub_department_id
         WHERE r.sub_department_id = p_sub_department_id
         ORDER BY o.id
    ), bills AS (
        SELECT l.id, l.order_no, l.period_month, l.order_date, l.staff_id, l.agent_name,
               l.order_total, l.source, l.ref, (p.id IS NOT NULL) AS paid_by_run
          FROM live l LEFT JOIN paid p ON p.id = l.id
        UNION ALL
        SELECT p.id, p.order_no, p.period_month, p.order_date, p.staff_id, p.agent_name,
               p.order_total, p.source, p.ref, TRUE
          FROM paid p
         WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = p.id)
    ), groups AS (
        SELECT b.ref, ARRAY_AGG(b.id ORDER BY b.id) AS ids
          FROM bills b
         GROUP BY b.ref
        HAVING COUNT(*) > 1
    )
    SELECT b.ref, b.id, b.order_no, b.period_month, b.order_date, b.staff_id, s.employee_name,
           b.agent_name, b.order_total, b.source, b.paid_by_run,
           EXISTS (
               SELECT 1 FROM comm_double_claim_dismissals d
                WHERE d.sub_department_id = p_sub_department_id
                  AND d.bill_ref = b.ref
                  AND d.order_ids @> g.ids
           )
      FROM bills b
      JOIN groups g ON g.ref = b.ref
      LEFT JOIN hr_staff_costs s ON s.id = b.staff_id
     ORDER BY b.ref, b.period_month, b.order_date, b.order_no;
$function$;

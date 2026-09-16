-- 20260917030000_revenue_month_orders.sql
--
-- THE DRILL-DOWN BEHIND A MONTH. Commission Calculation showed a month as
-- totals — sales value, orders, sales by person — and nothing underneath them,
-- so checking a salesperson's commission meant reading the run's statement and
-- believing it. This is the layer below: one row per sales order, with who
-- sold it, where it was sold, what the rate is paid on, what its margin is (or
-- why it has none), whether the deposit gate holds it, and which Open Bill of
-- the day it is.
--
-- IT READS A BILL THE WAY THE ENGINE READS IT, or it would be worse than
-- useless — a second opinion HR would have to reconcile against the first.
-- So, mirroring `marginBase` / `billMargin` in src/lib/commission/engine.ts:
--
--   * `commissionable` is what the rate is paid on: lines whose item group is
--     commissionable, KPI items excluded (they pay a flat allowance instead).
--   * the MARGIN BASE is wider — every line in a commissionable group, KPI
--     giveaways included, because a free pillow has real cost and that is
--     exactly how giving it away is meant to hurt the margin.
--   * `margin_cost` is NULL the moment ONE line of that base has no cost, and
--     `margin_pct` with it. A part-costed bill divided by its whole value
--     looks like a 100% margin; the engine refuses to judge it at all, and so
--     does this.
--   * a hand-keyed `manual_margin_pct` wins over both (`margin_source` says so).
--
-- An RPC rather than four selects from the page because the LINES alone run
-- past PostgREST's default page — a Fair month is ~1,700 of them — and a
-- drill-down that silently read the first thousand would show the wrong cost
-- on the last hundred orders. That is the trap the Match panel fell into on
-- 2026-09-16; it is not falling into it twice.
--
-- STABLE and SECURITY INVOKER: `sales_orders` is already walled to the admin
-- and hr scopes, and this function inherits that wall rather than stepping
-- around it.
--
-- Additive. Reversal: DROP FUNCTION revenue_month_orders.

DROP FUNCTION IF EXISTS revenue_month_orders(UUID, DATE);

CREATE OR REPLACE FUNCTION revenue_month_orders(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE (
    order_id            UUID,
    order_no            TEXT,
    order_date          DATE,
    event_date          DATE,
    customer_name       TEXT,
    debtor_code         TEXT,
    venue               TEXT,
    organizer           TEXT,
    location            TEXT,
    brand_code          TEXT,
    order_total         NUMERIC,
    paid_amount         NUMERIC,
    balance             NUMERIC,
    cancelled           BOOLEAN,
    erp_status          TEXT,
    erp_on_hold         BOOLEAN,
    sequence_in_day     INTEGER,
    staff_id            UUID,
    employee_name       TEXT,
    employee_code       TEXT,
    agent_name          TEXT,
    line_count          INTEGER,
    line_amount         NUMERIC,
    commissionable      NUMERIC,
    margin_revenue      NUMERIC,
    margin_cost         NUMERIC,
    margin_pct          NUMERIC,
    margin_source       TEXT,
    lines_without_cost  INTEGER,
    lines_without_brand INTEGER,
    open_bill_rank      SMALLINT,
    open_bill_auto      BOOLEAN,
    deposit_required    NUMERIC,
    deposit_met         BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH scheme AS (
        SELECT s.id, s.deposit_threshold_pct AS pct
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
    )
    SELECT
        o.id, o.order_no, o.order_date, o.event_date, o.customer_name, o.debtor_code,
        o.venue, v.organizer, o.location, o.brand_code,
        o.order_total, COALESCE(o.paid_amount, 0), o.balance,
        o.cancelled, o.erp_status, o.erp_on_hold, o.sequence_in_day,
        o.staff_id, st.employee_name, st.employee_code, o.agent_name,
        COALESCE(l.n, 0)::INTEGER,
        COALESCE(l.amount, 0),
        COALESCE(l.commissionable, 0),
        COALESCE(l.margin_revenue, 0),
        l.margin_cost,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_revenue, 0) <= 0 THEN NULL
            ELSE ROUND((l.margin_revenue - l.margin_cost) / l.margin_revenue, 6)
        END,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN 'manual'
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_revenue, 0) <= 0 THEN 'none'
            ELSE 'cost'
        END,
        COALESCE(l.no_cost, 0)::INTEGER,
        COALESCE(l.no_brand, 0)::INTEGER,
        t.bill_rank, t.auto_suggested,
        CASE WHEN sc.pct IS NULL THEN NULL ELSE ROUND(o.order_total * sc.pct, 2) END,
        CASE WHEN sc.pct IS NULL THEN TRUE
             ELSE COALESCE(o.paid_amount, 0) + 0.005 >= o.order_total * sc.pct END
      FROM sales_orders o
      JOIN batch ON batch.id = o.batch_id
      CROSS JOIN scheme sc
      LEFT JOIN hr_staff_costs st ON st.id = o.staff_id
      LEFT JOIN comm_venues v ON v.venue_key = venue_key(o.venue)
      LEFT JOIN LATERAL (
          SELECT
              COUNT(*) AS n,
              SUM(sl.line_amount) AS amount,
              SUM(sl.line_amount) FILTER (WHERE g.commissionable AND k.product_code IS NULL) AS commissionable,
              SUM(sl.line_amount) FILTER (WHERE g.commissionable) AS margin_revenue,
              CASE WHEN COUNT(*) FILTER (WHERE g.commissionable AND sl.cost_amount IS NULL) > 0
                   THEN NULL
                   ELSE COALESCE(SUM(sl.cost_amount) FILTER (WHERE g.commissionable), 0) END AS margin_cost,
              COUNT(*) FILTER (WHERE sl.cost_amount IS NULL) AS no_cost,
              COUNT(*) FILTER (WHERE sl.brand_code IS NULL) AS no_brand
            FROM sales_order_lines sl
            LEFT JOIN comm_item_groups g
                   ON g.scheme_id = sc.id
                  AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(sl.item_group))
            LEFT JOIN comm_kpi_items k
                   ON k.scheme_id = sc.id
                  AND UPPER(BTRIM(k.product_code)) = UPPER(BTRIM(sl.product_code))
           WHERE sl.order_id = o.id
      ) l ON TRUE
      LEFT JOIN sales_order_open_bill_tags t ON t.order_id = o.id
     ORDER BY o.order_date, o.sequence_in_day NULLS LAST, o.order_no;
$fn$;

COMMENT ON FUNCTION revenue_month_orders(UUID, DATE) IS
    'A month''s sales orders as the commission engine reads them: commissionable value, the margin base and its verdict (manual / cost / none), the venue organiser, the Open Bill rank and the deposit-gate verdict.';

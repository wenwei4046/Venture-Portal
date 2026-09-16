-- 20260918030000_month_orders_cost_divisor.sql
--
-- THE DRILL-DOWN FOLLOWS THE ENGINE, INCLUDING WHERE THE ENGINE MOVED.
--
-- `comm_schemes.revenue_cost_divisor` (Fair 0.7) is the Revenue Team's cost
-- basis: a line's cost is what the ERP imported DIVIDED by it, because the
-- team carries the goods at a different price from the company. `marginBase()`
-- in src/lib/commission/engine.ts applies it to every margin the engine
-- judges — the per-bill penalty, the monthly incentive, the statement's brand
-- margins — and the member calculator quotes on the same basis.
--
-- `revenue_month_orders` did not, because when it was written the divisor was
-- still on an unmerged branch. That is not a rounding difference: at 0.7 a
-- bill costing 3,000 against 10,000 of revenue reads 70% to this function and
-- 57% to the engine. The whole point of the drill-down is that HR can check a
-- commission against the bills that earned it, so a second opinion it does not
-- share is worse than no opinion at all.
--
-- So: cost is summed as `cost_amount / divisor`, exactly as `marginBase` sums
-- it, and `margin_cost` is returned on that basis — it is the cost the margin
-- was taken on, not the cost on the invoice. A hand-keyed `manual_margin_pct`
-- still wins over both, unchanged.
--
-- A NULL or non-positive divisor means 1, matching the engine's own guard, so
-- a sub-department that never sets one (IR is 1.0000) is untouched.
--
-- One deliberate difference: `marginBase` rounds its running cost after every
-- line, this rounds the bill's total once. On 2-dp costs over a 0.7 divisor
-- that is worth at most a cent a bill — four decimal places below anything
-- either number is shown or compared at.
--
-- Additive; replaces one function body. Reversal: re-apply the
-- revenue_month_orders body from 20260918020000.

CREATE OR REPLACE FUNCTION revenue_month_orders(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE (
    order_id            UUID,
    order_no            TEXT,
    order_date          DATE,
    event_date          DATE,
    customer_name       TEXT,
    debtor_code         TEXT,
    venue               TEXT,
    venue_group_key     TEXT,
    venue_group_name    TEXT,
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
        SELECT s.id,
               s.deposit_threshold_pct AS pct,
               -- The engine's own guard: absent or non-positive means 1.
               CASE WHEN COALESCE(s.revenue_cost_divisor, 0) > 0
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
    )
    SELECT
        o.id, o.order_no, o.order_date, o.event_date, o.customer_name, o.debtor_code,
        o.venue,
        -- The spelling stays on the row; the PLACE is what groups and filters.
        COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue)),
        COALESCE(canon.display_name, own.display_name),
        COALESCE(canon.organizer, own.organizer),
        o.location, o.brand_code,
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
      LEFT JOIN comm_venues own ON own.venue_key = venue_key(o.venue)
      LEFT JOIN comm_venues canon ON canon.venue_key = own.canonical_key
      LEFT JOIN LATERAL (
          SELECT
              COUNT(*) AS n,
              SUM(sl.line_amount) AS amount,
              -- What the rate is paid on: a commissionable group, not a KPI item.
              SUM(sl.line_amount) FILTER (WHERE g.commissionable AND k.product_code IS NULL) AS commissionable,
              -- The margin base is wider: every line in a commissionable group,
              -- KPI giveaways included, because a free pillow has real cost and
              -- that is exactly how giving it away is meant to hurt the margin.
              SUM(sl.line_amount) FILTER (WHERE g.commissionable) AS margin_revenue,
              -- NULL when ANY line of that base has no cost. A partial cost
              -- would show as a fat margin and the engine would disagree — it
              -- refuses to judge an incomplete bill at all.
              --
              -- Divided by the scheme's cost basis, exactly as marginBase()
              -- divides it: this is the cost the MARGIN is taken on, not the
              -- cost on the invoice.
              CASE WHEN COUNT(*) FILTER (WHERE g.commissionable AND sl.cost_amount IS NULL) > 0
                   THEN NULL
                   ELSE ROUND(
                        COALESCE(SUM(sl.cost_amount / sc.cost_divisor) FILTER (WHERE g.commissionable), 0),
                        2) END AS margin_cost,
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
    'A month''s sales orders as the commission engine reads them: commissionable value, the margin base and its verdict (manual / cost / none) on the scheme''s cost basis (revenue_cost_divisor), the venue as written plus the PLACE it belongs to and that place''s organiser, the Open Bill rank and the deposit-gate verdict.';

NOTIFY pgrst, 'reload schema';

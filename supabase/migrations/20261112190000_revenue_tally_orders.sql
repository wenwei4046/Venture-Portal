-- Comm Cal › Tally reads who has REALLY paid each bill (2026-11-12).
--
-- The Tally (#1024) put a bill in two calendars by two dates alone: Houzs's by
-- its SO date, ours by its fair date. The user, the same day: "need with the
-- real commission payout, for those below depo, houzs will not pay to venture
-- as well". Neither side pays by a date alone:
--
--   Houzs  pays a bill once its payments reach the deposit — the ERP's Event
--          Commission earns an order "on the day its payments first reach 30% of
--          its total" — in the month of its SO date, or the month it reached the
--          deposit when that is later; and only an order with a fair (an order
--          with no fair is in neither of its reports).
--   We     pay a bill in the month whose close released it (comm_order_releases):
--          its own month, the month its deposit was topped up, or the next month
--          still open when it came in after its salesperson's close.
--
-- One read gives the Tally what both need for every bill of the sub-department's
-- committed months from p_from on: what earns on it (its lines in a commissionable
-- group — the ERP's goods), whether the portal's deposit gate is met, the day its
-- payments reached the deposit, whether the ERP names a fair, its fair day, and
-- the month a close released it. It replaces one revenue_month_orders call per
-- month (six round trips, each working out a margin nobody reads here).
--
-- THE DAY THE DEPOSIT WAS REACHED — the ERP's reachedOn(), on the payments the
-- delivery carries (raw.payments: paid_at, amount_sen): payments in day order
-- (a bare date is its day; a timestamp is the office's day), the first day their
-- running total reaches the bill's total × the scheme's deposit (Rules › Deposit —
-- comm_schemes.deposit_threshold_pct, 30%, the ERP's own share today; no rate is
-- written here). The total is the ERP's: total_revenue_sen, else local_total_sen,
-- else the bill's own. Only a bill that carries no dated payment at all (a claim
-- form's, an early delivery), or whose total is RM 0, is read off the portal's
-- gate instead: met → its order date. A bill whose dated payments fall short of
-- the ERP's total has reached nothing, whatever the portal's gate says of the
-- bill's own total — that difference is exactly what the Tally is there to show.
--
-- SECURITY INVOKER: every table answers by the caller's own row policies, as
-- revenue_month_orders does. No table changes; nothing is written.

CREATE OR REPLACE FUNCTION public.revenue_tally_orders(p_sub_department_id uuid, p_from date)
RETURNS TABLE (
    order_id uuid,
    order_no text,
    period_month date,
    order_date date,
    staff_id uuid,
    salesperson text,
    customer_name text,
    brand_code text,
    ref_no text,
    order_total numeric,
    paid_amount numeric,
    goods numeric,
    cancelled boolean,
    excluded_reason text,
    deposit_met boolean,
    reached_on date,
    has_fair boolean,
    fair_date date,
    released_month date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
    WITH scheme AS (
        SELECT s.id, s.deposit_threshold_pct AS pct
          FROM comm_schemes s
         WHERE s.sub_department_id = p_sub_department_id AND s.is_active
         ORDER BY s.effective_from DESC
         LIMIT 1
    ), bills AS (
        SELECT o.*
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id
         WHERE b.sub_department_id = p_sub_department_id
           AND b.status = 'committed'
           AND b.period_month >= p_from
    ), goods AS (
        -- What earns on each bill: every line in a commissionable group, read
        -- once for all of them (not once per bill).
        SELECT sl.order_id, SUM(sl.line_amount) FILTER (WHERE ig.commissionable) AS goods
          FROM sales_order_lines sl
          JOIN bills ON bills.id = sl.order_id
          CROSS JOIN scheme sc
          LEFT JOIN comm_item_groups ig
                 ON ig.scheme_id = sc.id
                AND UPPER(BTRIM(ig.item_group)) = UPPER(BTRIM(sl.item_group))
         GROUP BY sl.order_id
    )
    SELECT
        o.id,
        o.order_no,
        o.period_month,
        o.order_date,
        o.staff_id,
        COALESCE(st.employee_name, o.agent_name),
        o.customer_name,
        o.brand_code,
        ref_no(o),
        o.order_total,
        COALESCE(o.paid_amount, 0),
        COALESCE(g.goods, 0),
        o.cancelled,
        o.excluded_reason,
        gate.met,
        CASE
            -- No deposit to reach: every bill is at it the day it is opened.
            WHEN sc.pct IS NULL THEN o.order_date
            -- The ERP's rule, on the payments the delivery carries.
            WHEN pay.dated > 0 AND gate.total_sen > 0 THEN pay.reached_on
            -- Nothing to measure it by: read off the portal's gate.
            WHEN gate.met THEN o.order_date
        END,
        -- The ERP names the fair on its delivery; a bill from a file cannot say.
        (o.source IS DISTINCT FROM 'erp_sync' OR jsonb_typeof(o.raw -> 'fair') = 'object'),
        CASE WHEN o.raw -> 'fair' ->> 'fairDate' ~ '^\d{4}-\d{2}-\d{2}$'
             THEN (o.raw -> 'fair' ->> 'fairDate')::date END,
        rel.period_month
      FROM bills o
      LEFT JOIN scheme sc ON TRUE
      LEFT JOIN hr_staff_costs st ON st.id = o.staff_id
      LEFT JOIN goods g ON g.order_id = o.id
      LEFT JOIN comm_order_releases rel
             ON rel.sub_department_id = p_sub_department_id
            AND rel.order_no = o.order_no
      CROSS JOIN LATERAL (
          SELECT
              -- The portal's own gate, as revenue_month_orders reads it.
              (sc.pct IS NULL OR COALESCE(o.paid_amount, 0) + 0.005 >= o.order_total * sc.pct) AS met,
              -- The total the ERP measures 30% of.
              COALESCE(
                  NULLIF(CASE WHEN o.raw -> 'header' ->> 'total_revenue_sen' ~ '^-?\d+(\.\d+)?$'
                              THEN (o.raw -> 'header' ->> 'total_revenue_sen')::numeric END, 0),
                  CASE WHEN o.raw -> 'header' ->> 'local_total_sen' ~ '^-?\d+(\.\d+)?$'
                       THEN (o.raw -> 'header' ->> 'local_total_sen')::numeric END,
                  o.order_total * 100
              ) AS total_sen
      ) gate
      CROSS JOIN LATERAL (
          -- One row always: how many payments carry a day, and the first day
          -- their running total is at the deposit.
          SELECT COUNT(*) AS dated,
                 MIN(x.paid_day) FILTER (WHERE x.running >= gate.total_sen * sc.pct) AS reached_on
            FROM (
              SELECT p.paid_day,
                     SUM(p.amount_sen) OVER (ORDER BY p.paid_day, p.ord) AS running
                FROM (
                  SELECT CASE WHEN e ->> 'paid_at' ~ '^\d{4}-\d{2}-\d{2}$'
                                   THEN (e ->> 'paid_at')::date
                              WHEN e ->> 'paid_at' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
                                   THEN ((e ->> 'paid_at')::timestamptz AT TIME ZONE 'Asia/Kuala_Lumpur')::date
                         END AS paid_day,
                         CASE WHEN e ->> 'amount_sen' ~ '^-?\d+(\.\d+)?$'
                              THEN (e ->> 'amount_sen')::numeric ELSE 0 END AS amount_sen,
                         t.ord
                    FROM jsonb_array_elements(
                             CASE WHEN jsonb_typeof(o.raw -> 'payments') = 'array'
                                  THEN o.raw -> 'payments' ELSE '[]'::jsonb END
                         ) WITH ORDINALITY AS t(e, ord)
                ) p
               WHERE p.paid_day IS NOT NULL
            ) x
      ) pay
     ORDER BY o.order_date, o.order_no, o.id;
$fn$;

COMMENT ON FUNCTION public.revenue_tally_orders(uuid, date) IS
    'Comm Cal › Tally: every bill of a sub-department''s committed months from p_from on, with what earns on it, the portal''s deposit gate, the day its payments reached the deposit (the ERP''s rule), whether the ERP names a fair, its fair day and the month a close released it. SECURITY INVOKER: the caller''s own row policies answer.';

REVOKE ALL ON FUNCTION public.revenue_tally_orders(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_tally_orders(uuid, date) TO authenticated, service_role;

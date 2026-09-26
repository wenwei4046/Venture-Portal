-- 20260926100000_month_page_speed.sql
--
-- OPENING A MONTH TOOK 3–10 SECONDS. Clicking August on Revenue › Fair ›
-- Comm Cal left the page frozen for 7.7–8.9 s on production, September for
-- 3.4–4.7 s (2026-09-26). Timed call by call, two database functions were most
-- of it, and neither was doing heavy work — each was repeating cheap work
-- hundreds of times.
--
-- 1. revenue_month_orders: 1.3–2.0 s for ~320 bills. The query itself runs in
--    ~70 ms. The rest was `venue_event_organiser(o.venue, p_period)` in the
--    select list: a SQL function with its own SET search_path, so Postgres
--    cannot inline it and runs it as a separate query FOR EVERY BILL — and
--    each of those runs re-checks the caller's permissions on comm_venue_events
--    and comm_organisers (has_scope → current_permissions, ~1.7 ms a check).
--    ~4.7 ms × 317 bills = 1.5 s. The month page calls this function once for
--    its month and the workbench again for every month it carries bills from.
--    NOW: the month's organisers are read ONCE, in a CTE, and joined on the
--    same place key. Same answer — venue_event_organiser orders a venue's
--    fairs undated-first, then by start date, and takes the first; DISTINCT ON
--    below does exactly that per venue — just one query instead of 317.
--
-- 2. lookup_pcb: ~3.3 s a call on average (pg_stat_statements, 45 calls, worst
--    7.3 s) when a signed-in user calls it — the month page previews salary
--    before a run exists (August), one PCB lookup per wage band. pcb_jadual has
--    382,878 rows in RM 4 brackets, and under row-level security Postgres may
--    only push a condition into an index ahead of the policy when its operator
--    is LEAKPROOF. int4eq and date_le are; enum_eq (category) and numeric_le /
--    numeric_ge (the income) are not. So however the table is indexed, a
--    signed-in lookup could narrow by `children` and nothing else, walked
--    ~30,000 rows, and ran pcb_all_select's `auth.uid()` (a JSON parse of the
--    JWT) on every one. Callers that bypass RLS were always fast —
--    revenue_pay_preview and compute_hr_monthly_payroll are SECURITY DEFINER.
--    NOW: lookup_pcb is SECURITY DEFINER too, so its one query uses an index
--    on (category, children, income_from) read backwards: one row. The
--    policy's rule is kept by hand — a caller whose JWT is `anon` gets 0,
--    exactly what the policy's empty result gave it; a signed-in user, the
--    service role and the database's own jobs get the table's answer, as
--    before. Checked 2026-09-26: within each (category, children,
--    effective_from) the brackets are contiguous and never overlap (0
--    overlaps, 0 gaps in 382,855 neighbours), so exactly one row ever matched
--    and ORDER BY changes no answer; 156 lookups across every category, 0–10
--    children and RM 0–90,000 returned the same PCB before and after, in
--    0.6 s instead of ~5 s. The policy also wraps auth.uid() in (SELECT …), as
--    20260909150000 did for the scope checks, for anything else that reads the
--    table directly.
--
-- Nothing here changes a result: revenue_month_orders returned the same 317
-- August and 209 September rows, column for column, before and after (dry run
-- as the Principal, 2026-09-26). Reversal: re-apply revenue_month_orders from
-- 20260918040000, lookup_pcb from its seed migration (SECURITY INVOKER, no
-- ORDER BY), DROP INDEX idx_pcb_bracket, and ALTER POLICY pcb_all_select USING
-- (auth.uid() IS NOT NULL).

CREATE OR REPLACE FUNCTION public.revenue_month_orders(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(order_id uuid, order_no text, order_date date, event_date date, customer_name text, debtor_code text, venue text, venue_group_key text, venue_group_name text, organizer text, location text, brand_code text, order_total numeric, paid_amount numeric, balance numeric, cancelled boolean, excluded_reason text, erp_status text, erp_on_hold boolean, sequence_in_day integer, staff_id uuid, employee_name text, employee_code text, agent_name text, line_count integer, line_amount numeric, commissionable numeric, margin_revenue numeric, margin_cost numeric, margin_pct numeric, margin_source text, lines_without_cost integer, lines_without_brand integer, open_bill_rank smallint, open_bill_auto boolean, deposit_required numeric, deposit_met boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH scheme AS (
        SELECT s.id,
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
      -- venue_group_key(o.venue), spelled out: the canonical place when a
      -- human folded this spelling into one, else the spelling's own key.
      LEFT JOIN organiser org
             ON org.venue_key = COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue))
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
              -- would show as a fat margin and the engine would disagree - it
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
$function$;

-- ── lookup_pcb ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pcb_bracket
    ON public.pcb_jadual (category, children, income_from);

CREATE OR REPLACE FUNCTION public.lookup_pcb(p_income numeric, p_category pcb_category DEFAULT 'KA1'::pcb_category, p_children integer DEFAULT 0, p_period date DEFAULT CURRENT_DATE)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_pcb DECIMAL;
    v_income_floor DECIMAL;
BEGIN
    -- pcb_all_select, kept by hand now that the query runs as the owner: the
    -- anonymous key sees no rows, so it gets what an empty result gave it.
    IF COALESCE(auth.role(), '') = 'anon' THEN
        RETURN 0;
    END IF;

    v_income_floor := FLOOR(p_income);

    -- The bracket is the one that starts at or below the income: read
    -- backwards down idx_pcb_bracket, it is the first row (20260926100000).
    -- Brackets never overlap, so this is the same row the unordered LIMIT 1
    -- found by walking every bracket below it.
    SELECT p.pcb_amount INTO v_pcb
    FROM pcb_jadual p
    WHERE p.category = p_category
      AND p.children = p_children
      AND p.income_from <= v_income_floor
      AND p.income_to >= v_income_floor
      AND p.effective_from <= p_period
      AND (p.effective_to IS NULL OR p.effective_to >= p_period)
    ORDER BY p.income_from DESC
    LIMIT 1;

    RETURN COALESCE(v_pcb, 0);
END;
$function$;

-- Evaluated once per query instead of once per row read.
ALTER POLICY pcb_all_select ON public.pcb_jadual
    USING ((SELECT auth.uid()) IS NOT NULL);

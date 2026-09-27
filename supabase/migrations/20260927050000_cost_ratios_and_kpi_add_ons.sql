-- Product List › Costing Setting and › Add-on / KPI Items (user 2026-09-27).
--
-- 1. A SKU's OWN cost ratio. The Revenue Team judges every margin on
--    cost ÷ the sub-department's ratio (comm_schemes.revenue_cost_divisor,
--    Fair 0.7 — 2026-09-12); "部分 SKU 它的除法 rate 不一样，比如可能是除以
--    0.6". comm_cost_ratios holds the exceptions, per scheme and SKU; a line
--    is divided by its SKU's ratio, else the scheme's. Matched on the line's
--    product code, which is kept beside the SKU id (the ERP renames codes —
--    the tab shows a renamed SKU and saving follows it).
--
-- 2. A KPI item is a SKU OR a Maintenance special. comm_kpi_items gains
--    `source` ('sku' | 'option') and `option_pool` / `option_value` (a bed
--    frame's or a sofa's special: HB Straight, Wooden Arm). Every existing row
--    is a SKU. MONEY: when a bill carries an item, the item's amount comes off
--    the bill's commissionable sales and is paid flat as KPI instead (user
--    chose "Flat KPI allowance"): RM 10,000 with HB Straight at RM 200 is
--    9,800 at the rate, its margin judged on 9,800, and RM 200 of KPI. Before
--    today a KPI SKU's own LINE left the sales; a line is RM 0 on most bills
--    (the ERP prices packages), so the item's amount is what comes off now.
--
-- 3. comm_kpi_hits — the ONE finder of "which KPI items does this bill
--    carry", the twin of src/lib/commission/kpi.ts orderKpiHits: a SKU by
--    its code; a special among the specials the line carries
--    (catalogue_line_facts: raw.variants, else the ERP's description2
--    grammar), exact spelling first, else without a trailing "(…)", in its
--    own category. A bed frame special counts per bed frame; a sofa's once per
--    bill (the ERP prints it on every module). Items in force at the caller's
--    as-at. ONLY ON A BILL WHOSE SALES COVER THEM (kpi.ts coverKpi): a RM 0.00
--    exchange that still prints the sofa's specials sold no add-on and pays no
--    KPI — as sales, with nothing off. Not a run warning: every warning blocks
--    Apply.
--
-- 4. The SQL readers follow the run: revenue_month_orders (the Comm Cal
--    month), member_order_facts (Insight, Arena, recent income),
--    member_kpi_for_staff (the Today KPI card), member_arena_history_for_staff
--    (fair results) and the two quote contexts (the calculator).
--
-- 5. The two tabs save through catalogue_save_cost_setting and
--    catalogue_save_kpi_items, each one transaction. A KPI item's new amount
--    closes the old row yesterday and opens today's, so a month already run
--    keeps the amount it was run at (the run reads the list as at the month's
--    end); an item removed the same way stops from this month.
--
-- NOTHING MOVES TODAY: no ratio exists, no KPI item exists, and both schemes
-- have KPI switched off. Each change is the old answer when nothing is set.

BEGIN;

-- ── 1. comm_cost_ratios ──────────────────────────────────────────────────────

CREATE TABLE comm_cost_ratios (
    scheme_id      UUID NOT NULL REFERENCES comm_schemes(id) ON DELETE CASCADE,
    erp_product_id TEXT NOT NULL REFERENCES erp_products(erp_id),
    -- The SKU's code when it was set: what a sales line carries.
    product_code   TEXT NOT NULL,
    ratio          NUMERIC(6,4) NOT NULL,
    note           TEXT,
    updated_by     UUID DEFAULT auth.uid(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scheme_id, erp_product_id),
    -- The range revenue_cost_divisor allows (20260915060000).
    CONSTRAINT cost_ratio_range CHECK (ratio > 0 AND ratio <= 10),
    CONSTRAINT cost_ratio_code CHECK (BTRIM(product_code) <> '')
);

-- One ratio per code in a scheme, so a line never finds two.
CREATE UNIQUE INDEX uq_comm_cost_ratio_code ON comm_cost_ratios (scheme_id, UPPER(BTRIM(product_code)));

COMMENT ON TABLE comm_cost_ratios IS
    'A SKU judged at its own Revenue Team cost ratio instead of its scheme''s revenue_cost_divisor (Product List › Costing Setting, 2026-09-27). A line''s cost ÷ this.';

ALTER TABLE comm_cost_ratios ENABLE ROW LEVEL SECURITY;

-- Set on the Product List, whose tab is the Principal's (product_list). At the
-- table it is a commission rule like every comm_* table — Principal and HR —
-- because HR already sets the scheme's own ratio on Rules, and a new
-- sub-department that follows Fair (created by either) copies these rows.
CREATE POLICY comm_cost_ratios_principal_all ON comm_cost_ratios
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
CREATE POLICY comm_cost_ratios_hr_all ON comm_cost_ratios
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- ── 2. comm_kpi_items: a SKU or a special ──────────────────────────────────

ALTER TABLE comm_kpi_items
    ADD COLUMN source         TEXT NOT NULL DEFAULT 'sku',
    ADD COLUMN erp_product_id TEXT REFERENCES erp_products(erp_id),
    ADD COLUMN option_pool    TEXT,
    ADD COLUMN option_value   TEXT,
    ALTER COLUMN product_code DROP NOT NULL,
    ADD CONSTRAINT kpi_item_source CHECK (source IN ('sku', 'option')),
    ADD CONSTRAINT kpi_item_identity CHECK (
        (source = 'sku'
            AND product_code IS NOT NULL AND BTRIM(product_code) <> ''
            AND option_pool IS NULL AND option_value IS NULL)
        OR (source = 'option'
            AND product_code IS NULL AND erp_product_id IS NULL
            AND option_pool IN ('bedframe_specials', 'sofa_specials')
            AND option_value IS NOT NULL AND BTRIM(option_value) <> '')
    ),
    -- The special's twin of no_overlapping_kpi_item: one live row per
    -- (scheme, pool, spelling) at any date.
    ADD CONSTRAINT no_overlapping_kpi_option EXCLUDE USING gist (
        scheme_id WITH =,
        option_pool WITH =,
        (catalogue_value_key(option_value)) WITH =,
        daterange(effective_from, effective_to, '[]') WITH &&
    ) WHERE (source = 'option');

COMMENT ON COLUMN comm_kpi_items.source IS
    'sku = product_code on a line; option = a Maintenance special (option_pool / option_value) among the specials a bed frame or sofa line carries. 2026-09-27.';
COMMENT ON COLUMN comm_kpi_items.kpi_amount IS
    'RM per unit: taken off the bill''s commissionable sales and paid flat as KPI (2026-09-27).';

-- ── 3. comm_kpi_hits — which KPI items the bills carry ──────────────────────

CREATE OR REPLACE FUNCTION comm_kpi_hits(p_scheme UUID, p_order_ids UUID[], p_asat DATE)
RETURNS TABLE (order_id UUID, line_id UUID, item_id UUID, qty NUMERIC, unit_amount NUMERIC)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
    WITH items AS (
        SELECT k.id, k.source, UPPER(BTRIM(k.product_code)) AS code_key,
               k.option_pool, catalogue_value_key(k.option_value) AS value_key, k.kpi_amount
          FROM comm_kpi_items k
         WHERE k.scheme_id = p_scheme
           AND k.effective_from <= p_asat
           AND (k.effective_to IS NULL OR k.effective_to >= p_asat)
    ), lines AS (
        SELECT l.id, l.order_id, UPPER(BTRIM(l.item_group)) AS grp,
               UPPER(BTRIM(l.product_code)) AS code_key, l.description2, l.raw, l.qty, l.line_amount
          FROM sales_order_lines l
         WHERE l.order_id = ANY (p_order_ids)
    ), specials AS (
        -- Read only for a bed frame or a sofa, and only while the scheme has a
        -- special to look for.
        SELECT l.order_id, l.id AS line_id, l.grp, l.qty, s.special
          FROM lines l
          CROSS JOIN LATERAL catalogue_line_facts(l.description2, l.raw) f
          CROSS JOIN LATERAL UNNEST(f.specials) AS s(special)
         WHERE l.grp IN ('BEDFRAME', 'SOFA')
           AND EXISTS (SELECT 1 FROM items i WHERE i.source = 'option')
    ), option_lines AS (
        -- One hit per (line, item), however many times the line prints it.
        -- Exact spelling first; without a trailing "(…)" only when no item
        -- has the exact one (OptionPrices.get / catalogue_option_price).
        SELECT DISTINCT sp.order_id, sp.line_id, i.id AS item_id, i.option_pool, sp.qty, i.kpi_amount
          FROM specials sp
          JOIN items i
            ON i.source = 'option'
           AND sp.grp = CASE i.option_pool WHEN 'bedframe_specials' THEN 'BEDFRAME'
                                           WHEN 'sofa_specials' THEN 'SOFA' END
           AND (i.value_key = catalogue_value_key(sp.special)
                OR (i.value_key = catalogue_value_key(REGEXP_REPLACE(sp.special, '\s*\(.*\)\s*$', ''))
                    AND NOT EXISTS (SELECT 1 FROM items x
                                     WHERE x.source = 'option' AND x.option_pool = i.option_pool
                                       AND x.value_key = catalogue_value_key(sp.special))))
    ), found AS (
        SELECT l.order_id, l.id AS line_id, i.id AS item_id, l.qty, i.kpi_amount
          FROM lines l
          JOIN items i ON i.source = 'sku' AND i.code_key = l.code_key
        UNION ALL
        -- A bed frame special: once per bed frame.
        SELECT o.order_id, o.line_id, o.item_id, o.qty, o.kpi_amount
          FROM option_lines o
         WHERE o.option_pool = 'bedframe_specials'
        UNION ALL
        -- A sofa special: once per bill, its sign the sofa's.
        SELECT o.order_id, MIN(o.line_id::TEXT)::UUID, o.item_id, SIGN(SUM(o.qty)), o.kpi_amount
          FROM option_lines o
         WHERE o.option_pool = 'sofa_specials'
         GROUP BY o.order_id, o.item_id, o.kpi_amount
        HAVING SIGN(SUM(o.qty)) <> 0
    ), goods AS (
        -- Each bill's commissionable sales: its lines in a commissionable group.
        SELECT l.order_id, COALESCE(SUM(l.line_amount) FILTER (WHERE g.commissionable), 0) AS goods
          FROM lines l
          LEFT JOIN comm_item_groups g
                 ON g.scheme_id = p_scheme AND UPPER(BTRIM(g.item_group)) = l.grp
         GROUP BY l.order_id
    ), bills AS (
        SELECT f.order_id, SUM(f.qty * f.kpi_amount) AS kpi
          FROM found f
         GROUP BY f.order_id
    )
    SELECT f.order_id, f.line_id, f.item_id, f.qty, f.kpi_amount
      FROM found f
      JOIN bills b ON b.order_id = f.order_id
      JOIN goods g ON g.order_id = f.order_id
     -- Covered: taking the items off leaves the sales on the same side of 0.
     WHERE CASE WHEN g.goods >= 0 THEN g.goods - b.kpi >= 0 ELSE g.goods - b.kpi <= 0 END;
$fn$;

COMMENT ON FUNCTION comm_kpi_hits(UUID, UUID[], DATE) IS
    'The KPI items these bills carry and are paid, at p_asat (twin of kpi.ts orderKpiHits + coverKpi): a SKU by code, a special among the line''s specials in its own category — per bed frame, once per sofa bill — and only on a bill whose commissionable sales cover them. SECURITY INVOKER: RLS decides what lines a caller sees.';

REVOKE ALL ON FUNCTION comm_kpi_hits(UUID, UUID[], DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comm_kpi_hits(UUID, UUID[], DATE) TO authenticated, service_role;

-- ── 4. revenue_month_orders — the Comm Cal month ────────────────────────────
-- 20260926100000's, with: the KPI items' amount off each bill's sales (both
-- `commissionable` and `margin_revenue` are now its MAIN sales, as the run's
-- product revenue and margin base are), and each line's cost ÷ its SKU's
-- ratio. The KPI items are found once for the month, not per bill.

CREATE OR REPLACE FUNCTION public.revenue_month_orders(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(order_id uuid, order_no text, order_date date, event_date date, customer_name text, debtor_code text, venue text, venue_group_key text, venue_group_name text, organizer text, location text, brand_code text, order_total numeric, paid_amount numeric, balance numeric, cancelled boolean, excluded_reason text, erp_status text, erp_on_hold boolean, sequence_in_day integer, staff_id uuid, employee_name text, employee_code text, agent_name text, line_count integer, line_amount numeric, commissionable numeric, margin_revenue numeric, margin_cost numeric, margin_pct numeric, margin_source text, lines_without_cost integer, lines_without_brand integer, open_bill_rank smallint, open_bill_auto boolean, deposit_required numeric, deposit_met boolean)
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

-- ── 5. member_order_facts — Insight, Arena, recent income ───────────────────
-- 20260926020000's, with: each line's cost ÷ its SKU's ratio; a bill's KPI
-- items (in force at its recognition month's end, the run's as-at) off its
-- sales — `revenue` and `goods_revenue` are its MAIN sales, the margin is
-- taken on them — and `kpi_qty` the items it carries.

CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.*,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS today,
   public.comm_first_paid_month(c.sub_department_id) AS first_paid,
   date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS current_month
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), sources AS (
  -- Resolve the newest committed document BEFORE checking owner, cancellation
  -- or order date, so an older imported version can never be revived.
  SELECT DISTINCT ON (so.order_no) so.* FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  JOIN scheme c ON c.sub_department_id=ib.sub_department_id
  WHERE ib.status='committed' AND so.period_month<=c.current_month
  ORDER BY so.order_no,so.created_at DESC,so.id
 ), scoped AS (
  SELECT so.*,c.enable_kpi,
   -- (20260926020000) A month before the portal pays was settled by hand: its
   -- bills are recognised in their own month and never carried into ours.
   coalesce(r.period_month,CASE WHEN so.period_month<c.first_paid THEN so.period_month ELSE c.current_month END) AS recognition,
   -- The Revenue Team cost basis. Guarded the way marginBase() guards it: a
   -- missing or nonsense divisor divides by one rather than erasing the cost.
   CASE WHEN coalesce(c.revenue_cost_divisor,0)>0 THEN c.revenue_cost_divisor ELSE 1 END AS cost_divisor,
   r.id IS NOT NULL OR coalesce(so.period_month<c.first_paid,false)
    OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
    OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS is_cleared
  FROM sources so CROSS JOIN scheme c
  LEFT JOIN public.comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=c.sub_department_id
  WHERE NOT so.cancelled AND so.order_date<=c.today
 ), windowed AS (
  SELECT o.* FROM scoped o
  WHERE (p_from IS NULL OR o.recognition>=p_from) AND (p_until IS NULL OR o.recognition<p_until)
 ), kpi AS (
  -- (2026-09-27) The KPI items each bill carries, in force at the end of the
  -- month it is recognised in (the run's as-at): their amount is paid flat as
  -- KPI, off its sales. One call per month, none while KPI is off.
  SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT w.recognition FROM windowed w WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT w.id FROM windowed w WHERE w.recognition=m.recognition),
   (m.recognition+interval '1 month - 1 day')::date) h
  GROUP BY h.order_id
 ), line_scope AS (
  SELECT o.id,o.staff_id,o.order_no,o.order_date,o.period_month,o.recognition,
   o.brand_code,o.is_cleared,o.manual_margin_pct,l.line_amount,l.cost_amount,
   -- Layer 2: the cost the salesperson is measured on, not the invoice cost —
   -- each line at its SKU's own ratio, else the scheme's (2026-09-27).
   l.cost_amount/coalesce(cr.ratio,o.cost_divisor) AS team_cost,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
  FROM windowed o JOIN public.sales_order_lines l ON l.order_id=o.id
  LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))
 ), bills AS (
  SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,
   bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods) AS costed,
   sum(l.team_cost) FILTER(WHERE l.is_goods) AS team_cost,
   bool_or(l.is_goods) AS has_goods
  FROM line_scope l
  GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct
 ), split AS (
  -- comm_kpi_hits pays only what a bill's sales cover.
  SELECT b.*,coalesce(k.qty,0) AS kpi_qty,b.goods-coalesce(k.amount,0) AS main
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
  WHERE b.has_goods OR k.order_id IS NOT NULL
 )
 SELECT s.id,s.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED'),s.is_cleared,s.main,s.main,
  CASE WHEN s.main<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.main END,
  s.kpi_qty,s.manual_margin_pct IS NOT NULL
 FROM split s;
$function$;

-- ── 6. member_kpi_for_staff — the Today KPI card ────────────────────────────
-- 20260917040000's, with the items of both kinds and each one's quantity
-- found by comm_kpi_hits on the member's own eligible bills.

CREATE OR REPLACE FUNCTION public.member_kpi_for_staff(p_staff uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date:=date_trunc('month',v_today)::date;
 v_rules_at date:=(date_trunc('month',v_today)+interval '1 month - 1 day')::date;
 v_sub uuid;
 v_enabled boolean;
 v_deposit numeric;
 v_threshold integer;
 v_items jsonb;
 v_total numeric;
BEGIN
 SELECT c.sub_department_id,c.enable_kpi,c.deposit_threshold_pct
 INTO v_sub,v_enabled,v_deposit
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today));
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active membership in this scheme is required' USING ERRCODE='42501';
 END IF;

 IF NOT v_enabled THEN
  RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
   'asOf',now(),'enabled',false,'items','[]'::jsonb,'total',0,'threshold',NULL,'hit',NULL);
 END IF;

 -- The commission run selects its configuration at period end. Retain the
 -- FIRST rung even after it is reached; the old MemberKpi.target is next-unmet.
 SELECT min(k.min_qty) INTO v_threshold FROM public.comm_kpi_thresholds k
 WHERE k.scheme_id=p_scheme AND k.effective_from<=v_rules_at
  AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at);

 WITH configured AS (
  -- A SKU (by its code) or a bed frame's / sofa's special (2026-09-27).
  SELECT k.id,
   CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE upper(btrim(k.product_code)) END AS code,
   coalesce(nullif(btrim(k.product_name),''),
    CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE btrim(k.product_code) END) AS label
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at)
 ), sources AS (
  -- Imports may repeat a document across months. Resolve the latest committed
  -- source before checking its owner/cancellation, so stale copies cannot count.
  SELECT DISTINCT ON (so.order_no) so.* FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  WHERE ib.sub_department_id=v_sub AND ib.status='committed' AND so.period_month<=v_period
  ORDER BY so.order_no,so.created_at DESC,so.id
 ), eligible_orders AS (
  SELECT so.id FROM sources so
  LEFT JOIN public.comm_order_releases r ON r.sub_department_id=v_sub AND r.order_no=so.order_no
  WHERE so.staff_id=v_staff AND NOT so.cancelled AND so.order_date<=v_today
   -- A carried order stays in the month that released it after settlement.
   -- Unreleased, cleared orders belong to the current open month.
   AND coalesce(r.period_month,v_period)=v_period
   AND (r.id IS NOT NULL OR v_deposit IS NULL OR so.order_total<=0
     OR so.paid_amount+0.005>=round(so.order_total*v_deposit,2))
 ), hits AS (
  SELECT h.item_id,sum(h.qty) AS qty
  FROM public.comm_kpi_hits(p_scheme,ARRAY(SELECT o.id FROM eligible_orders o),v_rules_at) h
  GROUP BY h.item_id
 ), quantities AS (
  SELECT c.code,c.label,coalesce(h.qty,0) AS quantity
  FROM configured c LEFT JOIN hits h ON h.item_id=c.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('productCode',code,'label',label,'quantity',quantity)
   ORDER BY label,code),'[]'::jsonb),coalesce(sum(quantity),0)
 INTO v_items,v_total FROM quantities;

 RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),'enabled',true,'items',v_items,'total',v_total,'threshold',v_threshold,
  'hit',CASE WHEN v_threshold IS NULL THEN NULL ELSE v_total>=v_threshold END);
END $function$;

-- ── 7. member_arena_history_for_staff — fair results ────────────────────────
-- 20260921010000's, with a fair's sales being each bill's MAIN sales, so a
-- fair's figures agree with the month's (member_order_facts).

CREATE OR REPLACE FUNCTION public.member_arena_history_for_staff(p_sub_department uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date;
  v_result jsonb;
BEGIN
  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=p_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), sources AS (
    SELECT DISTINCT ON (so.order_no) so.* FROM sales_orders so
    JOIN sales_import_batches ib ON ib.id=so.batch_id
    WHERE ib.sub_department_id=p_sub_department AND ib.status='committed' AND so.period_month<=v_current
    ORDER BY so.order_no,so.created_at DESC,so.id
  ), scoped AS (
    SELECT so.*,c.enable_kpi,coalesce(r.period_month,v_current) AS recognition_month,
      r.id IS NOT NULL OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
        OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS cleared
    FROM sources so JOIN comm_schemes c ON c.id=p_scheme
    LEFT JOIN comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=p_sub_department
    WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
  ), kpi AS (
    -- (2026-09-27) What each bill's KPI items take off its sales, in force at
    -- the end of the month it is recognised in. None while KPI is off.
    SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount
    FROM comm_schemes c
    CROSS JOIN LATERAL (SELECT DISTINCT s.recognition_month FROM scoped s WHERE c.enable_kpi) m
    CROSS JOIN LATERAL comm_kpi_hits(p_scheme,
      ARRAY(SELECT s.id FROM scoped s WHERE s.recognition_month=m.recognition_month),
      (m.recognition_month+interval '1 month - 1 day')::date) h
    WHERE c.id=p_scheme
    GROUP BY h.order_id
  ), line_scope AS (
    SELECT o.id,o.staff_id,o.fair_event_id,o.cleared,l.line_amount,
      EXISTS(SELECT 1 FROM comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
    FROM scoped o JOIN sales_order_lines l ON l.order_id=o.id
  ), bills AS (
    SELECT l.id,l.staff_id,l.fair_event_id,l.cleared,
      coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,bool_or(l.is_goods) AS has_goods
    FROM line_scope l
    GROUP BY l.id,l.staff_id,l.fair_event_id,l.cleared
  ), order_facts AS (
    SELECT b.id,b.staff_id,b.fair_event_id,b.cleared,b.goods-coalesce(k.amount,0) AS revenue
    FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
    WHERE b.has_goods OR k.order_id IS NOT NULL
  ), fairs AS (
    SELECT e.id,coalesce(nullif(btrim(v.display_name),''),e.venue_key) AS venue,
      e.start_date,e.end_date,e.period_month
    FROM comm_venue_events e LEFT JOIN comm_venues v ON v.venue_key=e.venue_key
    WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL AND e.end_date<=v_today
  ), fair_people AS (
    SELECT f.id AS event_id,p.id AS staff_id,p.name,
      coalesce(sum(o.revenue) FILTER(WHERE o.cleared),0) AS sales,
      coalesce(sum(o.revenue) FILTER(WHERE NOT o.cleared),0) AS held,
      count(*) FILTER(WHERE o.cleared) AS orders
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id JOIN roster p ON p.id=o.staff_id
    GROUP BY f.id,p.id,p.name
  ), events AS (
    SELECT f.id,f.venue,f.start_date,f.end_date,f.period_month,
      jsonb_agg(jsonb_build_object('id',fp.staff_id,'name',fp.name,
        'sales',fp.sales,'held',fp.held,'orders',fp.orders) ORDER BY fp.name,fp.staff_id) AS people
    FROM fairs f JOIN fair_people fp ON fp.event_id=f.id
    GROUP BY f.id,f.venue,f.start_date,f.end_date,f.period_month
  ), loose AS (
    SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o WHERE o.fair_event_id IS NULL AND o.cleared
  )
  SELECT jsonb_build_object(
    'asOf',now(),'provisional',true,
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'venue',e.venue,
      'start',e.start_date,'end',e.end_date,'periodMonth',to_char(e.period_month,'YYYY-MM'),
      'people',e.people) ORDER BY e.end_date,e.start_date,e.id) FROM events e),'[]'::jsonb),
    'unassignedOrders',(SELECT orders FROM loose),
    'unassignedSales',(SELECT sales FROM loose),
    'championship',jsonb_build_object('status','pending',
      'reason','Championship totals need every ranking source and a settled scoring ledger. Fair finishes stand on their own until then.'))
  INTO v_result;
  RETURN v_result;
END $function$;

-- ── 8. The quote contexts — the calculator's rules ──────────────────────────
-- 20260915060000's, returning also `costRatios` ({ code: ratio }) and, while
-- the scheme pays KPI, `kpiItems` in force today.

CREATE OR REPLACE FUNCTION public.member_quote_context(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_sub uuid; v_bands jsonb; v_divisor numeric;
 v_kpi_on boolean; v_ratios jsonb; v_kpi jsonb;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT public.has_perm('member_quote') THEN RAISE EXCEPTION 'Quotation access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT d.id,c.revenue_cost_divisor,c.enable_kpi INTO v_sub,v_divisor,v_kpi_on FROM public.comm_schemes c JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 AND public.member_has_membership(v_staff,d.id)
 AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
 AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today));
 IF v_sub IS NULL THEN RAISE EXCEPTION 'An active Fair membership is required for quotation' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'key',m.label,'kind',m.kind,
 'threshold',m.margin_pct*100,'multiplier',m.commission_multiplier,'amount',m.monthly_incentive)),'[]') INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id WHERE m.scheme_id=p_scheme;
 SELECT coalesce(jsonb_object_agg(r.product_code,r.ratio),'{}'::jsonb) INTO v_ratios
 FROM public.comm_cost_ratios r WHERE r.scheme_id=p_scheme;
 IF v_kpi_on THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('source',k.source,'product_code',k.product_code,
   'product_name',k.product_name,'option_pool',k.option_pool,'option_value',k.option_value,
   'kpi_amount',k.kpi_amount)),'[]'::jsonb) INTO v_kpi
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_today AND (k.effective_to IS NULL OR k.effective_to>=v_today);
 ELSE
  v_kpi:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'costDivisor',coalesce(v_divisor,1),
  'costRatios',v_ratios,'kpiItems',v_kpi);
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_quote_context(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_sub uuid;
 v_bands jsonb;
 v_divisor numeric;
 v_kpi_on boolean;
 v_ratios jsonb;
 v_kpi jsonb;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active
 ) THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;

 SELECT d.id,c.revenue_cost_divisor,c.enable_kpi INTO v_sub,v_divisor,v_kpi_on
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
 AND department.payroll_source='commission'
 AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active Fair scheme is required for quotation' USING ERRCODE='42501';
 END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'brand',b.code,'key',m.label,'kind',m.kind,'threshold',m.margin_pct*100,
  'multiplier',m.commission_multiplier,'amount',m.monthly_incentive
 ) ORDER BY b.code,m.margin_pct,m.id),'[]'::jsonb) INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id
 WHERE m.scheme_id=p_scheme AND b.is_active;
 SELECT coalesce(jsonb_object_agg(r.product_code,r.ratio),'{}'::jsonb) INTO v_ratios
 FROM public.comm_cost_ratios r WHERE r.scheme_id=p_scheme;
 IF v_kpi_on THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('source',k.source,'product_code',k.product_code,
   'product_name',k.product_name,'option_pool',k.option_pool,'option_value',k.option_value,
   'kpi_amount',k.kpi_amount)),'[]'::jsonb) INTO v_kpi
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_today AND (k.effective_to IS NULL OR k.effective_to>=v_today);
 ELSE
  v_kpi:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'costDivisor',coalesce(v_divisor,1),
  'costRatios',v_ratios,'kpiItems',v_kpi);
END $function$;

-- ── 9. The Product List's two writers ───────────────────────────────────────
-- Costing Setting and Add-on / KPI Items save through these
-- (catalogue-actions.ts, behind product_list), each in ONE transaction.
-- SECURITY INVOKER: RLS decides who may write, as it does for every comm_*
-- rule table. What names a SKU or a special is read HERE, never taken from
-- the caller: a SKU's code and name from erp_products, a special's spelling
-- from its Maintenance pool.

CREATE OR REPLACE FUNCTION catalogue_save_cost_setting(
    p_scheme  UUID,
    p_divisor NUMERIC,  -- the sub-department's ratio; NULL leaves it alone
    p_ratios  JSONB,    -- [{erp_product_id, ratio}]: a SKU's own ratio, set or changed
    p_removes TEXT[]    -- SKUs going back to the sub-department's ratio
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_touched INTEGER := 0;
    v_n       INTEGER;
    v_missing TEXT;
BEGIN
    PERFORM 1 FROM comm_schemes WHERE id = p_scheme;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown sub-department scheme' USING ERRCODE = 'P0002';
    END IF;

    IF p_divisor IS NOT NULL THEN
        -- The range 20260915060000 gave revenue_cost_divisor.
        IF NOT (p_divisor > 0 AND p_divisor <= 10) THEN
            RAISE EXCEPTION 'A cost ratio must be above 0 and at most 10' USING ERRCODE = '22023';
        END IF;
        UPDATE comm_schemes
           SET revenue_cost_divisor = p_divisor, updated_at = now()
         WHERE id = p_scheme AND revenue_cost_divisor IS DISTINCT FROM p_divisor;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    IF COALESCE(CARDINALITY(p_removes), 0) > 0 THEN
        DELETE FROM comm_cost_ratios WHERE scheme_id = p_scheme AND erp_product_id = ANY (p_removes);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    IF jsonb_typeof(p_ratios) = 'array' AND jsonb_array_length(p_ratios) > 0 THEN
        SELECT r.erp_product_id INTO v_missing
          FROM jsonb_to_recordset(p_ratios) AS r(erp_product_id TEXT, ratio NUMERIC)
         WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = r.erp_product_id)
         LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SKU % is not in the SKU Master', v_missing USING ERRCODE = '23503';
        END IF;
        -- The code is read again on every save, so saving a SKU the ERP
        -- renamed follows it to the code its new bills carry.
        INSERT INTO comm_cost_ratios (scheme_id, erp_product_id, product_code, ratio, updated_by, updated_at)
        SELECT p_scheme, r.erp_product_id, p.item_code, r.ratio, auth.uid(), now()
          FROM jsonb_to_recordset(p_ratios) AS r(erp_product_id TEXT, ratio NUMERIC)
          JOIN erp_products p ON p.erp_id = r.erp_product_id
        ON CONFLICT (scheme_id, erp_product_id) DO UPDATE
           SET product_code = EXCLUDED.product_code,
               ratio        = EXCLUDED.ratio,
               updated_by   = EXCLUDED.updated_by,
               updated_at   = EXCLUDED.updated_at;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    RETURN v_touched;
END;
$fn$;

COMMENT ON FUNCTION catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[]) IS
    'Product List › Costing Setting: a sub-department''s cost ratio and its SKUs'' own, in one transaction (2026-09-27).';

REVOKE ALL ON FUNCTION catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_save_cost_setting(UUID, NUMERIC, JSONB, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION catalogue_save_kpi_items(
    p_scheme  UUID,
    p_adds    JSONB,   -- [{source:'sku', erp_product_id, kpi_amount} | {source:'option', option_pool, option_value, kpi_amount}]
    p_changes JSONB,   -- [{id, kpi_amount}]
    p_removes UUID[]
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_today   DATE := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_touched INTEGER := 0;
    v_item    comm_kpi_items%ROWTYPE;
    v_code    TEXT;
    v_name    TEXT;
    v_value   TEXT;
    r         RECORD;
BEGIN
    PERFORM 1 FROM comm_schemes WHERE id = p_scheme;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown sub-department scheme' USING ERRCODE = 'P0002';
    END IF;

    -- Removed. Begun before today: closed yesterday, so a month already run
    -- keeps it. Begun today or later: it never applied, and goes.
    FOR r IN SELECT DISTINCT u.id FROM UNNEST(COALESCE(p_removes, '{}'::UUID[])) AS u(id) LOOP
        SELECT * INTO v_item FROM comm_kpi_items
         WHERE id = r.id AND scheme_id = p_scheme
           AND (effective_to IS NULL OR effective_to >= v_today)
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A KPI item changed since the page was opened. Reload and try again.'
                USING ERRCODE = '40001';
        END IF;
        IF v_item.effective_from < v_today THEN
            UPDATE comm_kpi_items SET effective_to = v_today - 1 WHERE id = v_item.id;
        ELSE
            DELETE FROM comm_kpi_items WHERE id = v_item.id;
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    -- A new amount, from today, the same way.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_changes, '[]'::JSONB)) AS c(id UUID, kpi_amount NUMERIC) LOOP
        SELECT * INTO v_item FROM comm_kpi_items
         WHERE id = r.id AND scheme_id = p_scheme
           AND (effective_to IS NULL OR effective_to >= v_today)
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A KPI item changed since the page was opened. Reload and try again.'
                USING ERRCODE = '40001';
        END IF;
        CONTINUE WHEN v_item.kpi_amount = r.kpi_amount;
        IF v_item.effective_from < v_today THEN
            UPDATE comm_kpi_items SET effective_to = v_today - 1 WHERE id = v_item.id;
            INSERT INTO comm_kpi_items (scheme_id, source, product_code, product_name, erp_product_id,
                                        option_pool, option_value, kpi_amount,
                                        effective_from, effective_to, created_by)
            VALUES (p_scheme, v_item.source, v_item.product_code, v_item.product_name, v_item.erp_product_id,
                    v_item.option_pool, v_item.option_value, r.kpi_amount,
                    v_today, v_item.effective_to, auth.uid());
        ELSE
            UPDATE comm_kpi_items SET kpi_amount = r.kpi_amount WHERE id = v_item.id;
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    -- New items, in force from today.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_adds, '[]'::JSONB))
               AS a(source TEXT, erp_product_id TEXT, option_pool TEXT, option_value TEXT, kpi_amount NUMERIC) LOOP
        IF r.source = 'sku' THEN
            SELECT p.item_code, p.description INTO v_code, v_name
              FROM erp_products p WHERE p.erp_id = r.erp_product_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'SKU % is not in the SKU Master', r.erp_product_id USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, source, product_code, product_name, erp_product_id,
                                        kpi_amount, effective_from, created_by)
            VALUES (p_scheme, 'sku', v_code, v_name, r.erp_product_id, r.kpi_amount, v_today, auth.uid());
        ELSIF r.source = 'option' THEN
            -- The pool's own spelling: what comm_kpi_hits compares a line against.
            SELECT o.value INTO v_value
              FROM erp_maintenance_options o
             WHERE o.erp_company_id = 1 AND o.pool = r.option_pool
               AND catalogue_value_key(o.value) = catalogue_value_key(r.option_value)
             ORDER BY (o.removed_at IS NULL) DESC, o.value
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '"%" is not in the % Maintenance pool', r.option_value, r.option_pool
                    USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, source, option_pool, option_value,
                                        kpi_amount, effective_from, created_by)
            VALUES (p_scheme, 'option', r.option_pool, v_value, r.kpi_amount, v_today, auth.uid());
        ELSE
            RAISE EXCEPTION 'A KPI item is a SKU or a special, not %', COALESCE(r.source, 'nothing')
                USING ERRCODE = '22023';
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    RETURN v_touched;
END;
$fn$;

COMMENT ON FUNCTION catalogue_save_kpi_items(UUID, JSONB, JSONB, UUID[]) IS
    'Product List › Add-on / KPI Items, in one transaction (2026-09-27). Adds start today; a new amount or a removal of an item begun before today closes it yesterday, so a month already run keeps what it was run at.';

REVOKE ALL ON FUNCTION catalogue_save_kpi_items(UUID, JSONB, JSONB, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_save_kpi_items(UUID, JSONB, JSONB, UUID[]) TO authenticated;

COMMIT;

-- Production's four bodies as they ran on 2026-11-08 (KL), before 20261108010000_gifts_with_purchase — read with
-- pg_get_functiondef through the Supabase CLI (never retyped); each body's md5 is production's (CR stripped).
-- member_order_facts_with_old_bills is 20261107235500's (shares take effect, weighted sales). Loaded by
-- tests/member-sql/validate-gifts-with-purchase.mjs in this order: member_order_facts_with_old_bills before
-- member_order_facts, which reads it.

-- member_quote_cost_rules(uuid) md5 49c4eff9990a4bc0f48c550ecd5fda6e
CREATE OR REPLACE FUNCTION public.member_quote_cost_rules(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object(
  'costDivisor',(SELECT coalesce(c.revenue_cost_divisor,1) FROM public.comm_schemes c WHERE c.id=p_scheme),
  'costRatios',(SELECT coalesce(jsonb_object_agg(r.product_code,r.ratio),'{}'::jsonb)
   FROM public.comm_cost_ratios r WHERE r.scheme_id=p_scheme),
  -- (20261107233000) A rider SKU's ratio for each brand the cart may answer to: { code: { brand: ratio } }.
  'costRatioBrands',(SELECT coalesce(jsonb_object_agg(x.product_code,x.brands),'{}'::jsonb)
   FROM (SELECT b.product_code,jsonb_object_agg(upper(btrim(b.brand_code)),b.ratio) AS brands
    FROM public.comm_cost_ratio_brands b WHERE b.scheme_id=p_scheme GROUP BY b.product_code) x));
$function$
;

-- revenue_month_orders(uuid, date) md5 33b6bd204e8345202879f058bde05933
CREATE OR REPLACE FUNCTION public.revenue_month_orders(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(order_id uuid, order_no text, order_date date, event_date date, customer_name text, debtor_code text, venue text, venue_group_key text, venue_group_name text, organizer text, location text, brand_code text, order_total numeric, paid_amount numeric, balance numeric, cancelled boolean, excluded_reason text, erp_status text, erp_on_hold boolean, sequence_in_day integer, staff_id uuid, employee_name text, employee_code text, agent_name text, line_count integer, line_amount numeric, commissionable numeric, margin_revenue numeric, margin_cost numeric, margin_pct numeric, margin_source text, lines_without_cost integer, lines_without_brand integer, deposit_required numeric, deposit_met boolean, ref_no text, paper_no text)
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
        -- What the rate is paid on: the bill's MAIN sales — its commissionable
        -- lines less its KPI items. What the margin is taken on: the same, less
        -- what its bed frames' divan, leg, gap and total height were CHARGED (2026-10-05) —
        -- the customer's price for an option is out of the margin on both
        -- sides, and still in the sales the rate is paid on.
        COALESCE(l.main, 0),
        COALESCE(l.margin_base, 0),
        l.margin_cost,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_base, 0) <= 0 THEN NULL
            ELSE ROUND((l.margin_base - l.margin_cost) / l.margin_base, 6)
        END,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN 'manual'
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_base, 0) <= 0 THEN 'none'
            ELSE 'cost'
        END,
        COALESCE(l.no_cost, 0)::INTEGER,
        COALESCE(l.no_brand, 0)::INTEGER,
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
      -- (20261107233000) The brand whose ladder the bill answers to, as marginBase() picks it: its own, else the brand
      -- its goods lines sell the most of (on a tie, the one whose first line comes first). A rider SKU may divide by a
      -- ratio of its own for that brand (Product List › Costing Setting).
      LEFT JOIN LATERAL (
          SELECT UPPER(BTRIM(COALESCE(NULLIF(BTRIM(o.brand_code), ''), (
              SELECT bl.brand_code
                FROM sales_order_lines bl
               WHERE bl.order_id = o.id
                 AND NULLIF(bl.brand_code, '') IS NOT NULL
                 AND EXISTS (SELECT 1 FROM comm_item_groups bg
                              WHERE bg.scheme_id = sc.id AND bg.commissionable
                                AND UPPER(BTRIM(bg.item_group)) = UPPER(BTRIM(bl.item_group)))
               GROUP BY bl.brand_code
               ORDER BY SUM(bl.line_amount) DESC, MIN(bl.id::TEXT COLLATE "C")
               LIMIT 1)))) AS brand
      ) lb ON TRUE
      LEFT JOIN LATERAL (
          SELECT g.n, g.amount, g.margin_cost, g.no_cost, g.no_brand,
                 -- comm_kpi_hits pays only what the bill's sales cover.
                 COALESCE(g.goods, 0) - COALESCE(k.amount, 0) AS main,
                 COALESCE(g.goods, 0) - COALESCE(k.amount, 0) - COALESCE(g.charges, 0) AS margin_base
            FROM (
              SELECT
                  COUNT(*) AS n,
                  SUM(sl.line_amount) AS amount,
                  -- Every line in a commissionable group. A free giveaway is
                  -- in it: its cost is real and that is how giving it away is
                  -- meant to hurt the margin.
                  SUM(sl.line_amount) FILTER (WHERE ig.commissionable) AS goods,
                  -- What its bed frames' divan, leg, gap and total height were charged.
                  SUM(sl.option_charge_amount) FILTER (WHERE ig.commissionable) AS charges,
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
                            COALESCE(SUM(sl.cost_amount / COALESCE(crb.ratio, cr.ratio, sc.cost_divisor))
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
                -- (20261107233000) The SKU's ratio for the brand the bill answers to (Costing Setting).
                LEFT JOIN comm_cost_ratio_brands crb
                       ON crb.scheme_id = sc.id
                      AND UPPER(BTRIM(crb.product_code)) = UPPER(BTRIM(sl.product_code))
                      AND UPPER(BTRIM(crb.brand_code)) = lb.brand
               WHERE sl.order_id = o.id
            ) g
      ) l ON TRUE
     ORDER BY o.order_date, o.sequence_in_day NULLS LAST, o.order_no;
$function$
;

-- member_order_facts_with_old_bills(uuid, date, date) md5 c4daa35e4b387d744a5bef3b8edbc23f
CREATE OR REPLACE FUNCTION public.member_order_facts_with_old_bills(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean, no_sales_cost numeric, old_bill boolean, full_revenue numeric, weight numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.*,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS today,
   public.comm_first_paid_month(c.sub_department_id) AS first_paid,
   date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS current_month,
   -- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
   (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = c.sub_department_id) AS feed_floor
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
   -- The bill's own month, always (user 2026-10-06: by record a sale follows
   -- its date, not a close). A close decides only when it is PAID — a bill
   -- the close did not pay is paid by the next month's run (Comm Cal's carry,
   -- lib/commission/carry.ts) — never which month's sales it is.
   so.period_month AS recognition,
   -- The Revenue Team cost basis. Guarded the way marginBase() guards it: a
   -- missing or nonsense divisor divides by one rather than erasing the cost.
   CASE WHEN coalesce(c.revenue_cost_divisor,0)>0 THEN c.revenue_cost_divisor ELSE 1 END AS cost_divisor,
   r.id IS NOT NULL OR coalesce(so.period_month<c.first_paid,false)
    OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
    OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS is_cleared,
   -- (20261107230000) An old bill topped up pays its collector commission, never sales (the user: "is go with b"):
   -- member_order_facts leaves it out; the order books list it, flagged.
   public.sales_order_old_bill(so.source, so.order_date, so.period_month, c.feed_floor) AS old_bill
  FROM sources so CROSS JOIN scheme c
  LEFT JOIN public.comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=c.sub_department_id
  WHERE NOT so.cancelled AND so.order_date<=c.today
 ), windowed AS (
  SELECT o.* FROM scoped o
  WHERE (p_from IS NULL OR o.recognition>=p_from) AND (p_until IS NULL OR o.recognition<p_until)
 ), ladder AS (
  -- (20261107233000) The brand whose ladder each bill answers to, as marginBase() picks it: its own, else the brand its
  -- goods lines sell the most of (on a tie, the one whose first line comes first). A rider SKU may divide by a ratio of
  -- its own for that brand (Product List › Costing Setting).
  SELECT w.id,upper(btrim(coalesce(nullif(btrim(w.brand_code),''),(
   SELECT bl.brand_code FROM public.sales_order_lines bl
   WHERE bl.order_id=w.id AND nullif(bl.brand_code,'') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.comm_item_groups bg WHERE bg.scheme_id=p_scheme AND bg.commissionable
     AND upper(btrim(bg.item_group))=upper(btrim(bl.item_group)))
   GROUP BY bl.brand_code ORDER BY sum(bl.line_amount) DESC,min(bl.id::text COLLATE "C") LIMIT 1)))) AS brand
  FROM windowed w
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
   o.brand_code,o.is_cleared,o.old_bill,o.manual_margin_pct,l.line_amount,l.cost_amount,l.option_charge_amount,
   -- Layer 2: the cost the salesperson is measured on, not the invoice cost —
   -- each line at its SKU's own ratio, else the scheme's (2026-09-27).
   l.cost_amount/coalesce(crb.ratio,cr.ratio,o.cost_divisor) AS team_cost,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
  FROM windowed o JOIN public.sales_order_lines l ON l.order_id=o.id
  LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))
  -- (20261107233000) The SKU's ratio for the brand the bill answers to (Costing Setting).
  LEFT JOIN ladder lb ON lb.id=o.id
  LEFT JOIN public.comm_cost_ratio_brands crb ON crb.scheme_id=p_scheme
   AND upper(btrim(crb.product_code))=upper(btrim(l.product_code)) AND upper(btrim(crb.brand_code))=lb.brand
 ), bills AS (
  SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,l.old_bill,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,
   -- What its bed frames' divan, leg, gap and total height were charged (2026-10-05).
   coalesce(sum(l.option_charge_amount) FILTER(WHERE l.is_goods),0) AS charges,
   bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods) AS costed,
   sum(l.team_cost) FILTER(WHERE l.is_goods) AS team_cost,
   bool_or(l.is_goods) AS has_goods
  FROM line_scope l
  GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,l.old_bill
 ), split AS (
  -- comm_kpi_hits pays only what a bill's sales cover.
  -- The margin is taken on the main sales less the options' charges: the
  -- customer's price for an option is out of the margin on both sides, and
  -- still in the sales (2026-10-05).
  SELECT b.*,coalesce(k.qty,0) AS kpi_qty,b.goods-coalesce(k.amount,0) AS main,
   b.goods-coalesce(k.amount,0)-b.charges AS margin_base,
   CASE WHEN b.goods-coalesce(k.amount,0)-b.charges<=0 AND coalesce(b.costed,true) THEN coalesce(b.team_cost,0) END AS no_sales_cost
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id  WHERE b.has_goods OR k.order_id IS NOT NULL
 ), parts AS (
  SELECT p.order_id,p.staff_id,p.part,p.staff_id IS NOT DISTINCT FROM p.owner_staff_id AS owner
  FROM public.sales_order_parts(ARRAY(SELECT s.id FROM split s)) p
 ), given AS (
  SELECT x.order_id,sum(round(s.main*x.part,2)) AS main,sum(round(s.margin_base*x.part,2)) AS margin_base,
   sum(s.kpi_qty*x.part) AS kpi_qty,sum(round(s.no_sales_cost*x.part,2)) AS no_sales_cost
  FROM parts x JOIN split s ON s.id=x.order_id WHERE NOT x.owner GROUP BY x.order_id
 )
 , stored AS (
  -- (20261107235500) What a standing close or an applied run paid a part at: the multiplier its margin penalty left
  -- (the engine's PenalisedOrder: staffId, orderId, multiplier), a close's before a run's, the newest first. Read once.
  SELECT DISTINCT ON (e.staff_id,e.order_id) e.staff_id,e.order_id,e.multiplier
  FROM (
   SELECT CASE WHEN p->>'staffId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'staffId')::uuid END AS staff_id,
    CASE WHEN p->>'orderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'orderId')::uuid END AS order_id,
    CASE WHEN jsonb_typeof(p->'multiplier')='number' THEN (p->>'multiplier')::numeric END AS multiplier,
    0 AS kind,x.period_month AS at
   FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.penalised_orders)='array' THEN x.penalised_orders ELSE '[]'::jsonb END) p
   WHERE x.reopened_at IS NULL
   UNION ALL
   SELECT CASE WHEN p->>'staffId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'staffId')::uuid END,
    CASE WHEN p->>'orderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'orderId')::uuid END,
    CASE WHEN jsonb_typeof(p->'multiplier')='number' THEN (p->>'multiplier')::numeric END,
    1,r.period_month
   FROM public.comm_runs r JOIN scheme c ON c.sub_department_id=r.sub_department_id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.penalised_orders)='array' THEN r.penalised_orders ELSE '[]'::jsonb END) p
   WHERE r.status IN ('applied','locked')
  ) e
  WHERE e.staff_id IS NOT NULL AND e.order_id IS NOT NULL AND e.multiplier IS NOT NULL
  ORDER BY e.staff_id,e.order_id,e.kind,e.at DESC
 ), paid AS (
  -- A part a standing close paid (its order_ids), when nothing is stored of it: paid in full.
  SELECT DISTINCT x.staff_id,o.order_id FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
  CROSS JOIN LATERAL unnest(x.order_ids) AS o(order_id) WHERE x.reopened_at IS NULL
 ), released AS (
  -- A bill released (paid by a later run), when nothing is stored of it: paid in full.
  SELECT DISTINCT r.order_no FROM public.comm_order_releases r JOIN scheme c ON c.sub_department_id=r.sub_department_id
 ), bands AS (
  -- The penalty bands, only while the scheme cuts commission by margin (engine.ts penaltyBandFor). Read once.
  SELECT b.id,b.margin_pct,b.commission_multiplier,b.sort_order,upper(btrim(br.code)) AS code
  FROM public.comm_margin_bands b JOIN public.comm_brands br ON br.id=b.brand_id JOIN scheme c ON c.id=b.scheme_id
  WHERE b.kind='penalty' AND c.enable_margin_penalty
 ), held AS (
  SELECT s.id,x.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED') AS brand,s.is_cleared,
  CASE WHEN x.owner THEN s.main-coalesce(g.main,0) ELSE round(s.main*x.part,2) END AS part_revenue,
  CASE WHEN x.owner THEN s.margin_base-coalesce(g.margin_base,0) ELSE round(s.margin_base*x.part,2) END AS goods_revenue,
  CASE WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END AS margin_pct,
  CASE WHEN x.owner THEN s.kpi_qty-coalesce(g.kpi_qty,0) ELSE s.kpi_qty*x.part END AS kpi_qty,
  s.manual_margin_pct IS NOT NULL AS manual,
  CASE WHEN x.owner THEN s.no_sales_cost-coalesce(g.no_sales_cost,0) ELSE round(s.no_sales_cost*x.part,2) END AS no_sales_cost,
  s.old_bill,  -- (20261107230000) an old bill topped up: commission, never sales
  -- (20261107235500) The bill's whole revenue, unshared and unweighted; the brand its penalty bands are read for —
  -- ladder's, the one its cost ratios are read for (marginBase's: its own, else its goods lines' most sold; none, every
  -- brand's).
  s.main AS full_revenue,
  nullif(lg.brand,'') AS band_brand
  FROM split s JOIN parts x ON x.order_id=s.id LEFT JOIN given g ON g.order_id=s.id
  LEFT JOIN ladder lg ON lg.id=s.id
 ), weighed AS (
  -- What a part counts at: what it was paid at, else the penalty its margin falls in now (none for a head), else all.
  SELECT h.*,CASE
    WHEN st.multiplier IS NOT NULL THEN st.multiplier
    WHEN pd.order_id IS NOT NULL OR rl.order_no IS NOT NULL THEN 1
    WHEN h.margin_pct IS NOT NULL AND hd.id IS NULL THEN coalesce(pb.commission_multiplier,1)
    ELSE 1 END AS weight
  FROM held h
  LEFT JOIN stored st ON st.staff_id=h.staff_id AND st.order_id=h.id
  LEFT JOIN paid pd ON pd.staff_id=h.staff_id AND pd.order_id=h.id
  LEFT JOIN released rl ON rl.order_no=h.order_no
  LEFT JOIN (SELECT s.id FROM public.hr_staff_costs s JOIN public.titles t ON t.id=s.title_id WHERE t.is_department_head) hd
   ON hd.id=h.staff_id
  LEFT JOIN LATERAL (SELECT bd.commission_multiplier FROM bands bd
    WHERE (h.band_brand IS NULL OR bd.code=h.band_brand) AND h.margin_pct<=bd.margin_pct+1e-9
    ORDER BY bd.margin_pct,bd.sort_order,bd.id LIMIT 1) pb ON true
 )
 -- (20261107235500) The part counts as its commission is: a RM 10,000 bill shared half, RM 5,000; cut to x0.5, RM 2,500.
 SELECT w.id,w.staff_id,w.order_no,w.order_date,w.period_month,w.recognition,w.brand,w.is_cleared,
  round(w.part_revenue*w.weight,2),w.goods_revenue,w.margin_pct,w.kpi_qty,w.manual,w.no_sales_cost,w.old_bill,
  w.full_revenue,w.weight
 FROM weighed w;
$function$
;

-- member_order_facts(uuid, date, date) md5 987d328c0ec4087e4ce6f3e58346a382
CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean, no_sales_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 -- (20261107230000) The Revenue app's sales: every bill member_order_facts_with_old_bills reads but an old bill topped
 -- up, which is commission, never sales (the user: "is go with b, not a"). The calculation lives there.
 SELECT f.order_id,f.staff_id,f.order_no,f.order_date,f.source_period,f.recognition_month,f.brand,f.cleared,f.revenue,
  f.goods_revenue,f.margin_pct,f.kpi_qty,f.manual,f.no_sales_cost
 FROM public.member_order_facts_with_old_bills(p_scheme,p_from,p_until) f
 WHERE NOT f.old_bill;
$function$
;

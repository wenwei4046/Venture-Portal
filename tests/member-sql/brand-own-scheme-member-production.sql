-- Production's bodies (pg_get_functiondef, 2026-11-12) the migration 20261112013000 was written from — read by
-- validate-brand-own-scheme-member.mjs, which checks each md5 before the migration runs. Never edited by hand.

-- member_order_facts_with_old_bills(p_scheme uuid, p_from date, p_until date)
-- md5(prosrc) = 6904a0dd72dcc3abe5b4463071bbe077
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
 ), gwp AS (
  -- (20261108010000) What each bill's purchases earn free (Product List › GWP): the units of each line given.
  SELECT g.line_id,g.free_qty FROM public.sales_order_gwp_free(ARRAY(SELECT w.id FROM windowed w)) g
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
   l.cost_amount*(1-coalesce(gw.free_qty/nullif(l.qty,0),0))/coalesce(crb.ratio,cr.ratio,o.cost_divisor) AS team_cost,
   -- (20261108010000) A line wholly given with a purchase never holds the bill as uncosted.
   coalesce(gw.free_qty>=l.qty,false) AS gwp_whole,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
  FROM windowed o JOIN public.sales_order_lines l ON l.order_id=o.id
  LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))
  -- (20261107233000) The SKU's ratio for the brand the bill answers to (Costing Setting).
  LEFT JOIN ladder lb ON lb.id=o.id
  LEFT JOIN public.comm_cost_ratio_brands crb ON crb.scheme_id=p_scheme
   AND upper(btrim(crb.product_code))=upper(btrim(l.product_code)) AND upper(btrim(crb.brand_code))=lb.brand
  LEFT JOIN gwp gw ON gw.line_id=l.id
 ), bills AS (
  SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,l.old_bill,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,
   -- What its bed frames' divan, leg, gap and total height were charged (2026-10-05).
   coalesce(sum(l.option_charge_amount) FILTER(WHERE l.is_goods),0) AS charges,
   bool_and(l.cost_amount IS NOT NULL OR l.gwp_whole) FILTER(WHERE l.is_goods) AS costed,
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
$function$;

-- member_order_facts(p_scheme uuid, p_from date, p_until date)
-- md5(prosrc) = 987d328c0ec4087e4ce6f3e58346a382
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
$function$;

-- member_scoreboard(p_scheme uuid, p_period date)
-- md5(prosrc) = 86c5cf201f42a5ac0ec3a13910c2b17d
CREATE OR REPLACE FUNCTION public.member_scoreboard(p_scheme uuid, p_period date)
 RETURNS TABLE(staff_id uuid, order_count integer, sales numeric, held numeric, kpi_qty numeric, margin_revenue numeric, margin_cost numeric, blind_orders integer, last_order date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT f.staff_id,count(*) FILTER(WHERE f.cleared)::integer,
  coalesce(sum(f.revenue) FILTER(WHERE f.cleared),0),
  coalesce(sum(f.revenue) FILTER(WHERE NOT f.cleared),0),
  coalesce(sum(f.kpi_qty) FILTER(WHERE f.cleared),0),  coalesce(sum(greatest(f.goods_revenue,0)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  coalesce(sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  count(*) FILTER(WHERE f.cleared AND f.margin_pct IS NULL AND f.no_sales_cost IS NULL)::integer,
  max(f.order_date) FILTER(WHERE f.cleared)
 FROM public.member_order_facts(p_scheme,p_period,(p_period+interval '1 month')::date) f
 GROUP BY f.staff_id;
$function$;

-- member_scoreboard_range(p_scheme uuid, p_from date, p_until date)
-- md5(prosrc) = 8a3ad7360a1a875436d84201aedbe114
CREATE OR REPLACE FUNCTION public.member_scoreboard_range(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(staff_id uuid, order_count integer, sales numeric, held numeric, kpi_qty numeric, margin_revenue numeric, margin_cost numeric, blind_orders integer, last_order date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT f.staff_id,count(*) FILTER(WHERE f.cleared)::integer,
  coalesce(sum(f.revenue) FILTER(WHERE f.cleared),0),
  coalesce(sum(f.revenue) FILTER(WHERE NOT f.cleared),0),
  coalesce(sum(f.kpi_qty) FILTER(WHERE f.cleared),0),  coalesce(sum(greatest(f.goods_revenue,0)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  coalesce(sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) FILTER(WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0)),0),
  count(*) FILTER(WHERE f.cleared AND f.margin_pct IS NULL AND f.no_sales_cost IS NULL)::integer,
  max(f.order_date) FILTER(WHERE f.cleared)
 FROM public.member_order_facts(p_scheme,p_from,p_until) f
 GROUP BY f.staff_id;
$function$;

-- member_arena_for_staff(p_staff uuid, p_sub_department uuid, p_scheme uuid, p_period text, p_window text, p_is_self boolean)
-- md5(prosrc) = 051de9ea5b73791a8ee5b0edd556fe94
CREATE OR REPLACE FUNCTION public.member_arena_for_staff(p_staff uuid, p_sub_department uuid, p_scheme uuid, p_period text, p_window text, p_is_self boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff uuid:=p_staff; v_scheme uuid:=p_scheme;
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date; v_anchor date; v_from date; v_until date;
  v_people jsonb; v_brands jsonb; v_weeks jsonb; v_tiers jsonb;
  v_first date; v_run date; v_open jsonb;
BEGIN
  IF p_window IS NULL OR p_window NOT IN ('monthly','quarterly','annual') THEN RAISE EXCEPTION 'Choose a valid ranking period'; END IF;
  IF p_period IS NOT NULL AND p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Choose a valid month'; END IF;
  v_anchor:=least(coalesce((p_period||'-01')::date,v_current),v_current);
  v_from:=CASE p_window WHEN 'annual' THEN date_trunc('year',v_anchor)::date WHEN 'quarterly' THEN date_trunc('quarter',v_anchor)::date ELSE v_anchor END;
  v_until:=least((v_from+CASE p_window WHEN 'annual' THEN interval '1 year' WHEN 'quarterly' THEN interval '3 months' ELSE interval '1 month' END)::date,(v_current+interval '1 month')::date);

  -- What closes a month: before the cutover it was settled by hand; an
  -- applied run closes it (and every month before it) for everybody.
  v_first:=public.comm_first_paid_month(p_sub_department);
  SELECT max(r.period_month) INTO v_run FROM comm_runs r JOIN comm_schemes rs ON rs.id=r.scheme_id
   WHERE rs.sub_department_id=p_sub_department AND r.status IN ('applied','locked');

  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=v_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), line_facts AS (
    SELECT f.order_id AS id,f.staff_id,f.brand,f.cleared,f.revenue,f.goods_revenue,
      f.margin_pct AS margin,f.kpi_qty AS kpi,f.recognition_month AS month,f.no_sales_cost
    FROM public.member_order_facts(v_scheme,v_from,v_until) f
    WHERE f.staff_id IN (SELECT id FROM roster)
  ), totals AS (
    SELECT f.staff_id,CASE WHEN grouping(f.brand)=1 THEN NULL ELSE f.brand END AS brand,
      jsonb_build_object('sales',coalesce(sum(f.revenue) FILTER(WHERE f.cleared),0),
        'held',coalesce(sum(f.revenue) FILTER(WHERE NOT f.cleared),0),'orders',count(*) FILTER(WHERE f.cleared),
        'kpiQty',coalesce(sum(f.kpi) FILTER(WHERE f.cleared),0),        'marginRevenue',coalesce(sum(greatest(f.goods_revenue,0)) FILTER(WHERE f.cleared AND (f.margin IS NOT NULL OR f.no_sales_cost>0)),0),
        'marginCost',coalesce(sum(coalesce(f.goods_revenue*(1-f.margin),f.no_sales_cost)) FILTER(WHERE f.cleared AND (f.margin IS NOT NULL OR f.no_sales_cost>0)),0),
        'blindOrders',count(*) FILTER(WHERE f.cleared AND f.margin IS NULL AND f.no_sales_cost IS NULL)) AS score
    FROM line_facts f GROUP BY GROUPING SETS ((f.staff_id),(f.staff_id,f.brand))
  ), closes AS (
    -- Each person's last standing close in this sub-department.
    SELECT x.staff_id,max(x.period_month) AS last_closed FROM comm_salesperson_closes x
    WHERE x.sub_department_id=p_sub_department AND x.reopened_at IS NULL GROUP BY x.staff_id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'self',p_is_self AND p.id=v_staff,
      'brands',coalesce((SELECT jsonb_object_agg(b.brand,b.score) FROM totals b WHERE b.staff_id=p.id AND b.brand IS NOT NULL),'{}'::jsonb))
      || coalesce(t.score,'{"sales":0,"held":0,"orders":0,"kpiQty":0,"marginRevenue":0,"marginCost":0,"blindOrders":0}'::jsonb) ORDER BY p.name),'[]'::jsonb),
    -- Months still moving: one with a bill of somebody not yet closed for it.
    (SELECT coalesce(jsonb_agg(DISTINCT to_char(lf.month,'YYYY-MM') ORDER BY to_char(lf.month,'YYYY-MM')),'[]'::jsonb)
       FROM line_facts lf LEFT JOIN closes c ON c.staff_id=lf.staff_id
      WHERE lf.month>=v_current
         OR NOT (lf.month<coalesce(v_first,'-infinity'::date)
              OR lf.month<=coalesce(v_run,'-infinity'::date)
              OR lf.month<=coalesce(c.last_closed,'-infinity'::date)))
    INTO v_people,v_open FROM roster p LEFT JOIN totals t ON t.staff_id=p.id AND t.brand IS NULL;

  -- A month that has not ended is open whatever its bills say.
  IF v_until>v_current THEN
    SELECT coalesce(jsonb_agg(DISTINCT m ORDER BY m),'[]'::jsonb) INTO v_open
      FROM (SELECT jsonb_array_elements_text(v_open) AS m UNION SELECT to_char(v_current,'YYYY-MM')) x;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('code',b.code,'name',b.name) ORDER BY b.name),'[]'::jsonb)
    INTO v_brands FROM comm_brands b WHERE b.scheme_id=v_scheme AND b.is_active;

  -- The ladder the board measures against. Thresholds follow the BRAND, so the
  -- board reads them per brand rather than assuming one scale.
  SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'bandKey',m.band_key,
      'label',m.label,'marginPct',m.margin_pct,'amount',m.monthly_incentive)
      ORDER BY b.code, m.margin_pct DESC),'[]'::jsonb)
    INTO v_tiers FROM comm_margin_bands m JOIN comm_brands b ON b.id=m.brand_id
   WHERE m.scheme_id=v_scheme AND m.kind='incentive';

  SELECT jsonb_build_object('weeks',w.weeks,'counts',w.counts) INTO v_weeks FROM member_arena_brand_weeks w
    WHERE w.staff_id=v_staff AND w.sub_department_id=p_sub_department AND w.period_month=v_anchor;
  RETURN jsonb_build_object('membershipId',p_sub_department,'department',(SELECT name FROM comm_sub_departments WHERE id=p_sub_department),
    'selfId',CASE WHEN p_is_self THEN v_staff::text ELSE '' END,'period',to_char(v_anchor,'YYYY-MM'),'window',p_window,'from',v_from,'through',least(v_until-1,v_today),
    'asOf',now(),'live',v_until>v_current,'people',v_people,'brands',v_brands,'brandWeeks',v_weeks,'tiers',v_tiers,
    'openMonths',v_open,'final',v_until<=v_current AND jsonb_array_length(v_open)=0);
END $function$;

-- member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
-- md5(prosrc) = fd6297bdaa9b3ab0839613fc1e2ec221
CREATE OR REPLACE FUNCTION public.member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.id,c.sub_department_id,c.enable_kpi,c.deposit_threshold_pct
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), facts AS (
  -- (20261107230000) The old bills topped up too, flagged old_bill: listed, commission only — never in the margins
  -- (the user: "i want can view, then mention no count in sales target (arena)").
  SELECT f.* FROM public.member_order_facts_with_old_bills(p_scheme,p_from,p_until) f WHERE f.staff_id=p_staff
 ), parts AS (
  SELECT p.order_id,p.staff_id,p.part,p.owner_staff_id
  FROM public.sales_order_parts(ARRAY(SELECT f.order_id FROM facts f)) p
 ), hits AS (
  -- The KPI items of each line, in force at the end of the month its bill is
  -- recognised in (member_order_facts' as-at). None while KPI is off.
  SELECT h.line_id,sum(h.qty*coalesce(pt.part,1)) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
  LEFT JOIN parts pt ON pt.order_id=h.order_id AND pt.staff_id=p_staff
  GROUP BY h.line_id
 )
 SELECT jsonb_build_object(
  'from',to_char(p_from,'YYYY-MM'),
  'through',to_char((p_until-interval '1 day')::date,'YYYY-MM'),
  'asOf',now(),
  'paysFrom',(SELECT to_char(public.comm_first_paid_month(c.sub_department_id),'YYYY-MM') FROM scheme c),
  'closedMonths',(SELECT coalesce(jsonb_agg(z.m ORDER BY z.m),'[]'::jsonb) FROM (
    SELECT to_char(x.period_month,'YYYY-MM') AS m FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
    WHERE x.staff_id=p_staff AND x.reopened_at IS NULL
    UNION
    SELECT to_char(r.period_month,'YYYY-MM') FROM public.comm_runs r
    JOIN public.comm_schemes rs ON rs.id=r.scheme_id JOIN scheme c ON c.sub_department_id=rs.sub_department_id
    WHERE r.status IN ('applied','locked')) z),
  'brandWeeks',(SELECT coalesce(jsonb_object_agg(w.week::text,w.brand),'{}'::jsonb)
    FROM scheme c CROSS JOIN LATERAL public.member_erp_brand_weeks(c.sub_department_id,p_staff) w
    WHERE w.brand IS NOT NULL AND w.week>=p_from-7 AND w.week<p_until+7),
  'margins',(WITH mb AS (
     SELECT to_char(f.recognition_month,'YYYY-MM') AS month,f.brand,sum(greatest(f.goods_revenue,0)) AS rev,
      sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) AS cost
     FROM facts f WHERE f.cleared AND NOT f.old_bill AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0) GROUP BY 1,2)
   SELECT jsonb_build_object(
    'overall',(SELECT CASE WHEN sum(m.rev)>0 THEN round((sum(m.rev)-sum(m.cost))/sum(m.rev)*100,4) END FROM mb m),
    'brands',coalesce((SELECT jsonb_object_agg(x.brand,CASE WHEN x.rev>0 THEN round((x.rev-x.cost)/x.rev*100,4) END)
      FROM (SELECT m.brand,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.brand) x),'{}'::jsonb),
    'months',coalesce((SELECT jsonb_object_agg(y.month,jsonb_build_object(
      'overall',CASE WHEN y.rev>0 THEN round((y.rev-y.cost)/y.rev*100,4) END,
      'brands',(SELECT jsonb_object_agg(z.brand,CASE WHEN z.rev>0 THEN round((z.rev-z.cost)/z.rev*100,4) END) FROM mb z WHERE z.month=y.month)))
      FROM (SELECT m.month,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.month) y),'{}'::jsonb))),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',f.order_id,
    'number',f.order_no,
    'ref',nullif(btrim(so.bill_ref),''),
    'customer',coalesce(nullif(btrim(so.customer_name),''),''),
    'date',f.order_date,
    'sourceMonth',to_char(f.source_period,'YYYY-MM'),
    'recognitionMonth',to_char(f.recognition_month,'YYYY-MM'),
    'brand',f.brand,
    'booth',CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(public.erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END,
    'venue',coalesce(nullif(btrim(so.venue),''),''),
    'fairStart',ev.start_date,
    'fairEnd',ev.end_date,
    'organiser',coalesce(org.name,nullif(btrim(ev.erp_organiser_text),'')),
    -- The fair weekend the bill belongs to, named by its Friday (a fair is in
    -- the week it opens); a bill no fair claims, by the week it was written.
    'week',(date_trunc('week',coalesce(ev.start_date,f.order_date))::date+4),
    'revenue',f.revenue,
    'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,
    'noSales',f.margin_pct IS NULL AND f.no_sales_cost IS NOT NULL,
    'kpiQty',f.kpi_qty,
    'cleared',f.cleared,
    'carried',f.source_period<f.recognition_month,
    'manual',f.manual,
    'total',so.order_total,
    'paid',so.paid_amount,
    'depositNeeded',CASE WHEN c.deposit_threshold_pct IS NULL THEN NULL ELSE round(so.order_total*c.deposit_threshold_pct,2) END,
    'own',so.staff_id IS NOT DISTINCT FROM p_staff,
    'share',CASE WHEN EXISTS(SELECT 1 FROM parts y WHERE y.order_id=f.order_id AND y.staff_id IS DISTINCT FROM y.owner_staff_id)
     THEN jsonb_build_object(
      'part',(SELECT y.part FROM parts y WHERE y.order_id=f.order_id AND y.staff_id=p_staff),
      'holders',(SELECT jsonb_agg(jsonb_build_object('id',y.staff_id,'name',coalesce(hs.employee_name,''),'pct',y.part,
          'owner',y.staff_id IS NOT DISTINCT FROM y.owner_staff_id)
        ORDER BY (y.staff_id IS NOT DISTINCT FROM y.owner_staff_id) DESC,hs.employee_name,y.staff_id)
        FROM parts y LEFT JOIN public.hr_staff_costs hs ON hs.id=y.staff_id WHERE y.order_id=f.order_id)) END,
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',coalesce(nullif(btrim(l.product_name),''),l.product_code,''),
      'code',l.product_code,
      'qty',l.qty,
      'amount',l.line_amount,
      'goods',EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable),
      'kpiQty',coalesce(h.qty,0))
      ORDER BY l.line_no,l.id),'[]'::jsonb)
     FROM public.sales_order_lines l LEFT JOIN hits h ON h.line_id=l.id
     WHERE l.order_id=f.order_id))
   -- (20261107230000) An old bill topped up: commission only, and the ERP's salesperson on it.
   || CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END
   -- (20261107235500) The whole bill's revenue; and what this part counts at, when its commission is cut.
   || jsonb_build_object('fullRevenue',f.full_revenue)
   || CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb));
$function$;

-- member_principal_department_order_book(p_sub_department uuid, p_from text, p_until text)
-- md5(prosrc) = c56232677b0541b8aec7a564d4a33cc1
CREATE OR REPLACE FUNCTION public.member_principal_department_order_book(p_sub_department uuid, p_from text, p_until text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid:=public.member_principal_department_scheme(p_sub_department);
 v_range daterange:=public.member_insight_window(p_from,p_until);
 v_result jsonb;
BEGIN
 WITH scheme AS (
  SELECT c.id,c.sub_department_id,c.enable_kpi,c.deposit_threshold_pct FROM public.comm_schemes c WHERE c.id=v_scheme
 ), facts AS (
  -- One row a bill: member_order_facts gives each holder of a shared bill their part (the owner the remainder, to the
  -- sen), so the parts add back up to the bill.
  SELECT f.order_id,min(f.order_no) AS order_no,min(f.order_date) AS order_date,min(f.source_period) AS source_period,
   min(f.recognition_month) AS recognition_month,min(f.brand) AS brand,bool_and(f.cleared) AS cleared,
   sum(f.revenue) AS revenue,min(f.margin_pct) AS margin_pct,sum(f.kpi_qty) AS kpi_qty,bool_or(f.manual) AS manual,
   sum(f.goods_revenue) AS goods_revenue,sum(f.no_sales_cost) AS no_sales_cost,
   -- (20261107230000) The old bills topped up too, flagged old_bill: listed, commission only — never in the margins
   -- (the user: "i want can view, then mention no count in sales target (arena)").
   bool_or(f.old_bill) AS old_bill,
   -- (20261107235500) The whole bill's revenue; what its parts count at together — the one weight they share, else
   -- what they come to over the whole.
   min(f.full_revenue) AS full_revenue,
   CASE WHEN min(f.weight) = max(f.weight) THEN min(f.weight)
        WHEN min(f.full_revenue) <> 0 THEN round(sum(f.revenue) / min(f.full_revenue), 4)
        ELSE min(f.weight) END AS weight
  FROM public.member_order_facts_with_old_bills(v_scheme,lower(v_range),upper(v_range)) f
  GROUP BY f.order_id
 ), parts AS (
  SELECT p.order_id,p.staff_id,p.part,p.owner_staff_id
  FROM public.sales_order_parts(ARRAY(SELECT f.order_id FROM facts f)) p
 ), hits AS (
  -- The KPI items of each line, the whole bill's, in force at the end of the month it is recognised in. None while
  -- KPI is off.
  SELECT h.line_id,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(v_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
  GROUP BY h.line_id
 )
 SELECT jsonb_build_object(
  'from',to_char(lower(v_range),'YYYY-MM'),
  'through',to_char((upper(v_range)-1),'YYYY-MM'),
  'asOf',now(),
  'paysFrom',(SELECT to_char(public.comm_first_paid_month(c.sub_department_id),'YYYY-MM') FROM scheme c),
  -- Closed for everybody: a run applied.
  'closedMonths',(SELECT coalesce(jsonb_agg(DISTINCT to_char(r.period_month,'YYYY-MM') ORDER BY to_char(r.period_month,'YYYY-MM')),'[]'::jsonb)
    FROM public.comm_runs r JOIN public.comm_schemes rs ON rs.id=r.scheme_id JOIN scheme c ON c.sub_department_id=rs.sub_department_id
    WHERE r.status IN ('applied','locked')),
  'brandWeeks','{}'::jsonb,
  'principalView',true,
  'wholeDepartment',true,
  'margins',(WITH mb AS (
     SELECT to_char(f.recognition_month,'YYYY-MM') AS month,f.brand,sum(greatest(f.goods_revenue,0)) AS rev,
      sum(coalesce(f.goods_revenue*(1-f.margin_pct),f.no_sales_cost)) AS cost
     FROM facts f WHERE f.cleared AND NOT f.old_bill AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0) GROUP BY 1,2)
   SELECT jsonb_build_object(
    'overall',(SELECT CASE WHEN sum(m.rev)>0 THEN round((sum(m.rev)-sum(m.cost))/sum(m.rev)*100,4) END FROM mb m),
    'brands',coalesce((SELECT jsonb_object_agg(x.brand,CASE WHEN x.rev>0 THEN round((x.rev-x.cost)/x.rev*100,4) END)
      FROM (SELECT m.brand,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.brand) x),'{}'::jsonb),
    'months',coalesce((SELECT jsonb_object_agg(y.month,jsonb_build_object(
      'overall',CASE WHEN y.rev>0 THEN round((y.rev-y.cost)/y.rev*100,4) END,
      'brands',(SELECT jsonb_object_agg(z.brand,CASE WHEN z.rev>0 THEN round((z.rev-z.cost)/z.rev*100,4) END) FROM mb z WHERE z.month=y.month)))
      FROM (SELECT m.month,sum(m.rev) AS rev,sum(m.cost) AS cost FROM mb m GROUP BY m.month) y),'{}'::jsonb))),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',f.order_id,
    'number',f.order_no,
    'ref',nullif(btrim(so.bill_ref),''),
    'customer',coalesce(nullif(btrim(so.customer_name),''),''),
    'date',f.order_date,
    'sourceMonth',to_char(f.source_period,'YYYY-MM'),
    'recognitionMonth',to_char(f.recognition_month,'YYYY-MM'),
    'brand',f.brand,
    'booth',CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(public.erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END,
    'venue',coalesce(nullif(btrim(so.venue),''),''),
    'fairStart',ev.start_date,
    'fairEnd',ev.end_date,
    'organiser',coalesce(org.name,nullif(btrim(ev.erp_organiser_text),'')),
    'week',(date_trunc('week',coalesce(ev.start_date,f.order_date))::date+4),
    'revenue',f.revenue,
    'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,
    'noSales',f.margin_pct IS NULL AND f.no_sales_cost IS NOT NULL,
    'kpiQty',f.kpi_qty,
    'cleared',f.cleared,
    'carried',f.source_period<f.recognition_month,
    'manual',f.manual,
    'total',so.order_total,
    'paid',so.paid_amount,
    'depositNeeded',CASE WHEN c.deposit_threshold_pct IS NULL THEN NULL ELSE round(so.order_total*c.deposit_threshold_pct,2) END,
    'own',false,
    -- Whose bill it is: the salesperson the ERP put on it.
    'seller',CASE WHEN so.staff_id IS NULL THEN NULL
      ELSE jsonb_build_object('id',so.staff_id,'name',coalesce(st.employee_name,'')) END,
    'share',CASE WHEN EXISTS(SELECT 1 FROM parts y WHERE y.order_id=f.order_id AND y.staff_id IS DISTINCT FROM y.owner_staff_id)
     THEN jsonb_build_object(
      'part',1,
      'holders',(SELECT jsonb_agg(jsonb_build_object('id',y.staff_id,'name',coalesce(hs.employee_name,''),'pct',y.part,
          'owner',y.staff_id IS NOT DISTINCT FROM y.owner_staff_id)
        ORDER BY (y.staff_id IS NOT DISTINCT FROM y.owner_staff_id) DESC,hs.employee_name,y.staff_id)
        FROM parts y LEFT JOIN public.hr_staff_costs hs ON hs.id=y.staff_id WHERE y.order_id=f.order_id)) END,
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',coalesce(nullif(btrim(l.product_name),''),l.product_code,''),
      'code',l.product_code,
      'qty',l.qty,
      'amount',l.line_amount,
      'goods',EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=c.id
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable),
      'kpiQty',coalesce(h.qty,0))
      ORDER BY l.line_no,l.id),'[]'::jsonb)
     FROM public.sales_order_lines l LEFT JOIN hits h ON h.line_id=l.id
     WHERE l.order_id=f.order_id))
   -- (20261107230000) An old bill topped up: commission only, and the ERP's salesperson on it.
   || CASE WHEN f.old_bill THEN jsonb_build_object('commissionOnly',true,'soldBy',nullif(btrim(so.agent_name),'')) ELSE '{}'::jsonb END
   -- (20261107235500) The whole bill's revenue; and what it counts at, when its parts' commission is cut.
   || jsonb_build_object('fullRevenue',f.full_revenue)
   || CASE WHEN f.weight < 1 THEN jsonb_build_object('weight',f.weight) ELSE '{}'::jsonb END
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.hr_staff_costs st ON st.id=so.staff_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb)
 ) INTO v_result;
 RETURN v_result;
END $function$;

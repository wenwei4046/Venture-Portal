-- Production's bodies read with pg_get_functiondef on 2026-11-07 23:25 KL, 20261107230000 and 20261107233000_sku_ratios_by_brand live — what
-- 20261107235500_shares_take_effect_weighted_sales.sql was written from (md5 of prosrc in each block's first line).

-- sales_order_old_bill() md5 b041e9f29254d99d6b13fbd269b3d3fb
CREATE OR REPLACE FUNCTION public.sales_order_old_bill(p_source text, p_order_date date, p_period date, p_floor date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT COALESCE(p_source = 'erp_sync' AND p_order_date < p_floor AND p_period >= p_floor, false)
$function$
;

-- sales_order_parts() md5 5232a846101d466c329cf34148db4d48
CREATE OR REPLACE FUNCTION public.sales_order_parts(p_orders uuid[])
 RETURNS TABLE(order_id uuid, staff_id uuid, part numeric, owner_staff_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH o AS (
  SELECT so.id,so.staff_id FROM public.sales_orders so WHERE so.id=ANY(p_orders)
 ), held AS (
  SELECT sh.order_id,sh.staff_id,sh.share_pct FROM public.sales_order_shares sh JOIN o ON o.id=sh.order_id
  WHERE sh.staff_id IS DISTINCT FROM o.staff_id AND sh.share_pct>0 AND sh.share_pct<1
 ), given AS (
  SELECT h.order_id,sum(h.share_pct) AS pct FROM held h GROUP BY h.order_id HAVING sum(h.share_pct)<1
 )
 SELECT o.id,o.staff_id,1-coalesce(g.pct,0),o.staff_id FROM o LEFT JOIN given g ON g.order_id=o.id
 UNION ALL
 SELECT h.order_id,h.staff_id,h.share_pct,o.staff_id FROM held h JOIN given g ON g.order_id=h.order_id JOIN o ON o.id=h.order_id
$function$
;

-- member_order_facts_with_old_bills() md5 3bd13b6f3d7d2b9a8e87d97850d2df4c
CREATE OR REPLACE FUNCTION public.member_order_facts_with_old_bills(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean, no_sales_cost numeric, old_bill boolean)
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
 SELECT s.id,x.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED'),s.is_cleared,
  CASE WHEN x.owner THEN s.main-coalesce(g.main,0) ELSE round(s.main*x.part,2) END,
  CASE WHEN x.owner THEN s.margin_base-coalesce(g.margin_base,0) ELSE round(s.margin_base*x.part,2) END,
  CASE WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END,
  CASE WHEN x.owner THEN s.kpi_qty-coalesce(g.kpi_qty,0) ELSE s.kpi_qty*x.part END,
  s.manual_margin_pct IS NOT NULL,
  CASE WHEN x.owner THEN s.no_sales_cost-coalesce(g.no_sales_cost,0) ELSE round(s.no_sales_cost*x.part,2) END
 ,s.old_bill  -- (20261107230000) an old bill topped up: commission, never sales
 FROM split s JOIN parts x ON x.order_id=s.id LEFT JOIN given g ON g.order_id=s.id;
$function$
;

-- member_order_facts() md5 987d328c0ec4087e4ce6f3e58346a382
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

-- member_order_book_for_staff() md5 dda01c1653e5bccfc6191905c5f4e5bf
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
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb));
$function$
;

-- member_principal_department_order_book() md5 06407bc90bc5e9ca1a888bd19a9fc730
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
   bool_or(f.old_bill) AS old_bill
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
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.hr_staff_costs st ON st.id=so.staff_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb)
 ) INTO v_result;
 RETURN v_result;
END $function$
;

-- member_arena_history_for_staff() md5 44f66cb5dc4526ae177534929043bc5c
CREATE OR REPLACE FUNCTION public.member_arena_history_for_staff(p_sub_department uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  -- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
  v_floor date := (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = p_sub_department);
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
      -- (20261107230000) An old bill topped up is commission, never sales.
      AND NOT public.sales_order_old_bill(so.source, so.order_date, so.period_month, v_floor)
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
END $function$
;

-- member_arena_booth_history_for_staff() md5 877c601f547dd01fecec83a4799a93bd
CREATE OR REPLACE FUNCTION public.member_arena_booth_history_for_staff(p_sub_department uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  -- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
  v_floor date := (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = p_sub_department);
  v_current date:=date_trunc('month',v_today)::date;
  -- The brand weeks the app shows (My brand weeks, Today, the claim form): this
  -- month's weekends and the two months' before — the month still being worked
  -- can be two back early in a month.
  v_weeks_from date:=(date_trunc('month',v_today)-interval '2 months')::date;
  v_weeks_until date:=(date_trunc('month',v_today)+interval '1 month')::date;
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
        OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS cleared,
      -- The booth the salesperson picked in the ERP, while that pick is the
      -- bill's fair (lib/exhibitions.ts boothOf + brandCodeFor).
      CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END AS booth_pick,
      nullif(btrim(so.brand_code),'') AS own_brand
    FROM sources so JOIN comm_schemes c ON c.id=p_scheme
    LEFT JOIN comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=p_sub_department
    WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
      -- (20261107230000) An old bill topped up is commission, never sales.
      AND NOT public.sales_order_old_bill(so.source, so.order_date, so.period_month, v_floor)
  ), kpi AS (
    SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount
    FROM comm_schemes c
    CROSS JOIN LATERAL (SELECT DISTINCT s.recognition_month FROM scoped s WHERE c.enable_kpi) m
    CROSS JOIN LATERAL comm_kpi_hits(p_scheme,
      ARRAY(SELECT s.id FROM scoped s WHERE s.recognition_month=m.recognition_month),
      (m.recognition_month+interval '1 month - 1 day')::date) h
    WHERE c.id=p_scheme
    GROUP BY h.order_id
  ), line_scope AS (
    SELECT o.id,o.staff_id,o.fair_event_id,o.booth_pick,o.own_brand,o.cleared,l.line_amount,
      EXISTS(SELECT 1 FROM comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
    FROM scoped o JOIN sales_order_lines l ON l.order_id=o.id
  ), bills AS (
    SELECT l.id,l.staff_id,l.fair_event_id,l.booth_pick,l.own_brand,l.cleared,
      coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,bool_or(l.is_goods) AS has_goods
    FROM line_scope l
    GROUP BY l.id,l.staff_id,l.fair_event_id,l.booth_pick,l.own_brand,l.cleared
  ), order_facts AS (
    SELECT b.id,b.staff_id,b.fair_event_id,b.booth_pick,b.own_brand,b.cleared,b.goods-coalesce(k.amount,0) AS revenue
    FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
    WHERE b.has_goods OR k.order_id IS NOT NULL
  ), fairs AS (
    SELECT e.id,coalesce(nullif(btrim(v.display_name),''),e.venue_key) AS venue,
      coalesce(nullif(btrim(org.name),''),nullif(btrim(e.erp_organiser_text),'')) AS organizer,
      e.start_date,e.end_date,e.period_month,
      -- The fair weekend: the Friday of the Monday–Sunday week it opens in.
      (date_trunc('week',e.start_date::timestamp)::date+4) AS week
    FROM comm_venue_events e LEFT JOIN comm_venues v ON v.venue_key=e.venue_key
    LEFT JOIN comm_organisers org ON org.id=e.organiser_id
    WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL AND e.end_date<=v_today
  ), erp_weeks AS (
    -- The first layer: the booth the ERP's Sales Attending lists each seller
    -- at, for the weekend its fair opens in.
    SELECT w.* FROM public.member_erp_brand_weeks(p_sub_department) w
    WHERE w.staff_id IN (SELECT id FROM roster)
  ), written AS (
    -- What each seller wrote each week, by the brand each bill names — its
    -- booth pick, else its own brand. Only for guessing the week's brand.
    SELECT f.week,o.staff_id,coalesce(o.booth_pick,o.own_brand) AS brand,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    WHERE coalesce(o.booth_pick,o.own_brand) IS NOT NULL
    GROUP BY f.week,o.staff_id,coalesce(o.booth_pick,o.own_brand)
  ), guessed AS (
    -- The second layer, only where the ERP lists them at no booth that
    -- weekend — the engine as it was: the brand they opened the most bills
    -- for that week, then the most sales.
    SELECT DISTINCT ON (w.staff_id,w.week) w.staff_id,w.week,w.brand
    FROM written w
    WHERE NOT EXISTS (SELECT 1 FROM erp_weeks e WHERE e.staff_id=w.staff_id AND e.week=w.week)
    ORDER BY w.staff_id,w.week,w.bills DESC,w.amount DESC,w.brand
  ), week_brand AS (
    SELECT e.staff_id,e.week,e.brand,'erp'::text AS source FROM erp_weeks e
    UNION ALL
    SELECT g.staff_id,g.week,g.brand,'auto'::text FROM guessed g
  ), fits AS (
    -- At each fair that week, what can be a guessed seller's booth's: the
    -- bills picked at that brand's booth, and the bills with no pick.
    SELECT f.id AS fair_id,f.week,o.staff_id,wb.brand,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week AND wb.source='auto'
    WHERE o.booth_pick IS NULL OR o.booth_pick=wb.brand
    GROUP BY f.id,f.week,o.staff_id,wb.brand
  ), placed AS (
    -- The ONE booth a week that scores: the one the ERP lists them at; else
    -- their guessed brand, at the fair with the most bills for it.
    SELECT e.fair_id,e.week,e.staff_id,e.brand,'erp'::text AS source FROM erp_weeks e WHERE e.fair_id IS NOT NULL
    UNION ALL
    (SELECT DISTINCT ON (x.staff_id,x.week) x.fair_id,x.week,x.staff_id,x.brand,'auto'::text
     FROM fits x
     ORDER BY x.staff_id,x.week,x.bills DESC,x.amount DESC,x.fair_id)
  ), held_parts AS (
    SELECT pt.order_id,pt.staff_id,pt.part,pt.staff_id IS NOT DISTINCT FROM pt.owner_staff_id AS owner
    FROM public.sales_order_parts(ARRAY(SELECT o.id FROM order_facts o WHERE o.fair_event_id IS NOT NULL)) pt
  ), held_given AS (
    SELECT x.order_id,sum(round(o.revenue*x.part,2)) AS revenue
    FROM held_parts x JOIN order_facts o ON o.id=x.order_id WHERE NOT x.owner GROUP BY x.order_id
  ), order_parts AS (
    SELECT o.id,x.staff_id,o.fair_event_id,o.booth_pick,o.own_brand,o.cleared,
      CASE WHEN x.owner THEN o.revenue-coalesce(g.revenue,0) ELSE round(o.revenue*x.part,2) END AS revenue
    FROM order_facts o JOIN held_parts x ON x.order_id=o.id LEFT JOIN held_given g ON g.order_id=o.id
  ), appearances AS (
    -- Every bill at a completed fair, at the booth it was written at: its
    -- pick, else the booth its seller worked that week, else its own brand
    -- (NULL: the fair's no-brand board).
    SELECT o.id,o.staff_id,o.fair_event_id,o.cleared,o.revenue,
      coalesce(o.booth_pick,wb.brand,o.own_brand) AS booth,wb.source
    FROM order_parts o JOIN fairs f ON f.id=o.fair_event_id
    LEFT JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week
  ), booth_people AS (
    SELECT a.fair_event_id AS fair_id,a.booth,a.staff_id,
      max(a.source) AS source,
      EXISTS(SELECT 1 FROM placed pl WHERE pl.staff_id=a.staff_id AND pl.fair_id=a.fair_event_id
        AND pl.brand IS NOT DISTINCT FROM a.booth) AS scoring,
      coalesce(sum(a.revenue) FILTER(WHERE a.cleared),0) AS sales,
      coalesce(sum(a.revenue) FILTER(WHERE NOT a.cleared),0) AS held,
      count(*) FILTER(WHERE a.cleared) AS orders
    FROM appearances a
    GROUP BY a.fair_event_id,a.booth,a.staff_id
  ), events AS (
    SELECT f.id AS fair_id,bp.booth,f.venue,f.organizer,f.start_date,f.end_date,f.period_month,f.week,
      public.member_arena_week_closes_on(f.week) AS closes_on,
      jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sales',bp.sales,'held',bp.held,
        'orders',bp.orders,'source',bp.source,'confirmed',bp.source='erp','scoring',bp.scoring) ORDER BY p.name,p.id) AS people
    FROM booth_people bp JOIN fairs f ON f.id=bp.fair_id JOIN roster p ON p.id=bp.staff_id
    GROUP BY f.id,bp.booth,f.venue,f.organizer,f.start_date,f.end_date,f.period_month,f.week
  ), loose AS (
    SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o WHERE o.fair_event_id IS NULL AND o.cleared
  ), off_week AS (
    -- On a board without scoring: another booth than the seller's brand week,
    -- a second fair that week, or the no-brand board.
    SELECT coalesce(sum(bp.orders),0) AS orders,coalesce(sum(bp.sales),0) AS sales
    FROM booth_people bp WHERE NOT bp.scoring
  ), shown_weeks AS (
    -- Each seller's brand week, this month's weekends and the two months'
    -- before: where the ERP lists them (upcoming weekends too), else where the
    -- second layer placed them by their bills.
    SELECT e.staff_id,e.week,'erp'::text AS source,e.brand,e.fair_id,e.venue,e.organizer,e.start_date,e.end_date,e.booths
    FROM erp_weeks e WHERE e.week>=v_weeks_from AND e.week<v_weeks_until
    UNION ALL
    SELECT pl.staff_id,pl.week,'auto'::text,pl.brand,pl.fair_id,f.venue,f.organizer,f.start_date,f.end_date,NULL::integer
    FROM placed pl JOIN fairs f ON f.id=pl.fair_id
    WHERE pl.source='auto' AND pl.week>=v_weeks_from AND pl.week<v_weeks_until
  )
  SELECT jsonb_build_object(
    'asOf',now(),'provisional',true,
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.fair_id::text||'|'||coalesce(e.booth,''),'fairId',e.fair_id,
      'brand',e.booth,'venue',e.venue,'organizer',e.organizer,'start',e.start_date,'end',e.end_date,'week',e.week,
      'closesOn',e.closes_on,'locked',v_today>e.closes_on,
      'periodMonth',to_char(e.period_month,'YYYY-MM'),'people',e.people)
      ORDER BY e.end_date,e.start_date,e.fair_id,e.booth NULLS LAST) FROM events e),'[]'::jsonb),
    'weeks',coalesce((SELECT jsonb_agg(jsonb_build_object('staffId',w.staff_id,'week',w.week,'source',w.source,
      'brand',w.brand,'fairId',w.fair_id,'venue',w.venue,'organizer',w.organizer,'start',w.start_date,'end',w.end_date,
      'booths',w.booths) ORDER BY w.week,w.staff_id) FROM shown_weeks w),'[]'::jsonb),
    'unassignedOrders',(SELECT orders FROM loose),
    'unassignedSales',(SELECT sales FROM loose),
    'offWeekOrders',(SELECT orders FROM off_week),
    'offWeekSales',(SELECT sales FROM off_week),
    'championship',jsonb_build_object('status','pending',
      'reason','Championship totals need every ranking source and a settled scoring ledger. Fair finishes stand on their own until then.'))
  INTO v_result;
  RETURN v_result;
END $function$
;

-- share_request_blocked() md5 23ded4ba1424897388e56e0c9b52e5e1
CREATE OR REPLACE FUNCTION public.share_request_blocked(p_order uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month date;
  v_no    text;
  v_sub   uuid;
  v_who   text;
BEGIN
  SELECT so.period_month, so.order_no, b.sub_department_id INTO v_month, v_no, v_sub
    FROM public.sales_orders so JOIN public.sales_import_batches b ON b.id = so.batch_id
   WHERE so.id = p_order;
  IF v_month IS NULL THEN
    RETURN 'That bill is not there any more.';
  END IF;
  IF public.commission_order_period_locked(v_sub, v_month) THEN
    RETURN to_char(v_month, 'Mon YYYY') || ' is in payroll, so who shares ' || v_no || ' cannot change.';
  END IF;
  SELECT string_agg(DISTINCT s.employee_name || '’s ' || to_char(x.period_month, 'Mon YYYY'), ', ') INTO v_who
    FROM public.comm_salesperson_closes x JOIN public.hr_staff_costs s ON s.id = x.staff_id
   WHERE x.reopened_at IS NULL AND x.order_ids && ARRAY[p_order];
  IF v_who IS NOT NULL THEN
    RETURN v_who || ' is closed on Comm Cal, so who shares ' || v_no || ' cannot change until HR reopens it.';
  END IF;  IF EXISTS (SELECT 1 FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
              WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM so.staff_id) THEN
    RETURN v_no || ' is shared already — HR changes who shares it on Comm Cal.';
  END IF;
  RETURN NULL;
END
$function$
;

-- share_request_team() md5 17fac6af9f46ff6f2c6b7073b3f2e3a8
CREATE OR REPLACE FUNCTION public.share_request_team(p_sub uuid)
 RETURNS TABLE(staff_id uuid, name text, title text, user_id uuid, login boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_scheme uuid;
BEGIN
  SELECT c.id INTO v_scheme FROM public.comm_schemes c
   WHERE c.sub_department_id = p_sub AND c.is_active
     AND c.effective_from <= v_today AND (c.effective_to IS NULL OR c.effective_to >= v_today)
   ORDER BY c.effective_from DESC, c.created_at DESC, c.id LIMIT 1;
  RETURN QUERY
  SELECT DISTINCT ON (s.id) s.id, s.employee_name, coalesce(t.name, st.name), s.user_id,
         coalesce(u.is_active, false)
    FROM public.comm_hierarchy h
    JOIN public.hr_staff_costs s ON s.id = h.staff_id
    LEFT JOIN public.titles t ON t.id = h.title_id
    LEFT JOIN public.titles st ON st.id = s.title_id
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE h.scheme_id = v_scheme AND s.status = 'active'
     AND (s.resignation_date IS NULL OR s.resignation_date >= v_today)
     AND h.effective_from <= v_today AND (h.effective_to IS NULL OR h.effective_to >= v_today)
     AND NOT coalesce(t.is_department_head, false) AND NOT coalesce(st.is_department_head, false)
   ORDER BY s.id, h.effective_from DESC;
END
$function$
;

-- share_requests_json() md5 f59e7e17c8ee6634d68c9b4031a5d4e8
CREATE OR REPLACE FUNCTION public.share_requests_json(p_ids uuid[], p_staff uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'status', r.status, 'orderId', r.order_id, 'orderNo', r.order_no,
             'periodMonth', to_char(r.period_month, 'YYYY-MM'), 'subDepartmentId', r.sub_department_id,
             'owner', jsonb_build_object('id', r.owner_staff_id, 'name', r.owner_name),
             'note', r.note, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
             'decidedAt', r.decided_at, 'decidedByName', r.decided_by_name, 'decisionNote', r.decision_note,
             'mine', CASE WHEN p_staff IS NULL THEN NULL
                          WHEN r.owner_staff_id = p_staff THEN 'owner'
                          WHEN EXISTS (SELECT 1 FROM public.sales_order_share_request_parts y
                                        WHERE y.request_id = r.id AND y.staff_id = p_staff) THEN 'partner' END,
             'bill', (SELECT jsonb_build_object('date', so.order_date, 'customer', coalesce(nullif(btrim(so.customer_name), ''), ''),
                              'venue', coalesce(nullif(btrim(so.venue), ''), ''), 'total', so.order_total,
                              'ownerId', so.staff_id, 'counts', NOT so.cancelled,
                              'periodMonth', to_char(so.period_month, 'YYYY-MM'))
                        FROM public.sales_orders so WHERE so.id = r.order_id),
             'parts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', y.staff_id, 'name', y.staff_name, 'pct', y.share_pct,
                                        'answer', y.answer, 'answeredAt', y.answered_at, 'note', y.answer_note)
                                      ORDER BY y.staff_name, y.staff_id)
                                  FROM public.sales_order_share_request_parts y WHERE y.request_id = r.id), '[]'::jsonb),
             'holders', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.staff_id, 'name', coalesce(hs.employee_name, ''),
                                          'pct', h.pct, 'owner', h.owner)
                                        ORDER BY h.owner DESC, hs.employee_name, h.staff_id)
                                    FROM (SELECT so.staff_id, 1 - coalesce((SELECT sum(sh.share_pct) FROM public.sales_order_shares sh
                                                  WHERE sh.order_id = so.id AND sh.staff_id IS DISTINCT FROM so.staff_id), 0) AS pct,
                                                 true AS owner
                                            FROM public.sales_orders so WHERE so.id = r.order_id AND so.staff_id IS NOT NULL
                                          UNION ALL
                                          SELECT sh.staff_id, sh.share_pct, false
                                            FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
                                           WHERE sh.order_id = r.order_id AND sh.staff_id IS DISTINCT FROM so.staff_id) h
                                    LEFT JOIN public.hr_staff_costs hs ON hs.id = h.staff_id), '[]'::jsonb),
             'events', coalesce((SELECT jsonb_agg(jsonb_build_object('step', e.step, 'name', e.actor_name, 'at', e.created_at,
                                         'note', e.note) ORDER BY e.created_at, e.id)
                                   FROM public.sales_order_share_request_events e WHERE e.request_id = r.id), '[]'::jsonb))
           ORDER BY x.ord)
      FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
      JOIN public.sales_order_share_requests r ON r.id = x.id
  ), '[]'::jsonb);
END
$function$
;

-- notify_people() md5 50259847648f421acbe03abd41dd0d95
CREATE OR REPLACE FUNCTION public.notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id)
  SELECT u.id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 400), p_ref_kind, p_ref_id
    FROM public.users u
   WHERE u.id IN (SELECT DISTINCT x FROM unnest(p_users) x WHERE x IS NOT NULL)
     AND u.is_active
     AND u.id IS DISTINCT FROM auth.uid();
END
$function$
;

-- notification_topic_may() md5 5bd3decefb4fb753a3ef464573ff0b66
CREATE OR REPLACE FUNCTION public.notification_topic_may(p_user uuid, p_topic text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_may boolean := false;
BEGIN
  IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.is_active) THEN
    RETURN false;
  END IF;
  IF p_topic = 'people.probation' THEN
    RETURN public.probation_notice_may(p_user);
  END IF;
  IF p_topic IS NULL OR p_topic NOT IN ('hiring.guest', 'rooms.guest', 'member.requests', 'it.requests') THEN
    RETURN false;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
    v_may := CASE p_topic
      WHEN 'hiring.guest' THEN public.has_any_action(ARRAY['hiring.approve']) IS TRUE
        AND public.tab_write_open(ARRAY['/hiring/requests'], ARRAY['hiring.approve']) IS TRUE
      WHEN 'rooms.guest' THEN public.has_any_action(ARRAY['rooms.edit']) IS TRUE
        AND public.tab_write_open(ARRAY['/admin/rooms'], ARRAY['rooms.edit']) IS TRUE
      WHEN 'member.requests' THEN public.member_is_manager('member_requests_manage') IS TRUE
        AND public.tab_write_open(ARRAY['/member-admin'], ARRAY['member.manage']) IS TRUE
      ELSE public.has_any_action(ARRAY['it_requests.view']) IS TRUE
    END;
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    RETURN false;
  END;
  RETURN v_may;
END
$function$
;

-- notify_topic() md5 5a9bbaa9340cfad42ed1960a275c3e56
CREATE OR REPLACE FUNCTION public.notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_people(ARRAY(SELECT t.user_id FROM public.notification_topics t WHERE t.topic = p_topic AND public.notification_topic_may(t.user_id, p_topic)), p_kind, p_title, p_body, p_ref_kind, p_ref_id);
END
$function$
;

-- notification_topics_sync() md5 931c63761257d74fbe3b0162f2d71464
CREATE OR REPLACE FUNCTION public.notification_topics_sync(p_topics text[])
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me   uuid := auth.uid();
  v_keep text[];
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  v_keep := ARRAY(
    SELECT DISTINCT t FROM unnest(coalesce(p_topics, '{}'::text[])) t
     WHERE t IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation')
       AND public.notification_topic_may(v_me, t)
     ORDER BY t);
  DELETE FROM public.notification_topics
   WHERE user_id = v_me AND topic IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation')
     AND NOT (topic = ANY (v_keep));
  INSERT INTO public.notification_topics (user_id, topic)
  SELECT v_me, t FROM unnest(v_keep) t
  ON CONFLICT (user_id, topic) DO UPDATE SET synced_at = now();
  RETURN v_keep;
END
$function$
;

-- sales_order_shares_guard() md5 682faa11fa480ba73f56122390a9ff1f
CREATE OR REPLACE FUNCTION public.sales_order_shares_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order sales_orders%ROWTYPE;
    v_sub   UUID;
    v_row   sales_order_shares%ROWTYPE;
    v_total NUMERIC;
BEGIN
    v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

    SELECT * INTO v_order FROM sales_orders WHERE id = v_row.order_id;
    SELECT b.sub_department_id INTO v_sub
      FROM sales_import_batches b WHERE b.id = v_order.batch_id;

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing who shares this bill.',
            TO_CHAR(v_order.period_month, 'Mon YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF v_order.staff_id IS NULL THEN
        RAISE EXCEPTION 'Match this bill to a salesperson before sharing it'
            USING ERRCODE = '23SHR';
    END IF;
    IF NEW.staff_id = v_order.staff_id THEN
        RAISE EXCEPTION 'A bill cannot be shared with the person it already belongs to'
            USING ERRCODE = '23SHR';
    END IF;

    SELECT COALESCE(SUM(share_pct), 0) INTO v_total
      FROM sales_order_shares
     WHERE order_id = NEW.order_id
       AND staff_id <> NEW.staff_id;
    IF v_total + NEW.share_pct >= 1 THEN
        RAISE EXCEPTION 'The shares on this bill would leave its owner nothing (% shared)',
            ROUND((v_total + NEW.share_pct) * 100, 1) || '%'
            USING ERRCODE = '23SHR';
    END IF;

    RETURN NEW;
END;
$function$
;

-- member_share_order_send() md5 388916e2f526dee74410a0ca3cf40e86
CREATE OR REPLACE FUNCTION public.member_share_order_send(p_order uuid, p_parts jsonb, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me     uuid := auth.uid();
  v_staff  uuid := public.member_staff_id();
  v_order  public.sales_orders%ROWTYPE;
  v_sub    uuid;
  v_reason text;
  v_part   jsonb;
  v_text   text;
  v_pid    uuid;
  v_pct    numeric;
  v_ids    uuid[] := '{}';
  v_pcts   numeric[] := '{}';
  v_names  text[] := '{}';
  v_users  uuid[] := '{}';
  v_sum    numeric := 0;
  v_other  numeric;
  v_member record;
  v_change boolean := false;
  v_owner  text;
  v_note   text := btrim(coalesce(p_note, ''));
  v_id     uuid;
  i        integer;
BEGIN
  IF public.tab_box_closed('rev.requests', 'create') THEN
    RAISE EXCEPTION 'Sending a share request is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order;
  IF v_order.id IS NULL OR v_order.staff_id IS DISTINCT FROM v_staff THEN
    RAISE EXCEPTION 'Only the salesperson on the bill can share it.' USING ERRCODE = '42501';
  END IF;
  IF v_order.cancelled THEN
    RAISE EXCEPTION '% does not count, so there is nothing to share.', v_order.order_no USING ERRCODE = '22023';
  END IF;
  SELECT b.sub_department_id INTO v_sub FROM public.sales_import_batches b WHERE b.id = v_order.batch_id;
  v_reason := public.share_request_blocked(p_order);
  IF v_reason IS NOT NULL THEN
    RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_order_share_requests r WHERE r.order_id = p_order AND r.status IN ('partner', 'hr')) THEN
    RAISE EXCEPTION 'A share request for % is already open — follow it on the bill, or withdraw it first.', v_order.order_no
      USING ERRCODE = '23505';
  END IF;
  IF length(v_note) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) = 0 THEN
    RAISE EXCEPTION 'Pick who to share it with.' USING ERRCODE = '22023';
  END IF;  IF jsonb_array_length(p_parts) > 1 THEN
    RAISE EXCEPTION 'Share a bill with one colleague — the two of you hold half each.' USING ERRCODE = '22023';
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts) LOOP
    v_text := v_part ->> 'staffId';
    IF v_text IS NULL OR v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Pick who to share it with.' USING ERRCODE = '22023';
    END IF;
    v_pid := v_text::uuid;
    IF v_pid = v_staff THEN
      RAISE EXCEPTION 'It is your bill already — pick a colleague to share it with.' USING ERRCODE = '22023';
    END IF;
    IF v_pid = ANY (v_ids) THEN
      RAISE EXCEPTION 'The same person is there twice — remove one.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_part -> 'pct') <> 'number' THEN
      RAISE EXCEPTION 'Give each colleague a part of the bill.' USING ERRCODE = '22023';
    END IF;
    v_pct := round((v_part ->> 'pct')::numeric, 4);    IF v_pct <> 0.5 THEN
      RAISE EXCEPTION 'A shared bill is half each — 50%% for you, 50%% for your colleague.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_member FROM public.share_request_team(v_sub) t WHERE t.staff_id = v_pid;
    IF v_member.staff_id IS NULL THEN
      RAISE EXCEPTION '% is not in this bill’s sub-department’s team, so no part of it would be paid to them.',
        coalesce((SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = v_pid), 'That person') USING ERRCODE = '22023';
    END IF;
    IF NOT v_member.login THEN
      RAISE EXCEPTION '% has no Revenue app login yet, so they cannot accept. Ask HR to share it on Comm Cal.', v_member.name
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.comm_salesperson_closes x
                WHERE x.staff_id = v_pid AND x.sub_department_id = v_sub
                  AND x.period_month >= v_order.period_month AND x.reopened_at IS NULL) THEN
      RAISE EXCEPTION '%’s % is closed on Comm Cal, so they cannot take a part of this bill now.', v_member.name,
        to_char(v_order.period_month, 'Mon YYYY') USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sales_order_shares sh WHERE sh.order_id = p_order AND sh.staff_id = v_pid
                    AND abs(sh.share_pct - v_pct) < 0.00005) THEN
      v_change := true;
    END IF;
    v_ids := v_ids || v_pid;
    v_pcts := v_pcts || v_pct;
    v_names := v_names || v_member.name;
    v_users := v_users || v_member.user_id;
    v_sum := v_sum + v_pct;
  END LOOP;

  -- The owner keeps a part: what the colleagues would hold, and what anybody else holds already.
  SELECT coalesce(sum(sh.share_pct), 0) INTO v_other FROM public.sales_order_shares sh
   WHERE sh.order_id = p_order AND sh.staff_id IS DISTINCT FROM v_staff AND NOT (sh.staff_id = ANY (v_ids));
  IF v_sum + v_other >= 0.99995 THEN
    RAISE EXCEPTION 'That leaves you nothing — you always keep a part of your own bill.' USING ERRCODE = '22023';
  END IF;
  IF NOT v_change THEN
    RAISE EXCEPTION 'They already hold those parts of % — nothing to change.', v_order.order_no USING ERRCODE = '22023';
  END IF;

  SELECT s.employee_name INTO v_owner FROM public.hr_staff_costs s WHERE s.id = v_staff;
  INSERT INTO public.sales_order_share_requests (order_id, order_no, sub_department_id, period_month, owner_staff_id, owner_name,
                                                 sent_by, note)
  VALUES (p_order, v_order.order_no, v_sub, v_order.period_month, v_staff, v_owner, v_me, v_note)
  RETURNING id INTO v_id;
  FOR i IN 1 .. array_length(v_ids, 1) LOOP
    INSERT INTO public.sales_order_share_request_parts (request_id, staff_id, staff_name, share_pct)
    VALUES (v_id, v_ids[i], v_names[i], v_pcts[i]);
  END LOOP;
  INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_staff_id, actor_name, note)
  VALUES (v_id, 'sent', v_me, v_staff, v_owner, nullif(v_note, ''));

  BEGIN
    FOR i IN 1 .. array_length(v_ids, 1) LOOP
      PERFORM public.notify_people(ARRAY[v_users[i]], 'share', 'Share request · ' || v_order.order_no,
        v_owner || ' wants to share ' || v_order.order_no || ' with you: your part '
          || regexp_replace(to_char(round(v_pcts[i] * 100, 2), 'FM990.00'), '\.?0+$', '') || '% of RM '
          || to_char(v_order.order_total, 'FM999,999,990.00')
          || coalesce(' · ' || nullif(btrim(v_order.venue), ''), '') || '. Accept or decline in the Revenue app.',
        'share_request', v_id::text);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'member_share_order_send: nobody was told of % (%)', v_order.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[v_id], v_staff) -> 0;
END
$function$
;

-- member_share_order_answer() md5 5da728faa7bf1a9f9756b3d3b0457c13
CREATE OR REPLACE FUNCTION public.member_share_order_answer(p_request uuid, p_accept boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_staff   uuid := public.member_staff_id();
  v_r       public.sales_order_share_requests%ROWTYPE;
  v_part    public.sales_order_share_request_parts%ROWTYPE;
  v_name    text;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_owner   uuid;
  v_waiting text;
BEGIN
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'Accept or decline.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_r FROM public.sales_order_share_requests WHERE id = p_request FOR UPDATE;
  SELECT * INTO v_part FROM public.sales_order_share_request_parts WHERE request_id = p_request AND staff_id = v_staff;
  IF v_r.id IS NULL OR v_part.request_id IS NULL THEN
    RAISE EXCEPTION 'That share request is not yours to answer.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'partner' OR v_part.answer <> 'pending' THEN
    RAISE EXCEPTION 'This share request was answered already — it is %.',
      CASE WHEN v_part.answer = 'accepted' AND v_r.status = 'partner' THEN 'waiting for the others'
           ELSE CASE v_r.status WHEN 'hr' THEN 'with HR' WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected'
                                WHEN 'declined' THEN 'declined' WHEN 'cancelled' THEN 'withdrawn' ELSE v_r.status END END
      USING ERRCODE = '22023';
  END IF;
  v_name := v_part.staff_name;
  UPDATE public.sales_order_share_request_parts
     SET answer = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, answered_at = now(), answer_note = v_note
   WHERE request_id = p_request AND staff_id = v_staff;
  INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_staff_id, actor_name, note)
  VALUES (p_request, CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, v_me, v_staff, v_name, v_note);
  SELECT s.user_id INTO v_owner FROM public.hr_staff_costs s WHERE s.id = v_r.owner_staff_id;
  SELECT string_agg(y.staff_name, ', ' ORDER BY y.staff_name) INTO v_waiting
    FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request AND y.answer = 'pending';

  IF NOT p_accept THEN
    UPDATE public.sales_order_share_requests SET status = 'declined', updated_at = now() WHERE id = p_request;
  ELSIF v_waiting IS NULL THEN
    UPDATE public.sales_order_share_requests SET status = 'hr', updated_at = now() WHERE id = p_request;
  ELSE
    UPDATE public.sales_order_share_requests SET updated_at = now() WHERE id = p_request;
  END IF;

  BEGIN
    IF NOT p_accept THEN
      PERFORM public.notify_people(
        ARRAY[v_owner] || ARRAY(SELECT s.user_id FROM public.sales_order_share_request_parts y
                                  JOIN public.hr_staff_costs s ON s.id = y.staff_id
                                 WHERE y.request_id = p_request AND y.answer = 'accepted'),
        'share', v_r.order_no || ' · share declined',
        v_name || ' declined sharing ' || v_r.order_no || '.' || coalesce(' “' || left(v_note, 200) || '”', ''),
        'share_request', p_request::text);
    ELSIF v_waiting IS NULL THEN
      PERFORM public.notify_people(ARRAY[v_owner], 'share', v_r.order_no || ' · accepted — with HR now',
        v_name || ' accepted sharing ' || v_r.order_no || '. HR approves it on Comm Cal.', 'share_request', p_request::text);
    ELSE
      PERFORM public.notify_people(ARRAY[v_owner], 'share', v_r.order_no || ' · ' || v_name || ' accepted',
        'Still waiting for ' || v_waiting || '.', 'share_request', p_request::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'member_share_order_answer: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[p_request], v_staff) -> 0;
END
$function$
;

-- revenue_share_request_decide() md5 9b4e77261994128a41802f53666ea135
CREATE OR REPLACE FUNCTION public.revenue_share_request_decide(p_request uuid, p_approve boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me      uuid := auth.uid();
  v_r       public.sales_order_share_requests%ROWTYPE;
  v_order   public.sales_orders%ROWTYPE;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_who     text;
  v_reason  text;
  v_part    record;
  v_waiting text;
  v_line    text;
  v_users   uuid[];
BEGIN
  IF NOT coalesce(public.has_any_action(ARRAY['revenue.edit']), false) THEN
    RAISE EXCEPTION 'Deciding share requests is not open to your account.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]'], ARRAY['revenue.edit']);
  IF p_approve IS NULL THEN
    RAISE EXCEPTION 'Approve or reject.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_r FROM public.sales_order_share_requests WHERE id = p_request FOR UPDATE;
  IF v_r.id IS NULL THEN
    RAISE EXCEPTION 'That share request is not there.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status <> 'hr' THEN
    SELECT string_agg(y.staff_name, ', ' ORDER BY y.staff_name) INTO v_waiting
      FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request AND y.answer = 'pending';
    RAISE EXCEPTION '%', CASE v_r.status
      WHEN 'partner' THEN 'It is still waiting for ' || coalesce(v_waiting, 'the colleagues') || ' to accept — HR decides once everybody has.'
      WHEN 'approved' THEN 'It was approved already.'
      WHEN 'rejected' THEN 'It was rejected already.'
      WHEN 'declined' THEN 'A colleague declined it, so there is nothing to approve.'
      ELSE 'The salesperson withdrew it.' END USING ERRCODE = '22023';
  END IF;
  IF NOT p_approve AND v_note IS NULL THEN
    RAISE EXCEPTION 'Say why it is rejected — the salespeople read it.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(nullif(btrim(s.employee_name), ''), nullif(btrim(u.name), ''), u.email, 'HR') INTO v_who
    FROM public.users u
    LEFT JOIN LATERAL (SELECT x.employee_name FROM public.hr_staff_costs x WHERE x.user_id = u.id AND x.status = 'active'
                        ORDER BY x.created_at, x.id LIMIT 1) s ON true
   WHERE u.id = v_me;
  v_who := coalesce(v_who, 'HR');

  IF p_approve THEN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = v_r.order_id;
    IF v_order.id IS NULL THEN
      RAISE EXCEPTION 'The bill is not there any more — reject this request.' USING ERRCODE = '22023';
    END IF;
    IF v_order.staff_id IS DISTINCT FROM v_r.owner_staff_id THEN
      RAISE EXCEPTION '% is %’s now — it moved since % asked. Reject this request.', v_order.order_no,
        coalesce((SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = v_order.staff_id), 'nobody'), v_r.owner_name
        USING ERRCODE = '22023';
    END IF;
    IF v_order.cancelled THEN
      RAISE EXCEPTION '% does not count any more — count it again first, or reject this request.', v_order.order_no
        USING ERRCODE = '22023';
    END IF;
    v_reason := public.share_request_blocked(v_r.order_id);
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION '%', v_reason USING ERRCODE = '22023';
    END IF;
    FOR v_part IN SELECT y.staff_id, y.staff_name FROM public.sales_order_share_request_parts y WHERE y.request_id = p_request LOOP
      IF NOT EXISTS (SELECT 1 FROM public.share_request_team(v_r.sub_department_id) t WHERE t.staff_id = v_part.staff_id) THEN
        RAISE EXCEPTION '% is no longer in this sub-department’s team, so no part of it would be paid to them. Reject this request.',
          v_part.staff_name USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.comm_salesperson_closes x
                  WHERE x.staff_id = v_part.staff_id AND x.sub_department_id = v_r.sub_department_id
                    AND x.period_month >= v_order.period_month AND x.reopened_at IS NULL) THEN
        RAISE EXCEPTION '%’s % is closed. Reopen it on Comm Cal before giving % a part of this bill.', v_part.staff_name,
          to_char(v_order.period_month, 'Mon YYYY'), v_part.staff_name USING ERRCODE = '22023';
      END IF;
    END LOOP;
    -- Smaller parts first, so a part that shrinks makes room before one that grows (the table's guard refuses any moment
    -- the parts would leave the owner nothing).
    FOR v_part IN
      SELECT y.staff_id, y.share_pct FROM public.sales_order_share_request_parts y
        LEFT JOIN public.sales_order_shares sh ON sh.order_id = v_r.order_id AND sh.staff_id = y.staff_id
       WHERE y.request_id = p_request
       ORDER BY y.share_pct - coalesce(sh.share_pct, 0), y.staff_id
    LOOP
      INSERT INTO public.sales_order_shares (order_id, staff_id, share_pct)
      VALUES (v_r.order_id, v_part.staff_id, v_part.share_pct)
      ON CONFLICT (order_id, staff_id) DO UPDATE SET share_pct = EXCLUDED.share_pct;
    END LOOP;
    UPDATE public.sales_order_share_requests
       SET status = 'approved', updated_at = now(), decided_at = now(), decided_by = v_me, decided_by_name = v_who,
           decision_note = v_note
     WHERE id = p_request;
    INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_name, note)
    VALUES (p_request, 'approved', v_me, v_who, v_note);
  ELSE
    UPDATE public.sales_order_share_requests
       SET status = 'rejected', updated_at = now(), decided_at = now(), decided_by = v_me, decided_by_name = v_who,
           decision_note = v_note
     WHERE id = p_request;
    INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_name, note)
    VALUES (p_request, 'rejected', v_me, v_who, v_note);
  END IF;

  BEGIN
    v_users := ARRAY(SELECT s.user_id FROM public.hr_staff_costs s WHERE s.id = v_r.owner_staff_id)
            || ARRAY(SELECT s.user_id FROM public.sales_order_share_request_parts y JOIN public.hr_staff_costs s ON s.id = y.staff_id
                      WHERE y.request_id = p_request);
    IF p_approve THEN
      SELECT string_agg(h.name || ' ' || regexp_replace(to_char(round(h.pct * 100, 2), 'FM990.00'), '\.?0+$', '') || '%', ' · '
                        ORDER BY h.owner DESC, h.name) INTO v_line
        FROM (SELECT coalesce(s.employee_name, '') AS name,
                     1 - coalesce((SELECT sum(sh.share_pct) FROM public.sales_order_shares sh
                                    WHERE sh.order_id = so.id AND sh.staff_id IS DISTINCT FROM so.staff_id), 0) AS pct, true AS owner
                FROM public.sales_orders so LEFT JOIN public.hr_staff_costs s ON s.id = so.staff_id WHERE so.id = v_r.order_id
              UNION ALL
              SELECT coalesce(s.employee_name, ''), sh.share_pct, false
                FROM public.sales_order_shares sh JOIN public.sales_orders so ON so.id = sh.order_id
                LEFT JOIN public.hr_staff_costs s ON s.id = sh.staff_id
               WHERE sh.order_id = v_r.order_id AND sh.staff_id IS DISTINCT FROM so.staff_id) h;
      PERFORM public.notify_people(v_users, 'share', v_r.order_no || ' · shared',
        'HR approved: ' || coalesce(v_line, '') || '. Each part counts in its holder’s sales and commission.',
        'share_request', p_request::text);
    ELSE
      PERFORM public.notify_people(v_users, 'share', v_r.order_no || ' · share request rejected',
        'HR: “' || left(v_note, 300) || '”', 'share_request', p_request::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'revenue_share_request_decide: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[p_request], NULL) -> 0;
END
$function$
;

-- member_share_order_cancel() md5 427e1e2ff8bc4da8a03dcb692ec86917
CREATE OR REPLACE FUNCTION public.member_share_order_cancel(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me    uuid := auth.uid();
  v_staff uuid := public.member_staff_id();
  v_r     public.sales_order_share_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_r FROM public.sales_order_share_requests WHERE id = p_request FOR UPDATE;
  IF v_r.id IS NULL OR v_r.owner_staff_id <> v_staff THEN
    RAISE EXCEPTION 'Only the salesperson who sent it can withdraw a share request.' USING ERRCODE = '42501';
  END IF;
  IF v_r.status NOT IN ('partner', 'hr') THEN
    RAISE EXCEPTION 'This share request is % already, so there is nothing to withdraw.',
      CASE v_r.status WHEN 'approved' THEN 'approved' WHEN 'rejected' THEN 'rejected' WHEN 'declined' THEN 'declined'
                      ELSE 'withdrawn' END USING ERRCODE = '22023';
  END IF;
  UPDATE public.sales_order_share_requests SET status = 'cancelled', updated_at = now() WHERE id = p_request;
  INSERT INTO public.sales_order_share_request_events (request_id, step, actor_id, actor_staff_id, actor_name)
  VALUES (p_request, 'cancelled', v_me, v_staff, v_r.owner_name);
  BEGIN
    PERFORM public.notify_people(ARRAY(SELECT s.user_id FROM public.sales_order_share_request_parts y
                                         JOIN public.hr_staff_costs s ON s.id = y.staff_id
                                        WHERE y.request_id = p_request AND y.answer <> 'declined'),
      'share', v_r.order_no || ' · share request withdrawn', v_r.owner_name || ' withdrew the request to share ' || v_r.order_no || '.',
      'share_request', p_request::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'member_share_order_cancel: nobody was told of % (%)', v_r.order_no, SQLERRM;
  END;
  RETURN public.share_requests_json(ARRAY[p_request], v_staff) -> 0;
END
$function$
;

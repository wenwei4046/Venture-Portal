-- Production's bodies read with pg_get_functiondef on 2026-11-07 (the facts and the Arena's at 21:20 KL, the two order
-- books' at 21:30) — what 20261107230000_old_bills_are_not_sales.sql was written from (md5 of prosrc in each block's
-- first line).

-- member_order_facts() md5 137eb24ba94e9c5bb49789225ff4c271
CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean, no_sales_cost numeric)
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
   o.brand_code,o.is_cleared,o.manual_margin_pct,l.line_amount,l.cost_amount,l.option_charge_amount,
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
   -- What its bed frames' divan, leg, gap and total height were charged (2026-10-05).
   coalesce(sum(l.option_charge_amount) FILTER(WHERE l.is_goods),0) AS charges,
   bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods) AS costed,
   sum(l.team_cost) FILTER(WHERE l.is_goods) AS team_cost,
   bool_or(l.is_goods) AS has_goods
  FROM line_scope l
  GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct
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
 FROM split s JOIN parts x ON x.order_id=s.id LEFT JOIN given g ON g.order_id=s.id;
$function$
;

-- member_arena_history_for_staff() md5 bdd7644f24c5dbaea38587eb461cf89c
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
END $function$
;

-- member_arena_booth_history_for_staff() md5 275bdf919dd38cb0930d923cbfe06516
CREATE OR REPLACE FUNCTION public.member_arena_booth_history_for_staff(p_sub_department uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
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

-- member_order_book_for_staff() md5 ece458d6f851856de44959f14fe88840
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
  SELECT f.* FROM public.member_order_facts(p_scheme,p_from,p_until) f WHERE f.staff_id=p_staff
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
     FROM facts f WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0) GROUP BY 1,2)
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
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb));
$function$
;

-- member_principal_department_order_book() md5 5d14f2b5eb1d10cc763429ab6431a44f
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
   sum(f.goods_revenue) AS goods_revenue,sum(f.no_sales_cost) AS no_sales_cost
  FROM public.member_order_facts(v_scheme,lower(v_range),upper(v_range)) f
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
     FROM facts f WHERE f.cleared AND (f.margin_pct IS NOT NULL OR f.no_sales_cost>0) GROUP BY 1,2)
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

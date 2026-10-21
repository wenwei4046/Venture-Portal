-- commission_order_period_locked(p_sub_department_id uuid, p_period date) — production body md5 7e96d9585e56f514087d40ecb1b26f4a
CREATE OR REPLACE FUNCTION public.commission_order_period_locked(p_sub_department_id uuid, p_period date)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM comm_runs
         WHERE sub_department_id = p_sub_department_id AND period_month = p_period
           AND status IN ('applied', 'locked')
    ) OR EXISTS (
        SELECT 1 FROM comm_order_releases r JOIN comm_runs c ON c.id = r.run_id
         WHERE r.sub_department_id = p_sub_department_id AND r.order_period_month = p_period
           AND c.status IN ('applied', 'locked')
    );
$function$;

-- member_arena_booth_history_for_staff(p_sub_department uuid, p_scheme uuid) — production body md5 5cd3631a834c607d3b09fba313aa04d8
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
  ), appearances AS (
    -- Every bill at a completed fair, at the booth it was written at: its
    -- pick, else the booth its seller worked that week, else its own brand
    -- (NULL: the fair's no-brand board).
    SELECT o.id,o.staff_id,o.fair_event_id,o.cleared,o.revenue,
      coalesce(o.booth_pick,wb.brand,o.own_brand) AS booth,wb.source
    FROM order_facts o JOIN fairs f ON f.id=o.fair_event_id
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
END $function$;

-- member_honours_forget_order_month() — production body md5 c8637dfe7640592a1f39eab123a1091d
CREATE OR REPLACE FUNCTION public.member_honours_forget_order_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.member_honour_months) THEN RETURN NULL; END IF;
 IF TG_OP <> 'INSERT' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_import_batches b
   WHERE b.id = OLD.batch_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', OLD.period_month)::date;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  DELETE FROM public.member_honour_months m
   USING public.sales_import_batches b
   WHERE b.id = NEW.batch_id AND m.sub_department_id = b.sub_department_id
     AND m.period_month = date_trunc('month', NEW.period_month)::date;
 END IF;
 RETURN NULL;
END $function$;

-- member_kpi_for_staff(p_staff uuid, p_scheme uuid, p_period date) — production body md5 f7ef47922f96f02f33dd24b1195b426a
CREATE OR REPLACE FUNCTION public.member_kpi_for_staff(p_staff uuid, p_scheme uuid, p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date:=coalesce(date_trunc('month',p_period)::date,date_trunc('month',v_today)::date);
 v_rules_at date:=(v_period+interval '1 month - 1 day')::date;
 v_sub uuid;
 v_enabled boolean;
 v_threshold integer;
 v_items jsonb;
 v_total numeric;
BEGIN
 SELECT c.sub_department_id,c.enable_kpi
 INTO v_sub,v_enabled
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND ((public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)))
   OR public.member_director_scheme(v_staff,d.id)=c.id);
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active membership in this scheme is required' USING ERRCODE='42501';
 END IF;
 IF v_period>date_trunc('month',v_today)::date THEN
  RAISE EXCEPTION 'Choose a month that has started' USING ERRCODE='22023';
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
 ), eligible_orders AS (
  -- The month's deposit-cleared bills, recognised exactly as Insight's sales.
  SELECT f.order_id AS id FROM public.member_order_facts(p_scheme,v_period,(v_period+interval '1 month')::date) f
  WHERE f.staff_id=v_staff AND f.cleared
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

-- member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date) — production body md5 4553c366d2f603d27183e3a4efc295bc
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
 ), hits AS (
  -- The KPI items of each line, in force at the end of the month its bill is
  -- recognised in (member_order_facts' as-at). None while KPI is off.
  SELECT h.line_id,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
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
    'kpiQty',f.kpi_qty,
    'cleared',f.cleared,
    'carried',f.source_period<f.recognition_month,
    'manual',f.manual,
    'total',so.order_total,
    'paid',so.paid_amount,
    'depositNeeded',CASE WHEN c.deposit_threshold_pct IS NULL THEN NULL ELSE round(so.order_total*c.deposit_threshold_pct,2) END,
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
$function$;

-- member_order_facts(p_scheme uuid, p_from date, p_until date) — production body md5 736faa076f3b3a9420f362b37d31e03a
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
   b.goods-coalesce(k.amount,0)-b.charges AS margin_base
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
  WHERE b.has_goods OR k.order_id IS NOT NULL
 )
 SELECT s.id,s.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED'),s.is_cleared,s.main,s.margin_base,
  CASE WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END,
  s.kpi_qty,s.manual_margin_pct IS NOT NULL
 FROM split s;
$function$;

-- member_principal_context(p_staff uuid, p_sub_department uuid, p_scheme uuid) — production body md5 04ccd4e04e98834263f0c35837cfa2b1
CREATE OR REPLACE FUNCTION public.member_principal_context(p_staff uuid, p_sub_department uuid, p_scheme uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_department uuid:=public.member_principal_department(p_sub_department);
 v_scheme uuid; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 SELECT c.id INTO v_scheme FROM public.comm_hierarchy h
 JOIN public.comm_schemes c ON c.id=h.scheme_id
 JOIN public.hr_staff_costs s ON s.id=h.staff_id
 LEFT JOIN public.titles t ON t.id=h.title_id LEFT JOIN public.titles st ON st.id=s.title_id
 WHERE s.id=p_staff AND s.department_id=v_department AND s.status='active'
  AND (s.hire_date IS NULL OR s.hire_date<=v_today)
  AND (s.resignation_date IS NULL OR s.resignation_date>=v_today)
  AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  AND c.sub_department_id=p_sub_department AND (p_scheme IS NULL OR c.id=p_scheme)
  AND c.is_active AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
 ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1;
 IF v_scheme IS NULL THEN
  RAISE EXCEPTION 'The selected member needs an active membership in this department' USING ERRCODE='42501';
 END IF;
 RETURN v_scheme;
END $function$;

-- member_staff_id() — production body md5 a979898c84f67c45f29ba168cfaf98de
CREATE OR REPLACE FUNCTION public.member_staff_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_perm('member_portal') THEN RAISE EXCEPTION 'Member account access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT s.id INTO v_id FROM public.users u JOIN public.hr_staff_costs s ON s.user_id=u.id
 JOIN public.departments d ON d.id=s.department_id
 WHERE u.id=auth.uid() AND u.is_active AND s.status='active' AND d.payroll_source='commission'
 AND (s.hire_date IS NULL OR s.hire_date<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 AND (s.resignation_date IS NULL OR s.resignation_date>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date);
 IF v_id IS NULL THEN RAISE EXCEPTION 'No active Revenue staff record is linked to this account' USING ERRCODE='42501'; END IF;
 RETURN v_id;
END $function$;

-- notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text) — production body md5 50259847648f421acbe03abd41dd0d95
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
$function$;

-- notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text) — production body md5 fdb51debc1205ed88a96898f7a8e494f
CREATE OR REPLACE FUNCTION public.notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.notify_people(ARRAY(SELECT t.user_id FROM public.notification_topics t WHERE t.topic = p_topic), p_kind, p_title, p_body, p_ref_kind, p_ref_id);
END
$function$;

-- sales_order_shares_guard() — production body md5 682faa11fa480ba73f56122390a9ff1f
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
$function$;

-- tab_box_closed(p_tab text, p_action text) — production body md5 d083dbf40d8fea7db274988f913830b0
CREATE OR REPLACE FUNCTION public.tab_box_closed(p_tab text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v       jsonb := public.current_tabs();
  v_boxes jsonb;
  v_box   boolean;
  v_view  boolean;
BEGIN
  IF v IS NULL THEN
    RETURN false;
  END IF;
  v_boxes := coalesce(v->'boxes', '[]'::jsonb);
  IF jsonb_array_length(v_boxes) = 0 AND coalesce((v->>'cells')::boolean, false) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(v->'ticks') = 'array' THEN
    SELECT (b->>'granted')::boolean INTO v_box FROM jsonb_array_elements(v_boxes) b
     WHERE b->>'tab' = p_tab AND b->>'action' = p_action LIMIT 1;
    v_box := coalesce(v_box, (v->'ticks') ? (p_tab || '.' || p_action));
    IF p_action = 'view' THEN
      RETURN NOT v_box;
    END IF;
    SELECT (b->>'granted')::boolean INTO v_view FROM jsonb_array_elements(v_boxes) b
     WHERE b->>'tab' = p_tab AND b->>'action' = 'view' LIMIT 1;
    v_view := coalesce(v_view, (v->'ticks') ? (p_tab || '.view'));
    RETURN NOT (v_box AND v_view);
  END IF;
  RETURN EXISTS (SELECT 1 FROM jsonb_array_elements(v_boxes) b
                  WHERE b->>'tab' = p_tab AND b->>'action' IN (p_action, 'view') AND NOT (b->>'granted')::boolean);
END
$function$;

-- tab_write_guard(p_pages text[], p_wants text[]) — production body md5 bc874286994bf99cc0d07257b6131fb4
CREATE OR REPLACE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stack text;
BEGIN
  -- The functions on the stack: this one, the write it guards, and whatever called that. A DO
  -- block is nobody's caller (only the database's own scripts run one).
  GET DIAGNOSTICS v_stack = PG_CONTEXT;
  IF (SELECT count(*) FROM regexp_matches(v_stack, '(^|\n)(PL/pgSQL|SQL) function (?!inline_code_block)', 'g')) > 2 THEN
    RETURN;
  END IF;
  IF NOT public.tab_write_open(p_pages, p_wants) THEN
    RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked'
      USING ERRCODE = '42501';
  END IF;
END
$function$;

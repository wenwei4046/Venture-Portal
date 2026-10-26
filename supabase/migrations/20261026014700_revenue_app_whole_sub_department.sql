-- ============================================================================
-- 20261026014700_revenue_app_whole_sub_department.sql
-- The Principal's own Revenue app reads the WHOLE sub-department (2026-10-25 — a salesperson's note the user passed
-- on, over the Principal's Today, Insight and Arena: "要看销售额的话，就是把全部的加起来 … Arena 那边 … 显示 Top 3 是谁 …
-- 直接 show 全部人的单 … 要不然一直这样漏单的话，其实很容易让人以为是出 bug").
-- ============================================================================
--
-- Viewing nobody, the Principal's app read only the sub-department's commission (Today's hero): every other read
-- asked for a person (member_principal_* take p_staff), so Sales / Margin / KPI, Your Arena, the Arena's boards and
-- Insight stayed placeholders for good. Four reads answer for the whole sub-department instead, each for an active
-- Principal account only (member_principal_department, as every read of the Principal's View as):
--   * member_principal_department_arena — the Arena's boards, everybody on them and nobody marked as the reader
--     (member_arena_for_staff with no staff: its roster never depends on who reads);
--   * member_principal_department_booth_history — every booth of every completed fair; nobody's brand weeks (a
--     person's, read when the Principal views them);
--   * member_principal_department_insight — a window's (a month, a quarter, a year) every bill summed (`team`, as a
--     Revenue Director's "All of Fair": the directors' own bills too) and everybody who sits there or wrote a bill, each
--     with their own figures; whether KPI counts and the first rung of its threshold;
--   * member_principal_department_order_book — a window's every bill, once each (a shared bill's parts added back
--     together), with its salesperson. Never a cost: a bill carries its layer-2 margin percentage only, as a member's.
-- The scheme is the sub-department's current one (member_principal_department_scheme, a helper only these four call).
-- Nothing is written. Running it twice changes nothing. PGlite: tests/member-sql/validate-whole-sub-department.mjs.

-- ── The sub-department's scheme, for an active Principal account only ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_principal_department_scheme(p_sub_department uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date; v_scheme uuid;
BEGIN
 -- Refuses anybody but an active Principal account, and a sub-department with no current scheme.
 PERFORM public.member_principal_department(p_sub_department);
 SELECT c.id INTO v_scheme FROM public.comm_schemes c
 WHERE c.sub_department_id=p_sub_department AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1;
 RETURN v_scheme;
END $function$;

-- ── The Arena: everybody on the boards, nobody the reader ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_principal_department_arena(p_sub_department uuid, p_period text, p_window text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN public.member_arena_for_staff(NULL,p_sub_department,public.member_principal_department_scheme(p_sub_department),
   p_period,p_window,false)
  || jsonb_build_object('principalView',true,'wholeDepartment',true);
END $function$;

-- ── The fairs: every booth; nobody's brand weeks ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_principal_department_booth_history(p_sub_department uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN public.member_arena_booth_history_for_staff(p_sub_department,public.member_principal_department_scheme(p_sub_department))
  || jsonb_build_object('weeks','[]'::jsonb);
END $function$;

-- ── Insight: the window's every bill summed, and everybody's own figures ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_principal_department_insight(p_sub_department uuid, p_from text, p_until text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid:=public.member_principal_department_scheme(p_sub_department);
 v_range daterange:=public.member_insight_window(p_from,p_until);
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_result jsonb;
BEGIN
 WITH board AS (
  SELECT * FROM public.member_scoreboard_range(v_scheme,lower(v_range),upper(v_range))
 ), seats AS (
  -- Everybody who sits there today, by their seat's title.
  SELECT DISTINCT ON (h.staff_id) h.staff_id,h.title_id,h.upline_staff_id
  FROM public.comm_hierarchy h JOIN public.hr_staff_costs s ON s.id=h.staff_id
  WHERE h.scheme_id=v_scheme AND s.status='active'
   AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
  ORDER BY h.staff_id,h.effective_from DESC
 ), people AS (
  -- …and everybody who wrote a bill in the window (a director, somebody who has left), by their company title.
  SELECT s.id AS staff_id,s.employee_name AS name,coalesce(ti.name,ct.name,'Title not configured') AS title,st.upline_staff_id,
   coalesce(b.sales,0) AS sales,coalesce(b.held,0) AS held,coalesce(b.order_count,0) AS order_count,coalesce(b.kpi_qty,0) AS kpi_qty,
   coalesce(b.margin_revenue,0) AS margin_revenue,coalesce(b.margin_cost,0) AS margin_cost,
   coalesce(b.blind_orders,0) AS blind_orders,b.last_order
  FROM (SELECT x.staff_id FROM seats x UNION SELECT y.staff_id FROM board y WHERE y.staff_id IS NOT NULL) who
  JOIN public.hr_staff_costs s ON s.id=who.staff_id
  LEFT JOIN seats st ON st.staff_id=who.staff_id
  LEFT JOIN public.titles ti ON ti.id=st.title_id
  LEFT JOIN public.titles ct ON ct.id=s.title_id
  LEFT JOIN board b ON b.staff_id=who.staff_id
 )
 SELECT jsonb_build_object(
  'membershipId',p_sub_department,
  'schemeId',v_scheme,
  'department',(SELECT d.name FROM public.comm_sub_departments d WHERE d.id=p_sub_department),
  'from',to_char(lower(v_range),'YYYY-MM'),
  'through',to_char((upper(v_range)-1),'YYYY-MM'),
  'asOf',now(),
  'live',upper(v_range)>date_trunc('month',v_today)::date,
  -- Every bill, the directors' own and a salesperson the ERP named nobody for included.
  'team',(SELECT jsonb_build_object('sales',coalesce(sum(b.sales),0),'held',coalesce(sum(b.held),0),
    'orders',coalesce(sum(b.order_count),0),'kpiQty',coalesce(sum(b.kpi_qty),0),
    'marginRevenue',coalesce(sum(b.margin_revenue),0),'marginCost',coalesce(sum(b.margin_cost),0),
    'blindOrders',coalesce(sum(b.blind_orders),0)) FROM board b),
  'people',coalesce((SELECT jsonb_agg(jsonb_build_object('staffId',p.staff_id,'name',p.name,'title',p.title,
    'uplineId',p.upline_staff_id,'depth',1,'sales',p.sales,'held',p.held,'orders',p.order_count,'kpiQty',p.kpi_qty,
    'marginRevenue',p.margin_revenue,'marginCost',p.margin_cost,'blindOrders',p.blind_orders,'lastOrder',p.last_order)
    ORDER BY p.sales DESC,p.name,p.staff_id) FROM people p),'[]'::jsonb),
  -- Whether KPI counts, and its threshold's first rung as at the window's last day (a person's, as on Insight).
  'kpi',(SELECT jsonb_build_object('enabled',coalesce(c.enable_kpi,false),
    'threshold',CASE WHEN c.enable_kpi THEN (SELECT min(k.min_qty) FROM public.comm_kpi_thresholds k
      WHERE k.scheme_id=c.id AND k.effective_from<=(upper(v_range)-1)
       AND (k.effective_to IS NULL OR k.effective_to>=(upper(v_range)-1))) END)
    FROM public.comm_schemes c WHERE c.id=v_scheme)
 ) INTO v_result;
 RETURN v_result;
END $function$;

-- ── Insight's bills: the window's every bill, once each, with its salesperson ────────────────────────────────────────
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
   sum(f.revenue) AS revenue,min(f.margin_pct) AS margin_pct,sum(f.kpi_qty) AS kpi_qty,bool_or(f.manual) AS manual
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
END $function$;

-- ── Who may call them ────────────────────────────────────────────────────────────────────────────────────────────────
-- The helper: only the four below (their owner) and the service role.
REVOKE ALL ON FUNCTION public.member_principal_department_scheme(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_principal_department_scheme(uuid) TO service_role;
-- The app's four reads, under the Principal's own session — as member_principal_arena_snapshot and its kind.
REVOKE ALL ON FUNCTION public.member_principal_department_arena(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_principal_department_arena(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_principal_department_booth_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_principal_department_booth_history(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_principal_department_insight(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_principal_department_insight(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_principal_department_order_book(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_principal_department_order_book(uuid, text, text) TO authenticated, service_role;

-- 20261004010000_member_order_book.sql
--
-- The rebuilt Revenue app's Insight (Claude Design, 2026-10-04) shows a member
-- their own bills line by line — the customer, each product line, its KPI
-- items, the fair week, venue and organiser — and looks back over a quarter or
-- a year as well as a month. Neither existed: Insight's orders carried an
-- order's totals only, and every member read was one month.
--
-- Nothing here is a new rule. Every number is member_order_facts' own: the
-- deposit gate, carry-forward into the month a bill is released, the KPI items
-- taken off the bill's sales, the layer-2 margin on cost ÷ the scheme's (or the
-- SKU's) ratio. A line's KPI quantity is comm_kpi_hits' own, as at the end of
-- the month the bill is recognised in — the same call member_order_facts sums.
-- No cost leaves the database: a line carries its name, quantity, amount and
-- KPI items, an order its layer-2 margin percentage (what the member app may
-- show, user 2026-09-19).
--
-- Reads only. Grants: the two member functions and their Principal twins to
-- `authenticated` (each checks the caller itself); the helpers to nobody.

-- ── 1. member_scoreboard over a range of months ─────────────────────────────
-- member_scoreboard is this over [p_period, p_period + 1 month).
CREATE OR REPLACE FUNCTION public.member_scoreboard_range(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(staff_id uuid, order_count integer, sales numeric, held numeric, kpi_qty numeric, margin_revenue numeric, margin_cost numeric, blind_orders integer, last_order date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT f.staff_id,count(*) FILTER(WHERE f.cleared)::integer,
  coalesce(sum(f.revenue) FILTER(WHERE f.cleared),0),
  coalesce(sum(f.revenue) FILTER(WHERE NOT f.cleared),0),
  coalesce(sum(f.kpi_qty) FILTER(WHERE f.cleared),0),
  coalesce(sum(f.goods_revenue) FILTER(WHERE f.cleared AND f.margin_pct IS NOT NULL),0),
  coalesce(sum(f.goods_revenue*(1-f.margin_pct)) FILTER(WHERE f.cleared AND f.margin_pct IS NOT NULL),0),
  count(*) FILTER(WHERE f.cleared AND f.goods_revenue>0 AND f.margin_pct IS NULL)::integer,
  max(f.order_date) FILTER(WHERE f.cleared)
 FROM public.member_order_facts(p_scheme,p_from,p_until) f
 GROUP BY f.staff_id;
$function$;

-- ── 2. One member and their team over a range (Insight › Quarter / Year) ────
-- The shapes are member_insight_for_staff's `me` and `downline`, so a quarter
-- reads exactly like a month; the tree is member_downline_board's.
CREATE OR REPLACE FUNCTION public.member_insight_range_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH RECURSIVE board AS (
  SELECT * FROM public.member_scoreboard_range(p_scheme,p_from,p_until)
 ), positions AS (
  SELECT h.* FROM public.comm_hierarchy h WHERE h.scheme_id=p_scheme
  AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 ), tree AS (
  SELECT h.staff_id,h.upline_staff_id,h.title_id,ARRAY[h.staff_id] AS visited,0 AS depth
  FROM positions h WHERE h.staff_id=p_staff
  UNION ALL
  SELECT h.staff_id,h.upline_staff_id,h.title_id,t.visited||h.staff_id,t.depth+1
  FROM positions h JOIN tree t ON h.upline_staff_id=t.staff_id
  WHERE t.depth<20 AND NOT h.staff_id=ANY(t.visited)
 )
 SELECT jsonb_build_object(
  'from',to_char(p_from,'YYYY-MM'),
  'through',to_char((p_until-interval '1 day')::date,'YYYY-MM'),
  'asOf',now(),
  'me',(SELECT jsonb_build_object(
    'staffId',p_staff,
    'name',(SELECT employee_name FROM public.hr_staff_costs WHERE id=p_staff),
    'sales',coalesce(b.sales,0),'held',coalesce(b.held,0),'orders',coalesce(b.order_count,0),
    'kpiQty',coalesce(b.kpi_qty,0),'marginRevenue',coalesce(b.margin_revenue,0),
    'marginCost',coalesce(b.margin_cost,0),'blindOrders',coalesce(b.blind_orders,0),'lastOrder',b.last_order)
   FROM (SELECT 1) one LEFT JOIN board b ON b.staff_id=p_staff),
  'downline',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'staffId',s.id,'name',s.employee_name,'title',coalesce(ti.name,'Title not configured'),
    'uplineId',t.upline_staff_id,'depth',t.depth,
    'sales',coalesce(b.sales,0),'held',coalesce(b.held,0),'orders',coalesce(b.order_count,0),
    'kpiQty',coalesce(b.kpi_qty,0),'marginRevenue',coalesce(b.margin_revenue,0),
    'marginCost',coalesce(b.margin_cost,0),'blindOrders',coalesce(b.blind_orders,0),'lastOrder',b.last_order)
    ORDER BY t.depth,coalesce(b.sales,0) DESC,s.employee_name),'[]'::jsonb)
   FROM tree t
   JOIN public.hr_staff_costs s ON s.id=t.staff_id
   LEFT JOIN public.titles ti ON ti.id=t.title_id
   LEFT JOIN board b ON b.staff_id=t.staff_id
   WHERE t.depth>0 AND s.status='active'));
$function$;

-- ── 3. One member's bills, line by line ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.id,c.enable_kpi,c.deposit_threshold_pct FROM public.comm_schemes c WHERE c.id=p_scheme
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
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',f.order_id,
    'number',f.order_no,
    'ref',nullif(btrim(so.bill_ref),''),
    'customer',coalesce(nullif(btrim(so.customer_name),''),''),
    'date',f.order_date,
    'sourceMonth',to_char(f.source_period,'YYYY-MM'),
    'recognitionMonth',to_char(f.recognition_month,'YYYY-MM'),
    'brand',f.brand,
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

-- ── 4. The member's own reads, and the Principal's ──────────────────────────
-- A month, or up to twelve: 'YYYY-MM' to 'YYYY-MM', inclusive.
CREATE OR REPLACE FUNCTION public.member_insight_window(p_from text, p_until text)
 RETURNS daterange
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_from date; v_until date;
BEGIN
 IF p_from !~ '^\d{4}-(0[1-9]|1[0-2])$' OR p_until !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
  RAISE EXCEPTION 'Choose a valid month' USING ERRCODE='22023';
 END IF;
 v_from:=(p_from||'-01')::date;
 v_until:=((p_until||'-01')::date+interval '1 month')::date;
 IF v_until<=v_from OR v_until>(v_from+interval '12 months')::date THEN
  RAISE EXCEPTION 'Choose a month, a quarter or a year' USING ERRCODE='22023';
 END IF;
 RETURN daterange(v_from,v_until);
END $function$;

-- The caller's scheme in a sub-department they belong to: member_arena_scheme's
-- test, with Insight's permission and wording.
CREATE OR REPLACE FUNCTION public.member_insight_scheme(p_sub_department uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_scheme uuid; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT coalesce(public.has_perm('member_insight'),false) THEN
  RAISE EXCEPTION 'Insight is not enabled for this account' USING ERRCODE='42501';
 END IF;
 SELECT c.id INTO v_scheme FROM public.comm_hierarchy h
 JOIN public.comm_schemes c ON c.id=h.scheme_id
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 JOIN public.hr_staff_costs s ON s.id=h.staff_id
 WHERE h.staff_id=v_staff AND d.id=p_sub_department AND s.status='active'
  AND d.is_active AND c.is_active
  AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 ORDER BY c.effective_from DESC LIMIT 1;
 IF v_scheme IS NULL THEN RAISE EXCEPTION 'This department is not available to your account' USING ERRCODE='42501'; END IF;
 RETURN v_scheme;
END $function$;

CREATE OR REPLACE FUNCTION public.member_order_book(p_sub_department uuid, p_from text, p_until text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid:=public.member_insight_scheme(p_sub_department); v_range daterange:=public.member_insight_window(p_from,p_until);
BEGIN
 RETURN public.member_order_book_for_staff(public.member_staff_id(),v_scheme,lower(v_range),upper(v_range));
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_order_book(p_staff uuid, p_sub_department uuid, p_from text, p_until text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid; v_range daterange:=public.member_insight_window(p_from,p_until);
BEGIN
 v_scheme:=public.member_principal_context(p_staff,p_sub_department);
 RETURN public.member_order_book_for_staff(p_staff,v_scheme,lower(v_range),upper(v_range))
  || jsonb_build_object('principalView',true,'viewedStaffId',p_staff);
END $function$;

CREATE OR REPLACE FUNCTION public.member_insight_range(p_sub_department uuid, p_from text, p_until text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid:=public.member_insight_scheme(p_sub_department); v_range daterange:=public.member_insight_window(p_from,p_until);
BEGIN
 RETURN public.member_insight_range_for_staff(public.member_staff_id(),v_scheme,lower(v_range),upper(v_range));
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_insight_range(p_staff uuid, p_sub_department uuid, p_from text, p_until text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid; v_range daterange:=public.member_insight_window(p_from,p_until);
BEGIN
 v_scheme:=public.member_principal_context(p_staff,p_sub_department);
 RETURN public.member_insight_range_for_staff(p_staff,v_scheme,lower(v_range),upper(v_range))
  || jsonb_build_object('principalView',true,'viewedStaffId',p_staff);
END $function$;

REVOKE ALL ON FUNCTION public.member_scoreboard_range(uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_insight_range_for_staff(uuid,uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_order_book_for_staff(uuid,uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_insight_scheme(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_insight_window(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.member_order_book(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_principal_order_book(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_insight_range(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_principal_insight_range(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_order_book(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_principal_order_book(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_insight_range(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_principal_insight_range(uuid,uuid,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';

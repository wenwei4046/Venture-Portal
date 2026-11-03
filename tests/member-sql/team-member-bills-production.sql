-- Production's own text of the functions 20261103231500_member_team_order_book builds on (read from
-- pg_get_functiondef on 2026-11-03; md5(prosrc): member_staff_id() a979898c84f67c45f29ba168cfaf98de,
-- member_director_scheme(uuid,uuid) 7d993d9b630cefc6ad97e32d697e80a4, member_insight_scheme(uuid)
-- cc9c66f4f38bc3a07776d138f0e8dea1, member_insight_window(text,text) c00dd0de9ce4e7d39db1812a5ca135b7,
-- member_kpi_month(text) af7212594c89c008de3ae3cfc65324a0, member_downline_board(uuid,uuid,date)
-- 6e18705406bb602cace2f7075e8450eb — My team's own tree, which member_team_has must agree with). Loaded by
-- validate-team-member-bills.mjs, which checks every md5 before running the migration over them.

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

CREATE OR REPLACE FUNCTION public.member_director_scheme(p_staff uuid, p_sub uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date; v_scheme uuid;
BEGIN
 SELECT c.id INTO v_scheme FROM public.comm_sub_department_directors x
 JOIN public.comm_sub_departments d ON d.id=x.sub_department_id
 JOIN public.comm_schemes c ON c.sub_department_id=d.id
 JOIN public.hr_staff_costs s ON s.id=x.staff_id
 WHERE x.staff_id=p_staff AND x.sub_department_id=p_sub AND d.is_active AND c.is_active AND s.status='active'
  AND (s.resignation_date IS NULL OR s.resignation_date>=v_today)
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1;
 RETURN v_scheme;
END $function$;

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
 IF v_scheme IS NULL THEN v_scheme:=public.member_director_scheme(v_staff,p_sub_department); END IF;
 IF v_scheme IS NULL THEN RAISE EXCEPTION 'This department is not available to your account' USING ERRCODE='42501'; END IF;
 RETURN v_scheme;
END $function$;

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

CREATE OR REPLACE FUNCTION public.member_kpi_month(p_period text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
 IF p_period IS NULL OR p_period='' THEN RETURN NULL; END IF;
 IF p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
  RAISE EXCEPTION 'Choose a valid month' USING ERRCODE='22023';
 END IF;
 RETURN (p_period||'-01')::date;
END $function$;

CREATE OR REPLACE FUNCTION public.member_downline_board(p_scheme uuid, p_staff uuid, p_period date)
 RETURNS TABLE(staff_id uuid, name text, title text, upline_id uuid, depth integer, sales numeric, held numeric, order_count integer, kpi_qty numeric, margin_revenue numeric, margin_cost numeric, blind_orders integer, last_order date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH RECURSIVE dir AS (
  SELECT coalesce(public.member_director_scheme(p_staff,c.sub_department_id)=p_scheme,false) AS directs
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), held AS (
  SELECT h.* FROM public.comm_hierarchy h WHERE h.scheme_id=p_scheme
  AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 ), positions AS (
  SELECT h.staff_id,h.title_id,
   CASE WHEN dir.directs AND (h.upline_staff_id IS NULL OR NOT EXISTS(SELECT 1 FROM held u WHERE u.staff_id=h.upline_staff_id))
    THEN p_staff ELSE h.upline_staff_id END AS upline_staff_id
  FROM held h CROSS JOIN dir
 ), tree AS (
  SELECT p_staff AS staff_id,NULL::uuid AS upline_staff_id,NULL::uuid AS title_id,ARRAY[p_staff] AS visited,0 AS depth
  FROM dir WHERE dir.directs
  UNION ALL
  SELECT h.staff_id,h.upline_staff_id,h.title_id,ARRAY[h.staff_id] AS visited,0 AS depth
  FROM positions h WHERE h.staff_id=p_staff
  UNION ALL
  SELECT h.staff_id,h.upline_staff_id,h.title_id,t.visited||h.staff_id,t.depth+1
  FROM positions h JOIN tree t ON h.upline_staff_id=t.staff_id
  WHERE t.depth<20 AND NOT h.staff_id=ANY(t.visited)
 )
 SELECT s.id,s.employee_name,coalesce(ti.name,'Title not configured'),t.upline_staff_id,t.depth,
  coalesce(b.sales,0),coalesce(b.held,0),coalesce(b.order_count,0),coalesce(b.kpi_qty,0),
  coalesce(b.margin_revenue,0),coalesce(b.margin_cost,0),coalesce(b.blind_orders,0),b.last_order
 FROM tree t
 JOIN public.hr_staff_costs s ON s.id=t.staff_id
 LEFT JOIN public.titles ti ON ti.id=t.title_id
 LEFT JOIN public.member_scoreboard(p_scheme,p_period) b ON b.staff_id=t.staff_id
 WHERE t.depth>0 AND s.status='active';
$function$;

-- 20261103231500_member_team_order_book.sql
--
-- A leader reads one person under them (2026-11-03 — the user, circling *Team members* on STANLEY's Insight › My team,
-- beside a member's Personal tab and its *My sales orders*: "i need them can press their team member than can view
-- their order as well like this"). My team listed the people under a member — their sales, margin and KPI — and
-- opened nothing; only the Principal, viewing nobody, could open a person, by View as (20261026014700). Now a member
-- reads, for anybody their My team lists, what that person's own Insight reads: their bills line by line and their
-- KPI items. Read-only; nobody's commission, rate or salary, and no cost — `member_order_book_for_staff` and
-- `member_kpi_for_staff` are the person's own reads, unchanged.
--
-- Who is under them is My team's own answer: `member_downline_board`'s tree today — every level down, active people
-- only, and for a Revenue Director of the sub-department the top of every tree (20261014090000) — without its
-- scoreboard (`member_team_has`, the service role's alone). Nobody else: not a peer, not an upline, not oneself (that
-- is `member_order_book`), not somebody who left, not another sub-department's people.
--
-- Grants: the two reads to `authenticated` — each asks `member_insight_scheme` first (Insight's permission, and a seat
-- or a directorship in the sub-department), then `member_team_has` — never anon; the helper to the service role only.
-- New functions only; nothing of production's is changed. Running it twice changes nothing.
-- PGlite: tests/member-sql/validate-team-member-bills.mjs (production's bodies md5-checked, the migration twice).

CREATE OR REPLACE FUNCTION public.member_team_has(p_scheme uuid, p_leader uuid, p_staff uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH RECURSIVE dir AS (
  SELECT coalesce(public.member_director_scheme(p_leader,c.sub_department_id)=p_scheme,false) AS directs
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), held AS (
  SELECT h.* FROM public.comm_hierarchy h WHERE h.scheme_id=p_scheme
  AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
  AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 ), positions AS (
  SELECT h.staff_id,
   CASE WHEN dir.directs AND (h.upline_staff_id IS NULL OR NOT EXISTS(SELECT 1 FROM held u WHERE u.staff_id=h.upline_staff_id))
    THEN p_leader ELSE h.upline_staff_id END AS upline_staff_id
  FROM held h CROSS JOIN dir
 ), tree AS (
  SELECT p_leader AS staff_id,ARRAY[p_leader] AS visited,0 AS depth
  FROM dir WHERE dir.directs
  UNION ALL
  SELECT h.staff_id,ARRAY[h.staff_id] AS visited,0 AS depth
  FROM positions h WHERE h.staff_id=p_leader
  UNION ALL
  SELECT h.staff_id,t.visited||h.staff_id,t.depth+1
  FROM positions h JOIN tree t ON h.upline_staff_id=t.staff_id
  WHERE t.depth<20 AND NOT h.staff_id=ANY(t.visited)
 )
 SELECT p_staff IS DISTINCT FROM p_leader AND EXISTS(
  SELECT 1 FROM tree t JOIN public.hr_staff_costs s ON s.id=t.staff_id
  WHERE t.depth>0 AND t.staff_id=p_staff AND s.status='active');
$function$;

CREATE OR REPLACE FUNCTION public.member_team_order_book(p_staff uuid, p_sub_department uuid, p_from text, p_until text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid:=public.member_insight_scheme(p_sub_department); v_range daterange:=public.member_insight_window(p_from,p_until);
BEGIN
 IF NOT public.member_team_has(v_scheme,public.member_staff_id(),p_staff) THEN
  RAISE EXCEPTION 'This person is not in your team' USING ERRCODE='42501';
 END IF;
 RETURN public.member_order_book_for_staff(p_staff,v_scheme,lower(v_range),upper(v_range))
  || jsonb_build_object('teamView',true,'viewedStaffId',p_staff);
END $function$;

CREATE OR REPLACE FUNCTION public.member_team_kpi_summary(p_staff uuid, p_scheme uuid, p_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid:=public.member_insight_scheme((SELECT c.sub_department_id FROM public.comm_schemes c WHERE c.id=p_scheme));
BEGIN
 IF v_scheme IS DISTINCT FROM p_scheme OR NOT public.member_team_has(v_scheme,public.member_staff_id(),p_staff) THEN
  RAISE EXCEPTION 'This person is not in your team' USING ERRCODE='42501';
 END IF;
 RETURN public.member_kpi_for_staff(p_staff,p_scheme,public.member_kpi_month(p_period))
  || jsonb_build_object('teamView',true,'viewedStaffId',p_staff);
END $function$;

REVOKE ALL ON FUNCTION public.member_team_has(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_team_has(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.member_team_order_book(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_team_kpi_summary(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_team_order_book(uuid,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_team_kpi_summary(uuid,uuid,text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

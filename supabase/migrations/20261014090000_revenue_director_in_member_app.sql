-- ============================================================================
-- 20261014090000_revenue_director_in_member_app.sql
-- A Revenue Director in the Revenue app (2026-10-14 — the user, on PETER's login: "why as revenue director log
-- in, peter, cant switch to fair view"; the Switch sub-department sheet was empty).
-- ============================================================================
--
-- The Revenue Director title HEADS the department (titles.is_department_head, L9 Management): above the ladder,
-- no seat in any sub-department (comm-cal.md › REVENUE DIRECTOR, 23DIR). Which sub-departments one directs is
-- comm_sub_department_directors (Fair ← PETER + KRIS, IR ← PETER). The Revenue app read only seats
-- (comm_hierarchy), so a director's app had no sub-department, no Today, Insight, Arena, My income or Team.
--
-- The user's choice: a director is the TOP of each sub-department they direct —
--   * the switcher lists those sub-departments (`member_data_snapshot` adds a membership flagged "director":
--     their company title, the rung their title holds on that scheme's ladder if any — Fair: Rank SS — and the
--     whole sub-department as its people);
--   * the reads that ask "is this the caller's sub-department" (`member_insight_scheme`, `member_arena_scheme`,
--     `member_kpi_for_staff`, `member_quote_context`) also accept a director of it — so Insight, the Arena, the
--     bills, KPI, My income (`member_income_context` asks `member_insight_scheme`), honours and the Quote open;
--   * everybody in the sub-department is under them: the top of every tree (upline NULL, or an upline with no
--     seat there) reports to the director in `member_downline_board`, `member_insight_range_for_staff` and
--     `member_tree_json`; Insight's block for a director has no next rung (`target` NULL) and carries `director`
--     and `team` — the month's every bill of the sub-department, the directors' own included, so two directors
--     of Fair read the same "All of Fair" on Today (a member's block is exactly as before: no new keys);
--   * the team map marks the sub-departments they direct as theirs; memos to those sub-departments reach them;
--   * nobody else's income or commission — the reads never gave that to a member, and do not to a director.
-- The Arena still ranks members only (its roster leaves heads out, as Comm Cal does): a director is not on a board.
--
-- member_director_scheme(staff, sub) is the one rule: the sub-department's current scheme when an active staff
-- record directs it, else NULL. Only the database's own functions call it.
--
-- Production's bodies: member_insight_scheme, member_arena_scheme, member_kpi_for_staff, member_quote_context,
-- member_data_snapshot and member_visible_memo have one statement swapped (pg_temp.swap_check refuses a body that
-- changed since); member_insight_for_staff (e2c1cc93…), member_downline_board (9110586f…),
-- member_insight_range_for_staff (46d591a3…), member_tree_json (c4668589…) and member_org_map_for_department
-- (a981676a…) are replaced whole, from production's text, after the guard below finds those md5s (the comments
-- production's bodies carry are kept; nothing new is commented inside a body). Running it twice changes nothing.
-- PGlite: tests/member-sql/validate-director-seat.mjs (84 checks, over production's bodies).

DO $guard$
DECLARE
  v_fn record;
  v_md5 text;
  v_src text;
BEGIN
  FOR v_fn IN SELECT * FROM (VALUES
    ('public.member_insight_for_staff(uuid,text,uuid,boolean)', 'e2c1cc93a60ad6e2d1159cfde391826e'),
    ('public.member_downline_board(uuid,uuid,date)', '9110586fc7dab49dce695e33954d7610'),
    ('public.member_insight_range_for_staff(uuid,uuid,date,date)', '46d591a3d6fcea8cf394f1076e9eded8'),
    ('public.member_tree_json(uuid,uuid)', 'c46685892c0dd51934fa0af57e6f5c5f'),
    ('public.member_org_map_for_department(uuid,uuid)', 'a981676a61cd450487f3a08229ff6a9f')
  ) AS f(sig, md5) LOOP
    SELECT md5(p.prosrc), p.prosrc INTO v_md5, v_src FROM pg_proc p WHERE p.oid = v_fn.sig::regprocedure;
    IF v_md5 IS DISTINCT FROM v_fn.md5 AND strpos(v_src, 'member_director_scheme') = 0 THEN
      RAISE EXCEPTION '% changed in production since this migration was written (md5 %)', v_fn.sig, v_md5;
    END IF;
  END LOOP;
END
$guard$;

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- ── The one rule: which scheme a director reads a sub-department by ───────────
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

REVOKE ALL ON FUNCTION public.member_director_scheme(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_director_scheme(uuid, uuid) TO service_role;

-- ── "Is this the caller's sub-department": a director's too ─────────────────────
SELECT pg_temp.swap_check('public.member_insight_scheme(uuid)'::regprocedure,
  $old$IF v_scheme IS NULL THEN RAISE EXCEPTION 'This department is not available to your account' USING ERRCODE='42501'; END IF;$old$,
  $new$IF v_scheme IS NULL THEN v_scheme:=public.member_director_scheme(v_staff,p_sub_department); END IF;
 IF v_scheme IS NULL THEN RAISE EXCEPTION 'This department is not available to your account' USING ERRCODE='42501'; END IF;$new$);

SELECT pg_temp.swap_check('public.member_arena_scheme(uuid)'::regprocedure,
  $old$IF v_scheme IS NULL THEN RAISE EXCEPTION 'This department is not available to your account' USING ERRCODE='42501'; END IF;$old$,
  $new$IF v_scheme IS NULL THEN v_scheme:=public.member_director_scheme(v_staff,p_sub_department); END IF;
  IF v_scheme IS NULL THEN RAISE EXCEPTION 'This department is not available to your account' USING ERRCODE='42501'; END IF;$new$);

SELECT pg_temp.swap_check('public.member_kpi_for_staff(uuid,uuid,date)'::regprocedure,
  $old$AND public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today));$old$,
  $new$AND ((public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)))
   OR public.member_director_scheme(v_staff,d.id)=c.id);$new$);

SELECT pg_temp.swap_check('public.member_quote_context(uuid)'::regprocedure,
  $old$AND public.member_has_membership(v_staff,d.id)
 AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
 AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today));$old$,
  $new$AND ((public.member_has_membership(v_staff,d.id)
 AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
 AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)))
 OR public.member_director_scheme(v_staff,d.id)=c.id);$new$);

-- ── A memo to a sub-department reaches its directors ──────────────────────────
SELECT pg_temp.swap_check('public.member_visible_memo(uuid,uuid)'::regprocedure,
  $old$AND public.member_has_membership(p_staff,a.sub_department_id))$old$,
  $new$AND (public.member_has_membership(p_staff,a.sub_department_id) OR public.member_director_scheme(p_staff,a.sub_department_id) IS NOT NULL))$new$);

-- ── The switcher: the sub-departments a director directs, after the seats ─────
SELECT pg_temp.swap_check('public.member_data_snapshot(boolean)'::regprocedure,
  $old$WHERE h.staff_id=v_staff AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
 AND d.is_active AND c.is_active AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);$old$,
  $new$WHERE h.staff_id=v_staff AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
 AND d.is_active AND c.is_active AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);
 v_memberships:=v_memberships||(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
 'title',coalesce(t.name,'Revenue Director'),'rank',coalesce(r.label,''),'rate',coalesce(r.product_rate,0),
 'calculator',(upper(d.code)='FAIR' OR lower(d.name)='fair') AND public.has_perm('member_quote'),
 'effective',c.effective_from,'capacity',cap.headcount_limit,'occupied',public.member_occupied(d.id,v_today),
 'people',public.member_tree_json(c.id,v_staff),'director',true) ORDER BY d.created_at,d.id),'[]'::jsonb)
 FROM public.comm_sub_department_directors x
 JOIN public.comm_sub_departments d ON d.id=x.sub_department_id
 JOIN public.comm_schemes c ON c.id=public.member_director_scheme(x.staff_id,x.sub_department_id)
 JOIN public.hr_staff_costs s ON s.id=x.staff_id
 LEFT JOIN public.titles t ON t.id=s.title_id
 LEFT JOIN LATERAL (SELECT dr.label,dr.product_rate FROM public.comm_ranks dr WHERE dr.scheme_id=c.id AND dr.title_id=s.title_id ORDER BY dr.sort_order DESC,dr.id LIMIT 1) r ON true
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE x.staff_id=v_staff AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m WHERE m->>'id'=d.id::text));$new$);

-- ── Insight: a director's block, everybody under them, no next rung ───────────
CREATE OR REPLACE FUNCTION public.member_insight_for_staff(p_staff uuid, p_period text, p_sub_department uuid, p_is_self boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date;
 v_blocks jsonb;
BEGIN
 v_period:=date_trunc('month',coalesce(
  CASE WHEN p_period ~ '^\d{4}-\d{2}$' THEN to_date(p_period||'-01','YYYY-MM-DD') END,
  v_today))::date;
 IF v_period>date_trunc('month',v_today)::date THEN
  v_period:=date_trunc('month',v_today)::date;
 END IF;

 SELECT coalesce(jsonb_agg(b.block ORDER BY b.ord,b.department),'[]'::jsonb) INTO v_blocks FROM (
  SELECT d.created_at AS ord,d.name AS department,jsonb_build_object(
   'membershipId',d.id,
   'schemeId',c.id,
   'department',d.name,
   'title',coalesce(t.name,'Title not configured'),
   'rank',coalesce(r.label,CASE WHEN h.director THEN '' ELSE 'Rank not configured' END),
   'rankSort',coalesce(r.sort_order,0),

   -- What the caller has done this month.
   'me',jsonb_build_object(
    'staffId',v_staff,
    'name',(SELECT employee_name FROM public.hr_staff_costs WHERE id=v_staff),
    'sales',coalesce(mine.sales,0),
    'held',coalesce(mine.held,0),
    'orders',coalesce(mine.order_count,0),
    'kpiQty',coalesce(mine.kpi_qty,0),
    'marginRevenue',coalesce(mine.margin_revenue,0),
    'marginCost',coalesce(mine.margin_cost,0),
    'blindOrders',coalesce(mine.blind_orders,0),
    'lastOrder',mine.last_order),

   -- The next rung, its gate, and how a personal-sales streak stands. The
   -- 100k gate is 100k in `months` months RUNNING (mig 20260903040000), so a
   -- single month's gap is only half the answer.
   'target',CASE WHEN h.director THEN NULL ELSE (
    SELECT jsonb_build_object(
     'rank',nx.label,
     'personal',nx.personal_sales_threshold,
     'months',nx.consecutive_months,
     'group',nx.group_sales_threshold,
     'streak',CASE WHEN nx.personal_sales_threshold IS NULL THEN NULL ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
       'period',to_char(m.month,'YYYY-MM'),
       'sales',m.sales,
       'live',m.month=v_period,
       'met',m.sales>=nx.personal_sales_threshold) ORDER BY m.month),'[]'::jsonb)
      FROM (
       SELECT (v_period-(g.back||' months')::interval)::date AS month,
        CASE WHEN g.back=0 THEN coalesce(mine.sales,0) ELSE coalesce((
         SELECT st.product_revenue FROM public.comm_statements st
         JOIN public.comm_runs r2 ON r2.id=st.run_id
         WHERE st.staff_id=v_staff AND r2.scheme_id=c.id
          AND r2.period_month=(v_period-(g.back||' months')::interval)::date
         LIMIT 1),0) END AS sales
       FROM generate_series(0,greatest(nx.consecutive_months,1)-1) AS g(back)
      ) m) END)
    FROM public.comm_ranks nx
    WHERE nx.scheme_id=c.id AND nx.sort_order>coalesce(r.sort_order,-1)
    ORDER BY nx.sort_order LIMIT 1) END,

   -- Every sub-department of this department, ranked. The caller's own first.
   'boards',(SELECT coalesce(jsonb_agg(x.board ORDER BY x.own DESC,x.ord,x.name),'[]'::jsonb) FROM (
     SELECT bd.name,bd.created_at AS ord,(bd.id=d.id) AS own,jsonb_build_object(
      'departmentId',bd.id,'department',bd.name,'own',bd.id=d.id,
      'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'staffId',p.staff_id,'name',p.name,'title',p.title,
        'sales',p.sales,'held',p.held,'orders',p.order_count,'kpiQty',p.kpi_qty,
        'marginRevenue',p.margin_revenue,'marginCost',p.margin_cost,
        'blindOrders',p.blind_orders,'lastOrder',p.last_order,
        'self',p_is_self AND p.staff_id=v_staff) ORDER BY p.sales DESC,p.name),'[]'::jsonb)
       FROM public.member_department_board(bc.id,v_period) p)) AS board
     FROM public.comm_sub_departments bd
     JOIN public.comm_schemes bc ON bc.sub_department_id=bd.id AND bc.is_active
      AND bc.effective_from<=v_today AND (bc.effective_to IS NULL OR bc.effective_to>=v_today)
     WHERE bd.is_active AND bd.department_id=d.department_id
    ) x),

   -- The caller's own subtree in this scheme.
   'downline',(SELECT coalesce(jsonb_agg(jsonb_build_object(
     'staffId',p.staff_id,'name',p.name,'title',p.title,'uplineId',p.upline_id,'depth',p.depth,
     'sales',p.sales,'held',p.held,'orders',p.order_count,'kpiQty',p.kpi_qty,
     'marginRevenue',p.margin_revenue,'marginCost',p.margin_cost,
     'blindOrders',p.blind_orders,'lastOrder',p.last_order)
     ORDER BY p.depth,p.sales DESC,p.name),'[]'::jsonb)
    FROM public.member_downline_board(c.id,v_staff,v_period) p),

   'orders',public.member_insight_orders(c.id,v_staff,v_period)
  )||CASE WHEN h.director THEN jsonb_build_object('director',true,'team',(
    SELECT jsonb_build_object('sales',coalesce(sum(t.sales),0),'held',coalesce(sum(t.held),0),'orders',coalesce(sum(t.order_count),0),
     'kpiQty',coalesce(sum(t.kpi_qty),0),'marginRevenue',coalesce(sum(t.margin_revenue),0),'marginCost',coalesce(sum(t.margin_cost),0),
     'blindOrders',coalesce(sum(t.blind_orders),0))
    FROM public.member_scoreboard(c.id,v_period) t)) ELSE '{}'::jsonb END AS block
  FROM (
   SELECT x.scheme_id,x.staff_id,x.title_id,x.rank_id,x.effective_from,x.effective_to,false AS director
   FROM public.comm_hierarchy x WHERE x.staff_id=v_staff
   UNION ALL
   SELECT dc.id,dd.staff_id,ds.title_id,(SELECT dr.id FROM public.comm_ranks dr WHERE dr.scheme_id=dc.id AND dr.title_id=ds.title_id ORDER BY dr.sort_order DESC,dr.id LIMIT 1),
    dc.effective_from,dc.effective_to,true
   FROM public.comm_sub_department_directors dd
   JOIN public.hr_staff_costs ds ON ds.id=dd.staff_id
   JOIN public.comm_schemes dc ON dc.id=public.member_director_scheme(dd.staff_id,dd.sub_department_id)
   WHERE dd.staff_id=v_staff
  ) h
  JOIN public.comm_schemes c ON c.id=h.scheme_id
  JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
  LEFT JOIN public.titles t ON t.id=h.title_id
  LEFT JOIN public.comm_ranks r ON r.id=h.rank_id
  LEFT JOIN LATERAL public.member_scoreboard(c.id,v_period) mine ON mine.staff_id=v_staff
  WHERE h.staff_id=v_staff AND (p_sub_department IS NULL OR d.id=p_sub_department)
   AND h.effective_from<=v_today
   AND (h.effective_to IS NULL OR h.effective_to>=v_today)
   AND d.is_active AND c.is_active AND c.effective_from<=v_today
   AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 ) b;

 RETURN jsonb_build_object(
  'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),
  'live',v_period=date_trunc('month',v_today)::date,
  'blocks',v_blocks);
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

CREATE OR REPLACE FUNCTION public.member_insight_range_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH RECURSIVE board AS (
  SELECT * FROM public.member_scoreboard_range(p_scheme,p_from,p_until)
 ), dir AS (
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

CREATE OR REPLACE FUNCTION public.member_tree_json(p_scheme uuid, p_staff uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH RECURSIVE positions AS (
 SELECT h.* FROM public.comm_hierarchy h WHERE h.scheme_id=p_scheme
 AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
 AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 ), dir AS (
 SELECT coalesce(public.member_director_scheme(p_staff,c.sub_department_id)=p_scheme,false) AS directs
 FROM public.comm_schemes c WHERE c.id=p_scheme
 ), tree AS (
 SELECT h.staff_id,ARRAY[h.staff_id] AS visited,0 AS depth FROM positions h WHERE h.staff_id=p_staff
 UNION ALL SELECT h.staff_id,t.visited||h.staff_id,t.depth+1 FROM positions h JOIN tree t ON h.upline_staff_id=t.staff_id
 WHERE t.depth<20 AND NOT h.staff_id=ANY(t.visited)
 ), visible AS (
 SELECT staff_id FROM tree UNION SELECT upline_staff_id FROM positions WHERE staff_id=p_staff AND upline_staff_id IS NOT NULL
 UNION SELECT h.staff_id FROM positions h CROSS JOIN dir WHERE dir.directs
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.employee_name,
 'title',coalesce(t.name,'Title 待配置'),'rank',coalesce(r.label,'Rank 待配置'),
 'parentId',CASE WHEN h.upline_staff_id IN(SELECT staff_id FROM visible) THEN h.upline_staff_id END,'self',s.id=p_staff)
 ORDER BY s.employee_name),'[]'::jsonb)
 FROM visible v JOIN public.hr_staff_costs s ON s.id=v.staff_id JOIN positions h ON h.staff_id=s.id
 LEFT JOIN public.titles t ON t.id=h.title_id LEFT JOIN public.comm_ranks r ON r.id=h.rank_id;
$function$;

CREATE OR REPLACE FUNCTION public.member_org_map_for_department(p_department uuid, p_staff uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_department uuid:=p_department;
 v_departments jsonb;
 v_people jsonb;
 v_directs uuid[]:=ARRAY(SELECT x.sub_department_id FROM public.comm_sub_department_directors x
  WHERE x.staff_id=p_staff AND public.member_director_scheme(p_staff,x.sub_department_id) IS NOT NULL);
BEGIN

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
  'capacity',cap.headcount_limit,
  'mine',public.member_has_membership(v_staff,d.id) OR d.id=ANY(v_directs),
  'directors',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ds.id,'name',ds.employee_name)
    ORDER BY ds.employee_name),'[]'::jsonb)
   FROM public.comm_sub_department_directors dd
   JOIN public.hr_staff_costs ds ON ds.id=dd.staff_id
   WHERE dd.sub_department_id=d.id AND ds.status='active')
 ) ORDER BY d.created_at,d.id),'[]'::jsonb) INTO v_departments
 FROM public.comm_sub_departments d
 JOIN public.comm_schemes c ON c.sub_department_id=d.id AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE d.is_active AND d.department_id=v_department;

 -- One node per MEMBERSHIP, not per person: somebody in Fair and IR stands in
 -- both frames, under a different upline and a different title in each.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id||':'||h.staff_id,'staffId',h.staff_id,'departmentId',d.id,'schemeId',c.id,
  'name',s.employee_name,'code',s.employee_code,
  'title',coalesce(t.name,'Title not configured'),
  'parentId',CASE WHEN h.upline_staff_id IS NOT NULL THEN c.id||':'||h.upline_staff_id END,
  'self',coalesce(h.staff_id=v_staff,false),
  'mine',public.member_has_membership(v_staff,d.id) OR d.id=ANY(v_directs)
 ) ORDER BY s.employee_name),'[]'::jsonb) INTO v_people
 FROM public.comm_hierarchy h
 JOIN public.comm_schemes c ON c.id=h.scheme_id AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id AND d.is_active
  AND d.department_id=v_department
 JOIN public.hr_staff_costs s ON s.id=h.staff_id AND s.status='active'
 LEFT JOIN public.titles t ON t.id=h.title_id
 WHERE h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today);

 RETURN jsonb_build_object('asOf',now(),
  'departments',coalesce(v_departments,'[]'::jsonb),
  'people',coalesce(v_people,'[]'::jsonb));
END $function$;

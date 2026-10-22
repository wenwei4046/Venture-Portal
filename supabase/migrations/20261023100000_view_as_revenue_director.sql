-- ============================================================================
-- 20261023100000_view_as_revenue_director.sql
-- View as finds the Revenue Director (2026-10-23 — the user, on the Revenue app's Profile › View as: "找不到我的
-- revenue director 了。By right 它应该是能够找得到的").
-- ============================================================================
--
-- A Revenue Director holds no seat (23DIR). Since 20261014090000 their own app reads them as the TOP of each
-- sub-department they direct (comm_sub_department_directors — Fair ← PETER + KRIS, IR ← PETER; the one rule is
-- member_director_scheme). The Principal's View as was left out (revenue-app.md › A REVENUE DIRECTOR IN THE APP,
-- "Not done"): its list is each sub-department's seats (member_principal_snapshot's `people`), and every read it makes
-- for the person picked asks member_principal_context, which wants a seat and refuses a department head. Now:
--   * member_principal_snapshot lists, in each sub-department, its directors after the seats — their title, the rung
--     their title holds on the scheme's ladder ('' where it holds none: IR), no upline, `director` true — as their
--     own switcher (member_data_snapshot) names them. Never twice: somebody who also holds a seat there is the seat;
--   * member_principal_context answers a director of the sub-department with the scheme their own app reads it by
--     (member_director_scheme), so Insight, the bills, the Arena, KPI, My income, honours and share requests read for
--     them exactly as their own app does — the *_for_staff functions already know a director (20261014090000). A
--     p_scheme that is not that scheme is still refused; a seat is checked as before; nobody else is let in.
-- Production's bodies (md5 member_principal_context 04ccd4e04e98834263f0c35837cfa2b1, member_principal_snapshot(boolean)
-- 80abc002c770035b9e5c04db014d306a) have one statement swapped each — pg_temp.swap_check refuses a body that changed
-- since. Running it twice changes nothing. PGlite: tests/member-sql/validate-view-as-director.mjs.

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

-- ── The person picked: a director of the sub-department too ───────────────────────
SELECT pg_temp.swap_check('public.member_principal_context(uuid,uuid,uuid)'::regprocedure,
  $old$IF v_scheme IS NULL THEN
  RAISE EXCEPTION 'The selected member needs an active membership in this department' USING ERRCODE='42501';
 END IF;$old$,
  $new$IF v_scheme IS NULL THEN
  v_scheme:=public.member_director_scheme(p_staff,p_sub_department);
  IF p_scheme IS NOT NULL AND v_scheme IS DISTINCT FROM p_scheme THEN v_scheme:=NULL; END IF;
 END IF;
 IF v_scheme IS NULL THEN
  RAISE EXCEPTION 'The selected member needs an active membership in this department' USING ERRCODE='42501';
 END IF;$new$);

-- ── View as's list: each sub-department's directors after its seats ───────────
SELECT pg_temp.swap_check('public.member_principal_snapshot(boolean)'::regprocedure,
  $old$FROM positions h LEFT JOIN public.titles t ON t.id=h.title_id
   LEFT JOIN public.comm_ranks r ON r.id=h.rank_id WHERE h.scheme_id=c.id)$old$,
  $new$FROM positions h LEFT JOIN public.titles t ON t.id=h.title_id
   LEFT JOIN public.comm_ranks r ON r.id=h.rank_id WHERE h.scheme_id=c.id)
  ||(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',ds.id,'name',ds.employee_name,
   'title',coalesce(dt.name,'Revenue Director'),'rank',coalesce(dr.label,''),
   'parentId',NULL,'self',false,'director',true
  ) ORDER BY ds.employee_name,ds.id),'[]'::jsonb)
   FROM public.comm_sub_department_directors dd
   JOIN public.hr_staff_costs ds ON ds.id=dd.staff_id
   LEFT JOIN public.titles dt ON dt.id=ds.title_id
   LEFT JOIN LATERAL (SELECT x.label FROM public.comm_ranks x WHERE x.scheme_id=c.id AND x.title_id=ds.title_id
    ORDER BY x.sort_order DESC,x.id LIMIT 1) dr ON true
   WHERE dd.sub_department_id=d.id AND public.member_director_scheme(dd.staff_id,d.id)=c.id
    AND NOT EXISTS(SELECT 1 FROM positions seat WHERE seat.scheme_id=c.id AND seat.staff_id=dd.staff_id))$new$);

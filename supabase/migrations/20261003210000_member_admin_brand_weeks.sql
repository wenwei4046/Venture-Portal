-- ═══════════════════════════════════════════════════════════════════════════
-- Brand weeks in the back office, for HR (2026-10-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 20261003190000 closed a week seven days after its fair: after that only the
-- ERP or the back office changes it (user: 除非是 ERP 那边改，或者是后台这边改).
-- The back office was the Principal's view of one member in the member app —
-- HR had no way to change a week at all, and no Revenue seller has a member
-- login yet (0 of 32 on 2026-10-03), so every week is the back office's to set.
--
-- People › Member services › Brand weeks: a department's month on one grid —
-- every member, every week, what they picked or what the board guessed, and
-- the booths they wrote at — for whoever reviews member requests (HR and the
-- Principal: member_is_manager('member_requests_manage')).
--
-- 1. WHO SAVED: member_arena_brand_weeks.updated_by, written by the one store
--    every save goes through (member_arena_store_week_picks) — the member's
--    own save, the Principal's member view and this page alike.
-- 2. THE GRID: member_admin_brand_weeks(sub-department, month) — the month's
--    weeks with the day each closes, the department's members (the roster the
--    Fair results rank), what is stored, and the booth boards of those weeks
--    exactly as the member app reads them (member_arena_booth_history_for_staff).
-- 3. THE SAVE: member_admin_save_brand_weeks(sub-department, month,
--    {staff: picks}) — several members at once, any week, closed ones too,
--    each checked as the member's own picks are (member_arena_clean_week_picks).
--
-- REVERSAL
--   DROP FUNCTION member_admin_save_brand_weeks(uuid,text,jsonb);
--   DROP FUNCTION member_admin_brand_weeks(uuid,text);
--   DROP FUNCTION member_admin_brand_weeks_roster(uuid);
--   DROP FUNCTION member_admin_brand_weeks_scheme(uuid);
--   member_arena_store_week_picks back to 20261003190000's;
--   ALTER TABLE member_arena_brand_weeks DROP COLUMN updated_by;

-- ─── 1. Who saved ──────────────────────────────────────────────────────────

ALTER TABLE public.member_arena_brand_weeks
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id);

COMMENT ON COLUMN public.member_arena_brand_weeks.updated_by IS
  'The account that last saved the month''s picks: the member themselves, or the back office (HR on Member services, the Principal''s member view). NULL before 2026-10-03.';

CREATE OR REPLACE FUNCTION public.member_arena_store_week_picks(p_staff uuid,p_sub_department uuid,p_month date,p_picks jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO member_arena_brand_weeks(staff_id,sub_department_id,period_month,weeks,counts,picks,updated_by)
  VALUES(p_staff,p_sub_department,p_month,cardinality(public.member_arena_month_fridays(p_month)),
    (SELECT jsonb_object_agg(b,(SELECT count(*) FROM jsonb_each_text(p_picks) k WHERE k.value=b))
       FROM unnest(ARRAY['AKEMI','ERGOTEX','ZANOTTI','DUNLOP']) b),
    p_picks,auth.uid())
  ON CONFLICT(staff_id,sub_department_id,period_month) DO UPDATE
    SET weeks=excluded.weeks,counts=excluded.counts,picks=excluded.picks,updated_at=now(),updated_by=excluded.updated_by
$$;

-- ─── 2. The department, the roster ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_admin_brand_weeks_scheme(p_sub_department uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scheme uuid; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF NOT public.member_is_manager('member_requests_manage') THEN
    RAISE EXCEPTION 'Brand weeks need HR request management access' USING ERRCODE='42501';
  END IF;
  SELECT c.id INTO v_scheme FROM comm_schemes c
  JOIN comm_sub_departments d ON d.id=c.sub_department_id
  WHERE d.id=p_sub_department AND d.is_active AND c.is_active
    AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1;
  IF v_scheme IS NULL THEN RAISE EXCEPTION 'Choose a department with an active commission scheme'; END IF;
  RETURN v_scheme;
END $$;

COMMENT ON FUNCTION public.member_admin_brand_weeks_scheme(uuid) IS
  'Internal. The back office''s gate (member_is_manager(''member_requests_manage'') — HR and the Principal) and the sub-department''s current scheme.';

-- The members the Fair results rank (member_arena_booth_history_for_staff's
-- roster): a current membership of the scheme, active, not a department head.
CREATE OR REPLACE FUNCTION public.member_admin_brand_weeks_roster(p_scheme uuid)
RETURNS TABLE(staff_id uuid,name text,title text,user_id uuid,has_login boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT DISTINCT ON (s.id) s.id,s.employee_name::text,coalesce(t.name,st.name)::text,s.user_id,
    EXISTS(SELECT 1 FROM users u WHERE u.id=s.user_id AND u.is_active)
  FROM comm_hierarchy h
  JOIN hr_staff_costs s ON s.id=h.staff_id
  LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
  WHERE h.scheme_id=p_scheme AND s.status='active'
    AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
    AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ORDER BY s.id,h.effective_from DESC
$$;

COMMENT ON FUNCTION public.member_admin_brand_weeks_roster(uuid) IS
  'Internal. The members of a scheme the Arena''s Fair results rank, with their title there and whether they have an active member login.';

REVOKE ALL ON FUNCTION public.member_admin_brand_weeks_scheme(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.member_admin_brand_weeks_roster(uuid) FROM PUBLIC,anon,authenticated;

-- ─── 3. The grid ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_admin_brand_weeks(p_sub_department uuid,p_period text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_scheme uuid:=public.member_admin_brand_weeks_scheme(p_sub_department);
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_month date; v_fridays date[]; v_history jsonb;
BEGIN
  -- The month itself: a real one, not in the future.
  PERFORM public.member_arena_clean_week_picks(p_period,'{}'::jsonb);
  v_month:=(p_period||'-01')::date;
  v_fridays:=public.member_arena_month_fridays(v_month);
  v_history:=public.member_arena_booth_history_for_staff(p_sub_department,v_scheme);
  RETURN jsonb_build_object(
    'period',p_period,
    'subDepartmentId',p_sub_department,
    'asOf',now(),
    'weeks',(SELECT coalesce(jsonb_agg(jsonb_build_object('week',x.week,'closesOn',x.closes_on,
        'locked',v_today>x.closes_on) ORDER BY x.week),'[]'::jsonb)
      FROM (SELECT w AS week,public.member_arena_week_closes_on(w) AS closes_on FROM unnest(v_fridays) w) x),
    'people',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.staff_id,'name',r.name,'title',r.title,
        'hasLogin',r.has_login,'savedAt',bw.updated_at,
        'savedBy',coalesce(nullif(btrim(u.name),''),u.email),
        'savedBySelf',bw.updated_by IS NOT NULL AND bw.updated_by IS NOT DISTINCT FROM r.user_id)
        ORDER BY r.name,r.staff_id),'[]'::jsonb)
      FROM public.member_admin_brand_weeks_roster(v_scheme) r
      LEFT JOIN member_arena_brand_weeks bw ON bw.staff_id=r.staff_id
        AND bw.sub_department_id=p_sub_department AND bw.period_month=v_month
      LEFT JOIN users u ON u.id=bw.updated_by),
    'picks',(SELECT coalesce(jsonb_object_agg(bw.staff_id,bw.picks),'{}'::jsonb) FROM member_arena_brand_weeks bw
      WHERE bw.sub_department_id=p_sub_department AND bw.period_month=v_month AND bw.picks<>'{}'::jsonb),
    -- The booth boards of the month's weeks, as the member app ranks them.
    'events',(SELECT coalesce(jsonb_agg(x.e ORDER BY x.ord),'[]'::jsonb)
      FROM jsonb_array_elements(coalesce(v_history->'events','[]'::jsonb)) WITH ORDINALITY x(e,ord)
      WHERE (x.e->>'week')::date=ANY(v_fridays)));
END $$;

COMMENT ON FUNCTION public.member_admin_brand_weeks(uuid,text) IS
  'People › Member services › Brand weeks (2026-10-03): a sub-department''s month for the back office — weeks (closesOn, locked), people (title, hasLogin, savedAt / savedBy / savedBySelf), the stored picks by staff, and the Fair results'' booth boards of those weeks (member_arena_booth_history_for_staff). HR and the Principal only.';

REVOKE ALL ON FUNCTION public.member_admin_brand_weeks(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_admin_brand_weeks(uuid,text) TO authenticated;

-- ─── 4. The save: several members, any week ────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_admin_save_brand_weeks(p_sub_department uuid,p_period text,p_rows jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_scheme uuid:=public.member_admin_brand_weeks_scheme(p_sub_department);
  v_month date; v_key text; v_value jsonb; v_saved integer:=0;
BEGIN
  PERFORM public.member_arena_clean_week_picks(p_period,'{}'::jsonb);
  v_month:=(p_period||'-01')::date;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'object' OR p_rows='{}'::jsonb THEN
    RAISE EXCEPTION 'Nothing to save';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_rows))>500 THEN
    RAISE EXCEPTION 'Save at most 500 members at a time';
  END IF;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_rows) LOOP
    IF v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR NOT EXISTS(SELECT 1 FROM public.member_admin_brand_weeks_roster(v_scheme) r WHERE r.staff_id=v_key::uuid) THEN
      RAISE EXCEPTION 'Only a current member of this department can be given brand weeks';
    END IF;
    PERFORM public.member_arena_store_week_picks(v_key::uuid,p_sub_department,v_month,
      public.member_arena_clean_week_picks(p_period,v_value));
    v_saved:=v_saved+1;
  END LOOP;
  RETURN v_saved;
END $$;

COMMENT ON FUNCTION public.member_admin_save_brand_weeks(uuid,text,jsonb) IS
  'The back office sets the brand weeks of several members of a sub-department for one month: {"<staff id>": {"<Friday>": "AKEMI"|"DUNLOP"|"ZANOTTI"|"ERGOTEX"|null}} — each member''s whole month, closed weeks too (2026-10-03). HR and the Principal only. Returns how many members were saved.';

REVOKE ALL ON FUNCTION public.member_admin_save_brand_weeks(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_admin_save_brand_weeks(uuid,text,jsonb) TO authenticated;

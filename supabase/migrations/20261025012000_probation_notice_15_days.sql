-- ============================================================================
-- 20261025012000_probation_notice_15_days.sql
-- HR is told 15 days before a probation ends, not 14 (2026-10-24 — asked whether the reminder should be the 15 days
-- the user's own reply to LI SEAN on IT-0006 promised, the user: "go with 15 days").
-- ============================================================================
--
-- notify_probation_due: production's body (20261024223000's, md5 582befa4…) with its window's one number changed.
-- lib/employment-status.ts › PROBATION_NOTICE_DAYS says the same for HR view's bell, the HR app's Home and person page,
-- the roster's chip and HR's Overview — probation-reviews.test.ts holds the two together.
-- PGlite: tests/member-sql/validate-probation-15-days.mjs.

DO $$
DECLARE
  v text;
BEGIN
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.notify_probation_due(timestamptz)'::regprocedure;
  IF v IS NULL OR v NOT IN ('582befa4a2f7e0296f1a9bdd2a244113', 'f17f28df7e64b27d8da1d6108bb4cb18') THEN
    RAISE EXCEPTION 'notify_probation_due is not the body this migration replaces (md5 %)', v;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.notify_probation_due(p_now timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_local timestamp := coalesce(p_now, now()) AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_today date := (coalesce(p_now, now()) AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_told  uuid[];
  v_n     integer := 0;
  v_rows  integer;
  v_key   text;
  v_left  integer;
  v_body  text;
  r       record;
BEGIN
  -- From 9:00 the office's time: never a phone at midnight.
  IF extract(hour FROM v_local) < 9 THEN
    RETURN 0;
  END IF;
  -- Whoever keeps the topic and, asked as them now, may still acknowledge it.
  v_told := ARRAY(
    SELECT t.user_id FROM public.notification_topics t JOIN public.users u ON u.id = t.user_id AND u.is_active
     WHERE t.topic = 'people.probation' AND public.probation_notice_may(t.user_id)
     ORDER BY t.user_id);
  IF coalesce(array_length(v_told, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT s.id, s.user_id, s.employee_name, s.probation_end, d.name AS department
      FROM public.hr_staff_costs s
      LEFT JOIN public.departments d ON d.id = s.department_id
     WHERE s.status = 'active' AND s.employment_status = 'probation' AND s.probation_end IS NOT NULL
       -- PROBATION_NOTICE_DAYS (lib/employment-status.ts): the reminder's window, its last day included.
       AND s.probation_end - 15 <= v_today AND v_today <= s.probation_end
       AND s.probation_ack_end IS DISTINCT FROM s.probation_end
     ORDER BY s.probation_end, s.employee_name
  LOOP
    v_key := 'probation:' || r.id || ':' || r.probation_end;
    v_left := r.probation_end - v_today;
    -- "Ends 31 Oct 2026 · in 8 days · HR" — the bell's own line (lib/employment-status.ts › probationEndLine).
    v_body := 'Ends ' || to_char(r.probation_end, 'FMDD Mon YYYY') || ' · '
           || CASE v_left WHEN 0 THEN 'today' WHEN 1 THEN 'tomorrow' ELSE 'in ' || v_left || ' days' END
           || coalesce(' · ' || nullif(btrim(r.department), ''), '');
    INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id, data)
    SELECT x, 'people', left('Probation ending · ' || r.employee_name, 200), left(v_body, 400), 'hr_staff', r.id::text,
           jsonb_build_object('due', v_key)
      FROM unnest(v_told) x
     WHERE x IS DISTINCT FROM r.user_id
       AND NOT EXISTS (SELECT 1 FROM public.app_notifications n
                        WHERE n.user_id = x AND n.ref_kind = 'hr_staff' AND n.data ->> 'due' = v_key);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_n := v_n + v_rows;
  END LOOP;
  RETURN v_n;
END
$fn$;

COMMENT ON FUNCTION public.notify_probation_due(timestamptz) IS
  'The hourly sweep (2026-10-23; 15 days since 2026-10-24): a probation ending within 15 days, not yet acknowledged for that end — told once to each holder of people.probation who may still acknowledge it. The service role''s alone.';

REVOKE ALL ON FUNCTION public.notify_probation_due(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_probation_due(timestamptz) TO service_role;

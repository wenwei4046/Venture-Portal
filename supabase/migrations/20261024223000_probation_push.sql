-- ============================================================================
-- 20261024223000_probation_push.sql
-- The probation reminder reaches HR's phone (2026-10-23 — the user: "do this, HR 手机 app 里的提醒和推送，以及 HR
-- Overview 首页上的数字"; then, passing on a side note about the topic list — every permission change empties it, so
-- an HR colleague whose phone said yes hears nothing until they open the HR app again: "想办法让名单不要这么容易被清空").
-- ============================================================================
--
-- Told (app_notifications, kind 'people', ref 'hr_staff' → the person; the HR app's bell and the phone): a probation
-- whose last day is PROBATION_NOTICE_DAYS (lib/employment-status.ts, 14) away or nearer, and not past, that HR has not
-- acknowledged for that day — once to each person told for each end (data.due = 'probation:<staff>:<end>'), from 9:00
-- the office's time, by the hourly sweep (app/api/member-queue → notify_probation_due), whose flushPush then sends it.
-- An extension moves the end: told again before the new one. Never the person on probation themselves.
--
-- To whom: whoever keeps the topic 'people.probation' — the HR app keeps it for whoever opens it holding People · Edit
-- with the HR scope (notification_topics_sync) — AND, asked as them when the notice is written, may still acknowledge
-- it: the HR scope, People · Edit, and the person page's box for it (probation_notice_may — auth.uid() pointed at them
-- for those three calls and put back, as view_as_person does). Because it is asked again every time, a permission
-- change need not forget this topic: notification_topics_forget now spares it, and whoever lost the right is passed
-- over at once and loses the topic the next time they open the HR app.
--
-- notification_topics_sync also keeps only the topics it manages: it deleted every topic its list did not name, so
-- opening the HR app took IT requests' 'it.requests' away (it_desk_listen's own) until IT requests was opened again.
-- Both functions are replaced from PRODUCTION's bodies (md5 checked below), each with the statements named here.
-- PGlite: tests/member-sql/validate-probation-push.mjs.

-- ── The notice's kind, its reference and the topic: widened, nothing dropped ────
-- From what each check holds now (other sessions add kinds too) — the same helper as 20261021020100.

CREATE OR REPLACE FUNCTION pg_temp.widen_check(p_table regclass, p_name text, p_column text, p_add text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_def  text;
  v_vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def FROM pg_constraint c WHERE c.conrelid = p_table AND c.conname = p_name;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '% has no constraint %', p_table, p_name;
  END IF;
  -- Each quoted value — ARRAY['a'::text, 'b'::text], as production writes them — or one array literal '{a,b}'.
  v_vals := ARRAY(SELECT DISTINCT btrim(v, '"') FROM regexp_matches(v_def, '''([^'']+)''', 'g') m,
                         unnest(CASE WHEN m[1] LIKE '{%}' THEN string_to_array(btrim(m[1], '{}'), ',') ELSE ARRAY[m[1]] END) v);
  IF v_vals @> p_add THEN
    RETURN;
  END IF;
  v_vals := ARRAY(SELECT DISTINCT x FROM unnest(v_vals || p_add) x ORDER BY x);
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I = ANY (ARRAY[%s]))', p_table, p_name, p_column,
                 (SELECT string_agg(quote_literal(x), ', ' ORDER BY x) FROM unnest(v_vals) x));
END
$fn$;

SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_kind_check', 'kind', ARRAY['people']);
SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_ref_kind_check', 'ref_kind', ARRAY['hr_staff']);
SELECT pg_temp.widen_check('public.notification_topics', 'notification_topics_topic_check', 'topic', ARRAY['people.probation']);

-- ── The two bodies replaced are production's (or this migration's, run again) ────

DO $$
DECLARE
  v text;
BEGIN
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.notification_topics_sync(text[])'::regprocedure;
  IF v IS NULL OR v NOT IN ('75c9bba67453cbe1fdd1adfc5506607f', '29b2feb9e4d2dfdc242de41a3fc15891') THEN
    RAISE EXCEPTION 'notification_topics_sync is not the body this migration replaces (md5 %)', v;
  END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.notification_topics_forget()'::regprocedure;
  IF v IS NULL OR v NOT IN ('3c93a19ebce2e742ea05b9fc33ae55b4', '0d5d4691acc6054822870ec1e140d66f') THEN
    RAISE EXCEPTION 'notification_topics_forget is not the body this migration replaces (md5 %)', v;
  END IF;
END
$$;

-- ── May this account acknowledge a probation now? Asked as them ─────────────────
-- The HR scope, People · Edit and the person page's box — the three probation_acknowledge asks — answered by the
-- database's own functions for p_user: auth.uid() reads request.jwt.claim.sub first, so it is pointed at them for the
-- three calls and put back before returning, on success and on failure alike. Not tab_write_guard: called inside other
-- functions it lets everything through (it guards a write's own page only). Nothing is written.

CREATE OR REPLACE FUNCTION public.probation_notice_may(p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_may boolean := false;
BEGIN
  IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.is_active) THEN
    RETURN false;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
    v_may := public.has_scope(ARRAY['hr']) IS TRUE
         AND public.has_any_action(ARRAY['team.edit']) IS TRUE
         AND public.tab_write_open(ARRAY['/team/people/[id]'], ARRAY['team.edit']) IS TRUE;
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    RETURN false;
  END;
  RETURN v_may;
END
$fn$;

COMMENT ON FUNCTION public.probation_notice_may(uuid) IS
  'Probation notices (2026-10-23): may this account acknowledge a probation now — the HR scope, People · Edit and the person page''s box, asked as them. Other functions'' helper; nobody signed in calls it.';

-- ── The sweep's notices ─────────────────────────────────────────────────────────
-- p_now: the sweep's moment (the checks hand in theirs); the office's day and hour are read from it.

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
       AND s.probation_end - 14 <= v_today AND v_today <= s.probation_end
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
  'The hourly sweep (2026-10-23): a probation ending within 14 days, not yet acknowledged for that end — told once to each holder of people.probation who may still acknowledge it. The service role''s alone.';

-- ── The HR app keeps its viewer's topics: people.probation too, and only its own ─
-- Production's body with two statements changed: the keep list asks for people.probation (probation_notice_may, the
-- same question the sweep asks), and the DELETE takes only the topics this function keeps — never it.requests.

CREATE OR REPLACE FUNCTION public.notification_topics_sync(p_topics text[])
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_keep text[];
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  v_keep := ARRAY(
    SELECT DISTINCT t FROM unnest(coalesce(p_topics, '{}'::text[])) t
     WHERE (t = 'hiring.guest' AND public.has_any_action(ARRAY['hiring.approve']))
        OR (t = 'rooms.guest' AND public.has_any_action(ARRAY['rooms.edit']))
        OR (t = 'member.requests' AND public.member_is_manager('member_requests_manage'))
        OR (t = 'people.probation' AND public.probation_notice_may(v_me))
     ORDER BY t);
  DELETE FROM public.notification_topics
   WHERE user_id = v_me AND topic IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation')
     AND NOT (topic = ANY (v_keep));
  INSERT INTO public.notification_topics (user_id, topic)
  SELECT v_me, t FROM unnest(v_keep) t
  ON CONFLICT (user_id, topic) DO UPDATE SET synced_at = now();
  RETURN v_keep;
END
$fn$;

-- ── A permission change forgets every topic but the one asked again each time ───

CREATE OR REPLACE FUNCTION public.notification_topics_forget()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- people.probation is asked again whenever it is told (probation_notice_may): it stays.
  DELETE FROM public.notification_topics WHERE topic <> 'people.probation';
  RETURN NULL;
END
$fn$;

-- ── Who may call them ───────────────────────────────────────────────────────────
-- The sweep's and its helper's: the service role alone (the helper runs inside other functions, as their owner).

REVOKE ALL ON FUNCTION public.notify_probation_due(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_probation_due(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.probation_notice_may(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.probation_notice_may(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.notification_topics_sync(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_topics_sync(text[]) TO authenticated;

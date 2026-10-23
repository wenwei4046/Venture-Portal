-- ============================================================================
-- 20261025003000_topics_asked_at_send.sql
-- Every HR topic is asked again, as its holder, whenever it tells (2026-10-24 — the user, of the topic list every
-- permission change empties: "想办法让名单不要这么容易被清空"; then a side agent's note, passed on: 20261024223000
-- spared people.probation alone — hiring, rooms, member requests and IT still went silent after any permission change
-- until each holder opened their app again).
-- ============================================================================
--
-- notification_topic_may(user, topic): may this account hold the topic now — asked AS THEM, auth.uid() pointed at them
-- for the checks and put back, on success and on failure alike (probation_notice_may's way, 20261024223000):
--   hiring.guest     — Hiring · Approve, with the Hiring requests page's Approve box    (the HR app's may.hireApprove)
--   rooms.guest      — Meeting rooms · Edit, with the Meeting Rooms page's Edit box    (the HR app's rooms.edit)
--   member.requests  — Member services' key, with its page's Manage box               (the HR app's may.decide)
--   it.requests      — IT requests · View                                            (it_desk_listen's)
--   people.probation — probation_notice_may                                           (20261024223000)
-- A page's own tab (whether it is open at all) is the app's to ask; the database answers only for boxes.
--
-- notify_topic tells only the holders it finds able at that moment, so a permission change need not forget anybody:
-- notification_topics_forget now forgets only the topics of accounts switched off, and whoever lost a right is passed
-- over at once and loses its topic the next time their app opens (notification_topics_sync keeps a topic by the same
-- question). The three bodies replaced are production's (md5 checked below), each with the statement named here.
-- PGlite: tests/member-sql/validate-topics-asked-at-send.mjs.

-- ── The bodies replaced are production's (or this migration's, run again) ──────

DO $$
DECLARE
  v text;
BEGIN
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.notify_topic(text,text,text,text,text,text)'::regprocedure;
  IF v IS NULL OR v NOT IN ('fdb51debc1205ed88a96898f7a8e494f', '5a9bbaa9340cfad42ed1960a275c3e56') THEN
    RAISE EXCEPTION 'notify_topic is not the body this migration replaces (md5 %)', v;
  END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.notification_topics_sync(text[])'::regprocedure;
  IF v IS NULL OR v NOT IN ('29b2feb9e4d2dfdc242de41a3fc15891', '931c63761257d74fbe3b0162f2d71464') THEN
    RAISE EXCEPTION 'notification_topics_sync is not the body this migration replaces (md5 %)', v;
  END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.notification_topics_forget()'::regprocedure;
  IF v IS NULL OR v NOT IN ('0d5d4691acc6054822870ec1e140d66f', '36538c930687a9f4d1eabdf37dc2b64a') THEN
    RAISE EXCEPTION 'notification_topics_forget is not the body this migration replaces (md5 %)', v;
  END IF;
END
$$;

-- ── May this account hold the topic now? Asked as them ──────────────────────────
-- The database's own functions answer for p_user: auth.uid() reads request.jwt.claim.sub first, so it is pointed at
-- them for the checks and put back before returning. Not tab_write_guard: called inside other functions it lets
-- everything through (it guards a write's own page only). Nothing is written.

CREATE OR REPLACE FUNCTION public.notification_topic_may(p_user uuid, p_topic text)
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
  IF p_topic = 'people.probation' THEN
    RETURN public.probation_notice_may(p_user);
  END IF;
  IF p_topic IS NULL OR p_topic NOT IN ('hiring.guest', 'rooms.guest', 'member.requests', 'it.requests') THEN
    RETURN false;
  END IF;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
    v_may := CASE p_topic
      WHEN 'hiring.guest' THEN public.has_any_action(ARRAY['hiring.approve']) IS TRUE
        AND public.tab_write_open(ARRAY['/hiring/requests'], ARRAY['hiring.approve']) IS TRUE
      WHEN 'rooms.guest' THEN public.has_any_action(ARRAY['rooms.edit']) IS TRUE
        AND public.tab_write_open(ARRAY['/admin/rooms'], ARRAY['rooms.edit']) IS TRUE
      WHEN 'member.requests' THEN public.member_is_manager('member_requests_manage') IS TRUE
        AND public.tab_write_open(ARRAY['/member-admin'], ARRAY['member.manage']) IS TRUE
      ELSE public.has_any_action(ARRAY['it_requests.view']) IS TRUE
    END;
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    RETURN false;
  END;
  RETURN v_may;
END
$fn$;

COMMENT ON FUNCTION public.notification_topic_may(uuid, text) IS
  'HR''s topics (2026-10-24): may this account hold the topic now — its action and that page''s box, asked as them. notify_topic tells by it, notification_topics_sync keeps by it. Other functions'' helper; nobody signed in calls it.';

-- ── A topic's notice: to the holders who may hold it now ────────────────────────
-- Production's body with its one statement's holders asked first. notify_people still leaves out whoever is doing it:
-- each question has put auth.uid() back before notify_people reads it.

CREATE OR REPLACE FUNCTION public.notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.notify_people(ARRAY(SELECT t.user_id FROM public.notification_topics t WHERE t.topic = p_topic AND public.notification_topic_may(t.user_id, p_topic)), p_kind, p_title, p_body, p_ref_kind, p_ref_id);
END
$fn$;

-- ── The HR app keeps its viewer's topics by the same question ───────────────────
-- Production's body (20261024223000's) with the keep list's four checks replaced by notification_topic_may.

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
     WHERE t IN ('hiring.guest', 'rooms.guest', 'member.requests', 'people.probation')
       AND public.notification_topic_may(v_me, t)
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

-- ── A permission change forgets only the switched off ───────────────────────────

CREATE OR REPLACE FUNCTION public.notification_topics_forget()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Every topic is asked again, as its holder, whenever it tells (notification_topic_may): only an account switched
  -- off has nothing left to hold.
  DELETE FROM public.notification_topics t
   WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.user_id AND u.is_active);
  RETURN NULL;
END
$fn$;

-- ── The topics' line in the audit register says so ──────────────────────────────

UPDATE public.audit_tables
   SET reason = 'Worked out from each account''s own permissions when it opens the HR app (or IT requests), and asked again, as them, whenever a topic tells; only a switched-off account''s are forgotten.'
 WHERE table_name = 'notification_topics';

-- ── Who may call them ───────────────────────────────────────────────────────────
-- The helper runs inside other functions, as their owner: the service role alone besides.

REVOKE ALL ON FUNCTION public.notification_topic_may(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_topic_may(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.notify_topic(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_topic(text, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.notification_topics_sync(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_topics_sync(text[]) TO authenticated;

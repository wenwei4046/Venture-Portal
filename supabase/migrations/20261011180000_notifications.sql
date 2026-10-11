-- ============================================================================
-- 20261011180000_notifications.sql
-- Notifications and phone push (the user, 2026-10-11: "现在就做", "铃铛 + 手机推送";
-- plan .design/hr-r2/PLAN-H.md). Three families, the user's:
--   1. a hiring request's progress → the person who asked for it (acknowledged,
--      more information, declined, filled, cancelled);
--   2. a meeting → the people in it (booked for you, added you, changed,
--      taken off, cancelled) — never the person who did it;
--   3. HR's new work → HR (a guest-link manpower request, a guest-link booking
--      made / changed / cancelled, a member's claim / waiting list /
--      replacement sent or answered).
--
-- Written by AFTER triggers beside the event, in its transaction: a notice
-- never goes missing and never tells of a write that rolled back. A trigger
-- that fails only warns — a notice never stops the work it tells of.
--
-- "HR" is not worked out from other people's permissions here (current_actions
-- answers for the caller only): an account's TOPICS are written by the HR app
-- for whoever opens it (`notification_topics_sync`, confirmed against their
-- own actions), and every permission change forgets every topic until each
-- account opens the app again.
--
-- Phone push: the server takes what is due through `push_outbox_take` /
-- `push_outbox_done`, which ask a secret only the server holds (its sha256 is
-- the one row of push_config) — the guest page's server actions call them
-- with the publishable key, so they are granted to anon as well, and refuse
-- anybody without the secret. No service role.
--
-- Comments stay outside the function bodies (production keeps none inside).
-- ============================================================================

-- ── The tables ──────────────────────────────────────────────────────────────

CREATE TABLE public.app_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('hiring', 'rooms', 'review')),
  title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body          text NOT NULL DEFAULT '' CHECK (length(body) <= 400),
  ref_kind      text NOT NULL CHECK (ref_kind IN ('hiring_request', 'booking', 'member_request')),
  ref_id        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz,
  push_taken_at timestamptz,
  pushed_at     timestamptz
);
CREATE INDEX app_notifications_mine ON public.app_notifications (user_id, created_at DESC);
CREATE INDEX app_notifications_due ON public.app_notifications (created_at) WHERE pushed_at IS NULL;

CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
  p256dh     text NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth       text NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{16,30}$'),
  app        text NOT NULL CHECK (app IN ('revenue', 'hr')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz
);
CREATE INDEX push_subscriptions_user ON public.push_subscriptions (user_id);

CREATE TABLE public.notification_topics (
  user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  topic     text NOT NULL CHECK (topic IN ('hiring.guest', 'rooms.guest', 'member.requests')),
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic)
);

CREATE TABLE public.push_config (
  id                   boolean PRIMARY KEY DEFAULT true CHECK (id),
  outbox_secret_sha256 text NOT NULL CHECK (outbox_secret_sha256 ~ '^[0-9a-f]{64}$')
);
INSERT INTO public.push_config (outbox_secret_sha256)
VALUES ('ecf0a7e79771a6fc0099d95d48685e78a5bf580f882de0604e0fdaf89dd6b0d1')
ON CONFLICT (id) DO UPDATE SET outbox_secret_sha256 = EXCLUDED.outbox_secret_sha256;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_notifications, public.push_subscriptions, public.notification_topics, public.push_config FROM anon, authenticated;

SELECT public.audit_register('app_notifications', 'Notifications', 'Settings', '{}', 'none',
  p_reason => 'Per-person notices, written by triggers beside the events they tell of — each event is recorded on its own table.');
SELECT public.audit_register('push_subscriptions', 'Phone push subscriptions', 'Settings', '{}', 'none',
  p_reason => 'A device''s push address, its owner''s alone; it carries no business data.');
SELECT public.audit_register('notification_topics', 'Notification topics', 'Settings', '{}', 'none',
  p_reason => 'Worked out from each account''s own permissions when it opens the HR app, forgotten on any permission change.');
SELECT public.audit_register('push_config', 'Push settings', 'Settings', '{}', 'none',
  p_reason => 'One row: the hash the server''s push calls are checked against.');

-- ── Writing a notice (only the triggers call these) ─────────────────────────

-- To these people (their logins), minus whoever is doing it and anybody switched off.
CREATE OR REPLACE FUNCTION public.notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id)
  SELECT u.id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 400), p_ref_kind, p_ref_id
    FROM public.users u
   WHERE u.id IN (SELECT DISTINCT x FROM unnest(p_users) x WHERE x IS NOT NULL)
     AND u.is_active
     AND u.id IS DISTINCT FROM auth.uid();
END
$fn$;

REVOKE ALL ON FUNCTION public.notify_people(uuid[], text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_people(uuid[], text, text, text, text, text) TO service_role;

-- To everybody holding a topic.
CREATE OR REPLACE FUNCTION public.notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.notify_people(ARRAY(SELECT t.user_id FROM public.notification_topics t WHERE t.topic = p_topic), p_kind, p_title, p_body, p_ref_kind, p_ref_id);
END
$fn$;

REVOKE ALL ON FUNCTION public.notify_topic(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_topic(text, text, text, text, text, text) TO service_role;

-- ── 1. A hiring request ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_hiring_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_what text := concat_ws(' · ', nullif(btrim(NEW.answers ->> 'position'), ''), nullif(btrim(NEW.answers ->> 'dept'), ''));
  v_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'guest' THEN
      PERFORM public.notify_topic('hiring.guest', 'review',
        'New manpower request · ' || coalesce(nullif(btrim(NEW.requester_company), ''), 'Guest link'),
        concat_ws(' · ', NEW.id, nullif(v_what, ''), NEW.requester_name), 'hiring_request', NEW.id);
    END IF;
    RETURN NULL;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.requested_by IS NULL
     OR NEW.status NOT IN ('acknowledged', 'needs_info', 'declined', 'filled', 'cancelled') THEN
    RETURN NULL;
  END IF;
  SELECT s.user_id INTO v_user FROM public.hr_staff_costs s WHERE s.id = NEW.requested_by;
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public.notify_people(ARRAY[v_user], 'hiring',
    CASE NEW.status
      WHEN 'acknowledged' THEN 'HR acknowledged your request ' || NEW.id
      WHEN 'needs_info' THEN 'HR needs more information · ' || NEW.id
      WHEN 'declined' THEN 'HR declined your request ' || NEW.id
      WHEN 'filled' THEN NEW.id || ' is filled'
      ELSE NEW.id || ' was cancelled'
    END,
    CASE WHEN NEW.status = 'filled' AND cardinality(NEW.hired_names) > 0
      THEN 'Hired: ' || array_to_string(NEW.hired_names, ', ')
      ELSE v_what END,
    'hiring_request', NEW.id);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_hiring_request: %', SQLERRM;
  RETURN NULL;
END
$fn$;

CREATE TRIGGER hiring_requests_notify
AFTER INSERT OR UPDATE OF status ON public.hiring_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_hiring_request();

-- ── 2. A meeting ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_meeting_booking()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room   text;
  v_when   text;
  v_line   text;
  v_actor  text;
  v_for    uuid;
  v_before uuid;
  v_now    uuid[];
  v_was    uuid[];
  v_ref    text := NEW.id::text;
BEGIN
  SELECT r.name INTO v_room FROM public.meeting_rooms r WHERE r.id = NEW.room_id;
  v_when := to_char(NEW.day, 'Dy FMDD Mon') || ' · '
    || to_char(make_time(NEW.start_min / 60, NEW.start_min % 60, 0), 'HH24:MI') || '–'
    || to_char(make_time(NEW.end_min / 60, NEW.end_min % 60, 0), 'HH24:MI');
  v_line := concat_ws(' · ', NEW.title, v_room, v_when);

  IF NEW.source = 'guest' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.notify_topic('rooms.guest', 'review', 'New guest booking · ' || coalesce(NEW.guest_company, 'Guest link'), v_line, 'booking', v_ref);
    ELSIF NEW.cancelled_at IS NOT NULL AND OLD.cancelled_at IS NULL THEN
      PERFORM public.notify_topic('rooms.guest', 'review', 'Guest booking cancelled · ' || coalesce(NEW.guest_company, 'Guest link'), v_line, 'booking', v_ref);
    ELSIF NEW.cancelled_at IS NULL
      AND (NEW.room_id, NEW.day, NEW.start_min, NEW.end_min, NEW.title) IS DISTINCT FROM (OLD.room_id, OLD.day, OLD.start_min, OLD.end_min, OLD.title) THEN
      PERFORM public.notify_topic('rooms.guest', 'review', 'Guest booking changed · ' || coalesce(NEW.guest_company, 'Guest link'), v_line, 'booking', v_ref);
    END IF;
    RETURN NULL;
  END IF;

  SELECT s.employee_name INTO v_actor
    FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' ORDER BY s.created_at LIMIT 1;
  IF v_actor IS NULL THEN
    SELECT coalesce(nullif(btrim(u.name), ''), u.email) INTO v_actor FROM public.users u WHERE u.id = auth.uid();
  END IF;
  v_actor := coalesce(v_actor, 'Someone');
  SELECT s.user_id INTO v_for FROM public.hr_staff_costs s WHERE s.id = NEW.booked_by_staff;
  v_now := ARRAY(SELECT s.user_id FROM public.hr_staff_costs s WHERE s.id = ANY (NEW.internal_staff) AND s.user_id IS NOT NULL);

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_people(ARRAY[v_for], 'rooms', v_actor || ' booked a room for you', v_line, 'booking', v_ref);
    PERFORM public.notify_people(ARRAY(SELECT x FROM unnest(v_now) x WHERE x IS DISTINCT FROM v_for),
      'rooms', v_actor || ' added you to a meeting', v_line, 'booking', v_ref);
    RETURN NULL;
  END IF;

  IF NEW.cancelled_at IS NOT NULL THEN
    IF OLD.cancelled_at IS NULL THEN
      PERFORM public.notify_people(array_append(v_now, v_for), 'rooms', 'Meeting cancelled · ' || NEW.title,
        concat_ws(' · ', v_room, v_when, 'by ' || coalesce(NEW.cancelled_by_name, v_actor)), 'booking', v_ref);
    END IF;
    RETURN NULL;
  END IF;

  v_was := ARRAY(SELECT s.user_id FROM public.hr_staff_costs s WHERE s.id = ANY (OLD.internal_staff) AND s.user_id IS NOT NULL);
  SELECT s.user_id INTO v_before FROM public.hr_staff_costs s WHERE s.id = OLD.booked_by_staff;
  IF v_for IS DISTINCT FROM v_before THEN
    PERFORM public.notify_people(ARRAY[v_for], 'rooms', v_actor || ' booked a room for you', v_line, 'booking', v_ref);
  END IF;
  PERFORM public.notify_people(
    ARRAY(SELECT x FROM unnest(v_now) x WHERE NOT (x = ANY (v_was)) AND x IS DISTINCT FROM v_for AND x IS DISTINCT FROM v_before),
    'rooms', v_actor || ' added you to a meeting', v_line, 'booking', v_ref);
  PERFORM public.notify_people(
    ARRAY(SELECT x FROM unnest(array_append(v_was, v_before)) x
           WHERE x IS NOT NULL AND NOT (x = ANY (v_now)) AND x IS DISTINCT FROM v_for),
    'rooms', 'You were taken off a meeting', concat_ws(' · ', OLD.title, v_room), 'booking', v_ref);
  IF (NEW.room_id, NEW.day, NEW.start_min, NEW.end_min, NEW.title) IS DISTINCT FROM (OLD.room_id, OLD.day, OLD.start_min, OLD.end_min, OLD.title) THEN
    PERFORM public.notify_people(
      ARRAY(SELECT x FROM unnest(array_append(v_now, v_for)) x WHERE x = ANY (array_append(v_was, v_before))),
      'rooms', 'Meeting changed · ' || NEW.title, concat_ws(' · ', v_room, v_when), 'booking', v_ref);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_meeting_booking: %', SQLERRM;
  RETURN NULL;
END
$fn$;

CREATE TRIGGER meeting_room_bookings_notify
AFTER INSERT OR UPDATE ON public.meeting_room_bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_meeting_booking();

-- ── 3. A member's request, for HR ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_member_request()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text;
  v_kind text := CASE NEW.kind WHEN 'claim' THEN 'claim' WHEN 'waiting' THEN 'waiting list' ELSE 'replacement' END;
BEGIN
  IF NEW.status IS DISTINCT FROM 'submitted' OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'submitted') THEN
    RETURN NULL;
  END IF;
  SELECT s.employee_name INTO v_name FROM public.hr_staff_costs s WHERE s.id = NEW.staff_id;
  PERFORM public.notify_topic('member.requests', 'review',
    CASE WHEN TG_OP = 'UPDATE' AND OLD.status = 'needs_info'
      THEN initcap(v_kind) || ' answered · ' ELSE 'New ' || v_kind || ' · ' END || coalesce(v_name, 'A member'),
    NEW.title, 'member_request', NEW.id::text);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_member_request: %', SQLERRM;
  RETURN NULL;
END
$fn$;

CREATE TRIGGER member_requests_notify
AFTER INSERT OR UPDATE OF status ON public.member_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_member_request();

-- ── Topics: whoever opens the HR app, for what their own permissions hold ──

-- The app names the parts it shows them; the database keeps only those their actions hold.
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
     ORDER BY t);
  DELETE FROM public.notification_topics WHERE user_id = v_me AND NOT (topic = ANY (v_keep));
  INSERT INTO public.notification_topics (user_id, topic)
  SELECT v_me, t FROM unnest(v_keep) t
  ON CONFLICT (user_id, topic) DO UPDATE SET synced_at = now();
  RETURN v_keep;
END
$fn$;

REVOKE ALL ON FUNCTION public.notification_topics_sync(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_topics_sync(text[]) TO authenticated;

-- Any permission change: every topic goes until each account opens the HR app again.
CREATE OR REPLACE FUNCTION public.notification_topics_forget()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  DELETE FROM public.notification_topics WHERE true;
  RETURN NULL;
END
$fn$;

CREATE TRIGGER notification_topics_forget AFTER INSERT OR UPDATE OR DELETE ON public.permission_template_grants
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();
CREATE TRIGGER notification_topics_forget AFTER INSERT OR UPDATE OR DELETE ON public.permission_template_tabs
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();
CREATE TRIGGER notification_topics_forget AFTER INSERT OR UPDATE OR DELETE ON public.permission_templates
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();
CREATE TRIGGER notification_topics_forget AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_cells
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();
CREATE TRIGGER notification_topics_forget AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_tabs
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();
CREATE TRIGGER notification_topics_forget AFTER UPDATE OF template_id ON public.titles
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();
CREATE TRIGGER notification_topics_forget AFTER UPDATE OF title_id, user_id, status ON public.hr_staff_costs
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();
CREATE TRIGGER notification_topics_forget AFTER UPDATE OF role, is_active ON public.users
FOR EACH STATEMENT EXECUTE FUNCTION public.notification_topics_forget();

-- ── Reading and marking one's own ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notifications_mine(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'unread', (SELECT count(*) FROM public.app_notifications n WHERE n.user_id = v_me AND n.read_at IS NULL),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
               'refKind', n.ref_kind, 'refId', n.ref_id, 'at', n.created_at, 'read', n.read_at IS NOT NULL) ORDER BY n.created_at DESC)
        FROM (SELECT * FROM public.app_notifications x WHERE x.user_id = v_me
               ORDER BY x.created_at DESC LIMIT greatest(1, least(coalesce(p_limit, 50), 200))) n), '[]'::jsonb));
END
$fn$;

REVOKE ALL ON FUNCTION public.notifications_mine(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notifications_mine(integer) TO authenticated;

-- Read: these (or, with none named, every one of theirs).
CREATE OR REPLACE FUNCTION public.notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v_n  integer;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.app_notifications SET read_at = now()
   WHERE user_id = v_me AND read_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$fn$;

REVOKE ALL ON FUNCTION public.notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notifications_read(uuid[]) TO authenticated;

-- ── A device asking for pushes ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_app text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  IF p_app IS NULL OR p_app NOT IN ('revenue', 'hr') THEN
    RAISE EXCEPTION 'Say which app this phone is for.';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, app)
  VALUES (v_me, p_endpoint, p_p256dh, p_auth, p_app)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = v_me, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, app = EXCLUDED.app, created_at = now();
END
$fn$;

REVOKE ALL ON FUNCTION public.push_subscribe(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_subscribe(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.push_unsubscribe(p_endpoint text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid();
END
$fn$;

REVOKE ALL ON FUNCTION public.push_unsubscribe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_unsubscribe(text) TO authenticated;

-- ── The outbox: the server's, by its secret ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.push_outbox_ok(p_secret text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN p_secret IS NOT NULL
    AND encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') IS NOT DISTINCT FROM (SELECT c.outbox_secret_sha256 FROM public.push_config c WHERE c.id);
END
$fn$;

REVOKE ALL ON FUNCTION public.push_outbox_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_outbox_ok(text) TO service_role;

-- What is due: notices not pushed yet (nor taken in the last five minutes), a day old at most, with their people's devices.
CREATE OR REPLACE FUNCTION public.push_outbox_take(p_secret text, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ids uuid[];
BEGIN
  IF NOT public.push_outbox_ok(p_secret) THEN
    RAISE EXCEPTION 'Not this caller.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.app_notifications WHERE created_at < now() - interval '90 days';
  UPDATE public.app_notifications n SET pushed_at = now()
   WHERE n.pushed_at IS NULL
     AND (n.created_at < now() - interval '1 day'
          OR NOT EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = n.user_id));
  SELECT array_agg(x.id) INTO v_ids
    FROM (SELECT n.id FROM public.app_notifications n
           WHERE n.pushed_at IS NULL AND (n.push_taken_at IS NULL OR n.push_taken_at < now() - interval '5 minutes')
           ORDER BY n.created_at
           LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
           FOR UPDATE SKIP LOCKED) x;
  IF v_ids IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  UPDATE public.app_notifications SET push_taken_at = now() WHERE id = ANY (v_ids);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
             'refKind', n.ref_kind, 'refId', n.ref_id,
             'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'app', s.app))
                                 FROM public.push_subscriptions s WHERE s.user_id = n.user_id), '[]'::jsonb)) ORDER BY n.created_at)
      FROM public.app_notifications n WHERE n.id = ANY (v_ids)), '[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.push_outbox_take(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.push_outbox_take(text, integer) TO anon, authenticated;

-- What happened: these were delivered; these devices are gone.
CREATE OR REPLACE FUNCTION public.push_outbox_done(p_secret text, p_sent uuid[], p_gone text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.push_outbox_ok(p_secret) THEN
    RAISE EXCEPTION 'Not this caller.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.app_notifications SET pushed_at = now() WHERE id = ANY (coalesce(p_sent, '{}'::uuid[])) AND pushed_at IS NULL;
  DELETE FROM public.push_subscriptions WHERE endpoint = ANY (coalesce(p_gone, '{}'::text[]));
END
$fn$;

REVOKE ALL ON FUNCTION public.push_outbox_done(text, uuid[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.push_outbox_done(text, uuid[], text[]) TO anon, authenticated;

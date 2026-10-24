-- 20261025039000_marketing_chat.sql
-- 2026-10-24 — Marketing ⑦-3: the chat — the lobby's thread and direct messages (`My Space Bento.dc.html`; the user's
-- answers 35, 36, 37 and 39).
--   Who speaks (37)   Marketing's roster with a login — in the lobby and to one another. Everybody with Marketing · View
--                     reads the lobby (the Principal's shared login among them); it writes nothing.
--   Two people's (35) a direct message is its two people's alone: no manager, no Principal, no log reads it. (A
--                     full-access personal account opening one on a complaint — a reason first, a record of it — comes
--                     in its own change.)
--   For good (36)     a message is never edited and never deleted.
--   Unread (39)       a dot, nothing more: no notice, no push.
-- New: mkt_chat (a message: its thread — 'lobby', or 'dm:<staff>:<staff>' — its sender, its words and/or a task
-- attached, when), mkt_chat_reads (how far each person has read each thread). RLS on, nothing granted; neither is in
-- the audit log (a message is its own record; a DM is two people's).
-- New functions (SECURITY DEFINER; PUBLIC and anon revoked, `authenticated` granted):
--   mkt_chat_list()                      View, STABLE: the lobby's last message; each teammate's last with the caller;
--                                        what is unread
--   mkt_chat_thread(with, before)        View, STABLE: a thread, 50 messages at a time — the lobby, or the caller's with
--                                        one teammate
--   mkt_chat_send(with, body, project)   Edit: a message to the lobby or to a teammate (the roster's, with a login)
--   mkt_chat_read(with, last)            Edit: the caller has read that thread to there
-- PGlite: tests/member-sql/validate-marketing-chat.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_chat (
  id      bigserial PRIMARY KEY,
  thread  text NOT NULL CHECK (thread = 'lobby' OR thread ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  sender  uuid NOT NULL,
  body    text CHECK (body IS NULL OR length(body) BETWEEN 1 AND 1000),
  project uuid,
  at      timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR project IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS mkt_chat_thread_id ON public.mkt_chat (thread, id);
ALTER TABLE public.mkt_chat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_chat FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mkt_chat_id_seq FROM anon, authenticated;
SELECT public.audit_register('mkt_chat', 'Marketing chat', 'Marketing', '{}', 'none',
  p_reason => 'A message is its own record, written once and never changed (the user''s answer 36); a direct message is its two people''s alone (answer 35) — never copied into the audit log');

CREATE TABLE IF NOT EXISTS public.mkt_chat_reads (
  staff  uuid NOT NULL REFERENCES public.hr_staff_costs(id) ON DELETE CASCADE,
  thread text NOT NULL,
  last   bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (staff, thread)
);
ALTER TABLE public.mkt_chat_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_chat_reads FROM anon, authenticated;
SELECT public.audit_register('mkt_chat_reads', 'Marketing chat read', 'Marketing', '{}', 'none',
  p_reason => 'How far a person has read a thread — their own mark, moved as they read');

-- ── Somebody who chats: on Marketing's roster, with a login ───────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_chat_me()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.mkt_me_staff();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.mkt_roster() r WHERE r.staff_id = v_me AND r.user_id IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  RETURN v_me;
END
$fn$;

-- A thread's key: the lobby, or the two people's — the caller and a teammate by their staff id (NULL: not one).
CREATE OR REPLACE FUNCTION public.mkt_chat_key(p_me uuid, p_with text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF p_with = 'lobby' THEN
    RETURN 'lobby';
  END IF;
  IF p_me IS NULL OR p_with IS NULL OR p_with !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR p_with = p_me::text THEN
    RETURN NULL;
  END IF;
  RETURN 'dm:' || least(p_me::text, p_with) || ':' || greatest(p_me::text, p_with);
END
$fn$;

-- ── The caller's chats ───────────────────────────────────────────────────────────────
-- The lobby's last message and each teammate's last with the caller (on the roster with a login), unread when it is
-- the other's and past the caller's mark. Somebody off the roster has the lobby only.
CREATE OR REPLACE FUNCTION public.mkt_chat_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  v_me := public.mkt_chat_me();
  RETURN jsonb_build_object(
    'me', v_me,
    'lobby', (
      SELECT jsonb_build_object('last', CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
                                  'id', l.id, 'from', l.sender, 'first', l.first, 'body', l.body, 'project', l.project, 'at', l.at) END,
                                'unread', l.id IS NOT NULL AND v_me IS NOT NULL AND l.sender <> v_me
                                          AND l.id > coalesce((SELECT r.last FROM public.mkt_chat_reads r WHERE r.staff = v_me AND r.thread = 'lobby'), 0))
        FROM (SELECT 1) one
        LEFT JOIN LATERAL (
          SELECT c.id, c.sender, c.body, c.at,
                 coalesce(nullif(btrim(s.first_name), ''), split_part(btrim(s.employee_name), ' ', 1)) AS first,
                 CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'track', p.track_id, 'title', p.title) END AS project
            FROM public.mkt_chat c
            LEFT JOIN public.hr_staff_costs s ON s.id = c.sender
            LEFT JOIN public.mkt_projects p ON p.id = c.project
           WHERE c.thread = 'lobby'
           ORDER BY c.id DESC LIMIT 1) l ON true),
    'dms', CASE WHEN v_me IS NULL THEN '[]'::jsonb ELSE coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'staff', t.staff_id, 'first', t.first_name, 'title', t.title, 'avatarPath', sp.avatar_path,
               'last', CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
                         'id', l.id, 'from', l.sender, 'body', l.body, 'project', l.project, 'at', l.at) END,
               'unread', l.id IS NOT NULL AND l.sender <> v_me AND l.id > coalesce(rd.last, 0))
             ORDER BY t.first_name, t.staff_id)
        FROM public.mkt_roster() t
        LEFT JOIN public.mkt_spaces sp ON sp.user_id = t.user_id
        LEFT JOIN public.mkt_chat_reads rd
               ON rd.staff = v_me AND rd.thread = 'dm:' || least(v_me::text, t.staff_id::text) || ':' || greatest(v_me::text, t.staff_id::text)
        LEFT JOIN LATERAL (
          SELECT c.id, c.sender, c.body, c.at,
                 CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'track', p.track_id, 'title', p.title) END AS project
            FROM public.mkt_chat c
            LEFT JOIN public.mkt_projects p ON p.id = c.project
           WHERE c.thread = 'dm:' || least(v_me::text, t.staff_id::text) || ':' || greatest(v_me::text, t.staff_id::text)
           ORDER BY c.id DESC LIMIT 1) l ON true
       WHERE t.user_id IS NOT NULL AND t.staff_id <> v_me), '[]'::jsonb) END);
END
$fn$;

-- ── A thread ─────────────────────────────────────────────────────────────────────────
-- 'lobby' — anybody with View; a teammate's staff id — the caller's messages with them (only theirs to read). Fifty at a
-- time, oldest first, before `before` when given; whether older ones remain.
CREATE OR REPLACE FUNCTION public.mkt_chat_thread(p_with text, p_before bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid;
  v_key  text;
  v_msgs jsonb;
  v_min  bigint;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  v_me := public.mkt_chat_me();
  v_key := public.mkt_chat_key(v_me, p_with);
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Direct messages are between two people on Marketing''s roster.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'from', m.sender, 'first', m.first, 'body', m.body, 'project', m.project, 'at', m.at)
                            ORDER BY m.id), '[]'::jsonb),
         min(m.id)
    INTO v_msgs, v_min
    FROM (SELECT c.id, c.sender, c.body, c.at,
                 coalesce(nullif(btrim(s.first_name), ''), split_part(btrim(s.employee_name), ' ', 1)) AS first,
                 CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'track', p.track_id, 'title', p.title) END AS project
            FROM public.mkt_chat c
            LEFT JOIN public.hr_staff_costs s ON s.id = c.sender
            LEFT JOIN public.mkt_projects p ON p.id = c.project
           WHERE c.thread = v_key AND (p_before IS NULL OR c.id < p_before)
           ORDER BY c.id DESC LIMIT 50) m;
  RETURN jsonb_build_object('with', p_with, 'messages', v_msgs,
    'more', v_min IS NOT NULL AND EXISTS (SELECT 1 FROM public.mkt_chat c WHERE c.thread = v_key AND c.id < v_min));
END
$fn$;

-- ── A message ─────────────────────────────────────────────────────────────────────────
-- From somebody on the roster with a login, to the lobby or to a teammate on it with one: one line of words (1,000 at
-- most) and/or a task attached. The sender has read their thread to it. Nobody is told (answer 39).
CREATE OR REPLACE FUNCTION public.mkt_chat_send(p_with text, p_body text, p_project uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid;
  v_key  text;
  v_body text;
  v_id   bigint;
  v_out  jsonb;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Chatting is not open to your account.');
  v_me := public.mkt_chat_me();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Only Marketing''s team chats here.' USING ERRCODE = '42501';
  END IF;
  v_key := public.mkt_chat_key(v_me, p_with);
  IF v_key IS NULL OR (v_key <> 'lobby' AND NOT EXISTS (
       SELECT 1 FROM public.mkt_roster() r WHERE r.staff_id::text = p_with AND r.user_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'A message goes to the lobby or to somebody on Marketing''s roster.' USING ERRCODE = '22023';
  END IF;
  v_body := nullif(btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), '');
  IF v_body IS NULL AND p_project IS NULL THEN
    RAISE EXCEPTION 'Write something, or attach a task.' USING ERRCODE = '22023';
  END IF;
  IF length(v_body) > 1000 THEN
    RAISE EXCEPTION 'A message is at most 1,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_project IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mkt_projects p WHERE p.id = p_project) THEN
    RAISE EXCEPTION 'That task is not there.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.mkt_chat (thread, sender, body, project) VALUES (v_key, v_me, v_body, p_project) RETURNING id INTO v_id;
  INSERT INTO public.mkt_chat_reads (staff, thread, last) VALUES (v_me, v_key, v_id)
  ON CONFLICT (staff, thread) DO UPDATE SET last = greatest(public.mkt_chat_reads.last, excluded.last);
  SELECT jsonb_build_object('id', c.id, 'from', c.sender,
           'first', coalesce(nullif(btrim(s.first_name), ''), split_part(btrim(s.employee_name), ' ', 1)), 'body', c.body,
           'project', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'track', p.track_id, 'title', p.title) END,
           'at', c.at)
    INTO v_out
    FROM public.mkt_chat c
    LEFT JOIN public.hr_staff_costs s ON s.id = c.sender
    LEFT JOIN public.mkt_projects p ON p.id = c.project
   WHERE c.id = v_id;
  RETURN v_out;
END
$fn$;

-- ── Read to there ─────────────────────────────────────────────────────────────────────
-- The caller's own mark on a thread they may read: forward only, never past its last message.
CREATE OR REPLACE FUNCTION public.mkt_chat_read(p_with text, p_last bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me  uuid;
  v_key text;
  v_max bigint;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Chatting is not open to your account.');
  v_me := public.mkt_chat_me();
  v_key := public.mkt_chat_key(v_me, p_with);
  IF v_me IS NULL OR v_key IS NULL THEN
    RETURN;
  END IF;
  SELECT max(c.id) INTO v_max FROM public.mkt_chat c WHERE c.thread = v_key;
  IF v_max IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.mkt_chat_reads (staff, thread, last) VALUES (v_me, v_key, least(greatest(coalesce(p_last, 0), 0), v_max))
  ON CONFLICT (staff, thread) DO UPDATE SET last = greatest(public.mkt_chat_reads.last, excluded.last);
END
$fn$;

-- ── Who may call what ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_chat_me() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_me() TO service_role;
REVOKE ALL ON FUNCTION public.mkt_chat_key(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_key(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_chat_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_chat_thread(text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_chat_send(text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_chat_read(text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_chat_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_thread(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_send(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_read(text, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 20261025040000_marketing_chat_review.sql
-- 2026-10-24 — Marketing ⑦-3b: a direct message opened on a complaint (the user's answer 35, amended after a side
-- agent's note that the Principal's login is shared — a record of it would name nobody: "usually is ultimate full access
-- version can view").
--   Who      somebody's OWN login — the one on their active People record — whose title's template is full-access (the
--            Principal's kind, or one that ticks Manage permissions: as Invite user and a login's email call it), and who
--            manages permissions now (a person lowered on it is not). The shared Principal login is on nobody's record:
--            never — View as included, as the database asks the login, not the view.
--   How      the two people and a reason (10 to 500 characters) first; then the record of it (who opened it — their name
--            as it was — which two, why, when); then the two's messages, the newest fifty. Older ones come fifty at a time
--            under that record, to the same login, within the hour.
--   Kept     a record is never changed and never deleted; only those who may open a chat read the records.
--   Nothing else moves: nobody is told (answer 39), no read mark; the lobby needs none (everybody with View reads it).
-- New: mkt_chat_reviews — RLS on, nothing granted; registered with the audit log as 'none' (it is itself the log).
-- New functions (SECURITY DEFINER):
--   mkt_chat_reviewer()                    nobody's to call: the caller's People record when they may open a chat
--   mkt_chat_review_page(key, before)      nobody's to call: a direct chat's messages, fifty at a time
--   mkt_chat_review_open(a, b, reason)     Marketing · View and the above: the record, then the newest fifty
--   mkt_chat_review_more(review, before)   the same: fifty older, under a record of one's own from the last hour
--   mkt_chat_review_log()                  the same: the people to pick from, and every record, newest first
-- Replaced: mkt_chat_list() — production's body (md5 = 20261025039000's), one key more: 'reviewer', whether the caller
-- may open a chat (the chat tile's 🔍 Review).
-- The page /marketing/chat-review joins the database's copy of the tab registry (My Space's tab, where it is reached).
-- PGlite: tests/member-sql/validate-marketing-chat-review.mjs.

CREATE TABLE IF NOT EXISTS public.mkt_chat_reviews (
  id       bigserial PRIMARY KEY,
  by_staff uuid NOT NULL,
  by_user  uuid NOT NULL,
  by_name  text NOT NULL,
  a        uuid NOT NULL,
  a_name   text NOT NULL,
  b        uuid NOT NULL,
  b_name   text NOT NULL,
  thread   text NOT NULL CHECK (thread ~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$'),
  reason   text NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mkt_chat_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_chat_reviews FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mkt_chat_reviews_id_seq FROM anon, authenticated;
SELECT public.audit_register('mkt_chat_reviews', 'Marketing chat review', 'Marketing', '{}', 'none',
  p_reason => 'The record of a direct message opened on a complaint (the user''s answer 35) — itself the log: who opened it, which two, why, when; written once, never changed');

-- ── Who may open a chat: a full-access title's own login ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_chat_reviewer()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := public.mkt_me_staff();
BEGIN
  IF v_me IS NULL OR public.has_any_action(ARRAY['accounts.manage']) IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
       SELECT 1
         FROM public.hr_staff_costs s
         JOIN public.users u ON u.id = s.user_id AND u.is_active
         JOIN public.titles t ON t.id = s.title_id
         JOIN public.permission_templates p ON p.id = t.template_id
        WHERE s.id = v_me
          AND (p.base_role = 'principal'
               OR EXISTS (SELECT 1 FROM public.permission_template_grants g
                           WHERE g.template_id = p.id AND g.function_key = 'accounts' AND g.action = 'manage'))) THEN
    RETURN NULL;
  END IF;
  RETURN v_me;
END
$fn$;

-- ── A direct chat's messages, fifty at a time, oldest first ───────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_chat_review_page(p_key text, p_before bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_msgs jsonb;
  v_min  bigint;
BEGIN
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
           WHERE c.thread = p_key AND (p_before IS NULL OR c.id < p_before)
           ORDER BY c.id DESC LIMIT 50) m;
  RETURN jsonb_build_object('messages', v_msgs,
    'more', v_min IS NOT NULL AND EXISTS (SELECT 1 FROM public.mkt_chat c WHERE c.thread = p_key AND c.id < v_min));
END
$fn$;

-- ── Open one: the reason first, the record of it, then the messages ─────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_chat_review_open(p_a uuid, p_b uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid;
  v_lo     text;
  v_hi     text;
  v_reason text;
  v_row    public.mkt_chat_reviews;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  v_me := public.mkt_chat_reviewer();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Only a full-access title''s own login opens a direct message on a complaint.' USING ERRCODE = '42501';
  END IF;
  IF p_a IS NULL OR p_b IS NULL OR p_a = p_b
     OR (SELECT count(*) FROM public.hr_staff_costs s WHERE s.id IN (p_a, p_b)) <> 2 THEN
    RAISE EXCEPTION 'Pick the two people whose chat it is.' USING ERRCODE = '22023';
  END IF;
  IF v_me IN (p_a, p_b) THEN
    RAISE EXCEPTION 'Your own chats are on your My Space.' USING ERRCODE = '22023';
  END IF;
  v_reason := btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g'));
  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Say why you are opening it — 10 characters at least.' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'A reason is at most 500 characters.' USING ERRCODE = '22023';
  END IF;
  -- The thread's key as the chat makes it (mkt_chat_key): the two ids as text, the lesser first.
  v_lo := least(p_a::text, p_b::text);
  v_hi := greatest(p_a::text, p_b::text);
  INSERT INTO public.mkt_chat_reviews (by_staff, by_user, by_name, a, a_name, b, b_name, thread, reason)
  SELECT v_me, auth.uid(), me.employee_name, sa.id, sa.employee_name, sb.id, sb.employee_name, 'dm:' || v_lo || ':' || v_hi, v_reason
    FROM public.hr_staff_costs me, public.hr_staff_costs sa, public.hr_staff_costs sb
   WHERE me.id = v_me AND sa.id = v_lo::uuid AND sb.id = v_hi::uuid
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('review', jsonb_build_object(
           'id', v_row.id, 'at', v_row.at, 'by', v_row.by_name, 'reason', v_row.reason,
           'a', jsonb_build_object('staff', v_row.a, 'name', v_row.a_name), 'b', jsonb_build_object('staff', v_row.b, 'name', v_row.b_name)))
         || public.mkt_chat_review_page(v_row.thread, NULL);
END
$fn$;

-- ── Older messages, under a record of one's own from the last hour ──────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_chat_review_more(p_review bigint, p_before bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  IF public.mkt_chat_reviewer() IS NULL THEN
    RAISE EXCEPTION 'Only a full-access title''s own login opens a direct message on a complaint.' USING ERRCODE = '42501';
  END IF;
  SELECT r.thread INTO v_key
    FROM public.mkt_chat_reviews r
   WHERE r.id = p_review AND r.by_user = auth.uid() AND r.at > now() - interval '1 hour';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Open the chat again, with its reason — one stays open for an hour.' USING ERRCODE = '42501';
  END IF;
  RETURN public.mkt_chat_review_page(v_key, p_before);
END
$fn$;

-- ── The page: the people to pick from, and every record ──────────────────────────────────
-- The people: the roster's with a login (those who chat) and anybody in a direct chat (somebody who has left the roster
-- since) — never the caller (their own chats are on their My Space). The records: newest first, the names as they were.
CREATE OR REPLACE FUNCTION public.mkt_chat_review_log()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  v_me := public.mkt_chat_reviewer();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Only a full-access title''s own login opens a direct message on a complaint.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'people', coalesce((
      WITH dm AS (SELECT DISTINCT c.thread FROM public.mkt_chat c WHERE c.thread LIKE 'dm:%'),
           ids AS (SELECT r.staff_id AS id FROM public.mkt_roster() r WHERE r.user_id IS NOT NULL
                   UNION SELECT split_part(dm.thread, ':', 2)::uuid FROM dm
                   UNION SELECT split_part(dm.thread, ':', 3)::uuid FROM dm)
      SELECT jsonb_agg(jsonb_build_object('staff', x.id, 'name', x.employee_name, 'first', x.first, 'title', x.title) ORDER BY x.first, x.id)
        FROM (SELECT s.id, s.employee_name, t.name AS title,
                     coalesce(nullif(btrim(s.first_name), ''), split_part(btrim(s.employee_name), ' ', 1)) AS first
                FROM public.hr_staff_costs s
                LEFT JOIN public.titles t ON t.id = s.title_id
               WHERE s.id IN (SELECT ids.id FROM ids) AND s.id <> v_me) x), '[]'::jsonb),
    'reviews', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'at', r.at, 'by', r.by_name, 'reason', r.reason,
               'a', jsonb_build_object('staff', r.a, 'name', r.a_name), 'b', jsonb_build_object('staff', r.b, 'name', r.b_name))
             ORDER BY r.id DESC)
        FROM public.mkt_chat_reviews r), '[]'::jsonb));
END
$fn$;

-- ── The caller's chats — production's body (= 20261025039000's), one key more: 'reviewer' ─────────
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
    'reviewer', public.mkt_chat_reviewer() IS NOT NULL,
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

-- ── Who may call what ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.mkt_chat_reviewer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_reviewer() TO service_role;
REVOKE ALL ON FUNCTION public.mkt_chat_review_page(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_review_page(text, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.mkt_chat_review_open(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_chat_review_more(bigint, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mkt_chat_review_log() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_chat_review_open(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_review_more(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_chat_review_log() TO authenticated;

-- ── The page in the database's copy of the tab registry (My Space's tab: it is reached from the chat tile) ──
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES ('/marketing/chat-review', 'mkt.overview')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';

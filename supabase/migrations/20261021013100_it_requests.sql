-- ============================================================================
-- 20261021013100_it_requests.sql
-- IT support (2026-10-20 — the user: "i want add on a button to get submit for IT support or help"; "主要的目的呢，是在
-- 那边所有人都可以填：上面是 title，然后 details 讲具体内容，还可以加 screenshot。你可以选 category … suggest 加 feature
-- 还是 fix bug，或者是有什么建议 … upload image 或者传一个包"; "我们也可以帮做 annotation … 他也能看到自己 submit 的 case
-- status。如果我们给它 fix 了，他那边就可以收到 fix 的通知"). The permission is the migration before this one.
-- ============================================================================
--
-- Anybody signed in sends IT a request — a bug, a new feature or a suggestion: a title, the details, screenshots and
-- files — and follows it: its status, IT's notes on it, their own replies. IT requests · View reads everybody's;
-- IT requests · Edit writes notes on one and sets its status, and the person who sent it is told.
--
-- Tables (RLS on, NO policy, no client grants — every read and write is one of the functions below, as Documentation's
-- and Hiring's are):
--   it_requests        one request: IT-0001 …; category bug | feature | suggestion; title (≤ 120), details (≤ 5,000);
--                      status new | in_progress | fixed | closed; who sent it (the login, and their name and title as they
--                      were); where from (the app, the device); when its status last moved and by whom.
--   it_request_notes   its thread: IT's notes (side 'it') and the sender's replies (side 'sender'); a status change is a
--                      note too (status_from → status_to; its words optional).
--   it_request_files   screenshots and files, of the request itself or of one note.
-- The bucket `it-requests` (private; 50 MB a file; pictures, videos, PDF, Office, zip / rar / 7z, text): the BROWSER
-- uploads — a screenshot is bigger than a Server Action carries — into the uploader's own folder `<uid>/…`; the
-- functions file only an object that is there, in the caller's own folder, not filed before. A file is read (a short
-- signed link, made at the tap) by whoever sent its request or holds IT requests · View; an upload nobody filed, by its
-- uploader alone, who may also remove it. The storage policies ask two helpers granted to `authenticated` (a storage
-- policy runs as the reader — an ungranted helper refuses every upload in every bucket, mig 20261013250000).
-- Functions (SECURITY DEFINER, plpgsql; PUBLIC and anon revoked, `authenticated` granted):
--   it_request_submit(category, title, details, files, app, device)  any active sign-in; 20 a day each
--   my_it_requests()                       the caller's own, newest first (≤ 100), with notes and files
--   it_requests_desk()                     everybody's (IT requests · View), newest first (≤ 300), the same shape
--   it_request_note(id, body, files, status)  the sender on their own — a reply, never a status; or IT requests · Edit —
--                                          a note, a status, or both
--   it_request_file(file)                  the path to sign, for its reader
--   it_desk_listen()                       IT requests · View keeps the topic 'it.requests'; anybody else loses it
-- Told (app_notifications, kind 'it', ref 'it_request' — the bell and the phone): the sender, of every note IT writes and
-- every status IT sets ("IT-0004 · Fixed"); the topic 'it.requests' — kept by whoever opens IT requests (it_desk_listen)
-- — of every new request and every reply. Never the one doing it (notify_people).
-- PGlite: tests/member-sql/validate-it-requests.mjs.

-- ── The notices' kinds and the desk's topic ────────────────────────────────────
-- Widened from what each check holds now (other sessions add kinds too): nothing it allowed is dropped.

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

SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_kind_check', 'kind', ARRAY['it']);
SELECT pg_temp.widen_check('public.app_notifications', 'app_notifications_ref_kind_check', 'ref_kind', ARRAY['it_request']);
SELECT pg_temp.widen_check('public.notification_topics', 'notification_topics_topic_check', 'topic', ARRAY['it.requests']);

-- ── The tables ──────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.it_request_ref_seq;

CREATE TABLE IF NOT EXISTS public.it_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref            text NOT NULL UNIQUE,
  category       text NOT NULL CHECK (category IN ('bug', 'feature', 'suggestion')),
  title          text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  details        text NOT NULL DEFAULT '' CHECK (length(details) <= 5000),
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'fixed', 'closed')),
  sent_by        uuid NOT NULL REFERENCES public.users(id),
  sender_name    text NOT NULL,
  sender_title   text,
  app            text NOT NULL DEFAULT 'revenue' CHECK (app IN ('revenue', 'hr', 'finance', 'portal')),
  device         text CHECK (length(device) <= 300),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  status_at      timestamptz,
  status_by      uuid REFERENCES public.users(id),
  status_by_name text
);
CREATE INDEX IF NOT EXISTS it_requests_sent_by ON public.it_requests (sent_by, created_at DESC);
CREATE INDEX IF NOT EXISTS it_requests_created ON public.it_requests (created_at DESC);

CREATE TABLE IF NOT EXISTS public.it_request_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES public.it_requests(id) ON DELETE CASCADE,
  side        text NOT NULL CHECK (side IN ('it', 'sender')),
  author_id   uuid NOT NULL REFERENCES public.users(id),
  author_name text NOT NULL,
  body        text NOT NULL DEFAULT '' CHECK (length(body) <= 3000),
  status_from text,
  status_to   text CHECK (status_to IS NULL OR status_to IN ('new', 'in_progress', 'fixed', 'closed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS it_request_notes_request ON public.it_request_notes (request_id, created_at);

CREATE TABLE IF NOT EXISTS public.it_request_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.it_requests(id) ON DELETE CASCADE,
  note_id      uuid REFERENCES public.it_request_notes(id) ON DELETE CASCADE,
  path         text NOT NULL UNIQUE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  content_type text,
  size         bigint,
  uploaded_by  uuid NOT NULL REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS it_request_files_request ON public.it_request_files (request_id);

ALTER TABLE public.it_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_request_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_request_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.it_requests, public.it_request_notes, public.it_request_files FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.it_request_ref_seq FROM anon, authenticated;

SELECT public.audit_register('it_requests', 'IT requests', 'Settings', '{audit_log}', 'all',
  p_keys => '{ref}', p_labels => '{title}');
SELECT public.audit_register('it_request_notes', 'IT request notes', 'Settings', '{}', 'none',
  p_reason => 'A request''s thread — each note is written once by its function and never changed: a record already');
SELECT public.audit_register('it_request_files', 'IT request files', 'Settings', '{}', 'none',
  p_reason => 'A file is filed once with its request or note and never changed — a record already');

-- ── Helpers the functions share (nobody's to call) ──────────────────────────

-- The caller's name and title, as a request or a note keeps them: their People record's, else the login's.
CREATE OR REPLACE FUNCTION public.it_request_who(p_user uuid, OUT who_name text, OUT who_title text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  SELECT coalesce(nullif(btrim(s.employee_name), ''), nullif(btrim(u.name), ''), u.email, 'Somebody'), t.name
    INTO who_name, who_title
    FROM public.users u
    LEFT JOIN LATERAL (SELECT x.employee_name, x.title_id FROM public.hr_staff_costs x
                        WHERE x.user_id = u.id AND x.status = 'active' ORDER BY x.created_at, x.id LIMIT 1) s ON true
    LEFT JOIN public.titles t ON t.id = s.title_id
   WHERE u.id = p_user;
  who_name := coalesce(who_name, 'Somebody');
END
$fn$;

-- Files the caller uploaded, as a request (or a note) may take them: each in the caller's own folder of the bucket,
-- there, not filed before, named once. At most 10 at a time. Asked before anything is written, so a refusal takes no
-- request number.
CREATE OR REPLACE FUNCTION public.it_request_files_check(p_files jsonb)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_f    jsonb;
  v_path text;
BEGIN
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' OR jsonb_array_length(p_files) = 0 THEN
    RETURN;
  END IF;
  IF jsonb_array_length(p_files) > 10 THEN
    RAISE EXCEPTION 'Attach up to 10 files at a time.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT f.value ->> 'path') FROM jsonb_array_elements(p_files) f) < jsonb_array_length(p_files) THEN
    RAISE EXCEPTION 'The same file is there twice — remove one.' USING ERRCODE = '22023';
  END IF;
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    v_path := v_f ->> 'path';
    IF v_me IS NULL OR v_path IS NULL OR split_part(v_path, '/', 1) <> v_me::text OR strpos(v_path, '..') > 0
       OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'it-requests' AND o.name = v_path) THEN
      RAISE EXCEPTION 'A file did not finish uploading — add it again.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.it_request_files f WHERE f.path = v_path) THEN
      RAISE EXCEPTION 'That file is on a request already — add it again.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END
$fn$;

-- …filed on a request (or one of its notes). Answers how many.
CREATE OR REPLACE FUNCTION public.it_request_file_in(p_request uuid, p_note uuid, p_files jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me   uuid := auth.uid();
  v_f    jsonb;
  v_path text;
  v_size bigint;
  v_type text;
  v_n    integer := 0;
BEGIN
  PERFORM public.it_request_files_check(p_files);
  IF p_files IS NULL OR jsonb_typeof(p_files) <> 'array' THEN
    RETURN 0;
  END IF;
  FOR v_f IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    v_path := v_f ->> 'path';
    -- What the bucket says it is, before what the browser said.
    SELECT CASE WHEN (o.metadata ->> 'size') ~ '^[0-9]{1,15}$' THEN (o.metadata ->> 'size')::bigint END, nullif(o.metadata ->> 'mimetype', '')
      INTO v_size, v_type
      FROM storage.objects o WHERE o.bucket_id = 'it-requests' AND o.name = v_path;
    INSERT INTO public.it_request_files (request_id, note_id, path, name, content_type, size, uploaded_by)
    VALUES (p_request, p_note, v_path,
            left(coalesce(nullif(btrim(v_f ->> 'name'), ''), 'file'), 200),
            left(coalesce(v_type, nullif(btrim(v_f ->> 'contentType'), '')), 120),
            coalesce(v_size, CASE WHEN (v_f ->> 'size') ~ '^[0-9]{1,15}$' THEN (v_f ->> 'size')::bigint END),
            v_me);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- Requests as the app reads them, in the order given: each with its files and its thread.
CREATE OR REPLACE FUNCTION public.it_requests_json(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'ref', r.ref, 'category', r.category, 'title', r.title, 'details', r.details, 'status', r.status,
             'app', r.app, 'device', r.device, 'createdAt', r.created_at, 'updatedAt', r.updated_at,
             'statusAt', r.status_at, 'statusByName', r.status_by_name,
             'senderName', r.sender_name, 'senderTitle', r.sender_title, 'mine', r.sent_by = v_me,
             'files', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'noteId', f.note_id, 'name', f.name,
                                         'contentType', f.content_type, 'size', f.size, 'at', f.created_at) ORDER BY f.created_at, f.id)
                                  FROM public.it_request_files f WHERE f.request_id = r.id), '[]'::jsonb),
             'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'side', n.side, 'authorName', n.author_name,
                                         'body', n.body, 'statusFrom', n.status_from, 'statusTo', n.status_to, 'at', n.created_at,
                                         'mine', n.author_id = v_me) ORDER BY n.created_at, n.id)
                                  FROM public.it_request_notes n WHERE n.request_id = r.id), '[]'::jsonb))
           ORDER BY x.ord)
      FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
      JOIN public.it_requests r ON r.id = x.id
  ), '[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.it_request_who(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.it_request_files_check(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.it_request_file_in(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.it_requests_json(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.it_request_who(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.it_request_files_check(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.it_request_file_in(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.it_requests_json(uuid[]) TO service_role;

-- ── Send one ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.it_request_submit(p_category text, p_title text, p_details text, p_files jsonb, p_app text, p_device text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := auth.uid();
  v_who   record;
  v_id    uuid;
  v_ref   text;
  v_title text := btrim(coalesce(p_title, ''));
  v_n     integer;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('bug', 'feature', 'suggestion') THEN
    RAISE EXCEPTION 'Pick what it is: a bug, a new feature or a suggestion.' USING ERRCODE = '22023';
  END IF;
  IF v_title = '' THEN
    RAISE EXCEPTION 'Add a title.' USING ERRCODE = '22023';
  END IF;
  IF length(v_title) > 120 THEN
    RAISE EXCEPTION 'Keep the title to 120 characters.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_details, '')) > 5000 THEN
    RAISE EXCEPTION 'Keep the details to 5,000 characters.' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_n FROM public.it_requests r WHERE r.sent_by = v_me AND r.created_at > now() - interval '1 day';
  IF v_n >= 20 THEN
    RAISE EXCEPTION 'That is 20 requests in a day — add the rest as replies, or send them tomorrow.' USING ERRCODE = '54000';
  END IF;
  PERFORM public.it_request_files_check(p_files);
  SELECT * INTO v_who FROM public.it_request_who(v_me);
  v_ref := 'IT-' || lpad(nextval('public.it_request_ref_seq')::text, 4, '0');
  INSERT INTO public.it_requests (ref, category, title, details, sent_by, sender_name, sender_title, app, device)
  VALUES (v_ref, p_category, v_title, btrim(coalesce(p_details, '')), v_me, v_who.who_name, v_who.who_title,
          CASE WHEN p_app IN ('revenue', 'hr', 'finance', 'portal') THEN p_app ELSE 'revenue' END,
          left(nullif(btrim(coalesce(p_device, '')), ''), 300))
  RETURNING id INTO v_id;
  PERFORM public.it_request_file_in(v_id, NULL, p_files);
  BEGIN
    PERFORM public.notify_topic('it.requests', 'it',
      'New IT request · ' || CASE p_category WHEN 'bug' THEN 'Bug' WHEN 'feature' THEN 'New feature' ELSE 'Suggestion' END,
      v_ref || ' · ' || v_title || ' — ' || v_who.who_name, 'it_request', v_id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'it_request_submit: the desk was not told of % (%)', v_ref, SQLERRM;
  END;
  RETURN public.it_requests_json(ARRAY[v_id]) -> 0;
END
$fn$;

-- ── Read them ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.my_it_requests()
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
  RETURN public.it_requests_json(ARRAY(
    SELECT r.id FROM public.it_requests r WHERE r.sent_by = v_me ORDER BY r.created_at DESC, r.id LIMIT 100));
END
$fn$;

CREATE OR REPLACE FUNCTION public.it_requests_desk()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT coalesce(public.has_any_action(ARRAY['it_requests.view']), false) THEN
    RAISE EXCEPTION 'IT requests are not open to your account.' USING ERRCODE = '42501';
  END IF;
  RETURN public.it_requests_json(ARRAY(
    SELECT r.id FROM public.it_requests r ORDER BY r.created_at DESC, r.id LIMIT 300));
END
$fn$;

-- The path of one file, to sign a short link for its reader: whoever sent its request, or IT requests · View.
CREATE OR REPLACE FUNCTION public.it_request_file(p_file uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
  v    jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('path', f.path, 'name', f.name, 'contentType', f.content_type) INTO v
    FROM public.it_request_files f JOIN public.it_requests r ON r.id = f.request_id
   WHERE f.id = p_file AND (r.sent_by = v_me OR coalesce(public.has_any_action(ARRAY['it_requests.view']), false));
  IF v IS NULL THEN
    RAISE EXCEPTION 'That file is not yours to open.' USING ERRCODE = '42501';
  END IF;
  RETURN v;
END
$fn$;

-- ── Write on one: a note, a reply, a status ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.it_request_note(p_id uuid, p_body text, p_files jsonb, p_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me     uuid := auth.uid();
  v_r      public.it_requests%ROWTYPE;
  v_desk   boolean;
  v_side   text;
  v_who    record;
  v_note   uuid;
  v_status text;
  v_body   text := btrim(coalesce(p_body, ''));
  v_files  integer := CASE WHEN jsonb_typeof(p_files) = 'array' THEN jsonb_array_length(p_files) ELSE 0 END;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_r FROM public.it_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not there.' USING ERRCODE = '42501';
  END IF;
  v_desk := coalesce(public.has_any_action(ARRAY['it_requests.edit']), false);
  IF v_r.sent_by IS DISTINCT FROM v_me AND NOT v_desk THEN
    RAISE EXCEPTION 'That request is not yours.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND NOT v_desk THEN
    RAISE EXCEPTION 'Only IT sets a request''s status.' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'in_progress', 'fixed', 'closed') THEN
    RAISE EXCEPTION 'Pick a status: New, In progress, Fixed or Closed.' USING ERRCODE = '22023';
  END IF;
  v_status := CASE WHEN p_status IS DISTINCT FROM v_r.status THEN p_status END;
  IF v_body = '' AND v_status IS NULL AND v_files = 0 THEN
    RAISE EXCEPTION 'Write a note, attach a file or change the status.' USING ERRCODE = '22023';
  END IF;
  IF length(v_body) > 3000 THEN
    RAISE EXCEPTION 'Keep a note to 3,000 characters.' USING ERRCODE = '22023';
  END IF;
  -- The sender writes as the sender, even holding Edit — unless they set the status, which only IT does.
  v_side := CASE WHEN v_r.sent_by = v_me AND v_status IS NULL THEN 'sender' ELSE 'it' END;
  SELECT * INTO v_who FROM public.it_request_who(v_me);
  INSERT INTO public.it_request_notes (request_id, side, author_id, author_name, body, status_from, status_to)
  VALUES (p_id, v_side, v_me, v_who.who_name, v_body, CASE WHEN v_status IS NOT NULL THEN v_r.status END, v_status)
  RETURNING id INTO v_note;
  PERFORM public.it_request_file_in(p_id, v_note, p_files);
  UPDATE public.it_requests
     SET updated_at = now(),
         status = coalesce(v_status, status),
         status_at = CASE WHEN v_status IS NOT NULL THEN now() ELSE status_at END,
         status_by = CASE WHEN v_status IS NOT NULL THEN v_me ELSE status_by END,
         status_by_name = CASE WHEN v_status IS NOT NULL THEN v_who.who_name ELSE status_by_name END
   WHERE id = p_id;
  BEGIN
    IF v_side = 'it' THEN
      PERFORM public.notify_people(ARRAY[v_r.sent_by], 'it',
        v_r.ref || ' · ' || CASE v_status WHEN 'fixed' THEN 'Fixed' WHEN 'in_progress' THEN 'In progress' WHEN 'closed' THEN 'Closed'
                                         WHEN 'new' THEN 'Reopened' ELSE 'IT replied' END,
        v_r.title || CASE WHEN v_body <> '' THEN ' — “' || left(v_body, 200) || '”' ELSE '' END,
        'it_request', p_id::text);
    ELSE
      PERFORM public.notify_topic('it.requests', 'it', v_r.ref || ' · ' || v_who.who_name || ' replied',
        v_r.title || CASE WHEN v_body <> '' THEN ' — “' || left(v_body, 200) || '”' ELSE '' END,
        'it_request', p_id::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'it_request_note: nobody was told of the note on % (%)', v_r.ref, SQLERRM;
  END;
  RETURN public.it_requests_json(ARRAY[p_id]) -> 0;
END
$fn$;

-- ── Who hears of new requests ────────────────────────────────────────────────
-- Whoever opens IT requests holding its View keeps the topic; anybody else (a cell taken away since) loses it. Every
-- permission change already forgets every topic (mig 20261011180000) — the next open puts it back.

CREATE OR REPLACE FUNCTION public.it_desk_listen()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RETURN false;
  END IF;
  IF coalesce(public.has_any_action(ARRAY['it_requests.view']), false) THEN
    INSERT INTO public.notification_topics (user_id, topic) VALUES (v_me, 'it.requests')
    ON CONFLICT (user_id, topic) DO UPDATE SET synced_at = now();
    RETURN true;
  END IF;
  DELETE FROM public.notification_topics WHERE user_id = v_me AND topic = 'it.requests';
  RETURN false;
END
$fn$;

REVOKE ALL ON FUNCTION public.it_request_submit(text, text, text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_it_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.it_requests_desk() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.it_request_file(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.it_request_note(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.it_desk_listen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.it_request_submit(text, text, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_it_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.it_requests_desk() TO authenticated;
GRANT EXECUTE ON FUNCTION public.it_request_file(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.it_request_note(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.it_desk_listen() TO authenticated;

-- ── The bucket ──────────────────────────────────────────────────────────────
-- Its policies ask these two as the READER, so `authenticated` may call them (they answer for auth.uid() only).

CREATE OR REPLACE FUNCTION public.it_request_object_readable(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR p_name IS NULL THEN
    RETURN false;
  END IF;
  -- One's own upload, filed or not.
  IF split_part(p_name, '/', 1) = v_me::text THEN
    RETURN true;
  END IF;
  -- A file of a request one sent (IT's own on a note of it too).
  IF EXISTS (SELECT 1 FROM public.it_request_files f JOIN public.it_requests r ON r.id = f.request_id
              WHERE f.path = p_name AND r.sent_by = v_me) THEN
    RETURN true;
  END IF;
  -- IT requests · View: every filed one.
  RETURN EXISTS (SELECT 1 FROM public.it_request_files f WHERE f.path = p_name)
     AND coalesce(public.has_any_action(ARRAY['it_requests.view']), false);
END
$fn$;

CREATE OR REPLACE FUNCTION public.it_request_object_removable(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN auth.uid() IS NOT NULL AND p_name IS NOT NULL AND split_part(p_name, '/', 1) = auth.uid()::text
     AND NOT EXISTS (SELECT 1 FROM public.it_request_files f WHERE f.path = p_name);
END
$fn$;

REVOKE ALL ON FUNCTION public.it_request_object_readable(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.it_request_object_removable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.it_request_object_readable(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.it_request_object_removable(text) TO authenticated;

-- Skipped where there is no storage schema (the PGlite checks build their own).
DO $storage$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RETURN;
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('it-requests', 'it-requests', false, 50 * 1024 * 1024, ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'application/pdf', 'text/plain', 'text/csv', 'application/json',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
    'application/x-7z-compressed', 'application/octet-stream'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  EXECUTE $p$DROP POLICY IF EXISTS "it requests: in" ON storage.objects$p$;
  EXECUTE $p$CREATE POLICY "it requests: in" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'it-requests' AND (storage.foldername(objects.name))[1] = (SELECT auth.uid())::text)$p$;
  EXECUTE $p$DROP POLICY IF EXISTS "it requests: read" ON storage.objects$p$;
  EXECUTE $p$CREATE POLICY "it requests: read" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'it-requests' AND public.it_request_object_readable(objects.name))$p$;
  EXECUTE $p$DROP POLICY IF EXISTS "it requests: out" ON storage.objects$p$;
  EXECUTE $p$CREATE POLICY "it requests: out" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'it-requests' AND public.it_request_object_removable(objects.name))$p$;
END
$storage$;

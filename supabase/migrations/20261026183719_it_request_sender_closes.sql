-- ============================================================================
-- 20261026183719_it_request_sender_closes.sql
-- IT support: Closed is the sender's (2026-10-27 — the user: "我这边写已经 fix 了，所以那个 close 是不需要的。等我这边按了
-- 已经 fix，这个 close 其实应该是由提出这个 request / support 的人去操作。他那边去 try 了功能之后，就可以在自己那边
-- close，然后我这边这个 ticket 就 automatically close 了").
-- ============================================================================
--
-- it_request_note, from production's body (md5 02974b87edf7ac422c85cc5c55c34180 — mig 20261021020100's, unchanged
-- since), three statements swapped:
--   · who sets which status: IT requests · Edit sets New, In progress and Fixed; Closed only whoever sent the request,
--     and only once IT has marked it Fixed (every status was IT's before, Closed too — "Only IT sets a request's status");
--   · whose note a Close is: the sender's ('sender'), as their reply is;
--   · who is told: the desk's topic hears "IT-0007 · NAME closed it" (a reply still "… replied").
-- The same signature, grants and callers; the desk still reopens a closed one (New, In progress or Fixed again).
-- PGlite: tests/member-sql/validate-it-requests.mjs.

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
  -- Closed is the sender's (2026-10-27): once IT has marked it Fixed, whoever sent it tries it and closes it. IT sets
  -- New, In progress and Fixed.
  IF p_status = 'closed' THEN
    IF v_r.sent_by IS DISTINCT FROM v_me THEN
      RAISE EXCEPTION 'Its sender closes it, once it is fixed.' USING ERRCODE = '42501';
    END IF;
    IF v_r.status NOT IN ('fixed', 'closed') THEN
      RAISE EXCEPTION 'It can be closed once IT has marked it Fixed.' USING ERRCODE = '22023';
    END IF;
  ELSIF p_status IS NOT NULL AND NOT v_desk THEN
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
  -- The sender writes as the sender, even holding Edit, and closes as the sender — any other status is IT's.
  v_side := CASE WHEN v_r.sent_by = v_me AND (v_status IS NULL OR v_status = 'closed') THEN 'sender' ELSE 'it' END;
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
      PERFORM public.notify_topic('it.requests', 'it',
        v_r.ref || ' · ' || v_who.who_name || CASE WHEN v_status = 'closed' THEN ' closed it' ELSE ' replied' END,
        v_r.title || CASE WHEN v_body <> '' THEN ' — “' || left(v_body, 200) || '”' ELSE '' END,
        'it_request', p_id::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'it_request_note: nobody was told of the note on % (%)', v_r.ref, SQLERRM;
  END;
  RETURN public.it_requests_json(ARRAY[p_id]) -> 0;
END
$fn$;

REVOKE ALL ON FUNCTION public.it_request_note(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.it_request_note(uuid, text, jsonb, text) TO authenticated;

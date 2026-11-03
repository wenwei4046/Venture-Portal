-- Lead View v2 › Reply templates and the Step library (2026-11-02, the v2 handoff `docs/design_handoff_lead_view_v2`
-- §7.6–7.7 — the user: "完全跟claude design 画的"; point 4: a Step library save updates every template that uses it).
--
-- 1. A step may carry a photo or file (the handoff's *Attach photo or file*): `step.file` = {path, name, mime, size} in
--    the template's steps, the object in the R2 bucket `lead-media` under chat/tpl/ (the Inbox's own bucket, so the
--    chat shows it as it shows CS's files). The runner records it as its own message just BEFORE the step's words —
--    a question's quick replies must ride on the last message (Messenger shows them only there): `lead_flow_say_file`,
--    put in front of the step's say in lead_flow_send and lead_flow_also (PRODUCTION's bodies, md5 checked, one
--    statement each). The outbox hands the file's path and type (lead_outbox, PRODUCTION's body, one key list swapped)
--    and the app sends it as CS's files go (deliverFile).
-- 2. A Step library save updates every template that uses the step (`lead_library_push`, called from
--    lead_save_library_item — PRODUCTION's body, its last RETURN swapped): the library's type, name, message, file,
--    options' words and their extras (keep-in, retry, pick-more) replace the template's copy; the template keeps its
--    own way on — where it goes, where each option goes and what it also sends, its closing message, its place on the
--    map — and its copy is marked the new version. Deleting from the library changes no template.

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_flow_send(uuid,public.lead_flows,text)'::regprocedure) <> '35120029381043ad3520aaeab83e45ec' THEN
    RAISE EXCEPTION 'lead_flow_send is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_flow_also(uuid,public.lead_flows,jsonb)'::regprocedure) <> '372865466dfcca837b8f0bfeb7d19296' THEN
    RAISE EXCEPTION 'lead_flow_also is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_outbox(uuid[])'::regprocedure) <> '2313898ccd6174412078db73754855e3' THEN
    RAISE EXCEPTION 'lead_outbox is not the body this migration was written from';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_save_library_item(uuid,jsonb)'::regprocedure) <> 'f7ed4ccd027b1d47957b599931e32560' THEN
    RAISE EXCEPTION 'lead_save_library_item is not the body this migration was written from';
  END IF;
END
$guard$;

-- A message's file may also be a template's (chat/tpl/<uuid>/<name>); a conversation's stays chat/<conversation>/<name>.
ALTER TABLE public.lead_messages DROP CONSTRAINT lead_messages_media_path_check;
ALTER TABLE public.lead_messages ADD CONSTRAINT lead_messages_media_path_check
  CHECK (media_path IS NULL OR media_path ~ '^chat/(tpl/)?[0-9a-f-]{36}/[^/]{1,200}$');

-- A step's photo or file, recorded as the template's message (before its words). Nothing when it has none, or when
-- the object is not in the bucket's folder for templates.
CREATE OR REPLACE FUNCTION public.lead_flow_say_file(p_contact uuid, p_name text, p_step jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path text := p_step->'file'->>'path';
  v_mime text := left(coalesce(p_step->'file'->>'mime', ''), 120);
  v_name text := left(btrim(coalesce(p_step->'file'->>'name', '')), 120);
  v_body text;
BEGIN
  IF v_path IS NULL OR v_path !~ '^chat/tpl/[0-9a-f-]{36}/[^/]+$'
     OR NOT EXISTS (SELECT 1 FROM public.file_objects WHERE bucket_id = 'lead-media' AND name = v_path) THEN
    RETURN;
  END IF;
  v_body := CASE WHEN v_mime LIKE 'image/%' THEN '[Photo]' WHEN v_mime LIKE 'video/%' THEN '[Video]'
                 ELSE '[File] ' || coalesce(NULLIF(v_name, ''), regexp_replace(v_path, '^.*/', '')) END;
  INSERT INTO public.lead_messages (contact_id, direction, sender, by_name, body, media_path, media_mime)
  VALUES (p_contact, 'out', 'flow', p_name, v_body, v_path, NULLIF(v_mime, ''));
  UPDATE public.lead_contacts SET last_at = now(), last_dir = 'out', last_text = v_body, updated_at = now() WHERE id = p_contact;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_flow_say_file(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_flow_say_file(uuid, text, jsonb) TO service_role;

-- One statement swapped in PRODUCTION's body, refused unless the old text is there exactly once.
CREATE OR REPLACE FUNCTION pg_temp.swap(p_sig text, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql
AS $s$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = v_oid);
  v_def text := pg_get_functiondef(v_oid);
BEGIN
  IF (length(v_src) - length(replace(v_src, p_old, ''))) / length(p_old) <> 1 THEN
    RAISE EXCEPTION '% — the text to swap is not there exactly once', p_sig;
  END IF;
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, replace(v_src, p_old, p_new));
END
$s$;

SELECT pg_temp.swap('public.lead_flow_send(uuid,public.lead_flows,text)',
  'PERFORM public.lead_flow_say(p_contact, p_flow.name, s->>''text'',',
  'PERFORM public.lead_flow_say_file(p_contact, p_flow.name, s);
    PERFORM public.lead_flow_say(p_contact, p_flow.name, s->>''text'',');
SELECT pg_temp.swap('public.lead_flow_also(uuid,public.lead_flows,jsonb)',
  'PERFORM public.lead_flow_say(p_contact, p_flow.name, s->>''text'', NULL);',
  'PERFORM public.lead_flow_say_file(p_contact, p_flow.name, s);
    PERFORM public.lead_flow_say(p_contact, p_flow.name, s->>''text'', NULL);');
SELECT pg_temp.swap('public.lead_outbox(uuid[])',
  '''body'', m.body, ''buttons'', m.buttons,',
  '''body'', m.body, ''buttons'', m.buttons, ''mediaPath'', m.media_path, ''mediaMime'', m.media_mime,');

-- Every template that uses this library step takes its new version (the template's own way on kept).
CREATE OR REPLACE FUNCTION public.lead_library_push(p_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  l public.lead_step_library;
  v_src jsonb;
  f record;
  v_steps jsonb;
  v_n integer := 0;
BEGIN
  SELECT * INTO l FROM public.lead_step_library WHERE id = p_id AND deleted_at IS NULL AND kind = 'step';
  IF NOT FOUND OR jsonb_array_length(l.steps) <> 1 THEN
    RETURN 0;
  END IF;
  v_src := l.steps->0;
  FOR f IN SELECT id, steps FROM public.lead_flows
            WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(steps) s WHERE s->'lib'->>'id' = p_id::text) FOR UPDATE LOOP
    SELECT jsonb_agg(CASE WHEN s->'lib'->>'id' = p_id::text THEN
             -- The library's words and extras over the template's copy …
             (s - 'kind' - 'name' - 'text' - 'file' - 'saveAs' - 'retryText' - 'retryMax' - 'multi' - 'doneLabel' - 'againText' - 'buttons')
             || jsonb_strip_nulls(jsonb_build_object('kind', v_src->'kind', 'name', v_src->'name', 'text', v_src->'text', 'file', v_src->'file',
                  'saveAs', v_src->'saveAs', 'retryText', v_src->'retryText', 'retryMax', v_src->'retryMax', 'multi', v_src->'multi',
                  'doneLabel', v_src->'doneLabel', 'againText', v_src->'againText'))
             -- … each option's words from the library, where it goes and what it also sends from the template's, by place …
             || CASE WHEN v_src ? 'buttons' THEN jsonb_build_object('buttons', coalesce((
                  SELECT jsonb_agg((b.v - 'next' - 'also' - 'endMsg')
                           || jsonb_build_object('next', coalesce(s->'buttons'->(b.n::int - 1)->'next', '""'::jsonb))
                           || jsonb_strip_nulls(jsonb_build_object('also', s->'buttons'->(b.n::int - 1)->'also', 'endMsg', s->'buttons'->(b.n::int - 1)->'endMsg'))
                           ORDER BY b.n)
                    FROM jsonb_array_elements(v_src->'buttons') WITH ORDINALITY b(v, n)), '[]'::jsonb)) ELSE '{}'::jsonb END
             -- … and marked as the library's new version.
             || jsonb_build_object('lib', jsonb_build_object('id', p_id::text, 'ver', l.ver))
           ELSE s END ORDER BY o)
      INTO v_steps
      FROM jsonb_array_elements(f.steps) WITH ORDINALITY x(s, o);
    UPDATE public.lead_flows SET steps = v_steps, updated_at = now() WHERE id = f.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_library_push(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_library_push(uuid) TO service_role;

SELECT pg_temp.swap('public.lead_save_library_item(uuid,jsonb)',
  '    RAISE EXCEPTION ''That item is gone.'' USING ERRCODE = ''P0002'';
  END IF;
  RETURN p_id;',
  '    RAISE EXCEPTION ''That item is gone.'' USING ERRCODE = ''P0002'';
  END IF;
  PERFORM public.lead_library_push(p_id);
  RETURN p_id;');

NOTIFY pgrst, 'reload schema';

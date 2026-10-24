-- 20261025113000_marketing_stage_files.sql
-- 2026-10-24 — Marketing ②b-2e: a stage's own files uploaded (`Task Page.dc.html`'s *Drop the final cut here* — "Uploaded by
-- Ali · 25 Oct"). The user, after ②b-2c's deliveries took uploads: a stage's File fields too, links kept (2026-10-24).
--   The bucket  stage/ is Marketing · Edit's to send to (policy mkt_stage_upload), read as the rest of the bucket (View).
--   The work    mkt_stage_save — production's body — takes the stage's files as it takes its links, the whole list when
--               sent: a File field's (field: its label) or the stage's own Files (none); one already the stage's keeps its
--               record, a new one is the caller's own arrived row and never another stage's; twenty at most; who sent it
--               and when (the handoff's "Uploaded by Ali · 25 Oct"); one taken off loses its bytes' row.
--   Needs       mkt_stage_missing — production's body: a File field is filled by a link or a file of its own; a stage of
--               no fields by a note, a link or a file (the page's missingWork says the same).
--   Filed       mkt_lib_unfiled — production's body: a stage's file is filed, its sender cannot take it back from under it.
--   The PIC     mkt_pic_page — production's body — lists the stage now's files the PIC sees (the stage's own Files; a File
--               field's when the PIC sees the field — mkt_pic_sees_file, the fields' own rule), each by its key; the
--               route /t/<code>/f/<key> asks mkt_pic_file (anon's by name, the code deciding) and the bucket asks the
--               code again (policy mkt_pic_stage_files_read, mkt_pic_may_read — the share link's way, ⑥-3).
-- PGlite: tests/member-sql/validate-marketing-stage-files.mjs.

-- ── A stage's files: sent under stage/ by Marketing · Edit, filed with the stage's work by its owner ──────────
DROP POLICY IF EXISTS mkt_stage_upload ON public.file_objects;
CREATE POLICY mkt_stage_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing' AND (storage.foldername(name))[1] = 'stage'
              AND (SELECT public.has_any_action(ARRAY['marketing.edit'])));

-- ── Whether a PIC sees a stage's file: its stage's own Files (no field), or a File field the PIC sees — the section
-- not hidden from them, the field not either (mkt_pic_page's own rule for the fields). ─────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_sees_file(p_spec jsonb, p_field text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
BEGIN
  IF nullif(btrim(coalesce(p_field, '')), '') IS NULL THEN
    RETURN true;
  END IF;
  RETURN p_spec -> 'sec' ->> 'pic' IS DISTINCT FROM 'false'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_spec -> 'form') = 'array' THEN p_spec -> 'form' ELSE '[]'::jsonb END) f
                  WHERE f ->> 'label' = p_field AND f ->> 'type' = 'File' AND coalesce(f ->> 'pic', 'true') <> 'false');
END
$fn$;

-- ── A file of the work a PIC's link shows (mkt_pic_page): a deliverable's stage now, of the product project whose link
-- the code is — its key the uuid in its path. Only the other DEFINER functions ask it. ──────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_stage_file(p_code text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := lower(btrim(coalesce(p_code, '')));
  v_p    public.mkt_projects;
  v_out  jsonb;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' OR coalesce(p_key, '') !~ '^[0-9a-f-]{36}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND kind = 'product' AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT x.f INTO v_out
    FROM public.mkt_projects d
    JOIN public.mkt_stages s ON s.project_id = d.id AND s.idx = d.cur
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.work -> 'files') = 'array' THEN s.work -> 'files' ELSE '[]'::jsonb END) AS x(f)
   WHERE d.parent_id = v_p.id AND d.status NOT IN ('planning', 'cancelled')
     AND split_part(x.f ->> 'path', '/', 2) = p_key
     AND public.mkt_pic_sees_file(s.spec, x.f ->> 'field')
   LIMIT 1;
  RETURN v_out;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_pic_stage_file(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_pic_stage_file(text, text) TO service_role;

-- ── /t/<code>/f/<key>: where the file is — anon's by name, as the PIC's page; the code decides. ────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_file(p_code text, p_key uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_f jsonb := public.mkt_pic_stage_file(p_code, p_key::text);
BEGIN
  RETURN CASE WHEN v_f IS NULL THEN NULL
              ELSE jsonb_build_object('path', v_f ->> 'path', 'name', v_f ->> 'name', 'mime', v_f ->> 'mime') END;
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_pic_file(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_pic_file(text, uuid) TO anon, authenticated;

-- ── The bucket asks the link's code again (its x-link-code header) before R2 is asked for a link ──────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_may_read(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := lower(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-link-code', '')));
BEGIN
  IF coalesce(p_name, '') !~ '^stage/[0-9a-f-]{36}/[^/]+$' THEN
    RETURN false;
  END IF;
  RETURN coalesce((public.mkt_pic_stage_file(v_code, split_part(p_name, '/', 2)) ->> 'path') = p_name, false);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_pic_may_read(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_pic_may_read(text) TO anon;

DROP POLICY IF EXISTS mkt_pic_stage_files_read ON public.file_objects;
CREATE POLICY mkt_pic_stage_files_read ON public.file_objects FOR SELECT TO anon
  USING ((bucket_id = 'marketing'::text) AND public.mkt_pic_may_read(name));

-- ── A stage's work saved — production's body, its files as its links ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_stage_save(p_project uuid, p_work jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := public.mkt_me_staff();
  v_p     public.mkt_projects;
  v_s     public.mkt_stages;
  v_notes text;
  v_links jsonb := '[]'::jsonb;
  v_vals  jsonb;
  v_ok    text[];
  v_l     jsonb;
  v_k     text;
  v_v     jsonb;
  v_old   jsonb;
  v_files jsonb := '[]'::jsonb;
  v_forms text[];
  v_path  text;
  v_field text;
  v_name  text;
  v_was   jsonb;
  v_o     public.file_objects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.edit'], 'Working on a stage is not open to your account.');
  v_p := public.mkt_open_project(p_project);
  SELECT * INTO v_s FROM public.mkt_stages WHERE project_id = v_p.id AND idx = v_p.cur FOR UPDATE;
  IF v_me IS NULL OR v_s.owner_staff IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'This stage is not yours.' USING ERRCODE = '42501';
  END IF;
  IF v_s.status NOT IN ('accepted', 'changes') THEN
    RAISE EXCEPTION 'Accept the stage first — or it is with its approver now.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_work) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Nothing to save.' USING ERRCODE = '22023';
  END IF;
  v_notes := CASE WHEN p_work ? 'notes' THEN coalesce(p_work ->> 'notes', '') ELSE coalesce(v_s.work ->> 'notes', '') END;
  IF length(v_notes) > 4000 THEN
    RAISE EXCEPTION 'Notes: at most 4,000 characters.' USING ERRCODE = '22023';
  END IF;
  IF p_work ? 'links' THEN
    IF jsonb_typeof(p_work -> 'links') IS DISTINCT FROM 'array' OR jsonb_array_length(p_work -> 'links') > 20 THEN
      RAISE EXCEPTION 'At most 20 links.' USING ERRCODE = '22023';
    END IF;
    FOR v_l IN SELECT x FROM jsonb_array_elements(p_work -> 'links') x LOOP
      IF coalesce(v_l ->> 'url', '') !~* '^https?://[^\s]+$' OR length(v_l ->> 'url') > 500 THEN
        RAISE EXCEPTION 'A link starts with https:// (at most 500 characters).' USING ERRCODE = '22023';
      END IF;
      v_links := v_links || jsonb_build_array(jsonb_build_object('url', v_l ->> 'url',
                   'label', left(btrim(coalesce(v_l ->> 'label', '')), 80)));
    END LOOP;
  ELSE
    v_links := CASE WHEN jsonb_typeof(v_s.work -> 'links') = 'array' THEN v_s.work -> 'links' ELSE '[]'::jsonb END;
  END IF;
  -- Its files (②b-2e): sent under stage/ first — a File field's (field: its label) or the stage's own Files (none).
  -- The whole list when sent, as the links: one already the stage's keeps its record; a new one is the caller's own
  -- arrived row, never another stage's; one taken off loses its bytes' row (R2's hourly sweep takes the bytes).
  v_old := CASE WHEN jsonb_typeof(v_s.work -> 'files') = 'array' THEN v_s.work -> 'files' ELSE '[]'::jsonb END;
  IF p_work ? 'files' THEN
    IF jsonb_typeof(p_work -> 'files') IS DISTINCT FROM 'array' OR jsonb_array_length(p_work -> 'files') > 20 THEN
      RAISE EXCEPTION 'At most 20 files.' USING ERRCODE = '22023';
    END IF;
    v_forms := ARRAY(SELECT f ->> 'label' FROM jsonb_array_elements(
                       CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) f
                      WHERE f ->> 'type' = 'File');
    FOR v_l IN SELECT x FROM jsonb_array_elements(p_work -> 'files') x LOOP
      v_path := CASE WHEN jsonb_typeof(v_l) = 'object' THEN btrim(coalesce(v_l ->> 'path', '')) ELSE '' END;
      CONTINUE WHEN v_path = '' OR v_files @> jsonb_build_array(jsonb_build_object('path', v_path));
      v_field := nullif(btrim(coalesce(v_l ->> 'field', '')), '');
      IF v_field IS NOT NULL AND NOT (v_field = ANY (v_forms)) THEN
        RAISE EXCEPTION 'That file is for a field this stage does not have.' USING ERRCODE = '22023';
      END IF;
      v_name := left(btrim(regexp_replace(coalesce(v_l ->> 'name', ''), '\s+', ' ', 'g')), 200);
      SELECT x INTO v_was FROM jsonb_array_elements(v_old) x WHERE x ->> 'path' = v_path LIMIT 1;
      IF v_was IS NOT NULL THEN
        v_files := v_files || jsonb_build_array(v_was || jsonb_build_object('field', v_field,
                     'name', coalesce(nullif(v_name, ''), v_was ->> 'name')));
        CONTINUE;
      END IF;
      SELECT * INTO v_o FROM public.file_objects o
       WHERE o.bucket_id = 'marketing' AND o.name = v_path AND o.owner_id = auth.uid()::text;
      IF NOT FOUND OR v_path !~ '^stage/[0-9a-f-]{36}/[^/]+$' THEN
        RAISE EXCEPTION 'That file has not arrived — upload it again.' USING ERRCODE = 'P0002';
      END IF;
      IF EXISTS (SELECT 1 FROM public.mkt_stages x
                  WHERE NOT (x.project_id = v_p.id AND x.idx = v_s.idx) AND x.work -> 'files' @> jsonb_build_array(jsonb_build_object('path', v_path))) THEN
        RAISE EXCEPTION 'That file is another stage''s.' USING ERRCODE = '23505';
      END IF;
      v_files := v_files || jsonb_build_array(jsonb_build_object('path', v_path,
                   'name', coalesce(nullif(v_name, ''), regexp_replace(v_path, '^.*/', '')),
                   'size', coalesce((v_o.metadata ->> 'size')::bigint, 0), 'mime', coalesce(v_o.metadata ->> 'mimetype', ''),
                   'field', v_field, 'by', public.mkt_actor(), 'at', now()));
    END LOOP;
    DELETE FROM public.file_objects o
     WHERE o.bucket_id = 'marketing'
       AND o.name IN (SELECT x ->> 'path' FROM jsonb_array_elements(v_old) x)
       AND NOT v_files @> jsonb_build_array(jsonb_build_object('path', o.name));
  ELSE
    v_files := v_old;
  END IF;
  -- Only the stage's own fields, each a text or a tick, merged over what was there.
  v_vals := CASE WHEN jsonb_typeof(v_s.work -> 'vals') = 'object' THEN v_s.work -> 'vals' ELSE '{}'::jsonb END;
  v_ok := ARRAY(SELECT f ->> 'label' FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(v_s.spec -> 'form') = 'array' THEN v_s.spec -> 'form' ELSE '[]'::jsonb END) f
                 WHERE f ->> 'type' NOT IN ('Note', 'Table'));
  IF jsonb_typeof(p_work -> 'vals') = 'object' THEN
    FOR v_k, v_v IN SELECT * FROM jsonb_each(p_work -> 'vals') LOOP
      CONTINUE WHEN NOT (v_k = ANY (v_ok));
      IF jsonb_typeof(v_v) = 'null' THEN
        v_vals := v_vals - v_k;
      ELSIF jsonb_typeof(v_v) = 'boolean' THEN
        v_vals := v_vals || jsonb_build_object(v_k, v_v);
      ELSIF jsonb_typeof(v_v) IN ('string', 'number') THEN
        IF length(v_v #>> '{}') > 2000 THEN
          RAISE EXCEPTION '"%": at most 2,000 characters.', v_k USING ERRCODE = '22023';
        END IF;
        v_vals := v_vals || jsonb_build_object(v_k, v_v #>> '{}');
      END IF;
    END LOOP;
  END IF;
  UPDATE public.mkt_stages SET work = jsonb_build_object('notes', v_notes, 'links', v_links, 'vals', v_vals, 'files', v_files)
   WHERE project_id = v_p.id AND idx = v_s.idx;
  UPDATE public.mkt_projects SET updated_at = now() WHERE id = v_p.id;
  RETURN jsonb_build_object('id', v_p.id, 'missing', to_jsonb(public.mkt_stage_missing(v_s.spec,
           jsonb_build_object('notes', v_notes, 'links', v_links, 'vals', v_vals, 'files', v_files))));
END
$fn$;

-- ── What a stage still needs — production's body, a file counted ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_stage_missing(p_spec jsonb, p_work jsonb)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_form   jsonb := CASE WHEN jsonb_typeof(p_spec -> 'form') = 'array' THEN p_spec -> 'form' ELSE '[]'::jsonb END;
  v_vals   jsonb := CASE WHEN jsonb_typeof(p_work -> 'vals') = 'object' THEN p_work -> 'vals' ELSE '{}'::jsonb END;
  v_links  jsonb := CASE WHEN jsonb_typeof(p_work -> 'links') = 'array' THEN p_work -> 'links' ELSE '[]'::jsonb END;
  v_files  jsonb := CASE WHEN jsonb_typeof(p_work -> 'files') = 'array' THEN p_work -> 'files' ELSE '[]'::jsonb END;
  v_out    text[] := '{}';
  v_inputs integer := 0;
  f        jsonb;
  v        jsonb;
BEGIN
  FOR f IN SELECT x FROM jsonb_array_elements(v_form) x LOOP
    CONTINUE WHEN f ->> 'type' IN ('Note', 'Table');
    v_inputs := v_inputs + 1;
    -- A field its template marks not required is never asked for (②b-2a: a template's fields carry req).
    CONTINUE WHEN f -> 'req' = 'false'::jsonb;
    v := v_vals -> (f ->> 'label');
    -- A File field: a file of its own does (②b-2e).
    CONTINUE WHEN f ->> 'type' = 'File' AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_files) x WHERE x ->> 'field' = f ->> 'label');
    IF v IS NULL OR jsonb_typeof(v) = 'null' OR v = 'false'::jsonb
       OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '') THEN
      v_out := v_out || (f ->> 'label');
    END IF;
  END LOOP;
  IF v_inputs = 0 AND btrim(coalesce(p_work ->> 'notes', '')) = '' AND jsonb_array_length(v_links) = 0 AND jsonb_array_length(v_files) = 0 THEN
    v_out := v_out || 'a note, a file or a link'::text;
  END IF;
  RETURN v_out;
END
$fn$;

-- ── A file nothing names — production's body, a stage's files counted ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_lib_unfiled(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN NOT EXISTS (SELECT 1 FROM public.mkt_lib_files f WHERE f.path = p_name)
     AND NOT EXISTS (SELECT 1 FROM public.mkt_subsidiaries s
                      WHERE s.profile ->> 'avatar_path' = p_name OR s.profile ->> 'banner_path' = p_name)
     AND NOT EXISTS (SELECT 1 FROM public.mkt_spaces sp
                      WHERE p_name IN (sp.cover_path, sp.avatar_path, sp.photo_path, sp.pet_path))
     AND NOT EXISTS (SELECT 1 FROM public.mkt_subtasks t
                      WHERE t.delivery -> 'files' @> jsonb_build_array(jsonb_build_object('path', p_name)))
     AND NOT EXISTS (SELECT 1 FROM public.mkt_stages s
                      WHERE s.work -> 'files' @> jsonb_build_array(jsonb_build_object('path', p_name)));
END
$fn$;

-- ── The PIC's page — production's body, the stage now's files the PIC sees ────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_pic_page(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code  text := lower(btrim(coalesce(p_code, '')));
  v_p     public.mkt_projects;
  v_m     public.mkt_minutes;
  v_mv    public.mkt_minutes_versions;
  v_f     jsonb;
  v_v     jsonb;
  v_val   jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_last  public.mkt_events;
  v_you   integer;
BEGIN
  IF v_code !~ '^[0-9a-f]{32}$' THEN
    RETURN NULL;
  END IF;
  -- Either PIC's own link (2026-10-24 — the user's answer 29); the second's only while they are on the project.
  SELECT * INTO v_p FROM public.mkt_projects
   WHERE (link_code = v_code OR (link2_code = v_code AND nullif(btrim(coalesce(pic2_name, '')), '') IS NOT NULL))
     AND kind = 'product' AND status NOT IN ('minutes', 'cancelled');
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_you := CASE WHEN v_p.link_code = v_code THEN 1 ELSE 2 END;
  SELECT * INTO v_m FROM public.mkt_minutes WHERE project_id = v_p.id AND intake;
  SELECT * INTO v_mv FROM public.mkt_minutes_versions WHERE template_id = v_m.template_id AND version = v_m.template_version;

  -- The fields the PIC sees, as written — people by their first names, a table's columns with its rows.
  FOR v_f IN SELECT f FROM jsonb_array_elements(coalesce(v_mv.fields, '[]'::jsonb)) f LOOP
    CONTINUE WHEN NOT coalesce((v_f -> 'pic') = 'true'::jsonb, false) OR v_f ->> 'type' = 'Project link';
    v_v := v_m.vals -> (v_f ->> 'name');
    v_val := CASE v_f ->> 'type'
      WHEN 'People' THEN coalesce((SELECT jsonb_agg(public.mkt_staff_name(x::uuid))
                                     FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_v) = 'array' THEN v_v ELSE '[]'::jsonb END) x
                                    WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '[]'::jsonb)
      WHEN 'Signature' THEN coalesce((SELECT jsonb_agg(public.mkt_staff_name(k::uuid))
                                        FROM jsonb_object_keys(v_m.signed) k
                                       WHERE k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'), '[]'::jsonb)
      WHEN 'Table' THEN jsonb_build_object(
        'cols', coalesce((SELECT jsonb_agg(c ->> 'name') FROM jsonb_array_elements(coalesce(v_f -> 'cols', '[]'::jsonb)) c), '[]'::jsonb),
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows' ELSE '[]'::jsonb END)
      WHEN 'Free space' THEN jsonb_build_object(
        'cols', CASE WHEN jsonb_typeof(v_v -> 'cols') = 'array' THEN v_v -> 'cols' ELSE '[]'::jsonb END,
        'rows', CASE WHEN jsonb_typeof(v_v -> 'rows') = 'array' THEN v_v -> 'rows' ELSE '[]'::jsonb END)
      ELSE CASE WHEN jsonb_typeof(v_v) = 'string' THEN v_v ELSE NULL END
    END;
    v_out := v_out || jsonb_build_array(jsonb_build_object('name', v_f ->> 'name', 'type', v_f ->> 'type', 'value', v_val));
  END LOOP;

  -- Why it waits again: changed after they approved, or resent after the changes they asked for.
  SELECT * INTO v_last FROM public.mkt_events
   WHERE project_id = v_p.id AND action IN ('link sent', 'resent', 'edited after approval')
   ORDER BY id DESC LIMIT 1;

  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'sub', (SELECT x.name FROM public.mkt_subsidiaries x WHERE x.id = v_p.subsidiary_id),
    'product', (SELECT pv.name FROM public.mkt_product_versions pv
                 WHERE pv.product_id = v_p.product_id AND pv.version = v_p.product_version),
    'title', v_p.title, 'track', v_p.track_id, 'status', v_p.status,
    -- Which PIC holds this link, their name, and the other PIC's (names only).
    'you', v_you, 'pic', CASE v_you WHEN 2 THEN v_p.pic2_name ELSE v_p.pic_name END,
    'other', CASE v_you WHEN 2 THEN v_p.pic_name ELSE nullif(btrim(coalesce(v_p.pic2_name, '')), '') END,
    'owner', public.mkt_staff_name(v_p.owner_staff),
    'startedAt', v_p.created_at, 'sentAt', v_p.link_sent_at,
    'reply', v_p.pic_reply,
    -- Both PICs sign off the minutes (②b-2d-2b): whose approvals this sending has.
    'both', coalesce((v_mv.rules -> 'picAll') = 'true'::jsonb, false) AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,
    'ok', CASE WHEN v_p.pic_ok ->> 'sent' = (extract(epoch FROM v_p.link_sent_at))::text THEN v_p.pic_ok - 'sent' END,
    'updated', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'edited after approval'
                    THEN jsonb_build_object('fields', v_last.reason, 'at', v_last.at,
                           -- Whose approval the edit took back (②b-2d-2b): this PIC's — or only the other's, named. An
                           -- edit from before there were two took back the one PIC's.
                           'mine', jsonb_typeof(v_last.data -> 'took') IS DISTINCT FROM 'array'
                                   OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_last.data -> 'took') t WHERE t ->> 'pic' = v_you::text),
                           'by', CASE WHEN jsonb_typeof(v_last.data -> 'took') = 'array'
                                      THEN (SELECT t ->> 'name' FROM jsonb_array_elements(v_last.data -> 'took') t
                                             WHERE t ->> 'pic' IS DISTINCT FROM v_you::text LIMIT 1) END) END,
    'asked', CASE WHEN v_p.status = 'waiting_pic' AND v_last.action = 'resent' AND v_p.pic_reply ->> 'decision' = 'changes'
                  THEN jsonb_build_object('reason', v_p.pic_reply ->> 'reason', 'at', v_p.pic_reply ->> 'at') END,
    'minutes', jsonb_build_object('title', v_m.title, 'fields', v_out),
    -- The work (②b-2d): each deliverable planned — where it stands — and the stage waiting for the PIC, with what they
    -- may see of it: its fields marked for the PIC (never a note, never one its section hides from them), its links;
    -- never the team's own notes. Their last answer on each.
    'work', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'title', d.title, 'status', d.status, 'startsOn', d.starts_on, 'dueOn', d.due_on,
               'stages', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id),
               'done', (SELECT count(*) FROM public.mkt_stages s WHERE s.project_id = d.id AND s.status = 'done'),
               'stage', (SELECT jsonb_build_object(
                           'idx', s.idx, 'name', s.name, 'status', s.status, 'dueOn', s.due_on, 'ver', s.ver,
                           -- Waiting for THIS PIC: a level asking both waits no longer for the one who approved — while
                           -- it still has two to ask (the other taken off, it waits for the one left again, never stuck).
                           'waiting', s.status = 'review' AND s.appr -> s.appr_idx ->> 'kind' = 'pic'
                                      AND NOT (coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                               AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL
                                               AND coalesce(s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                                            AND s.pic_ok ? v_you::text, false)),
                           'both', s.appr -> s.appr_idx ->> 'kind' = 'pic' AND coalesce(s.appr -> s.appr_idx ->> 'all' = 'true', false)
                                   AND nullif(btrim(coalesce(v_p.pic2_name, '')), '') IS NOT NULL,
                           'ok', CASE WHEN s.pic_ok ->> 'ver' = s.ver::text AND s.pic_ok ->> 'lvl' = s.appr_idx::text
                                      THEN s.pic_ok - 'ver' - 'lvl' END,
                           'note', nullif(btrim(coalesce(s.spec ->> 'picText', '')), ''),
                           'fields', CASE WHEN s.spec -> 'sec' ->> 'pic' = 'false' THEN '[]'::jsonb ELSE coalesce((
                              SELECT jsonb_agg(jsonb_build_object('name', f ->> 'label', 'type', f ->> 'type',
                                       'value', CASE WHEN f ->> 'type' = 'Person' AND coalesce(s.work -> 'vals' ->> (f ->> 'label'), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                                     THEN to_jsonb(public.mkt_staff_name((s.work -> 'vals' ->> (f ->> 'label'))::uuid))
                                                     ELSE s.work -> 'vals' -> (f ->> 'label') END) ORDER BY x.o)
                                FROM jsonb_array_elements(coalesce(s.spec -> 'form', '[]'::jsonb)) WITH ORDINALITY AS x(f, o)
                               WHERE coalesce(f ->> 'pic', 'true') <> 'false' AND f ->> 'type' <> 'Note'), '[]'::jsonb) END,
                           'links', CASE WHEN jsonb_typeof(s.work -> 'links') = 'array' THEN s.work -> 'links' ELSE '[]'::jsonb END,
                           -- Its files (②b-2e): the stage's own Files, and a File field's when the PIC sees the field; each
                           -- opened through /t/<code>/f/<key> (mkt_pic_file), never by its path.
                           'files', coalesce((
                              SELECT jsonb_agg(jsonb_build_object('key', split_part(x.f ->> 'path', '/', 2), 'name', x.f ->> 'name',
                                       'size', x.f -> 'size', 'mime', x.f ->> 'mime', 'field', x.f ->> 'field') ORDER BY x.o)
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.work -> 'files') = 'array' THEN s.work -> 'files' ELSE '[]'::jsonb END)
                                     WITH ORDINALITY AS x(f, o)
                               WHERE public.mkt_pic_sees_file(s.spec, x.f ->> 'field')), '[]'::jsonb))
                           FROM public.mkt_stages s WHERE s.project_id = d.id AND s.idx = d.cur),
               'last', (SELECT jsonb_build_object('action', e.action, 'name', e.actor_name, 'reason', e.reason,
                                                  'stage', e.stage_name, 'version', e.version, 'at', e.at,
                                                  'pic', CASE WHEN e.data ->> 'pic' IN ('1', '2') THEN (e.data ->> 'pic')::integer END)
                          FROM public.mkt_events e
                         WHERE e.project_id = d.id AND e.action IN ('pic approved', 'pic changes')
                         ORDER BY e.id DESC LIMIT 1))
             ORDER BY d.track_id)
        FROM public.mkt_projects d
       WHERE d.parent_id = v_p.id AND d.status NOT IN ('planning', 'cancelled')), '[]'::jsonb));
END
$fn$;

NOTIFY pgrst, 'reload schema';

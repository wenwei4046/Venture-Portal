-- ============================================================================
-- 20261011160000_hiring_files.sql
-- Hiring (2026-10-11, the user's answers after round 2): several files per
-- candidate and per Talent Bank person, each with a FILE TYPE — and a file
-- removed is really deleted.
-- ============================================================================
--
-- The user (2026-10-11): the Talent Bank keeps people until HR removes them —
-- it is never emptied by itself — and "they can upload different files as
-- well, then name the file type"; a request's candidates take several files
-- too, and a candidate kept in the Talent Bank brings them all. A file taken
-- off a record is deleted from the bucket (the round-2 security review's L7,
-- PDPA).
--
--   hiring_file_types  Résumé (built in), IC, Certificate, and whatever HR
--                      names with "+ Add a new file type…" (Hiring · Edit).
--   hiring_files       one row per file on a candidate OR a talent: its type,
--                      the object's path in `hiring-files`, the name it came
--                      with. Two rows may name ONE object — a candidate kept in
--                      the Talent Bank, a talent invited to a request — so an
--                      object goes only once no row names it.
--
-- The résumé columns (`resume_path`, `resume_name` on hiring_candidates and
-- hiring_talents) become Résumé rows here and are dropped. Every function that
-- read them is replaced below from PRODUCTION's body (md5(prosrc) checked
-- 2026-10-11: equal to the repo's 080000 / 080100 copies), its résumé
-- statements swapped for the files. Old calls keep working while this runs
-- ahead of the code: the changed signatures only ADD defaulted arguments, the
-- board still answers `resumeName`, `hiring_file_path('candidate' | 'talent')`
-- still finds the résumé. `hiring_file_of` (closed since 080100, nothing calls
-- it) read the dropped columns and goes.
--
-- Storage: a new file goes to `files/<uuid>/<name>`, written by the uploader's
-- own browser under `hiring_files_write` (Create or Edit; the folder joins
-- resumes/ and attachments/ — guest/ stays the guest link's own policy); a
-- function files it only once the object is really in the bucket. NEW,
-- `hiring_files_delete`: Hiring · Edit may delete an object NO ROW NAMES
-- (`hiring_file_in_use`) — the app deletes after the row has gone, and never a
-- file still on somebody's record. `hiring_orphan_files()` lists what no row
-- names and went in over a day ago (a guest's upload never sent, a window
-- closed before Save, a delete that failed half-way): HR's own file writes
-- clear up to 50 of them each time, under their own session. No service role.

-- ── 1. Tables ───────────────────────────────────────────────────────────────

CREATE TABLE public.hiring_file_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  builtin text UNIQUE CHECK (builtin IN ('resume')),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);
CREATE UNIQUE INDEX hiring_file_types_name_key ON public.hiring_file_types (lower(btrim(name)));
ALTER TABLE public.hiring_file_types ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_file_types IS
  'What a hiring file is: Résumé (builtin = resume), IC, Certificate … — HR adds more with "+ Add a new file type…". Read through hiring_board(), added by hiring_file_type_add().';

CREATE TABLE public.hiring_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES public.hiring_candidates(id) ON DELETE CASCADE,
  talent_id uuid REFERENCES public.hiring_talents(id) ON DELETE CASCADE,
  type_id uuid NOT NULL REFERENCES public.hiring_file_types(id),
  path text NOT NULL CHECK (path ~ '^(files|resumes)/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,160}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  added_by_name text NOT NULL,
  added_by uuid REFERENCES public.users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(candidate_id, talent_id) = 1)
);
CREATE INDEX hiring_files_candidate_idx ON public.hiring_files (candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX hiring_files_talent_idx ON public.hiring_files (talent_id) WHERE talent_id IS NOT NULL;
CREATE INDEX hiring_files_path_idx ON public.hiring_files (path);
ALTER TABLE public.hiring_files ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.hiring_files IS
  'The files on a hiring candidate or a Talent Bank person (exactly one), each with its type. Two rows may name one object in hiring-files (a candidate kept in the bank, a talent invited); the object is deleted when no row names it.';

REVOKE ALL ON public.hiring_file_types, public.hiring_files FROM PUBLIC, anon, authenticated;

SELECT public.audit_register('hiring_file_types', 'Hiring file types', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name}');
SELECT public.audit_register('hiring_files', 'Hiring files', 'People', '{hiring}', 'all',
  p_keys => '{id}', p_labels => '{name}');

INSERT INTO public.hiring_file_types (name, builtin, sort) VALUES
  ('Résumé', 'resume', 1), ('IC', NULL, 2), ('Certificate', NULL, 3)
ON CONFLICT DO NOTHING;

-- Today's one résumé per candidate / talent becomes a Résumé row (none on
-- production on 2026-10-11 — written for every database this runs on).
INSERT INTO public.hiring_files (candidate_id, type_id, path, name, added_by_name, added_by, added_at)
SELECT c.id, (SELECT t.id FROM public.hiring_file_types t WHERE t.builtin = 'resume'), c.resume_path,
       coalesce(nullif(btrim(c.resume_name), ''), regexp_replace(c.resume_path, '^.*/', '')), 'HR', c.created_by, c.created_at
  FROM public.hiring_candidates c
 WHERE c.resume_path ~ '^(files|resumes)/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,160}$';
INSERT INTO public.hiring_files (talent_id, type_id, path, name, added_by_name, added_by, added_at)
SELECT t.id, (SELECT ft.id FROM public.hiring_file_types ft WHERE ft.builtin = 'resume'), t.resume_path,
       coalesce(nullif(btrim(t.resume_name), ''), regexp_replace(t.resume_path, '^.*/', '')), t.saved_by_name, t.saved_by, t.saved_at
  FROM public.hiring_talents t
 WHERE t.resume_path ~ '^(files|resumes)/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,160}$';

-- ── 2. Helpers ──────────────────────────────────────────────────────────────

-- Does any record still name this object? (The delete policy's question; the
-- app asks it only through the policy.)
CREATE OR REPLACE FUNCTION public.hiring_file_in_use(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.path = p_path)
      OR EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = p_path);
END
$fn$;

-- Of these objects, the ones no record names any more.
CREATE OR REPLACE FUNCTION public.hiring_orphaned(p_paths text[])
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN ARRAY(SELECT DISTINCT p FROM unnest(coalesce(p_paths, '{}')) p
                WHERE p IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.path = p)
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = p)
                ORDER BY p);
END
$fn$;

-- A file the browser put in the bucket, before it is filed: where a new file
-- goes, really there, and on nobody's record yet.
CREATE OR REPLACE FUNCTION public.hiring_take_upload(p_path text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_path IS NULL OR p_path !~ '^(files|resumes)/[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,160}$'
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hiring-files' AND o.name = p_path) THEN
    RAISE EXCEPTION 'That file did not arrive. Please upload it again.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.path = p_path) THEN
    RAISE EXCEPTION 'That file is already on a record.' USING ERRCODE = '22023';
  END IF;
END
$fn$;

-- Files a candidate's (or a talent's) new files: [{path, name, type}]. With
-- p_log each is a step of the request's trail / the talent's history.
CREATE OR REPLACE FUNCTION public.hiring_attach(p_candidate uuid, p_talent uuid, p_files jsonb, p_log boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_file jsonb;
  v_type public.hiring_file_types;
  v_path text;
  v_name text;
  v_n integer := 0;
  v_actor text := public.hiring_actor_name();
  v_request text;
  v_who text;
BEGIN
  IF p_files IS NULL OR jsonb_typeof(p_files) = 'null' THEN RETURN 0; END IF;
  IF jsonb_typeof(p_files) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'The files are not in the right shape' USING ERRCODE = '22023';
  END IF;
  IF num_nonnulls(p_candidate, p_talent) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'A file belongs to one candidate or one talent' USING ERRCODE = '22023';
  END IF;
  IF p_candidate IS NOT NULL THEN
    SELECT c.request_id, c.name INTO v_request, v_who FROM public.hiring_candidates c WHERE c.id = p_candidate;
  END IF;
  FOR v_file IN SELECT value FROM jsonb_array_elements(p_files) LOOP
    v_path := btrim(coalesce(v_file ->> 'path', ''));
    v_name := btrim(coalesce(v_file ->> 'name', ''));
    SELECT * INTO v_type FROM public.hiring_file_types t WHERE t.id::text = (v_file ->> 'type');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick what kind of file it is.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.hiring_take_upload(v_path);
    IF length(v_name) NOT BETWEEN 1 AND 160 THEN v_name := regexp_replace(v_path, '^.*/', ''); END IF;
    INSERT INTO public.hiring_files (candidate_id, talent_id, type_id, path, name, added_by_name, added_by)
    VALUES (p_candidate, p_talent, v_type.id, v_path, v_name, v_actor, auth.uid());
    v_n := v_n + 1;
    IF p_log THEN
      IF p_candidate IS NOT NULL THEN
        PERFORM public.hiring_log(v_request, 'File added', NULL, v_who || ' · ' || v_type.name || ' · ' || v_name);
      ELSE
        PERFORM public.hiring_talent_log(p_talent, 'File added', v_type.name || ' · ' || v_name);
      END IF;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.hiring_files f
       WHERE (p_candidate IS NOT NULL AND f.candidate_id = p_candidate) OR (p_talent IS NOT NULL AND f.talent_id = p_talent)) > 20 THEN
    RAISE EXCEPTION 'Up to 20 files each.' USING ERRCODE = '22023';
  END IF;
  RETURN v_n;
END
$fn$;

-- ── 3. Files: add, replace, remove, a type, a download, the leftovers ───────

-- "+ Add file": a candidate's or a talent's new files. Create or Edit (adding
-- is what Create does; taking off is Edit's).
CREATE OR REPLACE FUNCTION public.hiring_files_add(p_kind text, p_owner uuid, p_files jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.create', 'hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create or Edit is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(coalesce(p_files, 'null'::jsonb)) IS DISTINCT FROM 'array' OR jsonb_array_length(p_files) = 0 THEN
    RAISE EXCEPTION 'Choose a file.' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'candidate' THEN
    PERFORM 1 FROM public.hiring_candidates WHERE id = p_owner FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
    RETURN public.hiring_attach(p_owner, NULL, p_files, true);
  ELSIF p_kind = 'talent' THEN
    PERFORM 1 FROM public.hiring_talents WHERE id = p_owner AND removed_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That talent is not in the bank any more' USING ERRCODE = '22023'; END IF;
    RETURN public.hiring_attach(NULL, p_owner, p_files, true);
  END IF;
  RAISE EXCEPTION 'Unknown file' USING ERRCODE = '22023';
END
$fn$;

-- Replace: a new upload in a file's place (its type kept). Answers the
-- objects no record names any more — the app deletes them.
CREATE OR REPLACE FUNCTION public.hiring_file_replace(p_file uuid, p_path text, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_f public.hiring_files;
  v_type public.hiring_file_types;
  v_name text := btrim(coalesce(p_name, ''));
  v_what text;
  v_request text;
  v_who text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_f FROM public.hiring_files WHERE id = p_file FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That file is not there any more' USING ERRCODE = '22023'; END IF;
  PERFORM public.hiring_take_upload(p_path);
  IF length(v_name) NOT BETWEEN 1 AND 160 THEN v_name := regexp_replace(p_path, '^.*/', ''); END IF;
  UPDATE public.hiring_files SET path = p_path, name = v_name, added_by_name = public.hiring_actor_name(),
    added_by = auth.uid(), added_at = now()
   WHERE id = p_file;
  SELECT * INTO v_type FROM public.hiring_file_types WHERE id = v_f.type_id;
  v_what := CASE WHEN v_type.builtin = 'resume' THEN 'Résumé replaced' ELSE 'File replaced' END;
  IF v_f.candidate_id IS NOT NULL THEN
    SELECT c.request_id, c.name INTO v_request, v_who FROM public.hiring_candidates c WHERE c.id = v_f.candidate_id;
    PERFORM public.hiring_log(v_request, v_what, NULL, v_who || ' · ' || v_type.name || ' · ' || v_name);
  ELSE
    PERFORM public.hiring_talent_log(v_f.talent_id, v_what, v_type.name || ' · ' || v_name);
  END IF;
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(ARRAY[v_f.path])));
END
$fn$;

-- Remove: the file off its record; answers the object if nobody else's
-- record names it — the app deletes it.
CREATE OR REPLACE FUNCTION public.hiring_file_remove(p_file uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_f public.hiring_files;
  v_type text;
  v_request text;
  v_who text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.hiring_files WHERE id = p_file RETURNING * INTO v_f;
  IF NOT FOUND THEN RAISE EXCEPTION 'That file is not there any more' USING ERRCODE = '22023'; END IF;
  SELECT t.name INTO v_type FROM public.hiring_file_types t WHERE t.id = v_f.type_id;
  IF v_f.candidate_id IS NOT NULL THEN
    SELECT c.request_id, c.name INTO v_request, v_who FROM public.hiring_candidates c WHERE c.id = v_f.candidate_id;
    PERFORM public.hiring_log(v_request, 'File removed', NULL, v_who || ' · ' || v_type || ' · ' || v_f.name);
  ELSE
    PERFORM public.hiring_talent_log(v_f.talent_id, 'File removed', v_type || ' · ' || v_f.name);
  END IF;
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(ARRAY[v_f.path])));
END
$fn$;

-- "+ Add a new file type…": the type of that name (made if new). Edit.
CREATE OR REPLACE FUNCTION public.hiring_file_type_add(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Name the file type.' USING ERRCODE = '22023';
  END IF;
  SELECT t.id INTO v_id FROM public.hiring_file_types t WHERE lower(btrim(t.name)) = lower(v_name);
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  BEGIN
    INSERT INTO public.hiring_file_types (name, sort, created_by)
    VALUES (v_name, coalesce((SELECT max(t.sort) FROM public.hiring_file_types t), 0) + 1, auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT t.id INTO v_id FROM public.hiring_file_types t WHERE lower(btrim(t.name)) = lower(v_name);
  END;
  RETURN v_id;
END
$fn$;

-- A candidate's file downloaded is a step of the request's trail (a résumé
-- says so as before); a talent's is not.
CREATE OR REPLACE FUNCTION public.hiring_file_downloaded(p_file uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_request text;
  v_who text;
  v_type text;
  v_builtin text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  SELECT c.request_id, c.name, t.name, t.builtin INTO v_request, v_who, v_type, v_builtin
    FROM public.hiring_files f
    JOIN public.hiring_candidates c ON c.id = f.candidate_id
    JOIN public.hiring_file_types t ON t.id = f.type_id
   WHERE f.id = p_file;
  IF v_request IS NULL THEN RETURN; END IF;
  IF v_builtin = 'resume' THEN
    PERFORM public.hiring_log(v_request, 'Résumé downloaded', NULL, v_who);
  ELSE
    PERFORM public.hiring_log(v_request, 'File downloaded', NULL, v_who || ' · ' || v_type);
  END IF;
END
$fn$;

-- The leftovers: objects in hiring-files no record names, put there over a
-- day ago (a guest's upload never sent, a window closed before Save, a delete
-- that failed half-way). HR's own file writes clear them (Edit). Reads only.
CREATE OR REPLACE FUNCTION public.hiring_orphan_files(p_limit integer DEFAULT 50)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  RETURN ARRAY(SELECT o.name FROM storage.objects o
                WHERE o.bucket_id = 'hiring-files'
                  AND o.created_at < now() - interval '1 day'
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.path = o.name)
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = o.name)
                ORDER BY o.created_at, o.name
                LIMIT greatest(1, least(coalesce(p_limit, 50), 200)));
END
$fn$;

-- ── 4. The functions that read the résumé columns (production's bodies) ─────

-- hiring_board(): each candidate and talent answers its `files` (Résumé first,
-- then by type, then as added) and still `resumeName` (the newest résumé);
-- the board answers `fileTypes`. Otherwise production's body.
CREATE OR REPLACE FUNCTION public.hiring_board()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'fields', public.hiring_current_form(),
    'sources', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'active', s.active,
        'used', (SELECT count(*) FROM public.hiring_requests r WHERE lower(r.hired_through) = lower(s.name)))
        ORDER BY s.sort, s.created_at), '[]'::jsonb) FROM public.hiring_sources s),
    'candidateFields', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'type', f.kind,
        'options', f.options) ORDER BY f.sort, f.id), '[]'::jsonb) FROM public.hiring_candidate_fields f),
    'fileTypes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'builtin', t.builtin)
        ORDER BY t.sort, t.name), '[]'::jsonb) FROM public.hiring_file_types t),
    'people', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name,
        'title', coalesce(t.name, s.designation, ''), 'department', coalesce(public.hiring_department_label(d.name), ''))
        ORDER BY d.name NULLS LAST, s.employee_name), '[]'::jsonb)
        FROM public.hr_staff_costs s
        LEFT JOIN public.departments d ON d.id = s.department_id
        LEFT JOIN public.titles t ON t.id = s.title_id
       WHERE s.status = 'active'),
    'requests', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'source', r.source, 'requestedBy', r.requested_by,
        'requesterName', r.requester_name, 'requesterDepartment', r.requester_department,
        'requesterCompany', r.requester_company, 'requesterPhone', r.requester_phone,
        'fields', r.fields, 'answers', r.answers, 'ownerId', r.owner_id, 'assistedBy', r.assisted_by,
        'hiredNames', to_jsonb(r.hired_names), 'hiredThrough', r.hired_through, 'hiringCost', r.hiring_cost,
        'attachmentName', r.attachment_name, 'submittedAt', r.submitted_at, 'acknowledgedAt', r.acknowledged_at,
        'filledAt', r.filled_at, 'closedAt', r.closed_at,
        'candidates', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
            'source', c.source, 'stage', c.stage,
            'talentId', CASE WHEN EXISTS (SELECT 1 FROM public.hiring_talents t WHERE t.id = c.talent_id AND t.removed_at IS NULL) THEN c.talent_id END,
            'answers', c.answers, 'note', c.note,
            'resumeName', (SELECT hf.name FROM public.hiring_files hf JOIN public.hiring_file_types ft ON ft.id = hf.type_id
                WHERE hf.candidate_id = c.id AND ft.builtin = 'resume' ORDER BY hf.added_at DESC, hf.id DESC LIMIT 1),
            'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', hf.id, 'typeId', hf.type_id, 'type', ft.name, 'resume', ft.builtin IS NOT DISTINCT FROM 'resume',
                'name', hf.name, 'addedAt', hf.added_at, 'addedBy', hf.added_by_name)
                ORDER BY ft.builtin IS NULL, ft.sort, hf.added_at, hf.id), '[]'::jsonb)
                FROM public.hiring_files hf JOIN public.hiring_file_types ft ON ft.id = hf.type_id WHERE hf.candidate_id = c.id)
            ) ORDER BY c.created_at, c.id), '[]'::jsonb)
            FROM public.hiring_candidates c WHERE c.request_id = r.id),
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'who', e.actor_name, 'note', e.note, 'at', e.at)
            ORDER BY e.at, e.id), '[]'::jsonb) FROM public.hiring_request_events e WHERE e.request_id = r.id)
        ) ORDER BY r.submitted_at DESC, r.id DESC), '[]'::jsonb) FROM public.hiring_requests r),
    'talents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'no', t.no, 'name', t.name, 'phone', t.phone, 'email', t.email, 'position', t.position,
        'department', t.department, 'fromRequest', t.from_request, 'notes', t.notes,
        'resumeName', (SELECT hf.name FROM public.hiring_files hf JOIN public.hiring_file_types ft ON ft.id = hf.type_id
            WHERE hf.talent_id = t.id AND ft.builtin = 'resume' ORDER BY hf.added_at DESC, hf.id DESC LIMIT 1),
        'files', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', hf.id, 'typeId', hf.type_id, 'type', ft.name, 'resume', ft.builtin IS NOT DISTINCT FROM 'resume',
            'name', hf.name, 'addedAt', hf.added_at, 'addedBy', hf.added_by_name)
            ORDER BY ft.builtin IS NULL, ft.sort, hf.added_at, hf.id), '[]'::jsonb)
            FROM public.hiring_files hf JOIN public.hiring_file_types ft ON ft.id = hf.type_id WHERE hf.talent_id = t.id),
        'savedBy', t.saved_by_name, 'savedAt', t.saved_at,
        'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'who', e.actor_name, 'note', e.note, 'at', e.at)
            ORDER BY e.at, e.id), '[]'::jsonb) FROM public.hiring_talent_events e WHERE e.talent_id = t.id)
        ) ORDER BY t.saved_at DESC, t.no DESC), '[]'::jsonb) FROM public.hiring_talents t WHERE t.removed_at IS NULL),
    'me', jsonb_build_object(
        'staffId', (SELECT s.id FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' LIMIT 1),
        'name', public.hiring_actor_name())
  );
END
$fn$;

-- Where a file is: a candidate's or a talent's newest résumé (as before), any
-- one file of theirs ('file', by its id), or a request's attachment.
CREATE OR REPLACE FUNCTION public.hiring_file_path(p_kind text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path text;
  v_name text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'candidate' THEN
    SELECT f.path, f.name INTO v_path, v_name FROM public.hiring_files f JOIN public.hiring_file_types t ON t.id = f.type_id
     WHERE f.candidate_id::text = p_id AND t.builtin = 'resume' ORDER BY f.added_at DESC, f.id DESC LIMIT 1;
  ELSIF p_kind = 'talent' THEN
    SELECT f.path, f.name INTO v_path, v_name FROM public.hiring_files f JOIN public.hiring_file_types t ON t.id = f.type_id
      JOIN public.hiring_talents ta ON ta.id = f.talent_id
     WHERE f.talent_id::text = p_id AND ta.removed_at IS NULL AND t.builtin = 'resume' ORDER BY f.added_at DESC, f.id DESC LIMIT 1;
  ELSIF p_kind = 'file' THEN
    SELECT f.path, f.name INTO v_path, v_name FROM public.hiring_files f
      LEFT JOIN public.hiring_talents ta ON ta.id = f.talent_id
     WHERE f.id::text = p_id AND (f.talent_id IS NULL OR ta.removed_at IS NULL);
  ELSIF p_kind = 'attachment' THEN
    SELECT r.attachment_path, r.attachment_name INTO v_path, v_name FROM public.hiring_requests r WHERE r.id = p_id;
  ELSE
    RAISE EXCEPTION 'Unknown file' USING ERRCODE = '22023';
  END IF;
  IF v_path IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('path', v_path, 'name', coalesce(v_name, 'file'));
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_resume_downloaded(p_candidate uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_request text;
  v_name text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  SELECT c.request_id, c.name INTO v_request, v_name FROM public.hiring_candidates c
   WHERE c.id = p_candidate
     AND EXISTS (SELECT 1 FROM public.hiring_files f JOIN public.hiring_file_types t ON t.id = f.type_id
                  WHERE f.candidate_id = c.id AND t.builtin = 'resume');
  IF v_request IS NULL THEN RETURN; END IF;
  PERFORM public.hiring_log(v_request, 'Résumé downloaded', NULL, v_name);
END
$fn$;

-- Add candidate: production's body; its résumé (if given) and its files
-- (p_files, new) are filed on it.
DROP FUNCTION public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text);
CREATE FUNCTION public.hiring_candidate_add(p_request text, p_name text, p_phone text, p_stage text,
  p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL, p_files jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Add the candidate’s name' USING ERRCODE = '22023'; END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_lock(p_request, ARRAY['submitted', 'needs_info', 'acknowledged', 'filled', 'cancelled'], 'A declined request takes no candidates');
  INSERT INTO public.hiring_candidates (request_id, name, phone, source, stage, answers, note, created_by)
  VALUES (p_request, v_name, btrim(coalesce(p_phone, '')), 'Applied', coalesce(p_stage, 'shortlisted'),
    public.hiring_clean_candidate_answers(p_answers), btrim(coalesce(p_note, '')), auth.uid())
  RETURNING id INTO v_id;
  IF p_resume_path IS NOT NULL THEN
    PERFORM public.hiring_attach(v_id, NULL, jsonb_build_array(jsonb_build_object('path', p_resume_path, 'name', p_resume_name,
      'type', (SELECT t.id FROM public.hiring_file_types t WHERE t.builtin = 'resume'))), false);
  END IF;
  PERFORM public.hiring_attach(v_id, NULL, p_files, false);
  PERFORM public.hiring_log(p_request, 'Candidate added', NULL, v_name || ' · ' || public.hiring_stage_label(coalesce(p_stage, 'shortlisted')));
  RETURN v_id;
END
$fn$;

-- Edit details: production's body. A résumé given replaces their résumé (the
-- old call); p_files are filed on them and p_remove taken off (new). Answers
-- the objects no record names any more — the app deletes them.
DROP FUNCTION public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text);
CREATE FUNCTION public.hiring_candidate_edit(p_candidate uuid, p_name text, p_phone text, p_stage text,
  p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL,
  p_files jsonb DEFAULT NULL, p_remove uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_old public.hiring_candidates;
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_gone text[] := '{}';
  v_f record;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old FROM public.hiring_candidates WHERE id = p_candidate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Name can’t be empty' USING ERRCODE = '22023'; END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_candidates SET name = v_name, phone = btrim(coalesce(p_phone, '')),
    stage = coalesce(p_stage, stage), note = v_note, answers = public.hiring_clean_candidate_answers(p_answers),
    updated_at = now()
   WHERE id = p_candidate;
  PERFORM public.hiring_log(v_old.request_id, 'Candidate edited', NULL,
    v_name || CASE WHEN v_note <> '' AND v_note IS DISTINCT FROM v_old.note THEN ' · note: ' || v_note ELSE '' END);
  IF p_stage IS NOT NULL AND p_stage IS DISTINCT FROM v_old.stage THEN
    PERFORM public.hiring_log(v_old.request_id, 'Candidate status', NULL, v_name || ' → ' || public.hiring_stage_label(p_stage));
  END IF;
  IF p_resume_path IS NOT NULL THEN
    WITH gone AS (
      DELETE FROM public.hiring_files f USING public.hiring_file_types t
       WHERE f.candidate_id = p_candidate AND t.id = f.type_id AND t.builtin = 'resume'
      RETURNING f.path)
    SELECT v_gone || coalesce(array_agg(path), '{}') INTO v_gone FROM gone;
    PERFORM public.hiring_attach(p_candidate, NULL, jsonb_build_array(jsonb_build_object('path', p_resume_path, 'name', p_resume_name,
      'type', (SELECT t.id FROM public.hiring_file_types t WHERE t.builtin = 'resume'))), false);
  END IF;
  FOR v_f IN
    DELETE FROM public.hiring_files f USING public.hiring_file_types t
     WHERE f.id = ANY (coalesce(p_remove, '{}')) AND f.candidate_id = p_candidate AND t.id = f.type_id
    RETURNING f.path, f.name, t.name AS type
  LOOP
    v_gone := v_gone || v_f.path;
    PERFORM public.hiring_log(v_old.request_id, 'File removed', NULL, v_name || ' · ' || v_f.type || ' · ' || v_f.name);
  END LOOP;
  PERFORM public.hiring_attach(p_candidate, NULL, p_files, true);
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(v_gone)));
END
$fn$;

-- Add talent / Move to Talent Bank…: production's body. A candidate moved
-- brings ALL their files; a résumé given (the old call) and p_files (new) are
-- filed on the talent.
DROP FUNCTION public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid);
CREATE FUNCTION public.hiring_talent_save(p_name text, p_phone text, p_email text, p_position text,
  p_department text, p_notes text, p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL,
  p_from_candidate uuid DEFAULT NULL, p_files jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_cand public.hiring_candidates;
  v_position text;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR btrim(coalesce(p_position, '')) = '' THEN
    RAISE EXCEPTION '%', CASE WHEN p_from_candidate IS NULL THEN 'Add a name and the position they fit.' ELSE 'Name and position are needed.' END
      USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_department, '')) = '' THEN RAISE EXCEPTION 'Pick the department' USING ERRCODE = '22023'; END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  IF p_from_candidate IS NOT NULL THEN
    SELECT * INTO v_cand FROM public.hiring_candidates WHERE id = p_from_candidate FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(r.answers ->> 'position', '') INTO v_position FROM public.hiring_requests r WHERE r.id = v_cand.request_id;
  END IF;
  INSERT INTO public.hiring_talents (no, name, phone, email, position, department, from_request, notes,
    saved_by_name, saved_by)
  VALUES ('T-' || lpad(nextval('public.hiring_talent_no_seq')::text, 3, '0'), v_name, btrim(coalesce(p_phone, '')),
    btrim(coalesce(p_email, '')), btrim(p_position), btrim(p_department), v_cand.request_id, coalesce(p_notes, ''),
    public.hiring_actor_name(), auth.uid())
  RETURNING id INTO v_id;
  IF p_from_candidate IS NOT NULL THEN
    INSERT INTO public.hiring_files (talent_id, type_id, path, name, added_by_name, added_by, added_at)
    SELECT v_id, f.type_id, f.path, f.name, f.added_by_name, f.added_by, f.added_at
      FROM public.hiring_files f WHERE f.candidate_id = p_from_candidate;
  END IF;
  IF p_resume_path IS NOT NULL THEN
    PERFORM public.hiring_attach(NULL, v_id, jsonb_build_array(jsonb_build_object('path', p_resume_path, 'name', p_resume_name,
      'type', (SELECT t.id FROM public.hiring_file_types t WHERE t.builtin = 'resume'))), false);
  END IF;
  PERFORM public.hiring_attach(NULL, v_id, p_files, false);
  IF p_from_candidate IS NOT NULL THEN
    UPDATE public.hiring_candidates SET talent_id = v_id, updated_at = now() WHERE id = p_from_candidate;
    PERFORM public.hiring_log(v_cand.request_id, 'Saved to Talent Bank', NULL, v_name);
    PERFORM public.hiring_talent_log(v_id, 'Saved to Talent Bank', 'From ' || v_cand.request_id || ' · ' || v_position);
  ELSE
    PERFORM public.hiring_talent_log(v_id, 'Added to Talent Bank', '');
  END IF;
  RETURN v_id;
END
$fn$;

-- Invite to interview / Pick from Talent Bank: production's body; the talent's
-- files come with them onto the request.
CREATE OR REPLACE FUNCTION public.hiring_talent_invite(p_talent uuid, p_request text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_t public.hiring_talents;
  v_r public.hiring_requests;
  v_id uuid;
BEGIN
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM public.hiring_talents WHERE id = p_talent AND removed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'That talent is not in the bank any more' USING ERRCODE = '22023'; END IF;
  v_r := public.hiring_lock(p_request, ARRAY['submitted', 'needs_info', 'acknowledged'], 'Invite to an open request');
  IF EXISTS (SELECT 1 FROM public.hiring_candidates c WHERE c.request_id = p_request AND c.talent_id = p_talent AND c.stage <> 'rejected') THEN
    RAISE EXCEPTION '% is already on %', v_t.name, p_request USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_candidates (request_id, name, phone, source, stage, talent_id, created_by)
  VALUES (p_request, v_t.name, v_t.phone, 'Talent Bank', 'shortlisted', v_t.id, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.hiring_files (candidate_id, type_id, path, name, added_by_name, added_by, added_at)
  SELECT v_id, f.type_id, f.path, f.name, f.added_by_name, f.added_by, f.added_at
    FROM public.hiring_files f WHERE f.talent_id = p_talent;
  PERFORM public.hiring_log(p_request, 'Candidate added', NULL, v_t.name || ' · from Talent Bank');
  PERFORM public.hiring_talent_log(p_talent, 'Invited to interview', p_request || ' · ' || coalesce(v_r.answers ->> 'position', ''));
  RETURN v_id;
END
$fn$;

-- A talent's notes; a résumé given (the old call) replaces their résumé —
-- the app now replaces any one file with hiring_file_replace().
CREATE OR REPLACE FUNCTION public.hiring_talent_update(p_talent uuid, p_notes text DEFAULT NULL,
  p_resume_path text DEFAULT NULL, p_resume_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hiring_talents WHERE id = p_talent AND removed_at IS NULL) THEN
    RAISE EXCEPTION 'That talent is not in the bank any more' USING ERRCODE = '22023';
  END IF;
  IF p_resume_path IS NOT NULL AND p_resume_path !~ '^resumes/' THEN
    RAISE EXCEPTION 'A résumé lives under resumes/' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL THEN
    IF length(p_notes) > 8000 THEN RAISE EXCEPTION 'The notes are too long' USING ERRCODE = '22023'; END IF;
    UPDATE public.hiring_talents SET notes = p_notes WHERE id = p_talent AND notes IS DISTINCT FROM p_notes;
  END IF;
  IF p_resume_path IS NOT NULL THEN
    DELETE FROM public.hiring_files f USING public.hiring_file_types t
     WHERE f.talent_id = p_talent AND t.id = f.type_id AND t.builtin = 'resume';
    PERFORM public.hiring_attach(NULL, p_talent, jsonb_build_array(jsonb_build_object('path', p_resume_path, 'name', p_resume_name,
      'type', (SELECT t.id FROM public.hiring_file_types t WHERE t.builtin = 'resume'))), false);
    PERFORM public.hiring_talent_log(p_talent, 'Résumé replaced', coalesce(p_resume_name, ''));
  END IF;
END
$fn$;

-- Remove from Talent Bank: production's body; their files come off with them
-- (the talent's own row stays, removed, for its history). Answers the objects
-- no record names any more — the app deletes them.
DROP FUNCTION public.hiring_talent_remove(uuid);
CREATE FUNCTION public.hiring_talent_remove(p_talent uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_gone text[];
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  WITH gone AS (DELETE FROM public.hiring_files f WHERE f.talent_id = p_talent RETURNING f.path)
  SELECT coalesce(array_agg(path), '{}') INTO v_gone FROM gone;
  UPDATE public.hiring_talents SET removed_at = now(), removed_by = auth.uid() WHERE id = p_talent AND removed_at IS NULL;
  IF FOUND THEN
    PERFORM public.hiring_talent_log(p_talent, 'Removed from Talent Bank',
      CASE cardinality(v_gone) WHEN 0 THEN '' WHEN 1 THEN '1 file deleted' ELSE cardinality(v_gone) || ' files deleted' END);
  END IF;
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(v_gone)));
END
$fn$;

-- Closed since 080100 and called by nothing; it read the columns that go below.
DROP FUNCTION public.hiring_file_of(text, text, boolean);

ALTER TABLE public.hiring_candidates DROP COLUMN resume_path, DROP COLUMN resume_name;
ALTER TABLE public.hiring_talents DROP COLUMN resume_path, DROP COLUMN resume_name;
COMMENT ON TABLE public.hiring_candidates IS 'A request''s candidates and the stage each has reached; their files are hiring_files.';
COMMENT ON TABLE public.hiring_talent_events IS 'A talent''s History: saved, invited to interview, files added, replaced and removed.';

-- ── 5. Storage ──────────────────────────────────────────────────────────────

-- New files go under files/ from the uploader's own browser (Create or Edit);
-- guest uploads stay under guest/ through `guest_link_uploads` (rooms.md).
ALTER POLICY hiring_files_write ON storage.objects
  WITH CHECK (bucket_id = 'hiring-files' AND (storage.foldername(name))[1] IN ('resumes', 'attachments', 'files')
    AND (SELECT public.has_any_action(ARRAY['hiring.create', 'hiring.edit'])));

-- Deleting asks Edit, and only an object no record names: the app deletes after
-- the row has gone (or a leftover), never a file still on somebody's record.
CREATE POLICY hiring_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hiring-files' AND (SELECT public.has_any_action(ARRAY['hiring.edit']))
    AND NOT public.hiring_file_in_use(name));

-- ── 6. Who may call what ────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hiring_orphaned(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_take_upload(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_attach(uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
-- The delete policy asks it under the caller's session.
REVOKE ALL ON FUNCTION public.hiring_file_in_use(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_file_in_use(text) TO authenticated;

REVOKE ALL ON FUNCTION public.hiring_files_add(text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_file_replace(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_file_remove(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_file_type_add(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_file_downloaded(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_orphan_files(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_files_add(text, uuid, jsonb), public.hiring_file_replace(uuid, text, text),
  public.hiring_file_remove(uuid), public.hiring_file_type_add(text), public.hiring_file_downloaded(uuid),
  public.hiring_orphan_files(integer),
  public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb),
  public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[]),
  public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb),
  public.hiring_talent_remove(uuid)
  TO authenticated;

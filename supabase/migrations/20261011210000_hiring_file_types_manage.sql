-- ============================================================================
-- 20261011210000_hiring_file_types_manage.sql
-- Hiring (2026-10-11, the user's answers on the hiring-files questions): file
-- types are renamed and turned off in Hiring › Form settings, and the
-- leftovers go every hour.
-- ============================================================================
--
-- The user (2026-10-11): "加改名和停用" — HR renames a file type and turns one
-- off (Hiring · Edit, in Form settings beside the hiring sources). A type
-- turned off leaves the picker; the files already filed under it keep it and
-- show it; naming it again ("+ Add a new file type…") turns it back on.
-- Résumé is built in: never renamed, never turned off.
--
-- "每小时自动清": the leftovers — objects in `hiring-files` no record names, put
-- there over a day ago — are cleared every hour by the member-queue cron (the
-- service role, an existing admin.ts caller), even when nobody touches Hiring;
-- HR's own file writes still clear them too. The one list both use is
-- `hiring_leftovers(p_limit)`, the service role's alone; `hiring_orphan_files`
-- (Hiring · Edit) asks its cell, then reads it.
--
-- Every replaced body is PRODUCTION's (md5(prosrc) checked 2026-10-11, equal to
-- 20261011160000's copies) with one statement swapped: hiring_board()'s file
-- types say whether each is on and how many files it has; hiring_attach()
-- refuses a type turned off; hiring_file_type_add() turns a type of that name
-- back on; hiring_orphan_files() reads hiring_leftovers().

ALTER TABLE public.hiring_file_types
  ADD COLUMN retired_at timestamptz,
  ADD COLUMN retired_by uuid REFERENCES public.users(id);
COMMENT ON COLUMN public.hiring_file_types.retired_at IS
  'Turned off in Form settings: out of the picker, kept by the files already filed under it. Never for the built-in Résumé.';

-- ── The leftovers: one list, the hourly sweep's and HR's ─────────────────────

CREATE OR REPLACE FUNCTION public.hiring_leftovers(p_limit integer DEFAULT 50)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN ARRAY(SELECT o.name FROM storage.objects o
                WHERE o.bucket_id = 'hiring-files'
                  AND o.created_at < now() - interval '1 day'
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.path = o.name)
                  AND NOT EXISTS (SELECT 1 FROM public.hiring_requests r WHERE r.attachment_path = o.name)
                ORDER BY o.created_at, o.name
                LIMIT greatest(1, least(coalesce(p_limit, 50), 200)));
END
$fn$;

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
  RETURN public.hiring_leftovers(p_limit);
END
$fn$;

-- ── Renaming and turning off (Hiring · Edit) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.hiring_file_type_rename(p_type uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_type public.hiring_file_types;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_type FROM public.hiring_file_types WHERE id = p_type FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That file type is not there any more' USING ERRCODE = '22023'; END IF;
  IF v_type.builtin IS NOT NULL THEN
    RAISE EXCEPTION '% is built in — it keeps its name.', v_type.name USING ERRCODE = '22023';
  END IF;
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Name the file type.' USING ERRCODE = '22023'; END IF;
  IF v_name IS NOT DISTINCT FROM v_type.name THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.hiring_file_types t WHERE lower(btrim(t.name)) = lower(v_name) AND t.id IS DISTINCT FROM p_type) THEN
    RAISE EXCEPTION 'That type is already there.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hiring_file_types SET name = v_name WHERE id = p_type;
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_file_type_set_active(p_type uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_type public.hiring_file_types;
BEGIN
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_type FROM public.hiring_file_types WHERE id = p_type FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That file type is not there any more' USING ERRCODE = '22023'; END IF;
  IF v_type.builtin IS NOT NULL THEN
    RAISE EXCEPTION '% is built in — it stays on.', v_type.name USING ERRCODE = '22023';
  END IF;
  IF p_active IS NULL OR p_active = (v_type.retired_at IS NULL) THEN RETURN; END IF;
  UPDATE public.hiring_file_types
     SET retired_at = CASE WHEN p_active THEN NULL ELSE now() END,
         retired_by = CASE WHEN p_active THEN NULL ELSE auth.uid() END
   WHERE id = p_type;
END
$fn$;

-- ── Production's bodies, one statement swapped each ─────────────────────────

-- hiring_board(): the file types say whether each is on and how many files it has.
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
    'fileTypes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'builtin', t.builtin,
        'active', t.retired_at IS NULL, 'used', (SELECT count(*) FROM public.hiring_files hf WHERE hf.type_id = t.id))
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

-- hiring_attach(): a type turned off files nothing new (a file already filed keeps it).
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
    IF v_type.retired_at IS NOT NULL THEN
      RAISE EXCEPTION '% is turned off — pick another type.', v_type.name USING ERRCODE = '22023';
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

-- hiring_file_type_add(): naming a type that was turned off turns it back on.
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
  IF v_id IS NOT NULL THEN
    -- A type turned off comes back when it is named again.
    UPDATE public.hiring_file_types SET retired_at = NULL, retired_by = NULL WHERE id = v_id AND retired_at IS NOT NULL;
    RETURN v_id;
  END IF;
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

-- ── Who may call what ───────────────────────────────────────────────────────

-- The hourly sweep's (the member-queue cron, the service role) and, behind its
-- own cell, hiring_orphan_files()'s.
REVOKE ALL ON FUNCTION public.hiring_leftovers(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_leftovers(integer) TO service_role;
REVOKE ALL ON FUNCTION public.hiring_file_type_rename(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_file_type_set_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_file_type_rename(uuid, text), public.hiring_file_type_set_active(uuid, boolean) TO authenticated;

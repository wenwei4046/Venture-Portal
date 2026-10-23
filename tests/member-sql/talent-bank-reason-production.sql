-- Production's bodies of the five Hiring writes 20261024233700_talent_bank_reason.sql makes again, as
-- pg_get_functiondef read them on 2026-10-24 (md5 of prosrc beside each). validate-talent-bank-reason.mjs loads
-- this over the Hiring migrations, the Drive and the Bin: production's copies carry the page guards
-- 20261011220100 put in, which that test's chain does not run.

-- hiring_bank_add_talent(text,text,text,text,text,text,jsonb) · md5 217dcfc60c5df215b37c75f6d5a3bf4b
CREATE OR REPLACE FUNCTION public.hiring_bank_add_talent(p_place text, p_name text, p_phone text, p_email text, p_position text, p_notes text, p_files jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  p record;
  v_id uuid;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/talent'], ARRAY['hiring.create']);
  IF public.has_any_action(ARRAY['hiring.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Create is required' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR btrim(coalesce(p_position, '')) = '' THEN
    RAISE EXCEPTION 'Add a name and the position they fit.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM public.hiring_bank_place(p_place);
  IF p.kind = 'root' THEN
    RAISE EXCEPTION 'Open a company, a department or a folder first.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_talents (no, name, phone, email, position, department, notes, saved_by_name, saved_by,
    place_kind, place_sub_id, place_dept, place_folder_id)
  VALUES ('T-' || lpad(nextval('public.hiring_talent_no_seq')::text, 3, '0'), v_name, btrim(coalesce(p_phone, '')),
    btrim(coalesce(p_email, '')), btrim(p_position), public.hiring_bank_dept_of(p.kind, p.sub, p.dept, p.folder),
    coalesce(p_notes, ''), public.hiring_actor_name(), auth.uid(), p.kind, p.sub, p.dept, p.folder)
  RETURNING id INTO v_id;
  PERFORM public.hiring_attach(NULL, v_id, p_files, false);
  PERFORM public.hiring_talent_log(v_id, 'Added to Talent Bank', public.hiring_bank_label(p.kind, p.sub, p.dept, p.folder));
  RETURN v_id;
END
$function$;

-- hiring_candidate_add(text,text,text,text,text,jsonb,text,text,jsonb) · md5 2b83be6c8ebf01b980e231911a00b41b
CREATE OR REPLACE FUNCTION public.hiring_candidate_add(p_request text, p_name text, p_phone text, p_stage text, p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL::text, p_resume_name text DEFAULT NULL::text, p_files jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/requests'], ARRAY['hiring.create']);
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
$function$;

-- hiring_candidate_edit(uuid,text,text,text,text,jsonb,text,text,jsonb,uuid[]) · md5 43f74811663bf438a913f57364f9370d
CREATE OR REPLACE FUNCTION public.hiring_candidate_edit(p_candidate uuid, p_name text, p_phone text, p_stage text, p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL::text, p_resume_name text DEFAULT NULL::text, p_files jsonb DEFAULT NULL::jsonb, p_remove uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.hiring_candidates;
  v_name text := btrim(coalesce(p_name, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_gone text[] := '{}';
  v_f record;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/requests'], ARRAY['hiring.edit']);
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
$function$;

-- hiring_candidate_stage(uuid,text) · md5 6c5b68daa8be872653994b577be15e20
CREATE OR REPLACE FUNCTION public.hiring_candidate_stage(p_candidate uuid, p_stage text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.hiring_candidates;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/requests'], ARRAY['hiring.edit']);
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old FROM public.hiring_candidates WHERE id = p_candidate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
  IF p_stage IS NOT DISTINCT FROM v_old.stage THEN RETURN; END IF;
  UPDATE public.hiring_candidates SET stage = p_stage, updated_at = now() WHERE id = p_candidate;
  PERFORM public.hiring_log(v_old.request_id, 'Candidate status', NULL, v_old.name || ' → ' || public.hiring_stage_label(p_stage));
END
$function$;

-- hiring_talent_save(text,text,text,text,text,text,text,text,uuid,jsonb) · md5 d39cebad0d5cb3e9a7013070c4c14e40
CREATE OR REPLACE FUNCTION public.hiring_talent_save(p_name text, p_phone text, p_email text, p_position text, p_department text, p_notes text, p_resume_path text DEFAULT NULL::text, p_resume_name text DEFAULT NULL::text, p_from_candidate uuid DEFAULT NULL::uuid, p_files jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_cand public.hiring_candidates;
  v_position text;
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/requests/[id]'], ARRAY['hiring.create']);
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
$function$;

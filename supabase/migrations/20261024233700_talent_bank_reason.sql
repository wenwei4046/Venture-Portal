-- ============================================================================
-- 20261024233700_talent_bank_reason.sql
-- Hiring › Talent Bank: why somebody is kept there, and a candidate not
-- selected kept there by itself (2026-10-24 — IT-0008, from HR: "after the
-- candidate is failed with interview or not shortlisted, the candidate will be
-- dissapear within the table ish view, where instead of entirely dissapear the
-- candidate will be placed within the Talent Bank"; the user, passing it on:
-- "最好的是它可以显示 candidate 是从哪里来的 … 包括 upload 的时候，最好能放一个
-- drop 掉的原因：可能是刚好 not right now，或者他被 fail shortlist 等。做成一个
-- dropdown，可以选 type 就好了 … 除非真的觉得完全不行才 delete 掉，不然 Talent
-- Bank 就可以积累到很多 candidate").
-- ============================================================================
--
-- `hiring_talents.reason` — why they are kept, one of five types:
--
--   not_shortlisted    Not shortlisted
--   failed_interview   Failed interview
--   not_right_now      Not right now
--   declined_offer     Declined offer
--   other              Other
--
-- (null: kept before this migration — production had nobody in the bank.)
-- Where they came from is what it was: `from_request` (a request's candidate)
-- or none (added in the Talent Bank itself).
--
-- A candidate turned Not selected — Change status, Edit candidate, or added as
-- such — is kept in the Talent Bank there and then (`hiring_bank_keep`): their
-- name, phone, HR's note and their details on the request (the candidate
-- fields), every file, placed where Move to Talent Bank would place them (the
-- BEFORE INSERT trigger), the reason given — or, when none is, the one their
-- stage says (`hiring_out_reason`: Shortlisted → Not shortlisted, Done
-- appointment → Failed interview, Offered → Declined offer). Somebody already
-- in the bank (invited from it, or moved there before) keeps their record and
-- takes the reason. The request's trail says it (Candidate status · … · reason,
-- Saved to Talent Bank); their History too.
--
-- Move to Talent Bank (hiring_talent_save) and + New › Add talent
-- (hiring_bank_add_talent) take the reason; `hiring_talent_set_reason` changes
-- it (Edit, the Talent Bank's page first). hiring_board() answers it on each
-- talent.
--
-- Four functions gain `p_reason text DEFAULT NULL` (dropped and made again —
-- an app still calling without it is answered the same); each is production's
-- body as read off pg_proc on 2026-10-24 (md5 checked first: the migration
-- refuses when production changed since) with the new statements added, and
-- each asks the pages it asked (`pg_temp.tab_guard`, as mig 20261011220100).
-- hiring_board() has one span swapped.

-- ── The helpers this file uses (mig 20261013061500's, as they are) ─────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- A body about to be made again: still the one this file was written against.
CREATE OR REPLACE FUNCTION pg_temp.body_is(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_md5 text := (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF v_md5 IS DISTINCT FROM p_md5 THEN
    RAISE EXCEPTION '%: its body is % now, not % — production changed since this migration was written', p_sig, v_md5, p_md5;
  END IF;
END
$fn$;

-- The page's guard at the top of a body (mig 20261011220100's helpers, as they are).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard_put(p_sig text, p_guard text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_at  integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_guard IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF position('tab_write_guard' IN v_src) > 0 THEN
    RAISE EXCEPTION '% already asks other pages — change that guard with swap_check', p_sig;
  END IF;
  v_at := regexp_instr(v_src, '\mBEGIN\M', 1, 1, 1, 'i');
  IF v_at = 0 THEN
    RAISE EXCEPTION '% has no BEGIN', p_sig;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, left(v_src, v_at - 1) || E'\n  ' || p_guard || substr(v_src, v_at));
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.tab_guard_put(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

SELECT pg_temp.body_is('public.hiring_candidate_stage(uuid, text)', '6c5b68daa8be872653994b577be15e20');
SELECT pg_temp.body_is('public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb)', '2b83be6c8ebf01b980e231911a00b41b');
SELECT pg_temp.body_is('public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[])', '43f74811663bf438a913f57364f9370d');
SELECT pg_temp.body_is('public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb)', 'd39cebad0d5cb3e9a7013070c4c14e40');
SELECT pg_temp.body_is('public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb)', '217dcfc60c5df215b37c75f6d5a3bf4b');

-- ── 1. Why they are kept ────────────────────────────────────────────────────

ALTER TABLE public.hiring_talents
  ADD COLUMN reason text CONSTRAINT hiring_talents_reason
    CHECK (reason IN ('not_shortlisted', 'failed_interview', 'not_right_now', 'declined_offer', 'other'));
COMMENT ON COLUMN public.hiring_talents.reason IS
  'Why they are kept in the Talent Bank (2026-10-24): not_shortlisted · failed_interview · not_right_now · declined_offer · other. Null: kept before it was asked.';

-- The words of a reason, as the trails write them.
CREATE FUNCTION public.hiring_reason_label(p_reason text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN CASE p_reason
    WHEN 'not_shortlisted' THEN 'Not shortlisted'
    WHEN 'failed_interview' THEN 'Failed interview'
    WHEN 'not_right_now' THEN 'Not right now'
    WHEN 'declined_offer' THEN 'Declined offer'
    WHEN 'other' THEN 'Other'
    ELSE coalesce(p_reason, '') END;
END
$function$;

-- The reason a candidate leaving this stage has when nobody said one: how far they had come.
CREATE FUNCTION public.hiring_out_reason(p_stage text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN CASE p_stage
    WHEN 'appointment' THEN 'failed_interview'
    WHEN 'offered' THEN 'declined_offer'
    WHEN 'hired' THEN 'other'
    ELSE 'not_shortlisted' END;
END
$function$;

-- A reason handed in: one of the five, else refused in words.
CREATE FUNCTION public.hiring_reason_check(p_reason text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_reason IS NOT NULL AND p_reason NOT IN ('not_shortlisted', 'failed_interview', 'not_right_now', 'declined_offer', 'other') THEN
    RAISE EXCEPTION 'Pick why they are kept.' USING ERRCODE = '22023';
  END IF;
END
$function$;

-- ── 2. A candidate not selected is kept in the Talent Bank ──────────────────

CREATE FUNCTION public.hiring_bank_keep(p_candidate uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.hiring_candidates;
  r public.hiring_requests;
  v_id uuid;
  v_position text;
  v_dept text;
  v_details text;
  v_label text := public.hiring_reason_label(p_reason);
BEGIN
  SELECT * INTO c FROM public.hiring_candidates WHERE id = p_candidate;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO r FROM public.hiring_requests WHERE id = c.request_id;
  v_position := coalesce(nullif(btrim(coalesce(r.answers ->> 'position', '')), ''), 'Not given');
  -- Already in the bank (invited from it, or moved there before): their record takes the reason.
  IF c.talent_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.hiring_talents t WHERE t.id = c.talent_id AND t.removed_at IS NULL) THEN
    UPDATE public.hiring_talents SET reason = p_reason WHERE id = c.talent_id;
    PERFORM public.hiring_talent_log(c.talent_id, 'Not selected', c.request_id || ' · ' || v_position || ' · ' || v_label);
    RETURN c.talent_id;
  END IF;
  -- Kept where Move to Talent Bank keeps them: a guest's in their company's department, HOUZS Venture's by the
  -- request's Department (its first part) — the BEFORE INSERT trigger places them.
  v_dept := coalesce(nullif(btrim(CASE WHEN r.source = 'guest' THEN coalesce(r.answers ->> 'dept', '')
                                       ELSE split_part(coalesce(r.answers ->> 'dept', ''), ' · ', 1) END), ''), 'General');
  -- Their details on the request (the candidate fields) go with them, under HR's note.
  SELECT string_agg(f.label || ': ' || btrim(c.answers ->> f.id), ' · ' ORDER BY f.sort, f.id) INTO v_details
    FROM public.hiring_candidate_fields f WHERE btrim(coalesce(c.answers ->> f.id, '')) <> '';
  INSERT INTO public.hiring_talents (no, name, phone, email, position, department, from_request, notes,
    saved_by_name, saved_by, reason)
  VALUES ('T-' || lpad(nextval('public.hiring_talent_no_seq')::text, 3, '0'), c.name, c.phone, '', v_position, v_dept,
    c.request_id, concat_ws(E'\n', nullif(btrim(c.note), ''), v_details), public.hiring_actor_name(), auth.uid(), p_reason)
  RETURNING id INTO v_id;
  INSERT INTO public.hiring_files (talent_id, type_id, path, name, added_by_name, added_by, added_at)
  SELECT v_id, f.type_id, f.path, f.name, f.added_by_name, f.added_by, f.added_at
    FROM public.hiring_files f WHERE f.candidate_id = p_candidate;
  UPDATE public.hiring_candidates SET talent_id = v_id, updated_at = now() WHERE id = p_candidate;
  PERFORM public.hiring_log(c.request_id, 'Saved to Talent Bank', NULL, c.name || ' · ' || v_label);
  PERFORM public.hiring_talent_log(v_id, 'Saved to Talent Bank', 'From ' || c.request_id || ' · ' || v_position || ' · Not selected · ' || v_label);
  RETURN v_id;
END
$function$;
COMMENT ON FUNCTION public.hiring_bank_keep(uuid, text) IS
  'A candidate turned Not selected, kept in the Talent Bank with the reason (2026-10-24, IT-0008): a new talent with their files, or the one they already are. Called by the candidate writes only.';

-- Change status ▸ (the request page, the HR app): Not selected keeps them in the bank, with the reason picked.
DROP FUNCTION public.hiring_candidate_stage(uuid, text);
CREATE FUNCTION public.hiring_candidate_stage(p_candidate uuid, p_stage text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old public.hiring_candidates;
  v_reason text;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/requests'], ARRAY['hiring.edit']);
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.hiring_reason_check(p_reason);
  SELECT * INTO v_old FROM public.hiring_candidates WHERE id = p_candidate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
  IF p_stage IS NOT DISTINCT FROM v_old.stage THEN RETURN; END IF;
  UPDATE public.hiring_candidates SET stage = p_stage, updated_at = now() WHERE id = p_candidate;
  v_reason := CASE WHEN p_stage = 'rejected' THEN coalesce(p_reason, public.hiring_out_reason(v_old.stage)) END;
  PERFORM public.hiring_log(v_old.request_id, 'Candidate status', NULL, v_old.name || ' → ' || public.hiring_stage_label(p_stage)
    || CASE WHEN v_reason IS NOT NULL THEN ' · ' || public.hiring_reason_label(v_reason) ELSE '' END);
  IF v_reason IS NOT NULL THEN
    PERFORM public.hiring_bank_keep(p_candidate, v_reason);
  END IF;
END
$function$;

-- + New candidate added as Not selected: kept in the bank too.
DROP FUNCTION public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb);
CREATE FUNCTION public.hiring_candidate_add(p_request text, p_name text, p_phone text, p_stage text, p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL::text, p_resume_name text DEFAULT NULL::text, p_files jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text)
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
  PERFORM public.hiring_reason_check(p_reason);
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
  IF p_stage = 'rejected' THEN
    PERFORM public.hiring_bank_keep(v_id, coalesce(p_reason, public.hiring_out_reason(NULL)));
  END IF;
  RETURN v_id;
END
$function$;

-- Edit candidate: Not selected keeps them in the bank once their files are as saved (a file taken off stays off).
DROP FUNCTION public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[]);
CREATE FUNCTION public.hiring_candidate_edit(p_candidate uuid, p_name text, p_phone text, p_stage text, p_note text, p_answers jsonb, p_resume_path text DEFAULT NULL::text, p_resume_name text DEFAULT NULL::text, p_files jsonb DEFAULT NULL::jsonb, p_remove uuid[] DEFAULT NULL::uuid[], p_reason text DEFAULT NULL::text)
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
  v_reason text;
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
  PERFORM public.hiring_reason_check(p_reason);
  UPDATE public.hiring_candidates SET name = v_name, phone = btrim(coalesce(p_phone, '')),
    stage = coalesce(p_stage, stage), note = v_note, answers = public.hiring_clean_candidate_answers(p_answers),
    updated_at = now()
   WHERE id = p_candidate;
  PERFORM public.hiring_log(v_old.request_id, 'Candidate edited', NULL,
    v_name || CASE WHEN v_note <> '' AND v_note IS DISTINCT FROM v_old.note THEN ' · note: ' || v_note ELSE '' END);
  v_reason := CASE WHEN p_stage = 'rejected' AND v_old.stage IS DISTINCT FROM 'rejected'
                   THEN coalesce(p_reason, public.hiring_out_reason(v_old.stage)) END;
  IF p_stage IS NOT NULL AND p_stage IS DISTINCT FROM v_old.stage THEN
    PERFORM public.hiring_log(v_old.request_id, 'Candidate status', NULL, v_name || ' → ' || public.hiring_stage_label(p_stage)
      || CASE WHEN v_reason IS NOT NULL THEN ' · ' || public.hiring_reason_label(v_reason) ELSE '' END);
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
  IF v_reason IS NOT NULL THEN
    PERFORM public.hiring_bank_keep(p_candidate, v_reason);
  END IF;
  RETURN jsonb_build_object('orphans', to_jsonb(public.hiring_orphaned(v_gone)));
END
$function$;

-- ── 3. The reason, given when somebody is put in the bank by hand ───────────

-- Move to Talent Bank… (a request's candidate) takes the reason picked.
DROP FUNCTION public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb);
CREATE FUNCTION public.hiring_talent_save(p_name text, p_phone text, p_email text, p_position text, p_department text, p_notes text, p_resume_path text DEFAULT NULL::text, p_resume_name text DEFAULT NULL::text, p_from_candidate uuid DEFAULT NULL::uuid, p_files jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text)
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
  PERFORM public.hiring_reason_check(p_reason);
  IF p_from_candidate IS NOT NULL THEN
    SELECT * INTO v_cand FROM public.hiring_candidates WHERE id = p_from_candidate FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That candidate is not there any more' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(r.answers ->> 'position', '') INTO v_position FROM public.hiring_requests r WHERE r.id = v_cand.request_id;
  END IF;
  INSERT INTO public.hiring_talents (no, name, phone, email, position, department, from_request, notes,
    saved_by_name, saved_by, reason)
  VALUES ('T-' || lpad(nextval('public.hiring_talent_no_seq')::text, 3, '0'), v_name, btrim(coalesce(p_phone, '')),
    btrim(coalesce(p_email, '')), btrim(p_position), btrim(p_department), v_cand.request_id, coalesce(p_notes, ''),
    public.hiring_actor_name(), auth.uid(), p_reason)
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
    PERFORM public.hiring_log(v_cand.request_id, 'Saved to Talent Bank', NULL,
      v_name || CASE WHEN p_reason IS NOT NULL THEN ' · ' || public.hiring_reason_label(p_reason) ELSE '' END);
    PERFORM public.hiring_talent_log(v_id, 'Saved to Talent Bank', 'From ' || v_cand.request_id || ' · ' || v_position
      || CASE WHEN p_reason IS NOT NULL THEN ' · ' || public.hiring_reason_label(p_reason) ELSE '' END);
  ELSE
    PERFORM public.hiring_talent_log(v_id, 'Added to Talent Bank', coalesce(public.hiring_reason_label(p_reason), ''));
  END IF;
  RETURN v_id;
END
$function$;

-- + New › Add talent (the Talent Bank itself) takes the reason picked.
DROP FUNCTION public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb);
CREATE FUNCTION public.hiring_bank_add_talent(p_place text, p_name text, p_phone text, p_email text, p_position text, p_notes text, p_files jsonb, p_reason text DEFAULT NULL::text)
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
  PERFORM public.hiring_reason_check(p_reason);
  SELECT * INTO p FROM public.hiring_bank_place(p_place);
  IF p.kind = 'root' THEN
    RAISE EXCEPTION 'Open a company, a department or a folder first.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hiring_talents (no, name, phone, email, position, department, notes, saved_by_name, saved_by,
    place_kind, place_sub_id, place_dept, place_folder_id, reason)
  VALUES ('T-' || lpad(nextval('public.hiring_talent_no_seq')::text, 3, '0'), v_name, btrim(coalesce(p_phone, '')),
    btrim(coalesce(p_email, '')), btrim(p_position), public.hiring_bank_dept_of(p.kind, p.sub, p.dept, p.folder),
    coalesce(p_notes, ''), public.hiring_actor_name(), auth.uid(), p.kind, p.sub, p.dept, p.folder, p_reason)
  RETURNING id INTO v_id;
  PERFORM public.hiring_attach(NULL, v_id, p_files, false);
  PERFORM public.hiring_talent_log(v_id, 'Added to Talent Bank', public.hiring_bank_label(p.kind, p.sub, p.dept, p.folder)
    || CASE WHEN p_reason IS NOT NULL THEN ' · ' || public.hiring_reason_label(p_reason) ELSE '' END);
  RETURN v_id;
END
$function$;

-- The reason changed on their page (Edit). Their History says from what to what.
CREATE FUNCTION public.hiring_talent_set_reason(p_talent uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old text;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/hiring/talent'], ARRAY['hiring.edit']);
  IF public.has_any_action(ARRAY['hiring.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring · Edit is required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL THEN
    RAISE EXCEPTION 'Pick why they are kept.' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hiring_reason_check(p_reason);
  SELECT t.reason INTO v_old FROM public.hiring_talents t WHERE t.id = p_talent AND t.removed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That talent is not in the bank any more' USING ERRCODE = '22023';
  END IF;
  IF v_old IS NOT DISTINCT FROM p_reason THEN
    RETURN;
  END IF;
  UPDATE public.hiring_talents SET reason = p_reason WHERE id = p_talent;
  PERFORM public.hiring_talent_log(p_talent, 'Reason changed',
    CASE WHEN v_old IS NULL THEN '' ELSE public.hiring_reason_label(v_old) || ' → ' END || public.hiring_reason_label(p_reason));
END
$function$;

-- ── 4. The board answers it ─────────────────────────────────────────────────

SELECT pg_temp.swap_check('public.hiring_board()',
  $$'savedBy', t.saved_by_name, 'savedAt', t.saved_at,$$,
  $$'savedBy', t.saved_by_name, 'savedAt', t.saved_at, 'reason', t.reason,$$);

-- ── 5. Who may call what ────────────────────────────────────────────────────

-- The app's writes, as before (the made-again ones keep their grants; the new setter has them).
REVOKE ALL ON FUNCTION public.hiring_candidate_stage(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_talent_set_reason(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_candidate_stage(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hiring_talent_set_reason(uuid, text) TO authenticated, service_role;

-- The helpers are the functions' alone, as hiring_stage_label and hiring_talent_log are.
REVOKE ALL ON FUNCTION public.hiring_reason_label(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_out_reason(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_reason_check(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_bank_keep(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_reason_label(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hiring_out_reason(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hiring_reason_check(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hiring_bank_keep(uuid, text) TO service_role;

-- Each write asks the pages it asked (the made-again ones carry the same guard; this says so to the registry's scan).
SELECT pg_temp.tab_guard('public.hiring_candidate_stage(uuid, text, text)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb, text)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[], text)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb, text)',
  $$ARRAY['/hiring/requests/[id]']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_talent_set_reason(uuid, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);

-- ============================================================================
-- 20261020210000_waiting_list_edit_any_revenue_submitter.sql
-- Sales Groups › Waiting list: Edit in the applicant's drawer, and "Submitted by" is anybody in the Revenue
-- department (2026-10-20, the user: "要能够按 Edit：这个 Edit 本身是让 HR 可以去改资料的"; "Waiting list 那边 …
-- 'submitted by' 选不到 Revenue 的人。它应该要能选到 Revenue department 的全部人，不管什么 title").
-- ============================================================================
--
-- "Submitted by" (who brought the applicant in — the person Transfer later offers as their manager) was
-- somebody with a current placement in a sub-department of the list's department. The Revenue Directors hold
-- no placement (a department head stands above the ladder, 2026-09-11), so KRIS and PETER could never be
-- picked. Now: anybody ACTIVE who is in the department (hr_staff_costs.department_id), or placed in one of its
-- sub-departments (somebody based elsewhere who works here too).
--
-- 1. member_waiting_add (HR's "+", production's body, md5 cae67d2e…, one statement swapped — pg_temp.swap_check
--    as in 20261014213000; a body already swapped is left alone): the submitter check, as above.
--
-- 2. member_sub_department_requests (production's body, md5 75a80f3e…, one statement swapped): each row names
--    its submitter's staff id too (`submittedById`) — what the drawer's Edit starts "Submitted by" on.
--
-- 3. member_waiting_edit(request, changes) — DEFINER, the two doors "+" and the drawer's upload ask:
--    member_is_manager('member_requests_manage') and has_any_action(['member.manage']) (Member services · Edit —
--    no tab on Sales Groups carries it, so no tab_write_guard, as "+"). The request is a waiting list's still
--    ON the list (waiting / reserved / accepted), locked while it is changed. `changes` carries only what the
--    drawer changed, in the request's own words: newPerson (1–160 characters), contact (1–60, never a number
--    already on this list or waiting in Member services — the unique index asks again in a race), start
--    (a day, or 'anytime'), staffId (as "+" now asks). A value equal to the one on file is no change; nothing
--    changed is refused. The request's title follows a new name when it was the name's own
--    ("<name> · Waiting List"). Its step in the history: a step with no move (from = to = the status), note
--    "Details edited · name, phone number, joining date, submitted by" — the ones changed, in that order.
--
-- (Production keeps no comment lines inside a function body: the comments stay out here.)
-- PGlite: tests/member-sql/validate-waiting-edit.mjs (this migration verbatim, over production's
-- member_waiting_add from 20261011230000 + 20261014213000 and member_sub_department_requests from
-- 20261010130000 + 20261020130000).

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

-- ── 1. "+": anybody in the department ───────────────────────────────────────

SELECT pg_temp.swap_check('public.member_waiting_add(uuid,uuid,jsonb,uuid,boolean)',
  $q$IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = p_staff AND s.status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.comm_sub_departments d
                     WHERE d.department_id IS NOT DISTINCT FROM v_dept AND public.member_has_membership(p_staff, d.id)) THEN$q$,
  $q$IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s
                  WHERE s.id = p_staff AND s.status = 'active'
                    AND ((v_dept IS NOT NULL AND s.department_id = v_dept)
                         OR EXISTS (SELECT 1 FROM public.comm_sub_departments d
                                     WHERE d.department_id IS NOT DISTINCT FROM v_dept AND public.member_has_membership(p_staff, d.id)))) THEN$q$);

-- ── 2. The list names each submitter's staff id ─────────────────────────────

SELECT pg_temp.swap_check('public.member_sub_department_requests(uuid)',
  $q$'submittedBy', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.staff_id),$q$,
  $q$'submittedBy', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.staff_id),
      'submittedById', r.staff_id,$q$);

-- ── 3. HR edits an applicant on the list ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_waiting_edit(p_request uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.member_requests;
  v_detail     jsonb;
  v_was_name   text;
  v_name       text;
  v_contact    text;
  v_start      text;
  v_staff      uuid;
  v_dept       uuid;
  v_changed    text[] := ARRAY[]::text[];
  v_constraint text;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE
     OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  IF p_request IS NULL OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR octet_length(p_changes::text) > 4000 THEN
    RAISE EXCEPTION 'Invalid request' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_row.kind IS DISTINCT FROM 'waiting'
     OR coalesce(v_row.status, '') NOT IN ('waiting', 'reserved', 'accepted') THEN
    RAISE EXCEPTION 'This applicant is no longer on the waiting list. Reload the page.' USING ERRCODE = '22023';
  END IF;
  v_detail := v_row.detail;
  v_was_name := coalesce(v_row.detail ->> 'newPerson', '');
  v_staff := v_row.staff_id;

  IF p_changes ? 'newPerson' THEN
    v_name := btrim(coalesce(p_changes ->> 'newPerson', ''));
    IF v_name = '' OR length(v_name) > 160 THEN
      RAISE EXCEPTION 'Enter the new member''s name' USING ERRCODE = '22023';
    END IF;
    IF v_name IS DISTINCT FROM v_was_name THEN
      v_detail := v_detail || jsonb_build_object('newPerson', v_name);
      v_changed := array_append(v_changed, 'name');
    END IF;
  END IF;

  IF p_changes ? 'contact' THEN
    v_contact := btrim(coalesce(p_changes ->> 'contact', ''));
    IF v_contact = '' OR length(v_contact) > 60 THEN
      RAISE EXCEPTION 'Enter a phone number' USING ERRCODE = '22023';
    END IF;
    IF v_contact IS DISTINCT FROM coalesce(v_row.detail ->> 'contact', '') THEN
      IF EXISTS (SELECT 1 FROM public.member_requests r
                  WHERE r.id <> v_row.id AND r.sub_department_id = v_row.sub_department_id AND r.kind = 'waiting'
                    AND r.status IN ('submitted', 'needs_info', 'waiting', 'reserved', 'accepted')
                    AND r.detail ->> 'contact' = v_contact) THEN
        RAISE EXCEPTION 'This phone number is already on the waiting list, or waiting for review in Member services' USING ERRCODE = '22023';
      END IF;
      v_detail := v_detail || jsonb_build_object('contact', v_contact);
      v_changed := array_append(v_changed, 'phone number');
    END IF;
  END IF;

  IF p_changes ? 'start' THEN
    v_start := coalesce(p_changes ->> 'start', '');
    IF v_start IS DISTINCT FROM 'anytime' THEN
      IF v_start !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Pick the joining date' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_start := (v_start::date)::text;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Pick the joining date' USING ERRCODE = '22023';
      END;
    END IF;
    IF v_start IS DISTINCT FROM coalesce(v_row.detail ->> 'start', '') THEN
      v_detail := v_detail || jsonb_build_object('start', v_start);
      v_changed := array_append(v_changed, 'joining date');
    END IF;
  END IF;

  IF p_changes ? 'staffId' THEN
    IF coalesce(p_changes ->> 'staffId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'Pick who brought them in from the Revenue team' USING ERRCODE = '22023';
    END IF;
    v_staff := (p_changes ->> 'staffId')::uuid;
    IF v_staff IS DISTINCT FROM v_row.staff_id THEN
      SELECT d.department_id INTO v_dept FROM public.comm_sub_departments d WHERE d.id = v_row.sub_department_id;
      IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s
                      WHERE s.id = v_staff AND s.status = 'active'
                        AND ((v_dept IS NOT NULL AND s.department_id = v_dept)
                             OR EXISTS (SELECT 1 FROM public.comm_sub_departments d
                                         WHERE d.department_id IS NOT DISTINCT FROM v_dept AND public.member_has_membership(v_staff, d.id)))) THEN
        RAISE EXCEPTION 'Pick who brought them in from the Revenue team' USING ERRCODE = '22023';
      END IF;
      v_changed := array_append(v_changed, 'submitted by');
    END IF;
  END IF;

  IF cardinality(v_changed) = 0 THEN
    RAISE EXCEPTION 'Nothing has changed' USING ERRCODE = '22023';
  END IF;

  BEGIN
    UPDATE public.member_requests
       SET detail = v_detail,
           staff_id = v_staff,
           title = CASE WHEN 'name' = ANY (v_changed) AND title = v_was_name || ' · Waiting List'
                        THEN v_name || ' · Waiting List' ELSE title END
     WHERE id = v_row.id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'member_waiting_unique_contact' THEN
      RAISE EXCEPTION 'This phone number is already on the waiting list, or waiting for review in Member services' USING ERRCODE = '22023';
    END IF;
    RAISE;
  END;
  INSERT INTO public.member_request_events (request_id, actor_id, from_status, to_status, note)
  VALUES (v_row.id, auth.uid(), v_row.status, v_row.status, 'Details edited · ' || array_to_string(v_changed, ', '));
  RETURN jsonb_build_object('id', v_row.id, 'changed', to_jsonb(v_changed));
END
$$;

REVOKE ALL ON FUNCTION public.member_waiting_edit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_waiting_edit(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.member_waiting_edit(uuid, jsonb) IS
  'Sales Groups › Waiting list (2026-10-20): HR edits an applicant still on the list from their drawer — only the fields changed (newPerson, contact, start, staffId: anybody active in the department or placed in one of its sub-departments); its step in the history. member.manage + member_is_manager(''member_requests_manage'').';

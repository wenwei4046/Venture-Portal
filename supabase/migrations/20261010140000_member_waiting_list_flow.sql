-- ============================================================================
-- 20261010140000_member_waiting_list_flow.sql
-- The waiting list as the HR revamp draws it (HR revamp 3b/8, 2026-10-10).
-- ============================================================================
--
-- User decisions (2026-10-10, the handoff "Sidebar design revamp from HR",
-- choice A): HR ACCEPTS an applicant in Member services and they join the end
-- of the sub-department's waiting list; from there HR either TRANSFERS them —
-- People Management's employee form, NRIC and bank required, "Add to company"
-- — or FAILS them ("they didn't come when called"), and the next one moves up.
-- No seat is reserved automatically any more; the headcount limit is checked
-- when somebody is transferred. What the Revenue team fills in is a VERSIONED
-- form HR sets on Sales Groups (Form settings, Upload form).
--
-- 1. Two statuses: `failed` (taken off the waiting list) and `scheduled` (a
--    replacement approved for a later date — used by Member services, PR4).
-- 2. `member_reserve_waiting` keeps clearing what the old 72-hour reservation
--    left behind and reserves nothing new. Changed from PRODUCTION's body
--    (md5 825565621f2ab4323240a227b27d08f3, 2026-10-10): the WHILE loop that
--    reserved seats is gone. Its callers (set_capacity, decisions, the hourly
--    sweep) are untouched and now find nothing to reserve.
-- 3. `member_waiting_forms`: one row per version — the questions (four built
--    in, the ones `member_prepare_request` requires, then HR's own), whether
--    the signed form must be uploaded, and the application form members
--    download (HR's upload, else the black-and-white form built from the
--    questions). v1 = the four built-ins, upload not required: the Revenue
--    app learns to upload the signed form with PR7.
-- 4. Storage bucket `member-forms` (private): HR's uploaded application forms
--    under templates/. Read by whoever may send or manage member requests.
-- 5. Functions (SECURITY DEFINER, each asks its own gate):
--      member_waiting_form()                  the current version
--      member_save_waiting_form(...)          a new version (HR)
--      member_fail_waiting(request, note)     off the list (HR)
--      member_waiting_transfer(request)       what the employee form starts
--                                             from, and whether a seat is free (HR)
--      member_complete_waiting_transfer(request, staff)
--                                             the new employee is linked; the
--                                             request is done (HR)

-- ── 1. Statuses ─────────────────────────────────────────────────────────────

ALTER TABLE public.member_requests DROP CONSTRAINT member_requests_status_check;
ALTER TABLE public.member_requests ADD CONSTRAINT member_requests_status_check CHECK (status = ANY (ARRAY[
  'draft', 'submitted', 'needs_info', 'approved', 'rejected', 'waiting', 'reserved', 'accepted',
  'allocated', 'executed', 'withdrawn', 'expired', 'failed', 'scheduled'
]));

-- ── 2. No automatic reservation ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_reserve_waiting(p_sub uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('member-capacity:'||p_sub,0));
 PERFORM 1 FROM public.member_department_capacity WHERE sub_department_id=p_sub FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 -- An accepted applicant already installed in the roster occupies the same
 -- seat. Expiry must not strand that real membership in a second queue slot.
 UPDATE public.member_requests SET status='allocated',reservation_expires_at=NULL,note='Accepted applicant membership verified when the reservation expired.'
 WHERE sub_department_id=p_sub AND kind='waiting' AND status='accepted' AND reservation_expires_at<=now()
 AND allocated_staff_id IS NOT NULL AND public.member_has_membership(allocated_staff_id,p_sub);
 UPDATE public.member_requests SET status='expired',reserved_at=NULL,reservation_expires_at=NULL,note='The reservation expired. HR may re-assess eligibility before returning this application to the queue.'
 WHERE sub_department_id=p_sub AND kind='waiting' AND status IN('reserved','accepted') AND reservation_expires_at<=now();
 -- 2026-10-10 (the HR revamp): no seat is reserved automatically any more —
 -- HR transfers an applicant from the waiting list, and the headcount limit
 -- is checked then (member_waiting_transfer).
 RETURN 0;
END $function$;

-- ── 3. The waiting-list form, versioned ─────────────────────────────────────

CREATE TABLE public.member_waiting_forms (
  version integer PRIMARY KEY CHECK (version > 0),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  require_upload boolean NOT NULL DEFAULT false,
  template_path text CHECK (template_path IS NULL OR template_path LIKE 'templates/%'),
  template_name text NOT NULL CHECK (length(template_name) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);
ALTER TABLE public.member_waiting_forms ENABLE ROW LEVEL SECURITY;
-- No policy: read and written only through the functions below.
COMMENT ON TABLE public.member_waiting_forms IS
  'The waiting-list form, one row per version (Sales Groups › Waiting list › Form settings). Read through member_waiting_form(), written by member_save_waiting_form().';

INSERT INTO public.member_waiting_forms(version, fields, require_upload, template_name) VALUES (1, '[
  {"id":"newPerson","label":"New member name","type":"text","required":true,"builtin":true,"placeholder":"Full name as per IC"},
  {"id":"contact","label":"Phone number","type":"phone","required":true,"builtin":true,"placeholder":"e.g. 012-345 6789"},
  {"id":"target","label":"Preferred sub-department","type":"dropdown","required":true,"builtin":true},
  {"id":"start","label":"Preferred start date","type":"date","required":true,"builtin":true}
]'::jsonb, false, 'HOUZS Revenue - Waiting list application.html');

SELECT public.audit_register('member_waiting_forms', 'Waiting list form', 'Member services', '{member_requests_manage}', 'all',
  p_keys => '{version}', p_labels => '{template_name}');

-- ── 4. Storage: HR's application forms ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('member-forms', 'member-forms', false, 10485760, ARRAY[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html', 'image/png', 'image/jpeg'
])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY member_forms_templates_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'member-forms' AND (storage.foldername(name))[1] = 'templates'
    AND ((SELECT public.member_is_manager('member_requests_manage')) OR (SELECT public.has_perm('member_requests'))));
CREATE POLICY member_forms_templates_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'member-forms' AND (storage.foldername(name))[1] = 'templates'
    AND (SELECT public.member_is_manager('member_requests_manage')));

-- ── 5. Functions ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_waiting_form()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE AND public.has_perm('member_requests') IS NOT TRUE THEN
    RAISE EXCEPTION 'Member request access is required' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object('version', f.version, 'fields', f.fields, 'requireUpload', f.require_upload,
      'templatePath', f.template_path, 'templateName', f.template_name, 'createdAt', f.created_at)
    FROM public.member_waiting_forms f ORDER BY f.version DESC LIMIT 1
  );
END
$$;

-- The four questions member_prepare_request needs: always there, always
-- required, their kind fixed. HR's own may be added, removed and reordered.
CREATE OR REPLACE FUNCTION public.member_save_waiting_form(p_fields jsonb, p_require_upload boolean, p_template_path text, p_template_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_builtin constant jsonb := '{"newPerson":"text","contact":"phone","target":"dropdown","start":"date"}';
  v_field jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_type text;
  v_label text;
  v_version integer;
  v_options jsonb;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fields) NOT BETWEEN 4 AND 40 THEN
    RAISE EXCEPTION 'A form has from 4 to 40 questions' USING ERRCODE = '22023';
  END IF;
  FOR v_field IN SELECT value FROM jsonb_array_elements(p_fields) LOOP
    v_id := v_field ->> 'id';
    v_type := v_field ->> 'type';
    v_label := btrim(coalesce(v_field ->> 'label', ''));
    IF v_id IS NULL OR v_id !~ '^[A-Za-z][A-Za-z0-9_]{0,40}$' OR v_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'Every question needs its own id' USING ERRCODE = '22023';
    END IF;
    v_ids := v_ids || v_id;
    IF length(v_label) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Every question needs a label of at most 120 characters' USING ERRCODE = '22023';
    END IF;
    IF v_type IS NULL OR v_type NOT IN ('text', 'dropdown', 'date', 'yesno', 'phone') THEN
      RAISE EXCEPTION 'A question is Text, Dropdown, Date, Yes / No or Phone' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_field -> 'required') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Say whether each question is required' USING ERRCODE = '22023';
    END IF;
    IF v_builtin ? v_id THEN
      IF v_type IS DISTINCT FROM v_builtin ->> v_id OR (v_field ->> 'required')::boolean IS NOT TRUE
        OR (v_field ->> 'builtin')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'The built-in questions stay required and keep their kind' USING ERRCODE = '22023';
      END IF;
    ELSIF coalesce((v_field ->> 'builtin')::boolean, false) THEN
      RAISE EXCEPTION 'Only the four built-in questions are built in' USING ERRCODE = '22023';
    END IF;
    IF v_type = 'dropdown' AND NOT v_builtin ? v_id THEN
      v_options := v_field -> 'options';
      IF jsonb_typeof(v_options) IS DISTINCT FROM 'array' OR jsonb_array_length(v_options) NOT BETWEEN 1 AND 30
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_options) o WHERE jsonb_typeof(o) <> 'string' OR length(btrim(o #>> '{}')) NOT BETWEEN 1 AND 80)
        OR (SELECT count(DISTINCT lower(btrim(o #>> '{}'))) FROM jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options) THEN
        RAISE EXCEPTION 'A dropdown has from 1 to 30 different options' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  IF NOT (v_ids @> ARRAY['newPerson', 'contact', 'target', 'start']) THEN
    RAISE EXCEPTION 'The four built-in questions cannot be removed' USING ERRCODE = '22023';
  END IF;
  IF p_template_path IS NOT NULL AND p_template_path NOT LIKE 'templates/%' THEN
    RAISE EXCEPTION 'An uploaded form lives under templates/' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_template_name, ''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Name the application form' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('member-waiting-form', 0));
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM public.member_waiting_forms;
  INSERT INTO public.member_waiting_forms(version, fields, require_upload, template_path, template_name, created_by)
  VALUES (v_version, p_fields, coalesce(p_require_upload, false), p_template_path, btrim(p_template_name), auth.uid());
  RETURN public.member_waiting_form();
END
$$;

CREATE OR REPLACE FUNCTION public.member_fail_waiting(p_request uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.member_requests;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.kind IS DISTINCT FROM 'waiting' THEN RAISE EXCEPTION 'Waiting-list request not found'; END IF;
  IF r.status NOT IN ('waiting', 'reserved', 'accepted') THEN
    RAISE EXCEPTION 'Only somebody on the waiting list can be failed' USING ERRCODE = '22023';
  END IF;
  UPDATE public.member_requests
     SET status = 'failed', note = coalesce(nullif(btrim(p_note), ''), 'Did not come when called'),
         reserved_at = NULL, reservation_expires_at = NULL, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = r.id;
  RETURN public.member_request_json(r.id);
END
$$;

-- What People Management's employee form starts from when HR transfers an
-- applicant, and whether the sub-department has a seat for them.
CREATE OR REPLACE FUNCTION public.member_waiting_transfer(p_request uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.member_requests;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_cap integer;
  v_occupied integer;
  v_held integer;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.member_requests WHERE id = p_request;
  IF NOT FOUND OR r.kind IS DISTINCT FROM 'waiting' THEN RAISE EXCEPTION 'Waiting-list request not found'; END IF;
  SELECT headcount_limit INTO v_cap FROM public.member_department_capacity WHERE sub_department_id = r.sub_department_id;
  v_occupied := public.member_occupied(r.sub_department_id, v_today);
  SELECT count(*) INTO v_held FROM public.member_requests q
   WHERE q.sub_department_id = r.sub_department_id AND q.id <> r.id AND q.status IN ('reserved', 'accepted')
     AND q.reservation_expires_at > now()
     AND (q.allocated_staff_id IS NULL OR NOT public.member_has_membership(q.allocated_staff_id, q.sub_department_id));
  RETURN jsonb_build_object(
    'requestId', r.id, 'requestNo', r.request_no, 'status', r.status,
    'newPerson', r.detail ->> 'newPerson', 'contact', r.detail ->> 'contact', 'start', r.detail ->> 'start',
    'subDepartmentId', r.sub_department_id,
    'subDepartment', (SELECT d.name FROM public.comm_sub_departments d WHERE d.id = r.sub_department_id),
    'departmentId', (SELECT d.department_id FROM public.comm_sub_departments d WHERE d.id = r.sub_department_id),
    'submittedById', r.staff_id,
    'submittedBy', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.staff_id),
    'capacity', v_cap, 'occupied', v_occupied, 'held', v_held,
    'seatFree', v_cap IS NULL OR v_occupied + v_held < v_cap
  );
END
$$;

-- The employee People Management just created is the applicant: link them,
-- and the request is done. They must already be in the sub-department (the
-- base the form filed, or a membership).
CREATE OR REPLACE FUNCTION public.member_complete_waiting_transfer(p_request uuid, p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.member_requests;
  v_code text;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR r.kind IS DISTINCT FROM 'waiting' THEN RAISE EXCEPTION 'Waiting-list request not found'; END IF;
  IF r.status NOT IN ('waiting', 'reserved', 'accepted') THEN
    RAISE EXCEPTION 'This applicant is no longer on the waiting list' USING ERRCODE = '22023';
  END IF;
  SELECT s.employee_code INTO v_code FROM public.hr_staff_costs s
   WHERE s.id = p_staff AND s.status = 'active'
     AND (s.home_sub_department_id = r.sub_department_id OR public.member_has_membership(s.id, r.sub_department_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The new employee is not in this sub-department' USING ERRCODE = '22023';
  END IF;
  UPDATE public.member_requests
     SET status = 'executed', allocated_staff_id = p_staff, reserved_at = NULL, reservation_expires_at = NULL,
         note = 'Transferred to People Management' || coalesce(' as ' || v_code, ''), reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = r.id;
  RETURN public.member_request_json(r.id);
END
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['member_waiting_form()', 'member_save_waiting_form(jsonb, boolean, text, text)',
    'member_fail_waiting(uuid, text)', 'member_waiting_transfer(uuid)', 'member_complete_waiting_transfer(uuid, uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

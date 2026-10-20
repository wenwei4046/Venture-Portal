-- Production's own text, read with pg_get_functiondef on 2026-10-20, of the four functions that read or write a
-- person's address: team_directory (People for a directory reader), my_record (Me's own record), att_profile_changes
-- and att_profile_apply (Me's profile change, checked and applied). Loaded by validate-structured-address.mjs, which
-- checks each md5 before 20261020230000_structured_address swaps one statement into each.

-- att_profile_apply(uuid) md5(prosrc) 833ca652bcef25ca7a61970c52134951
CREATE OR REPLACE FUNCTION public.att_profile_apply(p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r    public.att_requests%ROWTYPE;
  v_set  jsonb;
  v_sql  text;
  v_user uuid;
  v_mail text;
BEGIN
  SELECT * INTO v_r FROM public.att_requests WHERE id = p_request AND kind = 'profile';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT jsonb_object_agg(c ->> 'key', c -> 'to') INTO v_set
    FROM jsonb_array_elements(coalesce(v_r.detail -> 'changes', '[]'::jsonb)) c
   WHERE c ->> 'key' IN ('contact_number', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone',
                         'emergency_contact_relationship', 'bank_name', 'bank_account_no');
  IF v_set IS NULL THEN
    RETURN;
  END IF;
  SELECT s.user_id INTO v_user FROM public.hr_staff_costs s WHERE s.id = v_r.staff_id;
  IF v_set ? 'email' AND v_user IS NOT NULL THEN
    v_mail := lower(v_set ->> 'email');
    IF v_mail IS NULL OR v_mail IS DISTINCT FROM (SELECT lower(a.email) FROM auth.users a WHERE a.id = v_user) THEN
      RAISE EXCEPTION 'Their email is the one they sign in with — approve it on HR › Attendance › Requests, which moves their login too.'
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.users SET email = v_mail, updated_at = now() WHERE id = v_user;
    v_set := jsonb_set(v_set, '{email}', to_jsonb(v_mail));
  END IF;
  SELECT string_agg(format('%I = $2 ->> %L', k, k), ', ') INTO v_sql FROM jsonb_object_keys(v_set) k;
  EXECUTE format('UPDATE public.hr_staff_costs SET %s WHERE id = $1', v_sql) USING v_r.staff_id, v_set;
  PERFORM public.att_event('request', p_request::text, v_r.staff_id, 'Record updated',
    (SELECT string_agg(c ->> 'field', ' · ') FROM jsonb_array_elements(v_r.detail -> 'changes') c));
END
$function$

;

-- att_profile_changes(uuid,jsonb) md5(prosrc) 0523f3b4003e4a011efdcd954efefcbf
CREATE OR REPLACE FUNCTION public.att_profile_changes(p_staff uuid, p_detail jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_labels CONSTANT jsonb := '{"contact_number": "Phone", "email": "Email", "address": "Address",
    "emergency_contact_name": "Emergency contact", "emergency_contact_phone": "Emergency phone",
    "emergency_contact_relationship": "Emergency relationship", "bank_name": "Bank", "bank_account_no": "Bank account"}';
  v_rec  jsonb;
  v_c    jsonb;
  v_key  text;
  v_to   text;
  v_from text;
  v_seen text[] := '{}';
  v_out  jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_detail -> 'changes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_detail -> 'changes') = 0 THEN
    RAISE EXCEPTION 'Name at least one field to change.' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(s) INTO v_rec FROM public.hr_staff_costs s WHERE s.id = p_staff;
  FOR v_c IN SELECT e FROM jsonb_array_elements(p_detail -> 'changes') e LOOP
    v_key := v_c ->> 'key';
    IF v_key IS NULL OR NOT (v_labels ? v_key) THEN
      RAISE EXCEPTION 'That field is not changed by request.' USING ERRCODE = '22023';
    END IF;
    IF v_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'A field is named twice.' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_key;
    v_to := nullif(btrim(coalesce(v_c ->> 'to', '')), '');
    IF v_key = 'email' THEN
      v_to := lower(v_to);
      IF (v_rec ->> 'user_id') IS NOT NULL AND v_to IS NULL THEN
        RAISE EXCEPTION 'Their login needs an email — name the new one.' USING ERRCODE = '22023';
      END IF;
      IF (v_rec ->> 'user_id') IS NOT NULL AND (
           EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = v_to AND u.id <> (v_rec ->> 'user_id')::uuid)
           OR EXISTS (SELECT 1 FROM auth.users a WHERE lower(a.email) = v_to AND a.id <> (v_rec ->> 'user_id')::uuid)) THEN
        RAISE EXCEPTION 'That email already belongs to another login.' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_key = 'bank_account_no' AND v_to IS NOT NULL THEN
      v_to := regexp_replace(v_to, '[[:space:]-]', '', 'g');
      IF v_to !~ '^[0-9]{5,20}$' THEN
        RAISE EXCEPTION 'An account number is 5 to 20 digits.' USING ERRCODE = '22023';
      END IF;
    ELSIF v_key IN ('contact_number', 'emergency_contact_phone') AND v_to IS NOT NULL
          AND (char_length(v_to) > 30 OR v_to !~ '^[0-9+() -]+$') THEN
      RAISE EXCEPTION 'Enter a phone number like 012-338 4127.' USING ERRCODE = '22023';
    ELSIF v_key = 'email' AND v_to IS NOT NULL AND v_to !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Enter an email address like name@houzs.my.' USING ERRCODE = '22023';
    ELSIF char_length(coalesce(v_to, '')) > 300 THEN
      RAISE EXCEPTION 'That is too long — at most 300 characters.' USING ERRCODE = '22023';
    END IF;
    v_from := nullif(btrim(coalesce(v_rec ->> v_key, '')), '');
    CONTINUE WHEN v_from IS NOT DISTINCT FROM v_to;
    v_out := v_out || jsonb_build_array(jsonb_build_object('key', v_key, 'field', v_labels ->> v_key, 'from', v_from, 'to', v_to));
  END LOOP;
  IF jsonb_array_length(v_out) = 0 THEN
    RAISE EXCEPTION 'Nothing to change — the record already says that.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_set(p_detail, '{changes}', v_out);
END
$function$

;

-- my_record() md5(prosrc) 026659f4fcb8a35d30b5bc3b5c9c102f — production's text ends its lines \r\n (it was applied from
-- a Windows checkout); kept here with \n, md5 e88f9347bb502f71146a7a5f7bb91564 (production's with \r\n read as \n).
CREATE OR REPLACE FUNCTION public.my_record()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid := public.att_my_staff_id();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501'; END IF;
  IF v_me IS NULL THEN RETURN NULL; END IF;
  RETURN (
    SELECT jsonb_build_object(
             'id', s.id, 'name', s.employee_name, 'code', s.employee_code, 'title', coalesce(t.name, s.designation),
             'department', d.name, 'hireDate', s.hire_date, 'upline', up.employee_name,
             'phone', s.contact_number, 'email', s.email, 'address', s.address,
             'ecName', s.emergency_contact_name, 'ecPhone', s.emergency_contact_phone, 'ecRel', s.emergency_contact_relationship,
             'bank', s.bank_name, 'photo', s.photo_path,
             'accountLast4', nullif(right(regexp_replace(coalesce(s.bank_account_no, ''), '\D', '', 'g'), 4), ''),
             'nric', CASE WHEN length(regexp_replace(coalesce(s.nric, ''), '\D', '', 'g')) >= 5
                          THEN left(regexp_replace(s.nric, '\D', '', 'g'), 1) || '•••••-••-' || right(regexp_replace(s.nric, '\D', '', 'g'), 4) END)
      FROM public.hr_staff_costs s
      LEFT JOIN public.titles t ON t.id = s.title_id
      LEFT JOIN public.departments d ON d.id = s.department_id
      LEFT JOIN public.hr_staff_costs up ON up.id = s.reports_to
     WHERE s.id = v_me);
END
$function$

;

-- team_directory(uuid[]) md5(prosrc) 1e99de7df0dd0925cfc00feb4fdb412a
CREATE OR REPLACE FUNCTION public.team_directory(p_staff_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS MATERIALIZED (
    SELECT (public.has_perm('team') OR public.has_perm('team_directory')) AS opens,
           public.current_actions() ->> 'team.view' AS reach,
           public.sees_sensitive('salary') AS salary,
           public.sees_sensitive('nric') AS nric,
           public.sees_sensitive('bank') AS bank,
           public.current_user_department_id() AS dept,
           auth.uid() AS uid
  )
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'id', s.id, 'employee_name', s.employee_name, 'employee_code', s.employee_code,
             'designation', s.designation, 'status', s.status, 'department_id', s.department_id,
             'home_sub_department_id', s.home_sub_department_id, 'title_id', s.title_id,
             'reports_to', s.reports_to, 'user_id', s.user_id, 'infotech_code', s.infotech_code,
             'hire_date', s.hire_date, 'resignation_date', s.resignation_date,
             'employment_type', s.employment_type, 'tax_mode', s.tax_mode,
             'epf_category', s.epf_category, 'socso_category', s.socso_category,
             'is_epf_exempt', s.is_epf_exempt, 'pcb_category', s.pcb_category,
             'children_count', s.children_count,
             'contact_number', s.contact_number, 'email', s.email, 'address', s.address,
             'emergency_contact_name', s.emergency_contact_name,
             'emergency_contact_phone', s.emergency_contact_phone,
             'emergency_contact_relationship', s.emergency_contact_relationship,
             'bank_name', s.bank_name, 'bank_name_2', s.bank_name_2,
             'created_by', s.created_by, 'created_at', s.created_at, 'updated_at', s.updated_at
           )
           || jsonb_build_object(
             -- What they are paid: only with Salary amounts ticked.
             'basic_salary', CASE WHEN me.salary THEN s.basic_salary END,
             'allowances', CASE WHEN me.salary THEN s.allowances END,
             'non_statutory_allowance', CASE WHEN me.salary THEN s.non_statutory_allowance END,
             'epf_er', CASE WHEN me.salary THEN s.epf_er END,
             'socso_er', CASE WHEN me.salary THEN s.socso_er END,
             'eis_er', CASE WHEN me.salary THEN s.eis_er END,
             'total_ctc', CASE WHEN me.salary THEN s.total_ctc END,
             'withholding_rate', CASE WHEN me.salary THEN s.withholding_rate END,
             -- PR4's rule: the value to a holder of the tick, •••• to anybody else, NULL as NULL.
             'nric', CASE WHEN nullif(btrim(s.nric), '') IS NULL OR me.nric THEN s.nric ELSE '••••' END,
             'bank_account_no', CASE WHEN nullif(btrim(s.bank_account_no), '') IS NULL OR me.bank
                                     THEN s.bank_account_no ELSE '••••' END,
             'bank_account_no_2', CASE WHEN nullif(btrim(s.bank_account_no_2), '') IS NULL OR me.bank
                                       THEN s.bank_account_no_2 ELSE '••••' END,
             'departments', CASE WHEN d.id IS NULL THEN NULL
                                 ELSE jsonb_build_object('name', d.name, 'payroll_source', d.payroll_source, 'segment_key', d.segment_key) END,
             'titles', CASE WHEN t.id IS NULL THEN NULL
                            ELSE jsonb_build_object('id', t.id, 'name', t.name, 'level_id', t.level_id,
                                                    'template_id', t.template_id, 'is_department_head', t.is_department_head) END,
             'users', CASE WHEN u.id IS NULL THEN NULL
                           ELSE jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.role,
                                                   'is_active', u.is_active, 'last_seen_at', u.last_seen_at) END
           )
           ORDER BY s.employee_name, s.id), '[]'::jsonb)
    FROM me
    CROSS JOIN public.hr_staff_costs s
    LEFT JOIN public.departments d ON d.id = s.department_id
    LEFT JOIN public.titles t ON t.id = s.title_id
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE me.opens
     AND (p_staff_ids IS NULL OR s.id = ANY (p_staff_ids))
     AND (me.reach = 'all'
          OR (me.reach = 'dept' AND me.dept IS NOT NULL AND s.department_id = me.dept)
          OR (me.reach = 'own' AND me.uid IS NOT NULL AND s.user_id = me.uid))
$function$

;

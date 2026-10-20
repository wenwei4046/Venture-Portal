-- Production's own text, read with pg_get_functiondef on 2026-10-20, of member_waiting_add (HR's "+") and
-- member_sub_department_requests (Sales Groups' waiting and replacement lists). Loaded by validate-waiting-edit.mjs,
-- which checks each md5 before 20261020190000_waiting_list_edit_any_revenue_submitter swaps one statement into each.

-- member_sub_department_requests(uuid) md5(prosrc) 75a80f3e8944f966e1e136e47db05092
CREATE OR REPLACE FUNCTION public.member_sub_department_requests(p_sub uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'requestNo', r.request_no,
      'kind', r.kind,
      'status', r.status,
      'createdAt', r.created_at,
      'submittedAt', r.submitted_at,
      'submittedBy', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id = r.staff_id),
      'newPerson', nullif(r.detail ->> 'newPerson', ''),
      'contact', nullif(r.detail ->> 'contact', ''),
      'start', nullif(r.detail ->> 'start', ''),
      'signature', nullif(r.detail ->> 'signature', ''),
      'signedForm', (
        SELECT jsonb_build_object(
          'name', r.detail ->> 'signedFormName',
          'type', a.mime_type,
          'at', a.created_at,
          'by', coalesce(
            (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = a.uploaded_by ORDER BY s.status = 'active' DESC LIMIT 1),
            (SELECT CASE u.role::text WHEN 'hr' THEN 'HR' WHEN 'principal' THEN 'Principal' WHEN 'finance' THEN 'Finance' ELSE initcap(replace(u.role::text, '_', ' ')) END
               FROM public.users u WHERE u.id = a.uploaded_by)
          )
        )
        FROM public.member_request_attachments a
        WHERE a.request_id = r.id
          AND a.content_sha256 = r.detail ->> 'signedFormHash'
          AND nullif(r.detail ->> 'signedFormName', '') IS NOT NULL
        ORDER BY a.created_at DESC
        LIMIT 1
      ),
      'original', (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.id::text = r.detail ->> 'originalStaffId'),
      'destination', nullif(r.detail ->> 'destination', ''),
      'replacementSource', nullif(r.detail ->> 'replacementSource', ''),
      'effective', nullif(r.detail ->> 'effective', ''),
      'reason', nullif(r.detail ->> 'reason', ''),
      'target', (SELECT d.name FROM public.comm_sub_departments d WHERE d.id::text = r.detail ->> 'targetDepartmentId'),
      'acceptedAt', (SELECT min(e.created_at) FROM public.member_request_events e WHERE e.request_id = r.id AND e.to_status = 'waiting'),
      'events', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'to', e.to_status,
          'at', e.created_at,
          'note', e.note,
          'by', coalesce(
            (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = e.actor_id ORDER BY s.status = 'active' DESC LIMIT 1),
            (SELECT CASE u.role::text WHEN 'hr' THEN 'HR' WHEN 'principal' THEN 'Principal' WHEN 'finance' THEN 'Finance' ELSE initcap(replace(u.role::text, '_', ' ')) END
               FROM public.users u WHERE u.id = e.actor_id)
          )
        ) ORDER BY e.created_at), '[]'::jsonb)
        FROM public.member_request_events e WHERE e.request_id = r.id
      )
    ) ORDER BY r.created_at)
    FROM public.member_requests r
    WHERE r.sub_department_id = p_sub
      AND r.kind IN ('waiting', 'replacement')
      AND r.status <> 'draft'
  ), '[]'::jsonb);
END
$function$

;

-- member_waiting_add(uuid,uuid,jsonb,uuid,boolean) md5(prosrc) cae67d2e9af8894a7e128166f12026dd
CREATE OR REPLACE FUNCTION public.member_waiting_add(p_sub uuid, p_staff uuid, p_detail jsonb, p_idempotency uuid, p_with_form boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dept       uuid;
  v_name       text := btrim(coalesce(p_detail ->> 'newPerson', ''));
  v_contact    text := btrim(coalesce(p_detail ->> 'contact', ''));
  v_form_name  text := left(btrim(coalesce(p_detail ->> 'signedFormName', '')), 200);
  v_form_hash  text := coalesce(p_detail ->> 'signedFormHash', '');
  v_with_form  boolean := coalesce(p_with_form, false);
  v_require    boolean;
  v_start      date;
  v_answers    jsonb := '[]'::jsonb;
  v_version    int;
  v_row        public.member_requests;
  v_constraint text;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE
     OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  IF p_sub IS NULL OR p_staff IS NULL OR p_idempotency IS NULL
     OR jsonb_typeof(p_detail) IS DISTINCT FROM 'object' OR octet_length(p_detail::text) > 40000 THEN
    RAISE EXCEPTION 'Invalid request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.member_requests WHERE created_by = auth.uid() AND idempotency_key = p_idempotency;
  IF FOUND THEN
    IF v_row.kind IS DISTINCT FROM 'waiting' OR v_row.sub_department_id IS DISTINCT FROM p_sub THEN
      RAISE EXCEPTION 'This submission key has already been used for a different request' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_row.id, 'requestNo', v_row.request_no, 'status', v_row.status, 'userId', auth.uid());
  END IF;

  SELECT d.department_id INTO v_dept FROM public.comm_sub_departments d WHERE d.id = p_sub AND d.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This sub-department is not open' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = p_staff AND s.status = 'active')
     OR NOT EXISTS (SELECT 1 FROM public.comm_sub_departments d
                     WHERE d.department_id IS NOT DISTINCT FROM v_dept AND public.member_has_membership(p_staff, d.id)) THEN
    RAISE EXCEPTION 'Pick who brought them in from the Revenue team' USING ERRCODE = '22023';
  END IF;

  IF v_name = '' OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'Enter the new member''s name' USING ERRCODE = '22023';
  END IF;
  IF v_contact = '' OR length(v_contact) > 60 THEN
    RAISE EXCEPTION 'Enter a phone number' USING ERRCODE = '22023';
  END IF;
  IF p_detail ->> 'start' IS DISTINCT FROM 'anytime' AND coalesce(p_detail ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Pick the joining date' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_start := CASE WHEN p_detail ->> 'start' = 'anytime' THEN NULL ELSE (p_detail ->> 'start')::date END;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Pick the joining date' USING ERRCODE = '22023';
  END;

  SELECT f.require_upload INTO v_require FROM public.member_waiting_forms f ORDER BY f.version DESC LIMIT 1;
  IF coalesce(v_require, false) AND NOT v_with_form THEN
    RAISE EXCEPTION 'Upload the signed application form' USING ERRCODE = '22023';
  END IF;
  IF v_with_form AND (v_form_name = '' OR v_form_hash !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'Attach the signed application form again' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.member_requests r
              WHERE r.sub_department_id = p_sub AND r.kind = 'waiting'
                AND r.status IN ('submitted', 'needs_info', 'waiting', 'reserved', 'accepted')
                AND r.detail ->> 'contact' = v_contact) THEN
    RAISE EXCEPTION 'This phone number is already on the waiting list, or waiting for review in Member services' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_detail -> 'answers') = 'array' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', a ->> 'id',
             'label', left(btrim(coalesce(a ->> 'label', '')), 120),
             'value', left(btrim(coalesce(a ->> 'value', '')), 500))), '[]'::jsonb)
      INTO v_answers
      FROM (SELECT a FROM jsonb_array_elements(p_detail -> 'answers') a LIMIT 40) x
     WHERE jsonb_typeof(a) = 'object' AND coalesce(a ->> 'id', '') ~ '^[A-Za-z][A-Za-z0-9_]{0,40}$';
  END IF;
  IF coalesce(p_detail ->> 'formVersion', '') ~ '^\d{1,6}$' THEN
    v_version := (p_detail ->> 'formVersion')::int;
  END IF;

  BEGIN
    INSERT INTO public.member_requests (created_by, staff_id, sub_department_id, kind, status, title, detail, idempotency_key,
                                        submitted_at, reviewed_by, reviewed_at, note)
    VALUES (auth.uid(), p_staff, p_sub, 'waiting', CASE WHEN v_with_form THEN 'draft' ELSE 'waiting' END,
            v_name || ' · Waiting List',
            jsonb_strip_nulls(jsonb_build_object('newPerson', v_name, 'contact', v_contact, 'start', CASE WHEN p_detail ->> 'start' = 'anytime' THEN 'anytime' ELSE v_start::text END,
              'answers', v_answers, 'formVersion', v_version, 'addedBy', 'hr',
              'signedFormName', CASE WHEN v_with_form THEN v_form_name END,
              'signedFormHash', CASE WHEN v_with_form THEN v_form_hash END)),
            p_idempotency,
            CASE WHEN v_with_form THEN NULL ELSE now() END,
            CASE WHEN v_with_form THEN NULL ELSE auth.uid() END,
            CASE WHEN v_with_form THEN NULL ELSE now() END,
            CASE WHEN v_with_form THEN NULL ELSE 'Added on Sales Groups' END)
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'member_waiting_unique_contact' THEN
      RAISE EXCEPTION 'This phone number is already on the waiting list, or waiting for review in Member services' USING ERRCODE = '22023';
    END IF;
    RAISE;
  END;
  RETURN jsonb_build_object('id', v_row.id, 'requestNo', v_row.request_no, 'status', v_row.status, 'userId', auth.uid());
END
$function$

;

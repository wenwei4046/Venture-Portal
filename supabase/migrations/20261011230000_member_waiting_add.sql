-- Sales Groups › Waiting list's "+" (2026-10-11, the user: "我点击「加」了过后，我可以直接加人进去这个
-- waiting list 里面"). HR puts somebody straight onto a sub-department's waiting list — no member form, no
-- Member services review. The row lands `waiting`: its own trigger (member_request_audit) writes the step
-- into `waiting`, so they join the END of the list, numbered by when they were added, and
-- member_requests_number gives them their RQ-YYMM-NNN. Nobody is notified (notify_member_request answers
-- only a move into `submitted`).
--
-- The user's answers (2026-10-11):
--   · "Submitted by" is ALWAYS somebody from the Revenue team — active, with a current placement in a
--     sub-department of the same department (the member form's own rule: a membership, in that
--     department). It is the person Transfer later puts the new member under, and who sees them as
--     "Yours" in the Revenue app's queue.
--   · Only the basics are asked: name, phone, joining date. HR's own questions (Form settings) ride in
--     detail.answers as the member form sends them, and may be left blank.
--   · The signed application form follows Form settings: while "Members must upload the signed form" is
--     off it may be attached; once it is on, "+" asks for it too — one rule for both ways onto the list.
--
-- With a form the add takes two steps, so the file goes where a member's does, under the adder's own
-- session and the bucket's own policies (member_invoice_insert: the creator's folder of their DRAFT):
--   1. member_waiting_add(…, p_with_form => true) keeps the row a draft, its detail naming the form
--      (signedFormName, signedFormHash — the server's sha256 of the bytes it checked);
--   2. the server uploads the file to member-invoices/<uid>/<request>/<uuid>.<pdf|png|jpg>;
--   3. member_waiting_add_form(request, path) finds the object really there, attests it in
--      member_request_attachments (the member path does that with the service role; here this
--      function does it, as the adder) and puts the row on the list.
-- A draft whose upload never finished stays a draft: no list, no review inbox, no number shows one.
--
-- Also asked: the same key twice is the same add (a request sent again); one open place per phone number in
-- a sub-department — asked before the insert, and again by member_waiting_unique_contact in a race (also when
-- a draft goes on the list), said in words either way.
--
-- (Production keeps no comment lines inside a function body: the comments stay out here.)
--
-- The gate, on both: Member services · Edit (member.manage) — the action the app's gate asks,
-- has_any_action — and the member back office's own door, member_is_manager('member_requests_manage'),
-- the one every other waiting-list function asks (the list itself, Fail, the form). No page narrows
-- member.manage (no tab on Sales Groups carries it), so there is no tab_write_guard (mig 20261011220100).

CREATE OR REPLACE FUNCTION public.member_waiting_add(p_sub uuid, p_staff uuid, p_detail jsonb, p_idempotency uuid,
                                                    p_with_form boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF coalesce(p_detail ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Pick the joining date' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_start := (p_detail ->> 'start')::date;
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
            jsonb_strip_nulls(jsonb_build_object('newPerson', v_name, 'contact', v_contact, 'start', v_start::text,
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
$$;

CREATE OR REPLACE FUNCTION public.member_waiting_add_form(p_request uuid, p_path text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.member_requests;
  v_size       bigint;
  v_mime       text;
  v_constraint text;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE
     OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_row.created_by IS DISTINCT FROM auth.uid() OR v_row.kind IS DISTINCT FROM 'waiting'
     OR v_row.status IS DISTINCT FROM 'draft' OR v_row.detail ->> 'addedBy' IS DISTINCT FROM 'hr'
     OR coalesce(v_row.detail ->> 'signedFormHash', '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'This addition is no longer waiting for its form. Close the window and look at the list.' USING ERRCODE = '22023';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^' || auth.uid()::text || '/' || p_request::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$') THEN
    RAISE EXCEPTION 'Attach the signed application form again' USING ERRCODE = '22023';
  END IF;
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Attach the signed application form again' USING ERRCODE = '22023';
  END IF;
  EXECUTE 'SELECT (o.metadata ->> ''size'')::bigint, o.metadata ->> ''mimetype'' FROM storage.objects o
            WHERE o.bucket_id = ''member-invoices'' AND o.name = $1'
     INTO v_size, v_mime USING p_path;
  IF v_size IS NULL OR v_size < 1 OR v_size > 3145728 OR v_mime IS NULL
     OR v_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN
    RAISE EXCEPTION 'Attach the signed application form again' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.member_request_attachments (request_id, uploaded_by, object_path, mime_type, size_bytes, content_sha256)
  VALUES (v_row.id, auth.uid(), p_path, v_mime, v_size, v_row.detail ->> 'signedFormHash');
  BEGIN
    UPDATE public.member_requests
       SET status = 'waiting', submitted_at = now(), reviewed_by = auth.uid(), reviewed_at = now(), note = 'Added on Sales Groups'
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'member_waiting_unique_contact' THEN
      RAISE EXCEPTION 'This phone number is already on the waiting list, or waiting for review in Member services' USING ERRCODE = '22023';
    END IF;
    RAISE;
  END;
  RETURN jsonb_build_object('id', v_row.id, 'requestNo', v_row.request_no, 'status', v_row.status);
END
$$;

REVOKE ALL ON FUNCTION public.member_waiting_add(uuid, uuid, jsonb, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_waiting_add(uuid, uuid, jsonb, uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.member_waiting_add_form(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_waiting_add_form(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.member_waiting_add(uuid, uuid, jsonb, uuid, boolean) IS
  'Sales Groups › Waiting list''s "+" (2026-10-11): HR adds somebody straight onto a sub-department''s waiting list — the end of it. Submitted by = an active Revenue-team member; name, phone, joining date required; HR''s own questions optional; the signed form as Form settings asks (with one: a draft until member_waiting_add_form). member.manage + member_is_manager(''member_requests_manage'').';
COMMENT ON FUNCTION public.member_waiting_add_form(uuid, text) IS
  'Sales Groups › Waiting list''s "+" with a signed form (2026-10-11): finds the adder''s upload in member-invoices, attests it in member_request_attachments and puts the draft on the list. member.manage + member_is_manager(''member_requests_manage'').';

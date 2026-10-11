-- ============================================================================
-- 20261011130000_member_replacement_form.sql
-- The replacement list gets its own form, as the waiting list has (round 2 of
-- the HR revamp, "Part 1" — README 18.5; 2026-10-11, the user: "Proceed").
-- ============================================================================
--
-- Sales Groups › Replacement list has the same Upload form and Form settings
-- as the waiting list (mig 20261010140000): a VERSIONED form whose built-in
-- questions are the ones member_prepare_request needs for a replacement —
-- Member leaving, Arrangement, Replaced by, Effective date and Reason — then
-- HR's own; whether the signed form must be uploaded; and the form members
-- download (HR's upload, else the black-and-white one built from the
-- questions). The handoff lists Reason among HR's own questions; it is built
-- in here because member_prepare_request refuses a replacement without one.
-- v1 is the handoff's: the five, then "Handover done?" (Yes / No, optional).
--
-- 1. `member_replacement_forms`, one row per version (RLS on, no policy —
--    read and written only through the two functions below), audited.
-- 2. member_replacement_form()          the current version — whoever manages
--                                       member requests or may send them
--    member_save_replacement_form(...)  a new version (HR) — the waiting
--                                       form's checks, its own built-ins
-- 3. The Revenue app sends a replacement on that form: its signed form goes
--    where a waiting list's does (`member-invoices`, the member's folder under
--    their draft, attested by the server) — the insert policy allows a
--    replacement draft too.
-- 4. member_prepare_request refuses a replacement missing an answer to a
--    REQUIRED question of HR's; member_submit_request refuses to send one
--    without its attested signed form while the form requires one. Both are
--    changed from PRODUCTION's bodies, statement by statement: each is read
--    from the live database, checked against the md5 it was written against
--    (2026-10-11), and every swap must match exactly once (CLAUDE.md › Do NOT).

-- ── 1. The replacement form, versioned ──────────────────────────────────────

CREATE TABLE public.member_replacement_forms (
  version integer PRIMARY KEY CHECK (version > 0),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  require_upload boolean NOT NULL DEFAULT false,
  template_path text CHECK (template_path IS NULL OR template_path LIKE 'templates/%'),
  template_name text NOT NULL CHECK (length(template_name) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id)
);
ALTER TABLE public.member_replacement_forms ENABLE ROW LEVEL SECURITY;
-- No policy: read and written only through the functions below.
COMMENT ON TABLE public.member_replacement_forms IS
  'The replacement form, one row per version (Sales Groups › Replacement list › Form settings). Read through member_replacement_form(), written by member_save_replacement_form().';

INSERT INTO public.member_replacement_forms(version, fields, require_upload, template_name) VALUES (1, '[
  {"id":"original","label":"Member leaving","type":"dropdown","required":true,"builtin":true,"options":["From the team list"]},
  {"id":"destination","label":"Arrangement","type":"dropdown","required":true,"builtin":true,"options":["Leave this department only","Leave the company","Transfer to another department"]},
  {"id":"source","label":"Replaced by","type":"dropdown","required":true,"builtin":true,"options":["New member joining","Existing member","Waiting list","Release the position"]},
  {"id":"effective","label":"Effective date","type":"date","required":true,"builtin":true},
  {"id":"reason","label":"Reason","type":"text","required":true,"builtin":true},
  {"id":"q_handover","label":"Handover done?","type":"yesno","required":false}
]'::jsonb, false, 'HOUZS Revenue - Replacement form.html');

SELECT public.audit_register('member_replacement_forms', 'Replacement form', 'Member services', '{member_requests_manage}', 'all',
  p_keys => '{version}', p_labels => '{template_name}');

-- ── 2. Functions ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_replacement_form()
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
    FROM public.member_replacement_forms f ORDER BY f.version DESC LIMIT 1
  );
END
$$;

-- The five questions member_prepare_request needs for a replacement: always
-- there, always required, their kind fixed. HR's own may be added, removed and
-- reordered.
CREATE OR REPLACE FUNCTION public.member_save_replacement_form(p_fields jsonb, p_require_upload boolean, p_template_path text, p_template_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_builtin constant jsonb := '{"original":"dropdown","destination":"dropdown","source":"dropdown","effective":"date","reason":"text"}';
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
  IF jsonb_typeof(p_fields) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fields) NOT BETWEEN 5 AND 40 THEN
    RAISE EXCEPTION 'A form has from 5 to 40 questions' USING ERRCODE = '22023';
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
      RAISE EXCEPTION 'Only the five built-in questions are built in' USING ERRCODE = '22023';
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
  IF NOT (v_ids @> ARRAY['original', 'destination', 'source', 'effective', 'reason']) THEN
    RAISE EXCEPTION 'The five built-in questions cannot be removed' USING ERRCODE = '22023';
  END IF;
  IF p_template_path IS NOT NULL AND p_template_path NOT LIKE 'templates/%' THEN
    RAISE EXCEPTION 'An uploaded form lives under templates/' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_template_name, ''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Name the replacement form' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('member-replacement-form', 0));
  SELECT coalesce(max(version), 0) + 1 INTO v_version FROM public.member_replacement_forms;
  INSERT INTO public.member_replacement_forms(version, fields, require_upload, template_path, template_name, created_by)
  VALUES (v_version, p_fields, coalesce(p_require_upload, false), p_template_path, btrim(p_template_name), auth.uid());
  RETURN public.member_replacement_form();
END
$$;

REVOKE ALL ON FUNCTION public.member_replacement_form() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_save_replacement_form(jsonb, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_replacement_form() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_save_replacement_form(jsonb, boolean, text, text) TO authenticated, service_role;

-- ── 3. The signed form may be uploaded to a replacement draft ───────────────

DROP POLICY IF EXISTS member_invoice_insert ON storage.objects;
CREATE POLICY member_invoice_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'member-invoices'
  AND (storage.foldername(name))[1] = ((SELECT auth.uid() AS uid))::text
  AND EXISTS (
    SELECT 1 FROM public.member_requests r
     WHERE (r.id)::text = (storage.foldername(objects.name))[2]
       AND r.created_by = auth.uid()
       AND r.status = 'draft'
       AND r.kind IN ('claim', 'waiting', 'replacement')
  )
);

-- ── 4. The two functions, from production's bodies ──────────────────────────

DO $patch$
DECLARE
  v_src text;
  v_old text;
  v_new text;
  v_count int;
BEGIN
  -- member_prepare_request ------------------------------------------------
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'member_prepare_request';
  IF md5(v_src) <> 'dd6cf9dc3f83f0154587f64da98129a3' THEN
    RAISE EXCEPTION 'member_prepare_request is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;

  -- HR's required questions on the replacement form must be answered.
  v_old := 'v_date:=(p_detail->>''effective'')::date;';
  v_new := 'v_date:=(p_detail->>''effective'')::date;'
    || E'\n IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce((SELECT f.fields FROM public.member_replacement_forms f ORDER BY f.version DESC LIMIT 1),''[]''::jsonb)) q'
    || E'\n  WHERE coalesce((q->>''required'')::boolean,false) AND NOT coalesce((q->>''builtin'')::boolean,false)'
    || E'\n  AND length(trim(coalesce((SELECT a->>''value'' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_detail->''answers'')=''array'' THEN p_detail->''answers'' ELSE ''[]''::jsonb END) a WHERE a->>''id''=q->>''id'' LIMIT 1),'''')))=0)'
    || E'\n THEN RAISE EXCEPTION ''Answer every required question on the replacement form''; END IF;';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_prepare_request: the effective date line matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, v_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid DEFAULT NULL::uuid) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L', v_src);

  -- member_submit_request ---------------------------------------------------
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'member_submit_request';
  IF md5(v_src) <> '75f2f7de44d988419a4915f55527a72a' THEN
    RAISE EXCEPTION 'member_submit_request is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;

  -- The replacement's signed form, when HR's form asks for it.
  v_old := 'UPDATE public.member_requests SET status=''submitted'',submitted_at=now(),claim_id=v_claim WHERE id=r.id;';
  v_new := 'IF r.kind=''replacement'' AND coalesce((SELECT f.require_upload FROM public.member_replacement_forms f ORDER BY f.version DESC LIMIT 1),false)'
    || E'\n AND NOT EXISTS(SELECT 1 FROM public.member_request_attachments a JOIN storage.objects o ON o.bucket_id=''member-invoices'' AND o.name=a.object_path'
    || E'\n  WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>''signedFormHash'') THEN'
    || E'\n  RAISE EXCEPTION ''Upload the signed replacement form before sending'';'
    || E'\n END IF;'
    || E'\n ' || v_old;
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_submit_request: the submit update matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, v_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.member_submit_request(p_request uuid) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L', v_src);
END
$patch$;

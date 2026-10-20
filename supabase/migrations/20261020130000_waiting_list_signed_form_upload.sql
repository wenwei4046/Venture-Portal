-- ============================================================================
-- 20261020130000_waiting_list_signed_form_upload.sql
-- Sales Groups › Waiting list: the applicant's signed form in their drawer — View, and Upload (2026-10-20, the
-- user, on JOAN QUEK XIAO's drawer: "i want here can be view for the letter they submit, then can be upload as
-- well, the file").
-- ============================================================================
--
-- The letter is the signed application form: the one a member sends with *Submit waiting list* in the Revenue
-- app, or HR attaches with "+" (mig 20261011230000). It lives in the private bucket member-invoices, attested in
-- member_request_attachments and named by the request (detail.signedFormName, detail.signedFormHash — the
-- server's sha256 of the bytes it checked); Member services opens it (*Signed form · View ↗*). Sales Groups now
-- shows it in the applicant's drawer, and HR may upload it there for somebody already on the list — added with
-- "+" and no form (all five on Fair's list when this was written), or a better copy of a member's (Replace). A
-- replaced file stays where it is, attested — an attachment is a record — and the request names the new one, so
-- Member services and the Revenue app open the new one too.
--
-- 1. member_sub_department_requests (production's body, md5 b5f8cace…, one statement swapped — pg_temp.swap_check
--    as in 20261014213000; a body already swapped is left alone): each row names its signed form — `signedForm`
--    {name, type, at, by} when an attested file matches the request's signedFormHash, else null. `by` as the
--    history names an actor: their staff name, else their login's role.
--
-- 2. member_waiting_attach_form(request, path, name, hash) — DEFINER, both doors "+" asks:
--    member_is_manager('member_requests_manage') (the waiting list's own) and has_any_action(['member.manage'])
--    (Member services · Edit — no tab on Sales Groups carries it, so no tab_write_guard, as "+"). The request is a
--    waiting list's still ON the list (waiting / reserved / accepted). The file is the one the server uploaded
--    under the caller's own session to member-invoices/<uid>/<request>/<uuid>.<pdf|png|jpg>, found in
--    storage.objects (1 byte to 3 MB, PDF / PNG / JPEG, its extension its type) — the hash is the server's of
--    the bytes it looked at, as with "+". The same file twice is refused. Attests it, makes it the request's
--    signed form, and writes its step in the history: a step with no move (from = to = the status), note
--    "Signed form uploaded · <name>". Member services' and the Revenue app's histories show only moves
--    (member_admin_request_facts, member_request_history), so the step is Sales Groups' alone.
--
-- 3. The bucket (no policy changed, three added):
--    * member_invoice_waiting_form_insert — a manager with Member services · Edit puts a file into their OWN
--      folder of a waiting list's request that is on the list (member_invoice_insert asks for the uploader's own
--      draft, so HR could not attach to a member's request, nor to a "+" row once it was on the list);
--    * member_invoice_unattested_manager_read / _delete — a manager sees and removes a file in their own folder
--      that no attachment names: the clean-up when the attestation is refused. (A DELETE through the Storage API
--      reads the row it deletes, so SELECT is asked too — mig 20261011234000.) An attested file is read as before
--      (member_invoice_read: its request's sender, or a manager) and is never removed.
--
-- (Production keeps no comment lines inside a function body: the comments stay out here.)
-- PGlite: tests/member-sql/validate-waiting-signed-form.mjs (this migration verbatim, over production's
-- member_sub_department_requests from 20261010130000 and the bucket's policies as production has them).

-- ── 1. The list names each applicant's signed form ──────────────────────────

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

SELECT pg_temp.swap_check('public.member_sub_department_requests(uuid)',
  $q$'signature', nullif(r.detail ->> 'signature', ''),$q$,
  $q$'signature', nullif(r.detail ->> 'signature', ''),
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
      ),$q$);

-- ── 2. HR attaches the signed form to somebody on the list ──────────────────

CREATE OR REPLACE FUNCTION public.member_waiting_attach_form(p_request uuid, p_path text, p_name text, p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row  public.member_requests;
  v_name text := left(btrim(coalesce(p_name, '')), 200);
  v_size bigint;
  v_mime text;
  v_at   timestamptz;
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE
     OR public.has_any_action(ARRAY['member.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION 'HR management access is required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.member_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR v_row.kind IS DISTINCT FROM 'waiting'
     OR coalesce(v_row.status, '') NOT IN ('waiting', 'reserved', 'accepted') THEN
    RAISE EXCEPTION 'This applicant is no longer on the waiting list. Reload the page.' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' OR coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Attach the signed form again' USING ERRCODE = '22023';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^' || auth.uid()::text || '/' || p_request::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$') THEN
    RAISE EXCEPTION 'Attach the signed form again' USING ERRCODE = '22023';
  END IF;
  IF v_row.detail ->> 'signedFormHash' IS NOT DISTINCT FROM p_hash
     AND EXISTS (SELECT 1 FROM public.member_request_attachments a WHERE a.request_id = v_row.id AND a.content_sha256 = p_hash) THEN
    RAISE EXCEPTION 'This file is already their signed form' USING ERRCODE = '22023';
  END IF;
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Attach the signed form again' USING ERRCODE = '22023';
  END IF;
  EXECUTE 'SELECT (o.metadata ->> ''size'')::bigint, o.metadata ->> ''mimetype'' FROM storage.objects o
            WHERE o.bucket_id = ''member-invoices'' AND o.name = $1'
     INTO v_size, v_mime USING p_path;
  IF v_size IS NULL OR v_size < 1 OR v_size > 3145728 OR v_mime IS NULL
     OR v_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg')
     OR right(p_path, 4) IS DISTINCT FROM (CASE v_mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/png' THEN '.png' ELSE '.jpg' END) THEN
    RAISE EXCEPTION 'Attach the signed form again' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.member_request_attachments (request_id, uploaded_by, object_path, mime_type, size_bytes, content_sha256)
  VALUES (v_row.id, auth.uid(), p_path, v_mime, v_size, p_hash)
  RETURNING created_at INTO v_at;
  UPDATE public.member_requests
     SET detail = detail || jsonb_build_object('signedFormName', v_name, 'signedFormHash', p_hash)
   WHERE id = v_row.id;
  INSERT INTO public.member_request_events (request_id, actor_id, from_status, to_status, note)
  VALUES (v_row.id, auth.uid(), v_row.status, v_row.status, 'Signed form uploaded · ' || v_name);
  RETURN jsonb_build_object(
    'name', v_name,
    'type', v_mime,
    'at', v_at,
    'by', coalesce(
      (SELECT s.employee_name FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() ORDER BY s.status = 'active' DESC LIMIT 1),
      (SELECT CASE u.role::text WHEN 'hr' THEN 'HR' WHEN 'principal' THEN 'Principal' WHEN 'finance' THEN 'Finance' ELSE initcap(replace(u.role::text, '_', ' ')) END
         FROM public.users u WHERE u.id = auth.uid())
    )
  );
END
$$;

REVOKE ALL ON FUNCTION public.member_waiting_attach_form(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_waiting_attach_form(uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.member_waiting_attach_form(uuid, text, text, text) IS
  'Sales Groups › Waiting list (2026-10-20): HR uploads an applicant''s signed form in their drawer — a waiting list''s request still on the list; the file the server put in member-invoices/<uid>/<request>/ found, attested in member_request_attachments and made the request''s signed form; its step in the history. member.manage + member_is_manager(''member_requests_manage'').';

-- ── 3. The bucket: HR's own folder of a request on the list ─────────────────

DROP POLICY IF EXISTS member_invoice_waiting_form_insert ON storage.objects;
CREATE POLICY member_invoice_waiting_form_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'member-invoices'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (SELECT public.member_is_manager('member_requests_manage'))
  AND (SELECT public.has_any_action(ARRAY['member.manage']))
  AND EXISTS (SELECT 1 FROM public.member_requests r
               WHERE r.id::text = (storage.foldername(objects.name))[2]
                 AND r.kind = 'waiting'
                 AND r.status IN ('waiting', 'reserved', 'accepted'))
);

DROP POLICY IF EXISTS member_invoice_unattested_manager_read ON storage.objects;
CREATE POLICY member_invoice_unattested_manager_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'member-invoices'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (SELECT public.member_is_manager('member_requests_manage'))
  AND NOT EXISTS (SELECT 1 FROM public.member_request_attachments a WHERE a.object_path = objects.name)
);

DROP POLICY IF EXISTS member_invoice_unattested_manager_delete ON storage.objects;
CREATE POLICY member_invoice_unattested_manager_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'member-invoices'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (SELECT public.member_is_manager('member_requests_manage'))
  AND NOT EXISTS (SELECT 1 FROM public.member_request_attachments a WHERE a.object_path = objects.name)
);

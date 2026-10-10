-- ============================================================================
-- 20261010180000_member_waiting_form_in_the_app.sql
-- The Revenue app sends the waiting list the way HR's form now asks for it,
-- and a member may edit what HR has not touched yet (HR revamp 7a/8,
-- 2026-10-10).
-- ============================================================================
--
-- Sales Groups › Waiting list › Form settings (PR3b) versions the form:
-- the four built-in questions member_prepare_request always needed, then
-- HR's own, and whether the signed application form must be uploaded. The
-- Revenue app now draws that form, so:
--
--   1. A signed application form is uploaded the way a claim's invoice is:
--      into `member-invoices` under the member's own folder and their draft
--      request, attested by the server (member_request_attachments) after it
--      has looked at the bytes. The insert policy allowed claims only; it now
--      allows a waiting-list draft too.
--   2. member_prepare_request refuses a waiting list missing an answer to a
--      REQUIRED question of HR's (built-ins are checked as before); the
--      answers ride in `detail.answers` [{id, label, value}] with
--      `detail.formVersion`.
--   3. member_submit_request refuses to send a waiting list without its
--      attested signed form while the form requires one.
--   4. Edit request (the handoff: "Edit request" → Update): a waiting-list
--      or replacement request still `submitted` — HR has not acted on it —
--      may be revised like a returned one. The revision goes back through
--      draft and is sent again, its note "Updated by the member".
--
-- 2 and 3/4 change production's own function bodies, statement by statement:
-- each body is read from the live database, checked against the md5 it was
-- written against, and every swap must match exactly once — so nothing a
-- fix made straight on production is undone by an older copy (CLAUDE.md ›
-- Do NOT).

-- ── 1. The signed form may be uploaded to a waiting-list draft ──────────────

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
       AND r.kind IN ('claim', 'waiting')
  )
);

-- ── 2–4. The two functions, from production's bodies ────────────────────────

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
  IF md5(v_src) <> 'ece40f835fbaa0d9829fa8e01b5cc2f6' THEN
    RAISE EXCEPTION 'member_prepare_request is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;

  -- (4) A submitted waiting list or replacement may be revised too.
  v_old := 'RAISE EXCEPTION ''Request is no longer awaiting your information; refresh and retry'';';
  v_new := 'IF NOT (v_existing.status=''submitted'' AND p_kind IN (''waiting'',''replacement'')) THEN RAISE EXCEPTION ''Request is no longer awaiting your information; refresh and retry''; END IF;';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_prepare_request: the refusal to revise matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, v_new);

  v_old := 'UPDATE public.member_requests SET status=''draft'',title=v_title,detail=p_detail,idempotency_key=p_idempotency,allocated_staff_id=NULL WHERE id=p_revision AND created_by=auth.uid() AND status=''needs_info'' RETURNING id INTO v_id;';
  v_new := 'UPDATE public.member_requests SET status=''draft'',title=v_title,detail=p_detail,idempotency_key=p_idempotency,allocated_staff_id=NULL,note=CASE WHEN status=''submitted'' THEN ''Updated by the member'' ELSE note END WHERE id=p_revision AND created_by=auth.uid() AND (status=''needs_info'' OR (status=''submitted'' AND kind IN (''waiting'',''replacement''))) RETURNING id INTO v_id;';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_prepare_request: the revision update matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, v_new);

  -- (2) HR's required questions must be answered.
  v_old := 'v_date:=(p_detail->>''start'')::date;';
  v_new := 'v_date:=(p_detail->>''start'')::date;'
    || E'\n IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce((SELECT f.fields FROM public.member_waiting_forms f ORDER BY f.version DESC LIMIT 1),''[]''::jsonb)) q'
    || E'\n  WHERE coalesce((q->>''required'')::boolean,false) AND NOT coalesce((q->>''builtin'')::boolean,false)'
    || E'\n  AND length(trim(coalesce((SELECT a->>''value'' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_detail->''answers'')=''array'' THEN p_detail->''answers'' ELSE ''[]''::jsonb END) a WHERE a->>''id''=q->>''id'' LIMIT 1),'''')))=0)'
    || E'\n THEN RAISE EXCEPTION ''Answer every required question on the waiting-list form''; END IF;';
  v_count := (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old);
  IF v_count <> 1 THEN RAISE EXCEPTION 'member_prepare_request: the start date line matched % times', v_count; END IF;
  v_src := replace(v_src, v_old, v_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid DEFAULT NULL::uuid) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS %L', v_src);

  -- member_submit_request ---------------------------------------------------
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'member_submit_request';
  IF md5(v_src) <> 'a03dac1b257df06f29ae0fced4600c6e' THEN
    RAISE EXCEPTION 'member_submit_request is not the body this migration was written against (md5 %)', md5(v_src);
  END IF;

  -- (3) The signed form, when HR's form asks for it.
  v_old := 'UPDATE public.member_requests SET status=''submitted'',submitted_at=now(),claim_id=v_claim WHERE id=r.id;';
  v_new := 'IF r.kind=''waiting'' AND coalesce((SELECT f.require_upload FROM public.member_waiting_forms f ORDER BY f.version DESC LIMIT 1),false)'
    || E'\n AND NOT EXISTS(SELECT 1 FROM public.member_request_attachments a JOIN storage.objects o ON o.bucket_id=''member-invoices'' AND o.name=a.object_path'
    || E'\n  WHERE a.request_id=r.id AND a.uploaded_by=auth.uid() AND a.content_sha256=r.detail->>''signedFormHash'') THEN'
    || E'\n  RAISE EXCEPTION ''Upload the signed application form before sending'';'
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

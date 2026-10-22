-- Files move from Supabase Storage to Cloudflare R2 (2026-10-23 — the owner: "all data can move to r2 including
-- crm"). R2 only keeps bytes; it knows nobody. So everything Storage decided about a file — may this person upload
-- it here, read it, delete it — stays in THIS database, on two tables that are storage's own twins:
--
--   public.file_buckets  — storage.buckets: each bucket's size limit, the types it takes, public or not, and which
--                          BACKEND holds its files today: 'supabase' (Storage, as before) or 'r2'.
--   public.file_objects  — storage.objects: one row per file (bucket_id, name, owner, owner_id, metadata
--                          { size, mimetype }, created_at), carrying EVERY policy storage.objects carries, word for
--                          word (only `objects.name` reads `file_objects.name`).
--
-- The app (lib/storage/server.ts) asks these under the caller's own session before it touches R2: an upload is
-- inserting the file's row, a link is selecting it, a removal is deleting it. This migration changes nothing anybody
-- sees: every bucket starts at 'supabase'. A bucket moves by its own migration later — its files copied, its backend
-- flipped and its functions pointed at file_objects in one go (*_file_storage_move_*).

-- ── The buckets ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.file_buckets (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint CHECK (file_size_limit IS NULL OR file_size_limit > 0),
  allowed_mime_types text[],
  backend text NOT NULL DEFAULT 'supabase' CHECK (backend IN ('supabase', 'r2')),
  -- A public bucket's address once its files are in R2 (https://cdn.houzsventure.com/<bucket>), no trailing slash.
  public_url text CHECK (public_url IS NULL OR public_url ~ '^https://[^/?#]+(/[^?#]*)?$' AND right(public_url, 1) <> '/'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Production's storage.buckets on 2026-10-23, as they stand.
INSERT INTO public.file_buckets (id, public, file_size_limit, allowed_mime_types) VALUES
  ('attendance', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('crm-auto-reply', true, 5242880, ARRAY['image/jpeg', 'image/png']),
  ('crm-media', false, 26214400, NULL),
  ('crm-showrooms', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('hiring-files', false, 10485760, ARRAY['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp']),
  ('hr-documents', false, 26214400, ARRAY['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'image/png', 'image/jpeg', 'image/webp',
    'image/gif', 'image/heic']),
  ('it-requests', false, 52428800, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf', 'text/plain', 'text/csv', 'application/json',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/zip',
    'application/x-zip-compressed', 'application/vnd.rar', 'application/x-rar-compressed', 'application/x-7z-compressed',
    'application/octet-stream']),
  ('member-forms', false, 10485760, ARRAY['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/html', 'image/png', 'image/jpeg']),
  ('member-invoices', false, 3145728, ARRAY['image/jpeg', 'image/png', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']),
  ('payment-attachments', false, NULL, NULL);

ALTER TABLE public.file_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.file_buckets FROM anon, authenticated;
GRANT SELECT ON public.file_buckets TO anon, authenticated;
-- Configuration, the same for everybody: the app reads it to know where a bucket's files are.
CREATE POLICY file_buckets_read ON public.file_buckets FOR SELECT TO anon, authenticated USING (true);

-- ── The files ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.file_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES public.file_buckets(id),
  name text NOT NULL,
  owner uuid,
  owner_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_objects_bucket_name UNIQUE (bucket_id, name)
);
CREATE INDEX file_objects_bucket_created ON public.file_objects (bucket_id, created_at);

-- A file's row as a session writes it: its owner and time are the database's own (never what was sent), its name a
-- path, its size and type within its bucket's rules — said in Storage's own words. Only a bucket in R2 takes a
-- session's row. The service role (the copy of Storage's files, the sweeps) writes what it was given.
CREATE OR REPLACE FUNCTION public.file_objects_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b public.file_buckets%ROWTYPE;
  v_size text := NEW.metadata ->> 'size';
  v_type text := lower(split_part(coalesce(NEW.metadata ->> 'mimetype', ''), ';', 1));
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  NEW.owner := auth.uid();
  NEW.owner_id := auth.uid()::text;
  NEW.created_at := now();
  SELECT * INTO b FROM public.file_buckets WHERE id = NEW.bucket_id;
  IF NOT FOUND OR b.backend IS DISTINCT FROM 'r2' THEN
    RAISE EXCEPTION 'Bucket not found' USING ERRCODE = '22023';
  END IF;
  IF NEW.name IS NULL OR NEW.name = '' OR length(NEW.name) > 1024 OR NEW.name ~ '[[:cntrl:]]'
     OR left(NEW.name, 1) = '/' OR ('/' || NEW.name || '/') ~ '/(\.{0,2})/' THEN
    RAISE EXCEPTION 'That file name is not a path the bucket keeps.' USING ERRCODE = '22023';
  END IF;
  IF v_size IS NULL OR v_size !~ '^[0-9]{1,15}$' OR v_type !~ '^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$' THEN
    RAISE EXCEPTION 'A file needs its size and type.' USING ERRCODE = '22023';
  END IF;
  IF b.file_size_limit IS NOT NULL AND v_size::bigint > b.file_size_limit THEN
    RAISE EXCEPTION 'The object exceeded the maximum allowed size' USING ERRCODE = '22023';
  END IF;
  IF b.allowed_mime_types IS NOT NULL AND cardinality(b.allowed_mime_types) > 0
     AND NOT EXISTS (SELECT 1 FROM unnest(b.allowed_mime_types) a
                      WHERE lower(a) = v_type OR (right(a, 2) = '/*' AND v_type LIKE lower(left(a, -1)) || '%')) THEN
    RAISE EXCEPTION 'mime type % is not supported', v_type USING ERRCODE = '22023';
  END IF;
  NEW.metadata := jsonb_build_object('size', v_size::bigint, 'mimetype', v_type);
  RETURN NEW;
END
$$;

CREATE TRIGGER file_objects_stamp BEFORE INSERT ON public.file_objects
  FOR EACH ROW EXECUTE FUNCTION public.file_objects_stamp();

ALTER TABLE public.file_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.file_objects FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.file_objects TO authenticated;
-- The guest page's stranger puts a job description in (guest_link_uploads) and the CRM's auto-reply pictures are
-- anybody's to see (as their bucket is public).
GRANT SELECT, INSERT ON public.file_objects TO anon;

-- ── storage.objects' policies, word for word ────────────────────────────────────────────────────────────────────
-- payment-attachments
CREATE POLICY "Authenticated users can read attachments" ON public.file_objects FOR SELECT TO public
  USING ((bucket_id = 'payment-attachments'::text) AND (auth.role() = 'authenticated'::text));
CREATE POLICY "Finance can delete draft-voucher attachments" ON public.file_objects FOR DELETE TO public
  USING ((bucket_id = 'payment-attachments'::text) AND ( SELECT has_scope(ARRAY['treasury'::text]) AS has_scope)
    AND (NOT (EXISTS ( SELECT 1 FROM payment_attachments a WHERE (a.storage_path = file_objects.name))))
    AND (EXISTS ( SELECT 1 FROM payment_vouchers pv
                   WHERE (((pv.id)::text = (storage.foldername(file_objects.name))[1])
                     AND (pv.status = ANY (ARRAY['draft'::payment_voucher_status, 'pending_approval'::payment_voucher_status]))))));
CREATE POLICY "Finance can upload attachments" ON public.file_objects FOR INSERT TO public
  WITH CHECK ((bucket_id = 'payment-attachments'::text) AND (auth.role() = 'authenticated'::text));
CREATE POLICY member_payment_attachment_boundary ON public.file_objects AS RESTRICTIVE FOR ALL TO authenticated
  USING ((bucket_id <> 'payment-attachments'::text) OR (NOT ( SELECT member_is_revenue_account() AS member_is_revenue_account)))
  WITH CHECK ((bucket_id <> 'payment-attachments'::text) OR (NOT ( SELECT member_is_revenue_account() AS member_is_revenue_account)));

-- attendance
CREATE POLICY attendance_files_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'attendance'::text) AND (( SELECT has_any_action(ARRAY['attendance.view'::text]) AS has_any_action)
    OR ((storage.foldername(name))[2] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY attendance_files_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'attendance'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['punch'::text, 'request'::text, 'profile'::text]))
    AND ((storage.foldername(name))[2] = (( SELECT auth.uid() AS uid))::text));

-- crm-auto-reply
CREATE POLICY "crm auto-reply images: own folder in" ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'crm-auto-reply'::text) AND ((storage.foldername(name))[1] = (( SELECT crm_me() AS crm_me))::text));
CREATE POLICY "crm auto-reply images: own folder out" ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'crm-auto-reply'::text) AND ((storage.foldername(name))[1] = (( SELECT crm_me() AS crm_me))::text));
CREATE POLICY "crm auto-reply images: read" ON public.file_objects FOR SELECT TO public
  USING (bucket_id = 'crm-auto-reply'::text);

-- crm-media
CREATE POLICY "crm media: in" ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'crm-media'::text)
    AND ((storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)
    AND crm_can_reply(((storage.foldername(name))[1])::uuid));
CREATE POLICY "crm media: read" ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'crm-media'::text)
    AND (EXISTS ( SELECT 1 FROM crm_contacts c WHERE ((c.id)::text = (storage.foldername(file_objects.name))[1]))));

-- crm-showrooms
CREATE POLICY "crm showroom photos: in" ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'crm-showrooms'::text) AND COALESCE(((( SELECT crm_my_can() AS crm_my_can) ->> 'manage'::text))::boolean, false));
CREATE POLICY "crm showroom photos: out" ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'crm-showrooms'::text) AND COALESCE(((( SELECT crm_my_can() AS crm_my_can) ->> 'manage'::text))::boolean, false));
CREATE POLICY "crm showroom photos: read" ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'crm-showrooms'::text) AND (( SELECT crm_me() AS crm_me) IS NOT NULL));

-- hiring-files (the guest link's job descriptions too)
CREATE POLICY guest_link_uploads ON public.file_objects FOR INSERT TO anon, authenticated
  WITH CHECK ((bucket_id = 'hiring-files'::text)
    AND (name ~ '^guest/hv-[A-HJ-NP-Z2-9]{8}/[0-9a-f-]{36}\.(pdf|doc|docx|png|jpe?g|webp)$'::text)
    AND ( SELECT guest_link_may_upload((storage.foldername(file_objects.name))[2]) AS guest_link_may_upload));
CREATE POLICY hiring_files_delete ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'hiring-files'::text) AND ( SELECT has_any_action(ARRAY['hiring.edit'::text]) AS has_any_action)
    AND (NOT hiring_file_in_use(name)));
CREATE POLICY hiring_files_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'hiring-files'::text) AND ( SELECT has_any_action(ARRAY['hiring.view'::text]) AS has_any_action));
CREATE POLICY hiring_files_write ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'hiring-files'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['resumes'::text, 'attachments'::text, 'files'::text]))
    AND ( SELECT has_any_action(ARRAY['hiring.create'::text, 'hiring.edit'::text]) AS has_any_action));

-- hr-documents
CREATE POLICY hr_documents_delete ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'hr-documents'::text)
    AND ((storage.foldername(name))[1] = ANY (ARRAY['documents'::text, 'letters'::text, 'publish'::text, 'drive'::text]))
    AND hr_doc_file_unused(name));
CREATE POLICY hr_documents_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'hr-documents'::text)
    AND ((( SELECT has_any_action(ARRAY['documentation.view'::text]) AS has_any_action) AND hr_doc_readable_by_hr(name, owner_id))
      OR hr_file_readable_by_member(name)));
CREATE POLICY hr_documents_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'hr-documents'::text)
    AND ((storage.foldername(name))[1] = ANY (ARRAY['documents'::text, 'letters'::text, 'publish'::text, 'drive'::text]))
    AND ( SELECT has_any_action(ARRAY['documentation.create'::text]) AS has_any_action));

-- it-requests
CREATE POLICY "it requests: in" ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'it-requests'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text));
CREATE POLICY "it requests: out" ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'it-requests'::text) AND it_request_object_removable(name));
CREATE POLICY "it requests: read" ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'it-requests'::text) AND it_request_object_readable(name));

-- member-forms
CREATE POLICY member_forms_templates_delete ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'member-forms'::text) AND ((storage.foldername(name))[1] = 'templates'::text)
    AND ( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager) AND member_form_template_unused(name));
CREATE POLICY member_forms_templates_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'member-forms'::text) AND ((storage.foldername(name))[1] = 'templates'::text)
    AND (( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager) OR ( SELECT has_perm('member_requests'::text) AS has_perm)));
CREATE POLICY member_forms_templates_write ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'member-forms'::text) AND ((storage.foldername(name))[1] = 'templates'::text)
    AND ( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager));

-- member-invoices
CREATE POLICY member_invoice_draft_delete ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
    AND (EXISTS ( SELECT 1 FROM member_requests r
                   WHERE (((r.id)::text = (storage.foldername(file_objects.name))[2]) AND (r.created_by = auth.uid()) AND (r.status = 'draft'::text))))
    AND (NOT (EXISTS ( SELECT 1 FROM member_request_attachments a WHERE (a.object_path = file_objects.name)))));
CREATE POLICY member_invoice_draft_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
    AND (EXISTS ( SELECT 1 FROM member_requests r
                   WHERE (((r.id)::text = (storage.foldername(file_objects.name))[2]) AND (r.created_by = ( SELECT auth.uid() AS uid))
                     AND (r.status = 'draft'::text)))));
CREATE POLICY member_invoice_insert ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
    AND (EXISTS ( SELECT 1 FROM member_requests r
                   WHERE (((r.id)::text = (storage.foldername(file_objects.name))[2]) AND (r.created_by = auth.uid()) AND (r.status = 'draft'::text)
                     AND (r.kind = ANY (ARRAY['claim'::text, 'waiting'::text, 'replacement'::text]))))));
CREATE POLICY member_invoice_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'member-invoices'::text)
    AND (EXISTS ( SELECT 1 FROM (member_request_attachments a JOIN member_requests r ON ((r.id = a.request_id)))
                   WHERE ((a.object_path = file_objects.name) AND ((r.created_by = auth.uid()) OR member_is_manager('member_requests_manage'::text))))));
CREATE POLICY member_invoice_unattested_manager_delete ON public.file_objects FOR DELETE TO authenticated
  USING ((bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
    AND ( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager)
    AND (NOT (EXISTS ( SELECT 1 FROM member_request_attachments a WHERE (a.object_path = file_objects.name)))));
CREATE POLICY member_invoice_unattested_manager_read ON public.file_objects FOR SELECT TO authenticated
  USING ((bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
    AND ( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager)
    AND (NOT (EXISTS ( SELECT 1 FROM member_request_attachments a WHERE (a.object_path = file_objects.name)))));
CREATE POLICY member_invoice_waiting_form_insert ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)
    AND ( SELECT member_is_manager('member_requests_manage'::text) AS member_is_manager)
    AND ( SELECT has_any_action(ARRAY['member.manage'::text]) AS has_any_action)
    AND (EXISTS ( SELECT 1 FROM member_requests r
                   WHERE (((r.id)::text = (storage.foldername(file_objects.name))[2]) AND (r.kind = 'waiting'::text)
                     AND (r.status = ANY (ARRAY['waiting'::text, 'reserved'::text, 'accepted'::text]))))));

-- ── The audit's line for each table ────────────────────────────────────────────────────────────────────────────
SELECT public.audit_register('file_buckets', 'File buckets', 'Settings', '{}', 'none',
  p_reason => 'Where each bucket''s files are kept and the rules they take — changed only by migrations, which are the record');
SELECT public.audit_register('file_objects', 'Files', 'Settings', '{}', 'none',
  p_reason => 'One row per stored file, written with its upload and deleted with it; each module''s own records and trail say who filed and removed what');

-- Files sent ahead of their Server Action (2026-10-23 — the owner: "make the size more bigger for all, let me know
-- the limit"). A Server Action's body stops at 4 MB (next.config.ts; a Vercel function takes 4.5 MB at most), so
-- Payments, Receipts, Invoice Financing, Reconciliation, the waiting list's forms and the Revenue app's invoices
-- stopped there whatever their bucket said (mig 20261024006700). Now the browser puts such a file first in its
-- sender's own folder of a private bucket, `uploads`, straight to R2 on a link made for it (lib/storage/stage.ts),
-- and the action reads the bytes back under the same session (lib/storage/staged.ts) and does with them exactly
-- what it did with the body's — looks at them, hashes them, files them where they always went under the same
-- policies — then takes the staged copy away. What no action took, the hourly sweep clears a day later.
--
--   uploads   — private, in R2 from the start, 100 MB a file, any type (the bucket a file is filed into decides its
--               types): a sign-in sends, reads and deletes only `<their own id>/…` — nobody else's; the stranger none.
--   member_request_attachments.size_bytes — up to 100 MB (was 3 MB): an invoice or a signed form, kept as before.
--   member_waiting_add_form / member_waiting_attach_form — the same 100 MB where they read 3 MB: production's own
--               bodies with that one comparison swapped, refused unless the body is the one this was written against.
-- Re-running this changes nothing.

INSERT INTO public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
VALUES ('uploads', false, 104857600, NULL, 'r2')
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS uploads_own_insert ON public.file_objects;
CREATE POLICY uploads_own_insert ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS uploads_own_read ON public.file_objects;
CREATE POLICY uploads_own_read ON public.file_objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS uploads_own_delete ON public.file_objects;
CREATE POLICY uploads_own_delete ON public.file_objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

ALTER TABLE public.member_request_attachments DROP CONSTRAINT IF EXISTS member_request_attachments_size_bytes_check;
ALTER TABLE public.member_request_attachments
  ADD CONSTRAINT member_request_attachments_size_bytes_check CHECK (size_bytes >= 1 AND size_bytes <= 104857600);

CREATE OR REPLACE FUNCTION pg_temp.resize(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF strpos(v_src, 'v_size > 3145728') = 0 AND strpos(v_src, 'v_size > 104857600') > 0 THEN
    RETURN;  -- already takes 100 MB
  END IF;
  IF md5(v_src) IS DISTINCT FROM p_md5 THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %, expected %) — compare it with production first',
      p_sig, md5(v_src), p_md5;
  END IF;
  EXECUTE replace(pg_get_functiondef(p_sig), 'v_size > 3145728', 'v_size > 104857600');
END
$fn$;

-- "+" with a signed form, and Upload in an applicant's drawer: the file's size as file_objects keeps it.
SELECT pg_temp.resize('public.member_waiting_add_form(uuid,text)', '6d40414251214059e03c04eee909fa11');
SELECT pg_temp.resize('public.member_waiting_attach_form(uuid,text,text,text)', '89401f65955c8632b4f2309f8fc2006d');

-- Lead View's Data Center files go to Cloudflare R2 (2026-10-26 — merging main for the go-live: since 2026-10-23 every
-- bucket is R2's and a new one is a `file_buckets` row with its own policies ON public.file_objects, never a Supabase
-- Storage bucket — .claude/rules/portal-wide/storage.md › A NEW BUCKET). `lead-data` was made the old way by mig
-- 20261023200000 the same day; on production it holds no file and the Data Center has no row (checked 2026-10-26).
--
-- In one transaction: the bucket registered as R2's (50 MB, any type — the page's own check says the same), its rows
-- copied from storage.objects should any be there, its two policies (upload under files/ with Lead View · Manage, read
-- with Lead View · View) on public.file_objects word for word, and lead_save_data_file asking public.file_objects
-- whether the file arrived — PRODUCTION's body (md5 ada0e52d…, with its page guard) with that one name swapped.
-- The app is unchanged: `supabase.storage.from('lead-data')` is answered by lib/storage (R2) once the row says so.
-- Storage's own bucket and policies stay, as every moved bucket's did.

INSERT INTO public.file_buckets (id, public, file_size_limit, allowed_mime_types, backend)
VALUES ('lead-data', false, 52428800, NULL, 'r2')
ON CONFLICT (id) DO NOTHING;
UPDATE public.file_buckets SET backend = 'r2' WHERE id = 'lead-data';

INSERT INTO public.file_objects (id, bucket_id, name, owner, owner_id, metadata, created_at)
SELECT o.id, o.bucket_id, o.name, o.owner, o.owner_id, coalesce(o.metadata, '{}'::jsonb), o.created_at
  FROM storage.objects o
 WHERE o.bucket_id = 'lead-data'
ON CONFLICT (bucket_id, name) DO NOTHING;

CREATE POLICY lead_data_upload ON public.file_objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-data' AND (storage.foldername(name))[1] = 'files'
    AND (SELECT public.has_any_action(ARRAY['leads.manage'])));
CREATE POLICY lead_data_read ON public.file_objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-data' AND (SELECT public.has_any_action(ARRAY['leads.view'])));

DO $do$
DECLARE
  v_sig regprocedure := 'public.lead_save_data_file(uuid, jsonb)'::regprocedure;
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = 'public.lead_save_data_file(uuid, jsonb)'::regprocedure);
BEGIN
  IF strpos(v_src, 'storage.objects') = 0 AND strpos(v_src, 'public.file_objects') > 0 THEN
    RETURN;  -- already asks file_objects
  END IF;
  IF md5(v_src) IS DISTINCT FROM 'ada0e52d0a74b57e6859a9042a9d4053' THEN
    RAISE EXCEPTION 'lead_save_data_file: not the body this migration was written against (md5 %) — compare it with production first', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, 'storage.objects', ''))) <> length('storage.objects') THEN
    RAISE EXCEPTION 'lead_save_data_file: storage.objects is not there exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_sig), 'storage.objects', 'public.file_objects');
END
$do$;

NOTIFY pgrst, 'reload schema';

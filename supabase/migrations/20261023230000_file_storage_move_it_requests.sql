-- it-requests moves to Cloudflare R2 (2026-10-23 — the move's pilot; the runbook: .claude/rules/portal-wide/storage.md
-- › MOVING A BUCKET). Before this: `scripts/storage-to-r2.mjs --bucket it-requests --apply` — its files' bytes are
-- in R2, each read back. In ONE transaction here: its rows copied from storage.objects exactly as Storage keeps them
-- (id, owner, time, metadata), its backend flipped, and the two functions that asked storage.objects whether a file
-- arrived asking public.file_objects instead — production's own bodies with that one name swapped, refused unless the
-- body is the one this was written against. After: the script once more (a file sent the old way in the minute
-- between is copied too).

INSERT INTO public.file_objects (id, bucket_id, name, owner, owner_id, metadata, created_at)
SELECT o.id, o.bucket_id, o.name, o.owner, o.owner_id, coalesce(o.metadata, '{}'::jsonb), o.created_at
  FROM storage.objects o
 WHERE o.bucket_id = 'it-requests'
ON CONFLICT (bucket_id, name) DO NOTHING;

UPDATE public.file_buckets SET backend = 'r2' WHERE id = 'it-requests';

CREATE OR REPLACE FUNCTION pg_temp.repoint(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF strpos(v_src, 'storage.objects') = 0 AND strpos(v_src, 'public.file_objects') > 0 THEN
    RETURN;  -- already asks file_objects
  END IF;
  IF md5(v_src) IS DISTINCT FROM p_md5 THEN
    RAISE EXCEPTION '%: not the body this migration was written against (md5 %, expected %) — compare it with production first',
      p_sig, md5(v_src), p_md5;
  END IF;
  EXECUTE replace(pg_get_functiondef(p_sig), 'storage.objects', 'public.file_objects');
END
$fn$;

SELECT pg_temp.repoint('public.it_request_files_check(jsonb)', '372544c4456f2fbc47792bccba6720a7');
SELECT pg_temp.repoint('public.it_request_file_in(uuid,uuid,jsonb)', 'adccb89ccf9b7ae6c35a86b67d72a862');

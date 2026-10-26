-- Every other bucket moves to Cloudflare R2 (2026-10-23 — the owner, after the it-requests pilot: "全部搬完" tonight;
-- the runbook: .claude/rules/portal-wide/storage.md › MOVING A BUCKET). Before this: `scripts/storage-to-r2.mjs
-- --bucket <id> --apply` for each of the nine — their files' bytes are in R2, each read back; the public bucket's are
-- served at https://cdn.houzsventure.com (R2's custom domain on the houzsventure.com zone). In ONE transaction here:
-- their rows copied from storage.objects exactly as Storage keeps them (id, owner, time, metadata), their backends
-- flipped, the public bucket's address set and the auto-reply pictures' saved links pointed at it, and the fifteen
-- functions that asked storage.objects about them asking public.file_objects instead — production's own bodies with
-- that one name swapped, each refused unless its body is the one this was written against. After: the script once
-- more for the nine (a file sent the old way in between is copied too). Nothing is left in Storage but old copies.

INSERT INTO public.file_objects (id, bucket_id, name, owner, owner_id, metadata, created_at)
SELECT o.id, o.bucket_id, o.name, o.owner, o.owner_id, coalesce(o.metadata, '{}'::jsonb), o.created_at
  FROM storage.objects o
 WHERE o.bucket_id IN ('attendance', 'crm-auto-reply', 'crm-media', 'crm-showrooms', 'hiring-files', 'hr-documents',
                       'member-forms', 'member-invoices', 'payment-attachments')
ON CONFLICT (bucket_id, name) DO NOTHING;

UPDATE public.file_buckets SET backend = 'r2'
 WHERE id IN ('attendance', 'crm-auto-reply', 'crm-media', 'crm-showrooms', 'hiring-files', 'hr-documents',
              'member-forms', 'member-invoices', 'payment-attachments');

-- crm-auto-reply is public: its pictures are read at the custom domain, and the links already saved in the
-- salespeople's auto-reply settings (Storage's public address) are pointed there — the same files, the same names.
UPDATE public.file_buckets SET public_url = 'https://cdn.houzsventure.com/crm-auto-reply' WHERE id = 'crm-auto-reply';
UPDATE public.crm_auto_replies
   SET settings = regexp_replace(settings::text, 'https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/crm-auto-reply/',
                                 'https://cdn.houzsventure.com/crm-auto-reply/', 'g')::jsonb
 WHERE settings::text ~ 'https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/crm-auto-reply/';

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

-- attendance: a punch's photo, a request's file, one's own photo — did it arrive?
SELECT pg_temp.repoint('public.att_punch(text,double precision,double precision,integer,text,text,text,text)', '85fb9fc9e93cea22c47d08d75bd765f3');
SELECT pg_temp.repoint('public.att_request_attach(uuid,text,text)', '64742d475a58ff1dccab8269a9b5b5ce');
SELECT pg_temp.repoint('public.my_photo_set(text)', '14944060d167af17cbfd14706594c92a');
-- hiring-files: the guest link's job description (and its hourly cap), a file taken onto a record, the day-old leftovers.
SELECT pg_temp.repoint('public.guest_link_hire(text,uuid,text,jsonb,text,text)', '83ff39c5bc583e774b5e53c6f64e8826');
SELECT pg_temp.repoint('public.guest_link_may_upload(text)', 'bf875c256d6948450fb928f0e03c46c3');
SELECT pg_temp.repoint('public.hiring_take_upload(text)', '613da511fde0fed333d10d9fc3be2fd8');
SELECT pg_temp.repoint('public.hiring_leftovers(integer)', '09618ef7535c0c0954f0369b6d75ed7e');
-- hr-documents: a file filed under a document, letter, memo or Data center file; what was deleted; the leftovers.
SELECT pg_temp.repoint('public.hr_doc_file_present(text,text)', '9bc45f2e52036bd7e655c5314f6f9e09');
SELECT pg_temp.repoint('public.hr_documentation_files_removed(text[])', 'f7062f9e45ce4d805e645a4e5f9bb301');
SELECT pg_temp.repoint('public.hr_documentation_leftovers()', 'e23e5af5afb89e8c3579c14cede0f635');
SELECT pg_temp.repoint('public.hr_drive_bin_files_gone(text[])', '7e3af9124c2a8a607c2ed783f685350b');
SELECT pg_temp.repoint('public.hr_drive_orphans(integer)', '5623111e137dc121b02e907ef1d93a6d');
-- member-invoices: a claim's verified invoice, a waiting list's or replacement's signed form.
SELECT pg_temp.repoint('public.member_submit_request(uuid)', '2d1c69b290456d4a2aafd31d17522286');
SELECT pg_temp.repoint('public.member_waiting_add_form(uuid,text)', '83f222d0888ab8460215c314cc9b5499');
SELECT pg_temp.repoint('public.member_waiting_attach_form(uuid,text,text,text)', '738f62c8f1f91d23b5af3d3ca48c9265');

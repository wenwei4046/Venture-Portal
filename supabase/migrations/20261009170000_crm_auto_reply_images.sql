-- Auto-reply images (CRM redesign, 2026-10-09). An auto-reply may carry a
-- picture (Profile › Auto-reply › Add image); WhatsApp fetches it by its link
-- when the reply goes out, so the bucket is public-read. Each person writes
-- only their own folder (<their staff id>/…), under their own session.
-- Skipped where there is no Storage (the PGlite checks).
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('crm-auto-reply', 'crm-auto-reply', true, 5 * 1024 * 1024, array['image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$drop policy if exists "crm auto-reply images: own folder in" on storage.objects$p$;
  execute $p$create policy "crm auto-reply images: own folder in" on storage.objects for insert to authenticated
    with check (bucket_id = 'crm-auto-reply' and (storage.foldername(name))[1] = (select public.crm_me())::text)$p$;
  execute $p$drop policy if exists "crm auto-reply images: own folder out" on storage.objects$p$;
  execute $p$create policy "crm auto-reply images: own folder out" on storage.objects for delete to authenticated
    using (bucket_id = 'crm-auto-reply' and (storage.foldername(name))[1] = (select public.crm_me())::text)$p$;
  execute $p$drop policy if exists "crm auto-reply images: read" on storage.objects$p$;
  execute $p$create policy "crm auto-reply images: read" on storage.objects for select
    using (bucket_id = 'crm-auto-reply')$p$;
end $$;

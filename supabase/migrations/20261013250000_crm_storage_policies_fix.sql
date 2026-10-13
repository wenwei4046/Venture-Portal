-- Uploads into storage refused (2026-10-13: the user could send no photo or video — every POST /object/crm-media/… 400).
--
-- 1. "crm showroom photos: in / out" (mig 20261013100000) ask (select crm_manages()), which `authenticated` may not
--    EXECUTE (DEFINER functions are revoked from PUBLIC since 20261009000100; crm_manages was never granted). Postgres
--    works out every permissive INSERT policy's initplan on storage.objects, so the showroom policy's "permission denied
--    for function crm_manages" refused EVERY upload by a signed-in member, whatever its bucket. They ask the same thing
--    through crm_my_can() (granted to authenticated; 'manage' = crm_can('manage', 'all')).
-- 2. "crm media: read" (mig 20261013240000) wrote storage.foldername(name) inside a subquery over crm_contacts, which has
--    its own `name` column — so it read the CONTACT's name and never matched. It names the object's column now.
-- ALTER POLICY only: nothing is dropped.
alter policy "crm showroom photos: in" on storage.objects
  with check (bucket_id = 'crm-showrooms' and coalesce(((select public.crm_my_can()) ->> 'manage')::boolean, false));
alter policy "crm showroom photos: out" on storage.objects
  using (bucket_id = 'crm-showrooms' and coalesce(((select public.crm_my_can()) ->> 'manage')::boolean, false));
alter policy "crm media: read" on storage.objects
  using (bucket_id = 'crm-media' and exists (select 1 from public.crm_contacts c where c.id::text = (storage.foldername(objects.name))[1]));

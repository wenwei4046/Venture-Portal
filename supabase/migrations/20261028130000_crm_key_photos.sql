-- The unit's keys, handed over with a photo (the owner, 2026-10-28: "为了顺利交接预约的钥匙 … 在 appt today 建立一个新的按钮，
-- 点击后上传领取钥匙的照片，同时附上相机功能。完成 appt，点击 show up，并拍摄交还钥匙的照片"; asked: every Show up needs the
-- photo of the key returned, a No show too once the key was collected; seen by the salesperson, their uplines and the
-- Control panel — whoever reads the customer).
--
-- An appointment keeps two photos, each a file in crm-media under the customer's folder (the bucket's own policies: in for
-- whoever may reply to the customer, read for whoever reads them):
--   key_out_*  — the key collected before the visit;
--   key_back_* — the key returned after it.
-- crm_set_key_photo writes them. Asking for them at Show up / No show is the next migration (20261028130100), applied once
-- the app that takes the photos is live — before it, nobody could mark a visit.

ALTER TABLE public.crm_appointments
  ADD COLUMN IF NOT EXISTS key_out_path text,
  ADD COLUMN IF NOT EXISTS key_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_out_by uuid,
  ADD COLUMN IF NOT EXISTS key_back_path text,
  ADD COLUMN IF NOT EXISTS key_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_back_by uuid;

CREATE OR REPLACE FUNCTION public.crm_set_key_photo(p_appointment uuid, p_kind text, p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('hand over the key for this visit'); end if;
  if a.state <> 'booked' then raise exception 'This visit is already marked.' using errcode = '22023'; end if;
  if p_kind is null or p_kind not in ('out', 'back') then raise exception 'Say whether the key was collected or returned.' using errcode = '22023'; end if;
  if p_path is null or p_path !~ ('^' || a.contact_id::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'That photo is not in this customer''s folder.' using errcode = '22023';
  end if;
  if not exists (select 1 from file_objects f where f.bucket_id = 'crm-media' and f.name = p_path) then
    raise exception 'The photo did not arrive. Try again.' using errcode = '22023';
  end if;
  if p_kind = 'out' then
    update crm_appointments set key_out_path = p_path, key_out_at = now(), key_out_by = crm_me()
     where id = p_appointment returning * into a;
  else
    update crm_appointments set key_back_path = p_path, key_back_at = now(), key_back_by = crm_me()
     where id = p_appointment returning * into a;
  end if;
  return to_jsonb(a);
end $function$;

REVOKE ALL ON FUNCTION public.crm_set_key_photo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_key_photo(uuid, text, text) TO authenticated, service_role;

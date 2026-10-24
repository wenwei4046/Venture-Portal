-- An appointment online or somewhere else (the owner, 2026-10-24: "主要讓業務可以custom預約，有些客戶想要Online，有些想約在
-- 其他地方 … 1. Online（要有時間，日期，Meeting Link, remarks) 2. Other (让他们自己填地点，有日期，时间，remarks） 日期時間是一定要填寫的").
--
-- crm_appointments.kind: 'showroom' (every appointment so far), 'online' or 'other'; meeting_link (online), place (other),
-- remarks (either — the salesperson's note). showroom keeps a name for what it is — 'Online meeting' or the place — so
-- every reader that names an appointment by it (notifications, the journey, the screens) reads it right; such an
-- appointment is no showroom's, so no slot, closure or limit applies (crm_slot_check is not asked).
-- crm_book_custom / crm_move_custom book and change one (Edit · the customer's: crm_can_reply, as crm_book);
-- crm_move_appointment (production's body, md5 5bf34d6f…, one statement swapped) makes a changed one a showroom's again.

alter table public.crm_appointments
  add column if not exists kind text not null default 'showroom',
  add column if not exists meeting_link text,
  add column if not exists place text,
  add column if not exists remarks text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_appointments_kind_check') then
    alter table public.crm_appointments add constraint crm_appointments_kind_check check (kind in ('showroom', 'online', 'other'));
  end if;
end $$;

create or replace function public.crm_custom_check(p_kind text, p_start timestamptz, p_link text, p_place text)
returns void language plpgsql immutable set search_path to 'public' as $$
begin
  if p_kind is distinct from 'online' and p_kind is distinct from 'other' then
    raise exception 'An appointment is online or somewhere else.' using errcode = '22023';
  end if;
  if p_start is null then raise exception 'An appointment needs a date and a time.' using errcode = '22023'; end if;
  if p_kind = 'other' and coalesce(trim(p_place), '') = '' then
    raise exception 'Say where the appointment is.' using errcode = '22023';
  end if;
  if p_kind = 'online' and coalesce(trim(p_link), '') <> '' and trim(p_link) !~* '^https?://\S+$' then
    raise exception 'The meeting link must start with https://' using errcode = '22023';
  end if;
end $$;
revoke all on function public.crm_custom_check(text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.crm_custom_check(text, timestamptz, text, text) to service_role;

create or replace function public.crm_book_custom(p_contact uuid, p_kind text, p_start timestamptz, p_link text, p_place text, p_remarks text, p_minutes integer default 60)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a crm_appointments;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('book for this customer'); end if;
  perform crm_custom_check(p_kind, p_start, p_link, p_place);
  if coalesce(p_minutes, 0) <= 0 then raise exception 'An appointment needs a length.' using errcode = '22023'; end if;
  insert into crm_appointments (contact_id, showroom, start_at, minutes, created_by, kind, meeting_link, place, remarks)
  values (p_contact, case when p_kind = 'online' then 'Online meeting' else left(trim(p_place), 200) end, p_start, p_minutes, crm_me(), p_kind,
          case when p_kind = 'online' then nullif(left(trim(p_link), 1000), '') end,
          case when p_kind = 'other' then left(trim(p_place), 200) end,
          nullif(left(trim(coalesce(p_remarks, '')), 2000), ''))
  returning * into a;
  update crm_contacts set status = 'appointment', lost_reason = null, lost_note = null, previous_status = null where id = p_contact;
  return to_jsonb(a);
end $$;
revoke all on function public.crm_book_custom(uuid, text, timestamptz, text, text, text, integer) from public, anon;
grant execute on function public.crm_book_custom(uuid, text, timestamptz, text, text, text, integer) to authenticated;

create or replace function public.crm_move_custom(p_appointment uuid, p_kind text, p_start timestamptz, p_link text, p_place text, p_remarks text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  perform crm_custom_check(p_kind, p_start, p_link, p_place);
  update crm_appointments set start_at = p_start, kind = p_kind,
         showroom = case when p_kind = 'online' then 'Online meeting' else left(trim(p_place), 200) end,
         meeting_link = case when p_kind = 'online' then nullif(left(trim(p_link), 1000), '') end,
         place = case when p_kind = 'other' then left(trim(p_place), 200) end,
         remarks = nullif(left(trim(coalesce(p_remarks, '')), 2000), '')
   where id = p_appointment returning * into a;
  return to_jsonb(a);
end $$;
revoke all on function public.crm_move_custom(uuid, text, timestamptz, text, text, text) from public, anon;
grant execute on function public.crm_move_custom(uuid, text, timestamptz, text, text, text) to authenticated;

-- Production's body; the one change: a changed appointment is the showroom's again (kind, link and place cleared).
CREATE OR REPLACE FUNCTION public.crm_move_appointment(p_appointment uuid, p_start timestamp with time zone, p_showroom text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  if p_start is null or coalesce(trim(p_showroom), '') = '' then
    raise exception 'An appointment needs a showroom and a time.' using errcode = '22023';
  end if;
  perform crm_slot_check(p_showroom, p_start, p_appointment);
  update crm_appointments set start_at = p_start, showroom = trim(p_showroom), kind = 'showroom', meeting_link = null, place = null
   where id = p_appointment returning * into a;
  return to_jsonb(a);
end $function$;

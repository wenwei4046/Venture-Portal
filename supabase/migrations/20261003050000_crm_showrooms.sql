-- CRM showrooms (2026-10-03): the list a booking picks from, kept in the
-- database instead of the demo's two names. One today — Kuala Lumpur — and the
-- Boss or HOD adds the next from the CRM's Settings when a new one opens
-- (user 2026-10-03); every salesperson's booking list follows at once.
--   - everyone with a CRM role reads the list; nobody writes the table;
--   - crm_save_showroom (Boss / HOD) adds, renames, closes or reopens one —
--     a closed showroom keeps its appointments but takes no new bookings;
--   - crm_book / crm_move_appointment now refuse a showroom not on the list
--     or closed.
-- Add-only: one table, one function, two functions re-stated with the check.

create table if not exists public.crm_showrooms (
  id          text primary key default gen_random_uuid()::text,
  name        text not null check (length(trim(name)) between 1 and 80),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_by  uuid references public.hr_staff_costs(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists crm_showrooms_name_key on public.crm_showrooms (lower(trim(name)));

-- 'kl' is the id the demo and any earlier booking already use.
insert into public.crm_showrooms (id, name, sort_order) values ('kl', 'Kuala Lumpur Showroom', 1)
on conflict (id) do nothing;

alter table public.crm_showrooms enable row level security;
drop policy if exists crm_showrooms_read on public.crm_showrooms;
create policy crm_showrooms_read on public.crm_showrooms for select to authenticated
  using ((select public.crm_my_role()) is not null);
revoke all on public.crm_showrooms from anon, authenticated;
grant select on public.crm_showrooms to authenticated;

create or replace function public.crm_save_showroom(p_id text, p_name text, p_active boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r crm_showrooms;
begin
  if coalesce(crm_my_role(), '') not in ('boss', 'hod') then perform crm_deny('change the showrooms'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'A showroom needs a name.' using errcode = '22023'; end if;
  if exists (select 1 from crm_showrooms where lower(trim(name)) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'There is already a showroom called %.', trim(p_name) using errcode = '23505';
  end if;
  if p_id is null then
    insert into crm_showrooms (name, active, sort_order, created_by)
    values (trim(p_name), coalesce(p_active, true), coalesce((select max(sort_order) from crm_showrooms), 0) + 1, crm_me())
    returning * into r;
  else
    update crm_showrooms set name = trim(p_name), active = coalesce(p_active, active) where id = p_id returning * into r;
    if r.id is null then raise exception 'That showroom is not on the list.' using errcode = '22023'; end if;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.crm_save_showroom(text, text, boolean) from public, anon;
grant execute on function public.crm_save_showroom(text, text, boolean) to authenticated;

create or replace function public.crm_open_showroom(p_showroom text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from crm_showrooms where id = trim(p_showroom) and active) then
    raise exception 'Choose a showroom that is open.' using errcode = '22023';
  end if;
  return trim(p_showroom);
end $$;
revoke all on function public.crm_open_showroom(text) from public, anon, authenticated;

create or replace function public.crm_book(p_contact uuid, p_showroom text, p_start timestamptz, p_minutes integer default 60)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a crm_appointments;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('book for this customer'); end if;
  if coalesce(trim(p_showroom), '') = '' or p_start is null or coalesce(p_minutes, 0) <= 0 then
    raise exception 'An appointment needs a showroom, a time and a length.' using errcode = '22023';
  end if;
  insert into crm_appointments (contact_id, showroom, start_at, minutes, created_by)
  values (p_contact, crm_open_showroom(p_showroom), p_start, p_minutes, crm_me())
  returning * into a;
  update crm_contacts set status = 'appointment', lost_reason = null, lost_note = null, previous_status = null where id = p_contact;
  return to_jsonb(a);
end $$;

create or replace function public.crm_move_appointment(p_appointment uuid, p_start timestamptz, p_showroom text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  if p_start is null or coalesce(trim(p_showroom), '') = '' then
    raise exception 'An appointment needs a showroom and a time.' using errcode = '22023';
  end if;
  -- Staying put at a showroom since closed is allowed; moving INTO one is not.
  update crm_appointments
     set start_at = p_start,
         showroom = case when trim(p_showroom) = a.showroom then a.showroom else crm_open_showroom(p_showroom) end
   where id = p_appointment returning * into a;
  return to_jsonb(a);
end $$;

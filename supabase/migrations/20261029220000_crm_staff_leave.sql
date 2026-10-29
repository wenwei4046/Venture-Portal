-- A member's leave (the owner, 2026-10-29: "CRM 里面，要多一个功能可以设定 member 的休假，不要派名单给他"; asked, chose: the
-- Principal / Director set it, CRM · Manage, beside Active members; while on leave no new lead goes to them, their own customers
-- stay theirs, and their upline is told when the leave starts).
--
--   crm_staff_leave        a member's days off, from and to (the office's days, both included), with a note. Read by anybody
--                          in the CRM (crm_me()); written only through crm_save_leave / crm_delete_leave (CRM · Manage).
--   crm_staff_locked       rebuilt from production's body (md5 ab9a2b4c…): a member on leave today is out of the dealing
--                          exactly as a locked one — every dealing path already asks it (crm_assign_contact, crm_deal_handlers).
--   crm_notify_leave_starts   the hourly sweep (app/api/member-queue): once a leave has started, its member's upline is told,
--                          with how many of their customers are waiting for a reply. Service role only.

create table if not exists public.crm_staff_leave (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.hr_staff_costs(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  told_at timestamptz,
  check (ends_on >= starts_on)
);
create index if not exists crm_staff_leave_staff on public.crm_staff_leave (staff_id, ends_on);
alter table public.crm_staff_leave enable row level security;
revoke all on public.crm_staff_leave from anon, authenticated;
grant select on public.crm_staff_leave to authenticated;
drop policy if exists crm_staff_leave_read on public.crm_staff_leave;
create policy crm_staff_leave_read on public.crm_staff_leave for select to authenticated
  using ((select crm_me()) is not null);

-- Whether a member is on leave on the office's today.
create or replace function public.crm_on_leave(p_staff uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from crm_staff_leave l where l.staff_id = p_staff
                  and (now() at time zone 'Asia/Kuala_Lumpur')::date between l.starts_on and l.ends_on);
end $$;
revoke execute on function public.crm_on_leave(uuid) from public, anon, authenticated;
grant execute on function public.crm_on_leave(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.crm_staff_locked(p_staff uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select s.locked from crm_staff s where s.staff_id = p_staff), false)
      -- On leave today: out of the dealing as a locked member (mig 20261029220000).
      or crm_on_leave(p_staff)
$function$;

-- Add or change one leave; a member's leaves may not overlap.
create or replace function public.crm_save_leave(p_id uuid, p_staff uuid, p_from date, p_to date, p_note text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not crm_manages() then perform crm_deny('set a member''s leave'); end if;
  if p_staff is null or not exists (select 1 from hr_staff_costs where id = p_staff) then raise exception 'Pick a member.' using errcode = '22023'; end if;
  if p_from is null or p_to is null then raise exception 'Pick the first and the last day.' using errcode = '22023'; end if;
  if p_to < p_from then raise exception 'The last day comes before the first.' using errcode = '22023'; end if;
  if p_to - p_from > 366 then raise exception 'A leave is a year at most.' using errcode = '22023'; end if;
  if length(coalesce(p_note, '')) > 200 then raise exception 'A note is up to 200 characters.' using errcode = '22023'; end if;
  if exists (select 1 from crm_staff_leave l where l.staff_id = p_staff and l.id is distinct from p_id
              and l.starts_on <= p_to and l.ends_on >= p_from) then
    raise exception 'That overlaps another leave of theirs.' using errcode = '22023';
  end if;
  if p_id is not null and exists (select 1 from crm_staff_leave where id = p_id) then
    update crm_staff_leave set staff_id = p_staff, starts_on = p_from, ends_on = p_to, note = btrim(coalesce(p_note, '')),
      -- A leave moved to start later is told again when it starts.
      told_at = case when p_from > starts_on then null else told_at end
     where id = p_id returning id into v_id;
  else
    insert into crm_staff_leave (staff_id, starts_on, ends_on, note, created_by)
    values (p_staff, p_from, p_to, btrim(coalesce(p_note, '')), auth.uid()) returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.crm_delete_leave(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not crm_manages() then perform crm_deny('set a member''s leave'); end if;
  delete from crm_staff_leave where id = p_id;
end $$;

revoke execute on function public.crm_save_leave(uuid, uuid, date, date, text) from public, anon;
revoke execute on function public.crm_delete_leave(uuid) from public, anon;
grant execute on function public.crm_save_leave(uuid, uuid, date, date, text) to authenticated;
grant execute on function public.crm_delete_leave(uuid) to authenticated;

-- Once a leave has started: its member's upline is told (a notice of the CRM's, to their login), once.
create or replace function public.crm_notify_leave_starts()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  r record; v_up uuid; v_user uuid; v_wait int; v_n int := 0; v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  for r in select l.*, s.employee_name from crm_staff_leave l join hr_staff_costs s on s.id = l.staff_id
            where l.told_at is null and v_today between l.starts_on and l.ends_on
  loop
    v_up := crm_upline_of(r.staff_id);
    select user_id into v_user from hr_staff_costs where id = v_up;
    -- Their customers whose last word is the customer's (not Won / Lost): waiting for a reply.
    select count(*) into v_wait from crm_contacts c
     where c.assigned_to = r.staff_id and coalesce(c.status, '') not in ('won', 'lost')
       and c.last_customer_at is not null
       and not exists (select 1 from crm_messages m where m.contact_id = c.id and m.direction = 'out' and m.created_at > c.last_customer_at);
    if v_user is not null then
      perform notify_crm_people(array[v_user], r.employee_name || ' is on leave',
        'From ' || to_char(r.starts_on, 'FMDD Mon') || ' to ' || to_char(r.ends_on, 'FMDD Mon') || ' · no new leads go to them.'
          || case when v_wait > 0 then ' ' || v_wait || ' of their customers are waiting for a reply.' else '' end,
        null, null, jsonb_build_object('due', 'leave:' || r.id, 'staff', r.staff_id, 'waiting', v_wait));
      v_n := v_n + 1;
    end if;
    update crm_staff_leave set told_at = now() where id = r.id;
  end loop;
  return v_n;
end $$;
revoke execute on function public.crm_notify_leave_starts() from public, anon, authenticated;
grant execute on function public.crm_notify_leave_starts() to service_role;

SELECT public.audit_register('crm_staff_leave', 'CRM member leave', 'Member services', '{revenue,crm_manage}', 'people');

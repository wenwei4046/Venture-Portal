-- The CRM is the Revenue Department's IR sub-department only (user 2026-10-09: 我只需要 revenue
-- department · IR 的就好). Who is in it, their title and who they report to are IR's own — the
-- memberships Revenue › Hierarchy draws for IR (comm_hierarchy on IR's active scheme): ANTHONY,
-- SHAWN and STANLEY's teams, reporting to the director IR reports to (PETER,
-- comm_sub_department_directors). The Principal stays the Boss (crm_me, unchanged).
--
-- crm_settings names the sub-department. Left empty, every function below answers exactly as
-- before (People's title and reports_to) — which is what the PGlite checks run on.
--
-- Changed, nothing else: crm_role_of, crm_downline, crm_team_of, crm_people, crm_invite (Move
-- goes to one's IR superior), plus the helpers crm_scope / crm_scope_member / crm_scope_director
-- / crm_upline_of. plpgsql where they read comm_*: a SQL body is checked when created, and the
-- checks have no comm_* tables.

create table if not exists public.crm_settings (
  id                boolean primary key default true check (id),
  sub_department_id uuid,
  updated_by        uuid references public.hr_staff_costs(id),
  updated_at        timestamptz not null default now()
);
alter table public.crm_settings enable row level security;
revoke all on public.crm_settings from anon, authenticated;

do $$
begin
  if to_regclass('public.comm_sub_departments') is not null then
    insert into public.crm_settings (id, sub_department_id)
    select true, id from public.comm_sub_departments where name = 'IR' and is_active
    on conflict (id) do update set sub_department_id = excluded.sub_department_id, updated_at = now();
  end if;
end $$;

create or replace function public.crm_scope()
returns uuid language sql stable security definer set search_path = public as $$
  select sub_department_id from crm_settings where id
$$;

-- Someone's current membership of the CRM's sub-department: their title there and their upline there.
create or replace function public.crm_scope_member(p_staff uuid, out title_id uuid, out upline uuid, out is_member boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  is_member := false;
  select h.title_id, h.upline_staff_id, true into title_id, upline, is_member
    from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id
   where h.staff_id = p_staff and c.sub_department_id = crm_scope() and c.is_active
     and h.effective_from <= v_today and (h.effective_to is null or h.effective_to >= v_today)
   order by h.effective_from desc limit 1;
  is_member := coalesce(is_member, false);
end $$;

-- The director the sub-department reports to (the first by name, when there are two).
create or replace function public.crm_scope_director()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  select d.staff_id into v from comm_sub_department_directors d join hr_staff_costs s on s.id = d.staff_id
   where d.sub_department_id = crm_scope() and s.status = 'active' order by s.employee_name limit 1;
  return v;
end $$;

-- Who someone reports to in the CRM: their upline in the sub-department, its director at the top.
create or replace function public.crm_upline_of(p_staff uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  if crm_scope() is null then return (select reports_to from hr_staff_costs where id = p_staff); end if;
  select * into m from crm_scope_member(p_staff);
  if not m.is_member then return null; end if;
  return coalesce(m.upline, crm_scope_director());
end $$;

create or replace function public.crm_role_of(p_staff uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  if crm_scope() is null then
    return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id where s.id = p_staff);
  end if;
  select * into m from crm_scope_member(p_staff);
  if m.is_member then
    -- Their title in the sub-department (else their own); never Boss / HOD through a membership.
    return (select cm.crm_role from crm_role_map cm
             where cm.title_id = coalesce(m.title_id, (select title_id from hr_staff_costs where id = p_staff))
               and cm.crm_role in ('stl', 'tl', 'ta', 'rs'));
  end if;
  if exists (select 1 from comm_sub_department_directors d where d.sub_department_id = crm_scope() and d.staff_id = p_staff) then
    return 'hod';
  end if;
  return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id
           where s.id = p_staff and cm.crm_role = 'boss');
end $$;

create or replace function public.crm_downline(p_staff uuid)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if crm_scope() is null then
    return query
      with recursive line(id, depth) as (
        select p_staff, 0 where p_staff is not null
        union
        select s.id, l.depth + 1 from hr_staff_costs s join line l on s.reports_to = l.id
         where l.depth < 20 and s.status = 'active'
      )
      select id from line;
    return;
  end if;
  return query
    with recursive members as (
      select distinct on (h.staff_id) h.staff_id as id, coalesce(h.upline_staff_id, crm_scope_director()) as up
        from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id join hr_staff_costs s on s.id = h.staff_id
       where c.sub_department_id = crm_scope() and c.is_active and s.status = 'active'
         and h.effective_from <= v_today and (h.effective_to is null or h.effective_to >= v_today)
       order by h.staff_id, h.effective_from desc
    ), line(id, depth) as (
      select p_staff, 0 where p_staff is not null
      union
      select m.id, l.depth + 1 from members m join line l on m.up = l.id where l.depth < 20
    )
    select id from line;
end $$;

create or replace function public.crm_team_of(p_staff uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v uuid := p_staff;
  i int := 0;
begin
  while v is not null and i < 12 loop
    if crm_role_of(v) = 'tl' then return v; end if;
    v := crm_upline_of(v);
    i := i + 1;
  end loop;
  return null;
end $$;

create or replace function public.crm_people()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me   uuid := crm_me();
  v_role text := crm_role_of(v_me);
  v_out  jsonb;
begin
  if crm_scope() is null then
    select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', crm_role_of(s.id),
               'uplineId', s.reports_to, 'fullTime', coalesce(cs.full_time, false), 'title', t.name) order by s.employee_name)
        from hr_staff_costs s left join crm_staff cs on cs.staff_id = s.id left join titles t on t.id = s.title_id
       where v_role is not null and s.status = 'active' and crm_role_of(s.id) is not null
         and (s.id in (select crm_downline(v_me)) or v_role in ('boss', 'hod'))), '[]'::jsonb))
      into v_out;
    return v_out;
  end if;
  -- The sub-department's members, its director(s) and the Boss: each with their title THERE.
  select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', x.role,
             'uplineId', crm_upline_of(s.id), 'fullTime', coalesce(cs.full_time, false),
             'title', coalesce(mt.name, t.name)) order by s.employee_name)
      from hr_staff_costs s
      cross join lateral (select crm_role_of(s.id) as role) x
      cross join lateral crm_scope_member(s.id) m
      left join titles mt on mt.id = m.title_id
      left join titles t on t.id = s.title_id
      left join crm_staff cs on cs.staff_id = s.id
     where v_role is not null and s.status = 'active' and x.role is not null
       and (s.id in (select crm_downline(v_me)) or v_role in ('boss', 'hod'))), '[]'::jsonb))
    into v_out;
  return v_out;
end $$;

-- Share / Move: Move goes to one's superior in the sub-department (else People's reports_to, as before).
create or replace function public.crm_invite(p_kind text, p_contact uuid, p_to uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := crm_me();
  c       crm_contacts;
  v_up    uuid;
  v_team  uuid;
  r       crm_invites;
begin
  if p_kind not in ('share', 'move') then raise exception 'Unknown invitation.' using errcode = '22023'; end if;
  if not crm_can_reply(p_contact) then perform crm_deny('pass on this customer'); end if;
  select * into c from crm_contacts where id = p_contact;
  if p_to is null or p_to = v_me or crm_role_of(p_to) is null then raise exception 'Choose someone in the CRM.' using errcode = '22023'; end if;
  if p_kind = 'move' then
    v_up := crm_upline_of(v_me);
    if v_up is null or p_to <> v_up then raise exception 'A customer moves to your direct superior only.' using errcode = '22023'; end if;
  else
    v_team := crm_team_of(v_me);
    if not crm_sees_all() and (v_team is null or crm_team_of(p_to) is distinct from v_team)
       and p_to not in (select crm_downline(v_me)) and v_me not in (select crm_downline(p_to)) then
      raise exception 'You can share a chat within your own team.' using errcode = '22023';
    end if;
    if exists (select 1 from crm_contact_shares where contact_id = p_contact and staff_id = p_to) or c.assigned_to = p_to then
      raise exception 'They are already in this chat.' using errcode = '23505';
    end if;
  end if;
  insert into crm_invites (kind, contact_id, contact_name, from_staff, to_staff)
  values (p_kind, p_contact, coalesce(c.name, c.phone, 'Customer'), v_me, p_to)
  on conflict (kind, contact_id, to_staff) where state = 'pending' do update set created_at = now(), from_staff = excluded.from_staff
  returning * into r;
  return to_jsonb(r);
end $$;

-- Who may call what: the helpers are the other functions' own; the readers keep their old grants.
revoke all on function public.crm_scope(), public.crm_scope_member(uuid), public.crm_scope_director(), public.crm_upline_of(uuid)
  from public, anon, authenticated;
revoke all on function public.crm_people(), public.crm_invite(text, uuid, uuid) from public, anon;
grant execute on function public.crm_people(), public.crm_invite(text, uuid, uuid) to authenticated;
grant execute on function public.crm_people() to service_role;

SELECT public.audit_register('crm_settings', 'CRM settings', 'Member services', '{revenue}', 'people');

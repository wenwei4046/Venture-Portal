-- The CRM shows each person's own title from People (user 2026-10-09: 改成顯示 People 裡的
-- 原職稱) — "Senior Revenue Specialist", not the CRM role it maps to. crm_people() hands the
-- title over beside the role; the role still decides what someone may do. Production's body
-- (md5 69eaa363…) with one key added.
create or replace function public.crm_people() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select crm_me() as id, crm_my_role() as role),
  seen as (
    select s.id, s.employee_name, s.reports_to, s.title_id, crm_role_of(s.id) as role
      from hr_staff_costs s, me
     where me.role is not null and s.status = 'active'
       and (s.id in (select crm_downline(me.id)) or me.role in ('boss', 'hod'))
  )
  select jsonb_build_object(
    'me',   (select id from me),
    'role', (select role from me),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', seen.id, 'name', seen.employee_name, 'role', seen.role,
               'uplineId', seen.reports_to, 'fullTime', coalesce(cs.full_time, false),
               'title', t.name)
             order by seen.employee_name)
        from seen left join crm_staff cs on cs.staff_id = seen.id
                  left join titles t on t.id = seen.title_id
       where seen.role is not null), '[]'::jsonb))
$$;

revoke all on function public.crm_people() from public, anon;
grant execute on function public.crm_people() to authenticated, service_role;

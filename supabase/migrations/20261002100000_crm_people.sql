-- CRM, who you are and who you see (2026-10-02).
--
-- The CRM screens need names, roles and the reporting line of the people the
-- signed-in person may see — and a salesperson cannot read hr_staff_costs.
-- crm_people() answers exactly that and nothing more, on the read path's own
-- rules (20261002070000 / 080000): yourself and your whole downline; the Boss
-- and HOD everybody who has a CRM role. Never a salary, never a peer.
--
-- Add-only: one function.

create or replace function public.crm_people() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select crm_me() as id, crm_my_role() as role),
  seen as (
    select s.id, s.employee_name, s.reports_to, crm_role_of(s.id) as role
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
               'uplineId', seen.reports_to, 'fullTime', coalesce(cs.full_time, false))
             order by seen.employee_name)
        from seen left join crm_staff cs on cs.staff_id = seen.id
       where seen.role is not null), '[]'::jsonb))
$$;

revoke all on function public.crm_people() from public, anon;
grant execute on function public.crm_people() to authenticated, service_role;

-- View as reaches the CRM's cross-team viewers (2026-11-12; the owner, after Marketing's Change view went live (#1011):
-- "但是我在手机版的crm 没有看到josiah & weijie" — "不能view as").
--
-- A login given CRM · View in People › Permissions with no CRM title (Marketing's managers, 2026-11-10) is read by
-- crm_my_role() as the Boss — read-only without Edit / Manage — but crm_people() lists only those with a CRM role, so
-- the Principal and the Director could not View as them. crm_people() now also hands whoever runs the CRM
-- (CRM · Manage — the Principal, the Revenue Director) a `viewers` list: active People with a login, no CRM role, IR in
-- their reach, whose template or own cells give
-- CRM · View — each with their reach and whether they also Edit / Manage. They stay out of `people`, so no picker,
-- team, split or count ever meets them.
--
--   crm_cross_viewers()  NEW — the list; only other DEFINER functions call it (revoked from PUBLIC / anon / authenticated).
--   crm_people()         production's body (md5 7b27774672decfd764b9b650025397b2), one change in each branch: the
--                        jsonb_build_object gains 'viewers', crm_cross_viewers() when crm_manages(), else '[]'.

create or replace function public.crm_cross_viewers()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_out jsonb;
begin
  -- Their CRM cells as current_actions() reckons them: the title's template, a person's own cell over it (a NULL scope
  -- takes the cell away); an account with no template (the Principal's kind) is not a cross-team viewer.
  with cand as (
    select s.id, s.employee_name, t.name as title, s.user_id, t.template_id
      from hr_staff_costs s
      join users u on u.id = s.user_id and u.is_active
      join titles t on t.id = s.title_id
     where s.status = 'active' and t.template_id is not null and crm_role_of(s.id) is null
       and s.id is distinct from crm_me()
       -- Only whom the CRM lets in (crm_my_role()'s own test): its sub-department in their reach — so Fair's people,
       -- whose CRM · View opens nothing in IR's CRM, are not listed.
       and (crm_scope() is null or crm_scope() = any (sub_department_reach_in(u.id, 'crm')))
  ), cells as (
    select c.id, g.action, g.scope
      from cand c join permission_template_grants g on g.template_id = c.template_id and g.function_key = 'crm'
     where not exists (select 1 from user_permission_cells x
                        where x.user_id = c.user_id and x.function_key = 'crm' and x.action = g.action)
    union all
    select c.id, x.action, x.scope
      from cand c join user_permission_cells x on x.user_id = c.user_id and x.function_key = 'crm'
     where x.scope is not null
  ), held as (
    select id,
           max(array_position(array['own', 'dept', 'all'], scope)) filter (where action = 'view')   as view_rank,
           max(array_position(array['own', 'dept', 'all'], scope)) filter (where action = 'edit')   as edit_rank,
           bool_or(action = 'manage') as manage
      from cells group by id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.employee_name, 'title', c.title,
           'reach', (array['own', 'dept', 'all'])[h.view_rank],
           'editAll', coalesce(h.edit_rank = 3, false), 'editOwn', h.edit_rank is not null,
           'manage', coalesce(h.manage, false))
           order by c.employee_name), '[]'::jsonb)
    into v_out
    from cand c join held h on h.id = c.id
   where h.view_rank is not null;
  return v_out;
end $function$;

revoke all on function public.crm_cross_viewers() from public, anon, authenticated;
grant execute on function public.crm_cross_viewers() to service_role;

CREATE OR REPLACE FUNCTION public.crm_people()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me   uuid := crm_me();
  v_role text := crm_my_role();
  v_out  jsonb;
begin
  if crm_scope() is null then
    select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', coalesce(crm_role_of(s.id), case when s.id = v_me then v_role end),
               'uplineId', s.reports_to, 'fullTime', coalesce(cs.full_time, false), 'title', t.name,
               'login', s.user_id is not null, 'paused', coalesce(cs.paused, false)) order by s.employee_name)
        from hr_staff_costs s left join crm_staff cs on cs.staff_id = s.id left join titles t on t.id = s.title_id
       where v_role is not null and s.status = 'active' and (crm_role_of(s.id) is not null or s.id = v_me)
         and (s.id in (select crm_downline(v_me)) or crm_sees_all())), '[]'::jsonb),
      'viewers', case when v_role is not null and crm_manages() then crm_cross_viewers() else '[]'::jsonb end)
      into v_out;
    return v_out;
  end if;
  select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', coalesce(x.role, case when s.id = v_me then v_role end),
             'uplineId', crm_upline_of(s.id), 'fullTime', coalesce(cs.full_time, false),
             'title', coalesce(mt.name, t.name),
             'login', s.user_id is not null, 'paused', coalesce(cs.paused, false)) order by s.employee_name)
      from hr_staff_costs s
      cross join lateral (select crm_role_of(s.id) as role) x
      cross join lateral crm_scope_member(s.id) m
      left join titles mt on mt.id = m.title_id
      left join titles t on t.id = s.title_id
      left join crm_staff cs on cs.staff_id = s.id
     where v_role is not null and s.status = 'active' and (x.role is not null or s.id = v_me)
       and (s.id in (select crm_downline(v_me)) or crm_sees_all())), '[]'::jsonb),
    'viewers', case when v_role is not null and crm_manages() then crm_cross_viewers() else '[]'::jsonb end)
    into v_out;
  return v_out;
end $function$;

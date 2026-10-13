-- The CRM's permissions console (2026-10-13; the owner: "在 setting 做一個權限的控制台 … 勾選他就會有", View / Edit /
-- Manage, the Principal and the Director both). Settings › Permissions in the CRM desktop lists everybody in the CRM
-- with their CRM row — View (none · own · all), Edit (none · own · all), Manage (none · all) — as their title's
-- template gives it and as changed for them, and changes it.
--
-- It writes the SAME per-person cells as People › Permissions (user_permission_cells, function 'crm' only), so the
-- database's own checks (has_action → crm_can → crm_me / crm_can_reply / crm_manages) and the keys that open the CRM's
-- pages (current_permissions) follow at once, and People › Permissions shows the change as the person's own. Nothing
-- outside the CRM row is touched.
--
-- Who: CRM · Manage (crm_manages — the Principal and the Revenue Director). Never on oneself, the Principal's account,
-- the CRM's Boss, or anybody whose template is a Principal one (Ultimate / Full access): a Director cannot raise
-- themselves or lower the boss. Only people in the CRM (crm_people, IR's memberships) with a login.
-- History: every change is already in audit_events (user_permission_cells is registered); crm_access_history reads
-- the CRM's rows of it for Settings › History, which the Director could not read through audit_changes.

-- The guard learns the console's functions: production's body (20261013100000's, md5 c0a88490fed40db679c44f39fe9315fc).
create or replace function public.crm_keeps_its_permission_checks()
 returns event_trigger
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  r       record;
  v_name  text;
  v_src   text;
  v_needs text;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands()
            WHERE object_type IN ('function', 'procedure') AND schema_name = 'public' LOOP
    SELECT p.proname, p.prosrc INTO v_name, v_src FROM pg_proc p WHERE p.oid = r.objid;
    v_needs := CASE
      WHEN v_name = 'crm_can' THEN 'has_action('
      WHEN v_name IN ('crm_me', 'crm_sees_all', 'crm_can_reply', 'crm_manages', 'crm_my_can',
                      'crm_invite', 'crm_assign_member', 'crm_answer_invite') THEN 'crm_can('
      WHEN v_name = 'crm_people' THEN 'crm_sees_all('
      WHEN v_name IN ('crm_save_ad_assign', 'crm_save_ad_rule', 'crm_save_fulltime', 'crm_save_team_shares',
                      'crm_send_to', 'crm_send_to_team', 'crm_give_to_hod', 'crm_set_full_time',
                      'crm_save_showroom', 'crm_save_showroom_full', 'crm_save_team_settings',
                      'crm_remind', 'crm_save_showroom_extras', 'crm_save_form', 'crm_delete_form',
                      'crm_access_list', 'crm_set_access', 'crm_access_history') THEN 'crm_manages('
      WHEN v_name IN ('crm_save_details', 'crm_add_note') THEN 'crm_can_reply('
    END;
    IF v_needs IS NOT NULL AND strpos(coalesce(v_src, ''), v_needs) = 0 THEN
      RAISE EXCEPTION '% must keep its CRM permission check — it no longer calls %. Rewrite it from production''s current body, not an older copy (CLAUDE.md › THE CRM ASKS THE PERMISSION MATRIX, mig 20261010030000).',
        r.object_identity, v_needs
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END
$function$;

-- Everybody in the CRM, their title's CRM cells and their own (null scope = taken away).
create or replace function public.crm_access_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_people jsonb;
begin
  if not public.crm_manages() then perform crm_deny('see the CRM''s permissions'); end if;
  v_people := coalesce(public.crm_people() -> 'people', '[]'::jsonb);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'staffId', s.id, 'name', s.employee_name, 'userId', s.user_id,
      'template', t.name,
      'tpl', coalesce((select jsonb_object_agg(g.action, g.scope) from permission_template_grants g
                        where g.template_id = t.id and g.function_key = 'crm'), '{}'::jsonb),
      'own', coalesce((select jsonb_object_agg(c.action, coalesce(c.scope, 'none')) from user_permission_cells c
                        where c.user_id = s.user_id and c.function_key = 'crm'), '{}'::jsonb),
      'locked', public.crm_access_locked(s.id)
    ) order by s.employee_name)
      from jsonb_array_elements(v_people) p
      join hr_staff_costs s on s.id = (p ->> 'id')::uuid
      left join titles ti on ti.id = s.title_id
      left join permission_templates t on t.id = ti.template_id), '[]'::jsonb);
end $$;

-- Why somebody's CRM row cannot be changed here (null = it can).
create or replace function public.crm_access_locked(p_staff uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare s hr_staff_costs; v_base text; v_role text;
begin
  select * into s from hr_staff_costs where id = p_staff;
  if s.id is null then return 'Not in the CRM'; end if;
  if s.user_id is null then return 'No login yet'; end if;
  if s.user_id = auth.uid() or s.id = crm_me() then return 'Your own'; end if;
  select role into v_role from users where id = s.user_id;
  select t.base_role into v_base from titles ti join permission_templates t on t.id = ti.template_id where ti.id = s.title_id;
  if v_role = 'principal' or v_base = 'principal'
     or exists (select 1 from crm_role_map m where m.title_id = s.title_id and m.crm_role = 'boss') then
    return 'Full access';
  end if;
  return null;
end $$;

-- Set one person's CRM row: each of view / edit / manage is 'title' (follow the template), 'none', 'own' or 'all'.
create or replace function public.crm_set_access(p_staff uuid, p_view text, p_edit text, p_manage text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s hr_staff_costs; v_why text; a record;
begin
  if not public.crm_manages() then perform crm_deny('change the CRM''s permissions'); end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(public.crm_people() -> 'people', '[]'::jsonb)) p where (p ->> 'id')::uuid = p_staff) then
    raise exception 'That person is not in the CRM.' using errcode = '22023';
  end if;
  v_why := public.crm_access_locked(p_staff);
  if v_why is not null then raise exception 'Their CRM permissions cannot be changed here (%).', v_why using errcode = '42501'; end if;
  select * into s from hr_staff_costs where id = p_staff;
  for a in select * from (values ('view', p_view), ('edit', p_edit), ('manage', p_manage)) x(action, val) loop
    if a.val is null or a.val not in ('title', 'none', 'own', 'all') or (a.action = 'manage' and a.val = 'own') then
      raise exception 'Choose title, none, own or all for %.', a.action using errcode = '22023';
    end if;
    if a.val in ('own', 'all') and not public.permission_cell_is_valid('crm', a.action, a.val) then
      raise exception 'CRM · % cannot be set to %.', a.action, a.val using errcode = '22023';
    end if;
    if a.val = 'title' then
      delete from user_permission_cells where user_id = s.user_id and function_key = 'crm' and action = a.action;
    else
      insert into user_permission_cells as u (user_id, function_key, action, scope, updated_by)
      values (s.user_id, 'crm', a.action, case when a.val = 'none' then null else a.val end, auth.uid())
      on conflict (user_id, function_key, action) do update
        set scope = excluded.scope, updated_at = now(), updated_by = auth.uid()
        where u.scope is distinct from excluded.scope;
    end if;
  end loop;
  return coalesce((select jsonb_object_agg(c.action, coalesce(c.scope, 'none')) from user_permission_cells c
                    where c.user_id = s.user_id and c.function_key = 'crm'), '{}'::jsonb);
end $$;

-- The CRM rows of the permissions' history (Settings › History): who changed whose CRM access, when, before → after.
create or replace function public.crm_access_history(p_limit integer default 200)
returns table (id bigint, occurred_at timestamptz, actor_name text, staff_name text, op text, old_row jsonb, new_row jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.crm_manages() then perform crm_deny('see the CRM''s permissions'); end if;
  return query
    select e.id, e.occurred_at, coalesce(u.name, u.email, 'Removed account'), coalesce(s.employee_name, '—'), e.op, e.old_row, e.new_row
      from audit_events e
      left join users u on u.id = e.actor_id
      left join hr_staff_costs s on s.user_id = coalesce((e.new_row ->> 'user_id'), (e.old_row ->> 'user_id'))::uuid
     where e.table_name = 'user_permission_cells'
       and coalesce(e.new_row ->> 'function_key', e.old_row ->> 'function_key') = 'crm'
     order by e.occurred_at desc, e.id desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

revoke all on function public.crm_access_list() from public, anon;
revoke all on function public.crm_access_locked(uuid) from public, anon, authenticated;
revoke all on function public.crm_set_access(uuid, text, text, text) from public, anon;
revoke all on function public.crm_access_history(integer) from public, anon;
grant execute on function public.crm_access_list() to authenticated;
grant execute on function public.crm_set_access(uuid, text, text, text) to authenticated;
grant execute on function public.crm_access_history(integer) to authenticated;

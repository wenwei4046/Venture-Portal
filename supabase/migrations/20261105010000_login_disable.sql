-- Disable / enable a login (2026-11-05 — the user, told People › Deactivate leaves the person able to sign in: "这个需要";
-- then: HR may too (but a full-access login stays with whoever manages permissions), the button on the person's page,
-- and Deactivate disables the login with it — Reactivate does not turn it back on).
--
-- A login is off when `users.is_active` is false: every portal page (getUser), the Revenue app, the sign-in page
-- ("Your account is not active. Please contact HR.") and the database (`current_user_role()` refuses an inactive
-- account) already refuse it. Nothing set that column from the app; `users_principal_write` lets only the admin
-- scope write `users`. So one DEFINER step does, asking:
--   People · Edit or Permissions · Edit (team.edit / accounts.manage) on the person's page;
--   never one's own login;
--   a full-access login (Principal kind, or a template that is Principal-kind or ticks Manage permissions) only for
--     whoever manages permissions — as its email (login_email_held);
--   never the last active Principal-kind login.

create or replace function account_set_login(p_user uuid, p_enabled boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role   text;
  v_active boolean;
  v_full   boolean;
begin
  PERFORM public.tab_write_guard(ARRAY['/team/people/[id]'], ARRAY['team.edit', 'accounts.manage']);
  IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['team.edit', 'accounts.manage']) THEN
    RAISE EXCEPTION 'account_set_login: needs People · Edit or Permissions · Edit' USING ERRCODE = '42501';
  END IF;
  if p_user is null or p_enabled is null then raise exception 'Which login, and on or off?'; end if;
  if p_user = auth.uid() then raise exception 'You cannot turn your own login off or on'; end if;

  select u.role::text, u.is_active into v_role, v_active from users u where u.id = p_user for update;
  if not found then raise exception 'That login was not found'; end if;
  if v_active = p_enabled then return; end if;

  select coalesce(v_role = 'principal'
           or exists (select 1 from hr_staff_costs s
                        join titles t on t.id = s.title_id
                        join permission_templates p on p.id = t.template_id
                       where s.user_id = p_user
                         and (p.base_role = 'principal'
                              or exists (select 1 from permission_template_grants g
                                          where g.template_id = p.id and g.function_key = 'accounts' and g.action = 'manage'))), false)
    into v_full;
  IF v_full AND auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['accounts.manage']) THEN
    RAISE EXCEPTION 'This is a full-access login: only whoever manages permissions turns it off or on' USING ERRCODE = '42501';
  END IF;
  if not p_enabled and v_role = 'principal'
     and not exists (select 1 from users where role = 'principal' and is_active and id <> p_user) then
    raise exception 'This is the last active Principal login — it cannot be turned off';
  end if;

  update users set is_active = p_enabled where id = p_user;
end $$;

-- The guard the scan reads (tab-write-guards.test.ts).
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;
SELECT pg_temp.tab_guard('public.account_set_login(uuid, boolean)', $$ARRAY['/team/people/[id]']$$, ARRAY['team.edit', 'accounts.manage']);

revoke all on function account_set_login(uuid, boolean) from public, anon;
grant execute on function account_set_login(uuid, boolean) to authenticated, service_role;

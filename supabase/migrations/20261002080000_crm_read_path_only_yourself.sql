-- CRM read path, tightened (2026-10-02, same day as 20261002070000).
--
-- crm_role_of(p_staff) and crm_downline(p_staff) took ANY person, and a
-- signed-in user may call a function the policies use — so anyone logged in
-- could ask for someone else's role or reporting line. Peers must not see
-- each other (the rule the CRM is built on), so the signed-in side now only
-- ever asks about itself: crm_my_role() and crm_my_downline(). The two
-- any-person functions stay for the service role and are closed to users.
--
-- Add-only in effect: two new functions, the same policies re-created on
-- them, and execute revoked on the two older functions.

create or replace function public.crm_my_role() returns text
language sql stable security definer set search_path = public as $$
  select crm_role_of(crm_me())
$$;

create or replace function public.crm_my_downline() returns setof uuid
language sql stable security definer set search_path = public as $$
  select crm_downline(crm_me())
$$;

create or replace function public.crm_sees_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(crm_my_role() in ('boss', 'hod'), false)
$$;

create or replace function public.crm_can_see(p_assigned uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when crm_my_role() is null then false
    when crm_sees_all() then true
    when p_assigned is not null then p_assigned in (select crm_my_downline())
    when p_team is not null then p_team in (select crm_my_downline())
    else false
  end
$$;

revoke all on function public.crm_my_role(), public.crm_my_downline() from public, anon;
grant execute on function public.crm_my_role(), public.crm_my_downline() to authenticated, service_role;

-- Only about yourself from now on.
revoke execute on function public.crm_role_of(uuid), public.crm_downline(uuid) from authenticated;

drop policy if exists crm_role_map_read on public.crm_role_map;
create policy crm_role_map_read on public.crm_role_map for select to authenticated
  using (public.crm_my_role() is not null);

drop policy if exists crm_staff_read on public.crm_staff;
create policy crm_staff_read on public.crm_staff for select to authenticated
  using (public.crm_sees_all() or staff_id in (select public.crm_my_downline()));

drop policy if exists crm_assign_rules_read on public.crm_assign_rules;
create policy crm_assign_rules_read on public.crm_assign_rules for select to authenticated
  using (public.crm_sees_all() or exists (select 1 from unnest(tl_ids) t where t in (select public.crm_my_downline())));

drop policy if exists crm_team_settings_read on public.crm_team_settings;
create policy crm_team_settings_read on public.crm_team_settings for select to authenticated
  using (public.crm_sees_all() or tl_id in (select public.crm_my_downline()));

-- CRM read policies, evaluated once per query (2026-10-02).
--
-- CLAUDE.md › Permissions: a function inside a policy must be wrapped as
-- (select fn()) or Postgres runs it again for EVERY ROW it checks (the users
-- table was once scanned 32.6M times that way). crm_can_see(assigned, team)
-- took the row's columns, so it could not be wrapped and re-ran "who am I,
-- what is my role, who is below me" per customer. The same rules, written so
-- each of those is answered once:
--   (select crm_my_role()) is not null           -- an InitPlan, once
--   (select crm_sees_all())                      -- once
--   assigned_to in (select crm_my_downline())    -- a hashed SubPlan, once
-- Messages and appointments ask only whether their customer is readable —
-- crm_contacts' own policy answers that, so they no longer repeat the rule.
--
-- Same rules as before (tests/member-sql/validate-crm-team.mjs, unchanged,
-- passes on this); only how often they run changes.

drop policy if exists crm_contacts_read on public.crm_contacts;
create policy crm_contacts_read on public.crm_contacts for select to authenticated
  using (
    (select public.crm_my_role()) is not null
    and (
      (select public.crm_sees_all())
      or assigned_to in (select public.crm_my_downline())
      or (assigned_to is null and team_id in (select public.crm_my_downline()))
    )
  );

drop policy if exists crm_messages_read on public.crm_messages;
create policy crm_messages_read on public.crm_messages for select to authenticated
  using (contact_id in (select id from public.crm_contacts));

drop policy if exists crm_appointments_read on public.crm_appointments;
create policy crm_appointments_read on public.crm_appointments for select to authenticated
  using (contact_id in (select id from public.crm_contacts));

drop policy if exists crm_role_map_read on public.crm_role_map;
create policy crm_role_map_read on public.crm_role_map for select to authenticated
  using ((select public.crm_my_role()) is not null);

drop policy if exists crm_staff_read on public.crm_staff;
create policy crm_staff_read on public.crm_staff for select to authenticated
  using ((select public.crm_sees_all()) or staff_id in (select public.crm_my_downline()));

drop policy if exists crm_assign_rules_read on public.crm_assign_rules;
create policy crm_assign_rules_read on public.crm_assign_rules for select to authenticated
  using ((select public.crm_sees_all()) or tl_ids && array(select public.crm_my_downline()));

drop policy if exists crm_team_settings_read on public.crm_team_settings;
create policy crm_team_settings_read on public.crm_team_settings for select to authenticated
  using ((select public.crm_sees_all()) or tl_id in (select public.crm_my_downline()));

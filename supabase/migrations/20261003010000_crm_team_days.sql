-- CRM team settings, revised by the user (2026-10-03).
--
-- Was: Fri–Sun always to full-time RS; Mon–Thu one switch, automatic by % or
-- by hand. Now:
--   percent_days       — which of Mon–Thu (1–4, as Date.getDay numbers them)
--                        go by the TL's %s (everyone with a %, full time or
--                        not); an unticked day waits for the TL to assign.
--   weekend_full_time  — Fri–Sun: on = full-time RS only, in turn;
--                        off = by the same %s.
-- src/lib/member/crm-team.ts pickInTeam is the twin.
--
-- Add-only: two columns. `weekday` (the old switch) is no longer read and is
-- left in place; no team had saved settings yet.

alter table public.crm_team_settings
  add column if not exists percent_days int[] not null default '{}',
  add column if not exists weekend_full_time boolean not null default true;

alter table public.crm_team_settings drop constraint if exists crm_team_settings_percent_days_check;
alter table public.crm_team_settings add constraint crm_team_settings_percent_days_check
  check (percent_days <@ array[1, 2, 3, 4]);

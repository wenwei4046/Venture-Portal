-- 20261108120000 gave crm_events a read policy calling crm_manages(), which `authenticated` may not execute: every SELECT
-- on crm_events failed with "permission denied for function crm_manages", and with it the whole CRM read (the app's
-- "The CRM is not set up for this account yet" banner, 2026-11-08). Ask crm_sees_all() (View at All — the Principal and
-- the Revenue Director), which every signed-in session may call, as crm_events' own read policy does.
alter policy crm_events_up_next_read on public.crm_events using (kind = 'up_next' and (select crm_sees_all()));

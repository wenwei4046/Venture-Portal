-- CRM redesign v4 (2026-11-10, docs/design_handoff_crm_redesign_v4 notes 21 / 25): a person's own screen choices,
-- kept on the server so they follow them to another computer and survive the next login —
--   adsFigures  Insight › Ads performance: the figures picked (in order) and whether the chart is open;
--   reportCols  Reports › Overview: the extra columns ticked.
-- Each person's own, as their recent emoji are (crm_staff_prefs, mig 20261014251500): read under one's own session through
-- its own-row policy, written only by a DEFINER function that writes the caller's row.

alter table public.crm_staff_prefs add column if not exists ui_prefs jsonb not null default '{}'::jsonb;

-- One key at a time, merged into what is there; null takes the key away. Small on purpose: 40 keys, 4 KB a value.
create or replace function public.crm_save_ui_pref(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := crm_me();
begin
  if v_me is null then perform crm_deny('keep screen choices'); end if;
  if p_key is null or p_key !~ '^[A-Za-z][A-Za-z0-9_]{0,39}$' then raise exception 'bad key'; end if;
  if p_value is not null and octet_length(p_value::text) > 4096 then raise exception 'too large'; end if;
  insert into crm_staff_prefs (staff_id, ui_prefs)
    values (v_me, case when p_value is null then '{}'::jsonb else jsonb_build_object(p_key, p_value) end)
  on conflict (staff_id) do update set ui_prefs =
    case when p_value is null then crm_staff_prefs.ui_prefs - p_key
         else crm_staff_prefs.ui_prefs || jsonb_build_object(p_key, p_value) end;
end $$;

revoke execute on function public.crm_save_ui_pref(text, jsonb) from public, anon;
grant execute on function public.crm_save_ui_pref(text, jsonb) to authenticated, service_role;

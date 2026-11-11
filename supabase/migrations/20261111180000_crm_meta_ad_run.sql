-- An ad's run kept for every CRM ad (2026-11-11 — the owner, Reports › Overview's Columns: "加广告的 start date、end date、
-- status"). crm_ad_names.starts_at / ends_at (mig 20261022150100) were written only for an ad added from Ads to teams' "+"
-- (crm_add_ad); the hourly sweep (lib/member/crm-ad-names-meta.ts › refreshAdStatuses) now reads every ad's ad set
-- start_time / end_time with its effective_status and keeps them here. The service role's alone, as crm_meta_ad_status.
-- A new function, nothing dropped or rewritten.

create or replace function public.crm_meta_ad_run(p_ad text, p_start timestamptz, p_end timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_ad, '') !~ '^\d{5,32}$' or p_start is null then return false; end if;
  -- Meta's run is the truth: its end may be cleared (an ad set set to run with no end).
  update crm_ad_names set starts_at = p_start, ends_at = p_end
   where ad_source_id = p_ad and (starts_at is distinct from p_start or ends_at is distinct from p_end);
  return true;
end $$;

revoke execute on function public.crm_meta_ad_run(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_meta_ad_run(text, timestamptz, timestamptz) to service_role;

-- An ad taken off Ads performance (the owner, 2026-10-24, of "Video Ads-15/10": "在 leads 的部分，是否可以delete"): the ad's
-- customers and their leads stay as they are — only the list of ads leaves it out. crm_ad_names.hidden_at, written by
-- crm_hide_ad (DEFINER, CRM · Manage — as crm_name_ad); a hidden ad comes back with the same call, p_on false.

alter table public.crm_ad_names add column if not exists hidden_at timestamptz;

create or replace function public.crm_hide_ad(p_ad text, p_on boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not crm_manages() then perform crm_deny('hide an ad'); end if;
  if coalesce(btrim(p_ad), '') = '' or length(p_ad) > 64 then raise exception 'Which ad?' using errcode = '22023'; end if;
  insert into crm_ad_names (ad_source_id, name, source, updated_by, updated_at, hidden_at)
  values (p_ad, coalesce((select ad_headline from crm_contacts where ad_source_id = p_ad and ad_headline is not null limit 1), 'Ad ' || p_ad), 'manual', crm_me(), now(), case when p_on then now() end)
  on conflict (ad_source_id) do update set hidden_at = case when p_on then now() end, updated_by = crm_me(), updated_at = now();
end $$;
revoke all on function public.crm_hide_ad(text, boolean) from public, anon;
grant execute on function public.crm_hide_ad(text, boolean) to authenticated;

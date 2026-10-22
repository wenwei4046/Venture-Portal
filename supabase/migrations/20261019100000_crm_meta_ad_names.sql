-- An ad's name from Ads Manager, kept by the server (2026-10-19; the owner: "为什么在他的customer info 中不会自动显示
-- 广告名称", then "做吧"). The system user now has the ad accounts and the app the ads_read use case, so a webhook
-- delivery that brought an ad with no name asks Graph for it (lib/member/crm-ad-names-meta.ts) and keeps it in
-- crm_ad_names (mig 20261016120000) as source 'meta'. The webhooks' service role calls RPCs, never a table
-- (CLAUDE.md › Machine ingest), so two functions, the service role's alone:
--   crm_ads_unnamed(ids)       — which of these ads have no name yet (manual or meta);
--   crm_meta_name_ad(ad, name) — keep Ads Manager's name; a row already there (a manual name) is never touched.

create or replace function public.crm_ads_unnamed(p_ids text[])
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct i), '{}')
  from unnest(coalesce(p_ids, '{}')) as i
  where i ~ '^\d{5,32}$' and not exists (select 1 from crm_ad_names n where n.ad_source_id = i)
$$;

create or replace function public.crm_meta_name_ad(p_ad text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_name text := left(btrim(coalesce(p_name, '')), 120);
begin
  if coalesce(p_ad, '') !~ '^\d{5,32}$' or v_name = '' then return false; end if;
  insert into crm_ad_names (ad_source_id, name, source, updated_by, updated_at)
  values (p_ad, v_name, 'meta', null, now())
  on conflict (ad_source_id) do nothing;
  return found;
end $$;

revoke execute on function public.crm_ads_unnamed(text[]) from public, anon, authenticated;
revoke execute on function public.crm_meta_name_ad(text, text) from public, anon, authenticated;
grant execute on function public.crm_ads_unnamed(text[]) to service_role;
grant execute on function public.crm_meta_name_ad(text, text) to service_role;

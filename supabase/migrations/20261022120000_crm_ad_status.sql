-- Whether an ad is still running (2026-10-22; the owner: "已经结束的广告不需要在apps assign，只保留正在跑的；但在desktop 版
-- 仍然需要保留所有数据 … apps 是要做分页区分暂停/running", then "ook" to: Meta's status where the token can read the ad,
-- else no new lead for 7 days). Ads Manager's effective_status is kept beside the ad's name in crm_ad_names (mig
-- 20261016120000) — `meta_status` (ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, ARCHIVED, DELETED …) and when it was
-- read, `status_at`. Written by the server only (the webhooks when an ad first brings a lead, the hourly sweep for every
-- ad), through two functions the service role alone may call, as crm_meta_name_ad:
--   crm_ads_to_check()                    — every ad a customer came from;
--   crm_meta_ad_status(ad, name, status)  — the ad's status now; its Meta name kept when it has none (a manual name wins).
-- Read with the ad's name by anybody in the CRM (the table's own policy). An ad the token cannot see has no status: the
-- screens then go by its last lead (lib/member/crm-ad-running.ts).

alter table public.crm_ad_names add column if not exists meta_status text check (meta_status is null or length(meta_status) <= 40);
alter table public.crm_ad_names add column if not exists status_at timestamptz;

create or replace function public.crm_ads_to_check()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct c.ad_source_id), '{}')
    from crm_contacts c
   where c.ad_source_id ~ '^\d{5,32}$'
$$;

create or replace function public.crm_meta_ad_status(p_ad text, p_name text, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_name   text := left(btrim(coalesce(p_name, '')), 120);
  v_status text := upper(left(btrim(coalesce(p_status, '')), 40));
begin
  if coalesce(p_ad, '') !~ '^\d{5,32}$' or v_status = '' then return false; end if;
  if v_name <> '' then
    insert into crm_ad_names (ad_source_id, name, source, updated_by, updated_at)
    values (p_ad, v_name, 'meta', null, now())
    on conflict (ad_source_id) do nothing;
  end if;
  update crm_ad_names set meta_status = v_status, status_at = now() where ad_source_id = p_ad;
  return found;
end $$;

revoke execute on function public.crm_ads_to_check() from public, anon, authenticated;
revoke execute on function public.crm_meta_ad_status(text, text, text) from public, anon, authenticated;
grant execute on function public.crm_ads_to_check() to service_role;
grant execute on function public.crm_meta_ad_status(text, text, text) to service_role;

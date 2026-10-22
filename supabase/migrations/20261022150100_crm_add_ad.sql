-- An ad added before it brings a lead (2026-10-22; the owner: "在 desktop 版的 assignment，能不能直接有个 + 号，director 能提前
-- 先把广告加进来先做分配，这个我要"). The desktop's Ads to teams "+" lists the ads of the ad accounts the system user sees
-- (read by the server from Graph) and adds the one picked: its name, status and run (the ad set's start and end — the owner:
-- "广告开始跑，或者 pending 要跑（几时开始，几时结束），在 desktop 都要看到") kept in crm_ad_names, `added_at` marking it,
-- so Ads to teams lists it with no lead yet and its split can be set before the first enquiry. Opening Ads to teams also
-- adds, the same way, every ad Meta has running or about to run.
--   crm_add_ad(ad, name, status, start, end) — CRM · Manage (crm_manages()), as crm_name_ad; a manual name already there stays.
-- crm_ads_to_check (mig 20261022120000) now also lists the added ads, so the hourly sweep keeps their status.

alter table public.crm_ad_names add column if not exists added_at timestamptz;
alter table public.crm_ad_names add column if not exists starts_at timestamptz;
alter table public.crm_ad_names add column if not exists ends_at timestamptz;

create or replace function public.crm_add_ad(p_ad text, p_name text, p_status text, p_start timestamptz, p_end timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_name   text := left(btrim(coalesce(p_name, '')), 120);
  v_status text := nullif(upper(left(btrim(coalesce(p_status, '')), 40)), '');
begin
  if not public.crm_manages() then perform crm_deny('add an ad'); end if;
  if coalesce(p_ad, '') !~ '^\d{5,32}$' then raise exception 'An ad id is its digits, as Ads Manager shows it.' using errcode = '22023'; end if;
  insert into crm_ad_names (ad_source_id, name, source, updated_by, updated_at, added_at, meta_status, status_at, starts_at, ends_at)
  values (p_ad, coalesce(nullif(v_name, ''), 'Ad ' || p_ad), case when v_name <> '' then 'meta' else 'manual' end, crm_me(), now(), now(), v_status, case when v_status is null then null else now() end, p_start, p_end)
  on conflict (ad_source_id) do update set
    added_at    = coalesce(crm_ad_names.added_at, now()),
    starts_at   = coalesce(excluded.starts_at, crm_ad_names.starts_at),
    ends_at     = excluded.ends_at,
    meta_status = coalesce(excluded.meta_status, crm_ad_names.meta_status),
    status_at   = coalesce(excluded.status_at, crm_ad_names.status_at);
  return true;
end $$;

revoke execute on function public.crm_add_ad(text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_add_ad(text, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.crm_ads_to_check()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct a), '{}') from (
    select c.ad_source_id as a from crm_contacts c where c.ad_source_id ~ '^\d{5,32}$'
    union
    select n.ad_source_id from crm_ad_names n where n.added_at is not null and n.ad_source_id ~ '^\d{5,32}$'
  ) x
$$;

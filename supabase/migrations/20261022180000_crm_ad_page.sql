-- An ad's Page, so the desktop's Ads to teams groups the ads by brand (2026-10-22; the owner: "这里的广告应该只有 dc & the
-- conts 的不是吗？", then "然后分一下 DC & The conts"). The server now lists only the ads of the CRM's own Pages
-- (META_PAGE_IDS) and keeps each one's Page id and name with it:
--   crm_add_ad(ad, name, status, start, end, page, page_name) — the seven-argument function; the five-argument one
--   (mig 20261022150000) stays callable for a page open across the release, EXECUTE taken from no one yet.
-- An ad with no Page known (one the system user cannot see) is grouped as Other.

alter table public.crm_ad_names add column if not exists page_id text check (page_id is null or page_id ~ '^\d{3,32}$');
alter table public.crm_ad_names add column if not exists page_name text check (page_name is null or length(page_name) <= 120);

create or replace function public.crm_add_ad(p_ad text, p_name text, p_status text, p_start timestamptz, p_end timestamptz, p_page text, p_page_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_name   text := left(btrim(coalesce(p_name, '')), 120);
  v_status text := nullif(upper(left(btrim(coalesce(p_status, '')), 40)), '');
  v_page   text := case when coalesce(p_page, '') ~ '^\d{3,32}$' then p_page end;
  v_pname  text := nullif(left(btrim(coalesce(p_page_name, '')), 120), '');
begin
  if not public.crm_manages() then perform crm_deny('add an ad'); end if;
  if coalesce(p_ad, '') !~ '^\d{5,32}$' then raise exception 'An ad id is its digits, as Ads Manager shows it.' using errcode = '22023'; end if;
  insert into crm_ad_names (ad_source_id, name, source, updated_by, updated_at, added_at, meta_status, status_at, starts_at, ends_at, page_id, page_name)
  values (p_ad, coalesce(nullif(v_name, ''), 'Ad ' || p_ad), case when v_name <> '' then 'meta' else 'manual' end, crm_me(), now(), now(), v_status,
          case when v_status is null then null else now() end, p_start, p_end, v_page, v_pname)
  on conflict (ad_source_id) do update set
    added_at    = coalesce(crm_ad_names.added_at, now()),
    starts_at   = coalesce(excluded.starts_at, crm_ad_names.starts_at),
    ends_at     = excluded.ends_at,
    meta_status = coalesce(excluded.meta_status, crm_ad_names.meta_status),
    status_at   = coalesce(excluded.status_at, crm_ad_names.status_at),
    page_id     = coalesce(excluded.page_id, crm_ad_names.page_id),
    page_name   = coalesce(excluded.page_name, crm_ad_names.page_name);
  return true;
end $$;

revoke execute on function public.crm_add_ad(text, text, text, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.crm_add_ad(text, text, text, timestamptz, timestamptz, text, text) to authenticated;

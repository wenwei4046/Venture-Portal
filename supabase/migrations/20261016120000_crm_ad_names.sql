-- An ad's name (2026-10-16; the owner, circling "Chat with us" under a customer's name: "標記起來的地方是顯示廣告的名稱，不然業務
-- 也看不懂", then "ok" to this table). Meta's message carries an ad's id and its HEADLINE ("Chat with us"), never the name the
-- ad has in Ads Manager, and the system user's token has no ads_read to ask for it. So each ad gets one row here: a name the
-- Principal / Director give it (source 'manual'), or — once Meta grants ads_read — the name Ads Manager has (source 'meta',
-- written by the server); a manual name wins. Every screen shows it where it showed the headline. Read by everybody in the
-- CRM (an ad's name is no secret inside it); written only by crm_name_ad (CRM · Manage) and, for 'meta', the service role.

create table if not exists public.crm_ad_names (
  ad_source_id text primary key check (length(ad_source_id) between 1 and 64),
  name         text not null check (length(btrim(name)) between 1 and 120),
  source       text not null default 'manual' check (source in ('manual', 'meta')),
  updated_by   uuid references public.hr_staff_costs(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.crm_ad_names enable row level security;
revoke all on public.crm_ad_names from anon, authenticated;
grant select on public.crm_ad_names to authenticated;

drop policy if exists crm_ad_names_read on public.crm_ad_names;
create policy crm_ad_names_read on public.crm_ad_names for select to authenticated
  using ((select crm_me()) is not null);

-- Name an ad (CRM · Manage). An empty name takes the manual name off: the ad shows Meta's name, else its headline.
create or replace function public.crm_name_ad(p_ad text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not crm_manages() then perform crm_deny('name an ad'); end if;
  if coalesce(btrim(p_ad), '') = '' or length(p_ad) > 64 then raise exception 'Which ad?' using errcode = '22023'; end if;
  if length(v_name) > 120 then raise exception 'An ad''s name can be up to 120 characters.' using errcode = '22023'; end if;
  if v_name = '' then
    delete from crm_ad_names where ad_source_id = p_ad and source = 'manual';
  else
    insert into crm_ad_names (ad_source_id, name, source, updated_by, updated_at)
    values (p_ad, v_name, 'manual', crm_me(), now())
    on conflict (ad_source_id) do update set name = excluded.name, source = 'manual', updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;

revoke execute on function public.crm_name_ad(text, text) from public, anon;
grant execute on function public.crm_name_ad(text, text) to authenticated;

SELECT public.audit_register('crm_ad_names', 'CRM ad names', 'Member services', '{revenue}', 'people',
  p_keys => '{ad_source_id}', p_labels => '{name}');
do $$ begin
  if to_regclass('public.audit_tables') is null then return; end if;
  update public.audit_tables set read_keys = array(select distinct k from unnest(read_keys || '{crm_manage}'::text[]) k order by k)
   where table_name = 'crm_ad_names' and not ('crm_manage' = any (read_keys));
end $$;

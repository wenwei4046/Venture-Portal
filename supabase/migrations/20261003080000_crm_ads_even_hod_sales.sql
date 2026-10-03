-- Principal and HOD, revised by the user 2026-10-03.
--
-- Which team takes a new enquiry:
--   - an ad the Principal (Boss) or HOD handed to one or more teams: evenly among them;
--   - an ad they split by %: by each team's % (crm_assign_rules.shares, TL → %, adding to 100);
--   - any other ad, and an enquiry that came from no ad: EVENLY across every
--     team, until the Principal or HOD moves it. (Was: by each team's
--     Mode-2 %, else waiting for the Boss/HOD — crm_team_settings.team_share
--     is no longer read.)
--   Balanced on the last 30 days — for an ad's own rule, on that ad's enquiries.
--
-- People:
--   - the HOD also sells: may reply to the customers given to them
--     (assigned_to = the HOD) — never to a team's;
--   - the Principal or HOD may give an enquiry to an HOD (crm_give_to_hod);
--   - the Principal may also set who is full time (was the HOD only).
--
-- Add-only: one column, one new function, one new overload, four functions re-stated.

alter table public.crm_assign_rules add column if not exists shares jsonb;

create or replace function public.crm_pick_team(p_ad text, out team uuid, out how int)
language plpgsql stable security definer set search_path = public as $$
declare
  given  jsonb;
  shares jsonb;
  r      crm_assign_rules;
begin
  if p_ad is not null then
    select * into r from crm_assign_rules where ad_source_id = p_ad;
  end if;

  if r.ad_source_id is not null then
    select coalesce(jsonb_object_agg(team_id, n), '{}'::jsonb) into given
      from (select team_id, count(*) as n from crm_contacts
             where team_id is not null and ad_source_id = p_ad and created_at > now() - interval '30 days' group by team_id) x;
    -- Split by %: each team's share (only people who are TLs today).
    select coalesce(jsonb_object_agg(s.key, s.value::numeric), '{}'::jsonb) into shares
      from jsonb_each_text(coalesce(r.shares, '{}'::jsonb)) s
     where s.value ~ '^\d+(\.\d+)?$' and s.value::numeric > 0 and crm_role_of(s.key::uuid) = 'tl';
    if shares <> '{}'::jsonb then
      team := crm_pick_by_share(shares, given);
      how := 2;
      return;
    end if;
    -- Handed to teams: evenly among them.
    select coalesce(jsonb_object_agg(t, 1), '{}'::jsonb) into shares
      from unnest(r.tl_ids) t where crm_role_of(t) = 'tl';
    if shares <> '{}'::jsonb then
      team := crm_pick_by_share(shares, given);
      how := 1;
      return;
    end if;
  end if;

  -- Everything else: evenly across every team.
  select coalesce(jsonb_object_agg(team_id, n), '{}'::jsonb) into given
    from (select team_id, count(*) as n from crm_contacts
           where team_id is not null and created_at > now() - interval '30 days' group by team_id) x;
  select coalesce(jsonb_object_agg(s.id, 1), '{}'::jsonb) into shares
    from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'tl';
  team := crm_pick_by_share(shares, given);
  how := case when team is null then null else 3 end;
end $$;

-- Hand an ad to teams (p_tls, evenly) or split it by % (p_shares: TL → %, adding to 100).
-- Both empty = the ad goes back to even across every team.
create or replace function public.crm_save_ad_rule(p_ad text, p_label text, p_tls uuid[], p_shares jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tls    uuid[] := coalesce(p_tls, '{}');
  v_shares jsonb := nullif(coalesce(p_shares, '{}'::jsonb), '{}'::jsonb);
  v_total  numeric;
begin
  if not crm_sees_all() then perform crm_deny('decide which teams take an ad'); end if;
  if coalesce(trim(p_ad), '') = '' then raise exception 'Which ad?' using errcode = '22023'; end if;
  if v_shares is not null then
    if exists (select 1 from jsonb_each_text(v_shares) s
                where s.value !~ '^\d+$' or s.value::int > 100 or crm_role_of(s.key::uuid) is distinct from 'tl') then
      raise exception 'Each team''s %% must be 0–100, for a TL.' using errcode = '22023';
    end if;
    select sum(s.value::int) into v_total from jsonb_each_text(v_shares) s;
    if v_total <> 100 then raise exception 'The %% must add up to 100 (now %).', v_total using errcode = '22023'; end if;
    select coalesce(array_agg(s.key::uuid), '{}') into v_tls from jsonb_each_text(v_shares) s where s.value::int > 0;
  elsif exists (select 1 from unnest(v_tls) t where crm_role_of(t) is distinct from 'tl') then
    raise exception 'An ad can only be handed to teams (TLs).' using errcode = '22023';
  end if;

  if cardinality(v_tls) = 0 then
    delete from crm_assign_rules where ad_source_id = p_ad;
    return jsonb_build_object('ad', p_ad, 'tl_ids', '[]'::jsonb, 'shares', null);
  end if;
  insert into crm_assign_rules (ad_source_id, ad_label, tl_ids, shares, updated_by, updated_at)
  values (p_ad, nullif(trim(coalesce(p_label, '')), ''), v_tls, v_shares, auth.uid(), now())
  on conflict (ad_source_id) do update set ad_label = coalesce(excluded.ad_label, crm_assign_rules.ad_label),
    tl_ids = excluded.tl_ids, shares = excluded.shares, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return jsonb_build_object('ad', p_ad, 'tl_ids', to_jsonb(v_tls), 'shares', v_shares);
end $$;
revoke all on function public.crm_save_ad_rule(text, text, uuid[], jsonb) from public, anon;
grant execute on function public.crm_save_ad_rule(text, text, uuid[], jsonb) to authenticated, service_role;

create or replace function public.crm_set_full_time(p_staff uuid, p_full_time boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(crm_my_role(), '') not in ('boss', 'hod') then perform crm_deny('set who is full time'); end if;
  if crm_role_of(p_staff) is distinct from 'rs' then raise exception 'Only an RS is full time or not.' using errcode = '22023'; end if;
  insert into crm_staff (staff_id, full_time, updated_by, updated_at) values (p_staff, coalesce(p_full_time, false), auth.uid(), now())
  on conflict (staff_id) do update set full_time = excluded.full_time, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

-- The HOD replies to their own customers; everyone else as before. Never the Principal (Boss).
create or replace function public.crm_can_reply(p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from crm_contacts c
     where c.id = p_contact
       and (
         (crm_my_role() in ('stl', 'tl', 'ta', 'rs') and coalesce(c.assigned_to, c.team_id) in (select crm_my_downline()))
         or (crm_my_role() = 'hod' and c.assigned_to = crm_me())
       )
  )
$$;

-- The Principal or HOD gives an enquiry to an HOD (themselves, or the other).
create or replace function public.crm_give_to_hod(p_contact uuid, p_hod uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not crm_sees_all() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('give this customer to an HOD');
  end if;
  if crm_role_of(p_hod) is distinct from 'hod' then raise exception 'Choose an HOD.' using errcode = '22023'; end if;
  update crm_contacts set assigned_to = p_hod, team_id = null where id = p_contact;
end $$;
revoke all on function public.crm_give_to_hod(uuid, uuid) from public, anon;
grant execute on function public.crm_give_to_hod(uuid, uuid) to authenticated, service_role;

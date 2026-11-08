-- Insight › Up next was slow (the owner, 2026-11-08: "载入速度太慢了"; measured on production: 3.2 s of a 3.7 s read went
-- on asking, person by person and ad by ad, whether each one is in turn — 105 calls, each reading the Full time teams
-- twice). The dealer itself (10 throwaway leads) took 0.5 s. Now:
--   · the Full time teams are read once per read and handed in (crm_up_next_why's sixth argument);
--   · ads with the same setting are asked once — the answer depends only on the setting (the ad's own count matters only
--     for By max, and an ad counted together shares its count), so the 12 together ads are one question, not twelve;
--   · whoever the real dealer just gave a lead to is in turn, and is not asked at all.
-- Nothing about who is in turn changes: the same questions, asked fewer times.

create or replace function public.crm_up_next_why(p_staff uuid, p_team uuid, p_ad text, p_at timestamptz, p_ft uuid[])
returns text language plpgsql stable security definer set search_path = public as $$
declare
  r crm_ad_assign; v_day int := (extract(isodow from (p_at at time zone 'Asia/Kuala_Lumpur'))::int + 6) % 7;
  v_ftday boolean := coalesce(cardinality(p_ft), 0) > 0; v_ftok boolean; v_ft boolean := p_team = any (coalesce(p_ft, '{}'));
  v_mode text; v_any boolean; v_given numeric;
begin
  select * into r from crm_ad_assign where ad_source_id = p_ad;
  if r.ad_source_id is null then
    return case when p_team = crm_director_key() then null else 'not_on_ad' end;
  end if;
  if r.mode = 'even' then
    if v_ftday and not v_ft then return 'not_full_time'; end if;
  else
    if coalesce((r.team_split ->> p_team::text)::numeric, 0) <= 0 then return 'not_on_ad'; end if;
    v_ftok := v_ftday and exists (select 1 from jsonb_each_text(r.team_split) s(key, val)
      where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and key::uuid = any (p_ft));
    if v_ftok and not v_ft then return 'not_full_time'; end if;
  end if;
  if v_ft then
    if not exists (select 1 from crm_fulltime_rules f join crm_staff cs on cs.staff_id = p_staff and cs.full_time
                    where f.tl_id = p_team and coalesce((f.vals -> p_staff::text ->> v_day::text)::numeric, 0) > 0) then
      return 'not_full_time';
    end if;
    return null;
  end if;
  if r.mode <> 'even' then
    v_mode := coalesce(r.team_modes ->> p_team::text, 'pct');
    if v_mode = 'cnt' then
      if coalesce((r.people ->> p_staff::text)::numeric, 0) <= 0 then return 'no_share'; end if;
      select coalesce(sum(g.n), 0) into v_given from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = p_staff;
      if v_given >= (r.people ->> p_staff::text)::numeric then return 'at_limit'; end if;
    elsif v_mode = 'pct' then
      select exists (select 1 from crm_deal_handlers(p_team) h where coalesce((r.people ->> h::text)::numeric, 0) > 0) into v_any;
      if v_any and coalesce((r.people ->> p_staff::text)::numeric, 0) <= 0 then return 'no_share'; end if;
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.crm_up_next_why(uuid, uuid, text, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.crm_up_next_why(uuid, uuid, text, timestamptz, uuid[]) to service_role;

create or replace function public.crm_up_next(p_ad text, p_ads text[] default null, p_n int default 10, p_line uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := crm_me(); v_all boolean := crm_sees_all(); v_line uuid[]; v_at timestamptz := now();
  v_ads text[]; v_ask text[]; v_i int := 0; v_max int; v_contact uuid; v_res jsonb; v_who uuid; v_dealt uuid[] := '{}';
  v_queue jsonb := '[]'; v_people jsonb := '[]'; v_shares jsonb := '{}'; v_last jsonb; v_lastby jsonb; v_up jsonb;
  v_n int := least(greatest(coalesce(p_n, 10), 1), 30); v_got int := 0; v_ad text; v_scoped boolean;
  v_ft uuid[] := array(select crm_fulltime_teams(now())); v_day int := (extract(isodow from (now() at time zone 'Asia/Kuala_Lumpur'))::int + 6) % 7;
  p record; v_why text; w text; v_paused boolean; v_locked boolean; v_lv crm_staff_leave; v_ticked boolean;
begin
  if v_me is null then perform crm_deny('read who is next'); end if;
  if v_all then
    v_scoped := p_line is not null;
    if v_scoped then v_line := array(select crm_downline(p_line)) || p_line; end if;
  else
    v_scoped := true;
    v_line := array(select crm_my_downline());
    if not exists (select 1 from unnest(v_line) x where x <> v_me) then perform crm_deny('read who is next'); end if;
  end if;

  v_ads := case when p_ad = 'all' then coalesce(p_ads, array(select a.ad_source_id from crm_ad_assign a order by a.ad_source_id)) else array[p_ad] end;
  v_max := case when v_scoped then 40 else v_n * 2 end;
  -- One ad for each different setting: the same setting gives the same answer (By max apart, unless counted together).
  v_ask := array(select min(x) from unnest(v_ads) x left join crm_ad_assign a on a.ad_source_id = x
                  group by coalesce(a.mode, '-'), a.team_split::text, a.team_modes::text, a.people::text,
                           case when a.ad_source_id is null or a.together or a.mode = 'even' then '' else x end);

  -- The real dealer, on throwaway leads, all rolled back.
  if coalesce(array_length(v_ads, 1), 0) > 0 then
    begin
      while v_i < v_max and v_got < v_n loop
        v_ad := v_ads[(v_i % array_length(v_ads, 1)) + 1];
        v_i := v_i + 1;
        insert into crm_contacts (channel, account_id, external_id, ad_source_id, last_customer_at)
        values ('whatsapp', 'up-next-preview', gen_random_uuid()::text, v_ad, v_at) returning id into v_contact;
        v_res := crm_assign_contact(v_contact);
        v_who := nullif(v_res ->> 'member', '')::uuid;
        if v_who is not null then
          update crm_contacts set assigned_at = clock_timestamp() where id = v_contact;
          if not (v_who = any (v_dealt)) then v_dealt := v_dealt || v_who; end if;
          if not v_scoped or v_who = any (v_line) then
            v_queue := v_queue || jsonb_build_object('staff', v_who, 'team', coalesce((v_res ->> 'team')::uuid, crm_director_key()), 'how', v_res ->> 'member_by', 'pinBy', v_res -> 'pin_by', 'ad', v_ad);
            v_got := v_got + 1;
          end if;
        end if;
      end loop;
      raise exception 'rolled back' using errcode = 'VPUPN';
    exception when sqlstate 'VPUPN' then null;
    end;
  end if;

  for p in
    select h.staff, coalesce(crm_team_of(h.staff), case when crm_role_of(h.staff) = 'hod' then crm_director_key() end) as team
      from (select a as staff from crm_all_handlers() a union select d from crm_team_handlers(crm_director_key()) d) h
  loop
    continue when p.team is null;
    continue when v_scoped and not (p.staff = any (v_line));
    select coalesce(s.paused, false), coalesce(s.locked, false) into v_paused, v_locked from crm_staff s where s.staff_id = p.staff;
    v_paused := coalesce(v_paused, false); v_locked := coalesce(v_locked, false);
    select * into v_lv from crm_staff_leave l where l.staff_id = p.staff and v_at between l.from_at and l.to_at limit 1;
    v_why := case when v_lv.id is not null then 'leave' when v_paused then 'paused' end;
    -- Dealt a lead just now: in turn, nothing to ask.
    if v_why is null and not (p.staff = any (v_dealt)) then
      v_why := case when coalesce(array_length(v_ask, 1), 0) = 0 then 'not_on_ad' end;
      for w in select crm_up_next_why(p.staff, p.team, a, v_at, v_ft) from unnest(v_ask) a loop
        if w is null then v_why := null; exit; end if;
        if v_why is null then v_why := w; end if;
      end loop;
      if v_locked and v_why is distinct from 'not_on_ad' then v_why := 'locked'; end if;
    end if;
    v_ticked := coalesce(cardinality(v_ft), 0) = 0 or exists (
      select 1 from crm_fulltime_rules f join crm_staff cs on cs.staff_id = p.staff and cs.full_time
       where f.tl_id = p.team and v_day = any (f.days) and coalesce((f.vals -> p.staff::text ->> v_day::text)::numeric, 0) > 0);
    v_people := v_people || jsonb_build_object('staff', p.staff, 'team', p.team, 'why', v_why,
      'pickable', v_lv.id is null and not v_paused and not v_locked and v_ticked,
      'leave', case when v_lv.id is null then null else jsonb_build_object('id', v_lv.id,
        'from', to_char(v_lv.from_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
        'to', to_char(v_lv.to_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), 'reason', v_lv.reason, 'note', v_lv.note) end);
  end loop;

  select coalesce(jsonb_object_agg(team, round(share / greatest(coalesce(array_length(v_ads, 1), 1), 1), 2)), '{}') into v_shares from (
    select s.key as team, sum(s.val::numeric * 100 / nullif(t.total, 0)) as share
      from crm_ad_assign a
      cross join lateral jsonb_each_text(a.team_split) s(key, val)
      cross join lateral (select sum(x.val::numeric) as total from jsonb_each_text(a.team_split) x(key, val) where x.val ~ '^\d+(\.\d+)?$') t
     where a.ad_source_id = any (v_ads) and a.mode <> 'even' and s.val ~ '^\d+(\.\d+)?$' and s.val::numeric > 0
     group by s.key) q;

  select jsonb_build_object('staff', c.assigned_to, 'at', c.assigned_at, 'ad', c.ad_source_id) into v_last
    from crm_contacts c
   where c.ad_source_id is not null and c.assigned_to is not null and c.assigned_at is not null
     and (p_ad = 'all' or c.ad_source_id = p_ad)
     and (not v_scoped or c.assigned_to = any (v_line))
   order by c.assigned_at desc limit 1;
  select coalesce(jsonb_object_agg(q.who, q.at), '{}') into v_lastby from (
    select c.assigned_to as who, max(c.assigned_at) as at from crm_contacts c
     where c.ad_source_id is not null and c.assigned_to is not null and c.assigned_at is not null
       and (p_ad = 'all' or c.ad_source_id = p_ad)
     group by c.assigned_to) q;

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'staff', l.staff_id,
      'from', to_char(l.from_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
      'to', to_char(l.to_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), 'reason', l.reason, 'note', l.note) order by l.from_at), '[]') into v_up
    from crm_staff_leave l where l.from_at > v_at and (not v_scoped or l.staff_id = any (v_line));

  return jsonb_build_object('me', v_me, 'now', to_char(v_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
    'manage', crm_manages(),
    'canAct', crm_manages() or (crm_up_next_ticked(v_me) and crm_can('view', 'own')),
    'fullTimeDay', coalesce(cardinality(v_ft), 0) > 0,
    'together', coalesce(array_length(v_ads, 1), 0) > 1 and not exists (select 1 from unnest(v_ads) x left join crm_ad_assign a on a.ad_source_id = x where a.together is not true)
      and (select count(distinct a.team_split) from crm_ad_assign a where a.ad_source_id = any (v_ads)) = 1,
    'queue', v_queue, 'people', v_people, 'shares', v_shares, 'last', v_last, 'lastBy', v_lastby, 'upcoming', v_up);
end $$;
revoke execute on function public.crm_up_next(text, text[], int, uuid) from public, anon;
grant execute on function public.crm_up_next(text, text[], int, uuid) to authenticated;

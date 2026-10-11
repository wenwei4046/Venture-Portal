-- The CRM's lead dealer, rev 1011 (docs/design/rev1011 › §6; user OK 2026-10-11: "A B C D OK").
--
-- A · Full time lead allocation = days per person, taking turns. crm_fulltime_rules.mode 'turns':
--     vals[staff][day] = 1 where ticked. On a day where one person is ticked, the team's ad enquiries that day go to
--     them; two or more take turns (the next goes to whoever got one least recently); nobody ticked → the team's usual
--     rule. It overrides every inside-team mode (Evenly, By %, By max) — a ticked person keeps getting leads past a By max
--     limit and nothing goes Over the limit because of it. Old Max / By % rows become 'turns' (any value > 0 = ticked).
-- B · An ad with no setting is dealt EVENLY across all teams (the team furthest below an even share of that ad's
--     enquiries over the last 30 days), then by the team's usual rule. Organic Leads keeps only enquiries with no ad
--     (and anything no rule can place, e.g. no teams).
-- C · By team has two levels: the team split (%), then inside each team Evenly / By % (the default) / By max
--     (crm_ad_assign.team_modes). A By max team that is full HOLDS the lead (crm_contacts.held_reason = 'limit', its team
--     kept, nobody yet) — it never goes to another team. Saving the rule deals that ad's held leads first, oldest first,
--     only inside the team they wait for. By people is merged into By team (old 'people' rules become 'split').
-- D · Member work type: any team member (TL, TA, RS) may be full time; switching somebody off clears their ticked days.
--
-- Every function below is rewritten from PRODUCTION's body of 2026-10-11 (pg_get_functiondef), keeping its check; the
-- dealer's TypeScript twin is lib/member/crm-team.ts › dealEnquiry (crm-team.test.ts holds the two to the same rules).

-- ── Storage ──────────────────────────────────────────────────────────────
alter table public.crm_ad_assign add column if not exists team_modes jsonb not null default '{}'::jsonb;
alter table public.crm_contacts add column if not exists held_reason text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_contacts_held_reason_check') then
    alter table public.crm_contacts add constraint crm_contacts_held_reason_check check (held_reason is null or held_reason = 'limit');
  end if;
end $$;

-- Old By people rules → By team: the teams of the people with a value, an even split; inside each, the old max / %.
update public.crm_ad_assign a set
  mode = 'split',
  team_split = coalesce((
    select jsonb_object_agg(t.team, (100 / t.n_teams) + case when t.k <= 100 % t.n_teams then 1 else 0 end)
      from (select team, row_number() over (order by team) as k, count(*) over () as n_teams
              from (select distinct crm_team_of(key::uuid) as team from jsonb_each_text(a.people) where value ~ '^\d+(\.\d+)?$' and value::numeric > 0) s
             where team is not null) t), '{}'::jsonb),
  team_modes = coalesce((
    select jsonb_object_agg(team, case when a.people_mode = 'pct' then 'pct' else 'cnt' end)
      from (select distinct crm_team_of(key::uuid) as team from jsonb_each_text(a.people) where value ~ '^\d+(\.\d+)?$' and value::numeric > 0) s
     where team is not null), '{}'::jsonb)
 where a.mode = 'people';

-- Full time rows may be 'turns' (rev 1011 §6.2); 'cnt' / 'pct' stay readable for a row saved across the release.
alter table public.crm_fulltime_rules drop constraint if exists crm_fulltime_rules_mode_check;
alter table public.crm_fulltime_rules add constraint crm_fulltime_rules_mode_check check (mode in ('cnt', 'pct', 'turns'));

-- Old Max / By % full-time rows → turns (any value > 0 on a chosen day = ticked).
update public.crm_fulltime_rules r set
  mode = 'turns',
  vals = coalesce((
    select jsonb_object_agg(st.key, (select jsonb_object_agg(d::text, case when d = any (r.days) and coalesce((st.value ->> d::text)::numeric, 0) > 0 then 1 else 0 end)
                                       from generate_series(0, 6) d))
      from jsonb_each(r.vals) st), '{}'::jsonb)
 where r.mode <> 'turns';

-- Whoever is given a customer, however (the dealer, Send to, a TL, an accepted move), is no longer waiting Over the limit.
create or replace function public.crm_contacts_stamp_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null then
    new.assigned_at := null;
    new.assigned_by := null;
  elsif tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    new.assigned_at := now();
    -- The signed-in person who gave it; null when the CRM dealt it (the ingest has no session).
    new.assigned_by := case when auth.uid() is null then null else crm_me() end;
    new.held_reason := null;
  end if;
  return new;
end $$;
revoke all on function public.crm_contacts_stamp_assigned() from public, anon, authenticated;

-- ── A · Full time: turns ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_fulltime_pick(p_tl uuid, p_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r       crm_fulltime_rules;
  v_local timestamp := p_at at time zone 'Asia/Kuala_Lumpur';
  v_day   int := (extract(isodow from v_local)::int + 6) % 7; -- 0 = Monday
  v_from  timestamptz := date_trunc('day', v_local) at time zone 'Asia/Kuala_Lumpur';
  v_total int;
  v_ft    int;
  v_sum   numeric;
  v_pick  uuid;
begin
  select * into r from crm_fulltime_rules where tl_id = p_tl;
  if r.tl_id is null or not (v_day = any (r.days)) then return null; end if;
  if r.mode = 'turns' then
    -- rev 1011 §6.2: the ticked full-time people of the team, in turn — whoever got one from this team least recently.
    select ft.staff into v_pick from (
      select h as staff, (select max(c.assigned_at) from crm_contacts c where c.assigned_to = h and c.team_id = p_tl) as last_at
        from crm_team_handlers(p_tl) h join crm_staff cs on cs.staff_id = h and cs.full_time
       where coalesce((r.vals -> h::text ->> v_day::text)::numeric, 0) > 0) ft
     order by ft.last_at nulls first, ft.staff limit 1;
    return v_pick;
  end if;
  if r.mode = 'cnt' then
    -- Under their daily maximum: the one with fewest today.
    select ft.staff into v_pick from (
      select h as staff, coalesce((r.vals -> h::text ->> v_day::text)::numeric, 0) as val,
             (select count(*) from crm_contacts c where c.assigned_to = h and c.created_at >= v_from)::int as given
        from crm_team_handlers(p_tl) h join crm_staff cs on cs.staff_id = h and cs.full_time
       where crm_role_of(h) = 'rs') ft
     where ft.val > 0 and ft.given < ft.val order by ft.given, ft.staff limit 1;
    return v_pick;
  end if;
  -- %: full time take sum% of the team's leads today; each to the one furthest below their %.
  select coalesce(sum(ft.val), 0), coalesce(sum(ft.given), 0) into v_sum, v_ft from (
    select coalesce((r.vals -> h::text ->> v_day::text)::numeric, 0) as val,
           (select count(*) from crm_contacts c where c.assigned_to = h and c.created_at >= v_from)::int as given
      from crm_team_handlers(p_tl) h join crm_staff cs on cs.staff_id = h and cs.full_time
     where crm_role_of(h) = 'rs') ft where ft.val > 0;
  select count(*) into v_total from crm_contacts where team_id = p_tl and created_at >= v_from;
  if v_sum <= 0 or v_ft >= ceil(least(v_sum, 100) / 100.0 * (v_total + 1)) then return null; end if;
  select ft.staff into v_pick from (
    select h as staff, coalesce((r.vals -> h::text ->> v_day::text)::numeric, 0) as val,
           (select count(*) from crm_contacts c where c.assigned_to = h and c.created_at >= v_from)::int as given
      from crm_team_handlers(p_tl) h join crm_staff cs on cs.staff_id = h and cs.full_time
     where crm_role_of(h) = 'rs') ft
   where ft.val > 0 order by (ft.given + 1) / ft.val, ft.staff limit 1;
  return v_pick;
end $function$;

-- ── Inside a team (A + C) ────────────────────────────────────────────────
-- Who in p_team gets an enquiry from p_ad arriving at p_at, counted since p_since:
--   Full time days first (any inside mode); else Evenly (fewest from this ad), By % (furthest below their %; no values =
--   an even split), By max (fewest taken while below their max; nobody below → hold).
create or replace function public.crm_pick_inside(p_team uuid, p_ad text, p_since timestamptz, p_mode text, p_people jsonb, p_at timestamptz,
  out member uuid, out how text, out hold boolean)
returns record language plpgsql stable security definer set search_path = public as $$
declare v_any boolean;
begin
  hold := false;
  member := crm_fulltime_pick(p_team, p_at);
  if member is not null then how := 'full_time'; return; end if;
  if p_mode = 'cnt' then
    select h into member from crm_team_handlers(p_team) h
     where coalesce((p_people ->> h::text)::numeric, 0) > 0
       and coalesce((select sum(g.n) from crm_campaign_given(p_ad, p_since) g where g.staff = h), 0) < (p_people ->> h::text)::numeric
     order by coalesce((select sum(g.n) from crm_campaign_given(p_ad, p_since) g where g.staff = h), 0), h limit 1;
    if member is null then hold := true; how := 'over_the_limit'; else how := 'max'; end if;
    return;
  end if;
  if p_mode = 'pct' then
    select exists (select 1 from crm_team_handlers(p_team) h where coalesce((p_people ->> h::text)::numeric, 0) > 0) into v_any;
    if v_any then
      select h into member from crm_team_handlers(p_team) h
       where coalesce((p_people ->> h::text)::numeric, 0) > 0
       order by (coalesce((select sum(g.n) from crm_campaign_given(p_ad, p_since) g where g.staff = h), 0) + 1) / (p_people ->> h::text)::numeric, h limit 1;
      how := 'percent';
      return;
    end if;
  end if;
  -- Evenly (and By % with nobody given a value: it starts even).
  select h into member from crm_team_handlers(p_team) h
   order by coalesce((select sum(g.n) from crm_campaign_given(p_ad, p_since) g where g.staff = h), 0), h limit 1;
  how := 'even';
end $$;
revoke all on function public.crm_pick_inside(uuid, text, timestamptz, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_pick_inside(uuid, text, timestamptz, text, jsonb, timestamptz) to service_role;

-- ── The dealer (A + B + C) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_assign_contact(p_contact uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      crm_contacts;
  r      crm_ad_assign;
  v_team uuid;
  v_who  uuid;
  v_ft   uuid;
  v_how  text;
  v_at   timestamptz;
  pick   record;
begin
  select * into c from crm_contacts where id = p_contact for update;
  if c.id is null or c.team_id is not null or c.assigned_to is not null then return jsonb_build_object('assigned', false); end if;
  -- No ad at all: Organic Leads, sent by hand (rev 1011 §6.4.3).
  if c.ad_source_id is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
  select * into r from crm_ad_assign where ad_source_id = c.ad_source_id;
  v_at := coalesce(c.last_customer_at, now());

  if r.ad_source_id is null then
    -- B · No setting: evenly across all teams (the one furthest below an even share of this ad over 30 days), then the
    -- team's usual rule (Full time days, else in turn).
    select s.id into v_team from hr_staff_costs s
     where s.status = 'active' and crm_role_of(s.id) = 'tl'
     order by (select count(*) from crm_contacts x where x.team_id = s.id and x.ad_source_id = c.ad_source_id and x.created_at > now() - interval '30 days'), s.id
     limit 1;
    if v_team is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    select * into pick from crm_pick_inside(v_team, c.ad_source_id, now() - interval '30 days', 'even', '{}'::jsonb, v_at);
    v_who := pick.member; v_how := 'default_' || pick.how;
  elsif r.mode = 'even' then
    select h into v_who from crm_all_handlers() h
     order by coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = h), 0), h limit 1;
    v_how := 'even';
    v_team := crm_team_of(v_who);
    -- Full time first on its chosen days, for the team the lead goes to.
    if v_team is not null then
      v_ft := crm_fulltime_pick(v_team, v_at);
      if v_ft is not null then v_who := v_ft; v_how := 'full_time'; end if;
    end if;
  else
    -- C · By team: the team furthest below its %, then inside it by its own mode (By % by default).
    select key::uuid into v_team from jsonb_each_text(r.team_split) s(key, val)
     where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and crm_role_of(key::uuid) = 'tl'
     order by (coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.team = key::uuid), 0)
               + (select count(*) from crm_contacts x where x.ad_source_id = r.ad_source_id and x.team_id = key::uuid and x.held_reason = 'limit' and x.created_at >= r.started_at)
               + 1) / val::numeric, key
     limit 1;
    if v_team is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    select * into pick from crm_pick_inside(v_team, r.ad_source_id, r.started_at, coalesce(r.team_modes ->> v_team::text, 'pct'), r.people, v_at);
    if pick.hold then
      -- The team is full (By max): the lead waits Over the limit, in that team, for somebody to raise a limit.
      update crm_contacts set team_id = v_team, held_reason = 'limit' where id = p_contact;
      return jsonb_build_object('assigned', false, 'waits', 'limit', 'team', v_team);
    end if;
    v_who := pick.member; v_how := pick.how;
  end if;
  if v_who is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
  v_team := coalesce(v_team, crm_team_of(v_who));

  update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;
  return jsonb_build_object('assigned', true, 'team', v_team, 'member', v_who, 'member_by', v_how);
end $function$;

-- ── C · Saving a rule (two levels), and dealing what waited ──────────────
-- The old six-argument writer stays (the MCP refuses DROP, and earlier migrations still name it) but nobody may call
-- it: it would save By people, which the dealer no longer reads. The new one takes p_team_modes with no default, so a
-- call is never ambiguous between the two.
revoke all on function public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb) from public, anon, authenticated;

create or replace function public.crm_save_ad_assign(p_ad text, p_label text, p_mode text, p_team_split jsonb, p_people_mode text, p_people jsonb, p_team_modes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r       crm_ad_assign;
  v_sum   numeric;
  t       record;
  v_mode  text;
  h       record;
  pick    record;
  v_dealt int := 0;
begin
  if not public.crm_manages() then perform crm_deny('assign ads'); end if;
  if coalesce(trim(p_ad), '') = '' then raise exception 'Choose an ad.' using errcode = '22023'; end if;
  if p_mode is null then delete from crm_ad_assign where ad_source_id = p_ad; return null; end if;
  -- By people is merged into By team (rev 1011 §6.6).
  if p_mode not in ('even', 'split') then raise exception 'Unknown assignment.' using errcode = '22023'; end if;
  if p_mode = 'split' then
    select coalesce(sum(value::numeric), 0) into v_sum from jsonb_each_text(coalesce(p_team_split, '{}'::jsonb));
    if v_sum <> 100 then raise exception 'The teams'' %% must add up to 100%%.' using errcode = '22023'; end if;
    -- Inside every team with a share: By % adds up to 100, By max gives somebody a maximum.
    for t in select key::uuid as team from jsonb_each_text(coalesce(p_team_split, '{}'::jsonb)) where value ~ '^\d+(\.\d+)?$' and value::numeric > 0 loop
      v_mode := coalesce(p_team_modes ->> t.team::text, 'pct');
      if v_mode not in ('even', 'pct', 'cnt') then raise exception 'Unknown inside-team mode.' using errcode = '22023'; end if;
      select coalesce(sum((p_people ->> m::text)::numeric), 0) into v_sum from crm_team_handlers(t.team) m where (p_people ->> m::text) ~ '^\d+(\.\d+)?$';
      if v_mode = 'pct' and v_sum <> 100 then raise exception 'Every By %% team must add up to 100%%.' using errcode = '22023'; end if;
      if v_mode = 'cnt' and v_sum <= 0 then raise exception 'Give at least one person a maximum in every By max team.' using errcode = '22023'; end if;
    end loop;
  end if;
  insert into crm_ad_assign as x (ad_source_id, ad_label, mode, team_split, people_mode, people, team_modes, updated_by)
  values (p_ad, nullif(trim(coalesce(p_label, '')), ''), p_mode, coalesce(p_team_split, '{}'::jsonb), coalesce(p_people_mode, 'pct'), coalesce(p_people, '{}'::jsonb),
          coalesce(p_team_modes, '{}'::jsonb), crm_me())
  on conflict (ad_source_id) do update set
    ad_label = coalesce(excluded.ad_label, x.ad_label), team_split = excluded.team_split, people_mode = excluded.people_mode, people = excluded.people,
    team_modes = excluded.team_modes,
    -- A new mode starts a new count.
    started_at = case when x.mode <> excluded.mode then now() else x.started_at end,
    mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  -- What waited Over the limit for this ad is dealt first, oldest first, only inside the team it waits for.
  for h in select id, team_id from crm_contacts where ad_source_id = p_ad and held_reason = 'limit' and assigned_to is null order by created_at, id loop
    select * into pick from crm_pick_inside(h.team_id, r.ad_source_id, r.started_at, coalesce(r.team_modes ->> h.team_id::text, 'pct'), r.people, now());
    exit when pick.hold or pick.member is null;
    update crm_contacts set assigned_to = pick.member, held_reason = null where id = h.id;
    v_dealt := v_dealt + 1;
  end loop;
  return to_jsonb(r) || jsonb_build_object('dealt', v_dealt);
end $$;
revoke all on function public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb) to authenticated;

-- ── D · Member work type ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_set_full_time(p_staff uuid, p_full_time boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.crm_manages() then perform crm_deny('set who is full time'); end if;
  -- rev 1011: any team member (TL, TA, RS) is full time or part time.
  if coalesce(crm_role_of(p_staff), '') not in ('tl', 'ta', 'rs') then raise exception 'Only a team member is full time or not.' using errcode = '22023'; end if;
  insert into crm_staff (staff_id, full_time, updated_by, updated_at) values (p_staff, coalesce(p_full_time, false), auth.uid(), now())
  on conflict (staff_id) do update set full_time = excluded.full_time, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  -- Part time leaves Full time lead allocation: their ticked days go.
  if not coalesce(p_full_time, false) then
    update crm_fulltime_rules set vals = vals - p_staff::text, updated_at = now() where vals ? p_staff::text;
  end if;
end $function$;

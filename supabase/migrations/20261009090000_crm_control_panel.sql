-- The Control panel (Claude Design handoff 1a, 2026-10-09): how new enquiries
-- are dealt, and what the Principal and the Revenue Director may do.
--
-- ADS TO TEAMS, per ad (crm_ad_assign):
--   even    — everyone in the teams in turn (fewest from this ad first);
--   split   — % per team, each lead to the team furthest below its %;
--             inside the team, everyone in turn;
--   people  — per person: a maximum (cnt) or a % (pct). With maximums, a
--             full person takes no more; once everyone is full the rest wait
--             in Organic Leads.
--   Counts run over the whole campaign (since the rule was set or its mode
--   changed). An ad with no rule — and an enquiry from no ad — waits in
--   ORGANIC LEADS for the Principal / Director to send by hand. (Until now
--   they went evenly across teams.)
--
-- FULL TIME LEAD ALLOCATION, per team (crm_fulltime_rules): on the chosen
-- weekdays (0 = Monday … 6 = Sunday; default Fri–Sun) the team's full-time
-- RS take their share of that day's leads for the team first — a daily
-- maximum each (cnt) or a % each (pct); what they do not take follows Ads to
-- teams.
--
-- THE PRINCIPAL AND THE DIRECTOR ACT: they may reply and book in anyone's
-- chat (README: superiors act inside a subordinate's CRM; their messages say
-- "Sent by"), send an Organic Lead to anyone, and move a customer to anyone —
-- with 30 seconds to undo on the screen (crm_send_to back).
--
-- Existing ad rules carry over: TLs listed → split evenly between those teams;
-- with shares → split by those %.

create table if not exists public.crm_ad_assign (
  ad_source_id text primary key,
  ad_label     text,
  mode         text not null check (mode in ('even', 'split', 'people')),
  team_split   jsonb not null default '{}'::jsonb check (jsonb_typeof(team_split) = 'object'),
  people_mode  text not null default 'cnt' check (people_mode in ('cnt', 'pct')),
  people       jsonb not null default '{}'::jsonb check (jsonb_typeof(people) = 'object'),
  started_at   timestamptz not null default now(),
  updated_by   uuid references public.hr_staff_costs(id),
  updated_at   timestamptz not null default now()
);

create table if not exists public.crm_fulltime_rules (
  tl_id      uuid primary key references public.hr_staff_costs(id) on delete cascade,
  mode       text not null default 'cnt' check (mode in ('cnt', 'pct')),
  days       integer[] not null default '{4,5,6}' check (days <@ array[0, 1, 2, 3, 4, 5, 6]),
  -- {staff_id: {"0": n, … "6": n}} — a daily maximum or a % per weekday.
  vals       jsonb not null default '{}'::jsonb check (jsonb_typeof(vals) = 'object'),
  updated_by uuid references public.hr_staff_costs(id),
  updated_at timestamptz not null default now()
);

alter table public.crm_staff_prefs add column if not exists notif_read text[] not null default '{}';

alter table public.crm_ad_assign enable row level security;
alter table public.crm_fulltime_rules enable row level security;
revoke all on public.crm_ad_assign, public.crm_fulltime_rules from anon, authenticated;
grant select on public.crm_ad_assign, public.crm_fulltime_rules to authenticated;
drop policy if exists crm_ad_assign_read on public.crm_ad_assign;
create policy crm_ad_assign_read on public.crm_ad_assign for select to authenticated using ((select crm_my_role()) is not null);
drop policy if exists crm_fulltime_rules_read on public.crm_fulltime_rules;
create policy crm_fulltime_rules_read on public.crm_fulltime_rules for select to authenticated
  using ((select crm_sees_all()) or tl_id in (select crm_my_downline()));

-- The old rules, carried over.
insert into public.crm_ad_assign (ad_source_id, ad_label, mode, team_split, updated_by, updated_at)
select r.ad_source_id, r.ad_label, 'split',
       case when r.shares is not null and r.shares <> '{}'::jsonb then r.shares
            else (select coalesce(jsonb_object_agg(t::text, floor(100.0 / cardinality(r.tl_ids)) + case when ord <= 100 % cardinality(r.tl_ids) then 1 else 0 end), '{}'::jsonb)
                    from unnest(r.tl_ids) with ordinality u(t, ord)) end,
       null, coalesce(r.updated_at, now())
  from public.crm_assign_rules r
 where cardinality(r.tl_ids) > 0
on conflict (ad_source_id) do nothing;

-- ─── Who takes enquiries in a team: its TL, TAs and RS (crm_team_handlers) ─
-- Everyone in every team, for "even".
create or replace function public.crm_all_handlers()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct h from hr_staff_costs s, crm_team_handlers(s.id) h
   where s.status = 'active' and crm_role_of(s.id) = 'tl'
$$;
revoke all on function public.crm_all_handlers() from public, anon, authenticated;

-- Leads one person / team has had from an ad since a moment (the campaign's counts).
create or replace function public.crm_campaign_given(p_ad text, p_since timestamptz)
returns table (staff uuid, team uuid, n integer) language sql stable security definer set search_path = public as $$
  select assigned_to, team_id, count(*)::int from crm_contacts
   where ad_source_id = p_ad and created_at >= p_since and assigned_to is not null
   group by assigned_to, team_id
$$;
revoke all on function public.crm_campaign_given(text, timestamptz) from public, anon, authenticated;

-- The full-time override for one team, on this lead's day: a full-time RS, or null (follow Ads to teams).
create or replace function public.crm_fulltime_pick(p_tl uuid, p_at timestamptz)
returns uuid language plpgsql stable security definer set search_path = public as $fn$
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
end $fn$;
revoke all on function public.crm_fulltime_pick(uuid, timestamptz) from public, anon, authenticated;

-- ─── Dealing a new enquiry (crm_ingest_* call this on arrival) ─────────────
create or replace function public.crm_assign_contact(p_contact uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c      crm_contacts;
  r      crm_ad_assign;
  v_team uuid;
  v_who  uuid;
  v_ft   uuid;
  v_how  text;
begin
  select * into c from crm_contacts where id = p_contact for update;
  if c.id is null or c.team_id is not null or c.assigned_to is not null then return jsonb_build_object('assigned', false); end if;
  if c.ad_source_id is not null then select * into r from crm_ad_assign where ad_source_id = c.ad_source_id; end if;
  if r.ad_source_id is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;

  if r.mode = 'split' then
    -- The team furthest below its %.
    select key::uuid into v_team from jsonb_each_text(r.team_split) s(key, val)
     where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and crm_role_of(key::uuid) = 'tl'
     order by (coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.team = key::uuid), 0) + 1) / val::numeric, key
     limit 1;
    if v_team is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    -- Inside the team: everyone in turn (fewest from this ad first).
    select h into v_who from crm_team_handlers(v_team) h
     order by coalesce((select g.n from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = h), 0), h limit 1;
    v_how := 'split';
  elsif r.mode = 'even' then
    select h into v_who from crm_all_handlers() h
     order by coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = h), 0), h limit 1;
    v_how := 'even';
  else
    if r.people_mode = 'cnt' then
      -- Under their maximum, the one with the most room left in proportion.
      select key::uuid into v_who from jsonb_each_text(r.people) s(key, val)
       where val ~ '^\d+$' and val::int > 0 and crm_role_of(key::uuid) is not null
         and coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = key::uuid), 0) < val::int
       order by coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = key::uuid), 0)::numeric / val::numeric, key
       limit 1;
    else
      select key::uuid into v_who from jsonb_each_text(r.people) s(key, val)
       where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and crm_role_of(key::uuid) is not null
       order by (coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = key::uuid), 0) + 1) / val::numeric, key
       limit 1;
    end if;
    v_how := 'people';
  end if;
  if v_who is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
  v_team := coalesce(v_team, crm_team_of(v_who));

  -- Full time first on its chosen days, for the team the lead goes to.
  if v_team is not null then
    v_ft := crm_fulltime_pick(v_team, coalesce(c.last_customer_at, now()));
    if v_ft is not null then v_who := v_ft; v_how := 'full_time'; end if;
  end if;

  update crm_contacts set team_id = v_team, assigned_to = v_who where id = p_contact;
  return jsonb_build_object('assigned', true, 'team', v_team, 'member', v_who, 'member_by', v_how);
end $$;

-- ─── The Principal / Director: send, move, undo ───────────────────────────
-- p_staff null = back to Organic Leads (Undo of a send).
create or replace function public.crm_send_to(p_contact uuid, p_staff uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c crm_contacts;
begin
  if not crm_sees_all() then perform crm_deny('send this customer'); end if;
  select * into c from crm_contacts where id = p_contact;
  if c.id is null then raise exception 'That customer is not in the CRM.' using errcode = '22023'; end if;
  if p_staff is not null and coalesce(crm_role_of(p_staff), 'boss') not in ('hod', 'stl', 'tl', 'ta', 'rs') then
    raise exception 'Choose someone who takes enquiries.' using errcode = '22023';
  end if;
  update crm_contacts set assigned_to = p_staff, team_id = case when p_staff is null then null else crm_team_of(p_staff) end
   where id = p_contact returning * into c;
  if p_staff is not null and c.assigned_to is distinct from null then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('moved', p_contact, crm_me(), p_staff, jsonb_build_object('to', p_staff, 'by_manager', true));
  end if;
  return jsonb_build_object('assigned_to', c.assigned_to, 'team_id', c.team_id);
end $$;

-- ─── Saving the rules ─────────────────────────────────────────────────────
create or replace function public.crm_save_ad_assign(p_ad text, p_label text, p_mode text, p_team_split jsonb, p_people_mode text, p_people jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r      crm_ad_assign;
  v_sum  numeric;
begin
  if not crm_sees_all() then perform crm_deny('assign ads'); end if;
  if coalesce(trim(p_ad), '') = '' then raise exception 'Choose an ad.' using errcode = '22023'; end if;
  if p_mode is null then delete from crm_ad_assign where ad_source_id = p_ad; return null; end if;
  if p_mode not in ('even', 'split', 'people') then raise exception 'Unknown assignment.' using errcode = '22023'; end if;
  if p_mode = 'split' then
    select coalesce(sum(value::numeric), 0) into v_sum from jsonb_each_text(coalesce(p_team_split, '{}'::jsonb));
    if v_sum <> 100 then raise exception 'The teams'' %% must add up to 100%%.' using errcode = '22023'; end if;
  end if;
  if p_mode = 'people' and coalesce(p_people_mode, 'cnt') = 'pct' then
    select coalesce(sum(value::numeric), 0) into v_sum from jsonb_each_text(coalesce(p_people, '{}'::jsonb));
    if v_sum <> 100 then raise exception 'The %% must add up to 100%%.' using errcode = '22023'; end if;
  end if;
  insert into crm_ad_assign as x (ad_source_id, ad_label, mode, team_split, people_mode, people, updated_by)
  values (p_ad, nullif(trim(coalesce(p_label, '')), ''), p_mode, coalesce(p_team_split, '{}'::jsonb), coalesce(p_people_mode, 'cnt'), coalesce(p_people, '{}'::jsonb), crm_me())
  on conflict (ad_source_id) do update set
    ad_label = coalesce(excluded.ad_label, x.ad_label), team_split = excluded.team_split, people_mode = excluded.people_mode, people = excluded.people,
    -- A new mode starts a new count.
    started_at = case when x.mode <> excluded.mode or x.people_mode <> excluded.people_mode then now() else x.started_at end,
    mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $$;

create or replace function public.crm_save_fulltime(p_tl uuid, p_mode text, p_days integer[], p_vals jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r crm_fulltime_rules;
begin
  if not crm_sees_all() then perform crm_deny('set full time allocation'); end if;
  if crm_role_of(p_tl) is distinct from 'tl' then raise exception 'Choose a team.' using errcode = '22023'; end if;
  insert into crm_fulltime_rules as x (tl_id, mode, days, vals, updated_by)
  values (p_tl, coalesce(p_mode, 'cnt'), coalesce(p_days, '{}'), coalesce(p_vals, '{}'::jsonb), crm_me())
  on conflict (tl_id) do update set mode = excluded.mode, days = excluded.days, vals = excluded.vals, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $$;

-- Notifications read one by one, or all at once.
create or replace function public.crm_read_notifs(p_keys text[], p_all boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := crm_me();
begin
  if v_me is null then perform crm_deny('read notifications'); end if;
  insert into crm_staff_prefs (staff_id, notifs_seen_at, notif_read)
  values (v_me, case when p_all then now() end, coalesce(p_keys, '{}'))
  on conflict (staff_id) do update set
    notifs_seen_at = case when p_all then now() else crm_staff_prefs.notifs_seen_at end,
    -- The last 500 read keys are enough to remember.
    notif_read = case when p_all then '{}' else (select array_agg(k) from (select distinct k from unnest(crm_staff_prefs.notif_read || coalesce(p_keys, '{}')) k limit 500) x) end;
end $$;

-- ─── The Principal and the Director may answer anyone (design 1a) ─────────
create or replace function public.crm_can_reply(p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from crm_contacts c
     where c.id = p_contact
       and (
         crm_sees_all()
         or (crm_my_role() in ('stl', 'tl', 'ta', 'rs') and coalesce(c.assigned_to, c.team_id) in (select crm_my_downline()))
         or (crm_my_role() is not null and exists (select 1 from crm_contact_shares s where s.contact_id = c.id and s.staff_id = crm_me()))
       )
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['crm_send_to(uuid, uuid)', 'crm_save_ad_assign(text, text, text, jsonb, text, jsonb)',
    'crm_save_fulltime(uuid, text, integer[], jsonb)', 'crm_read_notifs(text[], boolean)', 'crm_can_reply(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

SELECT public.audit_register('crm_ad_assign', 'CRM ads to teams', 'Member services', '{revenue}', 'people',
  p_keys => '{ad_source_id}', p_labels => '{ad_label}');
SELECT public.audit_register('crm_fulltime_rules', 'CRM full time lead allocation', 'Member services', '{revenue}', 'people',
  p_keys => '{tl_id}');

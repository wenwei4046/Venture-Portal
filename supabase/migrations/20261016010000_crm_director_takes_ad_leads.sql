-- The Revenue Director takes a share of the ads' leads (2026-10-16; the owner: "Assignment … 我忘了要增加 revenue director
-- 的名字進來，幫我加進去"; asked how, "Also in the default even split"; the dealer otherwise "Leave it as is").
-- The directors (crm_role_of = 'hod': PETER, KRIS) are one more "team" in an ad's split, keyed crm_director_key() — a fixed
-- uuid no staff record has, last in uuid order so a tie still goes to the teams as before:
--   * an ad with no rule (B) is dealt evenly across the teams AND the directors — each a quarter with three teams;
--   * Evenly (mode 'even', person by person) counts the directors among everybody;
--   * By team (C) may give the directors a %, and inside it Evenly / By % / By max as any team (a By max that is full
--     falls back to evenly — a lead cannot wait in a team that has no row: crm_contacts.team_id references hr_staff_costs).
-- A director's lead keeps team_id NULL, as an organic lead given to the director always has; the director's share is
-- counted by who holds it. crm_team_handlers(crm_director_key()) = the active directors, so the save's checks
-- (crm_save_ad_assign) and the in-team pick (crm_pick_inside) take the directors with no change of their own.
-- crm_assign_contact and crm_team_handlers are rebuilt from PRODUCTION's bodies (md5 below), every anchor exactly once.

create or replace function public.crm_director_key() returns uuid
  language sql immutable set search_path = public
  as $$ select 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid $$;
revoke all on function public.crm_director_key() from public, anon, authenticated;
grant execute on function public.crm_director_key() to service_role;

do $migration$
declare
  v_def text;
  v_once text;
  -- crm_team_handlers, production md5(prosrc) ad63583e100f28de62d950b3eae47309
  v_h1 constant text := $q$  select d from crm_downline(p_tl) d where crm_role_of(d) in ('tl', 'ta', 'rs')$q$;
  v_h2 constant text := $q$  select d from crm_downline(p_tl) d where p_tl is distinct from crm_director_key() and crm_role_of(d) in ('tl', 'ta', 'rs')
  union all
  -- The Revenue Director's "team" in an ad's split: the active directors (mig 20261016010000).
  select s.id from hr_staff_costs s where p_tl = crm_director_key() and s.status = 'active' and crm_role_of(s.id) = 'hod'$q$;
  -- crm_assign_contact, production md5(prosrc) d3f37ee13fb16aac830a9b9c444ee0f5
  v_a1 constant text := $q$    select s.id into v_team from hr_staff_costs s
     where s.status = 'active' and crm_role_of(s.id) = 'tl'
     order by (select count(*) from crm_contacts x where x.team_id = s.id and x.ad_source_id = c.ad_source_id and x.created_at > now() - interval '30 days'), s.id
     limit 1;$q$;
  v_b1 constant text := $q$    -- …and the Revenue Director, whose leads keep no team and are counted by who holds them (mig 20261016010000).
    select t.k into v_team from (
      select s.id as k, (select count(*) from crm_contacts x where x.team_id = s.id and x.ad_source_id = c.ad_source_id and x.created_at > now() - interval '30 days') as n
        from hr_staff_costs s
       where s.status = 'active' and crm_role_of(s.id) = 'tl'
      union all
      select crm_director_key(), (select count(*) from crm_contacts x where x.team_id is null and x.ad_source_id = c.ad_source_id
                                     and x.assigned_to in (select crm_team_handlers(crm_director_key())) and x.created_at > now() - interval '30 days')
       where exists (select 1 from crm_team_handlers(crm_director_key()))) t
     order by t.n, t.k
     limit 1;$q$;
  v_a2 constant text := $q$    select h into v_who from crm_all_handlers() h
     order by$q$;
  v_b2 constant text := $q$    select h into v_who from (select a from crm_all_handlers() a union select d from crm_team_handlers(crm_director_key()) d) u(h)
     order by$q$;
  v_a3 constant text := $q$and val::numeric > 0 and crm_role_of(key::uuid) = 'tl'$q$;
  v_b3 constant text := $q$and val::numeric > 0 and (crm_role_of(key::uuid) = 'tl' or (key::uuid = crm_director_key() and exists (select 1 from crm_team_handlers(crm_director_key()))))$q$;
  v_a4 constant text := $q$where g.team = key::uuid), 0)$q$;
  v_b4 constant text := $q$where g.team = key::uuid or (key::uuid = crm_director_key() and g.team is null and g.staff in (select crm_team_handlers(crm_director_key())))), 0)$q$;
  v_a5 constant text := $q$    if pick.hold then
$q$;
  v_b5 constant text := $q$    if pick.hold and v_team = crm_director_key() then
      -- The directors have no row to wait in: past their maximums, evenly between them.
      select * into pick from crm_pick_inside(v_team, r.ad_source_id, r.started_at, 'even', '{}'::jsonb, v_at);
    end if;
    if pick.hold then
$q$;
  v_a6 constant text := $q$  v_team := coalesce(v_team, crm_team_of(v_who));$q$;
  v_b6 constant text := $q$  if v_team = crm_director_key() then v_team := null; end if;
  v_team := coalesce(v_team, crm_team_of(v_who));$q$;
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_team_handlers(uuid)'::regprocedure) <> 'ad63583e100f28de62d950b3eae47309' then
    raise exception 'crm_team_handlers is not the body this migration was built from';
  end if;
  select pg_get_functiondef('public.crm_team_handlers(uuid)'::regprocedure) into v_def;
  if (length(v_def) - length(replace(v_def, v_h1, ''))) / length(v_h1) <> 1 then raise exception 'crm_team_handlers: anchor not there exactly once'; end if;
  execute replace(v_def, v_h1, v_h2);

  if (select md5(prosrc) from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure) <> 'd3f37ee13fb16aac830a9b9c444ee0f5' then
    raise exception 'crm_assign_contact is not the body this migration was built from';
  end if;
  select pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure) into v_def;
  foreach v_once in array array[v_a1, v_a2, v_a3, v_a4, v_a5, v_a6] loop
    if (length(v_def) - length(replace(v_def, v_once, ''))) / length(v_once) <> 1 then
      raise exception 'crm_assign_contact: % is not there exactly once', left(v_once, 60);
    end if;
  end loop;
  execute replace(replace(replace(replace(replace(replace(v_def, v_a1, v_b1), v_a2, v_b2), v_a3, v_b3), v_a4, v_b4), v_a5, v_b5), v_a6, v_b6);
end
$migration$;

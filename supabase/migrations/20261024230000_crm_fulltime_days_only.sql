-- On a Full time day only the full-time people get leads (2026-10-23; the owner, of ANTHONY dealt a lead on a Friday though
-- his team has no Full time days: "星期五到星期天，只有勾了 Full time 的人才拿名单，没设的队（Team Anthony、Tan Jin Yang）那几天
-- 不拿，他们的比例分给其他有 Full time 的队" · "只算有人勾的那几天" · the Revenue Director's share "也只给 Full time 的人").
--
-- A Full time day = a weekday (the office's) that some team's Full time ticks for at least one of its full-time people who
-- can be dealt a lead (crm_fulltime_teams). On such a day an ad's lead goes only to those teams — By team: among the ad's
-- teams that have one, each by its own share, so the others' shares fall to them; Evenly: the one of them with fewest of the
-- ad's leads — and inside the team to its ticked people in turn (crm_fulltime_pick, as before). The Revenue Director's row
-- has no Full time, so it gets none that day. If none of an ad's teams has anybody full time that day, the ad deals as on
-- any other day (a lead never stalls). Unchanged: a lead from no ad, and an ad nobody set, go to the Revenue Director.
--
-- Production's body (md5 checked 2026-10-23: assign_contact e67062a9… → b7f7ac54…, applied the same night), changed only by replacements that must match.

create or replace function public.crm_fulltime_teams(p_at timestamptz)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_day int := (extract(isodow from (p_at at time zone 'Asia/Kuala_Lumpur'))::int + 6) % 7; -- 0 = Monday
begin
  return query
    select r.tl_id from crm_fulltime_rules r
     where v_day = any (r.days)
       and exists (select 1 from crm_deal_handlers(r.tl_id) h join crm_staff cs on cs.staff_id = h and cs.full_time
                    where coalesce((r.vals -> h::text ->> v_day::text)::numeric, 0) > 0);
end $$;
revoke execute on function public.crm_fulltime_teams(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_fulltime_teams(timestamptz) to service_role;

do $mig$
declare
  d text;
  f record;
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure) <> 'e67062a919983e9f33d26fa966467b5a' then
    raise exception 'crm_fulltime_days_only: crm_assign_contact is no longer the body this was written from';
  end if;
  d := pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure);
  for f in select * from (values
    -- the day's Full time teams, and whether this ad has one among its teams
    ($a$  pick   record;
begin$a$, $a$  pick   record;
  v_ftday boolean;
  v_ftok  boolean;
begin$a$),
    ($a$  v_at := coalesce(c.last_customer_at, now());
$a$, $a$  v_at := coalesce(c.last_customer_at, now());
  v_ftday := exists (select 1 from crm_fulltime_teams(v_at));
  v_ftok := v_ftday and r.ad_source_id is not null and r.mode <> 'even' and exists (
    select 1 from jsonb_each_text(r.team_split) s(key, val)
     where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and key::uuid in (select crm_fulltime_teams(v_at)));
$a$),
    -- Evenly on a Full time day: the Full time team with fewest of this ad's leads, its ticked people in turn
    ($a$  elsif r.mode = 'even' then
    select h into v_who$a$, $a$  elsif r.mode = 'even' and v_ftday then
    select t into v_team from crm_fulltime_teams(v_at) t
     order by coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.team = t), 0), t limit 1;
    v_who := crm_fulltime_pick(v_team, v_at); v_how := 'full_time';
  elsif r.mode = 'even' then
    select h into v_who$a$),
    -- By team on a Full time day: only the ad's teams that have somebody full time that day
    ($a$ and exists (select 1 from crm_deal_handlers(key::uuid))
     order by$a$, $a$ and exists (select 1 from crm_deal_handlers(key::uuid))
       and (not v_ftok or key::uuid in (select crm_fulltime_teams(v_at)))
     order by$a$)
  ) as v(old, new) loop
    if position(f.old in d) = 0 then raise exception 'crm_fulltime_days_only: crm_assign_contact no longer has: %', f.old; end if;
    if position(f.old in substr(d, position(f.old in d) + 1)) > 0 then raise exception 'crm_fulltime_days_only: more than once: %', f.old; end if;
    d := replace(d, f.old, f.new);
  end loop;
  execute d;
end $mig$;

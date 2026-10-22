-- A member locked out of the dealing for now (2026-10-22; the owner, on Split leads: "在人员名单中，要可以类似 lock 人的功能，
-- 主要是可能有些 member 暂时 not active，不过还在公司，电脑版和 apps 都要"; asked, "它是一个独立的设定，如果 lock 了他，他暂时
-- 不会出现在 assignment 的名单里" and their share "自动分给同队其他人").
--   crm_staff.locked                 — one switch per person (Member work type), kept beside full_time;
--   crm_set_locked(staff, on)        — CRM · Manage, as crm_set_full_time; a team member or a Revenue Director;
--   crm_staff_locked(staff)          — the dealer's question (service role / DEFINER callers only);
--   crm_deal_handlers(team)          — crm_team_handlers less the locked: who the dealer may pick.
-- The dealer picks only from crm_deal_handlers: crm_pick_inside and crm_fulltime_pick swap their crm_team_handlers for it,
-- and crm_assign_contact skips a locked director (no ad, no rule), a locked person in Evenly, and a team (or the
-- directors' row) with nobody left to deal to — its share goes to the other teams. A By % split is a ratio, so a locked
-- person's % is shared by the rest of the team in proportion; it comes back as it was when they are unlocked. Nothing a
-- person does by hand is refused (Send to, Assign to). Each body is production's (md5 checked 2026-10-22: assign_contact
-- d364bad4…, pick_inside db8cceed…, fulltime_pick 0b016995…), changed only by the replacements below, each of which must
-- match.

alter table public.crm_staff add column if not exists locked boolean not null default false;

create or replace function public.crm_staff_locked(p_staff uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.locked from crm_staff s where s.staff_id = p_staff), false)
$$;

create or replace function public.crm_deal_handlers(p_team uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select h from crm_team_handlers(p_team) h where not crm_staff_locked(h)
$$;

revoke execute on function public.crm_staff_locked(uuid) from public, anon, authenticated;
revoke execute on function public.crm_deal_handlers(uuid) from public, anon, authenticated;
grant execute on function public.crm_staff_locked(uuid) to service_role;
grant execute on function public.crm_deal_handlers(uuid) to service_role;

create or replace function public.crm_set_locked(p_staff uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_manages() then perform crm_deny('lock a member'); end if;
  if coalesce(crm_role_of(p_staff), '') not in ('tl', 'ta', 'rs', 'hod') then
    raise exception 'Only a team member or a Revenue Director can be locked.' using errcode = '22023';
  end if;
  insert into crm_staff (staff_id, full_time, locked, updated_by, updated_at) values (p_staff, false, coalesce(p_locked, false), auth.uid(), now())
  on conflict (staff_id) do update set locked = excluded.locked, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

revoke execute on function public.crm_set_locked(uuid, boolean) from public, anon;
grant execute on function public.crm_set_locked(uuid, boolean) to authenticated;

do $mig$
declare
  d text;
  procedure_swap text;
  function_n int;
begin
  -- crm_pick_inside: every pick from crm_team_handlers(p_team) → crm_deal_handlers(p_team).
  d := pg_get_functiondef('public.crm_pick_inside(uuid, text, timestamptz, text, jsonb, timestamptz)'::regprocedure);
  function_n := (length(d) - length(replace(d, 'crm_team_handlers(p_team)', ''))) / length('crm_team_handlers(p_team)');
  if function_n < 4 then raise exception 'crm_member_lock: crm_pick_inside has % picks, expected 4', function_n; end if;
  execute replace(d, 'crm_team_handlers(p_team)', 'crm_deal_handlers(p_team)');

  -- crm_fulltime_pick: the same for p_tl.
  d := pg_get_functiondef('public.crm_fulltime_pick(uuid, timestamptz)'::regprocedure);
  function_n := (length(d) - length(replace(d, 'crm_team_handlers(p_tl)', ''))) / length('crm_team_handlers(p_tl)');
  if function_n < 3 then raise exception 'crm_member_lock: crm_fulltime_pick has % picks, expected 3+', function_n; end if;
  execute replace(d, 'crm_team_handlers(p_tl)', 'crm_deal_handlers(p_tl)');

  -- crm_assign_contact: four places.
  d := pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure);
  foreach procedure_swap in array array[
    $a$and (crm_role_of(key::uuid) = 'tl' or (key::uuid = crm_director_key() and exists (select 1 from crm_team_handlers(crm_director_key()))))$a$,
    $a$if not exists (select 1 from crm_team_handlers(crm_director_key())) then$a$,
    $a$(select a from crm_all_handlers() a union select d from crm_team_handlers(crm_director_key()) d) u(h)$a$,
    $a$where s.status = 'active' and crm_role_of(s.id) = 'hod' order by s.id limit 1$a$
  ] loop
    if position(procedure_swap in d) = 0 then raise exception 'crm_member_lock: crm_assign_contact no longer has: %', procedure_swap; end if;
  end loop;
  d := replace(d, $a$and (crm_role_of(key::uuid) = 'tl' or (key::uuid = crm_director_key() and exists (select 1 from crm_team_handlers(crm_director_key()))))$a$,
                  $a$and (crm_role_of(key::uuid) = 'tl' or key::uuid = crm_director_key()) and exists (select 1 from crm_deal_handlers(key::uuid))$a$);
  d := replace(d, $a$if not exists (select 1 from crm_team_handlers(crm_director_key())) then$a$,
                  $a$if not exists (select 1 from crm_deal_handlers(crm_director_key())) then$a$);
  d := replace(d, $a$(select a from crm_all_handlers() a union select d from crm_team_handlers(crm_director_key()) d) u(h)$a$,
                  $a$(select a from crm_all_handlers() a where not crm_staff_locked(a) union select d from crm_deal_handlers(crm_director_key()) d) u(h)$a$);
  d := replace(d, $a$where s.status = 'active' and crm_role_of(s.id) = 'hod' order by s.id limit 1$a$,
                  $a$where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id) order by s.id limit 1$a$);
  execute d;
end $mig$;

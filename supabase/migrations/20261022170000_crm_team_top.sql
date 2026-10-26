-- Everybody who reports straight to the Revenue Director is a team (2026-10-22; the owner, of IR's Sales Groups chart —
-- Tan Jin Yang and Harm Hao Hong HECTOR, Revenue Specialists reporting to PETER, each their own team there — "只要是 report
-- to peter (revenue director)，就是一个 team … 他们都是 report to peter，但没有出现在名单里，导致无法分配名单给他们").
-- The CRM made a team only of a Team Leader; now a team's top is a TL, or a TA / RS whose upline is the Revenue Director
-- or the Boss (or who has none) — crm_is_team_top. Every place that asked `crm_role_of(x) = 'tl'` for a team asks it:
-- crm_team_of, crm_all_handlers, crm_assign_contact (By team's teams), crm_save_fulltime, crm_save_team_settings,
-- crm_send_to_team. Roles are unchanged (an RS heading a team is still an RS — a TL's own rights stay a TL's).
-- Production's bodies (md5 checked 2026-10-22: team_of 440e9f61…, all_handlers 3b21923d…, assign_contact a7158c7e…,
-- save_fulltime 82b7a382…, save_team_settings 8f2e6f8c…, send_to_team 12039af6…), changed only by replacements that must match.

create or replace function public.crm_is_team_top(p_staff uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce(crm_role_of(p_staff), '') = 'tl' then true
    when coalesce(crm_role_of(p_staff), '') in ('ta', 'rs') then
      crm_upline_of(p_staff) is null or coalesce(crm_role_of(crm_upline_of(p_staff)), '') in ('hod', 'boss')
    else false end
$$;
revoke execute on function public.crm_is_team_top(uuid) from public, anon, authenticated;
grant execute on function public.crm_is_team_top(uuid) to service_role;

do $mig$
declare
  d text;
  f record;
begin
  for f in select * from (values
    ('public.crm_team_of(uuid)', $a$if crm_role_of(v) = 'tl' then return v; end if;$a$, $a$if crm_is_team_top(v) then return v; end if;$a$),
    ('public.crm_all_handlers()', $a$crm_role_of(s.id) = 'tl'$a$, $a$crm_is_team_top(s.id)$a$),
    ('public.crm_assign_contact(uuid)', $a$(crm_role_of(key::uuid) = 'tl' or key::uuid = crm_director_key())$a$, $a$(crm_is_team_top(key::uuid) or key::uuid = crm_director_key())$a$),
    ('public.crm_save_fulltime(uuid, text, integer[], jsonb)', $a$crm_role_of(p_tl) is distinct from 'tl'$a$, $a$not crm_is_team_top(p_tl)$a$),
    ('public.crm_save_team_settings(uuid, integer[], boolean, jsonb)', $a$crm_role_of(p_tl) is distinct from 'tl'$a$, $a$not crm_is_team_top(p_tl)$a$),
    ('public.crm_send_to_team(uuid, uuid)', $a$crm_role_of(p_tl) is distinct from 'tl'$a$, $a$not crm_is_team_top(p_tl)$a$)
  ) as v(fn, old, new) loop
    d := pg_get_functiondef(f.fn::regprocedure);
    if position(f.old in d) = 0 then raise exception 'crm_team_top: % no longer has: %', f.fn, f.old; end if;
    execute replace(d, f.old, f.new);
  end loop;
end $mig$;

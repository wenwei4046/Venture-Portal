-- A By % team's check skips a locked member (2026-10-22). Mig 20261022130000 keeps a locked member's own % for when they
-- come back while the dealer skips them; crm_save_ad_assign still summed every handler of the team, so a By % team with a
-- locked member who had a value would add up past 100 and refuse every save. It now sums crm_deal_handlers (the team less
-- the locked), as the dealer deals. Production's body (md5 f3203abb…, checked 2026-10-22), one replacement that must match.

do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure);
  if position($a$from crm_team_handlers(t.team) m where (p_people ->> m::text)$a$ in d) = 0 then
    raise exception 'crm_split_skips_locked: crm_save_ad_assign no longer sums crm_team_handlers(t.team)';
  end if;
  execute replace(d, $a$from crm_team_handlers(t.team) m where (p_people ->> m::text)$a$, $a$from crm_deal_handlers(t.team) m where (p_people ->> m::text)$a$);
end $mig$;

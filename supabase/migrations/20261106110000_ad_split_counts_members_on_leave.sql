-- "Every By % team must add up to 100%" refused a split the screen showed adding up (2026-11-06; the owner, on the phone's
-- Split leads: "为什么加起来100% 不能save?"). The check summed crm_deal_handlers(), which leaves out a member on leave today as
-- well as a locked one (crm_staff_locked, mig 20261029220000), while Assignment's screens leave out only the locked: CHIN YING,
-- on leave 30 Oct – 9 Nov with 17% in Team Stanley, made the team 83 to the database and 100 on screen, and no ad holding that
-- team could be saved until her leave ended. Leave is a few days and ends by itself, so a member's % stays in the split: the
-- check now counts every member who is not locked. The dealing is untouched: crm_deal_handlers still skips whoever is on leave.
-- Production's two bodies, one expression swapped; refused unless it stands there exactly once.
do $$
declare
  f regprocedure;
  d text;
  old_expr constant text := 'from crm_deal_handlers(t.team) m where (p_people ->> m::text)';
  new_expr constant text := 'from crm_team_handlers(t.team) m where not coalesce((select s.locked from crm_staff s where s.staff_id = m), false) and (p_people ->> m::text)';
begin
  foreach f in array array[
    'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure,
    'public.crm_save_ads(jsonb, boolean, text, jsonb, text, jsonb, jsonb)'::regprocedure
  ] loop
    d := pg_get_functiondef(f);
    if array_length(string_to_array(d, old_expr), 1) <> 2 then
      raise exception '% does not hold the split check exactly once', f;
    end if;
    execute replace(d, old_expr, new_expr);
  end loop;
end $$;

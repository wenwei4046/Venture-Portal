-- Full time evenly taken back (the owner, 2026-10-24: "這個功能取消，老闆說他自己會去處理"; it was never switched on).
-- crm_assign_contact: the block mig 20261025060000 put in is taken out again by a checked replacement (production's body
-- md5 0324fccd… → the one before it, 2e8a3f1b…); the setting stays off and its save is nobody's to call.
do $do$
declare d text; blk text := E'\n  -- Full time evenly (2026-10-24): on a Full time day, an ad''s lead to the full-time person with fewest ad leads today,\n  -- across every team — not through the ad''s split. Settings › New leads › Full time evenly.\n  if v_ftday and r.ad_source_id is not null and coalesce((select s.ft_even from crm_settings s where s.id), false) then\n    select e.staff, e.team into v_who, v_team from crm_fulltime_even(v_at) e;\n    if v_who is not null then\n      update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;\n      return jsonb_build_object(''assigned'', true, ''team'', v_team, ''member'', v_who, ''member_by'', ''full_time_even'');\n    end if;\n  end if;';
begin
  select pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure) into d;
  if (length(d) - length(replace(d, blk, ''))) / length(blk) <> 1 then raise exception 'the Full time evenly block is not there exactly once'; end if;
  execute replace(d, blk, '');
end $do$;
update public.crm_settings set ft_even = false where id = true;
revoke all on function public.crm_set_ft_even(boolean) from public, anon, authenticated;

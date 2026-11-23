-- Production's crm_assign_contact (pg_get_functiondef, read 2026-11-24 after mig 20261124210000, through
-- `supabase db query --remote --read-only`, never typed by hand). validate-crm-dc-no-ad.mjs runs mig 20261124220000 on it.

-- crm_assign_contact(uuid)
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
  v_ftday boolean;
  v_ftok  boolean;
  v_over  crm_deal_overrides;
  v_res   jsonb;
begin
  -- A new lead starts with nobody skipped (a skip below deals the same lead again, one person fewer).
  if current_setting('crm.deal_contact', true) is distinct from p_contact::text then
    perform set_config('crm.deal_contact', p_contact::text, true);
    perform set_config('crm.deal_skip', '', true);
  end if;
  select * into c from crm_contacts where id = p_contact for update;
  if c.id is null or c.team_id is not null or c.assigned_to is not null then return jsonb_build_object('assigned', false); end if;
  -- Settings › New leads › Auto-assign off (2026-10-18): nobody is dealt it; it waits to be sent by hand.
  if not coalesce((public.crm_settings_of(c.account_id)).auto_assign, true) then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
  -- No ad at all: to the Revenue Director (2026-10-13); with nobody in that role, Organic Leads, sent by hand.
  if c.ad_source_id is null then
    select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id) and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;
    if v_who is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    update crm_contacts set assigned_to = v_who, held_reason = null where id = p_contact;
    return jsonb_build_object('assigned', true, 'member', v_who, 'member_by', 'organic_director');
  end if;
  -- Up next › Give to… (mig 20261108120000): the next ad lead goes to the pinned person, once; then the split carries on.
  select o.* into v_over from crm_deal_overrides o
   where o.kind = 'pin' and o.used_at is null and o.cleared_at is null and not o.team_only
     and o.scope in (c.ad_source_id, 'all') and not crm_staff_locked(o.staff_id)
   order by (o.scope = c.ad_source_id) desc, o.created_at desc limit 1 for update;
  if v_over.id is not null then
    update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
    v_who := v_over.staff_id;
    v_team := crm_team_of(v_who);
    if c.ad_source_id is not null then
    -- A leader's Give to…: once the split has given their team this lead, it goes to the person they named.
    select o.* into v_over from crm_deal_overrides o
     where o.kind = 'pin' and o.used_at is null and o.cleared_at is null and o.team_only
       and o.scope in (c.ad_source_id, 'all') and not crm_staff_locked(o.staff_id)
       and crm_team_of(o.staff_id) is not distinct from v_team
     order by (o.scope = c.ad_source_id) desc, o.created_at desc limit 1 for update;
    if v_over.id is not null then
      update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
      update crm_contacts set team_id = v_team, assigned_to = v_over.staff_id, held_reason = null where id = p_contact;
      return jsonb_build_object('assigned', true, 'team', v_team, 'member', v_over.staff_id, 'member_by', 'pinned', 'pin_by', v_over.created_by);
    end if;
    -- Up next › Skip: this one lead goes to the next person; the skipped person keeps their place for later turns.
    select o.* into v_over from crm_deal_overrides o
     where o.kind = 'skip' and o.used_at is null and o.cleared_at is null and o.staff_id = v_who
       and o.scope in (c.ad_source_id, 'all')
     order by o.created_at limit 1 for update;
    if v_over.id is not null then
      update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
      perform set_config('crm.deal_skip', concat_ws(',', nullif(current_setting('crm.deal_skip', true), ''), v_who::text), true);
      v_res := crm_assign_contact(p_contact);
      if coalesce((v_res ->> 'assigned')::boolean, false) or v_res ->> 'waits' = 'limit' then return v_res; end if;
      -- Nobody else can take it: a lead never stalls because of a skip.
      perform set_config('crm.deal_skip', '', true);
    end if;
  end if;
  update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;
    return jsonb_build_object('assigned', true, 'team', v_team, 'member', v_who, 'member_by', 'pinned', 'pin_by', v_over.created_by);
  end if;
  select * into r from crm_ad_assign where ad_source_id = c.ad_source_id;
  v_at := coalesce(c.last_customer_at, now());
  v_ftday := exists (select 1 from crm_fulltime_teams(v_at));
  v_ftok := v_ftday and r.ad_source_id is not null and r.mode <> 'even' and exists (
    select 1 from jsonb_each_text(r.team_split) s(key, val)
     where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and key::uuid in (select crm_fulltime_teams(v_at)));

  if r.ad_source_id is null then
    -- B · No setting (2026-10-19): every lead to the Revenue Director, who sends it on — the directors evenly between
    -- them, as By team's director row; with no director placed, it waits to be sent by hand.
    if not exists (select 1 from crm_deal_handlers(crm_director_key())) then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    v_team := crm_director_key();
    select * into pick from crm_pick_inside(v_team, c.ad_source_id, now() - interval '30 days', 'even', '{}'::jsonb, v_at);
    v_who := pick.member; v_how := 'default_director';
  elsif r.mode = 'even' and v_ftday then
    select t into v_team from crm_fulltime_teams(v_at) t
     order by coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.team = t), 0), t limit 1;
    v_who := crm_fulltime_pick(v_team, v_at); v_how := 'full_time';
  elsif r.mode = 'even' then
    select h into v_who from (select a from crm_all_handlers() a where not crm_staff_locked(a) union select d from crm_deal_handlers(crm_director_key()) d) u(h)
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
     where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and (crm_is_team_top(key::uuid) or key::uuid = crm_director_key()) and exists (select 1 from crm_deal_handlers(key::uuid))
       and (not v_ftok or key::uuid in (select crm_fulltime_teams(v_at)))
     order by (coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.team = key::uuid or (key::uuid = crm_director_key() and g.team is null and g.staff in (select crm_team_handlers(crm_director_key())))), 0)
               + (select count(*) from crm_contacts x join crm_counted_leads(r.ad_source_id, r.started_at) k on k.ad = x.ad_source_id and x.created_at >= k.since
                   where x.team_id = key::uuid and x.held_reason = 'limit')
               + 1) / val::numeric, key
     limit 1;
    if v_team is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    select * into pick from crm_pick_inside(v_team, r.ad_source_id, r.started_at, coalesce(r.team_modes ->> v_team::text, 'pct'), r.people, v_at);
    if pick.hold and v_team = crm_director_key() then
      -- The directors have no row to wait in: past their maximums, evenly between them.
      select * into pick from crm_pick_inside(v_team, r.ad_source_id, r.started_at, 'even', '{}'::jsonb, v_at);
    end if;
    if pick.hold then
      -- The team is full (By max): the lead waits Over the limit, in that team, for somebody to raise a limit.
      update crm_contacts set team_id = v_team, held_reason = 'limit' where id = p_contact;
      return jsonb_build_object('assigned', false, 'waits', 'limit', 'team', v_team);
    end if;
    v_who := pick.member; v_how := pick.how;
  end if;
  -- A customer goes only to somebody its brand (sub-department) opens to (2026-11-19): else the Revenue Director who holds it.
  if v_who is not null and not crm_staff_takes_brand(v_who, crm_brand_of(c.account_id)) then
    select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id)
       and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;
    v_team := null; v_how := 'brand_director';
  end if;
  if v_who is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
  if v_team = crm_director_key() then v_team := null; end if;
  v_team := coalesce(v_team, crm_team_of(v_who));

  if c.ad_source_id is not null then
    -- A leader's Give to…: once the split has given their team this lead, it goes to the person they named.
    select o.* into v_over from crm_deal_overrides o
     where o.kind = 'pin' and o.used_at is null and o.cleared_at is null and o.team_only
       and o.scope in (c.ad_source_id, 'all') and not crm_staff_locked(o.staff_id)
       and crm_team_of(o.staff_id) is not distinct from v_team
     order by (o.scope = c.ad_source_id) desc, o.created_at desc limit 1 for update;
    if v_over.id is not null then
      update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
      update crm_contacts set team_id = v_team, assigned_to = v_over.staff_id, held_reason = null where id = p_contact;
      return jsonb_build_object('assigned', true, 'team', v_team, 'member', v_over.staff_id, 'member_by', 'pinned', 'pin_by', v_over.created_by);
    end if;
    -- Up next › Skip: this one lead goes to the next person; the skipped person keeps their place for later turns.
    select o.* into v_over from crm_deal_overrides o
     where o.kind = 'skip' and o.used_at is null and o.cleared_at is null and o.staff_id = v_who
       and o.scope in (c.ad_source_id, 'all')
     order by o.created_at limit 1 for update;
    if v_over.id is not null then
      update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
      perform set_config('crm.deal_skip', concat_ws(',', nullif(current_setting('crm.deal_skip', true), ''), v_who::text), true);
      v_res := crm_assign_contact(p_contact);
      if coalesce((v_res ->> 'assigned')::boolean, false) or v_res ->> 'waits' = 'limit' then return v_res; end if;
      -- Nobody else can take it: a lead never stalls because of a skip.
      perform set_config('crm.deal_skip', '', true);
    end if;
  end if;
  update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;
  return jsonb_build_object('assigned', true, 'team', v_team, 'member', v_who, 'member_by', v_how);
end $function$;

-- Two dealing changes (2026-10-13, the user's choices):
-- 1. "organic lead 默認給 Revenue director" → an enquiry from no ad is given straight to the Revenue Director (the active
--    person whose CRM role is HOD — PETER on 2026-10-13); only with no such person does it wait in Organic Leads. They
--    answer it or send it on. crm_assign_contact: production's body (md5 ca78230d68797c65fe97581a9290db95), its organic
--    statement swapped; nothing else moves. The TypeScript twin (lib/member/crm-team.ts › dealEnquiry) does the same.
-- 2. "Principal 也要有 mine 的功能" (Mine = the customers given to the CEO's own record) → somebody may be sent to the
--    Principal too. crm_send_to: production's body (md5 4127099b3ceac57666788e1a97bf79f7), 'boss' added to the roles one
--    may send to; its crm_manages() check is unchanged.

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
  -- No ad at all: to the Revenue Director (2026-10-13); with nobody in that role, Organic Leads, sent by hand.
  if c.ad_source_id is null then
    select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' order by s.id limit 1;
    if v_who is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    update crm_contacts set assigned_to = v_who, held_reason = null where id = p_contact;
    return jsonb_build_object('assigned', true, 'member', v_who, 'member_by', 'organic_director');
  end if;
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

CREATE OR REPLACE FUNCTION public.crm_send_to(p_contact uuid, p_staff uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c crm_contacts;
begin
  if not public.crm_manages() then perform crm_deny('send this customer'); end if;
  select * into c from crm_contacts where id = p_contact;
  if c.id is null then raise exception 'That customer is not in the CRM.' using errcode = '22023'; end if;
  if p_staff is not null and coalesce(crm_role_of(p_staff), '') not in ('boss', 'hod', 'stl', 'tl', 'ta', 'rs') then
    raise exception 'Choose someone who takes enquiries.' using errcode = '22023';
  end if;
  update crm_contacts set assigned_to = p_staff, team_id = case when p_staff is null then null else crm_team_of(p_staff) end
   where id = p_contact returning * into c;
  if p_staff is not null and c.assigned_to is distinct from null then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('moved', p_contact, crm_me(), p_staff, jsonb_build_object('to', p_staff, 'by_manager', true));
  end if;
  return jsonb_build_object('assigned_to', c.assigned_to, 'team_id', c.team_id);
end $function$;

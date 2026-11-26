-- Production's bodies, as pg_get_functiondef printed them on 2026-11-27 (dumped by script, never hand-copied).
-- md5(prosrc) of each:
--   crm_add_contact(text,text,uuid)  e61f97c60ee1e71c617c36c245b103b4
--   crm_all_handlers()  8b7a36a336ed50cd2732bf11cf1d8ebe
--   crm_answer_invite(uuid,boolean)  7edf6fa3c3745ac3815c299855fa137f
--   crm_assign_contact(uuid)  3454d09ca95fc96fd96a8fa33086af8c
--   crm_assign_member(uuid,uuid)  5aa0aad2eb95c1ebcbc817afe5353240
--   crm_brand_of(text)  2857735ac880df0a9f144628e35a2928
--   crm_brand_sub(text)  a1a5eade42095d5451d11b141032a874
--   crm_can_reply(uuid)  3b7ee64b42bc94af00f65332e739c981
--   crm_cross_viewers()  7cef066d63db76f5bf9a25976211eec7
--   crm_cur_sub()  dd40b672fdca92077b1d5fd44744991e
--   crm_deal_handlers(uuid)  ee156dad855a4a1a4ba0a9625f1f1618
--   crm_director_key()  32ba7df723c34123f231e29ac25cc30a
--   crm_downline(uuid)  6d5a7d7cbd33fb8825b484e8bf7a07e9
--   crm_give_to_hod(uuid,uuid)  3f5217afe928943334815136d3fcd549
--   crm_invite(text,uuid,uuid)  470e6852e6d648cee6a1bb847ea99259
--   crm_is_team_top(uuid)  125e89103245e5d2ee3c77fe8854d4cf
--   crm_my_downline()  28577cbedce5165678279af1f701f668
--   crm_my_role()  250f66921f2182df197e1bf289c3b110
--   crm_my_shares()  cd81631f52c84222908830d32d5887f1
--   crm_people()  99b31da7423229e340060dcf4e168cc7
--   crm_role_of(uuid)  2ca8661a549e8676382627239ee7c468
--   crm_save_ad_assign(text,text,text,jsonb,text,jsonb,jsonb)  cf9b90641f8003ac5f0e68ad18c286c4
--   crm_save_fulltime(uuid,text,integer[],jsonb)  beabce1e75d74bf74faadac01123a52c
--   crm_scope_director()  9d12205feb18921ad71b7ea87405d145
--   crm_scope_member(uuid)  e319a4f1a3d623daa5e109b5f5c9156c
--   crm_scope()  f882938dbf2def990cd9c8aa2c2737bf
--   crm_send_to_team(uuid,uuid)  5f681c66c619412f111878048461e80b
--   crm_send_to(uuid,uuid)  e04e848e9ea66994c38cf1df25ed3089
--   crm_set_full_time(uuid,boolean)  758ddac009e5f8d62f8d472b6764c945
--   crm_set_locked(uuid,boolean)  2d24190ddb9fc49205608b59c669d605
--   crm_set_person_days(uuid,integer[])  464f219e03ab0cf8f5876f0088b5346a
--   crm_team_handlers(uuid)  d390602c30e062e42a061634f8e815c8
--   crm_team_of(uuid)  7c6df8ae1cbf30f4dffb9586907df169
--   crm_up_next_end_leave(uuid)  6d6f29ab44f1d825f055310819ef7eee
--   crm_up_next_give(text,uuid)  4a6d14ee2de88405d82b976476e66298
--   crm_up_next_pause(uuid,boolean)  1f5df6fb48adee85b322cdb44d6f5528
--   crm_up_next_save_leave(uuid,uuid,timestamp with time zone,timestamp with time zone,text,text)  57b97fcd87af18f5fc173831cd851af6
--   crm_up_next_skip(text,uuid)  db9ff016adceb399ddded2b92ec17ff1
--   crm_up_next(text,text[],integer,uuid)  2b83640593ece6704c263dd906cbee84
--   crm_upline_of(uuid)  728f36db9849d17c0a87e57c7de32161

CREATE OR REPLACE FUNCTION public.crm_add_contact(p_name text, p_phone text, p_assign uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := crm_me(); d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); acc text; who uuid; got uuid;
begin
  if me is null or not crm_can('edit', 'own') then perform crm_deny('add customers'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the customer a name.' using errcode = '22023'; end if;
  if d like '0%' then d := '6' || d; end if;                -- 012-345 6789 → 60123456789 (Malaysia)
  if length(d) < 9 or length(d) > 15 then raise exception 'Type the phone with its country code, e.g. 6012 345 6789.' using errcode = '22023'; end if;
  select account_id into acc from crm_contacts where channel = 'whatsapp' and account_id ~ '^\d+$' order by created_at desc limit 1;
  if acc is null then raise exception 'No WhatsApp number has received a customer yet, so there is no number to add them on.' using errcode = '22023'; end if;
  select id into got from crm_contacts where channel = 'whatsapp' and account_id = acc and external_id = d;
  if got is not null then return got; end if;
  who := coalesce(p_assign, me);
  if who is distinct from me and not crm_manages() then perform crm_deny('give a customer to somebody else'); end if;
  insert into crm_contacts (channel, account_id, external_id, name, phone, status, assigned_to, team_id, assigned_at, assigned_by)
  values ('whatsapp', acc, d, left(trim(p_name), 120), '+' || d, 'new', who, crm_team_of(who), now(), me)
  returning id into got;
  return got;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_all_handlers()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct h from hr_staff_costs s, crm_team_handlers(s.id) h
   where s.status = 'active' and crm_is_team_top(s.id)
$function$;

CREATE OR REPLACE FUNCTION public.crm_answer_invite(p_invite uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := crm_me();
  r    crm_invites;
  c    crm_contacts;
begin
  select * into r from crm_invites where id = p_invite;
  if r.id is null or r.to_staff <> v_me or not public.crm_can('edit', 'own') then perform crm_deny('answer this invitation'); end if;
  if r.state <> 'pending' then raise exception 'This invitation was already answered.' using errcode = '22023'; end if;
  update crm_invites set state = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
   where id = p_invite returning * into r;
  select * into c from crm_contacts where id = r.contact_id;
  if p_accept and r.kind = 'share' then
    insert into crm_contact_shares (contact_id, staff_id, invited_by) values (r.contact_id, v_me, r.from_staff) on conflict do nothing;
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('shared', r.contact_id, v_me, c.assigned_to, jsonb_build_object('from', r.from_staff, 'to', v_me));
  elsif p_accept and r.kind = 'move' then
    update crm_contacts set assigned_to = v_me, team_id = coalesce(crm_team_of(v_me), team_id) where id = r.contact_id;
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('moved', r.contact_id, v_me, r.from_staff, jsonb_build_object('from', r.from_staff, 'to', v_me));
  else
    insert into crm_events (kind, contact_id, actor, owner, data)
    values (case r.kind when 'share' then 'share_declined' else 'move_declined' end, r.contact_id, v_me, c.assigned_to,
            jsonb_build_object('from', r.from_staff, 'to', v_me));
  end if;
  return to_jsonb(r);
end $function$;

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
    -- The sub-department's own person first (2026-11-24, mig 20261124220000 — DC's: KRIS), else the Revenue Director.
    select s.id into v_who from hr_staff_costs s
     where s.id = (public.crm_settings_of(c.account_id)).crm_director and s.status = 'active' and not crm_staff_locked(s.id)
       and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id));
    if v_who is null then
      select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id) and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;
    end if;
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
    -- The sub-department's own person first (2026-11-24, mig 20261124220000 — DC's: KRIS), else the Revenue Director.
    select s.id into v_who from hr_staff_costs s
     where s.id = (public.crm_settings_of(c.account_id)).crm_director and s.status = 'active' and not crm_staff_locked(s.id)
       and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id));
    if v_who is null then
      select s.id into v_who from hr_staff_costs s where s.status = 'active' and crm_role_of(s.id) = 'hod' and not crm_staff_locked(s.id)
         and crm_staff_takes_brand(s.id, crm_brand_of(c.account_id)) order by s.id limit 1;
    end if;
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

CREATE OR REPLACE FUNCTION public.crm_assign_member(p_contact uuid, p_member uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c crm_contacts;
begin
  select * into c from crm_contacts where id = p_contact;
  if c.id is null or c.team_id is null or not public.crm_can('edit', 'own') or coalesce(crm_my_role() not in ('tl', 'stl', 'ta'), true)
     or not (c.team_id in (select crm_my_downline()) or coalesce(c.assigned_to in (select crm_my_downline()), false)) then
    perform crm_deny('assign this customer');
  end if;
  if p_member is null or p_member not in (select crm_team_handlers(c.team_id)) or p_member not in (select crm_my_downline()) then
    raise exception 'They are not in this team.' using errcode = '22023';
  end if;
  update crm_contacts set assigned_to = p_member where id = p_contact;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_brand_of(p_account text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN CASE p_account
    WHEN '1438056256053876' THEN 'conts'  -- WhatsApp 018-358 0219
    WHEN '102351059576534'  THEN 'conts'  -- Page: The Conts Property Management
    WHEN '1422533724269131' THEN 'dc'     -- WhatsApp 018-907 9042
    WHEN '478652958664343'  THEN 'dc'     -- Page: Dream Crafter Design
  END;
END
$function$;

CREATE OR REPLACE FUNCTION public.crm_brand_sub(p_brand text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return case p_brand
    when 'conts' then crm_scope()
    when 'dc' then (select sd.id from comm_sub_departments sd where upper(sd.code) = 'DC' and sd.is_active order by sd.created_at limit 1)
  end;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_can_reply(p_contact uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from crm_contacts c
     where c.id = p_contact
       and (public.crm_brand_of(c.account_id) is null or public.crm_brand_of(c.account_id) = any (public.crm_my_brands()))
       and (
         (crm_my_role() is not null and public.crm_can('edit', 'all'))
         or (crm_my_role() in ('hod', 'stl', 'tl', 'ta', 'rs') and public.crm_can('edit', 'own')
             and coalesce(c.assigned_to, c.team_id) in (select crm_my_downline()))
         or (crm_my_role() is not null and public.crm_can('edit', 'own')
             and exists (select 1 from crm_contact_shares s where s.contact_id = c.id and s.staff_id = crm_me()))
       )
  )
$function$;

CREATE OR REPLACE FUNCTION public.crm_cross_viewers()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_out jsonb;
begin
  -- Their CRM cells as current_actions() reckons them: the title's template, a person's own cell over it (a NULL scope
  -- takes the cell away); an account with no template (the Principal's kind) is not a cross-team viewer.
  with cand as (
    select s.id, s.employee_name, t.name as title, s.user_id, t.template_id
      from hr_staff_costs s
      join users u on u.id = s.user_id and u.is_active
      join titles t on t.id = s.title_id
     where s.status = 'active' and t.template_id is not null and crm_role_of(s.id) is null
       and s.id is distinct from crm_me()
       -- Only whom the CRM lets in (crm_my_role()'s own test): its sub-department in their reach — so Fair's people,
       -- whose CRM · View opens nothing in IR's CRM, are not listed.
       and (crm_scope() is null or crm_scope() = any (sub_department_reach_in(u.id, 'crm')))
  ), cells as (
    select c.id, g.action, g.scope
      from cand c join permission_template_grants g on g.template_id = c.template_id and g.function_key = 'crm'
     where not exists (select 1 from user_permission_cells x
                        where x.user_id = c.user_id and x.function_key = 'crm' and x.action = g.action)
    union all
    select c.id, x.action, x.scope
      from cand c join user_permission_cells x on x.user_id = c.user_id and x.function_key = 'crm'
     where x.scope is not null
  ), held as (
    select id,
           max(array_position(array['own', 'dept', 'all'], scope)) filter (where action = 'view')   as view_rank,
           max(array_position(array['own', 'dept', 'all'], scope)) filter (where action = 'edit')   as edit_rank,
           bool_or(action = 'manage') as manage
      from cells group by id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.employee_name, 'title', c.title,
           'reach', (array['own', 'dept', 'all'])[h.view_rank],
           'editAll', coalesce(h.edit_rank = 3, false), 'editOwn', h.edit_rank is not null,
           'manage', coalesce(h.manage, false))
           order by c.employee_name), '[]'::jsonb)
    into v_out
    from cand c join held h on h.id = c.id
   where h.view_rank is not null;
  return v_out;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_cur_sub()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- The sub-department this transaction's CRM writes are for: what crm_set_sub set, else the CRM's own (IR).
  return coalesce(nullif(current_setting('crm.sub', true), '')::uuid, crm_scope());
end $function$;

CREATE OR REPLACE FUNCTION public.crm_deal_handlers(p_team uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select h from crm_team_handlers(p_team) h where not crm_staff_locked(h)
$function$;

CREATE OR REPLACE FUNCTION public.crm_director_key()
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid $function$;

CREATE OR REPLACE FUNCTION public.crm_downline(p_staff uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if crm_scope() is null then
    return query
      with recursive line(id, depth) as (
        select p_staff, 0 where p_staff is not null
        union
        select s.id, l.depth + 1 from hr_staff_costs s join line l on s.reports_to = l.id
         where l.depth < 20 and s.status = 'active'
      )
      select id from line;
    return;
  end if;
  return query
    with recursive members as (
      select distinct on (h.staff_id) h.staff_id as id, coalesce(h.upline_staff_id, crm_scope_director()) as up
        from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id join hr_staff_costs s on s.id = h.staff_id
       where c.sub_department_id = crm_scope() and c.is_active and s.status = 'active'
         and h.effective_from <= v_today and (h.effective_to is null or h.effective_to >= v_today)
       order by h.staff_id, h.effective_from desc
    ), line(id, depth) as (
      select p_staff, 0 where p_staff is not null
      union
      select m.id, l.depth + 1 from members m join line l on m.up = l.id where l.depth < 20
    )
    select id from line;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_give_to_hod(p_contact uuid, p_hod uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('give this customer to an HOD');
  end if;
  if crm_role_of(p_hod) is distinct from 'hod' then raise exception 'Choose an HOD.' using errcode = '22023'; end if;
  update crm_contacts set assigned_to = p_hod, team_id = null where id = p_contact;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_invite(p_kind text, p_contact uuid, p_to uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me    uuid := crm_me();
  c       crm_contacts;
  v_up    uuid;
  v_team  uuid;
  r       crm_invites;
begin
  if p_kind not in ('share', 'move') then raise exception 'Unknown invitation.' using errcode = '22023'; end if;
  if not crm_can_reply(p_contact) then perform crm_deny('pass on this customer'); end if;
  select * into c from crm_contacts where id = p_contact;
  if p_to is null or p_to = v_me or crm_role_of(p_to) is null then raise exception 'Choose someone in the CRM.' using errcode = '22023'; end if;
  if p_kind = 'move' then
    v_up := case when public.crm_can('edit', 'all') and c.assigned_to is not null and c.assigned_to <> v_me then crm_upline_of(c.assigned_to) else crm_upline_of(v_me) end;
    if v_up is null or p_to <> v_up then raise exception 'A customer moves to your direct superior only.' using errcode = '22023'; end if;
  else
    v_team := crm_team_of(v_me);
    if not public.crm_can('edit', 'all') and (v_team is null or crm_team_of(p_to) is distinct from v_team)
       and p_to not in (select crm_downline(v_me)) and v_me not in (select crm_downline(p_to)) then
      raise exception 'You can share a chat within your own team.' using errcode = '22023';
    end if;
    if exists (select 1 from crm_contact_shares where contact_id = p_contact and staff_id = p_to) or c.assigned_to = p_to then
      raise exception 'They are already in this chat.' using errcode = '23505';
    end if;
  end if;
  insert into crm_invites (kind, contact_id, contact_name, from_staff, to_staff)
  values (p_kind, p_contact, coalesce(c.name, c.phone, 'Customer'), v_me, p_to)
  on conflict (kind, contact_id, to_staff) where state = 'pending' do update set created_at = now(), from_staff = excluded.from_staff
  returning * into r;
  return to_jsonb(r);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_is_team_top(p_staff uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(crm_role_of(p_staff), '') = 'tl' then true
    when coalesce(crm_role_of(p_staff), '') in ('ta', 'rs') then
      crm_upline_of(p_staff) is null or coalesce(crm_role_of(crm_upline_of(p_staff)), '') in ('hod', 'boss')
    else false end
$function$;

CREATE OR REPLACE FUNCTION public.crm_my_downline()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select crm_downline(crm_me())
$function$;

CREATE OR REPLACE FUNCTION public.crm_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when me.id is not null and (crm_scope() is null or exists (select 1 from unnest(array[crm_brand_sub('conts'), crm_brand_sub('dc')]) b(s) where b.s = any (my_sub_departments('crm'))))
              then coalesce(crm_role_of(me.id), 'boss') end
  from (select crm_me() as id) me
$function$;

CREATE OR REPLACE FUNCTION public.crm_my_shares()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select contact_id from crm_contact_shares where staff_id = crm_me()
$function$;

CREATE OR REPLACE FUNCTION public.crm_people()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me   uuid := crm_me();
  v_role text := crm_my_role();
  v_out  jsonb;
begin
  if crm_scope() is null then
    select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', coalesce(crm_role_of(s.id), case when s.id = v_me then v_role end),
               'uplineId', s.reports_to, 'fullTime', coalesce(cs.full_time, false), 'title', t.name, 'login', s.user_id is not null, 'paused', coalesce(cs.paused, false),
               'brands', case when s.user_id is null then null else to_jsonb(public.crm_brands_of_user(s.user_id)) end) order by s.employee_name)
        from hr_staff_costs s left join crm_staff cs on cs.staff_id = s.id left join titles t on t.id = s.title_id
       where v_role is not null and s.status = 'active' and (crm_role_of(s.id) is not null or s.id = v_me)
         and (s.id in (select crm_downline(v_me)) or crm_sees_all())), '[]'::jsonb),
      'viewers', case when v_role is not null and crm_manages() then crm_cross_viewers() else '[]'::jsonb end)
      into v_out;
    return v_out;
  end if;
  select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', coalesce(x.role, case when s.id = v_me then v_role end),
             'uplineId', crm_upline_of(s.id), 'fullTime', coalesce(cs.full_time, false),
             'title', coalesce(mt.name, t.name), 'login', s.user_id is not null, 'paused', coalesce(cs.paused, false),
             'brands', case when s.user_id is null then null else to_jsonb(public.crm_brands_of_user(s.user_id)) end) order by s.employee_name)
      from hr_staff_costs s
      cross join lateral (select crm_role_of(s.id) as role) x
      cross join lateral crm_scope_member(s.id) m
      left join titles mt on mt.id = m.title_id
      left join titles t on t.id = s.title_id
      left join crm_staff cs on cs.staff_id = s.id
     where v_role is not null and s.status = 'active' and (x.role is not null or s.id = v_me)
       and (s.id in (select crm_downline(v_me)) or crm_sees_all())), '[]'::jsonb),
    'viewers', case when v_role is not null and crm_manages() then crm_cross_viewers() else '[]'::jsonb end)
    into v_out;
  return v_out;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_role_of(p_staff uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record;
begin
  if crm_scope() is null then
    return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id where s.id = p_staff);
  end if;
  select * into m from crm_scope_member(p_staff);
  if m.is_member then
    return (select cm.crm_role from crm_role_map cm
             where cm.title_id = coalesce(m.title_id, (select title_id from hr_staff_costs where id = p_staff))
               and cm.crm_role in ('stl', 'tl', 'ta', 'rs'));
  end if;
  if exists (select 1 from comm_sub_department_directors d where d.sub_department_id = crm_scope() and d.staff_id = p_staff) then
    return 'hod';
  end if;
  -- A sub-department's CRM director (crm_sub_settings.crm_director — DC's: KRIS) is a Revenue Director too
  -- (2026-11-24, mig 20261124230000), until that sub-department's own hierarchy names one.
  if exists (select 1 from crm_sub_settings ss where ss.crm_director = p_staff) then
    return 'hod';
  end if;
  return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id
           where s.id = p_staff and cm.crm_role = 'boss');
end $function$;

CREATE OR REPLACE FUNCTION public.crm_save_ad_assign(p_ad text, p_label text, p_mode text, p_team_split jsonb, p_people_mode text, p_people jsonb, p_team_modes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r       crm_ad_assign;
  v_sum   numeric;
  t       record;
  v_mode  text;
  h       record;
  pick    record;
  v_dealt int := 0;
begin
  if not public.crm_manages() then perform crm_deny('assign ads'); end if;
  if coalesce(trim(p_ad), '') = '' then raise exception 'Choose an ad.' using errcode = '22023'; end if;
  if p_mode is null then delete from crm_ad_assign where ad_source_id = p_ad; return null; end if;
  -- By people is merged into By team (rev 1011 §6.6).
  if p_mode not in ('even', 'split') then raise exception 'Unknown assignment.' using errcode = '22023'; end if;
  if p_mode = 'split' then
    select coalesce(sum(value::numeric), 0) into v_sum from jsonb_each_text(coalesce(p_team_split, '{}'::jsonb));
    if v_sum <> 100 then raise exception 'The teams'' %% must add up to 100%%.' using errcode = '22023'; end if;
    -- Inside every team with a share: By % adds up to 100, By max gives somebody a maximum.
    for t in select key::uuid as team from jsonb_each_text(coalesce(p_team_split, '{}'::jsonb)) where value ~ '^\d+(\.\d+)?$' and value::numeric > 0 loop
      v_mode := coalesce(p_team_modes ->> t.team::text, 'pct');
      if v_mode not in ('even', 'pct', 'cnt') then raise exception 'Unknown inside-team mode.' using errcode = '22023'; end if;
      select coalesce(sum((p_people ->> m::text)::numeric), 0) into v_sum from crm_team_handlers(t.team) m where not coalesce((select s.locked from crm_staff s where s.staff_id = m), false) and (p_people ->> m::text) ~ '^\d+(\.\d+)?$';
      if v_mode = 'pct' and v_sum <> 100 then raise exception 'Every By %% team must add up to 100%%.' using errcode = '22023'; end if;
      if v_mode = 'cnt' and v_sum <= 0 then raise exception 'Give at least one person a maximum in every By max team.' using errcode = '22023'; end if;
    end loop;
  end if;
  insert into crm_ad_assign as x (ad_source_id, ad_label, mode, team_split, people_mode, people, team_modes, updated_by)
  values (p_ad, nullif(trim(coalesce(p_label, '')), ''), p_mode, coalesce(p_team_split, '{}'::jsonb), coalesce(p_people_mode, 'pct'), coalesce(p_people, '{}'::jsonb),
          coalesce(p_team_modes, '{}'::jsonb), crm_me())
  on conflict (ad_source_id) do update set
    ad_label = coalesce(excluded.ad_label, x.ad_label), team_split = excluded.team_split, people_mode = excluded.people_mode, people = excluded.people,
    team_modes = excluded.team_modes,
    -- Saved on its own with anything changed, an ad leaves the ads counted together (Save and apply to all, 2026-10-24).
    together = x.together and x.mode = excluded.mode and x.team_split = excluded.team_split and x.people_mode = excluded.people_mode
               and x.people = excluded.people and x.team_modes = excluded.team_modes,
    -- A new mode starts a new count; so does leaving the together ads (it counts alone from now).
    started_at = case when x.mode <> excluded.mode
                        or (x.together and not (x.team_split = excluded.team_split and x.people_mode = excluded.people_mode
                                                and x.people = excluded.people and x.team_modes = excluded.team_modes))
                      then now() else x.started_at end,
    mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  -- What waited Over the limit for this ad is dealt first, oldest first, only inside the team it waits for.
  for h in select id, team_id from crm_contacts where ad_source_id = p_ad and held_reason = 'limit' and assigned_to is null order by created_at, id loop
    select * into pick from crm_pick_inside(h.team_id, r.ad_source_id, r.started_at, coalesce(r.team_modes ->> h.team_id::text, 'pct'), r.people, now());
    exit when pick.hold or pick.member is null;
    update crm_contacts set assigned_to = pick.member, held_reason = null where id = h.id;
    v_dealt := v_dealt + 1;
  end loop;
  return to_jsonb(r) || jsonb_build_object('dealt', v_dealt);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_save_fulltime(p_tl uuid, p_mode text, p_days integer[], p_vals jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r crm_fulltime_rules;
begin
  if not public.crm_manages() then perform crm_deny('set full time allocation'); end if;
  if not crm_is_team_top(p_tl) then raise exception 'Choose a team.' using errcode = '22023'; end if;
  insert into crm_fulltime_rules as x (tl_id, mode, days, vals, updated_by)
  values (p_tl, coalesce(p_mode, 'cnt'), coalesce(p_days, '{}'), coalesce(p_vals, '{}'::jsonb), crm_me())
  on conflict (tl_id) do update set mode = excluded.mode, days = excluded.days, vals = excluded.vals, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_scope_director()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v uuid;
begin
  select d.staff_id into v from comm_sub_department_directors d join hr_staff_costs s on s.id = d.staff_id
   where d.sub_department_id = crm_scope() and s.status = 'active' order by s.employee_name limit 1;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_scope_member(p_staff uuid, OUT title_id uuid, OUT upline uuid, OUT is_member boolean)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  is_member := false;
  select h.title_id, h.upline_staff_id, true into title_id, upline, is_member
    from comm_hierarchy h join comm_schemes c on c.id = h.scheme_id
   where h.staff_id = p_staff and c.sub_department_id = crm_scope() and c.is_active
     and h.effective_from <= v_today and (h.effective_to is null or h.effective_to >= v_today)
   order by h.effective_from desc limit 1;
  is_member := coalesce(is_member, false);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_scope()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sub_department_id from crm_settings where id
$function$;

CREATE OR REPLACE FUNCTION public.crm_send_to_team(p_contact uuid, p_tl uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record;
begin
  if not public.crm_manages() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('send this customer to a team');
  end if;
  if not crm_is_team_top(p_tl) then raise exception 'Choose a TL.' using errcode = '22023'; end if;
  select * into m from crm_pick_member(p_tl, now());
  update crm_contacts set team_id = p_tl, assigned_to = m.member where id = p_contact;
  return jsonb_build_object('team', p_tl, 'member', m.member, 'how', m.how);
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

CREATE OR REPLACE FUNCTION public.crm_set_full_time(p_staff uuid, p_full_time boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.crm_manages() then perform crm_deny('set who is full time'); end if;
  -- rev 1011: any team member (TL, TA, RS) is full time or part time.
  if coalesce(crm_role_of(p_staff), '') not in ('tl', 'ta', 'rs') then raise exception 'Only a team member is full time or not.' using errcode = '22023'; end if;
  insert into crm_staff (staff_id, full_time, updated_by, updated_at) values (p_staff, coalesce(p_full_time, false), auth.uid(), now())
  on conflict (staff_id) do update set full_time = excluded.full_time, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  -- Part time leaves Full time lead allocation: their ticked days go.
  if not coalesce(p_full_time, false) then
    update crm_fulltime_rules set vals = vals - p_staff::text, updated_at = now() where vals ? p_staff::text;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_set_locked(p_staff uuid, p_locked boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_was boolean;
begin
  if not public.crm_manages() then perform crm_deny('lock a member'); end if;
  if coalesce(crm_role_of(p_staff), '') not in ('tl', 'ta', 'rs', 'hod') then
    raise exception 'Only a team member or a Revenue Director can be locked.' using errcode = '22023';
  end if;
  select locked into v_was from crm_staff where staff_id = p_staff;
  insert into crm_staff (staff_id, full_time, locked, updated_by, updated_at) values (p_staff, false, coalesce(p_locked, false), auth.uid(), now())
  on conflict (staff_id) do update set locked = excluded.locked, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  if coalesce(v_was, false) is distinct from coalesce(p_locked, false) then
    perform crm_up_next_log(case when p_locked then 'lock' else 'unlock' end, p_staff, null, jsonb_build_object('locked', coalesce(v_was, false)), jsonb_build_object('locked', coalesce(p_locked, false)));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_set_person_days(p_staff uuid, p_days integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tl     uuid;
  v_days   int[] := (select coalesce(array_agg(distinct d order by d), '{}') from unnest(coalesce(p_days, '{}')) d where d between 0 and 6);
  v_before int[];
  v_vals   jsonb;
  v_all    int[];
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s Full time days'); end if;
  v_tl := crm_team_of(p_staff);
  if v_tl is null then raise exception 'This person is not in a team.' using errcode = '22023'; end if;

  select vals into v_vals from crm_fulltime_rules where tl_id = v_tl for update;
  v_vals := coalesce(v_vals, '{}'::jsonb);
  v_before := (select coalesce(array_agg(k::int order by k::int), '{}') from jsonb_each_text(coalesce(v_vals -> p_staff::text, '{}'::jsonb)) e(k, v) where v::numeric > 0);

  v_vals := v_vals - p_staff::text;
  if cardinality(v_days) > 0 then
    v_vals := v_vals || jsonb_build_object(p_staff::text, (select jsonb_object_agg(d::text, 1) from unnest(v_days) d));
  end if;
  v_all := (select coalesce(array_agg(distinct k::int order by k::int), '{}') from jsonb_each(v_vals) p(staff, m), jsonb_each_text(m) e(k, v) where v::numeric > 0);

  insert into crm_fulltime_rules as x (tl_id, mode, days, vals, updated_by)
  values (v_tl, 'turns', v_all, v_vals, crm_me())
  on conflict (tl_id) do update set days = excluded.days, vals = excluded.vals, updated_by = excluded.updated_by, updated_at = now();

  insert into crm_staff (staff_id, full_time, updated_by, updated_at) values (p_staff, cardinality(v_days) > 0, auth.uid(), now())
  on conflict (staff_id) do update set full_time = excluded.full_time, updated_by = excluded.updated_by, updated_at = now();

  if v_before is distinct from v_days then
    perform crm_up_next_log('days', p_staff, null, jsonb_build_object('days', to_jsonb(v_before)), jsonb_build_object('days', to_jsonb(v_days)));
  end if;
  return jsonb_build_object('staff', p_staff, 'days', to_jsonb(v_days));
end $function$;

CREATE OR REPLACE FUNCTION public.crm_team_handlers(p_tl uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d from crm_downline(p_tl) d where p_tl is distinct from crm_director_key() and crm_role_of(d) in ('tl', 'ta', 'rs')
  union all
  -- The Revenue Director's "team" in an ad's split: the active directors (mig 20261016010000).
  select s.id from hr_staff_costs s where p_tl = crm_director_key() and s.status = 'active' and crm_role_of(s.id) = 'hod'
$function$;

CREATE OR REPLACE FUNCTION public.crm_team_of(p_staff uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v uuid := p_staff;
  i int := 0;
begin
  while v is not null and i < 12 loop
    if crm_is_team_top(v) then return v; end if;
    v := crm_upline_of(v);
    i := i + 1;
  end loop;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_up_next_end_leave(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare l crm_staff_leave;
begin
  select * into l from crm_staff_leave where id = p_id;
  if l.id is null then return; end if;
  if not crm_up_next_may(l.staff_id) then perform crm_deny('end this person''s leave'); end if;
  if l.from_at > now() then delete from crm_staff_leave where id = p_id;
  else update crm_staff_leave set to_at = now() where id = p_id; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_up_next_give(p_ad text, p_staff uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_was uuid; v_me uuid := crm_me(); v_all boolean := crm_manages();
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('give the next lead to this person'); end if;
  if crm_staff_locked(p_staff) then raise exception 'They are locked, paused or on leave.' using errcode = '22023'; end if;
  select staff_id into v_was from crm_deal_overrides
   where kind = 'pin' and scope = p_ad and used_at is null and cleared_at is null and team_only = not v_all
     and (v_all or created_by = v_me) order by created_at desc limit 1;
  update crm_deal_overrides set cleared_at = now()
   where kind = 'pin' and scope = p_ad and used_at is null and cleared_at is null and team_only = not v_all and (v_all or created_by = v_me);
  insert into crm_deal_overrides (kind, scope, staff_id, team_only, created_by) values ('pin', p_ad, p_staff, not v_all, v_me);
  perform crm_up_next_log('give', p_staff, p_ad, jsonb_build_object('pinned', v_was), jsonb_build_object('pinned', p_staff));
end $function$;

CREATE OR REPLACE FUNCTION public.crm_up_next_pause(p_staff uuid, p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_was boolean;
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('pause this person'); end if;
  select paused into v_was from crm_staff where staff_id = p_staff;
  insert into crm_staff (staff_id, paused, updated_by, updated_at) values (p_staff, p_on, auth.uid(), now())
  on conflict (staff_id) do update set paused = excluded.paused, updated_by = excluded.updated_by, updated_at = now();
  if p_on then
    update crm_deal_overrides set cleared_at = now() where kind = 'pin' and staff_id = p_staff and used_at is null and cleared_at is null;
  end if;
  if coalesce(v_was, false) is distinct from p_on then
    perform crm_up_next_log(case when p_on then 'pause' else 'resume' end, p_staff, null, jsonb_build_object('paused', coalesce(v_was, false)), jsonb_build_object('paused', p_on));
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_up_next_save_leave(p_id uuid, p_staff uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_reason text, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_note text := btrim(coalesce(p_note, ''));
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s leave'); end if;
  if p_from is null or p_to is null then raise exception 'Pick when it starts and ends.' using errcode = '22023'; end if;
  if p_to < p_from then raise exception 'To can''t be before From.' using errcode = '22023'; end if;
  if p_to - p_from > interval '367 days' then raise exception 'A leave is a year at most.' using errcode = '22023'; end if;
  if p_reason is null or p_reason not in ('Annual', 'Sick', 'Training', 'Other') then raise exception 'Pick a reason.' using errcode = '22023'; end if;
  if p_reason = 'Other' and v_note = '' then raise exception 'Write the reason.' using errcode = '22023'; end if;
  if length(v_note) > 200 then raise exception 'A note is up to 200 characters.' using errcode = '22023'; end if;
  if exists (select 1 from crm_staff_leave l where l.staff_id = p_staff and l.id is distinct from p_id and l.from_at <= p_to and l.to_at >= p_from) then
    raise exception 'That overlaps another leave of theirs.' using errcode = '22023';
  end if;
  if p_id is not null and exists (select 1 from crm_staff_leave where id = p_id) then
    update crm_staff_leave set staff_id = p_staff, from_at = p_from, to_at = p_to, reason = p_reason, note = v_note,
      told_at = case when p_from > from_at then null else told_at end
     where id = p_id returning id into v_id;
  else
    insert into crm_staff_leave (staff_id, starts_on, ends_on, from_at, to_at, reason, note, created_by)
    values (p_staff, (p_from at time zone 'Asia/Kuala_Lumpur')::date, (p_to at time zone 'Asia/Kuala_Lumpur')::date, p_from, p_to, p_reason, v_note, auth.uid())
    returning id into v_id;
  end if;
  if now() between p_from and p_to then
    update crm_deal_overrides set cleared_at = now() where kind = 'pin' and staff_id = p_staff and used_at is null and cleared_at is null;
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_up_next_skip(p_ad text, p_staff uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('skip this person'); end if;
  update crm_deal_overrides set cleared_at = now()
   where kind = 'pin' and staff_id = p_staff and scope = p_ad and used_at is null and cleared_at is null;
  insert into crm_deal_overrides (kind, scope, staff_id, created_by) values ('skip', p_ad, p_staff, crm_me());
  perform crm_up_next_log('skip', p_staff, p_ad, null, jsonb_build_object('skipped', true));
end $function$;

CREATE OR REPLACE FUNCTION public.crm_up_next(p_ad text, p_ads text[] DEFAULT NULL::text[], p_n integer DEFAULT 10, p_line uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me uuid := crm_me(); v_all boolean := crm_sees_all(); v_line uuid[]; v_at timestamptz := now();
  v_ads text[]; v_ask text[]; v_i int := 0; v_max int; v_contact uuid; v_res jsonb; v_who uuid; v_dealt uuid[] := '{}';
  v_queue jsonb := '[]'; v_people jsonb := '[]'; v_shares jsonb := '{}'; v_last jsonb; v_lastby jsonb; v_up jsonb;
  v_n int := least(greatest(coalesce(p_n, 10), 1), 30); v_got int := 0; v_ad text; v_scoped boolean;
  v_ft uuid[] := array(select crm_fulltime_teams(now())); v_day int := (extract(isodow from (now() at time zone 'Asia/Kuala_Lumpur'))::int + 6) % 7;
  p record; v_why text; w text; v_paused boolean; v_locked boolean; v_lv crm_staff_leave; v_ticked boolean;
begin
  if v_me is null then perform crm_deny('read who is next'); end if;
  if v_all then
    v_scoped := p_line is not null;
    if v_scoped then v_line := array(select crm_downline(p_line)) || p_line; end if;
  else
    v_scoped := true;
    v_line := array(select crm_my_downline());
    if not exists (select 1 from unnest(v_line) x where x <> v_me) then perform crm_deny('read who is next'); end if;
  end if;

  v_ads := case when p_ad = 'all' then coalesce(p_ads, array(select a.ad_source_id from crm_ad_assign a order by a.ad_source_id)) else array[p_ad] end;
  v_max := case when v_scoped then 40 else v_n * 2 end;
  v_ask := array(select min(x) from unnest(v_ads) x left join crm_ad_assign a on a.ad_source_id = x
                  group by coalesce(a.mode, '-'), a.team_split::text, a.team_modes::text, a.people::text,
                           case when a.ad_source_id is null or a.together or a.mode = 'even' then '' else x end);

  if coalesce(array_length(v_ads, 1), 0) > 0 then
    begin
      while v_i < v_max and v_got < v_n loop
        v_ad := v_ads[(v_i % array_length(v_ads, 1)) + 1];
        v_i := v_i + 1;
        insert into crm_contacts (channel, account_id, external_id, ad_source_id, last_customer_at)
        values ('whatsapp', 'up-next-preview', gen_random_uuid()::text, v_ad, v_at) returning id into v_contact;
        v_res := crm_assign_contact(v_contact);
        v_who := nullif(v_res ->> 'member', '')::uuid;
        if v_who is not null then
          update crm_contacts set assigned_at = clock_timestamp() where id = v_contact;
          if not (v_who = any (v_dealt)) then v_dealt := v_dealt || v_who; end if;
          if not v_scoped or v_who = any (v_line) then
            v_queue := v_queue || jsonb_build_object('staff', v_who, 'team', coalesce((v_res ->> 'team')::uuid, crm_director_key()), 'how', v_res ->> 'member_by', 'pinBy', v_res -> 'pin_by', 'ad', v_ad);
            v_got := v_got + 1;
          end if;
        end if;
      end loop;
      raise exception 'rolled back' using errcode = 'VPUPN';
    exception when sqlstate 'VPUPN' then null;
    end;
  end if;

  for p in
    select h.staff, coalesce(crm_team_of(h.staff), case when crm_role_of(h.staff) = 'hod' then crm_director_key() end) as team
      from (select a as staff from crm_all_handlers() a union select d from crm_team_handlers(crm_director_key()) d) h
  loop
    continue when p.team is null;
    continue when v_scoped and not (p.staff = any (v_line));
    select coalesce(s.paused, false), coalesce(s.locked, false) into v_paused, v_locked from crm_staff s where s.staff_id = p.staff;
    v_paused := coalesce(v_paused, false); v_locked := coalesce(v_locked, false);
    select * into v_lv from crm_staff_leave l where l.staff_id = p.staff and v_at between l.from_at and l.to_at limit 1;
    v_why := case when v_lv.id is not null then 'leave' when v_paused then 'paused' end;
    if v_why is null and not (p.staff = any (v_dealt)) then
      v_why := case when coalesce(array_length(v_ask, 1), 0) = 0 then 'not_on_ad' end;
      for w in select crm_up_next_why(p.staff, p.team, a, v_at, v_ft) from unnest(v_ask) a loop
        if w is null then v_why := null; exit; end if;
        if v_why is null then v_why := w; end if;
      end loop;
      if v_locked and v_why is distinct from 'not_on_ad' then v_why := 'locked'; end if;
    end if;
    v_ticked := coalesce(cardinality(v_ft), 0) = 0 or exists (
      select 1 from crm_fulltime_rules f join crm_staff cs on cs.staff_id = p.staff and cs.full_time
       where f.tl_id = p.team and v_day = any (f.days) and coalesce((f.vals -> p.staff::text ->> v_day::text)::numeric, 0) > 0);
    v_people := v_people || jsonb_build_object('staff', p.staff, 'team', p.team, 'why', v_why,
      'pickable', v_lv.id is null and not v_paused and not v_locked and v_ticked,
      'leave', case when v_lv.id is null then null else jsonb_build_object('id', v_lv.id,
        'from', to_char(v_lv.from_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
        'to', to_char(v_lv.to_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), 'reason', v_lv.reason, 'note', v_lv.note) end);
  end loop;

  select coalesce(jsonb_object_agg(team, round(share / greatest(coalesce(array_length(v_ads, 1), 1), 1), 2)), '{}') into v_shares from (
    select s.key as team, sum(s.val::numeric * 100 / nullif(t.total, 0)) as share
      from crm_ad_assign a
      cross join lateral jsonb_each_text(a.team_split) s(key, val)
      cross join lateral (select sum(x.val::numeric) as total from jsonb_each_text(a.team_split) x(key, val) where x.val ~ '^\d+(\.\d+)?$') t
     where a.ad_source_id = any (v_ads) and a.mode <> 'even' and s.val ~ '^\d+(\.\d+)?$' and s.val::numeric > 0
     group by s.key) q;

  select jsonb_build_object('staff', c.assigned_to, 'at', c.assigned_at, 'ad', c.ad_source_id) into v_last
    from crm_contacts c
   where c.ad_source_id is not null and c.assigned_to is not null and c.assigned_at is not null
     and (p_ad = 'all' or c.ad_source_id = p_ad)
     and (not v_scoped or c.assigned_to = any (v_line))
   order by c.assigned_at desc limit 1;
  select coalesce(jsonb_object_agg(q.who, q.at), '{}') into v_lastby from (
    select c.assigned_to as who, max(c.assigned_at) as at from crm_contacts c
     where c.ad_source_id is not null and c.assigned_to is not null and c.assigned_at is not null
       and (p_ad = 'all' or c.ad_source_id = p_ad)
     group by c.assigned_to) q;

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'staff', l.staff_id,
      'from', to_char(l.from_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
      'to', to_char(l.to_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), 'reason', l.reason, 'note', l.note) order by l.from_at), '[]') into v_up
    from crm_staff_leave l where l.from_at > v_at and (not v_scoped or l.staff_id = any (v_line));

  return jsonb_build_object('me', v_me, 'now', to_char(v_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
    'manage', crm_manages(),
    'canAct', crm_manages() or (crm_up_next_ticked(v_me) and crm_can('view', 'own')),
    'fullTimeDay', coalesce(cardinality(v_ft), 0) > 0,
    'together', coalesce(array_length(v_ads, 1), 0) > 1 and not exists (select 1 from unnest(v_ads) x left join crm_ad_assign a on a.ad_source_id = x where a.together is not true)
      and (select count(distinct a.team_split) from crm_ad_assign a where a.ad_source_id = any (v_ads)) = 1,
    'queue', v_queue, 'people', v_people, 'shares', v_shares, 'last', v_last, 'lastBy', v_lastby, 'upcoming', v_up);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_upline_of(p_staff uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record;
begin
  if crm_scope() is null then return (select reports_to from hr_staff_costs where id = p_staff); end if;
  select * into m from crm_scope_member(p_staff);
  if not m.is_member then return null; end if;
  return coalesce(m.upline, crm_scope_director());
end $function$;

-- The CRM read policies as production holds them.
-- crm_assign_rules.crm_assign_rules_read (SELECT, PERMISSIVE, {authenticated}): (( SELECT crm_sees_all() AS crm_sees_all) OR (tl_ids && ARRAY( SELECT crm_my_downline() AS crm_my_downline)))
-- crm_contacts.crm_contacts_read (SELECT, PERMISSIVE, {authenticated}): ((( SELECT crm_my_role() AS crm_my_role) IS NOT NULL) AND (( SELECT crm_sees_all() AS crm_sees_all) OR (assigned_to IN ( SELECT crm_my_downline() AS crm_my_downline)) OR ((assigned_to IS NULL) AND (team_id IN ( SELECT crm_my_downline() AS crm_my_downline))) OR (id IN ( SELECT crm_my_shares() AS crm_my_shares))))
-- crm_fulltime_rules.crm_fulltime_rules_read (SELECT, PERMISSIVE, {authenticated}): (( SELECT crm_sees_all() AS crm_sees_all) OR (tl_id IN ( SELECT crm_my_downline() AS crm_my_downline)))
-- crm_invites.crm_invites_read (SELECT, PERMISSIVE, {authenticated}): (( SELECT crm_sees_all() AS crm_sees_all) OR (from_staff = ( SELECT crm_me() AS crm_me)) OR (to_staff = ( SELECT crm_me() AS crm_me)) OR (from_staff IN ( SELECT crm_my_downline() AS crm_my_downline)) OR (to_staff IN ( SELECT crm_my_downline() AS crm_my_downline)))
-- crm_staff.crm_staff_read (SELECT, PERMISSIVE, {authenticated}): (( SELECT crm_sees_all() AS crm_sees_all) OR (staff_id IN ( SELECT crm_my_downline() AS crm_my_downline)))
-- crm_team_settings.crm_team_settings_read (SELECT, PERMISSIVE, {authenticated}): (( SELECT crm_sees_all() AS crm_sees_all) OR (tl_id IN ( SELECT crm_my_downline() AS crm_my_downline)))

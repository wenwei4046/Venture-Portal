-- Production's bodies of the functions mig 20261124210000 swaps statements into, and crm_save_template, which its
-- crm_save_template_in calls (pg_get_functiondef, read 2026-11-24 through `supabase db query --remote --read-only`, never
-- typed by hand). validate-crm-management-apart.mjs loads them, runs the migration on them verbatim, twice, and checks what
-- the swapped bodies do.

-- crm_appt_types_in_force()
CREATE OR REPLACE FUNCTION public.crm_appt_types_in_force()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select appt_types from crm_settings where id = true), $j$[
    {"id":"online","label":"Online","on":true,"base":"online","fields":[
      {"id":"link","label":"Meeting link","kind":"link","required":false},
      {"id":"remarks","label":"Remarks","kind":"long","required":false}]},
    {"id":"other","label":"Other","on":true,"base":"place","fields":[
      {"id":"place","label":"Place","kind":"place","required":true},
      {"id":"remarks","label":"Remarks","kind":"long","required":false}]}
  ]$j$::jsonb)
$function$;

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
  if not coalesce((select s.auto_assign from crm_settings s where s.id), true) then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
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

-- crm_auto_reply_due(text,text[])
CREATE OR REPLACE FUNCTION public.crm_auto_reply_due(p_channel text, p_external_ids text[])
 RETURNS TABLE(message_id uuid, contact_id uuid, account_id text, customer text, body text, sent_at timestamp with time zone, first boolean, settings jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, c.id, c.account_id, c.external_id, coalesce(m.body, ''), m.sent_at,
         not exists (select 1 from crm_messages e where e.contact_id = c.id and e.direction = 'in' and e.id <> m.id
                       and (e.sent_at < m.sent_at or (e.sent_at = m.sent_at and e.created_at < m.created_at))),
         a.settings
    from crm_messages m
    join crm_contacts c on c.id = m.contact_id
    join crm_auto_replies a on a.staff_id = c.assigned_to
   where m.direction = 'in' and c.channel = p_channel
     and m.external_id = any (coalesce(p_external_ids, '{}'))
     and c.status is distinct from 'lost'
     and not exists (select 1 from crm_contact_prefs p where p.contact_id = c.id and p.staff_id = c.assigned_to and p.blocked)
     and coalesce((select s.send_auto_reply from crm_settings s where s.id), true)
   order by m.sent_at, m.created_at
$function$;

-- crm_book_typed(uuid,text,timestamp with time zone,jsonb,integer)
CREATE OR REPLACE FUNCTION public.crm_book_typed(p_contact uuid, p_type text, p_start timestamp with time zone, p_answers jsonb, p_minutes integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a crm_appointments; v record;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('book for this customer'); end if;
  if coalesce(p_minutes, 0) <= 0 then raise exception 'An appointment needs a length.' using errcode = '22023'; end if;
  select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));
  insert into crm_appointments (contact_id, showroom, start_at, minutes, created_by, kind, meeting_link, place, remarks, type_id, answers)
  values (p_contact, v.o_name, p_start, p_minutes, crm_me(), v.o_kind, v.o_link, v.o_place, v.o_remarks, p_type, v.o_answers)
  returning * into a;
  update crm_contacts set status = 'appointment', lost_reason = null, lost_note = null, previous_status = null where id = p_contact;
  return to_jsonb(a);
end $function$;

-- crm_booking_form()
CREATE OR REPLACE FUNCTION public.crm_booking_form()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select sections from crm_forms where kind = 'booking' order by sort_order, created_at limit 1
$function$;

-- crm_delete_form(uuid)
CREATE OR REPLACE FUNCTION public.crm_delete_form(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_kind text;
begin
  if not public.crm_manages() then perform crm_deny('delete forms'); end if;
  select kind into v_kind from crm_forms where id = p_id;
  if p_id = (select id from crm_forms where kind = v_kind order by sort_order, created_at limit 1) then
    raise exception 'Set another form as active first.' using errcode = '22023';
  end if;
  delete from crm_forms where id = p_id;
end $function$;

-- crm_import_templates(jsonb)
CREATE OR REPLACE FUNCTION public.crm_import_templates(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n integer := 0; r jsonb; t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('import templates'); end if;
  perform set_config('crm.tpl_import', 'on', true);
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(trim(r ->> 'name'), '') = '' or coalesce(trim(r ->> 'body'), '') = '' then continue; end if;
    select * into t from crm_templates where meta_name = r ->> 'name';
    if t.id is null then
      insert into crm_templates (name, channel, body, status, is_on, meta_name, meta_id, language, category, source, parts, created_by, updated_by)
      values (left(r ->> 'name', 80), 'whatsapp', left(trim(r ->> 'body'), 1024), 'approved', false, r ->> 'name', nullif(r ->> 'id', ''),
              coalesce(nullif(r ->> 'language', ''), 'en'), coalesce(nullif(r ->> 'category', ''), 'MARKETING'), 'meta',
              coalesce(r -> 'parts', '{}'::jsonb), crm_me(), crm_me());
      n := n + 1;
    elsif t.source = 'meta' then
      update crm_templates set body = left(trim(r ->> 'body'), 1024), parts = coalesce(r -> 'parts', '{}'::jsonb),
             language = coalesce(nullif(r ->> 'language', ''), language), category = coalesce(nullif(r ->> 'category', ''), category),
             meta_id = coalesce(nullif(r ->> 'id', ''), meta_id), status = 'approved', reject_reason = null,
             header_path = case when coalesce(r -> 'parts' -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT')
                                 and r -> 'parts' -> 'header' ->> 'format' = parts -> 'header' ->> 'format' then header_path end,
             header_mime = case when coalesce(r -> 'parts' -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT')
                                 and r -> 'parts' -> 'header' ->> 'format' = parts -> 'header' ->> 'format' then header_mime end,
             header_name = case when coalesce(r -> 'parts' -> 'header' ->> 'format', '') in ('IMAGE', 'VIDEO', 'DOCUMENT')
                                 and r -> 'parts' -> 'header' ->> 'format' = parts -> 'header' ->> 'format' then header_name end,
             updated_by = crm_me(), updated_at = now()
       where id = t.id;
      update crm_templates set is_on = false where id = t.id and is_on and public.crm_template_needs_file(crm_templates);
    end if;
  end loop;
  perform set_config('crm.tpl_import', '', true);
  return n;
end $function$;

-- crm_move_typed(uuid,text,timestamp with time zone,jsonb)
CREATE OR REPLACE FUNCTION public.crm_move_typed(p_appointment uuid, p_type text, p_start timestamp with time zone, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a crm_appointments; v record;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));
  update crm_appointments set start_at = p_start, kind = v.o_kind, showroom = v.o_name, meeting_link = v.o_link, place = v.o_place,
         remarks = v.o_remarks, type_id = p_type, answers = v.o_answers
   where id = p_appointment returning * into a;
  return to_jsonb(a);
end $function$;

-- crm_partner_book(text,text,text,timestamp with time zone,text,text,text,text,jsonb,text,text)
CREATE OR REPLACE FUNCTION public.crm_partner_book(p_code text, p_ref text, p_showroom text, p_start timestamp with time zone, p_booker text, p_booker_phone text, p_customer text, p_customer_phone text, p_info jsonb, p_remarks text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p crm_partner_links := crm_partner_of(p_code); b crm_partner_bookings; v_ref text; v_info jsonb := '{}'::jsonb; k text; v_same boolean := false;
  v_form jsonb := crm_booking_form(); x jsonb; v text;
begin
  if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  if (select count(*) from crm_partner_bookings where updated_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many bookings through the link just now. Try again later.';
  end if;
  if v_form is null then
    if length(btrim(coalesce(p_booker, ''))) < 1 then raise exception 'Type your name.' using errcode = '22023'; end if;
    if length(btrim(coalesce(p_customer, ''))) < 1 then raise exception 'Type the customer''s name.' using errcode = '22023'; end if;
    if length(btrim(coalesce(p_customer_phone, ''))) < 1 then raise exception 'Type the customer''s phone number.' using errcode = '22023'; end if;
  end if;
  if length(btrim(coalesce(p_booker, ''))) > 80 or length(btrim(coalesce(p_customer, ''))) > 80 then raise exception 'A name is too long.' using errcode = '22023'; end if;
  if btrim(coalesce(p_customer_phone, '')) <> '' and (length(btrim(p_customer_phone)) not between 6 and 30 or btrim(p_customer_phone) !~ '^[0-9 +()-]+$') then
    raise exception 'Type the customer''s phone number.' using errcode = '22023';
  end if;
  if length(coalesce(p_booker_phone, '')) > 30 or length(coalesce(p_remarks, '')) > 1000 or length(coalesce(p_note, '')) > 1000 then
    raise exception 'A field is too long.' using errcode = '22023';
  end if;
  if v_form is null then
    if jsonb_typeof(p_info) = 'object' then
      for k in select unnest(array['project', 'unit', 'type', 'size', 'pax', 'budget']) loop
        if coalesce(p_info ->> k, '') <> '' then v_info := v_info || jsonb_build_object(k, left(btrim(p_info ->> k), 120)); end if;
      end loop;
    end if;
  else
    for x in select f from jsonb_array_elements(v_form) s, jsonb_array_elements(coalesce(s -> 'fields', '[]'::jsonb)) f loop
      k := x ->> 'id';
      v := case k when 'booker' then p_booker when 'bookerPhone' then p_booker_phone when 'customer' then p_customer
                  when 'customerPhone' then p_customer_phone when 'remarks' then p_remarks when 'note' then p_note
                  else case when jsonb_typeof(p_info) = 'object' then p_info ->> k end end;
      if coalesce((x ->> 'req')::int, 0) = 1 and coalesce(btrim(v), '') = '' then
        raise exception 'Fill in %.', x ->> 'label' using errcode = '22023';
      end if;
      if k not in ('booker', 'bookerPhone', 'customer', 'customerPhone', 'remarks', 'note') and coalesce(btrim(v), '') <> '' then
        v_info := v_info || jsonb_build_object(k, left(btrim(v), case when x ->> 'type' = 'Long text' then 1000 else 120 end));
      end if;
    end loop;
  end if;
  if p_ref is not null then
    select * into b from crm_partner_bookings where ref = upper(btrim(p_ref)) and partner = p.id for update;
    if b.id is null or b.state <> 'booked' then raise exception 'This booking is no longer there.' using errcode = '42501'; end if;
    v_same := b.showroom = trim(coalesce(p_showroom, '')) and b.start_at = p_start;
    if not v_same and b.start_at <= now() then raise exception 'This visit has already started; its time cannot be changed here.' using errcode = '22023'; end if;
  end if;
  if not v_same then
    if p_start is null or p_start <= now() then raise exception 'Pick a time still to come.' using errcode = '22023'; end if;
    if p_start > now() + interval '120 days' then raise exception 'Book within the next 120 days.' using errcode = '22023'; end if;
    perform pg_advisory_xact_lock(hashtext('crm-slot:' || coalesce(trim(p_showroom), '') || ':' || p_start::text));
    perform crm_slot_check(p_showroom, p_start, b.id);
  end if;
  if b.id is null then
    loop
      v_ref := 'TC-' || crm_partner_token(6);
      exit when not exists (select 1 from crm_partner_bookings where ref = v_ref);
    end loop;
    insert into crm_partner_bookings (ref, partner, showroom, start_at, booker_name, booker_phone, customer_name, customer_phone, info, remarks, booker_note)
    values (v_ref, p.id, trim(p_showroom), p_start, btrim(coalesce(p_booker, '')), btrim(coalesce(p_booker_phone, '')), btrim(coalesce(p_customer, '')), btrim(coalesce(p_customer_phone, '')),
      v_info, btrim(coalesce(p_remarks, '')), btrim(coalesce(p_note, '')))
    returning * into b;
  else
    update crm_partner_bookings set showroom = trim(p_showroom), start_at = p_start, booker_name = btrim(coalesce(p_booker, '')), booker_phone = btrim(coalesce(p_booker_phone, '')),
      customer_name = btrim(coalesce(p_customer, '')), customer_phone = btrim(coalesce(p_customer_phone, '')), info = v_info, remarks = btrim(coalesce(p_remarks, '')),
      booker_note = btrim(coalesce(p_note, '')), updated_at = now()
     where id = b.id returning * into b;
  end if;
  return crm_partner_booking_json(b);
end $function$;

-- crm_partner_links_read()
CREATE OR REPLACE FUNCTION public.crm_partner_links_read()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not crm_manages() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'code', code, 'on', is_on) order by name) from crm_partner_links), '[]'::jsonb);
end $function$;

-- crm_partner_page(text)
CREATE OR REPLACE FUNCTION public.crm_partner_page(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p crm_partner_links := crm_partner_of(p_code);
begin
  if p.id is null then return jsonb_build_object('on', false); end if;
  return jsonb_build_object('on', true, 'name', p.name, 'today', to_char((now() at time zone 'Asia/Kuala_Lumpur')::date, 'YYYY-MM-DD'),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'address', coalesce(r.address, ''), 'slots', to_jsonb(r.slots),
        'cap', r.cap, 'weekly', to_jsonb(r.weekly), 'blocks', coalesce(r.blocks, '[]'::jsonb)) order by r.sort_order)
      from crm_showrooms r where r.active and r.deleted_at is null), '[]'::jsonb),
    'form', crm_booking_form());
end $function$;

-- crm_save_appt_types(jsonb)
CREATE OR REPLACE FUNCTION public.crm_save_appt_types(p_types jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t jsonb; f jsonb; ids text[] := '{}'; fids text[];
begin
  if not crm_manages() then perform crm_deny('change the appointment types'); end if;
  if jsonb_typeof(p_types) is distinct from 'array' or jsonb_array_length(p_types) > 12 then
    raise exception 'Up to 12 appointment types.' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_types) loop
    if coalesce(t->>'id', '') !~ '^[a-z0-9_-]{1,40}$' or t->>'id' = 'showroom' or t->>'id' = any(ids) then
      raise exception 'Each appointment type needs its own id.' using errcode = '22023';
    end if;
    ids := ids || (t->>'id');
    if length(btrim(coalesce(t->>'label', ''))) not between 1 and 40 then raise exception 'Name each appointment type (up to 40 characters).' using errcode = '22023'; end if;
    if (t->>'base') is distinct from 'online' and (t->>'base') is distinct from 'place' then raise exception 'A type is online or at a place.' using errcode = '22023'; end if;
    if jsonb_typeof(t->'fields') is distinct from 'array' or jsonb_array_length(t->'fields') > 20 then raise exception 'Up to 20 questions a type.' using errcode = '22023'; end if;
    fids := '{}';
    for f in select * from jsonb_array_elements(t->'fields') loop
      if coalesce(f->>'id', '') !~ '^[a-z0-9_-]{1,40}$' or f->>'id' = any(fids) then raise exception 'Each question needs its own id.' using errcode = '22023'; end if;
      fids := fids || (f->>'id');
      if length(btrim(coalesce(f->>'label', ''))) not between 1 and 60 then raise exception 'Name each question (up to 60 characters).' using errcode = '22023'; end if;
      if coalesce(f->>'kind', '') not in ('text', 'long', 'link', 'number', 'choice', 'place') then raise exception 'A question''s kind is not known.' using errcode = '22023'; end if;
      if f->>'kind' = 'choice' and (jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') not between 1 and 30) then
        raise exception 'A choice question needs 1 to 30 choices.' using errcode = '22023';
      end if;
    end loop;
    if t->>'base' = 'place' and t->>'id' is distinct from 'phone' and not exists (select 1 from jsonb_array_elements(t->'fields') x where x->>'kind' = 'place') then
      raise exception '"%" is at a place: give it a Place question.', t->>'label' using errcode = '22023';
    end if;
  end loop;
  update crm_settings set appt_types = p_types, updated_by = crm_me(), updated_at = now() where id = true;
end $function$;

-- crm_save_form(uuid,text,jsonb,text)
CREATE OR REPLACE FUNCTION public.crm_save_form(p_id uuid, p_name text, p_sections jsonb, p_kind text)
 RETURNS crm_forms
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f crm_forms; v_kind text := coalesce(nullif(trim(p_kind), ''), 'customer');
begin
  if not public.crm_manages() then perform crm_deny('change the forms'); end if;
  if v_kind not in ('customer', 'booking') then raise exception 'That kind of form is not known.' using errcode = '22023'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the form a name.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_sections, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'A form needs at least one section.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_sections) s, jsonb_array_elements(coalesce(s -> 'fields', '[]'::jsonb)) x
              where coalesce(trim(x ->> 'label'), '') = '' or coalesce(x ->> 'id', '') = ''
                 or (x ->> 'type') not in ('Text', 'Long text', 'Choice', 'Number', 'Phone', 'Date', 'Range')) then
    raise exception 'Every question needs a name and a type.' using errcode = '22023';
  end if;
  if length(p_sections::text) > 50000 then raise exception 'That form is too long.' using errcode = '22023'; end if;
  if p_id is not null then select kind into v_kind from crm_forms where id = p_id; v_kind := coalesce(v_kind, 'customer'); end if;
  if p_id is null then
    insert into crm_forms (name, kind, sections, sort_order, created_by, updated_by)
    values (trim(p_name), v_kind, p_sections, coalesce((select max(sort_order) from crm_forms where kind = v_kind), 0) + 1, crm_me(), crm_me()) returning * into f;
  else
    update crm_forms set name = trim(p_name), sections = p_sections, updated_by = crm_me(), updated_at = now()
     where id = p_id returning * into f;
    if f.id is null then raise exception 'That form is gone. Reload.' using errcode = 'P0002'; end if;
  end if;
  return f;
end $function$;

-- crm_save_settings(integer,integer,integer,boolean,boolean,boolean,boolean,boolean,boolean)
CREATE OR REPLACE FUNCTION public.crm_save_settings(p_soon integer, p_urgent integer, p_overdue integer, p_suggest boolean, p_auto boolean, p_push boolean, p_reminders boolean, p_team_alerts boolean, p_send_auto boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not crm_manages() then perform crm_deny('change the CRM''s settings'); end if;
  if p_soon is null or p_urgent is null or p_overdue is null or p_suggest is null or p_auto is null or p_push is null or p_reminders is null
     or p_team_alerts is null or p_send_auto is null then
    raise exception 'Every setting needs a value.' using errcode = '22023';
  end if;
  if not (p_soon between 1 and 23 and p_urgent > p_soon and p_overdue > p_urgent and p_overdue <= 24) then
    raise exception 'Reply soon, Urgent and Overdue must rise, from 1 to 24 hours.' using errcode = '22023';
  end if;
  insert into crm_settings (id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign, push_messages, reminders, team_alerts, send_auto_reply, updated_by, updated_at)
  values (true, p_soon, p_urgent, p_overdue, p_suggest, p_auto, p_push, p_reminders, p_team_alerts, p_send_auto, crm_me(), now())
  on conflict (id) do update set reply_soon_h = excluded.reply_soon_h, reply_urgent_h = excluded.reply_urgent_h,
    reply_overdue_h = excluded.reply_overdue_h, suggest_template = excluded.suggest_template, auto_assign = excluded.auto_assign,
    push_messages = excluded.push_messages, reminders = excluded.reminders, team_alerts = excluded.team_alerts, send_auto_reply = excluded.send_auto_reply,
    updated_by = excluded.updated_by, updated_at = now();
  return crm_settings_read();
end $function$;

-- crm_save_settings(integer,integer,integer,boolean,boolean,boolean,boolean)
CREATE OR REPLACE FUNCTION public.crm_save_settings(p_soon integer, p_urgent integer, p_overdue integer, p_suggest boolean, p_auto boolean, p_push boolean, p_reminders boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not crm_manages() then perform crm_deny('change the CRM''s settings'); end if;
  if p_soon is null or p_urgent is null or p_overdue is null or p_suggest is null or p_auto is null or p_push is null or p_reminders is null then
    raise exception 'Every setting needs a value.' using errcode = '22023';
  end if;
  if not (p_soon between 1 and 23 and p_urgent > p_soon and p_overdue > p_urgent and p_overdue <= 24) then
    raise exception 'Reply soon, Urgent and Overdue must rise, from 1 to 24 hours.' using errcode = '22023';
  end if;
  insert into crm_settings (id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign, push_messages, reminders, updated_by, updated_at)
  values (true, p_soon, p_urgent, p_overdue, p_suggest, p_auto, p_push, p_reminders, crm_me(), now())
  on conflict (id) do update set reply_soon_h = excluded.reply_soon_h, reply_urgent_h = excluded.reply_urgent_h,
    reply_overdue_h = excluded.reply_overdue_h, suggest_template = excluded.suggest_template, auto_assign = excluded.auto_assign,
    push_messages = excluded.push_messages, reminders = excluded.reminders,
    updated_by = excluded.updated_by, updated_at = now();
  return crm_settings_read();
end $function$;

-- crm_save_showroom_draft(text,jsonb)
CREATE OR REPLACE FUNCTION public.crm_save_showroom_draft(p_room text, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r crm_showroom_drafts;
begin
  if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;
  if p_room is null or (p_room <> 'new' and not exists (select 1 from crm_showrooms where id = p_room and deleted_at is null)) then
    raise exception 'That showroom is not on the list.' using errcode = '22023';
  end if;
  if p_draft is null then
    delete from crm_showroom_drafts where room = p_room;
    return null;
  end if;
  if jsonb_typeof(p_draft) <> 'object' or length(p_draft::text) > 100000 then
    raise exception 'That draft cannot be kept.' using errcode = '22023';
  end if;
  insert into crm_showroom_drafts (room, draft, saved_by, saved_at)
  values (p_room, p_draft, public.crm_me(), now())
  on conflict (room) do update set draft = excluded.draft, saved_by = excluded.saved_by, saved_at = excluded.saved_at
  returning * into r;
  return to_jsonb(r);
end $function$;

-- crm_save_showroom_full(text,text,text,text[],integer,integer[],jsonb,boolean)
CREATE OR REPLACE FUNCTION public.crm_save_showroom_full(p_id text, p_name text, p_address text, p_slots text[], p_cap integer, p_weekly integer[], p_blocks jsonb, p_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r crm_showrooms;
begin
  if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'A showroom needs a name.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(p_slots, '{}')) s where s !~ '^([01][0-9]|2[0-3]):[0-5][0-9](@[0-6]{1,7})?$') then
    raise exception 'A time slot is HH:MM, optionally @ and its weekdays.' using errcode = '22023';
  end if;
  if exists (select 1 from crm_showrooms where lower(trim(name)) = lower(trim(p_name)) and id is distinct from p_id and active) then
    raise exception 'There is already a showroom called %.', trim(p_name) using errcode = '23505';
  end if;
  if p_id is null then
    insert into crm_showrooms (name, active, sort_order, created_by, address, slots, cap, weekly, blocks)
    values (trim(p_name), coalesce(p_active, true), coalesce((select max(sort_order) from crm_showrooms), 0) + 1, crm_me(),
            coalesce(trim(p_address), ''), coalesce(p_slots, '{}'), coalesce(p_cap, 2), coalesce(p_weekly, '{}'), coalesce(p_blocks, '[]'::jsonb))
    returning * into r;
  else
    update crm_showrooms set name = trim(p_name), address = coalesce(trim(p_address), ''), slots = coalesce(p_slots, '{}'),
           cap = coalesce(p_cap, cap), weekly = coalesce(p_weekly, '{}'), blocks = coalesce(p_blocks, '[]'::jsonb),
           active = coalesce(p_active, active)
     where id = p_id returning * into r;
    if r.id is null then raise exception 'That showroom is not on the list.' using errcode = '22023'; end if;
  end if;
  return to_jsonb(r);
end $function$;

-- crm_save_template(uuid,text,text,text,text,text)
CREATE OR REPLACE FUNCTION public.crm_save_template(p_id uuid, p_name text, p_channel text, p_body text, p_language text, p_category text)
 RETURNS crm_templates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t crm_templates;
begin
  if not public.crm_manages() then perform crm_deny('write templates'); end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_body), '') = '' then raise exception 'Give the template a name and a message.' using errcode = '22023'; end if;
  if length(trim(p_body)) > 1024 then raise exception 'A template message can be up to 1,024 characters.' using errcode = '22023'; end if;
  if coalesce(p_channel, '') not in ('whatsapp', 'messenger') then raise exception 'Choose WhatsApp or Messenger.' using errcode = '22023'; end if;
  if coalesce(p_language, '') not in ('en', 'zh_CN') then raise exception 'Choose English or Chinese.' using errcode = '22023'; end if;
  if coalesce(p_category, '') not in ('MARKETING', 'UTILITY') then raise exception 'Choose Marketing or Utility.' using errcode = '22023'; end if;
  if p_id is null then
    insert into crm_templates (name, channel, body, language, category, created_by, updated_by)
      values (trim(p_name), p_channel, trim(p_body), p_language, p_category, crm_me(), crm_me()) returning * into t;
  else
    update crm_templates set name = trim(p_name), channel = p_channel, body = trim(p_body), language = p_language, category = p_category,
      status = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then status else 'draft' end,
      is_on = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then is_on else false end,
      meta_name = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then meta_name else null end,
      meta_id = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then meta_id else null end,
      reject_reason = case when body = trim(p_body) and channel = p_channel and language = p_language and category = p_category then reject_reason else null end,
      updated_by = crm_me(), updated_at = now()
     where id = p_id returning * into t;
    if t.id is null then raise exception 'That template is gone. Reload.' using errcode = 'P0002'; end if;
  end if;
  return t;
end $function$;

-- crm_set_active_form(uuid)
CREATE OR REPLACE FUNCTION public.crm_set_active_form(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_kind text;
begin
  if not public.crm_manages() then perform crm_deny('change the forms'); end if;
  select kind into v_kind from crm_forms where id = p_id;
  if v_kind is null then raise exception 'That form is gone. Reload.' using errcode = 'P0002'; end if;
  update crm_forms set sort_order = coalesce((select min(sort_order) from crm_forms where kind = v_kind), 0) - 1, updated_by = crm_me(), updated_at = now() where id = p_id;
end $function$;

-- crm_set_ft_even(boolean)
CREATE OR REPLACE FUNCTION public.crm_set_ft_even(p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not crm_manages() then perform crm_deny('change the Full time setting'); end if;
  update crm_settings set ft_even = coalesce(p_on, false), updated_by = crm_me(), updated_at = now() where id = true;
end $function$;

-- crm_settings_read()
CREATE OR REPLACE FUNCTION public.crm_settings_read()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s crm_settings;
begin
  if crm_my_role() is null then return null; end if;
  select * into s from crm_settings where id;
  return jsonb_build_object(
    'replySoonH', coalesce(s.reply_soon_h, 3), 'replyUrgentH', coalesce(s.reply_urgent_h, 6), 'replyOverdueH', coalesce(s.reply_overdue_h, 9),
    'suggestTemplate', coalesce(s.suggest_template, true), 'autoAssign', coalesce(s.auto_assign, true),
    'pushMessages', coalesce(s.push_messages, true), 'reminders', coalesce(s.reminders, true),
    'teamAlerts', coalesce(s.team_alerts, false), 'sendAutoReply', coalesce(s.send_auto_reply, true),
    'ftEven', coalesce(s.ft_even, false));
end $function$;

-- notify_crm_due()
CREATE OR REPLACE FUNCTION public.notify_crm_due()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now   timestamptz := now();
  v_local timestamp := now() AT TIME ZONE 'Asia/Kuala_Lumpur';
  v_n     integer := 0;
  r       record;
  v_name  text;
  v_key   text;
  v_body  text;
  v_h     integer;
  -- Settings › Reply targets (2026-10-18).
  v_s1    integer := coalesce((SELECT s.reply_soon_h FROM public.crm_settings s WHERE s.id), 3);
  v_s2    integer := coalesce((SELECT s.reply_urgent_h FROM public.crm_settings s WHERE s.id), 6);
  v_s3    integer := coalesce((SELECT s.reply_overdue_h FROM public.crm_settings s WHERE s.id), 9);
BEGIN
  -- Settings › Notifications › Reminders off (2026-10-18): the sweep tells nobody anything.
  IF NOT coalesce((SELECT s.reminders FROM public.crm_settings s WHERE s.id), true) THEN RETURN 0; END IF;
  -- 1. Visits tomorrow, from 9:00 the day before.
  IF extract(hour FROM v_local) >= 9 THEN
    FOR r IN
      SELECT a.id, a.start_at, a.showroom, a.reminded_at, c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to
        FROM public.crm_appointments a
        JOIN public.crm_contacts c ON c.id = a.contact_id
       WHERE a.state = 'booked' AND c.assigned_to IS NOT NULL
         AND (a.start_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = v_local::date + 1
         AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                          WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
    LOOP
      v_key := 'visit:' || r.id || ':' || extract(epoch FROM r.start_at)::bigint;
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
      v_name := public.notify_crm_name(r.name, r.phone);
      v_body := 'Visit tomorrow · ' || concat_ws(' · ',
        to_char(r.start_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'Dy FMDD Mon, FMHH12:MI am'),
        (SELECT s.name FROM public.crm_showrooms s WHERE s.id = r.showroom)) || CASE WHEN r.reminded_at IS NULL THEN ' — send the customer a reminder' ELSE ' · reminder sent' END;
      PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
        jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
      v_n := v_n + 1;
    END LOOP;
  END IF;

  -- 2. Chats waiting for their person's reply past the Reply targets (3 h · 6 h · 9 h until changed).
  FOR r IN
    SELECT c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to, m.id AS msg_id, m.kind, m.body,
           coalesce(m.sent_at, m.created_at) AS at
      FROM public.crm_contacts c
      CROSS JOIN LATERAL (
        SELECT x.id, x.direction, x.kind, x.body, x.sent_at, x.created_at
          FROM public.crm_messages x
         WHERE x.contact_id = c.id AND NOT coalesce(x.auto, false)
         ORDER BY coalesce(x.sent_at, x.created_at) DESC
         LIMIT 1) m
     WHERE c.assigned_to IS NOT NULL AND c.status NOT IN ('won', 'lost') AND m.direction = 'in'
       AND coalesce(m.sent_at, m.created_at) <= v_now - make_interval(hours => v_s1)
       AND coalesce(c.last_customer_at, coalesce(m.sent_at, m.created_at)) > v_now - CASE WHEN c.channel = 'messenger' THEN interval '7 days' ELSE interval '24 hours' END
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_h := CASE WHEN r.at <= v_now - make_interval(hours => v_s3) THEN v_s3 WHEN r.at <= v_now - make_interval(hours => v_s2) THEN v_s2 ELSE v_s1 END;
    v_key := 'wait:' || r.contact_id || ':' || r.msg_id || ':' || v_h;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := CASE v_h WHEN v_s3 THEN 'Overdue · waiting ' || floor(extract(epoch FROM v_now - r.at) / 3600)::int || ' h for your reply'
                       WHEN v_s2 THEN 'Urgent · waiting ' || v_s2 || ' h for your reply'
                       ELSE 'Waiting for your reply · ' || v_s1 || ' h' END
              || ' · ' || public.notify_crm_preview(r.kind, r.body);
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;

  -- 3. A visit today, starting within 2 hours.
  FOR r IN
    SELECT a.id, a.start_at, a.showroom, a.reminded_at, c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to
      FROM public.crm_appointments a
      JOIN public.crm_contacts c ON c.id = a.contact_id
     WHERE a.state = 'booked' AND c.assigned_to IS NOT NULL
       AND a.start_at > v_now AND a.start_at <= v_now + interval '2 hours'
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_key := 'soon:' || r.id || ':' || extract(epoch FROM r.start_at)::bigint;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := 'Visit today · ' || concat_ws(' · ',
      to_char(r.start_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
      (SELECT s.name FROM public.crm_showrooms s WHERE s.id = r.showroom))
      || CASE WHEN r.reminded_at IS NULL THEN ' — send the customer a reminder' ELSE '' END;
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;

  -- 4. A visit gone by an hour or more, still booked: mark whether they came.
  FOR r IN
    SELECT a.id, a.start_at, c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to
      FROM public.crm_appointments a
      JOIN public.crm_contacts c ON c.id = a.contact_id
     WHERE a.state = 'booked' AND c.assigned_to IS NOT NULL
       AND a.start_at <= v_now - interval '1 hour' AND a.start_at > v_now - interval '3 days'
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_key := 'mark:' || r.id || ':' || extract(epoch FROM r.start_at)::bigint;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := 'Visit at ' || to_char(r.start_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'FMHH12:MI am') || ' has passed — mark whether they came';
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;

  -- 5. A chat whose 24-hour window shuts within 3 hours.
  FOR r IN
    SELECT c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to, c.last_customer_at
      FROM public.crm_contacts c
     WHERE c.assigned_to IS NOT NULL AND c.status NOT IN ('won', 'lost')
       AND c.channel <> 'messenger' AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = c.assigned_to AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked))
  LOOP
    v_key := 'window:' || r.contact_id || ':' || extract(epoch FROM r.last_customer_at)::bigint;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.app_notifications n WHERE n.kind = 'crm' AND n.data ->> 'due' = v_key);
    v_name := public.notify_crm_name(r.name, r.phone);
    v_body := 'Chat closes in ' || greatest(1, ceil(extract(epoch FROM r.last_customer_at + interval '24 hours' - v_now) / 3600))::int
      || ' h — reply before the 24-hour window shuts';
    PERFORM public.notify_crm_people(public.notify_crm_logins(ARRAY[r.assigned_to]), v_name, v_body, 'crm_contact', r.contact_id::text,
      jsonb_build_object('ch', r.channel, 'name', v_name, 'line', v_body, 'at', v_now, 'due', v_key));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$function$;

-- notify_crm_message()
CREATE OR REPLACE FUNCTION public.notify_crm_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c      public.crm_contacts;
  v_name text;
  v_line text;
  v_who  uuid[];
BEGIN
  SELECT * INTO c FROM public.crm_contacts WHERE id = NEW.contact_id;
  IF c.id IS NULL OR c.assigned_to IS NULL THEN
    RETURN NULL;
  END IF;
  -- Settings › Notifications › Push for new messages off (2026-10-18): no phone is told.
  IF NOT coalesce((SELECT s.push_messages FROM public.crm_settings s WHERE s.id), true) THEN
    RETURN NULL;
  END IF;
  v_who := ARRAY(
    SELECT w.staff
      FROM (SELECT c.assigned_to AS staff UNION SELECT sh.staff_id FROM public.crm_contact_shares sh WHERE sh.contact_id = c.id) w
     WHERE NOT EXISTS (SELECT 1 FROM public.crm_contact_prefs p
                        WHERE p.staff_id = w.staff AND p.contact_id = c.id AND (p.muted OR p.hidden OR p.blocked)));
  v_name := public.notify_crm_name(c.name, c.phone);
  v_line := public.notify_crm_preview(NEW.kind, NEW.body);
  PERFORM public.notify_crm_people(public.notify_crm_logins(v_who), v_name, v_line, 'crm_contact', c.id::text,
    jsonb_build_object('ch', c.channel, 'name', v_name, 'line', v_line, 'at', coalesce(NEW.sent_at, NEW.created_at, now())));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_crm_message: %', SQLERRM;
  RETURN NULL;
END
$function$;

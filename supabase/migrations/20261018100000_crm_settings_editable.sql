-- Settings › General made editable, round 1 (2026-10-18; the owner: "可以，照这三项做" — docs/design_handoff_crm_redesign/
-- SETTINGS-PROPOSAL.md). Three of frame 10's rows become settings on the CRM's one settings row (crm_settings, id = true),
-- each defaulting to exactly what the CRM does today, so nothing changes until somebody edits it:
--   reply_soon_h / reply_urgent_h / reply_overdue_h  the urgency lines (3 · 6 · 9 h): the phones and the desktop read them
--                                                     through crm_settings_read(); notify_crm_due() uses them for the
--                                                     hourly "waiting for your reply" notices.
--   suggest_template                                 the template button on a cold chat (the screens read it).
--   auto_assign                                      off = a new lead is dealt to nobody and waits for a manager to send it
--                                                     by hand (crm_assign_contact); on = the dealing rules as before.
-- Written only by crm_save_settings (CRM · Manage); read by anybody in the CRM through crm_settings_read(). crm_settings is
-- already in audit_tables, so every change shows in the Audit log.
--
-- notify_crm_due and crm_assign_contact are PRODUCTION's bodies (read 2026-10-18: md5 f95c99e6… and 7e6b7c5f…) with only
-- the swaps named below.

alter table public.crm_settings
  add column if not exists reply_soon_h     integer not null default 3,
  add column if not exists reply_urgent_h   integer not null default 6,
  add column if not exists reply_overdue_h  integer not null default 9,
  add column if not exists suggest_template boolean not null default true,
  add column if not exists auto_assign      boolean not null default true;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_settings_reply_lines') then
    alter table public.crm_settings add constraint crm_settings_reply_lines
      check (reply_soon_h between 1 and 23 and reply_urgent_h > reply_soon_h and reply_overdue_h > reply_urgent_h and reply_overdue_h <= 24);
  end if;
end $$;

insert into public.crm_settings (id) values (true) on conflict (id) do nothing;

-- What every screen reads: the row's values, today's when there is no row.
create or replace function public.crm_settings_read()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s crm_settings;
begin
  if crm_me() is null then return null; end if;
  select * into s from crm_settings where id;
  return jsonb_build_object(
    'replySoonH', coalesce(s.reply_soon_h, 3), 'replyUrgentH', coalesce(s.reply_urgent_h, 6), 'replyOverdueH', coalesce(s.reply_overdue_h, 9),
    'suggestTemplate', coalesce(s.suggest_template, true), 'autoAssign', coalesce(s.auto_assign, true));
end $$;

revoke execute on function public.crm_settings_read() from public, anon;
grant execute on function public.crm_settings_read() to authenticated;

-- Save them (CRM · Manage): the three lines rising, 1–24 h.
create or replace function public.crm_save_settings(p_soon integer, p_urgent integer, p_overdue integer, p_suggest boolean, p_auto boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not crm_manages() then perform crm_deny('change the CRM''s settings'); end if;
  if p_soon is null or p_urgent is null or p_overdue is null or p_suggest is null or p_auto is null then
    raise exception 'Every setting needs a value.' using errcode = '22023';
  end if;
  if not (p_soon between 1 and 23 and p_urgent > p_soon and p_overdue > p_urgent and p_overdue <= 24) then
    raise exception 'Reply soon, Urgent and Overdue must rise, from 1 to 24 hours.' using errcode = '22023';
  end if;
  insert into crm_settings (id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign, updated_by, updated_at)
  values (true, p_soon, p_urgent, p_overdue, p_suggest, p_auto, crm_me(), now())
  on conflict (id) do update set reply_soon_h = excluded.reply_soon_h, reply_urgent_h = excluded.reply_urgent_h,
    reply_overdue_h = excluded.reply_overdue_h, suggest_template = excluded.suggest_template, auto_assign = excluded.auto_assign,
    updated_by = excluded.updated_by, updated_at = now();
  return crm_settings_read();
end $$;

revoke execute on function public.crm_save_settings(integer, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.crm_save_settings(integer, integer, integer, boolean, boolean) to authenticated;

-- crm_assign_contact: production's body; one swap — with auto_assign off a new lead is dealt to nobody (Organic Leads, sent by hand).
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
  -- Settings › New leads › Auto-assign off (2026-10-18): nobody is dealt it; it waits to be sent by hand.
  if not coalesce((select s.auto_assign from crm_settings s where s.id), true) then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
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
    -- …and the Revenue Director, whose leads keep no team and are counted by who holds them (mig 20261016010000).
    select t.k into v_team from (
      select s.id as k, (select count(*) from crm_contacts x where x.team_id = s.id and x.ad_source_id = c.ad_source_id and x.created_at > now() - interval '30 days') as n
        from hr_staff_costs s
       where s.status = 'active' and crm_role_of(s.id) = 'tl'
      union all
      select crm_director_key(), (select count(*) from crm_contacts x where x.team_id is null and x.ad_source_id = c.ad_source_id
                                     and x.assigned_to in (select crm_team_handlers(crm_director_key())) and x.created_at > now() - interval '30 days')
       where exists (select 1 from crm_team_handlers(crm_director_key()))) t
     order by t.n, t.k
     limit 1;
    if v_team is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
    select * into pick from crm_pick_inside(v_team, c.ad_source_id, now() - interval '30 days', 'even', '{}'::jsonb, v_at);
    v_who := pick.member; v_how := 'default_' || pick.how;
  elsif r.mode = 'even' then
    select h into v_who from (select a from crm_all_handlers() a union select d from crm_team_handlers(crm_director_key()) d) u(h)
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
     where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and (crm_role_of(key::uuid) = 'tl' or (key::uuid = crm_director_key() and exists (select 1 from crm_team_handlers(crm_director_key()))))
     order by (coalesce((select sum(g.n) from crm_campaign_given(r.ad_source_id, r.started_at) g where g.team = key::uuid or (key::uuid = crm_director_key() and g.team is null and g.staff in (select crm_team_handlers(crm_director_key())))), 0)
               + (select count(*) from crm_contacts x where x.ad_source_id = r.ad_source_id and x.team_id = key::uuid and x.held_reason = 'limit' and x.created_at >= r.started_at)
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
  if v_who is null then return jsonb_build_object('assigned', false, 'waits', 'organic'); end if;
  if v_team = crm_director_key() then v_team := null; end if;
  v_team := coalesce(v_team, crm_team_of(v_who));

  update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;
  return jsonb_build_object('assigned', true, 'team', v_team, 'member', v_who, 'member_by', v_how);
end $function$;

-- notify_crm_due: production's body; part 2's three lines read Settings (3 · 6 · 9 h until changed).
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
       AND coalesce(c.last_customer_at, coalesce(m.sent_at, m.created_at)) > v_now - interval '24 hours'
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
       AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'
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

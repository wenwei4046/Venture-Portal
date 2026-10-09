-- CRM: a new enquiry is assigned the moment it arrives (2026-10-03).
--
-- Until now a new WhatsApp customer waited with no team. The ingest — still
-- the ONE writer for Meta's deliveries — now deals a NEW customer by the rules
-- the Boss, HOD and TLs set (src/lib/member/crm-team.ts assignEnquiry /
-- pickInTeam are the twins; keep them in step):
--   1. Which team: an ad handed to TLs rotates evenly among them (Mode 1);
--      any other ad by each team's % (Mode 2). Neither → no team: it waits in
--      the Boss and HOD's Unassigned list.
--   2. Who in the team, by the day the customer wrote (Malaysia time):
--      Fri–Sun with the full-time switch on → full-time RS evenly in turn;
--      Fri–Sun with it off, or a ticked Mon–Thu day → each person's %;
--      an unticked Mon–Thu day → nobody: it waits in the TL's To assign list.
-- "Evenly" and "by %" balance against what each team and person was given in
-- the last 30 days. Ties go to the lower id (the TypeScript twin keeps list
-- order) — the only difference, and only on an exact tie.
--
-- Every new message from the customer also adds one to their unread count.
-- A returning customer keeps their team and person.
--
-- Add-only in effect: new helper functions; crm_ingest_whatsapp is replaced
-- with the same deliveries, counts and log, plus the two steps above.

-- The people in a TL's team who take enquiries: the TL, their TAs and RS.
create or replace function public.crm_team_handlers(p_tl uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select d from crm_downline(p_tl) d where crm_role_of(d) in ('tl', 'ta', 'rs')
$$;

-- Whoever is furthest below their share gets the next one: (given + 1) / share, smallest wins.
create or replace function public.crm_pick_by_share(p_shares jsonb, p_given jsonb) returns uuid
language sql immutable set search_path = public as $$
  select key::uuid
    from jsonb_each_text(coalesce(p_shares, '{}'::jsonb)) as s(key, val)
   where val::numeric > 0
   order by (coalesce((p_given ->> key)::numeric, 0) + 1) / val::numeric, key
   limit 1
$$;

-- Who in a team gets an enquiry that arrived at p_at. how: weekend | ratio | manual | no_full_time | no_shares.
create or replace function public.crm_pick_member(p_tl uuid, p_at timestamptz, out member uuid, out how text)
language plpgsql stable security definer set search_path = public as $$
declare
  dow     int := extract(dow from p_at at time zone 'Asia/Kuala_Lumpur');
  weekend boolean := dow in (5, 6, 0);
  st      crm_team_settings;
  given   jsonb;
  shares  jsonb;
begin
  select * into st from crm_team_settings where tl_id = p_tl;
  select coalesce(jsonb_object_agg(assigned_to, n), '{}'::jsonb) into given
    from (select assigned_to, count(*) as n from crm_contacts
           where assigned_to is not null and created_at > now() - interval '30 days' group by assigned_to) x;

  if weekend and coalesce(st.weekend_full_time, true) then
    select coalesce(jsonb_object_agg(h, 1), '{}'::jsonb) into shares
      from crm_team_handlers(p_tl) h join crm_staff cs on cs.staff_id = h and cs.full_time
     where crm_role_of(h) = 'rs';
    member := crm_pick_by_share(shares, given);
    how := case when member is null then 'no_full_time' else 'weekend' end;
  elsif weekend or dow = any(coalesce(st.percent_days, '{}')) then
    select coalesce(jsonb_object_agg(h, coalesce((st.ratios ->> h::text)::numeric, 0)), '{}'::jsonb) into shares
      from crm_team_handlers(p_tl) h;
    member := crm_pick_by_share(shares, given);
    how := case when member is null then 'no_shares' else 'ratio' end;
  else
    member := null;
    how := 'manual';
  end if;
end $$;

-- Which team takes an enquiry from this ad. how: 1 (ad handed to TLs) | 2 (split by %).
create or replace function public.crm_pick_team(p_ad text, out team uuid, out how int)
language plpgsql stable security definer set search_path = public as $$
declare
  given  jsonb;
  shares jsonb;
begin
  select coalesce(jsonb_object_agg(team_id, n), '{}'::jsonb) into given
    from (select team_id, count(*) as n from crm_contacts
           where team_id is not null and created_at > now() - interval '30 days' group by team_id) x;

  -- Mode 1: the TLs this ad is handed to (only people who are TLs today), evenly.
  select coalesce(jsonb_object_agg(t, 1), '{}'::jsonb) into shares
    from crm_assign_rules r, unnest(r.tl_ids) t
   where r.ad_source_id = p_ad and crm_role_of(t) = 'tl';
  if shares <> '{}'::jsonb then
    team := crm_pick_by_share(shares, given);
    how := 1;
    return;
  end if;

  -- Mode 2: each team's %.
  select coalesce(jsonb_object_agg(tl_id, team_share), '{}'::jsonb) into shares
    from crm_team_settings where team_share > 0 and crm_role_of(tl_id) = 'tl';
  team := crm_pick_by_share(shares, given);
  how := case when team is null then null else 2 end;
end $$;

-- Deal one customer who has no team yet. Returns what happened, for the log.
create or replace function public.crm_assign_contact(p_contact uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c   crm_contacts;
  t   record;
  m   record;
begin
  select * into c from crm_contacts where id = p_contact for update;
  if c.id is null or c.team_id is not null or c.assigned_to is not null then
    return jsonb_build_object('assigned', false);
  end if;
  select * into t from crm_pick_team(c.ad_source_id);
  if t.team is null then
    return jsonb_build_object('assigned', false, 'waits', 'boss_hod');
  end if;
  select * into m from crm_pick_member(t.team, coalesce(c.last_customer_at, now()));
  update crm_contacts set team_id = t.team, assigned_to = m.member where id = p_contact;
  return jsonb_build_object('assigned', true, 'team', t.team, 'team_by', t.how, 'member', m.member, 'member_by', m.how);
end $$;

revoke all on function public.crm_team_handlers(uuid), public.crm_pick_by_share(jsonb, jsonb), public.crm_pick_member(uuid, timestamptz),
  public.crm_pick_team(text), public.crm_assign_contact(uuid) from public, anon, authenticated;
grant execute on function public.crm_team_handlers(uuid), public.crm_pick_by_share(jsonb, jsonb), public.crm_pick_member(uuid, timestamptz),
  public.crm_pick_team(text), public.crm_assign_contact(uuid) to service_role;

-- The ingest, as before, plus: a NEW customer is dealt at once, and every new message adds to the unread count.
create or replace function public.crm_ingest_whatsapp(
  p_messages jsonb, p_statuses jsonb, p_ignored integer, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m jsonb;
  s jsonb;
  v_contact uuid;
  v_created boolean;
  v_new int := 0;
  v_dup int := 0;
  v_status int := 0;
  v_assigned int := 0;
  v_rows int;
  v_counts jsonb;
begin
  for m in select * from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    -- A re-delivery changes nothing — not even the contact, or an old message
    -- arriving late would reopen a customer the salesperson has since closed.
    if exists (select 1 from crm_messages where external_id = m->>'externalId') then
      v_dup := v_dup + 1;
      continue;
    end if;

    insert into crm_contacts as c (channel, account_id, external_id, name, phone,
                                   ad_source_id, ad_headline, ad_source_url, last_customer_at)
    values ('whatsapp', m->>'phoneNumberId', m->>'waId', nullif(m->>'name', ''), '+' || (m->>'waId'),
            m->'ad'->>'sourceId', m->'ad'->>'headline', m->'ad'->>'sourceUrl', (m->>'sentAt')::timestamptz)
    on conflict (channel, account_id, external_id) do update set
      name             = coalesce(excluded.name, c.name),
      ad_source_id     = coalesce(c.ad_source_id, excluded.ad_source_id),
      ad_headline      = coalesce(c.ad_headline, excluded.ad_headline),
      ad_source_url    = coalesce(c.ad_source_url, excluded.ad_source_url),
      last_customer_at = greatest(c.last_customer_at, excluded.last_customer_at),
      -- A Won or Lost customer who writes again comes back to Follow up by
      -- themselves, remembering what they were (lost_reason stays for "was Lost · reason").
      previous_status  = case when c.status in ('won', 'lost') then c.status else c.previous_status end,
      status           = case when c.status in ('won', 'lost') then 'follow_up' else c.status end
    returning id, (xmax = 0) into v_contact, v_created;

    insert into crm_messages (contact_id, external_id, direction, kind, body, media_id, media_mime, status, sent_at)
    values (v_contact, m->>'externalId', 'in', coalesce(m->>'kind', 'other'), m->>'body',
            m->>'mediaId', m->>'mediaMime', 'received', (m->>'sentAt')::timestamptz)
    on conflict (external_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_new := v_new + 1;
      update crm_contacts set unread = unread + 1 where id = v_contact;
      -- A new customer is dealt at once by the Boss's, HOD's and TLs' rules.
      if v_created and (crm_assign_contact(v_contact) ->> 'assigned')::boolean then
        v_assigned := v_assigned + 1;
      end if;
    else
      v_dup := v_dup + 1;
    end if;
  end loop;

  -- Statuses of messages we sent: never step back (read is not undone by a
  -- late "delivered"); failed always lands, with Meta's reason.
  for s in select * from jsonb_array_elements(coalesce(p_statuses, '[]'::jsonb)) loop
    update crm_messages set status = s->>'status', error = coalesce(s->>'error', error)
     where external_id = s->>'externalId' and direction = 'out'
       and (s->>'status' = 'failed'
            or coalesce(array_position(array['sent', 'delivered', 'read'], status), 0)
               < coalesce(array_position(array['sent', 'delivered', 'read'], s->>'status'), 0));
    get diagnostics v_rows = row_count;
    v_status := v_status + v_rows;
  end loop;

  v_counts := jsonb_build_object('messages', v_new, 'duplicates', v_dup, 'statuses', v_status, 'ignored', coalesce(p_ignored, 0), 'assigned', v_assigned);
  insert into crm_channel_events (channel, status, counts, payload)
  values ('whatsapp',
          case when v_new > 0 or v_status > 0 then 'applied' when v_dup > 0 then 'duplicate' else 'ignored' end,
          v_counts, p_payload);
  return v_counts;
end $$;

revoke all on function public.crm_ingest_whatsapp(jsonb, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingest_whatsapp(jsonb, jsonb, integer, jsonb) to service_role;

-- CRM, the writes (2026-10-03). Each is a function of its own, run under the
-- signed-in member's OWN session, and each asks who may do it before it does
-- anything. Tables stay closed to direct writes. The TypeScript twins of the
-- rules are in src/lib/member/crm-team.ts (canReply, canReassign,
-- canEditTeamRules, setsFullTime) and src/lib/member/crm.ts (statuses).
--
--   crm_mark_read            the customer's own person opened them
--   crm_set_status           New / Follow up / Appointment / Won / Lost (+reason)   — whoever may reply
--   crm_book / crm_move_appointment / crm_set_appointment_state                     — whoever may reply
--   crm_assign_member        a TL hands a lead to someone in their team               — its TL (or a Senior TL above)
--   crm_send_to_team         the Boss or HOD sends a lead to a team; its rules pick who
--   crm_save_team_settings   a team's days, weekend switch, %s                         — its TL, the Boss, the HOD
--   crm_save_team_shares     the split between teams                                  — the Boss, the HOD
--   crm_save_ad_rule         an ad handed to TLs                                      — the Boss, the HOD
--   crm_set_full_time        an RS full time or not                                   — the HOD
--
-- Add-only: functions only.

create or replace function public.crm_deny(p_what text) returns void
language plpgsql immutable as $$
begin
  raise exception 'You may not %.', p_what using errcode = '42501';
end $$;

-- ── The customer ────────────────────────────────────────────────────────────

create or replace function public.crm_mark_read(p_contact uuid) returns void
language sql security definer set search_path = public as $$
  update crm_contacts set unread = 0 where id = p_contact and assigned_to = crm_me()
$$;

create or replace function public.crm_set_status(p_contact uuid, p_status text, p_reason text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  c crm_contacts;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('change this customer'); end if;
  if p_status not in ('new', 'follow_up', 'appointment', 'won', 'lost') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  if p_status = 'lost' and (p_reason is null or p_reason not in ('too_expensive', 'bought_elsewhere', 'no_response', 'not_suitable', 'not_ready', 'other')) then
    raise exception 'A Lost customer needs a reason.' using errcode = '22023';
  end if;
  if p_status = 'lost' and p_reason = 'other' and v_note is null then
    raise exception 'Say what happened when the reason is Other.' using errcode = '22023';
  end if;
  update crm_contacts set
    status = p_status,
    lost_reason = case when p_status = 'lost' then p_reason end,
    lost_note = case when p_status = 'lost' and p_reason = 'other' then v_note end,
    previous_status = case when p_status = status then previous_status end
  where id = p_contact
  returning * into c;
  return jsonb_build_object('status', c.status, 'lost_reason', c.lost_reason, 'lost_note', c.lost_note, 'previous_status', c.previous_status);
end $$;

-- ── Appointments ────────────────────────────────────────────────────────────

create or replace function public.crm_book(p_contact uuid, p_showroom text, p_start timestamptz, p_minutes integer default 60)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a crm_appointments;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('book for this customer'); end if;
  if coalesce(trim(p_showroom), '') = '' or p_start is null or coalesce(p_minutes, 0) <= 0 then
    raise exception 'An appointment needs a showroom, a time and a length.' using errcode = '22023';
  end if;
  insert into crm_appointments (contact_id, showroom, start_at, minutes, created_by)
  values (p_contact, trim(p_showroom), p_start, p_minutes, crm_me())
  returning * into a;
  update crm_contacts set status = 'appointment', lost_reason = null, lost_note = null, previous_status = null where id = p_contact;
  return to_jsonb(a);
end $$;

create or replace function public.crm_move_appointment(p_appointment uuid, p_start timestamptz, p_showroom text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  if p_start is null or coalesce(trim(p_showroom), '') = '' then
    raise exception 'An appointment needs a showroom and a time.' using errcode = '22023';
  end if;
  update crm_appointments set start_at = p_start, showroom = trim(p_showroom) where id = p_appointment returning * into a;
  return to_jsonb(a);
end $$;

-- attended (they came) or cancelled. A cancelled one sends the customer back to Follow up unless another stands.
create or replace function public.crm_set_appointment_state(p_appointment uuid, p_state text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a crm_appointments;
  v_status text;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if p_state not in ('attended', 'cancelled') then raise exception 'Unknown appointment state.' using errcode = '22023'; end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  update crm_appointments set state = p_state where id = p_appointment returning * into a;
  if p_state = 'cancelled' then
    update crm_contacts set status = 'follow_up'
     where id = a.contact_id and status = 'appointment'
       and not exists (select 1 from crm_appointments x where x.contact_id = a.contact_id and x.state = 'booked');
  end if;
  select status into v_status from crm_contacts where id = a.contact_id;
  return to_jsonb(a) || jsonb_build_object('contact_status', v_status);
end $$;

-- ── Who has the lead ────────────────────────────────────────────────────────

create or replace function public.crm_assign_member(p_contact uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c crm_contacts;
begin
  select * into c from crm_contacts where id = p_contact;
  if c.id is null or c.team_id is null or crm_my_role() not in ('tl', 'stl')
     or c.team_id not in (select crm_my_downline()) then
    perform crm_deny('assign this customer');
  end if;
  if p_member not in (select crm_team_handlers(c.team_id)) then
    raise exception 'They are not in this team.' using errcode = '22023';
  end if;
  update crm_contacts set assigned_to = p_member where id = p_contact;
end $$;

create or replace function public.crm_send_to_team(p_contact uuid, p_tl uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not crm_sees_all() or not exists (select 1 from crm_contacts where id = p_contact) then
    perform crm_deny('send this customer to a team');
  end if;
  if crm_role_of(p_tl) is distinct from 'tl' then raise exception 'Choose a TL.' using errcode = '22023'; end if;
  select * into m from crm_pick_member(p_tl, now());
  update crm_contacts set team_id = p_tl, assigned_to = m.member where id = p_contact;
  return jsonb_build_object('team', p_tl, 'member', m.member, 'how', m.how);
end $$;

-- ── Settings ────────────────────────────────────────────────────────────────

create or replace function public.crm_save_team_settings(p_tl uuid, p_percent_days int[], p_weekend_full_time boolean, p_ratios jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if crm_role_of(p_tl) is distinct from 'tl' then raise exception 'Choose a TL.' using errcode = '22023'; end if;
  if not (crm_sees_all() or (crm_me() = p_tl)) then perform crm_deny('change this team''s rules'); end if;
  if not coalesce(p_percent_days, '{}') <@ array[1, 2, 3, 4] then raise exception 'Days must be Monday to Thursday.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_ratios, '{}')) r
              where r.value !~ '^\d+$' or r.value::int > 100
                 or r.key::uuid not in (select crm_team_handlers(p_tl))) then
    raise exception 'Each %% must be 0–100, for someone in this team.' using errcode = '22023';
  end if;
  insert into crm_team_settings (tl_id, percent_days, weekend_full_time, ratios, edited_by, edited_at)
  values (p_tl, coalesce(p_percent_days, '{}'), coalesce(p_weekend_full_time, true), coalesce(p_ratios, '{}'), crm_me(), now())
  on conflict (tl_id) do update set
    percent_days = excluded.percent_days, weekend_full_time = excluded.weekend_full_time, ratios = excluded.ratios,
    edited_by = excluded.edited_by, edited_at = excluded.edited_at;
end $$;

create or replace function public.crm_save_team_shares(p_shares jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not crm_sees_all() then perform crm_deny('change the split between teams'); end if;
  for r in select key::uuid as tl, value::int as share from jsonb_each_text(coalesce(p_shares, '{}')) loop
    if crm_role_of(r.tl) is distinct from 'tl' or r.share < 0 or r.share > 100 then
      raise exception 'Each team''s %% must be 0–100, for a TL.' using errcode = '22023';
    end if;
    insert into crm_team_settings (tl_id, team_share) values (r.tl, r.share)
    on conflict (tl_id) do update set team_share = excluded.team_share;
  end loop;
end $$;

create or replace function public.crm_save_ad_rule(p_ad text, p_label text, p_tls uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not crm_sees_all() then perform crm_deny('hand ads to TLs'); end if;
  if coalesce(trim(p_ad), '') = '' then raise exception 'Which ad?' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(p_tls, '{}')) t where crm_role_of(t) is distinct from 'tl') then
    raise exception 'An ad can only be handed to TLs.' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_tls, '{}')) = 0 then
    delete from crm_assign_rules where ad_source_id = p_ad;
  else
    insert into crm_assign_rules (ad_source_id, ad_label, tl_ids, updated_by, updated_at)
    values (p_ad, nullif(trim(coalesce(p_label, '')), ''), p_tls, auth.uid(), now())
    on conflict (ad_source_id) do update set ad_label = coalesce(excluded.ad_label, crm_assign_rules.ad_label),
      tl_ids = excluded.tl_ids, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
end $$;

create or replace function public.crm_set_full_time(p_staff uuid, p_full_time boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if crm_my_role() is distinct from 'hod' then perform crm_deny('set who is full time'); end if;
  if crm_role_of(p_staff) is distinct from 'rs' then raise exception 'Only an RS is full time or not.' using errcode = '22023'; end if;
  insert into crm_staff (staff_id, full_time, updated_by, updated_at) values (p_staff, coalesce(p_full_time, false), auth.uid(), now())
  on conflict (staff_id) do update set full_time = excluded.full_time, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

revoke all on function
  public.crm_deny(text), public.crm_mark_read(uuid), public.crm_set_status(uuid, text, text, text),
  public.crm_book(uuid, text, timestamptz, integer), public.crm_move_appointment(uuid, timestamptz, text),
  public.crm_set_appointment_state(uuid, text), public.crm_assign_member(uuid, uuid), public.crm_send_to_team(uuid, uuid),
  public.crm_save_team_settings(uuid, int[], boolean, jsonb), public.crm_save_team_shares(jsonb),
  public.crm_save_ad_rule(text, text, uuid[]), public.crm_set_full_time(uuid, boolean)
  from public, anon;
grant execute on function
  public.crm_deny(text), public.crm_mark_read(uuid), public.crm_set_status(uuid, text, text, text),
  public.crm_book(uuid, text, timestamptz, integer), public.crm_move_appointment(uuid, timestamptz, text),
  public.crm_set_appointment_state(uuid, text), public.crm_assign_member(uuid, uuid), public.crm_send_to_team(uuid, uuid),
  public.crm_save_team_settings(uuid, int[], boolean, jsonb), public.crm_save_team_shares(jsonb),
  public.crm_save_ad_rule(text, text, uuid[]), public.crm_set_full_time(uuid, boolean)
  to authenticated, service_role;

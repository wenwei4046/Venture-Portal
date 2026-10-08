-- The salesperson CRM redesign (Claude Design handoff, docs/design_handoff_crm_roles,
-- 2026-10-09). Everything the new screens keep that the CRM had nowhere to put:
--
--   * customer details (Book visit's form): property type, unit size, location,
--     requirement, budget — and the Won amount;
--   * a visit's outcome: Show up → Follow up / Won (amount) / Lost (reason),
--     No show → Follow up / Lost, or Rebook; the appointment keeps 'no_show';
--   * each person's own: labels, pinned / muted / removed chats, the pinned
--     message of a chat, messages deleted for themselves, quick replies,
--     auto-reply settings, when they last read their notifications;
--   * share and move invitations (the receiver accepts) and the shares they
--     open: a shared customer is read and answered by the invitee too;
--   * the CRM's events (Won, Lost, moved, shared) behind the notifications;
--   * a reply's quoted message and our reaction to a message;
--   * showrooms: address, time slots by weekday, booking limit per slot,
--     weekly closures and blocked dates — and Book visit keeps to them.
--
-- Add-only, like every CRM migration: new tables, new columns, new functions;
-- crm_can_reply / crm_book / crm_move_appointment / the contacts read policy
-- are widened (shares) or tightened (the showroom's slots), never loosened
-- for anyone else. Writes are database functions under the member's own
-- session, as crm_writes (mig 20261003030000).

-- ─── Customers: details and the Won amount ────────────────────────────────
alter table public.crm_contacts
  add column if not exists property_type text,
  add column if not exists unit_size     text,
  add column if not exists unit_location text,
  add column if not exists requirement   text,
  add column if not exists budget        text,
  add column if not exists won_amount    numeric(15, 2),
  add column if not exists details_by    uuid references public.hr_staff_costs(id),
  add column if not exists details_at    timestamptz;

alter table public.crm_contacts drop constraint if exists crm_contacts_property_type_check;
alter table public.crm_contacts add constraint crm_contacts_property_type_check
  check (property_type is null or property_type in ('Condo', 'Landed'));
alter table public.crm_contacts drop constraint if exists crm_contacts_won_amount_check;
alter table public.crm_contacts add constraint crm_contacts_won_amount_check
  check (won_amount is null or won_amount > 0);

-- ─── Appointments: No show, the outcome, the reminder ─────────────────────
alter table public.crm_appointments
  add column if not exists outcome     text,
  add column if not exists reminded_at timestamptz,
  add column if not exists marked_by   uuid references public.hr_staff_costs(id),
  add column if not exists marked_at   timestamptz;
alter table public.crm_appointments drop constraint if exists crm_appointments_state_check;
alter table public.crm_appointments add constraint crm_appointments_state_check
  check (state in ('booked', 'attended', 'no_show', 'cancelled'));
alter table public.crm_appointments drop constraint if exists crm_appointments_outcome_check;
alter table public.crm_appointments add constraint crm_appointments_outcome_check
  check (outcome is null or outcome in ('follow_up', 'won', 'lost', 'rebooked'));

-- ─── Messages: the quoted message and our reaction ────────────────────────
alter table public.crm_messages
  add column if not exists reply_to    uuid references public.crm_messages(id) on delete set null,
  add column if not exists my_reaction text,
  -- A visit card we sent (Confirmed / Updated / Cancelled / Reminder): {kind, start, showroom, room, addr}.
  add column if not exists card        jsonb;
alter table public.crm_messages drop constraint if exists crm_messages_my_reaction_check;
alter table public.crm_messages add constraint crm_messages_my_reaction_check
  check (my_reaction is null or char_length(my_reaction) between 1 and 8);

-- ─── Showrooms: address, slots, limit, closures ───────────────────────────
-- slots: 'HH:MM' (every day) or 'HH:MM@0123456' (those weekdays, 0 = Monday).
-- weekly: weekdays closed every week, 0 = Sunday … 6 = Saturday.
-- blocks: [{"a": "YYYY-MM-DD", "b": "YYYY-MM-DD", "why": "Training"}].
alter table public.crm_showrooms
  add column if not exists address text not null default '',
  add column if not exists slots   text[] not null default '{11:00,13:00,15:00,17:00,19:00}',
  add column if not exists cap     integer not null default 2,
  add column if not exists weekly  integer[] not null default '{}',
  add column if not exists blocks  jsonb not null default '[]'::jsonb;
alter table public.crm_showrooms drop constraint if exists crm_showrooms_cap_check;
alter table public.crm_showrooms add constraint crm_showrooms_cap_check check (cap between 1 and 10);
alter table public.crm_showrooms drop constraint if exists crm_showrooms_weekly_check;
alter table public.crm_showrooms add constraint crm_showrooms_weekly_check check (weekly <@ array[0, 1, 2, 3, 4, 5, 6]);
alter table public.crm_showrooms drop constraint if exists crm_showrooms_blocks_check;
alter table public.crm_showrooms add constraint crm_showrooms_blocks_check check (jsonb_typeof(blocks) = 'array');

-- ─── Each person's own ────────────────────────────────────────────────────
create table if not exists public.crm_contact_prefs (
  staff_id          uuid not null references public.hr_staff_costs(id) on delete cascade,
  contact_id        uuid not null references public.crm_contacts(id) on delete cascade,
  pinned            boolean not null default false,
  muted             boolean not null default false,
  -- Removed from their own Contacts / Inbox (Delete, Block). The customer stays in the CRM.
  hidden            boolean not null default false,
  blocked           boolean not null default false,
  pinned_message_id uuid references public.crm_messages(id) on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (staff_id, contact_id)
);

create table if not exists public.crm_message_hides (
  staff_id   uuid not null references public.hr_staff_costs(id) on delete cascade,
  message_id uuid not null references public.crm_messages(id) on delete cascade,
  hidden_at  timestamptz not null default now(),
  primary key (staff_id, message_id)
);

create table if not exists public.crm_labels (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.hr_staff_costs(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  color      text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_labels_staff_name on public.crm_labels (staff_id, lower(trim(name)));

create table if not exists public.crm_contact_labels (
  label_id   uuid not null references public.crm_labels(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  primary key (label_id, contact_id)
);

create table if not exists public.crm_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.hr_staff_costs(id) on delete cascade,
  shortcut   text not null check (char_length(trim(shortcut)) between 1 and 40),
  message    text not null check (char_length(trim(message)) between 1 and 4096),
  sort_order integer not null default 0
);

-- Welcome / outside opening hours / keyword replies, each person's own.
create table if not exists public.crm_auto_replies (
  staff_id   uuid primary key references public.hr_staff_costs(id) on delete cascade,
  settings   jsonb not null check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_staff_prefs (
  staff_id       uuid primary key references public.hr_staff_costs(id) on delete cascade,
  notifs_seen_at timestamptz
);

-- ─── Share / move invitations, and the shares they open ───────────────────
create table if not exists public.crm_invites (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('share', 'move')),
  contact_id   uuid not null references public.crm_contacts(id) on delete cascade,
  -- The customer's name when it was sent: the receiver reads it before they can read the customer.
  contact_name text not null,
  from_staff   uuid not null references public.hr_staff_costs(id),
  to_staff     uuid not null references public.hr_staff_costs(id),
  state        text not null default 'pending' check (state in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  check (from_staff <> to_staff)
);
create unique index if not exists crm_invites_one_pending
  on public.crm_invites (kind, contact_id, to_staff) where state = 'pending';

create table if not exists public.crm_contact_shares (
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  staff_id   uuid not null references public.hr_staff_costs(id) on delete cascade,
  invited_by uuid references public.hr_staff_costs(id),
  joined_at  timestamptz not null default now(),
  primary key (contact_id, staff_id)
);

-- ─── The CRM's events, behind the notifications ───────────────────────────
create table if not exists public.crm_events (
  id         bigserial primary key,
  kind       text not null check (kind in ('won', 'lost', 'moved', 'shared', 'share_declined', 'move_declined')),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  actor      uuid references public.hr_staff_costs(id),
  -- Whose customer it was when it happened (the notifications go to them and above them).
  owner      uuid references public.hr_staff_costs(id),
  data       jsonb not null default '{}'::jsonb,
  at         timestamptz not null default now()
);
create index if not exists crm_events_contact on public.crm_events (contact_id, at desc);

-- ─── Row level security: one's own rows; events and shares as the customer ─
alter table public.crm_contact_prefs  enable row level security;
alter table public.crm_message_hides  enable row level security;
alter table public.crm_labels         enable row level security;
alter table public.crm_contact_labels enable row level security;
alter table public.crm_quick_replies  enable row level security;
alter table public.crm_auto_replies   enable row level security;
alter table public.crm_staff_prefs    enable row level security;
alter table public.crm_invites        enable row level security;
alter table public.crm_contact_shares enable row level security;
alter table public.crm_events         enable row level security;

revoke all on public.crm_contact_prefs, public.crm_message_hides, public.crm_labels, public.crm_contact_labels,
  public.crm_quick_replies, public.crm_auto_replies, public.crm_staff_prefs, public.crm_invites,
  public.crm_contact_shares, public.crm_events from anon, authenticated;
grant select on public.crm_contact_prefs, public.crm_message_hides, public.crm_labels, public.crm_contact_labels,
  public.crm_quick_replies, public.crm_auto_replies, public.crm_staff_prefs, public.crm_invites,
  public.crm_contact_shares, public.crm_events to authenticated;
revoke all on sequence public.crm_events_id_seq from anon, authenticated;

drop policy if exists crm_contact_prefs_own on public.crm_contact_prefs;
create policy crm_contact_prefs_own on public.crm_contact_prefs for select to authenticated
  using (staff_id = (select crm_me()));
drop policy if exists crm_message_hides_own on public.crm_message_hides;
create policy crm_message_hides_own on public.crm_message_hides for select to authenticated
  using (staff_id = (select crm_me()));
drop policy if exists crm_labels_own on public.crm_labels;
create policy crm_labels_own on public.crm_labels for select to authenticated
  using (staff_id = (select crm_me()));
drop policy if exists crm_contact_labels_own on public.crm_contact_labels;
create policy crm_contact_labels_own on public.crm_contact_labels for select to authenticated
  using (label_id in (select id from crm_labels where staff_id = (select crm_me())));
drop policy if exists crm_quick_replies_own on public.crm_quick_replies;
create policy crm_quick_replies_own on public.crm_quick_replies for select to authenticated
  using (staff_id = (select crm_me()));
drop policy if exists crm_auto_replies_own on public.crm_auto_replies;
create policy crm_auto_replies_own on public.crm_auto_replies for select to authenticated
  using (staff_id = (select crm_me()));
drop policy if exists crm_staff_prefs_own on public.crm_staff_prefs;
create policy crm_staff_prefs_own on public.crm_staff_prefs for select to authenticated
  using (staff_id = (select crm_me()));
drop policy if exists crm_invites_read on public.crm_invites;
create policy crm_invites_read on public.crm_invites for select to authenticated
  using ((select crm_sees_all()) or from_staff = (select crm_me()) or to_staff = (select crm_me())
         or from_staff in (select crm_my_downline()) or to_staff in (select crm_my_downline()));
drop policy if exists crm_contact_shares_read on public.crm_contact_shares;
create policy crm_contact_shares_read on public.crm_contact_shares for select to authenticated
  using (staff_id = (select crm_me()) or contact_id in (select id from crm_contacts));
drop policy if exists crm_events_read on public.crm_events;
create policy crm_events_read on public.crm_events for select to authenticated
  using (contact_id in (select id from crm_contacts));

-- Who is in a customer's chat by invitation: the shares the signed-in person holds.
create or replace function public.crm_my_shares()
returns setof uuid language sql stable security definer set search_path = public as $$
  select contact_id from crm_contact_shares where staff_id = crm_me()
$$;
revoke all on function public.crm_my_shares() from public, anon;
grant execute on function public.crm_my_shares() to authenticated;

-- A shared customer is read by the invitee too.
drop policy if exists crm_contacts_read on public.crm_contacts;
create policy crm_contacts_read on public.crm_contacts for select to authenticated
  using (((select crm_my_role()) is not null) and (
    (select crm_sees_all())
    or assigned_to in (select crm_my_downline())
    or (assigned_to is null and team_id in (select crm_my_downline()))
    or id in (select crm_my_shares())));

-- …and answered by them: the customer's own person or an upline who takes
-- enquiries (as before), the HOD for customers given to them, or an invitee.
create or replace function public.crm_can_reply(p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from crm_contacts c
     where c.id = p_contact
       and (
         (crm_my_role() in ('stl', 'tl', 'ta', 'rs') and coalesce(c.assigned_to, c.team_id) in (select crm_my_downline()))
         or (crm_my_role() = 'hod' and c.assigned_to = crm_me())
         or (crm_my_role() is not null and exists (select 1 from crm_contact_shares s where s.contact_id = c.id and s.staff_id = crm_me()))
       )
  )
$$;

-- ─── Won and Lost are events, whichever path set them ─────────────────────
create or replace function public.crm_contacts_status_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('won', 'lost') and new.status is distinct from old.status then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values (new.status, new.id, crm_me(), new.assigned_to,
            case when new.status = 'won'
              then jsonb_build_object('amount', new.won_amount)
              else jsonb_build_object('reason', new.lost_reason, 'note', new.lost_note) end);
  end if;
  return new;
end $$;
drop trigger if exists crm_contacts_status_event on public.crm_contacts;
create trigger crm_contacts_status_event after update of status on public.crm_contacts
  for each row execute function public.crm_contacts_status_event();

-- ─── The showroom's rules, for Book visit and Change ──────────────────────
-- In the office's time (UTC+8): the day it is closed (weekly or a blocked
-- date), a time that is not one of its slots that weekday, or a slot already
-- at its limit is refused. p_except: the appointment being moved.
create or replace function public.crm_slot_check(p_showroom text, p_start timestamptz, p_except uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  r       crm_showrooms;
  v_local timestamp := p_start at time zone 'Asia/Kuala_Lumpur';
  v_date  text := to_char(v_local, 'YYYY-MM-DD');
  v_hhmm  text := to_char(v_local, 'HH24:MI');
  v_mon0  text := ((extract(isodow from v_local)::int + 6) % 7)::text; -- 0 = Monday
  v_taken integer;
begin
  select * into r from crm_showrooms where id = trim(p_showroom);
  if r.id is null or not r.active then raise exception 'Choose a showroom that is open.' using errcode = '22023'; end if;
  if extract(dow from v_local)::int = any (r.weekly)
     or exists (select 1 from jsonb_array_elements(r.blocks) b where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a')) then
    raise exception '% is closed that day.', r.name using errcode = '22023';
  end if;
  if not exists (select 1 from unnest(r.slots) s
                  where split_part(s, '@', 1) = v_hhmm
                    and (position('@' in s) = 0 or position(v_mon0 in split_part(s, '@', 2)) > 0)) then
    raise exception '% does not take bookings at that time.', r.name using errcode = '22023';
  end if;
  select count(*) into v_taken from crm_appointments
   where showroom = r.id and start_at = p_start and state = 'booked' and id is distinct from p_except;
  if v_taken >= r.cap then raise exception 'That time is full at %. Choose another.', r.name using errcode = '22023'; end if;
end $$;
revoke all on function public.crm_slot_check(text, timestamptz, uuid) from public, anon, authenticated;

create or replace function public.crm_book(p_contact uuid, p_showroom text, p_start timestamptz, p_minutes integer default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a crm_appointments;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('book for this customer'); end if;
  if coalesce(trim(p_showroom), '') = '' or p_start is null or coalesce(p_minutes, 0) <= 0 then
    raise exception 'An appointment needs a showroom, a time and a length.' using errcode = '22023';
  end if;
  perform crm_slot_check(p_showroom, p_start);
  insert into crm_appointments (contact_id, showroom, start_at, minutes, created_by)
  values (p_contact, trim(p_showroom), p_start, p_minutes, crm_me())
  returning * into a;
  update crm_contacts set status = 'appointment', lost_reason = null, lost_note = null, previous_status = null where id = p_contact;
  return to_jsonb(a);
end $$;

create or replace function public.crm_move_appointment(p_appointment uuid, p_start timestamptz, p_showroom text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  if p_start is null or coalesce(trim(p_showroom), '') = '' then
    raise exception 'An appointment needs a showroom and a time.' using errcode = '22023';
  end if;
  perform crm_slot_check(p_showroom, p_start, p_appointment);
  update crm_appointments set start_at = p_start, showroom = trim(p_showroom)
   where id = p_appointment returning * into a;
  return to_jsonb(a);
end $$;

-- Cancel keeps its old meaning; came / no show now go through crm_visit_outcome.
create or replace function public.crm_set_appointment_state(p_appointment uuid, p_state text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a crm_appointments;
  v_status text;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if p_state not in ('attended', 'cancelled') then raise exception 'Unknown appointment state.' using errcode = '22023'; end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  update crm_appointments set state = p_state, marked_by = crm_me(), marked_at = now() where id = p_appointment returning * into a;
  if p_state = 'cancelled' then
    update crm_contacts set status = 'follow_up'
     where id = a.contact_id and status = 'appointment'
       and not exists (select 1 from crm_appointments x where x.contact_id = a.contact_id and x.state = 'booked');
  end if;
  select status into v_status from crm_contacts where id = a.contact_id;
  return to_jsonb(a) || jsonb_build_object('contact_status', v_status);
end $$;

-- ─── A visit's outcome ────────────────────────────────────────────────────
-- p_came: Show up (true) or No show (false). p_outcome: follow_up, won (with
-- p_amount), lost (with p_reason, p_note when Other), or rebooked (No show
-- only — a new booking follows from Book visit).
create or replace function public.crm_visit_outcome(p_appointment uuid, p_came boolean, p_outcome text,
  p_amount numeric default null, p_reason text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a crm_appointments;
  c crm_contacts;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('mark this visit'); end if;
  if a.state <> 'booked' then raise exception 'This visit is already marked.' using errcode = '22023'; end if;
  if p_came is null or p_outcome not in ('follow_up', 'won', 'lost', 'rebooked') then
    raise exception 'Choose what happened.' using errcode = '22023';
  end if;
  if p_outcome = 'rebooked' and p_came then raise exception 'Rebook is for a No show.' using errcode = '22023'; end if;
  if p_outcome = 'won' and not p_came then raise exception 'A customer who did not come cannot be Won here.' using errcode = '22023'; end if;
  if p_outcome = 'won' and coalesce(p_amount, 0) <= 0 then raise exception 'Enter the amount of the sale.' using errcode = '22023'; end if;
  if p_outcome = 'lost' and (p_reason is null or p_reason not in ('too_expensive', 'bought_elsewhere', 'no_response', 'not_suitable', 'not_ready', 'other')) then
    raise exception 'A Lost customer needs a reason.' using errcode = '22023';
  end if;
  if p_outcome = 'lost' and p_reason = 'other' and v_note is null then
    raise exception 'Say what happened when the reason is Other.' using errcode = '22023';
  end if;
  if p_outcome = 'lost' and p_reason = 'no_response' and p_came then
    raise exception 'Unreachable is for a No show.' using errcode = '22023';
  end if;

  update crm_appointments
     set state = case when p_came then 'attended' else 'no_show' end, outcome = p_outcome,
         marked_by = crm_me(), marked_at = now()
   where id = p_appointment returning * into a;

  update crm_contacts set
    status = case p_outcome when 'won' then 'won' when 'lost' then 'lost' when 'rebooked' then status else 'follow_up' end,
    won_amount = case when p_outcome = 'won' then round(p_amount, 2) else won_amount end,
    lost_reason = case when p_outcome = 'lost' then p_reason when p_outcome = 'won' or p_outcome = 'follow_up' then null else lost_reason end,
    lost_note = case when p_outcome = 'lost' and p_reason = 'other' then v_note when p_outcome = 'lost' then null else lost_note end,
    previous_status = null
   where id = a.contact_id returning * into c;
  return to_jsonb(a) || jsonb_build_object('contact_status', c.status, 'won_amount', c.won_amount);
end $$;

create or replace function public.crm_mark_reminded(p_appointment uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('remind this customer'); end if;
  update crm_appointments set reminded_at = now() where id = p_appointment returning * into a;
  return to_jsonb(a);
end $$;

-- ─── Customer details (Book visit's form, Customer info › Edit) ───────────
create or replace function public.crm_save_details(p_contact uuid, p_name text, p_phone text, p_type text,
  p_size text, p_location text, p_requirement text, p_budget text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c crm_contacts;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('change this customer'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'The customer needs a name.' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_type, '')), '') is not null and trim(p_type) not in ('Condo', 'Landed') then
    raise exception 'Property type is Condo or Landed.' using errcode = '22023';
  end if;
  update crm_contacts set
    name = left(trim(p_name), 120),
    phone = coalesce(nullif(left(trim(coalesce(p_phone, '')), 40), ''), phone),
    property_type = nullif(trim(coalesce(p_type, '')), ''),
    unit_size = nullif(left(trim(coalesce(p_size, '')), 20), ''),
    unit_location = nullif(left(trim(coalesce(p_location, '')), 200), ''),
    requirement = nullif(left(trim(coalesce(p_requirement, '')), 1000), ''),
    budget = nullif(left(trim(coalesce(p_budget, '')), 40), ''),
    details_by = crm_me(), details_at = now()
   where id = p_contact returning * into c;
  return jsonb_build_object('name', c.name, 'phone', c.phone, 'property_type', c.property_type, 'unit_size', c.unit_size,
    'unit_location', c.unit_location, 'requirement', c.requirement, 'budget', c.budget);
end $$;

-- ─── Each person's own: chat prefs, labels, quick replies, auto-replies ───
create or replace function public.crm_set_pref(p_contact uuid, p_pinned boolean default null, p_muted boolean default null,
  p_hidden boolean default null, p_blocked boolean default null, p_pinned_message uuid default null, p_clear_pinned_message boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := crm_me();
  r crm_contact_prefs;
begin
  if v_me is null or not exists (select 1 from crm_contacts c where c.id = p_contact
       and (crm_can_see(c.assigned_to, c.team_id) or c.id in (select crm_my_shares()))) then
    perform crm_deny('change this chat');
  end if;
  if p_pinned_message is not null and not exists (select 1 from crm_messages where id = p_pinned_message and contact_id = p_contact) then
    raise exception 'That message is not in this chat.' using errcode = '22023';
  end if;
  insert into crm_contact_prefs as x (staff_id, contact_id, pinned, muted, hidden, blocked, pinned_message_id)
  values (v_me, p_contact, coalesce(p_pinned, false), coalesce(p_muted, false), coalesce(p_hidden, false), coalesce(p_blocked, false), p_pinned_message)
  on conflict (staff_id, contact_id) do update set
    pinned = coalesce(p_pinned, x.pinned), muted = coalesce(p_muted, x.muted),
    hidden = coalesce(p_hidden, x.hidden), blocked = coalesce(p_blocked, x.blocked),
    pinned_message_id = case when p_clear_pinned_message then null else coalesce(p_pinned_message, x.pinned_message_id) end,
    updated_at = now()
  returning * into r;
  return to_jsonb(r);
end $$;

-- Delete for me: the message stays for everyone else (and for Meta — a sent WhatsApp cannot be unsent).
create or replace function public.crm_hide_message(p_message uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_contact uuid;
begin
  select contact_id into v_contact from crm_messages where id = p_message;
  -- SECURITY DEFINER reads past RLS, so ask the question the read policy asks.
  if v_contact is null or not exists (select 1 from crm_contacts c where c.id = v_contact
       and (crm_can_see(c.assigned_to, c.team_id) or c.id in (select crm_my_shares()))) then
    perform crm_deny('delete this message');
  end if;
  insert into crm_message_hides (staff_id, message_id) values (crm_me(), p_message) on conflict do nothing;
end $$;

-- Labels: the person's whole list in one go ([{id?, name, color}], in order). A label left out is deleted.
create or replace function public.crm_save_labels(p_labels jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := crm_me();
  e jsonb;
  i integer := 0;
  v_keep uuid[] := '{}';
  v_id uuid;
begin
  if v_me is null or crm_my_role() is null then perform crm_deny('keep labels'); end if;
  if jsonb_typeof(p_labels) <> 'array' or jsonb_array_length(p_labels) > 30 then
    raise exception 'Up to 30 labels.' using errcode = '22023';
  end if;
  for e in select * from jsonb_array_elements(p_labels) loop
    i := i + 1;
    if (e ->> 'id') is not null and exists (select 1 from crm_labels where id = (e ->> 'id')::uuid and staff_id = v_me) then
      update crm_labels set name = trim(e ->> 'name'), color = e ->> 'color', sort_order = i where id = (e ->> 'id')::uuid returning id into v_id;
    else
      insert into crm_labels (staff_id, name, color, sort_order) values (v_me, trim(e ->> 'name'), e ->> 'color', i) returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;
  delete from crm_labels where staff_id = v_me and not (id = any (v_keep));
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color) order by sort_order)
                     from crm_labels where staff_id = v_me), '[]'::jsonb);
end $$;

create or replace function public.crm_set_label(p_contact uuid, p_label uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from crm_labels where id = p_label and staff_id = crm_me()) then perform crm_deny('use that label'); end if;
  if not exists (select 1 from crm_contacts c where c.id = p_contact and (crm_can_see(c.assigned_to, c.team_id) or c.id in (select crm_my_shares()))) then
    perform crm_deny('label this customer');
  end if;
  if p_on then insert into crm_contact_labels (label_id, contact_id) values (p_label, p_contact) on conflict do nothing;
  else delete from crm_contact_labels where label_id = p_label and contact_id = p_contact; end if;
end $$;

-- Quick replies: the whole list in one go ([{shortcut, message}], in order).
create or replace function public.crm_save_quick_replies(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := crm_me();
  e jsonb;
  i integer := 0;
begin
  if v_me is null or crm_my_role() is null then perform crm_deny('keep quick replies'); end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Up to 100 quick replies.' using errcode = '22023';
  end if;
  delete from crm_quick_replies where staff_id = v_me;
  for e in select * from jsonb_array_elements(p_items) loop
    -- A half-typed row (no shortcut or no message) is not kept.
    if coalesce(trim(e ->> 'shortcut'), '') = '' or coalesce(trim(e ->> 'message'), '') = '' then continue; end if;
    i := i + 1;
    insert into crm_quick_replies (staff_id, shortcut, message, sort_order) values (v_me, trim(e ->> 'shortcut'), e ->> 'message', i);
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'shortcut', shortcut, 'message', message) order by sort_order)
                     from crm_quick_replies where staff_id = v_me), '[]'::jsonb);
end $$;

create or replace function public.crm_save_auto_replies(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := crm_me();
begin
  if v_me is null or crm_my_role() is null then perform crm_deny('keep auto-replies'); end if;
  if jsonb_typeof(p_settings) <> 'object' or octet_length(p_settings::text) > 20000 then
    raise exception 'Those auto-reply settings are not valid.' using errcode = '22023';
  end if;
  insert into crm_auto_replies (staff_id, settings) values (v_me, p_settings)
  on conflict (staff_id) do update set settings = excluded.settings, updated_at = now();
  return p_settings;
end $$;

create or replace function public.crm_seen_notifications()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_me uuid := crm_me();
begin
  if v_me is null then perform crm_deny('read notifications'); end if;
  insert into crm_staff_prefs (staff_id, notifs_seen_at) values (v_me, now())
  on conflict (staff_id) do update set notifs_seen_at = now();
  return now();
end $$;

-- ─── Share and Move ───────────────────────────────────────────────────────
-- Share: anyone in the sender's own team (the Boss / HOD: anyone), as an
-- invitation. Move: to the sender's direct superior only. The receiver
-- accepts or declines; nothing changes until they accept.
create or replace function public.crm_team_of(p_staff uuid)
returns uuid language sql stable security definer set search_path = public as $$
  -- The TL at or above them in the reporting line (the team is the TL's).
  with recursive up as (
    select s.id, s.reports_to, 0 as depth from hr_staff_costs s where s.id = p_staff
    union all
    select s.id, s.reports_to, up.depth + 1 from hr_staff_costs s join up on s.id = up.reports_to where up.depth < 12
  )
  select up.id from up where crm_role_of(up.id) = 'tl' order by up.depth limit 1
$$;
revoke all on function public.crm_team_of(uuid) from public, anon, authenticated;

create or replace function public.crm_invite(p_kind text, p_contact uuid, p_to uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
    select reports_to into v_up from hr_staff_costs where id = v_me;
    if v_up is null or p_to <> v_up then raise exception 'A customer moves to your direct superior only.' using errcode = '22023'; end if;
  else
    v_team := crm_team_of(v_me);
    if not crm_sees_all() and (v_team is null or crm_team_of(p_to) is distinct from v_team)
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
end $$;

create or replace function public.crm_answer_invite(p_invite uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := crm_me();
  r    crm_invites;
  c    crm_contacts;
begin
  select * into r from crm_invites where id = p_invite;
  if r.id is null or r.to_staff <> v_me then perform crm_deny('answer this invitation'); end if;
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
end $$;

-- ─── Replies: the quoted message, templates, reactions ────────────────────
create or replace function public.crm_record_out(p_contact uuid, p_external_id text, p_kind text, p_body text, p_reply_to uuid default null, p_card jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me  uuid := crm_me();
  v_row crm_messages;
begin
  if not crm_can_reply(p_contact) then raise exception 'You may not reply to this customer.' using errcode = '42501'; end if;
  if coalesce(trim(p_external_id), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'A reply needs Meta''s message id and its text.' using errcode = '22023';
  end if;
  if p_kind not in ('text', 'template', 'image', 'document') then raise exception 'Unknown message kind.' using errcode = '22023'; end if;
  if p_reply_to is not null and not exists (select 1 from crm_messages where id = p_reply_to and contact_id = p_contact) then
    raise exception 'That message is not in this chat.' using errcode = '22023';
  end if;
  if p_card is not null and (jsonb_typeof(p_card) <> 'object' or (p_card ->> 'kind') not in ('Confirmed', 'Updated', 'Cancelled', 'Reminder')) then
    raise exception 'That visit card is not valid.' using errcode = '22023';
  end if;
  insert into crm_messages (contact_id, external_id, direction, kind, body, status, sent_by, sent_at, reply_to, card)
  values (p_contact, p_external_id, 'out', p_kind, p_body, coalesce(crm_early_status(p_external_id), 'sent'), v_me, now(), p_reply_to, p_card)
  on conflict (external_id) do nothing
  returning * into v_row;
  update crm_contacts
     set last_reply_at = now(),
         status = case when status = 'new' then 'follow_up' else status end,
         unread = case when assigned_to = v_me then 0 else unread end
   where id = p_contact;
  return to_jsonb(v_row);
end $$;

create or replace function public.crm_set_reaction(p_message uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare v_contact uuid;
begin
  select contact_id into v_contact from crm_messages where id = p_message;
  if v_contact is null or not crm_can_reply(v_contact) then perform crm_deny('react to this message'); end if;
  update crm_messages set my_reaction = nullif(trim(coalesce(p_emoji, '')), '') where id = p_message;
end $$;

-- How many are booked in each slot of a showroom: Book visit greys a full one.
-- Counts only — a salesperson never reads someone else's appointment.
create or replace function public.crm_slot_counts(p_showroom text, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, booked integer) language sql stable security definer set search_path = public as $$
  select a.start_at, count(*)::int from crm_appointments a
   where crm_my_role() is not null and a.showroom = p_showroom and a.state = 'booked'
     and a.start_at >= p_from and a.start_at < p_to and p_to - p_from <= interval '400 days'
   group by a.start_at
$$;

-- ─── Showrooms, whole (Profile › Showrooms) ───────────────────────────────
create or replace function public.crm_save_showroom_full(p_id text, p_name text, p_address text, p_slots text[],
  p_cap integer, p_weekly integer[], p_blocks jsonb, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r crm_showrooms;
begin
  if coalesce(crm_my_role(), '') not in ('boss', 'hod') then perform crm_deny('change the showrooms'); end if;
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
end $$;

-- ─── Who may call what ────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'crm_visit_outcome(uuid, boolean, text, numeric, text, text)', 'crm_mark_reminded(uuid)',
    'crm_save_details(uuid, text, text, text, text, text, text, text)',
    'crm_set_pref(uuid, boolean, boolean, boolean, boolean, uuid, boolean)', 'crm_hide_message(uuid)',
    'crm_save_labels(jsonb)', 'crm_set_label(uuid, uuid, boolean)', 'crm_save_quick_replies(jsonb)',
    'crm_save_auto_replies(jsonb)', 'crm_seen_notifications()', 'crm_invite(text, uuid, uuid)',
    'crm_answer_invite(uuid, boolean)', 'crm_record_out(uuid, text, text, text, uuid, jsonb)', 'crm_slot_counts(text, timestamptz, timestamptz)', 'crm_set_reaction(uuid, text)',
    'crm_save_showroom_full(text, text, text, text[], integer, integer[], jsonb, boolean)',
    'crm_book(uuid, text, timestamptz, integer)', 'crm_move_appointment(uuid, timestamptz, text)',
    'crm_set_appointment_state(uuid, text)', 'crm_can_reply(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.crm_contacts_status_event() from public, anon, authenticated;

-- ─── The audit register (mig 20261008190000) ──────────────────────────────
SELECT public.audit_register('crm_contact_prefs', 'CRM chat preferences', 'Member services', '{}', 'none',
  p_reason => 'Each person''s own pins, mutes and hidden chats — their view, not a record.');
SELECT public.audit_register('crm_message_hides', 'CRM messages deleted for me', 'Member services', '{}', 'none',
  p_reason => 'Each person''s own view of a chat; the message itself stays.');
SELECT public.audit_register('crm_labels', 'CRM labels', 'Member services', '{}', 'none',
  p_reason => 'Each person''s own labels — their view, not a record.');
SELECT public.audit_register('crm_contact_labels', 'CRM labels on customers', 'Member services', '{}', 'none',
  p_reason => 'Each person''s own labels — their view, not a record.');
SELECT public.audit_register('crm_quick_replies', 'CRM quick replies', 'Member services', '{}', 'none',
  p_reason => 'Each person''s own saved messages.');
SELECT public.audit_register('crm_auto_replies', 'CRM auto-replies', 'Member services', '{revenue}', 'people',
  p_keys => '{staff_id}');
SELECT public.audit_register('crm_staff_prefs', 'CRM notification reads', 'Member services', '{}', 'none',
  p_reason => 'When each person last opened their notifications.');
SELECT public.audit_register('crm_invites', 'CRM share and move invitations', 'Member services', '{}', 'none',
  p_reason => 'The invitation and its answer are a record already (who, when, accepted or declined), with crm_events.');
SELECT public.audit_register('crm_contact_shares', 'CRM shared chats', 'Member services', '{revenue}', 'people',
  p_keys => '{contact_id,staff_id}');
SELECT public.audit_register('crm_events', 'CRM events', 'Member services', '{}', 'none',
  p_reason => 'The CRM''s own log of Won, Lost, moved and shared — a record already.');

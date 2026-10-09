-- CRM, the team layer and the read path (2026-10-02).
--
-- The reporting line agreed with the Boss: Boss -> HOD -> Senior TL -> TL ->
-- TA -> RS. Who is which comes from a person's TITLE through crm_role_map,
-- filled in later in Settings (no code change when titles change). Who
-- reports to whom is People › Hierarchy: hr_staff_costs.reports_to.
--
-- Who sees what (src/lib/member/crm-team.ts is the twin; keep them in step):
--   - everyone sees themselves and their whole downline, never a peer;
--   - the Boss and the HOD see every customer, including those no team took;
--   - a TL (and anyone above) also sees their team's enquiries still waiting
--     to be assigned.
-- Reads open through row level security on these rules. Writes stay closed:
-- they arrive as functions of their own, each checking who may do it.
--
-- Add-only. New tables and functions; two new columns on crm_contacts (a CRM
-- table). Nothing outside the crm_* tables is changed.

-- ── Who is who ──────────────────────────────────────────────────────────────

-- A title's CRM role. Empty until the owner maps the titles; until then nobody
-- has a role, so nobody but the service role reads a customer.
create table if not exists public.crm_role_map (
  title_id   uuid primary key references public.titles(id) on delete cascade,
  crm_role   text not null check (crm_role in ('boss', 'hod', 'stl', 'tl', 'ta', 'rs')),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

-- Per person, CRM-only facts. full_time: takes Friday–Sunday enquiries (the HOD's call).
create table if not exists public.crm_staff (
  staff_id   uuid primary key references public.hr_staff_costs(id) on delete cascade,
  full_time  boolean not null default false,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

-- ── How enquiries are dealt ─────────────────────────────────────────────────

-- Mode 1: an ad handed to TLs; its enquiries rotate evenly among their teams.
create table if not exists public.crm_assign_rules (
  ad_source_id text primary key,       -- the Meta ad id from the click-to-chat referral
  ad_label     text,
  tl_ids       uuid[] not null default '{}',
  updated_by   uuid references public.users(id),
  updated_at   timestamptz not null default now()
);

-- Per team (keyed by its TL): Mode 2's share between teams, and who in the team.
create table if not exists public.crm_team_settings (
  tl_id      uuid primary key references public.hr_staff_costs(id) on delete cascade,
  team_share integer not null default 0 check (team_share between 0 and 100),
  weekday    text not null default 'manual' check (weekday in ('auto', 'manual')),
  ratios     jsonb not null default '{}'::jsonb,   -- staff id -> % for Mon–Thu "auto"
  edited_by  uuid references public.hr_staff_costs(id),  -- who last changed it (a TL sees when the Boss/HOD did)
  edited_at  timestamptz
);

-- ── Customers: the team an enquiry went to, and what is unread ──────────────

alter table public.crm_contacts add column if not exists team_id uuid references public.hr_staff_costs(id);
alter table public.crm_contacts add column if not exists unread  integer not null default 0;
create index if not exists crm_contacts_team_idx on public.crm_contacts (team_id);

-- Appointments at a showroom. Only the salesperson (or an upline who replies) books, moves or cancels.
create table if not exists public.crm_appointments (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  showroom   text not null,
  start_at   timestamptz not null,
  minutes    integer not null default 60 check (minutes > 0),
  state      text not null default 'booked' check (state in ('booked', 'attended', 'cancelled')),
  created_by uuid references public.hr_staff_costs(id),
  created_at timestamptz not null default now()
);
create index if not exists crm_appointments_contact_idx on public.crm_appointments (contact_id);
create index if not exists crm_appointments_start_idx on public.crm_appointments (start_at);

-- ── The rules, as functions every policy uses ───────────────────────────────

-- The signed-in person's staff row (null when the login is not linked to one).
create or replace function public.crm_me() returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from users u join hr_staff_costs s on s.user_id = u.id
   where u.id = auth.uid() and u.is_active and s.status = 'active'
   limit 1
$$;

-- A person's CRM role, from their title.
create or replace function public.crm_role_of(p_staff uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.crm_role from hr_staff_costs s join crm_role_map m on m.title_id = s.title_id where s.id = p_staff
$$;

-- A person and everyone below them, at any depth (People › Hierarchy).
create or replace function public.crm_downline(p_staff uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive line(id, depth) as (
    select p_staff, 0 where p_staff is not null
    union
    select s.id, l.depth + 1 from hr_staff_costs s join line l on s.reports_to = l.id
     where l.depth < 20 and s.status = 'active'
  )
  select id from line
$$;

-- Boss and HOD: every customer, every setting.
create or replace function public.crm_sees_all() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(crm_role_of(crm_me()) in ('boss', 'hod'), false)
$$;

-- Whether the signed-in person may open this customer.
create or replace function public.crm_can_see(p_assigned uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when crm_me() is null or crm_role_of(crm_me()) is null then false
    when crm_sees_all() then true
    when p_assigned is not null then p_assigned in (select crm_downline(crm_me()))
    when p_team is not null then p_team in (select crm_downline(crm_me()))
    else false
  end
$$;

revoke all on function public.crm_me(), public.crm_role_of(uuid), public.crm_downline(uuid),
  public.crm_sees_all(), public.crm_can_see(uuid, uuid) from public, anon;
grant execute on function public.crm_me(), public.crm_role_of(uuid), public.crm_downline(uuid),
  public.crm_sees_all(), public.crm_can_see(uuid, uuid) to authenticated, service_role;

-- ── Reads open, on those rules ──────────────────────────────────────────────

alter table public.crm_role_map      enable row level security;
alter table public.crm_staff         enable row level security;
alter table public.crm_assign_rules  enable row level security;
alter table public.crm_team_settings enable row level security;
alter table public.crm_appointments  enable row level security;
revoke all on public.crm_role_map, public.crm_staff, public.crm_assign_rules,
  public.crm_team_settings, public.crm_appointments from anon, authenticated;

grant select on public.crm_contacts, public.crm_messages, public.crm_appointments,
  public.crm_role_map, public.crm_staff, public.crm_assign_rules, public.crm_team_settings to authenticated;

drop policy if exists crm_contacts_read on public.crm_contacts;
create policy crm_contacts_read on public.crm_contacts for select to authenticated
  using (public.crm_can_see(assigned_to, team_id));

drop policy if exists crm_messages_read on public.crm_messages;
create policy crm_messages_read on public.crm_messages for select to authenticated
  using (exists (select 1 from public.crm_contacts c where c.id = contact_id and public.crm_can_see(c.assigned_to, c.team_id)));

drop policy if exists crm_appointments_read on public.crm_appointments;
create policy crm_appointments_read on public.crm_appointments for select to authenticated
  using (exists (select 1 from public.crm_contacts c where c.id = contact_id and public.crm_can_see(c.assigned_to, c.team_id)));

-- Anyone with a CRM role may read the title map (it is how the app knows your role).
drop policy if exists crm_role_map_read on public.crm_role_map;
create policy crm_role_map_read on public.crm_role_map for select to authenticated
  using (public.crm_role_of(public.crm_me()) is not null);

-- Full time: for the people you can see.
drop policy if exists crm_staff_read on public.crm_staff;
create policy crm_staff_read on public.crm_staff for select to authenticated
  using (public.crm_sees_all() or staff_id in (select public.crm_downline(public.crm_me())));

-- Ad rules: the Boss and HOD set them; a TL sees the ones that name their team.
drop policy if exists crm_assign_rules_read on public.crm_assign_rules;
create policy crm_assign_rules_read on public.crm_assign_rules for select to authenticated
  using (public.crm_sees_all() or exists (select 1 from unnest(tl_ids) t where t in (select public.crm_downline(public.crm_me()))));

-- A team's settings: the Boss and HOD all; a TL their own (and a Senior TL those below).
drop policy if exists crm_team_settings_read on public.crm_team_settings;
create policy crm_team_settings_read on public.crm_team_settings for select to authenticated
  using (public.crm_sees_all() or tl_id in (select public.crm_downline(public.crm_me())));

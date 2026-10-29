-- A partner's booking link (the owner, 2026-10-29: "做一个外部的预约链接，主要这个链接是要让 the conts 内部业务去预约 showroom，
-- 这个预约会自动链接到 crm 的日历 … 2 个 slot 满了之后，crm 也无法再预约 … date, time, showroom, remarks, 业务自己的 note
-- remark … customer info … 不需要 attend key 的照片，desktop 版，并且他们不需要登入到 crm 里面"; asked, chose: the booking only
-- takes its slot in the calendar — no CRM customer is made; one company link, each booker types their own name; a booking
-- may be changed or cancelled through the link with its reference).
--
--   crm_partner_links      one row a partner (The Conts first), its link code (pc-XXXXXXXX), on or off. CRM · Manage reads
--                          it (crm_partner_links_read) and sets it (crm_partner_link_set); nobody reads or writes the table.
--   crm_partner_bookings   what came in through a link: showroom, start, the booker, the customer, the remarks and the
--                          booker's own note; a reference (TC-XXXXXX) the booker changes or cancels it by. Read by anybody in
--                          the CRM (it is on the calendar); written only through the functions below.
--   crm_partner_page / _day / _book / _get / _cancel   the public page /b/<code>: granted to anon BY NAME (as the guest
--                          link's), each asking the link's CODE (the partner's, its link on) — no session, no service role.
--                          At most 60 bookings and changes an hour come in through the links.
--   crm_slot_check, crm_slot_counts   rebuilt from production's bodies (md5 9326cca5…, 284d182f…): a showroom's per-slot
--                          limit counts the partner's bookings beside the CRM's own, both ways.
--   crm_partner_booking_cancel   CRM · Manage cancels one from the CRM.

create table if not exists public.crm_partner_links (
  id text primary key,
  name text not null,
  code text not null unique,
  is_on boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
-- RLS on and no policy: the code is read through crm_partner_links_read() (CRM · Manage).
alter table public.crm_partner_links enable row level security;
revoke all on public.crm_partner_links from anon, authenticated;

create table if not exists public.crm_partner_bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  partner text not null references public.crm_partner_links(id),
  showroom text not null,
  start_at timestamptz not null,
  minutes integer not null default 60,
  state text not null default 'booked' check (state in ('booked', 'cancelled')),
  booker_name text not null,
  booker_phone text not null default '',
  customer_name text not null,
  customer_phone text not null default '',
  info jsonb not null default '{}'::jsonb,
  remarks text not null default '',
  booker_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_by text
);
create index if not exists crm_partner_bookings_slot on public.crm_partner_bookings (showroom, start_at) where state = 'booked';
alter table public.crm_partner_bookings enable row level security;
revoke all on public.crm_partner_bookings from anon, authenticated;
grant select on public.crm_partner_bookings to authenticated;
drop policy if exists crm_partner_bookings_read on public.crm_partner_bookings;
create policy crm_partner_bookings_read on public.crm_partner_bookings for select to authenticated
  using ((select crm_me()) is not null);

-- 8 of 32 letters and digits (no 0 / 1 / I / O), as the guest link's.
create or replace function public.crm_partner_token(p_len integer)
returns text language plpgsql volatile set search_path = public as $$
declare v text := ''; a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  for i in 1..p_len loop v := v || substr(a, 1 + floor(random() * 32)::int, 1); end loop;
  return v;
end $$;
revoke execute on function public.crm_partner_token(integer) from public, anon, authenticated;
grant execute on function public.crm_partner_token(integer) to service_role;

insert into public.crm_partner_links (id, name, code, is_on)
values ('the_conts', 'The Conts', 'pc-' || public.crm_partner_token(8), false)
on conflict (id) do nothing;

-- ── The slot's limit counts both (from production's bodies) ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_slot_check(p_showroom text, p_start timestamp with time zone, p_except uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     or exists (select 1 from jsonb_array_elements(r.blocks) b
                 where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a')
                   and coalesce(jsonb_array_length(case when jsonb_typeof(b -> 'ranges') = 'array' then b -> 'ranges' end), 0) = 0
                   and (coalesce(b ->> 't1', '') = '' or coalesce(b ->> 't2', '') = '')) then
    raise exception '% is closed that day.', r.name using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(r.blocks) b,
               lateral (select g ->> 'f' as f, g ->> 't' as t
                          from jsonb_array_elements(case when jsonb_typeof(b -> 'ranges') = 'array' then b -> 'ranges' else '[]'::jsonb end) g
                        union all
                        select b ->> 't1', b ->> 't2' where coalesce(b ->> 't1', '') <> '' and coalesce(b ->> 't2', '') <> '') w
              where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a') and v_hhmm >= w.f and v_hhmm < w.t) then
    raise exception '% is closed at that time.', r.name using errcode = '22023';
  end if;
  if not exists (select 1 from unnest(r.slots) s
                  where split_part(s, '@', 1) = v_hhmm
                    and (position('@' in s) = 0 or position(v_mon0 in split_part(s, '@', 2)) > 0)) then
    raise exception '% does not take bookings at that time.', r.name using errcode = '22023';
  end if;
  select count(*) into v_taken from crm_appointments
   where showroom = r.id and start_at = p_start and state = 'booked' and id is distinct from p_except;
  -- A partner's bookings take their slots too (mig 20261029190000).
  v_taken := v_taken + (select count(*) from crm_partner_bookings
   where showroom = r.id and start_at = p_start and state = 'booked' and id is distinct from p_except);
  if v_taken >= r.cap then raise exception 'That time is full at %. Choose another.', r.name using errcode = '22023'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_slot_counts(p_showroom text, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(start_at timestamp with time zone, booked integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select x.start_at, count(*)::int from (
    select a.start_at from crm_appointments a
     where crm_my_role() is not null and a.showroom = p_showroom and a.state = 'booked'
       and a.start_at >= p_from and a.start_at < p_to and p_to - p_from <= interval '400 days'
    union all
    -- A partner's bookings (mig 20261029190000).
    select b.start_at from crm_partner_bookings b
     where crm_my_role() is not null and b.showroom = p_showroom and b.state = 'booked'
       and b.start_at >= p_from and b.start_at < p_to and p_to - p_from <= interval '400 days'
  ) x
   group by x.start_at
$function$;

-- ── The public page's functions ────────────────────────────────────────────────────────────────────────────────────────

-- The partner a code opens, or nothing (a wrong code, an old one, the link off).
create or replace function public.crm_partner_of(p_code text)
returns crm_partner_links language plpgsql stable security definer set search_path = public as $$
declare r crm_partner_links;
begin
  if p_code is null or p_code !~ '^pc-[A-HJ-NP-Z2-9]{8}$' then return null; end if;
  select * into r from crm_partner_links where code = p_code and is_on;
  return r;
end $$;
revoke execute on function public.crm_partner_of(text) from public, anon, authenticated;
grant execute on function public.crm_partner_of(text) to service_role;

create or replace function public.crm_partner_booking_json(b crm_partner_bookings)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ref', b.ref, 'showroom', b.showroom, 'showroomName', (select name from crm_showrooms where id = b.showroom),
    'start', b.start_at, 'minutes', b.minutes, 'state', b.state, 'booker', b.booker_name, 'bookerPhone', b.booker_phone,
    'customer', b.customer_name, 'customerPhone', b.customer_phone, 'info', b.info, 'remarks', b.remarks, 'note', b.booker_note)
$$;
revoke execute on function public.crm_partner_booking_json(crm_partner_bookings) from public, anon, authenticated;
grant execute on function public.crm_partner_booking_json(crm_partner_bookings) to service_role;

-- What /b/<code> draws: the partner's name, today (the office's), the open showrooms with their times, limits and closures.
create or replace function public.crm_partner_page(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p crm_partner_links := crm_partner_of(p_code);
begin
  if p.id is null then return jsonb_build_object('on', false); end if;
  return jsonb_build_object('on', true, 'name', p.name, 'today', to_char((now() at time zone 'Asia/Kuala_Lumpur')::date, 'YYYY-MM-DD'),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'address', coalesce(r.address, ''), 'slots', to_jsonb(r.slots),
        'cap', r.cap, 'weekly', to_jsonb(r.weekly), 'blocks', coalesce(r.blocks, '[]'::jsonb)) order by r.sort_order)
      from crm_showrooms r where r.active and r.deleted_at is null), '[]'::jsonb));
end $$;

-- How many are booked at each start of a showroom over some days (counts only — whose, never).
create or replace function public.crm_partner_day(p_code text, p_showroom text, p_from date, p_days integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p crm_partner_links := crm_partner_of(p_code); v_a timestamptz; v_b timestamptz;
begin
  if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  if p_from is null or p_days is null or p_days < 1 or p_days > 62 then raise exception 'Pick a day.' using errcode = '22023'; end if;
  v_a := p_from::timestamp at time zone 'Asia/Kuala_Lumpur'; v_b := (p_from + p_days)::timestamp at time zone 'Asia/Kuala_Lumpur';
  return coalesce((select jsonb_agg(jsonb_build_object('start', x.start_at, 'booked', x.n)) from (
    select s.start_at, count(*)::int n from (
      select a.start_at from crm_appointments a where a.showroom = p_showroom and a.state = 'booked' and a.start_at >= v_a and a.start_at < v_b
      union all
      select b.start_at from crm_partner_bookings b where b.showroom = p_showroom and b.state = 'booked' and b.start_at >= v_a and b.start_at < v_b
    ) s group by s.start_at) x), '[]'::jsonb);
end $$;

-- Book a slot, or (with its reference) change one booked through the link. The CRM's own rules decide (crm_slot_check).
create or replace function public.crm_partner_book(p_code text, p_ref text, p_showroom text, p_start timestamptz,
  p_booker text, p_booker_phone text, p_customer text, p_customer_phone text, p_info jsonb, p_remarks text, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p crm_partner_links := crm_partner_of(p_code); b crm_partner_bookings; v_ref text; v_info jsonb := '{}'::jsonb; k text;
begin
  if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  if (select count(*) from crm_partner_bookings where updated_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many bookings through the link just now. Try again later.';
  end if;
  if length(btrim(coalesce(p_booker, ''))) not between 1 and 80 then raise exception 'Type your name.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_customer, ''))) not between 1 and 80 then raise exception 'Type the customer''s name.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_customer_phone, ''))) not between 6 and 30 or btrim(p_customer_phone) !~ '^[0-9 +()-]+$' then
    raise exception 'Type the customer''s phone number.' using errcode = '22023';
  end if;
  if length(coalesce(p_booker_phone, '')) > 30 or length(coalesce(p_remarks, '')) > 1000 or length(coalesce(p_note, '')) > 1000 then
    raise exception 'A field is too long.' using errcode = '22023';
  end if;
  if p_start is null or p_start <= now() then raise exception 'Pick a time still to come.' using errcode = '22023'; end if;
  if p_start > now() + interval '120 days' then raise exception 'Book within the next 120 days.' using errcode = '22023'; end if;
  -- The customer's info: the page's own keys, short text only.
  if jsonb_typeof(p_info) = 'object' then
    for k in select unnest(array['project', 'unit', 'type', 'size', 'pax', 'budget']) loop
      if coalesce(p_info ->> k, '') <> '' then v_info := v_info || jsonb_build_object(k, left(btrim(p_info ->> k), 120)); end if;
    end loop;
  end if;
  if p_ref is not null then
    select * into b from crm_partner_bookings where ref = upper(btrim(p_ref)) and partner = p.id for update;
    if b.id is null or b.state <> 'booked' then raise exception 'This booking is no longer there.' using errcode = '42501'; end if;
    if b.start_at <= now() then raise exception 'This visit has already started; it cannot be changed here.' using errcode = '22023'; end if;
  end if;
  -- One booking at a time for a slot, so two at once cannot both take its last place.
  perform pg_advisory_xact_lock(hashtext('crm-slot:' || coalesce(trim(p_showroom), '') || ':' || p_start::text));
  perform crm_slot_check(p_showroom, p_start, b.id);
  if b.id is null then
    loop
      v_ref := 'TC-' || crm_partner_token(6);
      exit when not exists (select 1 from crm_partner_bookings where ref = v_ref);
    end loop;
    insert into crm_partner_bookings (ref, partner, showroom, start_at, booker_name, booker_phone, customer_name, customer_phone, info, remarks, booker_note)
    values (v_ref, p.id, trim(p_showroom), p_start, btrim(p_booker), btrim(coalesce(p_booker_phone, '')), btrim(p_customer), btrim(p_customer_phone),
      v_info, btrim(coalesce(p_remarks, '')), btrim(coalesce(p_note, '')))
    returning * into b;
  else
    update crm_partner_bookings set showroom = trim(p_showroom), start_at = p_start, booker_name = btrim(p_booker), booker_phone = btrim(coalesce(p_booker_phone, '')),
      customer_name = btrim(p_customer), customer_phone = btrim(p_customer_phone), info = v_info, remarks = btrim(coalesce(p_remarks, '')),
      booker_note = btrim(coalesce(p_note, '')), updated_at = now()
     where id = b.id returning * into b;
  end if;
  return crm_partner_booking_json(b);
end $$;

-- A booking by its reference (to change or cancel it).
create or replace function public.crm_partner_get(p_code text, p_ref text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p crm_partner_links := crm_partner_of(p_code); b crm_partner_bookings;
begin
  if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  select * into b from crm_partner_bookings where ref = upper(btrim(coalesce(p_ref, ''))) and partner = p.id;
  if b.id is null then raise exception 'No booking has that reference.' using errcode = '42501'; end if;
  return crm_partner_booking_json(b);
end $$;

create or replace function public.crm_partner_cancel(p_code text, p_ref text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p crm_partner_links := crm_partner_of(p_code); b crm_partner_bookings;
begin
  if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  if (select count(*) from crm_partner_bookings where updated_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many bookings through the link just now. Try again later.';
  end if;
  select * into b from crm_partner_bookings where ref = upper(btrim(coalesce(p_ref, ''))) and partner = p.id for update;
  if b.id is null or b.state <> 'booked' then raise exception 'This booking is no longer there.' using errcode = '42501'; end if;
  if b.start_at <= now() then raise exception 'This visit has already started; it cannot be cancelled here.' using errcode = '22023'; end if;
  update crm_partner_bookings set state = 'cancelled', cancelled_by = 'link', updated_at = now() where id = b.id returning * into b;
  return crm_partner_booking_json(b);
end $$;

revoke execute on function public.crm_partner_page(text) from public;
revoke execute on function public.crm_partner_day(text, text, date, integer) from public;
revoke execute on function public.crm_partner_book(text, text, text, timestamptz, text, text, text, text, jsonb, text, text) from public;
revoke execute on function public.crm_partner_get(text, text) from public;
revoke execute on function public.crm_partner_cancel(text, text) from public;
grant execute on function public.crm_partner_page(text) to anon, authenticated;
grant execute on function public.crm_partner_day(text, text, date, integer) to anon, authenticated;
grant execute on function public.crm_partner_book(text, text, text, timestamptz, text, text, text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.crm_partner_get(text, text) to anon, authenticated;
grant execute on function public.crm_partner_cancel(text, text) to anon, authenticated;

-- ── The CRM's side (CRM · Manage) ──────────────────────────────────────────────────────────────────────────────────────

-- Turn a partner's link on or off; p_new_code gives it a new address (the old one stops opening).
create or replace function public.crm_partner_link_set(p_id text, p_on boolean, p_new_code boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r crm_partner_links;
begin
  if not crm_manages() then perform crm_deny('change the booking link'); end if;
  update crm_partner_links set is_on = coalesce(p_on, is_on),
    code = case when coalesce(p_new_code, false) then 'pc-' || crm_partner_token(8) else code end,
    updated_at = now(), updated_by = auth.uid()
   where id = p_id returning * into r;
  if r.id is null then raise exception 'No such booking link.' using errcode = '22023'; end if;
  return jsonb_build_object('id', r.id, 'name', r.name, 'code', r.code, 'on', r.is_on);
end $$;

-- The links with their codes, for CRM · Manage; nothing for anybody else.
create or replace function public.crm_partner_links_read()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not crm_manages() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'code', code, 'on', is_on) order by name) from crm_partner_links), '[]'::jsonb);
end $$;
revoke execute on function public.crm_partner_links_read() from public, anon;
grant execute on function public.crm_partner_links_read() to authenticated;

create or replace function public.crm_partner_booking_cancel(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not crm_manages() then perform crm_deny('cancel a partner''s booking'); end if;
  update crm_partner_bookings set state = 'cancelled', cancelled_by = 'crm', updated_at = now() where id = p_id and state = 'booked';
  if not found then raise exception 'That booking is no longer there.' using errcode = '22023'; end if;
end $$;

revoke execute on function public.crm_partner_link_set(text, boolean, boolean) from public, anon;
revoke execute on function public.crm_partner_booking_cancel(uuid) from public, anon;
grant execute on function public.crm_partner_link_set(text, boolean, boolean) to authenticated;
grant execute on function public.crm_partner_booking_cancel(uuid) to authenticated;

SELECT public.audit_register('crm_partner_links', 'CRM partner booking links', 'Member services', '{revenue,crm_manage}', 'people');
SELECT public.audit_register('crm_partner_bookings', 'CRM partner bookings', 'Member services', '{revenue,crm_manage}', 'all');

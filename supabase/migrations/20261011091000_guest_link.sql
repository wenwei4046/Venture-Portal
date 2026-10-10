-- ============================================================================
-- 20261011091000_guest_link.sql
-- Admin › Guest Link and the public page /g/<code> (2026-10-11, the HR
-- revamp's second package — README sections 15–16, `Revenue App.dc.html`
-- lines 940–977, `Guest Booking.dc.html`). One link for subsidiary staff with
-- no portal account: book a meeting room and see the schedule, on a phone or
-- a computer, no sign-in. (Request manpower, the link's third part, lands with
-- the Hiring module's guest door — the `hiring` switch is kept here already.)
-- ============================================================================
--
-- The link starts OFF (the user): nobody can open it until HR turns it on. Its
-- CODE is the only key — every guest function is handed it and answers only
-- while the link is on, the code is the current one and the part asked for is
-- open; otherwise the page reads "This link is closed". New link makes a new
-- code and the old one stops working. Codes are `hv-` + 8 letters and digits
-- (no 0/O/1/I): about 10^12 of them, so one cannot be guessed.
--
-- The guest functions are SECURITY DEFINER and granted to anon BY NAME — the
-- publishable key reaches these four and nothing else here; no service role
-- is involved. Each one checks the code itself.
--
-- WHAT A GUEST MAY TOUCH (the user, 2026-10-11: "can set hq de 不给 guest
-- edit 就好"): any booking made through the link — change it or cancel it,
-- giving their name for the trail — and never one made in the portal or an
-- app. The schedule shows every room's meetings, HQ's too (the prototype).
--
-- The subsidiaries are the link's OWN list: seeded once from Finance's
-- companies, then HR's to edit — `companies` is never written. A booking keeps
-- the company and department as picked; its code follows the subsidiary.

-- ── The link (one row) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guest_link (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_on       boolean NOT NULL DEFAULT false,
  code        text NOT NULL CHECK (code ~ '^hv-[A-HJ-NP-Z2-9]{8}$'),
  -- The parts: Book a meeting room (+ the schedule), Request manpower.
  booking     boolean NOT NULL DEFAULT true,
  hiring      boolean NOT NULL DEFAULT true,
  -- Guests can book today and the next days_ahead − 1 days.
  days_ahead  integer NOT NULL DEFAULT 14 CHECK (days_ahead BETWEEN 1 AND 21),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid DEFAULT auth.uid()
);

COMMENT ON TABLE public.guest_link IS
  'Admin › Guest Link (2026-10-11): the one public link for subsidiary staff. Read and written only through the guest_link_* functions.';

-- A fresh code: 8 of 32 letters and digits, from two random UUIDs' random bytes.
CREATE OR REPLACE FUNCTION public.guest_link_make_code()
RETURNS text
LANGUAGE plpgsql VOLATILE
SET search_path = public
AS $fn$
DECLARE
  v_abc  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_raw  bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  v_code text := 'hv-';
BEGIN
  FOR i IN 0..7 LOOP
    v_code := v_code || substr(v_abc, (get_byte(v_raw, i * 4) % 32) + 1, 1);
  END LOOP;
  RETURN v_code;
END
$fn$;

REVOKE ALL ON FUNCTION public.guest_link_make_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_make_code() TO service_role;

INSERT INTO public.guest_link (id, code) VALUES (1, public.guest_link_make_code()) ON CONFLICT (id) DO NOTHING;

-- ── The subsidiaries guests pick from ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guest_link_subsidiaries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Up to three letters or digits, shown on the schedule (HR fills them in).
  code        text NOT NULL DEFAULT '' CHECK (code ~ '^[A-Z0-9]{0,3}$'),
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 120),
  departments text[] NOT NULL DEFAULT '{}',
  sort_order  integer NOT NULL DEFAULT 0,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.guest_link_subsidiaries IS
  'Admin › Guest Link (2026-10-11): the companies a guest picks, each with its departments — the link''s own list, seeded once from companies.';

-- Seeded once from Finance's companies (the user: the subsidiaries are the 8
-- companies Finance keeps); the codes start as their short codes, cut to three.
INSERT INTO public.guest_link_subsidiaries (code, name, sort_order)
SELECT left(regexp_replace(upper(coalesce(c.short_code, '')), '[^A-Z0-9]', '', 'g'), 3), btrim(c.name),
       row_number() OVER (ORDER BY lower(c.name))
  FROM public.companies c
 WHERE c.is_active AND btrim(coalesce(c.name, '')) <> ''
   AND NOT EXISTS (SELECT 1 FROM public.guest_link_subsidiaries);

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_room_bookings_guest_subsidiary') THEN
    ALTER TABLE public.meeting_room_bookings
      ADD CONSTRAINT meeting_room_bookings_guest_subsidiary
      FOREIGN KEY (guest_subsidiary_id) REFERENCES public.guest_link_subsidiaries(id);
  END IF;
END
$fk$;

ALTER TABLE public.guest_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_link_subsidiaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_link, public.guest_link_subsidiaries FROM anon, authenticated;

SELECT public.audit_register('guest_link', 'Guest link', 'Settings', '{guest_link}', 'all',
  p_labels => '{code}');
SELECT public.audit_register('guest_link_subsidiaries', 'Guest link subsidiaries', 'Settings', '{guest_link}', 'all',
  p_labels => '{code,name}');

-- ── The door: the link, when p_code opens p_part ────────────────────────────
-- p_part: 'page' (the link is on), 'booking' (and Book a meeting room is on),
-- 'hiring' (and Request manpower is on). No row when it does not open.

CREATE OR REPLACE FUNCTION public.guest_link_open(p_code text, p_part text)
RETURNS SETOF public.guest_link
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT g.* FROM public.guest_link g
   WHERE g.id = 1 AND g.is_on AND p_code IS NOT NULL AND g.code = p_code
     AND (p_part = 'page' OR (p_part = 'booking' AND g.booking) OR (p_part = 'hiring' AND g.hiring))
$fn$;

REVOKE ALL ON FUNCTION public.guest_link_open(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_open(text, text) TO service_role;

-- A room as the guest page reads it.
CREATE OR REPLACE FUNCTION public.guest_link_room_json(p_room public.meeting_rooms)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object('id', p_room.id, 'name', p_room.name, 'seats', p_room.seats,
    'location', p_room.location, 'facilities', p_room.facilities)
$fn$;

REVOKE ALL ON FUNCTION public.guest_link_room_json(public.meeting_rooms) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_room_json(public.meeting_rooms) TO service_role;

-- ── The guest page (anon) ───────────────────────────────────────────────────

-- What the page draws: closed, or the parts that are open, the days, the rooms
-- guests may book, every room (the schedule) and the subsidiaries.
CREATE OR REPLACE FUNCTION public.guest_link_page(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g       public.guest_link%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  SELECT * INTO g FROM public.guest_link_open(p_code, 'page');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('on', false);
  END IF;
  RETURN jsonb_build_object(
    'on', true,
    'booking', g.booking,
    -- Request manpower opens with the Hiring module's guest door.
    'hiring', false,
    'days', g.days_ahead,
    'today', v_today,
    'rooms', coalesce((SELECT jsonb_agg(public.guest_link_room_json(r) ORDER BY r.sort_order, r.name)
                         FROM public.meeting_rooms r
                        WHERE r.deleted_at IS NULL AND r.bookable AND r.guest_bookable), '[]'::jsonb),
    'allRooms', coalesce((SELECT jsonb_agg(public.guest_link_room_json(r) ORDER BY r.sort_order, r.name)
                            FROM public.meeting_rooms r
                           WHERE r.deleted_at IS NULL AND r.bookable), '[]'::jsonb),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name,
                               'departments', to_jsonb(s.departments)) ORDER BY s.sort_order, s.name)
                        FROM public.guest_link_subsidiaries s WHERE s.deleted_at IS NULL), '[]'::jsonb));
END
$fn$;

-- One day's meetings in every bookable room — what the Book step blocks and
-- the schedule draws. A guest-link booking says so (`guest`): those are the
-- ones a guest may change.
CREATE OR REPLACE FUNCTION public.guest_link_day(p_code text, p_day date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g       public.guest_link%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  SELECT * INTO g FROM public.guest_link_open(p_code, 'booking');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;
  IF p_day IS NULL OR p_day < v_today OR p_day >= v_today + g.days_ahead THEN
    RAISE EXCEPTION 'Pick a day in the next % days.', g.days_ahead;
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', b.id, 'ref', CASE WHEN b.source = 'guest' THEN b.ref END, 'room', b.room_id, 'day', b.day,
             'from', b.start_min, 'to', b.end_min, 'title', b.title, 'guest', b.source = 'guest',
             'code', CASE WHEN b.source = 'guest' THEN coalesce(b.guest_code, '') END,
             'company', CASE WHEN b.source = 'guest' THEN b.guest_company END,
             'subsidiary', CASE WHEN b.source = 'guest' THEN b.guest_subsidiary_id END,
             'department', CASE WHEN b.source = 'guest' THEN b.guest_department ELSE d.name END,
             'subDepartment', CASE WHEN b.source = 'guest' THEN NULL ELSE sd.name END,
             'by', b.booked_by_name, 'pax', b.pax) ORDER BY b.start_min, r.sort_order, r.name)
      FROM public.meeting_room_bookings b
      JOIN public.meeting_rooms r ON r.id = b.room_id AND r.deleted_at IS NULL AND r.bookable
      LEFT JOIN public.departments d ON d.id = b.department_id
      LEFT JOIN public.comm_sub_departments sd ON sd.id = b.sub_department_id
     WHERE b.day = p_day AND b.cancelled_at IS NULL), '[]'::jsonb);
END
$fn$;

-- Book (p_id NULL) or change a booking made through the link (p_id, with the
-- name of whoever changes it). Everything is checked here; the overlap is the
-- table's own last word.
CREATE OR REPLACE FUNCTION public.guest_link_book(
  p_code        text,
  p_id          uuid,
  p_room        uuid,
  p_day         date,
  p_from        integer,
  p_to          integer,
  p_title       text,
  p_subsidiary  uuid,
  p_department  text,
  p_name        text,
  p_pax         integer,
  p_actor       text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g        public.guest_link%ROWTYPE;
  v_today  date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_old    public.meeting_room_bookings%ROWTYPE;
  v_room   public.meeting_rooms%ROWTYPE;
  v_sub    public.guest_link_subsidiaries%ROWTYPE;
  v_title  text := btrim(coalesce(p_title, ''));
  v_name   text := btrim(coalesce(p_name, ''));
  v_dept   text := btrim(coalesce(p_department, ''));
  v_actor  text := btrim(coalesce(p_actor, ''));
  v_miss   text[] := '{}';
  v_id     uuid;
  v_ref    text;
  v_hm     text;
BEGIN
  SELECT * INTO g FROM public.guest_link_open(p_code, 'booking');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.meeting_room_bookings WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_old.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'This booking is no longer there.';
    END IF;
    IF v_old.source IS DISTINCT FROM 'guest' THEN
      RAISE EXCEPTION 'Only bookings made through this link can be changed here.' USING ERRCODE = '42501';
    END IF;
    IF v_old.day < v_today THEN
      RAISE EXCEPTION 'This meeting has passed.';
    END IF;
    IF v_actor = '' THEN RAISE EXCEPTION 'Type your name first.'; END IF;
    IF length(v_actor) > 80 THEN RAISE EXCEPTION 'Keep your name under 80 characters.'; END IF;
  END IF;

  -- What is missing, in the page's words: "Add company, your name."
  SELECT * INTO v_sub FROM public.guest_link_subsidiaries WHERE id = p_subsidiary AND deleted_at IS NULL;
  IF NOT FOUND THEN
    v_miss := v_miss || 'company'::text;
    IF v_dept = '' THEN v_miss := v_miss || 'department'::text; END IF;
  ELSIF cardinality(v_sub.departments) > 0 AND NOT (v_dept = ANY (v_sub.departments)) THEN v_miss := v_miss || 'department'::text;
  END IF;
  IF v_name = '' THEN v_miss := v_miss || 'your name'::text; END IF;
  IF p_room IS NULL OR p_day IS NULL OR p_from IS NULL OR p_to IS NULL THEN v_miss := v_miss || 'a time slot'::text; END IF;
  IF v_title = '' THEN v_miss := v_miss || 'a meeting title'::text; END IF;
  IF cardinality(v_miss) > 0 THEN
    RAISE EXCEPTION 'Add %.', array_to_string(v_miss, ', ');
  END IF;
  IF length(v_name) > 80 THEN RAISE EXCEPTION 'Keep your name under 80 characters.'; END IF;
  IF length(v_title) > 120 THEN RAISE EXCEPTION 'Keep the title under 120 characters.'; END IF;
  IF cardinality(v_sub.departments) = 0 THEN v_dept := ''; END IF;

  IF p_day < v_today OR p_day >= v_today + g.days_ahead THEN
    RAISE EXCEPTION 'Pick a day in the next % days.', g.days_ahead;
  END IF;
  IF p_to <= p_from OR p_from < 480 OR p_to > 1200 OR p_from % 30 <> 0 OR p_to % 30 <> 0 THEN
    RAISE EXCEPTION 'Pick a time between 08:00 and 20:00, in half hours.';
  END IF;

  SELECT * INTO v_room FROM public.meeting_rooms
   WHERE id = p_room AND deleted_at IS NULL AND bookable AND guest_bookable;
  IF NOT FOUND THEN RAISE EXCEPTION 'That room is not open for guest booking.'; END IF;
  IF p_pax IS NULL OR p_pax < 1 OR p_pax > 99 THEN RAISE EXCEPTION 'Say how many people, 1 to 99.'; END IF;
  IF v_room.seats > 0 AND p_pax > v_room.seats THEN
    RAISE EXCEPTION '% seats %. Pick a bigger room or fewer people.', v_room.name, v_room.seats;
  END IF;

  IF EXISTS (SELECT 1 FROM public.meeting_room_bookings b
              WHERE b.room_id = p_room AND b.day = p_day AND b.cancelled_at IS NULL AND b.id IS DISTINCT FROM p_id
                AND b.start_min < p_to AND p_from < b.end_min) THEN
    RAISE EXCEPTION 'Someone just took that slot. Pick another time.';
  END IF;

  v_hm := to_char(make_time(p_from / 60, p_from % 60, 0), 'HH24:MI') || '–' || to_char(make_time(p_to / 60, p_to % 60, 0), 'HH24:MI');
  BEGIN
    IF p_id IS NULL THEN
      v_ref := 'BK-G' || nextval('public.meeting_room_booking_ref_seq');
      INSERT INTO public.meeting_room_bookings (ref, room_id, day, start_min, end_min, title, source, booked_by_name, pax,
        guest_subsidiary_id, guest_company, guest_department, guest_code)
      VALUES (v_ref, p_room, p_day, p_from, p_to, v_title, 'guest', v_name, p_pax,
        v_sub.id, v_sub.name, nullif(v_dept, ''), v_sub.code)
      RETURNING id INTO v_id;
      INSERT INTO public.meeting_room_booking_events (booking_id, what, actor_name, note)
      VALUES (v_id, 'Booked via guest link', v_name, concat_ws(' · ', v_sub.name, nullif(v_dept, ''), p_pax || ' pax'));
    ELSE
      v_id := p_id;
      v_ref := v_old.ref;
      UPDATE public.meeting_room_bookings
         SET room_id = p_room, day = p_day, start_min = p_from, end_min = p_to, title = v_title, pax = p_pax,
             booked_by_name = v_name, guest_subsidiary_id = v_sub.id, guest_company = v_sub.name,
             guest_department = nullif(v_dept, ''), guest_code = v_sub.code, updated_at = now()
       WHERE id = p_id;
      INSERT INTO public.meeting_room_booking_events (booking_id, what, actor_name, note)
      VALUES (v_id, 'Edited via guest link', v_actor, v_room.name || ' · ' || v_hm);
    END IF;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Someone just took that slot. Pick another time.';
  END;

  RETURN jsonb_build_object('id', v_id, 'ref', v_ref, 'room', v_room.id, 'roomName', v_room.name, 'day', p_day,
    'from', p_from, 'to', p_to, 'title', v_title, 'pax', p_pax, 'company', v_sub.name,
    'department', nullif(v_dept, ''), 'name', v_name);
END
$fn$;

-- Cancel a booking made through the link, with the name of whoever cancels it.
CREATE OR REPLACE FUNCTION public.guest_link_cancel(p_code text, p_id uuid, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g       public.guest_link%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_b     public.meeting_room_bookings%ROWTYPE;
  v_actor text := btrim(coalesce(p_actor, ''));
BEGIN
  SELECT * INTO g FROM public.guest_link_open(p_code, 'booking');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This link is closed.' USING ERRCODE = '42501';
  END IF;
  IF v_actor = '' THEN RAISE EXCEPTION 'Type your name first.'; END IF;
  IF length(v_actor) > 80 THEN RAISE EXCEPTION 'Keep your name under 80 characters.'; END IF;
  SELECT * INTO v_b FROM public.meeting_room_bookings WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_b.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This booking is no longer there.';
  END IF;
  IF v_b.source IS DISTINCT FROM 'guest' THEN
    RAISE EXCEPTION 'Only bookings made through this link can be cancelled here.' USING ERRCODE = '42501';
  END IF;
  IF v_b.day < v_today THEN
    RAISE EXCEPTION 'This meeting has passed.';
  END IF;
  UPDATE public.meeting_room_bookings
     SET cancelled_at = now(), cancelled_by_name = v_actor, updated_at = now()
   WHERE id = p_id;
  INSERT INTO public.meeting_room_booking_events (booking_id, what, actor_name, note)
  VALUES (p_id, 'Cancelled via guest link', v_actor, '');
  RETURN jsonb_build_object('id', p_id, 'ref', v_b.ref, 'title', v_b.title);
END
$fn$;

-- ── Admin › Guest Link (Guest link · View / Edit) ───────────────────────────

-- The page: the link, its parts and days, the rooms (Rooms guests can book),
-- the subsidiaries, the upcoming bookings made through it (each as the
-- Meeting Rooms drawer reads it) and whether this reader may change any of it.
CREATE OR REPLACE FUNCTION public.guest_link_admin()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g       public.guest_link%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_ids   uuid[];
  v_hires integer;
BEGIN
  IF NOT public.has_any_action(ARRAY['guest_link.view']) THEN
    RAISE EXCEPTION 'The guest link needs Guest link · View.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO g FROM public.guest_link WHERE id = 1;
  SELECT coalesce(array_agg(b.id), '{}') INTO v_ids
    FROM public.meeting_room_bookings b
   WHERE b.source = 'guest' AND b.cancelled_at IS NULL AND b.day >= v_today;
  -- Requests that came in through the link (the Hiring module's, once it is there).
  IF to_regclass('public.hiring_requests') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::int FROM public.hiring_requests WHERE source = ''guest''' INTO v_hires;
  END IF;
  RETURN jsonb_build_object(
    'on', g.is_on, 'code', g.code, 'booking', g.booking, 'hiring', g.hiring, 'days', g.days_ahead, 'today', v_today,
    'canEdit', public.has_any_action(ARRAY['guest_link.edit']),
    'rooms', coalesce((SELECT jsonb_agg(public.meeting_rooms_room_json(r) ORDER BY r.sort_order, r.name)
                         FROM public.meeting_rooms r WHERE r.deleted_at IS NULL AND r.bookable), '[]'::jsonb),
    'subs', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name,
                               'departments', to_jsonb(s.departments)) ORDER BY s.sort_order, s.name)
                        FROM public.guest_link_subsidiaries s WHERE s.deleted_at IS NULL), '[]'::jsonb),
    'bookings', CASE WHEN cardinality(v_ids) = 0 THEN '[]'::jsonb ELSE coalesce((
                  SELECT jsonb_agg(x) FROM public.meeting_rooms_rows(NULL, NULL, v_ids, true,
                    public.has_any_action(ARRAY['rooms.edit'])) x), '[]'::jsonb) END,
    'hires', coalesce(v_hires, 0));
END
$fn$;

-- Turn the link on or off, a part on or off, the days ahead — each NULL kept.
CREATE OR REPLACE FUNCTION public.guest_link_set(p_on boolean, p_booking boolean, p_hiring boolean, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  g public.guest_link%ROWTYPE;
BEGIN
  IF NOT public.has_any_action(ARRAY['guest_link.edit']) THEN
    RAISE EXCEPTION 'Changing the guest link needs Guest link · Edit.' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 21) THEN
    RAISE EXCEPTION 'Guests can book 1 to 21 days ahead.';
  END IF;
  UPDATE public.guest_link
     SET is_on = coalesce(p_on, is_on), booking = coalesce(p_booking, booking), hiring = coalesce(p_hiring, hiring),
         days_ahead = coalesce(p_days, days_ahead), updated_at = now(), updated_by = auth.uid()
   WHERE id = 1
  RETURNING * INTO g;
  RETURN jsonb_build_object('on', g.is_on, 'code', g.code, 'booking', g.booking, 'hiring', g.hiring, 'days', g.days_ahead);
END
$fn$;

-- New link: a new code; the old one stops working at once.
CREATE OR REPLACE FUNCTION public.guest_link_new_code()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code text := public.guest_link_make_code();
BEGIN
  IF NOT public.has_any_action(ARRAY['guest_link.edit']) THEN
    RAISE EXCEPTION 'Changing the guest link needs Guest link · Edit.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.guest_link SET code = v_code, updated_at = now(), updated_by = auth.uid() WHERE id = 1;
  RETURN jsonb_build_object('code', v_code);
END
$fn$;

-- Rooms guests can book: one switch per bookable room.
CREATE OR REPLACE FUNCTION public.guest_link_room(p_room uuid, p_on boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_room public.meeting_rooms%ROWTYPE;
BEGIN
  IF NOT public.has_any_action(ARRAY['guest_link.edit']) THEN
    RAISE EXCEPTION 'Changing the guest link needs Guest link · Edit.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.meeting_rooms SET guest_bookable = coalesce(p_on, false), updated_at = now()
   WHERE id = p_room AND deleted_at IS NULL AND bookable
  RETURNING * INTO v_room;
  IF v_room.id IS NULL THEN RAISE EXCEPTION 'That room is no longer open for booking.'; END IF;
  RETURN public.meeting_rooms_room_json(v_room);
END
$fn$;

-- Add a subsidiary (p_id NULL: "New subsidiary") or change one — its code,
-- name and departments. A code change follows its bookings onto the schedule.
CREATE OR REPLACE FUNCTION public.guest_link_save_subsidiary(p_id uuid, p_code text, p_name text, p_departments text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_name  text := btrim(coalesce(p_name, ''));
  v_depts text[];
  v_row   public.guest_link_subsidiaries%ROWTYPE;
BEGIN
  IF NOT public.has_any_action(ARRAY['guest_link.edit']) THEN
    RAISE EXCEPTION 'Changing the guest link needs Guest link · Edit.' USING ERRCODE = '42501';
  END IF;
  IF v_code !~ '^[A-Z0-9]{0,3}$' THEN RAISE EXCEPTION 'A code is up to three letters or digits.'; END IF;
  IF p_id IS NULL AND v_name = '' THEN v_name := 'New subsidiary'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Give the subsidiary a name.'; END IF;
  IF length(v_name) > 120 THEN RAISE EXCEPTION 'Keep the name under 120 characters.'; END IF;
  SELECT coalesce(array_agg(x.d ORDER BY x.o), '{}') INTO v_depts
    FROM (SELECT DISTINCT ON (lower(btrim(u.d))) btrim(u.d) AS d, u.o
            FROM unnest(coalesce(p_departments, '{}'::text[])) WITH ORDINALITY AS u(d, o)
           WHERE btrim(coalesce(u.d, '')) <> ''
           ORDER BY lower(btrim(u.d)), u.o) x;
  IF cardinality(v_depts) > 40 THEN RAISE EXCEPTION 'Keep it to 40 departments.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_depts) d WHERE length(d) > 60) THEN
    RAISE EXCEPTION 'Keep a department under 60 characters.';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.guest_link_subsidiaries (code, name, departments, sort_order)
    VALUES (v_code, v_name, v_depts, coalesce((SELECT max(sort_order) + 1 FROM public.guest_link_subsidiaries), 1))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.guest_link_subsidiaries
       SET code = v_code, name = v_name, departments = v_depts, updated_at = now()
     WHERE id = p_id AND deleted_at IS NULL
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'That subsidiary is no longer there.'; END IF;
    UPDATE public.meeting_room_bookings SET guest_code = v_code
     WHERE guest_subsidiary_id = p_id AND guest_code IS DISTINCT FROM v_code;
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'code', v_row.code, 'name', v_row.name, 'departments', to_jsonb(v_row.departments));
END
$fn$;

-- Remove a subsidiary from the list (its bookings keep their company).
CREATE OR REPLACE FUNCTION public.guest_link_remove_subsidiary(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.guest_link_subsidiaries%ROWTYPE;
BEGIN
  IF NOT public.has_any_action(ARRAY['guest_link.edit']) THEN
    RAISE EXCEPTION 'Changing the guest link needs Guest link · Edit.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.guest_link_subsidiaries SET deleted_at = now(), updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'That subsidiary is no longer there.'; END IF;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name);
END
$fn$;

-- The schedule's legend: each subsidiary with a code (Meeting Rooms, the apps).
CREATE OR REPLACE FUNCTION public.guest_link_legend()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.view', 'revenue_app.view:own']) THEN
    RAISE EXCEPTION 'The meeting rooms need Meeting rooms · View.' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('code', s.code, 'name', s.name) ORDER BY s.sort_order, s.name)
                     FROM public.guest_link_subsidiaries s WHERE s.deleted_at IS NULL AND s.code <> ''), '[]'::jsonb);
END
$fn$;

-- ── Who may call them ───────────────────────────────────────────────────────
-- The guest page's four: anybody holding the link (the publishable key), BY
-- NAME — each checks the code. The rest: signed-in sessions, each asking its cell.

REVOKE ALL ON FUNCTION public.guest_link_page(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_link_day(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_link_book(text, uuid, uuid, date, integer, integer, text, uuid, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guest_link_cancel(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_link_page(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_day(text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_book(text, uuid, uuid, date, integer, integer, text, uuid, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_cancel(text, uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.guest_link_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guest_link_set(boolean, boolean, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guest_link_new_code() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guest_link_room(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guest_link_save_subsidiary(uuid, text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guest_link_remove_subsidiary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guest_link_legend() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guest_link_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_set(boolean, boolean, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_new_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_room(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_save_subsidiary(uuid, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_remove_subsidiary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guest_link_legend() TO authenticated;

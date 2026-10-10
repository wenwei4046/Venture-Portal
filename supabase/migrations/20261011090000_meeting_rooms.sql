-- ============================================================================
-- 20261011090000_meeting_rooms.sql
-- Admin › Meeting Rooms (2026-10-11, the HR revamp's second package — README
-- section 14, `Revenue App.dc.html` lines 890–938 and the two drawers at
-- 1284–1332). Every view books a room (the user: "can add on at every view,
-- hr principal, finance as well"); the rooms themselves are Meeting rooms ·
-- Edit's. The rooms start EMPTY — HR adds them on the Rooms tab.
-- ============================================================================
--
-- Three tables, RLS on and NO policy: nothing reads or writes them straight.
-- Every read and write is one of the functions below, SECURITY DEFINER, each
-- asking has_any_action() for its cell (mig 20261011060000):
--   rooms.view    meeting_rooms_range(from, to), meeting_rooms_booking(id),
--                 meeting_rooms_rooms(), meeting_rooms_people()
--   rooms.create  meeting_rooms_book(...)   — book, or change your own booking
--                 meeting_rooms_cancel(id)  — cancel your own booking
--   rooms.edit    meeting_rooms_save_room(...), meeting_rooms_delete_room(id),
--                 and cancelling / changing a booking made through the guest
--                 link (the prototype's admin)
-- A Revenue app member (Revenue app · View, their own) reads the schedule and
-- books for themselves from the app (p_source 'app', a Revenue
-- sub-department) — the same functions, so the portal, the Revenue app and
-- the HR app share one schedule.
-- WHOSE booking it is (the user, 2026-10-11: "谁订、谁下的 meeting 谁就可以直接
-- 取消"): the account that placed it, or the person it was booked for when
-- that person signs in. A guest-link booking belongs to no account: the guest
-- link changes it (next migration), and so may Meeting rooms · Edit.
--
-- A booking is one room, one office day, whole half hours between 08:00 and
-- 20:00 (the schedule's grid). Two live bookings of one room never overlap —
-- refused by the database itself (exclusion constraint), so two people
-- pressing Book on the same slot cannot both have it. `source` says where it
-- was made: the portal, the Revenue app, the HR app or the guest link — the
-- same table serves all four.

-- ── The rooms ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_rooms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  seats          integer NOT NULL DEFAULT 6 CHECK (seats BETWEEN 0 AND 999),
  location       text NOT NULL DEFAULT '' CHECK (length(location) <= 80),
  facilities     text NOT NULL DEFAULT '' CHECK (length(facilities) <= 120),
  -- Off = kept, but off the schedule and the booking forms.
  bookable       boolean NOT NULL DEFAULT true,
  -- The guest link may book it (Admin › Guest Link › Rooms guests can book).
  guest_bookable boolean NOT NULL DEFAULT false,
  sort_order     integer NOT NULL DEFAULT 0,
  -- Removed rooms are kept for their bookings' history.
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid DEFAULT auth.uid(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meeting_rooms IS
  'Admin › Meeting Rooms (2026-10-11): the bookable rooms. Read and written only through the meeting_rooms_* functions.';

-- ── The bookings ────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.meeting_room_booking_ref_seq START 301;

CREATE TABLE IF NOT EXISTS public.meeting_room_bookings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- BK-301 (BK-G… from the guest link): the reference people read out.
  ref                 text NOT NULL UNIQUE,
  room_id             uuid NOT NULL REFERENCES public.meeting_rooms(id),
  day                 date NOT NULL,
  -- Minutes from midnight, whole half hours, 08:00–20:00.
  start_min           integer NOT NULL,
  end_min             integer NOT NULL,
  title               text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 120),
  source              text NOT NULL CHECK (source IN ('portal', 'app', 'hr_app', 'guest')),
  -- HQ: the department it is booked from (a Revenue sub-department from the Revenue app).
  department_id       uuid REFERENCES public.departments(id),
  sub_department_id   uuid REFERENCES public.comm_sub_departments(id),
  -- The account that placed it (none from the guest link), and the person it is for.
  booked_by_user      uuid REFERENCES public.users(id),
  booked_by_staff     uuid REFERENCES public.hr_staff_costs(id),
  booked_by_name      text NOT NULL,
  -- Who attends: colleagues (staff ids, in the order added) and named outsiders.
  internal_staff      uuid[] NOT NULL DEFAULT '{}',
  external_guests     jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(external_guests) = 'array'),
  -- Total headcount: never fewer than the named attendees, may be more.
  pax                 integer NOT NULL CHECK (pax BETWEEN 1 AND 999),
  -- From the guest link: the subsidiary and its department as picked (kept as written).
  guest_subsidiary_id uuid,
  guest_company       text,
  guest_department    text,
  guest_code          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  cancelled_at        timestamptz,
  cancelled_by_user   uuid,
  cancelled_by_name   text,
  CONSTRAINT meeting_room_bookings_half_hours CHECK (
    start_min >= 480 AND end_min <= 1200 AND start_min < end_min AND start_min % 30 = 0 AND end_min % 30 = 0),
  CONSTRAINT meeting_room_bookings_who CHECK (
    (source = 'guest' AND guest_company IS NOT NULL) OR (source <> 'guest' AND booked_by_user IS NOT NULL)),
  CONSTRAINT meeting_room_bookings_no_overlap EXCLUDE USING gist (
    room_id WITH =, day WITH =, int4range(start_min, end_min) WITH &&
  ) WHERE (cancelled_at IS NULL)
);

CREATE INDEX IF NOT EXISTS meeting_room_bookings_day ON public.meeting_room_bookings (day) WHERE cancelled_at IS NULL;

COMMENT ON TABLE public.meeting_room_bookings IS
  'Admin › Meeting Rooms (2026-10-11): one room, one office day, half hours 08:00–20:00. Live bookings of a room never overlap (exclusion constraint). source = portal / app / hr_app / guest.';

-- ── Each booking's trail (the drawer's Audit trail) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_room_booking_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id  uuid NOT NULL REFERENCES public.meeting_room_bookings(id) ON DELETE CASCADE,
  at          timestamptz NOT NULL DEFAULT now(),
  what        text NOT NULL,
  actor_name  text NOT NULL,
  actor_user  uuid,
  note        text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS meeting_room_booking_events_booking ON public.meeting_room_booking_events (booking_id, at);

ALTER TABLE public.meeting_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_room_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_room_booking_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meeting_rooms, public.meeting_room_bookings, public.meeting_room_booking_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.meeting_room_booking_ref_seq FROM anon, authenticated;

SELECT public.audit_register('meeting_rooms', 'Meeting rooms', 'Settings', '{meeting_rooms_manage}', 'all',
  p_labels => '{name}');
SELECT public.audit_register('meeting_room_bookings', 'Meeting room bookings', 'Settings', '{meeting_rooms_manage}', 'all',
  p_labels => '{ref,title,day}');
SELECT public.audit_register('meeting_room_booking_events', 'Meeting room booking trail', 'Settings', '{}', 'none',
  p_reason => 'Each booking''s own trail, written by the booking functions beside the booking (which is recorded).');

-- ── The rows as the pages read them (one query per read, never per row) ─────

CREATE OR REPLACE FUNCTION public.meeting_rooms_rows(p_from date, p_to date, p_ids uuid[], p_events boolean, p_admin boolean)
RETURNS SETOF jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'id', b.id, 'ref', b.ref, 'room', b.room_id, 'roomName', r.name, 'day', b.day,
    'from', b.start_min, 'to', b.end_min, 'title', b.title, 'source', b.source,
    'departmentId', b.department_id, 'department', d.name, 'subDepartment', sd.name,
    'bookedBy', b.booked_by_name, 'bookedByStaff', b.booked_by_staff,
    -- Theirs: the account that placed it, or the person it is for (signed in as themselves).
    'mine', b.source <> 'guest' AND (b.booked_by_user = auth.uid() OR (bs.user_id IS NOT NULL AND bs.user_id = auth.uid())),
    -- What they may change or cancel: their own, and — Meeting rooms · Edit — a guest-link booking.
    'canChange', (b.source <> 'guest' AND (b.booked_by_user = auth.uid() OR (bs.user_id IS NOT NULL AND bs.user_id = auth.uid())))
                 OR (b.source = 'guest' AND p_admin),
    'internal', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'department', sdep.name) ORDER BY x.ord)
        FROM unnest(b.internal_staff) WITH ORDINALITY AS x(sid, ord)
        JOIN public.hr_staff_costs s ON s.id = x.sid
        LEFT JOIN public.departments sdep ON sdep.id = s.department_id), '[]'::jsonb),
    'guests', b.external_guests, 'pax', b.pax,
    'guestCompany', b.guest_company, 'guestDepartment', b.guest_department, 'guestCode', b.guest_code,
    'cancelled', b.cancelled_at IS NOT NULL,
    'events', CASE WHEN p_events THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('what', e.what, 'at', e.at, 'who', e.actor_name, 'note', e.note) ORDER BY e.at, e.id)
        FROM public.meeting_room_booking_events e WHERE e.booking_id = b.id), '[]'::jsonb) ELSE '[]'::jsonb END)
  FROM public.meeting_room_bookings b
  JOIN public.meeting_rooms r ON r.id = b.room_id
  LEFT JOIN public.departments d ON d.id = b.department_id
  LEFT JOIN public.comm_sub_departments sd ON sd.id = b.sub_department_id
  LEFT JOIN public.hr_staff_costs bs ON bs.id = b.booked_by_staff
  WHERE (p_ids IS NOT NULL AND b.id = ANY (p_ids))
     OR (p_ids IS NULL AND b.cancelled_at IS NULL AND b.day BETWEEN p_from AND p_to)
  ORDER BY b.day, b.start_min, r.sort_order, r.name
$fn$;

REVOKE ALL ON FUNCTION public.meeting_rooms_rows(date, date, uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_rows(date, date, uuid[], boolean, boolean) TO service_role;

-- A room as the pages read it.
CREATE OR REPLACE FUNCTION public.meeting_rooms_room_json(p_room public.meeting_rooms)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object('id', p_room.id, 'name', p_room.name, 'seats', p_room.seats, 'location', p_room.location,
    'facilities', p_room.facilities, 'bookable', p_room.bookable, 'guestBookable', p_room.guest_bookable)
$fn$;

REVOKE ALL ON FUNCTION public.meeting_rooms_room_json(public.meeting_rooms) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_room_json(public.meeting_rooms) TO service_role;

-- ── Readers ─────────────────────────────────────────────────────────────────
-- Meeting rooms · View — or a Revenue app member (Revenue app · View, their
-- own), who reads the schedule and books from the app.

-- The bookable rooms and the live bookings from p_from to p_to (at most 62
-- days), each with its trail: the portal's Schedule reads one day, the phone
-- apps a few.
CREATE OR REPLACE FUNCTION public.meeting_rooms_range(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.view', 'revenue_app.view:own']) THEN
    RAISE EXCEPTION 'The meeting rooms need Meeting rooms · View.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
    RAISE EXCEPTION 'Ask for at most 62 days of bookings.';
  END IF;
  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'rooms', coalesce((SELECT jsonb_agg(public.meeting_rooms_room_json(r) ORDER BY r.sort_order, r.name)
                         FROM public.meeting_rooms r WHERE r.deleted_at IS NULL AND r.bookable), '[]'::jsonb),
    'bookings', coalesce((SELECT jsonb_agg(x)
                            FROM public.meeting_rooms_rows(p_from, p_to, NULL, true, public.has_any_action(ARRAY['rooms.edit'])) x), '[]'::jsonb));
END
$fn$;

-- One booking with its trail (a link to it, the Guest Link page's Open).
CREATE OR REPLACE FUNCTION public.meeting_rooms_booking(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.view', 'revenue_app.view:own']) THEN
    RAISE EXCEPTION 'The meeting rooms need Meeting rooms · View.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT x FROM public.meeting_rooms_rows(NULL, NULL, ARRAY[p_id], true, public.has_any_action(ARRAY['rooms.edit'])) x LIMIT 1);
END
$fn$;

-- The Rooms tab: every room kept (bookable or not), with how many live bookings it has from today on.
CREATE OR REPLACE FUNCTION public.meeting_rooms_rooms()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.view']) THEN
    RAISE EXCEPTION 'The meeting rooms need Meeting rooms · View.' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(public.meeting_rooms_room_json(r) || jsonb_build_object('upcoming', (
             SELECT count(*) FROM public.meeting_room_bookings b
              WHERE b.room_id = r.id AND b.cancelled_at IS NULL AND b.day >= v_today)) ORDER BY r.sort_order, r.name)
      FROM public.meeting_rooms r WHERE r.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- Who may be picked: everybody working (Booked by, Attending), the departments
-- they work in, the Revenue sub-departments (the Revenue app books from one),
-- and who is asking (their own record, if they have one).
CREATE OR REPLACE FUNCTION public.meeting_rooms_people()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      jsonb;
  v_account text;
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.view', 'revenue_app.view:own']) THEN
    RAISE EXCEPTION 'The meeting rooms need Meeting rooms · View.' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('staffId', s.id, 'name', s.employee_name, 'departmentId', s.department_id, 'department', d.name,
           'subDepartmentId', s.home_sub_department_id)
    INTO v_me
    FROM public.hr_staff_costs s LEFT JOIN public.departments d ON d.id = s.department_id
   WHERE s.user_id = auth.uid() AND s.status = 'active'
   ORDER BY s.created_at LIMIT 1;
  SELECT coalesce(nullif(btrim(u.name), ''), u.email) INTO v_account FROM public.users u WHERE u.id = auth.uid();
  RETURN jsonb_build_object(
    'me', v_me,
    'account', v_account,
    'canBook', public.has_any_action(ARRAY['rooms.create']),
    'canManage', public.has_any_action(ARRAY['rooms.edit']),
    'people', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'departmentId', s.department_id,
               'department', d.name, 'title', coalesce(t.name, s.designation)) ORDER BY lower(s.employee_name))
        FROM public.hr_staff_costs s
        LEFT JOIN public.departments d ON d.id = s.department_id
        LEFT JOIN public.titles t ON t.id = s.title_id
       WHERE s.status = 'active'), '[]'::jsonb),
    'departments', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) ORDER BY d.name)
        FROM public.departments d
       WHERE EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.department_id = d.id AND s.status = 'active')), '[]'::jsonb),
    'subDepartments', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', sd.id, 'name', sd.name, 'departmentId', sd.department_id) ORDER BY sd.created_at)
        FROM public.comm_sub_departments sd WHERE sd.is_active), '[]'::jsonb));
END
$fn$;

-- ── Booking ─────────────────────────────────────────────────────────────────

-- Book a room (p_id NULL), or change a booking (p_id): yours, or — with
-- Meeting rooms · Edit — one made through the guest link. From the portal or
-- the HR app: Meeting rooms · Create; from the Revenue app (p_source 'app'):
-- that, or Revenue app · View (their own), booked from a Revenue
-- sub-department. Everything is checked here, the overlap by the table itself.
CREATE OR REPLACE FUNCTION public.meeting_rooms_book(
  p_id              uuid,
  p_room            uuid,
  p_day             date,
  p_from            integer,
  p_to              integer,
  p_title           text,
  p_department      uuid,
  p_booked_by       uuid,
  p_internal        uuid[],
  p_guests          jsonb,
  p_pax             integer,
  p_source          text DEFAULT 'portal',
  p_sub_department  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today       date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_title       text := btrim(coalesce(p_title, ''));
  v_old         public.meeting_room_bookings%ROWTYPE;
  v_room        public.meeting_rooms%ROWTYPE;
  v_actor_name  text;
  v_actor_staff uuid;
  v_by_name     text;
  v_by_dept     uuid;
  v_by_user     uuid;
  v_dept        uuid;
  v_sub         uuid;
  v_internal    uuid[];
  v_guests      jsonb;
  v_named       integer;
  v_pax         integer;
  v_clash       record;
  v_id          uuid;
  v_ref         text;
  v_hm          text;
BEGIN
  IF p_source IS NULL OR p_source NOT IN ('portal', 'app', 'hr_app') THEN
    RAISE EXCEPTION 'A booking is made from the portal, the Revenue app or the HR app.';
  END IF;
  IF NOT public.has_any_action(CASE WHEN p_source = 'app' THEN ARRAY['rooms.create', 'revenue_app.view:own'] ELSE ARRAY['rooms.create'] END) THEN
    RAISE EXCEPTION 'Booking a room needs Meeting rooms · Create.' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.employee_name INTO v_actor_staff, v_actor_name
    FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' ORDER BY s.created_at LIMIT 1;
  IF v_actor_name IS NULL THEN
    SELECT coalesce(nullif(btrim(u.name), ''), u.email) INTO v_actor_name FROM public.users u WHERE u.id = auth.uid();
  END IF;
  IF v_actor_name IS NULL THEN
    RAISE EXCEPTION 'Sign in to book a room.' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.meeting_room_bookings WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_old.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'This booking is no longer there.';
    END IF;
    IF NOT (
      (v_old.source <> 'guest' AND (v_old.booked_by_user = auth.uid()
        OR EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = v_old.booked_by_staff AND s.user_id = auth.uid())))
      OR (v_old.source = 'guest' AND public.has_any_action(ARRAY['rooms.edit']))
    ) THEN
      RAISE EXCEPTION 'Only % can change this meeting.', v_old.booked_by_name USING ERRCODE = '42501';
    END IF;
    IF v_old.day < v_today THEN
      RAISE EXCEPTION 'This meeting has passed.';
    END IF;
  END IF;

  IF v_title = '' THEN RAISE EXCEPTION 'Add a meeting title.'; END IF;
  IF length(v_title) > 120 THEN RAISE EXCEPTION 'Keep the title under 120 characters.'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN RAISE EXCEPTION 'End time must be after the start.'; END IF;
  IF p_from < 480 OR p_to > 1200 OR p_from % 30 <> 0 OR p_to % 30 <> 0 THEN
    RAISE EXCEPTION 'Pick a time between 08:00 and 20:00, in half hours.';
  END IF;
  IF p_day IS NULL OR p_day < v_today THEN RAISE EXCEPTION 'Pick today or a day after it.'; END IF;

  SELECT * INTO v_room FROM public.meeting_rooms WHERE id = p_room AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pick a room.'; END IF;
  IF NOT v_room.bookable THEN RAISE EXCEPTION '% is not open for booking.', v_room.name; END IF;

  -- Who it is for: a person working here, or — when none is picked — the one booking.
  IF p_booked_by IS NOT NULL THEN
    SELECT s.employee_name, s.department_id, s.user_id INTO v_by_name, v_by_dept, v_by_user
      FROM public.hr_staff_costs s WHERE s.id = p_booked_by AND s.status = 'active';
    IF v_by_name IS NULL THEN RAISE EXCEPTION 'Pick who the meeting is booked by.'; END IF;
    -- From the Revenue app a member books for themselves only.
    IF p_source = 'app' AND NOT public.has_any_action(ARRAY['rooms.create']) AND p_booked_by IS DISTINCT FROM v_actor_staff THEN
      RAISE EXCEPTION 'From the Revenue app you book for yourself.' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_by_name := v_actor_name;
    SELECT s.department_id INTO v_by_dept FROM public.hr_staff_costs s WHERE s.id = v_actor_staff;
  END IF;
  IF p_sub_department IS NOT NULL THEN
    SELECT sd.id, sd.department_id INTO v_sub, v_dept FROM public.comm_sub_departments sd WHERE sd.id = p_sub_department;
    IF v_sub IS NULL THEN RAISE EXCEPTION 'Pick the department it is booked from.'; END IF;
  ELSE
    v_dept := coalesce(p_department, v_by_dept);
  END IF;
  IF v_dept IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = v_dept) THEN
    RAISE EXCEPTION 'Pick the department it is booked from.';
  END IF;

  -- Colleagues: people working here, each once, in the order added.
  SELECT coalesce(array_agg(x.sid ORDER BY x.ord), '{}') INTO v_internal
    FROM (SELECT DISTINCT ON (u.sid) u.sid, u.ord
            FROM unnest(coalesce(p_internal, '{}'::uuid[])) WITH ORDINALITY AS u(sid, ord)
           ORDER BY u.sid, u.ord) x
    JOIN public.hr_staff_costs s ON s.id = x.sid AND s.status = 'active';
  -- Outsiders: the named rows, trimmed.
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', left(btrim(g->>'name'), 80), 'company', left(btrim(coalesce(g->>'company', '')), 80)) ORDER BY o), '[]'::jsonb)
    INTO v_guests
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_guests) = 'array' THEN p_guests ELSE '[]'::jsonb END) WITH ORDINALITY AS e(g, o)
   WHERE jsonb_typeof(g) = 'object' AND btrim(coalesce(g->>'name', '')) <> '';
  IF jsonb_array_length(v_guests) > 50 THEN RAISE EXCEPTION 'Keep it to 50 outside guests.'; END IF;
  v_named := cardinality(v_internal) + jsonb_array_length(v_guests);
  IF v_named = 0 AND (p_id IS NULL OR v_old.source <> 'guest') THEN RAISE EXCEPTION 'Add who is attending.'; END IF;
  v_pax := greatest(v_named, coalesce(p_pax, 0), 1);
  IF v_pax > 999 THEN RAISE EXCEPTION 'That is more people than any room holds.'; END IF;

  -- The slot, in words — the exclusion constraint still decides a race.
  SELECT b.title, b.start_min, b.end_min INTO v_clash
    FROM public.meeting_room_bookings b
   WHERE b.room_id = p_room AND b.day = p_day AND b.cancelled_at IS NULL AND b.id IS DISTINCT FROM p_id
     AND b.start_min < p_to AND p_from < b.end_min
   ORDER BY b.start_min LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% is taken %–% by “%”.', v_room.name,
      to_char(make_time(v_clash.start_min / 60, v_clash.start_min % 60, 0), 'HH24:MI'),
      to_char(make_time(v_clash.end_min / 60, v_clash.end_min % 60, 0), 'HH24:MI'), v_clash.title;
  END IF;

  v_hm := to_char(make_time(p_from / 60, p_from % 60, 0), 'HH24:MI') || '–' || to_char(make_time(p_to / 60, p_to % 60, 0), 'HH24:MI');
  BEGIN
    IF p_id IS NULL THEN
      v_ref := 'BK-' || nextval('public.meeting_room_booking_ref_seq');
      INSERT INTO public.meeting_room_bookings (ref, room_id, day, start_min, end_min, title, source, department_id, sub_department_id,
        booked_by_user, booked_by_staff, booked_by_name, internal_staff, external_guests, pax)
      VALUES (v_ref, p_room, p_day, p_from, p_to, v_title, p_source, v_dept, v_sub,
        auth.uid(), p_booked_by, v_by_name, v_internal, v_guests, v_pax)
      RETURNING id INTO v_id;
      INSERT INTO public.meeting_room_booking_events (booking_id, what, actor_name, actor_user, note)
      VALUES (v_id, 'Booked', v_by_name, auth.uid(), concat_ws(' · ',
        CASE WHEN p_booked_by IS NOT NULL AND p_booked_by IS DISTINCT FROM v_actor_staff THEN 'Booked on their behalf by ' || v_actor_name END,
        CASE p_source WHEN 'app' THEN 'From the Revenue app' WHEN 'hr_app' THEN 'From the HR app' END));
    ELSE
      v_id := p_id;
      v_ref := v_old.ref;
      IF v_old.source = 'guest' THEN
        -- Changed by the admin: a guest booking keeps who booked it and from where.
        UPDATE public.meeting_room_bookings
           SET room_id = p_room, day = p_day, start_min = p_from, end_min = p_to, title = v_title, pax = v_pax, updated_at = now()
         WHERE id = p_id;
      ELSE
        UPDATE public.meeting_room_bookings
           SET room_id = p_room, day = p_day, start_min = p_from, end_min = p_to, title = v_title, department_id = v_dept,
               sub_department_id = v_sub, booked_by_staff = p_booked_by, booked_by_name = v_by_name, internal_staff = v_internal,
               external_guests = v_guests, pax = v_pax, updated_at = now()
         WHERE id = p_id;
      END IF;
      INSERT INTO public.meeting_room_booking_events (booking_id, what, actor_name, actor_user, note)
      VALUES (v_id, 'Edited', v_actor_name, auth.uid(), v_room.name || ' · ' || v_hm);
    END IF;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Someone just took that slot. Pick another time.';
  END;

  RETURN jsonb_build_object('id', v_id, 'ref', v_ref, 'room', v_room.name, 'time', v_hm, 'pax', v_pax);
END
$fn$;

-- Cancel: yours, or — with Meeting rooms · Edit — one made through the guest link.
CREATE OR REPLACE FUNCTION public.meeting_rooms_cancel(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today      date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_b          public.meeting_room_bookings%ROWTYPE;
  v_actor_name text;
  v_room       text;
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.create', 'rooms.edit', 'revenue_app.view:own']) THEN
    RAISE EXCEPTION 'Cancelling a meeting needs Meeting rooms · Create.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_b FROM public.meeting_room_bookings WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_b.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'This booking is no longer there.';
  END IF;
  IF NOT (
    (v_b.source <> 'guest' AND (v_b.booked_by_user = auth.uid()
      OR EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.id = v_b.booked_by_staff AND s.user_id = auth.uid())))
    OR (v_b.source = 'guest' AND public.has_any_action(ARRAY['rooms.edit']))
  ) THEN
    RAISE EXCEPTION 'Only % can cancel this meeting.', v_b.booked_by_name USING ERRCODE = '42501';
  END IF;
  IF v_b.day < v_today THEN
    RAISE EXCEPTION 'This meeting has passed.';
  END IF;
  SELECT s.employee_name INTO v_actor_name
    FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' ORDER BY s.created_at LIMIT 1;
  IF v_actor_name IS NULL THEN
    SELECT coalesce(nullif(btrim(u.name), ''), u.email) INTO v_actor_name FROM public.users u WHERE u.id = auth.uid();
  END IF;
  UPDATE public.meeting_room_bookings
     SET cancelled_at = now(), cancelled_by_user = auth.uid(), cancelled_by_name = v_actor_name, updated_at = now()
   WHERE id = p_id;
  INSERT INTO public.meeting_room_booking_events (booking_id, what, actor_name, actor_user, note)
  VALUES (p_id, 'Cancelled', coalesce(v_actor_name, 'Portal'), auth.uid(), CASE WHEN v_b.source = 'guest' THEN 'Cancelled by admin' ELSE '' END);
  SELECT r.name INTO v_room FROM public.meeting_rooms r WHERE r.id = v_b.room_id;
  RETURN jsonb_build_object('id', p_id, 'title', v_b.title, 'room', v_room);
END
$fn$;

-- ── The rooms themselves (rooms.edit) ───────────────────────────────────────

-- Add a room (p_id NULL) or change one.
CREATE OR REPLACE FUNCTION public.meeting_rooms_save_room(
  p_id         uuid,
  p_name       text,
  p_seats      integer,
  p_location   text,
  p_facilities text,
  p_bookable   boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.edit']) THEN
    RAISE EXCEPTION 'Changing the rooms needs Meeting rooms · Edit.' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Give the room a name.'; END IF;
  IF length(v_name) > 80 THEN RAISE EXCEPTION 'Keep the name under 80 characters.'; END IF;
  IF p_seats IS NULL OR p_seats < 0 OR p_seats > 999 THEN RAISE EXCEPTION 'Seats is a number from 0 to 999.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.meeting_rooms (name, seats, location, facilities, bookable, sort_order)
    VALUES (v_name, p_seats, left(btrim(coalesce(p_location, '')), 80), left(btrim(coalesce(p_facilities, '')), 120),
            coalesce(p_bookable, true), coalesce((SELECT max(sort_order) + 1 FROM public.meeting_rooms), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.meeting_rooms
       SET name = v_name, seats = p_seats, location = left(btrim(coalesce(p_location, '')), 80),
           facilities = left(btrim(coalesce(p_facilities, '')), 120), bookable = coalesce(p_bookable, bookable),
           updated_at = now()
     WHERE id = p_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'That room is no longer there.'; END IF;
  END IF;
  RETURN (SELECT public.meeting_rooms_room_json(r) FROM public.meeting_rooms r WHERE r.id = v_id);
END
$fn$;

-- Remove a room: never while it has live bookings from today on.
CREATE OR REPLACE FUNCTION public.meeting_rooms_delete_room(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_room  public.meeting_rooms%ROWTYPE;
BEGIN
  IF NOT public.has_any_action(ARRAY['rooms.edit']) THEN
    RAISE EXCEPTION 'Changing the rooms needs Meeting rooms · Edit.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_room FROM public.meeting_rooms WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That room is no longer there.'; END IF;
  IF EXISTS (SELECT 1 FROM public.meeting_room_bookings b WHERE b.room_id = p_id AND b.cancelled_at IS NULL AND b.day >= v_today) THEN
    RAISE EXCEPTION '% has upcoming bookings. Turn off Bookable instead, or cancel them first', v_room.name;
  END IF;
  UPDATE public.meeting_rooms SET deleted_at = now(), bookable = false, guest_bookable = false, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'name', v_room.name);
END
$fn$;

-- ── Who may call them ───────────────────────────────────────────────────────
-- Signed-in sessions only; each function asks for its own cell.

REVOKE ALL ON FUNCTION public.meeting_rooms_range(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_rooms_booking(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_rooms_rooms() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_rooms_people() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_rooms_book(uuid, uuid, date, integer, integer, text, uuid, uuid, uuid[], jsonb, integer, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_rooms_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_rooms_save_room(uuid, text, integer, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meeting_rooms_delete_room(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_range(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_rooms() TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_people() TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_book(uuid, uuid, date, integer, integer, text, uuid, uuid, uuid[], jsonb, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_save_room(uuid, text, integer, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_rooms_delete_room(uuid) TO authenticated;

// Local PostgreSQL regression for 20261011090000 (2026-10-11, the HR revamp's
// Admin › Meeting Rooms). The migration runs VERBATIM over stand-ins for the
// tables it reads and the permission check it asks (has_any_action reads the
// actions this test hands it). What is under test: nobody without a cell reads
// or writes; a room is added, changed and only removed with no live booking
// ahead; a booking is checked (half hours 08:00–20:00, today or later, a title,
// somebody attending, a free slot — said in words, and refused by the table
// itself in a race); whose booking it is (the account that placed it, the
// person it is for) decides who changes or cancels it; a guest-link booking is
// the admin's (Meeting rooms · Edit) to change; a Revenue app member books for
// themselves only; the range reader says what each row lets the reader do.
// No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

const USER_A = id(1)
const USER_B = id(2)
const USER_M = id(3)
const STAFF_A = id(11)
const STAFF_B = id(12)
const STAFF_M = id(13)
const STAFF_X = id(14)
const REV = id(21)
const HR = id(22)
const FAIR = id(31)

/** Sign in as somebody holding these actions (the stand-in has_any_action reads them). */
async function as(user, actions) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('test.actions', '${actions.join(',')}', false)`)
}

const BOOK = `SELECT public.meeting_rooms_book($1, $2, $3::date, $4, $5, $6, $7, $8, $9::uuid[], $10::jsonb, $11, $12, $13) AS r`
const book = (o) => q(BOOK, [o.id ?? null, o.room, o.day, o.from, o.to, o.title ?? 'Weekly sync', o.dept ?? null, o.by ?? null,
  o.internal ?? [], JSON.stringify(o.guests ?? []), o.pax ?? null, o.source ?? 'portal', o.sub ?? null]).then(r => r[0].r)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE EXTENSION btree_gist;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, status text NOT NULL DEFAULT 'active',
      user_id uuid, title_id uuid, designation text, home_sub_department_id uuid, created_at timestamptz NOT NULL DEFAULT now());
    -- The permission check: any wanted 'fn.action[:scope]' among the actions handed in.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;
  `)
  await q(`INSERT INTO users VALUES ($1, 'Grace account', 'a@x'), ($2, 'Jason account', 'b@x'), ($3, 'Kar Jun account', 'm@x')`, [USER_A, USER_B, USER_M])
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department'), ($2, 'HR')`, [REV, HR])
  await q(`INSERT INTO comm_sub_departments(id, name, department_id) VALUES ($1, 'Fair', $2)`, [FAIR, REV])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, department_id, user_id, home_sub_department_id) VALUES
    ($1, 'Grace Lim', $5, $6, NULL), ($2, 'Jason Ong', $5, $7, NULL), ($3, 'Kar Jun', $8, $9, $10), ($4, 'Chea Huan', $8, NULL, $10)`,
    [STAFF_A, STAFF_B, STAFF_M, STAFF_X, HR, USER_A, USER_B, REV, USER_M, FAIR])

  const sql = (await readFile(new URL('20261011090000_meeting_rooms.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)

  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const day = n => one(`SELECT (($1::date) + $2::int)::text`, [today, n])
  const D1 = await day(1)
  const D2 = await day(2)
  const YESTERDAY = await day(-1)

  // ── Nobody without a cell ──
  await as(USER_A, [])
  await reject(`SELECT public.meeting_rooms_range($1::date, $1::date)`, [D1], /Meeting rooms · View/, 'no cell reads nothing')
  await reject(`SELECT public.meeting_rooms_save_room(NULL, 'Room 1', 8, '', '', true)`, [], /Meeting rooms · Edit/, 'no cell adds no room')
  await as(USER_A, ['rooms.view', 'rooms.create'])
  await reject(`SELECT public.meeting_rooms_save_room(NULL, 'Room 1', 8, '', '', true)`, [], /Meeting rooms · Edit/, 'booking is not managing')

  // ── The rooms ──
  await as(USER_A, ['rooms.view', 'rooms.create', 'rooms.edit'])
  const r1 = (await q(`SELECT public.meeting_rooms_save_room(NULL, 'Meeting Room 1', 8, 'Level 3', 'TV, whiteboard', true) AS r`))[0].r
  const r2 = (await q(`SELECT public.meeting_rooms_save_room(NULL, 'Meeting Room 2', 4, 'Level 5', '', true) AS r`))[0].r
  check([r1.name, r1.seats, r1.location, r1.bookable, r1.guestBookable], ['Meeting Room 1', 8, 'Level 3', true, false], 'a room is added')
  await reject(`SELECT public.meeting_rooms_save_room(NULL, '  ', 8, '', '', true)`, [], /Give the room a name/, 'a room needs a name')
  await reject(`SELECT public.meeting_rooms_save_room(NULL, 'X', 1000, '', '', true)`, [], /Seats is a number/, 'seats stay sane')
  const off = (await q(`SELECT public.meeting_rooms_save_room(NULL, 'Store room', 2, '', '', false) AS r`))[0].r

  // ── Booking ──
  const b1 = await book({ room: r1.id, day: D1, from: 540, to: 600, title: 'Fair weekly sync', by: STAFF_A, internal: [STAFF_A, STAFF_X], dept: HR })
  check([b1.ref, b1.time, b1.pax], ['BK-301', '09:00–10:00', 2], 'a booking takes the next reference and counts who is named')
  await reject(BOOK, [null, r1.id, D1, 570, 630, 'Clash', null, STAFF_A, [STAFF_A], '[]', null, 'portal', null],
    /Meeting Room 1 is taken 09:00–10:00 by “Fair weekly sync”/, 'a taken slot is said in words')
  await reject(BOOK, [null, r1.id, D1, 450, 540, 'Early', null, STAFF_A, [STAFF_A], '[]', null, 'portal', null], /between 08:00 and 20:00/, 'not before 08:00')
  await reject(BOOK, [null, r1.id, D1, 495, 540, 'Quarter', null, STAFF_A, [STAFF_A], '[]', null, 'portal', null], /half hours/, 'whole half hours')
  await reject(BOOK, [null, r1.id, D1, 600, 600, 'Empty', null, STAFF_A, [STAFF_A], '[]', null, 'portal', null], /after the start/, 'an end after the start')
  await reject(BOOK, [null, r1.id, YESTERDAY, 600, 660, 'Late', null, STAFF_A, [STAFF_A], '[]', null, 'portal', null], /today or a day after/, 'never a past day')
  await reject(BOOK, [null, r1.id, D1, 600, 660, '   ', null, STAFF_A, [STAFF_A], '[]', null, 'portal', null], /meeting title/, 'a title')
  await reject(BOOK, [null, r1.id, D1, 600, 660, 'Nobody', null, STAFF_A, [], '[{"name":"  "}]', null, 'portal', null], /who is attending/, 'somebody attends')
  await reject(BOOK, [null, off.id, D1, 600, 660, 'Store', null, STAFF_A, [STAFF_A], '[]', null, 'portal', null], /not open for booking/, 'a room turned off is not booked')
  const b2 = await book({ room: r1.id, day: D1, from: 600, to: 690, title: 'Supplier review', by: STAFF_B, internal: [STAFF_B, STAFF_B],
    guests: [{ name: 'Tan Wei Ming', company: 'Akemi' }, { name: '' }], pax: 1 })
  check(b2.pax, 2, 'the headcount is never under the named attendees (a colleague once, a blank guest dropped)')
  const b3 = await book({ room: r2.id, day: D1, from: 600, to: 660, title: 'Big call', internal: [STAFF_A], pax: 9 })
  check(b3.pax, 9, 'more than named may come')
  const ev = await q(`SELECT what, actor_name, note FROM meeting_room_booking_events WHERE booking_id = $1`, [b2.id])
  check(ev, [{ what: 'Booked', actor_name: 'Jason Ong', note: 'Booked on their behalf by Grace Lim' }], 'booked for somebody else says by whom')

  // The table itself refuses an overlap a check could miss (two presses at once).
  await reject(`INSERT INTO meeting_room_bookings(ref, room_id, day, start_min, end_min, title, source, booked_by_user, booked_by_name, pax)
                VALUES ('BK-X', $1, $2, 630, 660, 'Race', 'portal', $3, 'x', 1)`, [r1.id, D1, USER_A], /meeting_room_bookings_no_overlap/, 'no overlap, ever')
  check(await one(`SELECT count(*)::int FROM meeting_room_bookings WHERE room_id = $1 AND day = $2 AND cancelled_at IS NULL`, [r1.id, D1]), 2, 'two live bookings stand')

  // ── Whose it is ──
  await as(USER_M, ['rooms.view', 'rooms.create'])
  await reject(`SELECT public.meeting_rooms_cancel($1)`, [b1.id], /Only Grace Lim can cancel this meeting/, 'somebody else cancels nothing')
  await reject(BOOK, [b1.id, r1.id, D1, 540, 570, 'Mine now', null, null, [STAFF_A], '[]', null, 'portal', null], /Only Grace Lim can change/, 'nor changes it')
  await as(USER_B, ['rooms.view', 'rooms.create'])
  const range = (await q(`SELECT public.meeting_rooms_range($1::date, $2::date) AS r`, [D1, D2]))[0].r
  check(range.rooms.map(r => r.name), ['Meeting Room 1', 'Meeting Room 2'], 'the schedule lists the rooms open for booking')
  check(range.bookings.map(b => [b.ref, b.mine, b.canChange]), [['BK-301', false, false], ['BK-302', true, true], ['BK-303', false, false]],
    'Jason may change the one booked for him, not the others')
  check(range.bookings[1].internal.map(p => p.name), ['Jason Ong'], 'attendees by name')
  check(range.bookings[1].events.length, 1, 'with its trail')
  await reject(`SELECT public.meeting_rooms_range($1::date, ($1::date + 63))`, [D1], /at most 62 days/, 'a range stays short')

  // The person it was booked for may move it.
  const moved = await book({ id: b2.id, room: r1.id, day: D2, from: 840, to: 900, title: 'Supplier review', by: STAFF_B, internal: [STAFF_B] })
  check([moved.ref, moved.time], ['BK-302', '14:00–15:00'], 'the booker moves their booking')
  check((await q(`SELECT what, note FROM meeting_room_booking_events WHERE booking_id = $1 ORDER BY id`, [b2.id])).map(e => e.what + ' · ' + e.note),
    ['Booked · Booked on their behalf by Grace Lim', 'Edited · Meeting Room 1 · 14:00–15:00'], 'and the trail says so')
  await q(`SELECT public.meeting_rooms_cancel($1)`, [b2.id])
  check(await one(`SELECT cancelled_by_name FROM meeting_room_bookings WHERE id = $1`, [b2.id]), 'Jason Ong', 'and may cancel it')
  await reject(`SELECT public.meeting_rooms_cancel($1)`, [b2.id], /no longer there/, 'once')

  // ── A booking from the guest link is the admin's ──
  const g = await one(`INSERT INTO meeting_room_bookings(ref, room_id, day, start_min, end_min, title, source, booked_by_name, pax, guest_company, guest_department)
                       VALUES ('BK-G900', $1, $2, 1020, 1080, 'Showroom kickoff', 'guest', 'Wong Mei Yee', 5, 'HOUZS Interior', 'Project') RETURNING id`, [r2.id, D1])
  await reject(`SELECT public.meeting_rooms_cancel($1)`, [g], /Only Wong Mei Yee can cancel/, 'a plain booker cannot cancel a guest booking')
  await as(USER_A, ['rooms.view', 'rooms.create', 'rooms.edit'])
  const adminView = (await q(`SELECT public.meeting_rooms_booking($1) AS r`, [g]))[0].r
  check([adminView.canChange, adminView.mine, adminView.guestCompany], [true, false, 'HOUZS Interior'], 'the admin may change a guest booking')
  const gm = await book({ id: g, room: r2.id, day: D1, from: 1050, to: 1110, title: 'Showroom kickoff', pax: 6 })
  check([gm.time, gm.pax], ['17:30–18:30', 6], 'the admin moves it')
  check(await q(`SELECT source, booked_by_name, guest_company FROM meeting_room_bookings WHERE id = $1`, [g]),
    [{ source: 'guest', booked_by_name: 'Wong Mei Yee', guest_company: 'HOUZS Interior' }], 'and it stays the guest’s')
  await q(`SELECT public.meeting_rooms_cancel($1)`, [g])
  check(await one(`SELECT note FROM meeting_room_booking_events WHERE booking_id = $1 AND what = 'Cancelled'`, [g]), 'Cancelled by admin', 'cancelled by admin')

  // ── The Revenue app: a member books for themselves ──
  await as(USER_M, ['revenue_app.view'])
  await reject(BOOK, [null, r2.id, D2, 540, 600, 'Portal path', null, STAFF_M, [STAFF_M], '[]', null, 'portal', null], /Meeting rooms · Create/, 'a member does not book from the portal path')
  await reject(BOOK, [null, r2.id, D2, 540, 600, 'For him', null, STAFF_X, [STAFF_M], '[]', null, 'app', FAIR], /book for yourself/, 'nor for somebody else')
  const app = await book({ room: r2.id, day: D2, from: 540, to: 600, title: 'Client · Mid Valley booth', by: STAFF_M, internal: [STAFF_M], source: 'app', sub: FAIR,
    guests: [{ name: 'Aaron Lim', company: 'MVEC' }] })
  check(await q(`SELECT source, department_id = $2 AS rev, sub_department_id = $3 AS fair FROM meeting_room_bookings WHERE id = $1`, [app.id, REV, FAIR]),
    [{ source: 'app', rev: true, fair: true }], 'from the app, booked from Fair (Revenue)')
  check(await one(`SELECT note FROM meeting_room_booking_events WHERE booking_id = $1`, [app.id]), 'From the Revenue app', 'the trail says where')
  const mine = (await q(`SELECT public.meeting_rooms_range($1::date, $1::date) AS r`, [D2]))[0].r
  check(mine.bookings.map(b => [b.title, b.mine, b.subDepartment]), [['Client · Mid Valley booth', true, 'Fair']], 'the member reads the schedule, theirs marked')
  await reject(`SELECT public.meeting_rooms_rooms()`, [], /Meeting rooms · View/, 'the Rooms tab is not the app’s')
  await q(`SELECT public.meeting_rooms_cancel($1)`, [app.id])

  // ── A room with a booking ahead is kept ──
  await as(USER_A, ['rooms.view', 'rooms.create', 'rooms.edit'])
  await reject(`SELECT public.meeting_rooms_delete_room($1)`, [r1.id], /Meeting Room 1 has upcoming bookings/, 'not while it is booked')
  const rooms = (await q(`SELECT public.meeting_rooms_rooms() AS r`))[0].r
  check(rooms.map(r => [r.name, r.upcoming, r.bookable]), [['Meeting Room 1', 1, true], ['Meeting Room 2', 1, true], ['Store room', 0, false]], 'the Rooms tab counts what is ahead')
  await q(`SELECT public.meeting_rooms_delete_room($1)`, [off.id])
  check((await q(`SELECT public.meeting_rooms_rooms() AS r`))[0].r.length, 2, 'a free room goes (kept for history)')

  // ── Nothing is open to the browser's key ──
  check(await one(`SELECT has_function_privilege('anon', 'public.meeting_rooms_range(date, date)', 'EXECUTE')`), false, 'anon reads nothing')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.meeting_rooms_rows(date, date, uuid[], boolean, boolean)', 'EXECUTE')`), false,
    'the row builder is not a door')
  check(await one(`SELECT has_table_privilege('authenticated', 'public.meeting_room_bookings', 'SELECT')`), false, 'the table is not read straight')

  console.log(`meeting rooms: ${checks} checks passed`)
} finally {
  await db.close()
}

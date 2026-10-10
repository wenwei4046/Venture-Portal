// Local PostgreSQL regression for 20261011091000 (2026-10-11, the HR revamp's
// Admin › Guest Link and the public /g/<code> page). Both migrations — Meeting
// Rooms first — run VERBATIM over stand-ins for the tables they read and the
// permission check they ask. What is under test: the link starts off and its
// code is the only key (a wrong or old code reads "closed", never an error that
// says more); the publishable key (anon) reaches the four guest functions and
// nothing else; a guest books only a room open to guests, inside the days
// ahead, within the seats, on a free slot — and changes or cancels only a
// booking made through the link, giving a name for the trail; HQ's meetings are
// never theirs to touch; the subsidiaries are the link's own list, seeded from
// Finance's companies; the admin reads and changes all of it with its cells.
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

const ADMIN = id(1)
const STAFF = id(11)
const HR = id(22)

/** Sign in as somebody holding these actions — or, with no user, the publishable key. */
async function as(user, actions, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('test.actions', '${actions.join(',')}', false)`)
  await db.exec(`SET ROLE ${role}`)
}
const asAnon = () => as(null, [], 'anon')

const BOOK = `SELECT public.guest_link_book($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12) AS r`
const gbook = (code, o) => q(BOOK, [code, o.id ?? null, o.room ?? null, o.day ?? null, o.from ?? null, o.to ?? null, o.title ?? 'Delivery schedule review',
  o.sub ?? null, o.dept ?? '', o.name ?? 'Wong Mei Yee', o.pax ?? 2, o.actor ?? null]).then(r => r[0].r)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE EXTENSION btree_gist;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, status text NOT NULL DEFAULT 'active',
      user_id uuid, title_id uuid, designation text, home_sub_department_id uuid, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, short_code text, is_active boolean NOT NULL DEFAULT true);
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    GRANT EXECUTE ON FUNCTION public.has_any_action(text[]) TO authenticated, anon;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;
  `)
  await q(`INSERT INTO users VALUES ($1, 'HR account', 'hr@x')`, [ADMIN])
  await q(`INSERT INTO departments VALUES ($1, 'HR')`, [HR])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, department_id, user_id) VALUES ($1, 'Grace Lim', $2, $3)`, [STAFF, HR, ADMIN])
  await q(`INSERT INTO companies(name, short_code, is_active) VALUES ('Hookka', 'HK', true), ('The Cont', 'CONTS', true), ('2990', '2990', true),
    ('Old Co', 'OLD', false), ('HOUZS Century', 'HC', true)`)

  for (const f of ['20261011090000_meeting_rooms.sql', '20261011091000_guest_link.sql']) {
    await db.exec((await readFile(new URL(f, migrations), 'utf8')).replace(/\r\n/g, '\n'))
  }

  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const day = n => one(`SELECT (($1::date) + $2::int)::text`, [today, n])
  const D1 = await day(1)
  const D13 = await day(13)
  const D14 = await day(14)

  // ── It starts off, with a code nobody can guess ──
  const code = await one(`SELECT code FROM guest_link`)
  check(/^hv-[A-HJ-NP-Z2-9]{8}$/.test(code), true, 'hv- and eight letters or digits (no 0, O, 1, I)')
  check(await one(`SELECT is_on FROM guest_link`), false, 'the link starts off')
  await asAnon()
  check((await q(`SELECT public.guest_link_page($1) AS r`, [code]))[0].r, { on: false }, 'off: the page says closed')
  await reject(BOOK, [code, null, null, D1, 600, 660, 'x', null, '', 'x', 1, null], /This link is closed/, 'and books nothing')

  // ── The admin ──
  await as(ADMIN, [])
  await reject(`SELECT public.guest_link_admin()`, [], /Guest link · View/, 'no cell reads nothing')
  await as(ADMIN, ['guest_link.view'])
  const a0 = (await q(`SELECT public.guest_link_admin() AS r`))[0].r
  check([a0.on, a0.code, a0.booking, a0.hiring, a0.days, a0.canEdit, a0.hires], [false, code, true, true, 14, false, 0], 'the page reads the link')
  check(a0.subs.map(s => [s.code, s.name]), [['299', '2990'], ['HK', 'Hookka'], ['HC', 'HOUZS Century'], ['CON', 'The Cont']],
    'the subsidiaries are Finance’s active companies, codes cut to three')
  await reject(`SELECT public.guest_link_set(true, NULL, NULL, NULL)`, [], /Guest link · Edit/, 'viewing is not changing')

  await as(ADMIN, ['guest_link.view', 'guest_link.edit', 'rooms.view', 'rooms.create', 'rooms.edit'])
  const r1 = (await q(`SELECT public.meeting_rooms_save_room(NULL, 'Meeting Room 1', 8, 'Level 3', 'TV, whiteboard', true) AS r`))[0].r
  const r2 = (await q(`SELECT public.meeting_rooms_save_room(NULL, 'Meeting Room 2', 4, 'Level 5', '', true) AS r`))[0].r
  await q(`SELECT public.guest_link_room($1, true)`, [r1.id])
  await reject(`SELECT public.guest_link_set(NULL, NULL, NULL, 30)`, [], /1 to 21 days/, 'days ahead stay 1 to 21')
  const set = (await q(`SELECT public.guest_link_set(true, NULL, NULL, NULL) AS r`))[0].r
  check([set.on, set.booking, set.days], [true, true, 14], 'turned on, the rest kept')
  const subs = (await q(`SELECT public.guest_link_admin() AS r`))[0].r.subs
  const HK = subs.find(s => s.code === 'HK').id
  const hk = (await q(`SELECT public.guest_link_save_subsidiary($1, ' hkx ', 'Hookka Sdn Bhd', ARRAY['Warehouse', ' warehouse', '', 'Delivery']) AS r`, [HK]))[0].r
  check([hk.code, hk.name, hk.departments], ['HKX', 'Hookka Sdn Bhd', ['Warehouse', 'Delivery']], 'a subsidiary is renamed, its departments once each')
  await reject(`SELECT public.guest_link_save_subsidiary($1, 'ABCD', 'X', '{}')`, [HK], /up to three letters/, 'a code is three at most')
  const added = (await q(`SELECT public.guest_link_save_subsidiary(NULL, '', NULL, '{}') AS r`))[0].r
  check(added.name, 'New subsidiary', '+ Add subsidiary')
  const CON = subs.find(s => s.code === 'CON').id

  // ── The guest page ──
  await asAnon()
  const page = (await q(`SELECT public.guest_link_page($1) AS r`, [code]))[0].r
  check([page.on, page.booking, page.hiring, page.days, page.today], [true, true, false, 14, today], 'on: the parts, the days')
  check([page.rooms.map(r => r.name), page.allRooms.map(r => r.name)], [['Meeting Room 1'], ['Meeting Room 1', 'Meeting Room 2']],
    'guests book the rooms opened to them; the schedule shows every room')
  check(page.subs.find(s => s.id === HK).departments, ['Warehouse', 'Delivery'], 'each company with its departments')
  check((await q(`SELECT public.guest_link_page($1) AS r`, ['hv-WRONGCOD']))[0].r, { on: false }, 'a wrong code reads closed')
  check((await q(`SELECT public.guest_link_page(NULL) AS r`))[0].r, { on: false }, 'so does none')

  await reject(BOOK, [code, null, null, null, null, null, '', null, '', '', 2, null],
    /Add company, department, your name, a time slot, a meeting title\./, 'what is missing, in the page’s words')
  await reject(BOOK, [code, null, r1.id, D1, 600, 660, 'Sync', HK, 'Admin', 'Wong', 2, null], /Add department\./, 'a department from the company’s list')
  await reject(BOOK, [code, null, r2.id, D1, 600, 660, 'Sync', HK, 'Warehouse', 'Wong', 2, null], /not open for guest booking/, 'only rooms opened to guests')
  await reject(BOOK, [code, null, r1.id, D14, 600, 660, 'Sync', HK, 'Warehouse', 'Wong', 2, null], /next 14 days/, 'inside the days ahead')
  await reject(BOOK, [code, null, r1.id, D1, 600, 660, 'Sync', HK, 'Warehouse', 'Wong', 9, null], /Meeting Room 1 seats 8/, 'within the seats')
  await reject(BOOK, [code, null, r1.id, D1, 615, 660, 'Sync', HK, 'Warehouse', 'Wong', 2, null], /half hours/, 'half hours')
  const g1 = await gbook(code, { room: r1.id, day: D1, from: 600, to: 660, sub: HK, dept: 'Warehouse', name: 'Wong Mei Yee', pax: 5 })
  check([/^BK-G\d+$/.test(g1.ref), g1.roomName, g1.company, g1.department, g1.name, g1.pax], [true, 'Meeting Room 1', 'Hookka Sdn Bhd', 'Warehouse', 'Wong Mei Yee', 5],
    'a guest books, a BK-G reference back')
  const g2 = await gbook(code, { room: r1.id, day: D13, from: 1140, to: 1200, sub: CON, name: 'Ali', title: 'Late call' })
  check(g2.department, null, 'a company with no departments needs none')
  await reject(BOOK, [code, null, r1.id, D1, 630, 690, 'Clash', HK, 'Warehouse', 'Wong', 2, null], /Someone just took that slot/, 'a taken slot')

  // HQ's meeting in the same room, booked in the portal.
  await as(ADMIN, ['rooms.view', 'rooms.create'])
  const hq = (await q(`SELECT public.meeting_rooms_book(NULL, $1, $2::date, 720, 780, 'Payroll check', $3, $4, ARRAY[$4]::uuid[], '[]'::jsonb, 3) AS r`,
    [r1.id, D1, HR, STAFF]))[0].r

  await asAnon()
  const dayRows = (await q(`SELECT public.guest_link_day($1, $2::date) AS r`, [code, D1]))[0].r
  check(dayRows.map(b => [b.title, b.guest, b.code, b.company, b.department, b.by, b.pax]),
    [['Delivery schedule review', true, 'HKX', 'Hookka Sdn Bhd', 'Warehouse', 'Wong Mei Yee', 5], ['Payroll check', false, null, null, 'HR', 'Grace Lim', 3]],
    'the day: the guest’s meeting and HQ’s, which says it is not the link’s')
  check(dayRows[1].ref, null, 'HQ’s reference stays inside')
  await reject(`SELECT public.guest_link_day($1, $2::date)`, [code, D14], /next 14 days/, 'the schedule keeps to the days ahead')

  // Never HQ's.
  await reject(BOOK, [code, hq.id, r1.id, D1, 720, 780, 'Mine now', HK, 'Warehouse', 'Wong', 2, 'Wong'], /Only bookings made through this link can be changed/, 'HQ’s is not changed')
  await reject(`SELECT public.guest_link_cancel($1, $2, 'Wong')`, [code, hq.id], /Only bookings made through this link can be cancelled/, 'nor cancelled')

  // Any guest changes or cancels a guest booking — with a name.
  await reject(BOOK, [code, g1.id, r1.id, D1, 630, 690, 'Moved', HK, 'Warehouse', 'Wong Mei Yee', 5, '  '], /Type your name first/, 'a change asks who')
  const moved = await gbook(code, { id: g1.id, room: r1.id, day: D1, from: 630, to: 690, title: 'Moved', sub: HK, dept: 'Delivery', name: 'Wong Mei Yee', pax: 5, actor: 'Tan Ah Kow' })
  check([moved.ref, moved.from, moved.department], [g1.ref, 630, 'Delivery'], 'moved, the reference kept')
  await reject(`SELECT public.guest_link_cancel($1, $2, '')`, [code, g1.id], /Type your name first/, 'a cancel asks who')
  await q(`SELECT public.guest_link_cancel($1, $2, 'Siti')`, [code, g1.id])
  await db.exec('RESET ROLE')
  check((await q(`SELECT what, actor_name, note FROM meeting_room_booking_events WHERE booking_id = $1 ORDER BY id`, [g1.id])).map(e => [e.what, e.actor_name, e.note]),
    [['Booked via guest link', 'Wong Mei Yee', 'Hookka Sdn Bhd · Warehouse · 5 pax'], ['Edited via guest link', 'Tan Ah Kow', 'Meeting Room 1 · 10:30–11:30'],
     ['Cancelled via guest link', 'Siti', '']], 'the trail names each guest')
  check(await one(`SELECT cancelled_by_name FROM meeting_room_bookings WHERE id = $1`, [g1.id]), 'Siti', 'cancelled by name')

  // A code change follows the bookings; the legend reads the codes.
  await as(ADMIN, ['guest_link.view', 'guest_link.edit', 'rooms.view'])
  await q(`SELECT public.guest_link_save_subsidiary($1, 'TC', 'The Cont', '{}')`, [CON])
  await db.exec('RESET ROLE')
  check(await one(`SELECT guest_code FROM meeting_room_bookings WHERE id = $1`, [g2.id]), 'TC', 'a new code follows the bookings')
  await as(ADMIN, ['guest_link.view', 'guest_link.edit', 'rooms.view'])
  const legend = (await q(`SELECT public.guest_link_legend() AS r`))[0].r
  check(legend.map(l => l.code), ['299', 'HKX', 'HC', 'TC'], 'the legend: each subsidiary with a code')
  const adm = (await q(`SELECT public.guest_link_admin() AS r`))[0].r
  check(adm.bookings.map(b => [b.title, b.source, b.canChange]), [['Late call', 'guest', false]], 'Booked through the link: the live ones ahead')
  await q(`SELECT public.guest_link_remove_subsidiary($1)`, [added.id])
  check((await q(`SELECT public.guest_link_admin() AS r`))[0].r.subs.length, 4, 'a subsidiary removed')

  // New link: the old code stops at once. Booking off: the link books nothing.
  const fresh = (await q(`SELECT public.guest_link_new_code() AS r`))[0].r.code
  check(fresh !== code && /^hv-[A-HJ-NP-Z2-9]{8}$/.test(fresh), true, 'a new code')
  await asAnon()
  check((await q(`SELECT public.guest_link_page($1) AS r`, [code]))[0].r, { on: false }, 'the old link reads closed')
  check((await q(`SELECT public.guest_link_page($1) AS r`, [fresh]))[0].r.on, true, 'the new one opens')
  await as(ADMIN, ['guest_link.edit'])
  await q(`SELECT public.guest_link_set(NULL, false, NULL, NULL)`)
  await asAnon()
  await reject(`SELECT public.guest_link_day($1, $2::date)`, [fresh, D1], /This link is closed/, 'booking off: no schedule')
  check((await q(`SELECT public.guest_link_page($1) AS r`, [fresh]))[0].r.booking, false, 'and the page knows')

  // ── What the browser's key reaches ──
  await db.exec('RESET ROLE')
  const anonMay = async sig => one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [sig])
  check(await Promise.all(['public.guest_link_page(text)', 'public.guest_link_day(text, date)',
    'public.guest_link_book(text, uuid, uuid, date, integer, integer, text, uuid, text, text, integer, text)',
    'public.guest_link_cancel(text, uuid, text)'].map(anonMay)), [true, true, true, true], 'the four guest doors are open to the link')
  check(await Promise.all(['public.guest_link_admin()', 'public.guest_link_set(boolean, boolean, boolean, integer)', 'public.guest_link_new_code()',
    'public.guest_link_open(text, text)', 'public.guest_link_make_code()', 'public.guest_link_legend()',
    'public.meeting_rooms_book(uuid, uuid, date, integer, integer, text, uuid, uuid, uuid[], jsonb, integer, text, uuid)'].map(anonMay)),
    [false, false, false, false, false, false, false], 'nothing else')
  check(await one(`SELECT has_table_privilege('anon', 'public.guest_link', 'SELECT')`), false, 'the code is not read straight')

  console.log(`guest link: ${checks} checks passed`)
} finally {
  await db.close()
}

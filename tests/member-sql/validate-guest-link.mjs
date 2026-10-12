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
// Then Request manpower (20261011092000) and the hardening after the security
// review (20261011120000): Request manpower starts off, an upload takes one
// name only (guest/<code>/<uuid>.<ext>), and the link takes at most 40 files,
// 20 requests, 40 bookings or changes and 40 cancellations an hour.
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
    -- Supabase Storage's objects, and its folder helper (all but the file's own name).
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT INSERT ON storage.objects TO anon, authenticated;
    -- The Hiring module's guest door (mig 20261011080000), as it answers: the form, and a request filed
    -- (into hiring_requests, as source guest, which is what the hourly cap counts).
    CREATE TABLE hire_calls(company text, department text, name text, phone text, answers jsonb, path text, file text);
    CREATE TABLE public.hiring_requests(id text PRIMARY KEY, source text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION public.hiring_guest_form() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT '[{"id":"position","label":"Position","type":"text","options":"","required":true,"core":true}]'::jsonb $$;
    CREATE FUNCTION public.hiring_file_guest_request(p_company text, p_department text, p_name text, p_phone text, p_answers jsonb,
      p_attachment_path text DEFAULT NULL, p_attachment_name text DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
    DECLARE v_id text;
    BEGIN
      INSERT INTO hire_calls VALUES (p_company, p_department, p_name, p_phone, p_answers, p_attachment_path, p_attachment_name);
      v_id := 'HR-' || (300 + (SELECT count(*) FROM hire_calls))::text;
      INSERT INTO public.hiring_requests(id, source) VALUES (v_id, 'guest');
      RETURN v_id;
    END $$;
    REVOKE ALL ON FUNCTION public.hiring_guest_form() FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON FUNCTION public.hiring_file_guest_request(text, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
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

  // ── Request manpower (mig 20261011092000) ──
  await db.exec((await readFile(new URL('20261011092000_guest_link_hire.sql', migrations), 'utf8')).replace(/\r\n/g, '\n'))
  await asAnon()
  const hirePage = (await q(`SELECT public.guest_link_page($1) AS r`, [fresh]))[0].r
  check([hirePage.hiring, hirePage.hireForm.map(f => f.id)], [true, ['position']], 'the part opens with Hiring › Form settings’ fields')
  const HIRE = `SELECT public.guest_link_hire($1, $2, $3, $4::jsonb, $5, $6) AS r`

  // ── The hardening (mig 20261011120000): Request manpower starts off ──
  await db.exec('RESET ROLE')
  const HARDENING = (await readFile(new URL('20261011120000_guest_link_hardening.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(HARDENING)
  check(await one(`SELECT hiring FROM guest_link`), false, 'the one row: Request manpower off')
  check(await one(`SELECT column_default FROM information_schema.columns WHERE table_name = 'guest_link' AND column_name = 'hiring'`), 'false',
    'and off by default — turning the link on opens room booking only')
  const bodies = async () => q(`SELECT proname, md5(prosrc) AS h FROM pg_proc WHERE proname IN ('guest_link_may_upload', 'guest_link_hire', 'guest_link_book', 'guest_link_cancel') ORDER BY proname`)
  const swapped = await bodies()
  await db.exec(HARDENING)
  check(await bodies(), swapped, 'run twice, each statement is swapped once')
  check(await one(`SELECT roles::text FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'guest_link_uploads'`), '{anon,authenticated}',
    'the upload policy is still the publishable key’s (and a session’s)')
  check(await Promise.all(['public.guest_link_page(text)', 'public.guest_link_day(text, date)',
    'public.guest_link_book(text, uuid, uuid, date, integer, integer, text, uuid, text, text, integer, text)',
    'public.guest_link_cancel(text, uuid, text)', 'public.guest_link_hire(text, uuid, text, jsonb, text, text)', 'public.guest_link_may_upload(text)'].map(anonMay)),
    [true, true, true, true, true, true], 'the six guest doors keep their grants')
  await asAnon()
  check((await q(`SELECT public.guest_link_page($1) AS r`, [fresh]))[0].r.hiring, false, 'the page offers no request')
  check(await one(`SELECT public.guest_link_may_upload($1)`, [fresh]), false, 'takes no file')
  await reject(HIRE, [fresh, HK, 'Wong', '{}', null, null], /This link is closed/, 'and files nothing')
  await as(ADMIN, ['guest_link.edit'])
  check((await q(`SELECT public.guest_link_set(NULL, NULL, true, NULL) AS r`))[0].r.hiring, true, 'HR turns it on with its own switch')
  await asAnon()
  check((await q(`SELECT public.guest_link_page($1) AS r`, [fresh]))[0].r.hiring, true, 'and the part opens')

  await reject(HIRE, [fresh, null, ' ', '{}', null, null], /Fill in Company, Your name\./, 'who is asking, in the form’s words')
  const sent = (await q(HIRE, [fresh, HK, 'Wong Mei Yee', '{"position":"Driver","headcount":"2"}', null, null]))[0].r
  check(sent, { id: 'HR-301', position: 'Driver' }, 'filed through the Hiring module’s guest door')
  await db.exec('RESET ROLE')
  check(await q(`SELECT company, name, answers, path FROM hire_calls`),
    [{ company: 'Hookka Sdn Bhd', name: 'Wong Mei Yee', answers: { position: 'Driver', headcount: '2' }, path: null }], 'as the company, the guest and the answers')

  // A job description: the browser's file under guest/<code>/, only while the part is open.
  const FILE = `guest/${fresh}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`
  await asAnon()
  await q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('hiring-files', $1)`, [FILE])
  await reject(`INSERT INTO storage.objects(bucket_id, name) VALUES ('hiring-files', 'attachments/x.pdf')`, [], /row-level security/, 'nowhere but guest/')
  await reject(`INSERT INTO storage.objects(bucket_id, name) VALUES ('hiring-files', $1)`, [`guest/${code}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`], /row-level security/,
    'and never under an old code')
  await reject(HIRE, [fresh, HK, 'Wong', '{}', `guest/${code}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`, 'jd.pdf'], /Attach the file again/, 'a request names only this link’s files')
  await reject(HIRE, [fresh, HK, 'Wong', '{}', `guest/${fresh}/11111111-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`, 'jd.pdf'], /Attach the file again/, 'that are there')
  const withFile = (await q(HIRE, [fresh, HK, 'Wong', '{}', FILE, 'JD Driver.pdf']))[0].r
  check(withFile, { id: 'HR-302', position: 'the role' }, 'a request with its file')

  // One name only: guest/<the code>/<uuid>.<ext>, as lib/guest/upload.ts writes it (review M1).
  const PUT = `INSERT INTO storage.objects(bucket_id, name) VALUES ('hiring-files', $1)`
  for (const [name, what] of [
    [`guest/${fresh}/jd.pdf`, 'a name of the guest’s own'],
    [`guest/${fresh}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.exe`, 'a kind the bucket does not keep'],
    [`guest/${fresh}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf.exe`, 'a kind hidden behind one it keeps'],
    [`guest/${fresh}/0B5F6A1E-4C1D-4F3A-9A77-2F1D0C3B4E5A.PDF`, 'capitals the browser never writes'],
    [`guest/${fresh}/x/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`, 'a folder deeper'],
    [`guest/hv-WRONGCOD/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`, 'a code that is not the link’s'],
  ]) await reject(PUT, [name], /row-level security/, `refused: ${what}`)
  await q(PUT, [`guest/${fresh}/7c9e6679-7425-40de-944b-e07fc1f90ae7.jpeg`])
  await q(PUT, [`guest/${fresh}/7c9e6679-7425-40de-944b-e07fc1f90ae8.docx`])
  checks++

  // At most 40 files an hour, whoever sends them.
  await db.exec('RESET ROLE')
  const files = Number(await one(`SELECT count(*) FROM storage.objects WHERE name LIKE 'guest/%' AND created_at > now() - interval '1 hour'`))
  check(files, 3, 'three files this hour so far')
  await q(`INSERT INTO storage.objects(bucket_id, name) SELECT 'hiring-files', 'guest/' || $1 || '/' || gen_random_uuid() || '.pdf' FROM generate_series(1, $2)`,
    [fresh, 40 - files])
  await asAnon()
  check(await one(`SELECT public.guest_link_may_upload($1)`, [fresh]), false, 'forty this hour: the upload question says no')
  await reject(PUT, [`guest/${fresh}/33333333-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`], /row-level security/, 'and the 41st file is refused')
  await db.exec('RESET ROLE')
  await q(`UPDATE storage.objects SET created_at = now() - interval '61 minutes' WHERE name LIKE 'guest/%'`)
  await asAnon()
  check(await one(`SELECT public.guest_link_may_upload($1)`, [fresh]), true, 'an hour later it says yes again')
  await q(PUT, [`guest/${fresh}/33333333-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`])
  checks++

  // At most 20 requests an hour.
  await db.exec('RESET ROLE')
  const filed = Number(await one(`SELECT count(*) FROM hiring_requests WHERE source = 'guest' AND submitted_at > now() - interval '1 hour'`))
  check(filed, 2, 'two requests this hour so far')
  await q(`INSERT INTO hiring_requests(id, source) SELECT 'HR-9' || lpad(n::text, 2, '0'), 'guest' FROM generate_series(1, $1) n`, [20 - filed])
  await asAnon()
  await reject(HIRE, [fresh, HK, 'Wong', '{"position":"Driver"}', null, null], /Too many requests from the guest link just now\. Try again later\./,
    'twenty this hour: the 21st waits, in the page’s words')
  await db.exec('RESET ROLE')
  await q(`UPDATE hiring_requests SET submitted_at = now() - interval '61 minutes'`)
  await asAnon()
  check((await q(HIRE, [fresh, HK, 'Wong', '{"position":"Driver"}', null, null]))[0].r, { id: 'HR-303', position: 'Driver' }, 'an hour later it goes through')

  // At most 40 bookings or changes, and 40 cancellations, an hour (booking was switched off above).
  await as(ADMIN, ['guest_link.edit'])
  await q(`SELECT public.guest_link_set(NULL, true, NULL, NULL)`)
  await db.exec('RESET ROLE')
  const wrote = Number(await one(`SELECT count(*) FROM meeting_room_booking_events
                                   WHERE what IN ('Booked via guest link', 'Edited via guest link') AND at > now() - interval '1 hour'`))
  check(wrote, 3, 'two bookings and a change this hour so far')
  await q(`INSERT INTO meeting_room_booking_events(booking_id, what, actor_name) SELECT $1, 'Booked via guest link', 'Script' FROM generate_series(1, $2)`,
    [g2.id, 40 - wrote])
  await asAnon()
  await reject(BOOK, [fresh, null, r1.id, D1, 900, 960, 'One more', HK, 'Warehouse', 'Wong', 2, null], /Too many requests from the guest link just now/,
    'forty this hour: the 41st booking waits')
  await reject(BOOK, [fresh, g2.id, r1.id, D13, 1140, 1200, 'Late call', CON, '', 'Ali', 2, 'Ali'], /Too many requests from the guest link just now/,
    'and so does a change — it writes as much as a booking')
  await reject(BOOK, [code, null, r1.id, D1, 900, 960, 'One more', HK, 'Warehouse', 'Wong', 2, null], /This link is closed/, 'a closed link still says closed first')
  await db.exec('RESET ROLE')
  await q(`UPDATE meeting_room_booking_events SET at = now() - interval '61 minutes'`)
  await asAnon()
  const later = await gbook(fresh, { room: r1.id, day: D1, from: 900, to: 960, title: 'One more', sub: HK, dept: 'Warehouse', name: 'Wong', pax: 2 })
  check(/^BK-G\d+$/.test(later.ref), true, 'an hour later it books again')
  await db.exec('RESET ROLE')
  await q(`INSERT INTO meeting_room_booking_events(booking_id, what, actor_name) SELECT $1, 'Cancelled via guest link', 'Script' FROM generate_series(1, 40)`, [g2.id])
  await asAnon()
  await reject(`SELECT public.guest_link_cancel($1, $2, 'Siti')`, [fresh, later.id], /Too many requests from the guest link just now/,
    'forty cancellations this hour: the 41st waits')
  check((await q(`SELECT public.guest_link_day($1, $2::date) AS r`, [fresh, D1]))[0].r.some(b => b.id === later.id), true, 'and the meeting stays')
  await db.exec('RESET ROLE')
  await q(`UPDATE meeting_room_booking_events SET at = now() - interval '61 minutes' WHERE what = 'Cancelled via guest link'`)
  await asAnon()
  check((await q(`SELECT public.guest_link_cancel($1, $2, 'Siti') AS r`, [fresh, later.id]))[0].r.title, 'One more', 'an hour later it cancels again')

  await as(ADMIN, ['guest_link.edit'])
  await q(`SELECT public.guest_link_set(NULL, NULL, false, NULL)`)
  await asAnon()
  await reject(`INSERT INTO storage.objects(bucket_id, name) VALUES ('hiring-files', $1)`, [`guest/${fresh}/22222222-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`], /row-level security/,
    'Request manpower off: no file goes in')
  await reject(HIRE, [fresh, HK, 'Wong', '{}', null, null], /This link is closed/, 'and no request')
  check((await q(`SELECT public.guest_link_page($1) AS r`, [fresh]))[0].r.hiring, false, 'and the page knows')
  await db.exec('RESET ROLE')
  check(await Promise.all(['public.guest_link_hire(text, uuid, text, jsonb, text, text)', 'public.guest_link_may_upload(text)'].map(anonMay)), [true, true],
    'the request and the upload question are the link’s too')

  // ── 20261011150000 + 150100: an HQ meeting booked for somebody else says who made it, on the guest page too ──
  await db.exec(`CREATE FUNCTION public.current_tabs() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT NULL::jsonb $$`)
  for (const f of ['20261011150000_rooms_on_behalf_and_app_ticks.sql', '20261011150100_guest_day_on_behalf.sql']) {
    await db.exec((await readFile(new URL(f, migrations), 'utf8')).replace(/\r\n/g, '\n'))
  }
  const DAY_SWAP = (await readFile(new URL('20261011150100_guest_day_on_behalf.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  const dayBody = () => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'guest_link_day'`)
  const swappedDay = await dayBody()
  await db.exec(DAY_SWAP)
  check(await dayBody(), swappedDay, 'the guest day is swapped once, however often it runs')
  await q(`INSERT INTO hr_staff_costs(id, employee_name, department_id) VALUES ($1, 'Chea Huan', $2)`, [id(77), HR])
  await as(ADMIN, ['rooms.view', 'rooms.create'])
  const forHim = (await q(`SELECT public.meeting_rooms_book(NULL, $1, $2::date, 1020, 1080, 'Interview', $3, $4, ARRAY[$4]::uuid[], '[]'::jsonb, 2) AS r`,
    [r1.id, D13, HR, id(77)]))[0].r
  await asAnon()
  check((await q(`SELECT public.guest_link_day($1, $2::date) AS r`, [fresh, D13]))[0].r.filter(b => b.id === forHim.id).map(b => [b.title, b.by, b.onBehalfBy]),
    [['Interview', 'Chea Huan', 'Grace Lim']], 'the guest sees Grace booked it for Chea Huan')
  check(await anonMay('public.guest_link_day(text, date)'), true, 'and the day stays the link’s')

  // ── 20261012220000: Request manpower's Department is the company's own, as Book a meeting room's (the user, 2026-10-12) ──
  await db.exec('RESET ROLE')
  const COMPANY_DEPTS = (await readFile(new URL('20261012220000_guest_hire_company_departments.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  const hireBody = () => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'guest_link_hire'`)
  const hireBefore = await hireBody()
  await db.exec(COMPANY_DEPTS)
  const hireAfter = await hireBody()
  check(hireAfter !== hireBefore, true, 'the request is swapped')
  await db.exec(COMPANY_DEPTS)
  check(await hireBody(), hireAfter, 'once, however often it runs')
  check(await anonMay('public.guest_link_hire(text, uuid, text, jsonb, text, text)'), true, 'and stays the link’s')
  await as(ADMIN, ['guest_link.edit'])
  await q(`SELECT public.guest_link_set(NULL, NULL, true, NULL)`)
  await asAnon()
  const ask = (sub, answers) => q(HIRE, [fresh, sub, 'Wong', JSON.stringify(answers), null, null]).then(r => r[0].r)
  await reject(HIRE, [fresh, HK, 'Wong', JSON.stringify({ position: 'Driver', dept: 'Finance' }), null, null],
    /Pick a department from Hookka Sdn Bhd's list — reload the page if it has changed\./, 'HQ’s departments are not the company’s')
  await reject(HIRE, [fresh, HK, 'Wong', JSON.stringify({ position: 'Driver', dept: 'warehouse' }), null, null],
    /Pick a department from Hookka Sdn Bhd's list/, 'one of them exactly as listed')
  check((await ask(HK, { position: 'Driver', dept: ' Delivery ' })).position, 'Driver', 'one of the company’s goes through')
  await reject(HIRE, [fresh, CON, 'Ali', JSON.stringify({ position: 'Cleaner', dept: 'x'.repeat(61) }), null, null],
    /Keep the department under 60 characters\./, 'a company with none listed: the guest’s own words, no longer than a listed one')
  check((await ask(CON, { position: 'Cleaner', dept: 'Housekeeping' })).position, 'Cleaner', 'which go through')
  check((await ask(HK, { position: 'Packer' })).position, 'Packer', 'left empty, it is the Hiring module’s to ask for (its own check)')
  await db.exec('RESET ROLE')
  check(await q(`SELECT company, department, answers ->> 'dept' AS dept FROM hire_calls WHERE answers ->> 'position' IN ('Cleaner', 'Packer') OR answers ? 'dept' ORDER BY answers ->> 'position'`),
    [{ company: 'The Cont', department: null, dept: 'Housekeeping' }, { company: 'Hookka Sdn Bhd', department: null, dept: ' Delivery ' },
     { company: 'Hookka Sdn Bhd', department: null, dept: null }],
    'the answer stays the role’s Department; the guest’s own department is still not asked')

  console.log(`guest link: ${checks} checks passed`)
} finally {
  await db.close()
}

// Local PostgreSQL regression for 20261020230000 (2026-10-20, the user: "凡是有提到 address 的东西 … 填写的 format 要区分成
// address 1、address 2、postcode、state、city，国家 default 是 Malaysia"; "go with state, city, postcode"). The migration runs
// VERBATIM over production's own team_directory, my_record, att_profile_changes and att_profile_apply
// (structured-address-production.sql, each md5-checked first), a stand-in staff table with the columns they read, and
// stand-ins for the helpers they ask (has_perm, current_actions, sees_sensitive, att_my_staff_id …). What is under
// test: the six parts and their grant; the one line `address_compose` puts them on — the app's `addressText` word for
// word (src/lib/address/address.test.ts holds the same examples); the trigger that keeps `address` in step with the
// parts and leaves an older record's own text alone; a directory reader's rows and Me's own record carrying the parts;
// a profile change naming them, and its approval writing them. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

const HR = id(1) // HR's login
const CHEA_LOGIN = id(2) // CHEA HUAN's own login
const REV = id(11)
const CHEA = id(21)
const LOO = id(22)
const NEWBIE = id(23)
const REQUEST = id(31)

/** Sign in as `user`; `reach` = Team · View's reach; `actions`/`perms` what the stand-ins answer. */
async function as(user, { reach = 'all', staff = null } = {}) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false),
                        set_config('test.reach', '${reach}', false),
                        set_config('test.staff', '${staff ?? ''}', false)`)
}
const md5 = name => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = $1`, [name])
const compose = (...parts) => one(`SELECT public.address_compose($1, $2, $3, $4, $5, $6)`, parts)
const row = sid => q(`SELECT address, address_line1, address_line2, address_postcode, address_city, address_state, address_country FROM hr_staff_costs WHERE id = $1`, [sid]).then(r => r[0])

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text, role text, is_active boolean DEFAULT true, last_seen_at timestamptz, updated_at timestamptz);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text, payroll_source text, segment_key text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text, level_id uuid, template_id uuid, is_department_head boolean);
    -- The staff table with every column the four read (production's names and types).
    CREATE TABLE hr_staff_costs(
      id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, designation text, status text DEFAULT 'active',
      department_id uuid, home_sub_department_id uuid, title_id uuid, reports_to uuid, user_id uuid, infotech_code text,
      hire_date date, resignation_date date, employment_type text, tax_mode text, epf_category text, socso_category text,
      is_epf_exempt boolean, pcb_category text, children_count int, contact_number text, email text, address text,
      emergency_contact_name text, emergency_contact_phone text, emergency_contact_relationship text,
      bank_name text, bank_name_2 text, created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
      basic_salary numeric, allowances numeric, non_statutory_allowance numeric, epf_er numeric, socso_er numeric, eis_er numeric,
      total_ctc numeric, withholding_rate numeric, nric text, bank_account_no text, bank_account_no_2 text, photo_path text,
      first_name text, last_name text
    );
    CREATE TABLE att_requests(id uuid PRIMARY KEY, kind text NOT NULL, staff_id uuid, detail jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE att_events(kind text, ref text, staff uuid, what text, note text);
    -- The helpers the four ask: a reader of the whole team, HR's view; Me's own record by the login.
    CREATE FUNCTION public.has_perm(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p IN ('team', 'team_directory') $$;
    CREATE FUNCTION public.current_actions() RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT jsonb_build_object('team.view', current_setting('test.reach', true)) $$;
    CREATE FUNCTION public.sees_sensitive(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.current_user_department_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.att_my_staff_id() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('test.staff', true), '')::uuid $$;
    CREATE FUNCTION public.att_event(p_kind text, p_ref text, p_staff uuid, p_what text, p_note text) RETURNS void LANGUAGE sql AS
      $$ INSERT INTO att_events VALUES (p_kind, p_ref, p_staff, p_what, p_note) $$;
  `)
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department', 'commission', 'revenue')`, [REV])
  await q(`INSERT INTO users(id, name, email, role) VALUES ($1, 'HR Manager', 'hr@venture.my', 'hr'), ($2, 'CHEA HUAN', 'chea@houzs.my', NULL)`, [HR, CHEA_LOGIN])
  await q(`INSERT INTO auth.users VALUES ($1, 'hr@venture.my'), ($2, 'chea@houzs.my')`, [HR, CHEA_LOGIN])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, first_name, last_name, employee_code, department_id, user_id, contact_number, address)
           VALUES ($1, 'CHEA HUAN', 'CHEA HUAN', 'Teoh', 'HV009', $4, $5, '016-000 0000', 'No83, Jalan Jambu 3, Machang Bubok, 14000, Bukit Mertajam, Pulau Pinang'),
                  ($2, 'LOO WEN WEI', 'WEN WEI', 'LOO', 'HV001', $4, NULL, NULL, NULL),
                  ($3, 'NEW BIE', 'NEW', 'BIE', 'HV099', $4, NULL, NULL, NULL)`, [CHEA, LOO, NEWBIE, REV, CHEA_LOGIN])

  // ── Production's four bodies, as they are ──
  await db.exec(await text(new URL('./structured-address-production.sql', import.meta.url)))
  const before = {
    team_directory: await md5('team_directory'),
    my_record: await md5('my_record'),
    att_profile_changes: await md5('att_profile_changes'),
    att_profile_apply: await md5('att_profile_apply'),
  }
  check(before, {
    team_directory: '1e99de7df0dd0925cfc00feb4fdb412a',
    // Production's own text ends its lines \r\n; read with \n it is this.
    my_record: 'e88f9347bb502f71146a7a5f7bb91564',
    att_profile_changes: '0523f3b4003e4a011efdcd954efefcbf',
    att_profile_apply: '833ca652bcef25ca7a61970c52134951',
  }, 'production’s bodies, as read on 2026-10-20')

  // ── The migration, verbatim — twice is once ──
  const MIGRATION = await text(new URL('20261020230000_structured_address.sql', migrations))
  await db.exec(MIGRATION)
  const after = Object.fromEntries(await Promise.all(Object.keys(before).map(async n => [n, await md5(n)])))
  check(Object.keys(before).filter(n => before[n] === after[n]), [], 'each of the four swapped')
  await db.exec(MIGRATION)
  check(Object.fromEntries(await Promise.all(Object.keys(before).map(async n => [n, await md5(n)]))), after, 'a second run changes nothing')
  check(await one(`SELECT count(*)::int FROM information_schema.columns WHERE table_name = 'hr_staff_costs' AND column_name LIKE 'address\\_%'`), 6, 'six parts')
  for (const col of ['address_line1', 'address_line2', 'address_postcode', 'address_city', 'address_state', 'address_country']) {
    check(await one(`SELECT has_column_privilege('authenticated', 'public.hr_staff_costs', $1, 'SELECT')`, [col]), true, `${col} is read like every column a page reads`)
  }
  check(await one(`SELECT has_function_privilege('anon', 'public.address_compose(text, text, text, text, text, text)', 'EXECUTE')`), false, 'anon may not call it')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.address_compose(text, text, text, text, text, text)', 'EXECUTE')`), true, 'a session writing a row may')

  // ── One line, as the app's addressText puts it (src/lib/address/address.test.ts: the same examples) ──
  check(await compose('No 83, Jalan Jambu 3', 'Machang Bubok', '14000', 'Bukit Mertajam', 'Pulau Pinang', 'Malaysia'),
    'No 83, Jalan Jambu 3, Machang Bubok, 14000 Bukit Mertajam, Pulau Pinang, Malaysia', 'every part')
  check(await compose('  No 8,   Jalan Mawar 2 ', '', '82100', 'Ayer Baloi', 'Johor', null),
    'No 8, Jalan Mawar 2, 82100 Ayer Baloi, Johor, Malaysia', 'trimmed, a run of spaces one, no line 2, Malaysia when none')
  check(await compose('1 Raffles Place', null, '048616', 'Singapore', '', 'Singapore'), '1 Raffles Place, 048616 Singapore, Singapore', 'abroad: no state')
  check(await compose('Lot 5', null, null, 'Kota Kinabalu', 'Sabah', 'Malaysia'), 'Lot 5, Kota Kinabalu, Sabah, Malaysia', 'no postcode: the city alone')
  check(await compose(null, ' ', '', null, null, 'Malaysia'), null, 'the country alone is no address')

  // ── The trigger keeps `address` in step with the parts ──
  check((await row(CHEA)).address, 'No83, Jalan Jambu 3, Machang Bubok, 14000, Bukit Mertajam, Pulau Pinang', 'an older record’s own text is left as it was')
  await q(`UPDATE hr_staff_costs SET contact_number = '016-111 1111' WHERE id = $1`, [CHEA])
  check((await row(CHEA)).address, 'No83, Jalan Jambu 3, Machang Bubok, 14000, Bukit Mertajam, Pulau Pinang', 'another field written: left alone')
  await q(`UPDATE hr_staff_costs SET address_line1 = 'No 83, Jalan Jambu 3', address_line2 = 'Machang Bubok', address_postcode = '14020',
             address_city = 'Bukit Mertajam', address_state = 'Pulau Pinang', address_country = 'Malaysia' WHERE id = $1`, [CHEA])
  check((await row(CHEA)).address, 'No 83, Jalan Jambu 3, Machang Bubok, 14020 Bukit Mertajam, Pulau Pinang, Malaysia', 'its parts written: put together')
  await q(`UPDATE hr_staff_costs SET address_postcode = '14000' WHERE id = $1`, [CHEA])
  check((await row(CHEA)).address, 'No 83, Jalan Jambu 3, Machang Bubok, 14000 Bukit Mertajam, Pulau Pinang, Malaysia', 'one part changed: put together again')
  await q(`UPDATE hr_staff_costs SET address_postcode = '14000', address = 'typed straight' WHERE id = $1`, [CHEA])
  check((await row(CHEA)).address, 'typed straight', 'a part sent unchanged with the old box: the box as written (only an older writer does it)')
  await q(`UPDATE hr_staff_costs SET address_line2 = NULL WHERE id = $1`, [CHEA])
  check((await row(CHEA)).address, 'No 83, Jalan Jambu 3, 14000 Bukit Mertajam, Pulau Pinang, Malaysia', 'a part cleared: put together without it')
  await q(`INSERT INTO hr_staff_costs(id, employee_name, address_line1, address_postcode, address_city, address_state, address_country)
           VALUES ($1, 'ADDED', 'No 8, Jalan Mawar 2', '82100', 'Ayer Baloi', 'Johor', 'Malaysia')`, [id(24)])
  check((await row(id(24))).address, 'No 8, Jalan Mawar 2, 82100 Ayer Baloi, Johor, Malaysia', 'a new person with parts: put together')
  await q(`INSERT INTO hr_staff_costs(id, employee_name, address) VALUES ($1, 'OLD WAY', 'somewhere')`, [id(25)])
  check((await row(id(25))).address, 'somewhere', 'a new person with only the box: kept')
  await q(`UPDATE hr_staff_costs SET address_line1 = NULL, address_postcode = NULL, address_city = NULL, address_state = NULL, address_country = NULL WHERE id = $1`, [id(24)])
  check((await row(id(24))).address, null, 'every part cleared: no address')

  // ── A directory reader's rows and Me's own record carry the parts ──
  await as(HR, { reach: 'all' })
  const dir = Object.fromEntries((await one(`SELECT public.team_directory(NULL)`)).map(r => [r.id, r]))
  check([dir[CHEA].address_line1, dir[CHEA].address_postcode, dir[CHEA].address_city, dir[CHEA].address_state, dir[CHEA].address_country, dir[CHEA].address],
    ['No 83, Jalan Jambu 3', '14000', 'Bukit Mertajam', 'Pulau Pinang', 'Malaysia', 'No 83, Jalan Jambu 3, 14000 Bukit Mertajam, Pulau Pinang, Malaysia'], 'the directory: the six parts and the line')
  check([dir[CHEA].first_name, dir[CHEA].last_name, dir[LOO].first_name, dir[LOO].last_name], ['CHEA HUAN', 'Teoh', 'WEN WEI', 'LOO'], 'and the first and last names')
  check(Object.keys(dir[CHEA]).length, Object.keys(dir[LOO]).length, 'every row the same keys')
  await as(CHEA_LOGIN, { staff: CHEA })
  const me = await one(`SELECT public.my_record()`)
  check([me.addressLine1, me.addressLine2, me.addressPostcode, me.addressCity, me.addressState, me.addressCountry, me.address],
    ['No 83, Jalan Jambu 3', null, '14000', 'Bukit Mertajam', 'Pulau Pinang', 'Malaysia', 'No 83, Jalan Jambu 3, 14000 Bukit Mertajam, Pulau Pinang, Malaysia'], 'Me’s own record')

  // ── A profile change names the parts; its approval writes them ──
  const changes = list => one(`SELECT public.att_profile_changes($1, $2::jsonb)`, [CHEA, JSON.stringify({ changes: list })])
  const sent = await changes([
    { key: 'address_line1', to: 'No 8, Jalan Sukun 18' }, { key: 'address_line2', to: 'Taman Sukun' }, { key: 'address_state', to: 'Pulau Pinang' },
    { key: 'address_city', to: 'Bukit Mertajam' }, { key: 'address_postcode', to: '14000' }, { key: 'address_country', to: 'Malaysia' },
  ])
  check(sent.changes.map(c => [c.key, c.field, c.from, c.to]), [
    ['address_line1', 'Address line 1', 'No 83, Jalan Jambu 3', 'No 8, Jalan Sukun 18'],
    ['address_line2', 'Address line 2', null, 'Taman Sukun'],
  ], 'the six sent, the two that differ kept, in its own words')
  await reject(`SELECT public.att_profile_changes($1, $2::jsonb)`, [CHEA, JSON.stringify({ changes: [{ key: 'address_state', to: 'Pulau Pinang' }] })],
    /Nothing to change/, 'the record already says that')
  await reject(`SELECT public.att_profile_changes($1, $2::jsonb)`, [CHEA, JSON.stringify({ changes: [{ key: 'address_zone', to: 'x' }] })],
    /not changed by request/, 'a key it does not know')
  await q(`INSERT INTO att_requests VALUES ($1, 'profile', $2, $3::jsonb)`, [REQUEST, CHEA, JSON.stringify(sent)])
  await as(HR)
  await q(`SELECT public.att_profile_apply($1)`, [REQUEST])
  check(await row(CHEA), {
    address: 'No 8, Jalan Sukun 18, Taman Sukun, 14000 Bukit Mertajam, Pulau Pinang, Malaysia',
    address_line1: 'No 8, Jalan Sukun 18', address_line2: 'Taman Sukun', address_postcode: '14000',
    address_city: 'Bukit Mertajam', address_state: 'Pulau Pinang', address_country: 'Malaysia',
  }, 'approved: the parts written, the line put together')
  check(await q(`SELECT what, note FROM att_events WHERE ref = $1`, [REQUEST]), [{ what: 'Record updated', note: 'Address line 1 · Address line 2' }], 'its event names them')

  console.log(`validate-structured-address: ${checks} checks passed`)
} finally {
  await db.close()
}

// Local PostgreSQL regression for 20261010010000 (PR4b of the People
// Management revamp, 2026-10-10 — the user chose 1b and 2b): Team · View
// without the Salary tick opens People through two readers, never the staff
// table. The permission world reduced to what the readers ask (keys, the
// actions' reaches, the ticks, the department), production's columns, and
// seven people: HR (the `team` key, every tick), the Executive office (Team ·
// View at All, no ticks), a Department head (Team · View at Dept), a Director-
// like title (Team · View at All with Salary amounts), somebody at Own, a
// title with no Team · View, and a forged session holding the action without
// the key. Then the migration VERBATIM: the directory hands each exactly the
// rows their reach covers, pay only with Salary amounts, NRIC / accounts as
// their ticks say; the chart hands every Team · View holder everybody active,
// names and titles only; nobody else gets anything. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const migrations = new URL('../../supabase/migrations/', import.meta.url)
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const DEPT = { hr: id(101), marketing: id(102), finance: id(103) }
const HR = id(1), OFFICE = id(2), HEAD = id(3), DIRECTOR = id(4), SELF = id(5), STAFF = id(6), FORGED = id(7)

const PERSONAS = [
  // uid, keys, actions (current_actions), ticks, department
  [HR, ['team', 'hr_costing', 'salary_individual'], { 'team.view': 'all', 'team.edit': 'all' }, ['bank', 'nric', 'salary'], DEPT.hr],
  [OFFICE, ['dashboard', 'team_directory'], { 'team.view': 'all' }, [], DEPT.hr],
  [HEAD, ['dept_pool', 'team_directory'], { 'team.view': 'dept' }, [], DEPT.marketing],
  [DIRECTOR, ['team_directory', 'salary_individual'], { 'team.view': 'all' }, ['salary'], DEPT.finance],
  [SELF, ['team_directory'], { 'team.view': 'own' }, [], DEPT.finance],
  [STAFF, ['dashboard', 'claims'], { 'claims.view': 'own' }, [], DEPT.marketing],
  [FORGED, [], { 'team.view': 'all' }, [], DEPT.hr],
]

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

  CREATE TABLE persona(uid uuid PRIMARY KEY, keys text[] NOT NULL, actions jsonb NOT NULL, sensitive text[] NOT NULL, dept uuid);
  CREATE FUNCTION public.current_permissions() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT coalesce((SELECT keys FROM persona WHERE uid = auth.uid()), '{}'::text[]) $$;
  CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT p_key = ANY (public.current_permissions()) $$;
  CREATE FUNCTION public.current_actions() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT coalesce((SELECT actions FROM persona WHERE uid = auth.uid()), '{}'::jsonb) $$;
  CREATE FUNCTION public.sees_sensitive(p_field text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT p_field = ANY (coalesce((SELECT sensitive FROM persona WHERE uid = auth.uid()), '{}'::text[])) $$;
  CREATE FUNCTION public.current_user_department_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS $$ SELECT dept FROM persona WHERE uid = auth.uid() $$;

  -- The catalog the migration writes into (production's keys and checks).
  CREATE TABLE public.permission_defs(key text PRIMARY KEY, label text NOT NULL, section text NOT NULL,
    scope text NOT NULL CHECK (scope IN ('admin', 'treasury', 'hr', 'shared', 'none')), description text, sort_order int NOT NULL DEFAULT 0);
  CREATE TABLE public.permission_cell_keys(function_key text NOT NULL, action text NOT NULL, legacy_key text NOT NULL REFERENCES public.permission_defs(key),
    min_scope text NOT NULL, gate text, PRIMARY KEY (function_key, action, legacy_key));
  INSERT INTO public.permission_defs(key, label, section, scope) VALUES ('team', 'Team', 'People', 'hr');
  INSERT INTO public.permission_cell_keys VALUES ('team', 'view', 'team', 'all', 'salary');

  -- Production's tables, every column the readers name (hr_staff_costs: all 42).
  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text NOT NULL, role text NOT NULL, is_active boolean NOT NULL DEFAULT true, last_seen_at timestamptz);
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL, payroll_source text, segment_key text);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, level_id uuid, template_id uuid, is_department_head boolean NOT NULL DEFAULT false);
  CREATE TABLE public.hr_staff_costs(
    id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, basic_salary numeric NOT NULL DEFAULT 0,
    allowances numeric NOT NULL DEFAULT 0, epf_er numeric NOT NULL DEFAULT 0, socso_er numeric NOT NULL DEFAULT 0,
    eis_er numeric NOT NULL DEFAULT 0, total_ctc numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active',
    created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
    non_statutory_allowance numeric NOT NULL DEFAULT 0, employee_code text, hire_date date, resignation_date date,
    epf_category text, socso_category text, is_epf_exempt boolean NOT NULL DEFAULT false, pcb_category text,
    children_count int NOT NULL DEFAULT 0, employment_type text, bank_name text, bank_account_no text, nric text,
    address text, contact_number text, email text, emergency_contact_name text, emergency_contact_phone text,
    emergency_contact_relationship text, designation text, tax_mode text, withholding_rate numeric, title_id uuid,
    user_id uuid, reports_to uuid, bank_name_2 text, bank_account_no_2 text, infotech_code text, home_sub_department_id uuid);
  CREATE TABLE public.comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.comm_sub_department_directors(staff_id uuid NOT NULL, sub_department_id uuid NOT NULL);
  -- The table itself is nobody's but HR's to read (production: has_scope('hr'), may_read).
  ALTER TABLE public.hr_staff_costs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY hr_staff_costs_ph_select ON public.hr_staff_costs FOR SELECT USING (public.has_perm('team'));
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
`)
for (const [uid, keys, actions, sensitive, dept] of PERSONAS) {
  await q('INSERT INTO persona VALUES ($1, $2, $3, $4, $5)', [uid, keys, JSON.stringify(actions), sensitive, dept])
}
await q(`INSERT INTO public.departments VALUES ($1, 'HR', 'imported', NULL), ($2, 'Marketing', 'imported', 'marketing'), ($3, 'Finance', 'imported', NULL)`,
  [DEPT.hr, DEPT.marketing, DEPT.finance])
await q(`INSERT INTO public.titles VALUES ($1, 'MARKETING MANAGER', NULL, NULL, false), ($2, 'GRAPHIC DESIGNER', NULL, NULL, false),
  ($3, 'ACCOUNTS EXECUTIVE', NULL, NULL, false), ($4, 'Revenue Director', NULL, NULL, true)`, [id(201), id(202), id(203), id(204)])
await q(`INSERT INTO public.users VALUES ($1, 'Selina', 'selina@venture.my', 'staff', true, now())`, [SELF])
// AMY heads Marketing; BEN works under her; CARA is in Finance (and is SELF's own row); DAN left Marketing.
await q(`INSERT INTO public.hr_staff_costs(id, employee_name, department_id, basic_salary, allowances, total_ctc, employee_code, hire_date,
    contact_number, address, emergency_contact_name, nric, bank_name, bank_account_no, bank_account_no_2, title_id, user_id, reports_to, status)
  VALUES
    ($1, 'AMY', $5, 6500, 300, 7400, 'HV010', '2024-01-02', '012-1111111', '1 Jalan Satu', 'AMY MUM', '850101141234', 'Maybank', '1234567890', '', $8, NULL, NULL, 'active'),
    ($2, 'BEN', $5, 3200, 0, 3700, 'HV011', '2025-03-04', '012-2222222', '2 Jalan Dua', NULL, NULL, 'CIMB', NULL, NULL, $9, NULL, $1, 'active'),
    ($3, 'CARA', $6, 4100, 100, 4800, 'HV012', '2023-05-06', '012-3333333', NULL, NULL, '900202081111', 'RHB', '5555666677', NULL, $10, $7, NULL, 'active'),
    ($4, 'DAN', $5, 2800, 0, 3200, 'HV013', '2022-07-08', NULL, NULL, NULL, '', NULL, NULL, NULL, $9, NULL, $1, 'inactive')`,
  [id(11), id(12), id(13), id(14), DEPT.marketing, DEPT.finance, SELF, id(201), id(202), id(203)])
await q(`INSERT INTO public.comm_sub_departments VALUES ($1, 'IR', $2, '2026-09-10', true), ($3, 'Closed', $2, '2026-01-01', false)`,
  [id(301), DEPT.hr, id(302)])
await q(`INSERT INTO public.comm_sub_department_directors VALUES ($1, $2)`, [id(11), id(301)])

// ── The migration, verbatim ──────────────────────────────────────────────────
await db.exec(await migrationText('20261010010000_team_directory'))
// …and once more: it is safe to run twice (a replay, a re-applied file).
await db.exec(await migrationText('20261010010000_team_directory'))

async function as(uid, sql, params = []) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid ?? ''])
  await db.exec(uid === 'anon' ? 'SET ROLE anon' : 'SET ROLE authenticated')
  try {
    return await q(sql, params)
  } catch (error) {
    if (/permission denied/i.test(error.message)) return 'denied'
    throw error
  } finally {
    await db.exec('RESET ROLE')
    await q("SELECT set_config('request.jwt.claim.sub', '', false)")
  }
}
const directory = async (uid, ids = null) => {
  const rows = await as(uid, 'SELECT public.team_directory($1::uuid[]) AS d', [ids])
  return rows === 'denied' ? rows : rows[0].d
}
const names = rows => rows.map(r => r.employee_name)
const chart = async uid => {
  const rows = await as(uid === 'anon' ? 'anon' : uid, 'SELECT public.team_org_chart() AS c')
  return rows === 'denied' ? rows : rows[0].c
}

// ── The key: no domain, opened by Team · View at any reach ───────────────────
check(await q(`SELECT key, scope, section FROM public.permission_defs WHERE key = 'team_directory'`),
  [{ key: 'team_directory', scope: 'none', section: 'People' }], 'team_directory is a key with no domain: no row policy opens for it')
check(await q(`SELECT min_scope, gate FROM public.permission_cell_keys WHERE legacy_key = 'team_directory'`),
  [{ min_scope: 'own', gate: null }], 'Team · View opens it at any reach, with no Salary gate')

// ── The table stays shut; the directory answers by reach ─────────────────────
check(await as(OFFICE, 'SELECT count(*)::int AS n FROM public.hr_staff_costs'), [{ n: 0 }],
  'the Executive office reads no staff row straight off the table')
check(await as(HR, 'SELECT count(*)::int AS n FROM public.hr_staff_costs'), [{ n: 4 }], 'HR still reads the table')

const office = await directory(OFFICE)
check(names(office), ['AMY', 'BEN', 'CARA', 'DAN'], 'Team · View at All: everybody, every status (the roster filters by status)')
check(office.map(r => [r.basic_salary, r.allowances, r.total_ctc, r.non_statutory_allowance, r.epf_er, r.withholding_rate]),
  office.map(() => [null, null, null, null, null, null]), 'no Salary amounts tick: every pay figure is NULL')
check(office.map(r => r.nric), ['••••', null, '••••', ''], 'no NRIC tick: •••• where on file, NULL and blank as they are')
check(office.map(r => [r.bank_account_no, r.bank_account_no_2]), [['••••', ''], [null, null], ['••••', null], [null, null]],
  'no Bank tick: the account numbers ••••, blanks blank')
const amy = office[0]
check([amy.contact_number, amy.address, amy.emergency_contact_name, amy.bank_name, amy.employee_code, amy.hire_date],
  ['012-1111111', '1 Jalan Satu', 'AMY MUM', 'Maybank', 'HV010', '2024-01-02'], '1b: everything but pay, NRIC and accounts — contact, address, emergency contact, the bank\'s name')
check([amy.departments.name, amy.titles.name, office[2].users?.email], ['Marketing', 'MARKETING MANAGER', 'selina@venture.my'],
  'the department, the title and the login come with the row')

check(names(await directory(HEAD)), ['AMY', 'BEN', 'DAN'], 'Team · View at Dept: their own department only (2b)')
check(await directory(HEAD, [id(13)]), [], 'asking for somebody outside the department answers nobody')
check(names(await directory(SELF)), ['CARA'], 'Team · View at Own: their own row')

const director = await directory(DIRECTOR)
check(director.map(r => [r.employee_name, Number(r.basic_salary)]), [['AMY', 6500], ['BEN', 3200], ['CARA', 4100], ['DAN', 2800]],
  'Salary amounts ticked: the pay figures come back')
check(director.map(r => r.nric), ['••••', null, '••••', ''], '…but NRIC stays •••• without its own tick')

const hr = await directory(HR)
check(hr.map(r => r.nric), ['850101141234', null, '900202081111', ''], 'HR, every tick: the real numbers')
check(hr.map(r => r.bank_account_no), ['1234567890', null, '5555666677', null], 'HR, every tick: the real account numbers')

check(await directory(STAFF), [], 'no Team · View: nothing')
check(await directory(FORGED), [], 'the action without either key: nothing')
check(await directory(null), [], 'a session with no person: nothing')
check(await directory('anon'), 'denied', 'the publishable key may not call it')

// A column added to the table later stays out until somebody names it.
await db.exec('ALTER TABLE public.hr_staff_costs ADD COLUMN secret_note text')
await q(`UPDATE public.hr_staff_costs SET secret_note = 'x'`)
check((await directory(OFFICE)).some(r => 'secret_note' in r), false, 'columns are named one by one: a new one is not handed out')

// ── The chart: everybody active, names and titles, for any Team · View ───────
const officeChart = await chart(OFFICE)
check(officeChart.people.map(p => p.employee_name), ['AMY', 'BEN', 'CARA'], 'the chart is the active people only')
check(Object.keys(officeChart.people[0]).sort(),
  ['department_id', 'departments', 'designation', 'employee_code', 'employee_name', 'id', 'reports_to', 'title_id', 'titles'],
  'a chart card carries names, titles and lines — no contact, no pay, no NRIC')
check((await chart(HEAD)).people.map(p => p.employee_name), ['AMY', 'BEN', 'CARA'], '2b: a Department head reads the WHOLE company\'s chart')
check((await chart(SELF)).people.length, 3, 'Own reach: the chart too')
check(officeChart.sub_departments.map(s => s.name), ['IR'], 'the open sub-departments, so a Revenue tree hangs from its director')
check(officeChart.directors, [{ staff_id: id(11), sub_department_id: id(301) }], '…and who directs each')
check(await chart(STAFF), null, 'no Team · View: no chart')
check(await chart(FORGED), null, 'the action without a key: no chart')
check(await chart('anon'), 'denied', 'the publishable key may not call it')

// ── Grants ───────────────────────────────────────────────────────────────────
check(await q(`SELECT has_function_privilege('anon', 'public.team_directory(uuid[])', 'EXECUTE') AS a,
                      has_function_privilege('authenticated', 'public.team_directory(uuid[])', 'EXECUTE') AS b,
                      has_function_privilege('anon', 'public.team_org_chart()', 'EXECUTE') AS c,
                      has_function_privilege('authenticated', 'public.team_org_chart()', 'EXECUTE') AS d`),
  [{ a: false, b: true, c: false, d: true }], 'signed-in sessions only')

console.log(`validate-team-directory: ${checks} checks passed`)

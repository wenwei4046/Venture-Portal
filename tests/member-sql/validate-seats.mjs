// Local PostgreSQL regression for 20261011040000 (2026-10-11): a seat counts
// only somebody still working, and a leaver's opens on the spot — the user's
// "only calculate occupied" and "if leave, on the spot open position". The
// three functions are built from the repo copies production ran (their md5s
// are the migration's guard), then the migration runs VERBATIM. What is under
// test: a sub-department's places leave out whoever has left or passed their
// last day; a leader's direct line taken by a leaver is free for somebody new;
// a line is counted only up to its holder's resignation date; and the Revenue
// app's own counts now ask the same rule. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
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

const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

/** One function as a repo migration wrote it — the body production ran — by its exact signature. */
async function productionFunction(migration, signature) {
  const sql = await migrationText(migration)
  const head = new RegExp(`create (?:or replace )?function public\\.${signature.replace(/[()]/g, c => `\\${c}`)}`, 'i').exec(sql)
  assert(head, `Missing ${signature} in ${migration}`)
  const at = head.index
  const tag = /\bas\s+(\$\w*\$)/i.exec(sql.slice(at))
  assert(tag, `Missing body of ${signature}`)
  const bodyAt = at + tag.index + tag[0].length
  const end = sql.indexOf(`${tag[1]}`, bodyAt)
  await db.exec(sql.slice(at, end + tag[1].length) + ';')
}

const body = name => one(`SELECT p.prosrc FROM pg_proc p WHERE p.proname = $1 ORDER BY length(p.prosrc) DESC LIMIT 1`, [name])

const FAIR = id(10)
const SCHEME = id(20)
const LEAD_SCHEME = id(22)
const IR_SCHEME = id(21)
const at = (n, from = '2026-01-01', upline = null, scheme = SCHEME) =>
  q('INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, effective_from) VALUES ($1, $2, $3, $4)', [scheme, n, upline, from])

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid,
      status text NOT NULL DEFAULT 'active', resignation_date date);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, code text, department_id uuid,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id),
      direct_line_limit integer, is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL REFERENCES comm_schemes(id),
      staff_id uuid NOT NULL REFERENCES hr_staff_costs(id), upline_staff_id uuid REFERENCES hr_staff_costs(id),
      effective_from date NOT NULL, effective_to date);
    CREATE TABLE comm_direct_line_entitlements(scheme_id uuid, staff_id uuid, opened_direct_line_limit integer);
    -- The limit as the scheme sets it (qualification's openings are not under test).
    CREATE FUNCTION public.comm_effective_direct_line_limit(p_scheme_id uuid, p_staff_id uuid, p_as_of date, p_lock_run boolean)
      RETURNS integer LANGUAGE sql AS $$ SELECT direct_line_limit FROM public.comm_schemes WHERE id = p_scheme_id $$;
  `)

  // ── Production before the fix, from the repo copies it ran ─────────────────
  await productionFunction('20260912040000_member_request_workflows', 'member_occupied(')
  await productionFunction('20260911060000_progressive_ir_direct_lines', 'comm_hierarchy_direct_line_limit()')
  await productionFunction('20261008160000_member_snapshot_first_paint', 'member_data_snapshot(p_full boolean)')
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'member_occupied'"), '2555889f3538e54078e0ee55675b68be', 'member_occupied is production’s')
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'comm_hierarchy_direct_line_limit'"), '6d894fd5c479964f25c698734e3d03c8', 'the direct-line check is production’s')
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'member_data_snapshot'"), '79d03374ab02b2280cc0ca91f9d889b6', 'the member snapshot is production’s')
  await db.exec(`CREATE TRIGGER comm_hierarchy_direct_line_limit BEFORE INSERT OR UPDATE ON comm_hierarchy
    FOR EACH ROW EXECUTE FUNCTION comm_hierarchy_direct_line_limit()`)

  // Fair: two at work, one who left (inactive), one past their resignation date, one leaving next month.
  await q("INSERT INTO comm_sub_departments(id, name, code) VALUES ($1, 'Fair', 'FAIR'), ($2, 'IR', 'IR'), ($3, 'Leaders', 'LEAD')", [FAIR, id(11), id(18)])
  await q('INSERT INTO comm_schemes(id, sub_department_id, direct_line_limit) VALUES ($1, $2, NULL), ($3, $4, 1), ($5, $6, 2)', [SCHEME, FAIR, IR_SCHEME, id(11), LEAD_SCHEME, id(18)])
  const staff = [
    [1, 'ANNA', 'active', null], [2, 'BEN', 'active', null], [3, 'CHEN (left)', 'inactive', '2026-09-24'],
    [4, 'DAN (last day passed)', 'active', '2026-10-05'], [5, 'EVA (leaving)', 'active', '2026-10-31'],
    [6, 'LEADER', 'active', null], [7, 'FAY', 'active', null], [8, 'GUS', 'active', null], [9, 'HAL (left)', 'inactive', '2026-09-24'],
    [12, 'IR LEADER', 'active', null], [13, 'IVY (leaving)', 'active', '2026-10-31'], [14, 'JON', 'active', null], [15, 'KIM', 'active', null],
  ]
  for (const [n, name, status, resigned] of staff) {
    await q('INSERT INTO hr_staff_costs(id, employee_name, status, resignation_date) VALUES ($1, $2, $3, $4)', [id(n), name, status, resigned])
  }
  for (const n of [1, 2, 3, 4, 5]) await at(id(n))
  check(await one('SELECT member_occupied($1, $2)', [FAIR, '2026-10-11']), 5, 'before: every open position takes a place, leavers too')

  // A leader's two lines: one at work, one left. The third would be refused before.
  await at(id(6), '2026-01-01', null, LEAD_SCHEME)
  await at(id(7), '2026-01-01', id(6), LEAD_SCHEME)
  await at(id(9), '2026-01-01', id(6), LEAD_SCHEME)
  await reject('INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, effective_from) VALUES ($1, $2, $3, $4)',
    [LEAD_SCHEME, id(8), id(6), '2026-10-11'], /reached the limit of 2 direct lines/, 'before: the leaver still holds a line')

  // ── The migration, verbatim ───────────────────────────────────────────────
  await db.exec(await migrationText('20261011040000_seats_count_people_still_working'))

  // A sub-department's places
  check(await one('SELECT member_occupied($1, $2)', [FAIR, '2026-10-11']), 3,
    'today: ANNA, BEN and EVA — not CHEN, who left, nor DAN, past his last day')
  check(await one('SELECT member_occupied($1, $2)', [FAIR, '2026-11-01']), 2, 'next month EVA’s place is free too')
  check(await one('SELECT member_occupied($1, $2)', [FAIR, '2026-10-31']), 3, 'on her last day she still has it')

  // A leader's direct lines
  await at(id(8), '2026-10-11', id(6), LEAD_SCHEME)
  check(await one('SELECT count(*)::int FROM comm_hierarchy WHERE upline_staff_id = $1', [id(6)]), 3,
    'the leaver’s line is free: GUS joins, FAY and GUS at work')
  await q("INSERT INTO hr_staff_costs(id, employee_name) VALUES ($1, 'LIM')", [id(16)])
  await reject('INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, effective_from) VALUES ($1, $2, $3, $4)',
    [LEAD_SCHEME, id(16), id(6), '2026-10-11'], /reached the limit of 2 direct lines/, 'two at work still fill two lines')
  await q("INSERT INTO hr_staff_costs(id, employee_name, status) VALUES ($1, 'MOE (left)', 'inactive')", [id(17)])
  await at(id(17), '2026-10-11', id(6), LEAD_SCHEME)
  checks++ // a leaver's own line takes no slot, so it goes in under a full leader

  // A line counts only up to its holder's last day
  await at(id(12), '2026-01-01', null, IR_SCHEME)
  await at(id(13), '2026-01-01', id(12), IR_SCHEME)
  await reject('INSERT INTO comm_hierarchy(scheme_id, staff_id, upline_staff_id, effective_from) VALUES ($1, $2, $3, $4)',
    [IR_SCHEME, id(14), id(12), '2026-10-15'], /reached the limit of 1 direct lines/, 'while IVY is still working, her line is taken')
  await at(id(15), '2026-11-01', id(12), IR_SCHEME)
  checks++ // from the day after IVY's last, KIM takes her line

  // The Revenue app's own counts ask the same rule
  const snapshot = await body('member_data_snapshot')
  check(snapshot.split('public.member_occupied(d.id,v_today)').length - 1, 2, 'both the directory and a membership ask member_occupied')
  check(snapshot.includes('count(DISTINCT x.staff_id)') || snapshot.includes('count(DISTINCT h.staff_id) FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id\n WHERE c.sub_department_id=d.id'),
    false, 'and count nothing of their own')

  // Run twice, it refuses: the bodies are no longer the ones it was written against.
  await assert.rejects(async () => db.exec(await migrationText('20261011040000_seats_count_people_still_working')),
    /not the body this migration was written against/, 'a second run stops at the md5 guard')
  checks++

  console.log(`Seat checks passed: ${checks}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await db.close()
}

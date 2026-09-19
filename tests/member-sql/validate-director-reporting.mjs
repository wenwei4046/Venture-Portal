// Disposable PGlite only. Run the real reporting/sync trigger bodies against a
// minimal surrounding schema, then apply the complete new migration. No auth
// credentials, environment files, Supabase calls, or production data are used.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
const reject = async (sql, params, code) => {
  await assert.rejects(() => q(sql, params), error => error.code === code)
  checks++
}
async function productionFunction(migration, name) {
  const sql = await readFile(new URL(`${migration}.sql`, migrations), 'utf8')
  const start = sql.indexOf(`create or replace function public.${name}(`)
  assert(start >= 0, `Missing production function ${name}`)
  const end = sql.indexOf('$$;', sql.indexOf('as $$', start)) + 3
  await db.exec(sql.slice(start, end))
}
async function productionTrigger(migration, name) {
  const sql = await readFile(new URL(`${migration}.sql`, migrations), 'utf8')
  const start = sql.indexOf(`create trigger ${name}\n`)
  const crlfStart = sql.indexOf(`create trigger ${name}\r\n`)
  const actualStart = start >= 0 ? start : crlfStart
  assert(actualStart >= 0, `Missing production trigger ${name}`)
  await db.exec(sql.slice(actualStart, sql.indexOf(';', actualStart) + 1))
}
const original = '20260910120000_one_line_commission_positions'
const directors = '20260915020000_revenue_directors'
const newMigration = '20260920010000_revenue_director_company_reporting'
const revenue = id(100), company = id(101), otherCompany = id(102)
const headTitle = id(11), ceoTitle = id(12), cooTitle = id(13), lowTitle = id(14)
const recruiterTitle = id(15), specialistTitle = id(16), memberTitle = id(17)
const kris = id(201), peter = id(202), ceo = id(203), coo = id(204), low = id(205)
const manager = id(206), specialist = id(207), member = id(208), outsider = id(209), outsideHead = id(210)
const reportTo = async (staff, target) => q('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [staff, target])
const reportsTo = staff => one('SELECT reports_to FROM hr_staff_costs WHERE id=$1', [staff])
const positions = staff => q('SELECT * FROM comm_hierarchy WHERE staff_id=$1 AND effective_to IS NULL', [staff])

try {
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE departments (id uuid PRIMARY KEY, name text, payroll_source text);
    CREATE TABLE title_levels (id uuid PRIMARY KEY, name text, rank integer);
    CREATE TABLE titles (id uuid PRIMARY KEY, name text, level_id uuid REFERENCES title_levels(id),
      is_department_head boolean NOT NULL DEFAULT false);
    CREATE TABLE hr_staff_costs (id uuid PRIMARY KEY, employee_name text, status text DEFAULT 'active',
      department_id uuid REFERENCES departments(id), title_id uuid REFERENCES titles(id),
      reports_to uuid REFERENCES hr_staff_costs(id), CHECK (reports_to IS NULL OR reports_to <> id));
    CREATE TABLE comm_sub_departments (id uuid PRIMARY KEY, department_id uuid REFERENCES departments(id),
      is_active boolean DEFAULT true, created_at timestamptz DEFAULT now());
    CREATE TABLE comm_schemes (id uuid PRIMARY KEY, sub_department_id uuid REFERENCES comm_sub_departments(id),
      is_active boolean DEFAULT true, effective_from date DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_ranks (id uuid PRIMARY KEY, scheme_id uuid REFERENCES comm_schemes(id),
      title_id uuid REFERENCES titles(id), sort_order integer, can_recruit boolean);
    CREATE TABLE comm_hierarchy (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scheme_id uuid REFERENCES comm_schemes(id), staff_id uuid REFERENCES hr_staff_costs(id),
      title_id uuid REFERENCES titles(id), upline_staff_id uuid REFERENCES hr_staff_costs(id),
      rank_id uuid NOT NULL REFERENCES comm_ranks(id), rate_mode text, effective_from date, effective_to date, created_by uuid);
    CREATE TABLE comm_sub_department_directors (sub_department_id uuid REFERENCES comm_sub_departments(id),
      staff_id uuid REFERENCES hr_staff_costs(id));
  `)
  for (const name of ['comm_period_start', 'comm_scheme_for_department', 'comm_floor_rank', 'hr_staff_commission_line'])
    await productionFunction(original, name)
  for (const name of ['title_is_department_head', 'comm_title_can_recruit', 'comm_ranks_no_department_head',
    'comm_hierarchy_no_department_head', 'comm_sync_position', 'hr_staff_one_line_sync'])
    await productionFunction(directors, name)
  await productionFunction('20260901030000_team_reports_to', 'hr_staff_reports_to_no_cycle')
  await productionFunction('20260903010000_title_levels', 'hr_staff_respects_ladder')
  await productionTrigger(original, 'hr_staff_costs_commission_line')
  await productionTrigger(original, 'hr_staff_costs_one_line_sync')
  await productionTrigger(directors, 'comm_ranks_no_department_head')
  await productionTrigger(directors, 'comm_hierarchy_no_department_head')
  await productionTrigger('20260901030000_team_reports_to', 'hr_staff_costs_reports_to_no_cycle')
  await productionTrigger('20260903010000_title_levels', 'hr_staff_costs_respects_ladder')

  await q('INSERT INTO departments VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$6)',
    [revenue, 'Revenue', 'commission', company, 'Director', 'imported', otherCompany, 'Director Office'])
  for (const rank of [2, 7, 8, 9, 10])
    await q('INSERT INTO title_levels VALUES ($1,$2,$3)', [id(rank), `L${rank}`, rank])
  for (const [title, name, rank, isHead] of [
    [headTitle, 'Revenue Director', 8, true], [ceoTitle, 'CEO', 10, false], [cooTitle, 'COO', 9, false],
    [lowTitle, 'Company Manager', 7, false], [recruiterTitle, 'Revenue Manager', 8, false],
    [specialistTitle, 'Senior Specialist', 8, false], [memberTitle, 'Revenue Specialist', 2, false],
  ]) await q('INSERT INTO titles VALUES ($1,$2,$3,$4)', [title, name, id(rank), isHead])
  await q('INSERT INTO comm_sub_departments(id,department_id) VALUES ($1,$2)', [id(300), revenue])
  await q('INSERT INTO comm_schemes(id,sub_department_id) VALUES ($1,$2)', [id(301), id(300)])
  for (const [rankId, title, rank, canRecruit] of [[401, recruiterTitle, 8, true], [402, specialistTitle, 8, false], [403, memberTitle, 2, false]])
    await q('INSERT INTO comm_ranks VALUES ($1,$2,$3,$4,$5)', [id(rankId), id(301), title, rank, canRecruit])
  for (const [staff, name, department, title] of [
    [kris, 'KRIS', revenue, headTitle], [peter, 'PETER', revenue, headTitle],
    [ceo, 'Company CEO', company, ceoTitle], [coo, 'Company COO', company, cooTitle],
    [low, 'Lower Manager', company, lowTitle], [manager, 'Revenue Manager', revenue, recruiterTitle],
    [specialist, 'Senior Specialist', revenue, specialistTitle], [member, 'Revenue Member', revenue, memberTitle],
    [outsider, 'Company Member', company, memberTitle], [outsideHead, 'Outside Head', company, headTitle],
  ]) await q('INSERT INTO hr_staff_costs(id,employee_name,department_id,title_id) VALUES ($1,$2,$3,$4)', [staff, name, department, title])

  // Reproduce the old database refusal independently of the app's picker.
  await reject('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [kris, ceo], '23BND')
  const sql = await readFile(new URL(`${newMigration}.sql`, migrations), 'utf8')
  await db.exec(sql)
  await db.exec(sql) // Safe to reapply: existing trigger wiring is retained.

  for (const target of [ceo, coo, null, peter]) {
    await reportTo(kris, target)
    check(await reportsTo(kris), target)
    check((await positions(kris)).length, 0)
  }
  await reject('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [peter, kris], '23514')
  check(await reportsTo(peter), null)
  await reject('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [kris, low], '23LAD')
  check(await reportsTo(kris), peter)

  // The exception is on the commission-head report only, never symmetric.
  for (const [staff, target, code] of [
    [member, ceo, '23BND'], [outsider, kris, '23BND'], [outsideHead, kris, '23BND'],
    [member, specialist, '23REC'],
  ]) await reject('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [staff, target], code)
  await reportTo(member, kris)
  check(await reportsTo(member), kris)
  check((await positions(member))[0].upline_staff_id, null)
  await reportTo(kris, ceo)
  check((await positions(member))[0].upline_staff_id, null)
  check((await positions(ceo)).length, 0)

  // Removing the head role turns the same stored line back into a commission
  // upline, so both boundary and recruiting conditions must be checked again.
  await reject('UPDATE hr_staff_costs SET title_id=$2 WHERE id=$1', [kris, recruiterTitle], '23BND')
  check(await one('SELECT title_id FROM hr_staff_costs WHERE id=$1', [kris]), headTitle)
  await reportTo(kris, specialist)
  check(await reportsTo(kris), specialist)
  await reject('UPDATE hr_staff_costs SET title_id=$2 WHERE id=$1', [kris, recruiterTitle], '23REC')
  await reportTo(kris, peter)
  await q('UPDATE hr_staff_costs SET title_id=$2 WHERE id=$1', [kris, recruiterTitle])
  check((await positions(kris))[0].upline_staff_id, null)
  check((await positions(member))[0].upline_staff_id, kris)
  await q('UPDATE hr_staff_costs SET title_id=$2 WHERE id=$1', [kris, headTitle])
  check((await positions(kris)).length, 0)
  check((await positions(member))[0].upline_staff_id, null)

  // Direct inserts cannot accidentally make a head an override recipient.
  await reject('INSERT INTO comm_ranks VALUES ($1,$2,$3,8,true)', [id(404), id(301), headTitle], '23DIR')
  await reject(`INSERT INTO comm_hierarchy(scheme_id,staff_id,title_id,rank_id,effective_from)
    VALUES ($1,$2,$3,$4,comm_period_start())`, [id(301), kris, recruiterTitle, id(401)], '23DIR')

  // Insert and simultaneous department/title changes use the new role facts.
  await q('INSERT INTO hr_staff_costs(id,employee_name,department_id,title_id,reports_to) VALUES ($1,$2,$3,$4,$5)',
    [id(211), 'New Director', revenue, headTitle, ceo])
  check(await reportsTo(id(211)), ceo)
  check((await positions(id(211))).length, 0)
  await q('UPDATE hr_staff_costs SET department_id=$2,title_id=$3,reports_to=$4 WHERE id=$1', [outsider, revenue, headTitle, coo])
  check(await reportsTo(outsider), coo)
  check((await positions(outsider)).length, 0)

  // A manager may change department/title while their only report is a head;
  // ordinary commission reports still block those same changes.
  await reportTo(peter, manager)
  await q('UPDATE hr_staff_costs SET department_id=$2 WHERE id=$1', [manager, company])
  check(await reportsTo(peter), manager)
  await q('UPDATE hr_staff_costs SET department_id=$2 WHERE id=$1', [manager, otherCompany])
  check(await reportsTo(peter), manager)
  await q('UPDATE hr_staff_costs SET department_id=$2 WHERE id=$1', [manager, revenue])
  await q('UPDATE hr_staff_costs SET title_id=$2 WHERE id=$1', [manager, specialistTitle])
  check(await reportsTo(peter), manager)
  await q('UPDATE hr_staff_costs SET title_id=$2 WHERE id=$1', [manager, recruiterTitle])
  await reportTo(member, manager)
  check((await positions(member))[0].upline_staff_id, manager)
  await reject('UPDATE hr_staff_costs SET department_id=$2 WHERE id=$1', [manager, company], '23BND')
  await reject('UPDATE hr_staff_costs SET title_id=$2 WHERE id=$1', [manager, specialistTitle], '23REC')
  check((await positions(member))[0].upline_staff_id, manager)

  // A head destination still terminates the commission tree after all edits.
  await reportTo(member, kris)
  await reportTo(kris, ceo)
  check(await reportsTo(kris), ceo)
  check((await positions(member))[0].upline_staff_id, null)
  check(await one(`SELECT count(*)::integer FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    WHERE h.effective_to IS NULL AND title_is_department_head(s.title_id)`), 0)

  // The company chart derives each home root's reporting line to ALL assigned
  // directors. These are genuine cycle edges even without a live scheme.
  await reportTo(peter, null)
  await q('INSERT INTO comm_sub_department_directors VALUES ($1,$2),($1,$3)', [id(300), kris, peter])
  for (const head of [kris, peter]) {
    await reject('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [head, manager], '23514')
  }
  check(await reportsTo(kris), ceo)
  check(await reportsTo(peter), null)
  await q('INSERT INTO hr_staff_costs(id,employee_name,department_id,title_id,reports_to) VALUES ($1,$2,$3,$4,$5)',
    [id(212), 'Root Descendant', revenue, memberTitle, manager])
  await q('UPDATE titles SET level_id=NULL WHERE id=$1', [headTitle])
  await reject('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [kris, id(212)], '23514')
  await q('UPDATE comm_schemes SET is_active=false WHERE id=$1', [id(301)])
  await reject('UPDATE hr_staff_costs SET reports_to=$2 WHERE id=$1', [kris, manager], '23514')
  await reportTo(kris, ceo)
  check(await reportsTo(kris), ceo)

  // A secondary sub-department assignment does not invent a primary home
  // reporting edge. Inactive roots do not appear on that chart.
  await q('INSERT INTO comm_sub_departments(id,department_id,created_at) VALUES ($1,$2,now()+interval \'1 day\')', [id(302), revenue])
  await q('DELETE FROM comm_sub_department_directors')
  await q('INSERT INTO comm_sub_department_directors VALUES ($1,$2)', [id(302), kris])
  await reportTo(kris, manager)
  check(await reportsTo(kris), manager)
  await reportTo(kris, ceo)
  await q('DELETE FROM comm_sub_department_directors')
  await q('INSERT INTO comm_sub_department_directors VALUES ($1,$2)', [id(300), kris])
  await q("UPDATE hr_staff_costs SET status='inactive' WHERE id=$1", [manager])
  await reportTo(kris, manager)
  check(await reportsTo(kris), manager)
  console.log(`PASS: ${checks} director reporting SQL checks. Real guard, ladder, cycle and commission-sync functions; no live database connection.`)
} finally {
  await db.close()
}

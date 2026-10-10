// Local PostgreSQL regression for permissions by view and tab (2026-10-11,
// the HR revamp 8a — the user's choice B). The PR1 world — production's 35
// keys and role defaults, the titles, the accounts that sign in — then PR1's
// three migrations and the app-wide audit, then 20261011010000 and
// 20261011020000 VERBATIM. What is under test: a template's ticks are saved
// with the cells they stand for, its holders' own boxes and cells with them,
// all in one transaction that a single bad part refuses whole; a title moved
// to another template carries its holders' boxes the same way; only whoever
// manages permissions writes any of it, and the publishable key reaches none.
// No live I/O.
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

async function as(user, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, null)

const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

async function productionFunction(migration, name) {
  const sql = await migrationText(migration)
  const match = new RegExp(
    `create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`,
    'i',
  ).exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

const sorted = list => [...list].sort()

// ── Production's catalog (2026-10-08) ───────────────────────────────────────
const KEY_DOMAINS = {
  dashboard: 'shared', approvals: 'admin', treasury: 'treasury', payroll_payouts: 'none', billing: 'treasury',
  categories: 'treasury', hr_costing: 'hr', revenue: 'hr', product_list: 'admin', director_salary: 'hr',
  director_pool: 'hr', team: 'hr', team_invite: 'none', salary_individual: 'hr', dept_pool: 'none',
  venture_pool: 'treasury', opex: 'none', my_billing: 'none', claims: 'shared', claims_approve: 'shared',
  reports: 'treasury', dept_reports: 'none', reconciliation: 'treasury', audit_log: 'admin', settings: 'admin',
  department_mode: 'none', override: 'treasury', permissions_manage: 'admin', member_portal: 'none',
  member_quote: 'none', member_requests: 'none', member_memos: 'none', member_requests_manage: 'none',
  member_memos_manage: 'none', member_insight: 'none',
}
const ROLE_DEFAULTS = {
  principal: ['approvals', 'audit_log', 'billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'department_mode',
    'dept_pool', 'dept_reports', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage',
    'member_requests_manage', 'opex', 'override', 'payroll_payouts', 'permissions_manage', 'product_list', 'reconciliation',
    'reports', 'revenue', 'salary_individual', 'settings', 'team', 'team_invite', 'treasury', 'venture_pool'],
  finance: ['billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'dept_pool', 'dept_reports', 'reconciliation',
    'reports', 'treasury', 'venture_pool'],
  hr: ['claims', 'claims_approve', 'dashboard', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage',
    'member_requests_manage', 'revenue', 'salary_individual', 'team'],
  dept_manager: ['claims', 'dashboard', 'dept_pool', 'dept_reports', 'my_billing', 'opex'],
  revenue_member: ['member_insight', 'member_memos', 'member_portal', 'member_quote', 'member_requests'],
}
const FINANCE_DEPT = id(100)
const PRINCIPAL = id(1)
const HR_SHARED = id(3)

// A Finance · Maker save, ticked the way the app sends it: the ticks, and the cells
// they stand for (lib/permission-tabs `cellRows` — export rides with view).
const MAKER_TICKS = ['dept.my_claims.create', 'dept.my_claims.view', 'dept.overview.view', 'fin.invoice.create', 'fin.invoice.view',
  'fin.overview.view', 'fin.payments.create', 'fin.payments.view']
const MAKER_CELLS = [
  { function_key: 'billing', action: 'create', scope: 'all' }, { function_key: 'billing', action: 'export', scope: 'all' },
  { function_key: 'billing', action: 'view', scope: 'all' }, { function_key: 'claims', action: 'create', scope: 'own' },
  { function_key: 'claims', action: 'view', scope: 'own' }, { function_key: 'dashboard', action: 'view', scope: 'all' },
  { function_key: 'treasury', action: 'create', scope: 'all' }, { function_key: 'treasury', action: 'export', scope: 'all' },
  { function_key: 'treasury', action: 'view', scope: 'all' },
]
const json = v => JSON.stringify(v)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

    CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr', 'dept_manager', 'revenue_member');
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE users(
      id uuid PRIMARY KEY, email text NOT NULL, name text NOT NULL, role user_role NOT NULL, department_id uuid,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz);
    CREATE TABLE titles(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, department_id uuid REFERENCES departments(id),
      is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE hr_staff_costs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL,
      department_id uuid NOT NULL REFERENCES departments(id), title_id uuid REFERENCES titles(id),
      user_id uuid REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE permission_defs(
      key text PRIMARY KEY, label text NOT NULL, section text NOT NULL,
      scope text NOT NULL CHECK (scope = ANY (ARRAY['admin', 'treasury', 'hr', 'shared', 'none'])),
      description text, sort_order integer NOT NULL);
    CREATE TABLE role_default_permissions(
      role user_role NOT NULL, permission_key text NOT NULL REFERENCES permission_defs(key),
      PRIMARY KEY (role, permission_key));
    CREATE TABLE title_permissions(title_id uuid NOT NULL, permission_key text NOT NULL, PRIMARY KEY (title_id, permission_key));
    CREATE TABLE user_permissions(user_id uuid NOT NULL, permission_key text NOT NULL, granted boolean NOT NULL,
      PRIMARY KEY (user_id, permission_key));
    -- The app-wide audit folds this in; here it is empty.
    CREATE TABLE config_audit_log(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_name text NOT NULL, row_key text NOT NULL,
      changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now(), old_values jsonb NOT NULL, new_values jsonb NOT NULL);
  `)
  let order = 0
  for (const [key, domain] of Object.entries(KEY_DOMAINS)) {
    await q('INSERT INTO permission_defs VALUES ($1, $1, $2, $3, NULL, $4)', [key, 'Section', domain, order += 10])
  }
  for (const [role, keys] of Object.entries(ROLE_DEFAULTS)) {
    for (const key of keys) await q('INSERT INTO role_default_permissions VALUES ($1, $2)', [role, key])
  }
  await q("INSERT INTO departments VALUES ($1, 'Finance')", [FINANCE_DEPT])
  await q(`INSERT INTO users(id, email, name, role) VALUES
    ($1, 'principal@venture.my', 'Principal', 'principal'), ($2, 'hr@venture.my', 'HR', 'hr')`, [PRINCIPAL, HR_SHARED])

  await productionFunction('20260916010000_member_insight', 'current_permissions')
  await productionFunction('20260901040000_permission_catalog', 'has_perm')
  await productionFunction('20260901040000_permission_catalog', 'has_scope')
  await db.exec(`
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION current_permissions(), has_perm(text), has_scope(text[]) TO authenticated;
  `)

  // ── The migrations, verbatim ──────────────────────────────────────────────
  await db.exec(await migrationText('20261008110000_user_role_staff'))
  await db.exec(await migrationText('20261008120000_permission_templates'))
  await db.exec(await migrationText('20261008130000_permission_cells_of_search_path'))
  await db.exec(await migrationText('20261008190000_app_wide_audit'))
  await db.exec(await migrationText('20261011010000_permission_tabs'))
  await db.exec(await migrationText('20261011020000_permission_tabs_people'))

  check(sorted((await q(`SELECT table_name FROM audit_tables WHERE table_name IN ('permission_template_tabs', 'user_permission_tabs')`))
    .map(r => r.table_name)), ['permission_template_tabs', 'user_permission_tabs'], 'both new tables are in the history')

  // ── Two makers on one title, somebody on another ──────────────────────────
  const T = Object.fromEntries((await q('SELECT id, key FROM permission_templates')).map(t => [t.key, t.id]))
  const titleOn = (name, template) => one('INSERT INTO titles(name, department_id, template_id) VALUES ($1, $2, $3) RETURNING id',
    [name, FINANCE_DEPT, template])
  const makerTitle = await titleOn('TEST MAKER', T.fin_maker)
  const staffTitle = await titleOn('TEST STAFF', T.staff)
  const person = async (n, title) => {
    const user = id(200 + n)
    await q("INSERT INTO users(id, email, name, role) VALUES ($1, $2, $3, 'finance')", [user, `p${n}@example.com`, `PERSON ${n}`])
    await q('INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id) VALUES ($1, $2, $3, $4)',
      [`PERSON ${n}`, FINANCE_DEPT, title, user])
    return user
  }
  const maker1 = await person(1, makerTitle)
  const maker2 = await person(2, makerTitle)
  const clerk = await person(3, staffTitle)

  const boxesOf = async user => (await q('SELECT tab_id, action, granted FROM user_permission_tabs WHERE user_id = $1 ORDER BY tab_id, action', [user]))
  const cellsOf = async user => (await q(`SELECT function_key, action, scope FROM user_permission_cells WHERE user_id = $1
    ORDER BY function_key, action`, [user]))
  const ticksOf = async template => sorted((await q('SELECT tab_id || \'.\' || action AS g FROM permission_template_tabs WHERE template_id = $1',
    [template])).map(r => r.g))
  const versionOf = template => one('SELECT version FROM permission_templates WHERE id = $1', [template])

  // ── One person's boxes ────────────────────────────────────────────────────
  const raise = { tab: 'fin.invoice', action: 'approve', granted: true }
  const voidCell = { function_key: 'billing', action: 'void', scope: 'all' }
  await as(HR_SHARED)
  await reject('SELECT permission_user_tabs_set($1, $2::jsonb, $3::jsonb)', [maker1, json([raise]), json([voidCell])],
    /Only whoever manages permissions/, 'HR cannot set a person\'s boxes')
  await as(PRINCIPAL)
  await q('SELECT permission_user_tabs_set($1, $2::jsonb, $3::jsonb)', [maker1, json([raise]), json([voidCell])])
  await asSystem()
  check(await boxesOf(maker1), [{ tab_id: 'fin.invoice', action: 'approve', granted: true }], 'their box is kept')
  check(await cellsOf(maker1), [voidCell], 'with the cell it stands for')
  await as(PRINCIPAL)
  await reject('SELECT permission_user_tabs_set($1, $2::jsonb, $3::jsonb)', [maker1, json([{ tab: 'fin.nope!', action: 'view', granted: true }]), '[]'],
    /is not a box of the matrix/, 'a box that is no box is refused')
  await reject('SELECT permission_user_tabs_set($1, $2::jsonb, $3::jsonb)', [maker1, '[]', json([{ function_key: 'treasury', action: 'view', scope: 'own' }])],
    /cannot be set that way/, 'and a cell its function cannot take, by the cells\' own check')
  await asSystem()
  check(await boxesOf(maker1), [{ tab_id: 'fin.invoice', action: 'approve', granted: true }], 'a refused set leaves the boxes as they were')

  // ── A template's save: its ticks, their cells, its holders' own ───────────
  const saveSql = 'SELECT permission_template_tabs_save($1, $2, $3::text[], $4::jsonb, $5::text[], $6::jsonb)'
  // maker1 again over the new ticks: the app worked it out (reapplied).
  const again = { user_id: maker1, tabs: [raise], cells: [voidCell] }
  await as(HR_SHARED)
  await reject(saveSql, [T.fin_maker, 1, MAKER_TICKS, json(MAKER_CELLS), ['bank'], '[]'], /Only whoever manages permissions/,
    'HR cannot save a template')
  await as(PRINCIPAL)
  await reject(saveSql, [T.fin_maker, 1, [...MAKER_TICKS, 'fin.payments.sign'], json(MAKER_CELLS), ['bank'], '[]'],
    /is not a box of the matrix/, 'a box that is no box is refused')
  await reject(saveSql, [T.fin_maker, 9, MAKER_TICKS, json(MAKER_CELLS), ['bank'], '[]'], /changed by somebody else/,
    'a save over a newer one is refused')
  await reject(saveSql, [T.fin_maker, 1, MAKER_TICKS, json([...MAKER_CELLS, { function_key: 'claims', action: 'approve', scope: 'all' }]), ['bank'], '[]'],
    /reaches further than View/, 'the cells keep their own checks')
  // One holder listed who is not on it refuses the whole save — the template too.
  await reject(saveSql, [T.fin_maker, 1, MAKER_TICKS, json(MAKER_CELLS), ['bank'], json([again, { user_id: clerk, tabs: [], cells: [] }])],
    /not on this template/, 'somebody on another template cannot be rewritten by this save')
  await reject(saveSql, [T.fin_maker, 1, MAKER_TICKS, json(MAKER_CELLS), ['bank'], json([again, again])],
    /Each person once/, 'each person once')
  await asSystem()
  check([await versionOf(T.fin_maker), await ticksOf(T.fin_maker)], [1, []], 'every refusal left the template as it was')

  await as(PRINCIPAL)
  const saved = await one(saveSql, [T.fin_maker, 1, MAKER_TICKS, json(MAKER_CELLS), ['bank'], json([again])])
  check(saved, { version: 2, titles: 1, people: 1 }, 'saved: the next version, its titles, and the people it carried')
  await asSystem()
  check(await ticksOf(T.fin_maker), sorted(MAKER_TICKS), 'the ticks are stored')
  check(sorted((await q(`SELECT function_key || '.' || action || ':' || scope AS c FROM permission_template_grants WHERE template_id = $1`,
    [T.fin_maker])).map(r => r.c)), sorted(MAKER_CELLS.map(c => `${c.function_key}.${c.action}:${c.scope}`)),
  'and exactly the cells they stand for')
  check(await boxesOf(maker1), [{ tab_id: 'fin.invoice', action: 'approve', granted: true }], 'maker1 keeps their box')
  check(await cellsOf(maker2), [], 'maker2, who has none, is untouched')
  const txids = await q(`SELECT DISTINCT table_name FROM audit_events
    WHERE txid = (SELECT txid FROM audit_events WHERE table_name = 'permission_template_tabs' ORDER BY id DESC LIMIT 1)`)
  check(sorted(txids.map(r => r.table_name)).includes('permission_template_grants'), true,
    'the ticks and the cells are one transaction in the history')

  // A later save that drops what was under their box writes their cells again.
  const fewer = MAKER_TICKS.filter(g => !g.startsWith('fin.invoice.'))
  const fewerCells = MAKER_CELLS.filter(c => c.function_key !== 'billing')
  await as(PRINCIPAL)
  check(await one(saveSql, [T.fin_maker, 2, fewer, json(fewerCells), ['bank'], json([{ user_id: maker1, tabs: [], cells: [] }])]),
    { version: 3, titles: 1, people: 1 }, 'Invoice off the template: maker1 carried again')
  await asSystem()
  check([await boxesOf(maker1), await cellsOf(maker1)], [[], []], 'their approve went with the tab, and billing.void with it')

  // ── A title onto another template, its holders' boxes with it ─────────────
  await as(PRINCIPAL)
  await q('SELECT permission_user_tabs_set($1, $2::jsonb, $3::jsonb)',
    [maker2, json([{ tab: 'fin.payments', action: 'edit', granted: true }]), json([{ function_key: 'treasury', action: 'edit', scope: 'all' }])])
  const moveSql = 'SELECT permission_title_move($1, $2, $3::jsonb)'
  const carried = { user_id: maker2, tabs: [{ tab: 'fin.payments', action: 'edit', granted: true }],
    cells: [{ function_key: 'treasury', action: 'view', scope: 'all' }, { function_key: 'treasury', action: 'edit', scope: 'all' }] }
  await as(HR_SHARED)
  await reject(moveSql, [makerTitle, T.staff, '[]'], /Only whoever manages permissions/, 'HR cannot move a title')
  await as(PRINCIPAL)
  await reject(moveSql, [makerTitle, T.staff, json([carried, { user_id: clerk, tabs: [], cells: [] }])],
    /does not hold this title/, 'only the title\'s own holders are carried')
  await reject(moveSql, [makerTitle, null, json([carried])], /no boxes to carry/, 'a title with no template carries nobody')
  await asSystem()
  check(await one('SELECT template_id FROM titles WHERE id = $1', [makerTitle]), T.fin_maker, 'every refusal left the title where it was')
  await as(PRINCIPAL)
  check(await one(moveSql, [makerTitle, T.staff, json([carried])]), 1, 'moved, with one holder carried')
  await asSystem()
  check(await one('SELECT template_id FROM titles WHERE id = $1', [makerTitle]), T.staff, 'the title follows Staff')
  check(await cellsOf(maker2), [{ function_key: 'treasury', action: 'edit', scope: 'all' }, { function_key: 'treasury', action: 'view', scope: 'all' }],
    'maker2\'s cells worked out again over Staff')
  await as(PRINCIPAL)
  check(await one(moveSql, [makerTitle, T.fin_maker, '[]']), 0, 'and back, carrying nobody listed')

  // ── Delete ────────────────────────────────────────────────────────────────
  await as(HR_SHARED)
  await reject('SELECT permission_template_delete($1, 3)', [T.fin_maker], /Only whoever manages permissions/, 'HR cannot delete a template')
  await as(PRINCIPAL)
  await reject('SELECT permission_template_delete($1, 3)', [T.fin_maker], /is on 1 title\. Move it to another template first/,
    'a template a title points at stays')
  const blank = await one("SELECT permission_template_create('Spare', NULL, $1)", [T.fin_maker])
  await one(saveSql, [blank, 1, fewer, json(fewerCells), [], '[]'])
  await reject('SELECT permission_template_delete($1, 1)', [blank], /changed by somebody else/, 'a stale delete is refused')
  await q('SELECT permission_template_delete($1, 2)', [blank])
  await asSystem()
  check([await one('SELECT count(*)::int FROM permission_templates WHERE id = $1', [blank]), await ticksOf(blank)], [0, []],
    'an unused one goes, its ticks with it')

  // ── Who can call what ─────────────────────────────────────────────────────
  await as(PRINCIPAL)
  await reject('SELECT permission_people_reapply($1, \'[]\'::jsonb)', [T.fin_maker], /permission denied/,
    'the shared loop is for the two writers only')
  await as(null, 'anon')
  await reject(saveSql, [T.fin_maker, 3, fewer, json(fewerCells), [], '[]'], /permission denied/, 'the publishable key reaches no writer')
  await reject(moveSql, [makerTitle, T.staff, '[]'], /permission denied/, 'nor a title\'s template')
  await reject('SELECT permission_user_tabs_set($1, \'[]\'::jsonb, \'[]\'::jsonb)', [maker1], /permission denied/, 'nor a person\'s boxes')

  console.log(`Permission tab checks passed: ${checks}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await db.close()
}

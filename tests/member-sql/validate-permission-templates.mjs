// Local PostgreSQL regression for permission templates (2026-10-08, the
// People Management revamp). Both migrations run VERBATIM against a synthetic
// copy of what they touch — the 35 keys and role defaults exactly as
// production has them, the 30 titles, the five accounts that can sign in.
// What is under test: the templates are the design's, nobody's access moves on
// the day, a template's cells open only what they can safely open, and every
// write goes through the functions that guard and record it. No live I/O.
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

// The repo's own text, as production has it: LF line endings whatever this
// checkout's git turned them into (the migration's guard compares md5s).
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
const perms = async user => {
  await as(user)
  const keys = await one('SELECT current_permissions()')
  await asSystem()
  return sorted(keys)
}

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
const TITLES = {
  Director: ['CHIEF EXECUTIVE OFFICER', 'DIRECTOR'],
  'Director Office': ['PERSONAL ASSISTANT'],
  Finance: ['ACCOUNTS ASSISTANT', 'ACCOUNTS EXECUTIVE', 'ASSISTANT FINANCE MANAGER', 'SENIOR ACCOUNT EXECUTIVE'],
  HR: ['HR ASSISTANT', 'HR EXECUTIVE', 'HR MANAGER', 'SENIOR HR EXECUTIVE'],
  IT: ['INTERNSHIP', 'IT DEVELOPER EXECUTIVE'],
  Marketing: ['ASSISTANT MARKETING MANAGER', 'CONTENT CREATOR', 'EVENT SPECIALIST CUM VISUAL MERCHANDISER EXECUTIVE',
    'GRAPHIC DESIGNER', 'MARKETING MANAGER', 'SENIOR MARKETING EXECUTIVE', 'SENIOR VIDEOGRAPHER & VIDEO EDITOR',
    'SOCIAL MEDIA SPECIALIST', 'TELEMARKETER', 'VIDEOGRAPHER & VIDEO EDITOR'],
  'Revenue Department': ['Revenue Director', 'Revenue Specialist', 'Senior Revenue Specialist', 'Senior Team Assistant',
    'Senior Team Leader', 'Team Assistant', 'Team Leader'],
}
const DEPT_IDS = Object.fromEntries(Object.keys(TITLES).map((name, i) => [name, id(100 + i)]))

// ── The design's TEMPLATES (People Management v2.dc.html), as drawn ─────────
const parse = spec => Object.entries(spec).flatMap(([fn, cells]) =>
  cells.split(' ').map(cell => { const [action, scope] = cell.split(':'); return `${fn}.${action}:${scope}` }))
const DESIGN = {
  director: parse({ dashboard: 'view:all', approvals: 'view:all approve:all', treasury: 'view:all create:all approve:all export:all', reports: 'view:all export:all', dept_reports: 'view:all', director_salary: 'view:all approve:all', director_pool: 'view:all', venture_pool: 'view:all', claims: 'view:own create:own', team: 'view:all' }),
  office: parse({ dashboard: 'view:all', approvals: 'view:all', reports: 'view:all', team: 'view:all', claims: 'view:own create:own' }),
  fin_checker: parse({ dashboard: 'view:all', treasury: 'view:all approve:all export:all', billing: 'view:all export:all', categories: 'view:all manage:all', dept_pool: 'view:all', venture_pool: 'view:all export:all', reports: 'view:all export:all', dept_reports: 'view:all export:all', reconciliation: 'view:all approve:all', claims: 'view:all approve:all' }),
  fin_maker: parse({ dashboard: 'view:all', treasury: 'view:all create:all edit:all', billing: 'view:all create:all edit:all', venture_pool: 'view:all create:all', reconciliation: 'view:all create:all edit:all', claims: 'view:own create:own' }),
  // + Member Services (user 2026-10-08: HR runs the Revenue members' requests).
  hr: parse({ dashboard: 'view:all', hr_costing: 'view:all create:all edit:all export:all', revenue: 'view:all edit:all', director_salary: 'view:all edit:all', director_pool: 'view:all', team: 'view:all create:all edit:all', accounts: 'view:all', claims: 'view:own create:own', member: 'view:all manage:all' }),
  dept_head: parse({ dashboard: 'view:all', dept_pool: 'view:dept export:dept', opex: 'view:dept', my_billing: 'view:dept create:dept', claims: 'view:dept create:own approve:dept', dept_reports: 'view:dept export:dept', team: 'view:dept' }),
  staff: parse({ dashboard: 'view:all', claims: 'view:own create:own edit:own' }),
  revenue_team: parse({ revenue_app: 'view:own create:own' }),
}
const DESIGN_SENSITIVE = {
  ultimate: ['bank', 'nric', 'salary'], full: ['bank', 'nric', 'salary'], director: ['salary'], office: [],
  fin_checker: ['bank'], fin_maker: ['bank'], hr: ['bank', 'nric', 'salary'], dept_head: [], staff: [], revenue_team: [],
}

// What each template opens while the gates read module keys — the fail-closed rule.
const OPENS = {
  ultimate: sorted([...ROLE_DEFAULTS.principal, 'my_billing', 'view_switch']),
  full: sorted([...ROLE_DEFAULTS.principal, 'my_billing']),
  director: ['claims', 'dashboard', 'dept_reports', 'director_pool', 'director_salary', 'payroll_payouts', 'reports',
    'salary_individual', 'team', 'treasury', 'venture_pool'],
  office: ['claims', 'dashboard'],
  fin_checker: sorted(ROLE_DEFAULTS.finance),
  fin_maker: ['billing', 'claims', 'dashboard', 'reconciliation', 'treasury', 'venture_pool'],
  hr: ['claims', 'dashboard', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage',
    'member_requests_manage', 'payroll_payouts', 'revenue', 'salary_individual', 'team'],
  dept_head: sorted(ROLE_DEFAULTS.dept_manager),
  staff: ['claims', 'dashboard'],
  revenue_team: sorted(ROLE_DEFAULTS.revenue_member),
}
const BASE_ROLES = {
  ultimate: 'principal', full: 'principal', director: 'staff', office: 'staff', fin_checker: 'finance',
  fin_maker: 'finance', hr: 'hr', dept_head: 'dept_manager', staff: 'staff', revenue_team: 'revenue_member',
}

// ── The accounts production has ─────────────────────────────────────────────
const PRINCIPAL = id(1)
const FINANCE = id(2)
const HR_SHARED = id(3)
const MARKETING = id(4)
const CARRIE = id(5)
const CARRIE_STAFF = id(50)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;

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
  `)
  let order = 0
  for (const [key, domain] of Object.entries(KEY_DOMAINS)) {
    await q('INSERT INTO permission_defs VALUES ($1, $1, $2, $3, NULL, $4)', [key, 'Section', domain, order += 10])
  }
  for (const [role, keys] of Object.entries(ROLE_DEFAULTS)) {
    for (const key of keys) await q('INSERT INTO role_default_permissions VALUES ($1, $2)', [role, key])
  }
  for (const [dept, titles] of Object.entries(TITLES)) {
    await q('INSERT INTO departments VALUES ($1, $2)', [DEPT_IDS[dept], dept])
    for (const name of titles) await q('INSERT INTO titles(name, department_id) VALUES ($1, $2)', [name, DEPT_IDS[dept]])
  }
  await q(`INSERT INTO users(id, email, name, role, department_id) VALUES
    ($1, 'principal@venture.my', 'Principal', 'principal', NULL),
    ($2, 'finance@venture.my', 'Finance', 'finance', NULL),
    ($3, 'hr@venture.my', 'HR', 'hr', NULL),
    ($4, 'marketing@venture.my', 'Marketing', 'dept_manager', $6),
    ($5, 'carrie@example.com', 'CARRIE', 'finance', $7)`,
  [PRINCIPAL, FINANCE, HR_SHARED, MARKETING, CARRIE, DEPT_IDS.Marketing, DEPT_IDS.Finance])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, department_id, title_id, user_id)
    SELECT $1, 'CARRIE', $2, t.id, $3 FROM titles t WHERE t.name = 'ACCOUNTS EXECUTIVE'`, [CARRIE_STAFF, DEPT_IDS.Finance, CARRIE])
  await q(`INSERT INTO user_permissions VALUES ($1, 'reports', false), ($1, 'dept_reports', false), ($1, 'reconciliation', false),
    ($2, 'payroll_payouts', true)`, [CARRIE, FINANCE])

  // The functions as production runs them (md5 7df96ce0… is what the guard expects).
  await productionFunction('20260916010000_member_insight', 'current_permissions')
  await productionFunction('20260901040000_permission_catalog', 'has_perm')
  await productionFunction('20260901040000_permission_catalog', 'has_scope')
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'current_permissions'"),
    '7df96ce0cd4aa1cb6642d4352d582174', 'the old current_permissions is production\'s')
  await db.exec(`
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT EXECUTE ON FUNCTION current_permissions(), has_perm(text), has_scope(text[]) TO authenticated;
  `)

  const ACCOUNTS = { PRINCIPAL, FINANCE, HR_SHARED, MARKETING, CARRIE }
  const before = {}
  for (const [name, user] of Object.entries(ACCOUNTS)) before[name] = await perms(user)

  // ── The migrations, verbatim ──────────────────────────────────────────────
  await db.exec(await migrationText('20261008110000_user_role_staff'))
  await db.exec(await migrationText('20261008120000_permission_templates'))
  await db.exec(await migrationText('20261008130000_permission_cells_of_search_path'))

  // ── The catalog ───────────────────────────────────────────────────────────
  const functions = await q('SELECT key, actions, scopes FROM permission_functions ORDER BY sort_order')
  check(functions.length, 25, 'the design\'s 22 functions + Member Services, Revenue app, Switch views')
  check(functions.every(f => f.actions.includes('view')), true, 'every function can be viewed')
  check(functions.find(f => f.key === 'claims'), { key: 'claims', actions: ['view', 'create', 'edit', 'approve', 'void'], scopes: ['own', 'dept', 'all'] },
    'claims as drawn')
  check(functions.find(f => f.key === 'dept_pool').scopes, ['dept', 'all'], 'a department function cannot be Own')
  check(sorted(await one(`SELECT array_agg(DISTINCT d.key) FROM permission_defs d
    WHERE NOT EXISTS (SELECT 1 FROM permission_cell_keys k WHERE k.legacy_key = d.key)`)),
  ['payroll_payouts', 'salary_individual'], 'every key has a cell, except the two salary amounts open')
  const unsafe = await q(`SELECT k.function_key, k.action, k.legacy_key, k.min_scope, k.gate, d.scope AS domain
    FROM permission_cell_keys k JOIN permission_defs d ON d.key = k.legacy_key
    WHERE (d.scope IN ('hr', 'treasury', 'admin') AND k.min_scope <> 'all')
       OR (d.scope = 'hr' AND k.gate IS DISTINCT FROM 'salary')
       OR (d.scope = 'admin' AND k.gate IS DISTINCT FROM 'principal')
       OR (d.scope = 'treasury' AND k.gate IS NULL)`)
  check(unsafe, [], 'no cell opens a data domain short of All, or without its gate')

  // ── The templates are the design's ────────────────────────────────────────
  const templates = await q('SELECT id, key, base_role::text FROM permission_templates ORDER BY sort_order')
  const T = Object.fromEntries(templates.map(t => [t.key, t.id]))
  check(templates.map(t => t.key), ['ultimate', 'full', 'director', 'office', 'fin_checker', 'fin_maker', 'hr', 'dept_head', 'staff', 'revenue_team'],
    'ten templates, in the rail\'s order')
  check(Object.fromEntries(templates.map(t => [t.key, t.base_role])), BASE_ROLES, 'each with the account kind it hands out')
  const cellsOf = async key => sorted(await one(`SELECT coalesce(array_agg(function_key || '.' || action || ':' || scope), '{}')
    FROM permission_template_grants WHERE template_id = $1`, [T[key]]))
  for (const [key, cells] of Object.entries(DESIGN)) check(await cellsOf(key), sorted(cells), `${key}: the design's cells exactly`)
  const everything = functions.filter(f => !['revenue_app', 'view_switch'].includes(f.key))
    .flatMap(f => f.actions.map(a => `${f.key}.${a}:${f.scopes.at(-1)}`))
  check(await cellsOf('full'), sorted(everything), 'Full access: every action of every function, as far as it reaches')
  check(await cellsOf('ultimate'), sorted([...everything, 'view_switch.view:all']), 'Ultimate: the same, and switching views')
  for (const [key, fields] of Object.entries(DESIGN_SENSITIVE)) {
    check(sorted(await one('SELECT coalesce(array_agg(field), \'{}\') FROM permission_template_sensitive WHERE template_id = $1', [T[key]])),
      fields, `${key}: its sensitive fields`)
  }
  check(await q(`SELECT g.template_id FROM permission_template_grants g
    LEFT JOIN permission_template_grants v ON v.template_id = g.template_id AND v.function_key = g.function_key AND v.action = 'view'
    WHERE g.action <> 'view' AND coalesce(array_position(ARRAY['own','dept','all'], v.scope), 0) < array_position(ARRAY['own','dept','all'], g.scope)`),
  [], 'no seeded action reaches further than its View')

  // ── The titles, as agreed ─────────────────────────────────────────────────
  const titleTemplates = Object.fromEntries((await q(`SELECT t.name, pt.key FROM titles t
    LEFT JOIN permission_templates pt ON pt.id = t.template_id`)).map(r => [r.name, r.key]))
  check(titleTemplates['ACCOUNTS EXECUTIVE'], null, 'carrie\'s title waits for the user')
  check(titleTemplates['CHIEF EXECUTIVE OFFICER'], 'ultimate', 'the CEO: Ultimate full access')
  check(titleTemplates['ASSISTANT FINANCE MANAGER'], 'fin_checker', 'the Finance checker')
  check(titleTemplates['MARKETING MANAGER'], 'dept_head', 'the Marketing manager: department head')
  check(titleTemplates['Revenue Director'], 'revenue_team', 'the Revenue Director: the Revenue app')
  check(Object.values(titleTemplates).filter(Boolean).length, 29, '29 of 30 titles have a template')

  // ── Nobody's access moves on the day ──────────────────────────────────────
  for (const [name, user] of Object.entries(ACCOUNTS)) {
    const expected = name === 'PRINCIPAL' ? sorted([...before[name], 'view_switch']) : before[name]
    check(await perms(user), expected, `${name}: the same keys as before${name === 'PRINCIPAL' ? ', and the view switch' : ''}`)
  }
  check(before.CARRIE.includes('reports'), false, 'carrie\'s old exceptions still hold')
  check(await one('SELECT role::text FROM users WHERE id = $1', [CARRIE]), 'finance', 'and her account is as it was')

  // ── What each template opens, and the account kind it gives ───────────────
  let n = 0
  const holders = {}
  for (const key of Object.keys(OPENS)) {
    n++
    const user = id(200 + n)
    const staff = id(300 + n)
    const dept = key === 'revenue_team' ? DEPT_IDS['Revenue Department'] : DEPT_IDS.Marketing
    await asSystem()
    const title = await one('INSERT INTO titles(name, department_id, template_id) VALUES ($1, $2, $3) RETURNING id', [`TEST ${key}`, dept, T[key]])
    await q("INSERT INTO users(id, email, name, role) VALUES ($1, $2, $3, 'finance')", [user, `${key}@example.com`, `PERSON ${key}`])
    await q('INSERT INTO hr_staff_costs(id, employee_name, department_id, title_id, user_id) VALUES ($1, $2, $3, $4, $5)',
      [staff, `PERSON ${key}`, dept, title, user])
    holders[key] = { user, staff, title }
    check(await q('SELECT role::text, department_id FROM users WHERE id = $1', [user]), [{ role: BASE_ROLES[key], department_id: dept }],
      `${key}: the account takes the template's kind and the person's department`)
    check(await perms(user), OPENS[key], `${key}: opens what it can safely open`)
  }

  // ── One person raised or lowered ──────────────────────────────────────────
  const hrUser = holders.hr.user
  const setCells = (user, cells) => q('SELECT permission_user_cells_set($1, $2::jsonb)', [user, JSON.stringify(cells)])
  await as(hrUser)
  await reject('SELECT permission_user_cells_set($1, $2::jsonb)', [hrUser, '[]'], /Only whoever manages permissions/,
    'HR cannot set exceptions (accounts.manage is not on its template)')
  await as(PRINCIPAL)
  await setCells(hrUser, [
    { function_key: 'hr_costing', action: 'view', scope: null }, { function_key: 'hr_costing', action: 'create', scope: null },
    { function_key: 'hr_costing', action: 'edit', scope: null }, { function_key: 'hr_costing', action: 'export', scope: null },
    { function_key: 'dept_pool', action: 'view', scope: 'all' },
    { function_key: 'audit_log', action: 'view', scope: 'all' },
    { function_key: 'reports', action: 'view', scope: 'all' },
  ])
  let hrKeys = await perms(hrUser)
  check(hrKeys.includes('hr_costing'), false, 'lowered on every HR Costing cell: HR Costing closes')
  check(hrKeys.includes('dept_pool'), true, 'raised on Dept Pool: it opens')
  check(hrKeys.includes('audit_log'), false, 'raised on the Audit log: held — an admin key needs a Principal template')
  check(hrKeys.includes('reports'), false, 'raised on Reports: held — a treasury key needs Treasury itself')
  await as(PRINCIPAL)
  await reject('SELECT permission_user_cells_set($1, $2::jsonb)', [hrUser, JSON.stringify([{ function_key: 'treasury', action: 'view', scope: 'own' }])],
    /cannot be set that way/, 'a reach the function does not have is refused')
  await reject('SELECT permission_user_cells_set($1, $2::jsonb)', [hrUser, JSON.stringify([{ function_key: 'dashboard', action: 'approve', scope: 'all' }])],
    /cannot be set that way/, 'an action the function does not have is refused')
  await reject('SELECT permission_user_cells_set($1, $2::jsonb)', [hrUser,
    JSON.stringify([{ function_key: 'team', action: 'view', scope: 'all' }, { function_key: 'team', action: 'view', scope: null }])],
  /listed twice/, 'one cell, one answer')

  // Old per-key exceptions still apply on top — until cleared.
  await asSystem()
  await q("INSERT INTO user_permissions VALUES ($1, 'team', false)", [hrUser])
  check((await perms(hrUser)).includes('team'), false, 'an old per-key deny still holds on a template')
  await as(hrUser)
  await reject('SELECT permission_user_clear_legacy($1)', [hrUser], /Only whoever manages permissions/, 'HR cannot clear it')
  await as(PRINCIPAL)
  check(await one('SELECT permission_user_clear_legacy($1)', [hrUser]), 1, 'cleared by the Principal')
  check((await perms(hrUser)).includes('team'), true, 'and the template decides again')

  // A Revenue member is only ever the member app.
  await as(PRINCIPAL)
  await setCells(holders.revenue_team.user, [{ function_key: 'dashboard', action: 'view', scope: 'all' }])
  check(await perms(holders.revenue_team.user), OPENS.revenue_team, 'a Revenue account raised on the portal still opens only the member app')

  // ── Saving a template ─────────────────────────────────────────────────────
  const grantsOf = async key => (await q('SELECT function_key, action, scope FROM permission_template_grants WHERE template_id = $1', [T[key]]))
  const save = (key, version, grants, sensitive, reset = []) =>
    one('SELECT permission_template_save($1, $2, $3::jsonb, $4::text[], $5::jsonb)', [T[key], version, JSON.stringify(grants), sensitive, JSON.stringify(reset)])
  const staffGrants = await grantsOf('staff')
  await as(hrUser)
  await reject('SELECT permission_template_save($1, 1, $2::jsonb, $3::text[], $4::jsonb)', [T.staff, JSON.stringify(staffGrants), [], '[]'],
    /Only whoever manages permissions/, 'HR cannot change a template')
  await as(PRINCIPAL)
  await assert.rejects(() => save('staff', 7, staffGrants, []), /changed by somebody else/, 'a save over a newer one is refused'); checks++
  await assert.rejects(() => save('staff', 1, [...staffGrants, { function_key: 'claims', action: 'approve', scope: 'all' }], []),
    /reaches further than View/, 'an action may not reach further than View'); checks++
  await assert.rejects(() => save('staff', 1, [{ function_key: 'treasury', action: 'view', scope: 'dept' }], []),
    /cannot be granted that way/, 'Treasury has no Dept'); checks++
  await assert.rejects(() => save('staff', 1, [{ function_key: 'dashboard', action: 'view', scope: null }], []),
    /cannot be granted that way/, 'a template cell is a reach, never ✕'); checks++
  await assert.rejects(() => save('staff', 1, staffGrants, ['password']), /Sensitive fields are/, 'three sensitive fields only'); checks++

  // The design's own example: Staff · Basic raised on Department reports.
  const staffUser = holders.staff.user
  await asSystem()
  await q("INSERT INTO user_permission_cells(user_id, function_key, action, scope) VALUES ($1, 'claims', 'edit', NULL)", [staffUser])
  await as(PRINCIPAL)
  const saved = await save('staff', 1, [...staffGrants, { function_key: 'dept_reports', action: 'view', scope: 'dept' }], [],
    [{ user_id: staffUser, function_key: 'claims', action: 'edit' }, { user_id: hrUser, function_key: 'dept_pool', action: 'view' }])
  check(saved, { version: 2, titles: 12 }, 'saved: the next version, and how many titles it reaches')
  check((await perms(staffUser)).includes('dept_reports'), true, 'everybody on it has it at once')
  await asSystem()
  check(await one('SELECT count(*)::int FROM user_permission_cells WHERE user_id = $1', [staffUser]), 0,
    'the exception the Principal chose to reset is gone')
  check(await one("SELECT count(*)::int FROM user_permission_cells WHERE user_id = $1 AND function_key = 'dept_pool'", [hrUser]), 1,
    'somebody on another template is never reset by this save')
  await as(PRINCIPAL)
  await assert.rejects(() => save('staff', 1, staffGrants, []), /changed by somebody else/, 'the old version is stale now'); checks++

  // ── The history ───────────────────────────────────────────────────────────
  await asSystem()
  const lastSave = await q(`SELECT table_name, op, actor_id, row_key FROM audit_events
    WHERE txid = (SELECT txid FROM audit_events WHERE table_name = 'permission_template_grants' AND op = 'INSERT' AND actor_id = $1 ORDER BY id DESC LIMIT 1)
    ORDER BY id`, [PRINCIPAL])
  check(lastSave.map(r => `${r.table_name} ${r.op}`), ['permission_template_grants INSERT', 'user_permission_cells DELETE'],
    'one save, one transaction: the cell added and the exception reset')
  check(lastSave.every(r => r.actor_id === PRINCIPAL), true, 'each row says who')
  check(lastSave[0].row_key, `${T.staff}:dept_reports:view`, 'and which cell')
  check(await one(`SELECT count(*)::int FROM audit_events WHERE actor_id IS NULL AND table_name = 'titles' AND op = 'UPDATE'
    AND 'template_id' = ANY (changed)`), 29, 'the seed is history too: 29 titles pointed at templates, by System')
  check(await q(`SELECT changed FROM audit_events WHERE table_name = 'users' AND row_key = $1 AND op = 'UPDATE'`, [holders.hr.user]),
    [{ changed: ['department_id', 'role'] }], 'an account changing kind is recorded')
  await as(PRINCIPAL)
  const history = await q('SELECT actor_name, table_name FROM permission_history(500)')
  check(history.length > 280, true, 'the Principal reads the history')
  check(history.some(r => r.actor_name === 'System') && history.some(r => r.actor_name === 'Principal'), true, 'naming System and people')
  await as(hrUser)
  check(await q('SELECT * FROM permission_history(10)'), [], 'HR reads none of it')
  check(await q('SELECT id FROM audit_events LIMIT 1'), [], 'nor the table itself')

  // ── A title's template ────────────────────────────────────────────────────
  const mmTitle = await one("SELECT id FROM titles WHERE name = 'MARKETING MANAGER'")
  await as(hrUser)
  await q("UPDATE titles SET name = 'MARKETING LEAD' WHERE id = $1", [mmTitle])
  check(await one('SELECT name FROM titles WHERE id = $1', [mmTitle]), 'MARKETING LEAD', 'HR renames a title')
  await reject('UPDATE titles SET template_id = $1 WHERE id = $2', [T.full, mmTitle], /Only whoever manages permissions/,
    'HR cannot point a title at another template')
  await reject("INSERT INTO titles(name, department_id, template_id) VALUES ('NEW', $1, $2)", [DEPT_IDS.HR, T.full],
    /Only whoever manages permissions/, 'nor open one on a template')
  await q("INSERT INTO titles(name, department_id) VALUES ('NEW HR TITLE', $1)", [DEPT_IDS.HR])
  checks++
  await reject('SELECT permission_title_set_template($1, $2)', [mmTitle, T.full], /Only whoever manages permissions/,
    'the function asks too')
  await asSystem()
  check(await one(`SELECT actor_id FROM audit_events WHERE table_name = 'titles' AND row_key = $1 AND 'name' = ANY (changed)`, [mmTitle]),
    hrUser, 'the rename is recorded under HR — a trigger the browser cannot call still fires for it')

  // Moving a title moves the accounts on it.
  await as(PRINCIPAL)
  await q('SELECT permission_title_set_template($1, $2)', [holders.office.title, T.fin_maker])
  check(await one('SELECT role::text FROM users WHERE id = $1', [holders.office.user]), 'finance', 'the account follows its title\'s new template')
  check(await perms(holders.office.user), OPENS.fin_maker, 'and opens what that template opens')
  await as(PRINCIPAL)
  await q('SELECT permission_title_set_template($1, NULL)', [holders.office.title])
  check(await perms(holders.office.user), sorted(ROLE_DEFAULTS.finance), 'no template: back to the account\'s role defaults')

  // ── Retitling somebody who signs in is a permission decision ─────────────
  const specialist = await one("SELECT id FROM titles WHERE name = 'Revenue Specialist'")
  const senior = await one("SELECT id FROM titles WHERE name = 'Senior Revenue Specialist'")
  const ceo = await one("SELECT id FROM titles WHERE name = 'CHIEF EXECUTIVE OFFICER'")
  await asSystem()
  await q('UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2', [specialist, holders.revenue_team.staff])
  await as(hrUser)
  await reject('UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2', [ceo, holders.hr.staff], /moving them to a title on another permission template/,
    'HR cannot retitle themselves onto Ultimate')
  await q('UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2', [senior, holders.revenue_team.staff])
  check(await one('SELECT title_id FROM hr_staff_costs WHERE id = $1', [holders.revenue_team.staff]), senior,
    'a promotion inside one template is HR\'s')
  const noLogin = await one("INSERT INTO hr_staff_costs(employee_name, department_id, title_id) VALUES ('NO LOGIN', $1, $2) RETURNING id",
    [DEPT_IDS.HR, specialist])
  await q('UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2', [ceo, noLogin])
  checks++
  await reject('UPDATE hr_staff_costs SET user_id = $1 WHERE id = $2', [hrUser, noLogin], /moving them to a title on another permission template/,
    'nor hand somebody a login')
  await as(PRINCIPAL)
  await q('UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2', [ceo, holders.fin_maker.staff])
  check(await one('SELECT role::text FROM users WHERE id = $1', [holders.fin_maker.user]), 'principal', 'the Principal may, and the account follows')

  // ── New templates ─────────────────────────────────────────────────────────
  await as(hrUser)
  await reject("SELECT permission_template_create('Mine', NULL, NULL)", [], /Only whoever manages permissions/, 'HR cannot make a template')
  await as(PRINCIPAL)
  const copy = await one("SELECT permission_template_create('Finance · Checker 2', 'A copy', $1)", [T.fin_checker])
  await asSystem()
  check(await q('SELECT key, base_role::text, version FROM permission_templates WHERE id = $1', [copy]),
    [{ key: 'finance_checker_2', base_role: 'finance', version: 1 }], 'a copy keeps the kind, and gets a key of its own')
  check(sorted(await one(`SELECT array_agg(function_key || '.' || action || ':' || scope) FROM permission_template_grants WHERE template_id = $1`, [copy])),
    sorted(DESIGN.fin_checker), 'and the cells')
  await as(PRINCIPAL)
  await reject("SELECT permission_template_create('finance · checker 2', NULL, NULL)", [], /already a template called/, 'names are unique, any case')
  const blank = await one("SELECT permission_template_create('X', NULL, NULL)")
  await asSystem()
  check(await q('SELECT key, base_role::text FROM permission_templates WHERE id = $1', [blank]), [{ key: 'tpl_x', base_role: 'staff' }],
    'a blank one starts as Staff with nothing on it')

  // ── Who can read and call what ────────────────────────────────────────────
  await as(staffUser)
  check(await one('SELECT count(*)::int FROM permission_templates'), 12, 'anyone signed in reads the templates')
  await asSystem()
  await q("INSERT INTO user_permission_cells(user_id, function_key, action, scope) VALUES ($1, 'claims', 'edit', NULL)", [staffUser])
  await as(holders.fin_checker.user)
  check(await one('SELECT count(*)::int FROM user_permission_cells'), 0, 'somebody else\'s exceptions are not Finance\'s to read')
  await as(staffUser)
  check(await one('SELECT count(*)::int FROM user_permission_cells'), 1, 'but their own are')
  await as(hrUser)
  check(await one('SELECT count(*)::int FROM user_permission_cells') > 1, true, 'and HR, who runs the roster, reads them all')
  await reject('INSERT INTO user_permission_cells(user_id, function_key, action, scope) VALUES ($1, \'reports\', \'view\', \'all\')', [hrUser],
    /permission denied/, 'nobody writes the tables directly')
  await as(null, 'anon')
  await reject('SELECT permission_template_save($1, 1, \'[]\'::jsonb, \'{}\'::text[], \'[]\'::jsonb)', [T.staff], /permission denied/,
    'the publishable key cannot reach a writer')
  await reject('SELECT sync_user_role($1)', [hrUser], /permission denied/, 'nor the role sync')
  await as(hrUser)
  await reject('SELECT sync_user_role($1)', [hrUser], /permission denied/, 'which no browser may call')

  console.log(`Permission template checks passed: ${checks}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await db.close()
}

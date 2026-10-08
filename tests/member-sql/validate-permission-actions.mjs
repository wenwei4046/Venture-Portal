// Local PostgreSQL regression for actions taking effect (2026-10-08, PR2 of
// the People Management revamp). The PR1 world — the 35 keys and role
// defaults as production has them, the titles, the five accounts that sign in
// — then PR1's three migrations, the app-wide audit and 20261008200000
// VERBATIM. What is under test: a titled person holds exactly their
// template's cells (their own cells over them), an untitled account holds
// exactly what its keys allowed before (so nobody's access moves on the day),
// and has_action() answers both. No live I/O.
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
const actionsOf = async user => {
  await as(user)
  const actions = await one('SELECT current_actions()')
  await asSystem()
  return actions
}
const holds = async (user, fn, action, scope = 'all') => {
  await as(user)
  const yes = await one('SELECT has_action($1, $2, $3)', [fn, action, scope])
  await asSystem()
  return yes
}
const asList = actions => sorted(Object.entries(actions).map(([fa, scope]) => `${fa}:${scope}`))

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
  Marketing: ['MARKETING MANAGER', 'GRAPHIC DESIGNER'],
  'Revenue Department': ['Revenue Director', 'Team Leader'],
}
const DEPT_IDS = Object.fromEntries(Object.keys(TITLES).map((name, i) => [name, id(100 + i)]))

const PRINCIPAL = id(1)
const FINANCE = id(2)
const HR_SHARED = id(3)
const MARKETING = id(4)
const CARRIE = id(5)

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
  await q(`INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id)
    SELECT 'CARRIE', $1, t.id, $2 FROM titles t WHERE t.name = 'ACCOUNTS EXECUTIVE'`, [DEPT_IDS.Finance, CARRIE])
  await q(`INSERT INTO user_permissions VALUES ($1, 'reports', false), ($1, 'dept_reports', false), ($1, 'reconciliation', false)`,
    [CARRIE])

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
  await db.exec(await migrationText('20261008200000_permission_actions'))

  check(await one("SELECT mode FROM audit_tables WHERE table_name = 'permission_key_actions'"), 'all', 'the new table is registered')
  check(await one('SELECT count(*)::int FROM permission_key_actions') > 70, true, 'every key as actions')

  // ── The shared accounts keep exactly what they had ────────────────────────
  const principal = await actionsOf(PRINCIPAL)
  for (const fa of ['treasury.create', 'treasury.approve', 'approvals.approve', 'claims.approve', 'team.manage',
    'accounts.create', 'accounts.manage', 'settings.manage', 'hr_costing.approve', 'billing.void', 'audit_log.export']) {
    check(principal[fa], 'all', `the Principal: ${fa}`)
  }
  const finance = await actionsOf(FINANCE)
  check([finance['treasury.create'], finance['treasury.void'], finance['claims.approve'], finance['reconciliation.approve']],
    ['all', 'all', 'all', 'all'], 'Finance raises, voids, approves claims, reconciles')
  check([finance['treasury.approve'], finance['approvals.approve'], finance['hr_costing.view']], [undefined, undefined, undefined],
    'but approves nothing in Treasury and sees no payroll')
  const hr = await actionsOf(HR_SHARED)
  check([hr['hr_costing.approve'], hr['team.edit'], hr['member.manage'], hr['director_salary.approve']], ['all', 'all', 'all', 'all'],
    'HR runs payroll, the roster, member services and director salary')
  check([hr['team.manage'], hr['accounts.create'], hr['treasury.view']], ['all', undefined, undefined],
    'the titles and the ladder as before; not logins, not Treasury')
  const marketing = await actionsOf(MARKETING)
  check(asList(marketing), sorted(['claims.create:dept', 'claims.edit:dept', 'claims.view:dept', 'claims.void:dept', 'dashboard.view:all',
    'dept_pool.export:dept', 'dept_pool.view:dept', 'dept_reports.export:dept', 'dept_reports.view:dept', 'my_billing.create:dept',
    'my_billing.view:dept', 'opex.export:dept', 'opex.view:dept']), 'a department manager: their department, at Dept')
  const carrie = await actionsOf(CARRIE)
  check([carrie['treasury.create'], carrie['reports.view'], carrie['reconciliation.view']], ['all', undefined, undefined],
    'an untemplated title: her account\'s keys, her old denies still holding')

  // ── A titled person holds their template's cells ──────────────────────────
  const T = Object.fromEntries((await q('SELECT id, key FROM permission_templates')).map(t => [t.key, t.id]))
  const person = async (key, n) => {
    const user = id(200 + n)
    const title = await one('INSERT INTO titles(name, department_id, template_id) VALUES ($1, $2, $3) RETURNING id',
      [`TEST ${key}`, DEPT_IDS.Finance, T[key]])
    await q("INSERT INTO users(id, email, name, role) VALUES ($1, $2, $3, 'finance')", [user, `${key}@example.com`, `PERSON ${key}`])
    await q('INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id) VALUES ($1, $2, $3, $4)',
      [`PERSON ${key}`, DEPT_IDS.Finance, title, user])
    return user
  }
  const grantsOf = async key => sorted((await q(`SELECT function_key || '.' || action || ':' || scope AS c
    FROM permission_template_grants WHERE template_id = $1`, [T[key]])).map(r => r.c))

  const checker = await person('fin_checker', 1)
  const maker = await person('fin_maker', 2)
  const director = await person('director', 3)
  const head = await person('dept_head', 4)
  const staff = await person('staff', 5)
  for (const [key, user] of Object.entries({ fin_checker: checker, fin_maker: maker, director, dept_head: head, staff })) {
    check(asList(await actionsOf(user)), await grantsOf(key), `${key}: exactly the template's cells`)
  }
  check([await holds(checker, 'treasury', 'approve'), await holds(checker, 'treasury', 'create')], [true, false],
    'the Checker approves, never raises')
  check([await holds(maker, 'treasury', 'create'), await holds(maker, 'treasury', 'approve')], [true, false],
    'the Maker raises, never approves')
  // The Approvals key opens the queue, and PR1 gives it to an owner's template
  // only — so a Director's Approve cell is held but cannot be used until
  // approvals go by domain (20261008210000). The app's canDo says the same.
  check([(await actionsOf(director))['approvals.approve'], await holds(director, 'approvals', 'approve')], ['all', false],
    'a Director holds Approve, which waits for the Approvals key')
  check([await holds(head, 'claims', 'approve', 'dept'), await holds(head, 'claims', 'approve', 'all')], [true, false],
    'a department head approves their department\'s claims, nobody else\'s')
  check([await holds(staff, 'claims', 'create', 'own'), await holds(staff, 'claims', 'create')], [true, false],
    'staff raise their own claims only')

  // ── A cell never reaches past the key that opens its pages ────────────────
  const noSalary = await one(`INSERT INTO permission_templates(key, name, base_role) VALUES ('t_payroll_clerk', 'Payroll clerk', 'hr')
    RETURNING id`)
  await q(`INSERT INTO permission_template_grants(template_id, function_key, action, scope) VALUES
    ($1, 'hr_costing', 'view', 'all'), ($1, 'hr_costing', 'edit', 'all')`, [noSalary])
  T.t_payroll_clerk = noSalary
  const clerk = await person('t_payroll_clerk', 6)
  check([(await actionsOf(clerk))['hr_costing.edit'], await holds(clerk, 'hr_costing', 'edit')], ['all', false],
    'HR Costing without salary sight: the cell is held, the page is not open, so it edits nothing')
  check(await holds(checker, 'treasury', 'approve'), true, 'Treasury · View opens Treasury, so the Checker’s Approve counts')

  // ── Their own cells over the template ─────────────────────────────────────
  await asSystem()
  await q(`INSERT INTO user_permission_cells(user_id, function_key, action, scope) VALUES
    ($1, 'treasury', 'approve', NULL), ($1, 'reconciliation', 'create', 'all')`, [checker])
  const raised = await actionsOf(checker)
  check([raised['treasury.approve'], raised['reconciliation.create'], raised['treasury.export']], [undefined, 'all', 'all'],
    'a cell of their own takes one away and gives another; the rest stay the template\'s')

  // ── Nobody, and the publishable key ───────────────────────────────────────
  check(await actionsOf(null), {}, 'nobody signed in holds nothing')
  await asSystem()
  await q('UPDATE users SET is_active = false WHERE id = $1', [FINANCE])
  check(await actionsOf(FINANCE), {}, 'a disabled login holds nothing')
  await as(null, 'anon')
  await assert.rejects(() => q('SELECT current_actions()'), /permission denied/, 'the publishable key cannot ask')
  checks++
  await assert.rejects(() => q("SELECT has_action('treasury', 'view', 'all')"), /permission denied/, 'nor ask a question of it')
  checks++
  await asSystem()

  // ══ Approvals by domain (20261009010000) ═══════════════════════════════════
  // The hotfix first (production's current_user_role(), then refused for a
  // sign-in with no account), then the approval world as production keeps it:
  // the request types, the requests, payroll runs, loans, bank accounts, and
  // the ten approval functions as stand-ins carrying production's exact role
  // check — the statement the migration swaps.
  await asSystem()
  await q('UPDATE users SET is_active = true WHERE id = $1', [FINANCE])
  await db.exec(`CREATE FUNCTION public.current_user_role() RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public' AS $function$\n    SELECT role FROM users WHERE id = auth.uid() AND is_active = TRUE\n$function$;`)
  await db.exec(await migrationText('20261009000100_definer_functions_need_a_login'))
  await db.exec(`
    CREATE TYPE approval_request_type AS ENUM ('new_loan', 'base_rate', 'tier_change', 'new_contract', 'contract_change',
      'dept_expense', 'advance', 'escalation', 'invoice_pool_release', 'profit_withdrawal', 'payment_voucher',
      'new_fund_source', 'hr_costing', 'payroll_run', 'dept_payment_request', 'loan_cancel');
    CREATE TABLE approval_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_type approval_request_type NOT NULL,
      reference_id uuid, reference_table text, submitted_by uuid NOT NULL, status text NOT NULL DEFAULT 'pending', group_id uuid);
    CREATE TABLE payroll_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submitted_by uuid, status text NOT NULL DEFAULT 'submitted');
    CREATE TABLE loans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'active');
    CREATE TABLE bank_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), current_balance numeric NOT NULL DEFAULT 0);
    ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
    ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
    -- What production's own policies give the Principal (admin scope) and the
    -- shared Finance account (treasury scope) to read.
    CREATE POLICY approvals_privileged_select ON approval_requests FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY approvals_principal_update ON approval_requests FOR UPDATE USING ((SELECT has_scope(ARRAY['admin'])));
    CREATE POLICY loans_read ON loans FOR SELECT USING (true);
    CREATE POLICY bank_read ON bank_accounts FOR SELECT USING (true);
    GRANT SELECT, INSERT, UPDATE ON approval_requests, payroll_runs, loans, bank_accounts TO authenticated;
  `)
  const pr2b = await migrationText('20261009010000_approvals_by_domain')
  const maybe = async (sql, params = []) => { const rows = await q(sql, params); return rows.length ? Object.values(rows[0])[0] : null }
  const STAND_IN_USER = {
    approve_single_voucher: 'p_user_id', approve_voucher_batch: 'p_user_id', approve_voucher_batch_partial: 'p_user_id',
    approve_payroll_run: 'p_approver', reject_payroll_run: 'p_approver',
  }
  const ARGS = {
    approve_single_voucher: 'p_approval_id uuid, p_user_id uuid, p_notes text, p_allow_overdraw boolean',
    approve_voucher_batch: 'p_group_id uuid, p_user_id uuid, p_notes text',
    approve_voucher_batch_partial: 'p_group_id uuid, p_approve_ids uuid[], p_reject_ids uuid[], p_user_id uuid, p_approve_notes text, p_reject_reason text',
    approve_payroll_run: 'p_run_id uuid, p_approver uuid',
    reject_payroll_run: 'p_run_id uuid, p_approver uuid, p_reason text',
    execute_loan_cancel: 'p_loan_id uuid',
    execute_fund_source_cancel: 'p_fund_source_id uuid',
    approve_dept_payment_expense: 'p_approval_id uuid',
    reject_dept_payment_request: 'p_approval_id uuid',
    dept_request_pv_rejected: 'p_voucher_id uuid',
  }
  const swaps = [...pr2b.matchAll(/swap_check\('public\.([a-z_]+)\([^)]*\)',\n\s+\$old\$([\s\S]*?)\$old\$/g)]
  check(swaps.map(m => m[1]).sort(), Object.keys(ARGS).sort(), 'the migration swaps the ten approval checks')
  for (const [, name, oldCheck] of swaps) {
    await db.exec(`CREATE FUNCTION public.${name}(${ARGS[name]}) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_approver_role user_role; v_role user_role;
BEGIN
    v_role := current_user_role();
    SELECT role INTO v_approver_role FROM users WHERE id = ${STAND_IN_USER[name] ?? 'auth.uid()'};
    ${oldCheck}
    RETURN 'ran';
END $f$;`)
    await db.exec(`GRANT EXECUTE ON FUNCTION public.${name}(${ARGS[name].replace(/p_[a-z_]+ /g, '')}) TO authenticated, service_role`)
  }

  // Before the migration only the Principal decides.
  const titled = async (templateKey, n, label) => {
    const user = id(400 + n)
    const title = await one('INSERT INTO titles(name, department_id, template_id) VALUES ($1, $2, $3) RETURNING id',
      [`TEST ${label}`, DEPT_IDS.Finance, T[templateKey]])
    await q("INSERT INTO users(id, email, name, role) VALUES ($1, $2, $3, 'finance')", [user, `${label}@example.com`, `PERSON ${label}`])
    await q('INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id) VALUES ($1, $2, $3, $4)',
      [`PERSON ${label}`, DEPT_IDS.Finance, title, user])
    return user
  }
  const checker2 = await titled('fin_checker', 1, 'checker two')
  const officer = await titled('office', 2, 'executive office')
  const voucherBy = async (by, type = 'payment_voucher', extra = {}) => one(
    `INSERT INTO approval_requests(request_type, submitted_by, reference_id, reference_table, status, group_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [type, by, extra.reference_id ?? null, extra.reference_table ?? null, extra.status ?? 'pending', extra.group_id ?? null])
  const fromMaker = await voucherBy(maker)
  await as(checker2)
  await assert.rejects(() => q('SELECT approve_single_voucher($1, $2, NULL, false)', [fromMaker, checker2]),
    /only Principal may approve/, 'before: a Checker approved nothing')
  checks++

  await asSystem()
  await db.exec(pr2b)
  check(await one("SELECT count(*)::int FROM pg_proc WHERE proname = ANY ($1) AND (prosrc LIKE '%approver_may%' OR prosrc LIKE '%approvable_types()%')",
    [Object.keys(ARGS)]), 10, 'all ten now ask who may decide')
  await db.exec(pr2b)
  checks++ // a second run is a no-op (each check is already swapped)

  // ── Nobody's access moves ──────────────────────────────────────────────────
  check([(await actionsOf(HR_SHARED))['hr_costing.approve'], (await actionsOf(HR_SHARED))['director_salary.approve']],
    [undefined, undefined], 'hr@ no longer says it approves payroll runs or Invoice Pool releases — it never could')
  const principalActs = await actionsOf(PRINCIPAL)
  check([principalActs['hr_costing.approve'], principalActs['director_salary.approve'], principalActs['revenue.approve']],
    ['all', 'all', 'all'], 'the Principal still holds all three, through the queue’s own key')
  const typesOf = async user => { await as(user); const t = await one('SELECT approvable_types()'); await asSystem(); return t }
  check((await typesOf(PRINCIPAL)).length, 16, 'the Principal decides every kind of request')
  check([await typesOf(FINANCE), await typesOf(HR_SHARED), await typesOf(MARKETING)], [[], [], []],
    'the shared Finance, HR and department accounts decide nothing, as before')

  // ── A Checker: Treasury's requests, never their own ───────────────────────
  const checkerTypes = await typesOf(checker2)
  check([checkerTypes.includes('payment_voucher'), checkerTypes.includes('loan_cancel'), checkerTypes.includes('payroll_run'),
    checkerTypes.includes('new_contract')], [true, true, false, false], 'a Checker decides Treasury’s requests only')
  await as(checker2)
  check(await one('SELECT approve_single_voucher($1, $2, NULL, false)', [fromMaker, checker2]), 'ran',
    'a Checker approves what a Maker raised')
  await asSystem()
  const ownVoucher = await voucherBy(checker2)
  await as(checker2)
  await assert.rejects(() => q('SELECT approve_single_voucher($1, $2, NULL, false)', [ownVoucher, checker2]),
    /may not decide this request/, 'but not the voucher they raised themselves')
  checks++
  await assert.rejects(() => q('SELECT approve_single_voucher($1, $2, NULL, false)', [fromMaker, maker]),
    /may not decide|as yourself|42501/, 'nor in somebody else’s name')
  checks++

  // A combined approval: every type in it, none of its submitters.
  await asSystem()
  const group = '00000000-0000-4000-8000-00000000a001'
  await voucherBy(maker, 'payment_voucher', { group_id: group })
  await voucherBy(maker, 'new_loan', { group_id: group })
  const mixed = '00000000-0000-4000-8000-00000000a002'
  await voucherBy(maker, 'payment_voucher', { group_id: mixed })
  await voucherBy(maker, 'payroll_run', { group_id: mixed })
  await as(checker2)
  check(await one('SELECT approve_voucher_batch($1, $2, NULL)', [group, checker2]), 'ran', 'a loan and its voucher, together')
  await assert.rejects(() => q('SELECT approve_voucher_batch($1, $2, NULL)', [mixed, checker2]),
    /may not decide this group/, 'not a group holding a payroll run')
  checks++

  // A booked loan is reversed only behind its approved cancellation.
  await asSystem()
  const loan = await one("INSERT INTO loans(status) VALUES ('active') RETURNING id")
  await as(checker2)
  await assert.rejects(() => q('SELECT execute_loan_cancel($1)', [loan]), /no approved cancellation/,
    'no cancellation approved, nothing reversed')
  checks++
  await asSystem()
  await voucherBy(maker, 'loan_cancel', { reference_id: loan, reference_table: 'loans', status: 'approved' })
  await as(checker2)
  check(await one('SELECT execute_loan_cancel($1)', [loan]), 'ran', 'once approved, the Checker reverses it')
  await as(HR_SHARED)
  await assert.rejects(() => q('SELECT execute_loan_cancel($1)', [loan]), /may not cancel a booked loan/, 'hr@ never')
  checks++

  // ── A Director: the queue's own Approve — everything in it ────────────────
  await asSystem()
  const run = await one('INSERT INTO payroll_runs(submitted_by) VALUES ($1) RETURNING id', [HR_SHARED])
  await as(director)
  check((await one('SELECT approvable_types()')).length, 16, 'a Director decides every kind of request')
  check(await one('SELECT approve_payroll_run($1, $2)', [run, director]), 'ran', 'a payroll run included')
  await as(checker2)
  await assert.rejects(() => q('SELECT approve_payroll_run($1, $2)', [run, checker2]), /may not approve this run/,
    'a Checker’s Treasury Approve does not reach payroll')
  checks++
  await as(director)
  check(await one('SELECT dept_request_pv_rejected($1)', [id(999)]), 'ran',
    'whoever may decide a voucher hands its department request back on a rejection')

  // ── The Executive office: sees the queue, decides nothing ──────────────────
  await as(officer)
  check(await one('SELECT count(*)::int FROM approval_requests') > 0, true, 'the office reads the queue')
  check(await one('SELECT approvable_types()'), [], 'and decides nothing in it')
  check(await maybe("UPDATE approval_requests SET status = 'approved' WHERE id = $1 RETURNING 'flipped'", [fromMaker]),
    null, 'nor flips one by hand')

  // ── Row policies ───────────────────────────────────────────────────────────
  await as(checker2)
  check(await maybe("UPDATE approval_requests SET status = 'rejected' WHERE id = $1 RETURNING 'flipped'", [ownVoucher]),
    null, 'a Checker cannot flip their own request')
  const bank = await (async () => { await asSystem(); return one('INSERT INTO bank_accounts DEFAULT VALUES RETURNING id') })()
  await as(checker2)
  check(await one("UPDATE bank_accounts SET current_balance = 10 WHERE id = $1 RETURNING 'moved'", [bank]), 'moved',
    'a Treasury approver moves the bank balance an approval moves')
  await as(HR_SHARED)
  check(await maybe("UPDATE bank_accounts SET current_balance = 20 WHERE id = $1 RETURNING 'moved'", [bank]), null,
    'hr@ does not')

  // ── With no sign-in: the rule as it was ────────────────────────────────────
  await as(null, 'service_role')
  check(await one('SELECT approve_single_voucher($1, $2, NULL, false)', [fromMaker, PRINCIPAL]), 'ran',
    'the server, handing in the Principal, approves as before')
  await assert.rejects(() => q('SELECT approve_single_voucher($1, $2, NULL, false)', [fromMaker, FINANCE]),
    /may not decide this request/, 'handing in anybody else, it does not')
  checks++
  await asSystem()

  console.log(`PASS: ${checks} permission action checks (PR2 + approvals by domain). PR1 world; the migrations verbatim; no live database.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}

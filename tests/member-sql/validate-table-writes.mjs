// Local PostgreSQL regression for 20261009020000 (PR3a of the People
// Management revamp, 2026-10-09): the database asks for the action too.
//
// The PR1 world (production's 35 keys and role defaults, the titles, the five
// accounts that sign in), every permission migration since VERBATIM, then a
// handful of production's tables with the row policies production gives them
// — a domain each (`has_scope(ARRAY['treasury'])` and friends), the department
// manager's role policies, and the INVOKER trigger by which a payment voucher
// marks its invoice paid. The hole is shown first (a template that only READS
// Treasury raises a voucher), then the migration closes it, and the five
// accounts keep every write the app makes. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const maybe = async (sql, params = []) => { const rows = await q(sql, params); return rows.length ? Object.values(rows[0])[0] : null }
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

// A write as somebody: 'ok', or the database's refusal. A refused DELETE (or an
// UPDATE no row policy lets them see) touches nothing and says so.
async function attempt(user, sql, params = []) {
  await as(user)
  try {
    const rows = await q(sql, params)
    return rows.length ? 'ok' : 'nothing'
  } catch (error) {
    if (/row-level security|row level security/i.test(error.message)) return 'refused'
    throw error
  } finally {
    await asSystem()
  }
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
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

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

  // ── Every permission migration so far, verbatim ───────────────────────────
  await db.exec(await migrationText('20261008110000_user_role_staff'))
  await db.exec(await migrationText('20261008120000_permission_templates'))
  await db.exec(await migrationText('20261008130000_permission_cells_of_search_path'))
  await db.exec(await migrationText('20261008190000_app_wide_audit'))
  await db.exec(await migrationText('20261008200000_permission_actions'))
  await db.exec(`CREATE FUNCTION public.current_user_role() RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public' AS $function$\n    SELECT role FROM users WHERE id = auth.uid() AND is_active = TRUE\n$function$;`)
  await db.exec(`CREATE FUNCTION public.current_user_department_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public' AS $function$\n    SELECT department_id FROM users WHERE id = auth.uid() AND is_active = TRUE\n$function$;`)
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
    CREATE POLICY approvals_privileged_select ON approval_requests FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY approvals_principal_update ON approval_requests FOR UPDATE USING ((SELECT has_scope(ARRAY['admin'])));
    CREATE POLICY loans_read ON loans FOR SELECT USING (true);
    CREATE POLICY loans_finance_insert ON loans FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY bank_read ON bank_accounts FOR SELECT USING (true);
    GRANT SELECT, INSERT, UPDATE ON approval_requests, payroll_runs, loans, bank_accounts TO authenticated;
  `)
  // The ten approval functions it rewrites, as stand-ins carrying production's
  // exact role check (validate-permission-actions.mjs tests them in earnest).
  const pr2b = await migrationText('20261009010000_approvals_by_domain')
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
  for (const [, name, oldCheck] of pr2b.matchAll(/swap_check\('public\.([a-z_]+)\([^)]*\)',\n\s+\$old\$([\s\S]*?)\$old\$/g)) {
    await db.exec(`CREATE FUNCTION public.${name}(${ARGS[name]}) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_approver_role user_role; v_role user_role;
BEGIN
    v_role := current_user_role();
    v_approver_role := v_role;
    ${oldCheck}
    RETURN 'ran';
END $f$;`)
  }
  await db.exec(pr2b)

  // ── Production's tables, with production's row policies ───────────────────
  await db.exec(`
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'draft',
      department_id uuid, created_by uuid);
    CREATE TABLE payment_vouchers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'draft', invoice_id uuid);
    CREATE TABLE credit_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'draft');
    CREATE TABLE journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description text);
    CREATE TABLE venture_pool(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric NOT NULL);
    CREATE TABLE report_layouts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), layout jsonb);
    CREATE TABLE hr_monthly_payroll(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gross numeric NOT NULL,
      status text NOT NULL DEFAULT 'draft');
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
    CREATE TABLE sales_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note text);
    CREATE TABLE table_layout_defaults(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), layout jsonb);
    DO $$ DECLARE t text; BEGIN
      FOREACH t IN ARRAY ARRAY['invoices', 'payment_vouchers', 'credit_notes', 'journal_entries', 'venture_pool', 'report_layouts',
        'hr_monthly_payroll', 'comm_schemes', 'sales_orders', 'table_layout_defaults'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_read', t);
      END LOOP;
    END $$;

    -- Treasury: the domain, as production words it.
    CREATE POLICY pv_insert ON payment_vouchers FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY pv_update ON payment_vouchers FOR UPDATE USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY pv_no_delete ON payment_vouchers FOR DELETE USING (false);
    CREATE POLICY cn_insert ON credit_notes FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY cn_update ON credit_notes FOR UPDATE USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY je_insert ON journal_entries FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY hv_fund_finance_insert ON venture_pool FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury', 'hr'])));
    CREATE POLICY hv_fund_principal_insert ON venture_pool FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
    CREATE POLICY report_layouts_write ON report_layouts FOR ALL
      USING ((SELECT has_scope(ARRAY['treasury']))) WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY invoices_finance_insert ON invoices FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY invoices_finance_update ON invoices FOR UPDATE USING ((SELECT has_scope(ARRAY['treasury'])));
    -- A department manager's own draft invoices (production words the
    -- department through the billing mode's segment).
    CREATE POLICY invoices_dept_manager_insert ON invoices FOR INSERT WITH CHECK (
      (SELECT current_user_role()) = 'dept_manager' AND status = 'draft'
      AND department_id = (SELECT current_user_department_id()) AND created_by = (SELECT auth.uid()));
    CREATE POLICY invoices_dept_manager_update ON invoices FOR UPDATE USING (
      (SELECT current_user_role()) = 'dept_manager' AND status = 'draft'
      AND department_id = (SELECT current_user_department_id()) AND created_by = (SELECT auth.uid()));

    -- HR and Revenue: the domain, and the Principal's own.
    CREATE POLICY hr_monthly_payroll_principal_all ON hr_monthly_payroll FOR ALL
      USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
    CREATE POLICY hr_monthly_payroll_hr_insert ON hr_monthly_payroll FOR INSERT
      WITH CHECK ((((SELECT has_scope(ARRAY['hr'])) AND status = 'draft') OR (SELECT has_scope(ARRAY['admin']))));
    CREATE POLICY hr_monthly_payroll_hr_update ON hr_monthly_payroll FOR UPDATE
      USING ((((SELECT has_scope(ARRAY['hr'])) AND status = 'draft') OR (SELECT has_scope(ARRAY['admin']))));
    CREATE POLICY comm_schemes_hr_all ON comm_schemes FOR ALL
      USING ((SELECT has_scope(ARRAY['hr']))) WITH CHECK ((SELECT has_scope(ARRAY['hr'])));
    CREATE POLICY comm_schemes_principal_all ON comm_schemes FOR ALL
      USING ((SELECT has_scope(ARRAY['admin']))) WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
    CREATE POLICY sales_orders_hr_all ON sales_orders FOR ALL
      USING ((SELECT has_scope(ARRAY['hr']))) WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

    -- What a page looks like, by role (WRITES_WITHOUT_ACTION).
    CREATE POLICY table_layout_defaults_set ON table_layout_defaults FOR ALL TO authenticated
      USING (current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role, 'hr'::user_role]))
      WITH CHECK (current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role, 'hr'::user_role]));

    -- A voucher marks its invoice paid, as the caller (production's
    -- mark_invoice_paid_on_voucher_insert is SECURITY INVOKER).
    CREATE FUNCTION mark_invoice_paid_on_voucher_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.invoice_id IS NOT NULL THEN
        UPDATE invoices i SET status = 'paid' WHERE i.id = NEW.invoice_id;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER trg_pv_mark_invoice_paid_on_insert AFTER INSERT ON payment_vouchers
      FOR EACH ROW EXECUTE FUNCTION mark_invoice_paid_on_voucher_insert();

    GRANT SELECT, INSERT, UPDATE, DELETE ON invoices, payment_vouchers, credit_notes, journal_entries, venture_pool,
      report_layouts, hr_monthly_payroll, comm_schemes, sales_orders, table_layout_defaults, loans TO authenticated;
  `)

  // ── The people ────────────────────────────────────────────────────────────
  const T = Object.fromEntries((await q('SELECT id, key FROM permission_templates')).map(t => [t.key, t.id]))
  const titled = async (templateKey, n, label, department = 'Finance') => {
    const user = id(300 + n)
    const title = await one('INSERT INTO titles(name, department_id, template_id) VALUES ($1, $2, $3) RETURNING id',
      [`TEST ${label}`, DEPT_IDS[department], T[templateKey]])
    await q("INSERT INTO users(id, email, name, role, department_id) VALUES ($1, $2, $3, 'staff', $4)",
      [user, `${n}@example.com`, `PERSON ${label}`, DEPT_IDS[department]])
    await q('INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id) VALUES ($1, $2, $3, $4)',
      [`PERSON ${label}`, DEPT_IDS[department], title, user])
    return user
  }
  // Somebody who may only READ Treasury.
  T.t_viewer = await one(`INSERT INTO permission_templates(key, name, base_role) VALUES ('t_viewer', 'Treasury viewer', 'finance')
    RETURNING id`)
  await q(`INSERT INTO permission_template_grants(template_id, function_key, action, scope) VALUES
    ($1, 'dashboard', 'view', 'all'), ($1, 'treasury', 'view', 'all')`, [T.t_viewer])
  const viewer = await titled('t_viewer', 1, 'viewer')
  const maker = await titled('fin_maker', 2, 'maker')
  const checker = await titled('fin_checker', 3, 'checker')
  const director = await titled('director', 4, 'director', 'Director')
  const payroll = await titled('hr', 5, 'hr payroll', 'HR')
  const head = await titled('dept_head', 6, 'head', 'Marketing')

  const voucher = 'INSERT INTO payment_vouchers(amount) VALUES (100) RETURNING id'
  const payrollRow = "INSERT INTO hr_monthly_payroll(gross, status) VALUES (3000, 'draft') RETURNING id"
  const scheme = "INSERT INTO comm_schemes(name) VALUES ('Fair') RETURNING id"

  // ── Before: a domain opens every write in it ──────────────────────────────
  check(await attempt(viewer, voucher), 'ok', 'before: a template that only reads Treasury raises a payment voucher')
  check(await attempt(director, payrollRow), 'ok', 'before: a Director who sees the roster writes payroll')
  check(await attempt(director, scheme), 'ok', 'before: and the commission scheme')
  check(await attempt(HR_SHARED, 'INSERT INTO venture_pool(amount) VALUES (1) RETURNING id'), 'ok',
    'before: hr@ writes the Venture Pool ledger')

  // ── The migration ─────────────────────────────────────────────────────────
  const pr3a = await migrationText('20261009020000_writes_ask_for_the_action')
  await db.exec(pr3a)
  check(await one('SELECT count(*)::int FROM permission_table_writes') > 300, true, 'the registry, every table and command')
  check(await one("SELECT mode FROM audit_tables WHERE table_name = 'permission_table_writes'"), 'all', 'and its history is kept')
  const restrictive = async table => (await q(`SELECT policyname, cmd FROM pg_policies
    WHERE tablename = $1 AND permissive = 'RESTRICTIVE' ORDER BY policyname`, [table])).map(p => `${p.policyname} ${p.cmd}`)
  check(await restrictive('payment_vouchers'), ['needs_action_insert INSERT', 'needs_action_update UPDATE'],
    'a voucher asks on INSERT and UPDATE — the commands registered for it')
  check(await restrictive('comm_schemes'), ['needs_action_delete DELETE', 'needs_action_insert INSERT', 'needs_action_update UPDATE'],
    'a scheme on all three')
  check(await restrictive('table_layout_defaults'), [], 'a page layout asks for nothing')
  check(await one(`SELECT count(*)::int FROM pg_policies WHERE permissive = 'RESTRICTIVE' AND tablename = 'alloc_txns'`), 0,
    'a registered table this database does not have is skipped')

  // ── After: the action, not the domain ─────────────────────────────────────
  check(await attempt(viewer, voucher), 'refused', 'a Treasury viewer raises nothing')
  check(await attempt(viewer, "UPDATE payment_vouchers SET amount = 1 RETURNING id"), 'refused', 'nor edits a voucher')
  check(await attempt(director, payrollRow), 'refused', 'a Director no longer writes payroll')
  check(await attempt(director, scheme), 'refused', 'nor the commission scheme')
  check(await attempt(director, 'DELETE FROM comm_schemes RETURNING id'), 'nothing', 'and deletes nothing there')
  check(await attempt(director, voucher), 'ok', 'a Director raises a voucher (Treasury · Create)')

  // The Maker raises; the INVOKER trigger marking the invoice paid rides on it.
  await asSystem()
  const invoice = await one("INSERT INTO invoices(status) VALUES ('issued') RETURNING id")
  check(await attempt(maker, 'INSERT INTO payment_vouchers(amount, invoice_id) VALUES (50, $1) RETURNING id', [invoice]), 'ok',
    'the Maker raises a voucher against an invoice')
  check(await one('SELECT status FROM invoices WHERE id = $1', [invoice]), 'paid', 'and the trigger marks it paid as the Maker')
  check(await attempt(maker, 'INSERT INTO loans DEFAULT VALUES RETURNING id'), 'ok', 'the Maker books a loan')
  check(await attempt(maker, "INSERT INTO credit_notes(status) VALUES ('draft') RETURNING id"), 'ok', 'and drafts a credit note')
  check(await attempt(maker, 'INSERT INTO journal_entries(description) VALUES (\'x\') RETURNING id'), 'ok',
    'and keys a journal entry (Reconciliation · Create)')

  check(await attempt(checker, 'INSERT INTO loans DEFAULT VALUES RETURNING id'), 'refused', 'the Checker books no loan')
  check(await attempt(checker, "INSERT INTO credit_notes(status) VALUES ('draft') RETURNING id"), 'refused', 'drafts no credit note')
  check(await attempt(checker, 'INSERT INTO journal_entries(description) VALUES (\'x\') RETURNING id'), 'refused',
    'keys no journal entry')
  check(await attempt(checker, "UPDATE payment_vouchers SET status = 'approved' RETURNING id"), 'ok',
    'but moves a voucher it decides (Treasury · Approve)')
  // Approving a claim raises its voucher (claims/actions.ts approveClaim), so
  // Claims · Approve may write one — the app's own path.
  check(await attempt(checker, voucher), 'ok', 'Claims · Approve raises a claim’s voucher')

  check(await attempt(payroll, payrollRow), 'ok', 'HR · Payroll writes payroll')
  check(await attempt(payroll, "UPDATE sales_orders SET note = 'x' RETURNING id"), 'nothing',
    'and may edit an order (Revenue · Edit) — there is none')
  check(await attempt(payroll, scheme), 'refused', 'but not the scheme’s rules (Revenue · Manage)')
  check(await attempt(payroll, voucher), 'refused', 'nor anything in Treasury')

  check(await attempt(head, `INSERT INTO invoices(status, department_id, created_by) VALUES ('draft', $1, $2) RETURNING id`,
    [DEPT_IDS.Marketing, head]), 'ok', 'a department head drafts their department’s invoice (My Billing · Create, Dept)')
  check(await attempt(head, `INSERT INTO invoices(status, department_id, created_by) VALUES ('draft', $1, $2) RETURNING id`,
    [DEPT_IDS.Finance, head]), 'refused', 'never another department’s')
  check(await attempt(head, voucher), 'refused', 'and raises no voucher')

  // ── The shared accounts keep every write the app makes ────────────────────
  check(await attempt(PRINCIPAL, voucher), 'ok', 'the Principal raises')
  check(await attempt(PRINCIPAL, payrollRow), 'ok', 'writes payroll')
  check(await attempt(PRINCIPAL, scheme), 'ok', 'and the rules')
  check(await attempt(FINANCE, voucher), 'ok', 'finance@ raises a voucher')
  check(await attempt(FINANCE, "UPDATE payment_vouchers SET amount = 2 RETURNING id"), 'ok', 'edits one')
  check(await attempt(FINANCE, 'INSERT INTO venture_pool(amount) VALUES (1) RETURNING id'), 'ok', 'writes the Venture Pool')
  check(await attempt(FINANCE, 'INSERT INTO journal_entries(description) VALUES (\'x\') RETURNING id'), 'ok', 'keys a journal entry')
  check(await attempt(FINANCE, 'INSERT INTO report_layouts(layout) VALUES (\'{}\') RETURNING id'), 'ok', 'saves a report layout')
  check(await attempt(FINANCE, 'INSERT INTO table_layout_defaults(layout) VALUES (\'{}\') RETURNING id'), 'ok',
    'and a table’s default layout, which asks for nothing')
  check(await attempt(CARRIE, voucher), 'ok', 'carrie raises a voucher')
  // Her Reconciliation is denied by hand, so the app keys no journal entry for
  // her — and now neither does the API.
  check(await attempt(CARRIE, 'INSERT INTO journal_entries(description) VALUES (\'x\') RETURNING id'), 'refused',
    'carrie keys no journal entry: her Reconciliation is held back')
  check(await attempt(HR_SHARED, payrollRow), 'ok', 'hr@ writes payroll')
  check(await attempt(HR_SHARED, scheme), 'ok', 'and the scheme (Revenue · Manage, from its key)')
  check(await attempt(HR_SHARED, 'INSERT INTO venture_pool(amount) VALUES (1) RETURNING id'), 'refused',
    'but not the Venture Pool ledger — no page of its writes there')
  check(await attempt(HR_SHARED, voucher), 'refused', 'nor a voucher, as before')
  check(await attempt(MARKETING, `INSERT INTO invoices(status, department_id, created_by) VALUES ('draft', $1, $2) RETURNING id`,
    [DEPT_IDS.Marketing, MARKETING]), 'ok', 'marketing@ drafts its department’s invoice')
  check(await attempt(MARKETING, voucher), 'refused', 'and raises no voucher, as before')

  // ── The question itself ───────────────────────────────────────────────────
  await as(MARKETING)
  check([await one("SELECT has_any_action(ARRAY['my_billing.create:dept'])"), await one("SELECT has_any_action(ARRAY['my_billing.create'])"),
    await one("SELECT has_any_action(ARRAY['treasury.create', 'my_billing.create:dept'])")], [true, false, true],
  'a reach is at least as far as asked; any one of several will do')
  check(await one("SELECT may_write('no_such_table', 'INSERT')"), false, 'a table with no row: no')
  await as(null, 'anon')
  await assert.rejects(() => q("SELECT may_write('payment_vouchers', 'INSERT')"), /permission denied/,
    'the publishable key cannot ask')
  checks++
  await asSystem()

  // ── Again, and a table nobody registered ──────────────────────────────────
  await db.exec(pr3a)
  check(await restrictive('payment_vouchers'), ['needs_action_insert INSERT', 'needs_action_update UPDATE'], 'a second run changes nothing')
  check(await attempt(maker, voucher), 'ok', 'and the policies still ask the same')
  const guard = pr3a.slice(pr3a.indexOf('DO $guard$'), pr3a.indexOf('END $guard$;') + 'END $guard$;'.length)
  await db.exec(`CREATE TABLE petty_cash(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    ALTER TABLE petty_cash ENABLE ROW LEVEL SECURITY;
    CREATE POLICY petty_cash_write ON petty_cash FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));`)
  await assert.rejects(() => db.exec(guard), /without asking for an action: petty_cash INSERT/,
    'a new table a domain policy opens is refused until it asks')
  checks++
  await db.exec(`INSERT INTO permission_table_writes VALUES ('petty_cash', 'INSERT', ARRAY['treasury.create']);
    SELECT permission_writes_guard('petty_cash');`)
  await db.exec(guard)
  checks++ // registered and guarded, it passes

  console.log(`PASS: ${checks} table write checks (PR3a). PR1 world; the migrations verbatim; no live database.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}

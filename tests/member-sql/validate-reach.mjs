// Local PostgreSQL regression for 20261009040000 (PR3c of the People
// Management revamp, 2026-10-09): Own and Dept reach the rows. The PR1 world
// and every permission migration since VERBATIM; production's row policies
// that asked for the KIND of account; a stand-in for each read function
// carrying production's exact check; rows in two departments — then the
// migration. The five accounts that sign in read every row they read before
// (and every function answers them as before, but for the moves listed
// below), a template reaches its own / its department's / every row by its
// cells, and a claim is raised only as yourself. No live I/O.
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

// A write as somebody: 'ok', or the database's refusal.
async function attempt(user, sql, params = []) {
  await as(user)
  try {
    await q(sql, params)
    return 'ok'
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
const MKT = DEPT_IDS.Marketing
const FIN = DEPT_IDS.Finance

const PRINCIPAL = id(1)
const FINANCE = id(2)
const HR_SHARED = id(3)
const MARKETING = id(4)
const CARRIE = id(5)

// The read functions' signatures, as production names their parameters (the
// checks the migration swaps read them by name).
const ARGS = {
  calculate_dept_np: 'p_dept_id uuid, p_period date',
  get_dept_opex_rows: 'p_dept_id uuid, p_period_start date, p_period_end date',
  dept_invoice_settlements: 'p_segment gl_segment',
  rnp_invoice_events: 'p_segment text',
  bridge_mirror_slices: '',
  get_hr_cost_submissions_list: '',
  get_hr_cost_summary: '',
  get_submitted_hr_summary: 'p_period date',
  get_director_ctc_by_company: 'p_period_month date',
  get_staff_billing_allocation: 'p_period_month date',
  get_staff_own_share_allocation: 'p_period_month date',
  get_payroll_accrual_totals: 'p_period date',
  get_payroll_accrual_totals_for: 'p_reference_id uuid',
  get_payroll_funding_paid: 'p_request_id uuid',
  get_director_payout_summary: 'p_period date',
  revenue_pay_preview: 'p_sub_department_id uuid, p_period date',
  comm_effective_direct_line_limits: 'p_scheme_id uuid',
}
const CALL = {
  calculate_dept_np: `SELECT public.calculate_dept_np('${MKT}', '2026-09-01')`,
  get_dept_opex_rows: `SELECT public.get_dept_opex_rows('${MKT}', '2026-01-01', '2026-09-30')`,
  dept_invoice_settlements: 'SELECT public.dept_invoice_settlements(NULL)',
  rnp_invoice_events: 'SELECT public.rnp_invoice_events(NULL)',
  bridge_mirror_slices: 'SELECT public.bridge_mirror_slices()',
  get_hr_cost_submissions_list: 'SELECT public.get_hr_cost_submissions_list()',
  get_hr_cost_summary: 'SELECT public.get_hr_cost_summary()',
  get_submitted_hr_summary: "SELECT public.get_submitted_hr_summary('2026-09-01')",
  get_director_ctc_by_company: "SELECT public.get_director_ctc_by_company('2026-09-01')",
  get_staff_billing_allocation: "SELECT public.get_staff_billing_allocation('2026-09-01')",
  get_staff_own_share_allocation: "SELECT public.get_staff_own_share_allocation('2026-09-01')",
  get_payroll_accrual_totals: "SELECT public.get_payroll_accrual_totals('2026-09-01')",
  get_payroll_accrual_totals_for: `SELECT public.get_payroll_accrual_totals_for('${id(900)}')`,
  get_payroll_funding_paid: `SELECT public.get_payroll_funding_paid('${id(901)}')`,
  get_director_payout_summary: "SELECT public.get_director_payout_summary('2026-09-01')",
  revenue_pay_preview: `SELECT public.revenue_pay_preview('${id(902)}', '2026-09-01')`,
  comm_effective_direct_line_limits: `SELECT public.comm_effective_direct_line_limits('${id(903)}')`,
}
const TABLES = ['claims', 'approval_requests', 'dept_pools', 'dept_payment_requests', 'invoice_submission_requests', 'invoices',
  'journal_entries', 'journal_lines', 'revenue_payroll_commission_adjustments', 'service_contracts']

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
  [PRINCIPAL, FINANCE, HR_SHARED, MARKETING, CARRIE, MKT, FIN])
  await q(`INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id)
    SELECT 'CARRIE', $1, t.id, $2 FROM titles t WHERE t.name = 'ACCOUNTS EXECUTIVE'`, [FIN, CARRIE])
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

  // ── Production's tables and the row policies that asked for the kind ──────
  await db.exec(`
    CREATE TYPE gl_segment AS ENUM ('marketing', 'hr', 'finance', 'director_office', 'director', 'corporate');
    CREATE TYPE approval_request_type AS ENUM ('new_loan', 'base_rate', 'tier_change', 'new_contract', 'contract_change',
      'dept_expense', 'advance', 'escalation', 'invoice_pool_release', 'profit_withdrawal', 'payment_voucher',
      'new_fund_source', 'hr_costing', 'payroll_run', 'dept_payment_request', 'loan_cancel');
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
    CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'voided');
    CREATE TYPE dept_pool_txn_type AS ENUM ('expense_out', 'inter_billing_out', 'fund_in');
    -- Production: the segment of the person's department; the segment an invoice's billing mode books to.
    CREATE FUNCTION public.current_user_segment() RETURNS gl_segment LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path TO 'public' AS $f$
      SELECT CASE d.name WHEN 'Marketing' THEN 'marketing' WHEN 'Finance' THEN 'finance' WHEN 'HR' THEN 'hr' END::gl_segment
        FROM users u JOIN departments d ON d.id = u.department_id WHERE u.id = auth.uid() $f$;
    CREATE FUNCTION public.billing_mode_to_segment(p_mode text) RETURNS gl_segment LANGUAGE sql STABLE AS $f$
      SELECT CASE p_mode WHEN 'marketing_project' THEN 'marketing' WHEN 'hr_attribution' THEN 'hr'
        WHEN 'finance_attribution' THEN 'finance' ELSE 'corporate' END::gl_segment $f$;
    GRANT EXECUTE ON FUNCTION public.current_user_segment(), public.billing_mode_to_segment(text) TO authenticated;

    CREATE TABLE approval_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_type approval_request_type NOT NULL,
      reference_id uuid, reference_table text, submitted_by uuid NOT NULL,
      status approval_status NOT NULL DEFAULT 'pending', group_id uuid);
    CREATE TABLE payroll_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submitted_by uuid, status text NOT NULL DEFAULT 'submitted');
    CREATE TABLE loans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'active');
    CREATE TABLE bank_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), current_balance numeric NOT NULL DEFAULT 0);
    CREATE TABLE claims(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_type text NOT NULL DEFAULT 'project',
      claimant_name text, department_id uuid, amount numeric NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending',
      created_by uuid);
    CREATE TABLE dept_pools(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid,
      transaction_type dept_pool_txn_type NOT NULL, amount numeric NOT NULL DEFAULT 0, description text);
    CREATE TABLE dept_payment_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid);
    CREATE TABLE invoice_submission_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid);
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status invoice_status NOT NULL DEFAULT 'draft',
      billing_mode text NOT NULL, created_by uuid);
    CREATE TABLE journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), segment gl_segment);
    CREATE TABLE journal_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid REFERENCES journal_entries(id));
    CREATE TABLE revenue_payroll_commission_adjustments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE service_contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid);
    DO $$ DECLARE t text; BEGIN
      FOREACH t IN ARRAY ARRAY['approval_requests', 'loans', 'bank_accounts', 'claims', 'dept_pools', 'dept_payment_requests',
        'invoice_submission_requests', 'invoices', 'journal_entries', 'journal_lines',
        'revenue_payroll_commission_adjustments', 'service_contracts'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      END LOOP;
    END $$;
    GRANT SELECT, INSERT, UPDATE, DELETE ON approval_requests, payroll_runs, loans, bank_accounts, claims, dept_pools,
      dept_payment_requests, invoice_submission_requests, invoices, journal_entries, journal_lines,
      revenue_payroll_commission_adjustments, service_contracts TO authenticated;

    -- The domain's own readers (by key), as production has them.
    CREATE POLICY approvals_privileged_select ON approval_requests FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY approvals_principal_update ON approval_requests FOR UPDATE USING ((SELECT has_scope(ARRAY['admin'])));
    CREATE POLICY loans_read ON loans FOR SELECT USING (true);
    CREATE POLICY loans_finance_insert ON loans FOR INSERT WITH CHECK ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY bank_read ON bank_accounts FOR SELECT USING (true);
    CREATE POLICY claims_privileged_select ON claims FOR SELECT USING ((SELECT has_scope(ARRAY['treasury', 'hr'])));
    CREATE POLICY dpr_finance_select ON dept_payment_requests FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY isr_finance_select ON invoice_submission_requests FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY invoices_finance_select ON invoices FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY journal_entries_finance_select ON journal_entries FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY journal_lines_finance_select ON journal_lines FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));

    -- …and the eighteen that asked for the kind, exactly as production wrote them.
    CREATE POLICY approvals_dept_manager_own_expense_select ON approval_requests FOR SELECT USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (request_type = 'dept_expense'::approval_request_type)
      AND (reference_table = 'departments'::text) AND (reference_id = (SELECT current_user_department_id())));
    CREATE POLICY approvals_submit ON approval_requests FOR INSERT WITH CHECK (
      ((SELECT current_user_role()) = ANY (ARRAY['finance'::user_role, 'hr'::user_role, 'dept_manager'::user_role, 'principal'::user_role]))
      AND (submitted_by = (SELECT auth.uid())));
    CREATE POLICY approvals_submitter_update_own_pending ON approval_requests FOR UPDATE USING (
      (status = 'pending'::approval_status) AND (submitted_by = (SELECT auth.uid()))
      AND ((SELECT current_user_role()) = ANY (ARRAY['finance'::user_role, 'hr'::user_role, 'dept_manager'::user_role])))
      WITH CHECK ((status = 'pending'::approval_status) AND (submitted_by = (SELECT auth.uid())));
    CREATE POLICY claims_own_select ON claims FOR SELECT USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (created_by = (SELECT auth.uid())));
    CREATE POLICY claims_submit ON claims FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
    CREATE POLICY dpr_dept_manager_select_own ON dept_payment_requests FOR SELECT USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (department_id = (SELECT current_user_department_id())));
    CREATE POLICY dept_pools_dept_manager_insert ON dept_pools FOR INSERT WITH CHECK (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (transaction_type = 'expense_out'::dept_pool_txn_type)
      AND (department_id = (SELECT current_user_department_id())));
    CREATE POLICY dept_pools_pf_select ON dept_pools FOR SELECT USING (
      (SELECT has_scope(ARRAY['treasury'])) OR (((SELECT current_user_role()) = 'dept_manager'::user_role)
      AND (department_id = (SELECT current_user_department_id()))));
    CREATE POLICY isr_dept_manager_select_own ON invoice_submission_requests FOR SELECT USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (department_id = (SELECT current_user_department_id())));
    CREATE POLICY invoices_dept_manager_delete ON invoices FOR DELETE USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (status = 'draft'::invoice_status)
      AND (created_by = (SELECT auth.uid())) AND (billing_mode_to_segment(billing_mode) = (SELECT current_user_segment())));
    CREATE POLICY invoices_dept_manager_insert ON invoices FOR INSERT WITH CHECK (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (status = 'draft'::invoice_status)
      AND (billing_mode_to_segment(billing_mode) = (SELECT current_user_segment())) AND (created_by = (SELECT auth.uid())));
    CREATE POLICY invoices_dept_manager_select ON invoices FOR SELECT USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (billing_mode_to_segment(billing_mode) = (SELECT current_user_segment())));
    CREATE POLICY invoices_dept_manager_update ON invoices FOR UPDATE USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (status = 'draft'::invoice_status)
      AND (created_by = (SELECT auth.uid())) AND (billing_mode_to_segment(billing_mode) = (SELECT current_user_segment())));
    CREATE POLICY journal_entries_dept_manager_select ON journal_entries FOR SELECT USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (segment = (SELECT current_user_segment())));
    CREATE POLICY journal_lines_dept_manager_select ON journal_lines FOR SELECT USING (
      ((SELECT current_user_role()) = 'dept_manager'::user_role) AND (EXISTS (SELECT 1 FROM journal_entries je
        WHERE je.id = journal_lines.entry_id AND je.segment = (SELECT current_user_segment()))));
    CREATE POLICY revenue_commission_adjustments_read ON revenue_payroll_commission_adjustments FOR SELECT TO authenticated
      USING ((SELECT (current_user_role() = ANY (ARRAY['principal'::user_role, 'hr'::user_role]))));
    CREATE POLICY service_contracts_insert ON service_contracts FOR INSERT WITH CHECK (
      (SELECT has_scope(ARRAY['treasury'])) OR (((SELECT current_user_role()) = 'dept_manager'::user_role)
      AND (department_id = (SELECT current_user_department_id()))));
    CREATE POLICY service_contracts_pf_select ON service_contracts FOR SELECT USING (
      (SELECT has_scope(ARRAY['treasury'])) OR (((SELECT current_user_role()) = 'dept_manager'::user_role)
      AND (department_id = (SELECT current_user_department_id()))));
  `)

  // The approvals by domain (its ten functions as stand-ins), then PR3a — whose
  // restrictive write policies land on these tables as they did on production.
  const pr2b = await migrationText('20261009010000_approvals_by_domain')
  const PR2B_ARGS = {
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
    await db.exec(`CREATE FUNCTION public.${name}(${PR2B_ARGS[name]}) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_approver_role user_role; v_role user_role;
BEGIN
    v_role := current_user_role();
    v_approver_role := v_role;
    ${oldCheck}
    RETURN 'ran';
END $f$;`)
  }
  await db.exec(pr2b)
  await db.exec(await migrationText('20261009020000_writes_ask_for_the_action'))

  // ── The read functions, as stand-ins carrying production's exact checks ───
  const pr3c = await migrationText('20261009040000_own_and_dept_reach_the_rows')
  const swaps = [...pr3c.matchAll(/swap_check\('public\.([a-z_]+)\(([^)]*)\)',\n\s+\$q\$([\s\S]*?)\$q\$,\n\s+\$q\$([\s\S]*?)\$q\$\)/g)]
    .map(m => ({ name: m[1], old: m[3], fresh: m[4] }))
  check(swaps.length, 18, 'the migration swaps 18 checks in 17 functions')
  check(new Set(swaps.map(s => s.name)).size, 17, '…17 functions')
  const oldOf = name => swaps.filter(s => s.name === name).map(s => s.old)
  // Production writes them over several lines (and with comments); the swap
  // must find them whitespace-blind, so the stand-ins spread them out too.
  const spread = s => s
    .replace(/ (THEN) /gi, '\n        $1 ').replace(/ (USING) /gi, '\n          $1 ')
    .replace('see all departments NULL;', 'see all departments\n        NULL;')
    .replace('(all segments) ELSE', '(all segments)\n    ELSE')
  const BODY = {
    bridge_mirror_slices: ([a, b]) => `${a}\n        RETURN 'all';\n    ${b}\n        RETURN 'dept';\n    END IF;\n    RETURN 'none';`,
    get_hr_cost_submissions_list: ([a]) => `RETURN (SELECT 'ran'::text\n     WHERE ${a});`,
    get_hr_cost_summary: ([a]) => `RETURN (SELECT 'ran'::text WHERE true\n      ${a});`,
    get_submitted_hr_summary: ([a]) => `RETURN (SELECT 'ran'::text WHERE true\n      ${a});`,
    dept_invoice_settlements: ([a]) => `${spread(a)}\n    END IF;\n    RETURN coalesce(v_seg, 'none');`,
    rnp_invoice_events: ([a]) => `${spread(a)}\n    END IF;\n    RETURN coalesce(v_seg, 'all');`,
  }
  for (const [name, args] of Object.entries(ARGS)) {
    const body = (BODY[name] ?? (([a]) => `${spread(a)}\n    END IF;\n    RETURN 'ran';`))(oldOf(name))
    await db.exec(`CREATE FUNCTION public.${name}(${args}) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_role user_role; v_user_dept uuid; v_seg text;
BEGIN
    v_role := current_user_role();
    v_user_dept := current_user_department_id();
    ${body}
END $f$;
GRANT EXECUTE ON FUNCTION public.${name}(${args.replace(/p_\w+ /g, '')}) TO authenticated, service_role;`)
  }

  // ── The people ────────────────────────────────────────────────────────────
  const T = Object.fromEntries((await q('SELECT id, key FROM permission_templates')).map(t => [t.key, t.id]))
  const titled = async (templateKey, n, department) => {
    const user = id(300 + n)
    const title = await one('INSERT INTO titles(name, department_id, template_id) VALUES ($1, $2, $3) RETURNING id',
      [`TEST ${templateKey} ${n}`, DEPT_IDS[department], T[templateKey]])
    await q("INSERT INTO users(id, email, name, role, department_id) VALUES ($1, $2, $3, 'staff', $4)",
      [user, `${n}@example.com`, `PERSON ${n}`, DEPT_IDS[department]])
    await q('INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id) VALUES ($1, $2, $3, $4)',
      [`PERSON ${n}`, DEPT_IDS[department], title, user])
    return user
  }
  const people = {
    principal: PRINCIPAL, finance: FINANCE, hr: HR_SHARED, marketing: MARKETING, carrie: CARRIE,
    head: await titled('dept_head', 1, 'Marketing'),
    staff: await titled('staff', 2, 'Marketing'),
    staff2: await titled('staff', 3, 'Marketing'),
    director: await titled('director', 4, 'Director'),
    payroll: await titled('hr', 5, 'HR'),
  }

  // ── Rows in two departments ───────────────────────────────────────────────
  await q(`INSERT INTO claims(claimant_name, department_id, created_by) VALUES
    ('staff', $1, $3), ('staff2', $1, $4), ('carrie', $2, $5)`, [MKT, FIN, people.staff, people.staff2, CARRIE])
  await q(`INSERT INTO dept_pools(department_id, transaction_type) VALUES ($1, 'expense_out'), ($2, 'expense_out')`, [MKT, FIN])
  await q('INSERT INTO dept_payment_requests(department_id) VALUES ($1), ($2)', [MKT, FIN])
  await q('INSERT INTO invoice_submission_requests(department_id) VALUES ($1), ($2)', [MKT, FIN])
  await q('INSERT INTO service_contracts(department_id) VALUES ($1), ($2)', [MKT, FIN])
  await q(`INSERT INTO invoices(billing_mode, created_by) VALUES ('marketing_project', $1), ('finance_attribution', $2)`,
    [MARKETING, CARRIE])
  const jeM = await one("INSERT INTO journal_entries(segment) VALUES ('marketing') RETURNING id")
  const jeF = await one("INSERT INTO journal_entries(segment) VALUES ('finance') RETURNING id")
  await q('INSERT INTO journal_lines(entry_id) VALUES ($1), ($1), ($2)', [jeM, jeF])
  await q('INSERT INTO revenue_payroll_commission_adjustments DEFAULT VALUES')
  await q(`INSERT INTO approval_requests(request_type, reference_id, reference_table, submitted_by) VALUES
    ('dept_expense', $1, 'departments', $3), ('dept_expense', $2, 'departments', $4)`, [MKT, FIN, MARKETING, CARRIE])

  // What somebody reads: a count per table, and each read function's answer.
  const view = async () => {
    const out = {}
    for (const [who, user] of Object.entries(people)) {
      out[who] = {}
      await as(user)
      try {
        for (const t of TABLES) out[who][t] = await one(`SELECT count(*)::int FROM public.${t}`)
        for (const [name, sql] of Object.entries(CALL)) {
          await db.exec('SAVEPOINT p')
          try {
            out[who][name] = (await one(sql)) ?? 'none'
            await db.exec('RELEASE SAVEPOINT p')
          } catch (error) {
            await db.exec('ROLLBACK TO SAVEPOINT p')
            if (/permission denied for function/i.test(error.message)) throw error
            out[who][name] = 'refused'
          }
        }
      } finally {
        await asSystem()
      }
    }
    return out
  }

  await db.exec('BEGIN')
  const before = await view()
  check([before.staff.claims, before.marketing.claims, before.principal.claims], [0, 0, 3],
    'before: a Staff · Basic person reads not even the claim they raised; marketing@ reads only its own (none)')
  check([before.head.invoices, before.head.dept_pools], [1, 1], 'before: a Department head reads as the dept_manager KIND')

  // ── The migration ─────────────────────────────────────────────────────────
  await db.exec(pr3c)
  check(await one("SELECT count(*)::int FROM pg_proc WHERE proname = ANY ($1) AND prosrc LIKE '%has_any_action%'",
    [Object.keys(ARGS)]), 17, 'every read function asks for an action')
  await db.exec(pr3c)
  checks++ // a second run is a no-op
  check(await one(`SELECT count(*)::int FROM pg_policies WHERE policyname = ANY ($1) AND roles = '{authenticated}'
    AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%current_user_role%'`,
  [['claims_own_select', 'claims_submit', 'approvals_dept_manager_own_expense_select', 'approvals_submit',
    'approvals_submitter_update_own_pending', 'dept_pools_pf_select', 'dept_pools_dept_manager_insert',
    'dpr_dept_manager_select_own', 'isr_dept_manager_select_own', 'service_contracts_pf_select', 'service_contracts_insert',
    'invoices_dept_manager_select', 'invoices_dept_manager_insert', 'invoices_dept_manager_update',
    'invoices_dept_manager_delete', 'journal_entries_dept_manager_select', 'journal_lines_dept_manager_select',
    'revenue_commission_adjustments_read']]), 18, 'eighteen policies, signed-in only, none asking for the kind')

  const after = await view()
  await db.exec('COMMIT')

  // ── The five accounts read every row they read ────────────────────────────
  const moved = []
  for (const who of ['principal', 'finance', 'hr', 'marketing', 'carrie']) {
    for (const key of Object.keys(before[who])) {
      if (before[who][key] !== after[who][key]) moved.push(`${who} ${key} ${before[who][key]}→${after[who][key]}`)
    }
  }
  // marketing@'s claims: Claims · View is Dept on its keys, so it now reads its
  // department's — production has no claims yet, so nothing it sees changes.
  check(moved.sort(), [
    'carrie bridge_mirror_slices all→none',
    'carrie get_director_payout_summary ran→refused',
    'finance get_director_payout_summary ran→refused',
    'hr calculate_dept_np ran→refused',
    'hr get_dept_opex_rows ran→refused',
    'marketing claims 0→2',
  ].sort(), 'the shared accounts: rows unchanged; only reads no page of theirs makes move')

  // ── Own, Dept, All ────────────────────────────────────────────────────────
  check([after.staff.claims, after.staff2.claims], [1, 1], 'Staff · Basic reads the claim they raised — and only theirs')
  check(after.marketing.claims, 2, 'marketing@ (Claims · View at Dept) reads its department’s claims')
  check(after.head.claims, 2, 'a Department head reads their department’s claims')
  check([after.head.dept_pools, after.head.dept_payment_requests, after.head.invoice_submission_requests,
    after.head.service_contracts, after.head.invoices, after.head.journal_entries, after.head.journal_lines],
  [1, 1, 1, 1, 1, 1, 2], 'a Department head: their department’s pool, requests, contracts; their segment’s invoices and journals')
  check([after.staff.dept_pools, after.staff.invoices, after.staff.journal_entries], [0, 0, 0],
    'Staff · Basic reads no department money')
  check([after.head.calculate_dept_np, after.head.get_dept_opex_rows, after.head.dept_invoice_settlements,
    after.head.rnp_invoice_events, after.head.bridge_mirror_slices],
  ['ran', 'ran', 'marketing', 'marketing', 'dept'], 'a Department head’s read functions answer for their department')
  check([after.marketing.dept_invoice_settlements, after.finance.dept_invoice_settlements, after.finance.rnp_invoice_events],
    ['marketing', 'marketing', 'all'], 'Dept reach answers its own segment; All any segment (consolidated when none is named)')
  check([after.payroll.get_hr_cost_summary, after.payroll.get_payroll_funding_paid, after.payroll.revenue_pay_preview,
    after.payroll.calculate_dept_np], ['ran', 'ran', 'ran', 'refused'], 'HR · Payroll: payroll and Revenue reads, not a department’s NP')

  // ── A claim is raised as yourself ─────────────────────────────────────────
  check(await attempt(people.staff, "INSERT INTO claims(claimant_name, department_id, created_by) VALUES ('mine', $1, $2)",
    [MKT, people.staff]), 'ok', 'Staff · Basic raises a claim as themselves')
  check(await attempt(people.staff, "INSERT INTO claims(claimant_name, department_id, created_by) VALUES ('theirs', $1, $2)",
    [MKT, people.staff2]), 'refused', '…never in somebody else’s name')
  check(await attempt(people.head, "INSERT INTO invoices(billing_mode, created_by) VALUES ('marketing_project', $1)", [people.head]),
    'ok', 'a Department head drafts an invoice of their segment')
  check(await attempt(people.head, "INSERT INTO invoices(billing_mode, created_by) VALUES ('finance_attribution', $1)", [people.head]),
    'refused', '…not another segment’s')
  check(await attempt(MARKETING, "INSERT INTO dept_pools(department_id, transaction_type) VALUES ($1, 'expense_out')", [FIN]),
    'refused', 'an expense out of somebody else’s pool is refused')
  check(await attempt(MARKETING, `INSERT INTO approval_requests(request_type, reference_id, reference_table, submitted_by)
    VALUES ('dept_expense', $1, 'departments', $2)`, [MKT, MARKETING]), 'ok', 'marketing@ still raises its expense request')
  check(await attempt(people.staff, `INSERT INTO approval_requests(request_type, reference_id, reference_table, submitted_by)
    VALUES ('dept_expense', $1, 'departments', $2)`, [MKT, people.staff]), 'refused', 'Staff · Basic raises no approval request')

  // ── No sign-in reads none of it through these policies ────────────────────
  // As production: the publishable key may call the row-policy helpers, nothing else.
  await db.exec(`GRANT SELECT ON claims, invoices TO anon;
    GRANT EXECUTE ON FUNCTION has_scope(text[]), has_perm(text), current_user_role(), current_user_department_id(),
      current_user_segment() TO anon;`)
  await as(null, 'anon')
  check([await one('SELECT count(*)::int FROM claims'), await one('SELECT count(*)::int FROM invoices')], [0, 0],
    'the publishable key reads nothing — and is never asked to call has_action')
  await asSystem()

  console.log(`PASS: ${checks} reach checks (PR3c). PR1 world; the migrations verbatim; no live database.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}

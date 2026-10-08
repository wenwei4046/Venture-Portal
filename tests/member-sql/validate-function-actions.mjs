// Local PostgreSQL regression for 20261009030000 (PR3b of the People
// Management revamp, 2026-10-09): the database's own functions ask for the
// action too. The PR1 world and every permission migration since VERBATIM,
// then a stand-in for each of the 65 functions carrying production's exact
// check statement (the one the migration swaps), then the migration. The five
// accounts that sign in keep what they could do (the moves listed below), a
// template decides by its cells, and with no sign-in each function answers as
// before. No live I/O.
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
  await db.exec(await migrationText('20261009020000_writes_ask_for_the_action'))

  // ── The 65 functions, as stand-ins carrying production's exact check ──────
  await db.exec("CREATE TYPE gl_segment AS ENUM ('venture', 'marketing', 'hr', 'finance')")
  const pr3b = await migrationText('20261009030000_functions_ask_for_the_action')
  const swaps = [...pr3b.matchAll(/swap_check\('public\.([a-z_]+)\(([^)]*)\)',\n\s+\$q\$([\s\S]*?)\$q\$,\n\s+\$q\$([\s\S]*?)\$q\$\)/g)]
    .map(m => ({ name: m[1], types: m[2] ? m[2].split(',') : [], old: m[3], fresh: m[4] }))
  check(swaps.length, 70, 'the migration swaps 70 checks')
  for (const s of swaps) {
    // dept_request_pv_rejected stands in already, as PR2b left it.
    if (await maybe('SELECT 1 FROM pg_proc WHERE proname = $1', [s.name])) {
      await db.exec(`GRANT EXECUTE ON FUNCTION public.${s.name}(${s.types.join(',')}) TO authenticated, service_role`)
      continue
    }
    const args = s.types.map((t, i) => `a${i + 1} ${t}`).join(', ')
    // Production writes the check on several lines; the swap must find it
    // whitespace-blind, so the stand-ins spread it over lines too.
    const spread = s.old.replace(/ (THEN) /i, '\n        $1 ').replace(/ (USING) /i, '\n          $1 ')
    await db.exec(`CREATE FUNCTION public.${s.name}(${args}) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_role user_role; v_caller uuid; v_context text := 'sync';
BEGIN
    v_caller := auth.uid();
    v_role := current_user_role();
    ${spread}
    END IF;
    RETURN 'ran';
END $f$;
GRANT EXECUTE ON FUNCTION public.${s.name}(${s.types.join(',')}) TO authenticated, service_role;`)
  }
  const call = s => `SELECT public.${s.name}(${s.types.map(t => `NULL::${t}`).join(', ')})`

  // ── The people ────────────────────────────────────────────────────────────
  const T = Object.fromEntries((await q('SELECT id, key FROM permission_templates')).map(t => [t.key, t.id]))
  const titled = async (templateKey, n, department = 'Finance') => {
    const user = id(300 + n)
    const title = await one('INSERT INTO titles(name, department_id, template_id) VALUES ($1, $2, $3) RETURNING id',
      [`TEST ${templateKey}`, DEPT_IDS[department], T[templateKey]])
    await q("INSERT INTO users(id, email, name, role, department_id) VALUES ($1, $2, $3, 'staff', $4)",
      [user, `${n}@example.com`, `PERSON ${templateKey}`, DEPT_IDS[department]])
    await q('INSERT INTO hr_staff_costs(employee_name, department_id, title_id, user_id) VALUES ($1, $2, $3, $4)',
      [`PERSON ${templateKey}`, DEPT_IDS[department], title, user])
    return user
  }
  const people = {
    principal: PRINCIPAL, finance: FINANCE, hr: HR_SHARED, marketing: MARKETING, carrie: CARRIE,
    director: await titled('director', 1, 'Director'),
    checker: await titled('fin_checker', 2),
    maker: await titled('fin_maker', 3),
    payroll: await titled('hr', 4, 'HR'),
    staff: await titled('staff', 5, 'Marketing'),
  }

  // Who may run what: 'ran', or 'refused'.
  const matrix = async () => {
    const out = {}
    for (const s of swaps) {
      out[s.name] = {}
      for (const [who, user] of Object.entries({ ...people, system: null })) {
        await (user ? as(user) : as(null, 'service_role'))
        try {
          out[s.name][who] = (await one(call(s))) === 'ran' ? 'ran' : '?'
        } catch (error) {
          // The function's own refusal — never a missing GRANT, which would
          // read as one (it is 42501 too).
          if (/permission denied for function/i.test(error.message)) throw error
          if (error.code !== '42501'
            && !/insufficient_privilege|unauthorized|not permitted|may not|Only |Access denied|needs |not allowed|not part of your work/i.test(error.message)) throw error
          out[s.name][who] = 'refused'
        } finally {
          await asSystem()
        }
      }
    }
    return out
  }

  const before = await matrix()
  check(before.create_loan_with_approval.director, 'refused', 'before: a Director’s Treasury · Create is refused by their kind')
  check(before.create_loan_with_approval.checker, 'ran', 'before: a Checker books a loan by their kind')
  check(before.create_payroll_disbursement_vouchers.director, 'ran',
    'before: a Director who sees the roster raises payroll vouchers (any key of the HR domain did)')

  // ── The migration ─────────────────────────────────────────────────────────
  await db.exec(pr3b)
  check(await one("SELECT count(*)::int FROM pg_proc WHERE proname = ANY ($1) AND prosrc LIKE '%has_any_action%'",
    [swaps.map(s => s.name)]), 70, 'all 70 now ask for an action')
  await db.exec(pr3b)
  checks++ // a second run is a no-op

  const after = await matrix()

  // ── The five accounts keep what they could do — two exceptions, both ones
  // no page of theirs ever made ──────────────────────────────────────────────
  const moved = []
  for (const s of swaps) {
    for (const who of ['principal', 'finance', 'hr', 'marketing', 'carrie', 'system']) {
      if (before[s.name][who] !== after[s.name][who]) moved.push(`${who} ${s.name} ${before[s.name][who]}→${after[s.name][who]}`)
    }
  }
  check(moved.sort(), [
    'carrie create_manual_journal_voucher ran→refused',
    'carrie delete_manual_journal_voucher ran→refused',
    'carrie update_manual_journal_voucher ran→refused',
    'hr close_approvals_for_voided_voucher ran→refused',
  ], 'the shared accounts: only carrie’s held-back Reconciliation and HR closing a voided voucher’s approvals move')

  // ── A template decides by its cells ───────────────────────────────────────
  check([after.create_loan_with_approval.director, after.create_loan_with_approval.checker, after.create_loan_with_approval.maker],
    ['ran', 'refused', 'ran'], 'a loan: the Director and the Maker (Create), never the Checker')
  check([after.amend_loan.checker, after.amend_loan.director, after.amend_loan.maker], ['ran', 'ran', 'refused'],
    'amending a booked loan is Treasury · Approve')
  check([after.void_issued_invoice.maker, after.void_issued_invoice.checker], ['refused', 'refused'], 'voiding an invoice is Billing · Void')
  check([after.payroll_submit_batch.payroll, after.payroll_submit_batch.director, after.payroll_submit_batch.staff],
    ['ran', 'refused', 'refused'], 'payroll goes to Finance from HR Costing · Create only')
  check(after.create_payroll_disbursement_vouchers.director, 'refused', 'and a Director no longer raises payroll vouchers')
  check([after.director_payroll_complete.payroll, after.director_payroll_complete.director], ['ran', 'refused'],
    'Director Salary · Edit completes director salary — a Director’s Approve does not')
  check([after.submit_invoice_request.marketing, after.submit_invoice_request.staff], ['ran', 'refused'],
    'a department manager’s requests: My Billing · Create (Dept)')
  check([after.post_journal_entry_as_caller.staff, after.post_journal_entry_as_caller.payroll], ['refused', 'ran'],
    'a journal is posted by whoever’s work posts one')
  check([before.mark_journal_entry_reversed.checker, after.mark_journal_entry_reversed.checker], ['ran', 'ran'],
    'a Checker approving a loan’s cancellation still reverses its journal — the executor runs as the approver')
  check(after.mark_journal_entry_reversed.maker, 'refused', 'a Maker (no Void, no Approve) does not')
  check([after.dept_request_pv_rejected.maker, after.dept_request_pv_rejected.checker, after.dept_request_pv_rejected.finance],
    ['refused', 'ran', 'ran'], 'a rejected request’s voucher: Treasury · Void or a voucher’s approver — no longer the kind')
  check([before.commit_sales_import_batch.payroll, after.commit_sales_import_batch.payroll, after.commit_sales_import_batch.hr],
    ['ran', 'refused', 'ran'], 'a sales file is committed with Revenue · Create, the app’s own gate — HR · Payroll edits Revenue, it does not import')
  check([after.adjust_revenue_payroll_commission.payroll, after.adjust_revenue_payroll_commission.director,
    after.guard_revenue_commission_adjustment.payroll, after.guard_revenue_commission_adjustment.director],
  ['ran', 'refused', 'ran', 'refused'], 'a Revenue payroll row’s commission: HR Costing · Edit or Revenue · Edit')

  // ── No sign-in: each does what it did ─────────────────────────────────────
  check(swaps.filter(s => before[s.name].system !== after[s.name].system).map(s => s.name), [],
    'with no sign-in every function answers as before')

  console.log(`PASS: ${checks} function action checks (PR3b). PR1 world; the migrations verbatim; no live database.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}

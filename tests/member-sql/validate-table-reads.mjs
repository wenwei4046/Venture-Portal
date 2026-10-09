// Local PostgreSQL regression for 20261009080000 (PR3d of the People
// Management revamp, 2026-10-09): the database asks for the action on a READ.
//
// A small world with production's function catalogue, a persona table standing
// in for current_actions() / current_permissions() (has_any_action and
// has_scope answer from it, has_any_action with production's reach rule), a
// handful of production's tables with the domain policies production gives
// them (hr, treasury, admin; a department's own rows), and the three
// owner-rights views. The hole is shown first — a title with Revenue alone
// reads every director's payout, and anybody signed in reads the department
// payroll totals through an owner view — then the migration, VERBATIM, closes
// it while each page's reader keeps its rows, a writer still updates what it
// can see, and the views answer under the caller's own policies. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

async function as(user) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await db.exec('SET ROLE authenticated')
}
async function rows(user, sql) {
  await as(user)
  try {
    return (await q(sql)).length
  } finally {
    await db.exec('RESET ROLE')
  }
}
async function updates(user, sql) {
  await as(user)
  try {
    return (await q(sql)).length
  } finally {
    await db.exec('RESET ROLE')
  }
}

const PRINCIPAL = id(1)
const FINANCE = id(2)
const HR = id(3)
const MARKETING = id(4)
const REVENUE_ONLY = id(5) // a title holding Revenue alone (hr domain key `revenue`)
const NOBODY = id(6) // signed in, holds nothing
const PAYROLL_EDITOR = id(7) // HR Costing · Edit, no View of Director Salary

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

    -- Production's function catalogue (2026-10-09).
    CREATE TABLE public.permission_functions (key text PRIMARY KEY, actions text[] NOT NULL, scopes text[] NOT NULL);
    INSERT INTO public.permission_functions VALUES
      ('accounts', ARRAY['view','create','manage'], ARRAY['all']),
      ('approvals', ARRAY['view','approve'], ARRAY['all']),
      ('audit_log', ARRAY['view','export'], ARRAY['all']),
      ('billing', ARRAY['view','create','edit','void','export'], ARRAY['all']),
      ('categories', ARRAY['view','manage'], ARRAY['all']),
      ('claims', ARRAY['view','create','edit','approve','void'], ARRAY['own','dept','all']),
      ('dashboard', ARRAY['view'], ARRAY['all']),
      ('dept_pool', ARRAY['view','export'], ARRAY['dept','all']),
      ('dept_reports', ARRAY['view','export'], ARRAY['dept','all']),
      ('director_pool', ARRAY['view','edit'], ARRAY['all']),
      ('director_salary', ARRAY['view','edit','approve'], ARRAY['all']),
      ('hr_costing', ARRAY['view','create','edit','approve','export'], ARRAY['own','dept','all']),
      ('member', ARRAY['view','manage'], ARRAY['all']),
      ('my_billing', ARRAY['view','create'], ARRAY['dept','all']),
      ('opex', ARRAY['view','export'], ARRAY['dept','all']),
      ('product_list', ARRAY['view','edit'], ARRAY['all']),
      ('reconciliation', ARRAY['view','create','edit','approve'], ARRAY['all']),
      ('reports', ARRAY['view','export'], ARRAY['all']),
      ('revenue', ARRAY['view','create','edit','approve','export','manage'], ARRAY['own','dept','all']),
      ('revenue_app', ARRAY['view','create'], ARRAY['own']),
      ('settings', ARRAY['view','manage'], ARRAY['all']),
      ('team', ARRAY['view','create','edit','manage'], ARRAY['own','dept','all']),
      ('treasury', ARRAY['view','create','edit','approve','void','export'], ARRAY['all']),
      ('venture_pool', ARRAY['view','create','edit','export'], ARRAY['all']),
      ('view_switch', ARRAY['view'], ARRAY['all']);

    -- Who holds what: the domain keys (has_scope) and the actions with their reach.
    CREATE TABLE persona (uid uuid PRIMARY KEY, scopes text[] NOT NULL, actions jsonb NOT NULL, department_id uuid);
    CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT coalesce((SELECT scopes && p_scopes FROM persona WHERE uid = auth.uid()), false) $$;
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
      SELECT EXISTS (
        SELECT 1 FROM persona p, unnest(coalesce(p_wants, '{}'::text[])) w
         WHERE p.uid = auth.uid()
           AND array_position(ARRAY['own', 'dept', 'all'], p.actions ->> split_part(w, ':', 1))
               >= array_position(ARRAY['own', 'dept', 'all'], coalesce(nullif(split_part(w, ':', 2), ''), 'all')))
    $$;
    CREATE FUNCTION public.current_user_department_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT department_id FROM persona WHERE uid = auth.uid() $$;
    GRANT EXECUTE ON FUNCTION public.has_scope(text[]), public.has_any_action(text[]), public.current_user_department_id() TO authenticated;
    -- The audit registry is not this test's subject.
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_keys_needed text[], p_keys text[] DEFAULT NULL, p_labels text[] DEFAULT NULL)
      RETURNS void LANGUAGE sql AS $$ SELECT $$;

    -- Production's tables, with the read policies production gives them.
    CREATE TABLE public.director_payouts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric);
    CREATE TABLE public.hr_monthly_payroll (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid, gross numeric);
    CREATE TABLE public.loans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal numeric);
    CREATE TABLE public.dept_pools (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid, amount numeric);
    CREATE TABLE public.catalogue_models (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
    CREATE TABLE public.fund_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric);
    CREATE TABLE public.fund_source_repayments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fund_source_id uuid, amount numeric);
    CREATE TABLE public.departments (id uuid PRIMARY KEY, name text);
    DO $$
    DECLARE t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY['director_payouts', 'hr_monthly_payroll', 'loans', 'dept_pools', 'catalogue_models',
                               'fund_sources', 'fund_source_repayments', 'departments'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      END LOOP;
    END $$;
    CREATE POLICY dp_select ON public.director_payouts FOR SELECT USING ((SELECT has_scope(ARRAY['hr'])));
    CREATE POLICY hmp_select ON public.hr_monthly_payroll FOR SELECT USING ((SELECT has_scope(ARRAY['hr', 'admin'])));
    CREATE POLICY hmp_update ON public.hr_monthly_payroll FOR UPDATE USING ((SELECT has_scope(ARRAY['hr']))) WITH CHECK (true);
    CREATE POLICY loans_select ON public.loans FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY pools_select ON public.dept_pools FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY pools_dept ON public.dept_pools FOR SELECT TO authenticated
      USING ((SELECT has_any_action(ARRAY['dept_pool.view:dept'])) AND department_id = (SELECT current_user_department_id()));
    CREATE POLICY models_select ON public.catalogue_models FOR SELECT USING ((SELECT has_scope(ARRAY['admin', 'hr'])));
    CREATE POLICY fs_select ON public.fund_sources FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY fsr_select ON public.fund_source_repayments FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));
    CREATE POLICY dept_select ON public.departments FOR SELECT USING (auth.uid() IS NOT NULL);

    -- The three owner-rights views, as production had them.
    CREATE VIEW public.hr_monthly_payroll_summary AS
      SELECT h.department_id, sum(h.gross) AS dept_gross FROM public.hr_monthly_payroll h GROUP BY h.department_id;
    CREATE VIEW public.dept_pool_balances AS
      SELECT department_id, sum(amount) AS balance FROM public.dept_pools GROUP BY department_id;
    CREATE VIEW public.fund_source_outstanding AS
      SELECT f.id AS fund_source_id, f.amount - coalesce(sum(r.amount), 0) AS outstanding
        FROM public.fund_sources f LEFT JOIN public.fund_source_repayments r ON r.fund_source_id = f.id GROUP BY f.id, f.amount;
    GRANT SELECT ON public.hr_monthly_payroll_summary, public.dept_pool_balances, public.fund_source_outstanding TO authenticated;
  `)

  const MKT = id(100)
  const FIN = id(101)
  await q('INSERT INTO public.departments VALUES ($1, $2), ($3, $4)', [MKT, 'Marketing', FIN, 'Finance'])
  await q('INSERT INTO public.director_payouts (amount) VALUES (30000), (25000)')
  await q('INSERT INTO public.hr_monthly_payroll (department_id, gross) VALUES ($1, 5200), ($1, 4800), ($2, 6100)', [MKT, FIN])
  await q('INSERT INTO public.loans (principal) VALUES (40000)')
  await q('INSERT INTO public.dept_pools (department_id, amount) VALUES ($1, 1000), ($2, 2000)', [MKT, FIN])
  await q("INSERT INTO public.catalogue_models (name) VALUES ('ZANOTTI 5030')")
  await q('INSERT INTO public.fund_sources (amount) VALUES (100000)')

  // The personas: production's untemplated logins, as their keys give them.
  const people = [
    [PRINCIPAL, ['admin', 'hr', 'treasury', 'shared'], {
      'treasury.view': 'all', 'director_salary.view': 'all', 'hr_costing.view': 'all', 'hr_costing.edit': 'all',
      'product_list.view': 'all', 'dept_pool.view': 'all', 'revenue.view': 'all', 'approvals.view': 'all' }, null],
    [FINANCE, ['treasury', 'shared'], { 'treasury.view': 'all', 'treasury.create': 'all', 'dept_pool.view': 'all' }, FIN],
    [HR, ['hr', 'shared'], { 'hr_costing.view': 'all', 'hr_costing.edit': 'all', 'director_salary.view': 'all', 'revenue.view': 'all' }, null],
    [MARKETING, ['shared'], { 'dept_pool.view': 'dept' }, MKT],
    [REVENUE_ONLY, ['hr'], { 'revenue.view': 'all', 'revenue.edit': 'all' }, null],
    [NOBODY, [], {}, null],
    [PAYROLL_EDITOR, ['hr'], { 'hr_costing.edit': 'all' }, null],
  ]
  for (const [uid, scopes, actions, dept] of people) {
    await q('INSERT INTO persona VALUES ($1, $2, $3, $4)', [uid, scopes, JSON.stringify(actions), dept])
  }

  // ── Before: the domain decides ────────────────────────────────────────────
  check(await rows(REVENUE_ONLY, 'SELECT 1 FROM public.director_payouts'), 2, 'before: Revenue alone reads every director payout')
  check(await rows(REVENUE_ONLY, 'SELECT 1 FROM public.catalogue_models'), 1, 'before: Revenue alone reads the Product List')
  check(await rows(NOBODY, 'SELECT 1 FROM public.hr_monthly_payroll_summary'), 2, 'before: anybody signed in reads the payroll totals')
  check(await rows(MARKETING, 'SELECT 1 FROM public.dept_pool_balances'), 2, 'before: a department reads every department pool balance')
  check(await rows(NOBODY, 'SELECT 1 FROM public.fund_source_outstanding'), 1, 'before: anybody signed in reads the fund sources')

  const sql = await migrationText('20261009080000_reads_ask_for_the_action')
  await db.exec(sql)

  // ── After: the action decides ─────────────────────────────────────────────
  check(await rows(REVENUE_ONLY, 'SELECT 1 FROM public.director_payouts'), 0, 'Revenue alone: no director payouts')
  check(await rows(REVENUE_ONLY, 'SELECT 1 FROM public.catalogue_models'), 0, 'Revenue alone: no Product List')
  check(await rows(REVENUE_ONLY, 'SELECT 1 FROM public.hr_monthly_payroll'), 2 + 1, 'Revenue: the payroll Comm Cal’s pay board reads')
  check(await rows(PRINCIPAL, 'SELECT 1 FROM public.director_payouts'), 2, 'the Principal: every director payout')
  check(await rows(HR, 'SELECT 1 FROM public.director_payouts'), 2, 'HR (Director Salary · View): every director payout')
  check(await rows(FINANCE, 'SELECT 1 FROM public.director_payouts'), 0, 'Finance: none, as before (the domain never opened it)')
  check(await rows(FINANCE, 'SELECT 1 FROM public.loans'), 1, 'Finance: the loans its pages read')
  check(await rows(HR, 'SELECT 1 FROM public.loans'), 0, 'HR: no loans, as before')
  check(await rows(PRINCIPAL, 'SELECT 1 FROM public.catalogue_models'), 1, 'the Principal: the Product List')
  check(await rows(HR, 'SELECT 1 FROM public.catalogue_models'), 0, 'HR: the Product List is not theirs')
  check(await rows(MARKETING, 'SELECT 1 FROM public.dept_pools'), 1, 'a department: its own pool, as before')
  check(await rows(FINANCE, 'SELECT 1 FROM public.dept_pools'), 2, 'Finance: every pool')
  check(await rows(NOBODY, 'SELECT 1 FROM public.loans'), 0, 'nobody: nothing')

  // A writer reads the rows it changes (UPDATE … WHERE).
  check(await updates(PAYROLL_EDITOR, "UPDATE public.hr_monthly_payroll SET gross = gross WHERE gross > 0 RETURNING id"), 3,
    'HR Costing · Edit alone still updates the payroll rows it is shown')

  // The views read under the caller's own policies.
  check(await rows(NOBODY, 'SELECT 1 FROM public.hr_monthly_payroll_summary'), 0, 'payroll totals: not to anybody signed in')
  check(await rows(HR, 'SELECT 1 FROM public.hr_monthly_payroll_summary'), 2, 'payroll totals: to whoever reads the payroll')
  check(await rows(MARKETING, 'SELECT 1 FROM public.dept_pool_balances'), 1, 'pool balances: a department, its own')
  check(await rows(FINANCE, 'SELECT 1 FROM public.dept_pool_balances'), 2, 'pool balances: Finance, every one')
  check(await rows(NOBODY, 'SELECT 1 FROM public.fund_source_outstanding'), 0, 'fund sources: not to anybody signed in')
  check(await rows(FINANCE, 'SELECT 1 FROM public.fund_source_outstanding'), 1, 'fund sources: the treasury')
  check((await q("SELECT count(*)::int AS n FROM pg_class WHERE relkind = 'v' AND relnamespace = 'public'::regnamespace AND NOT coalesce(reloptions @> ARRAY['security_invoker=true'], false)"))[0].n,
    0, 'every view reads under its caller')

  // may_read: no row is no; the publishable key may not ask.
  await as(PRINCIPAL)
  check((await q("SELECT public.may_read('no_such_table') AS ok"))[0].ok, false, 'an unregistered table: no')
  await db.exec('RESET ROLE')
  await db.exec('SET ROLE anon')
  await assert.rejects(q("SELECT public.may_read('loans')"), /permission denied/, 'anon may not call may_read')
  checks++
  await db.exec('RESET ROLE')

  // ── Running it twice changes nothing ──────────────────────────────────────
  const shape = async () => (await q(`
    SELECT count(*)::int AS n, string_agg(tablename || ':' || policyname, ',' ORDER BY tablename, policyname) AS p
      FROM pg_policies WHERE schemaname = 'public' AND policyname = 'needs_action_select'`))[0]
  const once = await shape()
  check(once.n, 7, 'one restrictive read policy per registered table that exists here')
  await db.exec(sql)
  check(await shape(), once, 'idempotent')

  await db.close()
  console.log(`validate-table-reads: ${checks} checks passed`)
} catch (error) {
  console.error(error)
  process.exit(1)
}

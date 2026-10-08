// Local PostgreSQL regression for the app-wide history (2026-10-08). The
// migration runs VERBATIM over a synthetic copy of what it touches: PR1's
// trigger as production runs it (its md5 is the guard's), the old settings
// log with rows and the triggers that wrote it, and one table of each kind
// the register sorts — recorded, people only, not recorded, wide, with pay /
// NRIC / bank columns, a payroll voucher's family. What is under test: who
// is recorded and how, that the old log folds in, and that reading follows
// the reader's own permissions — the tables their keys open, nothing a
// payroll voucher needs that they lack, no salary / NRIC / bank value their
// title may not see. No live I/O.
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

// A signed-in person, the server (service role), or the database itself.
async function as(user) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)", [user])
  await db.exec('SET ROLE authenticated')
}
async function asServer() {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false)")
  await db.exec('SET ROLE service_role')
}
async function asDatabase() {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)")
}

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
const changesAs = async (user, args = {}) => {
  await as(user)
  const rows = await q(
    `SELECT * FROM audit_changes(p_tables => $1, p_actor => $2, p_system => $3, p_from => $4, p_to => $5, p_row => $6,
       p_before => $7, p_limit => $8)`,
    [args.tables ?? null, args.actor ?? null, args.system ?? false, args.from ?? null, args.to ?? null, args.row ?? null,
      args.before ?? null, args.limit ?? 100],
  )
  await asDatabase()
  return rows
}

// ── The people ─────────────────────────────────────────────────────────────
const PRINCIPAL = id(1) // legacy principal: every key, every field
const FINANCE = id(2) // legacy finance: treasury, billing — bank only
const HR = id(3) // legacy hr: team, hr_costing, salary
const DIRECTOR = id(4) // a titled person whose template sees salary, not NRIC / bank
const MARKETING = id(5) // a department manager: no history yet (PR3)
const MEMBER = id(6) // a Revenue member uploading an invoice
const TEMPLATE_DIRECTOR = id(40)
const TITLE_DIRECTOR = id(41)
const STAFF = id(50)
const STAFF_DIRECTOR = id(51)

const KEYS = {
  [PRINCIPAL]: ['audit_log', 'treasury', 'billing', 'settings', 'team', 'hr_costing', 'salary_individual', 'payroll_payouts', 'revenue'],
  [FINANCE]: ['treasury', 'billing', 'reports'],
  [HR]: ['team', 'hr_costing', 'salary_individual', 'payroll_payouts', 'revenue'],
  [DIRECTOR]: ['team', 'treasury', 'salary_individual'],
  [MARKETING]: ['dept_pool', 'claims'],
  [MEMBER]: ['member_portal'],
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    -- As production defines them.
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

    -- What the reader holds: a stand-in for current_permissions(), outside public.
    CREATE SCHEMA test;
    CREATE TABLE test.perms(user_id uuid PRIMARY KEY, keys text[] NOT NULL);
    CREATE FUNCTION public.current_permissions() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT coalesce((SELECT keys FROM test.perms WHERE user_id = auth.uid()), '{}'::text[]) $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT p_key = ANY (public.current_permissions()) $$;

    CREATE TABLE users(
      id uuid PRIMARY KEY, email text NOT NULL, name text NOT NULL, role text NOT NULL,
      is_active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz);
    CREATE TABLE permission_template_sensitive(template_id uuid NOT NULL, field text NOT NULL, PRIMARY KEY (template_id, field));
    CREATE TABLE titles(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, template_id uuid,
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE hr_staff_costs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_code text, employee_name text NOT NULL,
      title_id uuid REFERENCES titles(id), user_id uuid REFERENCES users(id), basic_salary numeric(15,2),
      total_ctc numeric(15,2), nric text, bank_name text, bank_account_no text, contact_number text,
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE hr_monthly_payroll(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL, period_month date NOT NULL,
      basic_salary numeric(15,2), gross numeric(15,2), net numeric(15,2), status text NOT NULL DEFAULT 'draft',
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE treasury_config(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), config_key varchar(50) NOT NULL, config_value numeric(15,6),
      description text, updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE companies(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, short_code varchar(10),
      director_heads integer, ar_account_code text, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE fund_sources(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric(15,2), status text NOT NULL, notes text,
      version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE bank_accounts(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bank_name text NOT NULL, account_number text,
      current_balance numeric(15,2) NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE payment_vouchers(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_no text, reference_type text, payee_name text,
      amount numeric(15,2), status text NOT NULL DEFAULT 'draft', notes text, version integer NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE payment_voucher_sources(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL, pool text, amount numeric(15,2));
    CREATE TABLE approval_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_type text NOT NULL, reference_id uuid, description text,
      status text NOT NULL DEFAULT 'pending');
    CREATE TABLE dept_pools(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid, transaction_type text, amount numeric(15,2),
      period_month date, description text);
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text NOT NULL, customer_name text, period_month date,
      raw jsonb);
    CREATE TABLE sales_order_lines(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, product_code text, cost_amount numeric(15,2),
      raw jsonb, cost_detail jsonb);
    CREATE TABLE member_request_attachments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, uploaded_by uuid NOT NULL, object_path text);
    CREATE TABLE comm_salesperson_closes(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL, period_month date NOT NULL,
      total_commission numeric(15,2), statement jsonb, closed_by uuid);
    CREATE TABLE access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action text);

    -- Phase 2's settings log, as production has it, with the triggers that wrote it.
    CREATE TABLE config_audit_log(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_name text NOT NULL, row_key text NOT NULL,
      changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now(), old_values jsonb NOT NULL, new_values jsonb NOT NULL);
  `)
  await db.exec(await migrationText('20260101000025_config_audit_log_fix').then(sql =>
    sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION log_config_change'), sql.indexOf('-- Add INSERT triggers'))))
  await db.exec(`
    CREATE TRIGGER companies_audit AFTER UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION log_config_change();
    CREATE TRIGGER treasury_config_audit AFTER UPDATE ON treasury_config FOR EACH ROW EXECUTE FUNCTION log_config_change();
    CREATE TRIGGER fund_sources_status_audit AFTER UPDATE ON fund_sources FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION log_config_change();
  `)

  // PR1's history and trigger, as production runs them — and on a table, as PR1 attached it.
  const pr1 = await migrationText('20261008120000_permission_templates')
  const table = pr1.indexOf('CREATE TABLE IF NOT EXISTS public.audit_events')
  await db.exec(pr1.slice(table, pr1.indexOf(');', table) + 2))
  const policy = pr1.indexOf('CREATE POLICY audit_events_read')
  await db.exec(pr1.slice(policy, pr1.indexOf('GRANT SELECT ON public.audit_events TO authenticated;', policy) + 53))
  await productionFunction('20261008120000_permission_templates', 'audit_row_change')
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'audit_row_change'"), 'fdd62bea055c87c3db030b3970d0e326',
    'PR1\'s audit_row_change is the body the guard expects')
  await db.exec(`CREATE TRIGGER audit_titles AFTER INSERT OR UPDATE OR DELETE ON titles
    FOR EACH ROW EXECUTE FUNCTION audit_row_change('', 'updated_at');`)

  // ── The world ──────────────────────────────────────────────────────────────
  await q(`INSERT INTO users(id, email, name, role) VALUES
    ($1, 'principal@venture.my', 'Principal', 'principal'), ($2, 'finance@venture.my', 'Finance', 'finance'),
    ($3, 'hr@venture.my', 'HR', 'hr'), ($4, 'dir@example.com', 'DIRECTOR TAN', 'staff'),
    ($5, 'marketing@venture.my', 'Marketing', 'dept_manager'), ($6, 'member@example.com', 'MEMBER LIM', 'revenue_member')`,
  [PRINCIPAL, FINANCE, HR, DIRECTOR, MARKETING, MEMBER])
  for (const [user, keys] of Object.entries(KEYS)) await q('INSERT INTO test.perms VALUES ($1, $2)', [user, keys])
  await q("INSERT INTO permission_template_sensitive VALUES ($1, 'salary')", [TEMPLATE_DIRECTOR])
  await q("INSERT INTO titles(id, name, template_id) VALUES ($1, 'DIRECTOR', $2)", [TITLE_DIRECTOR, TEMPLATE_DIRECTOR])
  await q(`INSERT INTO hr_staff_costs(id, employee_code, employee_name, title_id, user_id, basic_salary, total_ctc, nric, bank_name, bank_account_no)
    VALUES ($1, 'HV010', 'TAN AH KOW', NULL, NULL, 3000, 3600, '900101-14-5555', 'Maybank', '5140-0000-1111'),
           ($2, 'HV002', 'DIRECTOR TAN', $3, $4, 20000, 24000, '700101-10-1234', 'CIMB', '8000-1')`,
  [STAFF, STAFF_DIRECTOR, TITLE_DIRECTOR, DIRECTOR])

  const TC = await one("INSERT INTO treasury_config(config_key, config_value) VALUES ('op_margin', 0.02) RETURNING id")
  const CO1 = await one("INSERT INTO companies(name, short_code) VALUES ('Akemi Sdn Bhd', 'AK') RETURNING id")
  const CO2 = await one("INSERT INTO companies(name, short_code) VALUES ('Dunlop Sdn Bhd', 'DL') RETURNING id")
  const FS = await one("INSERT INTO fund_sources(amount, status) VALUES (50000, 'active') RETURNING id")
  // The old log's rows: one save over two companies, a treasury save that changed nothing, a fund
  // marked repaid, and a split saved by insert.
  await q(`INSERT INTO config_audit_log(table_name, row_key, changed_by, changed_at, old_values, new_values) VALUES
    ('companies', $1, NULL, '2026-07-14 10:58:48+00', jsonb_build_object('id', $1::text, 'director_heads', 1), jsonb_build_object('id', $1::text, 'director_heads', 2)),
    ('companies', $2, NULL, '2026-07-14 10:58:48+00', jsonb_build_object('id', $2::text, 'director_heads', 1), jsonb_build_object('id', $2::text, 'director_heads', 3)),
    ('treasury_config', 'op_margin', $3, '2026-05-22 11:11:49+00',
      jsonb_build_object('id', $4::text, 'config_value', 0.02, 'updated_at', '2026-05-22T11:11:49'),
      jsonb_build_object('id', $4::text, 'config_value', 0.02, 'updated_at', '2026-05-22T11:12:00')),
    ('fund_sources', $5, $3, '2026-09-15 07:40:34+00', jsonb_build_object('id', $5::text, 'status', 'active'),
      jsonb_build_object('id', $5::text, 'status', 'repaid')),
    ('rent_splits', 'HV', $3, '2026-06-01 09:00:00+00', '{}'::jsonb, '{"company_id": null, "split_pct": 0.5}'::jsonb)`,
  [CO1, CO2, PRINCIPAL, TC, FS])

  await db.exec(`
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION current_permissions(), has_perm(text) TO authenticated, service_role;
    GRANT USAGE ON SCHEMA test TO authenticated, service_role;
  `)

  // ── The migration, verbatim ───────────────────────────────────────────────
  await db.exec(await migrationText('20261008190000_app_wide_audit'))

  // ── The register ──────────────────────────────────────────────────────────
  const register = Object.fromEntries((await q('SELECT table_name, mode, area FROM audit_tables')).map(r => [r.table_name, r]))
  check(register.sales_orders.mode, 'people', 'what the ERP feeds: a person\'s change only')
  check(register.erp_products.mode, 'none', 'the ERP\'s catalogue mirror is not recorded')
  check(register.hr_monthly_payroll.area, 'Payroll', 'payroll is filed under Payroll')
  check(await one("SELECT count(*)::int FROM audit_tables WHERE mode = 'none' AND reason IS NULL"), 0, 'every table left out says why')
  check(await one("SELECT count(*)::int FROM audit_tables WHERE mode <> 'none' AND cardinality(read_keys) = 0"), 0,
    'every recorded table says who reads it')
  const triggers = Object.fromEntries((await q(`SELECT c.relname, g.tgname, g.tgnargs, pg_get_triggerdef(g.oid) AS def
    FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid WHERE g.tgname LIKE 'audit\\_%' AND NOT g.tgisinternal`))
    .map(r => [r.relname, r]))
  for (const table of ['users', 'titles', 'hr_staff_costs', 'treasury_config', 'companies', 'fund_sources', 'payment_vouchers', 'sales_orders']) {
    check(triggers[table]?.tgname, `audit_${table}`, `${table} is recorded`)
  }
  check(triggers.access_log, undefined, 'the access log is not')
  check(triggers.config_audit_log, undefined, 'nor the old settings log')
  check(triggers.titles.tgnargs, 0, 'PR1\'s trigger now reads the register, not arguments')
  check(/WHEN \(\(auth\.uid\(\) IS NOT NULL\)\)/.test(triggers.sales_orders.def), true, 'a people table fires for a signed-in person only')
  check(/WHEN/.test(triggers.treasury_config.def), false, 'an all table fires for everybody')
  check(await one(`SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE 'audit\\_%' AND tgenabled = 'D'`), 0, 'every audit trigger is on')
  check(await one("SELECT qual FROM pg_policies WHERE policyname = 'audit_events_read'"), 'false', 'PR1\'s read policy is closed')
  check(await one("SELECT audit_attach('crm_contacts')"), 'absent', 'a registered table this database lacks waits for it')
  await db.exec('CREATE TRIGGER audit_access_log AFTER INSERT ON access_log FOR EACH ROW EXECUTE FUNCTION audit_row_change()')
  check(await one("SELECT audit_attach('access_log')"), 'none', 'a table that is not recorded…')
  check(await one("SELECT tgenabled FROM pg_trigger WHERE tgname = 'audit_access_log'"), 'D', '…has a stray trigger switched off')
  await reject("SELECT audit_attach('nope')", [], /has no line in audit_tables/, 'an unregistered table cannot be attached')

  // ── The old log, folded in ────────────────────────────────────────────────
  check(await one(`SELECT count(*) FILTER (WHERE g.tgenabled = 'D')::int || '/' || count(*)::int
    FROM pg_trigger g JOIN pg_proc p ON p.oid = g.tgfoid WHERE p.proname = 'log_config_change'`), '3/3',
  'its triggers are switched off, all of them — nothing is dropped')
  check(/SUPERSEDED/.test(await one("SELECT obj_description('log_config_change()'::regprocedure, 'pg_proc')")), true,
    'its function says it is superseded')
  await q("UPDATE companies SET director_heads = 9 WHERE id = $1", [CO2])
  check(await one('SELECT count(*)::int FROM config_audit_log'), 5, 'a change now writes nothing there')
  const copied = await q('SELECT table_name, row_key, op, old_row, new_row, changed, txid, actor_id, actor_source FROM audit_events WHERE txid < 0 ORDER BY occurred_at, row_key')
  check(copied.length, 5, 'every row of it copied')
  check(copied.map(r => Number(r.txid)).sort((a, b) => a - b), [-4, -3, -3, -2, -1], 'one group per original save')
  const companies = copied.filter(r => r.table_name === 'companies')
  check(companies.every(r => r.txid === companies[0].txid), true, 'the two companies saved together stay one save')
  check(sorted(companies.map(r => r.row_key)), sorted([CO1, CO2]), 'keyed by the row id, as the trigger keys them now')
  check(companies[0].changed, ['director_heads'], 'what the save changed')
  const noop = copied.find(r => r.table_name === 'treasury_config')
  check([noop.row_key, noop.op, noop.changed], [TC, 'UPDATE', []], 'a save of nothing is kept as one')
  const insert = copied.find(r => r.table_name === 'rent_splits')
  check([insert.op, insert.old_row, insert.row_key], ['INSERT', null, 'HV'], 'a split saved by insert is an INSERT')
  check(copied.find(r => r.table_name === 'fund_sources').actor_id, PRINCIPAL, 'who saved it, kept')
  check(copied.every(r => r.actor_source === null), true, 'how it was saved: not recorded then')

  // ── Who, and how ──────────────────────────────────────────────────────────
  const latest = table => q('SELECT * FROM audit_events WHERE table_name = $1 ORDER BY id DESC LIMIT 1', [table]).then(r => r[0])
  const count = table => one('SELECT count(*)::int FROM audit_events WHERE table_name = $1 AND txid > 0', [table])

  await as(PRINCIPAL)
  await q('UPDATE treasury_config SET config_value = 0.025 WHERE id = $1', [TC])
  await asDatabase()
  let e = await latest('treasury_config')
  check([e.actor_id, e.actor_source, e.op, e.changed, e.row_key], [PRINCIPAL, 'portal', 'UPDATE', ['config_value'], TC],
    'a person\'s change: who, from the portal, what changed')
  check([Number(e.old_row.config_value), Number(e.new_row.config_value), e.new_row.config_key], [0.02, 0.025, 'op_margin'],
    'before and after, the whole row')
  await as(PRINCIPAL)
  await q('UPDATE treasury_config SET config_value = config_value WHERE id = $1', [TC])
  await q("UPDATE treasury_config SET updated_at = now() + interval '1 hour', updated_by = $2 WHERE id = $1", [TC, PRINCIPAL])
  await asDatabase()
  check(await count('treasury_config'), 1, 'saving the same figure, or only touching updated_at / updated_by, is no change')

  await as(HR)
  await q("UPDATE hr_staff_costs SET contact_number = '012-3456789' WHERE id = $1", [STAFF])
  await asDatabase()
  e = await latest('hr_staff_costs')
  check(Object.keys(e.new_row).sort(), ['contact_number', 'employee_code', 'employee_name', 'id'],
    'a wide table keeps what changed, its key and its name — not the rest of the row')
  check(e.old_row.contact_number, null, 'before')
  await as(HR)
  await q("UPDATE hr_staff_costs SET basic_salary = 3200, nric = '900101-14-5556', bank_account_no = '5140-0000-2222' WHERE id = $1", [STAFF])
  await asDatabase()

  // The ERP's tables: the feed's writes are not kept, a person's are.
  await asServer()
  const ORDER = await one("INSERT INTO sales_orders(order_no, customer_name, period_month, raw) VALUES ('HC-SO-2609-400', 'MR WONG', '2026-09-01', '{\"doc\": 1}') RETURNING id")
  await q("UPDATE sales_orders SET customer_name = 'MR WONG K' WHERE id = $1", [ORDER])
  await q("INSERT INTO sales_order_lines(order_id, product_code, cost_amount, raw, cost_detail) VALUES ($1, 'AK-ULT-K', 1500, '{\"line\": 1}', '{\"grid\": 1}')", [ORDER])
  await asDatabase()
  check(await count('sales_orders') + await count('sales_order_lines'), 0, 'the ERP feed\'s own writes: not recorded')
  await as(PRINCIPAL)
  await q("UPDATE sales_orders SET period_month = '2026-08-01' WHERE id = $1", [ORDER])
  await q("UPDATE sales_order_lines SET cost_amount = 1400, cost_detail = '{\"grid\": 2}' WHERE order_id = $1", [ORDER])
  await asDatabase()
  e = await latest('sales_orders')
  check([e.actor_id, e.changed, Object.keys(e.new_row).sort()], [PRINCIPAL, ['period_month'], ['id', 'order_no', 'period_month']],
    'a person moving a bill\'s month: recorded, the bill named, its raw document never copied')
  e = await latest('sales_order_lines')
  check([sorted(e.changed), Object.keys(e.new_row).sort()],
    [['cost_amount', 'cost_detail'], ['cost_amount', 'id', 'order_id', 'product_code']],
    'a Recost: the cost recorded, its working (cost_detail) named as changed but not copied')

  // A migration or a SQL session: the database, nobody named.
  await asDatabase()
  await q("UPDATE companies SET ar_account_code = '1101' WHERE id = $1", [CO1])
  e = await latest('companies')
  check([e.actor_id, e.actor_source], [null, 'database'], 'a change with no request is the database\'s')

  // The server writing for a person names them from the row.
  await asServer()
  await q("INSERT INTO member_request_attachments(request_id, uploaded_by, object_path) VALUES ($1, $2, 'm/1.pdf')", [id(900), MEMBER])
  await asDatabase()
  e = await latest('member_request_attachments')
  check([e.actor_id, e.actor_source], [MEMBER, 'server'], 'a member\'s invoice, uploaded by the server: the member, via the server')

  // A close's snapshot is the close's; the history keeps its figures.
  await as(HR)
  await q("INSERT INTO comm_salesperson_closes(staff_id, period_month, total_commission, statement) VALUES ($1, '2026-09-01', 4321.5, '{\"big\": true}')", [STAFF])
  await asDatabase()
  e = await latest('comm_salesperson_closes')
  check([e.new_row.statement, Number(e.new_row.total_commission)], [undefined, 4321.5], 'the statement snapshot is not copied; the figure is')

  // The bank balance moves with every payment: not a change of the account.
  const BANK = await one("INSERT INTO bank_accounts(bank_name, account_number) VALUES ('HLB', '123') RETURNING id")
  await q('UPDATE bank_accounts SET current_balance = 999 WHERE id = $1', [BANK])
  check(await count('bank_accounts'), 1, 'opening the account is recorded; its balance moving is not')

  // PR1's table under the new trigger.
  await as(PRINCIPAL)
  await q("UPDATE titles SET name = 'EXECUTIVE DIRECTOR' WHERE id = $1", [TITLE_DIRECTOR])
  await asDatabase()
  e = await latest('titles')
  check([e.changed, e.new_row.template_id, e.actor_source], [['name'], TEMPLATE_DIRECTOR, 'portal'],
    'titles: still the whole row (Permissions › History reads it)')

  // ── A payroll voucher's history needs Payroll payouts ─────────────────────
  await as(PRINCIPAL)
  const PAYROLL_PV = await one(`INSERT INTO payment_vouchers(voucher_no, reference_type, payee_name, amount)
    VALUES ('HV-PV-202609-0366', 'payroll_disbursement', 'TAN AH KOW', 3100) RETURNING id`)
  const RENT_PV = await one(`INSERT INTO payment_vouchers(voucher_no, reference_type, payee_name, amount)
    VALUES ('HV-PV-202609-0400', 'manual', 'LANDLORD', 8000) RETURNING id`)
  await q("INSERT INTO payment_voucher_sources(voucher_id, pool, amount) VALUES ($1, 'dept_pool_hr', 3100), ($2, 'venture_pool', 8000)", [PAYROLL_PV, RENT_PV])
  await q("INSERT INTO approval_requests(request_type, reference_id, description) VALUES ('payment_voucher', $1, 'Pay TAN'), ('payment_voucher', $2, 'Pay rent')", [PAYROLL_PV, RENT_PV])
  await q(`INSERT INTO dept_pools(transaction_type, amount, description) VALUES
    ('expense_out', 3100, 'PV HV-PV-202609-0366: Payroll disbursement Sep 2026 — TAN AH KOW'),
    ('expense_out', 8000, 'PV HV-PV-202609-0400: Rent Sep 2026'),
    ('expense_out', 2900, 'Payroll disbursement Aug 2026 — LIM'),
    ('np_in', 500, 'Marketing income')`)
  await asDatabase()
  const needs = await q(`SELECT table_name, coalesce(new_row ->> 'voucher_no', new_row ->> 'pool', new_row ->> 'description') AS what, needs
    FROM audit_events WHERE table_name IN ('payment_vouchers', 'payment_voucher_sources', 'approval_requests', 'dept_pools') ORDER BY id`)
  const needOf = what => needs.find(r => r.what === what)?.needs ?? null
  const PAYROLL_NEEDS = ['payroll_payouts', 'hr_costing']
  check(needOf('HV-PV-202609-0366'), PAYROLL_NEEDS, 'a salary voucher needs Payroll payouts')
  check(needOf('HV-PV-202609-0400'), null, 'a rent voucher needs nothing more')
  check(needOf('dept_pool_hr'), PAYROLL_NEEDS, 'its source row too')
  check(needOf('venture_pool'), null, 'the rent voucher\'s source does not')
  check(needOf('Pay TAN'), PAYROLL_NEEDS, 'and the approval request for it')
  check(needOf('Pay rent'), null, 'not the rent\'s')
  check(needOf('PV HV-PV-202609-0366: Payroll disbursement Sep 2026 — TAN AH KOW'), PAYROLL_NEEDS, 'the pool row its payment wrote')
  check(needOf('PV HV-PV-202609-0400: Rent Sep 2026'), null, 'not the rent\'s pool row')
  check(needOf('Payroll disbursement Aug 2026 — LIM'), PAYROLL_NEEDS, 'a salary line whose voucher is gone, by its words')
  check(needOf('Marketing income'), null, 'income needs nothing')

  // ── Reading: nobody reads the table itself ────────────────────────────────
  await as(PRINCIPAL)
  await reject('SELECT count(*) FROM audit_events', [], /permission denied/, 'not even the Principal selects it directly')
  await asDatabase()

  // ── What each reader sees ─────────────────────────────────────────────────
  const tablesOf = rows => sorted([...new Set(rows.map(r => r.table_name))])
  const everything = await changesAs(PRINCIPAL)
  check(tablesOf(everything).includes('sales_orders') && tablesOf(everything).includes('hr_staff_costs'), true,
    'audit_log reads every area')
  const salaryChange = everything.find(r => r.table_name === 'hr_staff_costs' && r.changed?.includes('nric'))
  check([Number(salaryChange.new_row.basic_salary), salaryChange.new_row.nric, salaryChange.masked],
    [3200, '900101-14-5556', []], 'the Principal sees salary, NRIC and bank as they were saved')

  const finance = await changesAs(FINANCE)
  check(tablesOf(finance), ['approval_requests', 'bank_accounts', 'dept_pools', 'fund_sources', 'payment_voucher_sources', 'payment_vouchers'],
    'Finance: Treasury\'s tables only (the old log\'s Fund IN save among them) — no HR, no settings, no revenue')
  check(finance.some(r => r.new_row?.voucher_no === 'HV-PV-202609-0366' || r.new_row?.pool === 'dept_pool_hr'), false,
    'and no salary voucher, nor its source')
  check(sorted(finance.filter(r => r.table_name === 'dept_pools').map(r => r.new_row.description)),
    ['Marketing income', 'PV HV-PV-202609-0400: Rent Sep 2026'], 'the pool rows a salary payment wrote stay out')
  check(finance.filter(r => r.table_name === 'approval_requests').map(r => r.new_row.description), ['Pay rent'],
    'the approval of the rent voucher, not of the salary one')

  const hr = await changesAs(HR)
  check(tablesOf(hr).includes('hr_staff_costs') && tablesOf(hr).includes('sales_orders'), true, 'HR: People and Revenue')
  check(tablesOf(hr).some(t => ['treasury_config', 'payment_vouchers', 'companies'].includes(t)), false,
    'and nothing of Treasury or the settings')

  const director = await changesAs(DIRECTOR)
  const seen = director.find(r => r.table_name === 'hr_staff_costs' && r.changed?.includes('nric'))
  check(Number(seen.new_row.basic_salary), 3200, 'a director whose template sees salary sees the salary')
  check([seen.new_row.nric, seen.old_row.bank_account_no, seen.masked], [undefined, undefined, ['bank_account_no', 'nric']],
    'but not NRIC or bank details — named as hidden, the values left out')
  check(director.some(r => r.new_row?.voucher_no === 'HV-PV-202609-0366'), false, 'Treasury without Payroll payouts: no salary voucher')
  check(director.some(r => r.new_row?.voucher_no === 'HV-PV-202609-0400'), true, 'but the rent voucher')

  check(await changesAs(MARKETING), [], 'a department manager reads nothing yet (own department: PR3)')
  check(await changesAs(MEMBER), [], 'nor a Revenue member')

  // ── Filters and pages ─────────────────────────────────────────────────────
  check(tablesOf(await changesAs(PRINCIPAL, { tables: ['treasury_config'] })), ['treasury_config'], 'by table')
  check((await changesAs(PRINCIPAL, { actor: HR })).every(r => r.actor_id === HR), true, 'by person')
  check((await changesAs(PRINCIPAL, { system: true })).every(r => r.actor_id === null), true, 'the system\'s alone')
  const rowHistory = await changesAs(PRINCIPAL, { tables: ['hr_staff_costs'], row: STAFF })
  check(rowHistory.length, 2, 'one row\'s history')
  check((await changesAs(PRINCIPAL, { from: '2026-07-01', to: '2026-08-01' })).map(r => r.table_name), ['companies', 'companies'],
    'by date: the copied July save')
  const page1 = await changesAs(PRINCIPAL, { limit: 5 })
  const page2 = await changesAs(PRINCIPAL, { limit: 5, before: page1.at(-1).id })
  check(page1.length === 5 && page2.length > 0, true, 'a page, and the next')
  check(page2.some(r => page1.some(p => p.id === r.id)), false, 'no change on two pages')
  const order = [...page1, ...page2]
  check(order.every((r, i) => i === 0 || r.occurred_at <= order[i - 1].occurred_at), true, 'newest first — the copied old log by its own dates')
  check(everything.at(-1).occurred_at.toISOString().slice(0, 10), '2026-05-22', 'the oldest change is the old log\'s first')

  // ── The summary ───────────────────────────────────────────────────────────
  await as(FINANCE)
  const overview = await one('SELECT audit_overview()')
  await asDatabase()
  check(overview.changes_week, finance.filter(r => Number(r.txid) > 0).length, 'Finance\'s count is what Finance may read (this week)')
  check(overview.actors.map(a => a.name), ['Principal'], 'and who changed it')
  await as(PRINCIPAL)
  const all = await one('SELECT audit_overview()')
  await asDatabase()
  check(sorted(all.actors.map(a => a.name)), ['HR', 'MEMBER LIM', 'Principal'], 'everybody who changed something, for the Principal')
  check(all.saves_today >= 1 && all.people_week === 3, true, 'saves today, people this week')

  // ── The register as each reader sees it ───────────────────────────────────
  await as(FINANCE)
  const financeRegister = (await q('SELECT table_name FROM audit_tables')).map(r => r.table_name)
  await asDatabase()
  check(financeRegister.includes('payment_vouchers') && !financeRegister.includes('hr_staff_costs'), true,
    'Finance reads the register lines of its own areas')
  check(financeRegister.includes('erp_products'), false, 'not the tables left out (audit_log reads those)')

  // ── What the caller may see of salary, NRIC and bank ──────────────────────
  const fieldsOf = async user => { await as(user); const f = await one('SELECT current_sensitive_fields()'); await asDatabase(); return f }
  check(await fieldsOf(PRINCIPAL), ['bank', 'nric', 'salary'], 'the Principal: all three')
  check(await fieldsOf(FINANCE), ['bank'], 'Finance: bank details (it pays salaries out)')
  check(await fieldsOf(HR), ['bank', 'nric', 'salary'], 'HR: all three')
  check(await fieldsOf(DIRECTOR), ['salary'], 'a titled director: their template\'s salary, nothing else')
  check(await fieldsOf(MARKETING), [], 'a department manager: none')
  await q('UPDATE test.perms SET keys = array_remove(keys, $2) WHERE user_id = $1', [HR, 'salary_individual'])
  check(await fieldsOf(HR), ['bank', 'nric'], 'salary follows the Individual salaries key')

  console.log(`PASS: ${checks} app-wide audit checks. Synthetic tables; the migration verbatim; no live database.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}

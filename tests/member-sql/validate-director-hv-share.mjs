// Local PostgreSQL regression for HOUZS Venture's own share of the directors'
// CTC (Director Salary's Pool Breakdown, 2026-10-13): 20261013170000 as it
// first shipped, then 20261013233000, which makes the share PAYROLL — the user,
// the same day: "应该是直接转出去，就是 payout 出去 payroll 才对 … 不是转入 direct
// pool，而是直接变成 payroll。当然，这个 payroll 是由正常的 HR payroll 那边去进行，
// 它不会去到 finance 那边", and, shown October's figures (Director pool RM 85,750 ·
// Marketing RM 7,500 · Revenue RM 4,500 · Venture Office RM 2,250, no invoice,
// no transfer, each department's part on its own P&L): "对，就是这样".
//
// Both migrations run VERBATIM over stand-ins for what they read and write —
// the roster, the departments, the invoices and receipts 170000 still names,
// the dept pools, the journal, the statutory lookups, the permission checks,
// the payroll's batches, their lines and funding requests; the three functions
// 233000 swaps a statement of are production's bodies, loaded from the
// migrations that hold them as production runs them (md5 checked). What is
// under test: a transferred share stops the migration and an open one waits
// again; HR's save (by percentage with the rounding on the biggest line, by
// amount, every refusal); the batch that carries the month's directors
// carrying the share (not a staff-only batch, not a top-up, never more than
// the directors' payroll), HR's lock while it does, Finance's funding
// breakdown (each department HR picked, the Director pool that much less),
// the accrual figures a segment (each part's CTC exact, every JV balanced,
// nothing lost), the pools drained — Venture Office's by its name —, Finance
// sending the batch back, the directors gone without it, the locked months,
// and who may call what. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const lf = text => text.replace(/\r\n/g, '\n')
const load = async f => db.exec(lf(await readFile(new URL(f, migrations), 'utf8')))

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

// A function as a migration file holds it — CREATE … through its closing tag.
async function productionFunction(migration, name) {
  const sql = lf(await readFile(new URL(`${migration}.sql`, migrations), 'utf8'))
  const match = new RegExp(`create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`, 'i').exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

const HR_USER = id(1)
const FIN_USER = id(2)
const DIR = id(21)
const MKT = id(22)
const REV = id(23)
const VO = id(24)
const IT = id(25)

/** Sign in as somebody holding these actions (the stand-in has_any_action and has_perm read them). */
async function as(user, actions) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('test.actions', '${actions.join(',')}', false)`)
}
const HR_EDIT = ['director_salary.view', 'director_salary.edit', 'hr_costing.view']
const HR_VIEW = ['director_salary.view']
const FINANCE = ['treasury.view', 'treasury.create', 'payroll_payouts.view']

const SAVE = `SELECT public.director_hv_share_save($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) AS r`
const save = (period, [b, k, a], mode, lines, er = null) =>
  one(SAVE, [period, b, k, a, er !== null, er?.[0] ?? 0, er?.[1] ?? 0, er?.[2] ?? 0, mode, JSON.stringify(lines)])
const pools = async () =>
  Object.fromEntries((await q(`SELECT d.name, coalesce(b.balance, 0)::float AS balance FROM departments d
    LEFT JOIN dept_pool_balances b ON b.department_id = d.id ORDER BY d.name`)).map(r => [r.name, r.balance]))
const shareOf = period => q(`SELECT s.status, b.batch_no FROM director_hv_shares s LEFT JOIN payroll_batches b ON b.id = s.batch_id
  WHERE s.period_month = $1`, [period]).then(r => r[0] ?? null)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL, is_internal boolean NOT NULL DEFAULT false, segment_key text);
    -- The permission check: any wanted 'fn.action[:scope]' among the actions handed in.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;
    -- The tab guard (mig 20261011220000): here it only says it was asked.
    CREATE TABLE guard_calls(n bigserial PRIMARY KEY, pages text[], wants text[]);
    CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO guard_calls (pages, wants) VALUES (p_pages, p_wants);
    END $$;
    CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END $$;
    CREATE TABLE period_locks(period_month date PRIMARY KEY, is_locked boolean NOT NULL DEFAULT true);
    CREATE FUNCTION public.is_period_locked(p_date date) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
            SELECT 1 FROM period_locks
            WHERE period_month = DATE_TRUNC('month', p_date)::DATE
              AND is_locked = TRUE
        );
    $$;
    -- The statutory tables, as round figures: EPF 12%, SOCSO and EIS to their caps.
    CREATE FUNCTION public.lookup_epf(p_wages numeric) RETURNS TABLE(employer numeric, employee numeric) LANGUAGE sql STABLE AS
      $$ SELECT round(p_wages * 0.12, 2), round(p_wages * 0.11, 2) $$;
    CREATE FUNCTION public.lookup_socso(p_wages numeric) RETURNS TABLE(employer numeric, employee numeric) LANGUAGE sql STABLE AS
      $$ SELECT least(round(p_wages * 0.0175, 2), 104.15), least(round(p_wages * 0.005, 2), 29.75) $$;
    CREATE FUNCTION public.lookup_eis(p_wages numeric) RETURNS TABLE(employer numeric, employee numeric) LANGUAGE sql STABLE AS
      $$ SELECT least(round(p_wages * 0.002, 2), 11.90), least(round(p_wages * 0.002, 2), 11.90) $$;
    -- director_ctc's total (mig 20260731100000), production's body.
    CREATE FUNCTION public.compute_director_ctc_total() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
        v_heads INTEGER := GREATEST(COALESCE(NEW.heads, 1), 1);
        v_bk_per_head DECIMAL := (NEW.basic + NEW.kpi) / v_heads;
        v_epf_er DECIMAL;
        v_socso_er DECIMAL;
        v_eis_er DECIMAL;
    BEGIN
        IF NEW.er_manual THEN
            NEW.employer_epf   := COALESCE(NEW.employer_epf, 0);
            NEW.employer_socso := COALESCE(NEW.employer_socso, 0);
            NEW.employer_eis   := COALESCE(NEW.employer_eis, 0);
        ELSE
            SELECT employer INTO v_epf_er FROM lookup_epf(v_bk_per_head);
            SELECT employer INTO v_socso_er FROM lookup_socso(v_bk_per_head);
            SELECT employer INTO v_eis_er FROM lookup_eis(v_bk_per_head);
            NEW.employer_epf := COALESCE(v_epf_er, 0) * v_heads;
            NEW.employer_socso := COALESCE(v_socso_er, 0) * v_heads;
            NEW.employer_eis := COALESCE(v_eis_er, 0) * v_heads;
        END IF;
        NEW.total_ctc := NEW.basic + NEW.kpi + NEW.allowance
                       + NEW.employer_epf + NEW.employer_socso + NEW.employer_eis;
        RETURN NEW;
    END $$;

    CREATE TYPE gl_segment AS ENUM ('treasury', 'marketing', 'hr', 'finance', 'director_office', 'corporate',
      'unallocated', 'director', 'revenue_department', 'it');
    CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'paid', 'paid_via_netting', 'voided');
    CREATE TYPE billing_mode AS ENUM ('marketing_project', 'non_billable', 'director_office_attribution', 'director_attribution',
      'hr_attribution', 'finance_attribution', 'venture_attribution', 'payroll_consolidated', 'revenue_department_attribution', 'it_attribution');
    CREATE TYPE billable_to_kind AS ENUM ('subsidiary', 'director', 'dept_pool', 'freetext');
    CREATE TABLE invoices(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_no varchar UNIQUE, company_id uuid, period_month date NOT NULL,
      billing_mode billing_mode NOT NULL, category_code varchar, base_amount numeric(15,2), total_amount numeric(15,2) NOT NULL,
      status invoice_status NOT NULL DEFAULT 'draft', invoice_date date, due_date date, description text, created_by uuid NOT NULL,
      billable_to_type billable_to_kind NOT NULL, billable_to_department_id uuid, billable_to_freetext_name text, settlement_voucher_id uuid,
      CONSTRAINT total_amount_positive CHECK (total_amount > 0),
      CONSTRAINT inv_billable_to_exactly_one CHECK (billable_to_type <> 'dept_pool'
        OR (billable_to_department_id IS NOT NULL AND company_id IS NULL AND billable_to_freetext_name IS NULL)));
    CREATE TABLE invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES invoices(id),
      line_no int NOT NULL, description text, amount numeric(15,2) NOT NULL CHECK (amount > 0), category_code varchar, segment gl_segment,
      UNIQUE (invoice_id, line_no));
    CREATE TABLE credit_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid, amount numeric, status text);

    CREATE TYPE payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid', 'voided');
    CREATE TYPE payment_voucher_type AS ENUM ('loan_repayment', 'billing_payment', 'claim_payout', 'expense', 'internal_transfer',
      'salary_payout', 'other', 'receive_payment', 'payroll_bank_transfer', 'loan_disbursement');
    CREATE TABLE payment_vouchers(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_no varchar UNIQUE, voucher_type payment_voucher_type NOT NULL,
      status payment_voucher_status NOT NULL DEFAULT 'draft', amount numeric NOT NULL, payee_name text NOT NULL, bank_account_id uuid,
      reference_type text, reference_id uuid, description text NOT NULL, payment_method text NOT NULL DEFAULT 'bank_transfer',
      payment_date date, approved_by uuid, approved_at timestamptz, executed_by uuid, executed_at timestamptz, created_by uuid NOT NULL,
      direction text NOT NULL DEFAULT 'debit', target_pool text, source_pool text, invoice_id uuid REFERENCES invoices(id),
      CONSTRAINT amount_positive CHECK (amount > 0),
      CONSTRAINT approved_has_metadata CHECK (status NOT IN ('approved', 'paid') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
      CONSTRAINT paid_has_execution CHECK (status <> 'paid' OR (executed_by IS NOT NULL AND executed_at IS NOT NULL AND payment_date IS NOT NULL)),
      CONSTRAINT voucher_requires_bank CHECK (status NOT IN ('paid', 'pending_approval') OR coalesce(payment_method, '') = 'netting'
        OR bank_account_id IS NOT NULL));
    CREATE TABLE payment_voucher_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL REFERENCES payment_vouchers(id),
      pool text NOT NULL, amount numeric NOT NULL CHECK (amount > 0), account_code varchar NOT NULL,
      role text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'mirror')));
    -- A receipt marks its invoice paid once receipts cover it (trg_pv_mark_invoice_paid_on_insert), production's body.
    CREATE FUNCTION public.mark_invoice_paid_on_voucher_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF NEW.status = 'paid' AND NEW.invoice_id IS NOT NULL THEN
            UPDATE invoices i
            SET status = 'paid'
            WHERE i.id = NEW.invoice_id
              AND i.status IN ('draft', 'issued')
              AND (
                SELECT COALESCE(SUM(pv.amount), 0)
                FROM payment_vouchers pv
                WHERE pv.invoice_id = NEW.invoice_id
                  AND pv.direction = 'credit'
                  AND pv.status <> 'voided'
              ) >= i.total_amount
                 - (
                   SELECT COALESCE(SUM(cn.amount), 0)
                   FROM credit_notes cn
                   WHERE cn.invoice_id = NEW.invoice_id
                     AND cn.status = 'approved'
                 )
                 - 0.005;
        END IF;
        RETURN NEW;
    END $$;
    CREATE TRIGGER trg_pv_mark_invoice_paid_on_insert AFTER INSERT ON payment_vouchers
      FOR EACH ROW WHEN (NEW.status = 'paid') EXECUTE FUNCTION mark_invoice_paid_on_voucher_insert();
    -- The primary rows make the voucher's amount (pvs_sum_matches_trigger), production's body.
    CREATE FUNCTION public.pvs_enforce_sum_matches_voucher() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
        v_voucher_id UUID; v_voucher_amount DECIMAL; v_voucher_status TEXT; v_sum DECIMAL;
    BEGIN
        v_voucher_id := COALESCE(NEW.voucher_id, OLD.voucher_id);
        SELECT amount, status::TEXT INTO v_voucher_amount, v_voucher_status FROM payment_vouchers WHERE id = v_voucher_id;
        IF v_voucher_status NOT IN ('approved', 'paid') THEN RETURN NULL; END IF;
        SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM payment_voucher_sources WHERE voucher_id = v_voucher_id AND role = 'primary';
        IF v_sum <> v_voucher_amount THEN
            RAISE EXCEPTION 'payment_voucher_sources primary-row sum (%) does not match voucher.amount (%) for voucher %', v_sum, v_voucher_amount, v_voucher_id;
        END IF;
        RETURN NULL;
    END $$;
    CREATE TRIGGER pvs_sum_matches_trigger AFTER INSERT OR DELETE OR UPDATE ON payment_voucher_sources
      FOR EACH ROW EXECUTE FUNCTION pvs_enforce_sum_matches_voucher();

    CREATE TYPE dept_pool_txn_type AS ENUM ('np_in', 'expense_out', 'inter_billing_out', 'void_in', 'void_out', 'jv_in', 'jv_out');
    CREATE TABLE dept_pools(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid NOT NULL REFERENCES departments(id),
      transaction_type dept_pool_txn_type NOT NULL, amount numeric NOT NULL CHECK (amount > 0), period_month date, description text,
      approval_id uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT expense_has_approval CHECK (transaction_type <> 'expense_out' OR approval_id IS NOT NULL));
    CREATE VIEW dept_pool_balances AS
      SELECT department_id,
             COALESCE(SUM(CASE transaction_type::text
               WHEN 'np_in' THEN amount WHEN 'expense_out' THEN -amount WHEN 'inter_billing_out' THEN -amount
               WHEN 'void_in' THEN amount WHEN 'void_out' THEN -amount WHEN 'jv_in' THEN amount WHEN 'jv_out' THEN -amount
               ELSE 0::numeric END), 0::numeric) AS balance
        FROM dept_pools GROUP BY department_id;
    -- A receipt's Void takes its pool rows back (mig 20260611010000), production's dept_pools part.
    CREATE FUNCTION public.reverse_voucher_pool_rows(p_voucher_no text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_user  uuid;
        v_count integer := 0;
        r       RECORD;
    BEGIN
        IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN
            RAISE EXCEPTION 'reverse_voucher_pool_rows: needs Treasury · Void' USING ERRCODE = '42501';
        END IF;
        v_user := auth.uid();
        IF EXISTS (SELECT 1 FROM dept_pools WHERE description LIKE 'VOID ' || p_voucher_no || ':%') THEN
            RAISE EXCEPTION 'reverse_voucher_pool_rows: % already has VOID reversal rows', p_voucher_no;
        END IF;
        FOR r IN
            SELECT department_id, transaction_type, amount, description
              FROM dept_pools
             WHERE description LIKE 'PV ' || p_voucher_no || ':%'
               AND transaction_type::text IN ('np_in', 'expense_out', 'inter_billing_out')
        LOOP
            INSERT INTO dept_pools (department_id, transaction_type, amount, description, created_by)
            VALUES (r.department_id,
                    CASE WHEN r.transaction_type::text = 'np_in' THEN 'void_out'::dept_pool_txn_type ELSE 'void_in'::dept_pool_txn_type END,
                    r.amount, 'VOID ' || p_voucher_no || ': reverse ' || r.transaction_type::text, v_user);
            v_count := v_count + 1;
        END LOOP;
        RETURN v_count;
    END $$;

    CREATE TABLE journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_no text, transaction_date date, period_month date,
      description text, reference_type text, reference_id uuid, total_amount numeric, segment gl_segment, created_by uuid,
      is_reversed boolean NOT NULL DEFAULT false, reversed_by_id uuid);
    CREATE TABLE journal_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entry_id uuid NOT NULL REFERENCES journal_entries(id),
      account_code varchar NOT NULL, debit numeric, credit numeric, description text);
    -- The journal (production's post_journal_entry, its checks and numbering).
    CREATE FUNCTION public.post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid,
      p_created_by uuid, p_lines jsonb, p_segment gl_segment) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
    DECLARE
        v_period_month DATE; v_period_key TEXT; v_total_debit DECIMAL(15, 2) := 0; v_total_credit DECIMAL(15, 2) := 0;
        v_line JSONB; v_line_debit DECIMAL(15, 2); v_line_credit DECIMAL(15, 2); v_seq INT; v_entry_no TEXT; v_entry_id UUID;
    BEGIN
        IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
            RAISE EXCEPTION 'post_journal_entry: at least 2 lines';
        END IF;
        v_period_month := date_trunc('month', p_transaction_date)::DATE;
        v_period_key := to_char(v_period_month, 'YYYYMM');
        FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
            v_line_debit := COALESCE((v_line->>'debit')::DECIMAL(15,2), 0);
            v_line_credit := COALESCE((v_line->>'credit')::DECIMAL(15,2), 0);
            IF (v_line_debit > 0 AND v_line_credit > 0) OR (v_line_debit = 0 AND v_line_credit = 0) THEN
                RAISE EXCEPTION 'post_journal_entry: one of debit or credit per line';
            END IF;
            v_total_debit := v_total_debit + v_line_debit;
            v_total_credit := v_total_credit + v_line_credit;
        END LOOP;
        IF v_total_debit <> v_total_credit THEN
            RAISE EXCEPTION 'post_journal_entry: unbalanced entry — total debit % <> total credit %', v_total_debit, v_total_credit;
        END IF;
        SELECT COALESCE(MAX(NULLIF(substring(entry_no FROM 'JE-[0-9]{6}-([0-9]+)$'), '')::INT), 0) + 1
          INTO v_seq FROM journal_entries WHERE period_month = v_period_month;
        v_entry_no := 'JE-' || v_period_key || '-' || lpad(v_seq::TEXT, 4, '0');
        INSERT INTO journal_entries (entry_no, transaction_date, period_month, description, reference_type, reference_id,
          total_amount, segment, created_by)
        VALUES (v_entry_no, p_transaction_date, v_period_month, p_description, NULLIF(p_reference_type, ''), p_reference_id,
          v_total_debit, p_segment, p_created_by)
        RETURNING id INTO v_entry_id;
        INSERT INTO journal_lines (entry_id, account_code, debit, credit, description)
        SELECT v_entry_id, trim(ln->>'account_code'), NULLIF((ln->>'debit')::DECIMAL(15,2), 0), NULLIF((ln->>'credit')::DECIMAL(15,2), 0),
               NULLIF(ln->>'description', '')
          FROM jsonb_array_elements(p_lines) ln;
        RETURN v_entry_id;
    END $$;
    -- An internal recharge's receivable (ar_account_code_for: a department → 3073 AR - Internal).
    CREATE FUNCTION public.ar_account_for_invoice(p_invoice_id uuid) RETURNS text LANGUAGE sql STABLE AS $$
      SELECT CASE WHEN i.billable_to_department_id IS NOT NULL THEN '3073' ELSE '3030' END FROM invoices i WHERE i.id = p_invoice_id
    $$;
    CREATE TABLE access_log(id bigserial PRIMARY KEY, user_id uuid, resource_type text, resource_id text, action text, metadata jsonb);
  `)
  await q(`INSERT INTO users VALUES ($1, 'HR Manager', 'hr@x'), ($2, 'Finance Manager', 'finance@x')`, [HR_USER, FIN_USER])
  await q(`INSERT INTO departments (id, name, is_internal, segment_key) VALUES
    ($1, 'Director', false, 'director'), ($2, 'Marketing', false, 'marketing'), ($3, 'Revenue Department', false, 'revenue_department'),
    ($4, 'Venture Office', true, NULL), ($5, 'IT', false, 'it')`, [DIR, MKT, REV, VO, IT])

  await load('20261013170000_director_hv_share.sql')

  // What 20261013233000 reads besides: the payroll's batches, their lines and funding requests.
  await db.exec(`
    -- Production's module check: any action on that module among those handed in.
    CREATE FUNCTION public.has_perm(p_module text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(string_to_array(current_setting('test.actions', true), ',')) a
                      WHERE split_part(a, '.', 1) = p_module)
    $$;
    CREATE TYPE hv_fund_txn_type AS ENUM ('fund_out', 'expense_out', 'loan_repayment_in', 'profit_in');
    CREATE TABLE payroll_runs(id uuid PRIMARY KEY, period_month date NOT NULL);
    CREATE TABLE payroll_batches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, period_month date NOT NULL,
      batch_no integer NOT NULL, status text NOT NULL DEFAULT 'submitted', legacy boolean NOT NULL DEFAULT false,
      submitted_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE payroll_batch_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES payroll_batches(id),
      employee_name text NOT NULL, department_id uuid, department_name text NOT NULL, bucket text NOT NULL, segment_key text NOT NULL,
      is_topup boolean NOT NULL DEFAULT false, gross numeric NOT NULL DEFAULT 0, net numeric NOT NULL DEFAULT 0,
      epf_er numeric NOT NULL DEFAULT 0, epf_ee numeric NOT NULL DEFAULT 0, socso_er numeric NOT NULL DEFAULT 0,
      socso_ee numeric NOT NULL DEFAULT 0, eis_er numeric NOT NULL DEFAULT 0, eis_ee numeric NOT NULL DEFAULT 0,
      pcb numeric NOT NULL DEFAULT 0, withholding_tax numeric NOT NULL DEFAULT 0, skbbk numeric NOT NULL DEFAULT 0,
      non_statutory_allowance numeric NOT NULL DEFAULT 0,
      ctc numeric GENERATED ALWAYS AS (gross + epf_er + socso_er + eis_er) STORED);
    CREATE TABLE payroll_payment_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payroll_run_id uuid REFERENCES payroll_runs(id),
      requested_by uuid NOT NULL, amount numeric NOT NULL, target_pool text NOT NULL DEFAULT 'dept_pool_hr',
      status text NOT NULL DEFAULT 'submitted', period_month date, batch_id uuid REFERENCES payroll_batches(id));
    CREATE TABLE director_monthly_payroll(period_month date NOT NULL, director_id uuid NOT NULL, status text NOT NULL DEFAULT 'draft');
  `)
  // Production's bodies of the three functions 233000 swaps a statement of.
  await productionFunction('20261006040000_drifted_functions_as_live', 'get_payroll_breakdown_by_pool')
  await productionFunction('20261006040000_drifted_functions_as_live', 'apply_pool_adjustment')
  await productionFunction('20260927061000_unified_payroll', 'payroll_batch_accrual_sums')
  check(Object.fromEntries((await q(`SELECT proname, md5(prosrc) AS m FROM pg_proc
      WHERE proname IN ('get_payroll_breakdown_by_pool', 'apply_pool_adjustment', 'payroll_batch_accrual_sums')`)).map(r => [r.proname, r.m])), {
    get_payroll_breakdown_by_pool: '2aa983c9b754c3757ebaf895c65d3abc',
    apply_pool_adjustment: 'd56823837d79e886393ce7b30056d66f',
    payroll_batch_accrual_sums: '3e911acea1d3d123f28044312c42b2cc',
  }, 'production’s bodies, as 233000 was written against them (read off pg_proc on 2026-10-13)')

  // ── Before 20261013233000: the share went to Finance ──────────────────────
  // Basic 10,000 + KPI 2,000 + Allowance 1,500; ER on 12,000 at one head:
  // EPF 1,440.00 + SOCSO 104.15 + EIS 11.90 → 15,056.05.
  await as(HR_USER, HR_EDIT)
  const PCT_LINES = [{ department_id: MKT, pct: 50 }, { department_id: REV, pct: 30 }, { department_id: VO, pct: 15 }, { department_id: DIR, pct: 5 }]
  check((await save('2026-09-01', [10000, 2000, 1500], 'percent', PCT_LINES)).status, 'with_finance', 'under 170000 a saved share waited for Finance')
  // One Finance had transferred stops the migration — undo it first.
  await q(`UPDATE director_hv_shares SET status = 'transferred', transferred_at = now(), transfer_date = '2026-09-30'`)
  await assert.rejects(() => load('20261013233000_director_hv_share_in_payroll.sql'),
    /A HOUZS Venture share was transferred by Finance — undo it before this migration/, 'a transferred share stops it')
  checks++
  check(await one(`SELECT to_regprocedure('public.director_hv_share_transfer(uuid, date)') IS NOT NULL`), true, 'and nothing of it took')
  await q(`UPDATE director_hv_shares SET status = 'with_finance', transferred_at = NULL, transfer_date = NULL`)

  await load('20261013233000_director_hv_share_in_payroll.sql')

  // ── The shape ─────────────────────────────────────────────────────────────
  for (const fn of ['director_hv_share_transfer(uuid, date)', 'director_hv_share_undo(uuid)', 'director_hv_share_queue()']) {
    check(await one(`SELECT to_regprocedure($1) IS NULL`, [`public.${fn}`]), true, `${fn}: gone — nothing goes through Finance`)
  }
  check(await q(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'director_hv_shares'
      AND column_name IN ('batch_id', 'transferred_by', 'transferred_at', 'transfer_date')`).then(r => r.map(x => x.c)), ['batch_id'],
    'a share holds the batch that carries it, nothing of a transfer')
  check(await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'director_hv_share_lines'
      AND column_name IN ('invoice_id', 'voucher_id')`), [], 'its lines hold no documents')
  check(await shareOf('2026-09-01'), { status: 'open', batch_no: null }, 'the share HR had sent waits for the payroll instead')
  for (const fn of ['director_hv_share_of(date)', 'director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb)']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `${fn}: not the publishable key's`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `${fn}: a signed-in session's`)
  }
  for (const fn of ['director_hv_share_json(uuid, boolean)', 'director_hv_share_departments()', 'payroll_batch_pool_parts(uuid)',
    'payroll_batch_segment_sums(uuid)', 'director_hv_share_follows_batch()', 'director_hv_share_back_with_batch()']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `${fn}: not the publishable key's`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn}: its functions' helper only`)
  }
  for (const t of ['director_hv_shares', 'director_hv_share_lines']) {
    check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT')`), false, `${t}: read through its functions only`)
  }

  // ── HR keeps October's share — by percentage, four departments ────────────
  await as(HR_USER, HR_EDIT)
  // 7,528.025 → 7,528.03, 4,516.815 → 4,516.82, 2,258.4075 → 2,258.41, 752.8025 → 752.80:
  // a sen too many, taken back from the biggest percentage.
  check(await save('2026-10-01', [10000, 2000, 1500], 'percent', PCT_LINES),
    { status: 'open', total: 15056.05, amounts: [7528.02, 4516.82, 2258.41, 752.8] }, 'each its percentage to the sen, the rounding on the biggest')
  let of = await one(`SELECT public.director_hv_share_of('2026-10-01')`)
  check(of.departments.map(d => d.name), ['Director', 'IT', 'Marketing', 'Revenue Department', 'Venture Office'], 'every department to pick from')
  check([of.share.status, of.share.batch_id, of.share.batch_no], ['open', null, null], 'waiting for the directors’ payroll')
  check([of.share.basic, of.share.kpi, of.share.allowance, of.share.employer_epf, of.share.employer_socso, of.share.employer_eis],
    [10000, 2000, 1500, 1440, 104.15, 11.9], 'HR reads its components')
  check(of.share.lines.map(l => [l.department, l.amount, l.pct, l.stays]), [
    ['Marketing', 7528.02, 50, false], ['Revenue Department', 4516.82, 30, false], ['Venture Office', 2258.41, 15, false], ['Director', 752.8, 5, true],
  ], 'the lines in order; the Director department’s own stays in its pool')

  // The refusals.
  await reject(SAVE, ['2026-10-01', 10000, 2000, 1500, false, 0, 0, 0, 'percent', JSON.stringify(PCT_LINES.slice(0, 2))],
    /percentages add up to 80%, not 100%/, 'percentages short of 100')
  await reject(SAVE, ['2026-10-01', 10000, 2000, 1500, false, 0, 0, 0, 'amount', JSON.stringify([{ department_id: MKT, amount: 15056 }])],
    /add up to RM 15,056\.00, but HOUZS Venture's total is RM 15,056\.05/, 'amounts a sen short')
  await reject(SAVE, ['2026-10-01', 10000, 2000, 1500, false, 0, 0, 0, 'amount',
    JSON.stringify([{ department_id: MKT, amount: 7528.02 }, { department_id: MKT, amount: 7528.03 }])], /Marketing is picked twice/, 'a department twice')
  await reject(SAVE, ['2026-10-01', 10000, 2000, 1500, false, 0, 0, 0, 'amount', JSON.stringify([{ department_id: id(99), amount: 15056.05 }])],
    /Pick a department on every line/, 'no such department')
  await reject(SAVE, ['2026-10-01', 10000, 2000, 1500, false, 0, 0, 0, 'amount', '[]'], /Pick the departments/, 'nobody pays')
  await reject(SAVE, ['2026-10-15', 10000, 2000, 1500, false, 0, 0, 0, 'amount', '[]'], /first day/, 'a month is its first day')
  await reject(SAVE, ['2026-10-01', -1, 0, 0, false, 0, 0, 0, 'amount', '[]'], /cannot be below zero/, 'nothing below zero')
  check(await one(`SELECT total_ctc::float FROM director_hv_shares WHERE period_month = '2026-10-01'`), 15056.05, 'a refusal changed nothing')

  // By amount, with the employer statutory keyed by hand: 9,000 + 0 + 1,000 + 500 + 50 + 10 = 10,560.
  check(await save('2026-11-01', [9000, 0, 1000], 'amount', [{ department_id: IT, amount: 6000 }, { department_id: VO, amount: 4560 }], [500, 50, 10]),
    { status: 'open', total: 10560, amounts: [6000, 4560] }, 'by amount, the ER as keyed')

  // Who may.
  await as(HR_USER, HR_VIEW)
  await reject(SAVE, ['2026-10-01', 1, 0, 0, false, 0, 0, 0, 'amount', '[]'], /needs Director Salary · Edit/, 'View alone does not save')
  check((await one(`SELECT public.director_hv_share_of('2026-10-01')`)).share.total_ctc, 15056.05, 'View reads the grid')
  await as(FIN_USER, FINANCE)
  await reject(`SELECT public.director_hv_share_of('2026-10-01')`, [], /needs Director Salary · View/, 'Finance does not read the grid')
  await reject(SAVE, ['2026-10-01', 1, 0, 0, false, 0, 0, 0, 'amount', '[]'], /needs Director Salary · Edit/, 'Finance does not save')

  // ── October's payroll: HR › Payroll's Submit to Finance ───────────────────
  // The pools before: what each department holds.
  await q(`INSERT INTO dept_pools (department_id, transaction_type, amount, description) VALUES
    ($1, 'np_in', 100000, 'opening'), ($2, 'np_in', 20000, 'opening'), ($3, 'np_in', 10000, 'opening'),
    ($4, 'np_in', 5000, 'opening'), ($5, 'np_in', 1000, 'opening')`, [DIR, MKT, REV, VO, IT])
  const RUN = id(41)
  await q(`INSERT INTO payroll_runs VALUES ($1, '2026-10-01')`, [RUN])
  // A director as September's: 14,400 gross; CTC 14,400 + 1,728 + 104.15 + 11.90 = 16,244.05.
  const director = (name, topup = false) => ({ name, dept: null, deptName: 'Director', bucket: 'director', seg: 'director', topup,
    gross: 14400, net: 10700.55, epf_er: 1728, epf_ee: 1584, socso_er: 104.15, socso_ee: 29.75, eis_er: 11.9, eis_ee: 11.9, pcb: 2029.15, skbbk: 44.65 })
  // A Marketing staff member: CTC 5,000 + 650 + 86.65 + 9.90 = 5,746.55.
  const marketer = { name: 'MKT STAFF', dept: MKT, deptName: 'Marketing', bucket: 'marketing', seg: 'marketing', topup: false,
    gross: 5000, net: 4300, epf_er: 650, epf_ee: 550, socso_er: 86.65, socso_ee: 24.75, eis_er: 9.9, eis_ee: 9.9, pcb: 115.35, skbbk: 0 }
  const DIRECTORS = ['CHAI MENG KEAT', 'LIM WEI LIANG', 'LIM WEI SIANG', 'LOO WEN WEI'].map(n => director(n))
  async function submit(month, no, lines) {
    const batch = await one(`INSERT INTO payroll_batches (run_id, period_month, batch_no) VALUES ($1, $2, $3) RETURNING id`, [RUN, month, no])
    for (const l of lines) {
      await q(`INSERT INTO payroll_batch_lines (batch_id, employee_name, department_id, department_name, bucket, segment_key, is_topup,
          gross, net, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, skbbk)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [batch, l.name, l.dept, l.deptName, l.bucket, l.seg, l.topup, l.gross, l.net, l.epf_er, l.epf_ee, l.socso_er, l.socso_ee, l.eis_er, l.eis_ee, l.pcb, l.skbbk])
    }
    return batch
  }
  // Its funding request, as payroll_submit_batch files it — the batch's whole CTC.
  const fund = (month, batch) => one(`INSERT INTO payroll_payment_requests (payroll_run_id, requested_by, amount, period_month, batch_id)
    SELECT $1, $2, sum(ctc), $3, $4 FROM payroll_batch_lines WHERE batch_id = $4 RETURNING id`, [RUN, HR_USER, month, batch])

  const OCT1 = await submit('2026-10-01', 1, [...DIRECTORS, marketer])
  check(await shareOf('2026-10-01'), { status: 'open', batch_no: null }, 'the lines alone carry nothing')
  const REQ1 = await fund('2026-10-01', OCT1)
  check(await one(`SELECT amount::float FROM payroll_payment_requests WHERE id = $1`, [REQ1]), 70722.75, 'the request is the batch’s whole CTC, as ever')
  check(await shareOf('2026-10-01'), { status: 'in_payroll', batch_no: 1 }, 'the batch that carries the month’s directors carries the share')
  await as(HR_USER, HR_EDIT)
  of = await one(`SELECT public.director_hv_share_of('2026-10-01')`)
  check([of.share.status, of.share.batch_no, typeof of.share.batch_submitted_at], ['in_payroll', 1, 'string'], 'the grid reads which batch, and when')

  // HR meets the lock: the same figures are nothing to do, new ones wait for the batch to come back.
  check(await save('2026-10-01', [10000, 2000, 1500], 'amount', []), { status: 'in_payroll', total: 15056.05 }, 'saving the grid again changes nothing')
  await reject(SAVE, ['2026-10-01', 9000, 2000, 1500, false, 0, 0, 0, 'amount', '[]'],
    /HOUZS Venture's share for October 2026 went to Finance with payroll batch #1 — it changes once that batch is sent back/, 'a change waits')
  await reject(SAVE, ['2026-10-01', 0, 0, 0, false, 0, 0, 0, 'amount', '[]'], /went to Finance with payroll batch #1/, 'nor can it be cleared')
  check(await one(`SELECT count(*)::int FROM director_hv_share_lines l JOIN director_hv_shares s ON s.id = l.share_id
    WHERE s.period_month = '2026-10-01'`), 4, 'its lines as they were')

  // ── Finance › Payroll Requests: what each pool funds ──────────────────────
  await as(FIN_USER, FINANCE)
  const breakdown = await q(`SELECT pool_key, dept_name, required_amount::float AS req, pool_balance::float AS bal
    FROM public.get_payroll_breakdown_by_pool($1)`, [REQ1])
  check(breakdown, [
    // 64,976.20 of directors less the 14,303.25 HR put on the departments (the Director department's 752.80 stays).
    { pool_key: 'dept_pool_director', dept_name: 'Director', req: 50672.95, bal: 100000 },
    // The marketer's 5,746.55 and Marketing's 7,528.02.
    { pool_key: 'dept_pool_marketing', dept_name: 'Marketing', req: 13274.57, bal: 20000 },
    { pool_key: 'dept_pool_revenue_department', dept_name: 'Revenue Department', req: 4516.82, bal: 10000 },
    { pool_key: 'dept_pool_venture_office', dept_name: 'Venture Office', req: 2258.41, bal: 5000 },
  ], 'each department HR picked funds its part, the Director pool that much less')
  check(Math.round(breakdown.reduce((a, r) => a + r.req, 0) * 100) / 100, 70722.75, 'and the parts make the request')
  await as(HR_USER, HR_EDIT)
  await reject(`SELECT * FROM public.get_payroll_breakdown_by_pool($1)`, [REQ1], /payroll payouts are not yours to read/, 'Payroll Requests’ own gate, as ever')

  // ── The accrual JVs a segment (HR's Submit posts them) ────────────────────
  const sums = await q(`SELECT segment, gross::float, non_statutory_allowance::float AS nsa, epf_er::float, epf_ee::float, socso_er::float,
      socso_ee::float, eis_er::float, eis_ee::float, pcb::float, withholding_tax::float AS wht, net::float, skbbk::float
    FROM public.payroll_batch_accrual_sums($1) ORDER BY segment`, [OCT1])
  const r2 = n => Math.round(n * 100) / 100
  const ctcOf = s => r2(s.gross + s.epf_er + s.socso_er + s.eis_er)
  check(sums.map(s => [s.segment, ctcOf(s)]), [
    ['corporate', 2258.41], ['director', 50672.95], ['marketing', 13274.57], ['revenue_department', 4516.82],
  ], 'each part’s CTC exactly what HR gave it — Venture Office’s in corporate — and the Director’s the rest')
  check(sums.filter(s => r2(s.gross - s.net - s.epf_ee - s.socso_ee - s.eis_ee - s.pcb - s.wht - s.skbbk) !== 0).map(s => s.segment), [],
    'every JV balances: gross = net + the employee’s statutory + PCB + WHT + SKBBK')
  // As production's dry-run of the same month gave (2026-10-13).
  check(sums.filter(s => s.segment !== 'marketing').map(s => [s.segment, s.gross, s.epf_er, s.socso_er, s.eis_er, s.net, s.pcb, s.skbbk]), [
    ['corporate', 2002.04, 240.24, 14.48, 1.65, 1487.71, 282.11, 6.21],
    ['director', 44920.47, 5390.46, 324.89, 37.13, 33380.12, 6329.89, 139.28],
    ['revenue_department', 4004.06, 480.49, 28.96, 3.31, 2975.38, 564.23, 12.42],
  ], 'every other figure the same proportion of the directors’, to the sen')
  const lineTotals = await q(`SELECT sum(gross)::float AS gross, sum(epf_er)::float AS epf_er, sum(epf_ee)::float AS epf_ee,
      sum(socso_er)::float AS socso_er, sum(socso_ee)::float AS socso_ee, sum(eis_er)::float AS eis_er, sum(eis_ee)::float AS eis_ee,
      sum(pcb)::float AS pcb, sum(net)::float AS net, sum(skbbk)::float AS skbbk FROM payroll_batch_lines WHERE batch_id = $1`, [OCT1])
  check(Object.fromEntries(Object.keys(lineTotals[0]).map(k => [k, r2(sums.reduce((a, s) => a + s[k], 0))])), lineTotals[0],
    'nothing made or lost: the segments add up to the batch’s lines, figure by figure')
  check(await q(`SELECT * FROM public.payroll_batch_segment_sums($1) ORDER BY 1`, [OCT1]).then(r => r.length), 4, 'the helper the batch reads')
  await as(FIN_USER, ['treasury.view'])
  await reject(`SELECT * FROM public.payroll_batch_accrual_sums($1)`, [OCT1], /not permitted/, 'the sums are HR costing’s, as ever')

  // ── Finance funds it; the Principal approves: each pool pays its part ─────
  const before = await pools()
  const APPROVAL = id(51)
  for (const row of breakdown) {
    await q(`SELECT public.apply_pool_adjustment($1, 'out', $2, $3, $4, $5, now())`,
      [row.pool_key, row.req, `PV HV-PV-202610-0001: ${row.dept_name}`, FIN_USER, APPROVAL])
  }
  const after = await pools()
  check(Object.fromEntries(Object.keys(after).map(k => [k, r2(after[k] - before[k])])),
    { Director: -50672.95, IT: 0, Marketing: -13274.57, 'Revenue Department': -4516.82, 'Venture Office': -2258.41 },
    'the departments pay their part of the directors — Venture Office found by its name, having no segment')
  await reject(`SELECT public.apply_pool_adjustment('dept_pool_nowhere', 'out', 1, 'x', $1, $2, now())`, [FIN_USER, APPROVAL],
    /unknown dept_pool identifier dept_pool_nowhere/, 'a pool no department answers to is still refused')

  // ── Finance sends the batch back: the share is HR's again ─────────────────
  await q(`UPDATE payroll_batches SET status = 'submitted' WHERE id = $1`, [OCT1])
  check(await shareOf('2026-10-01'), { status: 'in_payroll', batch_no: 1 }, 'a status saved again moves nothing')
  await q(`UPDATE payroll_batches SET status = 'sent_back' WHERE id = $1`, [OCT1])
  check(await shareOf('2026-10-01'), { status: 'open', batch_no: null }, 'sent back, it waits for the next batch')
  await as(HR_USER, HR_EDIT)
  check(await save('2026-10-01', [10000, 2000, 1500], 'amount', [{ department_id: MKT, amount: 10000 }, { department_id: DIR, amount: 5056.05 }]),
    { status: 'open', total: 15056.05, amounts: [10000, 5056.05] }, 'HR may change it now')
  const OCT2 = await submit('2026-10-01', 2, [...DIRECTORS, marketer])
  const REQ2 = await fund('2026-10-01', OCT2)
  check(await shareOf('2026-10-01'), { status: 'in_payroll', batch_no: 2 }, 'the next batch carries it')
  await as(FIN_USER, FINANCE)
  check(await q(`SELECT dept_name, required_amount::float AS req FROM public.get_payroll_breakdown_by_pool($1)`, [REQ2]), [
    { dept_name: 'Director', req: 54976.2 }, { dept_name: 'Marketing', req: 15746.55 },
  ], 'with its new split — the Director department’s own 5,056.05 still in the Director pool')

  // ── Batches that carry nothing ────────────────────────────────────────────
  // November: a staff-only batch, then a top-up of a director, then the directors.
  const NOV1 = await submit('2026-11-01', 1, [marketer])
  await fund('2026-11-01', NOV1)
  check(await shareOf('2026-11-01'), { status: 'open', batch_no: null }, 'a batch with no directors carries nothing')
  const NOV2 = await submit('2026-11-01', 2, [director('LOO WEN WEI', true)])
  await fund('2026-11-01', NOV2)
  check(await shareOf('2026-11-01'), { status: 'open', batch_no: null }, 'nor a top-up of one')
  const NOV3 = await submit('2026-11-01', 3, [director('CHAI MENG KEAT')])
  await fund('2026-11-01', NOV3)
  check(await shareOf('2026-11-01'), { status: 'in_payroll', batch_no: 3 }, 'the directors’ own batch does')

  // December: never more on the departments than the directors' payroll in the batch.
  // 18,000 + 2,000 + EPF 2,160 + SOCSO 104.15 + EIS 11.90 = 22,276.05 against one director's 16,244.05.
  await as(HR_USER, HR_EDIT)
  check((await save('2026-12-01', [18000, 0, 2000], 'amount', [{ department_id: IT, amount: 22276.05 }])).total, 22276.05, 'December’s share')
  const DEC1 = await submit('2026-12-01', 1, [director('CHAI MENG KEAT')])
  await reject(`INSERT INTO payroll_payment_requests (payroll_run_id, requested_by, amount, period_month, batch_id) VALUES ($1, $2, 16244.05, '2026-12-01', $3)`,
    [RUN, HR_USER, DEC1], /puts RM 22,276\.05 on its departments — more than the directors' payroll of RM 16,244\.05 in this batch/,
    'the submit is refused')
  check(await shareOf('2026-12-01'), { status: 'open', batch_no: null }, 'and the share waits')
  // The Director department's own line moves nothing, so it may hold the rest.
  await save('2026-12-01', [18000, 0, 2000], 'amount', [{ department_id: IT, amount: 12276.05 }, { department_id: DIR, amount: 10000 }])
  await fund('2026-12-01', DEC1)
  check(await shareOf('2026-12-01'), { status: 'in_payroll', batch_no: 1 }, 'within the directors’ payroll, carried')

  // ── The directors went to Finance without it ─────────────────────────────
  await q(`INSERT INTO director_monthly_payroll VALUES ('2027-01-01', $1, 'submitted'), ('2027-01-01', $2, 'paid')`, [id(31), id(32)])
  await reject(SAVE, ['2027-01-01', 5000, 0, 0, false, 0, 0, 0, 'amount', JSON.stringify([{ department_id: MKT, amount: 5000 }])],
    /The directors of January 2027 are with Finance already — HOUZS Venture's share goes with them, so their batch is sent back first/,
    'no batch would carry it')
  check(await save('2027-01-01', [0, 0, 0], 'amount', []), { status: 'none', total: 0 }, 'nothing paid by HV is nothing to refuse')

  // ── The locked months ─────────────────────────────────────────────────────
  await q(`INSERT INTO period_locks VALUES ('2027-02-01', true)`)
  await reject(SAVE, ['2027-02-01', 5000, 0, 0, false, 0, 0, 0, 'amount', JSON.stringify([{ department_id: MKT, amount: 5000 }])],
    /The accounting period February 2027 is locked/, 'not in a locked month')

  // Nobody signed in calls nothing.
  await as(null, [])
  await reject(SAVE, ['2026-10-01', 1, 0, 0, false, 0, 0, 0, 'amount', '[]'], /needs Director Salary · Edit/, 'no sign-in, no save')
  await reject(`SELECT public.director_hv_share_of('2026-10-01')`, [], /needs Director Salary · View/, 'no sign-in, no read')

  console.log(`director HV share: ${checks} checks passed`)
} finally {
  await db.close()
}

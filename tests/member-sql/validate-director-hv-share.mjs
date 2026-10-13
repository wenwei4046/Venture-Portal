// Local PostgreSQL regression for 20261013170000 (2026-10-13, Director Salary:
// HOUZS Venture's own share — the user: "i want add on houzs venture itself in
// this as well. but when press save, once detech venture itself got pay, will
// need to select the amount is deduct from which department. then can pick more
// than 2 department as well, by amount or percentage from the total amount.
// then confirm so that finance will get the submittion to make the inter
// transfer fund" — "make sure all department, can be seleceted"). The migration
// runs VERBATIM over stand-ins for what it reads and writes — the roster, the
// departments, the invoices, receipts and their source rows, the dept pools,
// the journal, the statutory lookups, the permission check and the tab guard;
// the triggers and helpers it leans on are production's bodies (read off
// pg_proc on 2026-10-13). What is under test: HR's save (by amount, by
// percentage with the rounding on the biggest line, every refusal), Finance's
// transfer (per paying department an invoice dated the payroll month's last
// day, its two journals, a receipt by netting, the pools), the Director
// department's line moving nothing, HR's lock after a transfer, Undo (voided,
// reversed in pairs, the pools back), the locked months, and who may call
// what. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const load = async f => db.exec((await readFile(new URL(f, migrations), 'utf8')).replace(/\r\n/g, '\n'))

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

const HR_USER = id(1)
const FIN_USER = id(2)
const DIR = id(21)
const MKT = id(22)
const REV = id(23)
const VO = id(24)
const IT = id(25)

/** Sign in as somebody holding these actions (the stand-in has_any_action reads them). */
async function as(user, actions) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('test.actions', '${actions.join(',')}', false)`)
}
const HR_EDIT = ['director_salary.view', 'director_salary.edit']
const HR_VIEW = ['director_salary.view']
const FINANCE = ['treasury.view', 'treasury.create', 'treasury.void']
const FIN_VIEW = ['treasury.view']

const SAVE = `SELECT public.director_hv_share_save($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) AS r`
const save = (period, [b, k, a], mode, lines, er = null) =>
  one(SAVE, [period, b, k, a, er !== null, er?.[0] ?? 0, er?.[1] ?? 0, er?.[2] ?? 0, mode, JSON.stringify(lines)])
const pools = async () =>
  Object.fromEntries((await q(`SELECT d.name, coalesce(b.balance, 0)::float AS balance FROM departments d
    LEFT JOIN dept_pool_balances b ON b.department_id = d.id ORDER BY d.name`)).map(r => [r.name, r.balance]))

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

  // ── Who may call what ─────────────────────────────────────────────────────
  for (const fn of ['director_hv_share_of(date)', 'director_hv_share_queue()', 'director_hv_share_transfer(uuid, date)',
    'director_hv_share_undo(uuid)', 'director_hv_share_save(date, numeric, numeric, numeric, boolean, numeric, numeric, numeric, text, jsonb)']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `${fn}: not the publishable key's`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `${fn}: a signed-in session's`)
  }
  for (const fn of ['director_hv_share_json(uuid, boolean)', 'director_hv_share_departments()']) {
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn}: its functions' helper only`)
  }
  for (const t of ['director_hv_shares', 'director_hv_share_lines']) {
    check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT')`), false, `${t}: read through its functions only`)
  }

  // ── HR keeps HV's share — by percentage, four departments ─────────────────
  // Basic 10,000 + KPI 2,000 + Allowance 1,500; ER on 12,000 at one head:
  // EPF 1,440.00 + SOCSO 104.15 + EIS 11.90 → 15,056.05.
  await as(HR_USER, HR_EDIT)
  const PCT_LINES = [{ department_id: MKT, pct: 50 }, { department_id: REV, pct: 30 }, { department_id: VO, pct: 15 }, { department_id: DIR, pct: 5 }]
  const saved = await save('2026-10-01', [10000, 2000, 1500], 'percent', PCT_LINES)
  check(saved.status, 'with_finance', 'sent to Finance')
  check(saved.total, 15056.05, 'the total with its employer statutory')
  // 7,528.025 → 7,528.03, 4,516.815 → 4,516.82, 2,258.4075 → 2,258.41, 752.8025 → 752.80:
  // a sen too many, taken back from the biggest percentage.
  check(saved.amounts, [7528.02, 4516.82, 2258.41, 752.8], 'each its percentage to the sen, the rounding on the biggest')
  const of = await one(`SELECT public.director_hv_share_of('2026-10-01')`)
  check(of.departments.map(d => d.name), ['Director', 'IT', 'Marketing', 'Revenue Department', 'Venture Office'], 'every department to pick from, Venture Office last')
  check([of.share.basic, of.share.kpi, of.share.allowance, of.share.employer_epf, of.share.employer_socso, of.share.employer_eis],
    [10000, 2000, 1500, 1440, 104.15, 11.9], 'HR reads its components')
  check(of.share.lines.map(l => [l.department, l.amount, l.pct, l.stays]), [
    ['Marketing', 7528.02, 50, false], ['Revenue Department', 4516.82, 30, false], ['Venture Office', 2258.41, 15, false], ['Director', 752.8, 5, true],
  ], 'the lines in order; the Director department stays in its pool')
  const SHARE = of.share.id

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
  check(await one(`SELECT total_ctc::float FROM director_hv_shares WHERE id = $1`, [SHARE]), 15056.05, 'a refusal changed nothing')

  // By amount, with the employer statutory keyed by hand: 9,000 + 0 + 1,000 + 500 + 50 + 10 = 10,560.
  const manual = await save('2026-11-01', [9000, 0, 1000], 'amount',
    [{ department_id: IT, amount: 6000 }, { department_id: VO, amount: 4560 }], [500, 50, 10])
  check([manual.status, manual.total, manual.amounts], ['with_finance', 10560, [6000, 4560]], 'by amount, the ER as keyed')

  // Who may.
  await as(HR_USER, HR_VIEW)
  await reject(SAVE, ['2026-10-01', 1, 0, 0, false, 0, 0, 0, 'amount', '[]'], /needs Director Salary · Edit/, 'View alone does not save')
  check((await one(`SELECT public.director_hv_share_of('2026-10-01')`)).share.id, SHARE, 'View reads the grid')
  await reject(`SELECT public.director_hv_share_queue()`, [], /needs Treasury · View/, 'HR does not read Finance’s list')
  await reject(`SELECT public.director_hv_share_transfer($1, '2026-10-20')`, [SHARE], /needs Treasury · Create/, 'HR does not transfer')
  await as(FIN_USER, FINANCE)
  await reject(`SELECT public.director_hv_share_of('2026-10-01')`, [], /needs Director Salary · View/, 'Finance does not read the grid')
  await reject(SAVE, ['2026-10-01', 1, 0, 0, false, 0, 0, 0, 'amount', '[]'], /needs Director Salary · Edit/, 'Finance does not save')

  // ── Finance's list ───────────────────────────────────────────────────────
  await as(FIN_USER, FIN_VIEW)
  const queue = await one(`SELECT public.director_hv_share_queue()`)
  check(queue.pending.map(s => [s.period_month, s.total_ctc, s.submitted_by]), [['2026-10-01', 15056.05, 'HR Manager'], ['2026-11-01', 10560, 'HR Manager']],
    'what HR sent, month by month')
  check('basic' in queue.pending[0], false, 'the total only — no components on Finance’s list')
  await reject(`SELECT public.director_hv_share_transfer($1, '2026-10-20')`, [SHARE], /needs Treasury · Create/, 'View does not transfer')

  // ── Transfer ─────────────────────────────────────────────────────────────
  // A receipt numbered elsewhere already holds the next count: the transfer takes the next free one.
  await q(`INSERT INTO payment_vouchers (voucher_no, voucher_type, status, amount, payee_name, description, created_by, direction)
    VALUES ('HV-OR-202610-0002', 'other', 'draft', 1, 'Someone', 'numbered elsewhere', $1, 'credit')`, [FIN_USER])
  const before = await pools()
  await as(FIN_USER, FINANCE)
  await db.exec(`TRUNCATE guard_calls`)
  const moved = await one(`SELECT public.director_hv_share_transfer($1, '2026-10-20')`, [SHARE])
  check(moved, { invoices: ['HV-INV-202610-0001', 'HV-INV-202610-0002', 'HV-INV-202610-0003'], receipts: ['HV-OR-202610-0003', 'HV-OR-202610-0004', 'HV-OR-202610-0005'] },
    'an invoice and a receipt a paying department — none for the Director department')
  check(await q(`SELECT pages, wants FROM guard_calls`), [{ pages: ['/payments/dept-requests'], wants: ['treasury.create'] }], 'it asks Dept Requests’ page first')
  check(await q(`SELECT i.invoice_no, i.status::text, i.total_amount::float AS total, i.invoice_date::text, i.billing_mode::text, d.name
      FROM invoices i JOIN departments d ON d.id = i.billable_to_department_id ORDER BY i.invoice_no`), [
    { invoice_no: 'HV-INV-202610-0001', status: 'paid', total: 7528.02, invoice_date: '2026-10-31', billing_mode: 'director_attribution', name: 'Marketing' },
    { invoice_no: 'HV-INV-202610-0002', status: 'paid', total: 4516.82, invoice_date: '2026-10-31', billing_mode: 'director_attribution', name: 'Revenue Department' },
    { invoice_no: 'HV-INV-202610-0003', status: 'paid', total: 2258.41, invoice_date: '2026-10-31', billing_mode: 'director_attribution', name: 'Venture Office' },
  ], 'invoices to the departments’ pools, dated the payroll month’s last day, paid by their receipts')
  check(await q(`SELECT l.description, l.category_code FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id ORDER BY i.invoice_no`).then(r => r.map(x => [x.description, x.category_code])),
    [["Director salary (HV share) - Oct'26", '5050'], ["Director salary (HV share) - Oct'26", '5050'], ["Director salary (HV share) - Oct'26", '5050']],
    'one line on Salary Income')
  check(await q(`SELECT je.transaction_date::text AS d, je.segment::text AS seg, jl.account_code AS acct, coalesce(jl.debit, 0)::float AS dr, coalesce(jl.credit, 0)::float AS cr
      FROM journal_entries je JOIN journal_lines jl ON jl.entry_id = je.id ORDER BY je.entry_no, jl.account_code`).then(r => r.map(x => `${x.d} ${x.seg} ${x.acct} ${x.dr}/${x.cr}`)), [
    '2026-10-31 director 3073 7528.02/0', '2026-10-31 director 5050 0/7528.02',
    '2026-10-31 marketing 3073 0/7528.02', '2026-10-31 marketing 9030 7528.02/0',
    '2026-10-31 director 3073 4516.82/0', '2026-10-31 director 5050 0/4516.82',
    '2026-10-31 revenue_department 3073 0/4516.82', '2026-10-31 revenue_department 9030 4516.82/0',
    '2026-10-31 director 3073 2258.41/0', '2026-10-31 director 5050 0/2258.41',
    '2026-10-31 corporate 3073 0/2258.41', '2026-10-31 corporate 9030 2258.41/0',
  ], 'each invoice issued as an inter-billing: the Director’s income, the department’s salary cost (Venture Office: corporate)')
  check(await q(`SELECT voucher_no, voucher_type::text AS t, status::text AS s, payment_method AS m, payment_date::text AS d, amount::float AS a,
      target_pool AS tp, bank_account_id IS NULL AS no_bank FROM payment_vouchers WHERE invoice_id IS NOT NULL ORDER BY voucher_no`).then(r =>
      r.map(x => `${x.voucher_no} ${x.t} ${x.s} ${x.m} ${x.d} ${x.a} ${x.tp} ${x.no_bank}`)), [
    'HV-OR-202610-0003 billing_payment paid netting 2026-10-20 7528.02 dept_pool_director true',
    'HV-OR-202610-0004 billing_payment paid netting 2026-10-20 4516.82 dept_pool_director true',
    'HV-OR-202610-0005 billing_payment paid netting 2026-10-20 2258.41 dept_pool_director true',
  ], 'received by netting on the transfer date, no bank')
  check(await q(`SELECT s.pool, s.account_code AS acct, s.role, s.amount::float AS a FROM payment_voucher_sources s
      JOIN payment_vouchers v ON v.id = s.voucher_id ORDER BY v.voucher_no, s.role DESC`).then(r => r.map(x => `${x.pool} ${x.acct} ${x.role} ${x.a}`)), [
    'dept_pool_director 3073 primary 7528.02', 'dept_pool_marketing 9030 mirror 7528.02',
    'dept_pool_director 3073 primary 4516.82', 'dept_pool_revenue_department 9030 mirror 4516.82',
    'dept_pool_director 3073 primary 2258.41', 'dept_pool_venture_office 9030 mirror 2258.41',
  ], 'the primary rows the Director pool’s, the mirror rows the paying departments’')
  check(await q(`SELECT d.name, dp.transaction_type::text AS t, dp.amount::float AS a, dp.description LIKE 'PV HV-OR-202610-%: %' AS ref
      FROM dept_pools dp JOIN departments d ON d.id = dp.department_id
     ORDER BY substring(dp.description FROM 'HV-OR-[0-9]+-[0-9]+'), d.name <> 'Director'`).then(r => r.map(x => `${x.name} ${x.t} ${x.a} ${x.ref}`)), [
    'Director np_in 7528.02 true', 'Marketing inter_billing_out 7528.02 true',
    'Director np_in 4516.82 true', 'Revenue Department inter_billing_out 4516.82 true',
    'Director np_in 2258.41 true', 'Venture Office inter_billing_out 2258.41 true',
  ], 'each pair under its receipt — the cash-flow bridge pairs them by it')
  const after = await pools()
  check(Object.fromEntries(Object.keys(after).map(k => [k, Math.round((after[k] - before[k]) * 100) / 100])),
    { Director: 14303.25, IT: 0, Marketing: -7528.02, 'Revenue Department': -4516.82, 'Venture Office': -2258.41 },
    'the departments down, the Director pool up — all but the Director department’s own 752.80')
  const done = await one(`SELECT public.director_hv_share_queue()`)
  check([done.pending.length, done.transferred.map(s => [s.period_month, s.transfer_date, s.transferred_by])],
    [1, [['2026-10-01', '2026-10-20', 'Finance Manager']]], 'transferred, by whom and when')
  check(done.transferred[0].lines.map(l => [l.department, l.invoice_no, l.voucher_no]), [
    ['Marketing', 'HV-INV-202610-0001', 'HV-OR-202610-0003'], ['Revenue Department', 'HV-INV-202610-0002', 'HV-OR-202610-0004'],
    ['Venture Office', 'HV-INV-202610-0003', 'HV-OR-202610-0005'], ['Director', null, null],
  ], 'each department’s documents')
  await reject(`SELECT public.director_hv_share_transfer($1, '2026-10-20')`, [SHARE], /transferred already/, 'not twice')

  // HR meets the lock: the same figures are nothing to do, new ones wait for Undo.
  await as(HR_USER, HR_EDIT)
  check(await save('2026-10-01', [10000, 2000, 1500], 'amount', []), { status: 'transferred', total: 15056.05 }, 'saving the grid again changes nothing')
  await reject(SAVE, ['2026-10-01', 9000, 2000, 1500, false, 0, 0, 0, 'amount', '[]'], /Finance has transferred HOUZS Venture's share for October 2026/, 'a change waits for Undo')
  await reject(SAVE, ['2026-10-01', 0, 0, 0, false, 0, 0, 0, 'amount', '[]'], /Finance has transferred/, 'nor can it be cleared')

  // ── Undo ─────────────────────────────────────────────────────────────────
  await as(FIN_USER, ['treasury.view', 'treasury.create'])
  await reject(`SELECT public.director_hv_share_undo($1)`, [SHARE], /needs Treasury · Void/, 'Create does not undo')
  await q(`INSERT INTO period_locks VALUES ('2026-10-01', true)`)
  await as(FIN_USER, FINANCE)
  await reject(`SELECT public.director_hv_share_undo($1)`, [SHARE], /accounting period October 2026 is locked/, 'not in a locked month')
  await q(`DELETE FROM period_locks`)
  await db.exec(`TRUNCATE guard_calls`)
  const undone = await one(`SELECT public.director_hv_share_undo($1)`, [SHARE])
  check(undone, { invoices: ['HV-INV-202610-0001', 'HV-INV-202610-0002', 'HV-INV-202610-0003'], receipts: ['HV-OR-202610-0003', 'HV-OR-202610-0004', 'HV-OR-202610-0005'] },
    'every document taken back')
  check(await q(`SELECT pages, wants FROM guard_calls`), [{ pages: ['/payments/dept-requests'], wants: ['treasury.void'] }], 'Undo asks the page too')
  check(await q(`SELECT DISTINCT status::text FROM invoices`).then(r => r.map(x => x.status)), ['voided'], 'the invoices voided')
  check(await q(`SELECT DISTINCT status::text FROM payment_vouchers WHERE invoice_id IS NOT NULL`).then(r => r.map(x => x.status)), ['voided'], 'the receipts voided')
  check(await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE is_reversed)::int AS rev,
      (SELECT sum(coalesce(debit, 0) - coalesce(credit, 0))::float FROM journal_lines) AS net FROM journal_entries`), [{ n: 12, rev: 12, net: 0 }],
    'every journal reversed in a pair')
  check(await pools(), before, 'every pool where it was')
  check(await one(`SELECT status FROM director_hv_shares WHERE id = $1`, [SHARE]), 'with_finance', 'the share waits again')
  check(await one(`SELECT count(*)::int FROM director_hv_share_lines WHERE invoice_id IS NOT NULL OR voucher_id IS NOT NULL`), 0, 'its lines hold no documents')
  await reject(`SELECT public.director_hv_share_undo($1)`, [SHARE], /is not transferred/, 'nothing to undo twice')

  // HR may change it again — and clear it.
  await as(HR_USER, HR_EDIT)
  check((await save('2026-10-01', [8000, 0, 0], 'amount', [{ department_id: MKT, amount: 8000 + 960 + 104.15 + 11.9 }])).total, 9076.05, 'changed again')
  check(await save('2026-10-01', [0, 0, 0], 'amount', []), { status: 'none', total: 0 }, 'all zero: no share')
  check(await one(`SELECT count(*)::int FROM director_hv_share_lines WHERE share_id = $1`, [SHARE]), 0, 'its lines go with it')

  // ── The locked months refuse the transfer ─────────────────────────────────
  const NOV = (await one(`SELECT id FROM director_hv_shares WHERE period_month = '2026-11-01'`))
  await as(FIN_USER, FINANCE)
  await q(`INSERT INTO period_locks VALUES ('2026-11-01', true)`)
  await reject(`SELECT public.director_hv_share_transfer($1, '2026-12-03')`, [NOV], /period November 2026 is locked — its invoices are dated 30 Nov 2026/, 'the payroll month locked')
  await db.exec(`DELETE FROM period_locks; INSERT INTO period_locks VALUES ('2026-12-01', true)`)
  await reject(`SELECT public.director_hv_share_transfer($1, '2026-12-03')`, [NOV], /period December 2026 is locked — pick another transfer date/, 'the transfer date’s month locked')
  await q(`DELETE FROM period_locks`)
  const nov = await one(`SELECT public.director_hv_share_transfer($1, '2026-12-03')`, [NOV])
  check([nov.invoices, nov.receipts.length], [['HV-INV-202611-0001', 'HV-INV-202611-0002'], 2], 'IT and Venture Office, with the hand-keyed ER total')
  check(await q(`SELECT je.segment::text FROM journal_entries je WHERE je.period_month = '2026-11-01' ORDER BY je.entry_no`).then(r => r.map(x => x.segment)),
    ['director', 'it', 'director', 'corporate'], 'IT’s cost in its own segment')

  // Nobody signed in calls nothing.
  await as(null, [])
  await reject(`SELECT public.director_hv_share_transfer($1, '2026-12-03')`, [NOV], /needs Treasury · Create/, 'no sign-in, no transfer')
  await reject(SAVE, ['2026-10-01', 1, 0, 0, false, 0, 0, 0, 'amount', '[]'], /needs Director Salary · Edit/, 'no sign-in, no save')

  console.log(`director HV share: ${checks} checks passed`)
} finally {
  await db.close()
}

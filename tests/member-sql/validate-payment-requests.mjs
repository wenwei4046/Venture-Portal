// Local PostgreSQL regression for staff payment requests (2026-10-29, PR ② of docs/module-spec-payment-requests.md):
// a staff member's claim or direct pay — saved, sent, rejected and fixed, put in a voucher by Finance (a Yes share's
// invoice drafted in the same step), paid with it or back with Finance when it is voided — who may read its files, and
// the Claim tabs of the HR and Finance views. The migration runs VERBATIM (twice) against a synthetic surrounding
// schema. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0] ?? { none: null })[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const KHO = id(1) // Marketing staff, salary account on file
const LI = id(2) // HR staff, no salary account on file
const FIN = id(3) // Finance Manager: Treasury View, Create, Void, Approve; the Bank tick
const MAKER = id(4) // Finance · Maker: Treasury View, Create; no Bank tick
const NOBODY = id(5) // a login with no People record
const OUTSIDER = id(6) // a staff login without Claim
const MKT = id(10)
const HR = id(11)
const FINANCE = id(12)
const VO = id(13)
const DIRECTOR = id(14)
const DREAM = id(20)
const OLD_CO = id(21)
const PV = id(30)
const PV2 = id(31)
const INVOICE = id(40)
const T_HR = id(50) // HR · Payroll: its ticks stored
const T_MAKER = id(51) // Finance · Maker: its ticks worked out from its cells

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

const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

/** An upload as the browser leaves it: the object's row in the bucket. */
async function upload(user, name, type = 'application/pdf', size = 1200) {
  await as(null, null)
  const path = `${user}/${id(Math.floor(Math.random() * 1e9))}/${name}`
  await q(`INSERT INTO file_objects (bucket_id, name, metadata) VALUES ('payment-request-files', $1, $2::jsonb)`,
    [path, JSON.stringify({ size, mimetype: type })])
  return { path, name, contentType: type, size }
}

const save = (request, data, submit = false) =>
  one('SELECT payment_request_save($1, $2::jsonb, $3)', [request, JSON.stringify(data), submit])

const claimData = (files, over = {}) => ({
  kind: 'claim',
  payTo: { salary: true },
  items: [{ description: 'Claude · Oct', amount: '453.79' }, { description: 'Jian Ying', amount: '325.79' }],
  shares: [],
  files,
  ...over,
})

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE SCHEMA storage;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE
      AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    GRANT USAGE ON SCHEMA storage TO authenticated;
    GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;

    CREATE TABLE users(id uuid PRIMARY KEY, role text NOT NULL, name text, is_active boolean NOT NULL DEFAULT true);
    INSERT INTO users(id, role, name) VALUES ('${KHO}', 'staff', 'KHO WEI JIE'), ('${LI}', 'hr', 'LI SEAN'),
      ('${FIN}', 'finance', 'Finance Manager'), ('${MAKER}', 'finance', 'ONG MEI SHUANG'), ('${NOBODY}', 'staff', 'No record'),
      ('${OUTSIDER}', 'staff', 'Outsider');
    -- The cells each account holds, and the Bank tick.
    CREATE TABLE grants(user_id uuid NOT NULL, cell text NOT NULL);
    INSERT INTO grants VALUES
      ('${KHO}', 'claims.view'), ('${KHO}', 'claims.create'), ('${LI}', 'claims.view'), ('${LI}', 'claims.create'),
      ('${NOBODY}', 'claims.view'), ('${NOBODY}', 'claims.create'),
      ('${FIN}', 'treasury.view'), ('${FIN}', 'treasury.create'), ('${FIN}', 'treasury.void'), ('${FIN}', 'treasury.approve'),
      ('${FIN}', 'claims.view'), ('${FIN}', 'claims.create'), ('${FIN}', 'billing.create'),
      ('${MAKER}', 'treasury.view'), ('${MAKER}', 'treasury.create');
    CREATE TABLE bank_tick(user_id uuid PRIMARY KEY);
    INSERT INTO bank_tick VALUES ('${FIN}');
    CREATE TABLE closed_pages(user_id uuid NOT NULL, page text NOT NULL);
    CREATE FUNCTION has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      AS $$ SELECT EXISTS (SELECT 1 FROM grants g WHERE g.user_id = auth.uid()
              AND g.cell = ANY (ARRAY(SELECT split_part(w, ':', 1) FROM unnest(p_wants) w))) $$;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      AS $$ SELECT EXISTS (SELECT 1 FROM grants g WHERE g.user_id = auth.uid() AND split_part(g.cell, '.', 1) = $1) $$;
    CREATE FUNCTION sees_sensitive(p_field text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      AS $$ SELECT p_field = 'bank' AND EXISTS (SELECT 1 FROM bank_tick b WHERE b.user_id = auth.uid()) $$;
    CREATE FUNCTION tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM closed_pages c WHERE c.user_id = auth.uid() AND c.page = ANY (p_pages)) THEN
        RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked' USING ERRCODE = '42501';
      END IF;
    END $$;
    -- The audit's register: its line kept, nothing attached here.
    CREATE TABLE audit_lines(table_name text PRIMARY KEY, mode text);
    CREATE FUNCTION audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS text LANGUAGE sql
      AS $$ INSERT INTO audit_lines VALUES (p_table, p_mode) ON CONFLICT (table_name) DO UPDATE SET mode = excluded.mode RETURNING mode $$;

    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL, segment_key text, billing_mode_key text,
      is_internal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO departments(id, name, segment_key, billing_mode_key, is_internal) VALUES
      ('${MKT}', 'Marketing', 'marketing', 'marketing_project', false), ('${HR}', 'HR', 'hr', 'hr_attribution', false),
      ('${FINANCE}', 'Finance', 'finance', 'finance_attribution', false), ('${VO}', 'Venture Office', NULL, NULL, true),
      ('${DIRECTOR}', 'Director', 'director', 'director_attribution', false);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, employee_name text NOT NULL,
      department_id uuid NOT NULL, status text NOT NULL DEFAULT 'active', bank_name text, bank_account_no text,
      created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO hr_staff_costs(user_id, employee_name, department_id, bank_name, bank_account_no) VALUES
      ('${KHO}', 'KHO WEI JIE', '${MKT}', 'Hong Leong Bank', '1234-567-4821'),
      ('${LI}', 'LI SEAN', '${HR}', NULL, NULL),
      ('${FIN}', 'FINANCE MANAGER', '${FINANCE}', 'Maybank', '5140 1234 0009'),
      ('${OUTSIDER}', 'OUTSIDER', '${HR}', 'CIMB', '7000111');
    CREATE TABLE companies(id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
    INSERT INTO companies VALUES ('${DREAM}', 'Dream Crafter', true), ('${OLD_CO}', 'Closed Co', false);
    CREATE TYPE billing_mode AS ENUM ('marketing_project', 'non_billable', 'director_office_attribution', 'director_attribution',
      'hr_attribution', 'finance_attribution', 'venture_attribution', 'payroll_consolidated', 'revenue_department_attribution', 'it_attribution');
    CREATE TYPE billable_to_kind AS ENUM ('subsidiary', 'director', 'dept_pool', 'freetext');
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_no text, period_month date, billing_mode billing_mode,
      category_code text, base_amount numeric, total_amount numeric CHECK (total_amount > 0), status text NOT NULL DEFAULT 'draft',
      invoice_date date, due_date date, description text, reference_no text, created_by uuid, billable_to_type billable_to_kind,
      company_id uuid, billable_to_department_id uuid);
    INSERT INTO invoices (id, invoice_no, status, total_amount) VALUES ('${INVOICE}', 'HV-INV-202610-0090', 'draft', 1);
    CREATE TABLE invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL, line_no integer NOT NULL,
      description text, amount numeric NOT NULL CHECK (amount > 0), category_code text);
    -- Production's numbers each invoice in its month under a lock; here, one after another.
    CREATE FUNCTION mint_invoice_no(p_period date) RETURNS text LANGUAGE sql
      AS $$ SELECT 'HV-INV-' || to_char(p_period, 'YYYYMM') || '-' || lpad((SELECT count(*) + 90 FROM invoices)::text, 4, '0') $$;
    CREATE TABLE period_locks(period_month date PRIMARY KEY, is_locked boolean NOT NULL DEFAULT true);
    CREATE TABLE payment_vouchers(id uuid PRIMARY KEY, voucher_no text, status text NOT NULL, direction text NOT NULL DEFAULT 'debit');
    INSERT INTO payment_vouchers VALUES ('${PV}', 'HV-PV-202610-0700', 'draft', 'debit'), ('${PV2}', 'HV-PV-202610-0701', 'draft', 'debit');
    -- The voucher's lines: the Canva plan booked to Software (9087) on the first, to Printing (9031) on the second.
    CREATE TABLE payment_voucher_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL, pool text,
      account_code text, amount numeric);
    INSERT INTO payment_voucher_sources (voucher_id, pool, account_code, amount) VALUES
      ('${PV}', 'dept_pool_hr', '9087', 250), ('${PV2}', 'dept_pool_hr', '9031', 250);
    -- The tab registry's copy and the templates' stored ticks.
    CREATE TABLE permission_page_tabs(page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));
    INSERT INTO permission_page_tabs VALUES ('/claims', 'pri.claims'), ('/claims', 'dept.my_claims'), ('/claims', 'mkt.my_claims');
    CREATE TABLE permission_tab_cells(tab_id text NOT NULL, action text NOT NULL, cell text NOT NULL, PRIMARY KEY (tab_id, action, cell));
    CREATE TABLE permission_templates(id uuid PRIMARY KEY, key text UNIQUE NOT NULL, version integer NOT NULL DEFAULT 1, updated_at timestamptz);
    INSERT INTO permission_templates (id, key) VALUES ('${T_HR}', 'hr'), ('${T_MAKER}', 'fin_maker');
    CREATE TABLE permission_template_tabs(template_id uuid NOT NULL, tab_id text NOT NULL, action text NOT NULL,
      PRIMARY KEY (template_id, tab_id, action));
    INSERT INTO permission_template_tabs VALUES ('${T_HR}', 'hr.payroll', 'view'), ('${T_HR}', 'dept.my_claims', 'view'),
      ('${T_HR}', 'dept.my_claims', 'create');
    CREATE TABLE access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, resource_type text,
      resource_id text, action text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());

    CREATE TABLE file_buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[], backend text);
    CREATE TABLE file_objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
      owner_id text, metadata jsonb, UNIQUE (bucket_id, name));
    ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, DELETE ON file_objects TO authenticated;
  `)

  // ── The migration, verbatim — and again, which changes nothing ───────────
  const migration = await migrationText('20261029180000_payment_requests')
  await db.exec(migration)
  await db.exec(migration)
  check(await q(`SELECT id, public, backend FROM file_buckets`), [{ id: 'payment-request-files', public: false, backend: 'r2' }],
    'the bucket is private and on R2')
  check(await q(`SELECT table_name, mode FROM audit_lines ORDER BY table_name`), [
    { table_name: 'payment_request_files', mode: 'none' }, { table_name: 'payment_request_items', mode: 'none' },
    { table_name: 'payment_request_shares', mode: 'all' }, { table_name: 'payment_requests', mode: 'all' },
  ], 'every table has its audit line')
  check(await q(`SELECT tab_id FROM permission_page_tabs WHERE page = '/claims' ORDER BY tab_id`).then(r => r.map(x => x.tab_id)),
    ['dept.my_claims', 'fin.my_claims', 'hr.my_claims', 'mkt.my_claims', 'pri.claims'], 'Claim opens from the HR and Finance views too')
  check(await q(`SELECT tab_id || '.' || action AS box FROM permission_tab_cells WHERE tab_id IN ('hr.my_claims', 'fin.my_claims') ORDER BY 1`)
    .then(r => r.map(x => x.box)), ['fin.my_claims.create', 'fin.my_claims.edit', 'fin.my_claims.view', 'hr.my_claims.create',
    'hr.my_claims.edit', 'hr.my_claims.view'], '…each box standing for one’s own claims, as the other views’')
  check(await q(`SELECT t.key, x.tab_id || '.' || x.action AS box FROM permission_template_tabs x JOIN permission_templates t ON t.id = x.template_id
                  WHERE x.tab_id LIKE '%my_claims' ORDER BY 1, 2`).then(r => r.map(x => `${x.key} ${x.box}`)),
    ['hr dept.my_claims.create', 'hr dept.my_claims.view', 'hr hr.my_claims.create', 'hr hr.my_claims.view'],
    'HR · Payroll’s stored ticks gain the HR view’s Claim — the cells it holds; a template with none stored is left to its cells')
  check(await q(`SELECT key, version FROM permission_templates ORDER BY key`), [{ key: 'fin_maker', version: 1 }, { key: 'hr', version: 3 }],
    'an editor left open on HR · Payroll saves over nothing it did not see')
  await as(KHO)
  await reject('SELECT * FROM payment_requests', [], /permission denied/, 'the tables are the functions’ alone')

  // ── Who may send ──────────────────────────────────────────────────────────
  await as(OUTSIDER)
  await reject('SELECT payment_request_context()', [], /Claim is not open to your account/, 'an account without Claim')
  await as(NOBODY)
  await reject('SELECT payment_request_context()', [], /not on a People record yet/, 'a login HR never linked')
  await as(KHO)
  const ctx = await one('SELECT payment_request_context()')
  check([ctx.name, ctx.departmentName, ctx.pool, ctx.salaryAccount], ['KHO WEI JIE', 'Marketing', 'dept_pool_marketing', { bank: 'Hong Leong Bank', last4: '4821' }],
    'the window knows who, the department’s pool and the salary account’s last four')
  check(ctx.departments.map(d => d.name), ['Finance', 'HR'], 'a share may name any other department but the office’s own and the directors’')
  check(ctx.companies.map(c => c.name), ['Dream Crafter'], '…or an active company')

  // ── A draft, and what Submit asks ─────────────────────────────────────────
  const r1 = await upload(KHO, 'Receipt-2932.pdf')
  await as(KHO)
  let req = await save(null, claimData([r1]))
  check([req.status, req.requestNo, req.total, req.description, req.files.length, req.pool],
    ['draft', null, 779.58, 'Claude · Oct · Jian Ying', 1, 'dept_pool_marketing'], 'a draft keeps what was typed, its total and its words')
  const draft = req.id
  const elsewhere = await upload(LI, 'not-mine.pdf')
  await as(KHO)
  await reject('SELECT payment_request_save($1, $2::jsonb, false)', [draft, JSON.stringify(claimData([elsewhere]))],
    /did not finish uploading/, 'a file from somebody else’s folder is refused')
  await reject('SELECT payment_request_save($1, $2::jsonb, false)', [draft, JSON.stringify(claimData([r1]))],
    /on a request already/, 'a file is filed once')
  await reject('SELECT payment_request_save($1, $2::jsonb, false)', [null, JSON.stringify({ ...claimData([]), kind: 'gift' })],
    /Pick what it is/, 'a request is a claim or a direct pay')
  await reject('SELECT payment_request_save($1, $2::jsonb, true)', [draft, JSON.stringify(claimData([], { items: [{ description: '', amount: '12' }] }))],
    /Every item needs its words and an amount/, 'Submit asks each item’s words')
  await reject('SELECT payment_request_save($1, $2::jsonb, true)', [draft, JSON.stringify(claimData([], { items: [] }))],
    /at least one item/, 'Submit asks for an item')
  await reject('SELECT payment_request_save($1, $2::jsonb, true)', [draft, JSON.stringify(claimData([], { shares: [{ party: 'company', companyId: DREAM, amount: '779.58' }] }))],
    /must be less than the RM 779.58 total/, 'a split leaves the department its part')
  await reject('SELECT payment_request_save($1, $2::jsonb, true)', [draft, JSON.stringify(claimData([], { shares: [{ party: 'department', departmentId: MKT, amount: '10' }] }))],
    /your own pays the rest/, 'a share is never one’s own department')
  await reject('SELECT payment_request_save($1, $2::jsonb, true)', [draft, JSON.stringify(claimData([], { shares: [{ party: 'company', companyId: OLD_CO, amount: '10' }] }))],
    /Pick a company from the list/, 'nor a closed company')
  check(await one(`SELECT status FROM payment_requests WHERE id = $1`, [draft]).catch(() => 'hidden'), 'hidden', 'what was refused never reached the table as KHO')
  await as(null, null)
  check(await one(`SELECT status FROM payment_requests WHERE id = $1`, [draft]), 'draft', 'a refused Submit leaves the draft as it was')

  // LI has no salary account on file: a claim into it cannot go; another account can.
  const r2 = await upload(LI, 'Canva-invoice-Oct.pdf')
  await as(LI)
  await reject('SELECT payment_request_save($1, $2::jsonb, true)', [null, JSON.stringify(claimData([r2], { items: [{ description: 'Canva team plan · Oct', amount: '250' }] }))],
    /HR has no salary account for you/, 'a claim into a salary account HR does not have')
  req = await save(null, claimData([r2], {
    payTo: { salary: false, bank: 'Public Bank', accountNo: '3-1874502-10' },
    items: [{ description: 'Canva team plan · Oct', amount: '250' }],
    shares: [{ party: 'department', departmentId: MKT, amount: '100' }],
  }), true)
  check([req.status, req.requestNo, req.payeeName, req.payeeBank, req.payeeAccount, req.shares.map(s => [s.departmentName, s.amount, s.billBack])],
    ['with_finance', 'PRQ-' + req.requestNo.slice(4, 8) + '-0001', 'LI SEAN', 'Public Bank', '3187450210', [['Marketing', 100, null]]],
    'sent: numbered, to Finance, paid into the account she gave, its share waiting for Finance’s answer')
  const liReq = req.id

  // KHO sends his draft: the salary account is snapshot as it is today.
  await as(KHO)
  req = await save(draft, { ...claimData([]), removeFiles: [] }, true)
  check([req.status, req.requestNo.slice(-4), req.payeeBank, req.payeeAccount], ['with_finance', '0002', 'Hong Leong Bank', '12345674821'],
    'his salary account kept on the request, whole for him')
  await as(null, null)
  await q(`UPDATE hr_staff_costs SET bank_account_no = '9999' WHERE user_id = $1`, [KHO])
  await as(KHO)
  check((await one('SELECT my_payment_requests()')).map(x => x.payeeAccount), ['12345674821'], 'HR changing the account later leaves the sent one as it was')
  await reject('SELECT payment_request_save($1, $2::jsonb, false)', [draft, JSON.stringify(claimData([]))],
    /with Finance — it can no longer be changed/, 'a sent request is not edited')
  await as(LI)
  check((await one('SELECT my_payment_requests()')).map(x => x.id), [liReq], 'each sees only their own')

  // ── Finance's list ────────────────────────────────────────────────────────
  await as(KHO)
  await reject('SELECT payment_requests_for_finance()', [], /Finance’s|Finance's/, 'a staff account does not read Finance’s list')
  await as(MAKER)
  let list = await one('SELECT payment_requests_for_finance()')
  check(list.map(x => [x.requesterName, x.payeeAccount]), [['LI SEAN', '•••• 0210'], ['KHO WEI JIE', '•••• 4821']],
    'oldest first; an account as its last four without the Bank tick')
  await as(FIN)
  list = await one('SELECT payment_requests_for_finance()')
  check(list.map(x => x.payeeAccount), ['3187450210', '12345674821'], 'whole with it')

  // ── Reject, fix, send again ───────────────────────────────────────────────
  await as(MAKER)
  await reject('SELECT payment_request_reject($1, $2)', [liReq, 'Wrong share'], /needs Treasury · Void or Approve/, 'a Maker does not reject')
  await as(null, null)
  await q(`INSERT INTO closed_pages VALUES ($1, '/payments/requests')`, [FIN])
  await as(FIN)
  await reject('SELECT payment_request_reject($1, $2)', [liReq, 'Wrong share'], /a box in your permissions is unticked/, 'the page’s box unticked closes it')
  await as(null, null)
  await q(`DELETE FROM closed_pages`)
  await as(FIN)
  await reject('SELECT payment_request_reject($1, $2)', [liReq, '  '], /Say why/, 'a reason is required')
  const firstShare = (await one('SELECT payment_requests_for_finance()')).find(x => x.id === liReq).shares[0].id
  await q('SELECT payment_request_bill_back($1, true)', [firstShare])
  await q('SELECT payment_request_reject($1, $2)', [liReq, 'Marketing says 80, not 100'])
  await as(LI)
  req = (await one('SELECT my_payment_requests()'))[0]
  check([req.status, req.rejectReason, req.rejectedByName, req.shares[0].billBack], ['rejected', 'Marketing says 80, not 100', 'Finance Manager', null],
    'she reads why, and Finance answers the share afresh once it is fixed')
  req = await save(liReq, { ...claimData([], {
    payTo: { salary: false, bank: 'Public Bank', accountNo: '3-1874502-10' },
    items: [{ description: 'Canva team plan · Oct', amount: '250' }],
    shares: [{ party: 'department', departmentId: MKT, amount: '80' }] }) })
  check([req.status, req.rejectReason], ['rejected', 'Marketing says 80, not 100'], 'fixed but not sent: still rejected, the reason with it')
  req = await save(liReq, { ...claimData([], {
    payTo: { salary: false, bank: 'Public Bank', accountNo: '3-1874502-10' },
    items: [{ description: 'Canva team plan · Oct', amount: '250' }],
    shares: [{ party: 'department', departmentId: MKT, amount: '80' }] }) }, true)
  check([req.status, req.requestNo.slice(-4), req.rejectReason, req.shares[0].amount], ['with_finance', '0001', null, 80],
    'sent again: the same number, the reason gone')

  // ── Create PV ─────────────────────────────────────────────────────────────
  await as(KHO)
  await reject('SELECT payment_requests_for_pv($1)', [[liReq]], /needs Treasury · Create/, 'a staff account makes no voucher')
  await as(FIN)
  await reject('SELECT payment_requests_for_pv($1)', [[liReq]], /Answer Bill back\? for every share first/, 'every share answered first')
  await reject('SELECT payment_requests_for_pv($1)', [[liReq, draft]], /one payee into one account/, 'one voucher, one payee')
  const share = await one('SELECT id FROM payment_request_shares WHERE request_id = $1', [liReq]).catch(() => null)
  check(share, null, 'Finance reads the tables only through the functions')
  const liShare = (await one('SELECT payment_requests_for_finance()')).find(x => x.id === liReq).shares[0].id
  await q('SELECT payment_request_bill_back($1, true)', [liShare])
  const forPv = await one('SELECT payment_requests_for_pv($1)', [[liReq]])
  check([forPv.requests.length, forPv.files.map(f => f.name)], [1, ['Canva-invoice-Oct.pdf']], 'what the voucher needs: the request and its files to carry')
  const attach = (pv, bill) => q('SELECT payment_requests_attach_pv($1, $2, $3::jsonb)', [[liReq], pv, JSON.stringify(bill)])
  // How many invoices there are (read as the database itself — the next step says whose it is).
  const invoices = async () => {
    await as(null, null)
    return q(`SELECT count(*)::int AS n FROM invoices`).then(r => r[0].n)
  }
  // A Maker makes vouchers but no invoices: the Yes share stops it before anything is written.
  await as(MAKER)
  await reject('SELECT payment_requests_attach_pv($1, $2, $3::jsonb)', [[liReq], PV, JSON.stringify([{ share: liShare, category: '9087' }])],
    /Billing back needs Invoice · Create/, 'a bill back asks Invoice · Create')
  await as(FIN)
  await reject('SELECT payment_requests_attach_pv($1, $2, $3::jsonb)', [[liReq], PV, '[]'], /no category from the voucher/, 'its category is asked')
  await reject('SELECT payment_requests_attach_pv($1, $2, $3::jsonb)', [[liReq], PV, JSON.stringify([{ share: liShare, category: '9031' }])],
    /no category from the voucher/, '…one of this voucher’s lines’')
  await as(null, null)
  await q(`INSERT INTO period_locks (period_month) VALUES (date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::date)`)
  await as(FIN)
  await reject('SELECT payment_requests_attach_pv($1, $2, $3::jsonb)', [[liReq], PV, JSON.stringify([{ share: liShare, category: '9087' }])],
    /is closed — its invoices cannot be drafted/, 'never in a closed month')
  await as(null, null)
  await q(`DELETE FROM period_locks`)
  check([await one('SELECT status FROM payment_requests WHERE id = $1', [liReq]), await invoices()], ['with_finance', 1],
    'each refusal left the request with Finance and drafted nothing')
  await as(FIN)
  const tied = (await attach(PV, [{ share: liShare, category: '9087' }]))[0].payment_requests_attach_pv
  check(tied.invoices.map(i => [i.share, i.invoiceNo]), [[liShare, 'HV-INV-' + tied.invoices[0].invoiceNo.slice(7, 13) + '-0091']],
    'tied to the voucher, the Yes share’s invoice drafted with it')
  await as(null, null)
  check(await q(`SELECT i.status, i.billing_mode::text AS mode, i.billable_to_type::text AS kind, i.billable_to_department_id AS dept, i.company_id,
                        i.total_amount::float AS total, i.reference_no, i.category_code, l.category_code AS line_category, l.amount::float AS line_amount,
                        l.description, i.created_by
                   FROM invoices i JOIN invoice_lines l ON l.invoice_id = i.id WHERE i.id = $1`, [tied.invoices[0].invoiceId]), [{
    status: 'draft', mode: 'hr_attribution', kind: 'dept_pool', dept: MKT, company_id: null, total: 80, reference_no: req.requestNo,
    category_code: null, line_category: '9087', line_amount: 80, description: 'Canva team plan · Oct', created_by: FIN,
  }], 'a DRAFT to Marketing for its share, in HR’s mode (HR’s pool has it back), its line credited to the voucher line’s account')
  await as(FIN)
  await reject('SELECT payment_requests_attach_pv($1, $2, $3::jsonb)', [[liReq], PV2, '[]'], /no longer waiting for Finance/, 'a request goes into one voucher')
  await reject('SELECT payment_request_reject($1, $2)', [liReq, 'late'], /not waiting for Finance/, 'nor is it rejected once in a voucher')
  await as(MAKER)
  await reject('SELECT payment_request_reject($1, $2)', [liReq, 'late'], /needs Treasury/, 'nor by a Maker')
  await as(LI)
  req = (await one('SELECT my_payment_requests()'))[0]
  check([req.status, req.pvNo, req.shares[0].invoiceNo, req.shares[0].invoiceStatus], ['in_pv', 'HV-PV-202610-0700', tied.invoices[0].invoiceNo, 'draft'],
    'she sees it in a voucher, and its share billed back')
  await reject('SELECT payment_request_cancel($1)', [liReq], /ask Finance to void it first/, 'it is not cancelled once in a voucher')

  // The voucher moves: paid → paid; voided → back with Finance; a draft deleted → the same.
  await as(null, null)
  await q(`UPDATE payment_vouchers SET status = 'pending_approval' WHERE id = $1`, [PV])
  check(await one('SELECT status FROM payment_requests WHERE id = $1', [liReq]), 'in_pv', 'waiting for the Principal, still in the voucher')
  await q(`UPDATE payment_vouchers SET status = 'paid' WHERE id = $1`, [PV])
  check(await one('SELECT status FROM payment_requests WHERE id = $1', [liReq]), 'paid', 'paid with its voucher')
  await q(`UPDATE payment_vouchers SET status = 'voided' WHERE id = $1`, [PV])
  check(await q('SELECT status, pv_id FROM payment_requests WHERE id = $1', [liReq]), [{ status: 'with_finance', pv_id: null }],
    'a voided voucher puts it back with Finance')
  await as(FIN)
  await reject('SELECT payment_request_bill_back($1, false)', [liShare], /drafted already — void it in Invoice/, 'its drafted invoice holds its answer')
  check((await attach(PV2, []))[0].payment_requests_attach_pv.invoices, [], 'in the next voucher its invoice is the one already drafted')
  check(await invoices(), 2, '…none drafted twice')
  await as(null, null)
  await q(`DELETE FROM payment_vouchers WHERE id = $1`, [PV2])
  check(await q('SELECT status, pv_id FROM payment_requests WHERE id = $1', [liReq]), [{ status: 'with_finance', pv_id: null }],
    'a deleted draft voucher too')
  // Finance voided that invoice in Invoice: it counts as none, so the share is answered again and drafted afresh.
  await q(`UPDATE invoices SET status = 'voided' WHERE id = $1`, [tied.invoices[0].invoiceId])
  await q(`INSERT INTO payment_vouchers VALUES ($1, 'HV-PV-202610-0702', 'draft', 'debit')`, [PV2])
  await as(FIN)
  await q('SELECT payment_request_bill_back($1, true)', [liShare])
  check((await attach(PV2, [{ share: liShare, category: '9031' }]))[0].payment_requests_attach_pv.invoices.length, 1,
    'a voided invoice is drafted again')
  await as(null, null)
  await q(`UPDATE payment_vouchers SET status = 'voided' WHERE id = $1`, [PV2])

  // ── Cancel ────────────────────────────────────────────────────────────────
  await as(KHO)
  await reject('SELECT payment_request_cancel($1)', [liReq], /Request not found/, 'only one’s own')
  req = await one('SELECT payment_request_cancel($1)', [draft])
  check(req.status, 'cancelled', 'withdrawn while Finance has no voucher for it')

  // ── The files ─────────────────────────────────────────────────────────────
  await as(FIN)
  check(await q(`SELECT name FROM file_objects WHERE name = $1`, [r2.path]).then(r => r.length), 1, 'Finance reads a sent request’s file')
  check(await q(`SELECT name FROM file_objects WHERE name = $1`, [r1.path]).then(r => r.length), 0, '…not a cancelled one’s')
  const stray = await upload(KHO, 'stray.pdf')
  await as(FIN)
  check(await q(`SELECT name FROM file_objects WHERE name = $1`, [stray.path]).then(r => r.length), 0, '…nor an upload nobody filed')
  await as(KHO)
  check(await q(`SELECT name FROM file_objects WHERE name = $1`, [stray.path]).then(r => r.length), 1, 'the uploader reads their own')
  check(await q(`SELECT name FROM file_objects WHERE name = $1`, [r2.path]).then(r => r.length), 0, 'nobody else’s')
  await reject(`INSERT INTO file_objects (bucket_id, name, metadata) VALUES ('payment-request-files', $1, '{}')`, [`${LI}/x/y.pdf`],
    /row-level security/, 'an upload goes into one’s own folder only')
  await q(`DELETE FROM file_objects WHERE name = $1`, [r1.path])
  await as(null, null)
  check(await one(`SELECT count(*)::int FROM file_objects WHERE name = $1`, [r1.path]), 1, 'a filed file is not removed by its uploader')
  await as(KHO)
  await q(`DELETE FROM file_objects WHERE name = $1`, [stray.path])
  await as(null, null)
  check(await one(`SELECT count(*)::int FROM file_objects WHERE name = $1`, [stray.path]), 0, 'an unfiled one is')
  await as(LI)
  check((await one('SELECT payment_request_file(id) FROM (SELECT ($1::jsonb -> 0 -> $2 -> 0 ->> $3)::uuid AS id) x',
    [JSON.stringify(await one('SELECT my_payment_requests()')), 'files', 'id'])).name, 'Canva-invoice-Oct.pdf', 'the requester opens her file')
  await as(OUTSIDER)
  await reject('SELECT payment_request_file($1)', [id(999)], /File not found/, 'nobody else does')

  console.log(`Payment request checks passed: ${checks}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await db.close()
}

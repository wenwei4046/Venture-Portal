// Local PostgreSQL regression for a department's approval before Finance (2026-10-29, PR ③ of
// docs/module-spec-payment-requests.md): the By management approve tick (a title's template, a person over it), who
// holds Claim & approve in a department, Submit's routing, the approver's reads, files, Approve and Reject, the
// notices, Marketing's bell and number, and what is seeded. PR ②'s migration runs first, then PR ③'s VERBATIM
// (twice), against a synthetic surrounding schema. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0] ?? { none: null })[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const SIA = id(1) // Marketing Manager (Marketing · Manager): Claim & approve
const KHO = id(2) // Assistant Marketing Manager (Marketing · Manager) whose own Claims · Approve is taken off
const CHIN = id(3) // Marketing · Staff: ticked by the template
const JOEY = id(4) // Marketing · Staff, unticked for herself
const LI = id(5) // HR · Payroll, ticked for himself — HR has nobody to approve
const FIN = id(6) // Finance Manager: Treasury, Invoice · Create
const ADMIN = id(7) // manages permissions
const MKT = id(10)
const HR = id(11)
const FINANCE = id(12)
const T_MGR = id(20)
const T_STAFF = id(21)
const T_HR = id(22)
const TI_MGR = id(30)
const TI_STAFF = id(31)
const TI_HR = id(32)
const PV = id(40)

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

async function upload(user, name) {
  await as(null, null)
  const path = `${user}/${id(Math.floor(Math.random() * 1e9))}/${name}`
  await q(`INSERT INTO file_objects (bucket_id, name, metadata) VALUES ('payment-request-files', $1, '{"size": 900, "mimetype": "application/pdf"}')`, [path])
  return { path, name, contentType: 'application/pdf', size: 900 }
}

/** A claim sent (or saved) by `user`: one item, a receipt, paid into a typed account. */
async function send(user, what, amount, submit = true) {
  const file = await upload(user, `${what}.pdf`)
  await as(user)
  return one('SELECT payment_request_save(NULL, $1::jsonb, $2)', [JSON.stringify({
    kind: 'claim', payTo: { salary: false, bank: 'Public Bank', accountNo: '3187450210' },
    items: [{ description: what, amount }], shares: [], files: [file],
  }), submit])
}

const notices = async user => {
  await as(null, null)
  return q(`SELECT kind, ref_kind, ref_id, title, body FROM app_notifications WHERE user_id = $1 ORDER BY created_at, title`, [user])
}
const statusOf = async request => {
  await as(null, null)
  return one('SELECT status FROM payment_requests WHERE id = $1', [request])
}

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
    INSERT INTO users(id, role, name) VALUES ('${SIA}', 'staff', 'SIA JOSIAH'), ('${KHO}', 'staff', 'KHO WEI JIE'),
      ('${CHIN}', 'staff', 'CHIN YEE RU'), ('${JOEY}', 'staff', 'WONG JOEY'), ('${LI}', 'hr', 'LI SEAN'),
      ('${FIN}', 'finance', 'Finance Manager'), ('${ADMIN}', 'principal', 'Principal');
    -- The cells each account holds, at their reach — what current_actions() answers for them.
    CREATE TABLE grants(user_id uuid NOT NULL, cell text NOT NULL, scope text NOT NULL DEFAULT 'own');
    INSERT INTO grants VALUES
      ('${SIA}', 'claims.view', 'dept'), ('${SIA}', 'claims.create', 'own'), ('${SIA}', 'claims.approve', 'dept'),
      ('${KHO}', 'claims.view', 'dept'), ('${KHO}', 'claims.create', 'own'),
      ('${CHIN}', 'claims.view', 'own'), ('${CHIN}', 'claims.create', 'own'),
      ('${JOEY}', 'claims.view', 'own'), ('${JOEY}', 'claims.create', 'own'),
      ('${LI}', 'claims.view', 'own'), ('${LI}', 'claims.create', 'own'),
      ('${FIN}', 'treasury.view', 'all'), ('${FIN}', 'treasury.create', 'all'), ('${FIN}', 'treasury.void', 'all'),
      ('${FIN}', 'treasury.approve', 'all'), ('${FIN}', 'billing.create', 'all');
    CREATE TABLE perms(user_id uuid NOT NULL, key text NOT NULL);
    INSERT INTO perms VALUES ('${ADMIN}', 'permissions_manage'), ('${FIN}', 'treasury');
    CREATE TABLE closed_pages(user_id uuid NOT NULL, page text NOT NULL);
    CREATE FUNCTION has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      AS $$ SELECT EXISTS (SELECT 1 FROM grants g, unnest(p_wants) w
              WHERE g.user_id = auth.uid() AND g.cell = split_part(w, ':', 1)
                AND array_position(ARRAY['own', 'dept', 'all'], g.scope)
                    >= array_position(ARRAY['own', 'dept', 'all'], coalesce(nullif(split_part(w, ':', 2), ''), 'all'))) $$;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      AS $$ SELECT EXISTS (SELECT 1 FROM perms p WHERE p.user_id = auth.uid() AND p.key = $1) $$;
    CREATE FUNCTION sees_sensitive(p_field text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM closed_pages c WHERE c.user_id = auth.uid() AND c.page = ANY (p_pages)) THEN
        RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked' USING ERRCODE = '42501';
      END IF;
    END $$;
    CREATE TABLE audit_lines(table_name text PRIMARY KEY, mode text);
    CREATE FUNCTION audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS text LANGUAGE sql
      AS $$ INSERT INTO audit_lines VALUES (p_table, p_mode) ON CONFLICT (table_name) DO UPDATE SET mode = excluded.mode RETURNING mode $$;
    CREATE TABLE permission_table_reads(table_name text PRIMARY KEY, actions text[] NOT NULL);
    CREATE TABLE reads_guarded(table_name text PRIMARY KEY);
    CREATE FUNCTION permission_reads_guard(p_table text) RETURNS integer LANGUAGE sql
      AS $$ INSERT INTO reads_guarded VALUES (p_table) ON CONFLICT DO NOTHING RETURNING 1 $$;

    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL, segment_key text, billing_mode_key text,
      is_internal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO departments(id, name, segment_key, billing_mode_key) VALUES
      ('${MKT}', 'Marketing', 'marketing', 'marketing_project'), ('${HR}', 'HR', 'hr', 'hr_attribution'),
      ('${FINANCE}', 'Finance', 'finance', 'finance_attribution');
    CREATE TABLE permission_templates(id uuid PRIMARY KEY, key text UNIQUE NOT NULL, version integer NOT NULL DEFAULT 1, updated_at timestamptz);
    INSERT INTO permission_templates (id, key) VALUES ('${T_MGR}', 'mkt_manager'), ('${T_STAFF}', 'mkt_staff'), ('${T_HR}', 'hr');
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, template_id uuid);
    INSERT INTO titles VALUES ('${TI_MGR}', 'MARKETING MANAGER', '${T_MGR}'), ('${TI_STAFF}', 'CONTENT CREATOR', '${T_STAFF}'),
      ('${TI_HR}', 'HR EXECUTIVE', '${T_HR}');
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, employee_name text NOT NULL,
      department_id uuid NOT NULL, title_id uuid, status text NOT NULL DEFAULT 'active', bank_name text, bank_account_no text,
      created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO hr_staff_costs(user_id, employee_name, department_id, title_id) VALUES
      ('${SIA}', 'SIA JOSIAH', '${MKT}', '${TI_MGR}'), ('${KHO}', 'KHO WEI JIE', '${MKT}', '${TI_MGR}'),
      ('${CHIN}', 'CHIN YEE RU', '${MKT}', '${TI_STAFF}'), ('${JOEY}', 'WONG JOEY', '${MKT}', '${TI_STAFF}'),
      ('${LI}', 'LI SEAN', '${HR}', '${TI_HR}'), ('${FIN}', 'FINANCE MANAGER', '${FINANCE}', NULL);
    -- The templates' boxes and cells as production keeps them; one person's own cell taken off.
    CREATE TABLE permission_template_tabs(template_id uuid NOT NULL, tab_id text NOT NULL, action text NOT NULL,
      PRIMARY KEY (template_id, tab_id, action));
    INSERT INTO permission_template_tabs VALUES ('${T_MGR}', 'mkt.my_claims', 'view'), ('${T_MGR}', 'mkt.my_claims', 'create'),
      ('${T_STAFF}', 'mkt.my_claims', 'view'), ('${T_STAFF}', 'mkt.my_claims', 'create'), ('${T_HR}', 'dept.my_claims', 'view');
    CREATE TABLE permission_template_grants(template_id uuid NOT NULL, function_key text NOT NULL, action text NOT NULL, scope text,
      PRIMARY KEY (template_id, function_key, action));
    INSERT INTO permission_template_grants VALUES ('${T_MGR}', 'claims', 'view', 'own'), ('${T_MGR}', 'claims', 'create', 'own'),
      ('${T_STAFF}', 'claims', 'view', 'own'), ('${T_STAFF}', 'claims', 'create', 'own'), ('${T_HR}', 'claims', 'view', 'own');
    CREATE TABLE user_permission_cells(user_id uuid NOT NULL, function_key text NOT NULL, action text NOT NULL, scope text,
      PRIMARY KEY (user_id, function_key, action));
    INSERT INTO user_permission_cells VALUES ('${KHO}', 'claims', 'approve', NULL);
    CREATE TABLE permission_page_tabs(page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));
    INSERT INTO permission_page_tabs VALUES ('/claims', 'pri.claims'), ('/claims', 'dept.my_claims'), ('/claims', 'mkt.my_claims');
    CREATE TABLE permission_tab_cells(tab_id text NOT NULL, action text NOT NULL, cell text NOT NULL, PRIMARY KEY (tab_id, action, cell));
    CREATE TABLE access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, resource_type text,
      resource_id text, action text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());

    CREATE TABLE companies(id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true);
    CREATE TYPE billing_mode AS ENUM ('marketing_project', 'hr_attribution', 'finance_attribution');
    CREATE TYPE billable_to_kind AS ENUM ('subsidiary', 'dept_pool');
    CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_no text, period_month date, billing_mode billing_mode,
      category_code text, base_amount numeric, total_amount numeric, status text NOT NULL DEFAULT 'draft',
      invoice_date date, due_date date, description text, reference_no text, created_by uuid, billable_to_type billable_to_kind,
      company_id uuid, billable_to_department_id uuid);
    CREATE TABLE invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL, line_no integer NOT NULL,
      description text, amount numeric NOT NULL, category_code text);
    CREATE FUNCTION mint_invoice_no(p_period date) RETURNS text LANGUAGE sql AS $$ SELECT 'HV-INV-X' $$;
    CREATE TABLE period_locks(period_month date PRIMARY KEY, is_locked boolean NOT NULL DEFAULT true);
    CREATE TABLE payment_vouchers(id uuid PRIMARY KEY, voucher_no text, status text NOT NULL, direction text NOT NULL DEFAULT 'debit');
    INSERT INTO payment_vouchers VALUES ('${PV}', 'HV-PV-202610-0710', 'draft', 'debit');
    CREATE TABLE payment_voucher_sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), voucher_id uuid NOT NULL, pool text,
      account_code text, amount numeric);

    CREATE TABLE file_buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[], backend text);
    CREATE TABLE file_objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
      owner_id text, metadata jsonb, UNIQUE (bucket_id, name));
    ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, DELETE ON file_objects TO authenticated;

    -- The notices as production keeps them (mig 20261011180000 and the kinds added since).
    CREATE TABLE app_notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, kind text NOT NULL, title text NOT NULL,
      body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      read_at timestamptz, data jsonb,
      CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY['attendance', 'crm', 'hiring', 'marketing', 'review']::text[])),
      CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['booking', 'member_request', 'mkt_project']::text[])));
    CREATE FUNCTION notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      INSERT INTO app_notifications (user_id, kind, title, body, ref_kind, ref_id)
      SELECT u.id, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 400), p_ref_kind, p_ref_id
        FROM users u
       WHERE u.id IN (SELECT DISTINCT x FROM unnest(p_users) x WHERE x IS NOT NULL)
         AND u.is_active
         AND u.id IS DISTINCT FROM auth.uid();
    END $$;
    -- Marketing's bell and sidebar as production has them, only the statements PR ③ swaps.
    CREATE FUNCTION mkt_notices(p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
      END IF;
      RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'ref', n.ref_id,
                                          'at', n.created_at, 'read', n.read_at IS NOT NULL, 'data', n.data)
                                        ORDER BY n.created_at DESC, n.id)
                         FROM (SELECT * FROM public.app_notifications x
                                WHERE x.user_id = auth.uid() AND x.kind = 'marketing'
                                ORDER BY x.created_at DESC, x.id LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)) n), '[]'::jsonb);
    END $$;
    CREATE FUNCTION mkt_shell() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      RETURN jsonb_build_object(
        'counts', jsonb_build_object(
          'myspace', 0,
          'tracking', CASE WHEN false THEN 1 ELSE 0 END),
        'notices', (SELECT count(*) FROM public.app_notifications n
                     WHERE n.user_id = auth.uid() AND n.kind = 'marketing' AND n.read_at IS NULL));
    END $$;
    GRANT EXECUTE ON FUNCTION mkt_notices(integer), mkt_shell() TO authenticated;
  `)

  // ── PR ②, then PR ③ verbatim — and again, which changes nothing but the versions ──
  await db.exec(await migrationText('20261029180000_payment_requests'))
  const migration = await migrationText('20261029200000_payment_request_approval')
  await db.exec(migration)
  await db.exec(migration)

  check(await q(`SELECT tab_id FROM permission_page_tabs WHERE page = '/claims' AND tab_id LIKE '%claims_approve' ORDER BY 1`).then(r => r.map(x => x.tab_id)),
    ['dept.claims_approve', 'fin.claims_approve', 'hr.claims_approve', 'mkt.claims_approve'], 'Claim & approve opens /claims in every staff view')
  check(await q(`SELECT DISTINCT action || '→' || cell AS box FROM permission_tab_cells WHERE tab_id LIKE '%claims_approve' ORDER BY 1`).then(r => r.map(x => x.box)),
    ['approve→claims.approve', 'view→claims.view'], '…its View reads the claims, its Approve approves them')
  check(await q(`SELECT t.key, f.flag FROM permission_template_flags f JOIN permission_templates t ON t.id = f.template_id ORDER BY 1`),
    [{ key: 'mkt_staff', flag: 'claims_review' }], 'seeded: Marketing · Staff ticks By management approve')
  check(await q(`SELECT tab_id || '.' || action AS box FROM permission_template_tabs WHERE template_id = $1 ORDER BY 1`, [T_MGR]).then(r => r.map(x => x.box)),
    ['mkt.claims_approve.approve', 'mkt.claims_approve.view', 'mkt.my_claims.create', 'mkt.my_claims.view'], '…Marketing · Manager holds Claim & approve')
  check(await q(`SELECT action, scope FROM permission_template_grants WHERE template_id = $1 AND function_key = 'claims' ORDER BY 1`, [T_MGR]),
    [{ action: 'approve', scope: 'dept' }, { action: 'create', scope: 'own' }, { action: 'view', scope: 'dept' }],
    '…and the cells those boxes stand for: Claims · View and Approve at Dept')
  check(await q(`SELECT key, version FROM permission_templates ORDER BY key`),
    [{ key: 'hr', version: 2 }, { key: 'mkt_manager', version: 3 }, { key: 'mkt_staff', version: 3 }],
    'an editor left open on a changed template saves over nothing it did not see')
  check(await q(`SELECT table_name, mode FROM audit_lines WHERE table_name LIKE '%flags' ORDER BY 1`),
    [{ table_name: 'permission_template_flags', mode: 'all' }, { table_name: 'user_permission_flags', mode: 'all' }], 'both tick tables are audited')
  check(await one(`SELECT count(*)::int FROM reads_guarded WHERE table_name = 'user_permission_flags'`), 1, 'a person’s ticks are read as their boxes are')
  const kindsDef = await one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'app_notifications_kind_check'`)
  const refsDef = await one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'app_notifications_ref_kind_check'`)
  check(['attendance', 'crm', 'hiring', 'marketing', 'review', 'claims'].every(k => kindsDef.includes(`'${k}'`)), true, 'notices take the claims’ kind, every other kept')
  check(['booking', 'member_request', 'mkt_project', 'payment_request'].every(k => refsDef.includes(`'${k}'`)), true, '…and a payment request to open')

  // ── The tick: set by whoever manages permissions; the person wins ─────────
  await as(SIA)
  await reject(`SELECT permission_user_flags_set($1, '[]'::jsonb)`, [JOEY], /manages permissions/, 'only whoever manages permissions sets a person’s tick')
  await as(ADMIN)
  await reject(`SELECT permission_user_flags_set($1, '[{"flag":"salary","granted":true}]'::jsonb)`, [JOEY], /not a tick a person takes/, 'a tick by its name')
  await q(`SELECT permission_user_flags_set($1, '[{"flag":"claims_review","granted":false}]'::jsonb)`, [JOEY])
  await q(`SELECT permission_user_flags_set($1, '[{"flag":"claims_review","granted":true}]'::jsonb)`, [LI])
  await as(null, null)
  check(await q(`SELECT u.name, payment_request_review_of(u.id) AS review FROM users u ORDER BY u.name`).then(r => Object.fromEntries(r.map(x => [x.name, x.review]))),
    { 'CHIN YEE RU': true, 'Finance Manager': false, 'KHO WEI JIE': false, 'LI SEAN': true, Principal: false, 'SIA JOSIAH': false, 'WONG JOEY': false },
    'ticked from the template (Chin), unticked for herself (Joey), ticked for himself (Li)')
  await as(ADMIN)
  await reject(`SELECT permission_template_flags_set($1, 1, ARRAY['claims_review'])`, [T_HR], /saved this template since/, 'a template’s ticks over the version its window opened at')
  check(await one(`SELECT permission_template_flags_set($1, 3, ARRAY['claims_review'])`, [T_STAFF]), 3, 'the same ticks again: no new version')
  check(await one(`SELECT permission_template_flags_set($1, 2, ARRAY['claims_review'])`, [T_HR]), 3, 'a moved tick: a new version, answered')
  check(await one(`SELECT permission_template_flags_set($1, 3, '{}')`, [T_HR]), 4, '…and off again')

  // ── Who holds Claim & approve in a department ─────────────────────────────
  await as(null, null)
  check(await q(`SELECT name FROM payment_request_approvers($1)`, [MKT]).then(r => r.map(x => x.name)), ['SIA JOSIAH'],
    'Marketing’s: the Manager — not the Assistant Manager whose own Approve is taken off, not the staff')
  check(await q(`SELECT name FROM payment_request_approvers($1)`, [HR]), [], 'HR has nobody to approve')

  // ── The New request window says who approves first ────────────────────────
  await as(CHIN)
  check((await one('SELECT payment_request_context()')).reviewers, ['SIA JOSIAH'], 'a ticked staff member: the Manager approves first')
  await as(JOEY)
  check((await one('SELECT payment_request_context()')).reviewers, null, 'unticked for herself: straight to Finance')
  await as(SIA)
  check((await one('SELECT payment_request_context()')).reviewers, null, 'an approver’s own: straight to Finance')
  await as(LI)
  check((await one('SELECT payment_request_context()')).reviewers, null, 'ticked, but nobody in HR approves: straight to Finance, never stuck')

  // ── Submit routes it ──────────────────────────────────────────────────────
  const grab = await send(CHIN, 'Grab · client visit', '24.40')
  check([grab.status, grab.needsApproval, grab.reviewers], ['pending_approval', true, ['SIA JOSIAH']], 'Chin’s waits for Marketing’s approval, saying who')
  check(await notices(SIA), [{ kind: 'claims', ref_kind: 'payment_request', ref_id: grab.id, title: 'A claim to approve — CHIN YEE RU', body: 'RM 24.40 · Grab · client visit' }],
    '…and the Manager is told')
  check(await notices(CHIN), [], '…not the one who sent it')
  const joey = await send(JOEY, 'Canva · Oct', '50.00')
  check([joey.status, joey.needsApproval], ['with_finance', false], 'Joey’s goes straight to Finance')
  const sia = await send(SIA, 'Lunch · vendor', '80.00')
  check([sia.status, sia.needsApproval], ['with_finance', false], 'the Manager’s own goes straight to Finance')
  const li = await send(LI, 'Printer ink', '35.00')
  check(li.status, 'with_finance', 'Li’s goes straight to Finance — nobody in HR approves')
  await as(FIN)
  check((await one('SELECT payment_requests_for_finance()')).map(r => r.requestNo).sort(), [joey.requestNo, sia.requestNo, li.requestNo].sort(),
    'Finance sees what was sent to it, not what waits for approval')

  // ── The approver's reads ──────────────────────────────────────────────────
  await as(SIA)
  const mine = await one('SELECT payment_requests_for_approval()')
  check([mine.departmentName, mine.canApprove, mine.approvers.map(a => a.name)], ['Marketing', true, ['SIA JOSIAH']], 'Claim & approve: the department, may approve, who else approves')
  check(mine.requests.map(r => r.requesterName).sort(), ['CHIN YEE RU', 'SIA JOSIAH', 'WONG JOEY'], '…every sent request of Marketing, the Manager’s own among them — none of HR’s')
  check(mine.requests.find(r => r.id === grab.id).payeeAccount, '•••• 0210', '…an account as its last four without the Bank tick')
  check(await one('SELECT payment_requests_waiting_count()'), 1, 'one waits for the Manager')
  await as(KHO)
  check((await one('SELECT payment_requests_for_approval()')).canApprove, false, 'the Assistant Manager reads them, but may not approve')
  check(await one('SELECT payment_requests_waiting_count()'), 0, '…so nothing waits for him')
  await as(CHIN)
  await reject('SELECT payment_requests_for_approval()', [], /Claim & approve is not open/, 'a staff member reads only her own')
  check(await one('SELECT payment_requests_waiting_count()'), 0, '…and nothing waits for her')

  // …and their files.
  await as(SIA)
  const grabFile = await one('SELECT payment_request_file($1)', [grab.files[0].id])
  check(grabFile.name, 'Grab · client visit.pdf', 'the Manager opens a receipt of his department’s request')
  check(await one(`SELECT count(*)::int FROM file_objects WHERE name = $1`, [grabFile.path]), 1, '…its object readable to him through the bucket')
  await as(LI)
  await reject('SELECT payment_request_file($1)', [grab.files[0].id], /File not found/, 'another department’s staff opens none')
  check(await one(`SELECT count(*)::int FROM file_objects WHERE name = $1`, [grabFile.path]), 0, '…nor sees its object')

  // ── Approve ───────────────────────────────────────────────────────────────
  await as(KHO)
  await reject('SELECT payment_request_approve($1)', [[grab.id]], /needs Claim & approve/, 'reading is not approving')
  await as(SIA)
  await reject('SELECT payment_request_approve($1)', [[grab.id, sia.id]], /no longer waiting for your approval/, 'his own is not his to approve — the whole lot refused')
  check(await statusOf(grab.id), 'pending_approval', '…nothing approved')
  await as(SIA)
  check(await one('SELECT payment_request_approve($1)', [[grab.id]]), 1, 'approved')
  check(await statusOf(grab.id), 'with_finance', '…and with Finance now')
  await as(CHIN)
  const approved = (await one('SELECT my_payment_requests()')).find(r => r.id === grab.id)
  check([approved.approvedByName, approved.reviewers, typeof approved.approvedAt], ['SIA JOSIAH', null, 'string'], 'Chin sees who approved it, and when')
  check((await notices(CHIN)).map(n => [n.title, n.body]), [['Approved by SIA JOSIAH — with Finance now', `${grab.requestNo} · RM 24.40`]], '…and is told')
  await as(SIA)
  await reject('SELECT payment_request_approve($1)', [[grab.id]], /no longer waiting for your approval/, 'approved once')

  // ── Reject: back to its sender, who fixes it and sends it again ───────────
  const ktm = await send(CHIN, 'KTM Butterworth – KL Sentral', '111.00')
  const pad = await send(CHIN, 'Writing pad', '16.80')
  await as(SIA)
  await reject('SELECT payment_request_send_back($1, $2)', [[ktm.id, pad.id], '  '], /Say what to fix/, 'a reason she reads')
  check(await one('SELECT payment_request_send_back($1, $2)', [[ktm.id, pad.id], 'The receipts are for September']), 2, 'two sent back at once, one reason')
  await as(CHIN)
  const back = (await one('SELECT my_payment_requests()')).find(r => r.id === ktm.id)
  check([back.status, back.rejectedStage, back.rejectReason, back.rejectedByName], ['rejected', 'approval', 'The receipts are for September', 'SIA JOSIAH'],
    'rejected at the approval, the reason hers to read')
  check((await notices(CHIN)).filter(n => n.title.startsWith('Sent back')).length, 2, '…told of each')
  await as(CHIN)
  const again = await one('SELECT payment_request_save($1, $2::jsonb, true)', [ktm.id, JSON.stringify({
    kind: 'claim', payTo: { salary: false, bank: 'Public Bank', accountNo: '3187450210' },
    items: [{ description: 'KTM Butterworth – KL Sentral · Oct', amount: '111.00' }], shares: [], files: [],
  })])
  check([again.requestNo, again.status, again.rejectReason, again.approvedByName], [ktm.requestNo, 'pending_approval', null, null],
    'fixed and sent again under the same number — and it waits for approval again')

  // A notice never stops the work it tells of.
  await as(null, null)
  await q(`ALTER TABLE app_notifications ADD CONSTRAINT no_claims_today CHECK (kind <> 'claims') NOT VALID`)
  await as(SIA)
  check(await one('SELECT payment_request_approve($1)', [[ktm.id]]), 1, 'approved although its notice could not be written')
  await as(null, null)
  await q(`ALTER TABLE app_notifications DROP CONSTRAINT no_claims_today`)

  // ── Finance's reject and the paid voucher tell the sender ─────────────────
  await as(FIN)
  await q('SELECT payment_request_reject($1, $2)', [ktm.id, 'Add the bank charge in RM'])
  check((await notices(CHIN)).map(n => n.title).filter(t => t.startsWith('Rejected by Finance')), ['Rejected by Finance — fix it and send it again'], 'Finance’s reject is told')
  await as(FIN)
  await one('SELECT payment_requests_attach_pv($1, $2, $3::jsonb)', [[grab.id], PV, '[]'])
  await as(FIN, null)
  await q(`UPDATE payment_vouchers SET status = 'paid' WHERE id = $1`, [PV])
  check(await statusOf(grab.id), 'paid', 'paid with its voucher')
  check((await notices(CHIN)).filter(n => n.title.startsWith('Paid')).map(n => [n.title, n.body, n.ref_id]),
    [['Paid — HV-PV-202610-0710', `${grab.requestNo} was paid with HV-PV-202610-0710.`, grab.id]], '…and its sender told')

  // ── Marketing's bell and number ───────────────────────────────────────────
  await send(CHIN, 'Parking · Mid Valley', '12.00')
  await as(SIA)
  const bell = await one('SELECT mkt_notices(30)')
  check(bell.map(n => [n.refKind, n.ref]).filter(([k]) => k === 'payment_request').length >= 1, true, 'the Marketing bell lists the claims’ notices, each saying what it opens')
  const shell = await one('SELECT mkt_shell()')
  check([shell.counts.claims, shell.notices], [1, (await notices(SIA)).length], 'its sidebar counts what waits for him; its bell counts the claims’ unread too')

  console.log(`Payment request approval checks passed: ${checks}`)
} finally {
  await db.close()
}

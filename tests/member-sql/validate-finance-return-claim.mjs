// Local PostgreSQL regression for Finance › Payment request (2026-10-29, PR ①): a member's claim HR approved to be
// paid by Finance goes back to HR (Return to HR), and Finance opens its invoice only while the claim is Finance's to
// pay. The migration runs VERBATIM against a synthetic surrounding schema; notify_member_request and
// member_request_audit are production's bodies, from the migrations that last wrote them. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0] ?? { none: null })[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const HR = id(1)
const FIN = id(2) // Finance Manager: Treasury View, Create, Void, Approve
const MAKER = id(3) // Finance · Maker: Treasury View, Create, Edit
const PRINCIPAL = id(4)
const MEMBER = id(5)
const ANTHONY = id(30)
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

// The repo's own text, as production has it: LF line endings whatever this checkout's git turned them into (the
// migration's guard compares md5s).
const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

/** The LAST definition of a function in a migration — the one production runs when a file writes it more than once. */
async function productionFunction(migration, name) {
  const sql = await migrationText(migration)
  const re = new RegExp(`create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`, 'ig')
  const matches = [...sql.matchAll(re)]
  assert(matches.length, `Missing production function ${name}`)
  const match = matches[matches.length - 1]
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

let made = 0
/**
 * A member's claim as HR's Member services leaves it: by default approved to be paid by Finance, its invoice sent
 * (the attachment the request's invoiceHash names, its file in member-invoices).
 */
async function memberClaim({ status = 'approved', route = 'payment', requestStatus = 'approved', invoice = true, voucher = null } = {}) {
  await as(null, null)
  made++
  const hash = String(made).padStart(64, 'a')
  const claim = await one(
    `INSERT INTO claims(claim_type, claimant_name, amount, description, status, approved_by, approved_at, payout_route, source_pool, voucher_id, created_by)
     VALUES ('benefit', 'ANTHONY', 220, 'Airbnb · 2 pax × 1 night', $1::claim_status,
             CASE WHEN $1 <> 'pending' THEN $2::uuid END, CASE WHEN $1 <> 'pending' THEN now() END, $3, 'venture_pool', $4::uuid, $5::uuid)
     RETURNING id`,
    [status, HR, route, voucher, MEMBER],
  )
  const request = await one(
    `INSERT INTO member_requests(created_by, staff_id, kind, status, title, detail, claim_id, note, reviewed_by, reviewed_at, request_no, submitted_at)
     VALUES ($1, $2, 'claim', $3, 'Airbnb claim', $4::jsonb, $5, CASE WHEN $3 = 'approved' THEN 'Approved' END,
             CASE WHEN $3 = 'approved' THEN $6::uuid END, CASE WHEN $3 = 'approved' THEN now() END, $7, now())
     RETURNING id`,
    [MEMBER, ANTHONY, requestStatus, JSON.stringify(invoice ? { invoiceHash: hash, invoiceName: 'airbnb.pdf' } : {}), claim, HR,
      `RQ-2610-${String(made).padStart(3, '0')}`],
  )
  const path = `${MEMBER}/${request}/invoice-${made}.pdf`
  if (invoice) {
    await q(`INSERT INTO member_request_attachments(request_id, uploaded_by, object_path, mime_type, size_bytes, content_sha256)
             VALUES ($1, $2, $3, 'application/pdf', 1200, $4)`, [request, MEMBER, path, hash])
    await q(`INSERT INTO file_objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size":1200,"mimetype":"application/pdf"}')`, [path])
  }
  return { claim, request, path }
}

const returnClaim = (claim, reason) => q('SELECT finance_return_member_claim($1, $2)', [claim, reason])
const invoiceOf = claim => q('SELECT object_path, mime_type, size_bytes, file_name FROM finance_member_claim_invoice($1)', [claim])
const opens = async path => (await q(`SELECT name FROM file_objects WHERE bucket_id = 'member-invoices' AND name = $1`, [path])).length === 1

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;

    CREATE TABLE users(id uuid PRIMARY KEY, role text NOT NULL, name text);
    INSERT INTO users VALUES ('${HR}', 'hr', 'HR Manager'), ('${FIN}', 'finance', 'Finance Manager'),
      ('${MAKER}', 'finance', 'ONG'), ('${PRINCIPAL}', 'principal', 'Principal'), ('${MEMBER}', 'revenue_member', 'Anthony');
    -- The cells each account holds, and the boxes unticked on a page: what has_any_action, has_perm and
    -- tab_write_guard answer from.
    CREATE TABLE grants(user_id uuid NOT NULL, cell text NOT NULL);
    INSERT INTO grants VALUES
      ('${FIN}', 'treasury.view'), ('${FIN}', 'treasury.create'), ('${FIN}', 'treasury.void'), ('${FIN}', 'treasury.approve'),
      ('${MAKER}', 'treasury.view'), ('${MAKER}', 'treasury.create'), ('${MAKER}', 'treasury.edit'),
      ('${PRINCIPAL}', 'treasury.view'), ('${PRINCIPAL}', 'treasury.approve'), ('${PRINCIPAL}', 'treasury.void'),
      ('${HR}', 'member.manage'), ('${MEMBER}', 'member_requests.view');
    CREATE TABLE closed_pages(user_id uuid NOT NULL, page text NOT NULL);
    CREATE FUNCTION has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      AS $$ SELECT EXISTS (SELECT 1 FROM grants g WHERE g.user_id = auth.uid()
              AND g.cell = ANY (ARRAY(SELECT split_part(w, ':', 1) FROM unnest(p_wants) w))) $$;
    CREATE FUNCTION has_perm(text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      AS $$ SELECT EXISTS (SELECT 1 FROM grants g WHERE g.user_id = auth.uid() AND split_part(g.cell, '.', 1) = $1) $$;
    CREATE FUNCTION member_is_manager(text) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'hr') $$;
    CREATE FUNCTION tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM closed_pages c WHERE c.user_id = auth.uid() AND c.page = ANY (p_pages)) THEN
        RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked' USING ERRCODE = '42501';
      END IF;
    END $$;

    CREATE TABLE permission_page_tabs(page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));
    INSERT INTO permission_page_tabs VALUES ('/payments', 'fin.payments'), ('/payments/claim-requests', 'fin.payments');

    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL);
    INSERT INTO hr_staff_costs VALUES ('${ANTHONY}', 'ANTHONY');

    CREATE TYPE claim_type AS ENUM ('project', 'benefit');
    CREATE TYPE claim_status AS ENUM ('pending', 'approved', 'rejected', 'paid');
    CREATE TABLE claims(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_type claim_type NOT NULL, claimant_name text NOT NULL,
      department_id uuid, amount numeric NOT NULL, description text, status claim_status NOT NULL DEFAULT 'pending',
      approved_by uuid, approved_at timestamptz, payroll_month date, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
      source_pool text, voucher_id uuid,
      payout_route text CHECK (payout_route IS NULL OR payout_route IN ('payroll', 'payment')));
    CREATE TABLE member_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL, staff_id uuid, sub_department_id uuid,
      kind text NOT NULL, status text NOT NULL, title text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', claim_id uuid,
      note text, reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      submitted_at timestamptz, request_no text);
    CREATE TABLE member_request_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, actor_id uuid, from_status text,
      to_status text NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE member_request_attachments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, uploaded_by uuid NOT NULL,
      object_path text NOT NULL, mime_type text NOT NULL, size_bytes integer NOT NULL, content_sha256 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now());

    CREATE TYPE payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid', 'voided');
    CREATE TABLE payment_vouchers(id uuid PRIMARY KEY, voucher_no text, status payment_voucher_status NOT NULL,
      executed_at timestamptz, payment_date date, executed_by uuid);
    INSERT INTO payment_vouchers(id, voucher_no, status) VALUES ('${PV}', 'HV-PV-202610-0007', 'draft');

    CREATE TABLE access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, resource_type text,
      resource_id text, action text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE notices(topic text, kind text, title text, body text, ref_kind text, ref_id text);
    CREATE FUNCTION notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
      RETURNS void LANGUAGE sql AS $$ INSERT INTO notices VALUES (p_topic, p_kind, p_title, p_body, p_ref_kind, p_ref_id) $$;

    -- storage.objects' twin; only the policy under test stands on it here.
    CREATE TABLE file_objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
      owner_id text, metadata jsonb, UNIQUE (bucket_id, name));
    ALTER TABLE file_objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON file_objects TO authenticated;
  `)
  await productionFunction('20260912040000_member_request_workflows', 'member_request_audit')
  await productionFunction('20261011180000_notifications', 'notify_member_request')
  await productionFunction('20261005030000_member_requests_numbers_claims', 'member_request_history')
  await db.exec('GRANT EXECUTE ON FUNCTION member_request_history(uuid) TO authenticated')
  await db.exec(`
    CREATE TRIGGER member_requests_audit AFTER INSERT OR UPDATE ON member_requests
      FOR EACH ROW EXECUTE FUNCTION member_request_audit();
    CREATE TRIGGER member_requests_notify AFTER INSERT OR UPDATE OF status ON member_requests
      FOR EACH ROW EXECUTE FUNCTION notify_member_request();
  `)

  // ── The migration, verbatim — and again, which changes nothing ───────────
  const migration = await migrationText('20261029160000_payment_request_page')
  await db.exec(migration)
  await db.exec(migration)
  check(await q(`SELECT page, tab_id FROM permission_page_tabs WHERE page = '/payments/requests'`),
    [{ page: '/payments/requests', tab_id: 'fin.payments' }], 'the page is on Finance’s Payments tab, once')
  check(await one(`SELECT has_function_privilege('anon', 'finance_return_member_claim(uuid, text)', 'EXECUTE')`), false,
    'nobody signed out may call it')

  // ── Finance opens the invoice of a claim it is to pay — only that ────────
  const due = await memberClaim()
  const pending = await memberClaim({ status: 'pending', route: null, requestStatus: 'submitted' })
  const payroll = await memberClaim({ route: 'payroll' })
  await as(FIN)
  check(await invoiceOf(due.claim), [{ object_path: due.path, mime_type: 'application/pdf', size_bytes: 1200, file_name: 'airbnb.pdf' }],
    'Finance is told the invoice of a claim HR approved for payment')
  check(await opens(due.path), true, 'and may open its file')
  check(await invoiceOf(pending.claim), [], 'not of a claim HR has not decided')
  check(await opens(pending.path), false, 'nor open it')
  check(await invoiceOf(payroll.claim), [], 'not of a claim paid with the payroll')
  check(await opens(payroll.path), false, 'nor open that one')
  await as(PRINCIPAL)
  check(await opens(due.path), true, 'the Principal opens it too')
  await as(HR)
  check(await invoiceOf(due.claim), [], 'an account without Treasury is told nothing')
  check(await opens(due.path), false, 'and opens nothing through Finance’s policy')
  const noInvoice = await memberClaim({ invoice: false })
  await as(FIN)
  check(await invoiceOf(noInvoice.claim), [], 'an outstation claim by road has no invoice')

  // ── Who may return it ─────────────────────────────────────────────────────
  await as(MAKER)
  await reject('SELECT finance_return_member_claim($1, $2)', [due.claim, 'Wrong amount'],
    /needs Treasury · Void or Approve/, 'a Maker may raise the voucher but not send the claim back')
  await as(null, null)
  await q('INSERT INTO closed_pages VALUES ($1, $2)', [FIN, '/payments/requests'])
  await as(FIN)
  await reject('SELECT finance_return_member_claim($1, $2)', [due.claim, 'Wrong amount'],
    /a box in your permissions is unticked/, 'the page’s box unticked closes it')
  await as(null, null)
  await q('DELETE FROM closed_pages')
  await as(MEMBER)
  await reject('SELECT finance_return_member_claim($1, $2)', [due.claim, 'Mine'],
    /needs Treasury · Void or Approve/, 'the member cannot return their own claim')
  await as(null, 'anon')
  await reject('SELECT finance_return_member_claim($1, $2)', [due.claim, 'x'], /permission denied/, 'nor can anybody signed out')

  // ── What may go back ──────────────────────────────────────────────────────
  await as(FIN)
  await reject('SELECT finance_return_member_claim($1, $2)', [due.claim, '   '],
    /Say why the claim goes back to HR/, 'a reason is required')
  await reject('SELECT finance_return_member_claim($1, $2)', [pending.claim, 'x'],
    /not waiting for a payment voucher/, 'a claim HR has not decided is HR’s already')
  await reject('SELECT finance_return_member_claim($1, $2)', [payroll.claim, 'x'],
    /not waiting for a payment voucher/, 'a claim paid with the payroll is not Finance’s')
  const vouchered = await memberClaim({ voucher: PV })
  await as(FIN)
  await reject('SELECT finance_return_member_claim($1, $2)', [vouchered.claim, 'x'],
    /already has a payment voucher \(HV-PV-202610-0007\)\. Void it first/, 'a claim with a voucher keeps it until it is voided')
  const paid = await memberClaim({ status: 'paid' })
  await as(FIN)
  await reject('SELECT finance_return_member_claim($1, $2)', [paid.claim, 'x'],
    /not waiting for a payment voucher/, 'a paid claim stays paid')
  await as(null, null)
  const project = await one(`INSERT INTO claims(claim_type, claimant_name, amount, status, created_by) VALUES ('project', 'X', 10, 'approved', $1) RETURNING id`, [FIN])
  await as(FIN)
  await reject('SELECT finance_return_member_claim($1, $2)', [project, 'x'],
    /Only a member's claim goes back to HR/, 'a claim no member sent has no HR to go back to')
  await reject('SELECT finance_return_member_claim($1, $2)', [id(99), 'x'], /Claim not found/, 'an unknown claim')

  // ── Returned: HR's to decide again ────────────────────────────────────────
  await as(null, null)
  const noticesBefore = await one('SELECT count(*)::int FROM notices')
  await as(FIN)
  await returnClaim(due.claim, '  The invoice is for 2 nights, the claim for 3  ')
  await as(null, null)
  check(await q('SELECT status::text, approved_by, approved_at, payout_route, payroll_month FROM claims WHERE id = $1', [due.claim]),
    [{ status: 'pending', approved_by: null, approved_at: null, payout_route: null, payroll_month: null }],
    'the claim is pending again, its route and approver cleared')
  check(await q('SELECT status, note, reviewed_by, reviewed_at FROM member_requests WHERE id = $1', [due.request]),
    [{ status: 'submitted', note: null, reviewed_by: null, reviewed_at: null }],
    'the request is submitted again, the note the member reads empty')
  check(await q(`SELECT actor_id, from_status, to_status, note FROM member_request_events WHERE request_id = $1 AND to_status = 'submitted'`, [due.request]),
    [{ actor_id: FIN, from_status: 'approved', to_status: 'submitted', note: 'Returned by Finance: The invoice is for 2 nights, the claim for 3' }],
    'the history HR reads says who returned it and why — one step')
  check(await q('SELECT topic, title, body, ref_kind, ref_id FROM notices OFFSET $1', [noticesBefore]),
    [{ topic: 'member.requests', title: 'Claim returned by Finance · ANTHONY', body: 'Returned by Finance: The invoice is for 2 nights, the claim for 3',
      ref_kind: 'member_request', ref_id: due.request }],
    'HR is told it came back, and why')
  check(await q(`SELECT user_id, action, metadata->>'reason' AS reason, metadata->>'request' AS request FROM access_log WHERE resource_id = $1`, [due.claim]),
    [{ user_id: FIN, action: 'return_to_hr', reason: 'The invoice is for 2 nights, the claim for 3', request: 'RQ-2610-001' }],
    'and the portal’s log keeps it')
  await as(MEMBER)
  const seen = (await one('SELECT member_request_history($1)', [due.request])).filter(e => e.from === 'approved' && e.status === 'submitted')
  check(seen.map(e => [e.actor, e.note]), [['finance', null]], 'the member sees it went back, never Finance’s reason')
  await as(FIN)
  check(await invoiceOf(due.claim), [], 'Finance is no longer told its invoice')
  check(await opens(due.path), false, 'nor opens it')
  await reject('SELECT finance_return_member_claim($1, $2)', [due.claim, 'again'],
    /not waiting for a payment voucher/, 'it goes back once')

  // The Principal returns one too (Treasury · Approve).
  const second = await memberClaim()
  await as(PRINCIPAL)
  await returnClaim(second.claim, 'Duplicate of RQ-2610-001')
  await as(null, null)
  check(await one('SELECT status FROM member_requests WHERE id = $1', [second.request]), 'submitted', 'the Principal may return a claim')

  // ── HR's other notices read as before ─────────────────────────────────────
  await as(null, null)
  const fresh = await one(`INSERT INTO member_requests(created_by, staff_id, kind, status, title) VALUES ($1, $2, 'claim', 'draft', 'Food claim') RETURNING id`, [MEMBER, ANTHONY])
  await q(`UPDATE member_requests SET status = 'submitted' WHERE id = $1`, [fresh])
  await q(`UPDATE member_requests SET status = 'needs_info' WHERE id = $1`, [fresh])
  await q(`UPDATE member_requests SET status = 'submitted' WHERE id = $1`, [fresh])
  check(await q('SELECT title, body FROM notices WHERE ref_id = $1', [fresh]),
    [{ title: 'New claim · ANTHONY', body: 'Food claim' }, { title: 'Claim answered · ANTHONY', body: 'Food claim' }],
    'a new claim and an answered one read as they did')

  console.log(`Finance return-claim checks passed: ${checks}`)
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await db.close()
}

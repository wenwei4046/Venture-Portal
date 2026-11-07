// Local PostgreSQL regression for 20261107213000 (2026-11-07 — the user: "Revenue App 上边，他们的 Submit Claim 里面多一个
// 东西叫 Other Claim … 写主题是什么、remarks 是什么，and then attach 它的 invoice，然后填它的 amount"). An Other claim is its
// subject, its remarks, the amount as typed and its invoice — worked out by the database, the rest of what the phone sent
// dropped; titled "Other claim · <subject>"; its claims row's line "Other · <subject> · <remarks>"; an invoice is claimed
// once. HR and Finance take it as any claim (nothing of theirs changes).
// Production's bodies: `other-claim-production.sql` (member_claim_detail_for, member_prepare_request, member_submit_request,
// member_request_json — md5-checked). The migration is applied VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const here = new URL('./', import.meta.url)
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const file = async (dir, name) => (await readFile(new URL(name, dir), 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const refused = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

async function as(user, staff) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.staff', $1, false)", [staff ?? ''])
  await db.exec('SET ROLE authenticated')
}
const asSystem = () => db.exec('RESET ROLE')

const FAIR = id(20), DEPT = id(30)
const U_ANN = id(41), U_BEN = id(42)
const ANN = id(51), BEN = id(52)
const HASH_A = 'a'.repeat(64), HASH_B = 'b'.repeat(64), HASH_C = 'c'.repeat(64)
const SIG = {
  detail: 'public.member_claim_detail_for(jsonb, uuid, uuid)',
  prepare: 'public.member_prepare_request(text, uuid, jsonb, uuid, uuid)',
  submit: 'public.member_submit_request(uuid)',
  json: 'public.member_request_json(uuid)',
  other: 'public.member_claim_other_detail(jsonb, uuid, uuid)',
  taken: 'public.member_other_claim_invoice_taken(uuid, text, uuid)',
}
// What the migration puts in (and what it was): each body must be production's with exactly these swapped.
const SWAPS = {
  detail: [[
    "IF v_type='food' THEN RETURN public.member_claim_food_detail(p_detail, p_staff, p_sub); END IF;",
    "IF v_type='food' THEN RETURN public.member_claim_food_detail(p_detail, p_staff, p_sub); END IF;\n IF v_type='other' THEN RETURN public.member_claim_other_detail(p_detail, p_staff, p_sub); END IF;",
  ]],
  prepare: [[
    "IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_taken(v_staff, p_detail, p_revision); END IF;",
    "IF p_detail->>'claimType'='food' THEN PERFORM public.member_food_claim_taken(v_staff, p_detail, p_revision); END IF;\n IF p_detail->>'claimType'='other' THEN PERFORM public.member_other_claim_invoice_taken(v_staff, p_detail->>'invoiceHash', p_revision); END IF;",
  ], [
    "v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim · '||coalesce(p_detail->>'monthLabel','')",
    "v_title:=CASE WHEN p_detail->>'claimType'='food' THEN 'Food claim · '||coalesce(p_detail->>'monthLabel','') WHEN p_detail->>'claimType'='other' THEN 'Other claim · '||coalesce(p_detail->>'subject','')",
  ]],
  submit: [[
    "WHEN r.detail->>'claimType'='food' THEN public.member_food_claim_line(r.detail)",
    "WHEN r.detail->>'claimType'='food' THEN public.member_food_claim_line(r.detail)\n  WHEN r.detail->>'claimType'='other' THEN concat('Other · ',r.detail->>'subject',' · ',btrim(regexp_replace(r.detail->>'remarks','\\s+',' ','g')))",
  ]],
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

    CREATE TABLE users(id uuid PRIMARY KEY, name text);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text, department_id uuid);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text);
    CREATE TABLE member_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid, staff_id uuid, sub_department_id uuid,
      kind text, title text, detail jsonb, idempotency_key uuid, status text NOT NULL DEFAULT 'draft', claim_id uuid,
      allocated_staff_id uuid, note text, request_no text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      submitted_at timestamptz, reservation_expires_at timestamptz, effective_on date, UNIQUE (created_by, idempotency_key));
    CREATE TABLE claims(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_type text, claimant_name text, department_id uuid,
      amount numeric(15,2) CHECK (amount > 0), description text, receipt_url text, status text, source_pool text, created_by uuid,
      payout_route text, payroll_month date, voucher_id uuid);
    CREATE TABLE payment_vouchers(id uuid PRIMARY KEY, voucher_no text, status text);
    CREATE TABLE member_request_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, uploaded_by uuid,
      object_path text, content_sha256 text, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    CREATE TABLE file_objects(bucket_id text, name text);
    CREATE TABLE member_claim_rates(id boolean PRIMARY KEY DEFAULT true, base_name text NOT NULL DEFAULT 'Klang Valley', rate_per_spot numeric,
      airbnb_rate_per_pax_night numeric, airbnb_group_cap_per_night numeric, airbnb_group_max_pax integer NOT NULL DEFAULT 3);
    CREATE TABLE member_claim_regions(id uuid PRIMARY KEY, name text, spots int, is_active boolean, plane_ticket boolean, no_claim boolean, sort_order int);
    CREATE TABLE member_waiting_forms(version int, require_upload boolean, fields jsonb);
    CREATE TABLE member_replacement_forms(version int, require_upload boolean, fields jsonb);

    -- A request's number once it is sent (production's trigger mints RQ-YYMM-NNN the same way).
    CREATE SEQUENCE rq;
    CREATE FUNCTION public.test_request_no() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.request_no IS NULL AND NEW.status <> 'draft' THEN NEW.request_no := 'RQ-2611-' || lpad(nextval('rq')::text, 3, '0'); END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER test_request_no BEFORE INSERT OR UPDATE ON member_requests FOR EACH ROW EXECUTE FUNCTION public.test_request_no();

    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN true; END $$;
    CREATE FUNCTION public.member_send_guard(p_kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN nullif(current_setting('test.staff', true), '')::uuid; END $$;
    CREATE FUNCTION public.member_has_membership(p_staff uuid, p_sub uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN p_sub = '${FAIR}'::uuid; END $$;
    CREATE FUNCTION public.member_claim_food_detail(p_detail jsonb, p_staff uuid, p_sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN RETURN jsonb_build_object('claimType', 'food', 'monthLabel', 'Oct 2026', 'amount', 60); END $$;
    CREATE FUNCTION public.member_food_claim_taken(p_staff uuid, p_detail jsonb, p_except uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.member_food_claim_check(p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.member_food_claim_line(p_detail jsonb) RETURNS text LANGUAGE sql AS $$ SELECT 'Food · 3 days' $$;
    CREATE FUNCTION public.member_transport_claim_open(p_staff uuid, p_sub uuid, p_part text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.member_transport_claim_open(p_staff uuid, p_sub uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.member_claim_brand_week(p_staff uuid, p_sub uuid, p_week date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN RETURN NULL; END $$;
  `)

  // ── Production today ─────────────────────────────────────────────────────────────────────────────
  await db.exec(await file(here, 'other-claim-production.sql'))
  const src = sig => one(`SELECT prosrc FROM pg_proc WHERE oid = '${sig}'::regprocedure`)
  const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = '${sig}'::regprocedure`)
  check(await md5(SIG.detail), '5f80433fcc26c26f3030afa89dad396b', 'member_claim_detail_for as production runs it')
  check(await md5(SIG.prepare), '1a764a63ee0148b6713faed1f91a9888', 'member_prepare_request as production runs it')
  check(await md5(SIG.submit), '66cd30a907ccc7727d90a8714fb064f5', 'member_submit_request as production runs it')
  check(await md5(SIG.json), '9397d78bc99100b19a3552f6ce6d055b', 'member_request_json as production runs it')
  const before = { detail: await src(SIG.detail), prepare: await src(SIG.prepare), submit: await src(SIG.submit) }

  await q(`INSERT INTO users VALUES ($1, 'ANN'), ($2, 'BEN')`, [U_ANN, U_BEN])
  await q(`INSERT INTO departments VALUES ($1, 'Revenue')`, [DEPT])
  await q(`INSERT INTO hr_staff_costs VALUES ($1, 'ANN TAN', $3), ($2, 'BEN LIM', $3)`, [ANN, BEN, DEPT])
  await q(`INSERT INTO comm_sub_departments VALUES ($1, 'Fair')`, [FAIR])

  // ── The migration, verbatim, twice ───────────────────────────────────────────────────────────────
  const sql = await file(migrations, '20261107213000_member_other_claim.sql')
  await db.exec(sql)
  const after = {}
  for (const k of Object.keys(SIG)) after[k] = await md5(SIG[k])
  await db.exec(sql)
  const again = {}
  for (const k of Object.keys(SIG)) again[k] = await md5(SIG[k])
  check(again, after, 'applied again, nothing changes twice')
  for (const k of ['detail', 'prepare', 'submit']) {
    let now = await src(SIG[k])
    for (const [old, swapped] of SWAPS[k]) {
      assert.equal(now.split(swapped).length, 2, `${k}: the new statement is there once`)
      now = now.replace(swapped, old)
    }
    check(now, before[k], `${k}: production's body with only its statements swapped`)
  }
  console.log('bodies after the migration:', JSON.stringify(after))

  // ── The grants ───────────────────────────────────────────────────────────────────────────────────
  const can = (role, fn) => one(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE')`)
  check(await can('authenticated', SIG.other), false, 'a session cannot work an Other claim out by itself')
  check(await can('authenticated', SIG.taken), false, 'nor take the invoice lock')
  check(await can('anon', SIG.taken), false, 'never the publishable key')
  check(await can('service_role', SIG.other), true, 'the service role may')

  // ── ANN sends one ────────────────────────────────────────────────────────────────────────────────
  const prepare = (detail, key, revision = null) =>
    one('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, $5)', ['claim', FAIR, JSON.stringify(detail), key, revision])
  const submit = request => one('SELECT public.member_submit_request($1)', [request])
  const attach = async (request, user, hash, path) => {
    await asSystem()
    await q(`INSERT INTO member_request_attachments(request_id, uploaded_by, object_path, content_sha256) VALUES ($1, $2, $3, $4)`, [request, user, path, hash])
    await q(`INSERT INTO file_objects VALUES ('member-invoices', $1)`, [path])
  }
  const sent = {
    claimType: 'other', subject: '  Parking   at\nMITEC ', remarks: ' Three days of the fair,\nthe receipt attached ', amount: 45.5,
    invoiceName: 'parking.pdf', invoiceHash: HASH_A,
    // What a hand-made request might add — none of it is kept.
    week: '2026-10-02', location: 'MITEC', rate: 999, planeTicket: true, category: 'Air ticket',
  }
  await as(U_ANN, ANN)
  const first = await prepare(sent, id(101))
  check(first.status, 'draft', 'prepared as a draft')
  await asSystem()
  const row = (await q('SELECT title, detail FROM member_requests WHERE id = $1', [first.id]))[0]
  check(row.title, 'Other claim · Parking at MITEC', 'titled by its subject, on one line')
  check(row.detail, {
    claimType: 'other', category: 'Other claim', subject: 'Parking at MITEC', remarks: 'Three days of the fair,\nthe receipt attached',
    amount: 45.5, invoiceName: 'parking.pdf', invoiceHash: HASH_A,
  }, 'kept: its subject, remarks, amount and invoice — nothing else the phone sent')
  check(await one('SELECT detail->>\'amount\' FROM member_requests WHERE id = $1', [first.id]), '45.50', 'the amount as typed, to the sen')

  await as(U_ANN, ANN)
  await refused('SELECT public.member_submit_request($1)', [first.id], /A verified invoice is required before submitting/, 'no invoice attached: not sent')
  await attach(first.id, U_ANN, HASH_A, `${U_ANN}/${first.id}/x.pdf`)
  await as(U_ANN, ANN)
  const done = await submit(first.id)
  check([done.status, done.title, done.requestNo], ['submitted', 'Other claim · Parking at MITEC', 'RQ-2611-001'], 'sent, numbered')
  await asSystem()
  const claim = (await q('SELECT c.* FROM claims c JOIN member_requests r ON r.claim_id = c.id WHERE r.id = $1', [first.id]))[0]
  check([claim.claim_type, claim.status, claim.claimant_name, claim.department_id, Number(claim.amount), claim.source_pool],
    ['benefit', 'pending', 'ANN TAN', DEPT, 45.5, 'venture_pool'], 'its claim waits for HR as any member claim')
  check(claim.description, 'Other · Parking at MITEC · Three days of the fair, the receipt attached', 'what HR’s payroll line and Finance read')
  check(claim.receipt_url, `member-invoices/${U_ANN}/${first.id}/x.pdf`, 'with its invoice')

  // The same send again (a retry on the same key) is the same request.
  await as(U_ANN, ANN)
  check((await prepare(sent, id(101))).id, first.id, 'a retry on the same key is the same request')

  // ── What is refused, before anything is written ─────────────────────────────────────────────────
  const count = () => one('SELECT count(*)::int FROM member_requests')
  await asSystem()
  const n = await count()
  await as(U_ANN, ANN)
  const base = { claimType: 'other', subject: 'Toll', remarks: 'PLUS highway to Penang', amount: '12.40', invoiceName: 'toll.jpg', invoiceHash: HASH_B }
  for (const [change, pattern, what] of [
    [{ subject: '' }, /Enter the claim's subject/, 'no subject'],
    [{ subject: ' \n ' }, /Enter the claim's subject/, 'a subject of spaces'],
    [{ subject: 'x'.repeat(101) }, /Keep the subject to 100 characters/, 'a subject over 100 characters'],
    [{ remarks: undefined }, /Add remarks: what it was for/, 'no remarks'],
    [{ remarks: '\n \t\n' }, /Add remarks: what it was for/, 'remarks of blank lines'],
    [{ remarks: 'x'.repeat(501) }, /Keep the remarks to 500 characters/, 'remarks over 500 characters'],
    [{ amount: '0' }, /Enter the amount, as its invoice shows/, 'nothing to claim'],
    [{ amount: '-5' }, /Enter the amount, as its invoice shows/, 'a negative amount'],
    [{ amount: '12.345' }, /Enter the amount, as its invoice shows/, 'an amount past the sen'],
    [{ amount: 'RM 12' }, /Enter the amount, as its invoice shows/, 'an amount in words'],
    [{ amount: undefined }, /Enter the amount, as its invoice shows/, 'no amount'],
    [{ invoiceHash: undefined }, /Add the invoice/, 'no invoice'],
    [{ invoiceHash: 'not-a-hash' }, /Add the invoice/, 'an invoice that was not verified'],
  ]) {
    await refused('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, JSON.stringify({ ...base, ...change }), id(200 + checks)], pattern, what)
  }
  await asSystem()
  check(await count(), n, 'nothing written for any of them')
  await as(U_ANN, ANN)
  check((await prepare({ ...base, subject: 'x'.repeat(100), remarks: 'y'.repeat(500) }, id(301))).status, 'draft', '100 and 500 characters are the most')
  await refused('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', id(99), JSON.stringify(base), id(302)],
    /Request department is not an active membership/, 'only for a sub-department they belong to, as every claim')

  // ── An invoice is claimed once ───────────────────────────────────────────────────────────────────
  await refused('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, JSON.stringify({ ...sent, subject: 'Parking again' }), id(401)],
    /This invoice is already claimed in RQ-2611-001: an invoice is claimed once/, 'the same invoice file again, on a new send')
  await asSystem()
  check(await count(), n + 1, 'nothing written')
  await as(U_BEN, BEN)
  const bens = await prepare({ ...sent, subject: 'Shared parking' }, id(402))
  check(bens.status, 'draft', 'another person with the same file is their own claim')
  await as(U_ANN, ANN)
  check((await prepare({ ...base, invoiceHash: HASH_C }, id(403))).status, 'draft', 'a draft holding a file blocks nothing…')
  check((await prepare({ ...base, subject: 'Toll, sent again', invoiceHash: HASH_C }, id(404))).status, 'draft', '…another send of it is a draft too')
  // A transport claim's invoice is an invoice too: an Airbnb stay sent with it.
  await asSystem()
  await q(`INSERT INTO member_requests(created_by, staff_id, sub_department_id, kind, title, detail, idempotency_key, status)
           VALUES ($1, $2, $3, 'claim', 'Airbnb claim · Penang', $4::jsonb, $5, 'submitted')`,
    [U_ANN, ANN, FAIR, JSON.stringify({ claimType: 'airbnb', invoiceHash: HASH_B, amount: 300 }), id(405)])
  const airbnbNo = await one('SELECT request_no FROM member_requests WHERE idempotency_key = $1', [id(405)])
  await as(U_ANN, ANN)
  await refused('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, JSON.stringify(base), id(406)],
    new RegExp(`already claimed in ${airbnbNo}`), 'an Airbnb stay’s invoice cannot be claimed again as an Other claim')
  await asSystem()
  await q(`UPDATE member_requests SET status = 'rejected' WHERE idempotency_key = $1`, [id(405)])
  await as(U_ANN, ANN)
  check((await prepare(base, id(407))).status, 'draft', 'once that one is rejected, the file may be claimed again')
  await asSystem()
  await q(`UPDATE member_requests SET status = 'withdrawn' WHERE idempotency_key = $1`, [id(101)])
  await as(U_ANN, ANN)
  check((await prepare({ ...sent, subject: 'Parking, sent again' }, id(408))).status, 'draft', 'and once one is cancelled')
  await asSystem()
  await q(`UPDATE member_requests SET status = 'submitted' WHERE idempotency_key = $1`, [id(101)])

  // ── HR asks for more: the member updates the same claim, its own invoice and all ─────────────────
  await asSystem()
  await q(`UPDATE member_requests SET status = 'needs_info', note = 'Which days?' WHERE id = $1`, [first.id])
  await as(U_ANN, ANN)
  const revised = await prepare({ ...sent, remarks: '9–11 Oct, the fair days' }, id(101), first.id)
  check(revised.id, first.id, 'the same request, updated — its own invoice is not "already claimed"')
  check(await submit(first.id).then(r => [r.status, r.title]), ['submitted', 'Other claim · Parking at MITEC'], 'and sent again')
  await asSystem()
  check(await one('SELECT c.description FROM claims c JOIN member_requests r ON r.claim_id = c.id WHERE r.id = $1', [first.id]),
    'Other · Parking at MITEC · 9–11 Oct, the fair days', 'its claim’s line follows the update')
  check(await one('SELECT count(*)::int FROM claims'), 1, 'still one claim')

  // ── The other kinds go as before ─────────────────────────────────────────────────────────────────
  const detail = (d) => q('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify(d), ANN, FAIR])
  check((await detail({ claimType: 'food' }))[0].member_claim_detail_for.claimType, 'food', 'a food claim still goes to its own function')
  await refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify({ claimType: 'outstation', week: '2026-10-02' }), ANN, FAIR],
    /A claim is for your own brand week/, 'Outstation still asks for the brand week')
  await refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify({ claimType: 'taxi' }), ANN, FAIR],
    /Choose Outstation or Airbnb/, 'an unknown kind is refused, as before')
  await as(U_ANN, ANN)
  const food = await prepare({ claimType: 'food', month: '2026-10' }, id(501))
  await asSystem()
  check(await one('SELECT title FROM member_requests WHERE id = $1', [food.id]), 'Food claim · Oct 2026', 'a food claim titled as before')
  await as(U_ANN, ANN)
  check((await submit(food.id)).status, 'submitted', 'and sent without an invoice, as before')
  await asSystem()
  check(await one('SELECT c.description FROM claims c JOIN member_requests r ON r.claim_id = c.id WHERE r.id = $1', [food.id]), 'Food · 3 days',
    'its line as before')

  console.log(`other claim: ${checks} checks passed`)
} finally {
  await db.close()
}

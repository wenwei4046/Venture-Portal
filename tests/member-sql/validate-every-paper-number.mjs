// Local PostgreSQL regression for 20261031013000 (2026-10-31 — a side agent's note while SHAWN's bills were checked
// for orders he only handles for salespeople who left: HC-SO-2610-300's Ref No. is HC9882+ZNT4864, and the double
// claims check matched it on HC9882 alone).
// Production's four bodies (tests/member-sql/every-paper-production.sql, read with pg_get_functiondef, md5-checked)
// are loaded over stand-ins for the tables they read, and production's reader is kept under another name to compare
// with; the migration then runs VERBATIM. What is under test: every paper number in a Ref No. is a bill's
// (`sales_order_bill_refs`, `sales_orders.bill_refs`), the first being the bill_ref it already had; a bill is in the
// group of each of them; an answer covers its bills under any paper they share; and bills with one paper each read
// exactly as production's body read them. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261031013000_every_paper_number.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(1), IR = id(2), AUG_BATCH = id(3), SEP_BATCH = id(4), OCT_BATCH = id(5), IR_BATCH = id(6), RUN = id(7)
const HR = id(9)
const SHAWN = id(11), WEI_HOW = id(12), ADRIAN = id(13), JASON = id(14), LUCAS = id(15)
const AUG = '2026-08-01', SEP = '2026-09-01', OCT = '2026-10-01'
const asHr = async run => {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${HR}', false)`)
  try { return await run() } finally { await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false)`) }
}

// Production's bodies, split at their headers: the two the generated columns call first, the readers after the tables.
const production = (await readFile(new URL('./every-paper-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
const blocks = Object.fromEntries(production.split(/\n(?=-- [a-z_]+\()/).map(b => [b.match(/^-- ([a-z_]+)\(/)[1], b]))
const PROD = {
  sales_order_bill_ref: '0b60d489d61e938c9799081ae7aa5f82',
  sales_order_ref_no: 'b5347a21721ef276f3584cdd5948741c',
  revenue_possible_double_claims: 'cc5daca124a33c2a4487f63415f39648',
  revenue_dismiss_double_claim: '3f228702e1123d7fd0f64f9e6d3faa4e',
}

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`)
await db.exec(blocks.sales_order_bill_ref)
await db.exec(blocks.sales_order_ref_no)
await db.exec(`
  CREATE TABLE public.users(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL);
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL,
    status text NOT NULL DEFAULT 'committed', source text NOT NULL DEFAULT 'erp_sync');
  -- As production has it: bill_ref generated from the first paper (20260926110000, 20261003170000).
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
    period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, staff_id uuid, agent_name text NOT NULL DEFAULT '',
    order_total numeric NOT NULL, cancelled boolean NOT NULL DEFAULT false, source text NOT NULL DEFAULT 'erp_sync',
    raw jsonb NOT NULL DEFAULT '{}',
    bill_ref text GENERATED ALWAYS AS (sales_order_bill_ref(order_no, sales_order_ref_no(raw->'header'))) STORED);
  CREATE TABLE public.comm_runs(id uuid PRIMARY KEY, status text NOT NULL);
  CREATE TABLE public.comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, sub_department_id uuid,
    order_no text, order_period_month date);
  CREATE TABLE public.comm_double_claim_dismissals(sub_department_id uuid NOT NULL, bill_ref text NOT NULL, order_ids uuid[] NOT NULL,
    note text, dismissed_by uuid, dismissed_by_name text, dismissed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sub_department_id, bill_ref));
`)
await db.exec(blocks.revenue_possible_double_claims)
await db.exec(blocks.revenue_dismiss_double_claim)
for (const r of await q(`SELECT proname, md5(prosrc) AS md5 FROM pg_proc WHERE proname = ANY ($1)`, [Object.keys(PROD)])) {
  check(r.md5, PROD[r.proname], `${r.proname}: production's body`)
}
// Production's reader, kept to compare with once the migration has replaced it.
await db.exec(blocks.revenue_possible_double_claims.replace(
  'CREATE OR REPLACE FUNCTION public.revenue_possible_double_claims(', 'CREATE OR REPLACE FUNCTION public.prod_possible_double_claims('))

// ── Fair's bills, as the ERP and the claim forms wrote them ──
await db.exec(`
  INSERT INTO users (id, name) VALUES ('${HR}', 'HR Manager');
  INSERT INTO hr_staff_costs (id, employee_name) VALUES
    ('${SHAWN}', 'SHAWN'), ('${WEI_HOW}', 'WEI HOW'), ('${ADRIAN}', 'ADRIAN'), ('${JASON}', 'JASON'), ('${LUCAS}', 'LUCAS');
  INSERT INTO sales_import_batches (id, sub_department_id, period_month, source) VALUES
    ('${AUG_BATCH}', '${FAIR}', '${AUG}', 'file'), ('${SEP_BATCH}', '${FAIR}', '${SEP}', 'erp_sync'),
    ('${OCT_BATCH}', '${FAIR}', '${OCT}', 'erp_sync'), ('${IR_BATCH}', '${IR}', '${OCT}', 'erp_sync');
  INSERT INTO comm_runs (id, status) VALUES ('${RUN}', 'applied');
`)
const bill = (n, batch, month, orderNo, date, staff, total, ref, extra = {}) => ({ id: id(100 + n), batch, month, orderNo, date, staff, total, ref, ...extra })
const BILLS = [
  // A claim-form row: its paper is its own number, no header.
  bill(1, AUG_BATCH, AUG, 'ZNT4864', '2026-08-15', WEI_HOW, 3988, null, { source: 'file' }),
  // Two papers in one Ref No. — the second is the claim form's.
  bill(2, OCT_BATCH, OCT, 'HC-SO-2610-300', '2026-10-20', SHAWN, 6666, 'HC9882+ZNT4864'),
  // The same three papers on three documents, in three orders: no first number in common.
  bill(3, SEP_BATCH, SEP, 'HC-SO-013268', '2026-09-02', LUCAS, 3000, 'HC12932+HC12931+HC12933'),
  bill(4, SEP_BATCH, SEP, 'HC-SO-013271', '2026-09-02', LUCAS, 2500, 'HC12931 + HC12932 + HC12933'),
  bill(5, SEP_BATCH, SEP, 'HC-SO-013319', '2026-09-04', LUCAS, 1800, 'hc12933/hc12931/HC 12932'),
  // The second paper of one bill is the only paper of another.
  bill(6, SEP_BATCH, SEP, 'HC-SO-2609-268', '2026-09-28', ADRIAN, 4100, 'ZNT6737+HC13375'),
  bill(7, SEP_BATCH, SEP, 'HC-SO-2609-389', '2026-09-30', JASON, 8399, 'HC13375'),
  // One paper each, on two bills: the group production already found.
  bill(8, OCT_BATCH, OCT, 'HC-SO-2610-001', '2026-10-01', LUCAS, 5000, 'PG10457'),
  bill(9, OCT_BATCH, OCT, 'HC-SO-2610-002', '2026-10-02', LUCAS, 1200, 'PG10457'),
  // An ERP document named beside the paper is no paper; a paper named twice is one.
  bill(10, SEP_BATCH, SEP, 'HC-SO-2609-017', '2026-09-09', SHAWN, 2600, 'PG10213+HC-SO-010741'),
  bill(11, OCT_BATCH, OCT, 'HC-SO-2610-010', '2026-10-04', SHAWN, 900, 'HC7844+hc7844'),
  // What never counts: cancelled, RM 0, and another sub-department.
  bill(12, OCT_BATCH, OCT, 'HC-SO-2610-020', '2026-10-05', ADRIAN, 4000, 'HC7844', { cancelled: true }),
  bill(13, OCT_BATCH, OCT, 'HC-SO-2610-021', '2026-10-05', ADRIAN, 0, 'HC7844'),
  bill(14, IR_BATCH, OCT, 'HC-SO-2610-022', '2026-10-05', ADRIAN, 4000, 'HC7844'),
  // A bill a run paid, whose second paper comes back on a later document.
  bill(15, SEP_BATCH, SEP, 'HC-SO-2609-111', '2026-09-12', JASON, 3000, 'EGT1067+ZNT5983'),
  bill(16, OCT_BATCH, OCT, 'HC-SO-2610-034', '2026-10-06', LUCAS, 3000, 'ZNT5983'),
  // No paper in the Ref No., and one that names only a document: each matches itself alone.
  bill(17, OCT_BATCH, OCT, 'HC-SO-2610-305', '2026-10-21', SHAWN, 1770, '-'),
  bill(18, OCT_BATCH, OCT, 'HC-SO-2610-306', '2026-10-21', SHAWN, 500, 'HC-SO-004928'),
]
for (const b of BILLS) {
  await q(`INSERT INTO sales_orders (id, batch_id, period_month, order_no, order_date, staff_id, order_total, cancelled, source, raw)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [b.id, b.batch, b.month, b.orderNo, b.date, b.staff, b.total, b.cancelled ?? false, b.source ?? 'erp_sync',
      b.ref === null ? {} : { header: { customer_so_no: b.ref } }])
}
await q(`INSERT INTO comm_order_releases (run_id, sub_department_id, order_no, order_period_month) VALUES ($1, $2, 'HC-SO-2609-111', $3)`, [RUN, FAIR, SEP])

const groupsOf = async (fn = 'revenue_possible_double_claims') => {
  const out = {}
  for (const r of await q(`SELECT bill_ref, order_no, paid_by_run, dismissed FROM ${fn}($1) ORDER BY bill_ref, order_no`, [FAIR])) {
    (out[r.bill_ref] ??= []).push(r.order_no + (r.paid_by_run ? ' (paid)' : '') + (r.dismissed ? ' (checked)' : ''))
  }
  return out
}

// ── Before: production's body, the first paper alone ──
check(await groupsOf(), { PG10457: ['HC-SO-2610-001', 'HC-SO-2610-002'] },
  'before: the claim form\'s ZNT4864, HC13375, ZNT5983 and the three HC1293x documents are nobody\'s pair')

// ── The migration, verbatim ──
await db.exec(await readFile(MIGRATION, 'utf8'))
check(await one(`SELECT md5(prosrc) <> $1 FROM pg_proc WHERE proname = 'revenue_possible_double_claims'`, [PROD.revenue_possible_double_claims]), true,
  'the reader is replaced')

// sales_order_bill_refs: every paper, in the order written, each once; a document named is no paper.
const refsOf = async no => one(`SELECT bill_refs FROM sales_orders WHERE order_no = $1`, [no])
check(await refsOf('HC-SO-2610-300'), ['HC9882', 'ZNT4864'], 'both papers of HC9882+ZNT4864')
check(await refsOf('HC-SO-013268'), ['HC12932', 'HC12931', 'HC12933'], 'in the order written')
check(await refsOf('HC-SO-013319'), ['HC12933', 'HC12931', 'HC12932'], 'lower case, slashes and a space inside a number read as the papers they are')
check(await refsOf('HC-SO-2609-017'), ['PG10213'], 'an ERP document named in the Ref No. is not a paper')
check(await refsOf('HC-SO-2610-010'), ['HC7844'], 'a paper written twice is one')
check(await refsOf('ZNT4864'), ['ZNT4864'], 'a claim-form row is on its own number')
check(await refsOf('HC-SO-2610-305'), ['HC-SO-2610-305'], 'no paper in the Ref No.: the bill\'s own number, as bill_ref')
check(await refsOf('HC-SO-2610-306'), [await one(`SELECT bill_ref FROM sales_orders WHERE order_no = 'HC-SO-2610-306'`)],
  'a Ref No. naming only a document: the bill_ref it already had')
check(await one(`SELECT count(*)::int FROM sales_orders WHERE bill_refs[1] IS DISTINCT FROM bill_ref`), 0,
  'the first paper is the bill_ref every bill already has')
check(await one(`SELECT provolatile::text FROM pg_proc WHERE proname = 'sales_order_bill_refs'`), 'i', 'IMMUTABLE — a generated column may call it')
check(await one(`SELECT has_function_privilege('authenticated', 'sales_order_bill_refs(text, text)', 'EXECUTE')`), true, 'authenticated may call it')
check(await one(`SELECT has_function_privilege('anon', 'sales_order_bill_refs(text, text)', 'EXECUTE')`), false, 'the publishable key may not')
check(await one(`SELECT count(*)::int FROM pg_indexes WHERE indexname = 'sales_orders_bill_refs_idx' AND indexdef ILIKE '%gin%'`), 1, 'bill_refs is GIN-indexed')

// A write keeps it current: the ERP adds a paper to a document.
await q(`UPDATE sales_orders SET raw = '{"header": {"customer_so_no": "PG10457+ZNT9999"}}' WHERE order_no = 'HC-SO-2610-002'`)
check(await refsOf('HC-SO-2610-002'), ['PG10457', 'ZNT9999'], 'worked out again on every write')

// ── After: every paper ──
const THREE = ['HC-SO-013268', 'HC-SO-013271', 'HC-SO-013319']
check(await groupsOf(), {
  HC12931: THREE, HC12932: THREE, HC12933: THREE,
  HC13375: ['HC-SO-2609-268', 'HC-SO-2609-389'],
  PG10457: ['HC-SO-2610-001', 'HC-SO-2610-002'],
  ZNT4864: ['HC-SO-2610-300', 'ZNT4864'],
  ZNT5983: ['HC-SO-2609-111 (paid)', 'HC-SO-2610-034'],
}, 'every paper: the claim form\'s second paper, the three documents on the same papers, the paid bill\'s second paper')
check(await one(`SELECT count(*)::int FROM revenue_possible_double_claims($1) WHERE order_no IN ('HC-SO-2610-020', 'HC-SO-2610-021')`, [FAIR]), 0,
  'a cancelled bill and an RM 0 one still pay nobody')
check(await one(`SELECT count(*)::int FROM revenue_possible_double_claims($1) WHERE order_no = 'HC-SO-2610-022'`, [FAIR]), 0,
  'another sub-department\'s bill is not this one\'s')
check(await one(`SELECT count(*)::int FROM revenue_possible_double_claims($1) WHERE bill_ref = 'HC7844'`, [FAIR]), 0,
  'a paper written twice on ONE bill is no pair')
check(await one(`SELECT count(*)::int FROM revenue_possible_double_claims($1)`, [IR]), 0, 'IR has none')

// ── An answer covers its bills under every paper they share ──
const dismiss = (ref, note) => asHr(() => one(`SELECT revenue_dismiss_double_claim($1, $2, $3)`, [FAIR, ref, note]))
check(await dismiss('HC12931', 'one sale on three documents'), 3, 'the answer covers the three documents')
const answered = await groupsOf()
check([answered.HC12931, answered.HC12932, answered.HC12933].every(g => g.every(x => x.endsWith('(checked)'))), true,
  'answered under HC12931, the same bills are answered under HC12932 and HC12933')
check(answered.ZNT4864.some(x => x.endsWith('(checked)')), false, 'other groups still ask')
check(await one(`SELECT dismissed_by_name FROM comm_double_claim_dismissals WHERE bill_ref = 'HC12931'`), 'HR Manager', 'who answered')

// A fourth document joins one of the papers: that paper asks again; the two the answer covers stay answered.
await q(`INSERT INTO sales_orders (id, batch_id, period_month, order_no, order_date, staff_id, order_total, raw)
         VALUES ($1, $2, $3, 'HC-SO-2610-040', '2026-10-08', $4, 700, '{"header": {"customer_so_no": "HC12932"}}')`, [id(200), OCT_BATCH, OCT, LUCAS])
const joined = await groupsOf()
check(joined.HC12932.length, 4, 'HC12932 is on four bills now')
check(joined.HC12932.some(x => x.endsWith('(checked)')), false, 'a bill the answer never saw asks again')
check(joined.HC12931.every(x => x.endsWith('(checked)')), true, 'HC12931\'s three bills are still answered')
await assert.rejects(() => dismiss('HC9882', null), /No bills share the number HC9882/, 'a paper on one bill is nothing to answer'); checks++

// ── Bills with one paper each read exactly as production's body read them ──
await db.exec(`DELETE FROM comm_double_claim_dismissals;
  DELETE FROM sales_orders WHERE order_no = 'HC-SO-2610-040';
  UPDATE sales_orders SET raw = jsonb_build_object('header', jsonb_build_object('customer_so_no', bill_refs[cardinality(bill_refs)]))
   WHERE source = 'erp_sync';`)
check(await one(`SELECT count(*)::int FROM sales_orders WHERE cardinality(bill_refs) <> 1`), 0, 'one paper per bill now')
const now = await groupsOf()
check(Object.keys(now).length > 2, true, 'groups to compare (the last papers pair up: HC12933, HC13375, ZNT4864, ZNT5983 …)')
check(now, await groupsOf('prod_possible_double_claims'), 'one paper per bill: the same groups and bills production\'s body answers')
await dismiss('HC13375', null)
check(await groupsOf(), await groupsOf('prod_possible_double_claims'), 'and the same answer to a group answered under its own paper')

console.log(`every paper number: ${checks} checks passed`)

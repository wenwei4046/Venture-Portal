// Local PostgreSQL regression for 20261107230000 — an old bill topped up is commission, never sales, and still seen
// (2026-11-07; the user, shown A — a bill like any other, Shawn's November sales RM 32,586 → RM 38,586 — and B — the
// commission only: "is go with b, not a"; then: "i want can view, then mention no count in sales target (arena)").
//
// Production's five bodies (tests/member-sql/old-bills-not-sales-production.sql, pg_get_functiondef, md5-checked) are
// loaded over stand-ins for what they read; the migration then runs VERBATIM, twice. Under test: the rule
// sales_order_old_bill() (an ERP bill dated before the feed window in a month from it on — and nothing else), and that
// it can be inlined; then ZNT4813 as it lands — Junie's bill of 10 Mar 2026, this month on SHAWN, no fair, half of it
// WEI's, a KPI item on it — beside an ordinary bill of his. Before the migration the facts, both Arena boards and both
// order books count both. After: the facts and the Arena only the ordinary one; the order books list both — the old
// bill as the entry it was, every figure its own, plus "commissionOnly": true and "soldBy"; the ordinary one exactly
// as it was — and their margins are the facts'. A bill is read as ever: the newest document first, goods on it, cleared
// by its deposit, in the window. With no feed window, a bill like any other again. Last, the migration refuses a body
// it was not written from. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261107230000_old_bills_are_not_sales.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR = id(1), SCHEME = id(2), SHAWN = id(11), WEI = id(12), ANNE = id(13), BATCH = id(21)
const OLD_BILL = id(31), MY_BILL = id(32), NO_GOODS = id(33), NEWER = id(34), OLD_SOFA = id(41)
const PRODUCTION = {
  'member_order_facts': '137eb24ba94e9c5bb49789225ff4c271',
  'member_arena_history_for_staff': 'bdd7644f24c5dbaea38587eb461cf89c',
  'member_arena_booth_history_for_staff': '275bdf919dd38cb0930d923cbfe06516',
  'member_order_book_for_staff': 'ece458d6f851856de44959f14fe88840',
  'member_principal_department_order_book': '5d14f2b5eb1d10cc763429ab6431a44f',
}
const MADE = [...Object.keys(PRODUCTION), 'member_order_facts_with_old_bills']

// The bills land in the office's month, whenever this runs: the Arena reads every month up to it.
const MONTH = await one(`SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date::text`)
const NEXT = await one(`SELECT ($1::date + interval '1 month')::date::text`, [MONTH])
const PREV = await one(`SELECT ($1::date - interval '1 month')::date::text`, [MONTH])
const YM = MONTH.slice(0, 7)

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;

  -- ── Stand-ins for what production's bodies read, with the columns they read ──
  CREATE TABLE titles(id uuid PRIMARY KEY, is_department_head boolean NOT NULL DEFAULT false);
  CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, status text NOT NULL DEFAULT 'active', title_id uuid);
  CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, enable_kpi boolean NOT NULL DEFAULT false,
    revenue_cost_divisor numeric, deposit_threshold_pct numeric);
  CREATE TABLE comm_hierarchy(scheme_id uuid, staff_id uuid, title_id uuid,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
  CREATE TABLE comm_salesperson_closes(sub_department_id uuid, period_month date, staff_id uuid, reopened_at timestamptz);
  CREATE TABLE comm_runs(scheme_id uuid, period_month date, status text);
  CREATE TABLE sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text NOT NULL DEFAULT 'committed');
  CREATE TABLE sales_orders(id uuid PRIMARY KEY, batch_id uuid, period_month date NOT NULL, order_no text NOT NULL,
    order_date date NOT NULL, staff_id uuid, agent_name text, customer_name text, bill_ref text, venue text,
    order_total numeric NOT NULL DEFAULT 0, paid_amount numeric NOT NULL DEFAULT 0, cancelled boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT 'erp_sync', brand_code text, manual_margin_pct numeric, fair_event_id uuid, fair_source text,
    raw jsonb, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, line_no integer, item_group text,
    product_code text, product_name text, qty numeric NOT NULL DEFAULT 1, line_amount numeric, cost_amount numeric,
    option_charge_amount numeric NOT NULL DEFAULT 0);
  CREATE TABLE sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric);
  CREATE TABLE comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid, period_month date);
  CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE comm_cost_ratios(scheme_id uuid, product_code text, ratio numeric);
  CREATE TABLE comm_venue_events(id uuid PRIMARY KEY, venue_key text, start_date date, end_date date, period_month date,
    organiser_id uuid, erp_organiser_text text);
  CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text);
  CREATE TABLE comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE erp_feed_settings(sub_department_id uuid PRIMARY KEY, min_order_date date);
  -- The KPI items each line carries (comm_kpi_hits reads them off the scheme's items; here, as given).
  CREATE TABLE kpi_lines(line_id uuid, qty numeric, unit_amount numeric);
  CREATE FUNCTION public.comm_first_paid_month(p_sub_department_id uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
    RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric) LANGUAGE sql STABLE
    AS $$ SELECT l.order_id, l.id, NULL::uuid, k.qty, k.unit_amount
            FROM public.sales_order_lines l JOIN public.kpi_lines k ON k.line_id = l.id WHERE l.order_id = ANY (p_order_ids) $$;
  -- Production's own: a bill's holders — the owner the remainder, each share its part.
  CREATE FUNCTION public.sales_order_parts(p_orders uuid[])
    RETURNS TABLE(order_id uuid, staff_id uuid, part numeric, owner_staff_id uuid) LANGUAGE sql STABLE AS $$
   WITH o AS (
    SELECT so.id,so.staff_id FROM public.sales_orders so WHERE so.id=ANY(p_orders)
   ), held AS (
    SELECT sh.order_id,sh.staff_id,sh.share_pct FROM public.sales_order_shares sh JOIN o ON o.id=sh.order_id
    WHERE sh.staff_id IS DISTINCT FROM o.staff_id AND sh.share_pct>0 AND sh.share_pct<1
   ), given AS (
    SELECT h.order_id,sum(h.share_pct) AS pct FROM held h GROUP BY h.order_id HAVING sum(h.share_pct)<1
   )
   SELECT o.id,o.staff_id,1-coalesce(g.pct,0),o.staff_id FROM o LEFT JOIN given g ON g.order_id=o.id
   UNION ALL
   SELECT h.order_id,h.staff_id,h.share_pct,o.staff_id FROM held h JOIN given g ON g.order_id=h.order_id JOIN o ON o.id=h.order_id
  $$;
  CREATE FUNCTION public.member_erp_brand_weeks(p_sub_department uuid, p_staff uuid DEFAULT NULL)
    RETURNS TABLE(staff_id uuid, week date, erp_project_id bigint, fair_id uuid, brand text, venue text, venue_key text,
      organizer text, start_date date, end_date date, booths integer) LANGUAGE sql STABLE
    AS $$ SELECT NULL::uuid, NULL::date, NULL::bigint, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text,
                 NULL::date, NULL::date, NULL::integer WHERE false $$;
  CREATE FUNCTION public.member_arena_week_closes_on(p_week date) RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT p_week + 2 $$;
  CREATE FUNCTION public.erp_sync_brand_code(p_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim(p_name)) $$;
  -- The department book asks this one for its scheme (production's also refuses anybody but the Principal).
  CREATE FUNCTION public.member_principal_department_scheme(p_sub_department uuid) RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT c.id FROM public.comm_schemes c WHERE c.sub_department_id = p_sub_department $$;
  CREATE FUNCTION public.member_insight_window(p_from text, p_until text) RETURNS daterange LANGUAGE sql IMMUTABLE
    AS $$ SELECT daterange((p_from || '-01')::date, ((p_until || '-01')::date + interval '1 month')::date) $$;

  INSERT INTO hr_staff_costs(id, employee_name) VALUES ('${SHAWN}', 'SHAWN'), ('${WEI}', 'WEI PIN'), ('${ANNE}', 'ANNE');
  INSERT INTO comm_schemes(id, sub_department_id, enable_kpi, revenue_cost_divisor, deposit_threshold_pct)
    VALUES ('${SCHEME}', '${FAIR}', true, 0.7, 0.3);
  INSERT INTO comm_hierarchy(scheme_id, staff_id) VALUES ('${SCHEME}', '${SHAWN}'), ('${SCHEME}', '${WEI}'), ('${SCHEME}', '${ANNE}');
  INSERT INTO comm_item_groups VALUES ('${SCHEME}', 'SOFA', true), ('${SCHEME}', 'DELIVERY', false);
  INSERT INTO erp_feed_settings VALUES ('${FAIR}', '2026-08-01');
  INSERT INTO sales_import_batches(id, sub_department_id, period_month) VALUES ('${BATCH}', '${FAIR}', '${MONTH}');
  -- ZNT4813 as it lands: Junie's bill of 10 Mar 2026, this month on SHAWN (who collected), RM 4,000 of RM 6,000 paid,
  -- no fair, half of it WEI's, a RM 100 KPI item on its sofa. Beside it an ordinary bill of Shawn's.
  INSERT INTO sales_orders(id, batch_id, period_month, order_no, order_date, staff_id, agent_name, customer_name, bill_ref,
      order_total, paid_amount, brand_code)
    VALUES ('${OLD_BILL}', '${BATCH}', '${MONTH}', 'HC-SO-010734', '2026-03-10', '${SHAWN}', '  Junie ', 'LIM', 'ZNT4813',
            6000, 4000, 'ZANOTTI'),
           ('${MY_BILL}', '${BATCH}', '${MONTH}', 'HC-SO-2611-073', '${MONTH}', '${SHAWN}', 'Shawn', 'TAN', NULL,
            5490, 5490, 'ZANOTTI');
  INSERT INTO sales_order_shares VALUES ('${OLD_BILL}', '${WEI}', 0.5);
  INSERT INTO sales_order_lines(id, order_id, line_no, item_group, product_code, product_name, line_amount, cost_amount)
    VALUES ('${OLD_SOFA}', '${OLD_BILL}', 1, 'SOFA', '9058-2A(LHF)', 'Sofa 2A', 6000, 2607),
           (gen_random_uuid(), '${OLD_BILL}', 2, 'DELIVERY', 'DLV', 'Delivery', 150, NULL),
           (gen_random_uuid(), '${MY_BILL}', 1, 'SOFA', '9058-CNR', 'Sofa corner', 5490, 2000);
  INSERT INTO kpi_lines VALUES ('${OLD_SOFA}', 1, 100);
`)

// ── Production's bodies, as the migration was written from ─────────────────
await db.exec((await readFile(new URL('./old-bills-not-sales-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
const md5Of = name => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE proname = $1`, [name])
for (const [name, md5] of Object.entries(PRODUCTION)) check(await md5Of(name), md5, `the fixture is production’s ${name}`)

const FACT_COLUMNS = `order_no, staff_id::text AS staff, revenue::float8 AS revenue, kpi_qty::float8 AS kpi, cleared, margin_pct::float8 AS margin`
const facts = () => q(`SELECT ${FACT_COLUMNS} FROM member_order_facts($1, NULL, NULL) ORDER BY order_no, staff_id`, [SCHEME])
const arena = async name => {
  const r = await one(`SELECT ${name}($1, $2)`, [FAIR, SCHEME])
  return { orders: Number(r.unassignedOrders), sales: Number(r.unassignedSales) }
}
const book = (staff, from = MONTH, until = NEXT) =>
  one('SELECT member_order_book_for_staff($1, $2, $3::date, $4::date)', [staff, SCHEME, from, until])
const deptBook = (from = YM, until = YM) => one('SELECT member_principal_department_order_book($1, $2, $3)', [FAIR, from, until])
const numbers = b => b.orders.map(o => o.number)
const entry = (b, no) => b.orders.find(o => o.number === no)
const without = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
const flags = o => [o.commissionOnly, o.soldBy, 'commissionOnly' in o, 'soldBy' in o]
const NOT_FLAGGED = [undefined, undefined, false, false]

// Before: everything counts the old bill as a sale — Shawn's and Wei's halves of RM 5,900 (RM 6,000 less its KPI
// item), both Arena boards, both books.
const factsBefore = await facts()
check(factsBefore.map(f => [f.order_no, f.staff, f.revenue, f.kpi]), [
  ['HC-SO-010734', SHAWN, 2950, 0.5],
  ['HC-SO-010734', WEI, 2950, 0.5],
  ['HC-SO-2611-073', SHAWN, 5490, 0],
], 'production’s facts count the old bill as Shawn’s and Wei’s sales')
check(await arena('member_arena_history_for_staff'), { orders: 2, sales: 11390 }, 'and the Arena board too')
check(await arena('member_arena_booth_history_for_staff'), { orders: 2, sales: 11390 }, 'and the booth board too')
const before = { shawn: await book(SHAWN), wei: await book(WEI), anne: await book(ANNE), dept: await deptBook() }
check(numbers(before.shawn), ['HC-SO-010734', 'HC-SO-2611-073'], 'production’s book lists both of Shawn’s, by date')
check(numbers(before.dept), ['HC-SO-010734', 'HC-SO-2611-073'], 'and the department’s book both')
check(flags(entry(before.shawn, 'HC-SO-010734')), NOT_FLAGGED, 'production’s entries carry no flag')

// ── The migration, verbatim, twice ───────────────────────────────────────────
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const after = Object.fromEntries(await Promise.all(MADE.map(async name => [name, await md5Of(name)])))
await db.exec(migration)
for (const name of MADE) {
  check(await md5Of(name), after[name], `run again, ${name} is not made again`)
  check(migration.includes(`'${after[name]}'`), true, `the md5 the migration checks is the ${name} it makes`)
}

// ── The rule ─────────────────────────────────────────────────────────────────
const oldBill = (source, orderDate, period, floor) =>
  one('SELECT sales_order_old_bill($1, $2::date, $3::date, $4::date)', [source, orderDate, period, floor])
check(await oldBill('erp_sync', '2026-03-10', '2026-11-01', '2026-08-01'), true, 'dated before the window, in a month from it: an old bill')
check(await oldBill('erp_sync', '2026-08-15', '2026-08-01', '2026-08-01'), false, 'an August bill is not')
check(await oldBill('erp_sync', '2026-10-28', '2026-11-01', '2026-08-01'), false, 'an ordinary bill is not')
check(await oldBill('import', '2026-07-12', '2026-07-01', '2026-08-01'), false, 'a claim form’s row is not')
check(await oldBill('import', '2026-03-10', '2026-11-01', '2026-08-01'), false, 'nor is any row but the ERP’s')
check(await oldBill('erp_sync', '2026-03-10', '2026-11-01', null), false, 'no window: nothing is old')
check(await q(`SELECT provolatile::text AS volatile, prolang = (SELECT oid FROM pg_language WHERE lanname = 'sql') AS sql,
                      prosecdef AS definer, proconfig IS NULL AS no_set
                 FROM pg_proc WHERE proname = 'sales_order_old_bill'`),
  [{ volatile: 'i', sql: true, definer: false, no_set: true }], 'plain SQL, IMMUTABLE, no SET clause, not DEFINER: inlined, no call per row')
const may = (role, fn) => one(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, fn])
check([await may('anon', 'sales_order_old_bill(text, date, date, date)'), await may('authenticated', 'sales_order_old_bill(text, date, date, date)'),
       await may('service_role', 'sales_order_old_bill(text, date, date, date)')], [false, true, true], 'the rule: not anon’s to call')
check([await may('anon', 'member_order_facts_with_old_bills(uuid, date, date)'),
       await may('authenticated', 'member_order_facts_with_old_bills(uuid, date, date)'),
       await may('service_role', 'member_order_facts_with_old_bills(uuid, date, date)')], [false, false, true],
  'every bill, flagged: the service role’s and the DEFINER bodies’ only, never a session’s')

// ── After: never sales ───────────────────────────────────────────────────────
check(await facts(), factsBefore.filter(f => f.order_no !== 'HC-SO-010734'),
  'the facts leave the old bill out, every other row as it was: Shawn’s sales are his own bill’s, Wei has none')
check(await q(`SELECT ${FACT_COLUMNS}, old_bill FROM member_order_facts_with_old_bills($1, NULL, NULL) ORDER BY order_no, staff_id`, [SCHEME]),
  factsBefore.map(f => ({ ...f, old_bill: f.order_no === 'HC-SO-010734' })),
  'every bill, flagged: the old bill as it was read before, old_bill true')
check(await arena('member_arena_history_for_staff'), { orders: 1, sales: 5490 }, 'the Arena board leaves it out')
check(await arena('member_arena_booth_history_for_staff'), { orders: 1, sales: 5490 }, 'the booth board leaves it out')

// ── After: still seen — the bill it is, flagged — in both books ──────────────
const now = { shawn: await book(SHAWN), wei: await book(WEI), anne: await book(ANNE), dept: await deptBook() }
const flagged = was => ({ ...was, commissionOnly: true, soldBy: 'Junie' })
check(numbers(now.shawn), ['HC-SO-010734', 'HC-SO-2611-073'], 'Shawn’s book still lists the old bill, in its date’s place')
check(entry(now.shawn, 'HC-SO-010734'), flagged(entry(before.shawn, 'HC-SO-010734')),
  'as the entry it was, plus commissionOnly and soldBy (the ERP’s salesperson, trimmed)')
const oldOnShawn = entry(now.shawn, 'HC-SO-010734')
check([oldOnShawn.revenue, oldOnShawn.kpiQty, oldOnShawn.cleared, oldOnShawn.carried], [2950, 0.5, true, false],
  'every figure its own: his half of RM 5,900, half its KPI item, cleared, not carried')
check(oldOnShawn.lines.map(l => [l.code, l.goods, l.kpiQty]), [['9058-2A(LHF)', true, 0.5], ['DLV', false, 0]], 'its lines as ever')
check(oldOnShawn.share.holders.map(h => [h.name, h.pct, h.owner]), [['SHAWN', 0.5, true], ['WEI PIN', 0.5, false]], 'its holders as ever')
check(entry(now.shawn, 'HC-SO-2611-073'), entry(before.shawn, 'HC-SO-2611-073'), 'an ordinary bill exactly as it was — no flag')
check(without(now.shawn, 'asOf', 'orders', 'margins'), without(before.shawn, 'asOf', 'orders', 'margins'), 'the rest of the book as it was')
check(numbers(now.wei), ['HC-SO-010734'], 'Wei holds half of it: his book lists it too')
check(entry(now.wei, 'HC-SO-010734'), flagged(entry(before.wei, 'HC-SO-010734')), 'flagged the same')
check(entry(now.wei, 'HC-SO-010734').own, false, 'not his own bill')
check(numbers(now.anne), [], 'Anne holds none of it: not in her book')

check(numbers(now.dept), ['HC-SO-010734', 'HC-SO-2611-073'], 'the department’s book lists it too')
check(entry(now.dept, 'HC-SO-010734'), flagged(entry(before.dept, 'HC-SO-010734')), 'the whole bill, flagged the same')
check([entry(now.dept, 'HC-SO-010734').revenue, entry(now.dept, 'HC-SO-010734').kpiQty], [5900, 1], 'its own figures')
check(entry(now.dept, 'HC-SO-010734').seller, { id: SHAWN, name: 'SHAWN' }, 'on Shawn, who collected')
check(entry(now.dept, 'HC-SO-2611-073'), entry(before.dept, 'HC-SO-2611-073'), 'its ordinary bill exactly as it was')
check(without(now.dept, 'asOf', 'orders', 'margins'), without(before.dept, 'asOf', 'orders', 'margins'),
  'the rest of the department’s book as it was')

// The margins never include an old bill: the same as with no old bill at all.
await q('UPDATE sales_orders SET cancelled = true WHERE id = $1', [OLD_BILL])
const noOldBill = { shawn: await book(SHAWN), wei: await book(WEI), dept: await deptBook() }
await q('UPDATE sales_orders SET cancelled = false WHERE id = $1', [OLD_BILL])
check(now.shawn.margins, noOldBill.shawn.margins, 'Shawn’s margins: his own bill’s only')
check(now.wei.margins, noOldBill.wei.margins, 'Wei’s: none')
check(now.dept.margins, noOldBill.dept.margins, 'the department’s: the old bill not in them')
check(now.shawn.margins.overall !== before.shawn.margins.overall, true, '(it was in them before)')

// A bill is read as ever.
check(numbers(await book(SHAWN, PREV, MONTH)), [], 'landed this month: not in last month’s book')
check(numbers(await deptBook(PREV.slice(0, 7), PREV.slice(0, 7))), [], 'nor the department’s')
await q('UPDATE sales_orders SET paid_amount = 1000 WHERE id = $1', [OLD_BILL])
const below = entry(await book(SHAWN), 'HC-SO-010734')
check([below.cleared, below.commissionOnly], [false, true], 'RM 1,000 of a RM 1,800 deposit: listed, flagged, not cleared')
await q('UPDATE sales_orders SET paid_amount = 4000 WHERE id = $1', [OLD_BILL])
await q(`INSERT INTO sales_orders(id, batch_id, period_month, order_no, order_date, staff_id, agent_name, order_total, paid_amount)
         VALUES ($1, $2, $3, 'HC-SO-009001', '2026-04-02', $4, 'Junie', 300, 300)`, [NO_GOODS, BATCH, MONTH, SHAWN])
await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, line_amount) VALUES ($1, 1, 'DELIVERY', 'DLV', 300)`, [NO_GOODS])
check([numbers(await book(SHAWN)), numbers(await deptBook())].map(n => n.includes('HC-SO-009001')), [false, false],
  'an old bill with no goods on it is not listed, as no such bill is')
await q(`INSERT INTO sales_orders(id, batch_id, period_month, order_no, order_date, staff_id, agent_name, order_total, paid_amount,
           source, created_at)
         VALUES ($1, $2, $3, 'HC-SO-010734', '2026-03-10', $4, 'Junie', 6000, 6000, 'import', now() + interval '1 minute')`,
  [NEWER, BATCH, MONTH, SHAWN])
await q(`INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, line_amount, cost_amount)
         VALUES ($1, 1, 'SOFA', '9058-2A(LHF)', 6000, 2607)`, [NEWER])
const newest = (await book(SHAWN)).orders.filter(o => o.number === 'HC-SO-010734')
check(newest.map(flags), [NOT_FLAGGED],
  'a newer document of the bill that is not the ERP’s: the newest is read first, listed once, the old one never revived')
await q('DELETE FROM sales_order_lines WHERE order_id = ANY($1)', [[NEWER, NO_GOODS]])
await q('DELETE FROM sales_orders WHERE id = ANY($1)', [[NEWER, NO_GOODS]])

// A sub-department with no feed window has no old bills: a bill like any other again.
await q('DELETE FROM erp_feed_settings')
check(await facts(), factsBefore, 'no window: the facts count it')
check(await arena('member_arena_history_for_staff'), { orders: 2, sales: 11390 }, 'no window: the Arena board counts it')
check(await arena('member_arena_booth_history_for_staff'), { orders: 2, sales: 11390 }, 'no window: the booth board counts it')
const plain = await book(SHAWN)
check(plain.orders, before.shawn.orders, 'no window: the book exactly as it was')
check(plain.margins, before.shawn.margins, 'its margins too')
await q(`INSERT INTO erp_feed_settings VALUES ($1, '2026-08-01')`, [FAIR])

// ── The migration refuses a body it was not written from ─────────────────────
await db.exec(`CREATE OR REPLACE FUNCTION public.member_arena_history_for_staff(p_sub_department uuid, p_scheme uuid)
  RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END $$`)
await assert.rejects(db.exec(migration), /member_arena_history_for_staff\(uuid, uuid\) is md5 [0-9a-f]{32}, not the body this migration was written from/)
checks++

console.log(`validate-old-bills-not-sales: ${checks} checks passed`)

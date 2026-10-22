// Local PostgreSQL regression for 20261021240000 (2026-10-21 — the user: "i want start from october dy, help me recost
// together"). Comm Cal's "Recost the month from the Product List" could not finish Fair · October on production:
// recost_sales_order_lines ran as the caller, every line's costing was a query of its own under the caller's row
// policies, and 1,282 lines took 56 s against the 8 s a request may run. The migration makes it run as its owner,
// asking the caller what the app's gate asks (Revenue · Edit, the Orders page's box).
// Production's own bodies — recost_sales_order_lines (the repo's 20261006050000 copy, md5 f12258b5…, production's),
// commission_order_period_locked and tab_write_guard (share-bills-production.sql, md5-checked) — run over stand-ins
// for the tables they read and for the costing they call, which reads a price list under its own row policy. Before:
// the recost runs as the caller, a caller who cannot read a price costs its line as unpriced, and a caller the
// policies refuse gets a silent nothing. Then the migration runs VERBATIM, twice. After: it runs as its owner and is
// closed to anon; a login without Revenue · Edit, a sign-in with no portal account and a closed box are refused and
// nothing moves; an editor's recost prices every line from the whole list, exactly as the owner priced them before,
// leaves a hand-costed line alone, still refuses a paid month (23RUN), and a second run moves nothing. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex')
const migration = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const refused = async (fn, pattern, what) => {
  await assert.rejects(fn, pattern, what)
  checks++
}

/** The last CREATE of a function in a migration: the whole statement, and its body (what pg_proc.prosrc holds). */
function lastFunction(sql, name) {
  const re = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\s*\([\s\S]*?\bas\s+(\$\w*\$)`, 'gi')
  let m, found = null
  while ((m = re.exec(sql))) {
    const start = m.index + m[0].length
    const end = sql.indexOf(m[1], start)
    found = { statement: sql.slice(m.index, end + m[1].length) + ';', body: sql.slice(start, end) }
  }
  assert(found, `no CREATE FUNCTION ${name}`)
  return found
}

const SIG = 'public.recost_sales_order_lines(uuid,date)'
const FAIR = id(1)
const OCT = '2026-10-01'
const BATCH = id(10)
const ORDER_BED = id(20)
const ORDER_SOFA = id(21)
const U = { EDITOR: id(100), BLIND_EDITOR: id(101), SALES: id(102), CLOSED: id(103), NOBODY: id(199) }

async function as(user, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, null)
const recost = async () => (await q(`SELECT * FROM recost_sales_order_lines($1, $2)`, [FAIR, OCT]))[0]
const counts = r => [r.lines_costed, r.lines_still_blind, r.orders_with_cost]
/** Every line of the month as it stands — what a recost may move. */
const lines = async () => {
  await asSystem()
  return (await q(`SELECT product_code, cost_amount::float8 AS cost, list_cost_amount::float8 AS list, cost_source AS source,
                          option_charge_amount::float8 AS charge, cost_detail AS detail
                     FROM sales_order_lines ORDER BY product_code`))
}

try {
  // ── Supabase's roles, auth.uid(), the tables the recost reads ──────────────
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    CREATE TABLE sales_import_batches (id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL, status text NOT NULL);
    CREATE TABLE sales_orders (id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES sales_import_batches(id), erp_company_id bigint);
    CREATE TABLE sales_order_lines (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES sales_orders(id),
      product_code text NOT NULL, item_group text, description2 text, raw jsonb, qty numeric NOT NULL DEFAULT 1,
      cost_amount numeric, list_cost_amount numeric, cost_source text, cost_detail jsonb, option_charge_amount numeric);
    CREATE TABLE comm_runs (id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL, status text NOT NULL);
    CREATE TABLE comm_order_releases (run_id uuid NOT NULL REFERENCES comm_runs(id), sub_department_id uuid NOT NULL, order_period_month date NOT NULL);

    -- The Product List the costing reads, behind a row policy of its own (catalogue_skus / erp_products in production).
    CREATE TABLE test_prices (code text PRIMARY KEY, price numeric NOT NULL, charge numeric NOT NULL DEFAULT 0);

    -- Who holds what, the test's own stand-ins for the permission system.
    CREATE TABLE test_actions (uid uuid NOT NULL, action text NOT NULL);
    CREATE TABLE test_writers (uid uuid PRIMARY KEY);        -- the HR or admin scope and may_write('sales_order_lines', 'UPDATE')
    CREATE TABLE test_price_readers (uid uuid PRIMARY KEY);  -- may read the Product List's prices
    CREATE TABLE test_closed (uid uuid PRIMARY KEY);         -- a box on the Orders page unticked
    CREATE TABLE test_calls (fn text NOT NULL, order_id uuid NOT NULL, as_role text NOT NULL);

    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM test_actions a WHERE a.uid = auth.uid() AND a.action = ANY (p_wants)) $$;
    CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT NOT EXISTS (SELECT 1 FROM test_closed c WHERE c.uid = auth.uid()) $$;

    -- The costing the recost calls per line, reading the prices as whoever runs it.
    CREATE FUNCTION public.catalogue_line_cost(p_company bigint, p_code text, p_item_group text, p_description2 text,
                                               p_raw jsonb, p_qty numeric)
    RETURNS TABLE(cost numeric, unit_price numeric, surcharge numeric, detail jsonb) LANGUAGE plpgsql STABLE AS $$
    DECLARE v numeric;
    BEGIN
      SELECT p.price INTO v FROM test_prices p WHERE p.code = p_code;
      IF v IS NULL THEN
        detail := jsonb_build_object('reason', 'unpriced');
        RETURN NEXT;
        RETURN;
      END IF;
      cost := round(v * p_qty, 2); unit_price := v; surcharge := 0; detail := jsonb_build_object('how', 'price', 'unit', v);
      RETURN NEXT;
    END $$;
    CREATE FUNCTION public.catalogue_line_option_charge(p_company bigint, p_code text, p_item_group text, p_description2 text,
                                                        p_raw jsonb, p_qty numeric)
    RETURNS TABLE(amount numeric, unit numeric, parts jsonb) LANGUAGE plpgsql STABLE AS $$
    DECLARE v numeric;
    BEGIN
      SELECT p.charge INTO v FROM test_prices p WHERE p.code = p_code AND upper(coalesce(p_item_group, '')) = 'BEDFRAME';
      unit := coalesce(v, 0); amount := round(coalesce(v, 0) * p_qty, 2);
      parts := CASE WHEN coalesce(v, 0) > 0 THEN jsonb_build_array(jsonb_build_object('option', 'divan', 'charge', v)) ELSE '[]'::jsonb END;
      RETURN NEXT;
    END $$;
    -- Production's body (md5 checked below).
    CREATE FUNCTION public.catalogue_cost_detail_with_charges(p_detail jsonb, p_charges jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN jsonb_typeof(p_charges) = 'array' AND jsonb_array_length(p_charges) > 0
                THEN COALESCE(p_detail, '{}'::JSONB) || jsonb_build_object('charges', p_charges)
                ELSE p_detail END;
$$;
    CREATE FUNCTION public.catalogue_apply_combos(p_order uuid) RETURNS integer LANGUAGE sql AS
      $$ INSERT INTO test_calls VALUES ('catalogue_apply_combos', p_order, current_user) RETURNING 0 $$;
    CREATE FUNCTION public.catalogue_apply_sofa_charges(p_order uuid) RETURNS integer LANGUAGE sql AS
      $$ INSERT INTO test_calls VALUES ('catalogue_apply_sofa_charges', p_order, current_user) RETURNING 0 $$;

    -- The row policies the recost met as the caller (production: the HR or admin scope, may_write / may_read).
    ALTER TABLE sales_import_batches ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE test_prices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY batches_writers ON sales_import_batches FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM test_writers w WHERE w.uid = auth.uid()));
    CREATE POLICY orders_writers ON sales_orders FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM test_writers w WHERE w.uid = auth.uid()));
    CREATE POLICY lines_writers ON sales_order_lines FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM test_writers w WHERE w.uid = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM test_writers w WHERE w.uid = auth.uid()));
    CREATE POLICY prices_readers ON test_prices FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM test_price_readers r WHERE r.uid = auth.uid()));
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT SELECT ON sales_import_batches, sales_orders, test_prices, comm_runs, comm_order_releases,
                    test_actions, test_writers, test_price_readers, test_closed TO authenticated;
    GRANT SELECT, UPDATE ON sales_order_lines TO authenticated;
    GRANT INSERT ON test_calls TO authenticated;
  `)
  check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'catalogue_cost_detail_with_charges'`),
    '092506992c0dbc4498002037c69d23bf', 'catalogue_cost_detail_with_charges: production\'s body')

  // ── Production's bodies ──────────────────────────────────────────────────
  const production = (await readFile(new URL('./share-bills-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
  for (const block of production.split(/\n(?=-- [a-z_]+\()/)) {
    const name = /^-- ([a-z_]+)\(/.exec(block)?.[1]
    if (name === 'commission_order_period_locked' || name === 'tab_write_guard') await db.exec(block)
  }
  check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'tab_write_guard'`), 'bc874286994bf99cc0d07257b6131fb4',
    'tab_write_guard: production\'s body')
  const recostFn = lastFunction(await migration('20261006050000_option_prices_are_charges'), 'recost_sales_order_lines')
  check(md5(recostFn.body), 'f12258b5ae7ccdb4f4dd86f961531225', 'recost_sales_order_lines: the repo\'s last copy is production\'s body')
  await db.exec(recostFn.statement)

  // ── The people, the month, its bills ─────────────────────────────────────
  await db.exec(`
    INSERT INTO test_actions VALUES ('${U.EDITOR}', 'revenue.edit'), ('${U.BLIND_EDITOR}', 'revenue.edit'), ('${U.CLOSED}', 'revenue.edit'),
                                    ('${U.SALES}', 'revenue_app.view');
    INSERT INTO test_writers VALUES ('${U.EDITOR}'), ('${U.BLIND_EDITOR}'), ('${U.CLOSED}');
    INSERT INTO test_price_readers VALUES ('${U.EDITOR}'), ('${U.CLOSED}');
    INSERT INTO test_closed VALUES ('${U.CLOSED}');
    INSERT INTO test_prices VALUES ('MATT', 1000, 0), ('BED', 500, 50), ('SOFA-1A', 300, 0);
    INSERT INTO sales_import_batches VALUES ('${BATCH}', '${FAIR}', '${OCT}', 'committed');
    INSERT INTO sales_orders VALUES ('${ORDER_BED}', '${BATCH}', 1), ('${ORDER_SOFA}', '${BATCH}', 1);
    INSERT INTO sales_order_lines (order_id, product_code, item_group, qty, cost_amount, list_cost_amount, cost_source, option_charge_amount) VALUES
      ('${ORDER_BED}', 'MATT', 'MATTRESS', 1, NULL, NULL, NULL, 0),
      ('${ORDER_BED}', 'BED', 'BEDFRAME', 2, NULL, NULL, NULL, 0),
      ('${ORDER_BED}', 'HAND', 'MATTRESS', 1, 77, 77, 'manual', 0),
      ('${ORDER_SOFA}', 'SOFA-1A', 'SOFA', 2, NULL, NULL, NULL, 0);
  `)
  const untouched = await lines()
  const reset = async () => {
    await asSystem()
    await db.exec(`UPDATE sales_order_lines SET cost_amount = NULL, list_cost_amount = NULL, cost_source = NULL, cost_detail = NULL,
                     option_charge_amount = 0 WHERE cost_source IS DISTINCT FROM 'manual'; DELETE FROM test_calls;`)
    check(await lines(), untouched, 'the month is back as it landed')
  }

  // ── Before: it runs as the caller ────────────────────────────────────────
  await asSystem()
  check(await one(`SELECT prosecdef FROM pg_proc WHERE oid = $1::regprocedure`, [SIG]), false, 'before: the recost runs as the caller')
  check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [SIG]), true, 'before: anon may call it — harmless while it ran as the caller')

  // What the owner makes of the month: the answer an editor's recost must give after the migration.
  check(counts(await recost()), [3, 0, 2], 'the owner prices the three lines the list names; every bill is fully costed')
  const byOwner = await lines()
  check(byOwner.map(l => [l.product_code, l.cost, l.source, l.charge]), [
    ['BED', 1000, 'catalogue', 100],
    ['HAND', 77, 'manual', 0],
    ['MATT', 1000, 'catalogue', 0],
    ['SOFA-1A', 600, 'catalogue', 0],
  ], 'the owner: each line at its price × qty, the bed frame\'s option charged, the hand-costed line left alone')
  check(await q(`SELECT fn, order_id FROM test_calls ORDER BY fn`), [
    { fn: 'catalogue_apply_combos', order_id: ORDER_SOFA }, { fn: 'catalogue_apply_sofa_charges', order_id: ORDER_SOFA },
  ], 'the sofa bill\'s sets and charges are applied, once each')
  await reset()

  await as(U.BLIND_EDITOR)
  check(counts(await recost()), [0, 3, 0], 'before: an editor who cannot read a price…')
  check((await lines()).filter(l => l.source !== 'manual').map(l => [l.product_code, l.cost, l.source, l.detail?.reason]), [
    ['BED', null, null, 'unpriced'], ['MATT', null, null, 'unpriced'], ['SOFA-1A', null, null, 'unpriced'],
  ], '…costs every line as unpriced: the costing depended on who pressed')
  await reset()

  await as(U.SALES)
  check(counts(await recost()), [0, 0, 0], 'before: a caller the policies refuse gets a silent nothing')
  check(await lines(), untouched, 'and nothing moved')

  // ── The migration, verbatim, twice ───────────────────────────────────────
  await asSystem()
  const sql = await migration('20261021240000_recost_runs_as_its_owner')
  await db.exec(sql)
  const after = {
    md5: await one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = $1::regprocedure`, [SIG]),
    definer: await one(`SELECT prosecdef FROM pg_proc WHERE oid = $1::regprocedure`, [SIG]),
    config: await one(`SELECT proconfig FROM pg_proc WHERE oid = $1::regprocedure`, [SIG]),
    anon: await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [SIG]),
    authenticated: await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [SIG]),
  }
  check(after, { md5: '9a9f5cf1a8f6e476c603f67b60b23621', definer: true, config: ['search_path=public'], anon: false, authenticated: true },
    'after: the file\'s body, running as its owner, closed to anon and open to a sign-in')
  check(await one(`SELECT strpos(prosrc, $2) > 0 FROM pg_proc WHERE oid = $1::regprocedure`,
    [SIG, "PERFORM public.tab_write_guard(ARRAY['/revenue/[sub]/[period]/orders'], ARRAY['revenue.edit']);"]), true,
    'it asks the Orders page\'s box, as the app\'s gate does')
  await db.exec(sql)
  check(await one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = $1::regprocedure`, [SIG]), after.md5,
    'running the migration again changes nothing')

  // ── After: the caller is asked first ─────────────────────────────────────
  await as(U.SALES)
  await refused(recost, e => e.code === '42501' && /Revenue · Edit/.test(e.message), 'a login without Revenue · Edit is refused')
  await as(U.NOBODY)
  await refused(recost, e => e.code === '42501', 'a sign-in with no portal account is refused')
  await as(U.CLOSED)
  await refused(recost, e => e.code === '42501' && /box in your permissions is unticked/.test(e.message),
    'an editor whose box on the Orders page is unticked is refused')
  await as(null, 'anon')
  await refused(recost, e => e.code === '42501' && /permission denied/.test(e.message), 'anon may not call it')
  check(await lines(), untouched, 'and nothing moved')

  // ── After: an editor's recost is the owner's ─────────────────────────────
  await as(U.BLIND_EDITOR)
  check(counts(await recost()), [3, 0, 2], 'an editor who cannot read the prices recosts the month…')
  check(await lines(), byOwner, '…exactly as the owner priced it: the whole list, whoever presses')
  await asSystem()
  check(await q(`SELECT fn, order_id, as_role FROM test_calls ORDER BY fn`), [
    { fn: 'catalogue_apply_combos', order_id: ORDER_SOFA, as_role: 'postgres' },
    { fn: 'catalogue_apply_sofa_charges', order_id: ORDER_SOFA, as_role: 'postgres' },
  ], 'the sofa bill\'s sets and charges run as the owner too')

  await as(U.EDITOR)
  check(counts(await recost()), [0, 0, 2], 'a second recost with nothing changed moves nothing')
  check(await lines(), byOwner, 'and the month stands as it was')

  await asSystem()
  await db.exec(`INSERT INTO comm_runs VALUES ('${id(30)}', '${FAIR}', '${OCT}', 'applied')`)
  await db.exec(`UPDATE test_prices SET price = 1200 WHERE code = 'MATT'`)
  await as(U.EDITOR)
  await refused(recost, e => e.code === '23RUN', 'a month whose run has paid is still refused (23RUN)')
  check((await lines()).find(l => l.product_code === 'MATT').cost, 1000, 'and the new price reached nothing')

  console.log(`validate-recost-runs-as-owner: ${checks} checks passed`)
} finally {
  await db.close()
}

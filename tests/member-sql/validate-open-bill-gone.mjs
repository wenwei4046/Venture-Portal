// Local PostgreSQL regression for 20261031210000 (2026-10-31 — the user: "deltet the open bill in revenue team, cause
// this rules is no longer needed, anythigns related to this, may delete as well").
// Production's ten bodies the migration makes again, and the four it drops (tests/member-sql/open-bill-gone-production.sql,
// read with pg_get_functiondef, md5-checked), are loaded over stand-ins for what they read; the migration then runs
// VERBATIM, twice. Under test: each body ends as production's with its Open Bill statements cut and nothing else (the md5
// it ends at); they still run once Open Bill's tables are gone — a bill taken out and counted again, moved and moved back,
// a month's bills read (the same, less the rank), a file import committed; what only Open Bill used is gone, its registry
// lines with it; a statement tallies the five parts left; and the migration refuses a body it was not written from, and a
// statement that paid Open Bill. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261031210000_open_bill_gone.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(1), FS = id(2), AUG_BATCH = id(3), OCT_BATCH = id(4), NOV_FILE = id(5), DRAFT = id(6), HR = id(7)
const LUCAS = id(11), BEN = id(12)
const A1 = id(21), A2 = id(22), O1 = id(23), O2 = id(24), D1 = id(25)
const AUG = '2026-08-01', OCT = '2026-10-01', NOV = '2026-11-01'
const GONE_TABLES = ['sales_order_open_bill_tags', 'comm_open_bill_months', 'comm_open_bill_rules']

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

  -- ── Stand-ins for what production's bodies read, Open Bill's own as production has them ──
  CREATE TYPE public.comm_open_bill_basis AS ENUM ('uplift_on_commission', 'pct_of_revenue');
  CREATE TYPE public.comm_run_status AS ENUM ('draft', 'computed', 'applied', 'locked');
  CREATE TABLE public.users(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text, employee_code text);
  CREATE TABLE public.comm_sub_departments(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, enable_kpi boolean NOT NULL DEFAULT false,
    deposit_threshold_pct numeric, revenue_cost_divisor numeric,
    enable_open_bill boolean NOT NULL DEFAULT false,
    open_bill_basis public.comm_open_bill_basis NOT NULL DEFAULT 'uplift_on_commission');
  CREATE TABLE public.comm_open_bill_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, bill_rank smallint, uplift_pct numeric);
  CREATE TABLE public.comm_open_bill_months(sub_department_id uuid, period_month date, enabled boolean NOT NULL,
    set_by uuid, set_by_name text, set_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (sub_department_id, period_month));
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, period_month date, source text,
    status text, superseded_at timestamptz);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, source text NOT NULL, order_no text NOT NULL,
    order_date date NOT NULL, event_date date NOT NULL, period_month date NOT NULL, customer_name text, debtor_code text,
    venue text, location text, brand_code text, order_total numeric NOT NULL, paid_amount numeric, balance numeric,
    cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text, erp_on_hold boolean NOT NULL DEFAULT false,
    sequence_in_day integer, staff_id uuid, agent_name text, agent_key text, erp_salesperson_id text, manual_margin_pct numeric);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, product_code text,
    item_group text, brand_code text, line_amount numeric, cost_amount numeric, option_charge_amount numeric);
  CREATE TABLE public.sales_order_open_bill_tags(order_id uuid PRIMARY KEY, sub_department_id uuid, staff_id uuid,
    event_date date, bill_rank smallint NOT NULL, auto_suggested boolean NOT NULL DEFAULT false, tagged_by uuid,
    tagged_at timestamptz NOT NULL DEFAULT now(), UNIQUE (sub_department_id, staff_id, event_date, bill_rank));
  CREATE TABLE public.sales_order_exclusions(order_id uuid PRIMARY KEY, note text,
    open_bill_rank smallint, open_bill_auto boolean, open_bill_tagged_by uuid, open_bill_tagged_at timestamptz,
    excluded_by uuid, excluded_by_name text, excluded_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sales_order_exclusions_rank CHECK (open_bill_rank IS NULL OR open_bill_rank BETWEEN 1 AND 3));
  CREATE TABLE public.sales_order_reassignments(order_id uuid PRIMARY KEY, staff_id uuid, from_staff_id uuid, note text,
    open_bill_rank smallint, open_bill_auto boolean, open_bill_tagged_by uuid, open_bill_tagged_at timestamptz,
    share_taken_pct numeric, share_taken_by uuid, share_taken_at timestamptz, moved_by uuid, moved_by_name text,
    moved_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric, created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (order_id, staff_id));
  CREATE TABLE public.comm_agent_aliases(agent_key text, erp_salesperson_id text, staff_id uuid);
  CREATE TABLE public.comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE public.comm_cost_ratios(scheme_id uuid, product_code text, ratio numeric);
  CREATE TABLE public.comm_venues(venue_key text PRIMARY KEY, canonical_key text, display_name text);
  CREATE TABLE public.comm_venue_events(venue_key text, period_month date, start_date date, organiser_id uuid);
  CREATE TABLE public.comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.comm_statements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid,
    product_commission numeric NOT NULL DEFAULT 0, kpi_commission numeric NOT NULL DEFAULT 0,
    open_bill_bonus numeric NOT NULL DEFAULT 0, override_commission numeric NOT NULL DEFAULT 0,
    margin_incentive numeric NOT NULL DEFAULT 0, group_incentive numeric NOT NULL DEFAULT 0,
    total_commission numeric NOT NULL DEFAULT 0,
    CONSTRAINT components_tally CHECK ((abs((total_commission - (((((product_commission + kpi_commission) + open_bill_bonus) + override_commission) + margin_incentive) + group_incentive))) <= 0.01)));
  CREATE TABLE public.comm_salesperson_closes(staff_id uuid, order_ids uuid[]);
  CREATE TABLE public.comm_upsales(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE public.permission_table_reads(table_name text PRIMARY KEY, actions text[]);
  CREATE TABLE public.permission_table_writes(table_name text, command text, actions text[], PRIMARY KEY (table_name, command));
  CREATE TABLE public.audit_tables(table_name text PRIMARY KEY, label text, area text, mode text, read_keys text[]);
  CREATE TABLE public.permission_page_tabs(page text, tab_id text, PRIMARY KEY (page, tab_id));

  -- What the bodies call: the day's renumbering and the batch's counters are written down, to be seen called.
  CREATE TABLE public.calls(n serial, fn text, args text);
  CREATE TABLE public.locked_months(sub_department_id uuid, period_month date);
  CREATE FUNCTION public.has_any_action(text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.lock_commission_order_periods(uuid, date[]) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
  CREATE FUNCTION public.commission_order_period_locked(uuid, date) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM public.locked_months m WHERE m.sub_department_id = $1 AND m.period_month = $2) $$;
  CREATE FUNCTION public.sales_order_excluded_by_hand(uuid) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM public.sales_order_exclusions e WHERE e.order_id = $1) $$;
  CREATE FUNCTION public.erp_sync_resequence_day(text, date) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.calls (fn, args) VALUES ('resequence', $1 || ' ' || $2::text) $$;
  CREATE FUNCTION public.erp_sync_refresh_batch(uuid) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.calls (fn, args) VALUES ('refresh', $1::text) $$;
  CREATE FUNCTION public.erp_feed_month_closed(uuid, date) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.erp_sync_sub_department() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${FAIR}'::uuid $$;
  CREATE FUNCTION public.venue_key(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim($1)) $$;
  CREATE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
  RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric) LANGUAGE sql STABLE AS
    $$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, NULL::numeric, NULL::numeric WHERE false $$;
  CREATE FUNCTION public.ref_no(public.sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT $1.debtor_code $$;
  CREATE FUNCTION public.paper_no(public.sales_orders) RETURNS text LANGUAGE sql STABLE AS $$ SELECT lower($1.debtor_code) $$;
  -- As production's triggers do: a bill taken out stops counting, a move makes it the new holder's.
  CREATE FUNCTION public.exclusions_apply() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      UPDATE public.sales_orders SET cancelled = true, excluded_reason = 'by_hand' WHERE id = NEW.order_id;
      RETURN NEW;
    END IF;
    UPDATE public.sales_orders SET cancelled = false, excluded_reason = NULL WHERE id = OLD.order_id;
    RETURN OLD;
  END $$;
  CREATE TRIGGER sales_order_exclusions_apply AFTER INSERT OR DELETE ON public.sales_order_exclusions
    FOR EACH ROW EXECUTE FUNCTION public.exclusions_apply();
  CREATE FUNCTION public.reassignments_apply() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      UPDATE public.sales_orders SET staff_id = OLD.from_staff_id WHERE id = OLD.order_id;
      RETURN OLD;
    END IF;
    UPDATE public.sales_orders SET staff_id = NEW.staff_id WHERE id = NEW.order_id;
    RETURN NEW;
  END $$;
  CREATE TRIGGER sales_order_reassignments_apply AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_reassignments
    FOR EACH ROW EXECUTE FUNCTION public.reassignments_apply();
`)

// ── Production's own bodies (md5 of each body as production reported it on 2026-10-31) ──
const PROD = {
  'public.commit_sales_import_batch(uuid, boolean)': '28be945a8451c7196269d747e155dc90',
  'public.ingest_erp_sales_order(jsonb, uuid)': '400c57fc7e3479f07bb401e18ede78b7',
  'public.match_erp_salesperson(text, text, uuid)': '54d8c49d60e1338179c3c72264c520d7',
  'public.member_data_snapshot(boolean)': 'f5568e775511d6bae5326a71faa3e2e7',
  'public.member_principal_snapshot(boolean)': 'cff3805f5798d456ec36a7189f84096d',
  'public.revenue_exclude_order(uuid, text)': '7ee04244a6240b640f22f6fefdf5dff9',
  'public.revenue_include_order(uuid)': '031c10a95cfe299c9ffac48bcf52698b',
  'public.revenue_month_orders(uuid, date)': 'deac7a5e90e893c978d446613de6b3fe',
  'public.revenue_move_order(uuid, uuid, text)': 'b0e138911666f3bbc20f54a56036b66d',
  'public.save_commission_run(date, uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, jsonb, jsonb)': '93830a226afca5b1525ab22c9149aeb1',
}
const DROPPED = {
  'public.comm_open_bill_on(uuid, date)': 'dc569f985bed8077234cef91a082eb22',
  'public.erp_sync_suggest_open_bill_days(uuid, date[])': 'caf050783af196e36b83450787782f86',
  'public.erp_sync_suggest_open_bills(uuid, date)': 'fb894c6b440f5be52c8ee0338054eb23',
  'public.guard_open_bill_scope()': 'bad6ac313210b022438280511338626f',
}
const md5Of = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
const md5s = async sigs => Object.fromEntries(await Promise.all(Object.keys(sigs).map(async s => [s, await md5Of(s)])))
const production = (await readFile(new URL('./open-bill-gone-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
const blocks = Object.fromEntries(production.split(/\n(?=-- [a-z_]+\(\) md5 [0-9a-f]{32}\n)/).slice(1)
  .map(b => [b.match(/^-- ([a-z_]+)\(\)/)[1], b]))
for (const block of Object.values(blocks)) await db.exec(block)
check(await md5s(PROD), PROD, "the ten bodies are production's")
check(await md5s(DROPPED), DROPPED, "the four it drops are production's")
await db.exec(`
  CREATE TRIGGER sales_order_open_bill_tags_scope BEFORE INSERT OR UPDATE ON public.sales_order_open_bill_tags
    FOR EACH ROW EXECUTE FUNCTION public.guard_open_bill_scope();
  -- As production grants them.
  REVOKE ALL ON FUNCTION public.commit_sales_import_batch(uuid, boolean) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.commit_sales_import_batch(uuid, boolean) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.revenue_month_orders(uuid, date) TO anon, authenticated, service_role;
  COMMENT ON FUNCTION public.commit_sales_import_batch(uuid, boolean) IS
    'Commits a staged file import as its month''s batch, retiring the one before. A month fed live by the ERP refuses, unless it is closed to the feed (erp_feed_closed_months).';
  COMMENT ON FUNCTION public.revenue_month_orders(uuid, date) IS 'A month''s sales orders as the commission engine reads them: … the Open Bill rank, the deposit-gate verdict …';
  COMMENT ON FUNCTION public.revenue_move_order(uuid, uuid, text) IS 'Move one bill … its Open Bill pick goes, remembered, and comes back on the move back while the rank is free.';
  COMMENT ON TABLE public.comm_upsales IS 'Not a bill — no Open Bill, KPI, margin or deposit gate.';
  COMMENT ON TABLE public.sales_order_open_bill_tags IS 'The Open Bill picks.';
  COMMENT ON COLUMN public.sales_order_reassignments.open_bill_rank IS 'Put back by revenue_move_order when the bill is moved back.';
  COMMENT ON COLUMN public.comm_salesperson_closes.order_ids IS 'an Open Bill pick, share, exclusion or keyed margin on one of them is refused while this close stands.';

  -- ── Fair: August paid Open Bill (switched on for the month), October does not ──
  INSERT INTO public.users (id, name) VALUES ('${HR}', 'HR');
  INSERT INTO public.hr_staff_costs VALUES ('${LUCAS}', 'LUCAS', 'R001'), ('${BEN}', 'BEN', 'R002');
  INSERT INTO public.comm_sub_departments VALUES ('${FAIR}', 'Fair');
  INSERT INTO public.comm_schemes (id, sub_department_id, deposit_threshold_pct, revenue_cost_divisor) VALUES ('${FS}', '${FAIR}', 0.3, 0.7);
  INSERT INTO public.comm_open_bill_rules (scheme_id, bill_rank, uplift_pct) VALUES ('${FS}', 1, 0.5), ('${FS}', 2, 0.4), ('${FS}', 3, 0.3);
  INSERT INTO public.comm_open_bill_months (sub_department_id, period_month, enabled, set_by_name) VALUES ('${FAIR}', '${AUG}', true, 'Principal');
  INSERT INTO public.comm_item_groups VALUES ('${FS}', 'mattress', true);
  INSERT INTO public.comm_agent_aliases VALUES ('lucas', NULL, '${LUCAS}'), ('ben', NULL, '${BEN}');
  INSERT INTO public.sales_import_batches VALUES
    ('${AUG_BATCH}', '${FAIR}', '${AUG}', 'erp_sync', 'committed', NULL), ('${OCT_BATCH}', '${FAIR}', '${OCT}', 'erp_sync', 'committed', NULL),
    ('${NOV_FILE}', '${FAIR}', '${NOV}', 'file', 'committed', NULL), ('${DRAFT}', '${FAIR}', '${NOV}', 'file', 'draft', NULL);
  INSERT INTO public.sales_orders (id, batch_id, source, order_no, order_date, event_date, period_month, venue, brand_code,
      order_total, paid_amount, balance, sequence_in_day, staff_id, agent_name, agent_key, debtor_code) VALUES
    ('${A1}', '${AUG_BATCH}', 'erp_sync', 'HC-SO-2608-001', '2026-08-08', '2026-08-08', '${AUG}', 'Mid Valley', 'AKEMI', 3000, 3000, 0, 1, '${LUCAS}', 'LUCAS', 'lucas', 'C-1'),
    ('${A2}', '${AUG_BATCH}', 'erp_sync', 'HC-SO-2608-002', '2026-08-08', '2026-08-08', '${AUG}', 'Mid Valley', 'AKEMI', 2000, 2000, 0, 2, '${LUCAS}', 'LUCAS', 'lucas', 'C-2'),
    ('${O1}', '${OCT_BATCH}', 'erp_sync', 'HC-SO-2610-001', '2026-10-03', '2026-10-03', '${OCT}', 'IOI', 'AKEMI', 4000, 4000, 0, 1, '${LUCAS}', 'LUCAS', 'lucas', 'C-3'),
    ('${O2}', '${OCT_BATCH}', 'erp_sync', 'HC-SO-2610-002', '2026-10-03', '2026-10-03', '${OCT}', 'IOI', 'AKEMI', 1000, 500, 500, 1, '${BEN}', 'BEN', 'ben', 'C-4'),
    ('${D1}', '${DRAFT}', 'file', 'HC-SO-2611-001', '2026-11-02', '2026-11-02', '${NOV}', 'IOI', 'AKEMI', 1500, 1500, 0, 1, '${BEN}', 'BEN', 'ben', 'C-5');
  INSERT INTO public.sales_order_lines (order_id, product_code, item_group, brand_code, line_amount, cost_amount, option_charge_amount) VALUES
    ('${A1}', 'M1', 'mattress', 'AKEMI', 3000, 1050, 0), ('${A2}', 'M1', 'mattress', 'AKEMI', 2000, 700, 0),
    ('${O1}', 'M1', 'mattress', 'AKEMI', 4000, 1400, 0), ('${O2}', 'M2', 'mattress', 'AKEMI', 1000, NULL, 0);
  -- August's picks: LUCAS's first bill of the day suggested, his second picked by hand.
  INSERT INTO public.sales_order_open_bill_tags (order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by) VALUES
    ('${A1}', '${LUCAS}', '2026-08-08', 1, true, NULL), ('${A2}', '${LUCAS}', '2026-08-08', 2, false, '${HR}');

  INSERT INTO public.permission_table_reads VALUES ('sales_order_open_bill_tags', '{revenue.view:own}'),
    ('comm_open_bill_months', '{revenue.edit}'), ('comm_open_bill_rules', '{revenue.edit}'), ('sales_orders', '{revenue.view:own}');
  INSERT INTO public.permission_table_writes VALUES ('sales_order_open_bill_tags', 'INSERT', '{revenue.edit}'),
    ('sales_order_open_bill_tags', 'DELETE', '{revenue.edit}'), ('comm_open_bill_months', 'INSERT', '{revenue.manage}'),
    ('comm_open_bill_rules', 'UPDATE', '{revenue.manage}'), ('sales_orders', 'UPDATE', '{revenue.edit}');
  INSERT INTO public.audit_tables VALUES ('sales_order_open_bill_tags', 'Open Bill picks', 'Revenue', 'people', '{}'),
    ('comm_open_bill_months', 'Open Bill by month', 'Revenue', 'all', '{}'), ('comm_open_bill_rules', 'Open Bill rules', 'Revenue', 'all', '{}'),
    ('sales_orders', 'Sales orders', 'Revenue', 'people', '{}');
  INSERT INTO public.permission_page_tabs VALUES ('/revenue/[sub]/[period]/open-bill', 'hr.comm-cal'), ('/revenue/[sub]/[period]', 'hr.comm-cal');
`)
await db.exec(`SET test.uid = '${HR}'`)

const month = period => q(`SELECT * FROM public.revenue_month_orders($1, $2)`, [FAIR, period])
const tags = () => q(`SELECT order_id, bill_rank, auto_suggested FROM public.sales_order_open_bill_tags ORDER BY bill_rank`)
const calls = async () => (await q(`DELETE FROM public.calls RETURNING n, fn, args`)).sort((a, b) => a.n - b.n).map(c => `${c.fn} ${c.args}`)

// ── Before: production's bodies, Open Bill live in August ──
const augBefore = await month(AUG)
check(augBefore.map(r => [r.order_no, r.open_bill_rank, r.open_bill_auto]), [['HC-SO-2608-001', 1, true], ['HC-SO-2608-002', 2, false]],
  "before: August's bills carry their Open Bill rank")
const octBefore = await month(OCT)
check(await one(`SELECT public.revenue_exclude_order($1, 'not ours')`, [A2]), { orderNo: 'HC-SO-2608-002', changed: true, openBillRank: 2 },
  'before: taking out a picked bill in August takes its pick with it')
check(await tags(), [{ order_id: A1, bill_rank: 1, auto_suggested: true }], 'before: the pick left with the bill')
check(await one(`SELECT public.revenue_include_order($1)`, [A2]),
  { orderNo: 'HC-SO-2608-002', changed: true, counts: true, stillOut: null, openBillRank: 2 }, 'before: counting it again brings the pick back')
check((await tags()).map(t => t.bill_rank), [1, 2], 'before: both picks')
await calls()

// ── Refused: a body changed since this was written, and a statement that paid Open Bill ──
await db.exec(`DO $$ BEGIN EXECUTE replace(pg_get_functiondef('public.revenue_include_order(uuid)'::regprocedure),
  '-- (sales_order_exclusions_apply has handed', '-- (changed on the database) (sales_order_exclusions_apply has handed'); END $$`)
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await assert.rejects(db.exec(migration), /revenue_include_order\(uuid\) is md5 [0-9a-f]+, not the body this migration was written from/,
  'a body changed since production was read is refused')
checks++
await db.exec(`ROLLBACK`)
await db.exec(blocks.revenue_include_order)
await db.exec(`INSERT INTO public.comm_statements (staff_id, product_commission, open_bill_bonus, total_commission) VALUES ('${LUCAS}', 100, 50, 150)`)
await assert.rejects(db.exec(migration), /A run's statement pays Open Bill/, 'a statement that paid Open Bill is refused')
checks++
await db.exec(`ROLLBACK`)
await db.exec(`DELETE FROM public.comm_statements`)
check(await md5s(PROD), PROD, 'refused, nothing moved')
check(await one(`SELECT count(*)::int FROM public.sales_order_open_bill_tags`), 2, 'refused, the picks still there')

// ── The migration, twice ──
const AFTER = {
  'public.commit_sales_import_batch(uuid)': '979e81e46e655fec202496e06c72d162',
  'public.ingest_erp_sales_order(jsonb, uuid)': 'd08d228c1fa90d19379cc31b027f20f7',
  'public.match_erp_salesperson(text, text, uuid)': '329166e304cfc822221e946b34499531',
  'public.member_data_snapshot(boolean)': '71c6ee7c1b7e75628fac34051f634466',
  'public.member_principal_snapshot(boolean)': '393e371ea1c3494b3a228148f8a0d03b',
  'public.revenue_exclude_order(uuid, text)': 'fcb2c81ab4ce49553572f1a9fc43b5db',
  'public.revenue_include_order(uuid)': '278effab1bdc0448a73f4c998945646e',
  'public.revenue_month_orders(uuid, date)': '3cca3cc89e13641177d59dfb8718522e',
  'public.revenue_move_order(uuid, uuid, text)': 'e8657c774eb710c193fdc8ea984fcac4',
  'public.save_commission_run(date, uuid, uuid, uuid, numeric, jsonb, jsonb, jsonb, jsonb, jsonb)': '3ce5d4e30d0b5d6878c205fe29427ba0',
}
await db.exec(migration)
check(await md5s(AFTER), AFTER, "each body production's with its Open Bill statements cut — nothing else")
await db.exec(migration)
check(await md5s(AFTER), AFTER, 'the second run changes nothing')
check(await one(`SELECT to_regprocedure('public.commit_sales_import_batch(uuid, boolean)') IS NULL`), true, 'the import commits with no Open Bill switch')
check(await one(`SELECT pg_get_function_result('public.commit_sales_import_batch(uuid)'::regprocedure)`), 'void', '…and answers nothing')
const left = await q(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ~* 'open[ _]?bill' ORDER BY 1`)
check(left, [], 'no body says Open Bill')

// ── Gone: what only Open Bill used, and its lines in the registries ──
check(await one(`SELECT array_agg(t ORDER BY t) FROM unnest($1::text[]) t WHERE to_regclass('public.' || t) IS NOT NULL`, [GONE_TABLES]), null,
  'the picks, the months, the rules: gone')
check(await one(`SELECT array_agg(s) FROM unnest($1::text[]) s WHERE to_regprocedure(s) IS NOT NULL`, [Object.keys(DROPPED)]), null,
  'comm_open_bill_on, the suggestions, the scope guard: gone')
check(await one(`SELECT to_regtype('public.comm_open_bill_basis') IS NULL`), true, 'the basis type: gone')
const columns = await q(`SELECT table_name, column_name FROM information_schema.columns
   WHERE table_schema = 'public' AND column_name ~ 'open_bill' ORDER BY table_name, ordinal_position`)
check(columns.map(c => `${c.table_name}.${c.column_name}`), [
  'sales_order_reassignments.open_bill_rank', 'sales_order_reassignments.open_bill_auto',
  'sales_order_reassignments.open_bill_tagged_by', 'sales_order_reassignments.open_bill_tagged_at',
], "every Open Bill column gone but a move's — 20261031040000 still reads its rank")
check(await one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'components_tally'`),
  'CHECK ((abs((total_commission - ((((product_commission + kpi_commission) + override_commission) + margin_incentive) + group_incentive))) <= 0.01))',
  'a statement tallies the five parts left')
check(await one(`SELECT count(*)::int FROM pg_constraint WHERE conname = 'sales_order_exclusions_rank'`), 0, "an exclusion's rank check went with it")
check([
  (await q(`SELECT table_name FROM public.permission_table_reads ORDER BY 1`)).map(r => r.table_name),
  (await q(`SELECT table_name || ' ' || command AS w FROM public.permission_table_writes ORDER BY 1`)).map(r => r.w),
  (await q(`SELECT table_name FROM public.audit_tables ORDER BY 1`)).map(r => r.table_name),
  (await q(`SELECT page FROM public.permission_page_tabs ORDER BY 1`)).map(r => r.page),
], [['sales_orders'], ['sales_orders UPDATE'], ['sales_orders'], ['/revenue/[sub]/[period]']],
  "the registries: Open Bill's lines gone, every other one kept")
const acl = sig => q(`SELECT coalesce(r.rolname, 'PUBLIC') AS grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
   LEFT JOIN pg_roles r ON r.oid = a.grantee WHERE p.oid = to_regprocedure($1) AND a.privilege_type = 'EXECUTE'
     AND coalesce(r.rolname, 'PUBLIC') <> current_user ORDER BY 1`, [sig])
check((await acl('public.commit_sales_import_batch(uuid)')).map(r => r.grantee), ['authenticated', 'service_role'], 'the import: the portal and the service role, as before')
check((await acl('public.revenue_month_orders(uuid, date)')).map(r => r.grantee), ['authenticated', 'service_role'], "a month's bills: the portal and the service role")
check(await one(`SELECT obj_description('public.commit_sales_import_batch(uuid)'::regprocedure, 'pg_proc')`),
  'Commits a staged file import as its month\'s batch, retiring the one before. A month fed live by the ERP refuses, unless it is closed to the feed (erp_feed_closed_months).',
  "the import's comment, as before")
check((await one(`SELECT obj_description('public.revenue_month_orders(uuid, date)'::regprocedure, 'pg_proc')`)).includes('the organiser of THAT MONTH\'S fair there, the deposit-gate verdict'), true,
  "a month's bills: the comment without the rank")
check((await q(`SELECT d.description FROM pg_description d WHERE d.description ~* 'open.?bill'`)).map(r => r.description),
  ['Nothing writes this since Open Bill went (20261031210000). Kept while erp_sync_note_seller_move (20261031040000) still reads it.'],
  "no comment speaks of Open Bill but the move's kept rank")

// ── After: the bodies still run, Open Bill's tables gone ──
const augAfter = await month(AUG)
check(augAfter, augBefore.map(({ open_bill_rank, open_bill_auto, ...r }) => r), "August's bills, every column as before less the rank")
check(await month(OCT), octBefore.map(({ open_bill_rank, open_bill_auto, ...r }) => r), "October's the same")

check(await one(`SELECT public.revenue_exclude_order($1, 'a duplicate')`, [A1]), { orderNo: 'HC-SO-2608-001', changed: true },
  "taking out a bill in August, once Open Bill's month: nothing of a pick")
check(await q(`SELECT * FROM public.sales_order_exclusions`).then(rows => rows.map(({ excluded_at, ...r }) => r)),
  [{ order_id: A1, note: 'a duplicate', excluded_by: HR, excluded_by_name: 'HR' }], 'the exclusion: the bill, why, and who')
check(await one(`SELECT cancelled FROM public.sales_orders WHERE id = $1`, [A1]), true, 'it no longer counts')
check(await calls(), ['resequence lucas 2026-08-08', `refresh ${AUG_BATCH}`], "the salesperson's day is still renumbered")
check(await one(`SELECT public.revenue_include_order($1)`, [A1]),
  { orderNo: 'HC-SO-2608-001', changed: true, counts: true, stillOut: null }, 'counted again: nothing of a pick')
check(await one(`SELECT cancelled FROM public.sales_orders WHERE id = $1`, [A1]), false, 'it counts again')
check(await calls(), ['resequence lucas 2026-08-08', `refresh ${AUG_BATCH}`], '…its day renumbered')

check(await one(`SELECT public.revenue_move_order($1, $2, 'helped')`, [O2, LUCAS]), {
  orderNo: 'HC-SO-2610-002', changed: true, staffId: LUCAS, fromStaffId: BEN, namedStaffId: BEN, movedBack: false,
  shareTaken: null, shareBack: null, shareNotBack: null,
}, 'moved to another salesperson: nothing of a pick')
check(await q(`SELECT staff_id, from_staff_id, note, open_bill_rank, open_bill_auto, open_bill_tagged_by, open_bill_tagged_at
   FROM public.sales_order_reassignments`), [{ staff_id: LUCAS, from_staff_id: BEN, note: 'helped', open_bill_rank: null,
  open_bill_auto: null, open_bill_tagged_by: null, open_bill_tagged_at: null }], "the move: its kept Open Bill columns stay empty")
check(await one(`SELECT staff_id FROM public.sales_orders WHERE id = $1`, [O2]), LUCAS, "the bill is LUCAS's")
check(await one(`SELECT public.revenue_move_order($1, NULL)`, [O2]), {
  orderNo: 'HC-SO-2610-002', changed: true, staffId: BEN, fromStaffId: LUCAS, namedStaffId: BEN, movedBack: true,
  shareTaken: null, shareBack: null, shareNotBack: null,
}, 'moved back')
check([await one(`SELECT staff_id FROM public.sales_orders WHERE id = $1`, [O2]), await one(`SELECT count(*)::int FROM public.sales_order_reassignments`)],
  [BEN, 0], "BEN's again, the move off")
await calls()

await q(`SELECT public.commit_sales_import_batch($1)`, [DRAFT])
check((await q(`SELECT id, status FROM public.sales_import_batches WHERE period_month = $1 ORDER BY id`, [NOV])).map(b => [b.id, b.status]),
  [[NOV_FILE, 'superseded'], [DRAFT, 'committed']], 'a file import commits, the one before retired')

await db.exec(`INSERT INTO public.comm_statements (staff_id, product_commission, kpi_commission, override_commission, margin_incentive, total_commission)
  VALUES ('${LUCAS}', 100, 10, 5, 2, 117)`)
await assert.rejects(db.exec(`INSERT INTO public.comm_statements (staff_id, product_commission, total_commission) VALUES ('${BEN}', 100, 150)`),
  /components_tally/, 'a statement whose parts do not make its total is refused')
checks++

console.log(`OK open bill gone: ${checks} checks`)

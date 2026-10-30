// Local PostgreSQL regression for 20261031030000 (2026-10-31 — the user, on SHAWN keying orders of salespeople who left
// as new orders of his own: "要能够分开哪些是真正他自己开的单，哪些是他只是帮人家处理的单，要不然会变成 double claim").
// Production's bodies (tests/member-sql/whose-sale-production.sql and every-paper-production.sql, read with
// pg_get_functiondef, md5-checked) are loaded over stand-ins for what they call; 20261031013000 and the migration under
// test then run VERBATIM, in that order. A delivery is played as the receiver plays it: the bill written, then
// erp_sync_after_delivery handed the receiver's own result. Under test: a bill the feed OPENS on a paper another
// salesperson's order carries — a bill of the portal's, a claim form's row, an older order of the ERP's — is held until
// HR answers; the same person, a bill only updated, one paying nothing, a paid month and a booth alone hold nothing; HR's
// answers count it or keep it out in their name; a fault never fails the delivery; who may call what. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const EVERY_PAPER = new URL('../../supabase/migrations/20261031013000_every_paper_number.sql', import.meta.url)
const MIGRATION = new URL('../../supabase/migrations/20261031030000_whose_sale.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0] ?? { v: undefined })[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (run, pattern, what) => { await assert.rejects(run, pattern, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(1), SEP_BATCH = id(2), OCT_BATCH = id(3), AUG_BATCH = id(4)
const HR = id(9), MEMBER = id(8)
const SHAWN = id(11), WEI_HOW = id(12), LUCAS = id(13), SHU_HUI = id(14)
// The ERP's salesperson ids, as the feed and erp_order_papers carry them.
const E = { SHAWN: 'erp-shawn', STEPHY: 'erp-stephy', YANG: 'erp-yang', WEI_HOW: 'erp-weihow', LUCAS: 'erp-lucas',
  LUCAS_OLD: 'erp-lucas-autocount', SHU_HUI_NEW: 'erp-shuhui-2026', SHU_HUI_OLD: 'erp-shuhui-2025', ZACK: 'erp-zack' }
const AUG = '2026-08-01', SEP = '2026-09-01', OCT = '2026-10-01'

const production = (await readFile(new URL('./whose-sale-production.sql', import.meta.url), 'utf8'))
  + (await readFile(new URL('./every-paper-production.sql', import.meta.url), 'utf8'))
const blocks = Object.fromEntries(production.replace(/\r\n/g, '\n').split(/\n(?=-- [a-z_]+\()/)
  .map(b => b.trim()).filter(b => b.startsWith('-- ')).map(b => [b.match(/^-- ([a-z_]+)\(/)[1], b]))
const PROD = {
  erp_sync_after_delivery: 'bd437686f00688e1491f47096ca21001',
  revenue_exclude_order: '7ee04244a6240b640f22f6fefdf5dff9',
  revenue_include_order: '031c10a95cfe299c9ffac48bcf52698b',
  sales_order_excluded_by_hand: '7216ddf2b362a0254079edc04d69f217',
  sales_order_exclusions_apply: '184f8f92c12bc9f51e0d6781865f6989',
  sales_order_exclusions_guard: '668b2cdb68a609f97e0854e345b09a23',
  sales_orders_apply_manual_exclusion: 'd710c06b20487cbebe24cdd9d4711d1e',
  sales_order_bill_ref: '0b60d489d61e938c9799081ae7aa5f82',
  sales_order_ref_no: 'b5347a21721ef276f3584cdd5948741c',
  revenue_possible_double_claims: 'cc5daca124a33c2a4487f63415f39648',
  revenue_dismiss_double_claim: '3f228702e1123d7fd0f64f9e6d3faa4e',
}

// ── Stand-ins for what production's bodies call ──
await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  -- What the signed-in caller holds, set per test (the real one reads their template).
  CREATE FUNCTION public.has_any_action(p_actions text[]) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p_actions && string_to_array(NULLIF(current_setting('test.actions', true), ''), ',') $$;
  CREATE TABLE public.tab_guard_calls(pages text[], wants text[]);
  CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.tab_guard_calls VALUES (p_pages, p_wants) $$;
  CREATE TABLE public.audit_registered(table_name text, label text, area text, read_keys text[], mode text, reason text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text,
    p_keys text[] DEFAULT NULL, p_labels text[] DEFAULT NULL, p_ignore text[] DEFAULT NULL, p_omit text[] DEFAULT NULL,
    p_diff boolean DEFAULT NULL, p_salary text[] DEFAULT NULL, p_nric text[] DEFAULT NULL, p_bank text[] DEFAULT NULL,
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.audit_registered VALUES (p_table, p_label, p_area, p_read, p_mode, p_reason) $$;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, status text NOT NULL DEFAULT 'active',
    resignation_date date, user_id uuid, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL,
    status text NOT NULL DEFAULT 'committed', source text NOT NULL DEFAULT 'erp_sync');
  CREATE TABLE public.comm_agent_aliases(agent_key text, erp_salesperson_id text, staff_id uuid);
  CREATE TABLE public.erp_booth_staff(erp_project_id bigint, erp_sales_rep_id bigint, erp_salesperson_id text, code text, name text);
  CREATE TABLE public.erp_sync_events(id uuid PRIMARY KEY, warnings text[] NOT NULL DEFAULT '{}');
  CREATE TABLE public.locked_periods(sub_department_id uuid, period_month date);
  CREATE FUNCTION public.commission_order_period_locked(p_sub uuid, p_period date) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM public.locked_periods l WHERE l.sub_department_id = p_sub AND l.period_month = p_period) $$;
  CREATE FUNCTION public.lock_commission_order_periods(p_sub uuid, p_periods date[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.comm_open_bill_on(p_sub uuid, p_period date) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE TABLE public.housekeeping(what text, arg text);
  CREATE FUNCTION public.erp_sync_resequence_day(p_agent text, p_day date) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.housekeeping VALUES ('resequence', p_agent) $$;
  CREATE FUNCTION public.erp_sync_suggest_open_bills(p_staff uuid, p_day date) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.housekeeping VALUES ('suggest', p_staff::text) $$;
  CREATE FUNCTION public.erp_sync_refresh_batch(p_batch uuid) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.housekeeping VALUES ('refresh', p_batch::text) $$;
  -- The audit trail's own work is not under test: its stand-in records that it ran.
  CREATE TABLE public.trail(doc_no text, outcome text);
  CREATE FUNCTION public.erp_sync_scheme_of(p_sub uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.erp_order_state(p_order jsonb, p_scheme uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.erp_sync_note_adjustment(p_order uuid, p_payload jsonb, p_event uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.erp_sync_note_change(p_sub uuid, p_doc_no text, p_order uuid, p_event uuid, p_outcome text, p_period date,
    p_before jsonb, p_after jsonb, p_saved_at timestamptz) RETURNS void LANGUAGE sql AS
    $$ INSERT INTO public.trail VALUES (p_doc_no, p_outcome) $$;
  CREATE TABLE public.comm_runs(id uuid PRIMARY KEY, status text NOT NULL);
  CREATE TABLE public.comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_id uuid, sub_department_id uuid,
    order_no text, order_period_month date);
  CREATE TABLE public.comm_double_claim_dismissals(sub_department_id uuid NOT NULL, bill_ref text NOT NULL, order_ids uuid[] NOT NULL,
    note text, dismissed_by uuid, dismissed_by_name text, dismissed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sub_department_id, bill_ref));
`)
await db.exec(blocks.sales_order_bill_ref)
await db.exec(blocks.sales_order_ref_no)
await db.exec(`
  -- As production has it (the columns the bodies under test read and write).
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
    period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, event_date date, staff_id uuid,
    agent_name text NOT NULL DEFAULT '', agent_key text, customer_name text, order_total numeric NOT NULL,
    cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text, erp_on_hold boolean NOT NULL DEFAULT false,
    erp_salesperson_id text, source text NOT NULL DEFAULT 'erp_sync', raw jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(), erp_created_at timestamptz,
    bill_ref text GENERATED ALWAYS AS (sales_order_bill_ref(order_no, sales_order_ref_no(raw->'header'))) STORED);
  CREATE TABLE public.sales_order_exclusions(order_id uuid PRIMARY KEY REFERENCES sales_orders(id) ON DELETE CASCADE, note text,
    open_bill_rank smallint, open_bill_auto boolean, open_bill_tagged_by uuid, open_bill_tagged_at timestamptz,
    excluded_by uuid, excluded_by_name text, excluded_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.sales_order_open_bill_tags(order_id uuid, sub_department_id uuid, staff_id uuid, event_date date,
    bill_rank smallint, auto_suggested boolean, tagged_by uuid, tagged_at timestamptz);
`)
for (const name of ['sales_order_excluded_by_hand', 'sales_order_exclusions_apply', 'sales_order_exclusions_guard',
  'sales_orders_apply_manual_exclusion', 'revenue_exclude_order', 'revenue_include_order', 'erp_sync_after_delivery',
  'revenue_possible_double_claims', 'revenue_dismiss_double_claim']) await db.exec(blocks[name])
await db.exec(`
  CREATE TRIGGER sales_order_exclusions_guard BEFORE INSERT OR DELETE OR UPDATE ON public.sales_order_exclusions
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_exclusions_guard();
  CREATE TRIGGER sales_order_exclusions_apply AFTER INSERT OR DELETE ON public.sales_order_exclusions
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_exclusions_apply();
  CREATE TRIGGER sales_orders_manual_exclusion BEFORE INSERT OR UPDATE ON public.sales_orders
    FOR EACH ROW EXECUTE FUNCTION public.sales_orders_apply_manual_exclusion();
`)
for (const r of await q(`SELECT proname, md5(prosrc) AS md5 FROM pg_proc WHERE proname = ANY ($1)`, [Object.keys(PROD)])) {
  check(r.md5, PROD[r.proname], `${r.proname}: production's body`)
}

// ── The two migrations, verbatim, in order ──
await db.exec(await readFile(EVERY_PAPER, 'utf8'))
await db.exec(await readFile(MIGRATION, 'utf8'))
check(await one(`SELECT md5(prosrc) <> $1 FROM pg_proc WHERE proname = 'erp_sync_after_delivery'`, [PROD.erp_sync_after_delivery]), true,
  'erp_sync_after_delivery is replaced')
check(await q(`SELECT table_name, read_keys, mode FROM audit_registered ORDER BY table_name`), [
  { table_name: 'erp_order_papers', read_keys: [], mode: 'none' },
  { table_name: 'sales_order_seller_checks', read_keys: ['revenue'], mode: 'all' },
], 'both tables are in the audit register')

// ── Fair, its people and the ERP's older orders ──
await db.exec(`
  INSERT INTO users (id, name) VALUES ('${HR}', 'HR Manager'), ('${MEMBER}', 'A member');
  INSERT INTO hr_staff_costs (id, employee_name, status, resignation_date) VALUES
    ('${SHAWN}', 'SHAWN', 'active', NULL), ('${WEI_HOW}', 'WEI HOW', 'inactive', '2026-09-24'),
    ('${LUCAS}', 'LUCAS', 'active', NULL), ('${SHU_HUI}', 'SHU HUI', 'active', NULL);
  INSERT INTO comm_agent_aliases (agent_key, erp_salesperson_id, staff_id) VALUES
    ('SHAWN', '${E.SHAWN}', '${SHAWN}'), ('WEI HOW', '${E.WEI_HOW}', '${WEI_HOW}'), ('LUCAS', '${E.LUCAS}', '${LUCAS}'),
    ('LUCAS', '${E.LUCAS_OLD}', '${LUCAS}'), ('SHU HUI', '${E.SHU_HUI_NEW}', '${SHU_HUI}');
  INSERT INTO sales_import_batches (id, sub_department_id, period_month, source) VALUES
    ('${AUG_BATCH}', '${FAIR}', '${AUG}', 'file'), ('${SEP_BATCH}', '${FAIR}', '${SEP}', 'erp_sync'),
    ('${OCT_BATCH}', '${FAIR}', '${OCT}', 'erp_sync');
  -- The ERP's orders the portal never had as bills (scripts/load-erp-order-papers.mjs writes these).
  INSERT INTO erp_order_papers (doc_no, ref_no, so_date, erp_created_at, erp_salesperson_id, salesperson_name, salesperson_active, shared_with, status, total) VALUES
    ('HC-SO-008712', 'HC12110', '2025-10-22', '2026-08-28T08:00:00Z', '${E.STEPHY}', 'STEPHY', false, '{${E.SHAWN}}', 'IN_PRODUCTION', 7794),
    ('HC-SO-009430', 'HC9882+ZNT4864', '2025-11-28', '2026-08-28T08:00:00Z', '${E.YANG}', 'YANG', false, '{${E.SHAWN}}', 'IN_PRODUCTION', 3988),
    ('HC-SO-007362', 'HC7844', '2025-07-21', '2026-08-28T08:00:00Z', '${E.LUCAS_OLD}', 'LUCAS TAN', true, '{}', 'DELIVERED', 6388),
    ('HC-SO-010183', 'HC10478', '2026-01-12', '2026-08-28T08:00:00Z', '${E.SHU_HUI_OLD}', 'SHU HUI', false, '{}', 'DELIVERED', 900),
    ('HC-SO-012720', 'HC11467', '2026-07-08', '2026-08-28T08:00:00Z', '${E.ZACK}', 'Zack', true, '{}', 'CONFIRMED', 5888),
    -- Opened after the October bills: no evidence about them.
    ('HC-SO-2610-500', 'HC55555', '2026-10-30', '2026-10-30T09:00:00Z', '${E.ZACK}', 'Zack', true, '{}', 'CONFIRMED', 1000);
  INSERT INTO erp_booth_staff (erp_project_id, erp_salesperson_id, name) VALUES
    (2220, '${E.WEI_HOW}', 'Wei How'), (2220, '${E.ZACK}', 'Zack'), (363, '${E.SHAWN}', 'Shawn'), (363, '${E.LUCAS}', 'Lucas');
`)
check(await one(`SELECT papers FROM erp_order_papers WHERE doc_no = 'HC-SO-009430'`), ['HC9882', 'ZNT4864'], 'an ERP order is on every paper of its Ref No.')

let n = 100
/** The receiver writes the bill; then erp_sync_after_delivery is handed its result. */
async function deliver({ no, staff, sp, agent, ref, total = 5000, date = '2026-10-20', batch = OCT_BATCH, month = OCT,
  message = 'created', fair = null, cancelled = false, source = 'erp_sync', erpCreated = '2026-10-20T10:00:00Z',
  write = message.startsWith('created') }) {
  const orderId = id(++n), eventId = id(5000 + n)
  const header = ref === null ? {} : { customer_so_no: ref }
  if (write) {
    await q(`INSERT INTO sales_orders (id, batch_id, period_month, order_no, order_date, event_date, staff_id, agent_name, agent_key,
               order_total, cancelled, erp_salesperson_id, source, raw, erp_created_at)
             VALUES ($1, $2, $3, $4, $5, $5, $6, $7, upper($7), $8, $9, $10, $11, $12, $13)`,
      [orderId, batch, month, no, date, staff, agent, total, cancelled, sp, source, { header, ...(fair ? { fair } : {}) }, erpCreated])
  }
  await q(`INSERT INTO erp_sync_events (id) VALUES ($1)`, [eventId])
  const result = await one(`SELECT erp_sync_after_delivery($1, $2, '{}'::jsonb, $3, NULL)`,
    [FAIR, no, { status: 'applied', message, eventId }])
  return { orderId: await one(`SELECT id FROM sales_orders WHERE order_no = $1`, [no]), eventId, result }
}
const stateOf = async orderId => (await q(`SELECT o.cancelled, o.excluded_reason, x.excluded_by_name, x.note, c.status
    FROM sales_orders o LEFT JOIN sales_order_exclusions x ON x.order_id = o.id
    LEFT JOIN sales_order_seller_checks c ON c.order_id = o.id WHERE o.id = $1`, [orderId]))[0]
const warningsOf = async eventId => one(`SELECT warnings FROM erp_sync_events WHERE id = $1`, [eventId])

// ── A paper on an older order of the ERP's, sold by somebody who left and handled by this salesperson ──
const stephy = await deliver({ no: 'HC-SO-2610-241', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC12110', total: 7794 })
check(await stateOf(stephy.orderId), { cancelled: true, excluded_reason: 'manual', excluded_by_name: 'Whose sale check',
  note: 'Whose sale? HC12110 is on STEPHY\'s HC-SO-008712 (22 Oct 2025)', status: 'waiting' },
'STEPHY\'s re-keyed order is held: out of the month, under the check\'s name, waiting for HR')
check(await warningsOf(stephy.eventId), ['whose_sale'], 'the delivery says so')
check(stephy.result, { status: 'applied', message: 'created', eventId: stephy.eventId }, 'the delivery answers as the receiver made it')
check(await one(`SELECT count(*)::int FROM trail WHERE doc_no = 'HC-SO-2610-241'`), 1, 'the audit trail still ran')
const ev = await one(`SELECT evidence FROM sales_order_seller_checks WHERE order_id = $1`, [stephy.orderId])
check(ev.orders, [{ source: 'erp', docNo: 'HC-SO-008712', papers: ['HC12110'], soldOn: '2025-10-22', month: null, seller: 'STEPHY',
  sellerLeft: true, handledBySeller: true, total: 7794, cancelled: false }], 'what was found: whose order, that they left, that SHAWN handles it')
check(ev.booth, null, 'no fair, no booth')
check(await one(`SELECT count(*)::int FROM housekeeping WHERE what = 'refresh'`), 1, 'taken out exactly as by hand: the batch refreshed')

// The second paper of a Ref No. counts: YANG's HC9882+ZNT4864.
const yang = await deliver({ no: 'HC-SO-2610-300', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC9882+ZNT4864', total: 6666 })
check((await stateOf(yang.orderId)).status, 'waiting', 'YANG\'s order, re-keyed on two papers, is held')
check((await one(`SELECT evidence FROM sales_order_seller_checks WHERE order_id = $1`, [yang.orderId])).orders[0].papers,
  ['HC9882', 'ZNT4864'], 'both shared papers named')

// A claim form's row of an earlier month, on the bill's SECOND paper — and the booth listed others.
await q(`INSERT INTO sales_orders (id, batch_id, period_month, order_no, order_date, staff_id, agent_name, agent_key, order_total, source, created_at)
         VALUES ($1, $2, $3, 'ZNT6186', '2026-08-15', $4, 'WEI HOW', 'WEI HOW', 4288, 'file', '2026-09-26T10:00:00Z')`, [id(90), AUG_BATCH, AUG, WEI_HOW])
const weiHow = await deliver({ no: 'HC-SO-2610-307', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC77777+ZNT6186', total: 4288,
  fair: { name: 'KUALA LUMPUR [ZANOTTI] PERFECT LIFESTYLE @ MID VALLEY', projectId: 2220, fairDate: '2026-08-15' } })
const ev2 = await one(`SELECT evidence FROM sales_order_seller_checks WHERE order_id = $1`, [weiHow.orderId])
check(ev2.orders.map(o => [o.source, o.docNo, o.seller, o.sellerLeft, o.month]), [['claim_form', 'ZNT6186', 'WEI HOW', true, AUG]],
  'the August claim form already paid WEI HOW for ZNT6186')
check(ev2.booth, { fair: 'KUALA LUMPUR [ZANOTTI] PERFECT LIFESTYLE @ MID VALLEY', staff: ['Wei How', 'Zack'] },
  'and the booth listed Wei How and Zack, not SHAWN — said beside the papers')

// ── What holds nothing ──
const notHeld = async (args, what) => {
  const d = await deliver(args)
  check({ ...(await stateOf(d.orderId)) }, { cancelled: args.cancelled ?? false, excluded_reason: null, excluded_by_name: null, note: null, status: null }, what)
  return d
}
await q(`INSERT INTO sales_orders (id, batch_id, period_month, order_no, order_date, staff_id, agent_name, agent_key, order_total, erp_salesperson_id, raw, created_at)
         VALUES ($1, $2, $3, 'HC-SO-013505', '2026-09-07', $4, 'Shawn', 'SHAWN', 10788, $5, '{"header": {"customer_so_no": "PG10457"}}', '2026-09-07T10:00:00Z')`,
  [id(91), SEP_BATCH, SEP, SHAWN, E.SHAWN])
await notHeld({ no: 'HC-SO-2610-222', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'PG10457' }, 'his own earlier bill on the paper: his own customer, nothing to ask')
await notHeld({ no: 'HC-SO-2610-213', staff: LUCAS, sp: E.LUCAS, agent: 'Lucas', ref: 'HC7844' },
  'an ERP order under the same person\'s OTHER salesperson id and another name (the alias says so)')
await notHeld({ no: 'HC-SO-2610-185', staff: SHU_HUI, sp: E.SHU_HUI_NEW, agent: 'Shu Hui', ref: 'HC10478' },
  'an ERP order under the same NAME (SHU HUI, made again in the ERP)')
await notHeld({ no: 'HC-SO-2610-410', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC55555' },
  'an ERP order opened after this bill says nothing about it')
await notHeld({ no: 'HC-SO-2610-005', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC13526',
  fair: { name: 'Kuala Lumpur [AKEMI] BIGHOME @ MID VALLEY', projectId: 2220 } }, 'a booth that did not list him, alone, holds nothing')
await notHeld({ no: 'HC-SO-2610-401', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC11467', total: 0 }, 'a bill paying nothing is not asked')
await notHeld({ no: 'HC-SO-2610-402', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC11467', cancelled: true }, 'nor one the ERP itself keeps out')
await notHeld({ no: 'HC-SO-2610-403', staff: null, sp: 'erp-nobody', agent: 'Nobody', ref: 'HC11467' }, 'nor one no salesperson is matched to')
await notHeld({ no: 'HC-SO-2610-404', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: '-' }, 'nor one whose Ref No. names no paper')
await db.exec(`INSERT INTO locked_periods VALUES ('${FAIR}', '${SEP}')`)
await notHeld({ no: 'HC-SO-2609-405', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC11467', batch: SEP_BATCH, month: SEP, date: '2026-09-20' },
  'nor one in a month a run has paid')
await db.exec(`DELETE FROM locked_periods`)
// Only a bill the delivery OPENED is asked: a later save of one never asked stays as it is.
const updated = await deliver({ no: 'HC-SO-2610-222', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'PG10457', message: 'updated' })
check(await warningsOf(updated.eventId), [], 'an update asks nothing')

// ── Asked once ──
const replay = await deliver({ no: 'HC-SO-2610-241', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC12110', write: false })
check(await one(`SELECT count(*)::int FROM sales_order_seller_checks WHERE order_id = $1`, [stephy.orderId]), 1, 'one question per bill')
check(await warningsOf(replay.eventId), [], 'a second "created" for the same bill asks nothing again')

// ── A fault in the check is a warning on the delivery, never its failure, never the trail's ──
// It fails AFTER the question was written: taking the bill out.
await db.exec(`ALTER FUNCTION public.revenue_exclude_order(uuid, text) RENAME TO revenue_exclude_order_kept;
  CREATE FUNCTION public.revenue_exclude_order(p uuid, n text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$;`)
const faulty = await deliver({ no: 'HC-SO-2610-406', staff: SHAWN, sp: E.SHAWN, agent: 'Shawn', ref: 'HC11467' })
check(faulty.result.status, 'applied', 'the delivery still answers applied')
check(await warningsOf(faulty.eventId), ['whose_sale_check_failed'], 'and says the check failed')
check(await one(`SELECT count(*)::int FROM trail WHERE doc_no = 'HC-SO-2610-406'`), 1, 'the audit trail was written all the same')
check(await stateOf(faulty.orderId), { cancelled: false, excluded_reason: null, excluded_by_name: null, note: null, status: null },
  'nothing held half-way: no question left without its bill taken out')
await db.exec(`DROP FUNCTION public.revenue_exclude_order(uuid, text);
  ALTER FUNCTION public.revenue_exclude_order_kept(uuid, text) RENAME TO revenue_exclude_order;`)

// ── Who may call what ──
const as = async (user, actions, run) => {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false), set_config('test.actions', '${actions}', false)`)
  try { return await run() } finally { await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('test.actions', '', false)`) }
}
for (const [fn, sig] of [['erp_sync_check_seller', 'uuid, uuid'], ['revenue_seller_checks', 'uuid, date'], ['revenue_answer_seller_check', 'uuid, boolean, text']]) {
  check(await one(`SELECT has_function_privilege('anon', '${fn}(${sig})', 'EXECUTE')`), false, `the publishable key may not call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', '${fn}(${sig})', 'EXECUTE')`), true, `a signed-in caller reaches ${fn}'s own checks`)
}
check(await one(`SELECT has_function_privilege('authenticated', 'sales_order_seller_evidence(uuid)', 'EXECUTE')`), false, 'the evidence is nobody\'s to call')
for (const t of ['erp_order_papers', 'sales_order_seller_checks']) {
  check(await one(`SELECT has_table_privilege('authenticated', '${t}', 'SELECT')`), false, `${t}: no client reads it`)
  check(await one(`SELECT relrowsecurity FROM pg_class WHERE relname = '${t}'`), true, `${t}: RLS on`)
}
await refuses(() => as(MEMBER, 'revenue.view', () => q(`SELECT erp_sync_check_seller($1, NULL)`, [faulty.orderId])), /Not open to your account/,
  'a signed-in caller without Revenue · Edit cannot hold a bill')
await refuses(() => as(MEMBER, '', () => q(`SELECT revenue_seller_checks($1, $2)`, [FAIR, OCT])), /Comm Cal is not open/, 'reading needs Revenue · View')
await refuses(() => as(MEMBER, 'revenue.view', () => q(`SELECT revenue_answer_seller_check($1, true, NULL)`, [stephy.orderId])),
  /not open to your account/, 'answering needs Revenue · Edit')

// ── The tab's reader ──
const rows = await as(HR, 'revenue.view', () => one(`SELECT revenue_seller_checks($1, $2)`, [FAIR, OCT]))
check(rows.map(r => [r.orderNo, r.status, r.sellerName, r.staffName, r.held, r.counts]).sort(), [
  ['HC-SO-2610-241', 'waiting', 'STEPHY', 'SHAWN', true, false],
  ['HC-SO-2610-300', 'waiting', 'YANG', 'SHAWN', true, false],
  ['HC-SO-2610-307', 'waiting', 'WEI HOW', 'SHAWN', true, false],
], 'October: the three questions, each held')
check(rows.find(r => r.orderNo === 'HC-SO-2610-300').refNo, 'HC9882+ZNT4864', 'the Ref No. as the ERP has it')
check(await as(HR, 'revenue.view', () => one(`SELECT revenue_seller_checks($1, $2)`, [FAIR, SEP])), [], 'September has none')

// ── HR's answers ──
const answer = (orderId, theirs, note) => as(HR, 'revenue.edit', () => one(`SELECT revenue_answer_seller_check($1, $2, $3)`, [orderId, theirs, note]))
check(await answer(stephy.orderId, false, 'STEPHY left; SHAWN only handles the customer'),
  { orderNo: 'HC-SO-2610-241', status: 'not_theirs', counts: false }, 'not theirs: it stays out')
check(await stateOf(stephy.orderId), { cancelled: true, excluded_reason: 'manual', excluded_by_name: 'HR Manager',
  note: 'Not SHAWN\'s sale — STEPHY\'s HC-SO-008712: STEPHY left; SHAWN only handles the customer', status: 'not_theirs' },
'kept out in HR\'s name, saying whose it was')
check((await q(`SELECT pages, wants FROM tab_guard_calls LIMIT 1`))[0], { pages: ['/revenue/[sub]/[period]'], wants: ['revenue.edit'] },
  'the month page\'s tab is asked')
check(await answer(yang.orderId, true, 'the customer bought a new set from SHAWN'), { orderNo: 'HC-SO-2610-300', status: 'theirs', counts: true },
  'their own sale: it counts')
check(await stateOf(yang.orderId), { cancelled: false, excluded_reason: null, excluded_by_name: null, note: null, status: 'theirs' }, 'counted again, as if never held')
check(await one(`SELECT decided_by_name FROM sales_order_seller_checks WHERE order_id = $1`, [yang.orderId]), 'HR Manager', 'who answered')
// Answered again, either way.
check((await answer(yang.orderId, false, null)).counts, false, 'changed to not theirs: out again')
check((await stateOf(yang.orderId)).note, 'Not SHAWN\'s sale — YANG\'s HC-SO-009430', 'in HR\'s name')
check((await answer(stephy.orderId, true, null)).counts, true, 'and back: counts')
await refuses(() => answer(id(90), true, null), /not waiting on whose sale/, 'a bill never asked about is nothing to answer')
await refuses(() => answer(weiHow.orderId, null, null), /Their own sale, or not theirs/, 'an answer is one or the other')
// A paid month answers as every bill of it does.
await db.exec(`INSERT INTO locked_periods VALUES ('${FAIR}', '${OCT}')`)
await refuses(() => answer(weiHow.orderId, true, null), /has paid/, 'a month whose run has paid: reopen it first')
await db.exec(`DELETE FROM locked_periods`)
// A held bill joins no double-claims group: it pays nobody until it is answered.
check(await one(`SELECT count(*)::int FROM revenue_possible_double_claims($1) WHERE order_no = 'HC-SO-2610-307'`, [FAIR]), 0,
  'while held, ZNT6186 is no double claim')
check((await answer(weiHow.orderId, true, null)).counts, true, 'counted as SHAWN\'s')
check(await one(`SELECT count(*)::int FROM revenue_possible_double_claims($1) WHERE bill_ref = 'ZNT6186'`, [FAIR]), 2,
  'and then Double claims asks about ZNT6186, as it would have')

console.log(`whose sale: ${checks} checks passed`)

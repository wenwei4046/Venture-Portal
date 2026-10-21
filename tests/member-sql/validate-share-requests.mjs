// Local PostgreSQL regression for 20261021150000 + 20261021150100 (2026-10-21 — the user: a ⋯ menu on My sales orders'
// sheet sends a "share order" request; the colleague named accepts first; then HR approves on Comm Cal › Requests, and the
// bill's commission AND sales value are split — "这会直接影响到他们的 sales target … Leader 那边的排行榜全部也是同步").
// Production's own bodies (tests/member-sql/share-bills-production.sql, md5-checked) are loaded over stand-ins for the
// tables they read; both migrations then run VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const num = v => Number(v)

// People: logins (users) and their People records (staff).
const U = { LUCAS: id(1), ANTHONY: id(2), BEN: id(3), DAVE: id(5), HEAD: id(6), HR: id(7), PRINCIPAL: id(8) }
const S = { LUCAS: id(101), ANTHONY: id(102), BEN: id(103), CAROL: id(104), DAVE: id(105), HEAD: id(106), HRREC: id(107) }
const DEPT = id(201), HQ = id(202), FAIR = id(301), FAIR_SCHEME = id(311), BATCH = id(401)
const TITLE = id(501), HEAD_TITLE = id(502)
const OCT = '2026-10-01', SEP = '2026-09-01'
const B = { ONE: id(601), TWO: id(602), THEIRS: id(603), PAID: id(604), OUT: id(605), SIX: id(606), SEVEN: id(607), MOVED: id(608) }
const FAIR_EVENT = id(701)

/** Signed in as a login holding these permissions and actions, as the database role `authenticated`. */
async function as(user, { perms = [], actions = [], closed = [], tabShut = false, principal = false } = {}) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.perms', $2, false), set_config('test.actions', $3, false),
                  set_config('test.closed', $4, false), set_config('test.tab_shut', $5, false), set_config('test.principal', $6, false)`,
    [user ?? '', perms.join(','), actions.join(','), closed.join(','), tabShut ? 'yes' : 'no', principal ? 'yes' : 'no'])
  await db.exec('SET ROLE authenticated')
}
const member = user => as(user, { perms: ['member_portal'] })
const hr = (extra = {}) => as(U.HR, { actions: ['revenue.view', 'revenue.edit'], ...extra })
const asSystem = async () => { await db.exec('RESET ROLE'); await q(`SELECT set_config('request.jwt.claim.sub', '', false)`) }

const send = (order, parts, note = '') => one(`SELECT public.member_share_order_send($1, $2::jsonb, $3)`, [order, JSON.stringify(parts), note])
const answer = (request, accept, note = null) => one(`SELECT public.member_share_order_answer($1, $2, $3)`, [request, accept, note])
const cancel = request => one(`SELECT public.member_share_order_cancel($1)`, [request])
const decide = (request, approve, note = null) => one(`SELECT public.revenue_share_request_decide($1, $2, $3)`, [request, approve, note])
const notices = async user => {
  await asSystem()
  return (await q(`SELECT kind, title, body, ref_kind, ref_id FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, id`, [user]))
}
const clearNotices = async () => { await asSystem(); await db.exec('DELETE FROM public.app_notifications') }
const shares = async order => {
  await asSystem()
  return (await q(`SELECT staff_id, share_pct::text AS pct FROM public.sales_order_shares WHERE order_id = $1 ORDER BY staff_id`, [order]))
    .map(r => [r.staff_id, r.pct])
}
/** member_order_facts for October: order → staff → [revenue, goods_revenue, kpi_qty, margin %]. */
const facts = async () => {
  await asSystem()
  const rows = await q(`SELECT order_id, staff_id, revenue::text, goods_revenue::text, kpi_qty::text, round(margin_pct * 100, 2)::text AS margin, cleared
                          FROM public.member_order_facts($1, $2, $3) ORDER BY order_id, staff_id`, [FAIR_SCHEME, OCT, '2026-11-01'])
  const out = {}
  for (const r of rows) (out[r.order_id] ??= {})[r.staff_id] = [num(r.revenue), num(r.goods_revenue), num(r.kpi_qty), r.margin === null ? null : num(r.margin)]
  return out
}

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

  -- ── Stand-ins for what production's bodies read ──
  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, role text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text, payroll_source text);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, is_department_head boolean NOT NULL DEFAULT false);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, user_id uuid, title_id uuid, department_id uuid,
    status text NOT NULL DEFAULT 'active', hire_date date, resignation_date date, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.comm_sub_departments(id uuid PRIMARY KEY, name text, code text, department_id uuid, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean NOT NULL DEFAULT true,
    effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, created_at timestamptz NOT NULL DEFAULT now(),
    enable_kpi boolean NOT NULL DEFAULT true, deposit_threshold_pct numeric, revenue_cost_divisor numeric);
  CREATE TABLE public.comm_hierarchy(scheme_id uuid, staff_id uuid, title_id uuid, effective_from date, effective_to date);
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, status text);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, order_no text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    period_month date NOT NULL, cancelled boolean NOT NULL DEFAULT false, order_date date NOT NULL, order_total numeric NOT NULL,
    paid_amount numeric NOT NULL DEFAULT 0, staff_id uuid, brand_code text, manual_margin_pct numeric, bill_ref text, customer_name text,
    fair_source text, raw jsonb NOT NULL DEFAULT '{}', venue text, fair_event_id uuid);
  CREATE TABLE public.sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    line_no integer, product_code text, product_name text, item_group text, qty numeric, line_amount numeric, cost_amount numeric,
    option_charge_amount numeric);
  CREATE TABLE public.sales_order_shares(order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id), share_pct numeric(5, 4) NOT NULL DEFAULT 0.5,
    created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (order_id, staff_id),
    CONSTRAINT share_pct_between CHECK (share_pct > 0 AND share_pct < 1));
  CREATE TABLE public.comm_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid, scheme_id uuid, period_month date, status text);
  CREATE TABLE public.comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid,
    period_month date, run_id uuid, order_period_month date);
  CREATE TABLE public.comm_salesperson_closes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid, sub_department_id uuid,
    period_month date, reopened_at timestamptz, order_ids uuid[] NOT NULL DEFAULT '{}');
  CREATE TABLE public.comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE public.comm_cost_ratios(scheme_id uuid, product_code text, ratio numeric);
  CREATE TABLE public.comm_kpi_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, source text NOT NULL DEFAULT 'sku',
    product_code text, product_name text, option_value text, effective_from date, effective_to date, amount numeric);
  CREATE TABLE public.comm_kpi_thresholds(scheme_id uuid, min_qty integer, effective_from date, effective_to date);
  CREATE TABLE public.comm_venue_events(id uuid PRIMARY KEY, start_date date, end_date date, period_month date, venue_key text,
    organiser_id uuid, erp_organiser_text text);
  CREATE TABLE public.comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.comm_venues(venue_key text PRIMARY KEY, display_name text);
  CREATE TABLE public.member_honour_months(sub_department_id uuid, period_month date);

  CREATE FUNCTION public.comm_first_paid_month(uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT NULL::date $$;
  -- A line is a KPI item when its code is one in force: its quantity, at the item's amount.
  CREATE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
  RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric) LANGUAGE sql STABLE AS $$
    SELECT l.order_id, l.id, k.id, l.qty, k.amount FROM public.sales_order_lines l
      JOIN public.comm_kpi_items k ON k.scheme_id = p_scheme AND upper(k.product_code) = upper(l.product_code)
       AND k.effective_from <= p_asat AND (k.effective_to IS NULL OR k.effective_to >= p_asat)
     WHERE l.order_id = ANY (p_order_ids)
  $$;
  CREATE FUNCTION public.member_erp_brand_weeks(p_sub uuid, p_staff uuid) RETURNS TABLE(week date, brand text) LANGUAGE sql STABLE AS
    $$ SELECT NULL::date, NULL::text WHERE false $$;
  CREATE FUNCTION public.member_erp_brand_weeks(p_sub uuid) RETURNS TABLE(staff_id uuid, week date, brand text, fair_id uuid, venue text,
    organizer text, start_date date, end_date date, booths integer) LANGUAGE sql STABLE AS
    $$ SELECT NULL::uuid, NULL::date, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::date, NULL::date, NULL::integer WHERE false $$;
  CREATE FUNCTION public.erp_sync_brand_code(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim($1)) $$;
  CREATE FUNCTION public.member_arena_week_closes_on(date) RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT $1 + 9 $$;
  CREATE FUNCTION public.member_has_membership(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.member_director_scheme(uuid, uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.has_perm(p text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p = ANY (string_to_array(current_setting('test.perms', true), ',')) $$;
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ','))) $$;
  CREATE FUNCTION public.tab_box_closed(p_tab text, p_action text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT (p_tab || '.' || p_action) = ANY (string_to_array(current_setting('test.closed', true), ',')) $$;
  CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT current_setting('test.tab_shut', true) IS DISTINCT FROM 'yes' $$;
  CREATE FUNCTION public.member_principal_context(p_staff uuid, p_sub_department uuid, p_scheme uuid DEFAULT NULL) RETURNS uuid
  LANGUAGE plpgsql STABLE AS $$
  BEGIN
    IF current_setting('test.principal', true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE = '42501';
    END IF;
    RETURN p_scheme;
  END $$;
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ SELECT $$;

  -- The notices as production holds them on 2026-10-21 (its checks), for notify_people / notify_topic below.
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), body text NOT NULL DEFAULT '' CHECK (length(body) <= 400),
    ref_kind text NOT NULL, ref_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz,
    CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY['attendance'::text, 'crm'::text, 'hiring'::text, 'it'::text, 'memo'::text, 'review'::text, 'rooms'::text])),
    CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['att_request'::text, 'att_today'::text, 'booking'::text, 'crm_contact'::text,
      'crm_invite'::text, 'hiring_request'::text, 'it_request'::text, 'member_request'::text, 'memo'::text])));
  CREATE TABLE public.notification_topics (user_id uuid NOT NULL REFERENCES public.users(id), topic text NOT NULL,
    synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, topic));
`)

// ── Production's own bodies, as they stood on 2026-10-21 (md5 of each body as production reports it) ──
const PROD = {
  commission_order_period_locked: null, // its body carries CRLFs production keeps; git's checkout drops them, so no md5 here
  member_arena_booth_history_for_staff: '5cd3631a834c607d3b09fba313aa04d8',
  member_kpi_for_staff: 'f7ef47922f96f02f33dd24b1195b426a',
  member_order_book_for_staff: '4553c366d2f603d27183e3a4efc295bc',
  member_order_facts: '736faa076f3b3a9420f362b37d31e03a',
  member_staff_id: 'a979898c84f67c45f29ba168cfaf98de',
  notify_people: '50259847648f421acbe03abd41dd0d95',
  notify_topic: 'fdb51debc1205ed88a96898f7a8e494f',
  sales_order_shares_guard: '682faa11fa480ba73f56122390a9ff1f',
  tab_write_guard: 'bc874286994bf99cc0d07257b6131fb4',
}
const production = (await readFile(new URL('./share-bills-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
// member_order_facts first: the SQL functions that read it are checked against it as they are created.
const blocks = production.split(/\n(?=-- [a-z_]+\()/).map(block => ({ block, name: /^-- ([a-z_]+)\(/.exec(block)?.[1] }))
  .filter(b => b.name && b.name in PROD).sort((a, b) => Number(b.name === 'member_order_facts') - Number(a.name === 'member_order_facts'))
for (const { block, name } of blocks) {
  await db.exec(block)
  if (PROD[name]) check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = $1 ORDER BY oid DESC LIMIT 1`, [name]), PROD[name], `${name}: production's body`)
}
await db.exec(`CREATE TRIGGER sales_order_shares_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_shares
  FOR EACH ROW EXECUTE FUNCTION public.sales_order_shares_guard()`)

// ── The people, the sub-department, its bills ──
await db.exec(`
  INSERT INTO public.users (id, name, email, role, is_active) VALUES
    ('${U.LUCAS}', 'Lucas', 'lucas@x.my', 'revenue_member', true), ('${U.ANTHONY}', 'Anthony', 'anthony@x.my', 'revenue_member', true),
    ('${U.BEN}', 'Ben', 'ben@x.my', 'revenue_member', true), ('${U.DAVE}', 'Dave', 'dave@x.my', 'revenue_member', true),
    ('${U.HEAD}', 'Head', 'head@x.my', 'revenue_member', true), ('${U.HR}', 'HR login', 'hr@x.my', 'hr', true),
    ('${U.PRINCIPAL}', 'Principal', 'principal@x.my', 'principal', true);
  INSERT INTO public.departments (id, name, payroll_source) VALUES ('${DEPT}', 'Revenue Department', 'commission'), ('${HQ}', 'HQ', 'imported');
  INSERT INTO public.titles (id, name, is_department_head) VALUES ('${TITLE}', 'Revenue Specialist', false), ('${HEAD_TITLE}', 'Revenue Director', true);
  INSERT INTO public.hr_staff_costs (id, employee_name, user_id, title_id, department_id) VALUES
    ('${S.LUCAS}', 'LUCAS', '${U.LUCAS}', '${TITLE}', '${DEPT}'), ('${S.ANTHONY}', 'ANTHONY', '${U.ANTHONY}', '${TITLE}', '${DEPT}'),
    ('${S.BEN}', 'BEN', '${U.BEN}', '${TITLE}', '${DEPT}'), ('${S.CAROL}', 'CAROL', NULL, '${TITLE}', '${DEPT}'),
    ('${S.DAVE}', 'DAVE', '${U.DAVE}', '${TITLE}', '${DEPT}'), ('${S.HEAD}', 'HEAD', '${U.HEAD}', '${HEAD_TITLE}', '${DEPT}'),
    ('${S.HRREC}', 'HR Manager', '${U.HR}', NULL, '${HQ}');
  INSERT INTO public.comm_sub_departments (id, name, code, department_id) VALUES ('${FAIR}', 'Fair', 'FAIR', '${DEPT}');
  INSERT INTO public.comm_schemes (id, sub_department_id, enable_kpi, deposit_threshold_pct, revenue_cost_divisor)
    VALUES ('${FAIR_SCHEME}', '${FAIR}', true, 0.3, 0.7);
  INSERT INTO public.comm_hierarchy (scheme_id, staff_id, title_id, effective_from) VALUES
    ('${FAIR_SCHEME}', '${S.LUCAS}', '${TITLE}', '2026-01-01'), ('${FAIR_SCHEME}', '${S.ANTHONY}', '${TITLE}', '2026-01-01'),
    ('${FAIR_SCHEME}', '${S.BEN}', '${TITLE}', '2026-01-01'), ('${FAIR_SCHEME}', '${S.CAROL}', '${TITLE}', '2026-01-01'),
    ('${FAIR_SCHEME}', '${S.DAVE}', '${TITLE}', '2026-01-01'), ('${FAIR_SCHEME}', '${S.HEAD}', '${HEAD_TITLE}', '2026-01-01');
  INSERT INTO public.comm_item_groups (scheme_id, item_group, commissionable) VALUES
    ('${FAIR_SCHEME}', 'MATTRESS', true), ('${FAIR_SCHEME}', 'PILLOW', true), ('${FAIR_SCHEME}', 'TRANSPORT', false);
  INSERT INTO public.comm_kpi_items (scheme_id, product_code, product_name, effective_from, amount)
    VALUES ('${FAIR_SCHEME}', 'KPI-PILLOW', 'Cool pillow', '2026-01-01', 25);
  INSERT INTO public.sales_import_batches (id, sub_department_id, status) VALUES ('${BATCH}', '${FAIR}', 'committed');
  INSERT INTO public.comm_venue_events (id, start_date, end_date, period_month, venue_key) VALUES ('${FAIR_EVENT}', '2026-10-02', '2026-10-04', '${OCT}', 'MVEC');
  INSERT INTO public.comm_venues (venue_key, display_name) VALUES ('MVEC', 'MID VALLEY');
  INSERT INTO public.sales_orders (id, batch_id, order_no, period_month, order_date, order_total, paid_amount, staff_id, brand_code, customer_name, venue, fair_event_id) VALUES
    ('${B.ONE}', '${BATCH}', 'HC-SO-2610-004', '${OCT}', '2026-10-03', 4300, 4300, '${S.LUCAS}', 'AKEMI', 'Thong', 'MID VALLEY', '${FAIR_EVENT}'),
    ('${B.TWO}', '${BATCH}', 'HC-SO-2610-010', '${OCT}', '2026-10-05', 1000, 1000, '${S.LUCAS}', 'AKEMI', 'Lee', 'MID VALLEY', NULL),
    ('${B.THEIRS}', '${BATCH}', 'HC-SO-2610-011', '${OCT}', '2026-10-05', 2000, 2000, '${S.ANTHONY}', 'AKEMI', 'Tan', 'MID VALLEY', NULL),
    ('${B.PAID}', '${BATCH}', 'HC-SO-2609-099', '${SEP}', '2026-09-20', 3000, 3000, '${S.LUCAS}', 'AKEMI', 'Ong', 'MID VALLEY', NULL),
    ('${B.SIX}', '${BATCH}', 'HC-SO-2610-020', '${OCT}', '2026-10-06', 2000, 2000, '${S.LUCAS}', 'AKEMI', 'Lim', 'MID VALLEY', NULL),
    ('${B.SEVEN}', '${BATCH}', 'HC-SO-2610-021', '${OCT}', '2026-10-06', 2000, 2000, '${S.LUCAS}', 'AKEMI', 'Goh', 'MID VALLEY', NULL),
    ('${B.MOVED}', '${BATCH}', 'HC-SO-2610-022', '${OCT}', '2026-10-06', 2000, 2000, '${S.LUCAS}', 'AKEMI', 'Koh', 'MID VALLEY', NULL);
  INSERT INTO public.sales_orders (id, batch_id, order_no, period_month, order_date, order_total, paid_amount, staff_id, brand_code, cancelled) VALUES
    ('${B.OUT}', '${BATCH}', 'HC-SO-2610-012', '${OCT}', '2026-10-05', 2000, 2000, '${S.LUCAS}', 'AKEMI', true);
  -- One: a mattress (cost 1,400 → the team's 2,000 at ÷ 0.7), two KPI pillows at no price (2 × RM 25 off its sales), transport.
  INSERT INTO public.sales_order_lines (order_id, line_no, product_code, product_name, item_group, qty, line_amount, cost_amount) VALUES
    ('${B.ONE}', 1, 'AK-MATT-Q', 'AKEMI IMMORTAL MATTRESS', 'MATTRESS', 1, 4250, 1400),
    ('${B.ONE}', 2, 'KPI-PILLOW', 'COOL PILLOW', 'PILLOW', 2, 0, 0),
    ('${B.ONE}', 3, 'TRANSPORT', 'TRANSPORT', 'TRANSPORT', 1, 50, 0),
    ('${B.TWO}', 1, 'AK-MATT-S', 'AKEMI SINGLE', 'MATTRESS', 1, 1000, 350),
    ('${B.THEIRS}', 1, 'AK-MATT-S', 'AKEMI SINGLE', 'MATTRESS', 1, 2000, 700),
    ('${B.PAID}', 1, 'AK-MATT-S', 'AKEMI SINGLE', 'MATTRESS', 1, 3000, 1000),
    ('${B.SIX}', 1, 'AK-MATT-S', 'AKEMI SINGLE', 'MATTRESS', 1, 2000, 700),
    ('${B.SEVEN}', 1, 'AK-MATT-S', 'AKEMI SINGLE', 'MATTRESS', 1, 2000, 700),
    ('${B.MOVED}', 1, 'AK-MATT-S', 'AKEMI SINGLE', 'MATTRESS', 1, 2000, 700),
    ('${B.OUT}', 1, 'AK-MATT-S', 'AKEMI SINGLE', 'MATTRESS', 1, 2000, 700);
  -- September is paid; DAVE's October is closed.
  INSERT INTO public.comm_runs (sub_department_id, scheme_id, period_month, status) VALUES ('${FAIR}', '${FAIR_SCHEME}', '${SEP}', 'applied');
  INSERT INTO public.comm_salesperson_closes (staff_id, sub_department_id, period_month) VALUES ('${S.DAVE}', '${FAIR}', '${OCT}');
`)

// What the Revenue app read before: the whole bill on its owner.
const before = await facts()
check(before[B.ONE], { [S.LUCAS]: [4200, 4200, 2, 52.38] }, 'before: the bill is LUCAS’s alone (4,250 less two KPI pillows at 25, transport out; margin on 4,200)')

// ── The migrations, twice ──
const fileA = (await readFile(new URL('20261021150000_shared_bills_in_the_revenue_app.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
const fileB = (await readFile(new URL('20261021150100_share_order_requests.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(fileA)
await db.exec(fileB)
const md5After = await q(`SELECT proname, md5(prosrc) AS md5 FROM pg_proc WHERE proname IN ('member_order_facts', 'member_order_book_for_staff',
  'member_kpi_for_staff', 'member_arena_booth_history_for_staff') ORDER BY proname`)
await db.exec(fileA)
await db.exec(fileB)
check(await q(`SELECT proname, md5(prosrc) AS md5 FROM pg_proc WHERE proname IN ('member_order_facts', 'member_order_book_for_staff',
  'member_kpi_for_staff', 'member_arena_booth_history_for_staff') ORDER BY proname`), md5After, 'the second run changes nothing')
// The bodies production runs after the migration (its dry run on 2026-10-21 answered the same md5s).
const SWAPPED = {
  member_arena_booth_history_for_staff: '275bdf919dd38cb0930d923cbfe06516',
  member_kpi_for_staff: 'b5b431e78aaffd51cad678c68321166a',
  member_order_book_for_staff: 'ef349e49b1c5a003f8831b0e9aa7cde5',
  member_order_facts: '100ac1c83635cbf163069dff6e52e26b',
}
for (const r of md5After) if (SWAPPED[r.proname]) check(r.md5, SWAPPED[r.proname], `${r.proname}: the body production runs`)
check(await facts(), before, 'with nobody sharing, the Revenue app reads exactly as before')

// ── The notices' kinds: widened, nothing dropped ──
const def = name => one(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = $1`, [name])
for (const k of ['attendance', 'crm', 'hiring', 'it', 'memo', 'review', 'rooms', 'share']) check((await def('app_notifications_kind_check')).includes(`'${k}'`), true, `notice kind ${k}`)
for (const k of ['att_request', 'att_today', 'booking', 'crm_contact', 'crm_invite', 'hiring_request', 'it_request', 'member_request', 'memo', 'share_request'])
  check((await def('app_notifications_ref_kind_check')).includes(`'${k}'`), true, `notice ref ${k}`)

// ── Who may call what ──
for (const fn of ['member_share_order_context(uuid,uuid)', 'member_share_order_send(uuid,jsonb,text)', 'member_share_order_answer(uuid,boolean,text)',
  'member_share_order_cancel(uuid)', 'member_share_requests(uuid,uuid)', 'revenue_share_requests(uuid,date)', 'revenue_share_request_decide(uuid,boolean,text)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
for (const fn of ['sales_order_parts(uuid[])', 'share_request_team(uuid)', 'share_request_blocked(uuid)', 'share_requests_json(uuid[],uuid)',
  'member_honours_forget_share_month()'])
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions' own`)
for (const t of ['sales_order_share_requests', 'sales_order_share_request_parts', 'sales_order_share_request_events'])
  check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT')`), false, `${t}: no client grant`)

// ── The share sheet ──
await member(U.LUCAS)
const ctx = await one(`SELECT public.member_share_order_context($1, NULL)`, [B.ONE])
check([ctx.orderNo, num(ctx.total), ctx.blocked, ctx.request], ['HC-SO-2610-004', 4300, null, null], 'the sheet: the bill, open to share')
check(ctx.holders.map(h => [h.name, num(h.pct), h.owner]), [['LUCAS', 1, true]], 'LUCAS holds all of it')
check(ctx.team.map(t => [t.name, t.unavailable]), [['ANTHONY', null], ['BEN', null], ['CAROL', 'No Revenue app login yet'], ['DAVE', 'Closed for Oct 2026']],
  'the team: never the owner or a department head; who cannot take a part now says why')
await refuses(`SELECT public.member_share_order_context($1, NULL)`, [B.THEIRS], /Only the salesperson on the bill/, 'somebody else’s bill')
check((await one(`SELECT public.member_share_order_context($1, NULL)`, [B.PAID])).blocked, 'Sep 2026 is in payroll, so who shares HC-SO-2609-099 cannot change.', 'a paid month says so')
check((await one(`SELECT public.member_share_order_context($1, NULL)`, [B.OUT])).blocked, 'HC-SO-2610-012 does not count, so there is nothing to share.', 'a bill that does not count says so')
await as(U.PRINCIPAL)
await refuses(`SELECT public.member_share_order_context($1, NULL)`, [B.ONE], /Member account access is not enabled/, 'the Principal has no bills of their own')
await as(U.PRINCIPAL, { principal: true })
check((await one(`SELECT public.member_share_order_context($1, $2)`, [B.ONE, S.LUCAS])).orderNo, 'HC-SO-2610-004', 'View as reads the member’s sheet')
await as(U.HR)
await refuses(`SELECT public.member_share_order_context($1, $2)`, [B.ONE, S.LUCAS], /Principal/, 'nobody else may read somebody’s sheet')

// ── Sending one: what it must say ──
await member(U.LUCAS)
await refuses(`SELECT public.member_share_order_send($1, '[]'::jsonb, '')`, [B.ONE], /Pick who to share it with/, 'somebody to share with')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: 'x', pct: 0.5 }])], /Pick who/, 'a real person')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.LUCAS, pct: 0.5 }])], /your bill already/, 'never the owner')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.5 }, { staffId: S.ANTHONY, pct: 0.2 }])],
  /there twice/, 'each person once')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: '0.5' }])], /Give each colleague a part/, 'a part is a number')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 1 }])], /more than 0% and less than 100%/, 'never the whole bill')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 0 }])], /more than 0% and less than 100%/, 'never nothing')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.6 }, { staffId: S.BEN, pct: 0.4 }])],
  /leaves you nothing/, 'the owner always keeps a part')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.CAROL, pct: 0.5 }])], /CAROL has no Revenue app login/, 'a colleague who can accept')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.DAVE, pct: 0.5 }])], /DAVE’s Oct 2026 is closed/, 'never somebody closed')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.HEAD, pct: 0.5 }])], /HEAD is not in this bill’s sub-department’s team/, 'never a department head')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify(Array.from({ length: 6 }, () => ({ staffId: S.ANTHONY, pct: 0.1 })))],
  /up to 5 people/, 'five at most')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.THEIRS, JSON.stringify([{ staffId: S.BEN, pct: 0.5 }])], /Only the salesperson on the bill/, 'only the owner sends')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.PAID, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.5 }])], /Sep 2026 is in payroll/, 'never a paid month')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.OUT, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.5 }])], /does not count/, 'never a bill that does not count')
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, $3)`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.5 }]), 'n'.repeat(501)], /500 characters/, 'a short note')
await as(U.LUCAS, { perms: ['member_portal'], closed: ['rev.requests.create'] })
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.5 }])],
  /Sending a share request is not open to your account/, 'Profile · Requests · Create unticked: nothing is sent')
await as(U.HR, { actions: ['revenue.edit'] })
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.5 }])], /Member account access/, 'HR sends none')
await asSystem()
check(await one(`SELECT count(*)::int FROM public.sales_order_share_requests`), 0, 'a refused send leaves nothing behind')

// ── LUCAS sends; ANTHONY is told ──
await member(U.LUCAS)
const r1 = await send(B.ONE, [{ staffId: S.ANTHONY, pct: 0.5 }], '  Closed together at Mid Valley ')
check([r1.status, r1.orderNo, r1.periodMonth, r1.owner.name, r1.note, r1.mine], ['partner', 'HC-SO-2610-004', '2026-10', 'LUCAS', 'Closed together at Mid Valley', 'owner'], 'sent')
check(r1.parts.map(p => [p.name, num(p.pct), p.answer]), [['ANTHONY', 0.5, 'pending']], 'ANTHONY’s half, waiting')
check(r1.events.map(e => [e.step, e.name, e.note]), [['sent', 'LUCAS', 'Closed together at Mid Valley']], 'the trail starts')
check([r1.bill.customer, r1.bill.venue, num(r1.bill.total), r1.bill.counts], ['Thong', 'MID VALLEY', 4300, true], 'the bill as the colleague reads it')
check(await notices(U.ANTHONY), [{ kind: 'share', title: 'Share request · HC-SO-2610-004', ref_kind: 'share_request', ref_id: r1.id,
  body: 'LUCAS wants to share HC-SO-2610-004 with you: your part 50% of RM 4,300.00 · MID VALLEY. Accept or decline in the Revenue app.' }], 'ANTHONY is told')
check(await notices(U.LUCAS), [], 'never the sender')
await member(U.LUCAS)
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.BEN, pct: 0.3 }])], /already open/, 'one open request a bill')
check((await one(`SELECT public.member_share_order_context($1, NULL)`, [B.ONE])).request.id, r1.id, 'the sheet shows the open request')
check(await facts(), before, 'nothing moves until HR approves')

// ── Who answers ──
await member(U.BEN)
await refuses(`SELECT public.member_share_order_answer($1, true, NULL)`, [r1.id], /not yours to answer/, 'only the colleague named answers')
await member(U.LUCAS)
await refuses(`SELECT public.member_share_order_answer($1, true, NULL)`, [r1.id], /not yours to answer/, 'never the owner')
await hr()
await refuses(`SELECT public.revenue_share_request_decide($1, true, NULL)`, [r1.id], /still waiting for ANTHONY to accept/, 'HR decides only once everybody accepted')
await member(U.ANTHONY)
const list = await one(`SELECT public.member_share_requests(NULL, NULL)`)
check(list.map(r => [r.id, r.mine, r.status]), [[r1.id, 'partner', 'partner']], 'ANTHONY reads it as his to answer')
await clearNotices()
await member(U.ANTHONY)
const a1 = await answer(r1.id, true)
check([a1.status, a1.parts[0].answer], ['hr', 'accepted'], 'accepted: with HR now')
check(a1.events.map(e => [e.step, e.name]), [['sent', 'LUCAS'], ['accepted', 'ANTHONY']], 'the trail: sent, accepted')
check(await notices(U.LUCAS), [{ kind: 'share', title: 'HC-SO-2610-004 · accepted — with HR now', ref_kind: 'share_request', ref_id: r1.id,
  body: 'ANTHONY accepted sharing HC-SO-2610-004. HR approves it on Comm Cal.' }], 'LUCAS is told')
await member(U.ANTHONY)
await refuses(`SELECT public.member_share_order_answer($1, false, NULL)`, [r1.id], /answered already — it is with HR/, 'answered once')

// ── HR reads the month, then approves ──
await as(U.HR, { actions: ['other.view'] })
await refuses(`SELECT public.revenue_share_requests($1, $2)`, [FAIR, OCT], /Comm Cal is not open/, 'the month’s requests are Comm Cal’s')
await as(U.HR, { actions: ['revenue.view'] })
const month = await one(`SELECT public.revenue_share_requests($1, $2)`, [FAIR, OCT])
check(month.map(r => [r.orderNo, r.status, r.mine]), [['HC-SO-2610-004', 'hr', null]], 'the month: the request, its status')
check(await one(`SELECT jsonb_array_length(public.revenue_share_requests($1, $2))`, [FAIR, SEP]), 0, 'another month: none')
await refuses(`SELECT public.revenue_share_request_decide($1, true, NULL)`, [r1.id], /Deciding share requests is not open/, 'View alone decides nothing')
await hr({ tabShut: true })
await refuses(`SELECT public.revenue_share_request_decide($1, true, NULL)`, [r1.id], /Not open to you on this page/, 'the month’s page’s box unticked: nothing decided')
await hr()
await refuses(`SELECT public.revenue_share_request_decide($1, false, '  ')`, [r1.id], /Say why it is rejected/, 'a rejection says why')
await asSystem()
await q(`INSERT INTO public.member_honour_months (sub_department_id, period_month) VALUES ($1, $2), ($1, $3)`, [FAIR, OCT, SEP])
await clearNotices()
await hr()
const d1 = await decide(r1.id, true)
check([d1.status, d1.decidedByName, d1.decisionNote], ['approved', 'HR Manager', null], 'approved, by HR Manager')
check(d1.events.map(e => [e.step, e.name]), [['sent', 'LUCAS'], ['accepted', 'ANTHONY'], ['approved', 'HR Manager']], 'the whole trail')
check(d1.holders.map(h => [h.name, num(h.pct), h.owner]), [['LUCAS', 0.5, true], ['ANTHONY', 0.5, false]], 'the bill’s holders now')
check(await shares(B.ONE), [[S.ANTHONY, '0.5000']], 'the share is written, as Comm Cal’s Share this bill writes it')
check(await one(`SELECT created_by::text FROM public.sales_order_shares WHERE order_id = $1`, [B.ONE]), U.HR, '…by HR')
for (const user of [U.LUCAS, U.ANTHONY]) check(await notices(user), [{ kind: 'share', title: 'HC-SO-2610-004 · shared', ref_kind: 'share_request', ref_id: r1.id,
  body: 'HR approved: LUCAS 50% · ANTHONY 50%. Each part counts in its holder’s sales and commission.' }], 'both are told')
check((await q(`SELECT to_char(period_month, 'YYYY-MM') AS m FROM public.member_honour_months ORDER BY 1`)).map(r => r.m), ['2026-09'],
  'October’s kept honours are forgotten — the boards moved; September’s stay')
await hr()
await refuses(`SELECT public.revenue_share_request_decide($1, true, NULL)`, [r1.id], /approved already/, 'decided once')

// ── The Revenue app now counts each part ──
const after = await facts()
check(after[B.ONE], { [S.LUCAS]: [2100, 2100, 1, 52.38], [S.ANTHONY]: [2100, 2100, 1, 52.38] },
  'each holds half the sales and half the KPI items; the margin is the bill’s')
for (const [order, rows] of Object.entries(before)) if (order !== B.ONE) check(after[order], rows, `${order}: nobody else moves`)
// The scoreboards (Insight, the Arena, the team and downline boards) sum these rows by person.
await asSystem()
const totals = await q(`SELECT f.staff_id::text, sum(f.revenue)::text AS sales, count(*)::int AS bills FROM public.member_order_facts($1, $2, $3) f
                         WHERE f.cleared GROUP BY f.staff_id ORDER BY f.staff_id`, [FAIR_SCHEME, OCT, '2026-11-01'])
check(totals.map(t => [t.staff_id, num(t.sales), t.bills]), [[S.LUCAS, 2100 + 1000 + 2000 + 2000 + 2000, 5], [S.ANTHONY, 2100 + 2000, 2]],
  'Insight, the Arena and the team boards: LUCAS loses half, ANTHONY gains it; the bill counts once for each')

// My sales orders: whose the bill is, and who holds it.
const bookOf = async staff => (await one(`SELECT public.member_order_book_for_staff($1, $2, $3, $4)`, [staff, FAIR_SCHEME, OCT, '2026-11-01'])).orders
const lucasBook = await bookOf(S.LUCAS), anthonyBook = await bookOf(S.ANTHONY)
const lucasOne = lucasBook.find(o => o.id === B.ONE), anthonyOne = anthonyBook.find(o => o.id === B.ONE)
check([lucasOne.own, num(lucasOne.revenue), num(lucasOne.total), num(lucasOne.share.part)], [true, 2100, 4300, 0.5], 'LUCAS: his bill, his half; the bill’s total')
check(lucasOne.share.holders.map(h => [h.name, num(h.pct), h.owner]), [['LUCAS', 0.5, true], ['ANTHONY', 0.5, false]], 'the holders, the owner first')
check([anthonyOne.own, num(anthonyOne.revenue), num(anthonyOne.share.part), anthonyOne.number], [false, 2100, 0.5, 'HC-SO-2610-004'], 'ANTHONY: LUCAS’s bill, his half')
check(anthonyOne.lines.map(l => [l.name, num(l.kpiQty)]), [['AKEMI IMMORTAL MATTRESS', 0], ['COOL PILLOW', 1], ['TRANSPORT', 0]], 'his KPI items: his half of each line')
check(lucasBook.find(o => o.id === B.TWO).share, null, 'a bill nobody shares carries no share')
check(lucasBook.find(o => o.id === B.TWO).own, true, '…and is his own')
check(anthonyBook.find(o => o.id === B.THEIRS).own, true, 'ANTHONY’s own bill is his')

// Today's and Insight's KPI card: the reader's part.
await asSystem()
check(num((await one(`SELECT public.member_kpi_for_staff($1, $2, $3)`, [S.ANTHONY, FAIR_SCHEME, OCT])).total), 1, 'ANTHONY’s KPI: one pillow of two')
check(num((await one(`SELECT public.member_kpi_for_staff($1, $2, $3)`, [S.LUCAS, FAIR_SCHEME, OCT])).total), 1, 'LUCAS’s: the other')

// The Fair results' booth boards.
const booth = (await one(`SELECT public.member_arena_booth_history_for_staff($1, $2)`, [FAIR, FAIR_SCHEME])).events
check(booth.flatMap(e => e.people.map(p => [p.name, num(p.sales), p.orders])), [['ANTHONY', 2100, 1], ['LUCAS', 2100, 1]], 'each holder’s part on the booth board')

// ── Several colleagues, a decline, and sending again ──
await clearNotices()
await member(U.LUCAS)
const r2 = await send(B.TWO, [{ staffId: S.ANTHONY, pct: 0.3333 }, { staffId: S.BEN, pct: 0.3333 }])
check(r2.parts.map(p => [p.name, num(p.pct)]), [['ANTHONY', 0.3333], ['BEN', 0.3333]], 'a third each')
check((await notices(U.ANTHONY))[0].body, 'LUCAS wants to share HC-SO-2610-010 with you: your part 33.33% of RM 1,000.00 · MID VALLEY. Accept or decline in the Revenue app.', 'each colleague is told their own part')
await clearNotices()
await member(U.ANTHONY)
check((await answer(r2.id, true)).status, 'partner', 'one of two accepted: still waiting')
check(await notices(U.LUCAS), [{ kind: 'share', title: 'HC-SO-2610-010 · ANTHONY accepted', body: 'Still waiting for BEN.', ref_kind: 'share_request', ref_id: r2.id }], 'LUCAS hears who is left')
await clearNotices()
await member(U.BEN)
const declined = await answer(r2.id, false, ' Not my customer ')
check([declined.status, declined.parts.map(p => p.answer)], ['declined', ['accepted', 'declined']], 'BEN declines: the request is over')
for (const user of [U.LUCAS, U.ANTHONY]) check(await notices(user), [{ kind: 'share', title: 'HC-SO-2610-010 · share declined', ref_kind: 'share_request', ref_id: r2.id,
  body: 'BEN declined sharing HC-SO-2610-010. “Not my customer”' }], 'the owner and whoever accepted are told')
await hr()
await refuses(`SELECT public.revenue_share_request_decide($1, true, NULL)`, [r2.id], /declined it, so there is nothing to approve/, 'nothing to approve')
await member(U.LUCAS)
const r3 = await send(B.TWO, [{ staffId: S.ANTHONY, pct: 0.3333 }, { staffId: S.BEN, pct: 0.3333 }])
await member(U.ANTHONY); await answer(r3.id, true)
await member(U.BEN); await answer(r3.id, true)
await hr(); await decide(r3.id, true, 'Fair day 2 — three at the table')
const thirds = (await facts())[B.TWO]
check(thirds, { [S.LUCAS]: [333.4, 333.4, 0, 50], [S.ANTHONY]: [333.3, 333.3, 0, 50], [S.BEN]: [333.3, 333.3, 0, 50] },
  'a third each to the sen; the owner takes the remainder, so the parts add back to the bill')

// ── Changing who holds a shared bill: a shrinking part is written first ──
await member(U.LUCAS)
await refuses(`SELECT public.member_share_order_send($1, $2::jsonb, '')`, [B.ONE, JSON.stringify([{ staffId: S.ANTHONY, pct: 0.5 }])], /already hold those parts/, 'nothing to change')
const r4 = await send(B.ONE, [{ staffId: S.ANTHONY, pct: 0.2 }, { staffId: S.BEN, pct: 0.6 }])
await member(U.ANTHONY); await answer(r4.id, true)
await member(U.BEN); await answer(r4.id, true)
await hr(); await decide(r4.id, true)
check(await shares(B.ONE), [[S.ANTHONY, '0.2000'], [S.BEN, '0.6000']], 'ANTHONY 50% → 20% before BEN takes 60% (the other way round leaves LUCAS nothing for a moment, and the table refuses)')

// ── Withdrawn; rejected; moved before HR decided ──
await clearNotices()
await member(U.LUCAS)
const r5 = await send(B.SIX, [{ staffId: S.BEN, pct: 0.5 }])
await refuses(`SELECT public.member_share_order_cancel($1)`, [r1.id], /approved already/, 'a decided request cannot be withdrawn')
await member(U.BEN)
await refuses(`SELECT public.member_share_order_cancel($1)`, [r5.id], /Only the salesperson who sent it/, 'only its sender withdraws it')
await clearNotices()
await member(U.LUCAS)
check((await cancel(r5.id)).status, 'cancelled', 'withdrawn')
check(await notices(U.BEN), [{ kind: 'share', title: 'HC-SO-2610-020 · share request withdrawn', body: 'LUCAS withdrew the request to share HC-SO-2610-020.',
  ref_kind: 'share_request', ref_id: r5.id }], 'BEN is told')
await member(U.BEN)
await refuses(`SELECT public.member_share_order_answer($1, true, NULL)`, [r5.id], /it is withdrawn/, 'a withdrawn request takes no answer')

await member(U.LUCAS)
const r6 = await send(B.SEVEN, [{ staffId: S.BEN, pct: 0.5 }])
await member(U.BEN); await answer(r6.id, true)
await clearNotices()
await hr()
const rejected = await decide(r6.id, false, 'BEN was not at this fair')
check([rejected.status, rejected.decisionNote, rejected.events.at(-1).step], ['rejected', 'BEN was not at this fair', 'rejected'], 'rejected, with the reason')
check((await notices(U.LUCAS))[0].body, 'HR: “BEN was not at this fair”', 'they read why')
check(await shares(B.SEVEN), [], 'nothing shared')

await member(U.LUCAS)
const r7 = await send(B.MOVED, [{ staffId: S.BEN, pct: 0.5 }])
await member(U.BEN); await answer(r7.id, true)
await asSystem()
await q(`UPDATE public.sales_orders SET staff_id = $1 WHERE id = $2`, [S.ANTHONY, B.MOVED])
await hr()
await refuses(`SELECT public.revenue_share_request_decide($1, true, NULL)`, [r7.id], /HC-SO-2610-022 is ANTHONY’s now — it moved since LUCAS asked/, 'a bill moved since is not approved')
check((await decide(r7.id, false, 'Moved to ANTHONY')).status, 'rejected', '…it is rejected instead')

// ── One's own list; the Principal's View as ──
await member(U.LUCAS)
const mine = await one(`SELECT public.member_share_requests(NULL, NULL)`)
check(mine.every(r => r.mine === 'owner'), true, 'LUCAS: every request his own')
check(mine.length, 7, 'all seven he sent')
await as(U.PRINCIPAL, { principal: true })
check((await one(`SELECT public.member_share_requests($1, $2)`, [S.BEN, FAIR])).map(r => r.mine).sort(), ['partner', 'partner', 'partner', 'partner', 'partner', 'partner'],
  'View as reads BEN’s, as BEN reads them')
await as(U.ANTHONY, { perms: ['member_portal'] })
await refuses(`SELECT public.member_share_requests($1, $2)`, [S.BEN, FAIR], /Principal/, 'a member reads only their own')

await asSystem()
check(await one(`SELECT count(*)::int FROM public.sales_order_share_request_events`), 22, 'every step is on the trail')

console.log(`PASS: ${checks} share-request SQL checks. Production's bodies verbatim; both migrations verbatim, twice. No live database connection.`)

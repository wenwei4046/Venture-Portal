// Local PostgreSQL regression for 20261114210000 (2026-11-14 — the user, after IT-0010's ZNT6430 sat in SHAWN's margin
// though he only scanned it for somebody: a salesperson selects their sales order on the phone and writes a request "not
// my order"; HR approves; "这样它就会直接变成是完完全全 don't count 的形式" — out of revenue, margin and commission).
// Production's own bodies (tests/member-sql/not-my-order-production.sql, md5-checked: Don't count this bill, its triggers,
// share_request_blocked, member_staff_id) are loaded over stand-ins for what they read; the migration then runs VERBATIM,
// twice. No live I/O.
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

const U = { SHAWN: id(1), ANTHONY: id(2), HR: id(3), PRINCIPAL: id(4), LISTENER: id(5) }
const S = { SHAWN: id(101), ANTHONY: id(102), HR: id(103) }
const DEPT = id(201), HQ = id(202), FAIR = id(301), BATCH = id(401), OCT_BATCH = id(402)
const NOV = '2026-11-01', OCT = '2026-10-01'
const B = {
  ONE: id(601), TWO: id(602), THEIRS: id(603), SHARED: id(604), OUT: id(605), PAID: id(606), CLOSED: id(607),
  SHAREREQ: id(608), MOVED: id(609), HANDOUT: id(610), ERPOUT: id(611), LATELOCK: id(612),
}

/** Signed in as a login holding these permissions and actions, as the database role `authenticated`. */
async function as(user, { perms = [], actions = [], closed = [], tabShut = false, principal = false } = {}) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.perms', $2, false), set_config('test.actions', $3, false),
                  set_config('test.closed', $4, false), set_config('test.tab_shut', $5, false), set_config('test.principal', $6, false)`,
    [user ?? '', perms.join(','), actions.join(','), closed.join(','), tabShut ? 'yes' : 'no', principal ? 'yes' : 'no'])
  await db.exec('SET ROLE authenticated')
}
const member = (user, extra = {}) => as(user, { perms: ['member_portal'], ...extra })
const hr = (extra = {}) => as(U.HR, { actions: ['revenue.view', 'revenue.edit'], ...extra })
const asSystem = async () => { await db.exec('RESET ROLE'); await q(`SELECT set_config('request.jwt.claim.sub', '', false)`) }

const context = (order, staff = null) => one(`SELECT public.member_not_mine_context($1, $2)`, [order, staff])
const send = (order, reason) => one(`SELECT public.member_not_mine_send($1, $2)`, [order, reason])
const cancel = request => one(`SELECT public.member_not_mine_cancel($1)`, [request])
const mine = (staff = null, sub = null) => one(`SELECT public.member_not_mine_requests($1, $2)`, [staff, sub])
const month = (sub = FAIR, period = NOV) => one(`SELECT public.revenue_not_mine_requests($1, $2)`, [sub, period])
const decide = (request, approve, note = null) => one(`SELECT public.revenue_not_mine_decide($1, $2, $3)`, [request, approve, note])
const notices = async user => {
  await asSystem()
  return q(`SELECT kind, title, body, ref_kind, ref_id FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, id`, [user])
}
const clearNotices = async () => { await asSystem(); await db.exec('DELETE FROM public.app_notifications') }
const bill = async order => {
  await asSystem()
  return (await q(`SELECT cancelled, excluded_reason FROM public.sales_orders WHERE id = $1`, [order]))[0]
}
const exclusion = async order => {
  await asSystem()
  return (await q(`SELECT note, excluded_by, excluded_by_name FROM public.sales_order_exclusions WHERE order_id = $1`, [order]))[0] ?? null
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
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, user_id uuid, department_id uuid,
    status text NOT NULL DEFAULT 'active', hire_date date, resignation_date date, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, status text);
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY, batch_id uuid, order_no text NOT NULL, period_month date NOT NULL,
    order_date date NOT NULL, event_date date, order_total numeric NOT NULL, staff_id uuid, agent_key text, customer_name text,
    venue text, cancelled boolean NOT NULL DEFAULT false, excluded_reason text, erp_status text, erp_on_hold boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT 'erp_sync');
  CREATE TABLE public.sales_order_shares(order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    staff_id uuid NOT NULL, share_pct numeric(5, 4) NOT NULL DEFAULT 0.5, PRIMARY KEY (order_id, staff_id));
  CREATE TABLE public.sales_order_exclusions(order_id uuid PRIMARY KEY REFERENCES public.sales_orders(id) ON DELETE CASCADE,
    note text CONSTRAINT sales_order_exclusions_note CHECK (note IS NULL OR char_length(note) <= 500),
    excluded_by uuid REFERENCES public.users(id) ON DELETE SET NULL, excluded_by_name text, excluded_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.comm_salesperson_closes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid, sub_department_id uuid,
    period_month date, reopened_at timestamptz, order_ids uuid[] NOT NULL DEFAULT '{}');
  -- The share request table as 20261021150100 made it (what share_request_blocked and the new helper read).
  CREATE TABLE public.sales_order_share_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE, order_no text NOT NULL, sub_department_id uuid NOT NULL,
    period_month date NOT NULL, owner_staff_id uuid NOT NULL, owner_name text NOT NULL, sent_by uuid NOT NULL, note text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'partner' CHECK (status IN ('partner', 'hr', 'approved', 'rejected', 'declined', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.app_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY['attendance'::text, 'claims'::text, 'crm'::text,
      'hiring'::text, 'it'::text, 'marketing'::text, 'memo'::text, 'people'::text, 'review'::text, 'rooms'::text, 'share'::text])),
    title text NOT NULL CONSTRAINT app_notifications_title_check CHECK (length(title) >= 1 AND length(title) <= 200),
    body text NOT NULL DEFAULT '' CONSTRAINT app_notifications_body_check CHECK (length(body) <= 400),
    ref_kind text CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['att_request'::text, 'att_today'::text,
      'booking'::text, 'crm_contact'::text, 'crm_invite'::text, 'hiring_request'::text, 'hr_staff'::text, 'it_request'::text,
      'member_request'::text, 'memo'::text, 'mkt_project'::text, 'mkt_quote'::text, 'payment_request'::text, 'share_request'::text,
      'share_taken'::text])),
    ref_id text, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
  CREATE TABLE public.notification_topics(user_id uuid, topic text);
  CREATE TABLE public.test_locked_months(sub_department_id uuid, period_month date);
  CREATE TABLE public.audit_tables(table_name text PRIMARY KEY, label text);

  CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT p_key = ANY (string_to_array(current_setting('test.perms', true), ',')) $$;
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ','))) $$;
  CREATE FUNCTION public.tab_box_closed(p_tab text, p_action text) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT (p_tab || '.' || p_action) = ANY (string_to_array(current_setting('test.closed', true), ',')) $$;
  CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql AS $$
  BEGIN
    IF current_setting('test.tab_shut', true) = 'yes' THEN
      RAISE EXCEPTION 'That is not open to your account on this page.' USING ERRCODE = '42501';
    END IF;
  END $$;
  CREATE FUNCTION public.commission_order_period_locked(p_sub_department_id uuid, p_period date) RETURNS boolean LANGUAGE sql STABLE AS
    $$ SELECT EXISTS (SELECT 1 FROM public.test_locked_months t WHERE t.sub_department_id = p_sub_department_id AND t.period_month = p_period) $$;
  CREATE FUNCTION public.lock_commission_order_periods(p_sub_department_id uuid, p_periods date[]) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.erp_sync_resequence_day(p_agent_key text, p_event_date date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.erp_sync_refresh_batch(p_batch_id uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.member_principal_context(p_staff uuid, p_sub_department uuid, p_scheme uuid) RETURNS uuid LANGUAGE plpgsql AS $$
  BEGIN
    IF current_setting('test.principal', true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'Only the Principal may view a member.' USING ERRCODE = '42501';
    END IF;
    RETURN NULL;
  END $$;
  CREATE FUNCTION public.notify_people(p_users uuid[], p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
  RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id)
    SELECT DISTINCT u, p_kind, p_title, coalesce(p_body, ''), p_ref_kind, p_ref_id FROM unnest(p_users) u
     WHERE u IS NOT NULL AND u IS DISTINCT FROM auth.uid()
  $$;
  CREATE FUNCTION public.notify_topic(p_topic text, p_kind text, p_title text, p_body text, p_ref_kind text, p_ref_id text)
  RETURNS void LANGUAGE sql AS $$
    SELECT public.notify_people(ARRAY(SELECT t.user_id FROM public.notification_topics t WHERE t.topic = p_topic), p_kind, p_title, p_body,
                                p_ref_kind, p_ref_id)
  $$;
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text, p_keys text[] DEFAULT NULL,
    p_labels text[] DEFAULT NULL, p_ignore text[] DEFAULT NULL, p_omit text[] DEFAULT NULL, p_diff boolean DEFAULT NULL,
    p_salary text[] DEFAULT NULL, p_nric text[] DEFAULT NULL, p_bank text[] DEFAULT NULL, p_needs text DEFAULT NULL,
    p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_tables (table_name, label) VALUES (p_table, p_label)
    ON CONFLICT (table_name) DO UPDATE SET label = EXCLUDED.label
  $$;
`)

// ── Production's own bodies, as they stood on 2026-11-14 (md5 of each body as production reports it, CRs dropped) ──
const PROD = {
  member_staff_id: 'a979898c84f67c45f29ba168cfaf98de',
  sales_order_excluded_by_hand: '7216ddf2b362a0254079edc04d69f217',
  sales_order_exclusions_guard: '668b2cdb68a609f97e0854e345b09a23',
  sales_order_exclusions_apply: '184f8f92c12bc9f51e0d6781865f6989',
  sales_orders_apply_manual_exclusion: 'd710c06b20487cbebe24cdd9d4711d1e',
  revenue_exclude_order: 'fcb2c81ab4ce49553572f1a9fc43b5db',
  share_request_blocked: '23ded4ba1424897388e56e0c9b52e5e1',
}
const production = (await readFile(new URL('./not-my-order-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(production)
const md5Of = name => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE proname = $1 ORDER BY oid DESC LIMIT 1`, [name])
for (const [name, md5] of Object.entries(PROD)) check(await md5Of(name), md5, `${name}: production's body`)
await db.exec(`
  CREATE TRIGGER sales_orders_manual_exclusion BEFORE INSERT OR UPDATE ON public.sales_orders
    FOR EACH ROW EXECUTE FUNCTION public.sales_orders_apply_manual_exclusion();
  CREATE TRIGGER sales_order_exclusions_guard BEFORE INSERT OR DELETE OR UPDATE ON public.sales_order_exclusions
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_exclusions_guard();
  CREATE TRIGGER sales_order_exclusions_apply AFTER INSERT OR DELETE ON public.sales_order_exclusions
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_exclusions_apply();
  GRANT EXECUTE ON FUNCTION public.revenue_exclude_order(uuid, text) TO authenticated;
`)

// ── The world: SHAWN and ANTHONY sell for Fair; HR (LI SEAN) decides; somebody listens to the revenue.shares topic ──
await db.exec(`
  INSERT INTO public.users (id, name, email) VALUES
    ('${U.SHAWN}', 'Shawn', 'shawn@x'), ('${U.ANTHONY}', 'Anthony', 'anthony@x'), ('${U.HR}', 'HR Manager', 'hr@x'),
    ('${U.PRINCIPAL}', 'Principal', 'principal@x'), ('${U.LISTENER}', 'HR Two', 'hr2@x');
  INSERT INTO public.departments VALUES ('${DEPT}', 'Revenue', 'commission'), ('${HQ}', 'HQ', 'salary');
  INSERT INTO public.hr_staff_costs (id, employee_name, user_id, department_id) VALUES
    ('${S.SHAWN}', 'SHAWN', '${U.SHAWN}', '${DEPT}'), ('${S.ANTHONY}', 'ANTHONY', '${U.ANTHONY}', '${DEPT}'),
    ('${S.HR}', 'LI SEAN', '${U.HR}', '${HQ}');
  INSERT INTO public.comm_sub_departments VALUES ('${FAIR}', 'Fair');
  INSERT INTO public.sales_import_batches VALUES ('${BATCH}', '${FAIR}', 'committed'), ('${OCT_BATCH}', '${FAIR}', 'committed');
  INSERT INTO public.notification_topics VALUES ('${U.LISTENER}', 'revenue.shares'), ('${U.HR}', 'revenue.shares');
  INSERT INTO public.sales_orders (id, batch_id, order_no, period_month, order_date, order_total, staff_id, agent_key, customer_name, venue)
  VALUES
    ('${B.ONE}', '${BATCH}', 'HC-SO-2611-044', '${NOV}', '2026-11-03', 2700, '${S.SHAWN}', 'SHAWN', 'Tan May Yi', 'MID VALLEY'),
    ('${B.TWO}', '${BATCH}', 'HC-SO-2611-045', '${NOV}', '2026-11-03', 5000, '${S.SHAWN}', 'SHAWN', 'Lee', 'MID VALLEY'),
    ('${B.THEIRS}', '${BATCH}', 'HC-SO-2611-046', '${NOV}', '2026-11-04', 4100, '${S.ANTHONY}', 'ANTHONY', 'Ng', 'MID VALLEY'),
    ('${B.SHARED}', '${BATCH}', 'HC-SO-2611-047', '${NOV}', '2026-11-04', 6000, '${S.SHAWN}', 'SHAWN', 'Ong', 'MID VALLEY'),
    ('${B.OUT}', '${BATCH}', 'HC-SO-2611-048', '${NOV}', '2026-11-05', 3000, '${S.SHAWN}', 'SHAWN', 'Tan', 'MID VALLEY'),
    ('${B.PAID}', '${OCT_BATCH}', 'HC-SO-2610-401', '${OCT}', '2026-10-26', 3300, '${S.SHAWN}', 'SHAWN', 'Lim', 'MID VALLEY'),
    ('${B.CLOSED}', '${BATCH}', 'HC-SO-2611-049', '${NOV}', '2026-11-05', 3500, '${S.SHAWN}', 'SHAWN', 'Chan', 'MID VALLEY'),
    ('${B.SHAREREQ}', '${BATCH}', 'HC-SO-2611-050', '${NOV}', '2026-11-06', 3900, '${S.SHAWN}', 'SHAWN', 'Wong', 'MID VALLEY'),
    ('${B.MOVED}', '${BATCH}', 'HC-SO-2611-051', '${NOV}', '2026-11-06', 2100, '${S.SHAWN}', 'SHAWN', 'Goh', 'MID VALLEY'),
    ('${B.HANDOUT}', '${BATCH}', 'HC-SO-2611-052', '${NOV}', '2026-11-07', 2200, '${S.SHAWN}', 'SHAWN', 'Yap', 'MID VALLEY'),
    ('${B.ERPOUT}', '${BATCH}', 'HC-SO-2611-053', '${NOV}', '2026-11-07', 2300, '${S.SHAWN}', 'SHAWN', 'Koh', 'MID VALLEY'),
    ('${B.LATELOCK}', '${OCT_BATCH}', 'HC-SO-2610-402', '${OCT}', '2026-10-27', 2400, '${S.SHAWN}', 'SHAWN', 'Teo', 'MID VALLEY');
  UPDATE public.sales_orders SET cancelled = true, erp_status = 'CANCELLED' WHERE id = '${B.OUT}';
  INSERT INTO public.sales_order_shares VALUES ('${B.SHARED}', '${S.ANTHONY}', 0.5);
  INSERT INTO public.comm_salesperson_closes (staff_id, sub_department_id, period_month, order_ids)
  VALUES ('${S.SHAWN}', '${FAIR}', '${NOV}', ARRAY['${B.CLOSED}'::uuid]);
  INSERT INTO public.sales_order_share_requests (order_id, order_no, sub_department_id, period_month, owner_staff_id, owner_name, sent_by)
  VALUES ('${B.SHAREREQ}', 'HC-SO-2611-050', '${FAIR}', '${NOV}', '${S.SHAWN}', 'SHAWN', '${U.SHAWN}');
  INSERT INTO public.test_locked_months VALUES ('${FAIR}', '${OCT}');
`)

// ── The migration, verbatim, twice ──
const migration = (await readFile(new URL('20261114210000_not_my_order_requests.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(migration)
const blockedAfter = await md5Of('share_request_blocked')
const BODIES = `SELECT proname, md5(replace(prosrc, E'\\r', '')) AS md5 FROM pg_proc
                 WHERE proname IN ('share_request_blocked', 'not_mine_requests_json', 'not_mine_request_blocked', 'member_not_mine_context',
                                   'member_not_mine_send', 'member_not_mine_cancel', 'member_not_mine_requests', 'revenue_not_mine_requests',
                                   'revenue_not_mine_decide') ORDER BY proname`
const md5After = await q(BODIES)
await db.exec(migration)
check(await q(BODIES), md5After, 'the second run changes nothing')
// The bodies production runs after the migration (its dry run on 2026-11-14 answered the same md5s).
const MADE = {
  member_not_mine_cancel: 'c5285e6f7a6a432d7aefc6e2c67f1fcb',
  member_not_mine_context: 'd634ff8a4845c7bc3f0c716a7b7c6c27',
  member_not_mine_requests: '5606750b66fcc48dc96a6470d08b2b80',
  member_not_mine_send: 'fa1a125067c650fd6520fdc9f1e2882d',
  not_mine_request_blocked: 'e0a094bb3c587eb5b31f85d1a759dcd1',
  not_mine_requests_json: '46cf2dbc0f5ce3dcd335a5bf40fb045e',
  revenue_not_mine_decide: '88e5211a2b25c9d0f8a239d79cf175f5',
  revenue_not_mine_requests: '4fae56b62e80c2a860d5594ec8c64d65',
  share_request_blocked: 'b7322ef67305370994b72a8215573882',
}
for (const r of md5After) check(r.md5, MADE[r.proname], `${r.proname}: the body production runs`)
check(blockedAfter !== PROD.share_request_blocked, true, 'share_request_blocked is made again')
check(await one(`SELECT count(*)::int FROM public.audit_tables WHERE table_name = 'sales_order_not_mine_requests'`), 1, 'the table is in the audit')
check(await one(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sales_order_not_mine_requests'::regclass`), true, 'RLS is on')
check(await one(`SELECT has_table_privilege('authenticated', 'public.sales_order_not_mine_requests', 'SELECT')`), false, 'no client reads it')
check(await one(`SELECT pg_get_constraintdef(oid) LIKE '%not_mine_request%' FROM pg_constraint WHERE conname = 'app_notifications_ref_kind_check'`),
  true, 'a notice may point at a request')
check(await one(`SELECT pg_get_constraintdef(oid) LIKE '%share_taken%' AND pg_get_constraintdef(oid) LIKE '%mkt_quote%'
                   FROM pg_constraint WHERE conname = 'app_notifications_ref_kind_check'`), true, '…and nothing it allowed is dropped')

// ── Who may call what ──
for (const fn of ['member_not_mine_context(uuid, uuid)', 'member_not_mine_send(uuid, text)', 'member_not_mine_cancel(uuid)',
                  'member_not_mine_requests(uuid, uuid)', 'revenue_not_mine_requests(uuid, date)', 'revenue_not_mine_decide(uuid, boolean, text)']) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `${fn}: signed-in users`)
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `${fn}: never anon`)
}
for (const fn of ['not_mine_requests_json(uuid[])', 'not_mine_request_blocked(uuid)']) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn}: nobody's to call`)
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `${fn}: never anon`)
}

// ── The sheet ──
await member(U.SHAWN)
let ctx = await context(B.ONE)
check([ctx.orderNo, Number(ctx.total), ctx.customer, ctx.blocked, ctx.request], ['HC-SO-2611-044', 2700, 'Tan May Yi', null, null],
  'SHAWN opens his own bill: nothing in the way')
await refuses(`SELECT public.member_not_mine_context($1, NULL)`, [B.THEIRS], /Only the salesperson on the bill/, 'never a colleague’s bill')
check((await context(B.SHARED)).blocked, 'HC-SO-2611-047 is shared — HR changes who holds it on Comm Cal.', 'a shared bill')
check((await context(B.OUT)).blocked, 'HC-SO-2611-048 does not count already — it is in nobody\'s sales.', 'a bill that does not count')
check((await context(B.PAID)).blocked, 'Oct 2026 is in payroll, so HC-SO-2610-401 cannot be taken out now.', 'a month in payroll')
check((await context(B.CLOSED)).blocked, 'SHAWN’s Nov 2026 is closed on Comm Cal, so HC-SO-2611-049 cannot be taken out until HR reopens it.',
  'a close that gave its commission')
check((await context(B.SHAREREQ)).blocked, 'A share request for HC-SO-2611-050 is open — withdraw it first.', 'a share request open on it')
await as(U.PRINCIPAL, { principal: true })
check((await context(B.ONE, S.SHAWN)).orderNo, 'HC-SO-2611-044', 'the Principal’s View as of SHAWN reads his sheet')
await as(U.ANTHONY, { perms: ['member_portal'] })
await refuses(`SELECT public.member_not_mine_context($1, $2)`, [B.ONE, S.SHAWN], /Only the Principal/, 'View as is the Principal’s alone')

// ── Sending ──
await member(U.SHAWN, { closed: ['rev.requests.create'] })
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.ONE, 'Keyed for ANTHONY'], /not open to your account/, 'a closed Requests › Create box')
await member(U.SHAWN)
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.ONE, '   '], /Say whose order it is/, 'a reason is required')
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.ONE, 'x'.repeat(501)], /500 characters/, 'a reason of 500 at most')
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.THEIRS, 'not mine'], /Only the salesperson on the bill/, 'never a colleague’s bill')
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.SHARED, 'not mine'], /is shared/, 'never a shared bill')
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.OUT, 'not mine'], /does not count already/, 'never a bill that does not count')
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.PAID, 'not mine'], /is in payroll/, 'never a month in payroll')
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.CLOSED, 'not mine'], /is closed on Comm Cal/, 'never a closed bill')
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.SHAREREQ, 'not mine'], /share request for HC-SO-2611-050 is open/,
  'never while a share request is open')
await as(U.ANTHONY)
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.ONE, 'x'], /Member account access is not enabled/, 'a member login only')

await clearNotices()
await member(U.SHAWN)
const one1 = await send(B.ONE, '  Keyed for ANTHONY  ')
check([one1.status, one1.orderNo, one1.staff.name, one1.reason, one1.periodMonth, one1.bill.counts],
  ['hr', 'HC-SO-2611-044', 'SHAWN', 'Keyed for ANTHONY', '2026-11', true], 'sent: with HR, the reason trimmed')
const hrNotice = await notices(U.LISTENER)
check(hrNotice, [{
  kind: 'share', title: 'HC-SO-2611-044 · not SHAWN’s order?',
  body: 'SHAWN says HC-SO-2611-044 is not theirs (RM 2,700, Tan May Yi): “Keyed for ANTHONY”. Approve or reject it on Comm Cal › Requests.',
  ref_kind: 'share_taken', ref_id: 'fair/2026-11-01',
}], 'HR is told — the notice opens Comm Cal’s month on its Requests tab')
await member(U.SHAWN)
await refuses(`SELECT public.member_not_mine_send($1, $2)`, [B.ONE, 'again'], /with HR already/, 'one open request a bill')
ctx = await context(B.ONE)
check([ctx.blocked, ctx.request?.id], [null, one1.id], 'the sheet shows the open request')
await asSystem()
check(await one(`SELECT public.share_request_blocked($1)`, [B.ONE]),
  'A Not my order request for HC-SO-2611-044 is with HR — it cannot be shared until HR answers it.', 'a share waits while it is open')
check(await one(`SELECT public.share_request_blocked($1)`, [B.TWO]), null, 'other bills share as before')
check(await one(`SELECT public.share_request_blocked($1)`, [B.SHARED]), 'HC-SO-2611-047 is shared already — HR changes who shares it on Comm Cal.',
  'share_request_blocked’s own words stand')

// ── Lists ──
await member(U.SHAWN)
check((await mine()).map(r => r.id), [one1.id], 'SHAWN’s own list')
await member(U.ANTHONY)
check(await mine(), [], 'ANTHONY’s list is his own')
await as(U.PRINCIPAL, { principal: true })
check((await mine(S.SHAWN, FAIR)).map(r => r.id), [one1.id], 'View as reads SHAWN’s')
await hr({ actions: ['revenue.view'] })
check((await month()).map(r => [r.id, r.status]), [[one1.id, 'hr']], 'Comm Cal › Requests: the month’s')
check(await month(FAIR, OCT), [], '…and not another month’s')
await as(U.ANTHONY, { perms: ['member_portal'] })
await refuses(`SELECT public.revenue_not_mine_requests($1, $2)`, [FAIR, NOV], /Comm Cal is not open/, 'Comm Cal’s list asks Revenue · View')

// ── HR decides ──
await hr({ actions: ['revenue.view'] })
await refuses(`SELECT public.revenue_not_mine_decide($1, true, NULL)`, [one1.id], /not open to your account/, 'deciding asks Revenue · Edit')
await hr({ tabShut: true })
await refuses(`SELECT public.revenue_not_mine_decide($1, true, NULL)`, [one1.id], /not open to your account on this page/,
  '…on the month page’s tab')
await hr()
await refuses(`SELECT public.revenue_not_mine_decide($1, false, '  ')`, [one1.id], /Say why it is rejected/, 'a reject says why')
await clearNotices()
await hr()
const approved = await decide(one1.id, true)
check([approved.status, approved.decidedByName, approved.decisionNote, approved.bill.counts], ['approved', 'LI SEAN', null, false],
  'approved: the bill counts no more')
check(await bill(B.ONE), { cancelled: true, excluded_reason: 'manual' }, 'taken out exactly as Don’t count this bill takes it out')
check(await exclusion(B.ONE), { note: 'Not SHAWN’s order — Keyed for ANTHONY', excluded_by: U.HR, excluded_by_name: 'HR Manager' },
  'in HR’s name, saying whose it was not')
check(await notices(U.SHAWN), [{
  kind: 'share', title: 'HC-SO-2611-044 · not counted', body: 'HR approved: it is out of your sales, margin and commission.',
  ref_kind: 'not_mine_request', ref_id: one1.id,
}], 'SHAWN is told — the notice opens his request')
await hr()
await refuses(`SELECT public.revenue_not_mine_decide($1, true, NULL)`, [one1.id], /approved already/, 'decided once')
await member(U.SHAWN)
await refuses(`SELECT public.member_not_mine_cancel($1)`, [one1.id], /HR approved it already/, 'nothing left to withdraw')
check((await context(B.ONE)).blocked, 'HC-SO-2611-044 does not count already — it is in nobody\'s sales.', 'the sheet says so after')
await asSystem()
check(await one(`SELECT public.share_request_blocked($1)`, [B.ONE]), null, 'nothing open on it any more')

// Reject: the bill stays his.
await member(U.SHAWN)
const two1 = await send(B.TWO, 'Sold by LUCAS')
await clearNotices()
await hr()
const rejected = await decide(two1.id, false, 'You sold it at the Mid Valley booth.')
check([rejected.status, rejected.decisionNote, rejected.bill.counts], ['rejected', 'You sold it at the Mid Valley booth.', true],
  'rejected: the bill counts')
check(await bill(B.TWO), { cancelled: false, excluded_reason: null }, '…untouched')
check((await notices(U.SHAWN)).map(n => [n.title, n.body, n.ref_kind]),
  [['HC-SO-2611-045 · request rejected', 'HR: “You sold it at the Mid Valley booth.” It stays in your sales.', 'not_mine_request']],
  'SHAWN is told why')

// Withdraw: his alone, while it is with HR.
await member(U.SHAWN)
const two2 = await send(B.TWO, 'Asked again')
await member(U.ANTHONY)
await refuses(`SELECT public.member_not_mine_cancel($1)`, [two2.id], /Only the salesperson who sent it/, 'nobody else withdraws it')
await member(U.SHAWN)
check((await cancel(two2.id)).status, 'cancelled', 'withdrawn')
await refuses(`SELECT public.member_not_mine_cancel($1)`, [two2.id], /withdrawn already/, 'once')
await hr()
await refuses(`SELECT public.revenue_not_mine_decide($1, true, NULL)`, [two2.id], /The salesperson withdrew it/, 'nothing left to approve')
check(await bill(B.TWO), { cancelled: false, excluded_reason: null }, 'the bill counts')
await member(U.SHAWN)
// (PGlite's now() is a millisecond: rows written back to back may tie, so the list is compared as a set here.)
check((await mine()).map(r => `${r.orderNo} ${r.status}`).sort(),
  ['HC-SO-2611-044 approved', 'HC-SO-2611-045 cancelled', 'HC-SO-2611-045 rejected'], 'his list: every request of his')

// Approve re-checks the bill.
await member(U.SHAWN)
const moved = await send(B.MOVED, 'Not mine')
const handOut = await send(B.HANDOUT, 'Not mine either')
const erpOut = await send(B.ERPOUT, 'Not mine at all')
await asSystem()
await db.exec(`UPDATE public.sales_orders SET staff_id = '${S.ANTHONY}' WHERE id = '${B.MOVED}'`)
await db.exec(`UPDATE public.sales_orders SET cancelled = true, erp_status = 'CANCELLED' WHERE id = '${B.ERPOUT}'`)
// HR's own Don't count this bill meanwhile (INVOKER: the table owner's rights here; RLS is production's business).
await db.exec('RESET ROLE')
await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [U.HR])
await one(`SELECT public.revenue_exclude_order($1, $2)`, [B.HANDOUT, 'duplicate of HC-SO-2611-001'])
await hr()
await refuses(`SELECT public.revenue_not_mine_decide($1, true, NULL)`, [moved.id], /is ANTHONY’s now — it moved since SHAWN asked/,
  'a bill moved meanwhile is rejected, not approved')
await refuses(`SELECT public.revenue_not_mine_decide($1, true, NULL)`, [erpOut.id], /does not count already \(the ERP keeps it out\)/,
  'one the ERP took out is rejected')
check((await decide(handOut.id, true)).status, 'approved', 'one taken out by hand meanwhile: approved as it stands')
check(await exclusion(B.HANDOUT), { note: 'duplicate of HC-SO-2611-001', excluded_by: U.HR, excluded_by_name: 'HR Manager' },
  '…its exclusion and note left alone')

// A month that went into payroll meanwhile: refused, its words.
await asSystem()
await db.exec(`DELETE FROM public.test_locked_months`)
await member(U.SHAWN)
const late = await send(B.LATELOCK, 'Keyed for WEI PIN')
await asSystem()
await db.exec(`INSERT INTO public.test_locked_months VALUES ('${FAIR}', '${OCT}')`)
await hr()
await refuses(`SELECT public.revenue_not_mine_decide($1, true, NULL)`, [late.id], /Oct 2026 is in payroll/, 'a paid month refuses approve')
check(await bill(B.LATELOCK), { cancelled: false, excluded_reason: null }, '…and nothing changed')

console.log(`validate-not-my-order: ${checks} checks passed`)

// Local PostgreSQL regression for 20261107233000 — a share takes effect when the colleague accepts, and the app's
// sales are what the commission is (2026-11-07; the user: "Sally 那边 accept 了之后，这张单就正常了，不需要 HR
// approval，所以它的 trail 只有两个" · "原本 1 万块的单分 50% 过去，他就只有 5,000 块的 Sales Record" · "drop 50%，原本 1 万块
// 的 total sales order 也只是算 5,000 块的 sales").
//
// Production's bodies (tests/member-sql/shares-weighted-sales-production.sql, pg_get_functiondef with 20261107230000
// live, md5-checked) are loaded over stand-ins for what they read; two requests wait with HR, as on production; the
// migration then runs VERBATIM, twice. Under test — A: the one with HR that passes its checks takes effect (owner,
// colleague and HR told), the one that does not stays with HR; an accept takes effect at once (trail sent → accepted,
// decided by the colleague, the owner and HR told, HR's line at each one's rate, ref share_taken 'fair/<month>'); a
// refusal (a closed month, a bill that moved) changes nothing, the answer included; HR's 'partner' wording; the
// revenue.shares topic (may, sync, seeded, its CHECK) and ref_kind share_taken. B: each part's weight — a live
// penalty band (the bill's brand, its goods lines' brand, every brand's), none for a head, a stored close's or applied
// run's multiplier (not a reopened close's, not a computed run's), 1 for what a close paid or a release, none with the
// penalty off; revenue weighted, full_revenue whole; the books' fullRevenue / weight (the department's, the parts'
// together); the margins unweighted; the Arena's fair boards split and weighted, an unassigned bill once; an old bill
// topped up still out of the sales and listed. Last, the migration refuses a body it was not written from. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const MIGRATION = new URL('../../supabase/migrations/20261107233000_shares_take_effect_weighted_sales.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), pattern, what)
  checks++
}

const FAIR = id(1), SCHEME = id(2), BATCH = id(21), FAIR_EVENT = id(31), T_HEAD = id(41)
const R5 = id(51), R9 = id(52), R10 = id(53)
const BR_ZANOTTI = id(61), BR_AKEMI = id(62)
// Salespeople, and their logins.
const LOUIS = id(101), SHELDON = id(102), KARJIUN = id(103), SALLY = id(104), MELVIN = id(105), KRIS = id(106),
  ANNE = id(107), ZOE = id(108), WEI = id(109)
const U = Object.fromEntries([LOUIS, SHELDON, KARJIUN, SALLY, MELVIN, KRIS, ANNE, ZOE, WEI].map((s, i) => [s, id(201 + i)]))
const HR = id(301), HR_NO_EDIT = id(302), HR_UNSUBSCRIBED = id(303)
// Bills.
const B1 = id(401), B2 = id(402), B3 = id(403), B4 = id(404), B5 = id(405), OLD1 = id(406)
const W1 = id(501), W2 = id(502), W3 = id(503), W3B = id(504), W3C = id(505), W3D = id(506), W4 = id(507), W5 = id(508),
  W6 = id(509), W7 = id(510), W8 = id(511), W9 = id(512), W10 = id(513)
const REQ_LEGACY_OK = id(601), REQ_LEGACY_BAD = id(602)
const PRODUCTION = {
  sales_order_old_bill: 'b041e9f29254d99d6b13fbd269b3d3fb',
  sales_order_parts: '5232a846101d466c329cf34148db4d48',
  member_order_facts_with_old_bills: 'a44fa5e5eb5934a60a8927a886ab69cf',
  member_order_facts: '987d328c0ec4087e4ce6f3e58346a382',
  member_order_book_for_staff: 'dda01c1653e5bccfc6191905c5f4e5bf',
  member_principal_department_order_book: '06407bc90bc5e9ca1a888bd19a9fc730',
  member_arena_history_for_staff: '44f66cb5dc4526ae177534929043bc5c',
  member_arena_booth_history_for_staff: '877c601f547dd01fecec83a4799a93bd',
  share_request_blocked: '23ded4ba1424897388e56e0c9b52e5e1',
  share_request_team: '17fac6af9f46ff6f2c6b7073b3f2e3a8',
  share_requests_json: 'f59e7e17c8ee6634d68c9b4031a5d4e8',
  notify_people: '50259847648f421acbe03abd41dd0d95',
  notification_topic_may: '5bd3decefb4fb753a3ef464573ff0b66',
  notify_topic: '5a9bbaa9340cfad42ed1960a275c3e56',
  notification_topics_sync: '931c63761257d74fbe3b0162f2d71464',
  sales_order_shares_guard: '682faa11fa480ba73f56122390a9ff1f',
  member_share_order_send: '388916e2f526dee74410a0ca3cf40e86',
  member_share_order_answer: '5da728faa7bf1a9f9756b3d3b0457c13',
  revenue_share_request_decide: '9b4e77261994128a41802f53666ea135',
}
const MADE = ['share_request_take_effect', 'member_share_order_answer', 'revenue_share_request_decide', 'notification_topic_may',
  'notification_topics_sync', 'member_order_facts_with_old_bills', 'member_order_book_for_staff',
  'member_principal_department_order_book', 'member_arena_history_for_staff', 'member_arena_booth_history_for_staff']

// The office's month, whenever this runs: the bills land in it; the fair was the month before.
const MONTH = await one(`SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date::text`)
const PREV = await one(`SELECT ($1::date - interval '1 month')::date::text`, [MONTH])
const YM = MONTH.slice(0, 7)
const MON = await one(`SELECT to_char($1::date, 'Mon YYYY')`, [MONTH])

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  -- ── Stand-ins for what production's bodies read, with the columns they read ──
  CREATE TABLE users(id uuid PRIMARY KEY, name text, email text, role text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE titles(id uuid PRIMARY KEY, name text, is_department_head boolean NOT NULL DEFAULT false);
  CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, status text NOT NULL DEFAULT 'active',
    title_id uuid, user_id uuid, resignation_date date, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, code text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, enable_kpi boolean NOT NULL DEFAULT false,
    revenue_cost_divisor numeric, deposit_threshold_pct numeric, enable_margin_penalty boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE comm_ranks(id uuid PRIMARY KEY, scheme_id uuid, product_rate numeric NOT NULL);
  CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, staff_id uuid, title_id uuid,
    rank_id uuid, effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE comm_brands(id uuid PRIMARY KEY, scheme_id uuid, code text NOT NULL);
  CREATE TABLE comm_margin_bands(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, brand_id uuid, kind text NOT NULL,
    margin_pct numeric NOT NULL, commission_multiplier numeric NOT NULL DEFAULT 1, sort_order integer NOT NULL DEFAULT 0);
  CREATE TABLE comm_salesperson_closes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sub_department_id uuid, period_month date,
    staff_id uuid, reopened_at timestamptz, order_ids uuid[] NOT NULL DEFAULT '{}', penalised_orders jsonb NOT NULL DEFAULT '[]');
  CREATE TABLE comm_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid, sub_department_id uuid, period_month date,
    status text NOT NULL, penalised_orders jsonb NOT NULL DEFAULT '[]');
  CREATE TABLE sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid, period_month date, status text NOT NULL DEFAULT 'committed');
  CREATE TABLE sales_orders(id uuid PRIMARY KEY, batch_id uuid, period_month date NOT NULL, order_no text NOT NULL,
    order_date date NOT NULL, staff_id uuid, agent_name text, customer_name text, bill_ref text, venue text,
    order_total numeric NOT NULL DEFAULT 0, paid_amount numeric NOT NULL DEFAULT 0, cancelled boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT 'erp_sync', brand_code text, manual_margin_pct numeric, fair_event_id uuid, fair_source text,
    raw jsonb, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE sales_order_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, line_no integer, item_group text,
    product_code text, product_name text, qty numeric NOT NULL DEFAULT 1, line_amount numeric, cost_amount numeric,
    option_charge_amount numeric NOT NULL DEFAULT 0, brand_code text);
  CREATE TABLE sales_order_shares(order_id uuid, staff_id uuid, share_pct numeric NOT NULL CHECK (share_pct > 0 AND share_pct < 1),
    created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (order_id, staff_id));
  CREATE TABLE sales_order_share_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, order_no text NOT NULL,
    sub_department_id uuid NOT NULL, period_month date NOT NULL, owner_staff_id uuid NOT NULL, owner_name text NOT NULL,
    sent_by uuid NOT NULL, note text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'partner' CHECK (status = ANY (ARRAY['partner','hr','approved','rejected','declined','cancelled'])),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
    decided_by uuid, decided_by_name text, decision_note text);
  CREATE TABLE sales_order_share_request_parts(request_id uuid NOT NULL, staff_id uuid NOT NULL, staff_name text NOT NULL,
    share_pct numeric NOT NULL, answer text NOT NULL DEFAULT 'pending' CHECK (answer = ANY (ARRAY['pending','accepted','declined'])),
    answered_at timestamptz, answer_note text, PRIMARY KEY (request_id, staff_id));
  CREATE TABLE sales_order_share_request_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL,
    step text NOT NULL CHECK (step = ANY (ARRAY['sent','accepted','declined','cancelled','approved','rejected'])),
    actor_id uuid, actor_staff_id uuid, actor_name text NOT NULL, note text, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
  CREATE TABLE app_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, kind text NOT NULL,
    title text NOT NULL, body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
    CONSTRAINT app_notifications_kind_check CHECK (kind = ANY (ARRAY['attendance','claims','crm','hiring','it','marketing','memo',
      'people','review','rooms','share'])),
    CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind = ANY (ARRAY['att_request','att_today','booking','crm_contact',
      'crm_invite','hiring_request','hr_staff','it_request','member_request','memo','mkt_project','payment_request','share_request'])));
  CREATE TABLE notification_topics(user_id uuid NOT NULL, topic text NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, topic),
    CONSTRAINT notification_topics_topic_check CHECK (topic = ANY (ARRAY['hiring.guest','it.requests','member.requests',
      'people.probation','rooms.guest'])));
  CREATE TABLE comm_order_releases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no text, sub_department_id uuid, period_month date);
  CREATE TABLE comm_item_groups(scheme_id uuid, item_group text, commissionable boolean);
  CREATE TABLE comm_cost_ratios(scheme_id uuid, product_code text, ratio numeric);
  CREATE TABLE comm_venue_events(id uuid PRIMARY KEY, venue_key text, start_date date, end_date date, period_month date,
    organiser_id uuid, erp_organiser_text text);
  CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text);
  CREATE TABLE comm_organisers(id uuid PRIMARY KEY, name text);
  CREATE TABLE erp_feed_settings(sub_department_id uuid PRIMARY KEY, min_order_date date);
  -- What the stand-ins below decide by: who holds which action, whose Comm Cal page is closed, which month is locked.
  CREATE TABLE granted(user_id uuid, action text);
  CREATE TABLE closed_tabs(user_id uuid);
  CREATE TABLE locked_months(sub_department_id uuid, period_month date);

  CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT s.id FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' ORDER BY s.id LIMIT 1 $$;
  CREATE FUNCTION public.has_any_action(p_actions text[]) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT EXISTS (SELECT 1 FROM public.granted g WHERE g.user_id = auth.uid() AND g.action = ANY (p_actions)) $$;
  CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT NOT EXISTS (SELECT 1 FROM public.closed_tabs t WHERE t.user_id = auth.uid()) $$;
  CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql
    AS $$ BEGIN IF NOT public.tab_write_open(p_pages, p_wants) THEN RAISE EXCEPTION 'That page is closed to you.' USING ERRCODE = '42501'; END IF; END $$;
  CREATE FUNCTION public.tab_box_closed(p_tab text, p_box text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_manager(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.probation_notice_may(p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.commission_order_period_locked(p_sub uuid, p_month date) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT EXISTS (SELECT 1 FROM public.locked_months l WHERE l.sub_department_id = p_sub AND l.period_month = p_month) $$;
  CREATE FUNCTION public.comm_first_paid_month(p_sub_department_id uuid) RETURNS date LANGUAGE sql STABLE AS $$ SELECT '2026-09-01'::date $$;
  CREATE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
    RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric) LANGUAGE sql STABLE
    AS $$ SELECT NULL::uuid, NULL::uuid, NULL::uuid, 0::numeric, 0::numeric WHERE false $$;
  CREATE FUNCTION public.member_erp_brand_weeks(p_sub_department uuid, p_staff uuid DEFAULT NULL)
    RETURNS TABLE(staff_id uuid, week date, erp_project_id bigint, fair_id uuid, brand text, venue text, venue_key text,
      organizer text, start_date date, end_date date, booths integer) LANGUAGE sql STABLE
    AS $$ SELECT NULL::uuid, NULL::date, NULL::bigint, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text,
                 NULL::date, NULL::date, NULL::integer WHERE false $$;
  CREATE FUNCTION public.member_arena_week_closes_on(p_week date) RETURNS date LANGUAGE sql IMMUTABLE AS $$ SELECT p_week + 2 $$;
  CREATE FUNCTION public.erp_sync_brand_code(p_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim(p_name)) $$;
  CREATE FUNCTION public.member_principal_department_scheme(p_sub_department uuid) RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT c.id FROM public.comm_schemes c WHERE c.sub_department_id = p_sub_department $$;
  CREATE FUNCTION public.member_insight_window(p_from text, p_until text) RETURNS daterange LANGUAGE sql IMMUTABLE
    AS $$ SELECT daterange((p_from || '-01')::date, ((p_until || '-01')::date + interval '1 month')::date) $$;

  -- ── The world ──
  INSERT INTO comm_sub_departments(id, name, code) VALUES ('${FAIR}', 'Fair', 'FAIR');
  INSERT INTO comm_schemes(id, sub_department_id, revenue_cost_divisor, deposit_threshold_pct) VALUES ('${SCHEME}', '${FAIR}', 0.7, 0.3);
  INSERT INTO erp_feed_settings VALUES ('${FAIR}', '2026-08-01');
  INSERT INTO titles(id, name, is_department_head) VALUES ('${T_HEAD}', 'Revenue Director', true);
  INSERT INTO comm_ranks VALUES ('${R5}', '${SCHEME}', 0.05), ('${R9}', '${SCHEME}', 0.09), ('${R10}', '${SCHEME}', 0.10);
  INSERT INTO users(id, name, role) VALUES ${Object.values(U).map(u => `('${u}', NULL, 'member')`).join(', ')},
    ('${HR}', 'HR', 'hr'), ('${HR_NO_EDIT}', 'HR two', 'hr'), ('${HR_UNSUBSCRIBED}', 'HR three', 'hr');
  INSERT INTO hr_staff_costs(id, employee_name, user_id, title_id) VALUES
    ('${LOUIS}', 'LOUIS', '${U[LOUIS]}', NULL), ('${SHELDON}', 'SHELDON TAN', '${U[SHELDON]}', NULL),
    ('${KARJIUN}', 'KAR JIUN', '${U[KARJIUN]}', NULL), ('${SALLY}', 'SALLY', '${U[SALLY]}', NULL),
    ('${MELVIN}', 'MELVIN', '${U[MELVIN]}', NULL), ('${KRIS}', 'KRIS', '${U[KRIS]}', '${T_HEAD}'),
    ('${ANNE}', 'ANNE', '${U[ANNE]}', NULL), ('${ZOE}', 'ZOE', '${U[ZOE]}', NULL), ('${WEI}', 'WEI PIN', '${U[WEI]}', NULL);
  INSERT INTO comm_hierarchy(scheme_id, staff_id, rank_id) VALUES
    ('${SCHEME}', '${LOUIS}', '${R5}'), ('${SCHEME}', '${SHELDON}', '${R9}'), ('${SCHEME}', '${KARJIUN}', '${R10}'),
    ('${SCHEME}', '${SALLY}', '${R9}'), ('${SCHEME}', '${MELVIN}', '${R5}'), ('${SCHEME}', '${KRIS}', '${R10}'),
    ('${SCHEME}', '${ANNE}', '${R5}'), ('${SCHEME}', '${ZOE}', '${R5}'), ('${SCHEME}', '${WEI}', '${R9}');
  INSERT INTO granted VALUES ('${HR}', 'revenue.edit'), ('${HR_UNSUBSCRIBED}', 'revenue.edit');
  INSERT INTO notification_topics(user_id, topic) VALUES ('${HR}', 'member.requests'), ('${HR_NO_EDIT}', 'member.requests'),
    ('${HR}', 'rooms.guest');
  INSERT INTO comm_item_groups VALUES ('${SCHEME}', 'SOFA', true), ('${SCHEME}', 'DELIVERY', false);
  INSERT INTO comm_brands VALUES ('${BR_ZANOTTI}', '${SCHEME}', 'ZANOTTI'), ('${BR_AKEMI}', '${SCHEME}', 'AKEMI');
  -- The penalty ladders: AKEMI 27% → x0.5, 25% → x0.25, 24% → x0; ZANOTTI 26.5% → x0.4, 24% → x0.
  INSERT INTO comm_margin_bands(scheme_id, brand_id, kind, margin_pct, commission_multiplier, sort_order) VALUES
    ('${SCHEME}', '${BR_AKEMI}', 'penalty', 0.27, 0.5, 50), ('${SCHEME}', '${BR_AKEMI}', 'penalty', 0.25, 0.25, 60),
    ('${SCHEME}', '${BR_AKEMI}', 'penalty', 0.24, 0, 70), ('${SCHEME}', '${BR_ZANOTTI}', 'penalty', 0.265, 0.4, 10),
    ('${SCHEME}', '${BR_ZANOTTI}', 'penalty', 0.24, 0, 20), ('${SCHEME}', '${BR_ZANOTTI}', 'incentive', 0.35, 1, 30);
  INSERT INTO sales_import_batches(id, sub_department_id, period_month) VALUES ('${BATCH}', '${FAIR}', '${MONTH}');
  INSERT INTO comm_venue_events(id, venue_key, start_date, end_date, period_month)
    VALUES ('${FAIR_EVENT}', 'MIDV', '${PREV}'::date + 9, '${PREV}'::date + 11, '${PREV}');
  -- A bill at 28.6% margin: RM 10,000 at RM 5,000 cost (÷ 0.7). At 26%: RM 5,180. At 20%: RM 5,600.
  INSERT INTO sales_orders(id, batch_id, period_month, order_no, order_date, staff_id, agent_name, order_total, paid_amount,
      brand_code, fair_event_id) VALUES
    ('${B1}', '${BATCH}', '${MONTH}', 'HC-SO-2611-015', '${MONTH}', '${LOUIS}', 'Louis', 10000, 10000, 'ZANOTTI', '${FAIR_EVENT}'),
    ('${B2}', '${BATCH}', '${MONTH}', 'HC-SO-2611-028', '${MONTH}', '${KARJIUN}', 'Kar Jiun', 8000, 8000, 'ZANOTTI', NULL),
    ('${B3}', '${BATCH}', '${MONTH}', 'HC-SO-2611-033', '${MONTH}', '${LOUIS}', 'Louis', 6000, 6000, 'ZANOTTI', NULL),
    ('${B4}', '${BATCH}', '${MONTH}', 'HC-SO-2611-040', '${MONTH}', '${LOUIS}', 'Louis', 5000, 5000, 'ZANOTTI', NULL),
    ('${B5}', '${BATCH}', '${MONTH}', 'HC-SO-2611-050', '${MONTH}', '${KARJIUN}', 'Kar Jiun', 4000, 4000, 'ZANOTTI', NULL),
    ('${OLD1}', '${BATCH}', '${MONTH}', 'HC-SO-010734', '2026-03-10', '${LOUIS}', 'Junie', 6000, 6000, 'ZANOTTI', NULL),
    ('${W1}', '${BATCH}', '${MONTH}', 'HC-SO-2611-101', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', '${FAIR_EVENT}'),
    ('${W2}', '${BATCH}', '${MONTH}', 'HC-SO-2611-102', '${MONTH}', '${KRIS}', 'Kris', 10000, 10000, 'ZANOTTI', NULL),
    ('${W3}', '${BATCH}', '${MONTH}', 'HC-SO-2611-103', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', NULL),
    ('${W3B}', '${BATCH}', '${MONTH}', 'HC-SO-2611-104', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', NULL),
    ('${W3C}', '${BATCH}', '${MONTH}', 'HC-SO-2611-105', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', NULL),
    ('${W3D}', '${BATCH}', '${MONTH}', 'HC-SO-2611-106', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', NULL),
    ('${W4}', '${BATCH}', '${MONTH}', 'HC-SO-2611-107', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', NULL),
    ('${W5}', '${BATCH}', '${MONTH}', 'HC-SO-2611-108', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', NULL),
    ('${W6}', '${BATCH}', '${MONTH}', 'HC-SO-2611-109', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, NULL, NULL),
    ('${W7}', '${BATCH}', '${MONTH}', 'HC-SO-2611-110', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, NULL, NULL),
    ('${W8}', '${BATCH}', '${MONTH}', 'HC-SO-2611-111', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', NULL),
    ('${W9}', '${BATCH}', '${MONTH}', 'HC-SO-2611-112', '${MONTH}', '${WEI}', 'Wei Pin', 10000, 10000, 'ZANOTTI', '${FAIR_EVENT}'),
    ('${W10}', '${BATCH}', '${MONTH}', 'HC-SO-2611-113', '${MONTH}', '${SHELDON}', 'Sheldon', 10000, 1000, 'ZANOTTI', '${FAIR_EVENT}');
  INSERT INTO sales_order_lines(order_id, line_no, item_group, product_code, line_amount, cost_amount, brand_code) VALUES
    ('${B1}', 1, 'SOFA', 'S-1', 10000, 5000, NULL), ('${B2}', 1, 'SOFA', 'S-2', 8000, 4000, NULL),
    ('${B3}', 1, 'SOFA', 'S-3', 6000, 3000, NULL), ('${B4}', 1, 'SOFA', 'S-4', 5000, 2500, NULL),
    ('${B5}', 1, 'SOFA', 'S-5', 4000, 2000, NULL), ('${OLD1}', 1, 'SOFA', 'S-6', 6000, 3000, NULL),
    ('${W1}', 1, 'SOFA', 'Z-1', 10000, 5180, NULL), ('${W2}', 1, 'SOFA', 'Z-2', 10000, 5180, NULL),
    ('${W3}', 1, 'SOFA', 'Z-3', 10000, 5180, NULL), ('${W3B}', 1, 'SOFA', 'Z-4', 10000, 5180, NULL),
    ('${W3C}', 1, 'SOFA', 'Z-5', 10000, 5180, NULL), ('${W3D}', 1, 'SOFA', 'Z-6', 10000, 5180, NULL),
    ('${W4}', 1, 'SOFA', 'Z-7', 10000, 5180, NULL), ('${W5}', 1, 'SOFA', 'Z-8', 10000, 5180, NULL),
    ('${W6}', 1, 'SOFA', 'A-1', 6000, 3108, 'AKEMI'), ('${W6}', 2, 'SOFA', 'Z-9', 4000, 2072, 'ZANOTTI'),
    ('${W6}', 3, 'DELIVERY', 'DLV', 900, NULL, 'ZANOTTI'),
    ('${W7}', 1, 'SOFA', 'N-1', 10000, 5180, NULL), ('${W8}', 1, 'SOFA', 'Z-10', 10000, 5600, NULL),
    ('${W9}', 1, 'SOFA', 'Z-11', 10000, 5180, NULL), ('${W10}', 1, 'SOFA', 'Z-12', 10000, 5000, NULL);

  -- What a close or a run left: WEI's standing close stored x0.25 on W3 and paid W5; a reopened one stored x0.2 on W3D;
  -- an applied run x0.1 on W3B; a computed one x0.1 on W3C. W4 was released.
  INSERT INTO comm_salesperson_closes(sub_department_id, period_month, staff_id, reopened_at, order_ids, penalised_orders) VALUES
    ('${FAIR}', '${PREV}', '${WEI}', NULL, ARRAY['${W5}'::uuid, '${W3}'::uuid],
     '[{"staffId":"${WEI}","orderId":"${W3}","orderNo":"HC-SO-2611-103","multiplier":0.25,"bandKey":"x","withheld":1}]'),
    ('${FAIR}', '${PREV}', '${WEI}', now(), ARRAY['${W3D}'::uuid],
     '[{"staffId":"${WEI}","orderId":"${W3D}","orderNo":"HC-SO-2611-106","multiplier":0.2,"bandKey":"x","withheld":1}]');
  INSERT INTO comm_runs(scheme_id, sub_department_id, period_month, status, penalised_orders) VALUES
    ('${SCHEME}', '${FAIR}', '${PREV}', 'applied', '[{"staffId":"${WEI}","orderId":"${W3B}","multiplier":0.1}]'),
    ('${SCHEME}', '${FAIR}', '${MONTH}', 'computed', '[{"staffId":"${WEI}","orderId":"${W3C}","multiplier":0.1}]');
  INSERT INTO comm_order_releases(order_no, sub_department_id, period_month) VALUES ('HC-SO-2611-107', '${FAIR}', '${MONTH}');
  -- WEI's W9 is half KRIS's (a department head).
  INSERT INTO sales_order_shares(order_id, staff_id, share_pct) VALUES ('${W9}', '${KRIS}', 0.5);

  -- Production today: two requests with HR, both accepted — KAR JIUN → SALLY passes its checks, KAR JIUN → ZOE does not
  -- (ZOE's month is closed).
  INSERT INTO comm_salesperson_closes(sub_department_id, period_month, staff_id) VALUES ('${FAIR}', '${MONTH}', '${ZOE}');
  INSERT INTO sales_order_share_requests(id, order_id, order_no, sub_department_id, period_month, owner_staff_id, owner_name,
      sent_by, status, created_at) VALUES
    ('${REQ_LEGACY_OK}', '${B2}', 'HC-SO-2611-028', '${FAIR}', '${MONTH}', '${KARJIUN}', 'KAR JIUN', '${U[KARJIUN]}', 'hr', now() - interval '2 days'),
    ('${REQ_LEGACY_BAD}', '${B5}', 'HC-SO-2611-050', '${FAIR}', '${MONTH}', '${KARJIUN}', 'KAR JIUN', '${U[KARJIUN]}', 'hr', now() - interval '1 day');
  INSERT INTO sales_order_share_request_parts(request_id, staff_id, staff_name, share_pct, answer, answered_at) VALUES
    ('${REQ_LEGACY_OK}', '${SALLY}', 'SALLY', 0.5, 'accepted', now() - interval '1 day'),
    ('${REQ_LEGACY_BAD}', '${ZOE}', 'ZOE', 0.5, 'accepted', now() - interval '1 hour');
  INSERT INTO sales_order_share_request_events(request_id, step, actor_name, created_at) VALUES
    ('${REQ_LEGACY_OK}', 'sent', 'KAR JIUN', now() - interval '2 days'), ('${REQ_LEGACY_OK}', 'accepted', 'SALLY', now() - interval '1 day'),
    ('${REQ_LEGACY_BAD}', 'sent', 'KAR JIUN', now() - interval '1 day'), ('${REQ_LEGACY_BAD}', 'accepted', 'ZOE', now() - interval '1 hour');
`)

// ── Production's bodies, as the migration was written from ─────────────────
await db.exec((await readFile(new URL('./shares-weighted-sales-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
await db.exec(`CREATE TRIGGER sales_order_shares_guard BEFORE INSERT OR UPDATE OR DELETE ON sales_order_shares
  FOR EACH ROW EXECUTE FUNCTION sales_order_shares_guard()`)
const md5Of = name => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE proname = $1`, [name])
for (const [name, md5] of Object.entries(PRODUCTION)) check(await md5Of(name), md5, `the fixture is production’s ${name}`)

const as = user => q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
const notices = async user => q(`SELECT title, body, ref_kind, ref_id FROM app_notifications WHERE user_id = $1 ORDER BY created_at, title`, [user])
const request = id => q(`SELECT status, decided_by::text AS by, decided_by_name AS name, decision_note AS note FROM sales_order_share_requests WHERE id = $1`, [id])
const steps = id => q(`SELECT step FROM sales_order_share_request_events WHERE request_id = $1 ORDER BY step`, [id]).then(r => r.map(x => x.step))
const shares = order => q(`SELECT staff_id::text AS staff, share_pct::float8 AS pct FROM sales_order_shares WHERE order_id = $1 ORDER BY staff_id`, [order])
const FACT = `order_no, staff_id::text AS staff, revenue::float8 AS revenue, full_revenue::float8 AS full, weight::float8 AS weight`
const factsAll = () => q(`SELECT ${FACT}, old_bill FROM member_order_facts_with_old_bills($1, NULL, NULL) ORDER BY order_no, staff_id`, [SCHEME])
const factsOf = async no => (await factsAll()).filter(f => f.order_no === no).map(({ order_no, old_bill, ...f }) => f)

// Before: the two with HR wait; nobody holds revenue.shares.
check((await request(REQ_LEGACY_OK))[0].status, 'hr', 'production: KAR JIUN → SALLY waits with HR')
await refuses(`INSERT INTO notification_topics(user_id, topic) VALUES ($1, 'revenue.shares')`, [HR], /notification_topics_topic_check/,
  'production’s topics do not know revenue.shares')

// ── The migration, verbatim, twice ───────────────────────────────────────────
const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
await as(null)
await db.exec(migration)
const after = Object.fromEntries(await Promise.all(MADE.map(async name => [name, await md5Of(name)])))
const noticesOnce = (await q('SELECT count(*)::int AS n FROM app_notifications'))[0].n
await db.exec(migration)
for (const name of MADE) {
  check(await md5Of(name), after[name], `run again, ${name} is not made again`)
  check(migration.includes(`'${after[name]}'`), true, `the md5 the migration checks is the ${name} it makes`)
}
check(await md5Of('member_order_facts'), PRODUCTION.member_order_facts, 'member_order_facts is read as it is')
check((await q('SELECT count(*)::int AS n FROM app_notifications'))[0].n, noticesOnce, 'run again, nobody is told twice')

// ── A. The two with HR ───────────────────────────────────────────────────────
check(await request(REQ_LEGACY_OK), [{ status: 'approved', by: U[SALLY], name: 'SALLY', note: null }],
  'KAR JIUN → SALLY took effect at deploy, decided by SALLY, who accepted')
check(await shares(B2), [{ staff: SALLY, pct: 0.5 }], 'SALLY holds half of HC-SO-2611-028')
check(await steps(REQ_LEGACY_OK), ['accepted', 'sent'], 'its trail: sent → accepted, no third step')
check(await request(REQ_LEGACY_BAD), [{ status: 'hr', by: null, name: null, note: null }], 'KAR JIUN → ZOE stays with HR')
check(await shares(B5), [], 'and nothing of it is shared')
const legacyOwner = `SALLY accepted: KAR JIUN 50% · SALLY 50%. Each part counts in its holder’s sales and commission.`
check(await notices(U[KARJIUN]), [{ title: 'HC-SO-2611-028 · shared', body: legacyOwner, ref_kind: 'share_request', ref_id: REQ_LEGACY_OK }],
  'KAR JIUN is told')
check(await notices(U[SALLY]), [{ title: 'HC-SO-2611-028 · shared', body: legacyOwner, ref_kind: 'share_request', ref_id: REQ_LEGACY_OK }],
  'SALLY is told (nobody acted at deploy)')
check(await notices(HR), [{ title: 'HC-SO-2611-028 · shared',
  body: 'KAR JIUN (10%) shared 50% with SALLY (9%) — HC-SO-2611-028, RM 8,000. Cancel share on Comm Cal if it should not stand.',
  ref_kind: 'share_taken', ref_id: `fair/${MONTH}` }], 'HR is told, at each one’s rate, pointed at Comm Cal’s month')
check([(await notices(HR_NO_EDIT)).length, (await notices(HR_UNSUBSCRIBED)).length], [0, 0],
  'not who holds the topic without revenue.edit, nor who holds revenue.edit without the topic')
check(await q(`SELECT topic FROM notification_topics WHERE topic = 'revenue.shares' ORDER BY user_id`).then(r => r.length), 2,
  'revenue.shares is given to both who held member.requests')

// HR still decides the one with HR — reject, with a note.
await as(HR)
check((await one(`SELECT revenue_share_request_decide($1, false, 'ZOE closed October')`, [REQ_LEGACY_BAD])).status, 'rejected',
  'HR still decides the one that stayed')

// ── A. An accept takes effect at once ────────────────────────────────────────
await as(U[LOUIS])
const r1 = (await one(`SELECT member_share_order_send($1, $2::jsonb, 'help at the fair')`, [B1, JSON.stringify([{ staffId: SHELDON, pct: 0.5 }])])).id
check((await request(r1))[0].status, 'partner', 'LOUIS asks SHELDON TAN')
await as(U[SHELDON])
const answered = await one(`SELECT member_share_order_answer($1, true, NULL)`, [r1])
check(answered.status, 'approved', 'SHELDON TAN accepts: it is shared — no HR')
check(await request(r1), [{ status: 'approved', by: U[SHELDON], name: 'SHELDON TAN', note: null }], 'decided by the colleague')
check(await steps(r1), ['accepted', 'sent'], 'the trail is two: sent → accepted')
check(await shares(B1), [{ staff: SHELDON, pct: 0.5 }], 'SHELDON TAN holds half of HC-SO-2611-015')
check(await notices(U[LOUIS]), [{ title: 'HC-SO-2611-015 · shared',
  body: 'SHELDON TAN accepted: LOUIS 50% · SHELDON TAN 50%. Each part counts in its holder’s sales and commission.',
  ref_kind: 'share_request', ref_id: r1 }], 'LOUIS is told')
check((await notices(U[SHELDON])).map(n => n.title), ['Share request · HC-SO-2611-015'],
  'SHELDON TAN, who acted, is not told it is shared (notify_people never tells the one who acted) — only asked, before')
check((await notices(HR)).at(-1), { title: 'HC-SO-2611-015 · shared',
  body: 'LOUIS (5%) shared 50% with SHELDON TAN (9%) — HC-SO-2611-015, RM 10,000. Cancel share on Comm Cal if it should not stand.',
  ref_kind: 'share_taken', ref_id: `fair/${MONTH}` }, 'HR is told')
check(await factsOf('HC-SO-2611-015'), [
  { staff: LOUIS, revenue: 5000, full: 10000, weight: 1 }, { staff: SHELDON, revenue: 5000, full: 10000, weight: 1 },
], 'RM 10,000 shared half: RM 5,000 each, the whole RM 10,000 beside it')

// A refusal changes nothing — the answer included.
await as(U[LOUIS])
const r3 = (await one(`SELECT member_share_order_send($1, $2::jsonb, '')`, [B3, JSON.stringify([{ staffId: ANNE, pct: 0.5 }])])).id
await q(`INSERT INTO comm_salesperson_closes(sub_department_id, period_month, staff_id) VALUES ($1, $2, $3)`, [FAIR, MONTH, ANNE])
await as(U[ANNE])
const told = (await q('SELECT count(*)::int AS n FROM app_notifications'))[0].n
await refuses(`SELECT member_share_order_answer($1, true, NULL)`, [r3],
  new RegExp(`ANNE’s ${MON} is closed on Comm Cal — HR reopens it before this share can take effect\\.`), 'ANNE’s month closed since')
check([await request(r3), await steps(r3), await shares(B3)],
  [[{ status: 'partner', by: null, name: null, note: null }], ['sent'], []], 'nothing changed')
check(await q(`SELECT answer FROM sales_order_share_request_parts WHERE request_id = $1`, [r3]), [{ answer: 'pending' }], 'her answer included')
check((await q('SELECT count(*)::int AS n FROM app_notifications'))[0].n, told, 'nobody told')
await as(HR)
await refuses(`SELECT revenue_share_request_decide($1, true, NULL)`, [r3],
  /It is still waiting for ANNE to accept — it takes effect once everybody has\./, 'HR’s Comm Cal no longer says HR decides')

await as(U[LOUIS])
const r4 = (await one(`SELECT member_share_order_send($1, $2::jsonb, '')`, [B4, JSON.stringify([{ staffId: SHELDON, pct: 0.5 }])])).id
await q(`UPDATE sales_orders SET staff_id = $1 WHERE id = $2`, [MELVIN, B4])
await as(U[SHELDON])
await refuses(`SELECT member_share_order_answer($1, true, NULL)`, [r4],
  /HC-SO-2611-040 is MELVIN’s now — it moved since LOUIS asked, so it cannot be shared\./, 'a bill that moved')
check([await request(r4), await steps(r4), await shares(B4)],
  [[{ status: 'partner', by: null, name: null, note: null }], ['sent'], []], 'nothing changed')

// The helper is the DEFINER bodies' — and a signed-in caller is only ever themselves.
await refuses(`SELECT share_request_take_effect($1, $2, 'X')`, [r4, U[LOUIS]], /as the colleague who accepted it/, 'not as somebody else')
await as(null)
const may = (role, fn) => one(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, fn])
check([await may('anon', 'share_request_take_effect(uuid, uuid, text)'), await may('authenticated', 'share_request_take_effect(uuid, uuid, text)'),
       await may('service_role', 'share_request_take_effect(uuid, uuid, text)')], [false, false, true], 'the helper: the service role’s only')
check([await may('anon', 'member_order_facts_with_old_bills(uuid, date, date)'),
       await may('authenticated', 'member_order_facts_with_old_bills(uuid, date, date)'),
       await may('service_role', 'member_order_facts_with_old_bills(uuid, date, date)')], [false, false, true],
  'every bill, weighed, dropped and made again: still the service role’s only')

// The topic.
const topicMay = user => one(`SELECT notification_topic_may($1, 'revenue.shares')`, [user])
check([await topicMay(HR), await topicMay(HR_NO_EDIT), await topicMay(HR_UNSUBSCRIBED)], [true, false, true],
  'revenue.shares: whoever holds revenue.edit')
await q(`INSERT INTO closed_tabs VALUES ($1)`, [HR_UNSUBSCRIBED])
check(await topicMay(HR_UNSUBSCRIBED), false, 'and Comm Cal’s month page open for it')
await as(HR)
check(await one(`SELECT notification_topics_sync(ARRAY['revenue.shares', 'rooms.guest'])`), ['revenue.shares'],
  'the app keeps it as any other topic (rooms.guest is not HR’s to hold here)')
check(await one(`SELECT count(*)::int FROM app_notifications WHERE ref_kind = 'share_taken'`), 2, 'ref_kind share_taken is taken')

// ── B. The app's sales are what the commission is ────────────────────────────
await as(null)
await q(`UPDATE comm_schemes SET enable_margin_penalty = true`)
const weighed = async () => Object.fromEntries((await factsAll()).filter(f => f.staff === WEI || f.staff === KRIS)
  .map(f => [`${f.order_no}${f.staff === KRIS ? ' KRIS' : ''}`, [f.revenue, f.full, f.weight]]))
const w = await weighed()
check(w['HC-SO-2611-101'], [4000, 10000, 0.4], 'ZANOTTI at 26%: x0.4 — RM 4,000 of RM 10,000')
check(w['HC-SO-2611-102 KRIS'], [10000, 10000, 1], 'a department head’s part is never cut')
check(w['HC-SO-2611-103'], [2500, 10000, 0.25], 'a standing close stored x0.25: that, not the live x0.4')
check(w['HC-SO-2611-104'], [1000, 10000, 0.1], 'an applied run stored x0.1')
check(w['HC-SO-2611-105'], [4000, 10000, 0.4], 'a computed run’s does not count: live')
check(w['HC-SO-2611-106'], [4000, 10000, 0.4], 'nor a reopened close’s')
check(w['HC-SO-2611-107'], [10000, 10000, 1], 'released: paid in full')
check(w['HC-SO-2611-108'], [10000, 10000, 1], 'paid by a standing close with nothing stored: in full')
check(w['HC-SO-2611-109'], [5000, 10000, 0.5], 'no brand on the bill: its goods lines sell AKEMI most — AKEMI’s 27% x0.5')
check(w['HC-SO-2611-110'], [4000, 10000, 0.4], 'no brand anywhere: every brand’s bands — the lowest it falls under, 26.5% x0.4')
check(w['HC-SO-2611-111'], [0, 10000, 0], 'at 20%: x0 — nothing counted')
check([w['HC-SO-2611-112'], w['HC-SO-2611-112 KRIS']], [[2000, 10000, 0.4], [5000, 10000, 1]],
  'shared with a head: WEI’s half cut to RM 2,000, KRIS’s RM 5,000 whole')
check(await q(`SELECT revenue::float8 AS revenue FROM member_order_facts($1, NULL, NULL) WHERE order_no = 'HC-SO-2611-101'`, [SCHEME]),
  [{ revenue: 4000 }], 'member_order_facts, which the app reads, counts it weighed')
check((await factsAll()).filter(f => f.order_no === 'HC-SO-2611-101').map(f => f.full), [10000], 'full_revenue: the whole bill')
const goods = await q(`SELECT goods_revenue::float8 AS g, margin_pct::float8 AS m FROM member_order_facts_with_old_bills($1, NULL, NULL) WHERE order_no = 'HC-SO-2611-101'`, [SCHEME])
check(goods, [{ g: 10000, m: 0.26 }], 'goods_revenue and the margin stay unweighted')

// The books.
const book = staff => one('SELECT member_order_book_for_staff($1, $2, $3::date, ($3::date + interval \'1 month\')::date)', [staff, SCHEME, MONTH])
const deptBook = () => one('SELECT member_principal_department_order_book($1, $2, $2)', [FAIR, YM])
const entry = (b, no) => b.orders.find(o => o.number === no)
const keys = e => [e.revenue, e.fullRevenue, e.weight]
const weiBook = await book(WEI)
check(keys(entry(weiBook, 'HC-SO-2611-101')), [4000, 10000, 0.4], 'WEI’s book: what counts, the whole, the weight')
check(keys(entry(weiBook, 'HC-SO-2611-107')), [10000, 10000, undefined], 'an entry counted whole has no weight')
check(keys(entry(weiBook, 'HC-SO-2611-112')), [2000, 10000, 0.4], 'his part of the shared bill, the whole bill beside it')
check(keys(entry(await book(LOUIS), 'HC-SO-2611-015')), [5000, 10000, undefined], 'LOUIS’s half: RM 5,000, the RM 10,000 bill beside it')
const louisOld = entry(await book(LOUIS), 'HC-SO-010734')
check([louisOld.commissionOnly, louisOld.soldBy, louisOld.fullRevenue], [true, 'Junie', 6000], 'an old bill topped up: listed, flagged, its whole')
const dept = await deptBook()
check(keys(entry(dept, 'HC-SO-2611-112')), [7000, 10000, 0.7], 'the department’s: the parts together, RM 7,000 of RM 10,000')
check(keys(entry(dept, 'HC-SO-2611-101')), [4000, 10000, 0.4], 'one holder: that holder’s weight')
check(keys(entry(dept, 'HC-SO-2611-015')), [10000, 10000, undefined], 'a share not cut: the whole bill, no weight')
await q(`UPDATE comm_schemes SET enable_margin_penalty = false`)
const unweighed = { wei: await book(WEI), dept: await deptBook() }
check(keys(entry(unweighed.wei, 'HC-SO-2611-101')), [10000, 10000, undefined], 'penalty off: nothing is cut')
check(weiBook.margins, unweighed.wei.margins, 'the margins do not move with the weights')
check(dept.margins, unweighed.dept.margins, 'nor the department’s')
const off = await factsAll()
check(off.filter(f => !['HC-SO-2611-103', 'HC-SO-2611-104'].includes(f.order_no)).every(f => f.weight === 1), true,
  'penalty off: every part weighs 1 …')
check(off.filter(f => ['HC-SO-2611-103', 'HC-SO-2611-104'].includes(f.order_no)).map(f => f.weight), [0.25, 0.1],
  '… but what a close or a run paid: that is what it was paid at')
await q(`UPDATE comm_schemes SET enable_margin_penalty = true`)

// The Arena's fair boards: each holder's part, weighed; the roster per holder; an unassigned bill once.
const history = await one(`SELECT member_arena_history_for_staff($1, $2)`, [FAIR, SCHEME])
const people = ev => Object.fromEntries(ev.people.map(p => [p.name, [Number(p.sales), Number(p.held), Number(p.orders)]]))
const fairEvent = history.events.find(e => e.id === FAIR_EVENT)
check(people(fairEvent), { LOUIS: [5000, 0, 1], 'SHELDON TAN': [5000, 10000, 1], 'WEI PIN': [6000, 0, 2] },
  'the fair: LOUIS’s and SHELDON TAN’s halves; WEI’s RM 4,000 and RM 2,000; SHELDON TAN’s uncleared bill held; KRIS, a head, off the roster')
const loose = await q(`SELECT count(DISTINCT f.order_id)::int AS orders, coalesce(sum(f.revenue), 0)::float8 AS sales
  FROM member_order_facts($1, NULL, NULL) f JOIN sales_orders so ON so.id = f.order_id JOIN hr_staff_costs s ON s.id = f.staff_id
  WHERE so.fair_event_id IS NULL AND f.cleared AND s.title_id IS NULL`, [SCHEME])
check({ orders: Number(history.unassignedOrders), sales: Number(history.unassignedSales) }, loose[0],
  'unassigned: the bills on no fair, each once, at what they count (HC-SO-2611-028 shared, once)')
check(Number(history.unassignedOrders) > 0 && !history.events.some(e => e.people.some(p => p.name === 'KRIS')), true, '(and KRIS on none)')
const booth = await one(`SELECT member_arena_booth_history_for_staff($1, $2)`, [FAIR, SCHEME])
const boards = booth.events.filter(e => e.fairId === FAIR_EVENT)
check(boards.map(e => e.brand), ['ZANOTTI'], 'the booth board: ZANOTTI')
check(people(boards[0]), { LOUIS: [5000, 0, 1], 'SHELDON TAN': [5000, 10000, 1], 'WEI PIN': [6000, 0, 2] }, 'counted the same')
check({ orders: Number(booth.unassignedOrders), sales: Number(booth.unassignedSales) }, loose[0], 'and its unassigned the same')
check((await factsAll()).filter(f => f.order_no === 'HC-SO-010734').map(f => f.old_bill), [true], 'the old bill is still flagged')
check(await q(`SELECT 1 FROM member_order_facts($1, NULL, NULL) WHERE order_no = 'HC-SO-010734'`, [SCHEME]), [],
  'and still out of the sales')

// ── The migration refuses a body it was not written from ─────────────────────
await db.exec(`CREATE OR REPLACE FUNCTION public.revenue_share_request_decide(p_request uuid, p_approve boolean, p_note text)
  RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END $$`)
await assert.rejects(db.exec(migration), /revenue_share_request_decide\(uuid, boolean, text\) is md5 [0-9a-f]{32}, not the body this migration was written from/)
checks++

console.log(`validate-shares-weighted-sales: ${checks} checks passed`)

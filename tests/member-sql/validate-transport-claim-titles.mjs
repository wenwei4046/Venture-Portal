// Local PostgreSQL regression for 20261020220000 (Member services › Transport claim, 2026-10-20 — the user: Claim
// rates becomes Transport claim, and a ⋯ beside Save picks "什么 title 的人可以 claim 这个 transport … 跟 food claim
// 一样"). HR ticks the titles whose holders may send a transport claim (Outstation, a plane ticket, an Airbnb stay):
// seeded with every Revenue title on the day; `member_admin_transport_claim` / `member_admin_save_transport_claim`
// read and save it; `member_transport_claim_open` refuses an unticked seat title, asked by `member_claim_detail_for`
// and, for an old-style claim with no claimType, by `member_prepare_request`; `member_claim_settings` hands the app the
// names. Production's four bodies are loaded from `transport-claim-production.sql` (md5-checked) and the migration
// is applied VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const here = new URL('./', import.meta.url)
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const refused = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

/** Signed in as `user`, holding `actions`, managing member requests or not (member_is_manager). */
async function as(user, { actions = [], manager = false } = {}, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', $1, false)", [actions.join(',')])
  await q("SELECT set_config('test.manager', $1, false)", [manager ? 'yes' : ''])
  await q("SELECT set_config('test.staff', $1, false)", [''])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => db.exec('RESET ROLE')

const HR = id(1)
const REVENUE = id(10) // the Revenue Department
const MARKETING = id(11)
const FAIR = id(20)
const IR = id(21)
const OLD_SUB = id(22) // inactive
const SCHEME_FAIR = id(30)
const SCHEME_IR = id(31)
const L_MGMT = id(40), L_SM = id(41), L_EXEC = id(42)
const T_DIRECTOR = id(50) // Revenue Director — no seat
const T_LEADER = id(51)
const T_ASSISTANT = id(52)
const T_SPECIALIST = id(53)
const T_OLD = id(54) // inactive, no seat
const T_DESIGNER = id(55) // Marketing's — yet somebody sits on it in IR
const T_CLERK = id(56) // Marketing's, nobody seated
const ANN = id(60), BEN = id(61), CAT = id(62), DAN = id(63), EVE = id(64)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

    CREATE TABLE users(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE title_levels(id uuid PRIMARY KEY, name text, rank int);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true, department_id uuid, level_id uuid);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text, code text, is_active boolean, department_id uuid, created_at timestamptz DEFAULT now());
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean, effective_from date, effective_to date);
    CREATE TABLE comm_hierarchy(staff_id uuid, scheme_id uuid, title_id uuid, effective_from date, effective_to date);
    CREATE TABLE member_claim_rates(
      id boolean PRIMARY KEY DEFAULT true, base_name text NOT NULL DEFAULT 'Klang Valley', rate_per_spot numeric,
      airbnb_rate_per_pax_night numeric, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
      airbnb_group_cap_per_night numeric, airbnb_group_max_pax integer NOT NULL DEFAULT 3, food_rate_per_day numeric,
      food_title_ids uuid[] NOT NULL DEFAULT '{}', food_updated_at timestamptz, food_updated_by uuid);
    CREATE TABLE member_claim_regions(id uuid PRIMARY KEY, name text, spots int, is_active boolean, plane_ticket boolean, sort_order int);
    CREATE TABLE member_claim_venue_regions(venue_key text, region_id uuid);
    CREATE TABLE comm_venue_events(id uuid PRIMARY KEY, venue_key text, start_date date, end_date date, source text);
    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text);
    CREATE TABLE member_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid, staff_id uuid, sub_department_id uuid,
      kind text, title text, detail jsonb, idempotency_key uuid, status text NOT NULL DEFAULT 'draft', claim_id uuid,
      allocated_staff_id uuid, note text);
    CREATE TABLE claims(id uuid PRIMARY KEY, status text);
    CREATE TABLE audit_registered(table_name text, ignore_columns text[]);

    -- Production's helpers, as they answer for what the test hands the session.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE w = ANY (string_to_array(nullif(current_setting('test.actions', true), ''), ',')));
    END $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN true; END $$;
    CREATE FUNCTION public.member_is_manager(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN current_setting('test.manager', true) = 'yes'; END $$;
    CREATE FUNCTION public.member_food_claim_sub() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN '${FAIR}'::uuid; END $$;
    CREATE FUNCTION public.member_claim_food_detail(p_detail jsonb, p_staff uuid, p_sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN RETURN jsonb_build_object('claimType', 'food', 'worked', true); END $$;
    CREATE FUNCTION public.member_claim_brand_week(p_staff uuid, p_sub uuid, p_week date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN RETURN NULL; END $$;
    CREATE FUNCTION public.member_send_guard(p_kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN nullif(current_setting('test.staff', true), '')::uuid; END $$;
    CREATE FUNCTION public.member_has_membership(p_staff uuid, p_sub uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN true; END $$;
    CREATE FUNCTION public.member_food_claim_taken(p_staff uuid, p_detail jsonb, p_except uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT NULL, p_labels text[] DEFAULT NULL, p_ignore text[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO public.audit_registered VALUES (p_table, p_ignore); END $$;
  `)

  // ── Production's bodies, verbatim ───────────────────────────────────────────────────────────────
  await db.exec((await readFile(new URL('transport-claim-production.sql', here), 'utf8')).replace(/\r\n/g, '\n'))
  const md5 = name => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = '${name}'`)
  check(await md5('member_claim_detail_for'), 'f07e39594e7fc479bc4f7ce524845227', 'member_claim_detail_for as production runs it')
  check(await md5('member_claim_settings'), 'ac47621954932c9721fe9723245dd47d', 'member_claim_settings as production runs it')
  check(await md5('member_prepare_request'), 'b60d677b12b70b2d44352822821a0980', 'member_prepare_request as production runs it')

  // ── The roster of titles and seats on the day ──────────────────────────────────────────────────
  await q(`INSERT INTO users VALUES ($1, 'HR Manager')`, [HR])
  await q(`INSERT INTO title_levels VALUES ($1, 'Management', 9), ($2, 'Senior Manager', 7), ($3, 'Executive', 3)`, [L_MGMT, L_SM, L_EXEC])
  await q(`INSERT INTO titles VALUES
    ($1, 'Revenue Director', true, $8, $10), ($2, 'Team Leader', true, $8, $11), ($3, 'Team Assistant', true, $8, $12),
    ($4, 'Revenue Specialist', true, $8, $12), ($5, 'Old Title', false, $8, $12), ($6, 'Graphic Designer', true, $9, $12),
    ($7, 'Clerk', true, $9, $12)`, [T_DIRECTOR, T_LEADER, T_ASSISTANT, T_SPECIALIST, T_OLD, T_DESIGNER, T_CLERK, REVENUE, MARKETING, L_MGMT, L_SM, L_EXEC])
  await q(`INSERT INTO comm_sub_departments VALUES ($1, 'Fair', 'FAIR', true, $4), ($2, 'IR', NULL, true, $4), ($3, 'Old', NULL, false, $4)`, [FAIR, IR, OLD_SUB, REVENUE])
  await q(`INSERT INTO comm_schemes VALUES ($1, $3, true, '2026-01-01', NULL), ($2, $4, true, '2026-01-01', NULL)`, [SCHEME_FAIR, SCHEME_IR, FAIR, IR])
  await q(`INSERT INTO comm_hierarchy VALUES
    ($1, $6, $8, '2026-01-01', NULL), ($2, $6, $9, '2026-01-01', NULL), ($3, $6, $10, '2026-01-01', NULL),
    ($4, $7, $10, '2026-01-01', NULL), ($5, $7, $11, '2026-01-01', NULL)`,
  [ANN, BEN, CAT, DAN, EVE, SCHEME_FAIR, SCHEME_IR, T_LEADER, T_ASSISTANT, T_SPECIALIST, T_DESIGNER])
  await q(`INSERT INTO member_claim_rates(id, rate_per_spot, food_title_ids) VALUES (true, 25, ARRAY[$1]::uuid[])`, [T_SPECIALIST])

  // ── The migration, verbatim — twice ────────────────────────────────────────────────────────────
  const sql = (await readFile(new URL('20261020220000_transport_claim_titles.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const after = { detail: await md5('member_claim_detail_for'), settings: await md5('member_claim_settings'), prepare: await md5('member_prepare_request') }
  const seeded = (await q('SELECT transport_title_ids AS ids FROM member_claim_rates WHERE id'))[0].ids.sort()
  check(seeded, [T_DIRECTOR, T_LEADER, T_ASSISTANT, T_SPECIALIST, T_DESIGNER].sort(),
    'seeded with every active Revenue title and every title somebody holds a seat on — not an inactive one, not another department’s nobody sits on')
  check(await q('SELECT ignore_columns FROM audit_registered'), [{ ignore_columns: ['food_updated_at', 'food_updated_by', 'transport_updated_at', 'transport_updated_by'] }],
    'the audit ignores who saved it alone')
  await q('UPDATE member_claim_rates SET transport_title_ids = ARRAY[$1]::uuid[], transport_updated_at = now() WHERE id', [T_LEADER])
  await db.exec(sql)
  check({ detail: await md5('member_claim_detail_for'), settings: await md5('member_claim_settings'), prepare: await md5('member_prepare_request') }, after,
    'applied again, no body changes twice')
  check((await q('SELECT transport_title_ids AS ids FROM member_claim_rates WHERE id'))[0].ids, [T_LEADER], 'nor is a list HR saved seeded over')
  await q('UPDATE member_claim_rates SET transport_title_ids = $1::uuid[], transport_updated_at = NULL WHERE id', [seeded])
  for (const [name, fn] of [['member_claim_detail_for', 'public.member_claim_detail_for(jsonb, uuid, uuid)'], ['member_prepare_request', 'public.member_prepare_request(text, uuid, jsonb, uuid, uuid)']]) {
    check(await one(`SELECT (length(prosrc) - length(replace(prosrc, 'member_transport_claim_open', ''))) / length('member_transport_claim_open') FROM pg_proc WHERE oid = '${fn}'::regprocedure`), 1,
      `${name} asks member_transport_claim_open once`)
  }

  // ── HR's list ──────────────────────────────────────────────────────────────────────────────────
  await as(HR, { manager: true })
  const list = await one('SELECT public.member_admin_transport_claim()')
  check(list.titles.map(t => [t.name, t.level, t.people]), [
    ['Revenue Director', 'Management', 0], ['Team Leader', 'Senior Manager', 1], ['Graphic Designer', 'Executive', 1],
    ['Revenue Specialist', 'Executive', 2], ['Team Assistant', 'Executive', 1],
  ], 'every Revenue title, the highest level first, with who holds a seat on it — the designer seated in IR too')
  check(list.titleIds.sort(), seeded, 'and which are ticked')
  await as(HR, { manager: false })
  await refused('SELECT public.member_admin_transport_claim()', [], /HR request management access is required/, 'only the back office reads it')

  // ── Its Save ───────────────────────────────────────────────────────────────────────────────────
  await as(HR, { manager: true, actions: [] })
  await refused('SELECT public.member_admin_save_transport_claim($1::uuid[])', [[T_LEADER]], /HR request management access is required/,
    'saving needs Member services · Edit too')
  await as(HR, { manager: true, actions: ['member.manage'] })
  const saved = await one('SELECT public.member_admin_save_transport_claim($1::uuid[])', [[T_LEADER, T_SPECIALIST, T_LEADER, null]])
  check(saved.titleIds, [T_LEADER, T_SPECIALIST].sort(), 'saved once each, nulls dropped')
  check(saved.updatedBy, 'HR Manager', 'and who saved it')
  await refused('SELECT public.member_admin_save_transport_claim($1::uuid[])', [[id(999)]], /no longer in People/, 'a title that is not in People')
  await asSystem()
  check((await q('SELECT food_title_ids AS f FROM member_claim_rates WHERE id'))[0].f, [T_SPECIALIST], 'the food claim’s titles are untouched')

  // ── Who may send one ───────────────────────────────────────────────────────────────────────────
  const detail = (staff, sub, type) => q('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify({ claimType: type }), staff, sub])
  await assert.rejects(() => detail(ANN, FAIR, 'outstation'), /Choose the brand week/, 'a ticked title (Team Leader) gets past the gate to the claim’s own checks'); checks++
  await assert.rejects(() => detail(DAN, IR, 'airbnb'), /Choose the brand week/, 'an Airbnb stay too, in IR'); checks++
  await refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify({ claimType: 'outstation' }), BEN, FAIR],
    /A transport claim is not open to Team Assistant\. HR picks the titles that may claim it\./, 'an unticked seat title is refused')
  await refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify({ claimType: 'airbnb' }), EVE, IR],
    /not open to Graphic Designer/, 'an Airbnb stay the same')
  await refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify({ claimType: 'outstation' }), ANN, IR],
    /not open to your title/, 'no seat in the sub-department claimed for: no title, nobody through')
  check((await detail(BEN, FAIR, 'food'))[0].member_claim_detail_for, { claimType: 'food', worked: true }, 'a food claim is not a transport claim: its own titles decide')
  await refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify({ claimType: 'taxi' }), BEN, FAIR],
    /Choose Outstation or Airbnb/, 'an unknown type is refused before the gate, as before')

  // An old-style claim — no claimType: an accommodation claim carrying its own amount.
  const legacy = JSON.stringify({ invoiceHash: 'a'.repeat(64), location: 'Penang', start: '2026-10-01', end: '2026-10-02', amount: 100 })
  await as(id(70), {})
  await q("SELECT set_config('test.staff', $1, false)", [BEN])
  await refused('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, legacy, id(80)],
    /not open to Team Assistant/, 'an old-style claim is a transport claim too')
  await q("SELECT set_config('test.staff', $1, false)", [ANN])
  const prepared = await one('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, legacy, id(81)])
  check(prepared.status, 'draft', 'and a ticked title prepares one as before')
  await asSystem()
  check(await one("SELECT title FROM member_requests WHERE idempotency_key = $1", [id(81)]), 'Penang · 住宿报销', 'titled as before')

  // ── The member's form ──────────────────────────────────────────────────────────────────────────
  check((await one('SELECT public.member_claim_settings()')).transport, { titles: ['Revenue Specialist', 'Team Leader'] },
    'the app is handed the ticked titles’ names')
  check((await one('SELECT public.member_claim_settings()')).food.titles, ['Revenue Specialist'], 'beside the food claim’s, as before')

  // ── The grants ─────────────────────────────────────────────────────────────────────────────────
  const can = (role, fn) => one(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE')`)
  check(await can('authenticated', 'public.member_admin_transport_claim()'), true, 'HR’s session reads the list')
  check(await can('authenticated', 'public.member_admin_save_transport_claim(uuid[])'), true, 'and saves it')
  check(await can('anon', 'public.member_admin_save_transport_claim(uuid[])'), false, 'never the publishable key')
  check(await can('authenticated', 'public.member_transport_claim_open(uuid, uuid)'), false, 'the gate is the claim functions’ own')
  check(await can('service_role', 'public.member_transport_claim_open(uuid, uuid)'), true, 'and the service role’s')

  console.log(`transport claim titles: ${checks} checks passed`)
} finally {
  await db.close()
}

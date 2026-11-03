// Local PostgreSQL regression for 20261101000500 (2026-11-01 — the user, on *Who can claim transport*'s new column and the
// "Plane ticket" still written beside it: "go with the same name Air ticket claim"). Every word a person reads about a
// flown-to claim says Air ticket: the refusals, the claim's category and title, its claim line, HR's regions refusal —
// and the two flown-to claims already sent, their claim lines while pending.
// Production's bodies: the six of `air-ticket-claim-production.sql` with 20261031214500 applied over them (its md5 check
// = production's today), and `air-ticket-wording-production.sql` (member_submit_request, member_admin_save_claim_settings,
// md5-checked). The migration is applied VERBATIM, twice. No live I/O.
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

async function as(user, { staff = '' } = {}) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', '', false)")
  await q("SELECT set_config('test.manager', '', false)")
  await q("SELECT set_config('test.staff', $1, false)", [staff])
  await db.exec('SET ROLE authenticated')
}
const asSystem = () => db.exec('RESET ROLE')

const HR = id(1)
const REVENUE = id(10)
const FAIR = id(20)
const SCHEME_FAIR = id(30)
const L_SM = id(41), L_EXEC = id(42)
const T_LEADER = id(51), T_ASSISTANT = id(52), T_SPECIALIST = id(53)
const ANN = id(60) /* Team Leader */, BEN = id(61) /* Team Assistant */, CAT = id(62) /* Revenue Specialist */
const R_PENANG = id(71), R_SABAH = id(72)
const FAIR_KK = id(80), FAIR_PG = id(81)
const W_KK = '2026-10-02', W_PG = '2026-10-09'
const HASH = 'a'.repeat(64)
const SIG = {
  detail: 'public.member_claim_detail_for(jsonb, uuid, uuid)',
  prepare: 'public.member_prepare_request(text, uuid, jsonb, uuid, uuid)',
  submit: 'public.member_submit_request(uuid)',
  open: 'public.member_transport_claim_open(uuid, uuid, text)',
  regions: 'public.member_admin_save_claim_settings(text, numeric, numeric, jsonb, integer, numeric, jsonb)',
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

    CREATE TABLE users(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE title_levels(id uuid PRIMARY KEY, name text, rank int);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT true, department_id uuid, level_id uuid);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text, code text, is_active boolean, department_id uuid, created_at timestamptz DEFAULT now());
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid, is_active boolean, effective_from date, effective_to date);
    CREATE TABLE comm_hierarchy(staff_id uuid, scheme_id uuid, title_id uuid, effective_from date, effective_to date, upline_staff_id uuid);
    CREATE TABLE member_claim_rates(
      id boolean PRIMARY KEY DEFAULT true, base_name text NOT NULL DEFAULT 'Klang Valley', rate_per_spot numeric,
      airbnb_rate_per_pax_night numeric, updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
      airbnb_group_cap_per_night numeric, airbnb_group_max_pax integer NOT NULL DEFAULT 3, food_rate_per_day numeric,
      food_title_ids uuid[] NOT NULL DEFAULT '{}', food_updated_at timestamptz, food_updated_by uuid,
      transport_title_ids uuid[] NOT NULL DEFAULT '{}', transport_updated_at timestamptz, transport_updated_by uuid);
    CREATE TABLE member_claim_regions(id uuid PRIMARY KEY, name text, spots int, is_active boolean, plane_ticket boolean, sort_order int);
    CREATE TABLE member_claim_venue_regions(venue_key text, region_id uuid);
    CREATE TABLE comm_venue_events(id uuid PRIMARY KEY, venue_key text, start_date date, end_date date, source text);
    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text);
    CREATE TABLE member_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid, staff_id uuid, sub_department_id uuid,
      kind text, title text, detail jsonb, idempotency_key uuid, status text NOT NULL DEFAULT 'draft', claim_id uuid,
      allocated_staff_id uuid, note text);
    CREATE TABLE claims(id uuid PRIMARY KEY, status text, description text);

    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN false; END $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN true; END $$;
    CREATE FUNCTION public.member_is_manager(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN current_setting('test.manager', true) = 'yes'; END $$;
    CREATE FUNCTION public.member_food_claim_sub() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN '${FAIR}'::uuid; END $$;
    CREATE FUNCTION public.member_claim_food_detail(p_detail jsonb, p_staff uuid, p_sub uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN RETURN jsonb_build_object('claimType', 'food'); END $$;
    CREATE FUNCTION public.member_claim_brand_week(p_staff uuid, p_sub uuid, p_week date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      RETURN (SELECT jsonb_build_object('fairId', e.id, 'brand', 'Akemi', 'source', 'erp', 'picked', true)
                FROM public.comm_venue_events e WHERE e.start_date = p_week);
    END $$;
    CREATE FUNCTION public.member_send_guard(p_kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN nullif(current_setting('test.staff', true), '')::uuid; END $$;
    CREATE FUNCTION public.member_has_membership(p_staff uuid, p_sub uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN RETURN true; END $$;
    CREATE FUNCTION public.member_food_claim_taken(p_staff uuid, p_detail jsonb, p_except uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN END $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT NULL, p_labels text[] DEFAULT NULL, p_ignore text[] DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN END $$;
  `)

  // ── Production today: the six bodies as they were, 20261031214500 over them (its own md5 check passes) ──────
  await q(`INSERT INTO member_claim_rates(id, rate_per_spot) VALUES (true, 25)`)
  await db.exec(await file(here, 'air-ticket-claim-production.sql'))
  await db.exec(await file(migrations, '20261031214500_air_ticket_claim_titles.sql'))
  // …and the two bodies that call it Plane ticket elsewhere, as production runs them — they read tables this check
  // does not hold, so they are loaded unchecked, as pg_dump does.
  await db.exec('SET check_function_bodies = off')
  await db.exec(await file(here, 'air-ticket-wording-production.sql'))
  const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = '${sig}'::regprocedure`)
  check(await md5(SIG.submit), 'ec5470f1b4db7732d492957a202c9f15', 'member_submit_request as production runs it')
  check(await md5(SIG.regions), '3c2fa3448f3b6496bfb9756dcdfc8c8c', 'member_admin_save_claim_settings as production runs it')
  check(await md5(SIG.detail), 'bc4ef9747001861a4c4125c154e73e29', 'member_claim_detail_for as production runs it today')
  check(await md5(SIG.prepare), 'c235d970bc4bb6f55ce9fb17716164eb', 'member_prepare_request as production runs it today')
  check(await md5(SIG.open), '803609ae58d3744f10b3d87757bee215', 'member_transport_claim_open as production runs it today')

  // ── The roster, two regions, two fairs; the Team Leader ticked for the air ticket alone ──────────────────────
  await q(`INSERT INTO users VALUES ($1, 'HR Manager')`, [HR])
  await q(`INSERT INTO title_levels VALUES ($1, 'Senior Manager', 7), ($2, 'Executive', 3)`, [L_SM, L_EXEC])
  await q(`INSERT INTO titles VALUES ($1, 'Team Leader', true, $4, $5), ($2, 'Team Assistant', true, $4, $6), ($3, 'Revenue Specialist', true, $4, $6)`,
    [T_LEADER, T_ASSISTANT, T_SPECIALIST, REVENUE, L_SM, L_EXEC])
  await q(`INSERT INTO comm_sub_departments VALUES ($1, 'Fair', 'FAIR', true, $2)`, [FAIR, REVENUE])
  await q(`INSERT INTO comm_schemes VALUES ($1, $2, true, '2026-01-01', NULL)`, [SCHEME_FAIR, FAIR])
  await q(`INSERT INTO comm_hierarchy VALUES ($1, $4, $5, '2026-01-01', NULL, NULL), ($2, $4, $6, '2026-01-01', NULL, NULL), ($3, $4, $7, '2026-01-01', NULL, NULL)`,
    [ANN, BEN, CAT, SCHEME_FAIR, T_LEADER, T_ASSISTANT, T_SPECIALIST])
  await q(`INSERT INTO member_claim_regions VALUES ($1, 'Penang', 4, true, false, 1), ($2, 'Sabah', 6, true, true, 2)`, [R_PENANG, R_SABAH])
  await q(`INSERT INTO comm_venues VALUES ('KK', 'KK Convention Centre'), ('SPICE', 'SPICE Arena')`)
  await q(`INSERT INTO member_claim_venue_regions VALUES ('KK', $1), ('SPICE', $2)`, [R_SABAH, R_PENANG])
  await q(`INSERT INTO comm_venue_events VALUES ($1, 'KK', $3, '2026-10-04', 'erp'), ($2, 'SPICE', $4, '2026-10-11', 'erp')`, [FAIR_KK, FAIR_PG, W_KK, W_PG])
  await q(`UPDATE member_claim_rates SET transport_title_ids = ARRAY[$1]::uuid[], air_ticket_title_ids = ARRAY[$2]::uuid[] WHERE id`,
    [T_SPECIALIST, T_LEADER])

  // ── Two flown-to claims sent before the rename (as RQ-2610-018 and -025), one whose claim is paid, one by road ──────
  const C_PENDING = id(100), C_PAID = id(101), C_ROAD = id(102)
  await q(`INSERT INTO claims VALUES
    ($1, 'pending', 'Plane ticket · Klang Valley → Sabah · KK Convention Centre (week of 2026-10-02)'),
    ($2, 'paid', 'Plane ticket · Klang Valley → Sabah · KK Convention Centre (week of 2026-09-04)'),
    ($3, 'pending', 'Outstation · Klang Valley → Penang · 4 spots × RM 25 · SPICE Arena (week of 2026-10-09)')`, [C_PENDING, C_PAID, C_ROAD])
  const plane = cat => JSON.stringify({ claimType: 'outstation', planeTicket: true, category: cat, amount: 990, location: 'KK Convention Centre' })
  await q(`INSERT INTO member_requests(id, kind, title, detail, status, claim_id) VALUES
    ($1, 'claim', 'Plane ticket claim · KK Convention Centre', $4::jsonb, 'submitted', $7),
    ($2, 'claim', 'Plane ticket claim · KK Convention Centre', $4::jsonb, 'paid', $8),
    ($3, 'claim', 'Outstation claim · SPICE Arena', $5::jsonb, 'submitted', $9),
    ($6, 'waiting', 'Plane ticket claim? no — a waiting list', '{}'::jsonb, 'submitted', NULL)`,
  [id(110), id(111), id(112), plane('Plane ticket'), JSON.stringify({ claimType: 'outstation', category: 'Outstation', amount: 100 }), id(113), C_PENDING, C_PAID, C_ROAD])

  // ── The migration, verbatim — twice ────────────────────────────────────────────────────────────
  const sql = await file(migrations, '20261101000500_air_ticket_wording.sql')
  await db.exec(sql)
  const bodies = async () => Object.fromEntries(await Promise.all(Object.entries(SIG).map(async ([k, s]) => [k, await md5(s)])))
  const after = await bodies()
  await db.exec(sql)
  check(await bodies(), after, 'applied again, no body changes twice')

  // No word "plane ticket" left in what a person reads — a comment in member_submit_request's body may keep it.
  for (const [name, sig] of Object.entries(SIG)) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = '${sig}'::regprocedure`)
    const said = src.split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
    check(/plane ticket/i.test(said), false, `${name} says air ticket, never plane ticket`)
  }
  const src = sig => one(`SELECT prosrc FROM pg_proc WHERE oid = '${sig}'::regprocedure`)
  check((await src(SIG.submit)).includes("concat('Air ticket · ',"), true, 'the claim line reads Air ticket · …')
  check((await src(SIG.regions)).includes("RAISE EXCEPTION 'Air ticket is ticked or not'"), true, 'HR’s regions refusal says Air ticket')
  check((await src(SIG.prepare)).includes("THEN 'Air ticket claim'"), true, 'a flown-to claim is titled Air ticket claim')

  // ── The data already sent ──────────────────────────────────────────────────────────────────────
  const req = async rid => (await q('SELECT title, detail->>\'category\' AS category FROM member_requests WHERE id = $1', [rid]))[0]
  check(await req(id(110)), { title: 'Air ticket claim · KK Convention Centre', category: 'Air ticket' }, 'a sent flown-to claim is called an air ticket claim')
  check(await req(id(111)), { title: 'Air ticket claim · KK Convention Centre', category: 'Air ticket' }, 'a paid one too — its title and category are words, not money')
  check(await req(id(112)), { title: 'Outstation claim · SPICE Arena', category: 'Outstation' }, 'a claim by road is untouched')
  check((await req(id(113))).title, 'Plane ticket claim? no — a waiting list', 'nor is a request that is not a claim')
  const line = async cid => one('SELECT description FROM claims WHERE id = $1', [cid])
  check(await line(C_PENDING), 'Air ticket · Klang Valley → Sabah · KK Convention Centre (week of 2026-10-02)', 'a pending claim line reads Air ticket')
  check(await line(C_PAID), 'Plane ticket · Klang Valley → Sabah · KK Convention Centre (week of 2026-09-04)', 'a paid one keeps the words its voucher was made with')
  check(await line(C_ROAD), 'Outstation · Klang Valley → Penang · 4 spots × RM 25 · SPICE Arena (week of 2026-10-09)', 'a line by road is untouched')

  // ── What the member is told ────────────────────────────────────────────────────────────────────
  const detail = (staff, d) => one('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify(d), staff, FAIR])
  const refuse = (staff, d, pattern, what) => refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify(d), staff, FAIR], pattern, what)
  const flown = { claimType: 'outstation', week: W_KK, invoiceHash: HASH, amount: '456.70' }
  const d = await detail(ANN, flown)
  check([d.category, d.planeTicket, d.amount], ['Air ticket', true, 456.7], 'a flown-to claim’s category is Air ticket')
  await refuse(ANN, { claimType: 'outstation', week: W_PG }, /Team Leader may claim an air ticket only\. HR picks the titles that may claim the rest\./,
    'the air ticket alone: by road refused in its words')
  await refuse(CAT, flown, /An air ticket claim is not open to Revenue Specialist\. HR picks the titles that may claim it\./, 'the transport tick alone: no air ticket')
  await refuse(BEN, flown, /A transport claim is not open to Team Assistant\./, 'neither tick, as before')
  await refuse(ANN, { claimType: 'outstation', week: W_KK, invoiceHash: HASH }, /Enter the air ticket's price, as its invoice shows/, 'the price, asked for in its words')
  await refuse(ANN, { claimType: 'outstation', week: W_KK, amount: '456.70' }, /Add the air ticket's invoice/, 'the invoice, asked for in its words')

  await as(id(90), { staff: ANN })
  check((await one('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, JSON.stringify(flown), id(120)])).status, 'draft',
    'the Team Leader’s air ticket claim is prepared')
  await asSystem()
  check(await one('SELECT title FROM member_requests WHERE idempotency_key = $1', [id(120)]), 'Air ticket claim · KK Convention Centre', 'and titled so')

  console.log(`air ticket wording: ${checks} checks passed`)
} finally {
  await db.close()
}

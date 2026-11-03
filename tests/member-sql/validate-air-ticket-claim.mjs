// Local PostgreSQL regression for 20261031214500 (Member services › Transport claim's *Who can claim transport*, 2026-10-31
// — the user: "我要加多一个 Air ticket claim 的 column … if the venue is accept for air ticket, then these guys with tick can
// claim，就算他们没有 tick transport claim，但是其他除了 ticket 以外，他就不能给 因为他没有 tick 那个 transport claim").
// A second tick per title: the plane ticket (a fair in a region HR flies to) is the air ticket's; by road and an Airbnb
// stay stay the transport tick's. Seeded with the transport ticks of the day; HR's Save writes only the boxes changed.
// Production's six bodies are loaded from `air-ticket-claim-production.sql` (md5-checked) and the migration is applied
// VERBATIM, twice. No live I/O.
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

/** Signed in as `user`, holding `actions`, managing member requests or not (member_is_manager), as staff `staff`. */
async function as(user, { actions = [], manager = false, staff = '' } = {}, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', $1, false)", [actions.join(',')])
  await q("SELECT set_config('test.manager', $1, false)", [manager ? 'yes' : ''])
  await q("SELECT set_config('test.staff', $1, false)", [staff])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => db.exec('RESET ROLE')

const HR = id(1), HR2 = id(2)
const REVENUE = id(10)
const MARKETING = id(11)
const FAIR = id(20)
const IR = id(21)
const SCHEME_FAIR = id(30)
const SCHEME_IR = id(31)
const L_MGMT = id(40), L_SM = id(41), L_EXEC = id(42)
const T_DIRECTOR = id(50) // Revenue Director — no seat
const T_LEADER = id(51)
const T_ASSISTANT = id(52)
const T_SPECIALIST = id(53)
const T_DRIVER = id(55) // Marketing's, nobody seated — HR ticks it for the air ticket alone
const ANN = id(60) /* Team Leader, Fair */, BEN = id(61) /* Team Assistant, Fair */, CAT = id(62) /* Specialist, Fair */
const DAN = id(63) /* Specialist, IR */, NOBODY = id(64) /* no seat in Fair */
const R_KL = id(70), R_PENANG = id(71), R_SABAH = id(72)
const FAIR_KK = id(80), FAIR_PG = id(81), FAIR_KL = id(82)
const W_KK = '2026-10-02', W_PG = '2026-10-09', W_KL = '2026-10-16'
const HASH = 'a'.repeat(64)

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
    -- member_claim_rates as production has it on 2026-10-31 (the transport tick since 20261020220000).
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
    CREATE TABLE claims(id uuid PRIMARY KEY, status text);
    CREATE TABLE audit_changes_seen(column_name text);

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
    -- The member's booth that weekend: the fair that starts on it.
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
    -- The audit trigger, as production's records a change of each column it does not ignore.
    CREATE FUNCTION public.audit_seen() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO public.audit_changes_seen
        SELECT o.key FROM jsonb_each(to_jsonb(OLD)) o JOIN jsonb_each(to_jsonb(NEW)) n ON n.key = o.key
         WHERE o.value IS DISTINCT FROM n.value AND o.key NOT IN ('transport_updated_at', 'transport_updated_by', 'food_updated_at', 'food_updated_by');
      RETURN NEW;
    END $$;
    CREATE TRIGGER audit_member_claim_rates AFTER UPDATE ON member_claim_rates FOR EACH ROW EXECUTE FUNCTION public.audit_seen();
  `)

  // ── Production's bodies, verbatim ───────────────────────────────────────────────────────────────
  await db.exec((await readFile(new URL('air-ticket-claim-production.sql', here), 'utf8')).replace(/\r\n/g, '\n'))
  const md5 = sig => one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = '${sig}'::regprocedure`)
  const SIG = {
    open: 'public.member_transport_claim_open(uuid, uuid)',
    list: 'public.member_admin_transport_claim()',
    saveList: 'public.member_admin_save_transport_claim(uuid[])',
    settings: 'public.member_claim_settings()',
    detail: 'public.member_claim_detail_for(jsonb, uuid, uuid)',
    prepare: 'public.member_prepare_request(text, uuid, jsonb, uuid, uuid)',
  }
  check(await md5(SIG.open), '113c1c1cb851788854f8dfba4f9f3987', 'member_transport_claim_open as production runs it')
  check(await md5(SIG.list), 'd34f444dea32e48012d138d03589aefd', 'member_admin_transport_claim as production runs it')
  check(await md5(SIG.saveList), '5e11c8bd9ec72e740e79455cb49178ba', 'member_admin_save_transport_claim(uuid[]) as production runs it')
  check(await md5(SIG.settings), '4c3516c3ff57b268a89b84dfa90f171d', 'member_claim_settings as production runs it')
  check(await md5(SIG.detail), '8c2668612b2f43f0479e9eaf54a11d3e', 'member_claim_detail_for as production runs it')
  check(await md5(SIG.prepare), 'c235d970bc4bb6f55ce9fb17716164eb', 'member_prepare_request as production runs it')

  // ── The roster, the regions and three fairs ────────────────────────────────────────────────────
  await q(`INSERT INTO users VALUES ($1, 'HR Manager'), ($2, 'HR Two')`, [HR, HR2])
  await q(`INSERT INTO title_levels VALUES ($1, 'Management', 9), ($2, 'Senior Manager', 7), ($3, 'Executive', 3)`, [L_MGMT, L_SM, L_EXEC])
  await q(`INSERT INTO titles VALUES
    ($1, 'Revenue Director', true, $6, $8), ($2, 'Team Leader', true, $6, $9), ($3, 'Team Assistant', true, $6, $10),
    ($4, 'Revenue Specialist', true, $6, $10), ($5, 'Driver', true, $7, $10)`,
  [T_DIRECTOR, T_LEADER, T_ASSISTANT, T_SPECIALIST, T_DRIVER, REVENUE, MARKETING, L_MGMT, L_SM, L_EXEC])
  await q(`INSERT INTO comm_sub_departments VALUES ($1, 'Fair', 'FAIR', true, $3), ($2, 'IR', NULL, true, $3)`, [FAIR, IR, REVENUE])
  await q(`INSERT INTO comm_schemes VALUES ($1, $3, true, '2026-01-01', NULL), ($2, $4, true, '2026-01-01', NULL)`, [SCHEME_FAIR, SCHEME_IR, FAIR, IR])
  await q(`INSERT INTO comm_hierarchy VALUES
    ($1, $5, $7, '2026-01-01', NULL, NULL), ($2, $5, $8, '2026-01-01', NULL, NULL), ($3, $5, $9, '2026-01-01', NULL, NULL),
    ($4, $6, $9, '2026-01-01', NULL, NULL)`,
  [ANN, BEN, CAT, DAN, SCHEME_FAIR, SCHEME_IR, T_LEADER, T_ASSISTANT, T_SPECIALIST])
  await q(`INSERT INTO member_claim_regions VALUES ($1, 'KL', 0, true, false, 1), ($2, 'Penang', 4, true, false, 2), ($3, 'Sabah', 6, true, true, 3)`,
    [R_KL, R_PENANG, R_SABAH])
  await q(`INSERT INTO comm_venues VALUES ('KK', 'KK Convention Centre'), ('SPICE', 'SPICE Arena'), ('KLCC', 'KLCC')`)
  await q(`INSERT INTO member_claim_venue_regions VALUES ('KK', $1), ('SPICE', $2), ('KLCC', $3)`, [R_SABAH, R_PENANG, R_KL])
  await q(`INSERT INTO comm_venue_events VALUES ($1, 'KK', $4, '2026-10-04', 'erp'), ($2, 'SPICE', $5, '2026-10-11', 'erp'), ($3, 'KLCC', $6, '2026-10-18', 'erp')`,
    [FAIR_KK, FAIR_PG, FAIR_KL, W_KK, W_PG, W_KL])
  // HR's ticks of the day: the transport claim is the Revenue Specialists' alone (as production's on 2026-10-31).
  await q(`INSERT INTO member_claim_rates(id, rate_per_spot, airbnb_rate_per_pax_night, airbnb_group_cap_per_night, food_title_ids,
             transport_title_ids, transport_updated_at, transport_updated_by)
           VALUES (true, 25, 65, 220, ARRAY[$1]::uuid[], ARRAY[$1]::uuid[], now(), $2)`, [T_SPECIALIST, HR])

  // ── The migration, verbatim — twice ────────────────────────────────────────────────────────────
  const sql = (await readFile(new URL('20261031214500_air_ticket_claim_titles.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const bodies = async () => Object.fromEntries(await Promise.all(Object.entries(SIG).map(async ([k, s]) => [k, await md5(s)])))
  const after = await bodies()
  check(after.saveList, '5e11c8bd9ec72e740e79455cb49178ba', 'the one-list Save is left as it was')
  check(after.prepare, 'c235d970bc4bb6f55ce9fb17716164eb', 'and member_prepare_request — its old-style claim asks the two-argument gate, which now asks for the transport tick')
  const ticks = async () => (await q('SELECT transport_title_ids AS road, air_ticket_title_ids AS plane FROM member_claim_rates WHERE id'))[0]
  check(await ticks(), { road: [T_SPECIALIST], plane: [T_SPECIALIST] }, 'the air ticket seeded with the transport ticks of the day: nobody loses the plane ticket')
  check(await q('SELECT column_name FROM audit_changes_seen'), [{ column_name: 'air_ticket_title_ids' }], 'the seed is on the audit, as any change of the list')
  await q('DELETE FROM audit_changes_seen')
  await q('UPDATE member_claim_rates SET air_ticket_title_ids = ARRAY[$1]::uuid[] WHERE id', [T_LEADER])
  await db.exec(sql)
  check(await bodies(), after, 'applied again, no body changes twice')
  check((await ticks()).plane, [T_LEADER], 'nor is a list HR saved seeded over')
  await q('UPDATE member_claim_rates SET air_ticket_title_ids = ARRAY[$1]::uuid[] WHERE id', [T_SPECIALIST])
  await q('DELETE FROM audit_changes_seen')
  const asks = async (sig, text) => one(`SELECT (length(prosrc) - length(replace(prosrc, $1, ''))) / length($1) FROM pg_proc WHERE oid = '${sig}'::regprocedure`, [text])
  check(await asks(SIG.detail, 'member_transport_claim_open'), 3, 'member_claim_detail_for asks the gate three times: at its gate, for a plane ticket, for a route by road')
  check(await asks(SIG.detail, "'plane'"), 1, 'once for the plane ticket')

  // ── HR's list ──────────────────────────────────────────────────────────────────────────────────
  await as(HR, { manager: true })
  let list = await one('SELECT public.member_admin_transport_claim()')
  check(list.titleIds, [T_SPECIALIST], 'the transport ticks')
  check(list.airTicketTitleIds, [T_SPECIALIST], 'and the air ticket ticks')
  check(list.titles.map(t => t.name), ['Revenue Director', 'Team Leader', 'Revenue Specialist', 'Team Assistant'],
    'every Revenue title, the highest level first')

  // ── Its Save: only the boxes changed ───────────────────────────────────────────────────────────
  const save = changes => one('SELECT public.member_admin_save_transport_claim($1::jsonb)', [JSON.stringify(changes)])
  await as(HR, { manager: true, actions: [] })
  await refused('SELECT public.member_admin_save_transport_claim($1::jsonb)', [JSON.stringify([{ titleId: T_LEADER, airTicket: true }])],
    /HR request management access is required/, 'saving needs Member services · Edit too')
  await as(HR, { manager: false, actions: ['member.manage'] })
  await refused('SELECT public.member_admin_save_transport_claim($1::jsonb)', [JSON.stringify([{ titleId: T_LEADER, airTicket: true }])],
    /HR request management access is required/, 'and the back office’s door')
  await as(HR, { manager: true, actions: ['member.manage'] })
  for (const [bad, what] of [
    [{ titleId: T_LEADER }, 'a change that changes nothing'],
    [{ titleId: 'not-an-id', airTicket: true }, 'a title that is not an id'],
    [{ titleId: T_LEADER, airTicket: 'yes' }, 'a tick that is not true or false'],
    [{ titleId: T_LEADER, transport: null }, 'a tick that is null'],
  ]) await refused('SELECT public.member_admin_save_transport_claim($1::jsonb)', [JSON.stringify([bad])], /Check the titles ticked/, what)
  await refused('SELECT public.member_admin_save_transport_claim($1::jsonb)', [JSON.stringify({ titleId: T_LEADER })], /Check the titles ticked/, 'not a list')
  await refused('SELECT public.member_admin_save_transport_claim($1::jsonb)', [JSON.stringify(Array.from({ length: 121 }, () => ({ titleId: T_LEADER, airTicket: true })))],
    /Check the titles ticked/, 'more changes than two ticks of sixty titles')
  await refused('SELECT public.member_admin_save_transport_claim($1::jsonb)', [JSON.stringify([{ titleId: id(999), airTicket: true }])],
    /no longer in People/, 'a title ticked that is not in People')
  check((await save([])).airTicketTitleIds, [T_SPECIALIST], 'nothing changed, nothing written')
  await asSystem()
  check(await q('SELECT column_name FROM audit_changes_seen'), [], 'not even on the audit')

  // The user's case: the Team Leader may claim the air ticket, not the rest.
  await as(HR, { manager: true, actions: ['member.manage'] })
  list = await save([{ titleId: T_LEADER, airTicket: true }])
  check([list.titleIds, list.airTicketTitleIds], [[T_SPECIALIST], [T_LEADER, T_SPECIALIST].sort()], 'the Team Leader ticked for the air ticket alone')
  check(list.updatedBy, 'HR Manager', 'and who saved it')
  // A second window, opened before that save, ticks the Team Assistant's transport claim and the Driver's air ticket:
  // it sends its own two boxes, and the Team Leader's tick stays.
  await as(HR2, { manager: true, actions: ['member.manage'] })
  list = await save([{ titleId: T_ASSISTANT, transport: true }, { titleId: T_DRIVER, airTicket: true }])
  check([list.titleIds, list.airTicketTitleIds], [[T_ASSISTANT, T_SPECIALIST].sort(), [T_LEADER, T_SPECIALIST, T_DRIVER].sort()],
    'another window’s save keeps what this one saved')
  check(list.titles.map(t => t.name), ['Revenue Director', 'Team Leader', 'Driver', 'Revenue Specialist', 'Team Assistant'],
    'a title ticked for the air ticket alone is listed, another department’s too')
  check(list.updatedBy, 'HR Two', 'saved by the second')
  list = await save([{ titleId: T_ASSISTANT, transport: false }, { titleId: T_DRIVER, airTicket: false }, { titleId: id(999), transport: false }])
  check([list.titleIds, list.airTicketTitleIds], [[T_SPECIALIST], [T_LEADER, T_SPECIALIST].sort()], 'unticked again — a title gone from People may be unticked')
  check(list.titles.some(t => t.name === 'Driver'), false, 'and an unticked title of another department leaves the list')
  // The one-list Save, from a page opened before this release: the transport ticks, the air ticket's untouched.
  list = await one('SELECT public.member_admin_save_transport_claim($1::uuid[])', [[T_SPECIALIST, T_ASSISTANT]])
  check([list.titleIds, list.airTicketTitleIds], [[T_ASSISTANT, T_SPECIALIST].sort(), [T_LEADER, T_SPECIALIST].sort()], 'the old Save keeps the air ticket list')
  list = await one('SELECT public.member_admin_save_transport_claim($1::uuid[])', [[T_SPECIALIST]])
  await asSystem()
  check(await ticks(), { road: [T_SPECIALIST], plane: [T_LEADER, T_SPECIALIST].sort() }, 'the day’s ticks: Specialist both, Team Leader the air ticket')
  check([...new Set((await q('SELECT column_name FROM audit_changes_seen')).map(r => r.column_name))].sort(), ['air_ticket_title_ids', 'transport_title_ids'],
    'each tick changed is on the audit; who saved it alone is not')
  check((await q('SELECT food_title_ids AS f FROM member_claim_rates WHERE id'))[0].f, [T_SPECIALIST], 'the food claim’s titles are untouched')

  // ── Who may send which part ────────────────────────────────────────────────────────────────────
  const detail = (staff, sub, d) => one('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify(d), staff, sub])
  const plane = { claimType: 'outstation', week: W_KK, invoiceHash: HASH, amount: '456.70' }
  const road = { claimType: 'outstation', week: W_PG }
  const local = { claimType: 'outstation', week: W_KL }
  const stay = { claimType: 'airbnb', week: W_KK, invoiceHash: HASH, start: '2026-10-01', end: '2026-10-04', male: '1', female: '0', invoiceAmount: '500' }
  const refuse = (staff, sub, d, pattern, what) => refused('SELECT public.member_claim_detail_for($1::jsonb, $2, $3)', [JSON.stringify(d), staff, sub], pattern, what)

  // The Team Leader: the air ticket alone.
  let d = await detail(ANN, FAIR, plane)
  check([d.category, d.planeTicket, d.amount, d.regionName, d.location], ['Plane ticket', true, 456.7, 'Sabah', 'KK Convention Centre'],
    'the Team Leader claims the plane ticket to a fair HR flies to — no transport tick needed')
  await refuse(ANN, FAIR, road, /Team Leader may claim a plane ticket only\. HR picks the titles that may claim the rest\./,
    'but not Outstation by road')
  await refuse(ANN, FAIR, stay, /Team Leader may claim a plane ticket only/, 'nor the Airbnb stay of the same fair')
  await refuse(ANN, FAIR, local, /Team Leader may claim a plane ticket only/, 'nor a local fair: by road is not theirs, before it is found local')
  await refuse(ANN, FAIR, { claimType: 'outstation', week: '2026-10-23' }, /A claim is for your own brand week/, 'a weekend with no booth: the claim’s own checks, after the gate')

  // The Revenue Specialist: both, as before.
  d = await detail(CAT, FAIR, plane)
  check([d.category, d.amount], ['Plane ticket', 456.7], 'a Specialist claims the plane ticket, as before')
  d = await detail(CAT, FAIR, road)
  check([d.category, d.spots, d.rate, d.amount], ['Outstation', 4, 25, 100], 'and Outstation by road')
  d = await detail(DAN, IR, stay)
  check([d.category, d.pax, d.nights, d.cap, d.amount], ['Airbnb accommodation', 1, 3, 660, 500], 'and an Airbnb stay, in IR too')
  await refuse(CAT, FAIR, local, /is in KL, local to Klang Valley, so there is no outstation claim/, 'a local fair still has no outstation claim')

  // HR takes the Specialists' air ticket away: by road and Airbnb stay open, the plane ticket closes.
  await as(HR, { manager: true, actions: ['member.manage'] })
  await save([{ titleId: T_SPECIALIST, airTicket: false }])
  await asSystem()
  await refuse(CAT, FAIR, plane, /A plane ticket claim is not open to Revenue Specialist\. HR picks the titles that may claim it\./,
    'a transport tick without the air ticket’s: no plane ticket')
  check((await detail(CAT, FAIR, road)).amount, 100, 'by road still')
  check((await detail(CAT, FAIR, stay)).amount, 500, 'an Airbnb stay to a fair flown to still')

  // The Team Assistant: neither tick.
  await refuse(BEN, FAIR, plane, /A transport claim is not open to Team Assistant\. HR picks the titles that may claim it\./, 'neither tick: refused at the gate')
  await refuse(BEN, FAIR, stay, /A transport claim is not open to Team Assistant\./, 'an Airbnb stay the same')
  await refuse(NOBODY, FAIR, plane, /not open to your title/, 'no seat in the sub-department claimed for: no title, nobody through')
  await refuse(ANN, IR, plane, /not open to your title/, 'nor a seat in another sub-department')
  check(await detail(BEN, FAIR, { claimType: 'food' }), { claimType: 'food', worked: true }, 'a food claim is not a transport claim: its own titles decide')
  await refuse(BEN, FAIR, { claimType: 'taxi' }, /Choose Outstation or Airbnb/, 'an unknown type is refused before the gate, as before')

  // ── Sent: member_prepare_request ───────────────────────────────────────────────────────────────
  await as(id(90), { staff: ANN })
  const sent = await one('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, JSON.stringify(plane), id(91)])
  check(sent.status, 'draft', 'the Team Leader’s plane ticket claim is prepared')
  await asSystem()
  check(await one('SELECT title FROM member_requests WHERE idempotency_key = $1', [id(91)]), 'Plane ticket claim · KK Convention Centre', 'titled as a plane ticket claim')
  check(await one("SELECT detail->>'amount' FROM member_requests WHERE idempotency_key = $1", [id(91)]), '456.70', 'at the ticket’s price')
  // An old-style claim (no claimType: an accommodation claim carrying its own amount) is the transport tick's.
  const legacy = JSON.stringify({ invoiceHash: HASH, location: 'Penang', start: '2026-10-01', end: '2026-10-02', amount: 100 })
  await as(id(90), { staff: ANN })
  await refused('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, legacy, id(92)],
    /Team Leader may claim a plane ticket only/, 'an old-style claim is not a plane ticket')
  await as(id(93), { staff: CAT })
  check((await one('SELECT public.member_prepare_request($1, $2, $3::jsonb, $4, NULL)', ['claim', FAIR, legacy, id(94)])).status, 'draft',
    'a transport tick prepares one as before')
  await asSystem()

  // ── The member's form ──────────────────────────────────────────────────────────────────────────
  const settings = await one('SELECT public.member_claim_settings()')
  check(settings.transport, { titles: ['Revenue Specialist'], airTicketTitles: ['Team Leader'] },
    'the app is handed both lists of names')
  check(settings.food.titles, ['Revenue Specialist'], 'beside the food claim’s, as before')
  check(settings.regions.map(r => [r.name, r.planeTicket]), [['KL', false], ['Penang', false], ['Sabah', true]], 'and the regions flown to, as before')

  // ── The grants ─────────────────────────────────────────────────────────────────────────────────
  const can = (role, fn) => one(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE')`)
  check(await can('authenticated', 'public.member_admin_save_transport_claim(jsonb)'), true, 'HR’s session saves the ticks')
  check(await can('anon', 'public.member_admin_save_transport_claim(jsonb)'), false, 'never the publishable key')
  check(await can('authenticated', 'public.member_admin_save_transport_claim(uuid[])'), true, 'the one-list Save as before')
  check(await can('authenticated', 'public.member_transport_claim_open(uuid, uuid, text)'), false, 'the gate is the claim functions’ own')
  check(await can('anon', 'public.member_transport_claim_open(uuid, uuid, text)'), false, 'never anon’s')
  check(await can('service_role', 'public.member_transport_claim_open(uuid, uuid, text)'), true, 'and the service role’s')
  check(await can('authenticated', 'public.member_transport_claim_open(uuid, uuid)'), false, 'the two-argument one too')
  check(await can('service_role', 'public.member_transport_claim_open(uuid, uuid)'), true, 'the service role’s')
  await refused("SELECT public.member_transport_claim_open($1, $2, 'taxi')", [ANN, FAIR], /Unknown part of a transport claim: taxi/, 'an unknown part is refused')

  console.log(`air ticket claim: ${checks} checks passed`)
} finally {
  await db.close()
}

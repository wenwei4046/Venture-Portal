// Local PostgreSQL regression for 20261114050000 — two organisers at one place on the same days are two fairs
// (2026-11-13; the user, asked whether fairs at one place on overlapping days under different organisers are
// different fairs: "yes , different with organiser").
//
// Production's bodies (tests/member-sql/fair-by-organiser-production.sql, pg_get_functiondef: the fair the ERP names,
// the guess for a bill it names none for, the brand weeks from the ERP's Sales Attending, and the triggers that stamp
// a bill's fair) are loaded over stand-in tables with production's constraints; the migration then runs VERBATIM,
// twice. Under test: that 2990s' standing booth (MALL MGMT, 29 Oct – 31 Dec) and BIGHOME's three-day fair at one
// hall stop being one fair whose organiser and days follow the last delivery; that the fairs already mixed are split
// with their bills; that MEGAHOME's fair there in November is its own, and its sellers' brand week that weekend's.
// No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const MIGRATION = new URL('../../supabase/migrations/20261114050000_fair_by_organiser.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

const FAIR = id(1)
const OTHER_SUB = id(2)
const OCT = id(11)
const NOV = id(12)
const PAID_OCT = id(13)
const ETHAN = id(31)
const PENANG = 'PENANG WATERFRONT CONVENTION CENTRE'
const KLUANG = 'SUNWAY KLUANG MALL'

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;

    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text NOT NULL, canonical_key text);
    CREATE TABLE comm_organisers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, notes text,
      created_at timestamptz NOT NULL DEFAULT now());
    -- comm_venue_events exactly as production holds it (2026-11-13: columns and constraints).
    CREATE TABLE comm_venue_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_key text NOT NULL REFERENCES comm_venues(venue_key) ON UPDATE CASCADE ON DELETE CASCADE,
      period_month date NOT NULL,
      organiser_id uuid REFERENCES comm_organisers(id) ON DELETE RESTRICT,
      notes text, erp_organiser_text text, source text NOT NULL DEFAULT 'manual',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
      start_date date, end_date date, erp_project_ids integer[] NOT NULL DEFAULT '{}',
      CONSTRAINT comm_venue_events_month_is_first CHECK (period_month = date_trunc('month', period_month::timestamptz)::date),
      CONSTRAINT comm_venue_events_no_overlap EXCLUDE USING gist (venue_key WITH =, daterange(start_date, end_date, '[]') WITH &&)
        WHERE (start_date IS NOT NULL),
      CONSTRAINT comm_venue_events_source_check CHECK (source = ANY (ARRAY['manual', 'erp'])),
      CONSTRAINT comm_venue_events_window_in_month CHECK (start_date IS NULL
        OR period_month = date_trunc('month', start_date::timestamptz)::date OR period_month = date_trunc('month', end_date::timestamptz)::date),
      CONSTRAINT comm_venue_events_window_ordered CHECK (end_date IS NULL OR end_date >= start_date),
      CONSTRAINT comm_venue_events_window_paired CHECK ((start_date IS NULL) = (end_date IS NULL)));
    CREATE UNIQUE INDEX uq_comm_venue_events_undated ON comm_venue_events (venue_key, period_month) WHERE start_date IS NULL;

    CREATE TABLE sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL,
      status text NOT NULL DEFAULT 'committed');
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
      period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, venue text, staff_id uuid,
      cancelled boolean NOT NULL DEFAULT false,
      fair_event_id uuid REFERENCES comm_venue_events(id) ON DELETE SET NULL, fair_source text, raw jsonb);
    -- A month a run has paid: its bills refuse any change.
    CREATE TABLE paid_months(sub uuid, month date);
    CREATE FUNCTION commission_order_period_locked(uuid, date) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM paid_months p WHERE p.sub = $1 AND p.month = $2) $$;

    -- The ERP's Sales Attending: its booths and who works them.
    CREATE TABLE erp_booths(erp_project_id bigint PRIMARY KEY, company_id bigint NOT NULL DEFAULT 1, code text, name text,
      brand text, brand_code text, venue text, venue_key text, organizer text, start_date date NOT NULL, end_date date NOT NULL,
      status text NOT NULL DEFAULT 'confirmed');
    CREATE TABLE erp_booth_staff(erp_project_id bigint NOT NULL, erp_sales_rep_id bigint NOT NULL, erp_salesperson_id text,
      code text, name text NOT NULL);
    CREATE TABLE comm_agent_aliases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_key text NOT NULL,
      agent_name_sample text NOT NULL DEFAULT '', staff_id uuid NOT NULL, erp_salesperson_id text);
    CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(upper(btrim($1)), '') $$;
  `)

  // ── Production's bodies ────────────────────────────────────────────────────
  await db.exec('SET check_function_bodies = off')
  await db.exec((await readFile(new URL('./fair-by-organiser-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
  await db.exec('SET check_function_bodies = on')
  await db.exec(`
    CREATE UNIQUE INDEX uq_comm_organisers_key ON comm_organisers (organiser_key(name));
    CREATE TRIGGER comm_venue_events_canonical BEFORE INSERT OR UPDATE OF venue_key ON comm_venue_events
      FOR EACH ROW EXECUTE FUNCTION comm_venue_events_canonical();
    CREATE TRIGGER comm_venue_events_restamp_orders AFTER INSERT OR DELETE OR UPDATE OF venue_key, start_date, end_date ON comm_venue_events
      FOR EACH ROW EXECUTE FUNCTION comm_venue_events_restamp_orders();
    CREATE TRIGGER sales_orders_resolve_fair BEFORE INSERT OR UPDATE OF venue, order_date, fair_event_id, fair_source ON sales_orders
      FOR EACH ROW EXECUTE FUNCTION sales_orders_resolve_fair();

    INSERT INTO sales_import_batches VALUES
      ('${OCT}', '${FAIR}', '2026-10-01', 'committed'), ('${NOV}', '${FAIR}', '2026-11-01', 'committed'),
      ('${PAID_OCT}', '${OTHER_SUB}', '2026-10-01', 'committed');
    INSERT INTO paid_months VALUES ('${OTHER_SUB}', '2026-10-01');
    INSERT INTO comm_agent_aliases(agent_key, staff_id, erp_salesperson_id) VALUES ('ethan', '${ETHAN}', 'sp-1');
  `)

  const md5Of = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
  const SIG = {
    fair: 'public.erp_sync_fair(jsonb)',
    guess: 'public.venue_event_for_order(text, date, integer)',
    weeks: 'public.member_erp_brand_weeks(uuid, uuid)',
  }
  const PRODUCTION = {
    fair: 'b2a911b1f14e940e0166f57d7dd289dc',
    guess: '46f054aad656b15b4ec9b349dc4f3059',
    weeks: '183e8d1838a86f90cfd6094a303ed813',
  }
  for (const [name, md5] of Object.entries(PRODUCTION)) {
    check(await md5Of(SIG[name]), md5, `${name}: the fixture is production's body`)
  }

  // ── The world ──────────────────────────────────────────────────────────────
  // A booth as the ERP lists it (Sales Attending) and as a bill's delivery carries it (`fair`).
  const booth = async (project, brand, organiser, venue, start, end, name = null) => {
    await q(`INSERT INTO erp_booths(erp_project_id, name, brand, brand_code, venue, venue_key, organizer, start_date, end_date)
             VALUES ($1, $2, $3, upper($3), $4, venue_key($4), $5, $6, $7)
             ON CONFLICT (erp_project_id) DO UPDATE SET organizer = EXCLUDED.organizer, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date`,
      [project, name, brand, venue, organiser, start, end])
    return { projectId: project, brand, organizer: organiser, venue, startDate: start, endDate: end, status: 'confirmed', name }
  }
  const deliver = payload => one(`SELECT erp_sync_fair($1::jsonb)`, [JSON.stringify(payload)])
  // A bill as the ingest writes it: the fair the ERP names is pinned; with none, the trigger guesses by place and day.
  const bill = async (orderNo, batch, period, date, venue, fairPayload = null) => {
    const fairId = fairPayload ? await deliver(fairPayload) : null
    await q(`INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, venue, staff_id, fair_event_id, fair_source, raw)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [batch, period, orderNo, date, venue, ETHAN, fairId, fairId ? 'erp' : null, JSON.stringify(fairPayload ? { fair: fairPayload } : {})])
    return fairId
  }
  const fairsAt = async place => (await q(
    `SELECT e.id, og.name AS organiser, e.start_date::text AS s, e.end_date::text AS e, e.erp_project_ids AS p, e.notes
       FROM comm_venue_events e LEFT JOIN comm_organisers og ON og.id = e.organiser_id
      WHERE e.venue_key = $1 ORDER BY e.start_date, e.end_date, og.name NULLS FIRST`, [place]))
  const said = rows => rows.map(r => `${r.organiser ?? '—'} ${r.s}→${r.e} [${r.p.join(',')}]`)
  const fairOf = async orderNo => one(`SELECT fair_event_id FROM sales_orders WHERE order_no = $1`, [orderNo])
  const guess = (venue, date) => one(`SELECT venue_event_for_order($1, $2::date)`, [venue, date])
  const weeksOf = async () => (await q(
    `SELECT w.week::text AS week, w.erp_project_id::int AS project, w.fair_id, w.organizer FROM member_erp_brand_weeks($1, $2) w ORDER BY 1, 2`,
    [FAIR, ETHAN]))

  // Penang Waterfront as production held it on 2026-11-13: BIGHOME's fair, and 2990s' standing booth over it.
  const b311 = await booth(311, 'AKEMI', 'BIGHOME', PENANG, '2026-10-30', '2026-11-01', 'Pulau Pinang [AKEMI] BIGHOME @ PENANG WATERFRONT')
  const b2269 = await booth(2269, 'ZANOTTI', 'BIGHOME', PENANG, '2026-10-30', '2026-11-01')
  const b2289 = await booth(2289, '2990s Sofa', 'MALL MGMT', PENANG, '2026-10-29', '2026-12-31', 'Pulau Pinang [2990S] MALL MGMT @ PENANG WATERFRONT')
  const F = await bill('P1', OCT, '2026-10-01', '2026-10-31', PENANG, b311)
  await bill('P2', OCT, '2026-10-01', '2026-10-31', PENANG, b2269)
  check(said(await fairsAt(PENANG)), ['BIGHOME 2026-10-30→2026-11-01 [311,2269]'], "before: BIGHOME's two booths are one fair")
  // Two bills the ERP named no fair for: guessed by place and day, while the fair stands as BIGHOME's.
  await bill('V1', OCT, '2026-10-01', '2026-10-31', PENANG)
  await bill('V2', NOV, '2026-11-01', '2026-11-15', PENANG)
  check([await fairOf('V1'), await fairOf('V2')], [F, F], 'before: a bill with no fair named is guessed by place and day (15 Nov within the 45 days after)')

  check(await bill('P3', OCT, '2026-10-01', '2026-10-30', PENANG, b2289), F, "before: 2990s' standing booth is folded into BIGHOME's fair")
  await bill('P4', NOV, '2026-11-01', '2026-11-05', PENANG, b2289)
  await bill('P5', PAID_OCT, '2026-10-01', '2026-10-30', PENANG, b2289)
  check(said(await fairsAt(PENANG)), ['MALL MGMT 2026-10-29→2026-12-31 [311,2269,2289]'],
    "before: the fair takes the last booth's organiser and days — BIGHOME's fair now 'ends' on 31 December")
  await deliver(b311)
  check(said(await fairsAt(PENANG)), ['BIGHOME 2026-10-30→2026-11-01 [311,2269,2289]'], 'before: and back again at the next BIGHOME delivery')
  await deliver(b2289)

  // MEGAHOME's fair there on 27–29 November: ETHAN is listed at its AKEMI booth; no bill has been written yet.
  await booth(291, 'AKEMI', 'MEGAHOME', PENANG, '2026-11-27', '2026-11-29')
  await q(`INSERT INTO erp_booth_staff VALUES (291, 1, 'sp-1', 'E1', 'ETHAN')`)
  check(await weeksOf(), [{ week: '2026-10-30', project: 291, fair_id: F, organizer: 'MEGAHOME' }],
    "before: MEGAHOME's booth is read in the standing booth's fair — its sellers' brand week falls in October's last weekend")

  // Sunway Kluang Mall, 5–11 October: two organisers' booths on the same days.
  const b2261 = await booth(2261, 'AKEMI', 'KAI HAO (KL, CHEN)', KLUANG, '2026-10-05', '2026-10-11', 'JOHOR [AKEMI] KAI HAO @ SUNWAY KLUANG MALL')
  const b2270 = await booth(2270, 'ERGOTEX', 'SOLO', KLUANG, '2026-10-05', '2026-10-11', 'JOHOR [ERGOTEX] SOLO @ SUNWAY KLUANG MALL')
  const K = await bill('K1', OCT, '2026-10-01', '2026-10-06', KLUANG, b2261)
  check(await bill('K2', OCT, '2026-10-01', '2026-10-06', KLUANG, b2270), K, 'before: the second organiser is folded in')
  check(said(await fairsAt(KLUANG)), ['SOLO 2026-10-05→2026-10-11 [2261,2270]'], 'before: one fair, under whoever was delivered last')

  // A hall with one fair, for the guess's answers that must not move.
  const b400 = await booth(400, 'AKEMI', 'HOMEDEC', 'KLCC', '2026-10-02', '2026-10-04')
  const KLCC = await deliver(b400)
  const guessesBefore = await Promise.all(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-20', '2026-11-18', '2026-11-19'].map(d => guess('KLCC', d)))
  check(guessesBefore, [null, KLCC, KLCC, KLCC, KLCC, null], 'before: open on the day, else closed within 45 days')

  // Production's fairs were opened weeks ago (PGlite's now() ticks in milliseconds — the guess reads which was first).
  await q(`UPDATE comm_venue_events SET created_at = created_at - interval '30 days'`)

  // ── The migration, verbatim — twice ────────────────────────────────────────
  const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(migration)
  await db.exec(migration)
  checks++
  const MAKES = Object.fromEntries([...migration.matchAll(/\('(public\.[^']+)',\s+'([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
    .map(m => [m[1], { from: m[2], makes: m[3] }]))
  for (const [name, sig] of Object.entries(SIG)) {
    check(MAKES[sig]?.from, PRODUCTION[name], `${name}: the migration is written from production's body`)
    check(await md5Of(sig), MAKES[sig]?.makes, `${name}: what stands is what the migration says it makes`)
  }

  // ── The fairs already mixed are split ──────────────────────────────────────
  const penang = await fairsAt(PENANG)
  check(said(penang), ['MALL MGMT 2026-10-29→2026-12-31 [2289]', 'BIGHOME 2026-10-30→2026-11-01 [311,2269]'],
    "Penang: BIGHOME's fair keeps its booths and takes back its three days; the standing booth is a fair of its own")
  const G = penang[0].id
  check([penang[1].id, penang[0].notes], [F, 'Pulau Pinang [2990S] MALL MGMT @ PENANG WATERFRONT'],
    "the fair that was there is BIGHOME's still (it opened it); the new one is named as the ERP names the booth")
  check([await fairOf('P1'), await fairOf('P2'), await fairOf('P3'), await fairOf('P4')], [F, F, G, G],
    "each booth's bills are its fair's — October's and November's of the standing booth went with it")
  check(await fairOf('P5'), F, 'a bill of a month a run has paid keeps the fair it was paid under')
  check([await fairOf('V1'), await fairOf('V2')], [F, G],
    'the guessed bills: 31 Oct, both standing — the shorter, the fair; 15 Nov — the one still open')
  const kluang = await fairsAt(KLUANG)
  check(said(kluang).sort(), ['KAI HAO (KL, CHEN) 2026-10-05→2026-10-11 [2261]', 'SOLO 2026-10-05→2026-10-11 [2270]'],
    'Kluang: the same days, two organisers, two fairs')
  const K2 = kluang.find(r => r.organiser === 'SOLO').id
  check([kluang.find(r => r.organiser !== 'SOLO').id, await fairOf('K1'), await fairOf('K2')], [K, K, K2],
    'the first booth keeps the fair; the other organiser and its bill leave')
  check(await guess(KLUANG, '2026-10-06'), K, 'two fairs on the very same days: a guessed bill is the one that was there first — where it was before')
  check(said(await fairsAt('KLCC')), ['HOMEDEC 2026-10-02→2026-10-04 [400]'], 'a fair of one organiser is untouched')

  // ── The table ──────────────────────────────────────────────────────────────
  const BIGHOME = await one(`SELECT id FROM comm_organisers WHERE name = 'BIGHOME'`)
  const insertFair = `INSERT INTO comm_venue_events(venue_key, period_month, start_date, end_date, organiser_id) VALUES ($1, '2026-11-01', $2, $3, $4)`
  await reject(insertFair, [PENANG, '2026-11-01', '2026-11-03', BIGHOME], /comm_venue_events_no_overlap/,
    'one organiser, one place, overlapping days: still one fair')
  await reject(insertFair, [PENANG, '2026-11-20', '2026-11-22', await one(`SELECT id FROM comm_organisers WHERE name = 'MALL MGMT'`)],
    /comm_venue_events_no_overlap/, "nor a second fair of the standing booth's organiser inside its days")
  await q(`INSERT INTO comm_venues VALUES ('NOWHERE', 'Nowhere', NULL)`)
  await q(insertFair, ['NOWHERE', '2026-11-01', '2026-11-03', null])
  await reject(insertFair, ['NOWHERE', '2026-11-02', '2026-11-04', null], /comm_venue_events_no_overlap/,
    'two fairs with no organiser named count as one organiser')
  await q(insertFair, ['NOWHERE', '2026-11-02', '2026-11-04', BIGHOME])
  check((await fairsAt('NOWHERE')).length, 2, 'a named organiser beside an unnamed one is another fair')

  // ── The fair the ERP names ─────────────────────────────────────────────────
  // Nothing flips any more.
  check([await deliver(b311), await deliver(b2289), await deliver(b2269)], [F, G, F], "each booth's delivery answers its own fair")
  check(said(await fairsAt(PENANG)), ['MALL MGMT 2026-10-29→2026-12-31 [2289]', 'BIGHOME 2026-10-30→2026-11-01 [311,2269]'],
    'and neither fair takes the other organiser or its days')
  // The mall's second standing booth is the same organiser's on the same days: one fair with 2990s'.
  check(await deliver(await booth(2287, 'MY SOFA FACTORY', 'MALL MGMT', PENANG, '2026-10-29', '2026-12-31')), G, 'a booth of the same organiser on overlapping days is folded in, as before')

  // MEGAHOME on 27–29 November: read in its own weekend before any bill, then a fair of its own.
  check(await weeksOf(), [{ week: '2026-11-27', project: 291, fair_id: null, organizer: 'MEGAHOME' }],
    "MEGAHOME's booth is no booth of the standing fair: its sellers' brand week is that weekend's")
  const M = await bill('M1', NOV, '2026-11-01', '2026-11-28', PENANG, await booth(291, 'AKEMI', 'MEGAHOME', PENANG, '2026-11-27', '2026-11-29'))
  check(M !== F && M !== G, true, "MEGAHOME's first bill opens MEGAHOME's fair")
  check(await deliver(await booth(2292, 'DUNLOP', 'MEGAHOME', PENANG, '2026-11-27', '2026-11-29')), M, 'and its second booth joins it')
  check(said(await fairsAt(PENANG)), [
    'MALL MGMT 2026-10-29→2026-12-31 [2289,2287]', 'BIGHOME 2026-10-30→2026-11-01 [311,2269]', 'MEGAHOME 2026-11-27→2026-11-29 [291,2292]',
  ], 'three fairs at one hall, each its organiser and its days')
  check(await weeksOf(), [{ week: '2026-11-27', project: 291, fair_id: M, organizer: 'MEGAHOME' }], 'the brand week now names the fair')

  // A booth that names no organiser is a booth of the fair standing on its days — the exact days first.
  check(await deliver(await booth(900, 'ERGOTEX', null, PENANG, '2026-10-30', '2026-11-01')), F, 'no organiser named: folded into the fair of its exact days')
  check((await fairsAt(PENANG)).find(r => r.id === F).organiser, 'BIGHOME', 'which keeps its organiser')
  // A fair nobody named an organiser for takes the first one named.
  await q(`INSERT INTO comm_venues VALUES ('IOI CITY MALL', 'IOI CITY MALL', NULL)`)
  const I = await deliver(await booth(700, 'AKEMI', null, 'IOI CITY MALL', '2026-12-04', '2026-12-06'))
  check(await deliver(await booth(701, 'ZANOTTI', 'HOMELOVE', 'IOI CITY MALL', '2026-12-04', '2026-12-06')), I, 'an unnamed fair takes the booth that names its organiser')
  check(said(await fairsAt('IOI CITY MALL')), ['HOMELOVE 2026-12-04→2026-12-06 [700,701]'], 'and the organiser with it')

  // The ERP corrects one booth's organiser while its fair has other booths: the booth leaves.
  const L = await deliver({ ...b2269, organizer: 'HOMELOVE' })
  check(L !== F, true, "a booth pinned to another organiser's fair leaves it")
  check(said(await fairsAt(PENANG)).filter(s => /BIGHOME|HOMELOVE/.test(s)),
    ['BIGHOME 2026-10-30→2026-11-01 [311,900]', 'HOMELOVE 2026-10-30→2026-11-01 [2269]'], 'for a fair of its own organiser — the rest stay')
  // Alone in its fair, the correction changes the fair where it stands.
  check(await deliver({ ...b400, organizer: 'MYHOME' }), KLCC, "a fair's only booth corrected: the same fair")
  check(said(await fairsAt('KLCC')), ['MYHOME 2026-10-02→2026-10-04 [400]'], 'under the organiser the ERP now names')
  // …unless that organiser's fair already stands there on its days: then it is a booth of that fair.
  const b401 = await booth(401, 'ZANOTTI', 'HOMEDEC', 'KLCC', '2026-10-02', '2026-10-04')
  const H = await deliver(b401)
  check(H !== KLCC, true, 'a second organiser at the hall on the same days: its own fair')
  check(await deliver({ ...b401, organizer: 'MYHOME' }), KLCC, "corrected to the organiser whose fair stands there: a booth of that fair")
  check(said(await fairsAt('KLCC')).sort(), ['HOMEDEC 2026-10-02→2026-10-04 []', 'MYHOME 2026-10-02→2026-10-04 [400,401]'],
    'the fair it left keeps what was written under it, with no booth')

  // ── The guess ──────────────────────────────────────────────────────────────
  check(await Promise.all(['2026-10-29', '2026-10-31', '2026-11-03', '2026-11-28', '2026-12-31'].map(d => guess(PENANG, d))),
    [G, F, G, M, G],
    'two standing on the day: the shorter (the fair, not the standing booth); one standing: it — an open fair before one that closed')
  await q(`DELETE FROM comm_venue_events WHERE venue_key = 'KLCC' AND erp_project_ids = '{}'`)
  check(await Promise.all(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-20', '2026-11-18', '2026-11-19'].map(d => guess('KLCC', d))),
    guessesBefore, 'a hall with one fair answers as it did: open on the day, else closed within 45 days')

  // ── Production changed since: nothing is touched ───────────────────────────
  await db.exec(`CREATE OR REPLACE FUNCTION public.venue_event_for_order(p_venue text, p_order_date date, p_grace_days integer DEFAULT 45)
    RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $f$ SELECT NULL::uuid $f$`)
  await assert.rejects(() => db.exec(migration), /venue_event_for_order\(text, date, integer\) is md5 [0-9a-f]{32}, not the body this migration was written from/,
    'a changed body is refused')
  await db.exec('ROLLBACK')
  checks++
  check(await md5Of(SIG.fair), MAKES[SIG.fair]?.makes, 'and nothing else was touched')

  console.log(`PASS: ${checks} fair-by-organiser checks. Production's bodies (md5-checked) + the real migration 20261114050000 (twice); synthetic surroundings. No live database connection.`)
} finally {
  await db.close()
}

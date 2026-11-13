// Local PostgreSQL regression for 20261114060000 — a booth is a brand week every weekend it is open (2026-11-13; the
// user, asked whether every weekend a standing booth is open counts as a brand week: "yes").
//
// Production's bodies (tests/member-sql/fair-by-organiser-production.sql, pg_get_functiondef) are loaded over stand-in
// tables, 20261114050000_fair_by_organiser makes the body this migration is written from, and the migration then runs
// VERBATIM, twice. Under test: that 2990s' standing booth (29 Oct – 31 Dec) is its sellers' brand week on each of its
// nine weekends and on no other; that a fair of one weekend — one ending on a Monday, one open Monday to Thursday —
// answers exactly what it answered; that somebody listed at two booths one weekend is read at the one they wrote the
// most bills at THAT week. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const FAIR_SPLIT = new URL('../../supabase/migrations/20261114050000_fair_by_organiser.sql', import.meta.url)
const MIGRATION = new URL('../../supabase/migrations/20261114060000_booth_every_weekend.sql', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR = id(1)
const NOV = id(12)
const ETHAN = id(31)
const SHELDON = id(32)
const ANTHONY = id(33)
const PENANG = 'PENANG WATERFRONT CONVENTION CENTRE'

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;

    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text NOT NULL, canonical_key text);
    CREATE TABLE comm_organisers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, notes text,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_venue_events(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_key text NOT NULL REFERENCES comm_venues(venue_key) ON UPDATE CASCADE ON DELETE CASCADE,
      period_month date NOT NULL,
      organiser_id uuid REFERENCES comm_organisers(id) ON DELETE RESTRICT,
      notes text, erp_organiser_text text, source text NOT NULL DEFAULT 'manual',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
      start_date date, end_date date, erp_project_ids integer[] NOT NULL DEFAULT '{}',
      CONSTRAINT comm_venue_events_no_overlap EXCLUDE USING gist (venue_key WITH =, daterange(start_date, end_date, '[]') WITH &&)
        WHERE (start_date IS NOT NULL),
      CONSTRAINT comm_venue_events_window_paired CHECK ((start_date IS NULL) = (end_date IS NULL)));
    CREATE TABLE sales_import_batches(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, period_month date NOT NULL,
      status text NOT NULL DEFAULT 'committed');
    CREATE TABLE sales_orders(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES sales_import_batches(id),
      period_month date NOT NULL, order_no text NOT NULL, order_date date NOT NULL, venue text, staff_id uuid,
      cancelled boolean NOT NULL DEFAULT false,
      fair_event_id uuid REFERENCES comm_venue_events(id) ON DELETE SET NULL, fair_source text, raw jsonb);
    CREATE FUNCTION commission_order_period_locked(uuid, date) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE TABLE erp_booths(erp_project_id bigint PRIMARY KEY, company_id bigint NOT NULL DEFAULT 1, code text, name text,
      brand text, brand_code text, venue text, venue_key text, organizer text, start_date date NOT NULL, end_date date NOT NULL,
      status text NOT NULL DEFAULT 'confirmed');
    CREATE TABLE erp_booth_staff(erp_project_id bigint NOT NULL, erp_sales_rep_id bigint NOT NULL, erp_salesperson_id text,
      code text, name text NOT NULL);
    CREATE TABLE comm_agent_aliases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_key text NOT NULL,
      agent_name_sample text NOT NULL DEFAULT '', staff_id uuid NOT NULL, erp_salesperson_id text);
    CREATE FUNCTION erp_sync_brand_code(text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(upper(btrim($1)), '') $$;
  `)
  await db.exec('SET check_function_bodies = off')
  await db.exec((await readFile(new URL('./fair-by-organiser-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
  await db.exec('SET check_function_bodies = on')
  await db.exec(`
    CREATE UNIQUE INDEX uq_comm_organisers_key ON comm_organisers (organiser_key(name));
    CREATE TRIGGER comm_venue_events_canonical BEFORE INSERT OR UPDATE OF venue_key ON comm_venue_events
      FOR EACH ROW EXECUTE FUNCTION comm_venue_events_canonical();
    CREATE TRIGGER sales_orders_resolve_fair BEFORE INSERT OR UPDATE OF venue, order_date, fair_event_id, fair_source ON sales_orders
      FOR EACH ROW EXECUTE FUNCTION sales_orders_resolve_fair();
    INSERT INTO sales_import_batches VALUES ('${NOV}', '${FAIR}', '2026-11-01', 'committed');
    INSERT INTO comm_agent_aliases(agent_key, staff_id, erp_salesperson_id) VALUES
      ('ethan', '${ETHAN}', 'sp-1'), ('sheldon tan', '${SHELDON}', 'sp-2'), ('anthony', '${ANTHONY}', 'sp-3');
    -- As production: one alias an ERP salesperson, so a listing is one row.
    CREATE UNIQUE INDEX uq_comm_agent_aliases_erp_salesperson ON comm_agent_aliases (erp_salesperson_id) WHERE erp_salesperson_id IS NOT NULL;
  `)
  const md5Of = () => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure('public.member_erp_brand_weeks(uuid, uuid)')`)
  check(await md5Of(), '183e8d1838a86f90cfd6094a303ed813', "the fixture is production's body")
  // The body this migration is written from: production's with the fair split's one statement.
  await db.exec((await readFile(FAIR_SPLIT, 'utf8')).replace(/\r\n/g, '\n'))
  check(await md5Of(), '7f495826d491eb26487bd3c715928cc0', 'the fair split makes the body this migration is written from')

  // ── The world ──────────────────────────────────────────────────────────────
  const booth = async (project, brand, organiser, venue, start, end, staff = [], status = 'confirmed') => {
    await q(`INSERT INTO erp_booths(erp_project_id, brand, brand_code, venue, venue_key, organizer, start_date, end_date, status)
             VALUES ($1, $2, upper($2), $3, venue_key($3), $4, $5, $6, $7)`, [project, brand, venue, organiser, start, end, status])
    for (const [rep, sp, name] of staff) await q(`INSERT INTO erp_booth_staff VALUES ($1, $2, $3, NULL, $4)`, [project, rep, sp, name])
    return { projectId: project, brand, organizer: organiser, venue, startDate: start, endDate: end, status }
  }
  let n = 0
  const bill = async (staff, date, fair, sold = undefined) => {
    const payload = sold === undefined ? fair : { ...fair, fairDate: sold }
    const fairId = await one(`SELECT erp_sync_fair($1::jsonb)`, [JSON.stringify(payload)])
    await q(`INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, venue, staff_id, fair_event_id, fair_source, raw)
             VALUES ($1, '2026-11-01', $2, $3, $4, $5, $6, 'erp', $7)`,
      [NOV, `B${++n}`, date, fair.venue, staff, fairId, JSON.stringify({ fair: payload })])
    return fairId
  }
  const E = [1, 'sp-1', 'ETHAN'], S = [2, 'sp-2', 'SHELDON TAN'], A = [3, 'sp-3', 'ANTHONY']
  // 2990s' standing booth, Thursday 29 Oct to Thursday 31 Dec; a seller the portal cannot name is listed too.
  const standing = await booth(2289, '2990s Sofa', 'MALL MGMT', PENANG, '2026-10-29', '2026-12-31', [E, S, [9, 'sp-9', 'Dexon']])
  // BIGHOME's three days at the same hall; a fair ending on a Monday; one of twelve days over two weekends; one open
  // Monday to Thursday; MEGAHOME's three days at the standing booth's hall, ETHAN listed there too; a withdrawn booth.
  const bighome = await booth(311, 'AKEMI', 'BIGHOME', PENANG, '2026-10-30', '2026-11-01', [A])
  const pisa = await booth(61, 'AKEMI', 'MEGAHOME', 'PISA SPICE ARENA', '2026-11-06', '2026-11-09', [A])
  await booth(2229, 'AKEMI', 'MALL MGMT', 'THE STARLING MALL', '2026-12-16', '2026-12-27', [A])
  await booth(500, 'AKEMI', 'HOMEDEC', 'KLCC', '2026-10-05', '2026-10-08', [A])
  const megahome = await booth(291, 'AKEMI', 'MEGAHOME', PENANG, '2026-11-27', '2026-11-29', [E])
  await booth(999, 'AKEMI', 'HOMEDEC', 'KLCC', '2026-11-13', '2026-11-15', [A], 'cancelled')

  const G = await bill(ETHAN, '2026-11-10', standing)
  await bill(ETHAN, '2026-11-11', standing)
  await bill(ETHAN, '2026-11-12', standing)
  // Sold on Sunday 8 Nov, keyed on Friday 13 Nov: the weekend of 6 Nov's.
  await bill(ETHAN, '2026-11-13', standing, '2026-11-08')
  // One at the standing booth on Tuesday 24 Nov, two at MEGAHOME's that weekend.
  await bill(ETHAN, '2026-11-24', standing)
  const M = await bill(ETHAN, '2026-11-28', megahome)
  await bill(ETHAN, '2026-11-28', megahome)
  // A day that does not read, and one that is none of the booth's days: each bill is its order date's.
  await bill(SHELDON, '2026-11-14', standing, 'soon')
  await bill(SHELDON, '2026-11-15', standing, '2026-03-01')
  const F = await bill(ANTHONY, '2026-10-31', bighome)
  const P = await bill(ANTHONY, '2026-11-09', pisa)
  check(new Set([G, M, F, P]).size, 4, 'four fairs: the standing booth, BIGHOME, MEGAHOME and Pisa')

  const weeks = async (staff = null) => (await q(
    `SELECT w.staff_id, w.week::text AS week, w.erp_project_id::int AS project, w.fair_id, w.brand, w.venue, w.organizer,
            w.start_date::text AS s, w.end_date::text AS e, w.booths
       FROM member_erp_brand_weeks($1, $2) w ORDER BY w.staff_id, w.week`, [FAIR, staff]))
  const of = (rows, staff) => rows.filter(r => r.staff_id === staff).map(r => `${r.week} ${r.project}`)
  const WEEKENDS = ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18', '2026-12-25']

  // ── Before: one weekend a booth, the one its fair opens in ────────────────
  const before = await weeks()
  check(of(before, ETHAN), ['2026-10-30 2289', '2026-11-27 291'], "before: the standing booth is ETHAN's brand week on 30 Oct and on no later weekend")
  check(of(before, SHELDON), ['2026-10-30 2289'], 'before: and SHELDON TAN has none after it')
  check(of(before, ANTHONY), ['2026-10-09 500', '2026-10-30 311', '2026-11-06 61', '2026-12-18 2229'],
    'before: a fair of two weekends is the first one only')

  // ── The migration, verbatim — twice ────────────────────────────────────────
  const migration = (await readFile(MIGRATION, 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(migration)
  await db.exec(migration)
  checks++
  const [, from, makes] = migration.match(/\('public\.member_erp_brand_weeks\(uuid, uuid\)', '([0-9a-f]{32})', '([0-9a-f]{32})'\)/)
  check(from, '7f495826d491eb26487bd3c715928cc0', "written from the fair split's body")
  check(await md5Of(), makes, 'what stands is what the migration says it makes')

  // ── Every weekend the booth is open ───────────────────────────────────────
  const after = await weeks()
  check(of(after, SHELDON), WEEKENDS.map(w => `${w} 2289`),
    'the standing booth is a brand week on each of its nine weekends — and not on 1 Jan, its last four days being Monday to Thursday')
  const sheldon = after.filter(r => r.staff_id === SHELDON)
  check([...new Set(sheldon.map(r => `${r.fair_id} ${r.brand} ${r.venue} ${r.organizer} ${r.s}→${r.e} ${r.booths}`))],
    [`${G} 2990S SOFA ${PENANG} MALL MGMT 2026-10-29→2026-12-31 1`],
    "every weekend's row is the same booth: its fair, its brand, its place, its organiser and its own days, first to last")
  check(of(after, ANTHONY), ['2026-10-09 500', '2026-10-30 311', '2026-11-06 61', '2026-12-18 2229', '2026-12-25 2229'],
    'a fair ending on a Monday is one weekend, one open Monday to Thursday the weekend it opens in, one of twelve days both its weekends; a withdrawn booth none')
  check(after.filter(r => [311, 61, 500].includes(r.project)), before.filter(r => [311, 61, 500].includes(r.project)),
    'a booth of one weekend answers exactly what it answered')

  // Listed at two booths one weekend: the one they wrote the most bills at that week.
  check(of(after, ETHAN), [...WEEKENDS.filter(w => w !== '2026-11-27').map(w => `${w} 2289`), '2026-11-27 291'].sort(),
    "ETHAN's weekend of 27 Nov is MEGAHOME's — two bills there, one at the standing booth that week, though five there in all")
  const ethan = Object.fromEntries(after.filter(r => r.staff_id === ETHAN).map(r => [r.week, r]))
  check([ethan['2026-11-27'].fair_id, ethan['2026-11-27'].booths, ethan['2026-11-20'].booths], [M, 2, 1],
    'that weekend counts both booths, the others the standing one alone')
  // Take MEGAHOME's bills away and the standing booth's one bill of that week decides; none at either, the earlier booth.
  await q(`UPDATE sales_orders SET cancelled = true WHERE fair_event_id = $1`, [M])
  check((await weeks(ETHAN)).find(r => r.week === '2026-11-27').project, 2289, 'no bill at MEGAHOME: the standing booth, where one was written that week')
  await q(`UPDATE sales_orders SET cancelled = true WHERE order_date = '2026-11-24'`)
  check((await weeks(ETHAN)).find(r => r.week === '2026-11-27').project, 2289, 'none at either that week: the booth that opened first, as before')
  await q(`UPDATE sales_orders SET cancelled = false`)

  // A bill is its sale day's weekend: sold on 8 Nov and keyed on 13 Nov, it is the weekend of 6 Nov's.
  await booth(62, 'AKEMI', 'HOMELOVE', 'SUNWAY PYRAMID', '2026-11-06', '2026-11-08', [E])
  check((await weeks(ETHAN)).find(r => r.week === '2026-11-06').project, 2289,
    'listed at a second booth on 6 Nov with no bill there: the standing booth, for the bill sold there on the 8th')
  await q(`UPDATE sales_orders SET raw = raw #- '{fair,fairDate}' WHERE raw->'fair'->>'fairDate' = '2026-11-08'`)
  check((await weeks(ETHAN)).find(r => r.week === '2026-11-06').project, 2289, 'with no day named it is its order date’s, 13 Nov — no bill either side on 6 Nov: the booth that opened first')
  check((await weeks(SHELDON)).length, 9, 'a day that does not read, and one outside the booth’s days, break nothing')

  // The reader for one person; an unnamed seller is nobody's row.
  check((await weeks(SHELDON)).every(r => r.staff_id === SHELDON), true, 'asked for one person, only theirs')
  check(new Set(after.map(r => r.staff_id)).size, 3, 'somebody the portal cannot name is listed nowhere')

  // A booth with no end in sight is read a year of weekends at most.
  await booth(700, 'AKEMI', 'SHOWROOM', 'HQ SHOWROOM', '2026-01-05', '2029-12-31', [S])
  check((await weeks(SHELDON)).filter(r => r.project === 700).length <= 53, true, 'a booth of years: a year of weekends at most')

  // ── Production changed since: nothing is touched ───────────────────────────
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_erp_brand_weeks(p_sub_department uuid, p_staff uuid DEFAULT NULL::uuid)
    RETURNS TABLE(staff_id uuid, week date, erp_project_id bigint, fair_id uuid, brand text, venue text, venue_key text, organizer text, start_date date, end_date date, booths integer)
    LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
      SELECT NULL::uuid, NULL::date, NULL::bigint, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::date, NULL::date, NULL::integer WHERE false $f$`)
  await assert.rejects(() => db.exec(migration), /member_erp_brand_weeks\(uuid, uuid\) is md5 [0-9a-f]{32}, not the body this migration was written from/,
    'a changed body is refused')
  await db.exec('ROLLBACK')
  checks++

  console.log(`PASS: ${checks} booth-every-weekend checks. Production's bodies + 20261114050000 + the real migration 20261114060000 (twice); synthetic surroundings. No live database connection.`)
} finally {
  await db.close()
}

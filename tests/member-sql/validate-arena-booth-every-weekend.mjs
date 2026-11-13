// Local PostgreSQL regression for 20261114110000 — a booth open several weekends is ranked in the Arena weekend by
// weekend (2026-11-14; asked whether 2990s' standing booth should be, the user: "yes need by week as well").
//
// Production's bodies are loaded over stand-in tables: the fairs and brand weeks (fair-by-organiser-production.sql,
// then 20261114050000 and 20261114060000 verbatim — the chain production ran, md5-checked) and the Arena's history
// (arena-booth-weekend-production.sql, md5-checked); the migration then runs VERBATIM, twice. member_order_facts is a
// stand-in (each bill whole, cleared). The Arena reads the office's today, so the world is laid out around it: a
// standing booth that opened three weekends ago and runs five more, a fair of one weekend at its hall that first
// weekend, and one that ended on a Monday. Under test: the standing booth had no board and has one a weekend that is
// over, each holding the bills sold in it, its sellers scoring on the weekend's own brand week; a fair of one weekend
// is exactly as it was. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrationFile = name => new URL(`../../supabase/migrations/${name}`, import.meta.url)
const MIGRATION = migrationFile('20261114110000_arena_booth_every_weekend.sql')
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const read = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const FAIR = id(1)
const SCHEME = id(2)
const BATCH = id(12)
const TITLE = id(20)
const ETHAN = id(31)
const SHELDON = id(32)
const ANTHONY = id(33)
const JASON = id(34)
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
      cancelled boolean NOT NULL DEFAULT false, brand_code text, amount numeric NOT NULL DEFAULT 0,
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

    -- The Arena's roster.
    CREATE TABLE titles(id uuid PRIMARY KEY, name text, is_department_head boolean NOT NULL DEFAULT false);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, status text NOT NULL DEFAULT 'active', title_id uuid);
    CREATE TABLE comm_hierarchy(staff_id uuid NOT NULL, scheme_id uuid NOT NULL, title_id uuid,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    -- A stand-in for member_order_facts: each bill whole, its deposit cleared.
    CREATE FUNCTION member_order_facts(p_scheme uuid, p_from date, p_until date)
    RETURNS TABLE(order_id uuid, staff_id uuid, cleared boolean, revenue numeric) LANGUAGE sql STABLE AS
      $$ SELECT o.id, o.staff_id, true, o.amount FROM sales_orders o WHERE NOT o.cancelled $$;
  `)
  await db.exec('SET check_function_bodies = off')
  await db.exec(await read(new URL('./fair-by-organiser-production.sql', import.meta.url)))
  await db.exec('SET check_function_bodies = on')
  await db.exec(`
    CREATE UNIQUE INDEX uq_comm_organisers_key ON comm_organisers (organiser_key(name));
    CREATE TRIGGER comm_venue_events_canonical BEFORE INSERT OR UPDATE OF venue_key ON comm_venue_events
      FOR EACH ROW EXECUTE FUNCTION comm_venue_events_canonical();
    CREATE TRIGGER sales_orders_resolve_fair BEFORE INSERT OR UPDATE OF venue, order_date, fair_event_id, fair_source ON sales_orders
      FOR EACH ROW EXECUTE FUNCTION sales_orders_resolve_fair();
    INSERT INTO comm_agent_aliases(agent_key, staff_id, erp_salesperson_id) VALUES
      ('ethan', '${ETHAN}', 'sp-1'), ('sheldon tan', '${SHELDON}', 'sp-2'), ('anthony', '${ANTHONY}', 'sp-3'),
      ('jason', '${JASON}', 'sp-4');
    CREATE UNIQUE INDEX uq_comm_agent_aliases_erp_salesperson ON comm_agent_aliases (erp_salesperson_id) WHERE erp_salesperson_id IS NOT NULL;
    INSERT INTO titles VALUES ('${TITLE}', 'Revenue Specialist', false);
    INSERT INTO hr_staff_costs(id, employee_name, title_id) VALUES
      ('${ETHAN}', 'ETHAN', '${TITLE}'), ('${SHELDON}', 'SHELDON TAN', '${TITLE}'), ('${ANTHONY}', 'ANTHONY', '${TITLE}'),
      ('${JASON}', 'JASON', '${TITLE}');
    INSERT INTO comm_hierarchy(staff_id, scheme_id, title_id) VALUES
      ('${ETHAN}', '${SCHEME}', '${TITLE}'), ('${SHELDON}', '${SCHEME}', '${TITLE}'), ('${ANTHONY}', '${SCHEME}', '${TITLE}'),
      ('${JASON}', '${SCHEME}', '${TITLE}');
  `)

  // ── The chain production ran, then production's Arena ────────────────────
  const md5Of = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = to_regprocedure($1)`, [sig])
  const SIG = {
    weeks: 'public.member_erp_brand_weeks(uuid, uuid)',
    history: 'public.member_arena_booth_history_for_staff(uuid, uuid)',
    closes: 'public.member_arena_week_closes_on(date)',
  }
  for (const name of ['20261114050000_fair_by_organiser.sql', '20261114060000_booth_every_weekend.sql']) {
    await db.exec(await read(migrationFile(name)))
  }
  check(await md5Of(SIG.weeks), '1e03815e94580339bbcea0ce43aa01ff', 'the brand weeks are the body production runs (20261114060000)')
  await db.exec('SET check_function_bodies = off')
  await db.exec(await read(new URL('./arena-booth-weekend-production.sql', import.meta.url)))
  await db.exec('SET check_function_bodies = on')
  const PRODUCTION = { history: '1eb40a99a7c9cc10c133f6e52f64abb8', closes: 'fd03901a22ae3a7450989f998ee0bce2' }
  check(await md5Of(SIG.history), PRODUCTION.history, "the Arena's history is production's body")
  check(await md5Of(SIG.closes), PRODUCTION.closes, "and the week's close")

  // ── The world, around the office's today ─────────────────────────────────
  const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
  const monday = await one(`SELECT (date_trunc('week', ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::timestamp)::date)::text`)
  const day = n => new Date(Date.parse(`${monday}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const month = iso => iso.slice(0, 7)
  await q(`INSERT INTO sales_import_batches VALUES ($1, $2, $3, 'committed')`, [BATCH, FAIR, `${month(today)}-01`])

  const booth = async (project, brand, organiser, venue, start, end, staff = []) => {
    await q(`INSERT INTO erp_booths(erp_project_id, brand, brand_code, venue, venue_key, organizer, start_date, end_date)
             VALUES ($1, $2, upper($2), $3, venue_key($3), $4, $5, $6)`, [project, brand, venue, organiser, start, end])
    for (const [rep, sp, name] of staff) await q(`INSERT INTO erp_booth_staff VALUES ($1, $2, $3, NULL, $4)`, [project, rep, sp, name])
    return { projectId: project, brand, organizer: organiser, venue, startDate: start, endDate: end, status: 'confirmed' }
  }
  let n = 0
  const bill = async (staff, date, fair, amount, sold = undefined) => {
    const payload = sold === undefined ? fair : { ...fair, fairDate: sold }
    const fairId = await one(`SELECT erp_sync_fair($1::jsonb)`, [JSON.stringify(payload)])
    await q(`INSERT INTO sales_orders(batch_id, period_month, order_no, order_date, venue, staff_id, brand_code, amount,
                                      fair_event_id, fair_source, raw)
             VALUES ($1, $2, $3, $4, $5, $6, upper($7), $8, $9, 'erp', $10)`,
      [BATCH, `${month(date)}-01`, `B${++n}`, date, fair.venue, staff, fair.brand, amount, fairId, JSON.stringify({ fair: payload })])
    return fairId
  }
  const E = [1, 'sp-1', 'ETHAN'], S = [2, 'sp-2', 'SHELDON TAN'], A = [3, 'sp-3', 'ANTHONY']
  // A standing booth: the Thursday three weeks back to the Thursday five weeks on — eight weekends, the first three over.
  const standing = await booth(2289, '2990s Sofa', 'MALL MGMT', PENANG, day(-18), day(38), [E, S])
  // BIGHOME's three days at the same hall, its first weekend; a fair at Pisa ending on a Monday — each one weekend.
  const bighome = await booth(311, 'AKEMI', 'BIGHOME', PENANG, day(-17), day(-15), [A])
  const pisa = await booth(61, 'AKEMI', 'MEGAHOME', 'PISA SPICE ARENA', day(-10), day(-7), [A])

  // The standing booth's bills: each weekend's own.
  const G = await bill(ETHAN, day(-17), standing, 3000, day(-17))     // W1, sold on its Friday
  await bill(SHELDON, day(-16), standing, 4000)                       // W1, no day named
  await bill(SHELDON, day(-20), standing, 500)                        // keyed before the booth opened: W1's
  await bill(ETHAN, day(-12), standing, 2000)                         // W2
  await bill(ETHAN, day(-6), standing, 1500, day(-9))                 // sold on W2's Saturday, keyed in W3: W2's
  await bill(JASON, day(-13), standing, 1200)                         // W2, JASON on no Sales Attending
  await bill(ETHAN, day(-5), standing, 1000, 'soon')                  // a day that does not read: W3, its order date's
  await bill(SHELDON, day(-3), standing, 2500, '2025-01-01')          // none of the booth's days: W3, its order date's
  await bill(ETHAN, day(0), standing, 700)                            // this week's: W4
  const F = await bill(ANTHONY, day(-16), bighome, 5000)
  await bill(ETHAN, day(-16), bighome, 800)                           // off ETHAN's brand week: ranked, no points
  const P = await bill(ANTHONY, day(-9), pisa, 6000)
  check(new Set([G, F, P]).size, 3, 'three fairs: the standing booth, BIGHOME, Pisa')

  const historyOf = async () => await one(`SELECT member_arena_booth_history_for_staff($1, $2)`, [FAIR, SCHEME])
  const people = event => event.people.map(p => `${p.name} ${Number(p.sales)}${p.scoring ? '' : ' no points'}${p.source === 'auto' ? ' auto' : ''}`)
  const boards = h => h.events.map(e => `${e.fairId === G ? 'standing' : e.fairId === F ? 'bighome' : 'pisa'} ${e.start}…${e.end} week ${e.week}: ${people(e).join(', ')}`)

  // ── Before ─────────────────────────────────────────────────────────────────
  const before = await historyOf()
  check(boards(before), [
    `bighome ${day(-17)}…${day(-15)} week ${day(-17)}: ANTHONY 5000, ETHAN 800 no points`,
    `pisa ${day(-10)}…${day(-7)} week ${day(-10)}: ANTHONY 6000`,
  ], 'before: the standing booth has no board while it runs — only the fairs of one weekend that ended')

  // ── The migration, verbatim — twice ────────────────────────────────────────
  const migration = await read(MIGRATION)
  await db.exec(migration)
  await db.exec(migration)
  checks++
  const MAKES = Object.fromEntries([...migration.matchAll(/\('(public\.[^']+)',\s+'([0-9a-f]{32})', '([0-9a-f]{32})'\)/g)]
    .map(m => [m[1], { from: m[2], makes: m[3] }]))
  check(MAKES[SIG.history]?.from, PRODUCTION.history, "written from production's body")
  check(await md5Of(SIG.history), MAKES[SIG.history]?.makes, 'what stands is what the migration says it makes')
  check(await md5Of(SIG.closes), PRODUCTION.closes, "the week's close is untouched")

  const after = await historyOf()
  const sunday = today === day(6)
  check(boards(after), [
    `standing ${day(-18)}…${day(-15)} week ${day(-17)}: ETHAN 3000, SHELDON TAN 4500`,
    `bighome ${day(-17)}…${day(-15)} week ${day(-17)}: ANTHONY 5000, ETHAN 800 no points`,
    `standing ${day(-14)}…${day(-8)} week ${day(-10)}: ETHAN 3500, JASON 1200 auto`,
    `pisa ${day(-10)}…${day(-7)} week ${day(-10)}: ANTHONY 6000`,
    `standing ${day(-7)}…${day(-1)} week ${day(-3)}: ETHAN 1000, SHELDON TAN 2500`,
    ...(sunday ? [`standing ${day(0)}…${day(6)} week ${day(4)}: ETHAN 700`] : []),
  ], "a board a weekend that is over: each weekend's bills, its sellers scoring on that weekend's brand week")

  // A fair of one weekend: exactly as it was, to the last field.
  const oneWeekend = h => h.events.filter(e => e.fairId !== G)
  check(oneWeekend(after), oneWeekend(before), 'every board of a fair of one weekend is as it was — id, days, week, month, people')
  check(oneWeekend(after).map(e => e.id), [`${F}|AKEMI`, `${P}|AKEMI`], "their ids are the fair's and the booth's")

  // The standing booth's boards: ids, months, weeks.
  const weekends = after.events.filter(e => e.fairId === G)
  check(weekends.map(e => e.id), [day(-17), day(-10), day(-3), ...(sunday ? [day(4)] : [])].map(fri => `${G}|2990S SOFA|${fri}`),
    "a weekend's board is the fair's, the booth's and the weekend's Friday")
  check(weekends.map(e => e.periodMonth), [day(-17), day(-10), day(-3), ...(sunday ? [day(4)] : [])].map(month),
    "each in its Friday's month")
  check([...new Set(weekends.map(e => `${e.brand} · ${e.organizer}`))], ['2990S SOFA · MALL MGMT'], 'each the booth, under its organiser')

  // Who scores: the brand week of that weekend — the ERP's for ETHAN and SHELDON, guessed for JASON.
  const w2 = weekends[1]
  check(w2.people.map(p => [p.name, p.scoring, p.source]), [['ETHAN', true, 'erp'], ['JASON', true, 'auto']],
    "W2: ETHAN on the ERP's list, JASON guessed by his bills — both scoring")
  check([before.offWeekOrders, after.offWeekOrders], [1, 1], 'ranked without points: ETHAN at BIGHOME, before and after')
  check(after.unassignedOrders, before.unassignedOrders, 'bills with no fair: as before')

  // The brand weeks the app shows: the ERP's as before; JASON's guessed W2 once that weekend is over.
  const weekRows = h => h.weeks.map(w => `${w.staffId === ETHAN ? 'ETHAN' : w.staffId === SHELDON ? 'SHELDON' : w.staffId === JASON ? 'JASON' : 'ANTHONY'} ${w.week} ${w.source}`)
  check(weekRows(after).filter(r => !r.startsWith('JASON')), weekRows(before).filter(r => !r.startsWith('JASON')),
    "the ERP's brand weeks are as they were")
  check(weekRows(after).filter(r => r.startsWith('JASON')), [`JASON ${day(-10)} auto`], "JASON's guessed weekend, at the standing booth")
  check(after.weeks.find(w => w.staffId === JASON)?.fairId, G, 'at the standing booth')

  // ── Production changed since: nothing is touched ───────────────────────────
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_arena_booth_history_for_staff(p_sub_department uuid, p_scheme uuid)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$ BEGIN RETURN '{}'::jsonb; END $f$`)
  await assert.rejects(() => db.exec(migration),
    /member_arena_booth_history_for_staff\(uuid, uuid\) is md5 [0-9a-f]{32}, not the body this migration was written from/,
    'a changed body is refused')
  await db.exec('ROLLBACK')
  checks++
  check(await historyOf(), {}, 'and left as it was found')

  console.log(`PASS: ${checks} Arena booth-every-weekend checks. Production's bodies (md5-checked) + the chain 20261114050000 and 20261114060000 + the real migration 20261114110000 (twice); synthetic surroundings around the office's today. No live database connection.`)
} finally {
  await db.close()
}

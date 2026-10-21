// Local PostgreSQL regression for 20261021190000 (2026-10-21 — a SOFFIO quote of 1A(LHF) + 1A(RHF) + Console read 19.8%:
// the three modules at their own prices, though the Product List prices the set "1A(LHF) + 1A(RHF) + CONSOLE" at RM 2,140;
// the user: "if the sofa compartment that got match with the combo, it should use the combo costing to calculate").
// The ERP keeps that console as 8030-Console and a retired 8030-CONSOLE; the set was made on CONSOLE and the slot matcher
// compared codes exactly. Production's own bodies of catalogue_match_slots and catalogue_combos_collide — the repo's last
// copies, md5-checked against production's — are loaded over a stand-in catalogue_combos holding production's 8030 and
// R819 sets; the migration then runs VERBATIM, twice. What is under test: a slot's code takes a module whatever the case,
// on either side; every other answer of the matcher is what it was; two sets one bill could match — once case is ignored
// — collide; the migration refuses to land beside two such live sets; and what landed is the md5 the file names.
// No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const md5 = s => createHash('md5').update(s, 'utf8').digest('hex')
const migration = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

/** The last CREATE of a function in a migration: the whole statement, and its body (what pg_proc.prosrc holds). */
function lastFunction(sql, name) {
  const re = new RegExp(String.raw`create (?:or replace )?function (?:public\.)?` + name + String.raw`\s*\([\s\S]*?\bas\s+(\$\w*\$)`, 'gi')
  let m, found = null
  while ((m = re.exec(sql))) {
    const start = m.index + m[0].length
    const end = sql.indexOf(m[1], start)
    found = { statement: sql.slice(m.index, end + m[1].length) + ';', body: sql.slice(start, end) }
  }
  assert(found, `no CREATE FUNCTION ${name}`)
  return found
}

const PROD = { match: 'ca383219b703c0d15d9a72466cda3a66', collide: '162a457c511ac7cca35745e519379284' }
const LANDED = { match: 'c93e5bbc2c9d6a7ae714a82bce309c7a', collide: 'b4b63a260b2926ba503799aa7b8f914e' }
const MATCH = 'public.catalogue_match_slots(text[], jsonb)'
const COLLIDE = 'public.catalogue_combos_collide(jsonb, jsonb)'
const bodyMd5 = sig => one(`SELECT md5(replace(prosrc, E'\\r', '')) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])

// ── Production's bodies ─────────────────────────────────────────────────────
const match = lastFunction(await migration('20260924030000_catalogue_costs_the_margin'), 'catalogue_match_slots')
const collide = lastFunction(await migration('20261008040000_combo_exact_match'), 'catalogue_combos_collide')
check([md5(match.body), md5(collide.body)], [PROD.match, PROD.collide], "the repo's last copies are production's bodies")
await db.exec(match.statement)
await db.exec(collide.statement)
check([await bodyMd5(MATCH), await bodyMd5(COLLIDE)], [PROD.match, PROD.collide], 'loaded as production runs them')

// What a combo row needs for the migration's last check: production's 8030 and R819 sets (2026-10-21), the removed too.
await db.exec(`
  CREATE TABLE catalogue_combos (
    id         SERIAL PRIMARY KEY,
    base_model TEXT NOT NULL,
    modules    JSONB NOT NULL,
    slots_key  TEXT NOT NULL,
    label      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at TIMESTAMPTZ
  )`)
const addSet = (base, label, modules, removed = false) => q(
  `INSERT INTO catalogue_combos (base_model, label, modules, slots_key, removed_at)
   VALUES ($1, $2, $3::jsonb, $3, CASE WHEN $4 THEN now() END)`, [base, label, JSON.stringify(modules), removed])
const R = ['1A(R)(LHF)', '1A(R)(RHF)']
for (const [base, label, modules, removed] of [
  ['8030', '1S+2S+3S', [['1S'], ['2S'], ['3S']], true],
  ['8030', '1A+2A', [['1A(LHF)', '1A(RHF)'], ['2A(LHF)', '2A(RHF)']], true],
  ['8030', '1A(RHF) + 2A(LHF)', [['1A(RHF)'], ['2A(LHF)']], false],
  ['8030', '1S + 2S + 3S', [['1S'], ['2S'], ['3S']], false],
  ['8030', '1A(LHF) + 1A(RHF) + CONSOLE', [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']], false],
  ['8030', '1A(LHF) + 1A(RHF)', [['1A(LHF)'], ['1A(RHF)']], false],
  ['R819', '2R+Console', [R, R, ['Console']], false],
  ['R819', '2R+3R', [R, R, R, R, ['1NA']], false],
  ['R819', '1S+2S+3S', [['1S'], ['2S'], ['3S']], false],
]) await addSet(base, label, modules, removed)

const SOFFIO = JSON.stringify([['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']])
const slots = (built, set) => one(`SELECT catalogue_match_slots($1::text[], $2::jsonb)`, [built, set])
const collides = (a, b) => one(`SELECT catalogue_combos_collide($1::jsonb, $2::jsonb)`, [JSON.stringify(a), JSON.stringify(b)])

// Every answer the matcher gave before, on validate-catalogue's own inputs and a few more; none of them may move.
const SLOTS_1A_2A = JSON.stringify([['1A(LHF)', '1A(RHF)'], ['2A(LHF)', '2A(RHF)']])
const unchanged = () => q(`
  SELECT catalogue_match_slots(ARRAY['1A(LHF)','2A(RHF)','L(LHF)'], $1::jsonb) AS a,
         catalogue_match_slots(ARRAY['2A(RHF)','1A(LHF)'], $1::jsonb) AS b,
         catalogue_match_slots(ARRAY['1A(LHF)'], '[["1A(LHF)"],["1A(LHF)"]]') AS c,
         catalogue_match_slots(ARRAY['1A(LHF)','1A(LHF)'], '[["1A(LHF)"],["1A(LHF)"]]') AS d,
         catalogue_match_slots(ARRAY['X','Y'], '[["X","Y"],["X"]]') AS e,
         catalogue_match_slots(ARRAY['1A(LHF)','2A(RHF)'], '["1A(LHF)","2A(RHF)"]') AS f,
         catalogue_match_slots(ARRAY['1A(LHF)','L(LHF)'], $1::jsonb) AS g,
         catalogue_match_slots(ARRAY['A','B','C'], '[["A","B"],["A","C"]]') AS h,
         catalogue_match_slots(ARRAY['1A(LHF)'], '[["1A(LHF)"],[],[" "]]') AS i,
         catalogue_match_slots(ARRAY['A','B','C'], '[["A","C"],["A","B"]]') AS j,
         catalogue_match_slots(ARRAY['B','A','C','A'], '[["A","B"],["A"],["C","A"]]') AS k,
         catalogue_match_slots(ARRAY[' 1A ', NULL, ''], '[["1A"]]') AS l,
         catalogue_match_slots(ARRAY['1A','2A'], NULL) AS m,
         catalogue_match_slots(ARRAY['1A','2A'], '"2+L"') AS n`, [SLOTS_1A_2A])

// ── Before: the bug ─────────────────────────────────────────────────────────
check(await slots(['1A(LHF)', '1A(RHF)', 'Console'], SOFFIO), null, 'before: the SOFFIO quote never meets its CONSOLE set')
check(await collides([['1A(LHF)'], ['1A(RHF)'], ['Console']], JSON.parse(SOFFIO)), false, 'before: … + Console sits beside … + CONSOLE')
const before = await unchanged()

// ── The migration, twice ────────────────────────────────────────────────────
const file = await migration('20261021190000_combo_modules_ignore_case')
await db.exec(file)
check([await bodyMd5(MATCH), await bodyMd5(COLLIDE)], [LANDED.match, LANDED.collide], 'what landed is the md5 the file names')
await db.exec(file)
check([await bodyMd5(MATCH), await bodyMd5(COLLIDE)], [LANDED.match, LANDED.collide], 'a second run changes nothing')

// ── After ───────────────────────────────────────────────────────────────────
check(await slots(['1A(LHF)', '1A(RHF)', 'Console'], SOFFIO), [1, 2, 3], 'the SOFFIO quote is its CONSOLE set — every piece')
check(await slots(['Console', '1A(RHF)', '1A(LHF)'], SOFFIO), [1, 2, 3], '…in any order')
check(await slots(['1a(lhf)', ' 1A(RHF) ', 'console'], SOFFIO), [1, 2, 3], '…whatever the case on the bill, trimmed')
check(await slots(['1A(LHF)', '1A(RHF)', 'CONSOLE'], JSON.stringify([['1A(LHF)'], ['1A(RHF)'], ['Console']])), [1, 2, 3],
  '…and whatever the case in the set (a bill of the retired 8030-CONSOLE)')
check(await slots(['1A(LHF)', '1A(RHF)', 'Console', 'STOOL'], SOFFIO), [1, 2, 3],
  'a piece more still answers the three it covers — the costing then takes no combo (cardinality, catalogue_apply_combos)')
check(await slots(['1A(LHF)', '1A(RHF)'], SOFFIO), null, 'a piece less cannot fill the set')
check(await slots(['1A(LHF)', 'Console', 'Console'], SOFFIO), null, 'case never lets a module fill a slot of another code')
check(await unchanged(), before, 'every other answer of the matcher is what it was')

check(await collides([['1A(LHF)'], ['1A(RHF)'], ['Console']], JSON.parse(SOFFIO)), true, '… + Console and … + CONSOLE are one set for one bill')
check(await collides([['1a(r)(lhf)', '1A(R)(RHF)'], ['1NA']], [['1A(R)(LHF)'], ['1na']]), true, 'an either-side piece pairs whatever the case')
check(await collides([['1A(R)(LHF)'], ['1NA']], [['1A(R)(RHF)'], ['1NA']]), false, 'one side against the other still does not collide')
check(await collides([['3S'], ['2S']], [['3S'], ['2S'], ['1S']]), false, '3+2 and 3+2+1 still do not')
check(await collides([['2S'], ['3S']], [['3S'], ['2S']]), true, 'the same set in another order still does')

check(await q(`SELECT p.proname, p.provolatile, l.lanname, p.proconfig FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
                WHERE p.oid IN ($1::regprocedure, $2::regprocedure) ORDER BY p.proname`, [MATCH, COLLIDE]), [
  { proname: 'catalogue_combos_collide', provolatile: 'i', lanname: 'sql', proconfig: ['search_path=public'] },
  { proname: 'catalogue_match_slots', provolatile: 'i', lanname: 'plpgsql', proconfig: null },
], 'each keeps its language, IMMUTABLE and its search_path')

// ── It will not land beside two live sets one bill could match ──────────────
await addSet('8030', '1A(LHF) + 1A(RHF) + Console', [['1A(LHF)'], ['1A(RHF)'], ['Console']])
await assert.rejects(() => db.exec(file), /two live combo sets collide once case is ignored/, 'a Console set beside the CONSOLE one is refused')
checks++
await db.exec('ROLLBACK')
await q(`DELETE FROM catalogue_combos WHERE label = '1A(LHF) + 1A(RHF) + Console'`)
await db.exec(file)
check(await bodyMd5(MATCH), LANDED.match, 'with the clash gone it lands again')

console.log(`PASS: ${checks} combo-module SQL checks. Production's bodies verbatim; the migration verbatim, twice. No live database connection.`)

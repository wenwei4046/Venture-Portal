// Local PostgreSQL regression for the narrowly scoped IR recruitment change.
// The surrounding schema is synthetic; recruitment/rank/cycle/capacity and
// catalogue trigger bodies come from production migrations. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = new PGlite({ extensions: { btree_gist } })
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const ir = 'caeaf2eb-3931-40be-b3bd-b033814f8046', fair = id(1), other = id(2)
const rs = id(10), ta = id(11), parent = id(20), peer = id(21)
const newSql = await readFile(new URL('20260920020000_ir_specialist_downlines.sql', migrations), 'utf8')
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
const reject = async (sql, params, pattern) => { await assert.rejects(() => q(sql, params), pattern); checks++ }
const snapshot = table => one(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM ${table} r`)
async function productionFunction(migration, name) {
  const sql = await readFile(new URL(`${migration}.sql`, migrations), 'utf8')
  const match = new RegExp(`create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`, 'i').exec(sql)
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}
async function productionTrigger(migration, name) {
  const sql = await readFile(new URL(`${migration}.sql`, migrations), 'utf8')
  const match = new RegExp(`create trigger ${name}\\s[\\s\\S]*?;`, 'i').exec(sql)
  assert(match, `Missing production trigger ${name}`)
  await db.exec(match[0])
}
const permission = scheme => one('SELECT comm_title_can_recruit_in($1,$2)', [scheme, rs])
const membership = (scheme, staff, upline = null) => one(`
  INSERT INTO comm_hierarchy(scheme_id,staff_id,title_id,upline_staff_id,effective_from)
  VALUES ($1,$2,$3,$4,'2026-09-01') RETURNING id`, [scheme, staff, rs, upline])

try {
  await db.exec(`
    CREATE EXTENSION btree_gist;
    CREATE TABLE titles(id uuid PRIMARY KEY, name text);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text);
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, scheme_name text, direct_line_limit integer,
      override_depth integer DEFAULT 2, group_sales_depth integer DEFAULT 2,
      enable_override boolean DEFAULT true, enable_group_incentive boolean DEFAULT true);
    CREATE TABLE comm_rank_defs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid REFERENCES comm_schemes(id),
      product_rate numeric, group_incentive_amount numeric DEFAULT 0, group_subsidy_cap numeric DEFAULT 0,
      label text, sort_order integer);
    CREATE TABLE comm_ranks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid REFERENCES comm_schemes(id),
      title_id uuid REFERENCES titles(id), rank_def_id uuid REFERENCES comm_rank_defs(id), rank_key text,
      can_recruit boolean NOT NULL, product_rate numeric, group_incentive_amount numeric DEFAULT 0,
      group_subsidy_cap numeric DEFAULT 0, label text, sort_order integer,
      personal_sales_threshold numeric, consecutive_months integer, group_sales_threshold numeric,
      UNIQUE(scheme_id,rank_key));
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scheme_id uuid NOT NULL REFERENCES comm_schemes(id), staff_id uuid NOT NULL REFERENCES hr_staff_costs(id),
      title_id uuid REFERENCES titles(id), upline_staff_id uuid REFERENCES hr_staff_costs(id),
      rank_id uuid NOT NULL REFERENCES comm_ranks(id), effective_from date NOT NULL, effective_to date,
      CONSTRAINT not_own_upline CHECK (upline_staff_id IS DISTINCT FROM staff_id),
      CONSTRAINT effective_window CHECK (effective_to IS NULL OR effective_to >= effective_from),
      CONSTRAINT one_position_per_scheme EXCLUDE USING gist (
        scheme_id WITH =, staff_id WITH =, daterange(effective_from,effective_to,'[]') WITH &&));
    CREATE TABLE comm_direct_line_entitlements(scheme_id uuid, staff_id uuid, opened_direct_line_limit integer);
  `)
  await productionFunction('20260911010000_commission_rank_packages', 'comm_ranks_follow_rank_def')
  await productionTrigger('20260905060000_rank_catalog', 'comm_ranks_follow_rank_def')
  await productionFunction('20260910120000_one_line_commission_positions', 'comm_floor_rank')
  await productionFunction('20260910160000_memberships_per_sub_department', 'comm_title_can_recruit_in')
  await productionFunction('20260910160000_memberships_per_sub_department', 'comm_hierarchy_rank_follows_title')
  await productionTrigger('20260910160000_memberships_per_sub_department', 'comm_hierarchy_rank_follows_title')
  await productionFunction('20260831010000_revenue_commission_foundation', 'comm_hierarchy_reject_cycle')
  await productionTrigger('20260831010000_revenue_commission_foundation', 'trg_comm_hierarchy_reject_cycle')
  await productionFunction('20260911060000_progressive_ir_direct_lines', 'comm_effective_direct_line_limit')
  await productionFunction('20260911060000_progressive_ir_direct_lines', 'comm_hierarchy_direct_line_limit')
  await productionTrigger('20260911040000_commission_direct_line_limits', 'comm_hierarchy_direct_line_limit')

  // The installation-specific migration safely skips installations without IR.
  await db.exec(newSql)
  check(await snapshot('comm_ranks'), [])
  await q('INSERT INTO titles VALUES ($1,$2),($3,$4)', [rs, 'Revenue Specialist', ta, 'Team Assistant'])
  for (let number = 20; number <= 27; number++)
    await q('INSERT INTO hr_staff_costs VALUES ($1,$2)', [id(number), `Specialist ${number}`])
  await q('INSERT INTO comm_schemes(id,scheme_name,direct_line_limit) VALUES ($1,$2,3),($3,$4,NULL),($5,$6,3)',
    [ir, 'IR', fair, 'Fair', other, 'Other scheme'])
  for (const [scheme, title, key, rate, recruit, sort] of [
    [ir, rs, 'rs_3', 0.03, false, 10], [ir, ta, 'ta_3_5', 0.035, true, 20],
    [fair, rs, 'rs_5', 0.05, false, 10], [fair, ta, 'ta_7', 0.07, true, 20],
    [other, rs, 'rs_3', 0.03, false, 10],
  ]) await q(`INSERT INTO comm_ranks(scheme_id,title_id,rank_key,product_rate,can_recruit,label,sort_order)
    VALUES ($1,$2,$3,$4,$5,$3,$6)`, [scheme, title, key, rate, recruit, sort])
  const irPosition = await membership(ir, parent)
  await membership(fair, parent)
  await membership(fair, peer)
  const membershipsBefore = await snapshot('comm_hierarchy')
  const ranksBefore = await snapshot('comm_ranks')
  const defsBefore = await snapshot('comm_rank_defs')
  const schemesBefore = await snapshot('comm_schemes')
  const titlesBefore = await snapshot('titles')
  const rosterBefore = await snapshot('hr_staff_costs')
  check(await permission(ir), false)
  check(await permission(fair), false)
  check(await permission(other), false)

  await db.exec(newSql)
  check(await permission(ir), true)
  check(await permission(fair), false)
  check(await permission(other), false)
  check(await snapshot('comm_ranks'), ranksBefore.map(rank => rank.scheme_id === ir && rank.rank_key === 'rs_3'
    ? { ...rank, can_recruit: true } : rank))
  check(await snapshot('comm_rank_defs'), defsBefore)
  check(await snapshot('comm_schemes'), schemesBefore)
  check(await snapshot('comm_hierarchy'), membershipsBefore)
  check(await snapshot('titles'), titlesBefore)
  check(await snapshot('hr_staff_costs'), rosterBefore)
  const ranksAfter = await snapshot('comm_ranks')
  await db.exec(newSql)
  check(await snapshot('comm_ranks'), ranksAfter)
  check(await snapshot('comm_hierarchy'), membershipsBefore)

  // Same-title IR links work through the actual membership triggers. Their
  // attained rank/rate stay unchanged; permission alone does not promote them.
  const peerPosition = await membership(ir, peer, parent)
  const sameTitle = await q(`SELECT staff_id,title_id,rank_id,upline_staff_id FROM comm_hierarchy
    WHERE id IN ($1,$2) ORDER BY staff_id`, [irPosition, peerPosition])
  check(sameTitle[0].title_id, rs)
  check(sameTitle[1].title_id, rs)
  check(sameTitle[1].rank_id, sameTitle[0].rank_id)
  check(sameTitle[1].upline_staff_id, parent)
  check(await one('SELECT product_rate FROM comm_ranks WHERE id=$1', [sameTitle[0].rank_id]), '0.03')
  await reject('UPDATE comm_hierarchy SET upline_staff_id=$2 WHERE id=$1', [irPosition, peer], /cyclic/)
  check(await one('SELECT upline_staff_id FROM comm_hierarchy WHERE id=$1', [irPosition]), null)
  await membership(ir, id(25), peer)
  await reject('UPDATE comm_hierarchy SET upline_staff_id=$2 WHERE id=$1', [irPosition, id(25)], /cyclic/)
  check(await one('SELECT upline_staff_id FROM comm_hierarchy WHERE id=$1', [irPosition]), null)
  await membership(ir, id(22), parent)
  await membership(ir, id(23), parent)
  const beforeFourth = await snapshot('comm_hierarchy')
  await assert.rejects(() => membership(ir, id(24), parent), error => error.code === '23CAP')
  checks++
  check(await snapshot('comm_hierarchy'), beforeFourth)
  check(await one('SELECT count(*)::integer FROM comm_hierarchy WHERE scheme_id=$1 AND upline_staff_id=$2', [ir, parent]), 3)
  check(await one("SELECT comm_effective_direct_line_limit($1,$2,'2026-09-01')", [ir, parent]), 3)
  check(await one("SELECT comm_effective_direct_line_limit($1,$2,'2026-09-01')", [fair, parent]), null)
  check(await one('SELECT count(*)::integer FROM comm_direct_line_entitlements'), 0)
  check((await snapshot('comm_hierarchy')).filter(position => position.scheme_id === fair),
    membershipsBefore.filter(position => position.scheme_id === fair))
  check(await snapshot('comm_rank_defs'), defsBefore)
  check(await snapshot('comm_schemes'), schemesBefore)

  // Two sub-departments may legitimately give the same people opposite lines:
  // Fair 26 -> 27 (Team Assistant), IR 27 -> 26 (both Specialists). Combining
  // the schemes would invent a cycle that exists in neither reporting tree.
  await one(`INSERT INTO comm_hierarchy(scheme_id,staff_id,title_id,effective_from)
    VALUES ($1,$2,$3,'2026-09-01') RETURNING id`, [fair, id(27), ta])
  await membership(fair, id(26), id(27))
  await membership(ir, id(26))
  const oppositeIR = await membership(ir, id(27), id(26))
  check(await one('SELECT upline_staff_id FROM comm_hierarchy WHERE id=$1', [oppositeIR]), id(26))
  check(await one('SELECT upline_staff_id FROM comm_hierarchy WHERE scheme_id=$1 AND staff_id=$2', [fair, id(26)]), id(27))

  // The checkpoint guard fails clearly if the expected rung's title changes.
  await q('UPDATE comm_ranks SET title_id=$2,can_recruit=false WHERE scheme_id=$1 AND rank_key=$3', [ir, ta, 'rs_3'])
  const changedLadder = await snapshot('comm_ranks')
  await assert.rejects(() => db.exec(newSql), /IR Revenue Specialist rung has changed/)
  checks++
  check(await snapshot('comm_ranks'), changedLadder)
  console.log(`PASS: ${checks} IR specialist downline SQL checks. Scoped recruitment, unchanged Fair/rates/memberships, real rank/cycle/capacity triggers; no live database connection.`)
} finally {
  await db.close()
}

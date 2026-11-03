import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KEY_ACTIONS } from './permission-actions'
import { READS_BY_BUCKET_POLICY, READS_WITHOUT_ACTION, TABLE_READS, tableReadRows } from './permission-table-reads'
import { TABLE_WRITES } from './permission-table-writes'
import { DEFINER_RPCS, INVOKER_READS, INVOKER_VIEWS, functionScopes, policyNeeds, readNeeds, type Need } from '@/test/read-paths'

// PR3d (2026-10-09): every table a domain policy opens asks may_read(table)
// in a restrictive policy — the caller must hold one of TABLE_READS[table].
// These tests hold that list to every way the app reads the table, so a page
// keeps reading what it read. When one fails:
//   a page / action reads a registered table behind a gate the table does not
//   list → add the gate's action to TABLE_READS[table] AND to
//   permission_table_reads in a new migration (then permission_reads_guard).

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations')
const THIS_MIGRATION = '20261009080000_reads_ask_for_the_action.sql'
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const sqlOf = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/\r\n/g, '\n')

const RANK: Readonly<Record<string, number>> = { own: 0, dept: 1, all: 2 }
const parse = (w: string) => {
  const [fa, scope = 'all'] = w.split(':')
  return { fa, rank: RANK[scope] ?? 2 }
}
/** Somebody who holds `held` passes has_any_action(list). */
const passes = (held: string, list: readonly string[]) => {
  const h = parse(held)
  return list.some(a => {
    const x = parse(a)
    return x.fa === h.fa && h.rank >= x.rank
  })
}
/** One gate of the path whose every way through is a listed action: whoever passed can read. */
const covered = (n: Need, list: readonly string[]) =>
  n.gates.length === 0 || n.gates.some(g => g.wants.length > 0 && g.wants.every(w => passes(w, list)))

describe('TABLE_READS', () => {
  it('is the migrations’ permission_table_reads, row for row', () => {
    const rows = new Map<string, string[]>()
    for (const f of files) {
      const sql = sqlOf(f)
      for (const m of sql.matchAll(/INSERT INTO public\.permission_table_reads[^;]*;/g)) {
        for (const r of m[0].matchAll(/\('([a-z_0-9]+)', ARRAY\[([^\]]*)\]\)/g)) {
          rows.set(r[1], [...r[2].matchAll(/'([^']+)'/g)].map(a => a[1]))
        }
      }
      // A table that went takes its row with it (2026-10-31, Open Bill's three).
      for (const m of sql.matchAll(/DELETE FROM public\.permission_table_reads\s+WHERE table_name IN \(([^)]*)\);/g)) {
        for (const t of m[1].matchAll(/'([^']+)'/g)) rows.delete(t[1])
      }
    }
    const twin = new Map(tableReadRows().map(r => [r.table, r.actions as string[]]))
    expect(rows.size).toBeGreaterThan(120)
    expect(Object.fromEntries([...twin].sort())).toEqual(Object.fromEntries([...rows].sort()))
  })

  it('asks only for actions a key can give', () => {
    const given = new Set<string>(Object.values(KEY_ACTIONS).flat())
    const asked = new Set(tableReadRows().flatMap(r => r.actions.map(a => a.split(':')[0])))
    expect([...asked].filter(fa => !given.has(fa))).toEqual([])
  })

  it('asks for a reach only where the function has it', () => {
    const scopes = new Map(Object.entries(functionScopes()))
    expect(scopes.size).toBeGreaterThan(20)
    const reaches = tableReadRows().flatMap(r => r.actions.filter(a => a.includes(':')))
    expect(reaches.filter(a => {
      const [fa, scope] = a.split(':')
      return !(scopes.get(fa.split('.')[0]) ?? []).includes(scope)
    })).toEqual([])
  })

  it('lets every writer of a table read the rows it changes (UPDATE / DELETE … WHERE, RETURNING)', () => {
    const missing = Object.entries(TABLE_WRITES).flatMap(([table, commands]) => {
      const list = TABLE_READS[table]
      if (!list) return []
      return Object.values(commands).flat().filter(w => w && !passes(w, list)).map(w => `${table}: ${w}`)
    })
    expect(missing).toEqual([])
  })

  it('names its exceptions where the migration’s guard does', () => {
    const guard = sqlOf(THIS_MIGRATION)
    const listed = /AND p\.tablename NOT IN \(([^)]*)\)/.exec(guard)?.[1] ?? ''
    expect([...listed.matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]).sort()).toEqual(Object.keys(READS_WITHOUT_ACTION).sort())
    expect(Object.keys(READS_WITHOUT_ACTION).filter(t => t in TABLE_READS)).toEqual([])
  })

  it('a later migration that opens a table to a domain for reading registers it', () => {
    const later = files.filter(f => f > THIS_MIGRATION)
    const opened = later.flatMap(f => [...sqlOf(f).matchAll(
      /CREATE POLICY\s+\S+\s+ON\s+(?:public\.)?([a-z_0-9]+)(?:\s+AS\s+PERMISSIVE)?\s+FOR\s+(?:SELECT|ALL)\b[^;]*?\b(?:has_scope|has_perm)\(/gi,
    )].map(m => m[1]))
    expect(opened.filter(t => !(t in TABLE_READS) && !(t in READS_WITHOUT_ACTION) && !(t in READS_BY_BUCKET_POLICY))).toEqual([])
  })

  it('a table read by its buckets’ own policies is not registered as well', () => {
    expect(Object.keys(READS_BY_BUCKET_POLICY).filter(t => t in TABLE_READS || t in READS_WITHOUT_ACTION)).toEqual([])
  })

  it('a later view reads under the caller’s own policies', () => {
    const later = files.filter(f => f > THIS_MIGRATION)
    const views = later.flatMap(f => [...sqlOf(f).matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?([a-z_0-9]+)([^;]*)/gi)]
      .filter(m => !/security_invoker\s*=\s*(?:true|on)/i.test(m[2]))
      .map(m => `${f}: ${m[1]}`))
    expect(views).toEqual([])
  })
})

describe('the app’s reads', () => {
  const { needs, loose, sites } = readNeeds()

  it('finds them', () => {
    expect(sites.filter(s => s.table).length).toBeGreaterThan(1000)
    expect(needs.length).toBeGreaterThan(2000)
  })

  it('every read reaches a gate, or is written down why it needs none (read-paths.ts)', () => {
    const registered = loose.filter(l => l.table in TABLE_READS || l.table === '(dynamic)')
    expect(registered.map(l => `${l.table} ← ${l.root} (${l.source})`)).toEqual([])
  })

  it('whoever gets through a read’s gates holds an action the table asks for', () => {
    const misses = needs
      .filter(n => n.table in TABLE_READS && !covered(n, TABLE_READS[n.table]))
      .map(n => `${n.source} ${n.table}: ${n.gates.map(g => g.text).join(' & ')}`)
    expect([...new Set(misses)]).toEqual([])
  })

  it('a row policy that reads another table: whoever it is asked for can read that one too', () => {
    const misses = policyNeeds(TABLE_READS as Record<string, readonly string[]>)
      .filter(n => n.table in TABLE_READS && !covered(n, TABLE_READS[n.table]))
      .map(n => `${n.source} → ${n.table}`)
    expect(misses).toEqual([])
  })

  it('every function the app calls is known to run as the caller (INVOKER_READS) or as its owner (DEFINER_RPCS)', () => {
    const unknown = [...new Set(sites.flatMap(s => (s.rpc ? [s.rpc] : [])))]
      .filter(name => !(name in INVOKER_READS) && !DEFINER_RPCS.has(name))
    expect(unknown.sort()).toEqual([])
  })

  it('every view it reads is known, with the tables it reads (INVOKER_VIEWS)', () => {
    const views = new Set(files.flatMap(f =>
      [...sqlOf(f).matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?([a-z_0-9]+)/gi)].map(m => m[1].toLowerCase())))
    expect(views.size).toBeGreaterThan(5)
    const read = new Set(sites.flatMap(s => [s.table ?? '', ...(s.embeds ?? [])]).filter(t => views.has(t)))
    expect([...read].filter(v => !(v in INVOKER_VIEWS)).sort()).toEqual([])
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { PAGE_TABS } from '@/lib/page-tabs'
import { PERMISSION_TABS, TAB_ACTIONS } from '@/lib/permission-tabs'
import { sourceFiles } from './write-pages-scan'

/**
 * Plan C's database side (2026-10-11): what the tab registry looks like in the
 * database, which DEFINER writes ask their pages there, and which writes the
 * app's gates narrow — read by tab-write-guards.test.ts.
 */

const TABS = PAGE_TABS as Record<string, readonly string[]>
const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations')
const migrationFiles = () => readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const sqlOf = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/\r\n/g, '\n')

/** `permission_page_tabs` as the registry says it: each page and each tab it lists. */
export const pageTabRows = (): string[] =>
  Object.entries(TABS).flatMap(([page, tabs]) => tabs.map(t => `${page} ${t}`)).sort()

/** `permission_tab_cells`: each box (tab · action) and each cell it opens. */
export const tabCellRows = (): string[] =>
  PERMISSION_TABS.flatMap(t => TAB_ACTIONS.flatMap(a => (t.opens[a] ?? []).map(c => `${t.id} ${a} ${c}`))).sort()

/**
 * The rows of the latest migration that seeds this table whole (it empties it first), less the tabs a later
 * migration deleted by name (`DELETE FROM public.<table> WHERE tab_id IN (…);` — 20261017160000, which could not
 * seed whole: production holds the Leads tabs another branch applied, 2026-10-16).
 */
export function seededRows(table: 'permission_page_tabs' | 'permission_tab_cells'): { file: string; rows: string[] } | null {
  let found: { file: string; rows: string[] } | null = null
  const rowsOf = (values: string) => [...values.matchAll(/\(([^)]*)\)/g)].map(m => [...m[1].matchAll(/'([^']*)'/g)].map(v => v[1]).join(' '))
  for (const f of migrationFiles()) {
    const sql = sqlOf(f)
    const insert = new RegExp(`INSERT INTO public\\.${table} \\([^)]*\\) VALUES([\\s\\S]*?);`).exec(sql)
    if (insert && sql.includes(`DELETE FROM public.${table};`)) {
      found = { file: f, rows: rowsOf(insert[1]).sort() }
    } else if (insert) {
      // Rows added BY NAME over the last whole seed (2026-10-20, IT requests' tab): production's registry holds rows main
      // does not (the Leads tabs), so a new tab's rows go in `… ON CONFLICT DO NOTHING` instead of a whole reseed.
      if (!/ON CONFLICT DO NOTHING\s*$/.test(insert[1]) || !found) throw new Error(`${f} seeds ${table} without emptying it first`)
      found = { file: f, rows: [...new Set([...found.rows, ...rowsOf(insert[1].replace(/ON CONFLICT DO NOTHING\s*$/, ''))])].sort() }
    }
    if (!found) continue
    for (const m of sql.matchAll(new RegExp(`DELETE FROM public\\.${table}\\s+WHERE tab_id IN \\(([^)]*)\\);`, 'g'))) {
      const gone = new Set([...m[1].matchAll(/'([^']*)'/g)].map(v => v[1]))
      // A page tab's row is `page tab`; a cell's, `tab action cell`.
      const tabOf = (row: string) => (table === 'permission_page_tabs' ? row.slice(row.lastIndexOf(' ') + 1) : row.split(' ')[0])
      found = { file: f, rows: found.rows.filter(row => !gone.has(tabOf(row))) }
    }
  }
  return found
}

/**
 * A DEFINER write that asks its pages: one gate (`pages` — or a choice between
 * `branches` by what it writes — and the `wants` its own check asks), or several
 * gates that ask different things (`sites`, each 'pages|actions').
 */
export type Guard = {
  fn: string
  sig: string
  pages: string[]
  branches: string[][]
  wants: string[]
  sites: Array<{ pages: string[]; wants: string[] }> | null
  file: string
}

const quoted = (s: string) => [...s.matchAll(/'([^']*)'/g)].map(v => v[1])

const sameSig = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase()

/**
 * Every `pg_temp.tab_guard(…)` / `pg_temp.tab_guard_sites(…)` in the migrations —
 * less the functions a later statement drops, whose guard goes with them
 * (HOUZS Venture's transfer and undo, mig 20261013233000).
 */
export function guards(): Guard[] {
  const out = new Map<string, Guard>()
  for (const f of migrationFiles()) {
    const sql = sqlOf(f)
    // The file's statements in its own order: a function dropped and guarded again stays guarded.
    const steps: Array<{ at: number; run: () => void }> = []
    for (const m of sql.matchAll(/SELECT pg_temp\.tab_guard\('public\.(\w+)\(([^)]*)\)',\s*\$\$([\s\S]*?)\$\$,\s*ARRAY\[([^\]]*)\]\)/g)) {
      // A choice between pages (CASE … THEN ARRAY[…] ELSE ARRAY[…] END) — each ARRAY a branch.
      const branches = [...m[3].matchAll(/ARRAY\[((?:\s*'[^']*'\s*,?)*)\s*\]/g)].map(b => quoted(b[1]))
      steps.push({ at: m.index!, run: () => out.set(m[1], { fn: m[1], sig: `${m[1]}(${m[2]})`, pages: [...new Set(branches.flat())].sort(), branches, wants: quoted(m[4]), sites: null, file: f }) })
    }
    for (const m of sql.matchAll(/SELECT pg_temp\.tab_guard_sites\('public\.(\w+)\(([^)]*)\)',\s*ARRAY\[((?:\s*'[^']*',?)*)\s*\]\)/g)) {
      const sites = quoted(m[3]).map(s => {
        const [pages, wants] = s.split('|')
        return { pages: pages.split(','), wants: wants.split(',') }
      })
      steps.push({
        at: m.index!,
        run: () => out.set(m[1], {
          fn: m[1],
          sig: `${m[1]}(${m[2]})`,
          pages: [...new Set(sites.flatMap(s => s.pages))].sort(),
          branches: sites.map(s => s.pages),
          wants: [...new Set(sites.flatMap(s => s.wants))],
          sites,
          file: f,
        }),
      })
    }
    // A drop in a comment drops nothing; blanking keeps every position where it was.
    const code = sql.replace(/--[^\n]*/g, c => ' '.repeat(c.length))
    for (const m of code.matchAll(/DROP FUNCTION (?:IF EXISTS )?public\.(\w+)\(([^)]*)\)/gi)) {
      steps.push({ at: m.index!, run: () => { if (sameSig(out.get(m[1])?.sig ?? '', `${m[1]}(${m[2]})`)) out.delete(m[1]) } })
    }
    steps.sort((a, b) => a.at - b.at).forEach(s => s.run())
  }
  return [...out.values()]
}

// ── Which boxes stand for a cell, and when a gate on some pages narrows it ──

const BOXES = new Map<string, string[]>()
for (const t of PERMISSION_TABS) for (const a of TAB_ACTIONS) for (const c of t.opens[a] ?? []) {
  if (!BOXES.has(c)) BOXES.set(c, [])
  BOXES.get(c)!.push(`${t.id}.${a}`)
}
const WRITES = new Set(['create', 'edit', 'approve', 'void', 'manage'])
const boxesOn = (page: string, cell: string) =>
  (BOXES.get(cell) ?? []).filter(b => TABS[page]?.includes(b.slice(0, b.lastIndexOf('.'))))

/**
 * Can a write offered on these pages ever be closed while its cell is still held?
 * Only when every page has a box for the cell (a page with none keeps it as held)
 * and some box for it stands on another page (else closing them all takes the cell
 * itself away, which the database already refuses).
 */
export function narrows(pages: readonly string[], want: string): boolean {
  const cell = want.split(':')[0]
  if (!WRITES.has(cell.split('.')[1]) || pages.length === 0) return false
  if (pages.some(p => boxesOn(p, cell).length === 0)) return false
  const on = new Set(pages.flatMap(p => boxesOn(p, cell)))
  return (BOXES.get(cell) ?? []).some(b => !on.has(b))
}

/** What the queue's own and each domain's Approve stand for (requireApproverOn). */
export const APPROVER_WANTS = ['approvals.approve', 'treasury.approve', 'hr_costing.approve', 'director_salary.approve']

export type RpcSite = { rpc: string; at: string; pages: string[]; wants: string[] }

/**
 * Each database function a gated Server Action calls (`.rpc('x')`, `(….rpc as any)('x')`,
 * or a local helper handed its name), with the pages and actions of the gate it
 * stands behind. A helper with no gate of its own counts for the gated functions
 * of its file that call it, two steps deep.
 */
export function rpcSites(): RpcSite[] {
  const GATES = new Set(['requireActionOn', 'requireAnyActionOn', 'requirePayrollPayoutsActionOn', 'requireApproverOn'])
  const out: RpcSite[] = []
  for (const { path, file, text } of sourceFiles()) {
    if (!/rpc|\bcall\(/.test(text) || !/requireA|requireP/.test(text)) continue
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    type Fn = { pages: Set<string>; wants: Set<string>; rpcs: Set<string>; calls: Set<string> }
    const fns = new Map<string, Fn>()
    const fnOf = (name: string) => fns.get(name) ?? (fns.set(name, { pages: new Set(), wants: new Set(), rpcs: new Set(), calls: new Set() }), fns.get(name)!)
    const top = (n: ts.Node): string => {
      let cur: ts.Node | undefined = n
      let name = '(module)'
      while (cur) {
        if (ts.isFunctionDeclaration(cur) && cur.name) name = cur.name.text
        else if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name) && cur.initializer && (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))) name = cur.name.text
        cur = cur.parent
      }
      return name
    }
    const strip = (x: ts.Node | undefined) => {
      let a = x
      while (a && (ts.isAsExpression(a) || ts.isParenthesizedExpression(a) || ts.isTypeAssertionExpression(a))) a = a.expression
      return a
    }
    const literals = (x: ts.Node | undefined): string[] => {
      const found: string[] = []
      const grab = (n: ts.Node) => { if (ts.isStringLiteral(n)) found.push(n.text); ts.forEachChild(n, grab) }
      if (x) grab(x)
      return found
    }
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const here = fnOf(top(n))
        const callee = strip(n.expression)!
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
        if (GATES.has(name)) {
          literals(n.arguments[0]).filter(p => p.startsWith('/')).forEach(p => here.pages.add(p))
          if (name === 'requireApproverOn') APPROVER_WANTS.forEach(w => here.wants.add(w))
          else if (name === 'requireActionOn') {
            const fn = literals(n.arguments[1])[0]
            // An action chosen by what it writes (`candidate ? 'edit' : 'create'`) asks each.
            for (const action of literals(n.arguments[2])) if (fn) here.wants.add(`${fn}.${action}`)
          } else {
            for (const a of n.arguments.slice(1)) {
              const [fn, action] = literals(a)
              if (fn && action) here.wants.add(`${fn}.${action}`)
            }
          }
        } else {
          const first = strip(n.arguments[0])
          if (first && ts.isStringLiteral(first) && /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(first.text) && (name === 'rpc' || ts.isIdentifier(callee))) here.rpcs.add(first.text)
          if (ts.isIdentifier(callee)) here.calls.add(callee.text)
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
    for (const [name, fn] of fns) {
      if (!fn.pages.size) continue
      const reach = new Set([name])
      for (let i = 0; i < 2; i++) for (const r of [...reach]) for (const c of fns.get(r)?.calls ?? []) if (fns.has(c) && !fns.get(c)!.pages.size) reach.add(c)
      for (const r of reach) for (const rpc of fns.get(r)!.rpcs) {
        out.push({ rpc, at: `${file}#${name}${r === name ? '' : ` › ${r}`}`, pages: [...fn.pages].sort(), wants: [...fn.wants].sort() })
      }
    }
  }
  return out
}

/** Pages compared by what they narrow by: their tabs. */
export const tabsOf = (pages: Iterable<string>) => [...new Set([...pages].map(p => [...(TABS[p] ?? [`?${p}`])].sort().join(',')))].sort()

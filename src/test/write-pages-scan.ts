import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { PAGE_TABS } from '@/lib/page-tabs'

/**
 * Where each write is offered (2026-10-11, plan C): for every gated Server Action,
 * the pages whose screens import it — through their components, never through a
 * type-only import — and the pages its gate names. write-pages.test.ts holds the
 * two equal; the database's guards name the same pages (tab-write-guards.test.ts).
 */
export type WriteSite = {
  file: string
  fn: string
  /** The portal pages whose screens use the action (the nearest registered page of each route). */
  used: string[]
  /** The pages its gates name. */
  named: string[]
  /** A gate choosing its page by what the write is about (`kind === 'loan' ? … : …`). */
  choice: boolean
}

const SRC = resolve(process.cwd(), 'src')
const TABS = PAGE_TABS as Record<string, readonly string[]>
const rel = (path: string) => path.slice(SRC.length + 1).split(sep).join('/')

/** A gate, and its first argument: the page, a list of pages, or a choice between two. */
export const WRITE_GATE = /\b(requireActionOn|requireAnyActionOn|requirePayrollPayoutsActionOn|requireApproverOn)\(\s*(\[(?:\s*'[^']*'\s*,?)*\s*\]|(?:'[^']*'|[^,')])+)/g
export const pagesIn = (arg: string) => [...arg.matchAll(/'(\/[^']*)'/g)].map(p => p[1])

export function sourceFiles(): Array<{ path: string; file: string; text: string }> {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return walk(path)
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
    })
  return walk(SRC).map(path => ({ path, file: rel(path), text: readFileSync(path, 'utf8') }))
}

export function scanWriteSites(): WriteSite[] {
  const sources = sourceFiles()
  const resolveImport = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
    if (!base) return null
    for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c)) return c
    return null
  }
  // Who imports what at run time (by name, or the whole module). A type-only import carries no code.
  const importers = new Map<string, Array<{ from: string; names: Set<string> | null }>>()
  const add = (target: string | null, from: string, names: Set<string> | null) => {
    if (!target) return
    if (!importers.has(target)) importers.set(target, [])
    importers.get(target)!.push({ from, names })
  }
  for (const { path, text } of sources) {
    for (const m of text.matchAll(/\b(?:import|export)\s+(type\s+)?([\w$*\s,{}]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
      if (m[1]) continue
      const named = /\{([^}]*)\}/.exec(m[2])
      const whole = !named || /\*|^\s*[\w$]+\s*,/.test(m[2])
      const names = whole
        ? null
        : new Set(named[1].split(',').map(n => n.trim()).filter(n => n && !n.startsWith('type ')).map(n => n.split(/\s+as\s+/)[0]))
      if (names && names.size === 0) continue
      add(resolveImport(path, m[3]), path, names)
    }
    for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) add(resolveImport(path, m[1]), path, null)
  }
  const routeOf = (path: string) => {
    const m = /^app\/(.*)\/page\.tsx$/.exec(rel(path))
    return m ? `/${m[1].split('/').filter(s => !/^\(.*\)$/.test(s)).join('/')}` : null
  }
  // The portal page a route answers to: itself, or the nearest page above it the registry lists (none for
  // the HR app, whose parts write as the portal page each stands for, nor for the Revenue app's routes).
  const portalPage = (route: string) => {
    let cur = route
    while (cur && !TABS[cur]) cur = cur.slice(0, cur.lastIndexOf('/'))
    return cur || null
  }
  const pagesReaching = (start: string) => {
    const seen = new Set([start])
    const queue = [start]
    const out = new Set<string>()
    while (queue.length) {
      const cur = queue.shift()!
      const route = routeOf(cur)
      if (route) {
        const page = route.startsWith('/hr-app') ? null : portalPage(route)
        if (page) out.add(page)
        continue
      }
      for (const i of importers.get(cur) ?? []) if (!seen.has(i.from)) { seen.add(i.from); queue.push(i.from) }
    }
    return out
  }

  const sites: WriteSite[] = []
  for (const { path, file, text } of sources) {
    if (!/^['"]use server['"]/m.test(text.slice(0, 300))) continue
    const starts = [...text.matchAll(/^export (?:default )?async function (\w+)/gm)]
    starts.forEach((s, i) => {
      const body = text.slice(s.index, starts[i + 1]?.index ?? text.length)
      const gates = [...body.matchAll(WRITE_GATE)]
      if (!gates.length) return
      const used = new Set<string>()
      for (const u of importers.get(path) ?? []) {
        if (u.names && !u.names.has(s[1])) continue
        for (const p of pagesReaching(u.from)) used.add(p)
      }
      sites.push({
        file,
        fn: s[1],
        used: [...used].sort(),
        named: [...new Set(gates.flatMap(g => pagesIn(g[2])))].sort(),
        choice: gates.some(g => /\?/.test(g[2].replace(/'[^']*'/g, ''))),
      })
    })
  }
  return sites
}

/** Pages compared by what they narrow by: their tabs (a page whose tabs another listed page has adds nothing). */
export const tabsOfPages = (pages: Iterable<string>) => [...new Set([...pages].map(p => [...(TABS[p] ?? [`?${p}`])].sort().join(',')))].sort()

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Lead View v2's pages are linked together (2026-11-02 — the user: "确保那些规则是 link 在一起的"). Every link one Lead
 * View screen makes to another — `href` and `router.push`, and the sidebar's rows — goes to a page that exists, and
 * every query it hands that page (`/leads?c=`, `/leads/list?lead=`, `/leads/ai?b=&tab=`, `/leads/flows?t=` …) is one the
 * page reads from its searchParams. A link to a page that went, or a parameter the page stopped reading, fails here.
 */

const ROOT = join(process.cwd(), 'src')
const LEADS = join(ROOT, 'app/(portal)/leads')
const files = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? files(p) : /\.(tsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : []
})
const SOURCES = [...files(LEADS), ...files(join(ROOT, 'components/layout')).filter(f => /lead|Lead/.test(f)), ...files(join(ROOT, 'lib/leads'))]

/** A Lead View route's page file, or null. */
const pageOf = (path: string) => {
  const rel = path.replace(/^\/leads\/?/, '')
  const p = join(LEADS, rel, 'page.tsx')
  return existsSync(p) ? p : null
}
/** The keys a page reads: `searchParams: Promise<{ c?: string; q?: string }>`. */
const keysOf = (page: string) => {
  const m = /searchParams\s*:\s*Promise<\{([^}]*)\}>/.exec(readFileSync(page, 'utf8'))
  return m ? [...m[1].matchAll(/(\w+)\??\s*:/g)].map(x => x[1]) : []
}

interface Link { file: string; path: string; keys: string[] }
function links(): Link[] {
  const out: Link[] = []
  for (const file of SOURCES) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/(?:href=\{?|push\(|replace\(|link\([^)]*?,\s*)[`'"](\/leads[^`'"\s]*)[`'"]?/g)) {
      const raw = m[1]
      const [path, query = ''] = raw.split('?')
      const keys = [...query.matchAll(/(?:^|&)(\w+)=/g)].map(x => x[1])
      out.push({ file: file.slice(ROOT.length + 1), path: path.replace(/\$\{[^}]*$/, '').replace(/\/$/, '') || '/leads', keys })
    }
  }
  return out
}

describe('Lead View’s links between its pages', () => {
  const all = links()

  it('finds the links (the scan still sees them)', () => {
    expect(all.length).toBeGreaterThan(15)
    expect(all.some(l => l.path === '/leads' && l.keys.includes('c'))).toBe(true)
    expect(all.some(l => l.path === '/leads/ai' && l.keys.includes('tab'))).toBe(true)
  })

  it('goes to pages that exist', () => {
    const missing = all.filter(l => !pageOf(l.path)).map(l => `${l.file} → ${l.path}`)
    expect(missing).toEqual([])
  })

  it('hands each page only the queries it reads', () => {
    const unread = all.flatMap(l => {
      const page = pageOf(l.path)
      if (!page) return []
      const reads = keysOf(page)
      return l.keys.filter(k => !reads.includes(k)).map(k => `${l.file} → ${l.path}?${k}= (the page reads ${reads.join(', ') || 'nothing'})`)
    })
    expect(unread).toEqual([])
  })

  it('every sidebar row opens a page', () => {
    const nav = readFileSync(join(ROOT, 'components/layout/lead-nav.ts'), 'utf8')
    const rows = [...nav.matchAll(/link\('[^']*',\s*'[^']*',\s*'[^']*',\s*'(\/leads[^']*)'/g)].map(m => m[1])
    expect(rows.length).toBeGreaterThanOrEqual(14)
    expect(rows.filter(r => !pageOf(r))).toEqual([])
  })

  it('the pages that take a query act on it', () => {
    // Each deep link opens what it names, not just the page.
    const reads: Array<[string, string, RegExp]> = [
      ['page.tsx', 'c', /some\(x => x\.id === c\)/],
      ['list/page.tsx', 'lead', /\.lead\b/],
      ['ai/page.tsx', 'tab', /initialTab=\{sp\.tab\}/],
      ['ai/page.tsx', 'b', /initialBrand=\{sp\.b\}/],
      ['flows/page.tsx', 't', /initialId=\{t \?\? null\}/],
      ['corrections/page.tsx', 'd', /sp\.d\b/],
    ]
    const idle = reads.filter(([f, , re]) => !re.test(readFileSync(join(LEADS, f), 'utf8'))).map(([f, k]) => `${f} ?${k}=`)
    expect(idle).toEqual([])
  })
})

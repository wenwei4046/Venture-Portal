import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// No descriptions on the page (2026-10-12, DESIGN.md › No descriptions on the
// page). The user, circling six of them on HR's pages: "find all this wording
// … like a description, i want delete it, cause this cause the view too
// messy". Page subtitles, section ledes, explanatory notices, usage hints and
// a menu row's second line went from every portal page. A scan cannot tell a
// description from data in general, but it can keep the three shapes they
// came in from coming back with the next page or prototype: a kit head's
// subtitle, a `.page-sub` line, and a hint that says where to click.

// Vitest runs from the repository root.
const ROOT = process.cwd()
const where = (path: string) => relative(ROOT, path).replace(/\\/g, '/')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}

// The portal's pages and the shared pieces they are built from. Not the phone
// apps (components/member, components/hr-app), and not a PDF / CSV export
// (`export/`, `_format/`): a document is not the view.
const files = [
  ...sources(resolve(ROOT, 'src/app/(portal)')),
  ...sources(resolve(ROOT, 'src/components')).filter(path => !/[\\/]components[\\/](member|hr-app)[\\/]/.test(path)),
]
  .filter(path => !/[\\/](export|_format)[\\/]/.test(path))
  .map(path => ({ at: where(path), text: readFileSync(path, 'utf8') }))

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

/** Each `<PageHead …>` with its props as written (a `>` inside `{…}` is not its end). */
function pageHeads(text: string): { line: number; props: string }[] {
  return [...text.matchAll(/<PageHead\b/g)].map(match => {
    const start = match.index + match[0].length
    let depth = 0
    let end = start
    for (; end < text.length; end++) {
      const ch = text[end]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    return { line: lineOf(text, match.index), props: text.slice(start, end) }
  })
}

/**
 * What the page SHOWS: the code without its comments and without its
 * tooltips and labels — a comment, a `title=` or an `aria-label` may still
 * say how a row opens (the ⋯ button's "Actions — or right-click the row").
 */
const shown = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\b(title|aria-label)=("[^"]*"|'[^']*'|\{`[^`]*`\}|\{'[^']*'\}|\{"[^"]*"\})/g, '')

// A subtitle that is live data, not a description: who is signed in, the
// voucher's own description. Anything new here is a decision, not a detail.
// HR's Overview (2026-10-15, the Attendance handoff): where things stand — requests waiting, who is not in, the close.
const DATA_SUBTITLES = ['src/app/(portal)/admin/password/page.tsx', 'src/app/(portal)/dashboard/_components/HrOverview.tsx']
const DATA_PAGE_SUBS = ['src/app/(portal)/reconciliation/journal-entries/[id]/page.tsx']

// The hints the pages carried until 2026-10-12, as they opened a sentence. The
// behaviour they described stays (a right-click, a double-click, Shift for the
// browser's own menu); only the words went. A tooltip may still say it, held
// in a constant as much as in `title=` — "More actions — or right-click the
// row" — so the forms are matched as written, capital first.
const HINTS = [
  /Shift \+ right-click opens/,
  /Right-click (a|the|each) (row|bill|person|request|line)\b/,
  /Right-click to (invite|acknowledge|remove)/,
  /Double-click (to open|a (row|bill) to open)/,
  /Click a (person|card|request|customer) (for|to)\b/,
  /双击一行打开/,
  /highlights only/,
]

describe('no descriptions on the page', () => {
  it('finds the kit heads and the hints (the scan itself works)', () => {
    expect(files.filter(f => pageHeads(f.text).length > 0).length).toBeGreaterThan(10)
    expect(HINTS.some(hint => hint.test('Shift + right-click opens the browser’s own menu.'))).toBe(true)
    expect(shown('<button title="Actions — or right-click the row">⋯</button>')).toBe('<button >⋯</button>')
    expect(pageHeads('<PageHead eyebrow="A" title="B" right={<X onClick={() => go()} />} subtitle="Why" />')[0].props)
      .toContain('subtitle=')
  })

  it('gives a kit head a subtitle only where it is live data', () => {
    const described = files.flatMap(f => pageHeads(f.text)
      .filter(head => /\bsubtitle=/.test(head.props))
      .map(head => ({ at: f.at, line: head.line })))
    expect(described.filter(d => !DATA_SUBTITLES.includes(d.at)).map(d => `${d.at}:${d.line}`)).toEqual([])
  })

  it('draws a .page-sub line only for live data', () => {
    const subs = files.flatMap(f => [...f.text.matchAll(/\bpage-sub\b/g)].map(() => f.at))
    expect([...new Set(subs)].sort()).toEqual(DATA_PAGE_SUBS)
  })

  it('tells nobody where to click', () => {
    const told = files.flatMap(f => {
      const text = shown(f.text)
      return HINTS.flatMap(hint => {
        const found = text.match(hint)
        return found ? [`${f.at}: ${found[0]}`] : []
      })
    })
    expect(told).toEqual([])
  })
})

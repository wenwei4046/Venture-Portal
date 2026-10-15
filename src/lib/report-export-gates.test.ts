import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// A file the reader may not take out is not offered (finance-view.md › EXPORTS,
// 2026-10-12; the desktop pages caught up 2026-10-16): each export
// route asks its action (Reports · Export, Dept reports · Export, Treasury ·
// Export), so a page that showed the Excel / PDF to every reader handed some a
// button that only failed. Every page and component that links an export asks
// canDo(…, 'export') — or takes the answer as a prop (`canExport`, Invoices'
// `can.listExport`) from the page that asked.

const SRC = join(process.cwd(), 'src')
const ROOTS = [join(SRC, 'app', '(portal)'), join(SRC, 'app', '(fin-app)'), join(SRC, 'components')]

/** Exports whose route asks only its page's own key: there is no Export cell to ask. */
const ROUTE_ASKS_ITS_KEY: Record<string, string> = {
  // The user, 2026-10-12: 不改，维持现在 — the Accounts Executive (Venture Pool view + create, no export) keeps it.
  'app/(portal)/venture-pool/page.tsx': "/venture-pool/export asks Venture Pool's own key (finance-view.md › EXPORTS)",
  'app/(fin-app)/fin-app/page/venture-pool/page.tsx': "/venture-pool/export asks Venture Pool's own key (finance-view.md › EXPORTS)",
  'app/(portal)/reconciliation/[sessionId]/report/page.tsx': "its export asks Reconciliation's own key",
  'components/layout/fin-nav.ts': "the sidebar's match — it names the route to leave it out, it links no file",
}

const LINKS = /\/export(\?|`|'|")|<ExportLinks\b|[eE]xportHref\(/
const ASKS = /canDo\([^)]*'export'|\bcanExport\b|\bcan\.(listExport|docExport)\b/

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return files(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && !/^route\.tsx?$/.test(e.name) ? [p] : []
  })
}

describe('a page offers its export only to whoever may take it out', () => {
  it('asks canDo(…, export), or takes the answer as a prop, wherever it links an export', () => {
    const open = ROOTS.flatMap(files)
      .map((f) => relative(SRC, f).split(sep).join('/'))
      .filter((rel) => !(rel in ROUTE_ASKS_ITS_KEY))
      .filter((rel) => {
        const src = readFileSync(join(SRC, rel), 'utf8')
        return LINKS.test(src) && !ASKS.test(src)
      })
    expect(open).toEqual([])
  })

  it('every file on the list still links an export (a stale entry is a hole)', () => {
    const stale = Object.keys(ROUTE_ASKS_ITS_KEY).filter((rel) => !LINKS.test(readFileSync(join(SRC, rel), 'utf8')))
    expect(stale).toEqual([])
  })
})

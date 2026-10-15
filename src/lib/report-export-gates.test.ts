import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// A file the reader may not take out is not offered (2026-10-16): every export
// route asks its action (Reports · Export, Dept reports · Export, Treasury ·
// Export), so a page that shows the Excel / PDF to every reader handed some a
// button that only failed. Each page that links its export asks canDo first.

const ROOT = join(process.cwd(), 'src', 'app', '(portal)')
const pages = [
  ...readdirSync(join(ROOT, 'reports'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(ROOT, 'reports', d.name, 'page.tsx')),
  join(ROOT, 'daily-bank', 'page.tsx'),
].filter((f) => existsSync(f))

describe('a page offers its export only to whoever may take it out', () => {
  it('asks canDo(…, export) wherever it links an export', () => {
    const open = pages.filter((f) => {
      const src = readFileSync(f, 'utf8')
      const links = /\/export[?`'"]|<ExportLinks\b|exportHref\(|canExport=/.test(src)
      return links && !/canDo\([^)]*'export'/.test(src)
    })
    expect(open.map((f) => f.slice(process.cwd().length + 1))).toEqual([])
  })
})

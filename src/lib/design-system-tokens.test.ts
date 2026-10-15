import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import postcss, { type Root } from 'postcss'
import { describe, expect, it } from 'vitest'

// The HOUZS Venture Design System (the Claude Design project, 2026-10-14;
// DESIGN.md › The design system) came into the code as semantic --ds-* tokens
// in two themes — HR on :root, the Revenue app on [data-revenue-app] — and two
// faces: Newsreader for every page title, Georgia behind it, and Inter Tight
// for the Revenue app's titles and amounts. These checks keep both themes
// whole, HR's colours the sheet's own, and each face where the design put it.

const ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const globals = postcss.parse(read('src/app/globals.css'))

/** The declarations of the first rule with exactly this selector that declares `marker`. */
function block(css: Root, selector: string, marker: string): Map<string, string> {
  const blocks: Map<string, string>[] = []
  css.walkRules((rule) => {
    if (rule.selector !== selector) return
    const decls = new Map<string, string>()
    for (const node of rule.nodes ?? []) if (node.type === 'decl') decls.set(node.prop, node.value)
    blocks.push(decls)
  })
  const found = blocks.find((decls) => decls.has(marker))
  if (!found) throw new Error(`no ${selector} rule declares ${marker}`)
  return found
}

const themed = (decls: Map<string, string>) => [...decls.keys()].filter((name) => name.startsWith('--ds-')).sort()

/** Every .css / .ts / .tsx file under `dir`, tests left out. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (abs: string) => {
    for (const name of readdirSync(abs)) {
      const path = join(abs, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(ROOT, path).replace(/\\/g, '/'))
    }
  }
  walk(resolve(ROOT, dir))
  return out
}

const px = (value: string) => {
  const m = /(\d+(?:\.\d+)?)px/.exec(value)
  return m ? Number(m[1]) : Number.NaN
}

describe('the design system tokens (globals.css)', () => {
  const hr = block(globals, ':root', '--ds-page')
  const revenue = block(globals, '[data-revenue-app]', '--ds-page')

  it('names every themed token in both themes — HR on :root, Revenue on [data-revenue-app]', () => {
    expect(themed(revenue)).toEqual(themed(hr))
    expect(themed(hr).length).toBeGreaterThan(80)
  })

  it("keeps HR's colours the sheet's own", () => {
    const sheet = block(globals, '.sheet-theme', '--accent')
    const SAME_AS: Record<string, string> = {
      '--ds-page': '--paper',
      '--ds-surface': '--surface',
      '--ds-surface-2': '--sheet-filter',
      '--ds-hover': '--surface-2',
      '--ds-ink': '--ink',
      '--ds-ink-3': '--card-label',
      '--ds-border': '--hairline',
      '--ds-border-strong': '--sheet-table-border',
      '--ds-divider': '--sheet-divider',
      '--ds-row-hover': '--sheet-row-hover',
      '--ds-table-head': '--sheet-table-head',
      '--ds-table-head-rule': '--sheet-table-rule',
      '--ds-accent': '--accent',
      '--ds-accent-hover': '--accent-hover',
      '--ds-accent-soft': '--accent-bg',
      '--ds-selected': '--accent-bg',
      '--ds-on-dark': '--band-ink',
      '--ds-success': '--ledger',
      '--ds-success-bg': '--ledger-bg',
      '--ds-warning': '--alert',
      '--ds-warning-bg': '--alert-bg',
      '--ds-danger': '--danger',
      '--ds-danger-bg': '--danger-bg',
      '--ds-info': '--info',
      '--ds-info-bg': '--info-bg',
    }
    for (const [token, sheetVar] of Object.entries(SAME_AS)) {
      expect(sheet.get(sheetVar), sheetVar).toBeDefined()
      expect(hr.get(token), token).toBe(`rgb(${sheet.get(sheetVar)})`)
    }
  })

  it("points Revenue only at colours the app's palette has", () => {
    const palette = block(globals, '[data-revenue-app]', '--rv-ink')
    for (const [token, value] of revenue) {
      for (const [, name] of value.matchAll(/var\((--rv-[\w-]+)/g)) {
        expect(palette.has(name), `${token} → ${name}`).toBe(true)
      }
    }
  })

  it('leaves data-theme to light and dark mode — the Revenue theme is [data-revenue-app]', () => {
    globals.walkRules((rule) => {
      expect(rule.selector, rule.selector).not.toMatch(/\[data-theme=["']?(hr|revenue)\b/)
      expect(rule.selector.split(',').map((part) => part.trim())).not.toContain('[data-theme]')
    })
  })

  it('lets Tailwind ask only for tokens that exist', () => {
    const declared = new Set<string>()
    globals.walkDecls((decl) => {
      if (decl.prop.startsWith('--ds-')) declared.add(decl.prop)
    })
    const asked = [...read('tailwind.config.ts').matchAll(/var\((--ds-[\w-]+)\)/g)].map((m) => m[1])
    expect(asked.length).toBeGreaterThan(50)
    for (const name of asked) expect(declared.has(name), name).toBe(true)
  })
})

describe('the faces', () => {
  it('sets every page title in Newsreader, Georgia behind it', () => {
    expect(block(globals, ':root', '--font-display').get('--font-display')).toMatch(/^var\(--font-newsreader\), Georgia\b/)
    const layout = read('src/app/layout.tsx')
    expect(layout).toMatch(/Newsreader\(\{[\s\S]*?variable: '--font-newsreader'/)
    expect(layout).toMatch(/\$\{newsreader\.variable\}/)
  })

  // A print document is paper, not the screen: the letterheads and statements
  // keep Georgia (the 2026-10-10 handoff). A held design proposal keeps its own.
  const PAPER = new Set([
    'src/app/(portal)/director-salary/[directorId]/print/page.tsx',
    'src/app/(paper)/statements/[id]/print/page.tsx',
    'src/app/print/director-pool/page.tsx',
    'src/lib/commission/waiting-form.ts',
    'src/components/member/design-preview/ArenaDesignPreview.module.css',
  ])

  it('keeps Georgia to paper — on screen it only stands behind the display face', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      if (PAPER.has(file)) continue
      if (file.endsWith('.css')) {
        postcss.parse(read(file)).walkDecls((decl) => {
          if (decl.prop !== 'font-family' && decl.prop !== 'font') return
          if (!decl.value.includes('Georgia')) return
          const selector = decl.parent?.type === 'rule' ? decl.parent.selector : ''
          if (/print/.test(selector)) return
          const before = decl.value.slice(0, decl.value.indexOf('Georgia'))
          if (!/var\(--font-(display|newsreader)\b/.test(before)) offenders.push(`${file} ${selector}: ${decl.value}`)
        })
      } else {
        for (const [, value] of read(file).matchAll(/font(?:-family)?\s*:\s*([^;}\n]*)/g)) {
          if (!value.includes('Georgia')) continue
          const before = value.slice(0, value.indexOf('Georgia'))
          if (!/var\(--font-(display|newsreader)\b/.test(before)) offenders.push(`${file}: ${value.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("draws the Revenue app's titles and amounts in Inter Tight — every rule at 18px+ and weight 650+", () => {
    const missing: string[] = []
    for (const file of sourceFiles('src/components/member/app').filter((f) => f.endsWith('.module.css'))) {
      postcss.parse(read(file)).walkRules((rule) => {
        let size = Number.NaN
        let weight = Number.NaN
        let family = false
        for (const node of rule.nodes ?? []) {
          if (node.type !== 'decl') continue
          if (node.prop === 'font-size') size = px(node.value)
          if (node.prop === 'font-weight') weight = Number.parseInt(node.value, 10)
          if (node.prop === 'font-family' || node.prop === 'font') family = true
        }
        if (size >= 18 && weight >= 650 && !family) missing.push(`${file} ${rule.selector}`)
      })
    }
    expect(missing).toEqual([])
  })

  it("loads Inter Tight with the Revenue app's layout only — the portal never downloads it", () => {
    expect(read('src/app/layout.tsx')).not.toMatch(/Inter_Tight/)
    const appLayout = read('src/app/(member)/member/(app)/layout.tsx')
    expect(appLayout).toMatch(/import \{ interTight \} from "@\/components\/member\/app\/fonts"/)
    expect(appLayout).toMatch(/className=\{interTight\.variable\} style=\{\{ display: "contents" \}\}/)
    expect(read('src/components/member/app/fonts.ts')).toMatch(/variable: "--font-inter-tight"/)
    // Inside the app the face is Inter Tight; anywhere its layout is not, Inter.
    expect(block(globals, '[data-revenue-app]', '--ds-page').get('--font-display-rv')).toMatch(/^var\(--font-inter-tight, var\(--font-sans\)\)/)
    expect(block(globals, ':root', '--font-display').get('--font-display-rv')).toMatch(/^var\(--font-sans\)/)
  })
})

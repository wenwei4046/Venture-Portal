import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGE_TABS } from './page-tabs'

/**
 * Every write gate names, in code, the page its write belongs to (2026-10-11 — the
 * user's answer C, "现在就做完整的"). A box unticked on one page then closes that
 * write whatever the request says about where it came from: the old gates read the
 * page off the Referer, which a hand-made request writes as it likes.
 */
const SRC = resolve(process.cwd(), 'src')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
const rel = (path: string) => path.slice(SRC.length + 1).split(sep).join('/')
const sources = files(SRC).filter(f => rel(f) !== 'lib/auth.ts').map(f => ({ file: rel(f), text: readFileSync(f, 'utf8') }))
const PAGES = new Set(Object.keys(PAGE_TABS))

describe('write gates name their page', () => {
  it('no gate reads the page off the request any more', () => {
    const old = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/\b(requireAction|requireAnyAction|requireApprover|requirePayrollPayoutsAction)\(/g)].map(m => `${file}: ${m[1]}(`))
    expect(old).toEqual([])
  })

  it('each gate names a page the tab registry knows (a choice between two, each known)', () => {
    const bad: string[] = []
    let gates = 0
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/\b(requireActionOn|requireAnyActionOn|requirePayrollPayoutsActionOn|requireApproverOn)\(\s*((?:'[^']*'|[^,')])+)/g)) {
        gates++
        // The page literals (a gate may choose between two by what it writes); other literals are not pages.
        const pages = [...m[2].matchAll(/'(\/[^']*)'/g)].map(p => p[1])
        if (pages.length === 0 || pages.some(p => !PAGES.has(p))) bad.push(`${file}: ${m[1]}(${m[2].trim()}`)
      }
    }
    expect(bad).toEqual([])
    expect(gates).toBeGreaterThan(300)
  })
})

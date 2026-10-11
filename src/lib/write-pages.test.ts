import { describe, expect, it } from 'vitest'
import { PAGE_TABS } from './page-tabs'
import { WRITE_GATE, pagesIn, scanWriteSites, sourceFiles, tabsOfPages } from '@/test/write-pages-scan'

/**
 * Every write gate names, in code, the pages its write belongs to (2026-10-11 — the
 * user's answer C, "现在就做完整的"). A box unticked on one page then closes that
 * write whatever the request says about where it came from: the old gates read the
 * page off the Referer, which a hand-made request writes as it likes.
 */
const sources = sourceFiles().filter(s => s.file !== 'lib/auth.ts')
const PAGES = new Set(Object.keys(PAGE_TABS))

describe('write gates name their pages', () => {
  it('no gate reads the page off the request any more', () => {
    const old = sources.flatMap(({ file, text }) =>
      [...text.matchAll(/\b(requireAction|requireAnyAction|requireApprover|requirePayrollPayoutsAction)\(/g)].map(m => `${file}: ${m[1]}(`))
    expect(old).toEqual([])
  })

  it('each gate names pages the tab registry knows (one, a list, or a choice between two)', () => {
    const bad: string[] = []
    let gates = 0
    for (const { file, text } of sources) {
      for (const m of text.matchAll(WRITE_GATE)) {
        gates++
        // The page literals (a gate may choose between two by what it writes); other literals are not pages.
        const pages = pagesIn(m[2])
        if (pages.length === 0 || pages.some(p => !PAGES.has(p))) bad.push(`${file}: ${m[1]}(${m[2].trim()}`)
      }
    }
    expect(bad).toEqual([])
    expect(gates).toBeGreaterThan(300)
  })

  /**
   * The pages a gate names are the pages its action is USED on (2026-10-11): every
   * page whose screen imports it, through its components. A write offered on several
   * pages counts while any of them keeps it (`actionsOnPages`) — so a gate naming too
   * few closes a button that is there, and one naming too many opens a write from a
   * page with no such button. Pages are compared by their tabs. The HR app is left
   * out: its parts write as the portal page each stands for (`PART_PAGE`).
   */
  it('names exactly the pages whose screens use its action', () => {
    const sites = scanWriteSites().filter(s => s.used.length > 0) // used by no page: another action's, or the HR app's only
    const bad = sites.filter(s => {
      const want = tabsOfPages(s.used)
      const have = tabsOfPages(s.named)
      // A choice by what it writes names each side; the pages using it must be among them.
      return s.choice ? !want.every(t => have.includes(t)) : want.join('|') !== have.join('|')
    }).map(s => `${s.file}#${s.fn}: names ${s.named.join(' + ')} — used on ${s.used.join(' + ')}`)
    expect(bad).toEqual([])
    expect(sites.length).toBeGreaterThan(250)
  }, 60_000)
})

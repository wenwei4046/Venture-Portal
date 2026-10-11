import { describe, expect, it } from 'vitest'
import { PAGE_TABS } from './page-tabs'
import { DEFINER_RPCS } from '@/test/read-paths'
import { guards, narrows, pageTabRows, rpcSites, seededRows, tabCellRows, tabsOf, type RpcSite } from '@/test/tab-guards-scan'

/**
 * Plan C's database side (2026-10-11 — the user's answer C, "现在就做完整的"): the
 * DEFINER writes ask the boxes of the pages they are offered on, as the app's gates
 * in front of them do (migs 20261011220000 / 20261011220100). This file keeps the
 * two in step: the database's copy of the tab registry, and which writes ask which
 * pages.
 */

/**
 * DEFINER functions a narrowing gate calls that ask no pages, and why.
 * A read narrows nothing (a View never does); the rest are named one by one.
 */
const NOT_GUARDED: Readonly<Record<string, string>> = {
  build_hr_cost_submission_payload: 'a read: the figures a submission will carry',
  comm_home_sub_department: 'a read: the sub-department a person is based in',
  erp_feed_month_closed: 'a read: is the ERP feed’s month closed',
  get_staff_billing_allocation: 'a read: who is billed for whom, for the invoice about to be made',
  get_staff_own_share_allocation: 'a read: the own-share split, for the invoice about to be made',
  payroll_month_closed: 'a read: is the payroll month closed',
  hiring_orphan_files: 'a read: the files no record names, for the sweep after a write',
  payroll_reopen_month: 'the Principal’s alone — its own check asks the account’s kind, not a cell a box stands for',
  mint_invoice_no:
    'a number for an invoice made on any of five pages (Invoice, BA, Billing Allocator, the Invoice list, My Billing): ' +
    'asking all five narrows nothing, and the invoice it numbers is written by the gated write that asked for it',
}

const PAGES = new Set(Object.keys(PAGE_TABS))
const all = guards()
const byFn = new Map(all.map(g => [g.fn, g]))
const sites = rpcSites()
const sitesOf = (fn: string) => sites.filter(s => s.rpc === fn)
const gateKey = (s: { pages: string[]; wants: string[] }) => `${tabsOf(s.pages).join('|')} :: ${[...new Set(s.wants)].sort().join(',')}`

describe('the database knows the tab registry', () => {
  it('permission_page_tabs is PAGE_TABS, row for row', () => {
    const seeded = seededRows('permission_page_tabs')
    expect(seeded, 'a migration seeds permission_page_tabs').not.toBeNull()
    expect(seeded!.rows, `${seeded!.file} — a page or tab changed: seed both tables again in a new migration`).toEqual(pageTabRows())
  })

  it('permission_tab_cells is every box’s cells, row for row', () => {
    const seeded = seededRows('permission_tab_cells')
    expect(seeded, 'a migration seeds permission_tab_cells').not.toBeNull()
    expect(seeded!.rows, `${seeded!.file} — a box’s cells changed: seed both tables again in a new migration`).toEqual(tabCellRows())
  })
})

describe('a narrowing gate’s DEFINER writes ask its pages in the database too', () => {
  it('guards that many writes', () => {
    expect(all.length).toBeGreaterThan(70)
  })

  it('each guard names pages the registry knows, and can close something', () => {
    const bad = all.flatMap(g => {
      const unknown = g.pages.filter(p => !PAGES.has(p))
      // A guard on several gates narrows when one of them does; a choice, when one of its sides does.
      const gates = g.sites ?? g.branches.map(pages => ({ pages, wants: g.wants }))
      const can = gates.some(s => s.wants.some(w => narrows(s.pages, w)))
      return [...(unknown.length ? [`${g.fn}: unknown ${unknown.join(', ')}`] : []), ...(can ? [] : [`${g.fn}: closes nothing on ${g.pages.join(' + ')}`])]
    })
    expect(bad).toEqual([])
  })

  it('asks the pages the app’s gates in front of it name', () => {
    const bad = all.flatMap(g => {
      const mine = sitesOf(g.fn)
      if (mine.length === 0) return [`${g.fn}: no gate in the app calls it`]
      if (g.sites) {
        // Each gate the app has in front of it, and no other.
        const want = [...new Set(mine.map(gateKey))].sort()
        const have = [...new Set(g.sites.map(gateKey))].sort()
        return want.join(' ; ') === have.join(' ; ') ? [] : [`${g.fn}: asks ${have.join(' ; ')} — the app’s gates are ${want.join(' ; ')}`]
      }
      const used = tabsOf(mine.flatMap(s => s.pages))
      const named = tabsOf(g.pages)
      // A choice by what it writes names each side; the app's pages must be among them.
      const ok = g.branches.length > 1 ? used.every(t => named.includes(t)) : used.join(' | ') === named.join(' | ')
      return ok ? [] : [`${g.fn}: names ${g.pages.join(' + ')} — the app’s gates name ${[...new Set(mine.flatMap(s => s.pages))].join(' + ')}`]
    })
    expect(bad).toEqual([])
  })

  it('every DEFINER write behind a narrowing gate asks its pages, or is named with why not', () => {
    const definers = new Set<string>(DEFINER_RPCS as readonly string[])
    const behind = new Map<string, RpcSite[]>()
    for (const s of sites) {
      if (!definers.has(s.rpc) || !s.wants.some(w => narrows(s.pages, w))) continue
      behind.set(s.rpc, [...(behind.get(s.rpc) ?? []), s])
    }
    const missing = [...behind].filter(([fn]) => !byFn.has(fn) && !NOT_GUARDED[fn]).map(([fn, at]) => `${fn} (${at.map(s => s.at).join(', ')})`)
    expect(missing).toEqual([])
    // …and the reasons name nothing that is guarded, or no longer behind such a gate.
    expect(Object.keys(NOT_GUARDED).filter(fn => byFn.has(fn) || !behind.has(fn))).toEqual([])
  })
})

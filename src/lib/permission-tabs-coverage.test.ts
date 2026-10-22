import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OPEN_PAGES, PAGE_TABS, routeOf, type PageRoute } from './page-tabs'
import { PERMISSION_TABS, TAB_BY_ID, TAB_VIEWS } from './permission-tabs'
import { APP_PAGE_TABS } from './member/app-pages'
import { statementDepts } from './dept-statements'
import { hrNavSections } from '@/components/layout/hr-nav'
import { finAccountMenu, finNavSections } from '@/components/layout/fin-nav'
import { buildNavEntries, isGroup, type NavEntry } from '@/components/layout/nav-config'
import { PROFILE_VIEWS, SCREENS, type Screen } from '@/components/member/app/route'
import { pageOfRoute } from '@/components/member/app/app-access'

/**
 * People › Permissions lists every tab of every view (2026-10-11 — the user:
 * "确保它能 scan 到每一个 view 的每一个 tab", after new pages had been added to
 * several views). This file is that scan, kept: every page a sidebar, the HR
 * app or the Revenue app opens has a box in the matrix — or a written reason
 * not to — and every row of the matrix stands for something that is there. A
 * page added to a view without its tab fails here.
 */

const TABS = PAGE_TABS as Record<string, readonly string[]>

/** The leaf links of the portal's nav, at any depth. */
const navHrefs = (entries: NavEntry[]): string[] =>
  entries.flatMap(e => (isGroup(e) ? [...(e.href ? [e.href] : []), ...navHrefs(e.children)] : [e.href]))

/** A path as the registry knows it: a page with tabs, or one no tab closes. */
const known = (href: string): PageRoute | 'open' | null => {
  const path = href.split('?')[0]
  if (OPEN_PAGES.has(path)) return 'open'
  return routeOf(path)
}

/** Rows whose page is not a portal page nor a Revenue app page — where each one lives. */
const SOMEWHERE_ELSE: Readonly<Record<string, string>> = {
  'rev.leads': 'the CRM in the Revenue app — its own cell, CRM · View',
  'rev.crm_team': 'the CRM’s Control panel — CRM · View at All',
  'rev.product_list': '/member/products — the product_list key',
  'rev.it_requests': 'the Revenue app’s IT requests (Profile › IT support › All, the sidebar’s row) — its own cells, IT requests · View / Edit',
  'pri.switch_views': 'the view switcher in the top bar',
}

/** Revenue app screens and Profile pages with no box, and why. */
const OPEN_IN_THE_APP: Readonly<Record<string, string>> = {
  account: 'Profile itself — the list of the pages below it',
  products: 'the Product List — rev.product_list, by its key',
  memos: 'Memos & notifications — every member reads and acknowledges HR’s memos (the user, 2026-10-11)',
  crm: 'My leads & appointments — the CRM’s own tabs (rev.leads, rev.crm_team), by their cells',
  it: 'IT support — anybody may ask IT for help and follow their own requests (the user, 2026-10-20: "所有人都可以填")',
  itdesk: 'IT requests — everybody’s, rev.it_requests, by its own cells',
}

describe('every tab of every view is in People › Permissions', () => {
  it('names only tabs the matrix has', () => {
    const unknown = Object.entries(TABS).flatMap(([page, tabs]) => tabs.filter(t => !TAB_BY_ID.has(t)).map(t => `${page} → ${t}`))
    expect(unknown).toEqual([])
    expect(Object.values(APP_PAGE_TABS).filter(t => TAB_BY_ID.get(t)?.view !== 'rev')).toEqual([])
  })

  it('HR’s sidebar: every link opens from a tab of the HR view', () => {
    const bad = hrNavSections('fair').flatMap(section => section.items).flatMap(item => {
      const route = known(item.href)
      if (route === 'open') return []
      if (route === null) return [`${item.label} (${item.href}): no page in PAGE_TABS`]
      return TABS[route].some(t => t.startsWith('hr.')) ? [] : [`${item.label} (${item.href}): no HR view tab opens it`]
    })
    expect(bad).toEqual([])
  })

  it('Finance’s sidebar and account menu (2026-10-14): every link opens from a tab of the Finance view', () => {
    const items = [
      ...finNavSections({ revenueSubDepts: [], deptPoolDepts: statementDepts([]) }).flatMap(section => section.items),
      ...finAccountMenu().flatMap(group => group.items).filter(item => item.href !== undefined),
    ]
    const bad = items.flatMap(item => {
      const href = item.href as string
      const route = known(href)
      if (route === 'open') return []
      if (route === null) return [`${item.label} (${href}): no page in PAGE_TABS`]
      const own = item.permissionTabs
      const opens = own ? own.some(t => t.startsWith('fin.')) : TABS[route].some(t => t.startsWith('fin.'))
      return opens ? [] : [`${item.label} (${href}): no Finance view tab opens it`]
    })
    expect(bad).toEqual([])
  })

  it('the Principal’s own rows on Finance’s sidebar (2026-10-17): each opens from a tab of the Principal view', () => {
    const finance = new Set([
      ...finNavSections({ revenueSubDepts: [], deptPoolDepts: statementDepts([]) }).flatMap(section => section.items).map(i => i.key),
      ...finAccountMenu().flatMap(group => group.items).map(i => i.key),
    ])
    const items = [
      ...finNavSections({ revenueSubDepts: [], deptPoolDepts: statementDepts([]) }, { principal: true }).flatMap(section => section.items),
      ...finAccountMenu({ principal: true }).flatMap(group => group.items).filter(item => item.href !== undefined),
    ].filter(item => !finance.has(item.key))
    expect(items.map(i => i.key).sort()).toEqual(['access', 'it-requests', 'opex', 'settings'])
    const bad = items.flatMap(item => {
      const href = item.href as string
      const route = known(href)
      if (route === 'open') return []
      if (route === null) return [`${item.label} (${href}): no page in PAGE_TABS`]
      const own = item.permissionTabs
      const opens = own ? own.some(t => t.startsWith('pri.')) : TABS[route].some(t => t.startsWith('pri.'))
      return opens ? [] : [`${item.label} (${href}): no Principal view tab opens it`]
    })
    expect(bad).toEqual([])
  })

  it('the portal’s sidebar: every link lands on a page the registry knows', () => {
    const entries = buildNavEntries({
      revenueSubDepts: [{ slug: 'fair', name: 'Fair' }],
      revenueSub: 'fair',
      deptPoolDepts: statementDepts([]),
    })
    const bad = navHrefs(entries).filter(href => known(href) === null)
    expect(bad).toEqual([])
  })

  it('the HR app: each of its parts is a page of an HR view tab', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/hr-app/server.ts'), 'utf8')
    const block = /export const PART_PAGE = \{([\s\S]*?)\}/.exec(src)?.[1] ?? ''
    const parts = [...block.matchAll(/(\w+):\s*'([^']+)'/g)].map(m => [m[1], m[2]] as const)
    expect(parts.length).toBeGreaterThan(4)
    const bad = parts.filter(([, page]) => !(TABS[page] ?? []).some(t => t.startsWith('hr.'))).map(([part, page]) => `${part} → ${page}`)
    expect(bad).toEqual([])
  })

  it('the Revenue app: every screen and every Profile page has its box, or is open to all for a reason', () => {
    const screens: Screen[] = [...SCREENS, 'products']
    const bad = [
      ...screens.filter(screen => !pageOfRoute({ screen, pf: null }) && !(screen in OPEN_IN_THE_APP)).map(s => `screen ${s}`),
      ...PROFILE_VIEWS.filter(pf => !pageOfRoute({ screen: 'account', pf }) && !(pf in OPEN_IN_THE_APP)).map(pf => `Profile › ${pf}`),
    ]
    expect(bad).toEqual([])
    // The Profile card's two chips have their own boxes.
    expect(APP_PAGE_TABS.scheme).toBe('rev.scheme')
    expect(APP_PAGE_TABS.brandWeeks).toBe('rev.brand_weeks')
    // A reason is never kept for a page that has a box since.
    const stale = Object.keys(OPEN_IN_THE_APP).filter(k =>
      (screens as string[]).includes(k)
        ? pageOfRoute({ screen: k as Screen, pf: null }) !== null
        : pageOfRoute({ screen: 'account', pf: k as (typeof PROFILE_VIEWS)[number] }) !== null)
    expect(stale).toEqual([])
  })

  it('every row of the matrix stands for something that is there', () => {
    const pageTabs = new Set(Object.values(TABS).flat())
    const appTabs = new Set<string>(Object.values(APP_PAGE_TABS))
    const dead = PERMISSION_TABS.filter(t => !t.id.endsWith('.overview') && !pageTabs.has(t.id) && !appTabs.has(t.id) && !(t.id in SOMEWHERE_ELSE))
    expect(dead.map(t => t.id)).toEqual([])
    // Each view has rows, and the rail counts them all.
    for (const v of TAB_VIEWS) expect(PERMISSION_TABS.some(t => t.view === v.id), v.label).toBe(true)
  })

  it('the Revenue app’s rows: the handoff’s, round 2’s and the rest of Profile', () => {
    expect(PERMISSION_TABS.filter(t => t.view === 'rev').map(t => t.label)).toEqual([
      'Today', 'Insight', 'Quote', 'Arena', 'Profile · My income', 'Profile · Requests', 'Profile · Waiting list & replacements',
      'Profile · Team & capacity', 'Profile · Book a room', 'Profile · Documentation',
      // 2026-10-11: the rest of Profile (Memos & notifications stays open to all).
      'Profile · My honours', 'Profile · My brand weeks', 'Profile · Commission scheme',
      'Profile · My leads & appointments', 'CRM · Team', 'Product List',
      // 2026-10-20: IT support's desk.
      'IT requests',
    ])
  })
})

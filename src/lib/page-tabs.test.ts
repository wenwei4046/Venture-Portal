import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { canDo, type FunctionKey } from './permission-actions'
import { canSeeApprovals } from './approval-domains'
import { can, type Permission } from './permissions'
import { canSeeAuditChanges, canSeePayrollPayouts } from './roles'
import { openedKeys, type Action, type Scope } from './permission-matrix'
import { TAB_BY_ID } from './permission-tabs'
import { CELL_KEYS, PROD, cellsOf, grantsOf } from './permission-tabs.fixtures'
import { PROD_LOGINS } from './page-tabs.fixtures'
import { OPEN_PAGES, PAGE_TABS, actionsOnPage, closedBoxes, hasTab, opensPage, opensPath, routeOf, userTabs, type PageRoute } from './page-tabs'

const PORTAL = join(process.cwd(), 'src', 'app', '(portal)')

function pages(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) pages(p, out)
    else if (e.name === 'page.tsx') out.push(p)
  }
  return out
}
const routeOfFile = (file: string) => '/' + relative(PORTAL, join(file, '..')).split(sep).join('/')
const FILES = new Map(pages(PORTAL).map(f => [routeOfFile(f), readFileSync(f, 'utf8')]))
const ROUTES = Object.keys(PAGE_TABS) as PageRoute[]

describe('every portal page asks its tabs (HR revamp 8b)', () => {
  it('lists each page once — in PAGE_TABS, or among the pages no tab closes', () => {
    for (const route of FILES.keys()) {
      expect(route in PAGE_TABS || OPEN_PAGES.has(route), `${route}: add it to PAGE_TABS (or OPEN_PAGES)`).toBe(true)
      expect(route in PAGE_TABS && OPEN_PAGES.has(route), route).toBe(false)
    }
    for (const route of [...ROUTES, ...OPEN_PAGES]) expect(FILES.has(route), `${route} has no page`).toBe(true)
  })

  it('has every listed page ask requirePage with its own route, first', () => {
    for (const route of ROUTES) {
      const src = FILES.get(route)!.replace(/\r\n/g, '\n')
      const calls = [...src.matchAll(/requirePage\('([^']+)'\)/g)].map(m => m[1])
      expect(calls, route).toEqual([route])
      const body = src.slice(src.indexOf('export default async function'))
      expect(body.slice(body.indexOf('{', body.indexOf(')')) + 1).trimStart().startsWith(`await requirePage('${route}')`), route).toBe(true)
    }
  })

  it('names only tabs the catalog has', () => {
    for (const [route, tabs] of Object.entries(PAGE_TABS)) {
      for (const t of tabs) expect(TAB_BY_ID.has(t), `${route} → ${t}`).toBe(true)
    }
  })

  it('finds a path’s route, the most specific one', () => {
    expect(routeOf('/fund-in/3f2c/edit')).toBe('/fund-in/[id]/edit')
    expect(routeOf('/revenue/department')).toBe('/revenue/department')
    expect(routeOf('/revenue/fair')).toBe('/revenue/[sub]')
    expect(routeOf('/revenue/fair/2026-09/pay/abc')).toBe('/revenue/[sub]/[period]/pay/[staffId]')
    expect(routeOf('/team/people/new')).toBe('/team/people/new')
    expect(routeOf('/settings?tab=accounts')).toBe('/settings')
    expect(routeOf('/dashboard')).toBeNull()
    expect(routeOf('/member')).toBeNull()
  })

  it('opens a page from any of its tabs, and a link with tabs of its own from those', () => {
    expect(opensPage(['fin.approvals.view'], '/approvals')).toBe(true)
    expect(opensPage(['pri.approvals.view'], '/approvals')).toBe(true)
    expect(opensPage(['fin.receipt.view'], '/payments')).toBe(false)
    expect(opensPage(undefined, '/payments')).toBe(true)
    expect(opensPath(['fin.payments.view'], '/payments?status=draft')).toBe(true)
    expect(opensPath(['fin.payments.view'], '/dashboard')).toBe(true)
    expect(opensPath(['fin.chart_of_account.view'], '/settings?tab=treasury', ['pri.settings'])).toBe(false)
    expect(hasTab(['hr.permissions.view'], 'hr.permissions', 'edit')).toBe(false)
  })
})

describe('an account’s tabs', () => {
  const actions = { 'treasury.view': 'all', 'treasury.create': 'all' } as Record<string, Scope>
  const keys = ['dashboard', 'treasury']

  it('are what its cells and keys give, without a template', () => {
    const tabs = userTabs(null, actions, keys)
    expect(tabs).toContain('fin.payments.view')
    expect(tabs).toContain('fin.receipt.create')
  })

  it('are its template’s stored ticks with its own boxes over them — a held-back tab stays closed though its cells are shared', () => {
    const tabs = userTabs({ ticks: ['fin.payments.view', 'fin.receipt.view'], boxes: [{ tab: 'fin.receipt', action: 'view', granted: false }], cells: false }, actions, keys)
    expect(tabs).toEqual(['fin.payments.view'])
  })

  it('lay its boxes over what its cells give while its template stores no ticks', () => {
    const tabs = userTabs({ ticks: null, boxes: [{ tab: 'fin.receipt', action: 'view', granted: false }], cells: true }, actions, keys)
    expect(tabs).toContain('fin.payments.view')
    expect(tabs).not.toContain('fin.receipt.view')
    expect(tabs).not.toContain('fin.receipt.create')
  })

  it('are what its cells give when its own cells predate tabs', () => {
    expect(userTabs({ ticks: ['fin.receipt.view'], boxes: [], cells: true }, actions, keys)).toEqual(userTabs(null, actions, keys))
  })
})

// ── Nobody loses a page on the day ──────────────────────────────────────────

interface Account {
  name: string
  role: string
  permissions: string[]
  actions: Record<string, Scope>
  tabs: string[]
}

const ACCOUNTS: Account[] = [
  ...PROD_LOGINS.map(l => ({ name: l.email, role: l.role, permissions: l.keys, actions: l.actions, tabs: userTabs(null, l.actions, l.keys) })),
  // Whoever holds each production template, before it stores ticks.
  ...Object.entries(PROD).map(([key, t]) => {
    const permissions = openedKeys(grantsOf(t.cells), t.sensitive, t.baseRole, CELL_KEYS)
    const actions = Object.fromEntries(cellsOf(t.cells)) as Record<string, Scope>
    return { name: `template ${key}`, role: t.baseRole, permissions, actions, tabs: userTabs({ ticks: null, boxes: [], cells: false }, actions, permissions) }
  }),
]

const args = (list: string) => [...list.matchAll(/'([^']+)'/g)].map(m => m[1])
const keysOf = (list: string) => args(list) as Permission[]

/** The gate a page stood behind before 8b — the first one its source asks after requirePage. */
function openedToday(route: PageRoute, a: Account): boolean {
  if (route === '/member-admin') return can(a, 'member_requests_manage', 'member_memos_manage')
  if (route === '/audit-log') return canSeeAuditChanges(a)
  const src = FILES.get(route)!
  const rest = src.slice(src.indexOf(`requirePage('${route}')`) + 1)
  const gate = /\b(requirePermission|requirePayrollPayouts|requireActionOn|requireAnyActionOn|requireApprovalQueue)\(([^)]*)\)/.exec(rest)
  if (!gate) {
    // Gated inside the component the page draws: the keys its tabs open on.
    const keys = PAGE_TABS[route].flatMap(t => TAB_BY_ID.get(t)!.keys)
    return keys.length === 0 || can(a, ...(keys as Permission[]))
  }
  const [, fn, raw] = gate
  if (fn === 'requirePermission') return can(a, ...keysOf(raw))
  if (fn === 'requirePayrollPayouts') return can(a, ...keysOf(raw)) && canSeePayrollPayouts(a)
  if (fn === 'requireApprovalQueue') return canSeeApprovals(a)
  if (fn === 'requireActionOn') {
    const [, f, action, scope] = args(raw)
    return canDo(a, f as FunctionKey, action as Action, (scope as Scope) ?? 'all')
  }
  return [...raw.matchAll(/\[([^\]]*)\]/g)].some(m => {
    const [f, action, scope] = args(m[1])
    return canDo(a, f as FunctionKey, action as Action, (scope as Scope) ?? 'all')
  })
}

describe('nobody loses a page they open today', () => {
  it.each(ACCOUNTS.map(a => [a.name, a] as const))('%s', (_name, a) => {
    const lost = ROUTES.filter(route => openedToday(route, a) && !opensPage(a.tabs, route))
    expect(lost).toEqual([])
  })

  it('and the gate is asked: a template that unticks Receipt keeps Payments and loses /receipts', () => {
    const tabs = userTabs({ ticks: ['fin.payments.view', 'fin.overview.view'], boxes: [], cells: false }, {}, [])
    expect(opensPage(tabs, '/payments')).toBe(true)
    expect(opensPage(tabs, '/receipts')).toBe(false)
  })
})

// ── Writes follow the tab boxes (2026-10-11, the user: "yes separate by tab") ──

describe('a page’s writes follow its own tabs’ boxes', () => {
  const actions = {
    'treasury.view': 'all', 'treasury.export': 'all', 'treasury.create': 'all', 'treasury.edit': 'all',
    'treasury.void': 'all', 'claims.create': 'own',
  } as Record<string, Scope>
  // A template saved on tabs: Payments may create and edit; Receipt is viewed only.
  const closed = closedBoxes({ ticks: ['fin.payments.view', 'fin.payments.create', 'fin.payments.edit', 'fin.receipt.view'], boxes: [], cells: false })

  it('Receipt’s own boxes decide on Receipt: Payments’ Create creates no receipt', () => {
    const onReceipts = actionsOnPage(actions, closed, '/receipts')
    expect(onReceipts['treasury.create']).toBeUndefined()
    expect(onReceipts['treasury.edit']).toBeUndefined()
    expect(onReceipts['treasury.void']).toBeUndefined()
    // Viewing and exporting are never narrowed; a write no tab of the page stands for stays.
    expect(onReceipts).toMatchObject({ 'treasury.view': 'all', 'treasury.export': 'all', 'claims.create': 'own' })
  })

  it('and on Payments, its own Create and Edit hold', () => {
    const onPayments = actionsOnPage(actions, closed, '/payments')
    expect(onPayments).toMatchObject({ 'treasury.create': 'all', 'treasury.edit': 'all' })
    expect(onPayments['treasury.void']).toBeUndefined()
  })

  it('a page in several tabs keeps a write any of them still has open', () => {
    const queue = actionsOnPage({ 'approvals.approve': 'all', 'treasury.approve': 'all' } as Record<string, Scope>,
      closedBoxes({ ticks: ['fin.approvals.view', 'fin.approvals.approve'], boxes: [], cells: false }), '/approvals')
    expect(queue).toEqual({ 'approvals.approve': 'all' })
  })

  it('ticks worked out from cells close nothing — Finance’s Void without Approve stays', () => {
    const voids = { 'treasury.view': 'all', 'treasury.void': 'all' } as Record<string, Scope>
    expect(closedBoxes(null)).toEqual([])
    // Their own cells from before tabs, and no boxes yet: their ticks are worked out too.
    expect(closedBoxes({ ticks: ['fin.payments.view'], boxes: [], cells: true })).toEqual([])
    expect(actionsOnPage(voids, closedBoxes(null), '/payments')).toEqual(voids)
  })
})

describe('the boxes somebody unticked', () => {
  it('a template saved on tabs closes every box its ticks leave out', () => {
    const closed = closedBoxes({ ticks: ['fin.payments.view', 'fin.payments.create', 'rev.today.view'], boxes: [], cells: false })
    expect(closed).toEqual(expect.arrayContaining(['fin.payments.edit', 'fin.receipt.view', 'fin.receipt.create', 'rev.arena.view', 'rev.quote.create']))
    expect(closed).not.toContain('fin.payments.view')
    expect(closed).not.toContain('fin.payments.create')
    expect(closed).not.toContain('rev.today.view')
    // A box no tab has is never listed (Today has no Create).
    expect(closed).not.toContain('rev.today.create')
  })

  it('their own boxes count over it: one raised is open, one held back is closed', () => {
    const closed = closedBoxes({ ticks: ['rev.today.view', 'rev.arena.view'], boxes: [
      { tab: 'rev.insight', action: 'view', granted: true },
      { tab: 'rev.arena', action: 'view', granted: false },
    ], cells: false })
    expect(closed).not.toContain('rev.insight.view')
    expect(closed).toContain('rev.arena.view')
  })

  it('over a template not saved on tabs, only what their own boxes hold back closes — a View with its whole tab', () => {
    const closed = closedBoxes({ ticks: null, boxes: [
      { tab: 'fin.receipt', action: 'create', granted: false },
      { tab: 'rev.requests', action: 'view', granted: false },
      { tab: 'fin.payments', action: 'approve', granted: true },
    ], cells: true })
    expect(closed.sort()).toEqual(['fin.receipt.create', 'rev.requests.create', 'rev.requests.view'])
  })
})

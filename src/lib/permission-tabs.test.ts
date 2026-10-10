import { describe, expect, it } from 'vitest'
import type { PersonCells, Scope } from './permission-matrix'
import { CELL_KEYS, FUNCTIONS, PROD, cellsOf, grantsOf, keysOf } from './permission-tabs.fixtures'
import { viewKeysOf, type FunctionKey } from './permission-actions'
import {
  PERMISSION_TABS, TAB_VIEWS, boxesOf, cellRows, cellsFromTabs, cellsOutOfStep, gainsOf, grantOf, hasBox, lossesOf, parseGrant, personCellRows,
  personTicks, reapplied, sameTicks, tabsFromCells, templateTicks, ticksOfPerson, toggleBox, toggleRow, viewCount,
} from './permission-tabs'

const moved = (key: string) => tabsFromCells(cellsOf(PROD[key].cells), keysOf(key))
/** The cells that take effect today: a cell counts only while its function's pages open (canDo, has_action). */
const held = (key: string) => {
  const keys = keysOf(key)
  return new Map([...cellsOf(PROD[key].cells)].filter(([cell]) => {
    const opens = viewKeysOf(cell.split('.')[0] as FunctionKey)
    return opens.length === 0 || opens.some(k => keys.has(k))
  }))
}
const views = (grants: Set<string>) => TAB_VIEWS.filter(v => viewCount(v.id, grants).seen > 0).map(v => v.id)

describe('the tab catalog (HR revamp 8)', () => {
  it('names every cell a function really has, at a reach it allows', () => {
    for (const t of PERMISSION_TABS) {
      for (const cells of Object.values(t.opens)) {
        for (const cell of cells ?? []) {
          const [fn, action] = cell.split('.')
          expect(FUNCTIONS[fn]?.actions, `${t.id} → ${cell}`).toContain(action)
          expect(FUNCTIONS[fn]?.scopes, `${t.id} → ${cell} at ${t.reach}`).toContain(t.reach)
        }
      }
    }
  })

  it('has one id per tab, an Overview in every portal view, and the handoff’s lists in order', () => {
    expect(new Set(PERMISSION_TABS.map(t => t.id)).size).toBe(PERMISSION_TABS.length)
    for (const v of ['hr', 'fin', 'pri', 'dept']) expect(PERMISSION_TABS.find(t => t.id === `${v}.overview`)).toBeDefined()
    expect(PERMISSION_TABS.filter(t => t.view === 'hr').map(t => t.label)).toEqual([
      'Overview', 'HR Costing', 'Payroll', 'Payment', 'Director Salary', 'Director Pool', 'Comm Cal', 'Sales Groups', 'Rules',
      'People Management', 'Permissions', 'Hierarchy', 'Member Services',
      // Round 2 (20261011060000), in the handoff's order.
      'Documentation', 'Hiring requests', 'Hiring insights', 'Talent Bank', 'Meeting Rooms', 'Guest Link', 'Audit Log',
    ])
    expect(PERMISSION_TABS.filter(t => t.view === 'rev').map(t => t.label).slice(0, 8)).toEqual([
      'Today', 'Insight', 'Quote', 'Arena', 'Profile · My income', 'Profile · Requests', 'Profile · Waiting list & replacements', 'Profile · Team & capacity',
    ])
  })

  it('reads a stored box back, and refuses one that does not exist', () => {
    expect(parseGrant('hr.payroll.edit')?.tab.label).toBe('Payroll')
    expect(parseGrant('hr.overview.create')).toBeNull()
    expect(parseGrant('nope.view')).toBeNull()
    expect(hasBox(PERMISSION_TABS.find(t => t.id === 'hr.director_pool')!, 'approve')).toBe(false)
  })

  it('derives the cells underneath: the user’s merges, the widest reach', () => {
    expect([...cellsFromTabs(['fin.payments.view', 'fin.payments.approve', 'dept.my_claims.create', 'fin.claims.create'])].sort()).toEqual([
      ['claims.create', 'all'], ['treasury.approve', 'all'], ['treasury.export', 'all'], ['treasury.view', 'all'], ['treasury.void', 'all'],
    ])
    expect(cellsFromTabs(['dept.my_claims.view']).get('claims.view')).toBe('own')
  })
})

describe('moving the eleven templates onto tabs loses nothing', () => {
  it.each(Object.keys(PROD))('%s keeps every cell it held', key => {
    expect(lossesOf(held(key), moved(key))).toEqual([])
  })

  // What a template gains when it is next saved — the cells its ticks write that it did not store:
  // the user's merges only (point 2: export with view, void with approve, manage with edit).
  it('gains only the merges the user chose', () => {
    const gains = Object.fromEntries(Object.keys(PROD).map(k => [k, gainsOf(cellsOf(PROD[k].cells), moved(k))]))
    expect(gains).toEqual({
      dept_head: ['claims.void:dept', 'opex.export:dept'],
      director: ['dept_reports.export:all', 'treasury.void:all', 'venture_pool.export:all'],
      fin_checker: ['claims.void:all', 'dept_pool.export:all', 'treasury.void:all'],
      fin_maker: ['billing.export:all', 'treasury.export:all', 'venture_pool.export:all'],
      full: [],
      hr: ['revenue.export:all', 'team.manage:all'],
      office: [],
      revenue_director: [],
      revenue_team: [],
      staff: [],
      ultimate: [],
    })
  })

  // A stored cell that opened nothing (its pages were held back) is not carried over.
  it('drops only cells that opened nothing', () => {
    const drops = Object.fromEntries(Object.keys(PROD).map(k => [k, lossesOf(cellsOf(PROD[k].cells), moved(k))]).filter(([, d]) => d.length))
    expect(drops).toEqual({ office: ['reports.view:all'] })
  })

  it('puts each template in the views its pages are in — the company-wide ones out of the Department view', () => {
    expect(views(moved('full'))).toEqual(['hr', 'fin', 'pri', 'rev'])
    expect(views(moved('fin_maker'))).toEqual(['fin', 'dept'])
    expect(views(moved('dept_head'))).toEqual(['dept'])
    expect(views(moved('staff'))).toEqual(['dept'])
    expect(views(moved('hr'))).toEqual(['hr', 'dept'])
    expect(views(moved('revenue_team'))).toEqual(['rev'])
    // Every portal template books a room (round 2) — Staff · Basic from its own view, the Department view.
    expect([...moved('staff')].sort()).toEqual([
      'dept.meeting_rooms.create', 'dept.meeting_rooms.view', 'dept.my_claims.create', 'dept.my_claims.edit', 'dept.my_claims.view', 'dept.overview.view',
    ])
  })
})

it('counts a view the way the rail does', () => {
  expect(viewCount('rev', new Set([grantOf('rev.today', 'view'), grantOf('rev.quote', 'create')]))).toEqual({ seen: 1, of: 11 })
})

describe('what the Permissions tab and a person’s window work with', () => {
  it('ticks a box with its View, and taking View away takes the tab', () => {
    const on = toggleBox(new Set(), 'fin.payments', 'approve')
    expect([...on].sort()).toEqual(['fin.payments.approve', 'fin.payments.view'])
    expect([...toggleBox(on, 'fin.payments', 'view')]).toEqual([])
    expect([...toggleBox(new Set(), 'hr.overview', 'create')]).toEqual([])
  })

  it('“all” ticks every box a tab has, and again none', () => {
    const all = toggleRow(new Set(), 'hr.director_pool')
    expect([...all].sort()).toEqual(['hr.director_pool.edit', 'hr.director_pool.view'])
    expect(toggleRow(all, 'hr.director_pool').size).toBe(0)
  })

  it('writes the cells the ticks stand for, the database’s way', () => {
    expect(cellRows(['dept.my_claims.view', 'dept.my_claims.create'])).toEqual([
      { function_key: 'claims', action: 'create', scope: 'own' },
      { function_key: 'claims', action: 'view', scope: 'own' },
    ])
  })

  it('a template shows the ticks it stored, else the ones its cells give', () => {
    const stored = templateTicks({ grants: {}, sensitive: [], baseRole: 'staff', tabs: ['dept.my_claims.view', 'nope.view'] }, CELL_KEYS)
    expect([...stored]).toEqual(['dept.my_claims.view'])
    const t = PROD.staff
    expect(templateTicks({ grants: grantsOf(t.cells), sensitive: t.sensitive, baseRole: t.baseRole, tabs: null }, CELL_KEYS)).toEqual(moved('staff'))
  })

  it('lays a person’s boxes over the title, and writes only the cells that differ', () => {
    const base = moved('fin_maker')
    // carrie on production: void on invoices, held back from Reconciliation.
    const ticks = personTicks(base, [
      { tab: 'fin.invoice', action: 'approve', granted: true },
      { tab: 'fin.reconciliation', action: 'view', granted: false }, { tab: 'fin.reconciliation', action: 'create', granted: false }, { tab: 'fin.reconciliation', action: 'edit', granted: false },
      { tab: 'fin.journal_entries', action: 'view', granted: false }, { tab: 'fin.journal_entries', action: 'create', granted: false }, { tab: 'fin.journal_entries', action: 'edit', granted: false },
    ])
    expect(boxesOf(base, ticks)).toHaveLength(7)
    expect(personCellRows(cellsOf(PROD.fin_maker.cells), ticks)).toEqual([
      { function_key: 'billing', action: 'export', scope: 'all' },
      { function_key: 'billing', action: 'void', scope: 'all' },
      { function_key: 'reconciliation', action: 'create', scope: null },
      { function_key: 'reconciliation', action: 'edit', scope: null },
      { function_key: 'reconciliation', action: 'view', scope: null },
      { function_key: 'treasury', action: 'export', scope: 'all' },
      { function_key: 'venture_pool', action: 'export', scope: 'all' },
    ])
    expect(sameTicks(personTicks(base, []), base)).toBe(true)
  })

  it('a box whose tab they cannot View is not theirs', () => {
    const ticks = personTicks(new Set(['dept.overview.view']), [{ tab: 'fin.invoice', action: 'approve', granted: true }])
    expect([...ticks]).toEqual(['dept.overview.view'])
  })
})

// carrie on production (2026-10-11): Finance · Maker, with six cells of her own from before tabs.
const CARRIE: PersonCells = {
  'billing.export': 'all', 'billing.void': 'all', 'treasury.export': 'all',
  'reconciliation.create': 'none', 'reconciliation.edit': 'none', 'reconciliation.view': 'none',
}
const record = (key: string, tabs: string[] | null = null) => ({ grants: grantsOf(PROD[key].cells), sensitive: PROD[key].sensitive, baseRole: PROD[key].baseRole, tabs })
const theirs = (key: string, cells: PersonCells, boxes: Parameters<typeof personTicks>[1] = []) => ticksOfPerson(record(key), { boxes, cells }, CELL_KEYS)
const savedAs = (ticks: Set<string>) => ({ ticks, cells: cellsFromTabs(ticks) })

describe('a person’s own boxes follow their template', () => {
  it('reads a person’s ticks: their boxes over the title, else what their own cells give, else the title’s', () => {
    expect(theirs('staff', {})).toEqual(moved('staff'))
    expect(theirs('staff', {}, [{ tab: 'dept.my_claims', action: 'edit', granted: false }]).has('dept.my_claims.edit')).toBe(false)
    // carrie’s cells: void on billing (both of its tabs’ Approve), held back from Reconciliation and Journal Entries.
    expect(boxesOf(moved('fin_maker'), theirs('fin_maker', CARRIE))).toEqual([
      { tab: 'fin.billing_allocator', action: 'approve', granted: true },
      { tab: 'fin.invoice', action: 'approve', granted: true },
      { tab: 'fin.journal_entries', action: 'create', granted: false },
      { tab: 'fin.journal_entries', action: 'edit', granted: false },
      { tab: 'fin.journal_entries', action: 'view', granted: false },
      { tab: 'fin.reconciliation', action: 'create', granted: false },
      { tab: 'fin.reconciliation', action: 'edit', granted: false },
      { tab: 'fin.reconciliation', action: 'view', granted: false },
    ])
  })

  it('her template’s first save on tabs: her boxes kept, her cells only what the template no longer gives', () => {
    const before = moved('fin_maker')
    const again = reapplied(before, theirs('fin_maker', CARRIE), savedAs(before))
    expect(again.tabs).toHaveLength(8)
    // The exports are the template’s own now (the user’s merge), so they are no longer hers.
    expect(again.cells).toEqual([
      { function_key: 'billing', action: 'void', scope: 'all' },
      { function_key: 'reconciliation', action: 'create', scope: null },
      { function_key: 'reconciliation', action: 'edit', scope: null },
      { function_key: 'reconciliation', action: 'view', scope: null },
    ])
    // And she loses none of the cells she held.
    const held = new Map([...cellsOf(PROD.fin_maker.cells)].filter(([c]) => !c.startsWith('reconciliation.')))
    for (const c of ['billing.export', 'billing.void', 'treasury.export']) held.set(c, 'all')
    expect(lossesOf(held, personTicks(before, again.tabs))).toEqual([])
  })

  it('a box held back from one tab does not hold back what the template later gives through another', () => {
    const before = moved('staff')
    const mine = personTicks(before, [{ tab: 'dept.my_claims', action: 'edit', granted: false }])
    expect(personCellRows(cellsOf(PROD.staff.cells), mine)).toEqual([{ function_key: 'claims', action: 'edit', scope: null }])
    // Later the template edits everybody’s claims (Finance › Claims · Edit): their old ✕ would have closed it.
    const after = new Set([...before, 'fin.overview.view', 'fin.claims.view', 'fin.claims.edit'])
    expect(reapplied(before, mine, savedAs(after))).toEqual({ tabs: [{ tab: 'dept.my_claims', action: 'edit', granted: false }], cells: [] })
  })

  it('a cell given with an old tick does not outlive it', () => {
    const before = moved('fin_maker')
    const mine = personTicks(before, [{ tab: 'fin.invoice', action: 'approve', granted: true }])
    // The template stops showing Invoice at all: Approve on it goes with it, and billing.void with that.
    const after = new Set([...before].filter(g => !g.startsWith('fin.invoice.') && !g.startsWith('fin.billing_allocator.')))
    expect(reapplied(before, mine, savedAs(after))).toEqual({ tabs: [], cells: [] })
  })

  it('says when their stored cells are not what their boxes give over today’s template', () => {
    const base = moved('staff')
    const mine = personTicks(base, [{ tab: 'dept.my_claims', action: 'edit', granted: false }])
    expect(cellsOutOfStep(cellsOf(PROD.staff.cells), mine, { 'claims.edit': 'none' })).toBe(false)
    expect(cellsOutOfStep(cellsOf(PROD.staff.cells), mine, {})).toBe(true)
    expect(cellsOutOfStep(cellsOf(PROD.staff.cells), mine, { 'claims.edit': 'own' })).toBe(true)
  })
})

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
import {
  announceLayout,
  applyOrder,
  clampWidth,
  COLUMN_GROUPS,
  groupColumns,
  onLayoutAnnounced,
  isCustomised,
  moveColumn,
  sameLayout,
  sanitizeLayout,
  EMPTY_LAYOUT,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  MIN_STORED_WIDTH,
  storedWidth,
  toggleHidden,
  visibleColumns,
} from './table-layout'

const cols = (...keys: string[]) => keys.map((key) => ({ key }))
const keys = (list: { key: string }[]) => list.map((c) => c.key)

describe('applyOrder', () => {
  it('leaves the default order alone when nothing was saved', () => {
    expect(keys(applyOrder(cols('no', 'company', 'amount', 'status'), []))).toEqual(['no', 'company', 'amount', 'status'])
  })

  it('runs the columns in the saved order', () => {
    expect(keys(applyOrder(cols('no', 'company', 'amount', 'status'), ['status', 'amount', 'no', 'company']))).toEqual([
      'status', 'amount', 'no', 'company',
    ])
  })

  it('keeps pinned columns at their edge whatever the saved order says', () => {
    const table = [
      { key: '_select', pinned: 'start' as const },
      { key: 'no' },
      { key: 'amount' },
      { key: 'action', pinned: 'end' as const },
    ]
    expect(keys(applyOrder(table, ['action', 'amount', '_select', 'no']))).toEqual(['_select', 'amount', 'no', 'action'])
  })

  it('puts a column added since back beside its default neighbour, not at the far end', () => {
    // Saved when the table had no/company/status; "description" was added after company.
    const now = cols('no', 'company', 'description', 'status')
    expect(keys(applyOrder(now, ['status', 'company', 'no']))).toEqual(['status', 'company', 'description', 'no'])
  })

  it('a new FIRST column leads', () => {
    expect(keys(applyOrder(cols('date', 'no', 'company'), ['company', 'no']))).toEqual(['date', 'company', 'no'])
  })

  it('forgets a column that no longer exists, and a key saved twice', () => {
    expect(keys(applyOrder(cols('no', 'amount'), ['gone', 'amount', 'amount', 'no']))).toEqual(['amount', 'no'])
  })
})

describe('moveColumn', () => {
  const order = ['no', 'company', 'amount', 'status']
  it('drops before or after the target', () => {
    expect(moveColumn(order, 'status', 'company', 'before')).toEqual(['no', 'status', 'company', 'amount'])
    expect(moveColumn(order, 'no', 'amount', 'after')).toEqual(['company', 'amount', 'no', 'status'])
  })
  it('is a no-op onto itself or an unknown target', () => {
    expect(moveColumn(order, 'no', 'no', 'after')).toBe(order)
    expect(moveColumn(order, 'no', 'nowhere', 'after')).toBe(order)
  })
})

describe('sanitizeLayout', () => {
  it('accepts a well-formed layout', () => {
    expect(sanitizeLayout({ order: ['a', 'b'], widths: { a: 180 } })).toEqual({ order: ['a', 'b'], widths: { a: 180 }, hidden: [] })
    // A row saved before the Columns panel has no `hidden` at all.
    expect(sanitizeLayout({ order: [], widths: {}, hidden: ['pool', 7, 'pool', ''] }).hidden).toEqual(['pool'])
  })
  it('clamps widths and drops what is not a width', () => {
    const got = sanitizeLayout({ order: ['a'], widths: { a: 5, b: 99999, c: 'wide', d: -3, e: '240' } })
    expect(got.widths).toEqual({ a: MIN_STORED_WIDTH, b: MAX_COLUMN_WIDTH, e: 240 })
    // A tick-box column measured at 39px comes back as 39, not the dragging minimum.
    expect(sanitizeLayout({ widths: { _select: 39 } }).widths).toEqual({ _select: 39 })
  })
  it('turns anything else into the default arrangement', () => {
    for (const junk of [null, undefined, 'x', 7, [], { order: 'no' }]) {
      expect(isCustomised(sanitizeLayout(junk))).toBe(false)
    }
    expect(sanitizeLayout({ order: ['a', 3, '', 'a'] }).order).toEqual(['a'])
  })
})

describe('the small ones', () => {
  it('clampWidth rounds and bounds a dragged width', () => {
    expect(clampWidth(123.6)).toBe(124)
    expect(clampWidth(1)).toBe(MIN_COLUMN_WIDTH)
  })
  it('storedWidth keeps a measured width that is narrower than a drag may go', () => {
    expect(storedWidth(39.4)).toBe(39)
    expect(storedWidth(2)).toBe(MIN_STORED_WIDTH)
    expect(storedWidth(5000)).toBe(MAX_COLUMN_WIDTH)
  })
  it('isCustomised is false only for the default', () => {
    expect(isCustomised(EMPTY_LAYOUT)).toBe(false)
    expect(isCustomised({ order: [], widths: { a: 100 }, hidden: [] })).toBe(true)
    expect(isCustomised({ order: ['a'], widths: {}, hidden: [] })).toBe(true)
    expect(isCustomised({ order: [], widths: {}, hidden: ['pool'] })).toBe(true)
  })
  it('sameLayout compares order and widths', () => {
    const l = (order: string[], widths: Record<string, number>, hidden: string[] = []) => ({ order, widths, hidden })
    expect(sameLayout(l(['a', 'b'], { a: 1 }), l(['a', 'b'], { a: 1 }))).toBe(true)
    expect(sameLayout(l(['a', 'b'], {}), l(['b', 'a'], {}))).toBe(false)
    expect(sameLayout(l([], { a: 1 }), l([], { a: 2 }))).toBe(false)
    expect(sameLayout(l([], {}, ['x', 'y']), l([], {}, ['y', 'x']))).toBe(true) // which are hidden, not in what order
    expect(sameLayout(l([], {}, ['x']), l([], {}, []))).toBe(false)
  })
})

describe('visibleColumns', () => {
  const table = [
    { key: '_select', pinned: 'start' as const },
    { key: 'no' },
    { key: 'pool' },
    { key: 'amount' },
    { key: 'action', pinned: 'end' as const },
  ]
  it('drops what was unticked', () => {
    expect(keys(visibleColumns(table, ['pool']))).toEqual(['_select', 'no', 'amount', 'action'])
  })
  it('never hides a pinned column, or one that opts out', () => {
    expect(keys(visibleColumns(table, ['_select', 'action', 'pool']))).toEqual(['_select', 'no', 'amount', 'action'])
    const fixed = [{ key: 'no', hideable: false }, { key: 'pool' }, { key: 'amount' }]
    expect(keys(visibleColumns(fixed, ['no', 'pool']))).toEqual(['no', 'amount'])
  })
  it('shows everything rather than a table of nothing', () => {
    expect(keys(visibleColumns(table, ['no', 'pool', 'amount']))).toEqual(['_select', 'no', 'pool', 'amount', 'action'])
  })
  it('ignores a hidden key the table no longer has', () => {
    expect(keys(visibleColumns(table, ['gone']))).toEqual(['_select', 'no', 'pool', 'amount', 'action'])
  })
})

describe('toggleHidden', () => {
  const hideable = ['no', 'pool', 'amount']
  it('unticks and ticks a column', () => {
    expect(toggleHidden([], 'pool', false, hideable)).toEqual(['pool'])
    expect(toggleHidden(['pool', 'no'], 'pool', true, hideable)).toEqual(['no'])
  })
  it('refuses to untick the last column on show', () => {
    const hidden = ['no', 'pool']
    expect(toggleHidden(hidden, 'amount', false, hideable)).toBe(hidden)
  })
  it('unticking twice changes nothing', () => {
    const hidden = ['pool']
    expect(toggleHidden(hidden, 'pool', false, hideable)).toBe(hidden)
  })
})

describe('groupColumns', () => {
  const names = (cs: Array<{ key: string; group?: string }>) => groupColumns(cs).map((g) => [g.name, g.columns.map((c) => c.key)])

  it('lists the headings in the one order every table uses, whatever order the table declares its columns in', () => {
    // Payments: Voucher #, Category, Pool, Payee, Amount, Date.
    const payments = [
      { key: 'no', group: '基本' },
      { key: 'category', group: '入账' },
      { key: 'pool', group: '入账' },
      { key: 'payee', group: '基本' },
      { key: 'amount', group: '金额' },
      { key: 'maturity', group: '日期' },
    ]
    expect(names(payments)).toEqual([
      ['基本', ['no', 'payee']],
      ['金额', ['amount']],
      ['日期', ['maturity']],
      ['入账', ['category', 'pool']],
    ])
    expect(COLUMN_GROUPS).toEqual(['基本', '金额', '日期', '入账'])
  })

  it('puts a heading only this table has after those, and the columns with none last', () => {
    expect(names([{ key: 'added' }, { key: 'splits', group: '分摊' }, { key: 'name', group: '基本' }, { key: 'note' }])).toEqual([
      ['基本', ['name']],
      ['分摊', ['splits']],
      ['', ['added', 'note']],
    ])
  })

  it('is one unnamed group when no column has a heading', () => {
    expect(names([{ key: 'a' }, { key: 'b' }])).toEqual([['', ['a', 'b']]])
  })
})

describe('announcing a layout', () => {
  it('reaches the tables with the same id, sanitised, and no other', () => {
    const mine = vi.fn()
    const other = vi.fn()
    const stopMine = onLayoutAnnounced('payments.vouchers', mine)
    const stopOther = onLayoutAnnounced('receipts.vouchers', other)
    announceLayout('payments.vouchers', { order: [], widths: {}, hidden: ['pool'] })
    expect(mine).toHaveBeenCalledWith({ order: [], widths: {}, hidden: ['pool'] })
    expect(other).not.toHaveBeenCalled()

    // Anything else on that event name is reduced to what is safe to apply.
    window.dispatchEvent(new CustomEvent('table-layout', { detail: { tableId: 'payments.vouchers', layout: { hidden: 'pool' } } }))
    expect(mine).toHaveBeenLastCalledWith(EMPTY_LAYOUT)
    window.dispatchEvent(new CustomEvent('table-layout'))
    expect(mine).toHaveBeenCalledTimes(2)

    stopMine()
    stopOther()
    announceLayout('payments.vouchers', EMPTY_LAYOUT)
    expect(mine).toHaveBeenCalledTimes(2)
  })
})

import { effectiveLayout, EMPTY_LAYOUT as NO_LAYOUT } from './table-layout'

// 2026-10-07 (user: "我要能定这个 as default"): a table can carry a default
// arrangement for everyone; the account's own still wins.
describe('effectiveLayout', () => {
  const own = { order: ['b', 'a'], widths: {}, hidden: [] }
  const dflt = { order: ['c'], widths: { c: 120 }, hidden: ['a'] }
  it("is the account's own arrangement when it has one", () => {
    expect(effectiveLayout(own, dflt)).toBe(own)
  })
  it("is the table's default when the account has none", () => {
    expect(effectiveLayout(NO_LAYOUT, dflt)).toBe(dflt)
  })
  it("is the code's arrangement when neither has one", () => {
    expect(effectiveLayout(NO_LAYOUT, NO_LAYOUT)).toEqual({ order: [], widths: {}, hidden: [] })
  })
})

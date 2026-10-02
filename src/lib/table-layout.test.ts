import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
import {
  applyOrder,
  clampWidth,
  isCustomised,
  moveColumn,
  sameLayout,
  sanitizeLayout,
  EMPTY_LAYOUT,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  MIN_STORED_WIDTH,
  storedWidth,
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
    expect(sanitizeLayout({ order: ['a', 'b'], widths: { a: 180 } })).toEqual({ order: ['a', 'b'], widths: { a: 180 } })
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
    expect(isCustomised({ order: [], widths: { a: 100 } })).toBe(true)
    expect(isCustomised({ order: ['a'], widths: {} })).toBe(true)
  })
  it('sameLayout compares order and widths', () => {
    expect(sameLayout({ order: ['a', 'b'], widths: { a: 1 } }, { order: ['a', 'b'], widths: { a: 1 } })).toBe(true)
    expect(sameLayout({ order: ['a', 'b'], widths: {} }, { order: ['b', 'a'], widths: {} })).toBe(false)
    expect(sameLayout({ order: [], widths: { a: 1 } }, { order: [], widths: { a: 2 } })).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { commRatioContextFromRow, commRatioNoteRefusal, commRatioSavedFromRow, commRatioSetFromRow, sameRatio } from './comm-ratio'
import { readOrderBook } from './order-book'

// A bill's commission ratio in the Revenue app (2026-11-27, mig 20261127140500): the database's answers, field by field.
describe('member_comm_ratio_context, as the sheet reads it', () => {
  it('takes the bill, its margin, what its ladder pays, the ratio on it and why it cannot change', () => {
    expect(commRatioContextFromRow({
      orderId: 'o1', orderNo: 'HC-SO-2611-006', month: '2026-11', margin: 26.5,
      ladder: { label: 'Below margin Tier 3', multiplier: 0.25 },
      ratio: { pct: 0.75, by: 'KRIS', at: '2026-11-27T02:00:00+00:00', note: 'Repeat customer' },
      refusal: null,
    })).toEqual({
      orderId: 'o1', orderNo: 'HC-SO-2611-006', month: '2026-11', margin: 26.5,
      ladder: { label: 'Below margin Tier 3', multiplier: 0.25 },
      ratio: { pct: 0.75, by: 'KRIS', at: '2026-11-27T02:00:00+00:00', note: 'Repeat customer' },
      refusal: null,
    })
  })

  it('reads a bill with no margin yet, no band and no ratio — numeric as the database may send it', () => {
    expect(commRatioContextFromRow({
      orderId: 'o1', orderNo: 'HC-SO-2611-006', month: '2026-11', margin: null, ladder: { label: null, multiplier: '1' }, ratio: null,
      refusal: 'You cannot adjust the commission of your own bill.',
    })).toMatchObject({ margin: null, ladder: { label: null, multiplier: 1 }, ratio: null, refusal: 'You cannot adjust the commission of your own bill.' })
  })

  it('is nothing when it is not that shape', () => {
    expect(commRatioContextFromRow({ orderId: 'o1', orderNo: 'x', month: 'November' })).toBeNull()
    expect(commRatioContextFromRow({ orderNo: 'x', month: '2026-11' })).toBeNull()
    expect(commRatioContextFromRow({ orderId: 'o1', orderNo: 'x', month: '2026-11', margin: 'lots' })).toBeNull()
    expect(commRatioContextFromRow(null)).toBeNull()
  })

  it('never takes a ratio outside 0–100%', () => {
    expect(commRatioSetFromRow({ pct: 1.2, by: 'KRIS' })).toBeNull()
    expect(commRatioSetFromRow({ pct: -0.1 })).toBeNull()
    expect(commRatioSetFromRow({ pct: 0, by: '', at: null, note: '  ' })).toEqual({ pct: 0, by: null, at: null, note: null })
  })
})

describe('member_comm_ratio_set, as the app reads its answer', () => {
  it('says what was set, or that it was already so', () => {
    expect(commRatioSavedFromRow({ orderId: 'o1', orderNo: 'HC-SO-2611-006', ratio: 0.5, changed: true }))
      .toEqual({ orderId: 'o1', orderNo: 'HC-SO-2611-006', ratio: 0.5, changed: true })
    expect(commRatioSavedFromRow({ orderId: 'o1', orderNo: 'HC-SO-2611-006', ratio: null, changed: false }))
      .toEqual({ orderId: 'o1', orderNo: 'HC-SO-2611-006', ratio: null, changed: false })
    expect(commRatioSavedFromRow({ orderId: 'o1', orderNo: 'x', ratio: 2, changed: true })).toBeNull()
    expect(commRatioSavedFromRow({ orderId: 'o1', orderNo: 'x', ratio: 0.5 })).toBeNull()
  })
})

describe('the checks the sheet and the server share', () => {
  it('keeps why to 500 characters', () => {
    expect(commRatioNoteRefusal('x'.repeat(500))).toBeNull()
    expect(commRatioNoteRefusal('x'.repeat(501))).toBe('Keep why to 500 characters.')
    expect(commRatioNoteRefusal('')).toBeNull()
  })

  it('reads two ratios as the database keeps them, to the hundredth of a percent', () => {
    expect(sameRatio(0.75, 0.75000001)).toBe(true)
    expect(sameRatio(0.75, 0.7501)).toBe(false)
    expect(sameRatio(null, null)).toBe(true)
    expect(sameRatio(null, 1)).toBe(false)
  })
})

describe('the order books name a bill’s ratio', () => {
  const order = (over: Record<string, unknown> = {}) => ({
    id: 'o1', number: 'HC-SO-2611-006', date: '2026-11-06', week: '2026-11-06', revenue: 5000, kpiQty: 0, total: 10000, paid: 10000,
    sourceMonth: '2026-11', recognitionMonth: '2026-11', cleared: true, carried: false, lines: [], margin: 40, ...over,
  })
  const book = (o: Record<string, unknown>) => readOrderBook({ from: '2026-11', through: '2026-11', asOf: '2026-11-27', orders: [o] })

  it('reads who set it, when and why, beside the weight it counts at', () => {
    const read = book(order({ weight: 0.5, ratio: { pct: 0.5, by: 'KRIS', at: '2026-11-27T02:00:00+00:00', note: null } }))
    expect(read?.orders[0]).toMatchObject({ weight: 0.5, ratio: { pct: 0.5, by: 'KRIS', at: '2026-11-27T02:00:00+00:00', note: null } })
  })

  it('has none on a bill without one, nor from an answer that is not one', () => {
    expect(book(order())?.orders[0]).not.toHaveProperty('ratio')
    expect(book(order({ ratio: { pct: 'half' } }))?.orders[0]).not.toHaveProperty('ratio')
  })
})

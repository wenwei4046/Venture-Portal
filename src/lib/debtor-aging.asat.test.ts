import { describe, expect, it } from 'vitest'
import { invoicesAsAt, resolveAgingAsAt } from './debtor-aging'

// 2026-10-10 — Debtor Aging "As at" a month (the user's Claude Design
// handoff). The user's rule: by the invoice date — the invoices dated on or
// before the day, at what is still unpaid on them today, aged to that day.
// (When each was settled is not recorded for half the paid invoices, so the
// past is not re-read; the user chose this.)

describe('the day a month reads as at', () => {
  it('is the month’s last day for a past month', () => {
    expect(resolveAgingAsAt('2026-09', '2026-10-10')).toBe('2026-09-30')
    expect(resolveAgingAsAt('2026-02', '2026-10-10')).toBe('2026-02-28')
  })

  it('is today for this month, a future one, or nothing asked', () => {
    expect(resolveAgingAsAt('2026-10', '2026-10-10')).toBe('2026-10-10')
    expect(resolveAgingAsAt('2026-12', '2026-10-10')).toBe('2026-10-10')
    expect(resolveAgingAsAt(undefined, '2026-10-10')).toBe('2026-10-10')
    expect(resolveAgingAsAt('Sept', '2026-10-10')).toBe('2026-10-10')
  })
})

describe('the invoices as at a day', () => {
  const inv = (id: string, invoiceDate: string | null) => ({ id, invoiceNo: id, payer: 'HC', invoiceDate, dueDate: null, amount: 100 })

  it('keeps those dated on or before the day', () => {
    const kept = invoicesAsAt([inv('a', '2026-09-30'), inv('b', '2026-10-01'), inv('c', '2026-08-02')], '2026-09-30')
    expect(kept.map((i) => i.id)).toEqual(['a', 'c'])
  })

  it('keeps an undated one — it cannot be told apart', () => {
    expect(invoicesAsAt([inv('x', null)], '2026-09-30').map((i) => i.id)).toEqual(['x'])
  })
})

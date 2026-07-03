import { describe, it, expect } from 'vitest'
import { buildDebtorAging, bucketForDaysOverdue, type RawInvoice } from './debtor-aging'

describe('bucketForDaysOverdue', () => {
  it('maps day counts to the right bucket (boundaries inclusive)', () => {
    expect(bucketForDaysOverdue(-5)).toBe('not_due')
    expect(bucketForDaysOverdue(0)).toBe('not_due')
    expect(bucketForDaysOverdue(1)).toBe('d1_30')
    expect(bucketForDaysOverdue(30)).toBe('d1_30')
    expect(bucketForDaysOverdue(31)).toBe('d31_60')
    expect(bucketForDaysOverdue(60)).toBe('d31_60')
    expect(bucketForDaysOverdue(90)).toBe('d61_90')
    expect(bucketForDaysOverdue(91)).toBe('d90_plus')
  })
})

describe('buildDebtorAging', () => {
  const asOf = '2026-07-03'
  const raw: RawInvoice[] = [
    { invoiceNo: 'A-1', payer: 'Carres', invoiceDate: '2026-06-29', dueDate: '2026-07-07', amount: 100 }, // not due
    { invoiceNo: 'A-2', payer: 'Carres', invoiceDate: '2026-06-01', dueDate: '2026-06-20', amount: 50 }, // 13 overdue → 1-30
    { invoiceNo: 'B-1', payer: '2990', invoiceDate: '2026-03-01', dueDate: '2026-03-15', amount: 200 }, // 110 overdue → 90+
    { invoiceNo: 'C-1', payer: 'Rygis', invoiceDate: '2026-06-15', dueDate: null, amount: 30 }, // no due date → age by invoice date (18d) → 1-30
  ]

  const out = buildDebtorAging(raw, asOf)

  it('grand total = sum of all outstanding', () => {
    expect(out.totals.total).toBe(380)
    expect(out.totals.count).toBe(4)
  })

  it('buckets each invoice by days past due (due date, or invoice date fallback)', () => {
    const byNo = Object.fromEntries(out.invoices.map((i) => [i.invoiceNo, i]))
    expect(byNo['A-1'].bucket).toBe('not_due')
    expect(byNo['A-2'].bucket).toBe('d1_30')
    expect(byNo['B-1'].bucket).toBe('d90_plus')
    expect(byNo['C-1'].bucket).toBe('d1_30') // fell back to invoice date
    expect(byNo['C-1'].daysOverdue).toBe(18)
  })

  it('groups by payer, largest outstanding first', () => {
    // totals: 2990=200, Carres=150, Rygis=30 → sorted desc
    expect(out.byPayer.map((p) => p.payer)).toEqual(['2990', 'Carres', 'Rygis'])
    const carres = out.byPayer.find((p) => p.payer === 'Carres')!
    expect(carres.total).toBe(150)
    expect(carres.buckets.not_due).toBe(100)
    expect(carres.buckets.d1_30).toBe(50)
  })

  it('bucket column totals reconcile to the grand total', () => {
    const b = out.totals.buckets
    expect(b.not_due + b.d1_30 + b.d31_60 + b.d61_90 + b.d90_plus).toBe(out.totals.total)
  })
})

import { describe, it, expect } from 'vitest'
import { buildDebtorAging, bucketForMonthsOld, type RawInvoice } from './debtor-aging'

describe('bucketForMonthsOld', () => {
  it('buckets by whole months old (this month = 0)', () => {
    expect(bucketForMonthsOld(-1)).toBe('this_month')
    expect(bucketForMonthsOld(0)).toBe('this_month')
    expect(bucketForMonthsOld(1)).toBe('m1')
    expect(bucketForMonthsOld(2)).toBe('m2')
    expect(bucketForMonthsOld(3)).toBe('m3')
    expect(bucketForMonthsOld(4)).toBe('m4')
    expect(bucketForMonthsOld(5)).toBe('m5_plus')
    expect(bucketForMonthsOld(12)).toBe('m5_plus')
  })
})

function inv(over: Partial<RawInvoice>): RawInvoice {
  return { id: over.invoiceNo ?? 'X', invoiceNo: 'X', payer: 'Carres', invoiceDate: '2026-07-01', dueDate: null, amount: 100, ...over }
}

describe('buildDebtorAging', () => {
  const asOf = '2026-07-06'

  it('ages by INVOICE date in calendar months, ignoring due date', () => {
    const out = buildDebtorAging(
      [
        inv({ invoiceNo: 'A-1', invoiceDate: '2026-07-05' }), // this month
        inv({ invoiceNo: 'A-2', invoiceDate: '2026-06-10' }), // 1 month
        inv({ invoiceNo: 'A-3', invoiceDate: '2026-05-28' }), // 2 months
        inv({ invoiceNo: 'A-4', invoiceDate: '2026-03-15' }), // 4 months
        // Due date is long overdue but the invoice is THIS month → still this_month.
        inv({ invoiceNo: 'A-5', invoiceDate: '2026-07-02', dueDate: '2026-01-01' }),
      ],
      asOf,
    )
    const byNo = Object.fromEntries(out.invoices.map((i) => [i.invoiceNo, i]))
    expect(byNo['A-1'].bucket).toBe('this_month')
    expect(byNo['A-1'].monthsOld).toBe(0)
    expect(byNo['A-2'].bucket).toBe('m1')
    expect(byNo['A-2'].monthsOld).toBe(1)
    expect(byNo['A-3'].bucket).toBe('m2')
    expect(byNo['A-4'].bucket).toBe('m4')
    expect(byNo['A-4'].monthsOld).toBe(4)
    expect(byNo['A-5'].bucket).toBe('this_month') // due date ignored
  })

  it('treats a missing invoice date as this month', () => {
    const out = buildDebtorAging([inv({ invoiceNo: 'N', invoiceDate: null })], asOf)
    expect(out.invoices[0].bucket).toBe('this_month')
    expect(out.invoices[0].monthsOld).toBe(0)
  })

  it('aggregates per payer and per bucket; buckets sum to the total', () => {
    const out = buildDebtorAging(
      [
        inv({ payer: 'Carres', invoiceDate: '2026-07-01', amount: 100 }),
        inv({ payer: 'Carres', invoiceDate: '2026-06-01', amount: 50 }),
        inv({ payer: '2990', invoiceDate: '2026-05-01', amount: 25.5 }),
      ],
      asOf,
    )
    const carres = out.byPayer.find((p) => p.payer === 'Carres')!
    expect(carres.buckets.this_month).toBe(100)
    expect(carres.buckets.m1).toBe(50)
    expect(carres.total).toBe(150)
    expect(carres.count).toBe(2)

    const b = out.totals.buckets
    expect(b.this_month + b.m1 + b.m2 + b.m3 + b.m4 + b.m5_plus).toBe(out.totals.total)
    expect(out.totals.total).toBe(175.5)
    expect(out.totals.count).toBe(3)
  })

  it('sorts invoices oldest first and payers by largest outstanding', () => {
    const out = buildDebtorAging(
      [
        inv({ invoiceNo: 'new', payer: 'Small', invoiceDate: '2026-07-01', amount: 10 }),
        inv({ invoiceNo: 'old', payer: 'Big', invoiceDate: '2026-04-01', amount: 999 }),
      ],
      asOf,
    )
    expect(out.invoices[0].invoiceNo).toBe('old') // oldest first
    expect(out.byPayer[0].payer).toBe('Big') // largest first
  })
})

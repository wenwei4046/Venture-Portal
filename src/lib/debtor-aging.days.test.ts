import { describe, expect, it } from 'vitest'
import { DAY_BUCKETS, buildDebtorAging, debtorAgingView, type RawInvoice } from './debtor-aging'

// 2026-10-09 — Debtor Aging by days for Finance's view (the user's Claude
// Design handoff), still aged by INVOICE date as the user chose in July 2026:
// 0–30, 31–60, 61–90 and 90+ days since the invoice.

const inv = (id: string, payer: string, invoiceDate: string | null, amount: number): RawInvoice => ({
  id, invoiceNo: id, payer, invoiceDate, dueDate: null, amount,
})
const RAW = [
  inv('A', 'HOUZS Century', '2026-10-02', 64000),
  inv('B', 'HOUZS Design', '2026-08-20', 6000),
  inv('C', 'HOUZS Design', '2026-07-20', 6000),
  inv('D', 'HOUZS Design', '2026-06-01', 18000),
  inv('E', 'HOUZS Kitchen', null, 4000),
]

describe('debtor aging by days since the invoice', () => {
  it('names its columns by days', () => {
    expect(DAY_BUCKETS.map((b) => b.label)).toEqual(['0–30 days', '31–60 days', '61–90 days', '90+ days'])
  })

  it('puts each invoice by its age in days, an undated one in the first', () => {
    const v = debtorAgingView(RAW, '2026-10-09')
    const byId = new Map(v.invoices.map((i) => [i.id, i]))
    expect(byId.get('A')?.bucket).toBe('d0_30')
    expect(byId.get('B')?.bucket).toBe('d31_60')
    expect(byId.get('C')?.bucket).toBe('d61_90')
    expect(byId.get('D')?.bucket).toBe('d90_plus')
    expect(byId.get('E')?.bucket).toBe('d0_30')
    expect(v.totals.buckets).toEqual({ d0_30: 68000, d31_60: 6000, d61_90: 6000, d90_plus: 18000 })
    expect(v.totals.total).toBe(98000)
    expect(v.byPayer.map((p) => p.payer)).toEqual(['HOUZS Century', 'HOUZS Design', 'HOUZS Kitchen'])
    expect(v.invoices[0].id).toBe('D') // oldest first
  })

  // The page's Total receivable card reads the month aging's totals beside
  // this table (2026-10-17: the month columns themselves went with the Dept
  // Manager's view) — the two must agree on the money, the companies and the
  // invoices.
  it('agrees with the month aging on the total, each company and the count', () => {
    const v = debtorAgingView(RAW, '2026-10-09')
    const a = buildDebtorAging(RAW, '2026-10-09')
    expect(v.totals.total).toBe(a.totals.total)
    expect(v.totals.count).toBe(a.totals.count)
    expect(v.byPayer.map((p) => [p.payer, p.total, p.count])).toEqual(a.byPayer.map((p) => [p.payer, p.total, p.count]))
  })
})

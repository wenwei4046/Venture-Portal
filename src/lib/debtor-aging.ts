// Debtor aging: outstanding (issued, not-yet-paid) invoices bucketed by how far
// past their due date they are, as of a given day. Pure + deterministic so it
// unit-tests cleanly — the page/export pass in the invoices and "today".

import dayjs from 'dayjs'

export interface RawInvoice {
  invoiceNo: string
  payer: string
  invoiceDate: string | null
  dueDate: string | null
  amount: number
}

export type AgingBucket = 'not_due' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'

export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: 'not_due', label: 'Not yet due' },
  { key: 'd1_30', label: '1–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90_plus', label: '90+ days' },
]

export interface AgingInvoice extends RawInvoice {
  daysOverdue: number // 0 when not yet due
  bucket: AgingBucket
}

export interface AgingPayerRow {
  payer: string
  buckets: Record<AgingBucket, number>
  total: number
  count: number
}

export interface DebtorAging {
  asOf: string
  invoices: AgingInvoice[] // most overdue first
  byPayer: AgingPayerRow[] // largest outstanding first
  totals: { buckets: Record<AgingBucket, number>; total: number; count: number }
}

export function bucketForDaysOverdue(days: number): AgingBucket {
  if (days <= 0) return 'not_due'
  if (days <= 30) return 'd1_30'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'd90_plus'
}

const r2 = (n: number): number => Math.round(n * 100) / 100
const emptyBuckets = (): Record<AgingBucket, number> => ({
  not_due: 0,
  d1_30: 0,
  d31_60: 0,
  d61_90: 0,
  d90_plus: 0,
})

export function buildDebtorAging(raw: RawInvoice[], asOfISO: string): DebtorAging {
  const asOf = dayjs(asOfISO)

  const invoices: AgingInvoice[] = raw.map((r) => {
    // Age by due date; fall back to the invoice date when no due date is set.
    const ref = r.dueDate || r.invoiceDate
    const days = ref ? asOf.diff(dayjs(ref), 'day') : 0
    return { ...r, daysOverdue: Math.max(0, days), bucket: bucketForDaysOverdue(days) }
  })

  const map = new Map<string, AgingPayerRow>()
  const totals = { buckets: emptyBuckets(), total: 0, count: 0 }

  for (const inv of invoices) {
    let row = map.get(inv.payer)
    if (!row) {
      row = { payer: inv.payer, buckets: emptyBuckets(), total: 0, count: 0 }
      map.set(inv.payer, row)
    }
    row.buckets[inv.bucket] = r2(row.buckets[inv.bucket] + inv.amount)
    row.total = r2(row.total + inv.amount)
    row.count++
    totals.buckets[inv.bucket] = r2(totals.buckets[inv.bucket] + inv.amount)
    totals.total = r2(totals.total + inv.amount)
    totals.count++
  }

  const byPayer = [...map.values()].sort((a, b) => b.total - a.total)
  invoices.sort((a, b) => b.daysOverdue - a.daysOverdue)

  return { asOf: asOfISO, invoices, byPayer, totals }
}

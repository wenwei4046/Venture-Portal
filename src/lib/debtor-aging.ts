// Debtor aging: outstanding (issued, not-yet-paid) invoices bucketed by how many
// calendar months old they are BY INVOICE DATE, as of a given day. Pure +
// deterministic so it unit-tests cleanly — the page/export pass in the invoices
// and "today". (User 2026-07: age by invoice date, not due date.)

import dayjs from 'dayjs'

export interface RawInvoice {
  id: string
  invoiceNo: string
  payer: string
  invoiceDate: string | null
  dueDate: string | null
  amount: number
}

export type AgingBucket = 'this_month' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5_plus'

export const AGING_BUCKETS: { key: AgingBucket; label: string }[] = [
  { key: 'this_month', label: 'Current' },
  { key: 'm1', label: '1 month' },
  { key: 'm2', label: '2 months' },
  { key: 'm3', label: '3 months' },
  { key: 'm4', label: '4 months' },
  { key: 'm5_plus', label: '5 & over' },
]

export interface AgingInvoice extends RawInvoice {
  monthsOld: number // whole calendar months since the invoice month (0 = this month)
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
  invoices: AgingInvoice[] // oldest first
  byPayer: AgingPayerRow[] // largest outstanding first
  totals: { buckets: Record<AgingBucket, number>; total: number; count: number }
}

export function bucketForMonthsOld(months: number): AgingBucket {
  if (months <= 0) return 'this_month'
  if (months === 1) return 'm1'
  if (months === 2) return 'm2'
  if (months === 3) return 'm3'
  if (months === 4) return 'm4'
  return 'm5_plus'
}

const r2 = (n: number): number => Math.round(n * 100) / 100
const emptyBuckets = (): Record<AgingBucket, number> => ({
  this_month: 0,
  m1: 0,
  m2: 0,
  m3: 0,
  m4: 0,
  m5_plus: 0,
})

export function buildDebtorAging(raw: RawInvoice[], asOfISO: string): DebtorAging {
  const asOfMonth = dayjs(asOfISO).startOf('month')

  const invoices: AgingInvoice[] = raw.map((r) => {
    // Age by INVOICE date, in whole calendar months (this month = 0). A missing
    // invoice date is treated as current month.
    const months = r.invoiceDate
      ? asOfMonth.diff(dayjs(r.invoiceDate).startOf('month'), 'month')
      : 0
    const monthsOld = Math.max(0, months)
    return { ...r, monthsOld, bucket: bucketForMonthsOld(monthsOld) }
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
  invoices.sort((a, b) => b.monthsOld - a.monthsOld)

  return { asOf: asOfISO, invoices, byPayer, totals }
}

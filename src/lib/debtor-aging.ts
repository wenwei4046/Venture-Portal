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
  description?: string | null
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

// ─── By days (2026-10-09, the Finance revamp handoff) ───────────────────────
// The aging reports age in days, still from the INVOICE date (the July rule):
// 0–30, 31–60, 61–90 and 90+ days since the invoice. (The month buckets above
// still give the page its totals; the month columns went with the Dept
// Manager's view, 2026-10-17.)

export type DayBucket = 'd0_30' | 'd31_60' | 'd61_90' | 'd90_plus'

export const DAY_BUCKETS: { key: DayBucket; label: string }[] = [
  { key: 'd0_30', label: '0–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90_plus', label: '90+ days' },
]

export function bucketForDaysOld(days: number): DayBucket {
  if (days <= 30) return 'd0_30'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'd90_plus'
}

export interface AgingColumn {
  key: string
  label: string
}

/** An aging by days, its columns named — what the page and the exports draw. */
export interface AgingView {
  asOf: string
  columns: readonly AgingColumn[]
  /** Oldest first; the age in days. */
  invoices: Array<RawInvoice & { age: number; bucket: string }>
  byPayer: Array<{ payer: string; buckets: Record<string, number>; total: number; count: number }>
  totals: { buckets: Record<string, number>; total: number; count: number }
}

export function debtorAgingView(raw: RawInvoice[], asOfISO: string): AgingView {
  const asOf = dayjs(asOfISO).startOf('day')
  const empty = (): Record<string, number> => Object.fromEntries(DAY_BUCKETS.map((b) => [b.key, 0]))
  const invoices = raw.map((r) => {
    const age = r.invoiceDate ? Math.max(0, asOf.diff(dayjs(r.invoiceDate).startOf('day'), 'day')) : 0
    return { ...r, age, bucket: bucketForDaysOld(age) as string }
  })
  const map = new Map<string, { payer: string; buckets: Record<string, number>; total: number; count: number }>()
  const totals = { buckets: empty(), total: 0, count: 0 }
  for (const inv of invoices) {
    let row = map.get(inv.payer)
    if (!row) {
      row = { payer: inv.payer, buckets: empty(), total: 0, count: 0 }
      map.set(inv.payer, row)
    }
    row.buckets[inv.bucket] = r2(row.buckets[inv.bucket] + inv.amount)
    row.total = r2(row.total + inv.amount)
    row.count++
    totals.buckets[inv.bucket] = r2(totals.buckets[inv.bucket] + inv.amount)
    totals.total = r2(totals.total + inv.amount)
    totals.count++
  }
  invoices.sort((a, b) => b.age - a.age)
  return { asOf: asOfISO, columns: DAY_BUCKETS, invoices, byPayer: [...map.values()].sort((a, b) => b.total - a.total), totals }
}

// ── As at a month (2026-10-10, the user's Claude Design handoff) ────────────
// The user's rule: by the invoice date — the invoices dated on or before the
// day, at what is still unpaid on them today, aged to that day. When each one
// was settled is not recorded for about half the paid invoices (netting,
// inter-billing), so the past is not re-read.

/** The day a month reads as at: a past month's last day; this month, a
 *  future one or nothing asked → today. */
export function resolveAgingAsAt(month: string | undefined | null, today: string): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month) || month >= today.slice(0, 7)) return today
  return dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD')
}

/** The invoices dated on or before the day (an undated one stays — it cannot be told apart). */
export function invoicesAsAt<T extends { invoiceDate: string | null }>(raw: T[], asAt: string): T[] {
  return raw.filter((i) => !i.invoiceDate || i.invoiceDate <= asAt)
}

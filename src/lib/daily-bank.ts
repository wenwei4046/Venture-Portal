// Daily Bank dashboard — pure maths (user 2026-08-11, modelled on their other
// system's "BANK × DEPARTMENT" board). One day, every bank, split across
// department columns:
//   Balance B/F (GL to yesterday) → Received today (green) → Pending
//   (submitted-awaiting-Principal PVs, orange) → Available = current − pending.
// Paid items are already inside the balance (shown as one grey line when
// nonzero, so the walk visibly ties: B/F + in − paid = current).
//
// Column mapping:
//   JE segment  corporate→Venture · director/director_office/finance/hr/
//               marketing→own column · treasury/unallocated/NULL→Unassigned
//   PVS pool    venture_pool + dept_pool_venture_office→Venture ·
//               dept_pool_<dept>→own column · anything else→Unassigned

const r2 = (n: number) => Math.round(n * 100) / 100

export const DB_COLUMNS = [
  'venture',
  'director',
  'director_office',
  'finance',
  'hr',
  'marketing',
  'unassigned',
] as const
export type DbColumn = (typeof DB_COLUMNS)[number]

export const DB_COLUMN_LABELS: Record<DbColumn, string> = {
  venture: 'Venture',
  director: 'Director',
  director_office: 'Director Office',
  finance: 'Finance',
  hr: 'HR',
  marketing: 'Marketing',
  unassigned: 'Unassigned',
}

export function columnForSegment(segment: string | null | undefined): DbColumn {
  switch (segment) {
    case 'corporate':
      return 'venture'
    case 'director':
      return 'director'
    case 'director_office':
      return 'director_office'
    case 'finance':
      return 'finance'
    case 'hr':
      return 'hr'
    case 'marketing':
      return 'marketing'
    default:
      return 'unassigned' // treasury, unallocated, NULL, anything new
  }
}

export function columnForPool(pool: string | null | undefined): DbColumn {
  switch (pool) {
    case 'venture_pool':
    case 'dept_pool_venture_office':
      return 'venture'
    case 'dept_pool_director':
      return 'director'
    case 'dept_pool_director_office':
      return 'director_office'
    case 'dept_pool_finance':
      return 'finance'
    case 'dept_pool_hr':
      return 'hr'
    case 'dept_pool_marketing':
      return 'marketing'
    default:
      return 'unassigned'
  }
}

export type SegAmounts = Record<DbColumn, number>

export const emptyAmounts = (): SegAmounts => ({
  venture: 0,
  director: 0,
  director_office: 0,
  finance: 0,
  hr: 0,
  marketing: 0,
  unassigned: 0,
})

export function addAmounts(target: SegAmounts, col: DbColumn, amount: number): void {
  target[col] = r2(target[col] + amount)
}

export const sumAmounts = (a: SegAmounts): number =>
  r2(DB_COLUMNS.reduce((s, c) => s + a[c], 0))

const combine = (a: SegAmounts, b: SegAmounts, sign: 1 | -1): SegAmounts => {
  const out = emptyAmounts()
  for (const c of DB_COLUMNS) out[c] = r2(a[c] + sign * b[c])
  return out
}

export interface PendingItem {
  voucherNo: string
  payee: string
  description: string
  amounts: SegAmounts
  total: number
}

export interface ReceiptItem {
  voucherNo: string
  payer: string
  description: string
  amount: number
}

export interface BankDay {
  bankId: string
  bankName: string
  glCode: string
  bf: SegAmounts
  inToday: SegAmounts
  outToday: SegAmounts
  /** bf + inToday − outToday — the true balance at end of the day. */
  current: SegAmounts
  pending: PendingItem[]
  pendingTotal: SegAmounts
  /** current − pending — the cash truly free per column. */
  available: SegAmounts
  /** Itemised receipts (OR vouchers) for the simple view. */
  receipts: ReceiptItem[]
  /** GL in − itemised receipts: JV/transfer money in with no OR voucher. */
  otherInToday: number
}

export function buildBankDay(input: {
  bankId: string
  bankName: string
  glCode: string
  bf: SegAmounts
  inToday: SegAmounts
  outToday: SegAmounts
  pending: PendingItem[]
  receipts: ReceiptItem[]
}): BankDay {
  const current = combine(combine(input.bf, input.inToday, 1), input.outToday, -1)
  const pendingTotal = emptyAmounts()
  for (const p of input.pending) {
    for (const c of DB_COLUMNS) addAmounts(pendingTotal, c, p.amounts[c])
  }
  const available = combine(current, pendingTotal, -1)
  const otherInToday = r2(
    sumAmounts(input.inToday) - input.receipts.reduce((s, r) => s + r.amount, 0),
  )
  return {
    ...input,
    current,
    pendingTotal,
    available,
    otherInToday,
  }
}

export function totalsAcrossBanks(banks: BankDay[]): { available: SegAmounts; grand: number } {
  const available = emptyAmounts()
  for (const b of banks) {
    for (const c of DB_COLUMNS) addAmounts(available, c, b.available[c])
  }
  return { available, grand: sumAmounts(available) }
}

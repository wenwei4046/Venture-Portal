// Daily Bank dashboard — pure maths (user 2026-08-11, modelled on their other
// system's "BANK × DEPARTMENT" board). One day, every bank, split across
// department columns:
//   Balance B/F (GL to yesterday) → Received today (green) → Pending
//   (submitted-awaiting-Principal PVs, orange) → Available = current − pending.
// Paid items are already inside the balance (shown as one grey line when
// nonzero, so the walk visibly ties: B/F + in − paid = current).
//
// Column mapping (user 2026-08-11: department cash must MATCH the Dept Pool
// page's "Per-bank breakdown" — 直接拿现有 department 的 cash 当做 opening):
//   JE segment  director/director_office/finance/hr/marketing→own column ·
//               corporate + treasury + unallocated + NULL→Venture (same as the
//               dept-pool page's Venture (Office) = corporate+treasury slice)
//   PVS pool    dept_pool_<dept>→own column · venture_pool /
//               dept_pool_venture_office / anything else→Venture
// On TOP of the GL slice, today's board folds each department's pool-vs-GL
// inter-billing gap into the primary bank (applyPoolAdjust below) — exactly
// the dept-pool page's algorithm — so the row totals equal the department
// cash the user already trusts.

const r2 = (n: number) => Math.round(n * 100) / 100

export const DB_COLUMNS = [
  'venture',
  'director',
  'director_office',
  'finance',
  'hr',
  'marketing',
] as const
// Dynamic departments (2026-08-24): columns can now grow at runtime, so the
// column type is plain string. The six cores above stay first and fixed.
export type DbColumn = string

export const DB_COLUMN_LABELS: Record<string, string> = {
  venture: 'Venture',
  director: 'Director',
  director_office: 'Director Office',
  finance: 'Finance',
  hr: 'HR',
  marketing: 'Marketing',
}

// Extra full departments (dept registry): key = segment_key, one column each.
// Set by the data layer before building; empty = the classic six columns, so
// every existing test and caller behaves bit-identically.
let EXTRA_DB_COLUMNS: Array<{ key: string; label: string }> = []

export function setExtraDbColumns(extras: Array<{ key: string; label: string }>): void {
  EXTRA_DB_COLUMNS = extras.filter(e => !(DB_COLUMNS as readonly string[]).includes(e.key))
}

export function dbColumns(): string[] {
  return [...DB_COLUMNS, ...EXTRA_DB_COLUMNS.map(e => e.key)]
}

export function dbColumnsWithLabels(): Array<{ key: string; label: string }> {
  return [
    ...DB_COLUMNS.map(k => ({ key: k as string, label: DB_COLUMN_LABELS[k] })),
    ...EXTRA_DB_COLUMNS,
  ]
}

export function columnForSegment(segment: string | null | undefined): DbColumn {
  switch (segment) {
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
      // Dynamically provisioned dept segments get their own column.
      if (segment && EXTRA_DB_COLUMNS.some(e => e.key === segment)) return segment
      return 'venture' // corporate, treasury, unallocated, NULL, anything new
  }
}

export function columnForPool(pool: string | null | undefined): DbColumn {
  switch (pool) {
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
    default: {
      // 'dept_pool_<segment_key>' of a provisioned dept → its own column.
      if (pool?.startsWith('dept_pool_')) {
        const key = pool.slice('dept_pool_'.length)
        if (EXTRA_DB_COLUMNS.some(e => e.key === key)) return key
      }
      return 'venture' // venture_pool, dept_pool_venture_office, unknown
    }
  }
}

export type SegAmounts = Record<string, number>

export const emptyAmounts = (): SegAmounts =>
  Object.fromEntries(dbColumns().map(c => [c, 0])) as SegAmounts

export function addAmounts(target: SegAmounts, col: DbColumn, amount: number): void {
  target[col] = r2((target[col] ?? 0) + amount)
}

export const sumAmounts = (a: SegAmounts): number =>
  r2(dbColumns().reduce((s, c) => s + (a[c] ?? 0), 0))

const combine = (a: SegAmounts, b: SegAmounts, sign: 1 | -1): SegAmounts => {
  const out = emptyAmounts()
  for (const c of dbColumns()) out[c] = r2((a[c] ?? 0) + sign * (b[c] ?? 0))
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
    for (const c of dbColumns()) addAmounts(pendingTotal, c, p.amounts[c] ?? 0)
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
    for (const c of dbColumns()) addAmounts(available, c, b.available[c] ?? 0)
  }
  return { available, grand: sumAmounts(available) }
}

/** Dept-pool page parity (its "Per-bank breakdown" algorithm): an
 *  inter-billing settle moves cash allocation in the dept_pools ledger with
 *  NO bank JE, so the pure-GL slice diverges from the "By department" pool
 *  balance. Fold each department's gap (pool balance − GL cross-bank total)
 *  into the PRIMARY bank's cell — the gaps net to ~0 across departments, so
 *  every bank column still foots to that bank's balance. `targets` = the
 *  dept_pool_balances figures per department column; `ventureOverlay` = the
 *  'Venture Office' pseudo-dept balance (an additive overlay, not a target).
 *  Applied to BOTH bf and current so the day's walk stays consistent;
 *  available is recomputed. */
export function applyPoolAdjust(
  banks: BankDay[],
  targets: Partial<Record<DbColumn, number>>,
  ventureOverlay: number,
  primaryBankId: string,
): BankDay[] {
  const primary = banks.find(b => b.bankId === primaryBankId)
  if (!primary) return banks

  const adjustFor = (col: DbColumn): number => {
    if (col === 'venture') return r2(ventureOverlay)
    const target = targets[col]
    if (target == null) return 0
    const glTotal = r2(banks.reduce((s, b) => s + (b.current[col] ?? 0), 0))
    return r2(target - glTotal)
  }

  return banks.map(b => {
    if (b.bankId !== primaryBankId) return b
    const bf = { ...b.bf }
    const current = { ...b.current }
    const available = { ...b.available }
    for (const c of dbColumns()) {
      const adj = adjustFor(c)
      if (adj === 0) continue
      bf[c] = r2((bf[c] ?? 0) + adj)
      current[c] = r2((current[c] ?? 0) + adj)
      available[c] = r2(current[c] - (b.pendingTotal[c] ?? 0))
    }
    return { ...b, bf, current, available }
  })
}

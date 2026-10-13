// Payroll's vouchers, for an account that may not see one person's pay.
//
// Three kinds of voucher come out of payroll, and each one either names a
// person or narrows down to one:
//
//   payroll_disbursement      one per person — the payee and their net pay
//                             (HR Payment's "Manual generate"; "Generate by
//                             Department" makes one per department)
//   payroll_statutory         one per body per department — "KWSP — Sep 2026
//                             payroll (IT · 1 staff)"
//   payroll_payment_request   the transfer that funds a department's payroll
//
// An account without `payroll_payouts` (lib/roles.ts canSeePayrollPayouts)
// gets them as totals: one line per batch, and inside it one line per
// department (2026-10-13) — none of which opens. The folding happens on the
// SERVER — a page takes these vouchers out of what it sends and puts the lines
// in their place — so no member reaches the browser.
//
// (user 2026-10-02: "我现在有 finance executive 了，我不希望他看到 payroll
// detail，也就是每个人的 payout".)

import { officeDay } from '@/lib/office-time'

/** The office's day a voucher or pool row was made, `YYYY-MM-DD` (its own date is UTC's). */
const madeOn = (createdAt: string) => officeDay(createdAt).format('YYYY-MM-DD')

export const PAYROLL_REFERENCE_TYPES = [
  'payroll_disbursement',
  'payroll_statutory',
  'payroll_payment_request',
] as const

export function isPayrollReference(referenceType: string | null | undefined): boolean {
  return (PAYROLL_REFERENCE_TYPES as readonly string[]).includes(referenceType ?? '')
}

/** What a locked line is called when its voucher's description is not in the
 *  shape the payroll RPCs write. Never the description itself: an unexpected
 *  one may be the only place a name is. */
const PLAIN_HEAD: Record<string, string> = {
  payroll_disbursement: 'Payroll disbursement',
  payroll_statutory: 'Statutory contribution',
  payroll_payment_request: 'Payroll bank transfer',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthOf(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '')
  if (!m) return null
  const name = MONTHS[Number(m[2]) - 1]
  return name ? `${name} ${m[1]}` : null
}

export interface PayrollVoucherLike {
  reference_type?: string | null
  description?: string | null
  voucher_type?: string | null
  status: string
  amount: number | string
  payment_date?: string | null
  created_at: string
}

/**
 * The batch a payroll voucher folds into: what it is and which month — never
 * who, and never which department.
 *
 *   "Payroll disbursement Aug 2026 — <person>"      → "Payroll disbursement Aug 2026"
 *   "KWSP — Sep 2026 payroll (HR · 3 staff)"        → "KWSP Sep 2026"
 *   "Payroll bank transfer — Aug 2026 (Marketing)"  → "Payroll bank transfer Aug 2026"
 *
 * Everything after the dash is dropped except a leading month: the batch is
 * the month's, and its departments are lines inside it (payrollDepartmentOf).
 */
export function payrollBatchLabel(v: PayrollVoucherLike): string {
  const kind = v.reference_type ?? ''
  const description = v.description ?? ''
  const dash = description.indexOf(' — ')
  if (dash <= 0) {
    const month = monthOf(v.payment_date) ?? monthOf(v.created_at)
    return `${PLAIN_HEAD[kind] ?? 'Payroll'}${month ? ` ${month}` : ''}`
  }
  const head = description.slice(0, dash).trim()
  // A salary batch already carries its month in the head.
  if (kind === 'payroll_disbursement') return head
  const month = /^([A-Za-z]{3,9} \d{4})\b/.exec(description.slice(dash + 3).trim())?.[1]
  return month ? `${head} ${month}` : head
}

// ── By department (2026-10-13) ──────────────────────────────────────────────
//
// The user, looking at the salary vouchers one by one: "他们本来是不能看到这些员工
// salary 的。现在他们就算能看到 pv，应该也是看到 by 整个部门才对". So a locked batch
// is not one bare total: inside it stands one line per department — its total,
// how many vouchers, where they stand. Never who.
//
// Where each voucher's money went is read off the text the payroll RPCs write,
// and a name is used only when the departments table knows it: whatever else
// stands in that place may be part of a person's name.

/** Payroll's own groups beside the departments table's names. */
export const DIRECTORS = 'Directors'
const WHOLE_PAYROLL: Record<string, string> = {
  staff: 'All staff',
  directors: DIRECTORS,
  'staff + directors': 'All staff + directors',
}
/** A department the text does not name in a shape known here. */
export const OTHER_DEPARTMENT = 'Other'
/** A funding transfer for the month as a whole. */
export const ALL_DEPARTMENTS = 'All departments'

function knownDepartment(candidate: string | undefined, departments: ReadonlySet<string>): string | null {
  const c = candidate?.trim()
  if (!c) return null
  if (departments.has(c)) return c
  if (c === DIRECTORS) return DIRECTORS
  return WHOLE_PAYROLL[c.toLowerCase()] ?? null
}

/** "… (HR · 3 people)" → "HR · 3 people"; the last bracket, so a person's own bracket never counts. */
const lastBracket = (text: string) => /\(([^()]+)\)$/.exec(text)?.[1]

/**
 * The department a payroll voucher paid, by what its own text says:
 *
 *   "Payroll net Sep 2026 — <person> (Marketing)"                → Marketing
 *   "Payroll disbursement Sep 2026 — Marketing · net · 12 staff"  → Marketing
 *   "Director salary Sep 2026 — <person>"                        → Directors
 *   "KWSP — Aug 2026 payroll (HR · 3 people)"                    → HR
 *   "KWSP (EPF) — Jun 2026 payroll — Finance"                    → Finance
 *   "SOCSO — Jul 2026 payroll (staff + directors)"               → All staff + directors
 *   "Payroll bank transfer — Aug 2026"                           → All departments
 *
 * Anything else is "Other" — never the text itself.
 */
export function payrollDepartmentOf(v: PayrollVoucherLike, departments: ReadonlySet<string>): string {
  const kind = v.reference_type ?? ''
  const description = (v.description ?? '').trim()
  const dash = description.indexOf(' — ')
  const head = dash > 0 ? description.slice(0, dash).trim() : description
  const tail = dash > 0 ? description.slice(dash + 3).trim() : ''
  if (kind === 'payroll_disbursement') {
    if (/^Director salar(?:y|ies)\b/.test(head)) return DIRECTORS
    if (!tail) return OTHER_DEPARTMENT
    // One person's voucher names their department last; a department's
    // voucher ("Generate by Department") starts with it.
    return (
      knownDepartment(lastBracket(tail), departments) ??
      knownDepartment(tail.includes(' · ') ? tail.split(' · ')[0] : undefined, departments) ??
      OTHER_DEPARTMENT
    )
  }
  if (kind === 'payroll_statutory') {
    if (!tail) return OTHER_DEPARTMENT
    const lastDash = tail.lastIndexOf(' — ')
    return (
      knownDepartment(lastBracket(tail)?.split(' · ')[0], departments) ??
      knownDepartment(lastDash >= 0 ? tail.slice(lastDash + 3) : undefined, departments) ??
      OTHER_DEPARTMENT
    )
  }
  if (kind === 'payroll_payment_request') {
    if (/^Director salary\b/.test(head)) return DIRECTORS
    return knownDepartment(lastBracket(tail), departments) ?? ALL_DEPARTMENTS
  }
  return OTHER_DEPARTMENT
}

/** What a set of payroll vouchers comes to: how many, how much, where they stand. */
export interface PayrollTally {
  count: number
  /** Of the vouchers that are not voided. */
  total: number
  /** The latest payment (else creation) date among them. */
  latest: string
  /** "26 paid" · "20 paid · 6 pending approval". */
  statusText: string
  /** How many in each status — summed again when lines are put together. */
  statusCounts: Record<string, number>
  statuses: string[]
}

/** One department's line inside a locked batch. */
export interface DepartmentLine extends PayrollTally {
  department: string
}

/** One payroll batch as an account without `payroll_payouts` sees it. */
export interface LockedBatch extends PayrollTally {
  /** "Payroll disbursement Sep 2026" — unique, so also the React key. */
  label: string
  /** The kind of voucher it holds (payroll_disbursement for the Payroll batches tab). */
  referenceType: string
  /** Department by department, the largest total first. */
  departments: DepartmentLine[]
  // What the ledger's filters ask of a batch:
  voucherType: string
  firstCreated: string
  lastCreated: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** "12 paid · 1 pending approval" — the most first, then by name. */
export function statusTextOf(counts: Record<string, number>, word: (status: string) => string = (s) => s.replace('_', ' ')): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([s, n]) => `${n} ${word(s)}`)
    .join(' · ')
}

function tally(members: PayrollVoucherLike[]): PayrollTally {
  const statusCounts: Record<string, number> = {}
  for (const m of members) statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1
  return {
    count: members.length,
    total: r2(members.filter((m) => m.status !== 'voided').reduce((s, m) => s + Number(m.amount), 0)),
    latest: members.reduce((d, m) => {
      const at = m.payment_date ?? m.created_at
      return at > d ? at : d
    }, ''),
    statusText: statusTextOf(statusCounts),
    statusCounts,
    statuses: Object.keys(statusCounts),
  }
}

/**
 * Fold payroll vouchers into their batches, newest first, each with its
 * departments. `departments` is every department's name (the departments
 * table) — a department the text names that is not in it stands as "Other".
 */
export function lockPayrollBatches(vouchers: PayrollVoucherLike[], departments: ReadonlySet<string> = new Set()): LockedBatch[] {
  const byLabel = new Map<string, PayrollVoucherLike[]>()
  for (const v of vouchers) {
    const label = payrollBatchLabel(v)
    const list = byLabel.get(label)
    if (list) list.push(v)
    else byLabel.set(label, [v])
  }
  const batches = [...byLabel.entries()].map(([label, members]): LockedBatch => {
    const created = members.map((m) => m.created_at).sort()
    const byDepartment = new Map<string, PayrollVoucherLike[]>()
    for (const m of members) {
      const department = payrollDepartmentOf(m, departments)
      const list = byDepartment.get(department)
      if (list) list.push(m)
      else byDepartment.set(department, [m])
    }
    return {
      label,
      ...tally(members),
      referenceType: members[0].reference_type ?? '',
      departments: [...byDepartment.entries()]
        .map(([department, inIt]): DepartmentLine => ({ department, ...tally(inIt) }))
        .sort((a, b) => b.total - a.total || a.department.localeCompare(b.department)),
      voucherType: members[0].voucher_type ?? '',
      firstCreated: created[0],
      lastCreated: created[created.length - 1],
    }
  })
  return batches.sort((a, b) => (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : a.label.localeCompare(b.label)))
}

export interface LedgerFilters {
  tab: string
  typeFilter: string
  poolFilter: string
  fromFilter: string
  toFilter: string
  minFilter: number | null
  maxFilter: number | null
  qFilter: string
}

/**
 * The ledger's URL filters, asked of a locked batch.
 *
 * A batch is always shown whole — the same count and total under every filter
 * it passes — because a filter answered from INSIDE it would be a way to read
 * its members: a pool is a department (and a department can be one person),
 * an amount range sounds out single vouchers, and a status tab would total the
 * one voucher that is still pending. So a pool or an amount filter hides the
 * locked batches, a status tab keeps a batch that has any voucher in that
 * status, and a search matches the batch's own name only.
 */
// ── A department pool's ledger ──────────────────────────────────────────────
//
// Every pool row a voucher writes starts with its number — "PV HV-PV-202609-0286:
// Payroll disbursement Aug 2026 — <person> (<dept>)" (adjustPool in
// lib/voucher-paid-helpers.ts) — so the HR pool's History names each person
// paid. For an account without Payroll payouts those rows fold into one line
// per batch per day, the way Payments folds the vouchers (2026-10-05, user:
// "department pool 她还是要看到的 … 不给她看 detail / history 罢了").

export function poolRowVoucherNo(description: string | null | undefined): string | null {
  const m = /^PV (HV-(?:PV|OR)-\d{6}-\d{4}):/.exec(description ?? '')
  return m ? m[1] : null
}

export interface PoolRowLike {
  id: string
  transaction_type: string
  amount: number | string
  description: string | null
  created_at: string
  period_month: string | null
}

/** One line standing for the payroll rows of a batch on a day. */
export interface LockedPoolRow {
  id: string
  transaction_type: string
  amount: number
  description: string
  created_at: string
  period_month: string | null
  locked: true
  count: number
}

/** A pool row whose voucher is not at hand, but whose text is a salary line. */
const PER_PERSON_ROW = /^(?:PV \S+: )?((?:Payroll disbursement|Director salary) [A-Z][a-z]{2} \d{4}) — /

/**
 * Fold the payroll rows of a pool ledger for a viewer who may not see one
 * person's pay. `vouchers` maps a voucher number to the voucher that wrote the
 * row; a row whose voucher is not payroll's — or has no number at all, like a
 * void or a manual JV — passes through as it is. Rows arrive newest first, and
 * a folded line stands where its latest member stood.
 */
export function foldPayrollPoolRows<T extends PoolRowLike>(
  rows: readonly T[],
  vouchers: ReadonlyMap<string, PayrollVoucherLike>,
): Array<T | LockedPoolRow> {
  const out: Array<T | LockedPoolRow> = []
  const groups = new Map<string, LockedPoolRow & { label: string }>()
  for (const row of rows) {
    const no = poolRowVoucherNo(row.description)
    const voucher = no ? vouchers.get(no) : undefined
    let label: string | null = null
    if (voucher && isPayrollReference(voucher.reference_type)) label = payrollBatchLabel(voucher)
    else if (!voucher) label = PER_PERSON_ROW.exec(row.description ?? '')?.[1] ?? null
    if (!label) {
      out.push(row)
      continue
    }
    const key = `${label}|${madeOn(row.created_at)}|${row.transaction_type}`
    const group = groups.get(key)
    if (group) {
      group.amount = r2(group.amount + Number(row.amount))
      group.count += 1
      if (group.period_month !== row.period_month) group.period_month = null
      continue
    }
    const folded: LockedPoolRow & { label: string } = {
      id: `locked-${key}`,
      transaction_type: row.transaction_type,
      amount: r2(Number(row.amount)),
      description: '',
      created_at: row.created_at,
      period_month: row.period_month,
      locked: true,
      count: 1,
      label,
    }
    groups.set(key, folded)
    out.push(folded)
  }
  for (const g of groups.values()) {
    g.description = `${g.label} · ${g.count} 笔 · 只显示总数`
  }
  return out
}

export function filterLockedBatches(batches: LockedBatch[], f: LedgerFilters): LockedBatch[] {
  if (f.poolFilter || f.minFilter !== null || f.maxFilter !== null) return []
  return batches.filter((b) => {
    if (f.tab !== 'all' && !b.statuses.includes(f.tab)) return false
    if (f.typeFilter && b.voucherType !== f.typeFilter) return false
    if (f.fromFilter && madeOn(b.lastCreated) < f.fromFilter) return false
    if (f.toFilter && madeOn(b.firstCreated) > f.toFilter) return false
    if (f.qFilter && !b.label.toLowerCase().includes(f.qFilter)) return false
    return true
  })
}

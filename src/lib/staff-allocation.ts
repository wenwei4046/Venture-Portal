// Staff billing allocation — pure helpers for the /hr-costing/allocation
// editor. A staff member's employer cost (gross + EPF/SOCSO/EIS ER) is split
// across subsidiaries by percentage; the unallocated remainder is HV's own
// share and is never billed. The SQL side (get_staff_billing_allocation RPC)
// aggregates per dept × company; these helpers cover form validation, the
// per-staff RM preview shown to HR before saving, and the 5-line invoice
// breakdown Finance bills (Salary / Allowance / EPF / SOCSO / EIS).

import dayjs from 'dayjs'
import { dayLabel, topupKindLabel, type RowStatus, type TopupKind } from '@/lib/payroll-lifecycle'

export interface AllocationRow {
  companyId: string
  /** Percentage 0–100 as entered in the form (NOT the 0–1 DB fraction). */
  pct: number
}

export type AllocationValidation = { ok: true } | { ok: false; error: string }

const EPSILON = 0.005 // 2dp form inputs; tolerate float noise

/**
 * Validate one staff member's allocation rows.
 * Rules: no duplicate company, each pct in (0, 100], sum ≤ 100.
 * An empty list is valid — it means 100% HV-absorbed, nothing billed.
 */
export function validateAllocationRows(rows: AllocationRow[]): AllocationValidation {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.companyId) return { ok: false, error: 'Every row needs a company' }
    if (seen.has(row.companyId)) {
      return { ok: false, error: 'Duplicate company — merge the rows' }
    }
    seen.add(row.companyId)
    if (!Number.isFinite(row.pct) || row.pct <= 0) {
      return { ok: false, error: 'Percentage must be greater than 0' }
    }
    if (row.pct > 100) return { ok: false, error: 'Percentage cannot exceed 100' }
  }
  const total = rows.reduce((s, r) => s + r.pct, 0)
  if (total > 100 + EPSILON) {
    return { ok: false, error: `Total is ${total.toFixed(2)}% — cannot exceed 100%` }
  }
  return { ok: true }
}

/** Unallocated (HV-absorbed) percentage, clamped at 0. */
export function hvRemainderPct(rows: AllocationRow[]): number {
  const total = rows.reduce((s, r) => s + r.pct, 0)
  return Math.max(0, Math.round((100 - total) * 100) / 100)
}

export interface AllocationPreviewLine {
  companyId: string
  pct: number
  amount: number
}

export interface AllocationPreview {
  lines: AllocationPreviewLine[]
  /** Sum of the billed (rounded) lines. */
  billedTotal: number
  /** employerCost − billedTotal: HV's own share, absorbs rounding drift. */
  hvAmount: number
}

/**
 * RM preview for one staff member: each company line rounds to 2dp
 * individually (matching the SQL aggregation); the HV share is the exact
 * remainder, so lines + HV always reconcile to the employer cost.
 *
 * On a full 100% split, per-line rounding can overshoot the cost by a sen —
 * the excess comes off the LAST line so HV never shows a negative share.
 */
export function allocationPreview(
  employerCost: number,
  rows: AllocationRow[],
): AllocationPreview {
  const lines = rows.map((r) => ({
    companyId: r.companyId,
    pct: r.pct,
    amount: Math.round(employerCost * r.pct) / 100, // cost × pct/100, 2dp
  }))
  let billedTotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  let hvAmount = Math.round((employerCost - billedTotal) * 100) / 100
  if (hvAmount < 0 && lines.length > 0) {
    const last = lines[lines.length - 1]
    last.amount = Math.round((last.amount + hvAmount) * 100) / 100
    billedTotal = Math.round((billedTotal + hvAmount) * 100) / 100
    hvAmount = 0
  }
  return { lines, billedTotal, hvAmount }
}

// ─── The split follows the payroll row (2026-09-30) ──────────────────────────
//
// User 2026-09-30: once somebody's payroll is Completed their billing split
// must not change. The split takes the payroll row's own lock — it changes
// only while the row is a draft (a Resubmit or Second payroll makes it one
// again while that is open), never in a month Closed for good — and every
// split row belongs to a payroll row, so the editor lists exactly the payroll's
// people. The database refuses the same, in the same words
// (guard_staff_allocation_follows_payroll); these decide what the page offers.

export interface SplitLockInput {
  status: RowStatus
  /** Paid through the Revenue team: completed by their close on Comm Cal. */
  revenue: boolean
  completedAt: string | null
  /** Set while the row is unlocked for a Resubmit or a Second payroll. */
  topupOpenedAt: string | null
  topupKind: TopupKind | null
  monthClosed: boolean
}

export interface SplitLock {
  locked: boolean
  /** The chip beside the name: where the person's pay stands. */
  label: string
  tone: 'muted' | 'accent' | 'alert' | 'ledger'
  /** How a refusal names the state ('Completed', 'with Finance', 'paid'). */
  state: string | null
  /** What to do, and where, to change the split. Null while it can change. */
  wayBack: string | null
}

/** Whether one person's split can change, and what the card says about it. */
export function splitLock(input: SplitLockInput): SplitLock {
  if (input.monthClosed) {
    return { locked: true, label: 'Closed for good', tone: 'ledger', state: 'closed for good', wayBack: null }
  }
  const topup = input.topupOpenedAt != null
  switch (input.status) {
    case 'completed':
      return {
        locked: true,
        label: topup
          ? `${topupKindLabel(input.topupKind)} ready`
          : `Completed ${dayLabel(input.completedAt)}`.trim(),
        tone: topup ? 'accent' : 'ledger',
        state: 'Completed',
        wayBack: input.revenue ? 'Reopen them on Comm Cal' : 'Unlock them on HR › Payroll',
      }
    case 'submitted':
      return { locked: true, label: 'With Finance', tone: 'alert', state: 'with Finance', wayBack: 'Resubmit them on HR › Payroll' }
    case 'paid':
      return { locked: true, label: 'Paid', tone: 'ledger', state: 'paid', wayBack: 'Resubmit them on HR › Payroll' }
    case 'draft':
    default:
      return topup
        ? { locked: false, label: `${topupKindLabel(input.topupKind)} · editing`, tone: 'accent', state: null, wayBack: null }
        : { locked: false, label: 'Draft', tone: 'muted', state: null, wayBack: null }
  }
}

/**
 * The refusal, word for word what the database raises:
 * "TAN YONG HONG's September 2026 pay is Completed — its billing split is
 * locked with it. Unlock them on HR › Payroll to change it".
 */
export function splitLockMessage(name: string, monthLabel: string, lock: SplitLock): string {
  if (lock.wayBack == null) {
    return `Payroll for ${monthLabel} is closed for good — its billing splits cannot change`
  }
  return `${name}'s ${monthLabel} pay is ${lock.state} — its billing split is locked with it. ${lock.wayBack} to change it`
}

export interface SplitCopyPlan<T> {
  /** Last month's rows to write into this month. */
  rows: T[]
  /** People whose split is copied. */
  copied: number
  /** On this month's payroll but past draft — their split is left alone. */
  locked: number
  /** Split last month, not on this month's payroll — nothing to split. */
  notOnPayroll: number
}

/**
 * Copy from last month, person by person: only somebody on this month's
 * payroll, still editable, with no split of their own yet. Anybody already
 * split this month is left alone and not counted — the copy never overwrites.
 *
 * `payroll` maps this month's staff_id → whether their split can change.
 */
export function planSplitCopy<T extends { staff_id: string }>(
  lastMonth: readonly T[],
  payroll: ReadonlyMap<string, boolean>,
  alreadySplit: ReadonlySet<string>,
): SplitCopyPlan<T> {
  const rows: T[] = []
  const copied = new Set<string>()
  const locked = new Set<string>()
  const notOnPayroll = new Set<string>()
  for (const r of lastMonth) {
    if (alreadySplit.has(r.staff_id)) continue
    const editable = payroll.get(r.staff_id)
    if (editable === undefined) notOnPayroll.add(r.staff_id)
    else if (!editable) locked.add(r.staff_id)
    else {
      rows.push(r)
      copied.add(r.staff_id)
    }
  }
  return { rows, copied: copied.size, locked: locked.size, notOnPayroll: notOnPayroll.size }
}

/** What a copy did, including who it left alone and why. */
export function splitCopyNote(
  counts: Pick<SplitCopyPlan<unknown>, 'copied' | 'locked' | 'notOnPayroll'>,
): string {
  const { copied, locked, notOnPayroll } = counts
  const parts: string[] = []
  if (copied > 0) parts.push(`Copied splits for ${copied} staff.`)
  if (locked > 0) {
    parts.push(`${locked} locked with their payroll ${locked === 1 ? 'was' : 'were'} left alone.`)
  }
  if (notOnPayroll > 0) {
    parts.push(
      `${notOnPayroll} not on this month's payroll ${notOnPayroll === 1 ? 'was' : 'were'} skipped.`,
    )
  }
  return parts.length > 0
    ? parts.join(' ')
    : 'Nothing to copy — no last-month splits, or everyone already set.'
}

// ─── Invoice line breakdown (user sample 2026-07-03) ─────────────────────────
//
// One invoice per company per dept, five lines:
//   Salary - Jun'26 (HR)     ← prorated basic − deduction (absorbs sen drift)
//   Allowance - Jun'26 (HR)  ← allowances + OT + commission
//   EPF - Jun'26 (HR)        ← employer contributions
//   SOCSO - Jun'26 (HR)
//   EIS - Jun'26 (HR)
// Zero components are skipped; the lines always sum to the company total.

export interface AllocationComponents {
  salary: number
  allowance: number
  epf: number
  socso: number
  eis: number
}

export interface InvoiceLineDraft {
  description: string
  amount: number
}

/** "Jun'26"-style short label from a YYYY-MM or YYYY-MM-DD period. */
export function periodShortLabel(period: string): string {
  return dayjs(period.length === 7 ? `${period}-01` : period).format("MMM[']YY")
}

export function buildAllocationInvoiceLines(
  components: AllocationComponents,
  periodShort: string,
  deptName: string,
): InvoiceLineDraft[] {
  const suffix = `- ${periodShort} (${deptName})`
  return [
    { description: `Salary ${suffix}`, amount: components.salary },
    { description: `Allowance ${suffix}`, amount: components.allowance },
    { description: `EPF ${suffix}`, amount: components.epf },
    { description: `SOCSO ${suffix}`, amount: components.socso },
    { description: `EIS ${suffix}`, amount: components.eis },
  ].filter((l) => l.amount > 0)
}

// ─── Consolidated payroll invoice (2026-07-03) ───────────────────────────────
//
// One invoice per subsidiary combining HR + Finance + Director Office. Each dept
// contributes its 5 component lines, and every line carries its own `segment`
// so the invoice's GL / pool / P&L attribution routes PER LINE, not by the
// invoice-level billing_mode (see invoice_lines.segment migration). Descriptions
// omit the "(HR)" dept suffix — the department is shown as a group header on the
// document and carried in `segment` for routing (confirmed with user 2026-07-03).

/** gl_segment values for the staff-attribution departments (the ones that
 *  split payroll across subsidiaries + an HV own-share). Marketing is a direct
 *  cost centre — deliberately NOT here, so it's excluded from own-share
 *  inter-billing (user 2026-07). IT joined 2026-09-03 (user "接上") as
 *  segment 'it' (renamed from the provisioning slug 'infotech' same day,
 *  user: "segment 不是infotech, 而是真的叫IT") — pool 1100. */
export type PayrollSegment = 'hr' | 'finance' | 'director_office' | 'director' | 'it'

/** Which segments' own share goes back to Venture (Office) is NOT a constant
 *  any more (2026-09-29): it is `departments.own_share_billback`, set in
 *  Settings → Departments and overridable for a single run in the generate
 *  dialog. A literal here silently dropped every department added later —
 *  IT and Revenue Department both had to be chased down elsewhere for that
 *  reason. The column was seeded with what this list used to hold:
 *  finance, director_office, director, it.
 *
 *  The history it replaces: marketing was always excluded as a direct cost
 *  centre, and HR joined it on 2026-09-03 (user: "hr payroll 会用自己的pool,
 *  和marketing 一样,所以不用bill back,也不会bill to venture"). HR stays in the
 *  consolidated-billing map either way, so that when its staff do get
 *  subsidiary allocations again they bill out rather than being dropped. */

/** One group total, rounded to the sen. The two generate dialogs each had
 *  their own copy of this. */
export function componentsTotal(c: AllocationComponents): number {
  return Math.round((c.salary + c.allowance + c.epf + c.socso + c.eis) * 100) / 100
}

export interface DeptComponentGroup {
  /** Display label for the group header, e.g. "HR", "Finance", "Director Office". */
  deptLabel: string
  /** gl_segment written to each of this group's invoice_lines. */
  segment: PayrollSegment
  components: AllocationComponents
}

export interface ConsolidatedInvoiceLine {
  description: string
  amount: number
  segment: PayrollSegment
  /** Group header this line belongs under (for preview / PDF grouping). */
  deptLabel: string
}

/** The itemised lines of a consolidated invoice, in the order they appear.
 *  Exported since 2026-09-29: the adjustment invoice splits its gap the same
 *  way, and reads a billed line back by matching these labels. */
export const PAYROLL_COMPONENTS: Array<[keyof AllocationComponents, string]> = [
  ['salary', 'Salary'],
  ['allowance', 'Allowance'],
  ['epf', 'EPF'],
  ['socso', 'SOCSO'],
  ['eis', 'EIS'],
]

/** Segment → group-header label used on the consolidated document. */
export const PAYROLL_SEGMENT_LABEL: Record<PayrollSegment, string> = {
  hr: 'HR',
  finance: 'Finance',
  director_office: 'Director Office',
  director: 'Director',
  it: 'IT',
}

/**
 * Flatten dept component groups into the ordered line list for one subsidiary's
 * consolidated invoice. Zero-amount components are dropped; a group whose
 * components are all zero produces no lines. Each line keeps its `segment`.
 */
export function buildConsolidatedInvoiceLines(
  groups: DeptComponentGroup[],
  periodShort: string,
): ConsolidatedInvoiceLine[] {
  const out: ConsolidatedInvoiceLine[] = []
  for (const g of groups) {
    for (const [key, label] of PAYROLL_COMPONENTS) {
      const amount = g.components[key]
      if (amount > 0) {
        out.push({
          description: `${label} - ${periodShort}`,
          amount,
          segment: g.segment,
          deptLabel: g.deptLabel,
        })
      }
    }
  }
  return out
}

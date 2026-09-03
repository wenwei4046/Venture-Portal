// Staff billing allocation — pure helpers for the /hr-costing/allocation
// editor. A staff member's employer cost (gross + EPF/SOCSO/EIS ER) is split
// across subsidiaries by percentage; the unallocated remainder is HV's own
// share and is never billed. The SQL side (get_staff_billing_allocation RPC)
// aggregates per dept × company; these helpers cover form validation, the
// per-staff RM preview shown to HR before saving, and the 5-line invoice
// breakdown Finance bills (Salary / Allowance / EPF / SOCSO / EIS).

import dayjs from 'dayjs'

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
 *  segment 'infotech' — provisioned via the dept registry, pool 1100. */
export type PayrollSegment = 'hr' | 'finance' | 'director_office' | 'director' | 'infotech'

/** The staff-attribution segments eligible for own-share → Venture (Office)
 *  inter-billing (excludes marketing). */
export const OWN_SHARE_SEGMENTS: readonly PayrollSegment[] = ['hr', 'finance', 'director_office', 'director', 'infotech']

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

const PAYROLL_COMPONENTS: Array<[keyof AllocationComponents, string]> = [
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
  infotech: 'IT',
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

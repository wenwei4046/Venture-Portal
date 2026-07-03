// Staff billing allocation — pure helpers for the /hr-costing/allocation
// editor. A staff member's employer cost (gross + EPF/SOCSO/EIS ER) is split
// across subsidiaries by percentage; the unallocated remainder is HV's own
// share and is never billed. The SQL side (get_staff_billing_allocation RPC)
// aggregates per dept × company; these helpers cover form validation and the
// per-staff RM preview shown to HR before saving.

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
  const billedTotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  const hvAmount = Math.round((employerCost - billedTotal) * 100) / 100
  return { lines, billedTotal, hvAmount }
}

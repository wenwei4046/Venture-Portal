// Billing Allocator calculation engine — a faithful port of the user's Apps
// Script `calculateAllocation` (v5), minus the Area method (user dropped it).
//
// HOUZS Venture is always the payer. `companyId: null` means HV's OWN share:
// shown in previews, stored on the saved record, NEVER billed.
//
// Rounding parity with the script:
//   · headcount — each row rounds independently; NO penny fix (own + billed
//     rows can drift a sen from the original amount, as the sheet did)
//   · percentage / equal — billed rows must reconstruct the amount exactly, so
//     the penny difference lands on the LAST row
//   · custom — amounts are taken as typed
// (The invoice only carries billed rows, so its total is always exactly the
// sum of its lines either way.)

export type AllocMethod = 'headcount' | 'percentage' | 'equal' | 'custom'

export interface AllocCompany {
  id: string
  label: string // short_code or name — used in method_detail strings
}

/** One staff member's split, from the live list or a period snapshot. */
export interface StaffSplit {
  companyId: string | null // null = HOUZS Venture (own)
  pct: number
}

export interface ExpenseInput {
  description: string
  amount: number
  method: AllocMethod
  /** percentage method: must cover 100% across companies (no own share). */
  percentSplits?: { companyId: string; pct: number }[]
  /** custom method: explicit amounts per company. */
  customSplits?: { companyId: string; amount: number }[]
}

export interface AllocationLine {
  companyId: string | null // null = own share
  detail: string
  amount: number
  isOwnShare: boolean
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/** Total FTE per company (and own) from staff splits — active staff only,
 *  pct summed as headcount fractions (50% = 0.5 head). */
export function headcountByCompany(
  staffSplits: StaffSplit[],
): Map<string | null, number> {
  const map = new Map<string | null, number>()
  for (const s of staffSplits) {
    if (!(s.pct > 0)) continue
    map.set(s.companyId, (map.get(s.companyId) ?? 0) + s.pct / 100)
  }
  return map
}

export function allocateExpense(
  exp: ExpenseInput,
  ctx: { companies: AllocCompany[]; staffSplits: StaffSplit[]; hcLabel?: string },
): AllocationLine[] {
  const amount = Number(exp.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`"${exp.description}": amount must be positive`)
  }
  const byId = new Map(ctx.companies.map((c) => [c.id, c]))
  const lines: AllocationLine[] = []

  switch (exp.method) {
    case 'headcount': {
      const hc = headcountByCompany(ctx.staffSplits)
      let total = 0
      for (const v of hc.values()) total += v
      if (total <= 0) throw new Error(`"${exp.description}": no headcount data`)
      const label = ctx.hcLabel ?? 'current'
      // Own share first (the sheet unshifted it), then companies in list order.
      const own = hc.get(null) ?? 0
      if (own > 0) {
        lines.push({
          companyId: null,
          detail: `Head: ${own.toFixed(2)}/${total.toFixed(2)} (${label})`,
          amount: r2((amount * own) / total),
          isOwnShare: true,
        })
      }
      for (const c of ctx.companies) {
        const fte = hc.get(c.id) ?? 0
        if (fte <= 0) continue
        lines.push({
          companyId: c.id,
          detail: `Head: ${fte.toFixed(2)}/${total.toFixed(2)} (${label})`,
          amount: r2((amount * fte) / total),
          isOwnShare: false,
        })
      }
      if (lines.filter((l) => !l.isOwnShare).length === 0) {
        throw new Error(`"${exp.description}": headcount allocates nothing to any company`)
      }
      return lines
    }

    case 'percentage': {
      const splits = (exp.percentSplits ?? []).filter((s) => s.pct > 0)
      if (splits.length === 0) throw new Error(`"${exp.description}": no percentages set`)
      const pctTotal = r2(splits.reduce((s, x) => s + Number(x.pct), 0))
      if (pctTotal !== 100) {
        throw new Error(`"${exp.description}": percentages must total 100 (got ${pctTotal})`)
      }
      for (const s of splits) {
        if (!byId.has(s.companyId)) throw new Error(`"${exp.description}": unknown company in split`)
        lines.push({
          companyId: s.companyId,
          detail: `${s.pct}%`,
          amount: r2((amount * s.pct) / 100),
          isOwnShare: false,
        })
      }
      break
    }

    case 'equal': {
      if (ctx.companies.length === 0) throw new Error('No active companies to bill to.')
      const share = r2(amount / ctx.companies.length)
      for (const c of ctx.companies) {
        lines.push({
          companyId: c.id,
          detail: `Equal: 1/${ctx.companies.length}`,
          amount: share,
          isOwnShare: false,
        })
      }
      break
    }

    case 'custom': {
      const splits = (exp.customSplits ?? []).filter((s) => Number(s.amount) > 0)
      if (splits.length === 0) throw new Error(`"${exp.description}": no custom amounts set`)
      for (const s of splits) {
        if (!byId.has(s.companyId)) throw new Error(`"${exp.description}": unknown company in split`)
        lines.push({ companyId: s.companyId, detail: 'Custom', amount: r2(Number(s.amount)), isOwnShare: false })
      }
      // As typed — no reconciliation against `amount` (script parity).
      return lines
    }
  }

  // percentage / equal: force billed rows to reconstruct the amount exactly —
  // the penny lands on the last row (script parity).
  const sum = r2(lines.reduce((s, l) => s + l.amount, 0))
  const diff = r2(amount - sum)
  if (diff !== 0 && lines.length > 0) {
    const last = lines[lines.length - 1]
    last.amount = r2(last.amount + diff)
  }
  return lines
}

/** Billed total of an allocation (own share excluded). */
export function billedTotal(lines: AllocationLine[]): number {
  return r2(lines.filter((l) => !l.isOwnShare).reduce((s, l) => s + l.amount, 0))
}

/**
 * Pure payroll math — the TypeScript twin of compute_hr_monthly_payroll (DB trigger
 * in migration 122) and compute_commission (RPC in migration 123).
 *
 * All statutory / PCB lookup tables live in the database; this module accepts the
 * already-looked-up rates as inputs so it stays pure and testable. The intended
 * use is client-side preview in the payroll grid before saving; the DB trigger
 * remains the source of truth on write.
 *
 * Conventions:
 * - Dates are strings in YYYY-MM-DD format.
 * - periodMonth is the first of the month (YYYY-MM-01).
 * - Pro-rata applies to basic + statutory_allowance + ot_amount only. Commission
 *   and non-statutory allowance are full-month regardless of pro-rata ratio.
 *   (User decision 2026-04-17.)
 */

export interface ProrataBreakdown {
  daysWorked: number
  daysInMonth: number
  ratio: number
}

/**
 * Compute pro-rata days worked + ratio for a period.
 *
 * NULL hireDate = employed before period starts (full month).
 * NULL resignDate = still employed at period end (full month).
 * unpaidLeaveDays is subtracted from daysWorked and floored at 0.
 */
export function computeProrata(
  hireDate: string | null,
  resignDate: string | null,
  periodMonth: string,
  unpaidLeaveDays: number = 0,
): ProrataBreakdown {
  const periodStart = toDate(periodMonth)
  const periodEnd = lastDayOfMonth(periodStart)
  const daysInMonth = periodEnd.getUTCDate()

  const effectiveStart = hireDate ? maxDate(toDate(hireDate), periodStart) : periodStart
  const effectiveEnd = resignDate ? minDate(toDate(resignDate), periodEnd) : periodEnd

  let daysWorked = 0
  if (effectiveStart <= effectiveEnd) {
    daysWorked = daysBetweenInclusive(effectiveStart, effectiveEnd)
  }
  daysWorked = Math.max(daysWorked - unpaidLeaveDays, 0)

  const ratio = daysInMonth === 0 ? 0 : daysWorked / daysInMonth

  return { daysWorked, daysInMonth, ratio }
}

export interface CommissionRule {
  ruleName: string
  ruleType: 'tiered_per_unit' | 'pct_of_base'
  tierConfig?: Array<{ from: number; to: number | null; rate: number }>
  pct?: number
  baseSource?:
    | 'staff_sales_count'
    | 'staff_sales_amount'
    | 'dept_np'
    | 'company_sales'
    | 'team_commission_sum'
  effectiveFrom: string
  effectiveTo?: string | null
}

export interface CommissionInputs {
  salesCount: number
  salesAmount: number
}

export interface CommissionResult {
  perRule: Array<{ ruleName: string; amount: number }>
  total: number
}

/**
 * Sum commission from all rules that are active in the given period.
 *
 * Mirrors compute_commission (migration 123) exactly — tiered_per_unit and
 * staff_sales_{count,amount} are fully wired; dept_np / company_sales /
 * team_commission_sum return 0 (stubbed until Spec 2+).
 */
export function splitCommission(
  rules: CommissionRule[],
  inputs: CommissionInputs,
  periodMonth: string,
): CommissionResult {
  const perRule: Array<{ ruleName: string; amount: number }> = []
  const period = toDate(periodMonth)

  for (const rule of rules) {
    // Skip inactive rules
    if (toDate(rule.effectiveFrom) > period) continue
    if (rule.effectiveTo && toDate(rule.effectiveTo) < period) continue

    let amount = 0
    if (rule.ruleType === 'tiered_per_unit') {
      if (!rule.tierConfig) continue
      for (const tier of rule.tierConfig) {
        const from = tier.from
        const to = tier.to
        let qty: number
        if (to == null) {
          qty = Math.max(0, inputs.salesCount - from + 1)
        } else {
          qty = Math.max(0, Math.min(inputs.salesCount, to) - from + 1)
        }
        amount += qty * tier.rate
      }
    } else if (rule.ruleType === 'pct_of_base') {
      const pct = rule.pct ?? 0
      switch (rule.baseSource) {
        case 'staff_sales_count':
          amount = inputs.salesCount * pct
          break
        case 'staff_sales_amount':
          amount = inputs.salesAmount * pct
          break
        default:
          amount = 0 // dept_np / company_sales / team_commission_sum stubbed
      }
    }
    perRule.push({ ruleName: rule.ruleName, amount: round2(amount) })
  }

  const total = round2(perRule.reduce((s, r) => s + r.amount, 0))
  return { perRule, total }
}

export interface PayrollRowInput {
  basicSalary: number
  statutoryAllowance: number
  nonStatutoryAllowance: number
  otAmount: number
  commissionAmount: number
  unpaidLeaveDays: number
  hireDate: string | null
  resignationDate: string | null
  periodMonth: string
}

export interface StatutoryLookups {
  isEpfExempt: boolean
  /** EPF ER/EE contribution for the statutory wages. Pass 0/0 for exempt staff. */
  epfLookup: { er: number; ee: number }
  socsoLookup: { er: number; ee: number }
  eisLookup: { er: number; ee: number }
  /** Pre-looked-up PCB amount for (taxable income, category, children). */
  pcb: number
}

export interface GrossAndNet {
  daysWorked: number
  daysInMonth: number
  ratio: number
  proratedBasic: number
  proratedStat: number
  proratedOt: number
  statutoryWages: number
  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
  pcb: number
  gross: number
  taxableIncome: number
  net: number
}

/**
 * Combine pro-rata + statutory + gross + net. Mirrors compute_hr_monthly_payroll.
 *
 * All lookups must be pre-fetched: EPF rates for the staff's category (or 0/0 if
 * exempt), SOCSO rates for the category, EIS rates, and the PCB amount for the
 * taxable income (which this function also returns so callers can sanity-check).
 */
export function computeGrossAndNet(
  row: PayrollRowInput,
  lookups: StatutoryLookups,
): GrossAndNet {
  const p = computeProrata(row.hireDate, row.resignationDate, row.periodMonth, row.unpaidLeaveDays)

  const proratedBasic = row.basicSalary * p.ratio
  const proratedStat = row.statutoryAllowance * p.ratio
  const proratedOt = row.otAmount * p.ratio
  const statutoryWages = proratedBasic + proratedStat

  const epfEr = lookups.isEpfExempt ? 0 : lookups.epfLookup.er
  const epfEe = lookups.isEpfExempt ? 0 : lookups.epfLookup.ee
  const socsoEr = lookups.socsoLookup.er
  const socsoEe = lookups.socsoLookup.ee
  const eisEr = lookups.eisLookup.er
  const eisEe = lookups.eisLookup.ee

  const gross = proratedBasic + proratedStat + proratedOt + row.commissionAmount + row.nonStatutoryAllowance
  const taxableIncome = gross - epfEe
  const pcb = lookups.pcb
  const net = gross - epfEe - socsoEe - eisEe - pcb

  return {
    daysWorked: p.daysWorked,
    daysInMonth: p.daysInMonth,
    ratio: p.ratio,
    proratedBasic: round2(proratedBasic),
    proratedStat: round2(proratedStat),
    proratedOt: round2(proratedOt),
    statutoryWages: round2(statutoryWages),
    epfEr: round2(epfEr),
    epfEe: round2(epfEe),
    socsoEr: round2(socsoEr),
    socsoEe: round2(socsoEe),
    eisEr: round2(eisEr),
    eisEe: round2(eisEe),
    pcb: round2(pcb),
    gross: round2(gross),
    taxableIncome: round2(taxableIncome),
    net: round2(net),
  }
}

// ───────────────────────── helpers ─────────────────────────

function toDate(iso: string): Date {
  // Parse as UTC midnight to avoid local-timezone day-off errors
  return new Date(iso + 'T00:00:00Z')
}

function lastDayOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
}

function maxDate(a: Date, b: Date): Date {
  return a > b ? a : b
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.floor(ms / 86_400_000) + 1
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

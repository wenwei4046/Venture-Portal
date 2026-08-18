// Director billing-vs-payroll gap reconciliation.
//
// Two independent lines run out of /director-salary:
//   1. Pool Breakdown (Billing)   — CTC billed to the 7 subsidiaries (money IN)
//   2. Director Payroll (InfoTech) — the actual run + employer statutory (money OUT)
//
// They never tally, and until now nothing in the portal said where the
// difference went. This module derives that answer from data the Submission
// tab already has, WITHOUT writing anything to the database — the retired
// Director Pool engine's buckets, recomputed on the fly.
//
// The arithmetic mirrors `director-pool-engine.ts` exactly: Sal+KPI and
// Allowance run as two separate streams, each rounded with r2() at the same
// points, so these figures match the /director-pool calculator to the cent.

import { r2 } from './director-pool-engine'

export interface GapSettings {
  /** Saving deduction, percent (e.g. 5). From dp_settings.saving_pct. */
  savingPct: number
  /** Payroll share of the balance, percent (e.g. 75). From dp_settings.gb_pct. */
  gbPct: number
}

export interface GapDirector {
  code: string
  /** Relative weight — any scale; only the ratio to the total matters. */
  weightage: number
  /** Fixed monthly salary the director is paid regardless of the pool. */
  minPayout: number
}

export interface GapInput {
  /** Pool billed to subsidiaries, split by component. */
  poolBasic: number
  poolKpi: number
  poolAllowance: number
  /** Employer EPF + SOCSO + EIS charged to the subsidiaries in the CTC. */
  ctcEmployerStat: number
  /** InfoTech actual payroll gross. */
  payrollGross: number
  /** Employer EPF + SOCSO + EIS actually paid on the InfoTech run. */
  payrollEmployerStat: number
  settings: GapSettings
  directors: GapDirector[]
}

export interface GapDirectorRow {
  code: string
  weightage: number
  salKpiGross: number
  allowGross: number
  saving: number
  /** 75% share — what the pool says this director should be paid. */
  totalPay: number
  /** 25% share — accumulates on the outsource side. */
  billing25: number
  fixed: number
  /** totalPay − fixed. Negative = HV fronted the shortfall. */
  vrKpi: number
}

export interface GapResult {
  /** Money in: CTC billed to subsidiaries (gross + employer statutory). */
  ctcTotal: number
  ctcGross: number
  /** Money out: payroll gross + employer statutory actually paid. */
  cashOut: number
  /** ctcTotal − cashOut. The number this module explains. */
  gap: number

  /** 5% held back for the directors' savings. */
  saving: number
  /** 25% accruing on the outsource/invoice side. */
  billing25: number
  /**
   * Cash view of the advance: payroll gross − the pool's 75%. This is the
   * figure that makes the four buckets tally against `gap`, because it nets
   * off directors whose share ran ABOVE their fixed salary.
   */
  advanceCash: number
  /**
   * Ledger view of the advance: summed only over directors who fell short.
   * This is what the /director-pool calculator books as debt against those
   * directors — it is NOT interchangeable with advanceCash.
   */
  advanceLedger: number
  /** Employer statutory billed to subsidiaries minus what payroll actually paid. */
  statutorySurplus: number

  /** Pool's 75% total — the payroll the pool alone would support. */
  totalPay75: number
  perDirector: GapDirectorRow[]
  /**
   * gap − (saving + billing25 − advanceCash + statutorySurplus). Should sit
   * within a few cents of zero; anything larger means an input drifted.
   */
  residual: number
}

/**
 * Recompute where the billing-vs-payroll difference went. Pure — no I/O, no
 * DB writes. Returns null when there is no pool to split.
 */
export function calculateDirectorGap(input: GapInput): GapResult | null {
  const {
    poolBasic,
    poolKpi,
    poolAllowance,
    ctcEmployerStat,
    payrollGross,
    payrollEmployerStat,
    settings,
    directors,
  } = input

  // Weightage arrives as a 6-dp decimal (0.945000). Summing those doubles
  // and dividing gives a ratio one ULP off the engine's 94.5/400, which
  // compounds into cent-level drift against the /director-pool calculator.
  // Scale to integers first so the division is over exact rationals.
  const WEIGHT_SCALE = 1e6
  const scaledW = directors.map(d => Math.round(d.weightage * WEIGHT_SCALE))
  const totalW = scaledW.reduce((s, w) => s + w, 0)
  if (!totalW) return null

  const poolSal = r2(poolBasic)
  const poolKpiTotal = r2(poolKpi)
  const poolAllow = r2(poolAllowance)
  const ctcGross = r2(poolSal + poolKpiTotal + poolAllow)
  if (ctcGross <= 0) return null

  const savePct = settings.savingPct / 100
  const gbP = settings.gbPct / 100
  const biP = 1 - gbP

  let saving = 0
  let billing25 = 0
  let totalPay75 = 0
  let advanceLedger = 0

  const perDirector = directors.map((d, i): GapDirectorRow => {
    const wRatio = scaledW[i] / totalW

    // Salary, KPI and Allowance are each split and rounded on their own, then
    // Salary + KPI merge into one stream. The engine rounds at exactly these
    // points; splitting a pre-merged Sal+KPI total instead shifts cents.
    const salGross = r2(poolSal * wRatio)
    const kpiGross = r2(poolKpiTotal * wRatio)
    const salKpiGross = r2(salGross + kpiGross)
    const allowGross = r2(poolAllow * wRatio)

    const dirSaving = r2(r2(salKpiGross * savePct) + r2(allowGross * savePct))

    const salKpiBalance = r2(salKpiGross * (1 - savePct))
    const allowBalance = r2(allowGross * (1 - savePct))

    const totalPay = r2(r2(salKpiBalance * gbP) + r2(allowBalance * gbP))
    const dirBilling = r2(r2(salKpiBalance * biP) + r2(allowBalance * biP))

    const vrKpi = r2(totalPay - d.minPayout)

    saving = r2(saving + dirSaving)
    billing25 = r2(billing25 + dirBilling)
    totalPay75 = r2(totalPay75 + totalPay)
    if (vrKpi < 0) advanceLedger = r2(advanceLedger - vrKpi)

    return {
      code: d.code,
      weightage: d.weightage,
      salKpiGross,
      allowGross,
      saving: dirSaving,
      totalPay,
      billing25: dirBilling,
      fixed: d.minPayout,
      vrKpi,
    }
  })

  const ctcTotal = r2(ctcGross + ctcEmployerStat)
  const cashOut = r2(payrollGross + payrollEmployerStat)
  const gap = r2(ctcTotal - cashOut)

  const advanceCash = r2(payrollGross - totalPay75)
  const statutorySurplus = r2(ctcEmployerStat - payrollEmployerStat)

  const residual = r2(gap - r2(saving + billing25 - advanceCash + statutorySurplus))

  return {
    ctcTotal,
    ctcGross,
    cashOut,
    gap,
    saving,
    billing25,
    advanceCash,
    advanceLedger,
    statutorySurplus,
    totalPay75,
    perDirector,
    residual,
  }
}

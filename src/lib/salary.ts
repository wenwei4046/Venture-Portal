/**
 * Director Salary Engine — Pure Calculation Helpers
 *
 * These functions implement the 10-step director salary calculation
 * from module-spec-phase3.md. They are pure math — no DB calls,
 * no side effects. The Server Action orchestrates data fetching
 * and calls save_director_salary_results() for atomic writes.
 *
 * All money values are in RM (2 decimal places).
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface DirectorConfig {
  id: string
  code: string
  weightage: number
  minPayout: number
  pcbCategory: 'KA1' | 'KA2' | 'KA3'
  childrenCount: number
}

export interface CTCRecord {
  directorId: string
  companyId: string
  basic: number
  kpi: number
  allowance: number
  employerEpf: number
  employerSocso: number
  employerEis: number
  totalCtc: number
}

export interface PoolSnapshot {
  totalBasic: number
  totalKpi: number
  totalAllowance: number
  totalPool: number // basic + kpi + allowance (non-statutory)
  basicRatio: number
  kpiRatio: number
  allowanceRatio: number
  totalStatutoryErIn: number
  totalCtcIn: number
}

export interface StatutoryLookup {
  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
}

export interface DirectorPayout {
  directorId: string
  grossAmount: number
  savingAmount: number
  afterSaving: number

  // 75% Payroll
  payrollCalc: number
  advanceAmount: number
  payrollGross: number
  payrollBk: number
  payrollAllow: number
  payrollEpfEr: number
  payrollEpfEe: number
  payrollSocsoEr: number
  payrollSocsoEe: number
  payrollEisEr: number
  payrollEisEe: number
  payrollPcb: number
  payrollNet: number

  // 25% Invoice
  invoiceBase: number
  invoiceBk: number
  invoiceEpfEr: number
  invoiceSocsoEr: number
  invoiceEisEr: number
  invoiceTotal: number

  // Surplus
  statutoryErIn: number
  statutoryErOut: number
  statutorySurplus: number
}

// ─── Step 3: Calculate Pool ────────────────────────────────────────

export function calculatePool(ctcRecords: CTCRecord[]): PoolSnapshot {
  const totalBasic = sum(ctcRecords, r => r.basic)
  const totalKpi = sum(ctcRecords, r => r.kpi)
  const totalAllowance = sum(ctcRecords, r => r.allowance)
  const totalPool = totalBasic + totalKpi + totalAllowance

  const totalStatutoryErIn = sum(ctcRecords, r =>
    r.employerEpf + r.employerSocso + r.employerEis
  )
  const totalCtcIn = totalPool + totalStatutoryErIn

  return {
    totalBasic,
    totalKpi,
    totalAllowance,
    totalPool,
    basicRatio: totalPool > 0 ? (totalBasic + totalKpi) / totalPool : 0,
    kpiRatio: totalPool > 0 ? totalKpi / totalPool : 0,
    allowanceRatio: totalPool > 0 ? totalAllowance / totalPool : 0,
    totalStatutoryErIn,
    totalCtcIn,
  }
}

// ─── Steps 4-10: Per Director Calculation ──────────────────────────

export function calculateDirectorPayout(
  director: DirectorConfig,
  pool: PoolSnapshot,
  totalWeightage: number,
  savingRate: number,
  payrollStatutory: StatutoryLookup,
  invoiceStatutory: StatutoryLookup,
  pcbAmount: number,
): DirectorPayout {
  // Step 4: Gross
  const grossAmount = r2(pool.totalPool * director.weightage / totalWeightage)

  // Step 5: Auto-split by ratio (not used for deductions, but tracked)
  // const dBasic = r2(grossAmount * (pool.totalBasic / pool.totalPool))
  // const dKpi = r2(grossAmount * pool.kpiRatio)
  // const dAllow = r2(grossAmount * pool.allowanceRatio)

  // Step 6: 5% Saving
  const savingAmount = r2(grossAmount * savingRate)
  const afterSaving = r2(grossAmount - savingAmount)

  // Step 7: 75/25
  const payrollCalc = r2(afterSaving * 0.75)
  const invoiceBase = r2(afterSaving * 0.25)

  // Step 8: 75% Payroll
  const advanceAmount = r2(Math.max(0, director.minPayout - payrollCalc))
  const payrollGross = r2(Math.max(payrollCalc, director.minPayout))

  const bkRatio = pool.basicRatio // (basic + kpi) / pool
  const allowRatio = pool.allowanceRatio
  const payrollBk = r2(payrollGross * bkRatio)
  const payrollAllow = r2(payrollGross * allowRatio)

  // Statutory on 75% payroll (lookup based on payroll B+K wages)
  const payrollEpfEr = r2(payrollStatutory.epfEr)
  const payrollEpfEe = r2(payrollStatutory.epfEe)
  const payrollSocsoEr = r2(payrollStatutory.socsoEr)
  const payrollSocsoEe = r2(payrollStatutory.socsoEe)
  const payrollEisEr = r2(payrollStatutory.eisEr)
  const payrollEisEe = r2(payrollStatutory.eisEe)
  const payrollPcb = r2(pcbAmount)

  const payrollNet = r2(
    payrollGross
    - payrollEpfEr - payrollEpfEe
    - payrollSocsoEr - payrollSocsoEe
    - payrollEisEr - payrollEisEe
    - payrollPcb
  )

  // Step 9: 25% Invoice
  const invoiceBk = r2(invoiceBase * bkRatio)
  const invoiceEpfEr = r2(invoiceStatutory.epfEr)
  const invoiceSocsoEr = r2(invoiceStatutory.socsoEr)
  const invoiceEisEr = r2(invoiceStatutory.eisEr)
  const invoiceTotal = r2(invoiceBase + invoiceEpfEr + invoiceSocsoEr + invoiceEisEr)

  // Step 10: Statutory surplus
  const dirShare = director.weightage / totalWeightage
  const statutoryErIn = r2(pool.totalStatutoryErIn * dirShare)
  const statutoryErOut = r2(
    (payrollEpfEr + payrollSocsoEr + payrollEisEr) +
    (invoiceEpfEr + invoiceSocsoEr + invoiceEisEr)
  )
  const statutorySurplus = r2(statutoryErIn - statutoryErOut)

  return {
    directorId: director.id,
    grossAmount,
    savingAmount,
    afterSaving,
    payrollCalc,
    advanceAmount,
    payrollGross,
    payrollBk,
    payrollAllow,
    payrollEpfEr,
    payrollEpfEe,
    payrollSocsoEr,
    payrollSocsoEe,
    payrollEisEr,
    payrollEisEe,
    payrollPcb,
    payrollNet,
    invoiceBase,
    invoiceBk,
    invoiceEpfEr,
    invoiceSocsoEr,
    invoiceEisEr,
    invoiceTotal,
    statutoryErIn,
    statutoryErOut,
    statutorySurplus,
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Round to 2 decimal places */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Sum a property from an array */
function sum<T>(arr: T[], fn: (item: T) => number): number {
  return r2(arr.reduce((acc, item) => acc + fn(item), 0))
}

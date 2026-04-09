// Director Salary Calculation Engine
// Full spec: docs/module-spec-phase3.md
// Implemented in Phase 3 — stub only.

export interface SalaryCalculationInput {
  directorId: string
  periodMonth: string           // 'YYYY-MM-DD' (first of month)
  grossAmount: number           // pool × weightage
  basicKpiAmount: number        // B+K portion (subject to statutory)
  allowanceAmount: number       // allowance portion (no statutory)
  minPayout: number             // director.min_payout
  savingRate: number            // from treasury_config 'saving_rate'
  pcbOverride?: number          // HR manual override
}

export interface SalaryCalculationResult {
  // 5% Saving
  savingAmount: number
  afterSaving: number

  // 75% Payroll
  payrollCalc: number
  advanceAmount: number         // if payrollCalc < minPayout
  payrollGross: number          // max(payrollCalc, minPayout)
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

export async function calculateDirectorSalary(
  _supabase: unknown,
  _input: SalaryCalculationInput
): Promise<SalaryCalculationResult> {
  throw new Error('Director salary calculation engine not yet implemented — Phase 3')
}

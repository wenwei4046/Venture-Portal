/**
 * What "Create Period" seeds for a month, straight from the staff master.
 * Pure, so the rule can be tested without Supabase in the way (TESTING.md);
 * `createPayrollPeriod` in hr-costing/payroll/actions.ts does the reading
 * and the upsert around it.
 */

export interface PayrollSeedStaff {
  id: string
  basic_salary: number
  /** The staff master's statutory allowance — seeded as it always has been. */
  allowances: number
  /** `hr_employment_type`: salaried · commission_eligible · variable. */
  employment_type: string
  /** The department's `payroll_source`; 'commission' rows belong to the commission run. */
  payroll_source: string | null
}

export interface PayrollSeedRow {
  staff_id: string
  period_month: string
  basic_salary: number
  non_statutory_allowance: number
  source: 'commission' | 'carried_forward'
  status: 'draft'
}

/**
 * One draft row per active person — except those on variable pay. A
 * director's figure is worked out and keyed on the Director Salary page,
 * which submits to Finance on its own (user, 2026-09-11), so a 0.00 row on
 * the HR payroll grid would only invite the same pay to be entered twice.
 */
export function seedPayrollRows(
  staff: readonly PayrollSeedStaff[],
  period: string,
): PayrollSeedRow[] {
  return staff
    .filter(s => s.employment_type !== 'variable')
    .map(s => ({
      staff_id: s.id,
      period_month: period,
      basic_salary: s.basic_salary,
      non_statutory_allowance: s.allowances,
      source: s.payroll_source === 'commission' ? 'commission' : 'carried_forward',
      status: 'draft',
    }))
}

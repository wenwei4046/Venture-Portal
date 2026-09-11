import { describe, it, expect } from 'vitest'
import { seedPayrollRows, type PayrollSeedStaff } from './payroll-period'

const salaried: PayrollSeedStaff = {
  id: 's1', basic_salary: 3500, allowances: 200, employment_type: 'salaried', payroll_source: 'imported',
}
const salesperson: PayrollSeedStaff = {
  id: 's2', basic_salary: 0, allowances: 0, employment_type: 'commission_eligible', payroll_source: 'commission',
}
const director: PayrollSeedStaff = {
  id: 's3', basic_salary: 0, allowances: 0, employment_type: 'variable', payroll_source: 'imported',
}

describe('seedPayrollRows', () => {
  it('seeds one draft row per person, sourced by department', () => {
    expect(seedPayrollRows([salaried, salesperson], '2026-09-01')).toEqual([
      {
        staff_id: 's1', period_month: '2026-09-01', basic_salary: 3500,
        non_statutory_allowance: 200, source: 'carried_forward', status: 'draft',
      },
      {
        staff_id: 's2', period_month: '2026-09-01', basic_salary: 0,
        non_statutory_allowance: 0, source: 'commission', status: 'draft',
      },
    ])
  })

  it('leaves variable pay out — a director is keyed on the Director Salary page', () => {
    expect(seedPayrollRows([salaried, director, salesperson], '2026-09-01').map(r => r.staff_id)).toEqual([
      's1',
      's2',
    ])
  })

  it('seeds nobody from an empty roster', () => {
    expect(seedPayrollRows([], '2026-09-01')).toEqual([])
  })
})

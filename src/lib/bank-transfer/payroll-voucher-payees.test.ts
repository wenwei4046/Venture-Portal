import { describe, expect, it } from 'vitest'
import { salaryBankPayees, type SalaryBankLine } from './payroll-voucher-payees'
import { generateAllianceBankCsv } from './alliance-bank'
const line = (component: 'net' | 'basic' | 'commission', extra: Partial<SalaryBankLine> = {}): SalaryBankLine => ({
  payroll_row_id: 'r1', employee_name: 'Employee One', employee_code: 'E1', salary_component: component,
  net: component === 'basic' ? '4302.70' : '4253.45', bank_name: 'Maybank', bank_account_no: '123456789',
  payment_vouchers: { id: component, voucher_no: `PV-${component}`, status: 'paid', payment_date: '2026-09-30' }, ...extra,
})
describe('salary PV bank snapshots', () => {
  it('exports two component lines to their chosen banks, with each PV date and no whole-net line', () => {
    const commission = line('commission', { bank_name: 'CIMB', bank_account_no: '987654321' })
    commission.payment_vouchers.payment_date = '2026-10-02'
    const payees = salaryBankPayees([line('basic'), commission], 'Sep 2026')
    const result = generateAllianceBankCsv(payees, new Date('2026-09-30'))
    expect(result.rowCount).toBe(2)
    expect(result.totalAmount).toBe(8556.15)
    expect(result.csv).toContain('30092026,MYR,4302.70,Maybank,123456789')
    expect(result.csv).toContain('02102026,MYR,4253.45,CIMB,987654321')
    expect(result.csv).toContain('Salary Sep 2026 Basic')
    expect(result.csv).toContain('Salary Sep 2026 Commission')
  })
  it('rejects whole-net/component overlap and repeated components before any CSV is produced', () => {
    expect(() => salaryBankPayees([line('basic'), line('net')], 'Sep')).toThrow('Overlapping')
    expect(() => salaryBankPayees([line('net'), line('commission')], 'Sep')).toThrow('Overlapping')
    expect(() => salaryBankPayees([line('basic'), line('basic')], 'Sep')).toThrow('Overlapping')
  })
  it('requires snapshot banks and generated live PVs; old bankless history never guesses current accounts', () => {
    expect(() => salaryBankPayees([], 'Sep')).toThrow('Generate salary PVs')
    expect(() => salaryBankPayees([line('net', { bank_account_no: null })], 'Sep')).toThrow('saved recipient')
    const voided = line('net'); voided.payment_vouchers.status = 'voided'
    expect(() => salaryBankPayees([voided], 'Sep')).toThrow('live generated')
    const pending = line('basic'); pending.payment_vouchers.status = 'pending_approval'
    expect(salaryBankPayees([pending], 'Sep')).toHaveLength(1)
  })
})

import { describe, expect, it } from 'vitest'
import { groupDepartments, normaliseCycle, statutoryRows, type CyclePerson, type CycleVoucher } from '@/lib/payment-cycle'
import { paymentStatementAmounts } from './Overview'

function voucher(id: string, status: CycleVoucher['status']): CycleVoucher {
  return { id, no: id, status, payment_date: '2026-09-05', created_at: null, approved_at: null, granularity: 'department', group_id: null }
}

function person(id: string, net: number, pv: CycleVoucher | null): CyclePerson {
  return {
    row_id: id, staff_id: id, scope: 'staff', code: id, name: id, dept_id: 'finance', dept_name: 'Finance',
    bank_name: null, bank_account_no: null, gross: net, net, epf_er: 0, epf_ee: 0,
    socso_er: 0, socso_ee: 0, eis_er: 0, eis_ee: 0, pcb: 0, skbbk: 0, prev_net: null, voucher: pv,
  }
}

function report(people: CyclePerson[], statutoryTotal: number, statutoryPaid: number, pool: number) {
  const groups = groupDepartments(people)
  const rows = statutoryRows(normaliseCycle({ period: '2026-08-01', people: [] }), []).map((row) => ({
    ...row,
    total: row.scheme === 'KWSP' ? statutoryTotal : 0,
    paidAmount: row.scheme === 'KWSP' ? statutoryPaid : 0,
  }))
  return paymentStatementAmounts(groups, rows, pool)
}

describe('Payment statement financial rollups', () => {
  it('counts individual paid salaries and partial statutory payments before forecasting the pool gap', () => {
    const result = report([
      person('paid', 1000, voucher('PV1', 'paid')),
      person('pending', 2000, voucher('PV2', 'pending_approval')),
      person('approved', 500, voucher('PV3', 'approved')),
    ], 500, 125, 2700)

    expect(result).toEqual({ salaryPaid: 1000, salaryOutstanding: 2500, statutoryOutstanding: 375, poolAfterSalary: 200, fundingGap: 175 })
  })

  it('sums people covered by a grouped voucher once each and includes ungenerated salaries in remaining payments', () => {
    const grouped = voucher('grouped', 'paid')
    const result = report([person('A', 1000, grouped), person('B', 750, grouped), person('C', 2000, null)], 300, 0, 2200)
    expect(result.salaryPaid).toBe(1750)
    expect(result.salaryOutstanding).toBe(2000)
    expect(result.fundingGap).toBe(100)
  })

  it('does not report another period’s negative pool as this completed month’s funding need', () => {
    const result = report([person('A', 1000, voucher('paid', 'paid'))], 500, 500, -50)
    expect(result.statutoryOutstanding).toBe(0)
    expect(result.fundingGap).toBe(0)
  })

  it('keeps historical overpayments from cancelling another remaining statutory obligation', () => {
    const rows = statutoryRows(normaliseCycle({ period: '2026-08-01', people: [] }), []).map((row) => ({
      ...row,
      total: row.scheme === 'KWSP' || row.scheme === 'SOCSO' ? 100 : 0,
      paidAmount: row.scheme === 'KWSP' ? 150 : 0,
    }))
    expect(paymentStatementAmounts([], rows, 20).statutoryOutstanding).toBe(100)
    expect(paymentStatementAmounts([], rows, 20).fundingGap).toBe(80)
  })

  it('keeps totals rounded to cents and no-payroll periods at zero', () => {
    expect(report([person('A', 0.1, null), person('B', 0.2, null)], 0, 0, 0).fundingGap).toBe(0.3)
    expect(report([], 0, 0, 0)).toEqual({ salaryPaid: 0, salaryOutstanding: 0, statutoryOutstanding: 0, poolAfterSalary: 0, fundingGap: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { payrollSelection } from './payroll-selection'
import type { CyclePerson, CycleVoucher } from './payment-cycle'

function person(name: string, net: number, voucher: CycleVoucher | null = null): CyclePerson {
  return {
    row_id: `row-${name}`, staff_id: `staff-${name}`, scope: 'staff', code: null,
    name, dept_id: 'finance', dept_name: 'Finance', bank_name: 'CIMB', bank_account_no: '1234567890',
    gross: net, net, epf_er: 0, epf_ee: 0, socso_er: 0, socso_ee: 0,
    eis_er: 0, eis_ee: 0, pcb: 0, skbbk: 0, prev_net: null, voucher,
  }
}

function voucher(status: CycleVoucher['status']): CycleVoucher {
  return {
    id: `pv-${status}`, no: `HV-PV-${status}`, status, payment_date: '2026-09-05',
    created_at: null, approved_at: null, granularity: 'employee', group_id: 'approval-group',
  }
}

const unpaid = () => [
  person('Amy', 1000.1), person('Ben', 2000.2), person('Cara', 3000.3),
  person('Devi', 4000.4), person('Ezra', 5000.5),
]
const threeIds = ['row-Amy', 'row-Cara', 'row-Ezra']

describe('payrollSelection', () => {
  it('defaults to all unpaid positive-net people without paying existing vouchers again', () => {
    const people = [...unpaid(), person('Fran', 6000, voucher('paid')), person('Grace', 7000, voucher('pending_approval')), person('Zero', 0), person('Negative', -50)]
    const batch = payrollSelection(people, null, 'department')

    expect(batch.rowIds).toEqual(['row-Amy', 'row-Ben', 'row-Cara', 'row-Devi', 'row-Ezra'])
    expect(batch.count).toBe(5)
    expect(batch.total).toBe(15001.5)
    expect(batch.voucherCount).toBe(1)
  })

  it.each(['department', 'employee'] as const)('keeps an explicit empty selection empty in %s mode', (mode) => {
    const batch = payrollSelection(unpaid(), [], mode)

    expect(batch.count).toBe(0)
    expect(batch.total).toBe(0)
    expect(batch.voucherCount).toBe(0)
    expect(batch.rowIds).toEqual([])
    expect(batch.eligible).toHaveLength(5)
  })

  it.each([['department', 1], ['employee', 3]] as const)('previews the same three salaries as %s vouchers', (mode, voucherCount) => {
    const batch = payrollSelection(unpaid(), threeIds, mode)

    expect(batch.selected.map((p) => p.name)).toEqual(['Amy', 'Cara', 'Ezra'])
    expect(batch.rowIds).toEqual(threeIds)
    expect(batch.count).toBe(3)
    expect(batch.total).toBe(9000.9)
    expect(batch.voucherCount).toBe(voucherCount)
  })

  it('ignores unrelated identifiers and does not count a selected person twice', () => {
    const batch = payrollSelection(unpaid(), ['another-department', 'row-Cara', 'row-Cara', 'row-Amy'], 'employee')

    expect(batch.rowIds).toEqual(['row-Amy', 'row-Cara'])
    expect(batch.count).toBe(2)
    expect(batch.total).toBe(4000.4)
    expect(batch.voucherCount).toBe(2)
  })

  it('shows only the remaining salaries after a grouped subset has been generated', () => {
    const groupedPv = { ...voucher('pending_approval'), granularity: 'department' as const }
    const people = unpaid().map((p) => threeIds.includes(p.row_id) ? { ...p, voucher: groupedPv } : p)
    const batch = payrollSelection(people, null, 'department')

    expect(batch.rowIds).toEqual(['row-Ben', 'row-Devi'])
    expect(batch.count).toBe(2)
    expect(batch.total).toBe(6000.6)
    expect(batch.voucherCount).toBe(1)
  })

  it('drops a stale selection once another operation has created its voucher', () => {
    const people = unpaid().map((p) => p.row_id === 'row-Cara' ? { ...p, voucher: voucher('approved') } : p)
    const batch = payrollSelection(people, ['row-Cara'], 'employee')

    expect(batch.selected).toEqual([])
    expect(batch.total).toBe(0)
    expect(batch.voucherCount).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { cycleHeadline, groupDepartments, normaliseCycle, salaryCoveredAmount, salaryFullyCovered, salaryFullyPaid, salaryPaidAmount, unpaidSalaryComponents } from './payment-cycle'

const voucher = (id: string, status = 'paid') => ({ id, no: id, status, granularity: 'employee' })
const person = (basicStatus: string | null = 'paid', commissionStatus: string | null = null) => normaliseCycle({ people: [{
  row_id: 'r1', name: 'Revenue', scope: 'staff', source: 'commission', payout_split_version: 2,
  dept_id: 'revenue', dept_name: 'Revenue', net: '8556.15', gross: '9253.45',
  bank_name: 'Maybank', bank_account_no: '123456789', bank_name_2: 'CIMB', bank_account_no_2: '987654321',
  components: [
    { component: 'basic', amount: '4302.70', voucher: basicStatus ? voucher('basic-pv', basicStatus) : null,
      recipient_account: 'account_2', bank_name: 'CIMB', bank_account_no: '987654321' },
    { component: 'commission', amount: '4253.45', voucher: commissionStatus ? voucher('commission-pv', commissionStatus) : null },
  ],
}] }).people[0]

describe('salary component coverage', () => {
  it('counts a Basic-only payment as partial and leaves just Commission eligible', () => {
    const p = person()
    expect(salaryPaidAmount(p)).toBe(4302.7)
    expect(salaryCoveredAmount(p)).toBe(4302.7)
    expect(salaryFullyCovered(p)).toBe(false)
    expect(salaryFullyPaid(p)).toBe(false)
    expect(unpaidSalaryComponents(p).map(c => c.component)).toEqual(['commission'])
    expect(groupDepartments([p])[0]).toMatchObject({ stage: 'partial', generated: 0, paid: 0 })
  })
  it('requires both components paid, while pending PVs already prevent generation', () => {
    const p = person('paid', 'pending_approval')
    expect(salaryFullyCovered(p)).toBe(true)
    expect(salaryFullyPaid(p)).toBe(false)
    expect(unpaidSalaryComponents(p)).toEqual([])
    expect(groupDepartments([p])[0]).toMatchObject({ stage: 'pending', generated: 1, paid: 0, pending: 1 })
    expect(salaryFullyPaid(person('paid', 'paid'))).toBe(true)
    expect(salaryPaidAmount(person('paid', 'paid'))).toBe(8556.15)
  })
  it('voiding restores only that component and preserves the other payment', () => {
    const p = person('voided', 'paid')
    expect(salaryPaidAmount(p)).toBe(4253.45)
    expect(unpaidSalaryComponents(p).map(c => c.component)).toEqual(['basic'])
    expect(groupDepartments([p])[0].vouchers.map(v => v.id)).toEqual(['commission-pv'])
  })
  it('keeps old whole-net responses compatible and ignores zero Basic for full commission', () => {
    const p = person()
    p.components = undefined
    p.voucher = normaliseCycle({ people: [{ voucher: voucher('legacy'), net: 8556.15 }] }).people[0].voucher
    expect(salaryFullyPaid(p)).toBe(true)
    expect(salaryPaidAmount(p)).toBe(8556.15)
    const full = person(null, 'paid')
    full.components![0].amount = 0
    expect(salaryFullyPaid(full)).toBe(true)
    expect(unpaidSalaryComponents(full)).toEqual([])
  })
  it('normalises account snapshots separately from current staff accounts', () => {
    const p = person()
    p.bank_account_no_2 = 'changed-master'
    expect(p.components![0]).toMatchObject({ recipient_account: 'account_2', bank_account_no: '987654321', amount: 4302.7 })
  })
  it('reports a Basic-only PV as partly paid instead of nothing generated', () => {
    const p = person()
    const cycle = normaliseCycle({ period: '2026-09-01', run: { id: 'run', status: 'paid', total_amount: 10000 } })
    cycle.people = [p]
    const headline = cycleHeadline({ cycle, groups: groupDepartments([p]), rows: [], phase: 'funded',
      staffFunded: true, directorsFunded: false, today: '2026-09-11', plannedStaffDate: '2026-09-30', plannedDirectorDate: '2026-09-30' })
    expect(headline.word).toBe('Partly paid')
    expect(headline.detail).not.toContain('nothing generated')
  })
})

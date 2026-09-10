import { describe, expect, it } from 'vitest'
import { normaliseCycle, groupDepartments, statutoryCoverage, statutoryRows, cycleHeadline, monthRail } from './payment-cycle'
import { statutorySelection } from './statutory-selection'

const cycle = () => normaliseCycle({ period: '2026-08-01', people: [
  { row_id: 'a', name: 'A', dept_id: 'finance', dept_name: 'Finance', scope: 'staff', socso_er: 10, socso_ee: 3, eis_er: 1, eis_ee: 1 },
  { row_id: 'b', name: 'B', dept_id: 'finance', dept_name: 'Finance', scope: 'staff', socso_er: 20, socso_ee: 6, eis_er: 2, eis_ee: 2 },
  { row_id: 'c', name: 'C', dept_id: 'marketing', dept_name: 'Marketing', scope: 'staff', socso_er: 30, socso_ee: 9, eis_er: 3, eis_ee: 3 },
] })

describe('statutorySelection', () => {
  it('previews exact per-employee contribution PVs and a separate scheme for SOCSO/EIS', () => {
    const selection = statutorySelection(cycle().people, ['SOCSO', 'EIS'], [], ['a', 'b', 'c'], 'employee')
    expect(selection.count).toBe(3)
    expect(selection.voucherCount).toBe(6)
    expect(selection.total).toBe(90)
    expect(selection.lines.map(l => l.amount)).toEqual([13, 2, 26, 4, 39, 6])
  })
  it('groups by actual department and excludes already-covered schemes only', () => {
    const selection = statutorySelection(cycle().people, ['SOCSO', 'EIS'], [
      { row_id: 'a', scope: 'staff', scheme: 'SOCSO', voucher_id: 'pv', amount: 13 },
      { row_id: 'a', scope: 'staff', scheme: 'EIS', voucher_id: 'pv2', amount: 2 },
      { row_id: 'b', scope: 'staff', scheme: 'SOCSO', voucher_id: 'pv3', amount: 26 },
    ], null, 'department')
    expect(selection.rowIds).toEqual(['b', 'c'])
    expect(selection.voucherCount).toBe(3)
    expect(selection.total).toBe(49)
  })
  it('starts manual selection empty, ignores stale IDs and retains zero-net liabilities', () => {
    expect(statutorySelection(cycle().people, ['EIS'], [], [], 'employee').count).toBe(0)
    const selected = statutorySelection(cycle().people, ['EIS'], [], ['a', 'missing'], 'employee')
    expect(selected.rowIds).toEqual(['a'])
    expect(selected.total).toBe(2)
  })
  it('does not duplicate repeated schemes or selected IDs and skips zero contribution parts', () => {
    const c = cycle()
    c.people[0].eis_ee = 0; c.people[0].eis_er = 0
    const selected = statutorySelection(c.people, ['SOCSO', 'SOCSO', 'EIS'], [], ['a', 'a'], 'employee')
    expect(selected.count).toBe(1)
    expect(selected.voucherCount).toBe(1)
    expect(selected.total).toBe(13)
  })
})

describe('statutory coverage and reporting', () => {
  it('keeps partial paid amounts separate from missing contribution coverage', () => {
    const c = cycle()
    c.statutory_vouchers = [{ id: 'pv', no: 'PV-1', payee: 'PERKESO (SOCSO)', status: 'paid', amount: 13, payment_date: '2026-09-15', description: 'Finance subset', created_at: null, approved_at: null }]
    c.statutory_coverage = [{ row_id: 'a', scope: 'staff', scheme: 'SOCSO', voucher_id: 'pv', amount: 13 }]
    const row = statutoryRows(c, groupDepartments(c.people)).find(r => r.scheme === 'SOCSO')!
    expect(row.stage).toBe('partial')
    expect(row.total).toBe(78)
    expect(row.remainingAmount).toBe(65)
    expect(row.generatedAmount).toBe(13)
    expect(row.paidAmount).toBe(13)
    expect(row.vouchers).toHaveLength(1)
  })
  it('uses every PV, distinguishing approved from actually paid', () => {
    const c = cycle()
    c.statutory_vouchers = c.people.map((p, i) => ({ id: p.row_id, no: p.row_id, payee: 'PERKESO (SOCSO)', status: i === 0 ? 'approved' : 'paid', amount: (i + 1) * 13, payment_date: null, description: null, created_at: null, approved_at: null }))
    c.statutory_coverage = c.people.map((p, i) => ({ row_id: p.row_id, scope: p.scope, scheme: 'SOCSO', voucher_id: p.row_id, amount: (i + 1) * 13 }))
    const row = statutoryRows(c, groupDepartments(c.people)).find(r => r.scheme === 'SOCSO')!
    expect(row.stage).toBe('approved')
    expect(row.vouchers).toHaveLength(3)
    expect(row.remainingAmount).toBe(0)
    expect(row.paidAmount).toBe(65)
  })
  it('ignores voided voucher coverage, even if an old response carries its lines', () => {
    const c = cycle()
    c.statutory_vouchers = [{ id: 'pv', no: null, payee: 'PERKESO (SOCSO)', status: 'voided', amount: 13, payment_date: null, description: null, created_at: null, approved_at: null }]
    c.statutory_coverage = [{ row_id: 'a', scope: 'staff', scheme: 'SOCSO', voucher_id: 'pv', amount: 13 }]
    expect(statutoryCoverage(c)).toEqual([])
    const row = statutoryRows(c, []).find(r => r.scheme === 'SOCSO')!
    expect(row.stage).toBe('not_generated')
    expect(row.remainingAmount).toBe(78)
    expect(row.paidAmount).toBe(0)
  })
  it('accepts an authoritative empty coverage list and coerces numeric amounts', () => {
    const c = normaliseCycle({ statutory_coverage: [{ row_id: 'a', scope: 'staff', scheme: 'SOCSO', voucher_id: 'pv', amount: '13.20' }] })
    expect(c.statutory_coverage?.[0].amount).toBe(13.2)
    expect(normaliseCycle({ statutory_coverage: [] }).statutory_coverage).toEqual([])
    expect(normaliseCycle({}).statutory_coverage).toBeUndefined()
  })
  it('counts every pending manual PV even while both schemes have missing employees', () => {
    const c = cycle()
    c.run = { id: 'run', status: 'paid', total_amount: 3000, submitted_at: null, approved_at: null }
    c.people = c.people.map(p => ({ ...p, net: 1000, voucher: { id: `salary-${p.row_id}`, no: null, status: 'paid', payment_date: '2026-09-05', created_at: null, approved_at: null, granularity: 'employee', group_id: null } }))
    c.statutory_vouchers = ['SOCSO', 'EIS'].flatMap((s, i) => c.people.slice(0, 2).map(p => ({
      id: `${s}-${p.row_id}`, no: null, payee: `PERKESO (${s})`, status: 'pending_approval' as const, amount: i ? 2 : 13,
      payment_date: null, description: null, created_at: null, approved_at: null,
    })))
    c.statutory_coverage = ['SOCSO', 'EIS'].flatMap(s => c.people.slice(0, 2).map(p => ({ row_id: p.row_id, scope: p.scope, scheme: s as 'SOCSO' | 'EIS', voucher_id: `${s}-${p.row_id}`, amount: 1 })))
    const groups = groupDepartments(c.people)
    const h = cycleHeadline({ cycle: c, groups, rows: statutoryRows(c, groups), phase: 'funded', staffFunded: true, directorsFunded: true, today: '2026-09-10', plannedStaffDate: '2026-09-05', plannedDirectorDate: '2026-09-05' })
    expect(h.word).toBe('Statutory with Principal')
    expect(h.detail).toContain('4 of 4 statutory PVs awaiting approval')
    expect(h.detail).toContain('45.00 still to generate')
  })
  it('never closes a month merely because five or more manual PVs were paid', () => {
    const args = [
      '2026-08-01', [{ id: 'run', period_month: '2026-08-01', status: 'paid' }],
      Array.from({ length: 6 }, () => ({ reference_id: 'run', status: 'paid' })), [], 0, 0,
    ] as const
    const months = monthRail(args[0], [...args[1]], [...args[2]], [...args[3]], args[4], args[5], [{ period: '2026-08-01', complete: false }])
    expect(months[0].state).toBe('funded')
    expect(monthRail(args[0], [...args[1]], [...args[2]], [], 0, 0, [{ period: '2026-08-01', complete: true }])[0].state).toBe('closed')
  })
})

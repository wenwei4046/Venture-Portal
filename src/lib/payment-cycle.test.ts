import { describe, it, expect } from 'vitest'
import {
  bankIssue,
  cyclePhase,
  cycleTotals,
  daysUntil,
  delta,
  groupDepartments,
  isNotableMove,
  normaliseCycle,
  shortDate,
  statutoryDue,
  statutoryRows,
  varianceLabel,
  type CyclePerson,
  type CycleVoucher,
  type PaymentCycle,
} from './payment-cycle'

function person(partial: Partial<CyclePerson> & { name: string }): CyclePerson {
  return {
    row_id: `row-${partial.name}`,
    staff_id: `staff-${partial.name}`,
    scope: 'staff',
    code: null,
    dept_id: 'd-mkt',
    dept_name: 'Marketing',
    bank_name: 'CIMB',
    bank_account_no: '1234567890',
    gross: 4000,
    net: 3500,
    epf_er: 520,
    epf_ee: 440,
    socso_er: 70,
    socso_ee: 20,
    eis_er: 8,
    eis_ee: 8,
    pcb: 12,
    skbbk: 20,
    prev_net: null,
    voucher: null,
    ...partial,
  }
}

function voucher(partial: Partial<CycleVoucher> & { id: string }): CycleVoucher {
  return {
    no: `HV-PV-${partial.id}`,
    status: 'pending_approval',
    payment_date: '2026-09-05',
    created_at: '2026-09-05T02:12:00Z',
    approved_at: null,
    granularity: 'employee',
    group_id: 'g1',
    ...partial,
  }
}

function cycle(partial: Partial<PaymentCycle> = {}): PaymentCycle {
  return {
    period: '2026-08-01',
    run: { id: 'run', status: 'approved', total_amount: 109770.21, submitted_at: '2026-09-04T01:00:00Z', approved_at: '2026-09-04T01:00:00Z' },
    latest_run_period: '2026-08-01',
    pool_balance: 31389.17,
    payout_bank: { name: 'Alliance Bank', last4: '3210' },
    funding: {
      staff: { id: 'f1', status: 'completed', amount: 109770.21, requested_at: null, pv_id: 'pv', pv_no: 'HV-PV-202609-0332', pv_status: 'paid', pv_date: '2026-09-04' },
      directors: { id: 'f2', status: 'completed', amount: 64976.2, requested_at: null, pv_id: 'pv2', pv_no: 'HV-PV-202609-0333', pv_status: 'paid', pv_date: '2026-09-04' },
    },
    people: [],
    statutory_vouchers: [],
    ...partial,
  }
}

describe('bankIssue', () => {
  it('flags a missing account, a missing bank and a bank name that is only digits', () => {
    expect(bankIssue(person({ name: 'a', bank_account_no: null }))).toBe('missing_account')
    expect(bankIssue(person({ name: 'b', bank_account_no: '  ' }))).toBe('missing_account')
    expect(bankIssue(person({ name: 'c', bank_name: null }))).toBe('missing_bank')
    expect(bankIssue(person({ name: 'd', bank_name: '7847' }))).toBe('numeric_bank')
    expect(bankIssue(person({ name: 'e' }))).toBeNull()
  })
  it('never blocks a director — they are not in the staff bulk file', () => {
    expect(bankIssue(person({ name: 'dir', scope: 'directors', bank_name: null, bank_account_no: null }))).toBeNull()
  })
})

describe('groupDepartments', () => {
  const people = [
    person({ name: 'KHO', net: 6495.45, gross: 7630.3, prev_net: 6400, voucher: voucher({ id: 'v1', granularity: 'department', status: 'paid' }) }),
    person({ name: 'BOON', net: 3607.45, gross: 4100, prev_net: 3607.45, voucher: voucher({ id: 'v1', granularity: 'department', status: 'paid' }) }),
    person({ name: 'CHEW', net: 6267.3, gross: 7400, dept_id: 'd-fin', dept_name: 'Finance', voucher: voucher({ id: 'v2' }) }),
    person({ name: 'LOW', net: 3352.5, gross: 3800, dept_id: 'd-fin', dept_name: 'Finance', bank_name: '7847' }),
    person({ name: 'INTERN', net: 0, gross: 0, dept_id: 'd-fin', dept_name: 'Finance' }),
    person({ name: 'LOO', scope: 'directors', dept_id: null, dept_name: 'Directors', net: 10700.55, gross: 14400, bank_name: null, bank_account_no: null }),
  ]
  const groups = groupDepartments(people)

  it('orders staff departments by net, directors last', () => {
    expect(groups.map((g) => g.name)).toEqual(['Marketing', 'Finance', 'Directors'])
    expect(groups[2].scope).toBe('directors')
    expect(groups[2].key).toBe('directors')
  })

  it('sums money and counts only payable people in the headcount', () => {
    const fin = groups[1]
    expect(fin.people).toHaveLength(3)
    expect(fin.headcount).toBe(2)
    expect(fin.net).toBe(9619.8)
    expect(fin.gross).toBe(11200)
    expect(fin.deductions).toBe(1580.2)
  })

  it('reads a department-compiled voucher as one PV covering everyone', () => {
    const mkt = groups[0]
    expect(mkt.mode).toBe('department')
    expect(mkt.deptVoucher?.id).toBe('v1')
    expect(mkt.vouchers).toHaveLength(1)
    expect(mkt.generated).toBe(2)
    expect(mkt.paid).toBe(2)
    expect(mkt.stage).toBe('paid')
  })

  it('reads a half-generated employee batch as partial and counts bank blockers', () => {
    const fin = groups[1]
    expect(fin.mode).toBe('employee')
    expect(fin.deptVoucher).toBeNull()
    expect(fin.generated).toBe(1)
    expect(fin.pending).toBe(1)
    expect(fin.stage).toBe('partial')
    expect(fin.blockers).toBe(1)
  })

  it('carries last month only for the people who were paid then', () => {
    const mkt = groups[0]
    expect(mkt.prev_count).toBe(2)
    expect(mkt.prev_net).toBe(10007.45)
    expect(groups[1].prev_net).toBeNull()
  })

  it('sorts people inside a department by name', () => {
    expect(groups[0].people.map((p) => p.name)).toEqual(['BOON', 'KHO'])
  })
})

describe('delta / varianceLabel / isNotableMove', () => {
  it('describes the move in plain words', () => {
    const d = delta(44012.78, 42650.1)
    expect(d?.dir).toBe('up')
    expect(d?.abs).toBe(1362.68)
    expect(varianceLabel(d, 'July')).toBe('▲ 3.2% higher than July')
    expect(varianceLabel(delta(100, 100), 'July')).toBe('Same as July')
    expect(varianceLabel(delta(80, 100), 'July')).toBe('▼ 20.0% lower than July')
    expect(varianceLabel(null, 'July')).toBeNull()
  })
  it('handles a zero base without dividing by it', () => {
    const d = delta(500, 0)
    expect(d?.pct).toBeNull()
    expect(varianceLabel(d, 'July')).toBe('▲ higher than July')
  })
  it('flags only moves of 20% and at least RM 50', () => {
    expect(isNotableMove(delta(1200, 1000))).toBe(true)
    expect(isNotableMove(delta(1100, 1000))).toBe(false)
    expect(isNotableMove(delta(60, 40))).toBe(false)
    expect(isNotableMove(null)).toBe(false)
  })
})

describe('statutoryDue', () => {
  it('is the 15th of the following month', () => {
    expect(statutoryDue('2026-08-01', 'KWSP')).toBe('2026-09-15')
    expect(statutoryDue('2026-08-01', 'PCB')).toBe('2026-09-15')
  })
  it('rolls KWSP forward and the others back when the 15th is a weekend', () => {
    // 15 Nov 2026 is a Sunday
    expect(statutoryDue('2026-10-01', 'KWSP')).toBe('2026-11-16')
    expect(statutoryDue('2026-10-01', 'SOCSO')).toBe('2026-11-13')
    expect(statutoryDue('2026-10-01', 'PCB')).toBe('2026-11-13')
    // 15 Aug 2026 is a Saturday
    expect(statutoryDue('2026-07-01', 'KWSP')).toBe('2026-08-17')
    expect(statutoryDue('2026-07-01', 'EIS')).toBe('2026-08-14')
  })
  it('crosses the year end', () => {
    expect(statutoryDue('2026-12-01', 'KWSP')).toBe('2027-01-15')
  })
})

describe('statutoryRows + cycleTotals', () => {
  const c = cycle({
    people: [
      person({ name: 'A', epf_er: 100, epf_ee: 90, socso_er: 10, socso_ee: 3, eis_er: 1, eis_ee: 1, pcb: 20, skbbk: 5, net: 1000, gross: 1119 }),
      person({ name: 'B', dept_id: 'd-fin', dept_name: 'Finance', epf_er: 200, epf_ee: 180, socso_er: 20, socso_ee: 6, eis_er: 2, eis_ee: 2, pcb: 0, skbbk: 0, net: 2000, gross: 2188 }),
      person({ name: 'D', scope: 'directors', dept_id: null, dept_name: 'Directors', epf_er: 1728, epf_ee: 1584, socso_er: 104.15, socso_ee: 29.75, eis_er: 11.9, eis_ee: 11.9, pcb: 2029.2, skbbk: 44.65, net: 10700.5, gross: 14400 }),
    ],
    statutory_vouchers: [
      { id: 's1', no: 'HV-PV-202609-0400', payee: 'KWSP', status: 'pending_approval', amount: 3882, payment_date: null, description: 'KWSP (EPF) — Aug 2026 payroll (staff + directors)', created_at: null, approved_at: null },
      { id: 's2', no: 'HV-PV-202609-0401', payee: 'LHDN', status: 'paid', amount: 2049.2, payment_date: '2026-09-14', description: 'LHDN (PCB) — Aug 2026 payroll (staff + directors)', created_at: null, approved_at: '2026-09-14T02:00:00Z' },
    ],
  })
  const groups = groupDepartments(c.people)
  const rows = statutoryRows(c, groups)

  it('splits every scheme into staff and directors and finds its voucher', () => {
    const kwsp = rows.find((r) => r.scheme === 'KWSP')!
    expect(kwsp.staff).toBe(570)
    expect(kwsp.directors).toBe(3312)
    expect(kwsp.total).toBe(3882)
    expect(kwsp.pv?.no).toBe('HV-PV-202609-0400')
    expect(kwsp.stage).toBe('pending')
    expect(kwsp.directorsCovered).toBe(true)
    expect(kwsp.due).toBe('2026-09-15')
    expect(kwsp.portal).toBe('i-Akaun (Majikan)')
    const lhdn = rows.find((r) => r.scheme === 'PCB')!
    expect(lhdn.stage).toBe('paid')
    const socso = rows.find((r) => r.scheme === 'SOCSO')!
    expect(socso.stage).toBe('not_generated')
    expect(socso.body).toBe('PERKESO')
  })

  it('breaks each scheme down by department in the same order as the board', () => {
    const kwsp = rows.find((r) => r.scheme === 'KWSP')!
    expect(kwsp.byDepartment.map((d) => [d.name, d.amount])).toEqual([
      ['Finance', 380],
      ['Marketing', 190],
      ['Directors', 3312],
    ])
  })

  it('adds up to the CTC Finance funded', () => {
    const t = cycleTotals(c, rows)
    expect(t.people).toBe(3)
    expect(t.net).toBe(13700.5)
    expect(t.statutory).toBe(Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100)
    expect(t.ctc).toBe(Math.round((t.net + t.statutory) * 100) / 100)
    expect(t.employer).toBe(Math.round((100 + 10 + 1 + 200 + 20 + 2 + 1728 + 104.15 + 11.9) * 100) / 100)
    expect(t.prevNet).toBeNull()
  })
})

describe('cyclePhase', () => {
  it('walks the run and its funding request', () => {
    expect(cyclePhase(cycle({ people: [] }))).toBe('no-payroll')
    expect(cyclePhase(cycle({ people: [person({ name: 'a' })], run: null }))).toBe('drafts-pending')
    const c = cycle({ people: [person({ name: 'a' })] })
    expect(cyclePhase({ ...c, funding: { staff: null, directors: null } })).toBe('approved-ready')
    expect(cyclePhase({ ...c, funding: { staff: { ...c.funding.staff!, status: 'submitted' }, directors: null } })).toBe('request-submitted')
    expect(cyclePhase({ ...c, funding: { staff: { ...c.funding.staff!, status: 'pv_generated' }, directors: null } })).toBe('pv-generated')
    expect(cyclePhase(c)).toBe('funded')
    expect(cyclePhase({ ...c, run: { ...c.run!, status: 'paid' }, funding: { staff: null, directors: null } })).toBe('funded')
  })
})

describe('normaliseCycle', () => {
  it('coerces numeric strings and fills defaults', () => {
    const c = normaliseCycle({
      period: '2026-08-01',
      run: { id: 'r', status: 'approved', total_amount: '109770.21' },
      pool_balance: '31389.17',
      funding: { staff: { id: 'f', status: 'completed', amount: '109770.21' } },
      people: [{ row_id: 'x', scope: 'staff', name: 'A', net: '3607.45', gross: '4100', voucher: { id: 'v', status: 'paid', granularity: 'department' } }],
      statutory_vouchers: [{ id: 's', payee: 'KWSP', status: 'paid', amount: '34479' }],
    })
    expect(c.run?.total_amount).toBe(109770.21)
    expect(c.pool_balance).toBe(31389.17)
    expect(c.funding.staff?.amount).toBe(109770.21)
    expect(c.funding.directors).toBeNull()
    expect(c.people[0].net).toBe(3607.45)
    expect(c.people[0].dept_name).toBe('Unassigned')
    expect(c.people[0].voucher?.granularity).toBe('department')
    expect(c.people[0].prev_net).toBeNull()
    expect(c.statutory_vouchers[0].amount).toBe(34479)
  })
})

describe('dates', () => {
  it('prints short dates and counts days', () => {
    expect(shortDate('2026-09-05')).toBe('5 Sep')
    expect(shortDate('2026-09-05T02:12:00Z')).toBe('5 Sep')
    expect(shortDate(null)).toBe('')
    expect(daysUntil('2026-09-15', new Date(Date.UTC(2026, 8, 10)))).toBe(5)
    expect(daysUntil('2026-09-15', new Date(Date.UTC(2026, 8, 20)))).toBe(-5)
  })
})

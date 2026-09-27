import { describe, it, expect } from 'vitest'
import {
  bankIssue,
  contributionTotals,
  cycleHeadline,
  cyclePhase,
  cycleTotals,
  daysUntil,
  ddmm,
  delta,
  deptTimeline,
  directorsFunded,
  duePill,
  groupDepartments,
  isNotableMove,
  milestones,
  monthRail,
  normaliseCycle,
  payVariances,
  shortDate,
  statutoryDue,
  statutoryRows,
  varianceLabel,
  type CyclePerson,
  type CycleVoucher,
  type HeadlineInput,
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
    expect(ddmm('2026-09-15')).toBe('15/09')
  })
})

// ── The re-skin (2026-09-11): the helpers behind the researched HRMS patterns ──

describe('contributionTotals (the PayrollPanda band)', () => {
  it('splits gross into the employee heads, net and the employer heads', () => {
    const t = contributionTotals([
      person({ name: 'A', gross: 1119, net: 1000, epf_ee: 90, socso_ee: 3, eis_ee: 1, pcb: 20, skbbk: 5, epf_er: 100, socso_er: 10, eis_er: 1 }),
      person({ name: 'B', gross: 2188, net: 2000, epf_ee: 180, socso_ee: 6, eis_ee: 2, pcb: 0, skbbk: 0, epf_er: 200, socso_er: 20, eis_er: 2 }),
    ])
    expect(t.gross).toBe(3307)
    expect(t.net).toBe(3000)
    expect(t.employee).toEqual({ epf: 270, socso: 9, eis: 3, pcb: 20, skbbk: 5, other: 0, total: 307 })
    expect(t.employer).toEqual({ epf: 300, socso: 30, eis: 3, total: 333 })
    expect(t.cost).toBe(3640)
  })

  it('puts a deduction the five heads do not explain under "other"', () => {
    const t = contributionTotals([person({ name: 'A', gross: 4000, net: 3200, epf_ee: 440, socso_ee: 20, eis_ee: 8, pcb: 12, skbbk: 20 })])
    expect(t.employee.other).toBe(300)
    expect(t.employee.total).toBe(800)
  })
})

describe('deptTimeline (a Deel cycle row)', () => {
  const people = [person({ name: 'A' }), person({ name: 'B' })]
  const g = () => groupDepartments(people)[0]

  it('waits for funding, then is ready with the planned pay date', () => {
    const t1 = deptTimeline(g(), false, '2026-09-05', '2026-09-03')
    expect(t1.sentence).toBe('Waiting for Finance to fund')
    expect(t1.segments).toEqual(['now', 'wait', 'wait', 'wait'])
    const t2 = deptTimeline(g(), true, '2026-09-05', '2026-09-03')
    expect(t2.sentence).toBe('Ready to generate · pay date 5 Sep')
    expect(t2.tone).toBe('accent')
    expect(t2.segments).toEqual(['done', 'now', 'wait', 'wait'])
    expect(t2.caption).toBe('Pay date · 5 Sep')
  })

  it('turns danger when the pay date has passed', () => {
    const t = deptTimeline(g(), true, '2026-09-05', '2026-09-08')
    expect(t.tone).toBe('danger')
    expect(t.segments[1]).toBe('late')
    expect(t.sentence).toContain('has passed')
  })

  it('reads a pending department voucher, then a paid one, with the audit line', () => {
    const v = voucher({ id: '1', granularity: 'department', created_at: '2026-09-05T02:12:00Z' })
    const pending = groupDepartments(people.map((p) => ({ ...p, voucher: v })))[0]
    const t = deptTimeline(pending, true, '2026-09-05', '2026-09-05')
    expect(t.sentence).toBe('Awaiting Principal since 5 Sep 10:12')
    expect(t.tone).toBe('alert')
    expect(t.segments).toEqual(['done', 'done', 'now', 'wait'])
    expect(t.audit).toBe('Generated 5 Sep 10:12')
    const paidV = { ...v, status: 'paid' as const, approved_at: '2026-09-05T03:03:00Z' }
    const paid = groupDepartments(people.map((p) => ({ ...p, voucher: paidV })))[0]
    const t2 = deptTimeline(paid, true, '2026-09-05', '2026-09-20')
    expect(t2.sentence).toBe('Paid 5 Sep · HV-PV-1')
    expect(t2.tone).toBe('ledger')
    expect(t2.segments).toEqual(['done', 'done', 'done', 'done'])
    expect(t2.audit).toBe('Generated 5 Sep 10:12 · Approved 5 Sep 11:03')
  })

  it('counts a half-generated department', () => {
    const half = groupDepartments([people[0], { ...people[1], voucher: voucher({ id: '2', status: 'paid' }) }])[0]
    const t = deptTimeline(half, true, '2026-09-05', '2026-09-05')
    expect(t.sentence).toBe('1 of 2 generated · 1 to go')
    expect(t.segments).toEqual(['done', 'now', 'wait', 'wait'])
  })

  it('says so when nobody is payable', () => {
    const t = deptTimeline(groupDepartments([person({ name: 'Z', net: 0 })])[0], true, '2026-09-05', '2026-09-05')
    expect(t.sentence).toBe('Nobody to pay this month')
    expect(t.tone).toBe('muted')
  })
})

describe('duePill (ADP vocabulary)', () => {
  it('counts down, then up, and names the paid day', () => {
    expect(duePill('2026-09-15', '2026-09-01')).toEqual({ text: 'Due in 14 days (15/09)', tone: 'accent' })
    expect(duePill('2026-09-15', '2026-09-12')).toEqual({ text: 'Due in 3 days (15/09)', tone: 'alert' })
    expect(duePill('2026-09-15', '2026-09-14')).toEqual({ text: 'Due in 1 day (15/09)', tone: 'alert' })
    expect(duePill('2026-09-15', '2026-09-15')).toEqual({ text: 'Due today (15/09)', tone: 'alert' })
    expect(duePill('2026-09-15', '2026-09-18')).toEqual({ text: 'Overdue 3 days (15/09)', tone: 'danger' })
    expect(duePill('2026-09-15', '2026-09-18', '2026-09-14')).toEqual({ text: 'Paid 14 Sep', tone: 'ledger' })
  })
})

function headlineInput(c: PaymentCycle, today = '2026-09-03'): HeadlineInput {
  const groups = groupDepartments(c.people)
  const rows = statutoryRows(c, groups)
  const phase = cyclePhase(c)
  return { cycle: c, groups, rows, phase, staffFunded: phase === 'funded', directorsFunded: directorsFunded(c), today, plannedStaffDate: '2026-09-05', plannedDirectorDate: '2026-09-02' }
}

describe('cycleHeadline (Personio status word + countdown)', () => {
  const funded = () => cycle({ run: { id: 'run', status: 'paid', total_amount: 109770.21, submitted_at: '2026-09-01T01:00:00Z', approved_at: '2026-09-01T01:00:00Z' } })

  it('says there is no payroll, then that drafts are not submitted', () => {
    const none = cycleHeadline(headlineInput(cycle({ run: null })))
    expect(none.word).toBe('No payroll')
    expect(none.action.kind).toBe('payroll')
    const drafts = cycleHeadline(headlineInput(cycle({ run: null, people: [person({ name: 'A' })] })))
    expect(drafts.word).toBe('Not submitted')
    expect(drafts.segments.map((s) => s.state)).toEqual(['now', 'wait', 'wait', 'wait'])
  })

  it('walks the funding request', () => {
    const c = cycle({ people: [person({ name: 'A' })], funding: { staff: { id: 'f', status: 'submitted', amount: 5000, requested_at: '2026-09-02T00:00:00Z', pv_id: null, pv_no: null, pv_status: null, pv_date: null }, directors: null } })
    const h = cycleHeadline(headlineInput(c))
    expect(h.word).toBe('With Finance')
    expect(h.detail).toContain('filed 2 Sep')
    expect(h.action.kind).toBe('funding')
    expect(h.segments[1].note).toBe('with Finance')
  })

  it('is ready to generate once funded, and counts down to the pay date', () => {
    const c = funded()
    c.people = [person({ name: 'A' }), person({ name: 'B', dept_id: 'd-fin', dept_name: 'Finance' })]
    const h = cycleHeadline(headlineInput(c))
    expect(h.word).toBe('Ready to generate')
    expect(h.tone).toBe('accent')
    expect(h.due).toEqual({ label: 'Pay date', date: '2026-09-05', days: 2 })
    expect(h.segments.map((s) => s.state)).toEqual(['done', 'done', 'now', 'wait'])
    expect(h.action.kind).toBe('generate-salary')
    const late = cycleHeadline(headlineInput(c, '2026-09-08'))
    expect(late.word).toBe('Pay date passed')
    expect(late.tone).toBe('danger')
    expect(late.due.days).toBe(-3)
  })

  it('waits on Principal with a link to the group', () => {
    const c = funded()
    c.people = [person({ name: 'A', voucher: voucher({ id: '1', group_id: 'grp-9' }) })]
    const h = cycleHeadline(headlineInput(c))
    expect(h.word).toBe('Awaiting Principal')
    expect(h.detail).toBe('1 of 1 salary PVs with Principal since 5 Sep 10:12 · 0 paid.')
    expect(h.action).toEqual({ kind: 'approvals', label: 'Open Approvals →', href: '/approvals?group_id=grp-9' })
  })

  it('moves on to statutory once the salaries are paid, then closes the month', () => {
    const c = funded()
    c.people = [person({ name: 'A', voucher: voucher({ id: '1', status: 'paid' }) })]
    const h = cycleHeadline(headlineInput(c, '2026-09-10'))
    expect(h.word).toBe('Salaries paid')
    expect(h.due).toEqual({ label: 'Statutory due', date: '2026-09-15', days: 5 })
    expect(h.action.kind).toBe('generate-statutory')
    expect(h.action.label).toBe('Generate statutory')
    expect(h.segments.map((s) => s.state)).toEqual(['done', 'done', 'done', 'now'])
    c.statutory_vouchers = ['KWSP', 'PERKESO (SOCSO)', 'PERKESO (EIS)', 'LHDN', 'SKBBK'].map((payee, i) => ({
      id: `s${i}`, no: `HV-PV-${i}`, payee, status: 'paid' as const, amount: 1, payment_date: '2026-09-14', description: `${payee} — Aug 2026 payroll (staff + directors)`, created_at: null, approved_at: null,
    }))
    const closed = cycleHeadline(headlineInput(c, '2026-09-20'))
    expect(closed.word).toBe('Month closed')
    expect(closed.tone).toBe('ledger')
    expect(closed.action.kind).toBe('none')
    expect(closed.segments.every((s) => s.state === 'done')).toBe(true)
  })
})

describe('milestones (Personio due dates)', () => {
  it('lists the dated steps in order and marks the next one', () => {
    const c = cycle({ run: { id: 'run', status: 'paid', total_amount: 1, submitted_at: '2026-09-01T01:00:00Z', approved_at: null } })
    c.people = [person({ name: 'A' }), person({ name: 'D', scope: 'directors', dept_id: null, dept_name: 'Directors' })]
    const ms = milestones(headlineInput(c, '2026-09-03'))
    expect(ms.map((m) => [m.key, m.state])).toEqual([
      ['submitted', 'done'],
      ['funded-staff', 'done'],
      ['funded-dirs', 'done'],
      ['pay-staff', 'next'],
      ['pay-dirs', 'late'],
      ['stat-2026-09-15', 'upcoming'],
    ])
    expect(ms[3].date).toBe('2026-09-05')
    expect(ms[5].label).toBe('KWSP · PERKESO · LHDN · SKBBK')
  })

  it('splits the statutory chips when KWSP rolls the other way', () => {
    const c = cycle({ period: '2026-07-01', run: { id: 'run', status: 'paid', total_amount: 1, submitted_at: '2026-08-01T01:00:00Z', approved_at: null } })
    c.people = [person({ name: 'A', voucher: voucher({ id: '1', status: 'paid', payment_date: '2026-08-05' }) })]
    const ms = milestones(headlineInput(c, '2026-08-10'))
    const stat = ms.filter((m) => m.key.startsWith('stat-'))
    expect(stat.map((m) => [m.date, m.label])).toEqual([
      ['2026-08-14', 'PERKESO · LHDN · SKBBK'],
      ['2026-08-17', 'KWSP'],
    ])
    expect(stat[0].state).toBe('next')
  })
})

describe('payVariances', () => {
  it('ranks the biggest moves and counts who changed, who is new', () => {
    const v = payVariances([
      person({ name: 'A', net: 3500, prev_net: 3500 }),
      person({ name: 'B', net: 4200, prev_net: 3500 }),
      person({ name: 'C', net: 3000, prev_net: 3100 }),
      person({ name: 'N', net: 2000, prev_net: null }),
      person({ name: 'Z', net: 0, prev_net: 100 }),
    ])
    expect(v.top.map((x) => x.name)).toEqual(['B', 'C'])
    expect(v.top[0].d.abs).toBe(700)
    expect(v.changed).toBe(2)
    expect(v.compared).toBe(3)
    expect(v.joiners).toBe(1)
    expect(v.notable).toBe(1)
  })
})

describe('monthRail (BambooHR pay-date rail)', () => {
  it('walks the months around the one on screen with how far each got', () => {
    const rail = monthRail(
      '2026-08-01',
      [
        { id: 'r5', period_month: '2026-05-01', status: 'paid' },
        { id: 'r6', period_month: '2026-06-01', status: 'approved' },
        { id: 'r7', period_month: '2026-07-01', status: 'approved' },
        { id: 'r8', period_month: '2026-08-01', status: 'draft' },
      ],
      [
        ...Array.from({ length: 5 }, () => ({ reference_id: 'r5', status: 'paid' })),
        { reference_id: 'r6', status: 'paid' },
      ],
      [{ payroll_run_id: 'r6', status: 'completed' }],
      3,
      1,
    )
    expect(rail.map((m) => [m.mon, m.state, m.current])).toEqual([
      ['May', 'closed', false],
      ['Jun', 'funded', false],
      ['Jul', 'submitted', false],
      ['Aug', 'drafts', true],
      ['Sep', 'none', false],
    ])
    expect(rail[0].period).toBe('2026-05-01')
    expect(rail[0].year).toBe(2026)
  })

  it('crosses the year boundary', () => {
    const rail = monthRail('2027-01-01', [], [], [], 2, 1)
    expect(rail.map((m) => `${m.mon} ${m.year}`)).toEqual(['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027'])
  })
})

// ── Unified Payroll (2026-09-27): funding per batch, top-ups pay the difference ──
import {
  groupFunded,
  payableSalaryComponents,
  salaryCoveredAmount,
  salaryPaidAmount,
  statutoryPayable,
  statutoryRemaining,
} from './payment-cycle'
import { payrollComponentSelection } from './payroll-selection'

describe('batch funding on HR › Payment', () => {
  const voucher = { id: 'pv1', no: 'HV-PV-202609-0435', status: 'paid', payment_date: '2026-09-28', created_at: null, approved_at: null, granularity: 'employee', group_id: null }
  const cycle = () => normaliseCycle({
    period: '2026-09-01',
    people: [
      // Batch #1, funded and paid.
      { row_id: 'fin', scope: 'staff', name: 'CHEW WEE HO', dept_id: 'finance', dept_name: 'Finance', bank_name: 'Maybank', bank_account_no: '123',
        net: 5854.5, gross: 7000, epf_er: 910, epf_ee: 770,
        components: [{ component: 'net', amount: 5854.5, voucher, funded: true, covered_before: 0, paid_before: 0 }] },
      // Batch #1 paid its 2,649.35; the resubmit's 1,247.45 is funded and waits for a PV.
      { row_id: 'low', scope: 'staff', name: 'LOW CHENG AN', dept_id: 'finance', dept_name: 'Finance', bank_name: 'AmBank', bank_account_no: '456',
        net: 3896.8, gross: 4700, epf_er: 611, epf_ee: 517,
        components: [{ component: 'net', amount: 1247.45, voucher: null, funded: true, covered_before: 2649.35, paid_before: 2649.35 }],
        statutory_funded: { KWSP: 1128, SOCSO: 0, EIS: 0, PCB: 0, SKBBK: 0 } },
      // Batch #2, not funded yet.
      { row_id: 'hr', scope: 'staff', name: 'HR PERSON', dept_id: 'hr', dept_name: 'HR', bank_name: 'CIMB', bank_account_no: '789',
        net: 3518.9, gross: 4000, epf_er: 520, epf_ee: 440,
        components: [{ component: 'net', amount: 3518.9, voucher: null, funded: false }],
        statutory_funded: { KWSP: 0, SOCSO: 0, EIS: 0, PCB: 0, SKBBK: 0 } },
    ],
  })

  it('reads a resubmit as the remainder still to pay, with what went before', () => {
    const [, low] = cycle().people
    expect(payableSalaryComponents(low).map(c => c.amount)).toEqual([1247.45])
    expect(salaryPaidAmount(low)).toBe(2649.35)
    expect(salaryCoveredAmount(low)).toBe(2649.35)
  })

  it('pays a funded batch while a later one waits', () => {
    const groups = groupDepartments(cycle().people)
    const finance = groups.find(g => g.name === 'Finance')!
    const hr = groups.find(g => g.name === 'HR')!
    expect(finance).toMatchObject({ batchFunding: true, fundable: 1, awaitingFunding: 0 })
    expect(hr).toMatchObject({ batchFunding: true, fundable: 0, awaitingFunding: 1 })
    // The month is not "funded" (batch #2 waits), yet Finance can pay.
    expect(groupFunded(finance, false)).toBe(true)
    expect(groupFunded(hr, false)).toBe(false)
  })

  it('never offers an unfunded component for a PV, and offers only the remainder of a resubmit', () => {
    const people = cycle().people
    const selection = payrollComponentSelection(people, null, 'employee')
    expect(selection.eligible.map(l => `${l.person.row_id}:${l.amount}`)).toEqual(['low:1247.45'])
    expect(selection.componentSelections[0]).toMatchObject({ payroll_row_id: 'low', component: 'net', expected_amount: 1247.45 })
  })

  it('raises statutory for what is funded, less what vouchers cover', () => {
    const [, low, hr] = cycle().people
    const coverage = [{ row_id: 'low', scope: 'staff' as const, scheme: 'KWSP' as const, voucher_id: 'k1', amount: 1000 }]
    // KWSP owed 1,128 (611 + 517), covered 1,000: 128 left, all of it funded.
    expect(statutoryRemaining(coverage, low, 'KWSP')).toBe(128)
    expect(statutoryPayable(coverage, low, 'KWSP')).toBe(128)
    // HR's batch is not funded: owed, but nothing to raise yet.
    expect(statutoryRemaining(coverage, hr, 'KWSP')).toBe(960)
    expect(statutoryPayable(coverage, hr, 'KWSP')).toBe(0)
  })
})

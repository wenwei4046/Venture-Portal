import { describe, expect, it } from 'vitest'
import { registerOf, type Ctx } from './engine'
import {
  attendanceFacts,
  hoursADay,
  otDayType,
  otHoursOf,
  payrollFields,
  payrollMarks,
  planPayroll,
  priceFact,
  type AttendancePay,
  type PayrollRowLite,
  type StaffLite,
} from './payroll'
import type { AttAssignment, AttConfig, AttMonth, AttPerson, AttRequest, AttSchedule } from './types'

const person = (id: string, over: Partial<AttPerson> = {}): AttPerson => ({
  id, name: id, code: null, titleId: 't-exec', title: 'Executive', level: 3, levelName: null, departmentId: 'd1', department: 'Marketing',
  hireDate: '2020-03-15', hasLogin: true, uplineId: null, upline: null, uplineHasLogin: null, templateId: null, ...over,
})
const work = { type: 'work' as const, start: '09:00', end: '18:00', break: 60 }
const OFFICE: AttSchedule = {
  id: 's1', name: 'Office 9–6', days: [
    { day: 'Mon', ...work }, { day: 'Tue', ...work }, { day: 'Wed', ...work }, { day: 'Thu', ...work }, { day: 'Fri', ...work },
    { day: 'Sat', type: 'off' }, { day: 'Sun', type: 'rest' }],
}
const asg = (over: Partial<AttAssignment>): AttAssignment => ({
  id: Math.random().toString(36), level: 'company', titleId: null, staffId: null, label: 'Co', mode: 'no_clock', scheduleId: 's1', locationId: null,
  anywhere: false, ot: 'by_wage', from: '2026-01-01', ...over,
})
const POLICY = { id: 'p', from: '2026-01-01', fenceMode: 'flag' as const, photoRequired: true, earliestInMin: 120, cutover: '04:00', graceMin: 5, correctionsPerMonth: 3, otWarnH: 80, otFlagH: 104, otBase: 'basic' as const, photoKeepDays: 90 }
const config = (over: Partial<AttConfig> = {}): AttConfig => ({
  today: '2026-11-02', now: '09:41', canCreate: true, canEdit: true, canApprove: true, me: 'HR',
  people: [person('ali', { name: 'Ali' })], titles: [], levels: [], departments: [],
  schedules: [OFFICE], locations: [], holidays: [], assignments: [asg({})],
  leaveTypes: [
    { id: 'al', code: 'AL', name: 'Annual leave', groups: [], rules: '', route: 'upline_only', counts: 'working', accrues: true, unpaid: false, drawsFrom: null },
    { id: 'ul', code: 'UL', name: 'Unpaid leave', groups: [], rules: '', route: 'upline_only', counts: 'working', accrues: false, unpaid: true, drawsFrom: null },
  ],
  otRates: [{ dayType: 'work', multiplier: 1.5, minimum: 1.5 }, { dayType: 'off', multiplier: 1.5, minimum: 1.5 }, { dayType: 'rest', multiplier: 2, minimum: 2 }, { dayType: 'ph', multiplier: 3, minimum: 3 }],
  routes: [], policies: [POLICY],
  ...over,
})
const month = (over: Partial<AttMonth> = {}): AttMonth => ({ month: '2026-10-01', punches: [], marks: [], overrides: [], leave: [], decisions: [], close: null, ...over })
const ctxOf = (c: AttConfig, m: AttMonth): Ctx => ({ config: c, month: m, today: c.today, now: c.now })
let seq = 0
const ot = (staffId: string, day: string, hours: number, dayType?: string, over: Partial<AttRequest> = {}): AttRequest => ({
  id: `r${++seq}`, ref: `AT-${String(seq).padStart(3, '0')}`, staffId, who: staffId, kind: 'ot', leaveCode: null, from: day, to: day, days: null, hours,
  detail: dayType ? { dayType } : {}, reason: 'x', attachment: null, hasAttachment: false, route: 'hr_only', status: 'approved', onBehalf: true, by: 'HR',
  sentAt: `${day}T10:00:00+08:00`, decidedAt: null, steps: [], events: [], ...over,
})

// Ali, the example the user agreed to (2026-10-15): basic RM 2,600, 8-hour days, October 2026 (31 days).
// OT: 6 h on a work day × 1.5 and 4 h on a rest day × 2. Unpaid: 1 day of UL and 1 absent day decided Unpaid.
const ALI_MONTH = month({
  leave: [{ id: 'l1', ref: 'AT-UL', staffId: 'ali', code: 'UL', from: '2026-10-07', to: '2026-10-07', status: 'approved' }],
  marks: [{ staffId: 'ali', day: '2026-10-06', code: 'A', in: null, out: null, note: 'no show', by: 'HR', at: '' }],
  decisions: [
    { staffId: 'ali', day: '2026-10-06', decision: 'Unpaid', by: 'HR' },
    // Decided while it was absent, corrected to a working day since: no longer unpaid.
    { staffId: 'ali', day: '2026-10-08', decision: 'Unpaid', by: 'HR' },
  ],
})
const ALI_OT = [ot('ali', '2026-10-05', 6, 'work'), ot('ali', '2026-10-11', 4, 'rest')]
const CLOSED_AT = '2026-11-02T01:15:00.123456+00:00'

describe('a full day’s hours', () => {
  it('is the schedule’s longest work day — a half Saturday does not halve it — and 8 without a schedule', () => {
    expect(hoursADay(OFFICE)).toBe(8)
    expect(hoursADay({ ...OFFICE, days: OFFICE.days.map(d => (d.day === 'Sat' ? { day: 'Sat', type: 'work' as const, start: '09:00', end: '13:00', break: 0 } : d)) })).toBe(8)
    expect(hoursADay({ ...OFFICE, days: OFFICE.days.map(d => (d.type === 'work' ? { ...d, break: 30 } : d)) })).toBe(8.5)
    expect(hoursADay(null)).toBe(8)
    expect(hoursADay({ id: 'x', name: 'x', days: [] })).toBe(8)
  })
})

describe('the rate an OT line is paid at', () => {
  it('is the day type on the request, else what the day is', () => {
    const r = (dayType?: string) => ({ detail: dayType ? { dayType } : {} })
    expect(otDayType(r('rest'), { code: 'P', sday: { day: 'Mon', type: 'work' } })).toBe('rest')
    expect(otDayType(r('nonsense'), { code: 'P', sday: { day: 'Mon', type: 'work' } })).toBe('work')
    expect(otDayType(r(), { code: 'H', sday: { day: 'Mon', type: 'work' } })).toBe('ph')
    expect(otDayType(r(), { code: 'CH', sday: { day: 'Mon', type: 'work' } })).toBe('off')
    expect(otDayType(r(), { code: 'W', sday: { day: 'Sun', type: 'rest' } })).toBe('rest')
    expect(otDayType(r(), { code: 'W', sday: { day: 'Sat', type: 'off' } })).toBe('off')
    expect(otDayType(r(), { code: '', sday: null })).toBe('work')
  })
})

describe('what a closed month sends to payroll', () => {
  const ctx = ctxOf(config(), ALI_MONTH)

  it('Ali: OT 10 h · RM 212.50, 2 unpaid days — the example the user agreed to', () => {
    const [fact] = attendanceFacts(ctx, ALI_OT)
    expect(fact.unpaidDates).toEqual(['2026-10-06', '2026-10-07'])
    const pay = priceFact('2026-10-01', CLOSED_AT, fact, { basic: 2600, statutoryAllowance: 0 })
    expect(pay.lines.map(l => [l.day, l.dayType, l.hours, l.multiplier, l.orp, l.hrp, l.amount])).toEqual([
      ['2026-10-05', 'work', 6, 1.5, 100, 12.5, 112.5],
      ['2026-10-11', 'rest', 4, 2, 100, 12.5, 100],
    ])
    expect([pay.otHours, pay.otAmount, pay.unpaidDays, pay.closedAt]).toEqual([10, 212.5, 2, CLOSED_AT])
    expect(payrollFields(pay)).toEqual({ ot_hours: 10, ot_amount: 212.5, unpaid_leave_days: 2, attendance_figures: pay })
  })

  it('takes only approved overtime of the month, at the rate of its day when the request names none', () => {
    const rs = [
      ...ALI_OT,
      ot('ali', '2026-10-12', 2, undefined, { status: 'rejected' }),
      ot('ali', '2026-10-13', 2, undefined, { status: 'cancelled' }),
      ot('ali', '2026-09-30', 3),
      ot('ali', '2026-11-01', 3),
      ot('ali', '2026-10-17', 3), // a Saturday — the schedule's off day
      ot('bob', '2026-10-05', 9, 'work'),
    ]
    const [fact] = attendanceFacts(ctx, rs)
    expect(fact.ot.map(o => [o.day, o.dayType])).toEqual([['2026-10-05', 'work'], ['2026-10-11', 'rest'], ['2026-10-17', 'off']])
  })

  it('a public holiday is paid at the holiday rate', () => {
    const c = config({ holidays: [{ id: 'h', day: '2026-10-20', name: 'Deepavali', kind: 'compulsory', states: 'All' }] })
    const [fact] = attendanceFacts(ctxOf(c, ALI_MONTH), [ot('ali', '2026-10-20', 2)])
    const pay = priceFact('2026-10-01', CLOSED_AT, fact, { basic: 2600, statutoryAllowance: 0 })
    expect(pay.lines.map(l => [l.dayType, l.multiplier, l.amount])).toEqual([['ph', 3, 75]])
  })

  it('the policy’s base: basic + fixed allowance when it says so', () => {
    const c = config({ policies: [{ ...POLICY, otBase: 'fixed' }] })
    const [fact] = attendanceFacts(ctxOf(c, ALI_MONTH), [ot('ali', '2026-10-05', 2, 'work')])
    // (2,600 + 260) ÷ 26 = 110 a day; ÷ 8 = 13.75 an hour; 2 h × 13.75 × 1.5 = 41.25.
    expect(priceFact('2026-10-01', CLOSED_AT, fact, { basic: 2600, statutoryAllowance: 260 }).otAmount).toBe(41.25)
    // Basic only: 2 h × 12.50 × 1.5.
    expect(priceFact('2026-10-01', CLOSED_AT, attendanceFacts(ctx, [ot('ali', '2026-10-05', 2, 'work')])[0], { basic: 2600, statutoryAllowance: 260 }).otAmount).toBe(37.5)
  })

  it('the hourly rate keeps 4 decimals and each line rounds to the sen, so a line can be worked again from what is stored', () => {
    const [fact] = attendanceFacts(ctx, [ot('ali', '2026-10-05', 3, 'work'), ot('ali', '2026-10-06', 2.5, 'work')])
    const pay = priceFact('2026-10-01', CLOSED_AT, fact, { basic: 2650, statutoryAllowance: 0 })
    // 2,650 ÷ 26 = 101.923076… ÷ 8 = 12.740384… → 12.7404.
    expect(pay.lines.map(l => [l.orp, l.hrp, l.amount])).toEqual([[101.9231, 12.7404, 57.33], [101.9231, 12.7404, 47.78]])
    expect(pay.otAmount).toBe(105.11)
    for (const l of pay.lines) expect(l.amount).toBe(Math.round(l.hours * l.hrp * l.multiplier * 100) / 100)
  })

  it('Who clocks › OT: none keeps the hours on the line, unpaid', () => {
    const c = config({ assignments: [asg({ ot: 'none' })] })
    const [fact] = attendanceFacts(ctxOf(c, ALI_MONTH), ALI_OT)
    const pay = priceFact('2026-10-01', CLOSED_AT, fact, { basic: 2600, statutoryAllowance: 0 })
    expect(pay.lines.map(l => [l.hours, l.paid, l.amount])).toEqual([[6, false, 0], [4, false, 0]])
    expect([pay.otHours, pay.otAmount]).toEqual([0, 0])
  })

  it('a schedule with longer days lowers the hourly rate', () => {
    const long = { ...OFFICE, id: 's9', days: OFFICE.days.map(d => (d.type === 'work' ? { ...d, end: '19:00' } : d)) }
    const c = config({ schedules: [long], assignments: [asg({ scheduleId: 's9' })] })
    const [fact] = attendanceFacts(ctxOf(c, ALI_MONTH), [ot('ali', '2026-10-05', 9, 'work')])
    // 100 ÷ 9 h = 11.1111 an hour; 9 h × 11.1111 × 1.5 = 149.99985 → 150.00.
    expect(priceFact('2026-10-01', CLOSED_AT, fact, { basic: 2600, statutoryAllowance: 0 }).lines[0].hrp).toBe(11.1111)
  })

  it('refuses a day type with no rate rather than guess one', () => {
    const c = config({ otRates: [{ dayType: 'work', multiplier: 1.5, minimum: 1.5 }] })
    expect(() => attendanceFacts(ctxOf(c, ALI_MONTH), ALI_OT)).toThrow('Settings › OT rules has no rate for rest days.')
  })

  it('the register counts the same unpaid days and adds the overtime columns', () => {
    const [row] = registerOf(ctx, otHoursOf(ctx, [...ALI_OT, ot('ali', '2026-10-17', 3), ot('ali', '2026-10-20', 1, 'ph')]))
    expect([row.unpaid, row.ot, row.otRest, row.otPh]).toEqual([2, 9, 4, 1])
    expect(registerOf(ctx)[0]).toMatchObject({ unpaid: 2, ot: 0, otRest: 0, otPh: 0 })
  })
})

// ── Which rows take it ──────────────────────────────────────────────────────

const row = (staffId: string, over: Partial<PayrollRowLite> = {}): PayrollRowLite => ({
  id: `row-${staffId}`, staffId, status: 'draft', source: 'carried_forward', basic: 2600, statutoryAllowance: 0, attendance: null, ...over,
})
const rec = (id: string, over: Partial<StaffLite> = {}): StaffLite => ({
  id, basic_salary: 2600, allowances: 150, employment_type: 'salaried', payroll_source: 'imported', active: true, ...over,
})
const people = ['ann', 'ben', 'cal', 'dee', 'eve', 'fay', 'gus', 'hal'].map(id => person(id, { name: id.toUpperCase() }))

describe('which payroll rows take the close', () => {
  const c = config({ people })
  const facts = attendanceFacts(ctxOf(c, month()), [ot('ann', '2026-10-05', 2, 'work'), ot('fay', '2026-10-05', 2, 'work')])
  const rows = new Map([
    ['ann', row('ann', { basic: 3120 })],
    ['ben', row('ben', { status: 'completed' })],
    ['cal', row('cal', { status: 'submitted' })],
    ['dee', row('dee', { status: 'paid' })],
    ['eve', row('eve', { source: 'commission' })],
  ])
  const staff = new Map([
    ['fay', rec('fay', { basic_salary: 2080, allowances: 200 })],
    ['gus', rec('gus', { active: false })],
    ['hal', rec('hal', { employment_type: 'variable' })],
    ['eve', rec('eve', { payroll_source: 'commission' })],
  ])
  const steps = planPayroll('2026-10-01', CLOSED_AT, facts, rows, staff, { mayCreate: true })
  const byWho = Object.fromEntries(steps.map(s => [s.staffId, s]))

  it('a draft row is updated, priced on ITS basic', () => {
    const s = byWho.ann
    expect(s.kind).toBe('update')
    if (s.kind !== 'update') return
    expect(s.rowId).toBe('row-ann')
    // 3,120 ÷ 26 = 120; ÷ 8 = 15; 2 h × 15 × 1.5 = 45.
    expect([s.pay.otAmount, s.pay.month, s.pay.closedAt]).toEqual([45, '2026-10-01', CLOSED_AT])
  })

  it('a row already Completed, with Finance or paid is left, and says why', () => {
    expect([byWho.ben, byWho.cal, byWho.dee].map(s => s.kind === 'skip' && s.reason)).toEqual(['completed', 'submitted', 'paid'])
  })

  it('a person with no row gets the row Create period would make, priced on the record’s basic', () => {
    const s = byWho.fay
    expect(s.kind).toBe('create')
    if (s.kind !== 'create') return
    expect(s.seed).toEqual({ staff_id: 'fay', period_month: '2026-10-01', basic_salary: 2080, non_statutory_allowance: 200, source: 'carried_forward', status: 'draft' })
    // 2,080 ÷ 26 = 80; ÷ 8 = 10; 2 h × 10 × 1.5 = 30.
    expect(s.pay.otAmount).toBe(30)
  })

  it('no row for somebody inactive, nor while the account may not create rows', () => {
    expect(byWho.gus).toMatchObject({ kind: 'skip', reason: 'no_row' })
    const strict = planPayroll('2026-10-01', CLOSED_AT, facts, rows, staff, { mayCreate: false })
    expect(strict.find(s => s.staffId === 'fay')).toMatchObject({ kind: 'skip', reason: 'no_row' })
  })

  it('the Revenue team and a director are not HQ’s payroll — no step at all', () => {
    expect(byWho.eve).toBeUndefined()
    expect(byWho.hal).toBeUndefined()
    expect(steps).toHaveLength(6)
  })
})

describe('where each person’s payroll stands after a close', () => {
  const pay = (closedAt: string): AttendancePay => ({ month: '2026-10-01', closedAt, otHours: 0, otAmount: 0, unpaidDays: 0, unpaidDates: [], lines: [] })
  it('in, when the row carries THIS close; else the row’s state, no row, or not sent', () => {
    const marks = payrollMarks(
      CLOSED_AT,
      [{ staffId: 'ann', name: 'ANN' }, { staffId: 'ben', name: 'BEN' }, { staffId: 'cal', name: 'CAL' }, { staffId: 'dee', name: 'DEE' }, { staffId: 'eve', name: 'EVE' }, { staffId: 'hal', name: 'HAL' }],
      new Map([
        ['ann', row('ann', { attendance: pay(CLOSED_AT) })],
        ['ben', row('ben', { attendance: pay('2026-11-01T00:00:00+00:00') })],
        ['cal', row('cal', { status: 'completed', attendance: pay('2026-11-01T00:00:00+00:00') })],
        ['eve', row('eve', { source: 'commission' })],
      ]),
      new Map([['hal', rec('hal', { employment_type: 'variable' })]]),
    )
    expect(marks.map(m => [m.staffId, m.mark])).toEqual([['ann', 'in'], ['ben', 'not_sent'], ['cal', 'completed'], ['dee', 'no_row']])
  })
})

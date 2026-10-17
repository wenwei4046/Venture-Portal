import { describe, expect, it } from 'vitest'
import { assignmentFor, balanceOf, completedMonths, dayInfo, leaveDaysFor, monthGrid, yearsOfService, type Ctx } from './engine'
import type { AttAssignment, AttConfig, AttLedger, AttMonth, AttPerson } from './types'

const person = (id: string, over: Partial<AttPerson> = {}): AttPerson => ({
  id, name: id, code: null, titleId: 't-exec', title: 'Executive', level: 3, levelName: null, departmentId: 'd1', department: 'Marketing',
  hireDate: '2020-03-15', hasLogin: true, uplineId: null, upline: null, uplineHasLogin: null, templateId: null, ...over,
})
const work = { type: 'work' as const, start: '09:00', end: '18:00', break: 60 }
const asg = (over: Partial<AttAssignment>): AttAssignment => ({
  id: Math.random().toString(36), level: 'company', titleId: null, staffId: null, label: 'Co', mode: 'clock', scheduleId: 's1', locationId: null,
  anywhere: false, ot: null, from: '2026-01-01', ...over,
})
const config = (over: Partial<AttConfig> = {}): AttConfig => ({
  today: '2026-10-14', now: '09:41', canCreate: true, canEdit: true, canApprove: true, me: 'HR',
  people: [person('ann')], titles: [], levels: [], departments: [],
  schedules: [{ id: 's1', name: 'Office 9–6', days: [
    { day: 'Mon', ...work }, { day: 'Tue', ...work }, { day: 'Wed', ...work }, { day: 'Thu', ...work }, { day: 'Fri', ...work },
    { day: 'Sat', type: 'off' }, { day: 'Sun', type: 'rest' }] }],
  locations: [], holidays: [], assignments: [asg({})],
  leaveTypes: [
    { id: 'al', code: 'AL', name: 'Annual leave', groups: [{ titles: ['all'], levels: ['all'], base: 8, steps: [{ yrs: 2, days: 12 }, { yrs: 5, days: 16 }] }], rules: '', route: 'upline_only', counts: 'working', accrues: true, unpaid: false, drawsFrom: null },
    { id: 'sl', code: 'SL', name: 'Sick leave', groups: [{ titles: ['all'], levels: ['all'], base: 14, steps: [] }], rules: '', route: 'hr_only', counts: 'working', accrues: false, unpaid: false, drawsFrom: null },
  ],
  otRates: [], routes: [],
  policies: [{ id: 'p', from: '2026-01-01', fenceMode: 'flag', photoRequired: true, earliestInMin: 120, cutover: '04:00', graceMin: 5, correctionsPerMonth: 3, otWarnH: 80, otFlagH: 104, otBase: 'basic', photoKeepDays: 90, otWageCap: 4000 }],
  ...over,
})
const month = (over: Partial<AttMonth> = {}): AttMonth => ({ month: '2026-10-01', punches: [], marks: [], overrides: [], leave: [], decisions: [], close: null, ...over })
const punch = (day: string, dir: 'in' | 'out', time: string) => ({ id: `${day}${dir}`, staffId: 'ann', day, dir, time, source: 'app' as const, locationId: null, distance: null, inside: null, accuracy: null, device: '', photo: false, reason: '', invalid: false, invalidReason: '' })
const ctxOf = (c: AttConfig, m: AttMonth): Ctx => ({ config: c, month: m, today: c.today, now: c.now })
const code = (c: AttConfig, m: AttMonth, day: string) => dayInfo(c.people[0], day, ctxOf(c, m)).code

describe('who clocks, on what', () => {
  it('person over title over company, the latest from within a level', () => {
    const a = [asg({ label: 'co' }), asg({ level: 'title', titleId: 't-exec', label: 'title' }), asg({ level: 'person', staffId: 'ann', label: 'old', from: '2026-01-01' }),
      asg({ level: 'person', staffId: 'ann', label: 'new', from: '2026-10-01' }), asg({ level: 'person', staffId: 'ann', label: 'future', from: '2026-12-01' })]
    expect(assignmentFor(person('ann'), '2026-10-14', a)?.label).toBe('new')
    expect(assignmentFor(person('ann'), '2026-09-14', a)?.label).toBe('old')
    expect(assignmentFor(person('bob'), '2026-10-14', a)?.label).toBe('title')
    expect(assignmentFor(person('bob', { titleId: 'x' }), '2026-10-14', a)?.label).toBe('co')
    expect(assignmentFor(person('bob'), '2025-12-31', a)).toBeNull()
  })
})

describe('what a day is', () => {
  const c = config()
  it('reads the punches: on time, late past the grace, IN with no OUT, nothing', () => {
    const m = month({ punches: [punch('2026-10-01', 'in', '09:05'), punch('2026-10-01', 'out', '18:00'), punch('2026-10-02', 'in', '09:06'), punch('2026-10-02', 'out', '18:00'), punch('2026-10-05', 'in', '08:55')] })
    expect(code(c, m, '2026-10-01')).toBe('P')
    expect(code(c, m, '2026-10-02')).toBe('L')
    expect(dayInfo(c.people[0], '2026-10-02', ctxOf(c, m)).lateMin).toBe(6)
    expect(code(c, m, '2026-10-05')).toBe('I')
    expect(code(c, m, '2026-10-06')).toBe('A')
    expect(code(c, m, '2026-10-14')).toBe('·')
    expect(code(c, m, '2026-10-15')).toBe('')
    expect(code(c, m, '2026-10-03')).toBe('W')
    expect(dayInfo(c.people[0], '2026-10-01', ctxOf(c, m)).workedMin).toBe(475)
  })
  it('an IN today with no OUT yet is not incomplete', () => {
    expect(code(c, month({ punches: [punch('2026-10-14', 'in', '08:44')] }), '2026-10-14')).toBe('P')
  })
  it('HR’s mark wins, then approved leave, then whole days and holidays, then the weekend, then waiting leave', () => {
    const m = month({
      punches: [punch('2026-10-06', 'in', '08:50')],
      marks: [{ staffId: 'ann', day: '2026-10-06', code: 'A', in: null, out: null, note: 'x', by: 'HR', at: '' }],
      leave: [
        { id: '1', ref: 'a', staffId: 'ann', code: 'AL', from: '2026-10-07', to: '2026-10-07', status: 'approved' },
        { id: '2', ref: 'b', staffId: 'ann', code: 'AL', from: '2026-10-08', to: '2026-10-08', status: 'pending' },
        { id: '3', ref: 'c', staffId: 'ann', code: 'SL', from: '2026-10-09', to: '2026-10-11', status: 'approved' },
      ],
      overrides: [{ day: '2026-10-08', code: 'CH', name: 'Company day' }, { day: '2026-10-07', code: 'H', name: 'x' }],
    })
    expect(code(c, m, '2026-10-06')).toBe('A')
    expect(code(c, m, '2026-10-07')).toBe('AL')
    expect(code(c, m, '2026-10-08')).toBe('CH')
    expect(code(c, m, '2026-10-09')).toBe('SL')
    expect(code(c, m, '2026-10-10')).toBe('W')
    const m2 = month({ leave: [{ id: '2', ref: 'b', staffId: 'ann', code: 'AL', from: '2026-10-08', to: '2026-10-08', status: 'pending' }] })
    expect(code(c, m2, '2026-10-08')).toBe('AL?')
    expect(code(config({ holidays: [{ id: 'h', day: '2026-10-12', name: 'Deepavali', kind: 'compulsory', states: 'All' }] }), month(), '2026-10-12')).toBe('H')
  })
  it('a person who is off is not counted; no-clock keeps fixed hours', () => {
    expect(code(config({ assignments: [asg({ mode: 'off' })] }), month(), '2026-10-06')).toBe('')
    expect(code(config({ assignments: [asg({ mode: 'no_clock' })] }), month(), '2026-10-06')).toBe('P')
  })
})

describe('the month', () => {
  it('tallies days in, late, leave and absent for the people who clock', () => {
    const c = config({ people: [person('ann'), person('bob')], assignments: [asg({}), asg({ level: 'person', staffId: 'bob', mode: 'off' })] })
    const g = monthGrid(ctxOf(c, month({ punches: [punch('2026-10-01', 'in', '09:30'), punch('2026-10-01', 'out', '18:00')], leave: [{ id: '1', ref: 'a', staffId: 'ann', code: 'AL', from: '2026-10-02', to: '2026-10-02', status: 'approved' }] })))
    expect(g.rows.map(r => r.person.id)).toEqual(['ann'])
    expect(g.rows[0].t).toEqual({ inD: 1, late: 1, leave: 1, abs: 7 })
  })
})

describe('leave', () => {
  // The user, 2026-10-17: "系统不可以默认哪一天是休息日，而是要跟着这个 schedule … everythings go with this schedule".
  it('counts the days the person’s schedule works, less the holidays — never the weekday', () => {
    const ann = person('ann')
    // Fri 9 – Tue 13 on Office 9–6 (Sat off, Sun rest): Fri, Mon, Tue.
    expect(leaveDaysFor(ann, '2026-10-09', '2026-10-13', config())).toBe(3)
    // A schedule that works Saturdays counts the Saturday.
    const sixDays = config({ schedules: [{ id: 's1', name: 'Showroom', days: [
      { day: 'Mon', ...work }, { day: 'Tue', ...work }, { day: 'Wed', ...work }, { day: 'Thu', ...work }, { day: 'Fri', ...work },
      { day: 'Sat', ...work }, { day: 'Sun', type: 'rest' }] }] })
    expect(leaveDaysFor(ann, '2026-10-09', '2026-10-13', sixDays)).toBe(4)
    // No schedule, no day off: every day counts.
    expect(leaveDaysFor(ann, '2026-10-09', '2026-10-13', config({ assignments: [] }))).toBe(5)
    expect(leaveDaysFor(ann, '2026-10-09', '2026-10-13', config({ assignments: [asg({ scheduleId: null })] }))).toBe(5)
    // A holiday that covers them is not a leave day; a type counted in calendar days counts every day.
    expect(leaveDaysFor(ann, '2026-10-09', '2026-10-13', config({ holidays: [{ id: 'h', day: '2026-10-12', name: 'X', kind: 'compulsory', states: 'All' }] }))).toBe(2)
    expect(leaveDaysFor(ann, '2026-10-09', '2026-10-13', config(), { calendar: true })).toBe(5)
    expect(leaveDaysFor(ann, '', '', config())).toBe(0)
  })
  it('clipped to a year — a leave across 1 January', () => {
    expect(leaveDaysFor(person('ann'), '2026-12-30', '2027-01-04', config(), { year: 2026 })).toBe(2)
    expect(leaveDaysFor(person('ann'), '2026-12-30', '2027-01-04', config(), { year: 2027 })).toBe(2)
  })
  it('years of service and completed months', () => {
    expect(yearsOfService('2020-03-15', '2026-03-14')).toBe(5)
    expect(yearsOfService('2020-03-15', '2026-03-15')).toBe(6)
    expect(yearsOfService(null, '2026-03-15')).toBe(0)
    expect(completedMonths(2026, '2026-10-14', '2020-01-01')).toBe(9)
    expect(completedMonths(2026, '2026-10-14', '2026-04-10')).toBe(6)
  })
  it('accrues AL monthly by service, takes approved and waiting leave, adds the opening', () => {
    const c = config()
    const ledger: AttLedger = {
      year: 2026,
      entries: [{ id: 'o', ref: 'OB-1', staffId: 'ann', code: 'AL', kind: 'opening', days: 2, date: '2026-01-01', note: 'carried', detail: {}, by: 'HR', at: '', events: [] }],
      leave: [
        { id: 'r1', ref: 'LV-1', staffId: 'ann', code: 'AL', from: '2026-03-02', to: '2026-03-03', days: 2, status: 'approved', onBehalf: false, by: 'ann', reason: '', sentAt: '', decidedAt: '', steps: [] },
        { id: 'r2', ref: 'LV-2', staffId: 'ann', code: 'AL', from: '2026-10-22', to: '2026-10-22', days: 1, status: 'pending', onBehalf: false, by: 'ann', reason: '', sentAt: '', decidedAt: null, steps: [] },
      ],
      marks: [],
    }
    const b = balanceOf(c.people[0], c.leaveTypes[0], c, ledger, '2026-10-14')
    // 6 years' service → 16 a year; 9 months done → 12 earned.
    expect(b.entitlement).toBe(16)
    expect(b.earned).toBe(12)
    expect(b.left).toBe(12 + 2 - 2 - 1)
    expect(b.rows.find(r => r.pending)?.left).toBeNull()
    const sl = balanceOf(c.people[0], c.leaveTypes[1], c, ledger, '2026-10-14')
    expect(sl.left).toBe(14)
  })
})

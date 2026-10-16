import { describe, expect, it } from 'vitest'
import type { AttAssignment, AttLocation, AttPerson, AttPolicy, AttRequest, AttStep } from '@/lib/attendance/types'
import { dur, hm, hms, secOf, sizeLabel } from './format'
import { checkOt, otDetail, otMax, quotaOf, fairOptions, fairRange, spanDays } from './forms'
import { checkLeave, historyGroups, leaveDays, panels, tabTypes, tabWord } from './leave'
import { monthView } from './month'
import { deptTiers, lineTiers, teamRows, waitItems } from './org'
import { openMonth, slipLines, slipNote, slipSub } from './pay'
import { changedFields, formOf, pendingBanner } from './profile'
import { correctionNth, deciders, goesTo, leaveRouteLine, meStatus, requestAmount, requestTitle, requestWhen, routeFor, trailOf } from './requests'
import { metres, placeOf, punchToast, streetOf, todayCard, topLabel } from './today'
import { docRows } from './docs'
import type { MeData, MeOrg, MePayslip, MeTeam, MeToday, OrgPerson } from './types'

// ── Fixtures: Ann, Marketing, upline Daniel; office 9–6 Mon–Fri; today Wed 14 Oct 2026 ──

const ME: AttPerson = {
  id: 'ann', name: 'Wei Ling Ong', code: 'HV-0142', titleId: 't-exec', title: 'Marketing Executive', level: 3, levelName: 'Executive',
  departmentId: 'mkt', department: 'Marketing', hireDate: '2023-03-03', hasLogin: true, uplineId: 'dl', upline: 'Daniel Lee', uplineHasLogin: true, templateId: null,
}
const work = { type: 'work' as const, start: '09:00', end: '18:00', break: 60 }
const HQ: AttLocation = { id: 'hq', name: 'HQ', address: '12, Jalan Puchong, 47100 Puchong', state: 'Selangor', radius: 150, lat: 3.05, lng: 101.62 }
const POLICY: AttPolicy = { id: 'p', from: '2026-01-01', fenceMode: 'flag', photoRequired: true, earliestInMin: 120, cutover: '04:00', graceMin: 5, correctionsPerMonth: 3, otWarnH: 80, otFlagH: 104, otBase: 'basic', photoKeepDays: 90, otWageCap: 4000 }
const ASG: AttAssignment = { id: 'a', level: 'company', titleId: null, staffId: null, label: 'Everyone', mode: 'clock', scheduleId: 's1', locationId: 'hq', anywhere: false, ot: 'by_wage', from: '2026-01-01' }
const punch = (day: string, dir: 'in' | 'out', time: string) => ({ id: `${day}${dir}`, staffId: 'ann', day, dir, time, source: 'app' as const, locationId: 'hq', distance: 38, inside: true, accuracy: 8, device: '', photo: true, reason: '', invalid: false, invalidReason: '' })
const step = (over: Partial<AttStep>): AttStep => ({ id: 's', seq: 1, role: 'upline', approverId: 'dl', approver: 'Daniel Lee', state: 'waiting', decidedBy: null, onBehalf: false, note: '', arrivedAt: '2026-10-12T02:14:00Z', decidedAt: null, ...over })
const req = (over: Partial<AttRequest>): AttRequest => ({
  id: Math.random().toString(36).slice(2), ref: 'LV-2610-004', staffId: 'ann', who: 'Wei Ling Ong', kind: 'leave', leaveCode: 'AL', from: '2026-10-22', to: '2026-10-23',
  days: 2, hours: null, detail: {}, reason: 'Family trip to Ipoh', attachment: null, hasAttachment: false, route: 'upline_only', status: 'pending', onBehalf: false,
  by: 'Wei Ling Ong', sentAt: '2026-10-12T02:14:00Z', decidedAt: null, steps: [step({})], events: [], ...over,
})

function data(over: Partial<MeData> = {}): MeData {
  return {
    today: '2026-10-14', workDay: '2026-10-14', now: '08:57:12', me: ME, reports: 0,
    schedules: [{ id: 's1', name: 'Office 9–6', days: [
      { day: 'Mon', ...work }, { day: 'Tue', ...work }, { day: 'Wed', ...work }, { day: 'Thu', ...work }, { day: 'Fri', ...work },
      { day: 'Sat', type: 'off' }, { day: 'Sun', type: 'rest' }] }],
    locations: [HQ], holidays: [], assignments: [ASG],
    leaveTypes: [
      { id: 'al', code: 'AL', name: 'Annual leave', groups: [{ titles: ['all'], levels: ['all'], base: 12, steps: [] }], rules: '', route: 'upline_only', counts: 'working', accrues: true, unpaid: false, drawsFrom: null },
      { id: 'sl', code: 'SL', name: 'Sick leave', groups: [{ titles: ['all'], levels: ['all'], base: 18, steps: [] }], rules: 'MC within 48 hours · HR decides', route: 'hr_only', counts: 'working', accrues: false, unpaid: false, drawsFrom: null },
      { id: 'el', code: 'EL', name: 'Emergency leave', groups: [], rules: '', route: 'upline_only', counts: 'working', accrues: false, unpaid: false, drawsFrom: 'AL' },
      { id: 'ul', code: 'UL', name: 'Unpaid leave', groups: [], rules: '', route: 'upline_then_hr', counts: 'working', accrues: false, unpaid: true, drawsFrom: null },
    ],
    otRates: [{ dayType: 'work', multiplier: 1.5, minimum: 1.5 }, { dayType: 'off', multiplier: 1.5, minimum: 1.5 }, { dayType: 'rest', multiplier: 2, minimum: 2 }, { dayType: 'ph', multiplier: 3, minimum: 3 }],
    policies: [POLICY], routes: [],
    month: { month: '2026-10-01', punches: [], marks: [], overrides: [], leave: [], decisions: [], close: null },
    requests: [], ledger: { year: 2026, entries: [], leave: [], marks: [] }, correctionsUsed: 0, noticeRead: false, fairs: [],
    ...over,
  }
}

const today = (over: Partial<MeToday> = {}): MeToday => ({
  me: true, name: 'Wei Ling Ong', workDay: '2026-10-14', now: '08:57:12', mode: 'clock', day: { day: 'Wed', ...work }, dayType: 'work', holiday: null,
  grace: 5, onLeave: null, onLeaveName: null, punches: [], noticeRead: true, ...over,
})

describe('the clock’s words', () => {
  it('reads and writes the office’s time', () => {
    expect([hm(32232), hms(32232), secOf('08:57:12'), secOf('09:00')]).toEqual(['08:57', '08:57:12', 32232, 32400])
    expect([dur(4320), dur(720), dur(-5)]).toEqual(['1 h 12 m', '12 m', '0 m'])
    expect([sizeLabel(182 * 1024), sizeLabel(1.8 * 1024 * 1024), sizeLabel(null)]).toEqual(['182 KB', '1.8 MB', '—'])
  })
})

describe('the Today card', () => {
  it('before the start, within the grace, after it — the handoff’s words', () => {
    expect(todayCard(today(), secOf('08:57'))).toMatchObject({ chip: 'Work day', line: 'Not in yet · starts 09:00', punch: 'in' })
    expect(todayCard(today(), secOf('09:05'))).toMatchObject({ chip: 'Work day', line: 'Not in yet · starts 09:00' })
    expect(todayCard(today(), secOf('09:05:01'))).toMatchObject({ chip: 'Late', line: 'Not in · 5 min past 09:00', punch: 'in' })
  })
  it('clocked in: how long since; done: both times, no button', () => {
    const t = today({ punches: [{ dir: 'in', time: '08:57', inside: true, source: 'app' }] })
    expect(todayCard(t, secOf('10:09'))).toMatchObject({ chip: 'Clocked in', line: 'IN 08:57 · worked 1 h 12 m', punch: 'out' })
    const done = today({ punches: [{ dir: 'in', time: '08:57', inside: true, source: 'app' }, { dir: 'out', time: '18:03', inside: true, source: 'app' }] })
    expect(todayCard(done, secOf('18:10'))).toMatchObject({ chip: 'Done', line: 'IN 08:57 · OUT 18:03', punch: null })
  })
  it('past midnight, before the cutover, the work day is still yesterday’s', () => {
    expect(todayCard(today({ punches: [{ dir: 'in', time: '20:00', inside: true, source: 'app' }] }), secOf('01:30'))?.line).toBe('IN 20:00 · worked 5 h 30 m')
  })
  it('a day with nothing to punch says what it is', () => {
    expect(todayCard(today({ mode: null }), 0)).toMatchObject({ chip: 'Not clocking', punch: null })
    expect(todayCard(today({ mode: 'no_clock' }), 0)).toMatchObject({ chip: 'Fixed hours', line: '09:00–18:00 · no punch needed', punch: null })
    expect(todayCard(today({ onLeave: 'AL', onLeaveName: 'Annual leave' }), 0)).toMatchObject({ chip: 'On leave', line: 'Annual leave · today', punch: null })
    expect(todayCard(today({ holiday: 'Deepavali' }), 0)).toMatchObject({ chip: 'Holiday', punch: 'in' })
    expect(todayCard(today({ dayType: 'rest', day: { day: 'Sun', type: 'rest' } }), 0)).toMatchObject({ chip: 'Rest day', punch: 'in' })
    expect(todayCard({ ...today(), me: false }, 0)).toBeNull()
  })
  it('the top bar’s button says the state and the press', () => {
    expect(topLabel(todayCard(today(), secOf('08:57')))).toBe('Not in yet · Clock in')
    expect(topLabel(todayCard(today(), secOf('09:20')))).toBe('Late · Clock in')
    expect(topLabel(todayCard(today({ punches: [{ dir: 'in', time: '08:57', inside: true, source: 'web' }] }), secOf('10:00')))).toBe('IN 08:57 · Clock out')
    expect(topLabel(todayCard(today({ mode: null }), 0))).toBe('Me')
  })
})

describe('where the phone is', () => {
  const here = (lat: number, lng: number) => ({ state: 'here' as const, lat, lng, accuracy: 8 })
  it('inside the fence: its name, its street, the distance, the radius', () => {
    const p = placeOf(here(3.0503, 101.62), [HQ], ASG, POLICY)
    expect(p).toMatchObject({ tone: 'ok', needReason: false, refused: false, short: 'HQ' })
    expect(p.line).toMatch(/^HQ · Jalan Puchong · \d+ m · inside the 150 m fence$/)
  })
  it('outside: flagged with a reason asked — or refused where the policy refuses', () => {
    const far = here(3.07, 101.62)
    expect(metres(3.05, 101.62, 3.07, 101.62)).toBeGreaterThan(2000)
    expect(placeOf(far, [HQ], ASG, POLICY)).toMatchObject({ line: 'Outside every fence · nearest HQ, 2.2 km. You can still punch; HR sees a flag.', needReason: true, short: 'outside fence' })
    expect(placeOf(far, [HQ], ASG, { ...POLICY, fenceMode: 'refuse' })).toMatchObject({ refused: true, needReason: false })
    expect(placeOf(far, [HQ], { ...ASG, anywhere: true }, POLICY)).toMatchObject({ line: 'Anywhere · 2.2 km from HQ', needReason: false })
  })
  it('no fix yet, no location, no fence', () => {
    expect(placeOf({ state: 'finding' }, [HQ], ASG, POLICY).tone).toBe('quiet')
    expect(placeOf({ state: 'off' }, [HQ], ASG, POLICY).short).toBe('no location')
    expect(placeOf(here(3, 101), [], ASG, POLICY).line).toBe('No fence set by HR yet')
    expect(streetOf('12, Jalan PJU 7/3, Mutiara Damansara')).toBe('Jalan PJU 7/3')
  })
  it('the toast a punch leaves', () => {
    expect(punchToast('in', secOf('08:57'), 'HQ', today())).toBe('IN 08:57 · HQ · on time')
    expect(punchToast('in', secOf('09:12'), 'HQ', today())).toBe('IN 09:12 · HQ · late 12 min')
    expect(punchToast('out', secOf('17:40'), 'outside fence', today())).toBe('OUT 17:40 · outside fence · early out')
  })
})

describe('requests in the handoff’s words', () => {
  const d = data()
  it('titles, when, amount, chip', () => {
    expect([requestTitle(req({}), d.leaveTypes), requestWhen(req({})), requestAmount(req({}), d), meStatus(req({}))]).toEqual(['Annual leave', 'Thu 22 – Fri 23 Oct', '2 days', ['warning', 'Waiting']])
    expect(requestWhen(req({ from: '2026-10-14', to: '2026-10-14', days: 0.5, detail: { half: 'Morning' } }))).toBe('Wed 14 Oct · morning')
    const ot = req({ kind: 'ot', ref: 'OT-2610-011', leaveCode: null, from: '2026-10-08', to: '2026-10-08', days: null, hours: 2, status: 'approved' })
    expect([requestTitle(ot, d.leaveTypes), requestWhen(ot), requestAmount(ot, d), meStatus(ot)]).toEqual(['Overtime', 'Thu 8 Oct', '2 h', ['success', 'Approved']])
    expect(requestTitle({ ...ot, detail: { after: true } }, d.leaveTypes)).toBe('Overtime · after the fact')
    const mp = req({ kind: 'manpower', leaveCode: null, from: '2026-10-17', to: '2026-10-18', detail: { for: 'Mid Valley Home Fair', role: 'Promoter', count: 2 } })
    expect([requestTitle(mp, d.leaveTypes), requestWhen(mp), requestAmount(mp, d)]).toEqual(['Extra manpower · 2 promoters', 'Mid Valley Home Fair · Sat 17 – Sun 18 Oct', '4 person-days'])
    const pf = req({ kind: 'profile', leaveCode: null, from: null, to: null, detail: { changes: [{ key: 'contact_number', field: 'Phone', from: '012', to: '013' }, { key: 'bank_account_no', field: 'Bank account', from: '•••• 3376', to: '•••• 9041' }] } })
    expect([requestTitle(pf, d.leaveTypes), requestWhen(pf), requestAmount(pf, d)]).toEqual(['Profile change', 'Mobile · Account number', '2 fields'])
    expect(pendingBanner(pf)).toEqual({ title: '2 fields waiting for HR · LV-2610-004', body: 'Mobile: 013 · Account number: ···9041. Shown below is your current record.' })
    expect(meStatus(req({ status: 'cancelled' }))).toEqual(['neutral', 'Cancelled'])
  })
  it('a correction’s place in the month’s quota: withdrawn ones give theirs back', () => {
    const a = req({ kind: 'correction', leaveCode: null, from: '2026-10-06', to: '2026-10-06', detail: { punch: 'out', at: '18:04' }, sentAt: '2026-10-07T00:50:00Z', status: 'approved' })
    const b = req({ kind: 'correction', leaveCode: null, from: '2026-10-12', to: '2026-10-12', detail: { punch: 'out', at: '18:00' }, sentAt: '2026-10-13T00:00:00Z', status: 'cancelled' })
    const c = req({ kind: 'correction', leaveCode: null, from: '2026-10-13', to: '2026-10-13', detail: { punch: 'in', at: '09:02' }, sentAt: '2026-10-14T00:00:00Z' })
    const dd = data({ requests: [c, b, a] })
    expect([correctionNth(a, dd.requests), correctionNth(b, dd.requests), correctionNth(c, dd.requests)]).toEqual([1, null, 2])
    expect(requestAmount(c, dd)).toBe('2 of 3 this month')
    expect(requestTitle(c, dd.leaveTypes)).toBe('Correction · IN')
    expect(quotaOf(dd, '2026-10-20')).toEqual({ month: 'October', quota: 3, used: 2, left: 1 })
  })
  it('the audit trail: you sent it, then each step', () => {
    const r = req({ status: 'rejected', steps: [step({ state: 'rejected', decidedAt: '2026-07-11T01:30:00Z', note: 'IOI brand week, all hands needed' }), step({ seq: 2, role: 'hr', approver: 'HR approvers', state: 'skipped' })] })
    expect(trailOf(r, 'Wei Ling Ong').map(s => [s.role, s.who, s.state, s.at])).toEqual([
      ['You', 'Wei Ling Ong', 'sent', '12 Oct, 10:14'],
      ['Upline', 'Daniel Lee', 'rejected', '11 Jul, 09:30 · “IOI brand week, all hands needed”'],
      ['HR', 'HR approvers', 'skipped', 'Ended by the rejection'],
    ])
    const waiting = req({ route: 'upline_then_hr', steps: [step({}), step({ seq: 2, role: 'hr', approver: 'HR approvers', state: 'queued', arrivedAt: null })] })
    expect(trailOf(waiting, 'x').slice(1).map(s => s.at)).toEqual(['Arrived 12 Oct, 10:14', 'After upline'])
  })
  it('who decides: the title’s route, the company’s, the leave type’s, the default — an upline only with a login', () => {
    const routes = [{ id: 'r1', scope: 'company' as const, kinds: ['OT'], label: '', titleId: null, route: 'hr_only' as const, why: '' },
      { id: 'r2', scope: 'title' as const, kinds: ['*'], label: '', titleId: 't-exec', route: 'upline_then_hr' as const, why: '' }]
    expect(routeFor('OT', data({ routes: [routes[0]] }))).toBe('hr_only')
    expect(routeFor('OT', data({ routes }))).toBe('upline_then_hr')
    expect([routeFor('SL', d), routeFor('MP', d), routeFor('CR', d), routeFor('PF', d)]).toEqual(['hr_only', 'upline_then_hr', 'upline_only', 'hr_only'])
    expect(deciders('upline_only', { ...ME, uplineHasLogin: false })).toEqual({ upline: null, hr: true })
    expect(leaveRouteLine('upline_only', ME, false)).toBe('Daniel Lee (your upline) decides. HR sees it.')
    expect(leaveRouteLine('hr_only', ME, true)).toBe('HR decides — they check the certificate. Daniel Lee is told.')
    expect(leaveRouteLine('upline_then_hr', ME, false)).toBe('Daniel Lee, then HR.')
    expect(goesTo('upline_then_hr', ME, ' to book')).toBe('Goes to Daniel Lee (upline), then HR to book.')
  })
})

describe('Me › Attendance', () => {
  const m = {
    month: '2026-10-01',
    punches: [punch('2026-10-01', 'in', '08:52'), punch('2026-10-01', 'out', '18:03'), punch('2026-10-07', 'in', '09:07'), punch('2026-10-07', 'out', '18:02'),
      punch('2026-10-12', 'in', '08:55'), punch('2026-10-13', 'in', '08:51'), punch('2026-10-13', 'out', '19:42')],
    marks: [], overrides: [], decisions: [], close: null,
    leave: [{ id: 'lv', ref: 'LV-2610-004', staffId: 'ann', code: 'AL', from: '2026-10-22', to: '2026-10-23', status: 'pending' as const }],
  }
  const v = monthView(data({ month: m }))!
  it('washes each day whole: present, late, incomplete, leave waiting, the weekend, the future', () => {
    const cell = (day: number) => v.cells[day - 1]
    expect([cell(1).wash, cell(7).wash, cell(12).wash, cell(22).wash, cell(3).off, cell(15).muted, cell(14).today]).toEqual(['present', 'late', 'incomplete', 'leave', true, true, true])
    expect(v.lead).toBe(3)
  })
  it('the totals and the closing date', () => {
    expect(v.totals.map(t => [t.label, t.value, t.note])).toEqual([
      ['Present', '3 d', 'of 10 work days'], ['Punches', '7', '11 missing'], ['Late', '7 min', '1 day'], ['OT paid', '0 h', '1 h 42 m unclaimed']])
    // 1 Oct's 18:03 and 7 Oct's 18:02 are leaving, not overtime.
    expect(v.card('2026-10-01').facts[2].value).toBe('—')
    expect(v.closeDay).toBe('2026-11-03')
  })
  it('the day card: its words, the fix', () => {
    expect(v.card('2026-10-12')).toMatchObject({ title: 'Monday 12 October', status: 'Incomplete', fix: { dir: 'out', time: '18:00' } })
    expect(v.card('2026-10-12').facts.map(f => f.value)).toEqual(['08:55', '—', 'No OUT punch'])
    expect(v.card('2026-10-07').facts[2].value).toBe('Late 7 min')
    expect(v.card('2026-10-13').facts[2].value).toBe('1 h 42 m unclaimed')
    expect(v.card('2026-10-22')).toMatchObject({ status: 'Leave · waiting' })
    expect(v.card('2026-10-14')).toMatchObject({ status: 'Not in yet' })
  })
  it('what needs doing before HR closes the month', () => {
    const fix = v.needs.find(n => n.key === 'fix:2026-10-12')!
    expect([fix.title, fix.body]).toEqual(['12 Oct has no OUT punch', 'File a correction before HR closes October on 3 Nov.'])
    const ot = v.needs.find(n => n.key === 'ot:2026-10-13')!
    expect([ot.title, ot.body, ot.action]).toEqual(['1 h 42 m past 18:00 on 13 Oct', 'Extra time is not paid unless OT is approved.',
      { label: 'Claim OT', day: '2026-10-13', hours: 1.5, out: '19:42', past: '1 h 42 m', end: '18:00' }])
    const claimed = monthView(data({ month: m, requests: [req({ kind: 'ot', from: '2026-10-13', to: '2026-10-13', hours: 1.5 })] }))!
    expect(claimed.needs.some(n => n.key === 'ot:2026-10-13')).toBe(false)
    expect(monthView(data({ month: { ...m, close: { status: 'closed', closedAt: '2026-11-03T02:00:00Z', closedBy: 'HR', people: 1, reopenedAt: null } } }))!.needs).toEqual([])
  })
})

describe('Me › Leave', () => {
  const d = data({ requests: [req({})], ledger: { year: 2026, entries: [], leave: [{ id: 'x', ref: 'LV-2610-004', staffId: 'ann', code: 'AL', from: '2026-10-22', to: '2026-10-23', days: 2, status: 'pending', onBehalf: false, by: '', reason: '', sentAt: '', decidedAt: null, steps: [] }], marks: [] } })
  it('a tab and a card per type with a balance of its own', () => {
    expect(tabTypes(d).map(tabWord)).toEqual(['Annual', 'Sick', 'Unpaid'])
    const [al, sl, ul] = panels(d)
    expect([al.left, al.facts]).toEqual(['7', [{ label: 'Earned', value: '9' }, { label: 'Used', value: '0' }, { label: 'Pending', value: '2' }]])
    expect(al.note).toBe('Earned 1 a month, 12 for the year')
    expect([sl.left, sl.facts[0], sl.note]).toEqual(['18', { label: 'A year', value: '18' }, 'MC within 48 hours · HR decides'])
    expect([ul.left, ul.facts[0], ul.note]).toEqual(['—', { label: 'Limit', value: 'None' }, 'No balance · each day is deducted from pay · upline, then HR'])
  })
  it('the Apply sheet’s checks, in the handoff’s order and words', () => {
    const f = { code: 'AL', from: '', to: '', half: 'Full day' as const, reason: '', file: null }
    expect(checkLeave(d, f).error).toBe('Tap your first and last day on the calendar.')
    expect(checkLeave(d, { ...f, from: '2026-10-17', to: '2026-10-18' }).error).toBe('No working days in these dates.')
    expect(checkLeave(d, { ...f, from: '2026-10-15', to: '2026-10-15' }).error).toBe("Annual leave needs 3 days' notice.")
    expect(checkLeave(d, { ...f, from: '2026-10-26', to: '2026-11-06' }).error).toBe('Only 7 days left.')
    const ok = checkLeave(d, { ...f, from: '2026-10-26', to: '2026-10-27' })
    expect([ok.error, ok.days, ok.balanceLine, ok.route]).toEqual(['', 2, '7 days left before this · 5 after', 'Daniel Lee (your upline) decides. HR sees it.'])
    expect(checkLeave(d, { ...f, code: 'SL', from: '2026-10-11', to: '2026-10-11' }).error).toBe('No working days in these dates.')
    expect(checkLeave(d, { ...f, code: 'SL', from: '2026-10-09', to: '2026-10-09' }).error).toBe('Sick leave can be sent up to 2 days after.')
    expect(checkLeave(d, { ...f, code: 'SL', from: '2026-10-13', to: '2026-10-13' }).error).toBe('Add the medical certificate to send.')
    expect(checkLeave(d, { ...f, code: 'SL', from: '2026-10-13', to: '2026-10-13', file: { name: 'MC.jpg' } }).error).toBe('')
    expect(checkLeave(d, { ...f, from: '2026-10-26', to: '2026-10-26', half: 'Morning' }).days).toBe(0.5)
    expect(checkLeave(d, { ...f, code: 'UL', from: '2026-10-26', to: '2026-10-26' }).balanceLine).toBe('Unpaid · goes to payroll as unpaid days')
    expect(leaveDays(data({ holidays: [{ id: 'h', day: '2026-10-20', name: 'Deepavali', kind: 'compulsory', states: 'All' }] }), 'AL', '2026-10-19', '2026-10-23')).toBe(4)
  })
  it('history by the month sent, days counted but for the turned-down', () => {
    const dd = data({ requests: [req({}), req({ ref: 'LV-2607-006', days: 1, status: 'rejected', from: '2026-07-17', to: '2026-07-17' }), req({ ref: 'LV-2607-001', days: 1, status: 'approved' })] })
    expect(historyGroups(dd, 'All').map(g => [g.month, g.total, g.rows.length])).toEqual([['2026-10-01', 2, 1], ['2026-07-01', 1, 2]])
    expect(historyGroups(dd, 'Waiting').map(g => g.month)).toEqual(['2026-10-01'])
  })
})

describe('Submit request’s forms', () => {
  const d = data()
  it('overtime: the longest day, the day’s rate, the claim’s hours', () => {
    expect([otMax(d, '2026-10-14'), otMax(d, '2026-10-17')]).toEqual([3, 12])
    const c = checkOt(d, { date: '2026-10-14', hours: 3.5, reason: '', after: false })
    expect([c.shown, c.rate, c.paid, c.route]).toEqual(['That makes the day longer than 12 h. The most you can ask is 3 h.', 'Work day · 1.5 × your hourly rate',
      'Paid = the smaller of approved and punched past 18:00, rounded down to 30 min.', 'Goes to Daniel Lee (upline), then HR.'])
    expect(checkOt(d, { date: '2026-10-14', hours: 2, reason: '', after: false }).error).toBe('Say what needs the extra time.')
    expect(checkOt(d, { date: '2026-10-17', hours: 2, reason: 'x', after: false }).rate).toBe('Off day · every hour at 1.5 × your hourly rate')
    expect(checkOt(d, { date: '2026-10-18', hours: 2, reason: 'x', after: false }).rate).toBe("Rest day · up to 4 h: ½ day's pay · up to 8 h: 1 day · beyond: 2 × hourly")
    expect(otDetail(d, { date: '2026-10-15', hours: 3, reason: 'x', after: false })).toEqual({ after: false, from: '18:00', to: '21:00' })
  })
  it('manpower: the fairs coming, their days from today, person-days', () => {
    const opts = fairOptions([{ key: 'e1', name: 'Mid Valley Home Fair', from: '2026-10-10', to: '2026-10-18' }, { key: 'e2', name: 'Mid Valley Home Fair', from: '2026-11-20', to: '2026-11-22' }])
    expect(opts.map(o => o.label)).toEqual(['Mid Valley Home Fair · 10 Oct', 'Mid Valley Home Fair · 20 Nov', 'HQ showroom'])
    expect(fairRange(opts[0], '2026-10-14')).toEqual({ from: '2026-10-14', to: '2026-10-18' })
    expect(spanDays('2026-10-24', '2026-10-25')).toBe(2)
  })
})

describe('Me › Payslip', () => {
  const slip: MePayslip = {
    month: '2026-09-01', status: 'paid', paidOn: '2026-09-30', bank: 'Maybank', accountLast4: '3376', basic: 4200, statutoryAllowance: 200, nonStatutoryAllowance: 0,
    otHours: 2, otAmount: 60.58, commission: 0, unpaidLeaveDays: 0, deduction: 0, epf: 491, socso: 19.75, eis: 7.9, pcb: 128.4, withholding: 0, skbbk: 0,
    payLineEarnings: 0, payLineDeductions: 0, gross: 4460.58, net: 3813.53,
    attendance: { closedAt: '2026-10-03T02:00:00Z', lines: [{ ref: 'OT-2609-006', hours: 2, multiplier: 1.5, amount: 60.58, paid: true }] },
  }
  it('the slip’s lines, as the row holds them', () => {
    expect(slipLines(slip).map(l => `${l.label}|${l.value}`)).toEqual([
      'Earnings|', 'Basic salary|RM 4,200.00', 'Fixed allowance|RM 200.00', 'Overtime · 2 h × 1.5|RM 60.58', 'Gross|RM 4,460.58',
      'Deductions|', 'EPF · 11%|− RM 491.00', 'SOCSO|− RM 19.75', 'EIS|− RM 7.90', 'PCB · income tax|− RM 128.40', 'Net pay|RM 3,813.53'])
    expect(slipNote(slip)).toBe('OT from OT-2609-006 · 2 h approved. Attendance closed 3 Oct.')
    expect(slipNote({ ...slip, attendance: null })).toBe('No OT or unpaid leave this month.')
    expect(slipSub(slip)).toBe('Paid 30 Sep · Maybank ···3376')
  })
  it('the month still open', () => {
    expect(openMonth([slip], '2026-10-14')).toEqual({ name: 'October', line: 'Open · made after 3 Nov' })
    expect(openMonth([{ ...slip, month: '2026-10-01' }], '2026-10-14')).toBeNull()
  })
})

describe('Me › Hierarchy and My team', () => {
  const p = (id: string, name: string, over: Partial<OrgPerson> = {}): OrgPerson => ({
    id, name, title: 'Executive', rank: 3, level: 'Executive', departmentId: 'mkt', department: 'Marketing', reportsTo: null, inLine: false, status: 'present', phone: null, ...over,
  })
  const org: MeOrg = { me: 'ann', departmentId: 'mkt', people: [
    p('lck', 'Lim Chee Keong', { rank: 10, level: 'C - Level', title: 'Principal', departmentId: 'dir', inLine: true }),
    p('mw', 'Michelle Wong', { rank: 8, level: 'Head of Department', title: 'Head of Marketing', reportsTo: 'lck', inLine: true }),
    p('dl', 'Daniel Lee', { rank: 6, level: 'Manager', title: 'Marketing Manager', reportsTo: 'mw', inLine: true }),
    p('fa', 'Farah Aziz', { rank: 6, level: 'Manager', title: 'Brand Manager', reportsTo: 'mw' }),
    p('ann', 'Wei Ling Ong', { title: 'Marketing Executive', reportsTo: 'dl', inLine: true, status: 'out' }),
    p('ah', 'Aiman Hakim', { reportsTo: 'dl' }), p('ct', 'Chloe Tan', { reportsTo: 'fa' }),
  ] }
  it('my line: the top, each upline, you', () => {
    const v = lineTiers(org)
    expect(v.tiers.map(t => [t.label, t.cards.map(c => c.person.name), t.cards[0].tone])).toEqual([
      ['C - Level', ['Lim Chee Keong'], 'principal'], ['Head of Department', ['Michelle Wong'], 'head'], ['Upline', ['Daniel Lee'], 'upline'], ['You', ['Wei Ling Ong'], null]])
    expect([v.count, v.tiers[3].cards[0].role]).toEqual(['3 above · 0 below', 'You · Marketing Executive'])
  })
  it('the department: its head, its managers, the picked team', () => {
    const v = deptTiers(org, null)
    expect(v.tiers.map(t => t.label)).toEqual(['Head of Marketing', 'Managers · tap to see a team', 'Team · Daniel Lee'])
    expect(v.tiers[2].cards.map(c => [c.person.name, c.you])).toEqual([['Wei Ling Ong', true], ['Aiman Hakim', false]])
    expect(deptTiers(org, 'fa').tiers[2].cards.map(c => c.person.name)).toEqual(['Chloe Tan'])
    expect(v.count).toBe('6 people')
  })
  it('my team today, and what waits on me', () => {
    const team: MeTeam = {
      today: '2026-10-14',
      reports: [{ ...ME, id: 'pn', name: 'Priya Nair', uplineId: 'ann', reportsToMe: true }, { ...ME, id: 'jt', name: 'Jason Tan', uplineId: 'ann', reportsToMe: true }],
      assignments: [ASG],
      punches: [{ ...punch('2026-10-14', 'in', '09:12'), staffId: 'pn' }], marks: [], leave: [],
      waiting: [{ ...req({ staffId: 'pn', who: 'Priya Nair', kind: 'ot', leaveCode: null, from: '2026-10-15', to: '2026-10-15', hours: 3, detail: { from: '18:00', to: '21:00' }, steps: [step({}), step({ seq: 2, role: 'hr', state: 'queued' })] }), nth: null }],
      otHours: { pn: 9.5 }, ledger: { year: 2026, entries: [], leave: [], marks: [] },
    }
    const rows = teamRows(data(), team)
    expect(rows.map(r => [r.name, r.sub, r.chip])).toEqual([
      ['Priya Nair', 'IN 09:12 · HQ · 38 m · 12 min past 09:00', ['warning', 'Late']],
      ['Jason Tan', 'No punch yet · starts 09:00', ['neutral', 'Not in']]])
    expect(waitItems(data(), team).map(w => [w.title, w.when, w.amount, w.balance, w.route, w.toHR])).toEqual([
      ['Overtime · asked first', 'Thu 15 Oct · 18:00–21:00', '3 h', '9.5 h this month', 'You, then HR', true]])
  })
})

describe('Me › Profile', () => {
  it('sends only the fields that changed; a new account number only when one is typed', () => {
    const saved = formOf({ id: 'ann', name: '', code: null, title: null, department: null, hireDate: null, upline: null, phone: '012-345 6789', email: 'a@x.my', address: '1 Jalan',
      ecName: 'Ong', ecPhone: '016', ecRel: 'Father', bank: 'Maybank', accountLast4: '3376', nric: null, photo: null })
    expect(changedFields(saved, saved)).toEqual([])
    expect(changedFields({ ...saved, phone: '013-111 2222', acct: '8007 2213 9041' }, saved)).toEqual([
      { key: 'contact_number', to: '013-111 2222' }, { key: 'bank_account_no', to: '8007 2213 9041' }])
  })
})

describe('Me › Documents', () => {
  it('Personal: letters and one’s files, newest first; Company: what HR published', () => {
    const docs = {
      staffId: 'ann',
      company: [{ id: 'c1', name: 'Leave policy 2026', fileName: 'leave.pdf', ext: 'PDF', contentType: 'application/pdf', size: 240 * 1024, uploadedAt: '2026-10-01T00:00:00Z', seen: false }],
      personal: {
        folders: [],
        files: [{ id: 'f1', ref: 'F', name: 'EA form 2025.pdf', ext: 'PDF', contentType: 'application/pdf', size: 120 * 1024, at: '2026-02-27T00:00:00Z', parent: null, seen: true }],
        letters: [{ id: 'l1', ref: 'L', typeName: 'Offer letter', name: 'offer.pdf', ext: 'PDF', contentType: 'application/pdf', size: 182 * 1024, at: '2023-02-10T00:00:00Z', memoId: null, readAt: null, acknowledgedAt: null }],
      },
    }
    expect(docRows(docs, 'Personal').map(r => [r.title, r.date, r.size, r.isNew])).toEqual([['EA form 2025', '27 Feb 2026', '120 KB', false], ['Offer letter', '10 Feb 2023', '182 KB', true]])
    expect(docRows(docs, 'Company').map(r => [r.title, r.isNew])).toEqual([['Leave policy 2026', true]])
  })
})

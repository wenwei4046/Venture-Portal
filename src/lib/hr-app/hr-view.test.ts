import { describe, expect, it } from 'vitest'
import type { AttConfig, AttLedger, AttMonth, AttPerson, AttRequest, AttStep } from '@/lib/attendance/types'
import { genPage } from './gen-pages'
import {
  approveCounts, approveRows, avatarOf, balanceRows, closeView, decidedWords, homeSummary, levelRows, orgRows, peopleGroups, personView, recordsView,
  requestView, termFacts, termRows, todayCounts, todayRows, type HrAtt,
} from './hr-view'
import type { HrAppData } from './model'
import type { TermReview } from '@/lib/term-reviews'

// HR Mobile (2026-10-17, the handoff `design_handoff_hr_mobile`): Today, Approve, a person, Leave balances, Month close,
// Records, the org chart and the levels — HR › Attendance's own facts in the handoff's words.

const person = (over: Partial<AttPerson>): AttPerson => ({
  id: 'x', name: 'X', code: null, titleId: null, title: 'Marketing Executive', level: 3, levelName: 'Executive', departmentId: 'mkt', department: 'Marketing',
  hireDate: '2023-03-03', hasLogin: true, uplineId: 'dl', upline: 'Daniel Lee', uplineHasLogin: true, templateId: null, ...over,
})
const PEOPLE = [
  person({ id: 'dl', name: 'Daniel Lee', title: 'Marketing Manager', level: 7, levelName: 'Manager', uplineId: null, upline: null, hireDate: '2020-01-01' }),
  person({ id: 'wl', name: 'Wei Ling Ong' }),
  person({ id: 'pn', name: 'Priya Nair', title: 'Graphic Designer' }),
  person({ id: 'jt', name: 'Jason Tan', title: 'Marketing Assistant', level: 2, levelName: 'Assistant', hireDate: '2026-03-01' }),
  person({ id: 'ni', name: 'Nur Izzah', title: 'Content Executive' }),
]
const work = { type: 'work' as const, start: '09:00', end: '18:00', break: 60 }
const config: AttConfig = {
  today: '2026-10-14', now: '10:05', canCreate: true, canEdit: true, canApprove: true, me: 'Siti Nurhaliza',
  people: PEOPLE,
  titles: [], levels: [{ rank: 2, name: 'Assistant' }, { rank: 3, name: 'Executive' }, { rank: 7, name: 'Manager' }],
  departments: [{ id: 'mkt', name: 'Marketing' }],
  schedules: [{ id: 's1', name: 'Office 9–6', days: [{ day: 'Mon', ...work }, { day: 'Tue', ...work }, { day: 'Wed', ...work }, { day: 'Thu', ...work }, { day: 'Fri', ...work }, { day: 'Sat', type: 'off' }, { day: 'Sun', type: 'rest' }] }],
  locations: [{ id: 'hq', name: 'HQ', address: 'Jalan Puchong', state: 'Selangor', radius: 150, lat: 3.05, lng: 101.62 }],
  holidays: [],
  assignments: [{ id: 'a', level: 'company', titleId: null, staffId: null, label: 'Everyone', mode: 'clock', scheduleId: 's1', locationId: 'hq', anywhere: false, ot: 'statutory', from: '2026-01-01' }],
  leaveTypes: [
    { id: 'al', code: 'AL', name: 'Annual leave', groups: [{ titles: ['all'], levels: ['all'], base: 12, steps: [] }], rules: '', route: 'upline_only', counts: 'working', accrues: true, unpaid: false, drawsFrom: null },
    { id: 'sl', code: 'SL', name: 'Sick leave', groups: [{ titles: ['all'], levels: ['all'], base: 18, steps: [] }], rules: '', route: 'hr_only', counts: 'working', accrues: false, unpaid: false, drawsFrom: null },
  ],
  otRates: [], routes: [],
  policies: [{ id: 'p', from: '2026-01-01', fenceMode: 'flag', photoRequired: true, earliestInMin: 120, cutover: '04:00', graceMin: 5, correctionsPerMonth: 3, otWarnH: 80, otFlagH: 104, otBase: 'basic', photoKeepDays: 90, otWageCap: 4000 }],
}
const punch = (staffId: string, time: string, over: Partial<AttMonth['punches'][number]> = {}) => ({
  id: `${staffId}-${time}`, staffId, day: '2026-10-14', dir: 'in' as const, time, source: 'app' as const, locationId: 'hq', distance: 22, inside: true, accuracy: 8,
  device: '', photo: true, reason: '', invalid: false, invalidReason: '', ...over,
})
const month: AttMonth = {
  month: '2026-10-01',
  punches: [punch('dl', '08:44'), punch('wl', '08:57', { distance: 38 }), punch('pn', '09:12', { distance: 17, source: 'web' })],
  marks: [], overrides: [],
  leave: [{ id: 'l1', ref: 'LV-2610-001', staffId: 'ni', code: 'AL', from: '2026-10-13', to: '2026-10-15', status: 'approved' }],
  decisions: [], close: null,
}
const step = (over: Partial<AttStep>): AttStep => ({ id: 's', seq: 1, role: 'hr', approverId: null, approver: 'HR approvers', state: 'waiting', decidedBy: null, onBehalf: false, note: '', arrivedAt: '2026-10-12T00:20:00Z', decidedAt: null, ...over })
const req = (over: Partial<AttRequest>): AttRequest => ({
  id: 'r', ref: 'LV-2610-009', staffId: 'wl', who: 'Wei Ling Ong', kind: 'leave', leaveCode: 'SL', from: '2026-10-12', to: '2026-10-12', days: 1, hours: null, detail: {},
  reason: 'Gastritis', attachment: null, hasAttachment: false, route: 'hr_only', status: 'pending', onBehalf: false, by: 'Wei Ling Ong', sentAt: '2026-10-12T00:20:00Z',
  decidedAt: null, steps: [step({})], events: [], ...over,
})
const requests: AttRequest[] = [
  req({ id: 'r1' }),
  req({ id: 'r2', ref: 'OT-2610-014', staffId: 'pn', who: 'Priya Nair', kind: 'ot', leaveCode: null, from: '2026-10-15', to: '2026-10-15', days: null, hours: 3, route: 'upline_then_hr',
    detail: { from: '18:00', to: '21:00' }, steps: [step({ role: 'upline', approver: 'Daniel Lee', arrivedAt: '2026-10-14T00:10:00Z' }), step({ id: 's2', seq: 2, state: 'queued', arrivedAt: null })] }),
  req({ id: 'r3', ref: 'CR-2610-002', kind: 'correction', leaveCode: null, from: '2026-10-06', to: '2026-10-06', days: null, detail: { punch: 'out', at: '18:04' }, route: 'upline_only',
    status: 'approved', decidedAt: '2026-10-07T01:12:00Z', steps: [step({ role: 'upline', approver: 'Daniel Lee', state: 'approved', decidedAt: '2026-10-07T01:12:00Z' })] }),
]
const ledger: AttLedger = { year: 2026, entries: [], leave: [{ id: 'l1', ref: 'LV-2610-001', staffId: 'ni', code: 'AL', from: '2026-10-13', to: '2026-10-15', days: 3, status: 'approved', onBehalf: false, by: 'Nur Izzah', reason: '', sentAt: '', decidedAt: null, steps: [] }], marks: [] }
const att: HrAtt = { config, month, requests, ledger }

describe('Today', () => {
  it('lists who clocks today, Not in → Late → Leave → In, in the handoff’s words', () => {
    const rows = todayRows(att)
    expect(rows.map(r => [r.name, r.chip])).toEqual([
      ['Jason Tan', 'Not in'], ['Priya Nair', 'Late 12m'], ['Nur Izzah', 'Leave'], ['Daniel Lee', 'In'], ['Wei Ling Ong', 'In'],
    ])
    expect(rows.find(r => r.id === 'jt')?.sub).toBe('Marketing Assistant · no punch yet')
    expect(rows.find(r => r.id === 'pn')?.sub).toBe('IN 09:12 · HQ · 17 m · From a computer')
    expect(rows.find(r => r.id === 'ni')?.sub).toBe('Content Executive · annual leave')
    expect(todayCounts(rows)).toEqual({ present: 2, late: 1, notin: 1, leave: 1 })
  })

  it('tints a person by their name and two initials', () => {
    expect(avatarOf('Wei Ling Ong')).toEqual({ ...avatarOf('Wei Ling Ong'), ini: 'WL' })
    expect(avatarOf('Wei Ling Ong').bg).toMatch(/^rgb\(var\(--tone-(clay|slate|olive|gold|walnut)\)\)$/)
  })
})

describe('Approve', () => {
  it('splits Pending (HR) · At upline · Decided, with the kind, when and how long it waited', () => {
    const now = new Date('2026-10-14T02:05:00Z')
    expect(approveCounts(requests)).toEqual({ hr: 1, upline: 1, decided: 1 })
    expect(approveRows(att, 'hr', now)[0]).toMatchObject({ who: 'Wei Ling Ong', kind: 'Sick leave', when: 'Mon 12 Oct', st: 'At HR', since: '2 d' })
    expect(approveRows(att, 'upline', now)[0]).toMatchObject({ kind: 'Overtime · asked first', when: 'Thu 15 Oct · 18:00–21:00', st: 'At upline', since: '1 h' })
    expect(approveRows(att, 'decided', now)[0]).toMatchObject({ kind: 'Correction · OUT', st: 'Approved', since: '' })
  })

  it('a request’s page: amount (a correction’s place in the quota), route, reason, balance, and the approval flow', () => {
    const v = requestView(requests[0], config, ledger, requests)
    expect(v.facts).toEqual([['Amount', '1 day'], ['Route', 'HR only'], ['Reason', 'Gastritis'], ['Balance', '18 SL left after this']])
    expect(v.waitsAt).toBe('hr')
    expect(v.nodes.map(n => [n.text, n.label, n.state])).toEqual([['Submitted · Wei Ling Ong', 'Sent', 'done'], ['HR · HR approvers', 'Waiting', 'current']])
    expect(requestView(requests[2], config, ledger, requests).facts[0]).toEqual(['Amount', '1 of 3'])
    expect(requestView(requests[1], config, ledger, requests).waitsAt).toBe('upline')
  })

  it('says what was decided as the prototype’s toast does', () => {
    expect(decidedWords(requests[0], config.leaveTypes, true)).toBe('Wei Ling Ong · Sick leave approved')
    expect(decidedWords(requests[1], config.leaveTypes, false)).toBe('Priya Nair · Overtime · asked first rejected')
  })
})

describe('a person, the balances, the close', () => {
  it('a person’s page: today’s chip, the facts, the leave cards HR keeps', () => {
    const v = personView(att, PEOPLE[1])
    expect(v.chip.label).toBe('Today · In 08:57')
    expect(v.facts.map(f => [f.k, f.v])).toEqual([['Service', '3.6 years'], ['Upline', 'Daniel Lee'], ['Today', 'IN 08:57 · HQ · 38 m'], ['OT', 'statutory']])
    expect(v.leave.map(c => [c.code, c.left, c.of])).toEqual([['AL', '9', '9'], ['SL', '18', '18']])
  })

  it('Leave balances: annual leave left of what is earned, low at 2 days or less', () => {
    const rows = balanceRows(att)
    expect(rows.find(r => r.id === 'ni')).toMatchObject({ left: '6 / 9', low: false })
    expect(rows.find(r => r.id === 'jt')).toMatchObject({ left: '7 / 7', low: false })
  })

  it('Month close: October, due 3 Nov, the four steps with the handoff’s last one', () => {
    const v = closeView(att)
    expect(v.month).toBe('October 2026')
    expect(v.due).toBe('Due 3 Nov · before payroll on the 7th')
    expect(v.steps.map(x => [x.label, x.state])).toEqual([['Requests decided', 'current'], ['Days decided', 'next'], ['Freeze', 'next'], ['Register + payroll', 'next']])
    expect(v.steps[0].note).toBe('2 waiting')
  })

  it('Home’s line', () => {
    expect(homeSummary(4, { present: 7, late: 3, notin: 2, leave: 1 }, '2026-10-01')).toBe('4 requests waiting for HR · 2 not in yet · 3 late · October closes 3 Nov.')
    expect(homeSummary(1, null, null)).toBe('1 request waiting for HR.')
    // The probations and contracts still waiting for Acknowledge (2026-10-23 / 10-24): after the requests, only while some wait.
    expect(homeSummary(4, { present: 7, late: 3, notin: 2, leave: 1 }, '2026-10-01', { probation: 2 })).toBe('4 requests waiting for HR · 2 probations ending · 2 not in yet · 3 late · October closes 3 Nov.')
    expect(homeSummary(0, null, null, { probation: 1 })).toBe('0 requests waiting for HR · 1 probation ending.')
    expect(homeSummary(0, null, null, { probation: 1, contract: 2 })).toBe('0 requests waiting for HR · 1 probation ending · 2 contracts ending.')
    expect(homeSummary(0, null, null, { contract: 1 })).toBe('0 requests waiting for HR · 1 contract ending.')
    expect(homeSummary(0, null, null, { probation: 0, contract: 0 })).toBe('0 requests waiting for HR.')
  })
})

// A probation ending (2026-10-23 — the user: "HR 手机 app 里的提醒和推送"); a contract, and each reminded 30 and again 15
// days before (2026-10-24 — "need 30 days and 15 days before remind, 2 reminder"): Home lists them; a person's page says
// where it stands.
describe('a probation or a contract ending', () => {
  const TODAY = '2026-10-23'
  const review = (over: Partial<TermReview>): TermReview => ({
    kind: 'probation', id: 's1', name: 'LI SEAN', code: 'HV040', department: 'HR', title: 'HR EXECUTIVE', hireDate: '2026-08-01', months: 3,
    endsOn: '2026-10-31', ackEnd: null, ackName: null, ackAt: null, ...over,
  })

  it('Home: those waiting for Acknowledge, soonest first, in the bell’s words', () => {
    const rows = termRows([
      review({ id: 'a', name: 'LATER ONE', endsOn: '2026-11-05' }),
      review({ id: 'b', name: 'SOONER ONE', endsOn: '2026-10-25', department: null }),
      review({ id: 'c', name: 'TOLD ALREADY', endsOn: '2026-10-28', ackEnd: '2026-10-28', ackName: 'HR Manager', ackAt: '2026-10-22T02:00:00Z' }),
      review({ id: 'd', name: 'NOT YET', endsOn: '2026-11-23' }), // 31 days: before the first reminder
      review({ id: 'e', name: 'ENDED', endsOn: '2026-10-20' }),
      review({ id: 'f', name: 'NO END', endsOn: null }),
      // Its first reminder acknowledged 27 days before the end; 9 days left, the second waits.
      review({ id: 'g', name: 'FIRST ONLY', endsOn: '2026-11-01', ackEnd: '2026-11-01', ackName: 'HR Manager', ackAt: '2026-10-05T02:00:00Z' }),
      review({ id: 'h', name: 'A MONTH OUT', endsOn: '2026-11-08' }), // 16 days: the first reminder
    ], TODAY)
    expect(rows).toEqual([
      { id: 'e', name: 'ENDED', sub: 'Ended 20 Oct 2026 · 3 days ago · HR' },
      { id: 'b', name: 'SOONER ONE', sub: 'Ends 25 Oct 2026 · in 2 days' },
      { id: 'g', name: 'FIRST ONLY', sub: 'Ends 1 Nov 2026 · in 9 days · HR' },
      { id: 'a', name: 'LATER ONE', sub: 'Ends 5 Nov 2026 · in 13 days · HR' },
      { id: 'h', name: 'A MONTH OUT', sub: 'Ends 8 Nov 2026 · in 16 days · HR' },
    ])
  })

  it('a person’s page: the period and its end, and who acknowledged which reminder for that end', () => {
    expect(termFacts(review({}), TODAY)).toEqual([{ k: 'Probation', v: '3 months · ends 31 Oct 2026 · in 8 days', mono: false }])
    expect(termFacts(review({ ackEnd: '2026-10-31', ackName: 'HR Manager', ackAt: '2026-10-23T14:31:23Z' }), TODAY)).toEqual([
      { k: 'Probation', v: '3 months · ends 31 Oct 2026 · in 8 days', mono: false },
      { k: 'Reminder', v: 'Acknowledged by HR Manager · 23 Oct 2026', mono: false },
    ])
    // Only the first reminder acknowledged, and the second stands: said so — and the app offers Acknowledge again.
    expect(termFacts(review({ endsOn: '2026-11-05', ackEnd: '2026-11-05', ackName: 'HR Manager', ackAt: '2026-10-10T02:00:00Z' }), TODAY)[1]).toEqual(
      { k: 'Reminder', v: '30-day reminder acknowledged by HR Manager · 10 Oct 2026', mono: false })
    // Acknowledged for an end before an extension: told again, so no Reminder line.
    expect(termFacts(review({ months: 4, endsOn: '2026-11-30', ackEnd: '2026-10-31', ackName: 'HR Manager', ackAt: '2026-10-20T02:00:00Z' }), TODAY).map(f => f.k)).toEqual(['Probation'])
    expect(termFacts(review({ endsOn: null }), TODAY)[0].v).toBe('3 months · no end — the hire date is missing')
    expect(termFacts(review({ kind: 'contract', months: 12, endsOn: '2027-09-30' }), TODAY)).toEqual([{ k: 'Contract', v: '12 months · ends 30 Sep 2027 · in 342 days', mono: false }])
  })
})

describe('Records, the org chart, the levels, People', () => {
  it('Records: each person’s month so far and today’s IN', () => {
    const v = recordsView(att)
    expect(v.rows.find(r => r.id === 'pn')).toMatchObject({ sub: '1 in · 1 late · 0 leave', right: '09:12' })
    expect(v.tiles.map(t => t[1])).toEqual(['Days in, avg', 'Late this month', 'Absent'])
  })

  it('the org chart: everybody under their upline, depth by depth', () => {
    const rows = orgRows(PEOPLE)
    expect(rows[0]).toMatchObject({ person: { id: 'dl' }, depth: 0 })
    expect(rows.slice(1).every(r => r.depth === 1)).toBe(true)
    // A cycle still lists everybody once.
    const loop = orgRows([person({ id: 'a', name: 'A', uplineId: 'b' }), person({ id: 'b', name: 'B', uplineId: 'a' })])
    expect(loop.map(r => r.person.id).sort()).toEqual(['a', 'b'])
  })

  it('the levels with how many stand on each; People by department, searched by name and title', () => {
    expect(levelRows(config)).toEqual([{ rank: 2, name: 'Assistant', people: 1 }, { rank: 3, name: 'Executive', people: 3 }, { rank: 7, name: 'Manager', people: 1 }])
    const groups = peopleGroups(PEOPLE.map(p => ({ id: p.id, name: p.name, title: p.title ?? '', dept: p.department ?? '' })), 'designer')
    expect(groups).toEqual([{ name: 'Marketing', n: 1, people: [{ id: 'pn', name: 'Priya Nair', title: 'Graphic Designer', dept: 'Marketing' }] }])
  })
})

// ── The generic pages ──────────────────────────────────────────────────────

const base: HrAppData = {
  greetName: 'Siti', meId: 's', viewingAs: null, today: '2026-10-14', staff: [], owners: [], requests: [], sources: [], talents: [], docTypes: [],
  hires: [
    { id: 'HR-205', status: 'submitted', position: 'Graphic Designer', headcount: 1, dept: 'Marketing', budget: '', start: '', ownerName: null, requester: 'Daniel Lee', when: '9 Oct 2026', candidates: [{ id: 'c1', name: 'A', stage: 'shortlisted', source: 'JobStreet' }], events: [] },
    { id: 'HR-206', status: 'filled', position: 'Driver', headcount: 2, dept: 'Director Office', budget: '', start: '', ownerName: 'Siti', requester: 'Ahmad', when: '1 Oct 2026', candidates: [], events: [{ what: 'Filled', when: '11 Oct 2026', who: 'Siti' }] },
  ],
  letters: [{ id: 'L1', staffId: 'wl', typeId: 'offer', typeName: 'Offer letter', file: 'Offer.pdf', staffName: 'Wei Ling Ong', filedAt: '2026-10-08T02:00:00Z', readAt: '2026-10-08T03:00:00Z', ackAt: null }],
  documents: [{ id: 'D1', name: 'Employee Handbook', file: 'Handbook.pdf', size: 2048 * 1024, depts: ['Marketing'], at: '2026-10-01T02:00:00Z' }],
  rooms: [{ id: 'r1', name: 'Meeting Room A', seats: 8 }, { id: 'r2', name: 'Meeting Room B', seats: 4 }],
  bookings: [{ id: 'b1', roomId: 'r1', date: '2026-10-14', from: 600, to: 660, title: 'Marketing weekly', dept: 'Marketing', byName: 'Daniel Lee', mine: false, guest: false, pax: 4 }],
  bookDepts: [],
  parts: { requests: true, hiring: true, insights: true, talent: true, docs: true, rooms: true, today: true, approve: true, balances: true, close: true, records: true, people: true },
  may: { attDecide: true, decide: true, hireApprove: true, hireEdit: true, hireCreate: true, talentEdit: true, book: true },
  notices: { unread: 0, items: [] },
  att,
}

describe('the generic pages', () => {
  it('Hiring › Requests: + New hiring request, the pills, a row per request', () => {
    const g = genPage('hire', base, null, base.today)!
    expect(g.primary).toEqual({ label: '+ New hiring request', act: 'newHire' })
    expect(g.pills?.map(p => [p.label, p.n])).toEqual([['All', 2], ['Open', 1], ['Pending', 1], ['In progress', 0], ['Filled', 1], ['Closed', 0]])
    expect(g.sections[0].rows[0]).toMatchObject({ title: 'Graphic Designer', sub: 'Marketing · asked by Daniel Lee', chip: 'Pending', ct: 'warn', right: '1 cand.', open: { k: 'hire', id: 'HR-205' } })
    expect(genPage('hire', base, 'filled', base.today)!.sections[0].rows.map(r => r.title)).toEqual(['Driver × 2'])
    expect(genPage('hire', { ...base, may: { ...base.may, hireCreate: false } }, null, base.today)!.primary).toBeUndefined()
  })

  it('the room schedule: a section per room, its meetings or Free all day, Book a room', () => {
    const g = genPage('roomSched', base, null, base.today)!
    expect(g.title).toBe('Room schedule · today')
    expect(g.sections.map(s => [s.title, s.rows.map(r => r.title)])).toEqual([['Meeting Room A', ['10:00–11:00']], ['Meeting Room B', ['Free all day']]])
    expect(g.sections[1].rows[0].open).toEqual({ k: 'book', roomId: 'r2' })
    expect(g.primary?.act).toBe('book')
  })

  it('Documents: Company and Personal; Letters: where each stands with its person', () => {
    expect(genPage('docDocs', base, null, base.today)!.sections[0].rows[0]).toMatchObject({ title: 'Employee Handbook', sub: 'PDF · 2.0 MB · Marketing', open: { k: 'document', id: 'D1' } })
    expect(genPage('docDocs', base, 'me', base.today)!.sections[0].rows[0]).toMatchObject({ title: 'Offer letter', chip: 'Read', ct: 'info' })
    expect(genPage('docLetters', base, null, base.today)!.sections[0].rows[0]).toMatchObject({ sub: 'Wei Ling Ong · filed 8 Oct' })
  })

  it('HR Costing, Payroll, Payment and the Audit Log open on the desktop; the org pages need Attendance', () => {
    for (const k of ['hrc', 'pay', 'pmt', 'audit'] as const) expect(genPage(k, base, null, base.today)).toBeNull()
    expect(genPage('hierChart', { ...base, att: null }, null, base.today)).toBeNull()
    expect(genPage('hierLevels', base, null, base.today)!.sections[0].rows.map(r => r.title)).toEqual(['L2 · Assistant', 'L3 · Executive', 'L7 · Manager'])
  })
})

import { describe, expect, it } from 'vitest'
import { HIRING_BOARD as BOARD } from '@/test/hiring-board'
import { departmentNames, personName } from './view'
import { insightFacts, insightsOf, lastTwelveMonths, openRoles, periodRange, type InsightsPeriod } from './insights'
import type { HiringBoard, HiringRequest } from './types'

// Hiring › Insights against the handoff's own sample data, on its day
// (11 Oct 2026) — the figures the prototype shows (insVals).
const TODAY = '2026-10-11'
const of = (period: InsightsPeriod) => insightsOf(BOARD.requests, period, TODAY, id => personName(BOARD, id), departmentNames(BOARD))
const req = (id: string) => BOARD.requests.find(r => r.id === id)!

describe('periods', () => {
  it('this month, a month of the last twelve, all time', () => {
    expect(periodRange('this', TODAY)).toBe('1 Oct 2026 – 31 Oct 2026')
    expect(periodRange('m:2026-02', TODAY)).toBe('1 Feb 2026 – 28 Feb 2026')
    expect(periodRange('all', TODAY)).toBe('')
    const months = lastTwelveMonths(TODAY)
    expect(months.map(m => m.label).slice(0, 3)).toEqual(['Oct 2026', 'Sep 2026', 'Aug 2026'])
    expect(months.at(-1)).toEqual({ value: 'm:2025-11', label: 'Nov 2025', short: 'Nov', year: '2025' })
  })
})

describe('this month (October)', () => {
  const ins = of('this')

  // 2026-11-16, the user: Requests submitted and Avg days to acknowledge make way for Open roles; People hired stays.
  it('three roles open today against one as September closed, nobody hired — five cards, each moved on September', () => {
    expect(ins.cards.map(c => [c.label, c.value, c.delta])).toEqual([
      ['Open roles', '3', '▲ 200% vs Sep'],
      ['People hired', '0', '▼ 100% vs Sep'],
      ['Avg days to fill', '—', ''],
      ['Hiring cost', '—', ''],
      ['Cost per hire', '—', ''],
    ])
    expect(ins.cards[1].deltaTone).toBe('bad')
    // More roles open is more hiring asked for — neither good nor bad.
    expect(ins.cards[0].deltaTone).toBe('flat')
  })

  it('nothing filled, no sources; each department says what is open today', () => {
    expect(ins.bars).toEqual([])
    expect(ins.sources).toEqual([])
    // Revenue's two: October's HR-205 and September's HR-203, still being hired (2026-11-16 — open is today's
    // while the period runs, not only the period's own requests).
    expect(ins.departments.map(d => [d.name, d.mix, d.avg, d.share])).toEqual([
      ['Revenue', '2 open · 0 hired', 'No fills', 50],
      ['HR', '0 open · 0 hired', 'No fills', 0],
      ['Finance', '1 open · 0 hired', 'No fills', 50],
    ])
  })

  it('every request of the month, with its days so far', () => {
    expect(ins.rows.map(r => [r.id, r.owner, r.toFill, r.waiting])).toEqual([
      ['HR-205', 'Unassigned', '2 d so far', true],
      ['HR-204', 'Unassigned', '5 d so far', true],
    ])
  })

  // 2026-10-12, the user: a guest's Department is its own company's — the table says whose.
  it('says each request’s company: a guest’s own, HQ’s HOUZS Venture', () => {
    const hq = req('HR-205')
    const guest = { ...hq, id: 'HR-206', source: 'guest' as const, requestedBy: null, requesterCompany: 'Carres', answers: { ...hq.answers, dept: 'Sales' } }
    const rows = insightsOf([guest, ...BOARD.requests], 'this', TODAY, id => personName(BOARD, id), departmentNames(BOARD)).rows
    expect(rows.slice(0, 2).map(r => [r.id, r.company, r.department])).toEqual([
      ['HR-206', 'Carres', 'Sales'],
      ['HR-205', 'HOUZS Venture', 'Revenue · IR'],
    ])
  })
})

describe('all time', () => {
  const ins = of('all')

  it('the five cards, with no month to compare — Open roles is today’s', () => {
    expect(ins.cards.map(c => c.value)).toEqual(['3', '5', '34', 'RM 2,050', 'RM 410'])
    expect(ins.cards.every(c => c.delta === '')).toBe(true)
  })

  it('the longest fill first, its acknowledging part apart', () => {
    expect(ins.bars.map(b => [b.id, b.days])).toEqual([['HR-198', '53 d'], ['HR-199', '42 d'], ['HR-197', '28 d'], ['HR-200', '25 d'], ['HR-202', '22 d']])
    expect(ins.bars[0].ackShare + ins.bars[0].restShare).toBeCloseTo(100)
    expect(ins.bars[1].ackShare).toBeCloseTo((2 / 53) * 100)
  })

  it('hires by source, most first, with what they cost', () => {
    expect(ins.sources).toEqual([
      { name: 'Jobstreet', pax: '2 pax', share: 40, cost: 'RM 830' },
      { name: 'Social Media', pax: '1 pax', share: 20, cost: 'RM 120' },
      { name: 'LinkedIn', pax: '1 pax', share: 20, cost: 'RM 900' },
      { name: 'Referral', pax: '1 pax', share: 20, cost: 'RM 200' },
    ])
  })

  it('a filled row: who was hired, its cost per hire, its days', () => {
    expect(ins.rows.find(r => r.id === 'HR-202')).toMatchObject({
      position: 'Team Assistant', hired: 'Hired: Siti Aisyah', pax: '1', source: 'Jobstreet', cost: 'RM 450', perHire: 'RM 450',
      submitted: '2 Sep 2026', acknowledged: '3 Sep 2026', ended: '24 Sep 2026', toAck: '1 d', toFill: '22 d', waiting: false,
    })
    expect(ins.rows.find(r => r.id === 'HR-201')).toMatchObject({ ended: '15 Sep 2026', toFill: '—', status: 'cancelled' })
  })
})

describe('a month: September', () => {
  it('counts what was submitted or filled in it; Open roles, what was open as it closed', () => {
    const ins = of('m:2026-09')
    expect(ins.range).toBe('1 Sep 2026 – 30 Sep 2026')
    expect(ins.rows.map(r => r.id)).toEqual(['HR-203', 'HR-202'])
    expect(ins.cards.map(c => [c.label, c.value]).slice(0, 2)).toEqual([['Open roles', '1'], ['People hired', '1']])
  })
})

// 2026-11-16, the user: "上面的 Request Submitted 跟 Average Day to Acknowledge 这两个可以换掉，换成一个叫 Open Role（在招职位）；
// People Hired 这个可以保留".
describe('the Open roles card', () => {
  const first = (period: InsightsPeriod, today = TODAY, requests: readonly HiringRequest[] = BOARD.requests) =>
    insightsOf(requests, period, today, id => personName(BOARD, id), departmentNames(BOARD)).cards[0]

  it('what was still open as the period closed: today’s while it runs, a month gone by’s at its end', () => {
    expect(first('this')).toEqual({ label: 'Open roles', value: '3', bar: 'plain', icon: 'receipt', delta: '▲ 200% vs Sep', deltaTone: 'flat' })
    expect(first('all')).toMatchObject({ value: '3', delta: '' })
    // September closed with HR-203 open, August with HR-201 (cancelled on 15 Sep).
    expect(first('m:2026-09')).toMatchObject({ value: '1', delta: '0% vs Aug', deltaTone: 'flat' })
    // July closed with HR-198 and HR-199 open — filled on 2 and 12 Aug.
    expect(first('m:2026-08')).toMatchObject({ value: '1', delta: '▼ 50% vs Jul', deltaTone: 'flat' })
    // November, nothing new sent: the three October left open.
    expect(first('this', '2026-11-16')).toMatchObject({ value: '3', delta: '0% vs Oct' })
  })

  it('every role filled today: none open, and the fall is told quietly too', () => {
    const done = BOARD.requests.map(r =>
      ['submitted', 'acknowledged'].includes(r.status)
        ? { ...r, status: 'filled' as const, filledAt: '2026-10-11T03:00:00.000Z', closedAt: '2026-10-11T03:00:00.000Z', hiredNames: ['Daniel Lee'] }
        : r,
    )
    expect(first('this', TODAY, done)).toMatchObject({ value: '0', delta: '▼ 100% vs Sep', deltaTone: 'flat' })
  })
})

// 2026-11-16, the user, on Insights in November: "好像只能看到已经被填补的职位" — every department read "0 open"
// while eight October requests were being hired. A department's open is what was still open as the period closed.
describe('a department’s open', () => {
  const depts = (period: InsightsPeriod, today: string) =>
    insightsOf(BOARD.requests, period, today, id => personName(BOARD, id), departmentNames(BOARD)).departments.map(d => [d.name, d.mix])

  it('a month with nothing new still says what is being hired today', () => {
    const ins = insightsOf(BOARD.requests, 'this', '2026-11-16', id => personName(BOARD, id), departmentNames(BOARD))
    expect(ins.rows).toEqual([])
    expect(ins.cards[0]).toMatchObject({ label: 'Open roles', value: '3' })
    expect(depts('this', '2026-11-16')).toEqual([
      ['Revenue', '2 open · 0 hired'],
      ['HR', '0 open · 0 hired'],
      ['Finance', '1 open · 0 hired'],
    ])
  })

  it('a month gone by: what was still open as it ended — HR-201 was, until it was cancelled on 15 Sep', () => {
    expect(depts('m:2026-08', TODAY)).toEqual([
      ['Revenue', '0 open · 2 hired'],
      ['HR', '1 open · 0 hired'],
      ['Finance', '0 open · 1 hired'],
    ])
    // September closed with HR-203 open; HR-202 was filled on the 24th, HR-201 cancelled on the 15th.
    expect(depts('m:2026-09', TODAY)).toEqual([
      ['Revenue', '1 open · 1 hired'],
      ['HR', '0 open · 0 hired'],
      ['Finance', '0 open · 0 hired'],
    ])
  })

  it('a request filled today is no longer open; one sent today is', () => {
    const r203 = req('HR-203')
    const filledToday: HiringRequest = { ...r203, status: 'filled', filledAt: '2026-10-11T03:00:00.000Z', closedAt: '2026-10-11T03:00:00.000Z', hiredNames: ['Daniel Lee'] }
    const sentToday: HiringRequest = { ...req('HR-204'), id: 'HR-206', submittedAt: '2026-10-11T02:00:00.000Z' }
    const list = [sentToday, filledToday, ...BOARD.requests.filter(r => r.id !== 'HR-203')]
    const mix = insightsOf(list, 'all', TODAY, id => personName(BOARD, id), departmentNames(BOARD)).departments.map(d => [d.name, d.mix])
    expect(mix).toContainEqual(['Revenue', '1 open · 4 hired'])
    expect(mix).toContainEqual(['Finance', '2 open · 1 hired'])
  })
})

describe('open roles', () => {
  const rolesOf = (board: HiringBoard = BOARD, today = TODAY) => openRoles(board, today, id => personName(board, id))
  const withRequests = (requests: HiringRequest[]): HiringBoard => ({ ...BOARD, requests })

  it('every request open today, the longest open first — whatever the period', () => {
    expect(rolesOf().map(r => [r.id, r.position, r.where, r.owner, r.hired, r.openFor, r.status])).toEqual([
      ['HR-203', 'Revenue Specialist × 2', 'HR-203 · Revenue · Fair', 'Grace Lim', '0 / 2', '13 d', 'acknowledged'],
      ['HR-204', 'Account Executive', 'HR-204 · Finance', 'Unassigned', '0 / 1', '5 d', 'submitted'],
      ['HR-205', 'Senior Revenue Specialist', 'HR-205 · Revenue · IR', 'Unassigned', '0 / 1', '2 d', 'submitted'],
    ])
    expect(rolesOf(BOARD, '2026-11-16').map(r => [r.id, r.openFor])).toEqual([['HR-203', '49 d'], ['HR-204', '41 d'], ['HR-205', '38 d']])
  })

  it('where its candidates stand, each with their details, and its newest step', () => {
    const r = rolesOf()[0]
    expect(r.stages).toEqual([{ stage: 'shortlisted', n: 1 }, { stage: 'appointment', n: 1 }])
    expect(r.candidates).toEqual([
      {
        id: 'C-1', name: 'Daniel Lee', stage: 'appointment', meta: 'Applied · 016-221 0457', why: '',
        info: [{ label: 'Expected salary', value: 'RM 3,000' }, { label: 'Available from', value: '1 Nov 2026' }, { label: 'Own transport', value: 'Yes' }],
      },
      { id: 'C-2', name: 'Nur Iman', stage: 'shortlisted', meta: 'Talent Bank · 012-778 4410', why: '', info: [] },
    ])
    expect(r.facts.map(f => [f.label, f.value])).toEqual([
      ['Requested by', 'Chea Huan'], ['Budget / month', 'RM 2,800 – 3,200'], ['Expected start', 'Within 1 month'],
      ['Submitted', '28 Sep 2026'], ['Acknowledged', '29 Sep 2026'],
    ])
    expect(r.latest).toEqual({ what: 'Interview booked', when: '10 Oct 2026', who: 'Grace Lim', note: 'Daniel Lee · Meeting Room 2' })
    const none = rolesOf()[1]
    expect([none.stages, none.candidates, none.latest?.what]).toEqual([[], [], 'Submitted'])
  })

  it('the hired count against the headcount, the not selected last with why the Talent Bank keeps them', () => {
    const r203 = req('HR-203')
    const moved: HiringRequest = {
      ...r203,
      candidates: [
        { ...r203.candidates[1], stage: 'rejected' },
        { ...r203.candidates[0], stage: 'hired' },
        { ...r203.candidates[0], id: 'C-9', name: 'Wong Mei', phone: '', source: 'Walk-in', answers: {}, stage: 'offered' },
      ],
    }
    const r = rolesOf(withRequests([moved]))[0]
    expect([r.hired, r.hiredAll]).toEqual(['1 / 2', false])
    const both: HiringRequest = { ...moved, candidates: moved.candidates.map(c => (c.id === 'C-9' ? { ...c, stage: 'hired' as const } : c)) }
    expect(rolesOf(withRequests([both]))[0]).toMatchObject({ hired: '2 / 2', hiredAll: true })
    expect(r.stages).toEqual([{ stage: 'offered', n: 1 }, { stage: 'hired', n: 1 }, { stage: 'rejected', n: 1 }])
    // Only Hired is still candidates, never "No candidates yet".
    const hiredOnly: HiringRequest = { ...r203, candidates: [{ ...r203.candidates[0], stage: 'hired' }] }
    expect(rolesOf(withRequests([hiredOnly]))[0].stages).toEqual([{ stage: 'hired', n: 1 }])
    expect(r.candidates.map(c => [c.name, c.stage, c.why])).toEqual([
      ['Daniel Lee', 'hired', ''],
      ['Wong Mei', 'offered', ''],
      ['Nur Iman', 'rejected', 'Not right now'],
    ])
  })

  it('More info needed is open; filled, cancelled and declined are not; a guest’s company is named', () => {
    const r204 = req('HR-204')
    const info: HiringRequest = { ...r204, status: 'needs_info' }
    const declined: HiringRequest = { ...req('HR-205'), status: 'declined', closedAt: '2026-10-10T02:00:00.000Z' }
    const guest: HiringRequest = { ...r204, id: 'HR-206', source: 'guest', requestedBy: null, requesterName: 'Mr Tan', requesterCompany: 'Carres', answers: { ...r204.answers, dept: 'Sales' } }
    const roles = rolesOf(withRequests([guest, declined, info, ...BOARD.requests.filter(r => !['HR-204', 'HR-205'].includes(r.id))]))
    expect(roles.map(r => [r.id, r.status])).toEqual([['HR-203', 'acknowledged'], ['HR-204', 'needs_info'], ['HR-206', 'submitted']])
    const g = roles[2]
    expect(g.where).toBe('HR-206 · Carres · Sales')
    expect(g.facts[0]).toEqual({ label: 'Requested by', value: 'Mr Tan · Carres' })
  })

  it('none open: an empty list', () => {
    expect(rolesOf(withRequests(BOARD.requests.filter(r => !['submitted', 'needs_info', 'acknowledged'].includes(r.status))))).toEqual([])
  })
})

describe('the side panel', () => {
  it('a filled request: cost, pax, source, the days it took', () => {
    expect(insightFacts(req('HR-202'), TODAY).map(f => [f.label, f.value])).toEqual([
      ['Budget / month', 'RM 2,800 – 3,200'], ['Hiring cost', 'RM 450'], ['Pax hired', '1'], ['Hired through', 'Jobstreet'],
      ['Candidates', '2'], ['Done appointment', '1'], ['Not selected', '1'], ['Submitted', '2 Sep 2026'], ['Acknowledged', '3 Sep 2026'],
      ['Filled / closed', '24 Sep 2026'], ['Days to fill', '22 days'],
    ])
  })

  it('an open one: when it should start, its days so far', () => {
    const facts = insightFacts(req('HR-203'), TODAY)
    expect(facts[1]).toEqual({ label: 'Expected start', value: 'Within 1 month', strong: true })
    expect(facts.at(-1)).toEqual({ label: 'Days to fill', value: '13 days so far', strong: false })
  })
})

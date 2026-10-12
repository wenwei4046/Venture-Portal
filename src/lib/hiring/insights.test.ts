import { describe, expect, it } from 'vitest'
import { HIRING_BOARD as BOARD } from '@/test/hiring-board'
import { departmentNames, personName } from './view'
import { insightFacts, insightsOf, lastTwelveMonths, periodRange, type InsightsPeriod } from './insights'

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

  it('two requests came in, nobody was hired — and says how that moved on September', () => {
    expect(ins.cards.map(c => [c.label, c.value, c.delta])).toEqual([
      ['Requests submitted', '2', '0% vs Sep'],
      ['People hired', '0', '▼ 100% vs Sep'],
      ['Avg days to acknowledge', '—', ''],
      ['Avg days to fill', '—', ''],
      ['Hiring cost', '—', ''],
      ['Cost per hire', '—', ''],
    ])
    expect(ins.cards[1].deltaTone).toBe('bad')
    expect(ins.cards[0].deltaTone).toBe('flat')
  })

  it('nothing filled, no sources; each department says what is open', () => {
    expect(ins.bars).toEqual([])
    expect(ins.sources).toEqual([])
    expect(ins.departments.map(d => [d.name, d.mix, d.avg, d.share])).toEqual([
      ['Revenue', '1 open · 0 hired', 'No fills', 50],
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

  it('the six cards, with no month to compare', () => {
    expect(ins.cards.map(c => c.value)).toEqual(['9', '5', '1', '34', 'RM 2,050', 'RM 410'])
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
  it('counts what was submitted or filled in it', () => {
    const ins = of('m:2026-09')
    expect(ins.range).toBe('1 Sep 2026 – 30 Sep 2026')
    expect(ins.rows.map(r => r.id)).toEqual(['HR-203', 'HR-202'])
    expect(ins.cards.map(c => c.value).slice(0, 2)).toEqual(['2', '1'])
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

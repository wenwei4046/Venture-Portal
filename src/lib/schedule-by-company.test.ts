import { describe, expect, it } from 'vitest'
import { actualsOf, byCompany, dueOfEntries, figuresOf, historyOf, monthsTo, openOf, type DealFacts } from './schedule-by-company'
import type { CalendarEntry } from './repayment-calendar'
import type { ListRow } from './schedule-list'

// 2026-11-13 — the Repayment Schedule by company (the mockup approved: "照这个做").

const fact = (id: string, side: 'collect' | 'pay', company: string, over: Partial<DealFacts> = {}): DealFacts => ({
  id, side, company, tag: null, words: 'RM 1.00', href: `/x/${id}`, next: null, last: null, owe: 0, months: {}, ...over,
})
const row = (id: string, date: string, over: Partial<ListRow> = {}): ListRow => ({
  key: `${id}:${date}`, id, date, counterparty: 'X', detail: '', source: null, no: 1, months: 6, principal: 1000, interest: 100,
  due: 1100, received: 0, owed: 1100, status: 'due', paidOn: null, pending: false, ...over,
})
const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  kind: 'collect', name: 'X', href: '', rate: 0.01, principal: 1000, date: '2026-11-05', amount: 1100, outstanding: 1100, status: 'due',
  no: 1, months: 6, instPrincipal: 1000, instInterest: 100, paid: 0, paidOn: null, rolled: 0, ...over,
})

describe('monthsTo', () => {
  it('counts back across the year', () => {
    expect(monthsTo('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('actualsOf', () => {
  it('counts cash by month — a contra is none — and the interest among it', () => {
    const a = actualsOf([
      { date: '2026-10-05', type: 'principal', amount: 1000 },
      { date: '2026-10-05', type: 'interest', amount: 120 },
      { date: '2026-11-02', type: 'netting', amount: 5000 },
      { date: '2026-11-03', type: 'penalty', amount: 30 },
    ])
    expect(a.byMonth['2026-10']).toEqual({ got: 1120, gotInterest: 120 })
    expect(a.byMonth['2026-11']).toEqual({ got: 30, gotInterest: 30 })
    expect(a.last).toBe('2026-11-03')
  })
})

describe('dueOfEntries', () => {
  it('asks no cash of a month that rolls into the balance, but its interest is earned', () => {
    expect(dueOfEntries([entry({}), entry({ amount: 400, instInterest: 400, rolled: 400 })], false)).toEqual({ due: 1100, dueInterest: 500 })
    // A compounding deal's month still owed rolls in.
    expect(dueOfEntries([entry({ amount: 300, instInterest: 300 })], true)).toEqual({ due: 0, dueInterest: 300 })
  })
})

describe('byCompany', () => {
  const facts = [
    fact('l1', 'collect', 'CONTS', { tag: 'LO#5', owe: 90000, months: { '2026-11': { due: 0, dueInterest: 0, got: 1500, gotInterest: 500 } } }),
    fact('f1', 'pay', 'CONTS', { tag: 'BI#9', owe: 60000, months: { '2026-11': { due: 0, dueInterest: 0, got: 0, gotInterest: 0 } } }),
    fact('l2', 'collect', 'HK', { months: { '2026-11': { due: 0, dueInterest: 0, got: 0, gotInterest: 0 } } }),
    fact('l3', 'collect', 'QUIET', { owe: 5000 }),
  ]
  const collectList = [
    row('l1', '2026-11-05', { received: 1500, owed: 0, status: 'paid' }),
    // October's, 600 still owed: of its 700 interest, 500 came in (interest first), so 200 unpaid.
    row('l2', '2026-10-09', { received: 500, owed: 600, status: 'partial', interest: 700 }),
    row('l2', '2026-11-09'),
  ]
  const payList = [row('f1', '2026-11-20', { principal: 0, interest: 800, due: 800, owed: 800 })]
  const cos = byCompany({ facts, collectList, payList, month: '2026-11' })

  it('puts both sides of a company on one row, its deals Collect first', () => {
    expect(cos.map((c) => c.name)).toEqual(['CONTS', 'HK'])
    const conts = cos[0]
    expect(conts.both).toBe(true)
    expect(conts.deals.map((d) => `${d.side}:${d.tag}`)).toEqual(['collect:LO#5', 'pay:BI#9'])
    // What they owe us − what we owe them.
    expect(conts.position).toBe(30000)
  })

  it('leaves out a deal with nothing in the month', () => {
    expect(cos.find((c) => c.name === 'QUIET')).toBeUndefined()
  })

  it('reads by right: this month’s instalments + what is still owed from before, its unpaid interest first', () => {
    const hk = cos[1].deals[0]
    expect(hk.earlier).toBe(600)
    expect(hk.due).toBe(1700)
    // This month's 100 + the earlier one's unpaid interest: 700 − 500 received = 200 (within the 600 owed).
    expect(hk.dueInterest).toBe(300)
    expect(hk.open).toBe(1700)
  })

  it('reads actual off the repayments, and both bases sum to the page', () => {
    const all = cos.flatMap((c) => c.deals)
    const act = figuresOf(all, 'act')
    expect(act).toMatchObject({ collect: 1500, pay: 0, net: 1500, interestIn: 500, interestOut: 0, profit: 500 })
    const due = figuresOf(all, 'due')
    expect(due).toMatchObject({ collect: 2800, pay: 800, net: 2000, interestIn: 400, interestOut: 800, profit: -400, earlier: 600 })
    const open = openOf(all)
    expect(open.collect).toBe(1700)
    expect(open.pay).toBe(800)
    expect(open.settledShare).toBeCloseTo((3600 - 2500) / 3600)
  })
})

describe('historyOf', () => {
  it('sums each month’s two sides, by right and actual', () => {
    const h = historyOf(
      [
        fact('a', 'collect', 'A', { months: { '2026-10': { due: 1100, dueInterest: 100, got: 1000, gotInterest: 50 } } }),
        fact('b', 'pay', 'B', { months: { '2026-10': { due: 800, dueInterest: 800, got: 800, gotInterest: 800 } } }),
      ],
      ['2026-09', '2026-10'],
    )
    expect(h[0].due).toEqual({ interestIn: 0, interestOut: 0, cashIn: 0, cashOut: 0 })
    expect(h[1].due).toEqual({ interestIn: 100, interestOut: 800, cashIn: 1100, cashOut: 800 })
    expect(h[1].act).toEqual({ interestIn: 50, interestOut: 800, cashIn: 1000, cashOut: 800 })
  })
})

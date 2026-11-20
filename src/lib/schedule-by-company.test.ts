import { describe, expect, it } from 'vitest'
import { actualsOf, byCompany, dueOfEntries, figuresOf, historyOf, monthsTo, type DealFacts } from './schedule-by-company'
import type { CalendarEntry } from './repayment-calendar'
import type { ListRow } from './schedule-list'

// 2026-11-13 — the Repayment Schedule by company (the mockup approved: "照这个做").

const fact = (id: string, side: 'collect' | 'pay', company: string, over: Partial<DealFacts> = {}): DealFacts => ({
  id, side, company, companyKey: `co:${company}`, tag: null, words: 'RM 1.00', href: `/x/${id}`, next: null, last: null, owe: 0, months: {}, ...over,
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
  it('counts cash by month — a contra is none — the interest among it, and what was settled (a contra, no penalty)', () => {
    const a = actualsOf([
      { date: '2026-10-05', type: 'principal', amount: 1000 },
      { date: '2026-10-05', type: 'interest', amount: 120 },
      { date: '2026-11-02', type: 'netting', amount: 5000 },
      { date: '2026-11-03', type: 'penalty', amount: 30 },
    ])
    expect(a.byMonth['2026-10']).toEqual({ got: 1120, gotInterest: 120, settled: 1120 })
    expect(a.byMonth['2026-11']).toEqual({ got: 30, gotInterest: 30, settled: 5000 })
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
    fact('l1', 'collect', 'CONTS', { tag: 'LO#5', owe: 90000, months: { '2026-11': { due: 0, dueInterest: 0, got: 1500, gotInterest: 500, settled: 1500 } } }),
    fact('f1', 'pay', 'CONTS', { tag: 'BI#9', owe: 60000, months: { '2026-11': { due: 0, dueInterest: 0, got: 0, gotInterest: 0, settled: 0 } } }),
    // HK: October's 1,100 all owed as November began; 500 of it came in on 3 Nov.
    fact('l2', 'collect', 'HK', { bf: 1100, months: { '2026-11': { due: 0, dueInterest: 0, got: 500, gotInterest: 500, settled: 500 } } }),
    fact('l3', 'collect', 'QUIET', { owe: 5000 }),
  ]
  const collectList = [
    row('l1', '2026-11-05', { due: 1500, received: 1500, owed: 0, status: 'paid' }),
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

  it('reads this month’s own, overdue as the month began, settled and still to settle', () => {
    const hk = cos[1].deals[0]
    expect(hk).toMatchObject({ now: 1100, bf: 1100, earlier: 600, settled: 500, open: 1700 })
  })

  // 2026-11-20 — the user: "This month + Overdue = Settled so far + Still to settle".
  it('adds up each side: this month + overdue = settled + still to settle', () => {
    const f = figuresOf(cos.flatMap((c) => c.deals))
    expect(f).toMatchObject({ nowCollect: 2600, bfCollect: 1100, settledCollect: 2000, openCollect: 1700 })
    expect(f.nowCollect + f.bfCollect).toBeCloseTo(f.settledCollect + f.openCollect)
    expect(f).toMatchObject({ nowPay: 800, bfPay: 0, settledPay: 0, openPay: 800 })
    expect(f.nowPay + f.bfPay).toBeCloseTo(f.settledPay + f.openPay)
    // The cash: 2,000 in, nothing out; its interest 1,000.
    expect(f).toMatchObject({ net: 2000, interestIn: 1000, interestOut: 0, profit: 1000, earlier: 600 })
  })
})

describe('byCompany — who a deal is with, by id (2026-11-15, the user: "按 id")', () => {
  const m = { '2026-11': { due: 0, dueInterest: 0, got: 100, gotInterest: 10, settled: 100 } }
  const cos = byCompany({
    facts: [
      fact('l1', 'collect', 'ABC', { companyKey: 'co:abc', owe: 5000, months: m }),
      // The same company named on a fund source: one row, both sides.
      fact('f1', 'pay', 'ABC', { companyKey: 'co:abc', owe: 2000, months: m }),
      // A lender only typed as "ABC": its own row, not ABC's.
      fact('f2', 'pay', 'ABC', { companyKey: 'fs:f2', owe: 700, months: m }),
      // Two fund sources naming no one, and two loans with no company: each stands alone.
      fact('f3', 'pay', 'Fund source', { companyKey: 'fs:f3', months: m }),
      fact('f4', 'pay', 'Fund source', { companyKey: 'fs:f4', months: m }),
      fact('l2', 'collect', '—', { companyKey: 'loan:l2', months: m }),
      fact('l3', 'collect', '—', { companyKey: 'loan:l3', months: m }),
    ],
    collectList: [],
    payList: [],
    month: '2026-11',
  })

  it('puts deals together only when they are with the same one by id', () => {
    // By name (a dash sorts before letters), then by key.
    expect(cos.map((c) => c.key)).toEqual(['loan:l2', 'loan:l3', 'co:abc', 'fs:f2', 'fs:f3', 'fs:f4'])
    const abc = cos.find((c) => c.key === 'co:abc')!
    expect(abc.both).toBe(true)
    expect(abc.position).toBe(3000)
    const typed = cos.find((c) => c.key === 'fs:f2')!
    expect(typed.name).toBe('ABC')
    expect(typed.both).toBe(false)
    expect(typed.position).toBe(-700)
  })
})

describe('historyOf', () => {
  it('sums each month’s two sides, by right and actual', () => {
    const h = historyOf(
      [
        fact('a', 'collect', 'A', { months: { '2026-10': { due: 1100, dueInterest: 100, got: 1000, gotInterest: 50, settled: 1000 } } }),
        fact('b', 'pay', 'B', { months: { '2026-10': { due: 800, dueInterest: 800, got: 800, gotInterest: 800, settled: 800 } } }),
      ],
      ['2026-09', '2026-10'],
    )
    expect(h[0].due).toEqual({ interestIn: 0, interestOut: 0, cashIn: 0, cashOut: 0 })
    expect(h[1].due).toEqual({ interestIn: 100, interestOut: 800, cashIn: 1100, cashOut: 800 })
    expect(h[1].act).toEqual({ interestIn: 50, interestOut: 800, cashIn: 1000, cashOut: 800 })
  })
})

// 2026-11-20 — checked on the live month: each side must add up, This month + Principal repaid early + Overdue =
// Settled + Still to settle.
describe('byCompany — a month that adds up', () => {
  const nov = (got: number, settled = got) => ({ '2026-11': { due: 0, dueInterest: 0, got, gotInterest: 0, settled } })
  const cos = byCompany({
    facts: [
      // A compounding instalment: of its 36,115.62 only 6,000 is asked in cash (the interest rolls in); 30,000 of
      // principal came in, which no instalment asked.
      fact('car', 'collect', 'CAR', { bf: 30000, months: nov(30000) }),
      // November's 3,008 was 2,784 paid in October: 224 is what November asked as it began.
      fact('hc', 'pay', 'HC', { ahead: 2784, months: nov(0) }),
      // A deal with no fixed term repaid in full: 600 of October's interest and its 30,000.
      fact('fs', 'pay', 'CAR', { bf: 600, months: nov(30600) }),
    ],
    collectList: [
      ...[6, 7, 8, 9, 10].map((m) => row('car', `2026-${String(m).padStart(2, '0')}-15`, { due: 31930, received: 0, owed: 6000, status: 'partial' })),
      row('car', '2026-11-15', { due: 36115.62, received: 0, owed: 6000, status: 'partial' }),
    ],
    payList: [row('hc', '2026-11-05', { due: 3008, received: 2784, owed: 224, status: 'partial' })],
    month: '2026-11',
  })
  const deal = (id: string) => cos.flatMap((c) => c.deals).find((d) => d.id === id)!

  it('asks a compounding instalment’s cash only, and counts principal beyond it as repaid early', () => {
    expect(deal('car')).toMatchObject({ now: 6000, bf: 30000, settled: 30000, open: 36000, early: 30000 })
  })

  it('leaves out of this month what came in on it before the month', () => {
    expect(deal('hc')).toMatchObject({ now: 224, bf: 0, settled: 0, open: 224, early: 0 })
  })

  it('puts a no-fixed-term deal’s principal under repaid early', () => {
    expect(deal('fs')).toMatchObject({ now: 0, bf: 600, settled: 30600, open: 0, early: 30000 })
    const car = figuresOf(cos.find((c) => c.name === 'CAR')!.deals)
    for (const [now, early, bf, settled, open] of [
      [car.nowCollect, car.earlyCollect, car.bfCollect, car.settledCollect, car.openCollect],
      [car.nowPay, car.earlyPay, car.bfPay, car.settledPay, car.openPay],
    ])
      expect(now + early + bf).toBeCloseTo(settled + open, 2)
  })
})

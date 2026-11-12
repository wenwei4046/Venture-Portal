import { describe, expect, it } from 'vitest'
import { accrualsOf, inSuspense, interestPaymentsOf, monthEndOf, monthLinesFor, monthRunFor, planIisMonth, type IisDeal } from './iis'
import type { TermsSegment } from './treasury-terms'

const seg = (over: Partial<TermsSegment>): TermsSegment =>
  ({ fromYM: '2025-05', rate: 0.005, months: 60, compounding: false, base: 60000, interestPerMonth: 300, principalPerMonth: 1000, ...over }) as TermsSegment

// BI#7 as corrected 2026-11-13: 0.5% × 60 on 60,000 from Apr 2025, then 10% a year × 51 on 51,000 from Jan 2026.
const BI7: IisDeal = {
  kind: 'fund_source',
  id: 'bi7',
  start: '2025-04-05',
  principal: 60000,
  words: '[BI#7]',
  segments: [seg({ fromYM: '2025-04' }), seg({ fromYM: '2026-01', rate: 0.0083333333, months: 51, base: 51000, interestPerMonth: 425 })],
  plan: { rows: [], interestPaid: 5700 },
  payments: Array.from({ length: 19 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 3 + i, 5)).toISOString().slice(0, 10)
    return [{ date: d, type: 'principal', amount: 1000 }, { date: d, type: 'interest', amount: 300 }]
  }).flat(),
}

describe('interest into suspense', () => {
  it('a fixed segment puts all its interest in at its start; a change takes the old months not yet due out', () => {
    const a = accrualsOf(BI7, '2026-11-13')
    expect(a.map((x) => [x.date, x.amount])).toEqual([['2025-04-05', 18000], ['2026-01-01', -15300], ['2026-01-01', 21675]])
  })

  it('a compounding / open segment puts each month in as it falls due, up to today', () => {
    const d: IisDeal = {
      ...BI7,
      kind: 'loan',
      words: '[LO#30]',
      segments: [seg({ fromYM: '2026-04', rate: 0.04, months: null, compounding: true, base: 52500, interestPerMonth: 2100 })],
      plan: {
        rows: [
          { ym: '2026-04', due: '2026-04-26', interest: 2100 },
          { ym: '2026-05', due: '2026-05-26', interest: 2184 },
          { ym: '2026-12', due: '2026-12-26', interest: 9999 },
        ] as never,
        interestPaid: 6555.36,
      },
      payments: [{ date: '2026-06-29', type: 'principal', amount: 10000 }, { date: '2026-06-29', type: 'interest', amount: 150 }],
    }
    expect(accrualsOf(d, '2026-11-13').map((x) => x.amount)).toEqual([2100, 2184])
    // The schedule sets 6,405.36 of the 10,000 against the oldest interest (the user, 2026-11-13).
    expect(interestPaymentsOf(d)).toEqual([{ date: '2026-06-29', amount: 6405.36 }, { date: '2026-06-29', amount: 150 }])
  })

  it('0% and the back-to-back pair are not in suspense', () => {
    expect(inSuspense({ ...BI7, segments: [seg({ rate: 0 })] })).toBe(false)
    expect(inSuspense({ ...BI7, words: '[BI#19]' })).toBe(false)
    expect(accrualsOf({ ...BI7, words: '[BI#19]' }, '2026-11-13')).toEqual([])
  })
})

describe('the month-end run', () => {
  it('posts only what is new: the accrual still to go in by the month end, the month’s interest not yet taken out', () => {
    // The catch-up posted everything to the end of October.
    const posted = { accrued: 24375, recognized: { '2026-10': 300 } }
    expect(monthRunFor(BI7, '2026-10', posted, '2026-11-13')).toEqual({ accrual: 0, recognition: 0 })
    expect(monthRunFor(BI7, '2026-11', posted, '2026-11-13')).toEqual({ accrual: 0, recognition: 0 })
    // Nothing posted yet: all of it.
    expect(monthRunFor(BI7, '2026-10', { accrued: 0, recognized: {} }, '2026-11-13')).toEqual({ accrual: 24375, recognition: 300 })
    expect(monthEndOf('2026-02')).toBe('2026-02-28')
  })

  it('writes a loan’s and a fund source’s lines the right way round', () => {
    expect(monthLinesFor('loan', { deal: '3100', iis: '3500' }, 100, 40, 'LO#7').map((l) => [l.account_code, l.debit, l.credit])).toEqual([
      ['3100', 100, 0], ['3500', 0, 100], ['3500', 40, 0], ['5027', 0, 40],
    ])
    expect(monthLinesFor('fund_source', { deal: '4300', iis: '4700' }, 100, 40, 'BI#7').map((l) => [l.account_code, l.debit, l.credit])).toEqual([
      ['4700', 100, 0], ['4300', 0, 100], ['6000', 40, 0], ['4700', 0, 40],
    ])
    expect(monthLinesFor('loan', { deal: '3100', iis: '3500' }, -50, 0, 'LO#7').map((l) => [l.account_code, l.debit, l.credit])).toEqual([['3100', 0, 50], ['3500', 50, 0]])
  })
})

describe('planIisMonth', () => {
  const book = [{ deal: BI7, label: 'Liang [BI#7]', accounts: { deal: '4300', iis: '4700' }, posted: { accrued: 24375, recognized: { '2026-10': 300 }, lastAccrual: '2026-11' } }]
  it('a month already counted puts nothing more into suspense, but still takes its interest out', () => {
    const rows = planIisMonth([{ ...book[0], posted: { accrued: 24375, recognized: {}, lastAccrual: '2026-11' } }], '2026-10', '2026-11-13')
    expect(rows.map((r) => [r.accrual, r.recognition])).toEqual([[0, 300]])
  })
  it('nothing new: no entry', () => {
    expect(planIisMonth(book, '2026-10', '2026-11-13')).toEqual([])
  })
})

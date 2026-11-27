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

// 2026-11-27 — CONTS's 10,000 of 8 Jul 2026: principal repaid 13 Nov, its 4 × 400.01 in suspense, the interest owed
// ("要收"); waived, it comes back out ("iis 你帮我修改").
describe('a repaid deal’s interest left in suspense', () => {
  const rows = ['2026-08', '2026-09', '2026-10', '2026-11'].map((ym, i) => ({
    no: i + 1, ym, due: `${ym}-08`, installment: 400.01, principal: i === 3 ? 10000 : null, interest: 400.01, balance: i === 3 ? 0 : 10000, outstanding: 400.01, remark: '', tone: '' as const,
  }))
  const conts: IisDeal = {
    kind: 'loan',
    id: 'conts-10k',
    start: '2026-07-08',
    principal: 10000,
    words: '利滚利挂账(未定还款)',
    segments: [seg({ fromYM: '2026-08', rate: 0.040001, months: null, base: 10000, interestPerMonth: 400.01, principalPerMonth: 0 })],
    plan: { rows, interestPaid: 0 },
    payments: [{ date: '2026-11-13', type: 'principal', amount: 10000 }],
  }
  const posted = { accrued: 1600.04, recognized: {} }

  it('still owed: stays in suspense, nothing new', () => {
    expect(monthRunFor(conts, '2026-11', posted, '2026-11-27')).toEqual({ accrual: 0, recognition: 0 })
  })

  it('received: comes out to interest income', () => {
    const paid = { ...conts, plan: { rows, interestPaid: 1600.04 }, payments: [...conts.payments, { date: '2026-12-02', type: 'interest', amount: 1600.04 }] }
    expect(monthRunFor(paid, '2026-12', posted, '2026-12-05')).toEqual({ accrual: 0, recognition: 1600.04 })
  })

  it('waived: what was put in comes back out — Dr IIS / Cr the deal', () => {
    const run = monthRunFor({ ...conts, waived: true }, '2026-11', posted, '2026-11-27')
    expect(run).toEqual({ accrual: -1600.04, recognition: 0 })
    expect(monthLinesFor('loan', { deal: '3113', iis: '3513' }, run.accrual, 0, 'CONTS').map((l) => [l.account_code, l.debit, l.credit])).toEqual([
      ['3113', 0, 1600.04], ['3513', 1600.04, 0],
    ])
  })

  it('waived after part of it came in: only the rest comes back out', () => {
    const part = { ...conts, waived: true, plan: { rows, interestPaid: 400.01 }, payments: [...conts.payments, { date: '2026-11-20', type: 'interest', amount: 400.01 }] }
    expect(accrualsOf(part, '2026-11-27').reduce((t, a) => t + a.amount, 0)).toBe(400.01)
    expect(monthRunFor(part, '2026-11', { accrued: 1600.04, recognized: {} }, '2026-11-27')).toEqual({ accrual: -1200.03, recognition: 400.01 })
  })
})

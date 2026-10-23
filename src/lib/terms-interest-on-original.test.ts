import { describe, expect, it } from 'vitest'
import { buildTermsSegments, compareTermsChange, installmentsInAll, planTotals, type PositionTerms } from './treasury-terms'
import { buildPositionRow } from './counterparty-statement'
import { expectedFullRepaymentDate } from './fund-source-dates'
import { buildRepaymentPlan, type PlanPayment } from './repayment-plan'
import { monthEvents } from './repayment-calendar'
import { amendDraftOf, amendFormData, draftOfForm, type AmendTerms } from './fund-amend'
import { segmentLine } from '@/components/treasury/TermsTimeline'

// 「从某月起生效」 · 利息按原本金算 (2026-10-23). HC's Conts 60k (6 instalments
// May–Oct 2026, due the 2nd): the user — "5月还是用本金*3.5%， 6月就变成还是用本金*3%".
// May paid 10,000 + 2,100; June–Sep 10,000 + 1,800 each, September's on 2 Oct.
// Before, the 300 over May's 3% sat on October and the calendar read October
// "part paid" though nothing of it was in.

const isPrincipal = (t: string) => t === 'principal' || t === 'netting'
const MAY_35: PositionTerms = {
  principal: 60000,
  startYM: '2025-09',
  firstDueYM: '2026-05',
  current: { rate: 0.03, months: 5, compounding: false, effectiveFrom: '2026-06' },
  history: [{ validFrom: '2026-05', validTo: '2026-05', rate: 0.035, months: 6, compounding: false, nextInterestOnOriginal: true }],
}
const PAID_BY_MONTH = { '2026-05': 10000, '2026-06': 10000, '2026-07': 10000, '2026-08': 10000, '2026-10': 10000 }
const pays = (rows: Array<[string, string, number]>): PlanPayment[] => rows.map(([date, type, amount]) => ({ date, type, amount, ref: null }))
const PAYMENTS = pays([
  ['2026-05-15', 'principal', 10000], ['2026-05-15', 'interest', 2100],
  ['2026-06-22', 'principal', 10000], ['2026-06-22', 'interest', 1800],
  ['2026-07-24', 'principal', 10000], ['2026-07-24', 'interest', 1800],
  ['2026-08-28', 'principal', 10000], ['2026-08-28', 'interest', 1800],
  ['2026-10-02', 'principal', 10000], ['2026-10-02', 'interest', 1800],
])
const plan = (terms: PositionTerms) =>
  buildRepaymentPlan({ terms, payments: PAYMENTS, isPrincipal, today: '2026-10-23', dueDay: 2, status: 'active' })

describe('a change whose interest is on the original principal', () => {
  it('keeps the principal re-based and takes the interest on the whole 60k', () => {
    const [may, rest] = buildTermsSegments(MAY_35, PAID_BY_MONTH)
    expect(may).toMatchObject({ fromYM: '2026-05', toYM: '2026-05', base: 60000, interestPerMonth: 2100, interestOnOriginal: false })
    expect(rest).toMatchObject({ fromYM: '2026-06', toYM: '2026-10', base: 50000, principalPerMonth: 10000, interestBase: 60000, interestOnOriginal: true, interestPerMonth: 1800 })
  })

  it('without it the same change re-bases the interest too — 1,500 on the 50k still owed', () => {
    const plain: PositionTerms = { ...MAY_35, history: [{ ...MAY_35.history[0], nextInterestOnOriginal: false }] }
    const rest = buildTermsSegments(plain, PAID_BY_MONTH)[1]
    expect(rest).toMatchObject({ base: 50000, interestBase: 50000, interestOnOriginal: false, interestPerMonth: 1500 })
  })

  it('the plan: May due 12,100 and paid, June–September paid, October nothing in yet', () => {
    const p = plan(MAY_35)
    expect(p.rows.map((r) => [r.ym, r.installment, r.outstanding])).toEqual([
      ['2026-05', 12100, 0],
      ['2026-06', 11800, 0],
      ['2026-07', 11800, 0],
      ['2026-08', 11800, 0],
      ['2026-09', 11800, 0],
      ['2026-10', 11800, 11800],
    ])
    expect(p.rows[5].remark).toBe('Overdue 21 days')
    expect(monthEvents(p, { kind: 'pay', name: 'HC', href: '', rate: 0.03, principal: 60000 }, '2026-10', '2026-10-23')[0]).toMatchObject({ amount: 11800, status: 'overdue' })
  })

  it('as the deal stood before — 3% from day one — the 300 over May lands on October as part paid', () => {
    const before: PositionTerms = { ...MAY_35, current: { rate: 0.03, months: 6, compounding: false, effectiveFrom: null }, history: [] }
    const p = plan(before)
    expect(p.rows[5]).toMatchObject({ ym: '2026-10', outstanding: 11500, remark: 'Part paid RM 300.00 · short RM 11,500.00' })
  })

  it('a later change that does not say it re-bases again', () => {
    const later: PositionTerms = {
      ...MAY_35,
      current: { rate: 0.025, months: 3, compounding: false, effectiveFrom: '2026-08' },
      history: [MAY_35.history[0], { validFrom: '2026-06', validTo: '2026-07', rate: 0.03, months: 5, compounding: false }],
    }
    const segs = buildTermsSegments(later, PAID_BY_MONTH)
    expect(segs.map((s) => [s.fromYM, s.interestOnOriginal, s.interestPerMonth])).toEqual([
      ['2026-05', false, 2100],
      ['2026-06', true, 1800],
      ['2026-08', false, 750], // 30,000 still owed at August × 2.5%
    ])
  })

  it('says so where the terms are listed', () => {
    const segs = buildTermsSegments(MAY_35, PAID_BY_MONTH)
    expect(segmentLine(segs[1], 1)).toBe('3.000% /mo · 5mo · monthly RM 10,000.00 + 1,800.00 · interest on the original RM 60,000.00')
    expect(compareTermsChange(segs, 1, { currentYM: '2026-10' })?.new).toMatchObject({ base: 50000, interestOnOriginal: true, interestBase: 60000, interestPerMonth: 1800 })
  })

  it('a compounding segment rolls its own balance — the switch is a flat one', () => {
    const compound: PositionTerms = { ...MAY_35, current: { ...MAY_35.current, compounding: true } }
    expect(buildTermsSegments(compound, PAID_BY_MONTH)[1]).toMatchObject({ interestOnOriginal: false, interestBase: 50000 })
  })
})

describe('the whole plan where a deal is listed', () => {
  it('its installments count from the first: May + the 5 left from June = 6, the last on 2 Oct', () => {
    expect(installmentsInAll('2026-05', '2026-06', 5)).toBe(6)
    expect(expectedFullRepaymentDate('2026-05-02', installmentsInAll('2026-05', '2026-06', 5))).toBe('2026-10-02')
    expect(installmentsInAll('2026-05', null, 6)).toBe(6) // never changed
    expect(installmentsInAll(null, '2026-06', 5)).toBe(5)
  })

  it('its interest is each segment’s months × its interest: 2,100 + 5 × 1,800', () => {
    expect(planTotals(buildTermsSegments(MAY_35, PAID_BY_MONTH))).toEqual({ months: 6, interest: 11100 })
    const open: PositionTerms = { ...MAY_35, current: { ...MAY_35.current, months: null } }
    expect(planTotals(buildTermsSegments(open, PAID_BY_MONTH))).toBeNull()
  })

  it('the Company Statement row: 6mo and 11,100 in all; 1 instalment of 11,800 left, by October', () => {
    const row = buildPositionRow(
      {
        id: 'fs60',
        side: 'repay',
        counterparty: 'HOUZS Century',
        principal: 60000,
        monthlyRate: 0.03,
        tenureMonths: 5,
        compounding: false,
        unscheduled: false,
        startDate: '2025-09-02',
        startMonth: '2026-05-01',
        principalPaid: 50000,
        outstanding: 10000,
        paymentsByMonth: {},
        segments: buildTermsSegments(MAY_35, PAID_BY_MONTH),
        principalByMonth: PAID_BY_MONTH,
      },
      '2026-10',
    )!
    expect(row).toMatchObject({
      kind: 'flat',
      tenureMonths: 6,
      planInterest: 11100,
      monthlyInterest: 1800,
      remainingPeriods: 1,
      interestOutstanding: 1800,
      finishYM: '2026-10',
      termsFrom: '2026-06',
      termsInterestOnOriginal: true,
    })
  })
})

describe('Amend terms sends it', () => {
  const SOURCE: AmendTerms = { ratePct: '3.5', months: '6', start: '2026-05-02', compound: false, text: 'Conts - 60k', termsFrom: null, nextMonth: '2026-06' }
  it('from a month on, ticked: interest_on_original', () => {
    const d = { ...amendDraftOf(SOURCE), ratePct: '3', interestOnOriginal: true }
    expect(Object.fromEntries(amendFormData('in', 's1', SOURCE, d).entries())).toEqual({ fund_source_id: 's1', cost_rate_percent: '3', effective_from: '2026-06', interest_on_original: 'on' })
  })
  it('not ticked, or the whole deal: not sent', () => {
    expect(amendFormData('in', 's1', SOURCE, { ...amendDraftOf(SOURCE), ratePct: '3' }).has('interest_on_original')).toBe(false)
    expect(amendFormData('in', 's1', SOURCE, { ...amendDraftOf(SOURCE), mode: 'whole', interestOnOriginal: true, months: '5' }).has('interest_on_original')).toBe(false)
  })
  it('the desktop form reads it back', () => {
    const fd = new FormData()
    fd.set('effective_from', '2026-06')
    fd.set('interest_on_original', 'on')
    expect(draftOfForm('in', fd, 'from', SOURCE).interestOnOriginal).toBe(true)
  })
})

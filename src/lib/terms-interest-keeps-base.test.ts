import { describe, expect, it } from 'vitest'
import { buildTermsSegments, type PositionTerms } from './treasury-terms'
import { buildRepaymentPlan, type PlanPayment } from './repayment-plan'
import { buildPositionRow } from './counterparty-statement'
import { amendDraftOf, amendFormData, draftOfForm, type AmendTerms } from './fund-amend'
import { segmentLine } from '@/components/treasury/TermsTimeline'

// 「从某月起生效」 · 利息照之前的本金算 (2026-10-24). BI#7 — Lim Wei Liang's 60,000 from 5 Apr 2025, 0.5% × 60
// (1,000 + 300) to December; the user: "interest 1 月重新算， 10月开始就没有fixed repayment term 和 principal" →
// "10 月起利息照旧每月 424.83（按 1 月的 51,000 算），不管之后还了多少本金". January re-bases on the 51,000 owed
// then at 0.833%, 1,000 a month still (51 months left); October drops the fixed term and keeps the interest on 51,000.

const isPrincipal = (t: string) => t === 'principal' || t === 'netting'
const terms = (keepsBase: boolean): PositionTerms => ({
  principal: 60000,
  startYM: '2025-04',
  firstDueYM: '2025-05',
  current: { rate: 0.00833, months: null, compounding: false, effectiveFrom: '2026-10' },
  history: [
    { validFrom: '2025-05', validTo: '2025-12', rate: 0.005, months: 60, compounding: false },
    { validFrom: '2026-01', validTo: '2026-09', rate: 0.00833, months: 51, compounding: false, nextInterestKeepsBase: keepsBase },
  ],
})
const PAID = ['2025-04-05', '2025-05-05', '2025-06-05', '2025-07-05', '2025-08-05', '2025-09-05', '2025-10-05', '2025-11-05', '2025-12-05', '2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05', '2026-06-08', '2026-07-09', '2026-08-10', '2026-09-08', '2026-10-15']
const PAYMENTS: PlanPayment[] = PAID.flatMap((date) => [
  { date, type: 'principal', amount: 1000, ref: null },
  { date, type: 'interest', amount: 300, ref: null },
])
const BY_MONTH: Record<string, number> = Object.fromEntries(PAID.map((d) => [d.slice(0, 7), 1000]))

describe('a change that keeps the interest on the base the terms before used', () => {
  it('takes October’s interest on January’s 51,000 — 424.83, not 349.86 on the 42,000 owed then', () => {
    const [, jan, oct] = buildTermsSegments(terms(true), BY_MONTH)
    expect(jan).toMatchObject({ fromYM: '2026-01', toYM: '2026-09', base: 51000, months: 51, principalPerMonth: 1000, interestPerMonth: 424.83 })
    expect(oct).toMatchObject({ fromYM: '2026-10', toYM: null, months: null, base: 42000, interestBase: 51000, interestKeepsBase: true, interestPerMonth: 424.83 })
    expect(buildTermsSegments(terms(false), BY_MONTH)[2]).toMatchObject({ base: 42000, interestBase: 42000, interestKeepsBase: false, interestPerMonth: 349.86 })
  })

  it('draws BI#7 as the user asked: 1,424.83 January to September, the interest alone from October', () => {
    const plan = buildRepaymentPlan({ terms: terms(true), payments: PAYMENTS, isPrincipal, today: '2026-10-24', dueDay: 5, status: 'active' })
    expect(plan.rows.slice(8).map((r) => [r.due, r.installment, r.principal, r.interest, r.balance, r.outstanding])).toEqual([
      ['2026-01-05', 1424.83, 1000, 424.83, 50000, 0],
      ['2026-02-05', 1424.83, 1000, 424.83, 49000, 0],
      ['2026-03-05', 1424.83, 1000, 424.83, 48000, 0],
      ['2026-04-05', 1424.83, 1000, 424.83, 47000, 0],
      ['2026-05-05', 1424.83, 1000, 424.83, 46000, 0],
      ['2026-06-05', 1424.83, 1000, 424.83, 45000, 0],
      ['2026-07-05', 1424.83, 1000, 424.83, 44000, 0],
      ['2026-08-05', 1424.83, 1000, 424.83, 43000, 98.64],
      ['2026-09-05', 1424.83, 1000, 424.83, 42000, 424.83],
      // October: no principal falls due — the 1,000 is what came in on 15 Oct.
      ['2026-10-05', 424.83, 1000, 424.83, 41000, 424.83],
    ])
    expect(plan.rows[15].remark).toBe('Part paid RM 1,326.19 · short RM 98.64')
    expect(plan.rows[16].remark).toBe('Part paid RM 1,000.00 · short RM 424.83')
    expect(plan.rows[17].remark).toBe('Overdue 19 days · principal RM 1,000.00')
    expect(plan.outstandingDue).toBe(948.3)
  })

  it('keeps whatever base the terms before used — the original principal too — and needs flat terms to keep it from', () => {
    const chain: PositionTerms = {
      ...terms(true),
      history: [
        { validFrom: '2025-05', validTo: '2025-12', rate: 0.005, months: 60, compounding: false, nextInterestOnOriginal: true },
        { validFrom: '2026-01', validTo: '2026-09', rate: 0.00833, months: 51, compounding: false, nextInterestKeepsBase: true },
      ],
    }
    expect(buildTermsSegments(chain, BY_MONTH)[2]).toMatchObject({ interestBase: 60000, interestPerMonth: 499.8 })
    const afterCompound: PositionTerms = { ...terms(true), history: [terms(true).history[0], { ...terms(true).history[1], compounding: true }] }
    expect(buildTermsSegments(afterCompound, BY_MONTH)[2]).toMatchObject({ interestKeepsBase: false, interestBase: 42000 })
  })

  it('says so on the terms and on the Company Statement', () => {
    const segs = buildTermsSegments(terms(true), BY_MONTH)
    expect(segmentLine(segs[2], 2)).toBe('0.833% /mo · no fixed term · interest RM 424.83 on RM 51,000.00 as before')
    const row = buildPositionRow(
      {
        id: 'bi7', side: 'repay', counterparty: 'Lim Wei Liang', principal: 60000, monthlyRate: 0.00833, tenureMonths: null,
        compounding: false, unscheduled: false, startDate: '2025-04-05', startMonth: null, principalPaid: 19000, outstanding: 41000,
        paymentsByMonth: {}, segments: segs, principalByMonth: BY_MONTH,
      },
      '2026-10',
    )!
    expect(row).toMatchObject({ kind: 'no_term', monthlyInterest: 424.83, termsFrom: '2026-10', termsBase: 42000, termsInterestKeptOn: 51000 })
  })
})

describe('Amend terms sends it', () => {
  const SOURCE: AmendTerms = { ratePct: '0.833', months: '51', start: '2025-05-05', compound: false, text: '[BI#7]', termsFrom: '2026-01', nextMonth: '2026-10' }
  it('ticked: interest_keeps_base, beside no fixed term', () => {
    const d = { ...amendDraftOf(SOURCE), noFixedTerm: true, interestKeepsBase: true }
    expect(Object.fromEntries(amendFormData('in', 's1', SOURCE, d).entries())).toEqual({ fund_source_id: 's1', effective_from: '2026-10', no_fixed_term: 'on', interest_keeps_base: 'on' })
  })
  it('never both: the original principal wins a draft that holds the two', () => {
    const fd = amendFormData('in', 's1', SOURCE, { ...amendDraftOf(SOURCE), interestOnOriginal: true, interestKeepsBase: true })
    expect(fd.get('interest_on_original')).toBe('on')
    expect(fd.has('interest_keeps_base')).toBe(false)
  })
  it('the desktop form reads it back', () => {
    const fd = new FormData()
    fd.set('effective_from', '2026-10')
    fd.set('interest_keeps_base', 'on')
    expect(draftOfForm('in', fd, 'from', SOURCE)).toMatchObject({ interestKeepsBase: true, interestOnOriginal: false })
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildTermsSegments,
  buildSegmentedAging,
  compareTermsChange,
  currentSegment,
  rateAt,
  segmentAt,
  segmentRemainingPeriods,
  termsChanged,
  compoundRoll,
  type PositionTerms,
} from './treasury-terms'

// The user's own example (2026-09-21): borrowed 30k @ 2% × 12 from April
// (first installment May). 2,500 principal paid May–Aug, so 20k is still
// owed when the terms change from September: 3%, 10 more months.
const ORIGINAL: PositionTerms = {
  principal: 30000,
  startYM: '2026-04',
  firstDueYM: '2026-05',
  current: { rate: 0.02, months: 12, compounding: false, effectiveFrom: null },
  history: [],
}
const PAID = { '2026-05': 2500, '2026-06': 2500, '2026-07': 2500, '2026-08': 2500 }
const CHANGED: PositionTerms = {
  principal: 30000,
  startYM: '2026-04',
  firstDueYM: '2026-05',
  current: { rate: 0.03, months: 10, compounding: false, effectiveFrom: '2026-09', reason: '重新谈' },
  history: [{ validFrom: '2026-04', validTo: '2026-08', rate: 0.02, months: 12, compounding: false }],
}

describe('buildTermsSegments', () => {
  it('unchanged terms = one segment that reads exactly like the legacy figures', () => {
    const [s, ...rest] = buildTermsSegments(ORIGINAL, PAID)
    expect(rest).toHaveLength(0)
    expect(s).toMatchObject({ fromYM: '2026-05', toYM: '2027-04', rate: 0.02, months: 12, base: 30000, principalPerMonth: 2500, interestPerMonth: 600, scheduledEndYM: '2027-04', changed: false })
    expect(termsChanged([s])).toBe(false)
  })

  it('a change re-bases on the principal still owed at X: base ÷ remaining months, base × new rate', () => {
    const segs = buildTermsSegments(CHANGED, PAID)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ fromYM: '2026-05', toYM: '2026-08', rate: 0.02, principalPerMonth: 2500, interestPerMonth: 600, scheduledEndYM: '2027-04', changed: false })
    expect(segs[1]).toMatchObject({ fromYM: '2026-09', toYM: '2027-06', rate: 0.03, months: 10, base: 20000, principalPerMonth: 2000, interestPerMonth: 600, scheduledEndYM: '2027-06', changed: true, reason: '重新谈' })
    expect(termsChanged(segs)).toBe(true)
  })

  it('actual repayments drive the base, not the schedule (paid ahead → smaller base)', () => {
    const segs = buildTermsSegments(CHANGED, { ...PAID, '2026-08': 7500 })
    expect(segs[1].base).toBe(15000)
    expect(segs[1].principalPerMonth).toBe(1500)
    expect(segs[1].interestPerMonth).toBe(450)
  })

  it('a rate-only change keeps the old end month (months inherited)', () => {
    const rateOnly: PositionTerms = { ...CHANGED, current: { ...CHANGED.current, months: null } }
    const segs = buildTermsSegments(rateOnly, PAID)
    expect(segs[1].months).toBe(8) // Sep..Apr = the 8 installments the old plan had left
    expect(segs[1].scheduledEndYM).toBe('2027-04')
    expect(segs[1].principalPerMonth).toBe(2500)
    expect(segs[1].interestPerMonth).toBe(600) // 20,000 × 3%
  })

  it('two changes chain: the second re-bases on what was paid under the first', () => {
    const twice: PositionTerms = {
      ...CHANGED,
      current: { rate: 0.01, months: 4, compounding: false, effectiveFrom: '2026-11' },
      history: [
        { validFrom: '2026-04', validTo: '2026-08', rate: 0.02, months: 12, compounding: false },
        { validFrom: '2026-09', validTo: '2026-10', rate: 0.03, months: 10, compounding: false },
      ],
    }
    const segs = buildTermsSegments(twice, { ...PAID, '2026-09': 2000, '2026-10': 2000 })
    expect(segs.map((s) => [s.fromYM, s.toYM, s.base])).toEqual([
      ['2026-05', '2026-08', 30000],
      ['2026-09', '2026-10', 20000],
      ['2026-11', '2027-02', 16000],
    ])
    expect(segs[2].principalPerMonth).toBe(4000)
    expect(segs[2].interestPerMonth).toBe(160)
  })
})

describe('segment lookups', () => {
  const segs = buildTermsSegments(CHANGED, PAID)
  it('segmentAt / currentSegment / rateAt', () => {
    expect(segmentAt(segs, '2026-04')).toBeNull() // before the first installment
    expect(segmentAt(segs, '2026-08')?.rate).toBe(0.02)
    expect(segmentAt(segs, '2026-09')?.rate).toBe(0.03)
    expect(segmentAt(segs, '2027-07')).toBeNull() // plan finished
    expect(currentSegment(segs, '2027-09').fromYM).toBe('2026-09')
    expect(currentSegment(segs, '2026-01').fromYM).toBe('2026-05')
    expect(rateAt(segs, '2026-04')).toBe(0.02) // compounding accrues from the record month at the first rate
    expect(rateAt(segs, '2026-12')).toBe(0.03)
  })

  it('remaining periods count from the segment start', () => {
    expect(segmentRemainingPeriods(segs[1], 0)).toBe(10)
    expect(segmentRemainingPeriods(segs[1], 4000)).toBe(8)
    expect(segmentRemainingPeriods(segs[1], 20000)).toBe(0)
  })
})

describe('buildSegmentedAging', () => {
  it('ages each month at its own segment installment, FIFO', () => {
    const segs = buildTermsSegments(CHANGED, PAID)
    // Paid 4 × 3,100 (May–Aug incl. interest) + Sep 2,600 = exactly through September.
    const caughtUp = buildSegmentedAging({ segments: segs, asOfYM: '2026-10', totalPaid: 4 * 3100 + 2600 })
    expect(caughtUp).toEqual({ current: 2600, m1: 0, m2: 0, m3: 0, total: 2600 })
    // Short by one old-rate installment: the oldest unpaid one ages first.
    const behind = buildSegmentedAging({ segments: segs, asOfYM: '2026-10', totalPaid: 3 * 3100 })
    expect(behind.m2).toBe(3100) // August
    expect(behind.m1).toBe(2600) // September (new installment)
    expect(behind.current).toBe(2600)
    expect(behind.total).toBe(8300)
  })
})

describe('compareTermsChange', () => {
  it('old plan carried on vs the new plan, month by month, with what was paid so far', () => {
    const segs = buildTermsSegments(CHANGED, PAID)
    const c = compareTermsChange(segs, 1, {
      currentYM: '2026-10',
      paidByMonth: { '2026-09': { principal: 2000, interest: 600 }, '2026-10': { principal: 2000, interest: 300 } },
    })!
    expect(c.fromYM).toBe('2026-09')
    expect(c.old).toMatchObject({ rate: 0.02, principalPerMonth: 2500, interestPerMonth: 600, endYM: '2027-04' })
    expect(c.new).toMatchObject({ rate: 0.03, principalPerMonth: 2000, interestPerMonth: 600, endYM: '2027-06', base: 20000 })
    expect(c.rows).toHaveLength(10) // Sep 2026 .. Jun 2027
    expect(c.rows[0]).toMatchObject({ ym: '2026-09', oldPrincipal: 2500, oldInterest: 600, newPrincipal: 2000, newInterest: 600, diffInterest: 0, diffTotal: -500, paidPrincipal: 2000, paidInterest: 600, shortfall: 0 })
    expect(c.rows[1]).toMatchObject({ ym: '2026-10', shortfall: 300 })
    expect(c.rows[2].paidPrincipal).toBeUndefined() // future month
    expect(c.rows[8]).toMatchObject({ ym: '2027-05', oldPrincipal: 0, oldInterest: 0, newPrincipal: 2000, newInterest: 600 })
    expect(c.totals).toEqual({ oldInterest: 4800, newInterest: 6000, diffInterest: 1200, oldTotal: 24800, newTotal: 26000, diffTotal: 1200, shortfall: 300 })
  })

  it('returns null for the original segment', () => {
    expect(compareTermsChange(buildTermsSegments(ORIGINAL), 0, { currentYM: '2026-10' })).toBeNull()
  })
})

// ─── compoundRoll: the user's live example (2026-09-21) ──────────────────────
// Lim Wei Liang 60,000 @ 0.5% flat × 60 from 2025-04; 1,000 + 300 paid every
// month Apr-25..Jul-26, nothing in Aug-26, again in Sep-26 → 43,000 owed.
// "从一月才开始重新算, 4% per month, compound": roll from 2026-01 on the
// 51,000 still owed then; the flat months before it capitalise nothing.

describe('compoundRoll', () => {
  const pay: Record<string, number> = {}
  for (const ym of ['2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-09']) pay[ym] = 1300
  const principalOnly: Record<string, number> = Object.fromEntries(Object.keys(pay).map((k) => [k, 1000]))
  const terms: PositionTerms = {
    principal: 60000,
    startYM: '2025-04',
    firstDueYM: '2025-05',
    current: { rate: 0.04, months: null, compounding: true, effectiveFrom: '2026-01' },
    history: [{ validFrom: '2025-05', validTo: '2025-12', rate: 0.005, months: 60, compounding: false }],
  }

  it('flat → compound at X: starts at X on the principal still owed, not from day one', () => {
    const segs = buildTermsSegments(terms, principalOnly)
    expect(segs[1]).toMatchObject({ fromYM: '2026-01', compounding: true, base: 51000 })
    const roll = compoundRoll(segs, { principal: 60000, startYM: '2025-04', currentYM: '2026-09', paymentsByMonth: pay })!
    expect(roll.fromYM).toBe('2026-01')
    expect(roll.base).toBe(51000)
    // Jan 51,000 → +2,040 −1,300 = 51,740 → … → Aug (no payment) 59,118.53
    expect(roll.balance).toBe(59118.53)
    expect(roll.thisMonthInterest).toBe(2364.74)
  })

  it('compound from day one still rolls from the record month on the original principal', () => {
    const fromStart: PositionTerms = { ...terms, current: { ...terms.current, effectiveFrom: null }, history: [] }
    const segs = buildTermsSegments(fromStart, principalOnly)
    const roll = compoundRoll(segs, { principal: 60000, startYM: '2025-04', currentYM: '2025-06', paymentsByMonth: pay })!
    // Apr: 60,000 + 2,400 − 1,300 = 61,100 · May: 61,100 + 2,444 − 1,300 = 62,244
    expect(roll).toMatchObject({ fromYM: '2025-04', base: 60000, balance: 62244, thisMonthInterest: 2489.76 })
  })

  it('null when the current terms do not compound', () => {
    expect(compoundRoll(buildTermsSegments(ORIGINAL), { principal: 30000, startYM: '2026-04', currentYM: '2026-09', paymentsByMonth: {} })).toBeNull()
  })
})

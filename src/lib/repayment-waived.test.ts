import { describe, expect, it } from 'vitest'
import { buildRepaymentPlan, waivedPlan } from './repayment-plan'
import { hidesOwed, shownForStatus, type CalendarEntry } from './repayment-calendar'
import { termsForLoan, isLoanPrincipal } from './treasury-terms-data'

// 2026-11-27 — CONTS's 10,000 of 8 Jul 2026: principal repaid 13 Nov, its four months' interest (4 × 400.01) never —
// "要收"; the deals settled some other way — "这几笔其实收完了，schedule 也别显示还欠" · "完全不显示".

const conts = (status: string) =>
  buildRepaymentPlan({
    terms: termsForLoan({ principal: 10000, effective_rate: 0.040001, tenure_months: 1, compound_interest: false, disbursement_date: '2026-07-08', repayment_terms: '利滚利挂账(未定还款)' }),
    payments: [{ date: '2026-11-13', type: 'principal', amount: 10000, ref: null }],
    isPrincipal: isLoanPrincipal,
    today: '2026-11-27',
    dueDay: 8,
    status,
    minPayFromYM: null,
  })

describe('a repaid deal’s interest left unpaid', () => {
  it('is hidden only once waived', () => {
    expect(hidesOwed('fully_repaid', true)).toBe(true)
    expect(hidesOwed('repaid', true)).toBe(true)
    expect(hidesOwed('fully_repaid', false)).toBe(false)
    expect(hidesOwed('active', true)).toBe(false)
    // Callers that say nothing keep the rule they had.
    expect(hidesOwed('fully_repaid')).toBe(true)
  })

  it('stays on the lists while owed', () => {
    const late = { outstanding: 400.01 } as CalendarEntry
    const paid = { outstanding: 0 } as CalendarEntry
    expect(shownForStatus([late, paid], 'fully_repaid', false)).toHaveLength(2)
    expect(shownForStatus([late, paid], 'fully_repaid', true)).toEqual([paid])
  })

  it('shows none of it once waived: the schedule reads settled', () => {
    const plan = conts('fully_repaid')
    expect(plan.outstandingDue).toBe(1600.04)
    const w = waivedPlan(plan)
    // Three months nothing came in on are not shown; November's reads its 10,000 principal, settled.
    expect(w.rows).toHaveLength(1)
    // A month-by-month plan's installment is its interest alone; the principal stands beside it.
    expect(w.rows[0]).toMatchObject({ ym: '2026-11', installment: 0, interest: 0, principal: 10000, outstanding: 0, remark: 'Settled' })
    expect(w.outstandingDue).toBe(0)
    expect(w.overdue).toBe(0)
    expect(w.totalInterest).toBe(0)
  })

  it('keeps what was paid on a part-paid instalment', () => {
    // 120,000 for a month at 4%: the principal came in, the 4,800.12 interest did not.
    const plan = buildRepaymentPlan({
      terms: termsForLoan({ principal: 120000, effective_rate: 0.040001, tenure_months: 1, compound_interest: false, disbursement_date: '2026-06-08', repayment_terms: '1 month - 4%' }),
      payments: [{ date: '2026-07-03', type: 'principal', amount: 120000, ref: null }],
      isPrincipal: isLoanPrincipal,
      today: '2026-11-27',
      dueDay: 8,
      status: 'fully_repaid',
      minPayFromYM: null,
    })
    expect(plan.outstandingDue).toBe(4800.12)
    const w = waivedPlan(plan)
    expect(w.rows).toHaveLength(1)
    expect(w.rows[0]).toMatchObject({ installment: 120000, interest: 0, principal: 120000, outstanding: 0 })
    expect(w.overdue).toBe(0)
  })

  it('leaves a plan with nothing owed as it is', () => {
    const plan = conts('fully_repaid')
    const paidUp = { ...plan, outstandingDue: 0 }
    expect(waivedPlan(paidUp)).toBe(paidUp)
  })
})

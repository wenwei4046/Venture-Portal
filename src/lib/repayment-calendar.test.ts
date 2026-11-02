import { describe, expect, it } from 'vitest'
import { monthEvents, overdueOf } from './repayment-calendar'
import { buildRepaymentPlan, type PlanPayment, type RepaymentPlan } from './repayment-plan'
import { isFundSourcePrincipal, isLoanPrincipal, termsForFundSource, termsForLoan } from './treasury-terms-data'

// 2026-10-09 — the Repayment Schedule's calendar reads each deal's plan: the
// month's installments become its entries, standing as paid, part paid,
// overdue or due by what is still unpaid on them and their day. 2026-11-02
// (the user: 还了要显示，只是像那种提早settle 了就不要显示 → b): one paid before its
// month — paid ahead, or settled early with its deal — is no entry.

const row = (no: number, due: string, installment: number, outstanding: number, paidOn?: string) => ({
  no, ym: due.slice(0, 7), due, installment, principal: installment - 400, interest: 400, balance: 0, outstanding, remark: '', tone: '' as const, paidOn,
})
const plan = (rows: ReturnType<typeof row>[], months: number | null = 6): RepaymentPlan => ({
  kind: months ? 'fixed' : 'open', rows, months, paidCount: 0, outstandingDue: 0, overdue: 0, overdueSince: null, overdueDays: 0, firstDue: rows[0]?.due ?? null, firstInstallment: 0,
  totalInterest: 0, principalPaid: 0, interestPaid: 0, principalOwed: 0, compound: null,
})
const deal = { kind: 'collect' as const, name: 'CAR', href: '/fund-out/l1', rate: 0.04, principal: 60000 }

describe('monthEvents', () => {
  it('takes the month’s installments and says where each stands', () => {
    const p = plan([
      row(4, '2026-09-02', 12400, 0),
      row(5, '2026-10-02', 12400, 0),
      row(6, '2026-10-30', 12400, 2400),
      row(7, '2026-10-05', 12400, 12400),
      row(8, '2026-10-20', 12400, 12400),
    ])
    expect(monthEvents(p, deal, '2026-10', '2026-10-09').map((e) => [e.date, e.status, e.outstanding, e.no, e.months])).toEqual([
      ['2026-10-02', 'paid', 0, 5, 6],
      ['2026-10-30', 'partial', 2400, 6, 6],
      ['2026-10-05', 'overdue', 12400, 7, 6],
      ['2026-10-20', 'due', 12400, 8, 6],
    ])
    expect(monthEvents(p, deal, '2026-10', '2026-10-09')[0]).toMatchObject({ kind: 'collect', name: 'CAR', href: '/fund-out/l1', amount: 12400, rate: 0.04, principal: 60000 })
  })

  // 2026-11-02 (the user: 还了要显示，只是像那种提早settle 了就不要显示 → b): paid in
  // its month, early or late, it stays; paid in a month before — even 19 Sep for
  // 5 Oct — it is no entry.
  it('leaves out one paid before its month; paid in its month or after, it stays — paid', () => {
    const p = plan([
      row(5, '2026-10-05', 1950, 0, '2026-09-19'),
      row(6, '2026-10-15', 1950, 0, '2026-10-03'),
      row(7, '2026-10-20', 1950, 0, '2026-11-02'),
      row(8, '2026-10-25', 1950, 1950),
    ])
    expect(monthEvents(p, deal, '2026-10', '2026-11-05').map((e) => [e.no, e.status])).toEqual([[6, 'paid'], [7, 'paid'], [8, 'overdue']])
  })

  it('has nothing for a month the plan does not reach', () => {
    expect(monthEvents(plan([row(1, '2026-09-02', 100, 0)]), deal, '2026-11', '2026-10-09')).toEqual([])
  })

  // 2026-10-12 (user: 把0.00拿掉): an interest-free deal with no fixed term
  // owes nothing in a month — no entry for it.
  it('leaves out a month with nothing to pay', () => {
    const p = plan([row(1, '2026-10-26', 0, 0), row(2, '2026-10-30', 100, 100)], null)
    expect(monthEvents(p, deal, '2026-10', '2026-10-09').map((e) => [e.date, e.amount])).toEqual([['2026-10-30', 100]])
  })
})

// 2026-11-02 — the user's November: CONTS's 300,000 loan and HC's 300,000 fund
// source (36 instalments of 10,000.13 from January 2025, due the 1st) stood on
// the 1st, green, though CONTS had repaid all 36 by 26 Oct 2026 (22 of them
// with July's lump) and HC had been paid 35 ahead on 5 Aug 2026.
describe('monthEvents · what was paid before its month is off the calendar', () => {
  const pays = (lump: Array<[string, string, number]>): PlanPayment[] => [
    ...Array.from({ length: 13 }, (_, i) => {
      const date = `${2025 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`
      return [
        { date, type: 'principal', amount: i === 12 ? 8333.37 : 8333.33, ref: null },
        { date, type: 'interest', amount: 1666.67, ref: null },
      ]
    }).flat(),
    ...lump.map(([date, type, amount]) => ({ date, type, amount, ref: null })),
  ]
  const TODAY = '2026-11-02'
  const conts = buildRepaymentPlan({
    terms: termsForLoan({ principal: 300000, effective_rate: 0.005556, tenure_months: 36, disbursement_date: '2025-01-01', repayment_start_month: '2025-01-01', repayment_terms: 'EMI 分期 · 月息0.5555% · 36期 · 已还13 · [LO#19] · 资金来源: HC 300k' }),
    payments: pays([['2026-07-31', 'principal', 183333.34], ['2026-07-31', 'interest', 36666.66], ['2026-10-26', 'principal', 8333.33], ['2026-10-26', 'interest', 1666.8]]),
    isPrincipal: isLoanPrincipal,
    today: TODAY,
    dueDay: 1,
    status: 'fully_repaid',
  })
  const hc = buildRepaymentPlan({
    terms: termsForFundSource({ amount: 300000, cost_rate: 0.005556, lock_in_months: 36, effective_date: '2025-01-01', repayment_start_month: '2025-01-01' }),
    payments: pays([['2026-08-05', 'principal', 183333.34], ['2026-08-05', 'interest', 36666.66]]),
    isPrincipal: isFundSourcePrincipal,
    today: TODAY,
    dueDay: 1,
    status: 'active',
  })
  const CONTS = { kind: 'collect' as const, name: 'CONTS', href: '/fund-out/conts', rate: 0.005556, principal: 300000 }
  const HC = { kind: 'pay' as const, name: 'HC', href: '/fund-in/hc', rate: 0.005556, principal: 300000 }

  it('a loan repaid ahead has no instalment from August on — July’s lump paid them before their months', () => {
    expect(conts.rows.find((r) => r.ym === '2026-11')).toMatchObject({ installment: 10000.13, outstanding: 0, paidOn: '2026-07-31' })
    expect(monthEvents(conts, CONTS, '2026-10', TODAY)).toEqual([])
    expect(monthEvents(conts, CONTS, '2026-11', TODAY)).toEqual([])
    expect(monthEvents(conts, CONTS, '2027-12', TODAY)).toEqual([])
  })

  it('keeps what was paid in its month, or after it, as paid', () => {
    // July's own instalment, paid on the 31st; February's, paid late with the same lump.
    expect(monthEvents(conts, CONTS, '2026-07', TODAY)).toMatchObject([{ name: 'CONTS', date: '2026-07-01', status: 'paid' }])
    expect(monthEvents(conts, CONTS, '2026-02', TODAY)).toMatchObject([{ date: '2026-02-01', status: 'paid' }])
    expect(monthEvents(hc, HC, '2026-08', TODAY)).toMatchObject([{ name: 'HC', date: '2026-08-01', status: 'paid' }])
  })

  it('a fund source paid 35 ahead has none from September — its one instalment left stays on its day', () => {
    expect(monthEvents(hc, HC, '2026-09', TODAY)).toEqual([])
    expect(monthEvents(hc, HC, '2026-11', TODAY)).toEqual([])
    expect(monthEvents(hc, HC, '2027-12', TODAY)).toMatchObject([{ kind: 'pay', name: 'HC', date: '2027-12-01', outstanding: 10000.13, no: 36, months: 36 }])
  })

  it('nor one settled early: the principal repaid with its months still to come', () => {
    const early = buildRepaymentPlan({
      terms: termsForLoan({ principal: 60000, effective_rate: 0.04, tenure_months: 6, disbursement_date: '2026-04-02', repayment_terms: 'EMI 分期 · 6期' }),
      payments: [
        { date: '2026-05-02', type: 'principal', amount: 10000, ref: null },
        { date: '2026-05-02', type: 'interest', amount: 2400, ref: null },
        { date: '2026-06-02', type: 'principal', amount: 50000, ref: null },
        { date: '2026-06-02', type: 'interest', amount: 2400, ref: null },
      ],
      isPrincipal: isLoanPrincipal,
      today: '2026-07-10',
      dueDay: 2,
      status: 'fully_repaid',
    })
    expect(early.rows.find((r) => r.ym === '2026-08')).toMatchObject({ outstanding: 0, remark: 'Settled early · 2 Jun 2026' })
    expect(['2026-07', '2026-08', '2026-09', '2026-10'].flatMap((m) => monthEvents(early, deal, m, '2026-07-10'))).toEqual([])
  })
})

describe('overdueOf', () => {
  it('sums what is unpaid on the installments whose day has passed, from the oldest', () => {
    const p = plan([
      row(1, '2026-08-02', 12400, 0),
      row(2, '2026-09-02', 12400, 2400),
      row(3, '2026-10-02', 12400, 12400),
      row(4, '2026-10-30', 12400, 12400),
    ])
    expect(overdueOf(p, '2026-10-09')).toEqual({ outstanding: 14800, oldestDue: '2026-09-02', oldestNo: 2, daysPast: 37, count: 2 })
  })

  it('is nothing when every passed installment is paid', () => {
    expect(overdueOf(plan([row(1, '2026-09-02', 100, 0), row(2, '2026-11-02', 100, 100)]), '2026-10-09')).toBeNull()
  })
})

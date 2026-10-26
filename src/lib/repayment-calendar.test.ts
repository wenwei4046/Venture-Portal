import { describe, expect, it } from 'vitest'
import { monthEvents, overdueOf } from './repayment-calendar'
import type { RepaymentPlan } from './repayment-plan'

// 2026-10-09 — the Repayment Schedule's calendar reads each deal's plan: the
// month's installments become its entries, standing as paid, part paid,
// overdue or due by what is still unpaid on them and their day.

const row = (no: number, due: string, installment: number, outstanding: number) => ({
  no, ym: due.slice(0, 7), due, installment, principal: installment - 400, interest: 400, balance: 0, outstanding, remark: '', tone: '' as const,
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

import { describe, expect, it } from 'vitest'
import { bookWindow, type BookDeal } from './repayment-book'
import type { PlanRow, RepaymentPlan } from './repayment-plan'

// 2026-10-09 — the Overview's "Overdue instalments" and "Coming up · next 14
// days" (the user's Claude Design handoff): every live deal's installments
// that still have something unpaid, before today or within the next 14 days.

const row = (no: number, due: string, installment: number, outstanding: number): PlanRow => ({
  no, ym: due.slice(0, 7), due, installment, principal: null, interest: installment, balance: 0, outstanding, remark: '', tone: '',
})
const plan = (rows: PlanRow[], months: number | null = rows.length): RepaymentPlan => ({
  kind: 'fixed', rows, months, paidCount: 0, outstandingDue: 0, firstDue: rows[0]?.due ?? null, firstInstallment: rows[0]?.installment ?? 0,
  totalInterest: 0, principalPaid: 0, interestPaid: 0, principalOwed: 0,
})

const deals: BookDeal[] = [
  {
    kind: 'collect', id: 'l1', name: 'HOUZS Bedding', href: '/fund-out/l1',
    plan: plan([row(1, '2026-08-15', 1000, 0), row(2, '2026-09-15', 1000, 1000), row(3, '2026-10-15', 1000, 1000), row(4, '2026-11-15', 1000, 1000)]),
  },
  {
    kind: 'pay', id: 'f1', name: 'Kenanga Capital', href: '/fund-in/f1',
    plan: plan([row(1, '2026-10-09', 4400, 4400), row(2, '2026-10-23', 4400, 4400), row(3, '2026-10-24', 4400, 4400)]),
  },
  {
    kind: 'collect', id: 'l2', name: 'HOUZS Design', href: '/fund-out/l2',
    plan: plan([row(1, '2026-10-01', 500, 120.5), row(2, '2026-10-20', 500, 0)]),
  },
]

describe('the book around today', () => {
  it('lists what is unpaid before today as overdue, oldest first', () => {
    const { overdue } = bookWindow(deals, '2026-10-09')
    expect(overdue.map((e) => [e.name, e.due, e.no, e.outstanding])).toEqual([
      ['HOUZS Bedding', '2026-09-15', 2, 1000],
      ['HOUZS Design', '2026-10-01', 1, 120.5],
    ])
  })

  it('lists the next 14 days from today, today and the 14th day included', () => {
    const { upcoming } = bookWindow(deals, '2026-10-09')
    expect(upcoming.map((e) => [e.kind, e.name, e.due, e.no, e.months])).toEqual([
      ['pay', 'Kenanga Capital', '2026-10-09', 1, 3],
      ['collect', 'HOUZS Bedding', '2026-10-15', 3, 4],
      ['pay', 'Kenanga Capital', '2026-10-23', 2, 3],
    ])
    expect(upcoming[0].href).toBe('/fund-in/f1')
  })

  it('takes a different window', () => {
    expect(bookWindow(deals, '2026-10-09', 40).upcoming).toHaveLength(5)
  })
})

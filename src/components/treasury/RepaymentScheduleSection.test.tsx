import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { RepaymentPlan } from '@/lib/repayment-plan'
import RepaymentScheduleSection from './RepaymentScheduleSection'
import PrintSchedule from './PrintSchedule'

// 2026-10-09 — the Repayment schedule on a fund source's and a loan's page
// (the user's Claude Design handoff): No. / Date / Installment / Principal /
// Interest / Balance / Outstanding / Remark, a foot of totals and a line on
// how to read it; the payments themselves fold away under it. Print schedule
// lays the same plan out on a page of its own.

const plan: RepaymentPlan = {
  kind: 'fixed',
  rows: [
    { no: 1, ym: '2026-02', due: '2026-02-15', installment: 11200, principal: 10000, interest: 1200, balance: 22400, outstanding: 0, remark: 'Paid 15 Feb 2026 · HV-OR-1', tone: 'ledger' },
    { no: 2, ym: '2026-03', due: '2026-03-15', installment: 11200, principal: 10000, interest: 1200, balance: 11200, outstanding: 600, remark: 'Part paid RM 10,600.00 · short RM 600.00', tone: 'alert' },
    { no: 3, ym: '2026-04', due: '2026-04-15', installment: 11200, principal: 10000, interest: 1200, balance: 0, outstanding: 11200, remark: 'Overdue 5 days', tone: 'danger' },
  ],
  months: 3,
  paidCount: 1,
  outstandingDue: 11800,
  firstDue: '2026-02-15',
  firstInstallment: 11200,
  totalInterest: 3600,
  principalPaid: 20000,
  interestPaid: 1800,
  principalOwed: 10000,
}
const head = () => screen.getByRole('heading', { name: 'Repayment schedule' }).closest('.sect-head') as HTMLElement

describe('the Repayment schedule', () => {
  it('lays out each installment with its balance, what is unpaid and why', () => {
    render(<RepaymentScheduleSection plan={plan} />)
    expect(head().querySelector('.count')).toHaveTextContent('PAID 1 OF 3 · OUTSTANDING RM 11,800.00')
    const table = head().parentElement!.querySelector('table') as HTMLTableElement
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual([
      'No.', 'Date', 'Installment', 'Principal', 'Interest', 'Balance', 'Outstanding', 'Remark',
    ])
    const row = (n: number) => table.querySelectorAll('tbody tr')[n] as HTMLElement
    expect(row(0)).toHaveTextContent('15 Feb 2026')
    expect(row(0)).toHaveTextContent('11,200.00')
    expect(within(row(0)).getByText('Paid 15 Feb 2026 · HV-OR-1')).toHaveClass('sched-ledger')
    expect(within(row(1)).getByText(/Part paid/)).toHaveClass('sched-alert')
    expect(within(row(2)).getByText('Overdue 5 days')).toHaveClass('sched-danger')
    const foot = table.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('Total')
    expect(foot).toHaveTextContent('33,600.00')
    expect(foot).toHaveTextContent('11,800.00')
    expect(screen.getByText(/^Installment = principal ÷ 3/)).toBeInTheDocument()
  })

  it('folds the payments themselves away under the schedule', () => {
    render(
      <RepaymentScheduleSection plan={plan} recorded={{ count: 4, content: <p>the payments</p> }} />,
    )
    const fold = screen.getByText('Repayments recorded · 4').closest('details') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(within(fold).getByText('the payments')).toBeInTheDocument()
  })

  it('reads a deal with no fixed term month by month, and a cancelled one as no schedule', () => {
    const { unmount } = render(<RepaymentScheduleSection plan={{ ...plan, kind: 'open', months: null }} />)
    expect(head().querySelector('.count')).toHaveTextContent('NO FIXED TERM · 3 MONTHS TO DATE')
    expect(screen.getByText(/^No fixed term: interest month by month/)).toBeInTheDocument()
    unmount()
    render(<RepaymentScheduleSection plan={{ ...plan, kind: 'none', rows: [] }} cancelled />)
    expect(screen.getByText('Cancelled — no schedule.')).toBeInTheDocument()
  })

  it('prints the schedule on a page of its own', () => {
    // happy-dom has no print(); the sheet asks the browser to print.
    const print = vi.fn()
    vi.stubGlobal('print', print)
    render(
      <PrintSchedule
        kicker="FUND IN · SUBSIDIARY"
        name="HOUZS Century"
        meta={[{ label: 'Principal', value: 'RM 30,000.00' }, { label: 'Rate', value: '1.000% /mo' }]}
        plan={plan}
        printed="Printed 9 Oct 2026 · Finance Manager"
      />,
    )
    expect(screen.queryByRole('dialog', { name: 'Repayment Schedule · HOUZS Century' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Print schedule' }))
    const sheet = screen.getByRole('dialog', { name: 'Repayment Schedule · HOUZS Century' })
    expect(sheet).toHaveTextContent('FUND IN · SUBSIDIARY')
    expect(sheet).toHaveTextContent('Principal')
    expect(sheet).toHaveTextContent('RM 30,000.00')
    expect(sheet.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(sheet).toHaveTextContent('Printed 9 Oct 2026 · Finance Manager')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Print' }))
    expect(print).toHaveBeenCalled()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('opens straight away when asked to (the list’s Print schedule)', () => {
    render(<PrintSchedule autoOpen kicker="FUND OUT · LOAN" name="Carres" meta={[]} plan={plan} printed="Printed" />)
    expect(screen.getByRole('dialog', { name: 'Repayment Schedule · Carres' })).toBeInTheDocument()
  })
})

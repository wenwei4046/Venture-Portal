import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { RepaymentPlan } from '@/lib/repayment-plan'
import RepaymentScheduleSection from './RepaymentScheduleSection'
import PrintSchedule from './PrintSchedule'

// 2026-10-09 — the Repayment schedule on a fund source's and a loan's page
// (the user's Claude Design handoff): No. / Date / Installment / Principal /
// Interest / Balance / Outstanding / Remark and a foot of totals; the payments
// themselves fold away under it. The line on how to read it went 2026-10-12
// (the user: the descriptions make the view too messy). Print schedule lays
// the same plan out on a page of its own.

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
  overdue: 0,
  overdueSince: null,
  overdueDays: 0,
  firstDue: '2026-02-15',
  firstInstallment: 11200,
  totalInterest: 3600,
  principalPaid: 20000,
  interestPaid: 1800,
  principalOwed: 10000,
  compound: null,
}

// 2026-10-24 — a 利滚利 deal, as the user's tidied LO#7 (cut down): a flat month, then two compounding ones.
const compound: RepaymentPlan = {
  kind: 'open',
  rows: [
    { no: 1, ym: '2025-12', due: '2025-12-05', installment: 1300, principal: 1000, interest: 300, balance: 51000, outstanding: 0, remark: 'Paid 5 Dec 2025', tone: 'ledger', paid: 1300, toBalance: 0 },
    { no: 2, ym: '2026-01', due: '2026-01-05', installment: 2040, principal: 1000, interest: 2040, balance: 51740, outstanding: 0, remark: 'Part paid · 740.00 to balance', tone: 'alert', paid: 1300, toBalance: 740 },
    { no: 3, ym: '2026-02', due: '2026-02-05', installment: 2069.6, principal: null, interest: 2069.6, balance: 53809.6, outstanding: 2069.6, remark: 'Overdue 19 days', tone: 'danger', paid: 0, toBalance: 0, late: true },
  ],
  months: null,
  paidCount: 1,
  outstandingDue: 2069.6,
  overdue: 2069.6,
  overdueSince: '2026-02-05',
  overdueDays: 19,
  firstDue: '2025-12-05',
  firstInstallment: 1300,
  totalInterest: 4409.6,
  principalPaid: 2000,
  interestPaid: 600,
  principalOwed: 58000,
  compound: {
    breaks: [
      { no: 1, head: 'Dec 2025 – Dec 2025', rest: '0.500% /mo flat · RM 1,000.00 + 300.00 a month' },
      { no: 2, head: 'From Jan 2026', rest: '4.000% /mo compounding · no fixed term · rolls from RM 51,000.00 owed' },
    ],
    owedNow: 53809.6,
    paidToDate: 2600,
    addedToBalance: 740,
    addedFrom: '2026-01',
    addedTo: '2026-01',
  },
  next: { due: '2026-03-05', amount: 2152.38, principal: 0, interest: 2152.38 },
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
    expect(screen.queryByText(/^Installment = principal ÷ 3/)).toBeNull()
  })

  // 2026-10-26 — the user: fund in "也需要卡片，和fund out 一样", every schedule "是", the fourth "改成 next installment".
  it('puts the four figures over every schedule: overdue, owed now, paid to date, the next installment', () => {
    const { unmount } = render(
      <RepaymentScheduleSection plan={{ ...plan, overdue: 11800, overdueSince: '2026-03-15', overdueDays: 36, next: { due: '2026-05-15', amount: 11200, principal: 10000, interest: 1200 } }} />,
    )
    const facts = () => Array.from(document.querySelectorAll('.sched-fact')).map((f) => f.textContent)
    // Owed now: the principal still owed and the interest already due but not paid (Feb–Apr's 3,600 less the 1,800 in).
    expect(facts()).toEqual([
      'Overdue nowRM 11,800.00since 15 Mar 2026 · 36 days',
      'Owed nowRM 11,800.00principal 10,000.00 + interest 1,800.00',
      'Paid to dateRM 21,800.00principal 20,000.00 + interest 1,800.00',
      'Next installmentRM 11,200.0015 May 2026 · principal 10,000.00 + interest 1,200.00',
    ])
    expect(document.querySelector('.sched-fact[data-bad="true"]')).toHaveTextContent('Overdue now')
    unmount()
    render(<RepaymentScheduleSection plan={{ ...plan, kind: 'open', months: null, next: null }} />)
    expect(facts()[1]).toBe('Owed nowRM 11,800.00principal 10,000.00 + interest 1,800.00')
    expect(facts()[3]).toBe('Next installment—nothing more falls due')
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
    expect(screen.queryByText(/^No fixed term: interest month by month/)).toBeNull()
    unmount()
    render(<RepaymentScheduleSection plan={{ ...plan, kind: 'none', rows: [] }} cancelled />)
    expect(screen.getByText('Cancelled — no schedule.')).toBeInTheDocument()
  })

  it('lays a 利滚利 deal out as the user tidied it: the figures over it, Due / Paid / To balance / Overdue, a line where its terms change', () => {
    render(<RepaymentScheduleSection plan={compound} />)
    expect(head().querySelector('.count')).toHaveTextContent('NO FIXED TERM · 3 MONTHS TO DATE · OVERDUE RM 2,069.60')
    const facts = Array.from(document.querySelectorAll('.sched-fact')).map((f) => f.textContent)
    expect(facts).toEqual([
      'Overdue nowRM 2,069.60since 5 Feb 2026 · 19 days',
      'Owed nowRM 53,809.60balance after Feb 2026',
      'Paid to dateRM 2,600.00principal 2,000.00 + interest 600.00',
      'Next installmentRM 2,152.385 Mar 2026 · interest',
    ])
    const table = head().parentElement!.querySelector('table') as HTMLTableElement
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual([
      'No.', 'Date', 'Due', 'Paid', 'To balance', 'Balance', 'Overdue', 'Remark',
    ])
    const lines = Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.textContent)
    expect(lines[0]).toBe('Dec 2025 – Dec 2025 · 0.500% /mo flat · RM 1,000.00 + 300.00 a month')
    expect(lines[2]).toBe('From Jan 2026 · 4.000% /mo compounding · no fixed term · rolls from RM 51,000.00 owed')
    expect(lines[3]).toBe('25 Jan 20262,040.001,300.00740.0051,740.00—Part paid · 740.00 to balance')
    expect(lines[4]).toBe('35 Feb 20262,069.60——53,809.602,069.60Overdue 19 days')
    // 5,409.60 due = 2,600.00 paid + 740.00 rolled in + 2,069.60 overdue.
    expect(table.querySelector('tfoot')!.textContent).toBe('Total5,409.602,600.00740.002,069.60Due = Paid + To balance + Overdue')
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
    // 2026-10-10 — the handoff: the letterhead and the title in Georgia, a
    // peach Total row, and a line to sign for Finance and for the Principal.
    expect(sheet.querySelector('.sched-print-house')).toHaveClass('fund-print-serif')
    expect(sheet.querySelector('.sched-print-title')).toHaveClass('fund-print-serif')
    expect(sheet.querySelector('tfoot tr')).toHaveClass('fund-print-total')
    const sign = sheet.querySelector('.fund-print-sign') as HTMLElement
    expect(Array.from(sign.children).map((c) => c.textContent)).toEqual(['Prepared by · Finance', 'Approved by · Principal'])
    expect(sheet.querySelector('table')!.compareDocumentPosition(sign) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

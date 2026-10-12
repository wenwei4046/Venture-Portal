import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Debtor Aging, Loan Aging and the Company Statement per the
// user's Claude Design handoff (Phase 4 of the Finance revamp): the date in
// the eyebrow, Excel / PDF in the head, cards, and the aging tables closing
// on a navy "All" row. A department manager's Debtor Aging stays as it was.
// 2026-10-10 — the rest of the handoff: the section "Debtor aging · AS AT …",
// Find company on a control row ("· highlights only"), bare figures on white
// rows, the cards' notes (Follow up, the oldest company); Loan Aging's four
// cards and its days-late wording; the Company Statement's counterparties
// under their own head, no tiles repeating the cards, a navy-tinted total.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), fetchLoanMonitorData: vi.fn(), fetchCounterpartyStatement: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const rows: Record<string, unknown[]> = {
        invoices: [
          { id: 'i1', invoice_no: 'HV-INV-1', invoice_date: '2026-10-02', due_date: '2026-10-31', total_amount: 64000, description: null, company_id: 'c1', billable_to_department_id: null, billable_to_freetext_name: null },
          { id: 'i2', invoice_no: 'HV-INV-2', invoice_date: '2026-08-02', due_date: '2026-08-31', total_amount: 6000, description: null, company_id: 'c2', billable_to_department_id: null, billable_to_freetext_name: null },
        ],
        companies: [{ id: 'c1', name: 'HOUZS Century' }, { id: 'c2', name: 'HOUZS Design' }],
        departments: [],
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in']) q[m] = () => q
      q.range = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(res)
      return q
    },
  }),
}))
vi.mock('@/lib/debtor-aging-data', () => ({ fetchPaidByInvoice: async () => new Map() }))
vi.mock('@/lib/loan-monitor', () => ({ fetchLoanMonitorData: mocks.fetchLoanMonitorData }))
vi.mock('@/lib/counterparty-statement-data', () => ({ fetchCounterpartyStatement: mocks.fetchCounterpartyStatement }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))

import DebtorAgingPage from './page'
import LoanAgingPage from '../loan-aging/page'
import CompanyStatementPage from '../company-statement/page'

const card = (name: string) => screen.getByRole('group', { name })
const buckets = (current: number, m1: number, m2: number, m3: number) => ({ current, m1, m2, m3, total: current + m1 + m2 + m3 })
// Days late (2026-10-09): not due yet, 1–30, 31–90, over 90.
const days = (notDue: number, d30: number, d90: number, d90plus: number) => ({ notDue, d30, d90, d90plus, total: notDue + d30 + d90 + d90plus })
const side = (due: number[], grand: number) => ({
  due: [{ key: 'd1', counterparty: 'HOUZS Kitchen', detail: '', buckets: buckets(due[0], due[1], due[2], due[3]), days: days(due[0], due[1], due[2], due[3]) }],
  dueTotal: buckets(due[0], due[1], due[2], due[3]),
  dueDaysTotal: days(due[0], due[1], due[2], due[3]),
  scheduled: [], scheduledTotal: grand, noTerm: [], noTermTotal: 0, grandTotal: grand,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] }))
  mocks.fetchLoanMonitorData.mockResolvedValue({ currentYM: '2026-10', collect: side([4000, 2000, 0, 0], 250000), repay: side([1000, 0, 0, 0], 120000) })
  mocks.fetchCounterpartyStatement.mockResolvedValue({
    rows: [],
    totals: { collectPrincipal: 300000, collectInterest: 12000, repayPrincipal: 200000, repayInterest: 8000, net: 104000 },
  })
})

describe('Debtor Aging on the sheet', () => {
  it('shows the receivable in cards and closes on a navy All row', async () => {
    render(await DebtorAgingPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · DEBTOR AGING · AS AT 9 OCT 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/debtor-aging/export?format=xlsx&view=detail')
    expect(card('Total receivable')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total receivable')).toHaveTextContent('RM 70,000.00')
    expect(card('Total receivable')).toHaveTextContent('2 companies')
    // Days since the invoice (the July rule: invoice date, not due date).
    expect(card('0–30 days')).toHaveTextContent('RM 64,000.00')
    expect(card('31–60 days')).toHaveTextContent('RM 0.00')
    expect(card('Over 60 days')).toHaveAttribute('data-tone', 'danger')
    expect(card('Over 60 days')).toHaveTextContent('RM 6,000.00')
    const heads = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(heads).toEqual(['Customer', '0–30 days', '31–60 days', '61–90 days', '90+ days', 'Total'])
    const all = document.querySelector('tr.rpt-all') as HTMLElement
    expect(all).toHaveTextContent('All companies')
    expect(all).toHaveTextContent('70,000.00')
  })

  it('heads the table "Debtor aging" as at the day, with bare figures on white rows', async () => {
    render(await DebtorAgingPage({ searchParams: Promise.resolve({}) }))
    const section = screen.getByRole('heading', { level: 2, name: 'Debtor aging' }).closest('section') as HTMLElement
    expect(section.querySelector('.sect-head .count')).toHaveTextContent('AS AT 9 OCT 2026')
    const century = within(section).getByText('HOUZS Century').closest('tr') as HTMLElement
    expect(century).toHaveTextContent('64,000.00')
    expect(century).not.toHaveTextContent('RM')
    expect(century).not.toHaveClass('bg-surface-2')
  })

  // 2026-10-10 — As at a month (the handoff), by the user's rule: the
  // invoices dated by then, at what is unpaid on them today, aged to that day.
  it('reads as at a past month: the invoices dated by then, aged to its last day', async () => {
    render(await DebtorAgingPage({ searchParams: Promise.resolve({ as_at: '2026-09' }) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · DEBTOR AGING · AS AT 30 SEP 2026')
    // HV-INV-1 is dated 2 Oct: not yet issued on 30 Sep.
    expect(card('Total receivable')).toHaveTextContent('RM 6,000.00')
    // HV-INV-2, 2 Aug → 30 Sep: 59 days.
    expect(card('31–60 days')).toHaveTextContent('RM 6,000.00')
    const controls = screen.getByRole('group', { name: 'Report controls' })
    expect(within(controls).getByRole('combobox', { name: 'As at' })).toHaveValue('2026-09')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/debtor-aging/export?format=xlsx&view=detail&as_at=2026-09')
    // What "unpaid" means here is TODAY's — said by a chip, the sentence went 2026-10-12.
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('Unpaid as of today')
    expect(screen.queryByText(/dated on or before/)).toBeNull()
  })

  it('reads as at today unless a past month is picked', async () => {
    render(await DebtorAgingPage({ searchParams: Promise.resolve({}) }))
    const controls = screen.getByRole('group', { name: 'Report controls' })
    expect(within(controls).getByRole('combobox', { name: 'As at' })).toHaveValue('2026-10')
    expect(screen.queryByText('Unpaid as of today')).toBeNull()
  })

  it('notes what to follow up and the company owing longest', async () => {
    render(await DebtorAgingPage({ searchParams: Promise.resolve({}) }))
    expect(card('31–60 days')).toHaveTextContent('Follow up')
    expect(card('Over 60 days')).toHaveTextContent('HOUZS Design')
  })

  it('finds a company by name, nothing hidden', async () => {
    render(await DebtorAgingPage({ searchParams: Promise.resolve({}) }))
    const controls = screen.getByRole('group', { name: 'Report controls' })
    fireEvent.change(within(controls).getByRole('searchbox', { name: 'Find company' }), { target: { value: 'design' } })
    expect(screen.getByText('1 match')).toBeInTheDocument()
    // The table's rows (the Over 60 card names the company too).
    const table = screen.getByRole('heading', { level: 2, name: 'Debtor aging' }).closest('section') as HTMLElement
    expect(within(table).getByText('HOUZS Design').closest('tr')).toHaveClass('search-row-hit')
    expect(within(table).getByText('HOUZS Century').closest('tr')).not.toHaveClass('search-row-hit')
  })

  it('stays as it was for a department manager', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'm', role: 'dept_manager', permissions: ['dept_reports'] }))
    render(await DebtorAgingPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · DEBTOR AGING')
    expect(document.querySelector('tr.rpt-all')).toBeNull()
  })
})

describe('Loan Aging on the sheet', () => {
  it('shows both sides in cards and closes each aging on a navy All row', async () => {
    render(await LoanAgingPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · LOAN AGING · AS AT 9 OCT 2026')
    // The handoff's four cards (2026-10-10).
    expect(card('Loans outstanding')).toHaveAttribute('data-tone', 'primary')
    expect(card('Loans outstanding')).toHaveTextContent('RM 250,000.00')
    expect(card('Not due')).toHaveTextContent('RM 4,000.00')
    expect(card('Not due')).toHaveTextContent('On schedule')
    expect(card('1–30 days')).toHaveAttribute('data-tone', 'danger')
    expect(card('1–30 days')).toHaveTextContent('RM 2,000.00')
    expect(card('1–30 days')).toHaveTextContent('HOUZS Kitchen')
    expect(card('31–90 days')).toHaveTextContent('RM 0.00')
    expect(screen.queryByRole('group', { name: 'To repay · outstanding' })).toBeNull()
    // 2026-10-12 — no subtitle explaining the page (the user: too messy).
    expect(document.querySelector('.page-sub')).toBeNull()
    const collect = screen.getByRole('heading', { level: 2, name: 'To Collect · aging — Fund OUT' }).closest('section') as HTMLElement
    expect(Array.from(collect.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Counterparty', 'Not due', '1–30 days', '31–90 days', '90+ days', 'Total due'])
    const alls = Array.from(document.querySelectorAll('tr.rpt-all')).map((r) => r.textContent)
    expect(alls[0]).toContain('All borrowers')
    expect(alls[1]).toContain('All lenders')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/loan-aging/export?format=xlsx&view=aging')
  })

  // 2026-10-10 — As at a month (the handoff; the user: 要做): every repayment
  // is dated, so the past is read exactly (lib/loan-monitor).
  it('reads as at a past month', async () => {
    render(await LoanAgingPage({ searchParams: Promise.resolve({ as_at: '2026-09' }) }))
    expect(mocks.fetchLoanMonitorData).toHaveBeenCalledWith(expect.anything(), { asOf: '2026-09-30' })
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · LOAN AGING · AS AT 30 SEP 2026')
    const controls = screen.getByRole('group', { name: 'Report controls' })
    expect(within(controls).getByRole('combobox', { name: 'As at' })).toHaveValue('2026-09')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/loan-aging/export?format=xlsx&view=aging&as_at=2026-09')
  })

  it('reads today unless a past month is picked', async () => {
    render(await LoanAgingPage({ searchParams: Promise.resolve({}) }))
    expect(mocks.fetchLoanMonitorData).toHaveBeenCalledWith(expect.anything(), { asOf: '2026-10-09' })
    expect(within(screen.getByRole('group', { name: 'Report controls' })).getByRole('combobox', { name: 'As at' })).toHaveValue('2026-10')
  })

  it('finds a company on its control row, nothing hidden', async () => {
    render(await LoanAgingPage({ searchParams: Promise.resolve({}) }))
    const controls = screen.getByRole('group', { name: 'Report controls' })
    fireEvent.change(within(controls).getByRole('searchbox', { name: 'Find company' }), { target: { value: 'kitchen' } })
    // The tables' rows (the 1–30 card names the borrower too).
    const rows = screen.getAllByText('HOUZS Kitchen').map((el) => el.closest('tr')).filter((r): r is HTMLTableRowElement => !!r)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r).toHaveClass('search-row-hit')
  })
})

describe('the Company Statement on the sheet', () => {
  it('shows what is to collect, to repay and the net', async () => {
    render(await CompanyStatementPage())
    expect(card('To collect')).toHaveTextContent('RM 312,000.00')
    expect(card('To collect')).toHaveTextContent('Principal 300,000.00 · Interest 12,000.00')
    expect(card('To repay')).toHaveTextContent('RM 208,000.00')
    expect(card('Net')).toHaveAttribute('data-tone', 'primary')
    expect(card('Net')).toHaveTextContent('Collect RM 104,000.00')
    expect(within(document.querySelector('.page-head') as HTMLElement).getByRole('link', { name: 'Export Excel' })).toHaveAttribute('href', '/reports/company-statement/export?format=xlsx')
  })

  it('lists the counterparties under their own head, without tiles repeating the cards', async () => {
    render(await CompanyStatementPage())
    const section = screen.getByRole('heading', { level: 2, name: 'Counterparties' }).closest('section') as HTMLElement
    expect(section.querySelector('.sect-head .count')).toHaveTextContent('0 SHOWN')
    expect(document.querySelectorAll('.statement-amount')).toHaveLength(0)
  })

  it('tints To collect and To repay over their columns and closes on a navy-tinted total', async () => {
    mocks.fetchCounterpartyStatement.mockResolvedValue({
      rows: [{ counterparty: 'HOUZS Century', collectPrincipal: 300000, collectInterest: 12000, repayPrincipal: 200000, repayInterest: 8000, net: 104000, items: [] }],
      totals: { collectPrincipal: 300000, collectInterest: 12000, repayPrincipal: 200000, repayInterest: 8000, net: 104000 },
    })
    render(await CompanyStatementPage())
    const section = screen.getByRole('heading', { level: 2, name: 'Counterparties' }).closest('section') as HTMLElement
    expect(section.querySelector('.sect-head .count')).toHaveTextContent('1 SHOWN')
    expect(section.querySelector('th.cs-collect')).toHaveTextContent('To collect')
    expect(section.querySelector('th.cs-repay')).toHaveTextContent('To repay')
    expect(section.querySelector('tr.cs-total')).toHaveTextContent('Total')
    expect(within(section).getByText('HOUZS Century')).not.toHaveClass('font-serif')
  })

  // 2026-10-10 — the user took the handoff's red for what is to repay (it was
  // the August orange).
  it('boxes what is to repay in red when a counterparty opens', async () => {
    const pos = { side: 'repay', counterparty: 'HOUZS Mattress', kind: 'flat', principal: 600000, monthlyRate: 0.01, tenureMonths: 12, principalPaid: 0, principalOutstanding: 600000, interestOutstanding: 14400, monthlyInterest: 6000, remainingPeriods: 12, finishYM: '2027-09', startYM: '2026-10', minPayInterest: false }
    mocks.fetchCounterpartyStatement.mockResolvedValue({
      rows: [{ counterparty: 'HOUZS Mattress', collectPrincipal: 0, collectInterest: 0, repayPrincipal: 600000, repayInterest: 14400, net: -614400, items: [{ id: 'fs1', ...pos }] }],
      totals: { collectPrincipal: 0, collectInterest: 0, repayPrincipal: 600000, repayInterest: 14400, net: -614400 },
    })
    render(await CompanyStatementPage())
    fireEvent.click(screen.getByText('HOUZS Mattress'))
    const tag = screen.getByText(/TO REPAY · 1/)
    expect(tag).toHaveClass('text-danger')
    expect(tag.parentElement).toHaveClass('border-danger/30')
  })
})

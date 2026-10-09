import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — a fund source's page per the user's Claude Design handoff
// (Phase 3 of the Finance revamp): the lender as the title with its status
// chip, Print schedule and Amend terms at the head, cards (principal,
// outstanding, rate, monthly payment, first installment), the terms in
// groups, then — in this order — Repayment settings, Notes, Terms over time,
// the Repayment schedule (the payments folded under it), Record repayment
// and the Actions.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
vi.mock('@/lib/dept-registry', async (orig) => ({ ...(await orig<object>()), fetchDeptRegistry: async () => [] }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('../actions', () => ({ cancelFundSource: vi.fn(), setFundSourceRepaymentStart: vi.fn(), setFundSourceMinPayInterest: vi.fn(), setFundSourceNotes: vi.fn() }))
vi.mock('./_components/RecordRepaymentForm', () => ({ default: (p: { outstanding: number }) => <p data-testid="record">record against {p.outstanding}</p> }))
vi.mock('./_components/WithdrawButton', () => ({ default: () => <button type="button">Withdraw</button> }))

import FundSourcePage from './page'

// HOUZS Century's deposit: 30,000 over 3 months at 1%, two installments in.
const SOURCE = {
  id: 'fs-1', source_type: 'subsidiary', status: 'active', amount: 30000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false,
  effective_date: '2026-07-15', repayment_start_month: null, terms_effective_from: null, repayment_date: '2026-08-15', maturity_date: '2026-10-15',
  from_company_id: 'co-hc', from_department_id: null, from_freetext_name: null, from_director_id: null, bank_account_id: 'b1', account_code: '4010',
  notes: 'lent to: 2990', min_pay_interest: false, created_at: '2026-07-15T02:00:00Z', repaid_at: null as string | null, repaid_by: null as string | null,
}
const REPAYMENTS = [
  { id: 'r1', payment_date: '2026-08-15', payment_type: 'principal', amount: 10000, notes: null, payment_voucher_id: 'v1' },
  { id: 'r2', payment_date: '2026-08-15', payment_type: 'interest', amount: 300, notes: null, payment_voucher_id: 'v1' },
  { id: 'r3', payment_date: '2026-09-15', payment_type: 'principal', amount: 10000, notes: null, payment_voucher_id: 'v2' },
  { id: 'r4', payment_date: '2026-09-15', payment_type: 'interest', amount: 300, notes: 'September', payment_voucher_id: 'v2' },
]

function database(source = SOURCE, repayments = REPAYMENTS) {
  const lists: Record<string, unknown[]> = {
    fund_source_repayments: repayments,
    payment_vouchers: [{ id: 'v1', voucher_no: 'HV-PV-202608-0011' }, { id: 'v2', voucher_no: 'HV-PV-202609-0022' }],
    bank_accounts: [{ id: 'b1', bank_name: 'Hong Leong Bank', account_number: '1234567890', current_balance: 50000 }],
    chart_of_accounts: [{ code: '4010' }],
  }
  const singles: Record<string, unknown> = {
    fund_sources: source,
    fund_source_outstanding: { outstanding: 10000, total_principal_paid: 20000, total_interest_paid: 600, total_interest_due: 900, monthly_payment: 10300 },
    companies: { name: 'HOUZS Century', short_code: 'HC' },
    bank_accounts: { bank_name: 'Hong Leong Bank', account_number: '1234567890' },
    chart_of_accounts: { code: '4010', name: 'Fund Sources Payable — HC' },
    approval_requests: null,
    users: { name: 'Finance Manager', email: 'fm@example.com' },
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: lists[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in']) q[m] = () => q
      q.single = async () => ({ data: singles[table] ?? null, error: singles[table] ? null : { message: 'none' } })
      q.maybeSingle = async () => ({ data: singles[table] ?? null, error: null })
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
  })
}

const page = (print?: string) => FundSourcePage({ params: Promise.resolve({ id: 'fs-1' }), searchParams: Promise.resolve({ print }) })
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', name: 'Finance Manager', permissions: ['treasury', 'override'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  database()
})

describe('a fund source’s page', () => {
  it('heads with the lender, its status, Print schedule and Amend terms; five cards; the terms in groups', async () => {
    render(await page())
    expect(screen.getByRole('link', { name: '← Back to Fund IN' })).toHaveAttribute('href', '/fund-in')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · SUBSIDIARY')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HOUZS Century')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('active')
    expect(document.querySelector('.page-head .chip')).toHaveClass('ledger')
    expect(document.querySelector('.page-head p')).toHaveTextContent('HC · Recorded 15 July 2026')
    expect(screen.getByRole('button', { name: 'Print schedule' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Amend terms' })).toHaveAttribute('href', '/fund-in/fs-1/edit')

    expect(card('Principal')).toHaveAttribute('data-tone', 'primary')
    expect(card('Principal')).toHaveTextContent('RM 30,000.00')
    expect(card('Principal')).toHaveTextContent('Effective 15 Jul 2026')
    expect(card('Outstanding')).toHaveTextContent('RM 10,000.00')
    expect(card('Outstanding')).toHaveTextContent('Repaid RM 20,000.00 of RM 30,000.00')
    expect(card('Interest rate')).toHaveTextContent('1.000% /mo')
    expect(card('Interest rate')).toHaveTextContent('Monthly RM 300.00 · total RM 900.00')
    expect(card('Monthly payment')).toHaveTextContent('RM 10,300.00')
    expect(card('Monthly payment')).toHaveTextContent('3M · matures 15 Oct 2026 · 6d remaining')
    expect(card('Monthly payment')).toHaveAttribute('data-tone', 'alert')
    expect(card('Expected repayment (first installment)')).toHaveTextContent('15 Aug 2026')

    const details = screen.getByRole('region', { name: 'Details' })
    for (const text of ['Subsidiary', 'HOUZS Century (HC)', '1.000% /mo · simple', '3 months', '15 Jul 2026', 'Hong Leong Bank — 1234567890', '4010 — Fund Sources Payable — HC']) {
      expect(within(details).getAllByText(text).length, text).toBeGreaterThan(0)
    }
  })

  it('lays the sections out in the handoff’s order, the schedule replacing the history', async () => {
    render(await page())
    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual([
      'Details', 'Repayment settings', 'Notes', 'Repayment schedule', 'Record repayment', 'Actions',
    ])
    const schedule = screen.getByRole('heading', { name: 'Repayment schedule' }).closest('section') as HTMLElement
    expect(schedule.querySelector('.count')).toHaveTextContent('PAID 2 OF 3 · OUTSTANDING RM 10,300.00')
    const rows = schedule.querySelectorAll('table.sched-table tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Paid 15 Aug 2026 · HV-PV-202608-0011')
    expect(rows[2]).toHaveTextContent('15 Oct 2026')
    const fold = within(schedule).getByText('Repayments recorded · 4').closest('details') as HTMLElement
    expect(fold).toHaveTextContent('September')
    expect(screen.getByTestId('record')).toHaveTextContent('record against 10000')
    expect(screen.getByRole('button', { name: 'Request cancellation' })).toBeInTheDocument()
  })

  it('opens the print sheet straight away for the list’s Print schedule', async () => {
    render(await page('1'))
    const sheet = screen.getByRole('dialog', { name: 'Repayment Schedule · HOUZS Century' })
    expect(sheet).toHaveTextContent('FUND IN · SUBSIDIARY')
    expect(sheet).toHaveTextContent('Printed 9 Oct 2026 · Finance Manager')
  })

  it('says when it was fully repaid, and offers a pending one Edit and Withdraw', async () => {
    database({ ...SOURCE, status: 'repaid', repaid_at: '2026-10-01T02:00:00Z', repaid_by: 'u1' })
    const { unmount } = render(await page())
    expect(document.querySelector('.page-head .chip')).toHaveClass('info')
    expect(screen.getByRole('region', { name: 'Fully repaid' })).toHaveTextContent('Repaid on 1 Oct 2026 by Finance Manager.')
    unmount()
    database({ ...SOURCE, status: 'pending_approval' }, [])
    render(await page())
    expect(screen.getByRole('link', { name: 'Edit fund source' })).toHaveAttribute('href', '/fund-in/fs-1/edit')
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
  })
})

describe('where a fund source page returns to (2026-10-09, the handoff)', () => {
  it('goes back to the Overview it was opened from', async () => {
    render(await FundSourcePage({ params: Promise.resolve({ id: 'fs-1' }), searchParams: Promise.resolve({ from: 'overview' }) }))
    expect(screen.getByRole('link', { name: '← Back to Overview' })).toHaveAttribute('href', '/dashboard')
  })
  it('goes back to the calendar, on its month', async () => {
    render(await FundSourcePage({ params: Promise.resolve({ id: 'fs-1' }), searchParams: Promise.resolve({ from: 'calendar', month: '2026-11' }) }))
    expect(screen.getByRole('link', { name: '← Back to Calendar' })).toHaveAttribute('href', '/repayment-schedule?month=2026-11')
  })
})

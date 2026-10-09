import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — a loan's page per the user's Claude Design handoff (Phase 3 of
// the Finance revamp): the borrower as the title with its status chip, Print
// schedule and Amend terms at the head, cards (outstanding, effective rate,
// monthly interest, tenure), the terms, dates and approval trail in groups,
// then Repayment settings, Terms over time, the Repayment schedule (the
// payments folded under it, each still reversible), Record repayment and the
// Actions.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('../actions', () => ({ cancelLoan: vi.fn(), setLoanRepaymentStart: vi.fn(), setLoanMinPayInterest: vi.fn(), setLoanFundingSource: vi.fn() }))
vi.mock('../_components/RepaymentForm', () => ({ default: (p: { outstanding: number }) => <p data-testid="record">record against {p.outstanding}</p> }))
vi.mock('./_components/VoidRepaymentButton', () => ({ default: (p: { label: string }) => <button type="button">Reverse {p.label}</button> }))

import LoanPage from './page'

// 60,000 to Carres over 6 months at 4%, from May: five installments in.
const LOAN = {
  id: 'loan-4', company_id: 'co-car', status: 'active', principal: 60000, base_rate: 0.00583, risk_premium: 0.03417, effective_rate: 0.04,
  tenure_months: 6, compound_interest: false, disbursement_date: '2025-09-02' as string | null, repayment_start_month: '2026-05-01', terms_effective_from: null,
  repayment_terms: 'EMI 分期 · 月息4% · 6期 · 资金来源: HC-58k', min_pay_interest: false, created_by: 'u1', approved_by: 'u2' as string | null,
  approved_at: '2025-09-02T03:00:00Z' as string | null, created_at: '2025-09-01T02:00:00Z',
}
const months = ['05', '06', '07', '08', '09']
const REPAYMENTS = months.flatMap((m, i) => [
  { id: `p${i}`, payment_date: `2026-${m}-02`, payment_type: 'principal', amount: 10000, notes: `Auto-synced from voucher HV-OR-2026${m}-00${i}` },
  { id: `i${i}`, payment_date: `2026-${m}-02`, payment_type: 'interest', amount: 2400, notes: `Auto-synced from voucher HV-OR-2026${m}-00${i}` },
])

function database(loan = LOAN, repayments = REPAYMENTS, overdue = false) {
  const lists: Record<string, unknown[]> = { repayments, overdue_records: overdue ? [{ id: 'o1' }] : [] }
  const singles: Record<string, unknown> = {
    loans: loan,
    companies: { name: 'Carres', short_code: 'CAR' },
    loan_outstanding: { outstanding: 10000, total_principal_paid: 50000, total_interest_paid: 12000, total_penalty_paid: 0 },
    users: { name: 'Finance Manager' },
    approval_requests: null,
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: lists[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in', 'limit']) q[m] = () => q
      q.single = async () => ({ data: singles[table] ?? null, error: singles[table] ? null : { message: 'none' } })
      q.maybeSingle = async () => ({ data: singles[table] ?? null, error: null })
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
  })
}

const page = (print?: string) => LoanPage({ params: Promise.resolve({ id: 'loan-4' }), searchParams: Promise.resolve({ print }) })
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', name: 'Finance Manager', permissions: ['treasury', 'override'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  database()
})

describe('a loan’s page', () => {
  it('heads with the borrower, its status, Print schedule and Amend terms; four cards; the terms in groups', async () => {
    render(await page())
    expect(screen.getByRole('link', { name: '← Back to Fund OUT' })).toHaveAttribute('href', '/fund-out')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · LOAN OUT')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carres')
    expect(document.querySelector('.page-head .chip')).toHaveClass('ledger')
    expect(document.querySelector('.page-head p')).toHaveTextContent('CAR · Created 1 September 2025')
    expect(screen.getByRole('button', { name: 'Print schedule' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Amend terms' })).toHaveAttribute('href', '/fund-out/loan-4/edit')

    expect(card('Outstanding')).toHaveAttribute('data-tone', 'primary')
    expect(card('Outstanding')).toHaveTextContent('RM 10,000.00')
    expect(card('Outstanding')).toHaveTextContent('Repaid RM 50,000.00 of RM 60,000.00')
    expect(card('Effective rate')).toHaveTextContent('4.000% /mo')
    expect(card('Effective rate')).toHaveTextContent('0.583% base + 3.417% custom')
    expect(card('Monthly interest')).toHaveTextContent('RM 2,400.00')
    expect(card('Monthly interest')).toHaveTextContent('On original principal · installment RM 12,400.00')
    expect(card('Tenure')).toHaveTextContent('6 months')

    const details = screen.getByRole('region', { name: 'Details' })
    for (const text of ['Carres (CAR)', '4.000% /mo', '0.583% + 3.417%', '6 months', '2 Sep 2025', 'Finance Manager · 1 Sep 2025 10:00', 'EMI 分期 · 月息4% · 6期 · 资金来源: HC-58k']) {
      expect(within(details).getAllByText(text).length, text).toBeGreaterThan(0)
    }
  })

  it('lays the sections out in the handoff’s order; the schedule shows the sixth installment due', async () => {
    render(await page())
    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual([
      'Details', 'Repayment settings', 'Repayment schedule', 'Record repayment', 'Actions',
    ])
    const schedule = screen.getByRole('heading', { name: 'Repayment schedule' }).closest('section') as HTMLElement
    expect(schedule.querySelector('.count')).toHaveTextContent('PAID 5 OF 6 · OUTSTANDING RM 12,400.00')
    const rows = schedule.querySelectorAll('table.sched-table tbody tr')
    expect(rows[0]).toHaveTextContent('Paid 2 May 2026 · HV-OR-202605-000')
    expect(rows[5]).toHaveTextContent('Overdue 7 days')
    const fold = within(schedule).getByText('Repayments recorded · 10').closest('details') as HTMLElement
    expect(within(fold).getAllByRole('button', { name: /^Reverse/ })).toHaveLength(10)
    expect(screen.getByTestId('record')).toHaveTextContent('record against 10000')
    expect(screen.getByText(/^Cannot cancel — 10 repayments recorded/)).toBeInTheDocument()
    expect(screen.getByLabelText('Funding source')).toHaveValue('HC-58k')
  })

  it('reads an overdue loan red, and opens the print sheet when asked', async () => {
    database(LOAN, REPAYMENTS, true)
    render(await page('1'))
    expect(document.querySelector('.page-head .chip')).toHaveClass('danger')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('overdue')
    expect(card('Monthly interest')).toHaveAttribute('data-tone', 'danger')
    const sheet = screen.getByRole('dialog', { name: 'Repayment Schedule · Carres' })
    expect(sheet).toHaveTextContent('FUND OUT · LOAN')
    expect(sheet).toHaveTextContent('Borrower')
  })

  it('lets an untouched active loan ask for cancellation with a reason, and a pending one be cancelled', async () => {
    database(LOAN, [])
    const { unmount } = render(await page())
    expect(screen.getByLabelText('Reason for cancellation')).toBeRequired()
    expect(screen.getByRole('button', { name: 'Request cancellation (needs Principal)' })).toBeInTheDocument()
    unmount()
    database({ ...LOAN, status: 'pending_approval', approved_by: null, approved_at: null, disbursement_date: null }, [])
    render(await page())
    expect(card('Principal')).toHaveAttribute('data-tone', 'primary')
    expect(card('Tenure')).toHaveTextContent('Maturity set once disbursed')
    expect(screen.getByRole('button', { name: 'Cancel this loan' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Details' })).getByText('Awaiting Principal approval')).toBeInTheDocument()
  })
})

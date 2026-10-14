import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// A loan's full page (2026-10-15, the Finance revamp v2 — D06, the drawer's
// *View full page ↗*): *← Fund OUT* and the crumb; *Fund out · Loan out*, the
// borrower with its status (an instalment past its day unpaid reads it
// overdue), four facts, Print (its schedule); the numbered cards — Transfer
// to, the Repayment schedule (the payments folded under it, each still
// reversible), Repayment settings, Record repayment, the Trail, the Audit log
// — beside the dark panel: the amount, when and where, the booking, the steps.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), push: vi.fn(), refresh: vi.fn(), flash: vi.fn(), cancelPending: vi.fn(), requestCancel: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('../actions', () => ({
  cancelLoan: vi.fn(),
  cancelPendingLoan: mocks.cancelPending,
  requestLoanCancel: mocks.requestCancel,
  setLoanRepaymentStart: vi.fn(),
  setLoanMinPayInterest: vi.fn(),
  setLoanFundingSource: vi.fn(),
}))
vi.mock('../_components/RepaymentForm', () => ({ default: (p: { outstanding: number }) => <p data-testid="record">record against {p.outstanding}</p> }))
vi.mock('./_components/VoidRepaymentButton', () => ({ default: (p: { label: string }) => <button type="button">Reverse {p.label}</button> }))

import LoanPage from './page'
import { setLoanRepaymentStart } from '../actions'

// 60,000 to Carres over 6 months at 4%, from May: five installments in.
const LOAN = {
  id: 'loan-4', company_id: 'co-car', status: 'active', principal: 60000, base_rate: 0.00583, risk_premium: 0.03417, effective_rate: 0.04,
  tenure_months: 6, compound_interest: false, disbursement_date: '2025-09-02' as string | null, repayment_start_month: '2026-05-01',
  repayment_start_date: null as string | null, terms_effective_from: null,
  repayment_terms: 'EMI 分期 · 月息4% · 6期 · 资金来源: HC-58k', min_pay_interest: false, created_by: 'u1', approved_by: 'u2' as string | null,
  approved_at: '2025-09-02T03:00:00Z' as string | null, created_at: '2025-09-01T02:00:00Z',
}
const months = ['05', '06', '07', '08', '09']
const REPAYMENTS = months.flatMap((m, i) => [
  { id: `p${i}`, payment_date: `2026-${m}-02`, payment_type: 'principal', amount: 10000, notes: `Auto-synced from voucher HV-OR-2026${m}-00${i}` },
  { id: `i${i}`, payment_date: `2026-${m}-02`, payment_type: 'interest', amount: 2400, notes: `Auto-synced from voucher HV-OR-2026${m}-00${i}` },
])
const change = (id: number, at: string, table: string, op: string, new_row: object, changed: string[] | null, old_row: object | null = null) => ({
  id, occurred_at: at, actor_id: 'u2', actor_name: 'Principal', table_name: table, op, old_row, new_row, changed,
})
const AUDIT: Record<string, unknown[]> = {
  'loans:loan-4': [
    change(1, '2025-09-01T02:00:00Z', 'loans', 'INSERT', { principal: 60000 }, null),
    change(2, '2025-09-02T03:00:00Z', 'loans', 'UPDATE', { status: 'active' }, ['status', 'approved_by', 'approved_at'], { status: 'pending_approval' }),
  ],
  'repayments:p0': [change(3, '2026-05-02T04:00:00Z', 'repayments', 'INSERT', { payment_type: 'principal', amount: 10000, payment_date: '2026-05-02' }, null)],
}

function database(loan = LOAN, repayments = REPAYMENTS) {
  const lists: Record<string, unknown[]> = { repayments }
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
    rpc: async (_name: string, args: { p_tables: string[]; p_row: string }) => ({ data: AUDIT[`${args.p_tables[0]}:${args.p_row}`] ?? [], error: null }),
  })
}

const page = (print?: string) => LoanPage({ params: Promise.resolve({ id: 'loan-4' }), searchParams: Promise.resolve({ print }) })
const cardTitles = () => Array.from(document.querySelectorAll('section[aria-label]')).map((c) => c.getAttribute('aria-label'))
const cardOf = (title: string) => screen.getByRole('region', { name: title })
const panel = () => document.querySelector('aside') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', name: 'Finance Manager', permissions: ['treasury', 'override'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  database()
})

describe('a loan’s full page', () => {
  it('heads as D06 does: the way back, the crumb, the borrower with its status, four facts, Print', async () => {
    render(await page())
    expect(screen.getByRole('link', { name: '← Fund OUT' })).toHaveAttribute('href', '/fund-out')
    expect(screen.getByText('Fund · Fund OUT · Carres')).toBeInTheDocument()
    expect(screen.getByText('Fund out · Loan out')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carres')
    // The sixth instalment is 7 days past its day: overdue, as its schedule says.
    const pill = screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement
    expect(pill).toHaveAttribute('data-tone', 'danger')
    expect(pill).toHaveTextContent('overdue')
    for (const fact of ['RM 60,000.00', 'Carres (CAR)', '02 Sep 2025', 'Finance Manager · 01 Sep 2025 · 10:00']) expect(screen.getAllByText(fact).length, fact).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
  })

  it('lays its cards out in order; the schedule shows the sixth installment due, the payments folded under it', async () => {
    render(await page())
    expect(cardTitles()).toEqual(['Transfer to', 'Repayment schedule', 'Repayment settings', 'Record repayment', 'Trail', 'Audit log'])
    const transfer = cardOf('Transfer to')
    for (const text of ['Loan out', '6 months', 'matures 02 Mar 2026', 'SC HC-58k', 'EMI 分期 · 月息4% · 6期 · 资金来源: HC-58k']) expect(within(transfer).getByText(text), text).toBeInTheDocument()
    const schedule = cardOf('Repayment schedule')
    expect(schedule).toHaveTextContent('PAID 5 OF 6 · OUTSTANDING RM 12,400.00')
    const rows = schedule.querySelectorAll('table.sched-table tbody tr')
    expect(rows[0]).toHaveTextContent('Paid 2 May 2026 · HV-OR-202605-000')
    expect(rows[5]).toHaveTextContent('Overdue 7 days')
    const fold = within(schedule).getByText('Repayments recorded · 10').closest('details') as HTMLElement
    expect(within(fold).getAllByRole('button', { name: /^Reverse/ })).toHaveLength(10)
    expect(screen.getByTestId('record')).toHaveTextContent('record against 10000')
    expect(screen.getByLabelText('Funding source')).toHaveValue('HC-58k')
  })

  it('draws the trail and the audit log from what was recorded', async () => {
    render(await page())
    const trail = cardOf('Trail')
    expect(trail).toHaveTextContent('2 / 2 steps')
    expect(within(trail).getByText('Created')).toBeInTheDocument()
    expect(within(trail).getByText('Disbursed')).toBeInTheDocument()
    const audit = cardOf('Audit log')
    expect(audit).toHaveTextContent('3 EVENTS')
    expect(within(audit).getByText('Repayment recorded · Principal RM 10,000.00 · 02 May 2026')).toBeInTheDocument()
    expect(within(audit).getByText('Approved — disbursed')).toBeInTheDocument()
    expect(within(audit).getByText('Created · RM 60,000.00')).toBeInTheDocument()
  })

  it('sums it up in the dark panel: the amount, when and where, the booking — Amend terms, a cancellation shut while repayments stand', async () => {
    render(await page())
    const p = panel()
    expect(p).toHaveTextContent('−RM 60,000.00')
    expect(p).toHaveTextContent('To Carres (CAR)')
    for (const text of ['4.000% /mo', '0.583% base + 3.417%', 'RM 2,400.00', 'RM 10,000.00', 'RM 50,000.00 repaid', 'since 02 Oct 2026 · 7 days']) expect(within(p).getByText(text), text).toBeInTheDocument()
    expect(within(p).getByRole('link', { name: 'Amend terms' })).toHaveAttribute('href', '/fund-out/loan-4/edit')
    const cancel = within(p).getByRole('button', { name: 'Request cancellation' })
    expect(cancel).toBeDisabled()
    expect(cancel).toHaveAttribute('title', expect.stringMatching(/^10 repayments recorded — reverse those first/))
  })

  it('opens the print sheet when asked', async () => {
    render(await page('1'))
    const sheet = screen.getByRole('dialog', { name: 'Repayment Schedule · Carres' })
    expect(sheet).toHaveTextContent('FUND OUT · LOAN')
    expect(sheet).toHaveTextContent('Borrower')
  })

  // 2026-10-12: overdue is read from the plan, not from a record Detect overdue wrote.
  it('reads a loan whose instalments are all paid active', async () => {
    database(LOAN, [
      ...REPAYMENTS,
      { id: 'p5', payment_date: '2026-10-02', payment_type: 'principal', amount: 10000, notes: 'Auto-synced from voucher HV-OR-202610-005' },
      { id: 'i5', payment_date: '2026-10-02', payment_type: 'interest', amount: 2400, notes: 'Auto-synced from voucher HV-OR-202610-005' },
    ])
    render(await page())
    const pill = screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement
    expect(pill).toHaveAttribute('data-tone', 'ledger')
    expect(pill).toHaveTextContent('active')
  })

  it('lets an untouched active loan ask for cancellation with a reason', async () => {
    database(LOAN, [])
    mocks.requestCancel.mockResolvedValue(undefined)
    render(await page())
    fireEvent.click(within(panel()).getByRole('button', { name: 'Request cancellation' }))
    const ask = screen.getByRole('dialog', { name: 'Request the cancellation of the loan to Carres (CAR)?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Request cancellation' }))
    })
    expect(within(ask).getByRole('alert')).toHaveTextContent('Say why it is cancelled')
    expect(mocks.requestCancel).not.toHaveBeenCalled()
    fireEvent.change(within(ask).getByLabelText('Reason'), { target: { value: 'wrong borrower' } })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Request cancellation' }))
    })
    expect(mocks.requestCancel).toHaveBeenCalledWith('loan-4', 'wrong borrower')
    expect(mocks.flash).toHaveBeenCalledWith('Cancellation requested — waiting for Principal approval')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('cancels a pending loan when asked, and goes back to the list', async () => {
    database({ ...LOAN, status: 'pending_approval', approved_by: null, approved_at: null, disbursement_date: null }, [])
    mocks.cancelPending.mockResolvedValue(undefined)
    render(await page())
    const pill = screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement
    expect(pill).toHaveTextContent('pending approval')
    expect(within(cardOf('Trail')).getByText('1 / 2 steps', { exact: false })).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel loan' }))
    const ask = screen.getByRole('dialog', { name: 'Cancel the loan to Carres (CAR)?' })
    await act(async () => {
      fireEvent.click(within(ask).getByRole('button', { name: 'Cancel loan' }))
    })
    expect(mocks.cancelPending).toHaveBeenCalledWith('loan-4')
    expect(mocks.push).toHaveBeenCalledWith('/fund-out')
  })
})

// 2026-10-12 (user: 现在只能选月份不能选日期): Repayment starts is a date, and
// the schedule's instalments fall on its day.
describe('a loan’s repayment start, a date', () => {
  const field = () => screen.getByLabelText('Repayment starts')

  it('puts the instalments on the day picked', async () => {
    database({ ...LOAN, repayment_start_date: '2026-05-20' })
    render(await page())
    expect(field()).toHaveAttribute('type', 'date')
    expect(field()).toHaveValue('2026-05-20')
    const rows = cardOf('Repayment schedule').querySelectorAll('table.sched-table tbody tr')
    expect(rows[5]).toHaveTextContent('20 Oct 2026')
    // The sixth falls on the 20th: not yet due on the 9th.
    expect(screen.getByRole('heading', { level: 1 }).nextElementSibling).toHaveTextContent('active')
  })

  it('reads a month set before dates could be picked as that month on the disbursement’s day', async () => {
    render(await page())
    expect(field()).toHaveValue('2026-05-02')
  })

  it('saves the date picked', async () => {
    vi.mocked(setLoanRepaymentStart).mockResolvedValue(undefined)
    render(await page())
    fireEvent.change(field(), { target: { value: '2026-05-20' } })
    fireEvent.click(within(field().closest('.fin-field') as HTMLElement).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(setLoanRepaymentStart).toHaveBeenCalledWith('loan-4', '2026-05-20'))
  })
})

describe('where a loan page returns to (2026-10-09, the handoff)', () => {
  it('goes back to the Overview it was opened from', async () => {
    render(await LoanPage({ params: Promise.resolve({ id: 'loan-4' }), searchParams: Promise.resolve({ from: 'overview' }) }))
    expect(screen.getByRole('link', { name: '← Overview' })).toHaveAttribute('href', '/dashboard')
  })
  it('goes back to the calendar', async () => {
    render(await LoanPage({ params: Promise.resolve({ id: 'loan-4' }), searchParams: Promise.resolve({ from: 'calendar' }) }))
    expect(screen.getByRole('link', { name: '← Calendar' })).toHaveAttribute('href', '/repayment-schedule')
  })
})

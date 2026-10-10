import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — the treasury Overview per the user's Claude Design handoff
// (Phase 4 of the Finance revamp): Daily Bank and Record payment in the head,
// the four cards (what waits in the blue "wait" tone), the pool breakdown
// folded, the margin and the month's interest as two panels, and two new
// sections from every live deal's repayment plan — the installments behind,
// and those coming up in the next 14 days with their net.

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAuth: mocks.requireAuth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/approval-amounts', () => ({ resolveLiveApprovalAmounts: async () => new Map() }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
// 2026-10-10: the lists are sheet tables now (client components — a row opens
// through the router; the saved column layout comes from the browser client).
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

import DashboardPage from './page'

const SUMMARY = {
  role: 'finance',
  total_pool: 456930.16, fund_sources_total: 3500000, loans_outstanding: 2415829.35,
  weighted_cost_rate: 0.0112, current_base_rate: 0.0112, net_spread: 0,
  monthly_interest_income: 33383.48, monthly_interest_expense: 23563.21, net_interest_income: 9820.27,
  pending_approvals_count: 1,
  pending_approvals: [{ id: 'a1', request_type: 'payment_voucher', description: 'HV-PV-202610-0474: AI tools', amount: 2997.61, submitted_by_name: 'Finance', created_at: '2026-10-06T02:00:00Z' }],
  subsidiaries: [], alerts: [],
  dept_pool_total: 346436.88, billing_float: 14801.53,
  marketing_np_this_month: { period_month: '2026-10-01', revenue: 0, staff_cost: 0, expenses: 0, net_profit: 0 },
  salary_pool_total: 1186.88, payouts_pending: 1, hv_fund_balance: 110493.28, invoice_pool_balance: 42920, total_advance: null, total_saving: null,
  pool_breakdown: { fund_sources: 3500000, dept_pool: 346436.88, venture_pool: 110493.28, total: 456930.16 },
  fund_source_breakdown: [{ source_type: 'subsidiary_deposit', count: 1, amount: 30000 }],
  dept_pool_breakdown: [{ department_id: 'd1', department_name: 'Marketing', balance: 182300 }],
}

// A loan of 12,000 over 3 months from July (4,000 + 120 a month on the 15th):
// August paid, September behind, October's on the 15th. A fund source of
// 30,000 over 3 months from 20 September: its first, 10,300, on 20 October.
const TABLES: Record<string, unknown[]> = {
  loans: [{ id: 'l1', company_id: 'co-hb', principal: 12000, effective_rate: 0.01, tenure_months: 3, status: 'active', repayment_terms: 'EMI 分期 · 月息1% · 3期', compound_interest: false, disbursement_date: '2026-07-15', repayment_start_month: null, terms_effective_from: null }],
  fund_sources: [{ id: 'f1', status: 'active', amount: 30000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-09-20', repayment_start_month: null, terms_effective_from: null, from_company_id: 'co-hc', from_department_id: null, from_freetext_name: null }],
  companies: [{ id: 'co-hb', name: 'HOUZS Bedding', short_code: 'HB' }, { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
  departments: [],
  repayments: [{ loan_id: 'l1', amount: 4000, payment_date: '2026-08-15', payment_type: 'principal' }, { loan_id: 'l1', amount: 120, payment_date: '2026-08-15', payment_type: 'interest' }],
  fund_source_repayments: [],
  // Finance's own request, still with the Principal.
  approval_requests: [{ id: 'q1', request_type: 'new_loan', description: 'New loan to HB', amount: 40000, reference_id: 'l1', reference_table: 'loans', status: 'pending', created_at: '2026-10-08T02:00:00Z' }],
  bank_accounts: [{ id: 'b1', bank_name: 'Hong Leong', account_number: '123', current_balance: 50000, is_primary: true, status: 'active' }],
}

function database() {
  const from = (table: string) => {
    const result = { data: TABLES[table] ?? [], error: null }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit', 'range', 'not', 'maybeSingle']) q[m] = () => q
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
    return q
  }
  mocks.rpc.mockImplementation(async (fn: string) => (fn === 'dashboard_summary' ? { data: SUMMARY, error: null } : { data: null, error: null }))
  mocks.createClient.mockResolvedValue({ from, rpc: mocks.rpc })
}

const card = (name: string) => screen.getAllByLabelText(name, { selector: '.stat-card' })[0]
const section = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  database()
  vi.useFakeTimers({ now: new Date('2026-10-09T04:00:00Z'), toFake: ['Date'] }) // noon on 9 Oct in the office
})
afterEach(() => vi.useRealTimers())

describe('the treasury Overview on the sheet', () => {
  it('heads the page with the month, Daily Bank and Record payment', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }))
    render(await DashboardPage())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('OVERVIEW · TREASURY · OCTOBER 2026')
    expect(screen.getByRole('link', { name: 'Daily Bank' })).toHaveAttribute('href', '/daily-bank')
    expect(screen.getByRole('link', { name: 'Record payment' })).toHaveAttribute('href', '/payments/new')
  })

  it('shows the four cards, what waits in the wait tone', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['treasury', 'approvals', 'override'] }))
    render(await DashboardPage())
    expect(card('Venture Pool')).toHaveAttribute('data-tone', 'primary')
    expect(card('Venture Pool')).toHaveTextContent('RM 110,493.28')
    expect(card('Pool')).toHaveTextContent('RM 456,930.16')
    expect(card('Lent out')).toHaveTextContent('RM 2,415,829.35')
    expect(card('Pending your hand')).toHaveAttribute('data-tone', 'wait')
    expect(card('Pending your hand')).toHaveTextContent('1')
  })

  it("keeps Finance's queue in the wait tone", async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }))
    render(await DashboardPage())
    expect(card('Awaiting Principal')).toHaveAttribute('data-tone', 'wait')
  })

  it('folds the pool breakdown and splits the margin from the month’s interest', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }))
    render(await DashboardPage())
    const fold = document.querySelector('details.fin-fold') as HTMLElement
    expect(fold.querySelector('summary')).toHaveTextContent('Pool breakdown')
    expect(within(fold).getByText('Marketing')).toBeInTheDocument()
    expect(within(section('Margin panel')).getByText('Weighted cost of capital')).toBeInTheDocument()
    const interest = section('Interest this month')
    expect(within(interest).getByText('OCTOBER 2026')).toBeInTheDocument()
    expect(interest).toHaveTextContent('RM 33,383.48')
    expect(interest).toHaveTextContent('RM 9,820.27')
  })

  it('lists the installments behind and those coming up in the next 14 days', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }))
    render(await DashboardPage())
    const behind = section('Overdue instalments')
    expect(within(behind).getByText('1 BEHIND')).toBeInTheDocument()
    const late = within(behind).getByText('HOUZS Bedding').closest('tr') as HTMLElement
    expect(late).toHaveTextContent('15 Sep 2026')
    expect(late).toHaveTextContent('Instalment 2 of 3')
    expect(late).toHaveTextContent('4,120.00')
    expect(within(late).getByText('↓ collect').closest('.chip')).toHaveClass('ledger')
    expect(within(late).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/fund-out/l1?from=overview')

    const coming = section('Coming up · next 14 days')
    expect(within(coming).getByText('2 INSTALMENTS')).toBeInTheDocument()
    const rows = Array.from(coming.querySelectorAll('tbody tr')).map((r) => r.textContent)
    expect(rows[0]).toContain('HOUZS Bedding')
    expect(rows[0]).toContain('15 Oct 2026')
    expect(rows[1]).toContain('HOUZS Century')
    expect(rows[1]).toContain('10,300.00')
    const pay = within(coming).getByText('HOUZS Century').closest('tr') as HTMLElement
    expect(within(pay).getByText('↑ pay').closest('.chip')).toHaveClass('accent')
    expect(within(pay).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/fund-in/f1?from=overview')
    expect(coming.querySelector('tfoot')).toHaveTextContent('Net')
    expect(coming.querySelector('tfoot')).toHaveTextContent('RM (6,180.00)')
  })
})

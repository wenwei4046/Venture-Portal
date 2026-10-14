import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { withActions } from '@/test/with-actions'
import { FinViewProvider } from '@/components/layout/fin-view'

// 2026-10-10 — the audit of the Finance handoff (HANDOFF.md, list l): the
// treasury Overview's lists are sheet tables (▽ filters, a range on amounts
// and dates, resize / reorder, a double-click opens a row), the pool
// breakdown's three tables carry their titles, Alerts is a Type / Message
// table, the two KPI rows are plain cards (Marketing NP green when it is a
// profit), and on a phone the head keeps only Record payment.

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAuth: mocks.requireAuth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }))
// The tables' saved column layout comes from the browser client; here there is none.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/approval-amounts', () => ({
  resolveLiveApprovalAmounts: async (_s: unknown, rows: Array<{ id: string; amount: number | null }>) => new Map(rows.map((r) => [r.id, r.amount])),
}))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))

// Finance's view and HR's Overview (2026-10-14) read through these server modules; the treasury Overview does not.
vi.mock('@/lib/hiring/board', () => ({ loadHiringBoard: async () => ({ ok: false, reason: 'test' }) }))
vi.mock('@/lib/member/server', () => ({ adminMemberAction: async () => ({ ok: false, reason: 'test' }) }))
vi.mock('../revenue/_lib/sub-departments', () => ({ listSubDepartments: async () => [] }))

import DashboardPage from './page'

const SUMMARY = {
  role: 'finance',
  total_pool: 456930.16, fund_sources_total: 3500000, loans_outstanding: 2415829.35,
  weighted_cost_rate: 0.0112, current_base_rate: 0.0112, net_spread: 0,
  monthly_interest_income: 33383.48, monthly_interest_expense: 23563.21, net_interest_income: 9820.27,
  pending_approvals_count: 1,
  pending_approvals: [{ id: 'a1', request_type: 'payment_voucher', description: 'HV-PV-202610-0474: AI tools', amount: 2997.61, submitted_by_name: 'Ong Mei Shuang', created_at: '2026-10-06T02:00:00Z' }],
  subsidiaries: [
    { id: 's1', name: 'HOUZS Century', short_code: 'HC', tier: 'a', savings_deposited: 1500000, loans_outstanding: 980000, net_position: 520000, position: 'creditor', has_overdue: false },
    { id: 's2', name: 'HOUZS Bedding', short_code: 'HB', tier: 'a', savings_deposited: 0, loans_outstanding: 1018000, net_position: -1018000, position: 'debtor', has_overdue: true },
  ],
  alerts: [
    { severity: 'warning', message: 'Overdue: 2 records pending' },
    { severity: 'info', message: '1 fund source(s) maturing in 30 days' },
  ],
  dept_pool_total: 346436.88, billing_float: 14801.53,
  marketing_np_this_month: { period_month: '2026-10-01', revenue: 64000, staff_cost: 32960, expenses: 12800, net_profit: 18240 },
  salary_pool_total: 1186.88, payouts_pending: 1, hv_fund_balance: 110493.28, invoice_pool_balance: 42920, total_advance: null, total_saving: null,
  pool_breakdown: { fund_sources: 3500000, dept_pool: 346436.88, venture_pool: 110493.28, total: 456930.16 },
  fund_source_breakdown: [{ source_type: 'subsidiary_deposit', count: 3, amount: 2300000 }],
  dept_pool_breakdown: [
    { department_id: 'd1', department_name: 'Marketing', balance: 182300 },
    { department_id: 'd2', department_name: 'Director', balance: -1186.88 },
  ],
}

// The book of page.sheet.test: a loan of 12,000 over 3 months from 15 July
// (September behind, October's on the 15th) and a fund source of 30,000 over
// 3 months from 20 September (its first, 10,300, on 20 October).
const TABLES: Record<string, Array<Record<string, unknown>>> = {
  loans: [{ id: 'l1', company_id: 'co-hb', principal: 12000, effective_rate: 0.01, tenure_months: 3, status: 'active', repayment_terms: 'EMI 分期 · 月息1% · 3期', compound_interest: false, disbursement_date: '2026-07-15', repayment_start_month: null, terms_effective_from: null }],
  fund_sources: [{ id: 'f1', status: 'active', amount: 30000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-09-20', repayment_start_month: null, terms_effective_from: null, from_company_id: 'co-hc', from_department_id: null, from_freetext_name: null }],
  companies: [{ id: 'co-hb', name: 'HOUZS Bedding', short_code: 'HB' }, { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
  departments: [],
  repayments: [{ loan_id: 'l1', amount: 4000, payment_date: '2026-08-15', payment_type: 'principal' }, { loan_id: 'l1', amount: 120, payment_date: '2026-08-15', payment_type: 'interest' }],
  fund_source_repayments: [],
  // Finance's own requests: one still with the Principal, two decided.
  approval_requests: [
    { id: 'q1', request_type: 'new_loan', description: 'New loan to HB', amount: 40000, reference_id: 'l1', reference_table: 'loans', status: 'pending', approved_at: null, created_at: '2026-10-08T02:00:00Z' },
    { id: 'r1', request_type: 'payment_voucher', description: 'HV-PV-202610-0441: EPF Sep 2026', amount: 48612.4, reference_id: 'pv1', reference_table: 'payment_vouchers', status: 'approved', approved_at: '2026-10-04T03:00:00Z', created_at: '2026-10-03T03:00:00Z' },
    { id: 'r2', request_type: 'payment_voucher', description: 'HV-PV-202610-0436: Office renovation deposit', amount: 15000, reference_id: 'pv2', reference_table: 'payment_vouchers', status: 'rejected', approved_at: '2026-10-03T04:00:00Z', created_at: '2026-10-02T03:00:00Z' },
  ],
  bank_accounts: [{ id: 'b1', bank_name: 'Hong Leong', account_number: '123', current_balance: 50000, is_primary: true, status: 'active' }],
}

/** A query that keeps the rows its eq / in name (a row without the column passes). */
function database(summary: object = SUMMARY) {
  const from = (table: string) => {
    let rows = [...(TABLES[table] ?? [])]
    const q: Record<string, unknown> = {}
    const keep = (pass: (r: Record<string, unknown>) => boolean) => {
      rows = rows.filter(pass)
      return q
    }
    q.select = () => q
    q.eq = (col: string, v: unknown) => keep((r) => !(col in r) || r[col] === v)
    q.in = (col: string, vs: unknown[]) => keep((r) => !(col in r) || vs.includes(r[col]))
    for (const m of ['neq', 'gte', 'lte', 'order', 'limit', 'range', 'not', 'maybeSingle']) q[m] = () => q
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej)
    return q
  }
  mocks.rpc.mockImplementation(async (fn: string) => (fn === 'dashboard_summary' ? { data: summary, error: null } : { data: null, error: null }))
  mocks.createClient.mockResolvedValue({ from, rpc: mocks.rpc })
}

const FINANCE = () => withActions({ id: 'f', role: 'staff', permissions: ['treasury'] })
const PRINCIPAL = () => withActions({ id: 'p', role: 'principal', permissions: ['treasury', 'approvals', 'override'] })

/** The page as Finance and the Principal see it: on the Finance view. */
async function draw(user: object) {
  mocks.requireAuth.mockResolvedValue(user)
  const page = (await DashboardPage()) as ReactNode
  render(<FinViewProvider value>{page}</FinViewProvider>)
}

const section = (name: string) => screen.getByRole('heading', { name }).closest('section') as HTMLElement
const columnKeys = (el: HTMLElement) => Array.from(el.querySelectorAll('thead th[data-col]')).map((th) => (th as HTMLElement).dataset.col)
/** The columns a phone keeps in the grid (the rest fold behind the row's arrow). */
const phoneKeys = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('thead th[data-col]'))
    .filter((th) => !th.classList.contains('m-hide'))
    .map((th) => (th as HTMLElement).dataset.col)
/** A row's chip in its own cell, not the phone's small print. */
const cellChip = (row: HTMLElement, text: string) =>
  Array.from(row.querySelectorAll('.chip')).find((c) => !c.closest('.q-sub') && c.textContent?.includes(text)) as HTMLElement
const filterOf = (el: HTMLElement, label: string) => within(el).getByRole('button', { name: `Filter ${label}` })
const kpi = (name: string) => screen.getByLabelText(name, { selector: '.ov-kpi' })

beforeEach(() => {
  vi.clearAllMocks()
  database()
  vi.useFakeTimers({ now: new Date('2026-10-09T04:00:00Z'), toFake: ['Date'] }) // noon on 9 Oct in the office
})
afterEach(() => vi.useRealTimers())

describe('the treasury Overview’s lists are sheet tables', () => {
  it('Pending your hand: ▽ on every column, a range on the amount and the date, a double-click opens the request', async () => {
    await draw(PRINCIPAL())
    const pending = section('Pending your hand')
    expect(pending.querySelector('.st-box table')).not.toBeNull()
    expect(columnKeys(pending)).toEqual(['description', 'request', 'amount', 'by', 'submitted'])
    for (const label of ['Description', 'Request', 'Amount', 'By', 'Submitted']) expect(filterOf(pending, label)).toBeInTheDocument()

    fireEvent.click(filterOf(pending, 'Submitted'))
    expect(within(screen.getByRole('dialog', { name: 'Filter Submitted' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()

    const row = within(pending).getByText('RM 2,997.61').closest('tr') as HTMLElement
    expect(within(row).getByRole('link', { name: 'HV-PV-202610-0474: AI tools' })).toHaveAttribute('href', '/approvals/a1')
    expect(row).toHaveTextContent('6 Oct')
    // A phone keeps what it is and how much; who sent it and when are its small print.
    expect(phoneKeys(pending)).toEqual(['description', 'amount'])
    expect(row.querySelector('.q-sub')).toHaveTextContent('Ong Mei Shuang · 6 Oct')
    fireEvent.doubleClick(within(row).getByText('RM 2,997.61'))
    expect(mocks.push).toHaveBeenCalledWith('/approvals/a1')
    fireEvent.contextMenu(row)
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['Open', 'Open in new tab'])
  })

  it('Recent actions: the decided requests, the decision as a chip, a double-click opens the request', async () => {
    await draw(FINANCE())
    const recent = section('Recent actions')
    expect(recent.querySelector('.st-box table')).not.toBeNull()
    expect(columnKeys(recent)).toEqual(['description', 'request', 'decision', 'amount', 'decided'])
    expect(filterOf(recent, 'Decision')).toBeInTheDocument()
    fireEvent.click(filterOf(recent, 'Decided'))
    expect(within(screen.getByRole('dialog', { name: 'Filter Decided' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()

    const rows = Array.from(recent.querySelectorAll('tbody tr')).map((r) => r.textContent)
    expect(rows[0]).toContain('EPF Sep 2026')
    expect(rows[1]).toContain('Office renovation deposit')
    const rejected = within(recent).getByText('RM 15,000.00').closest('tr') as HTMLElement
    expect(cellChip(rejected, 'rejected')).toHaveClass('danger')
    // A phone keeps the request and its amount; the decision and its day are the small print.
    expect(phoneKeys(recent)).toEqual(['description', 'amount'])
    expect(rejected.querySelector('.q-sub')).toHaveTextContent('rejected3 Oct')
    fireEvent.doubleClick(within(rejected).getByText('RM 15,000.00'))
    expect(mocks.push).toHaveBeenCalledWith('/approvals/r2')
  })

  it("keeps Finance's Awaiting Principal sign-off as it was: their own requests, a plain table", async () => {
    await draw(FINANCE())
    const awaiting = section('Awaiting Principal sign-off')
    expect(awaiting.querySelector('.st-box')).toBeNull()
    expect(within(awaiting).getByRole('link', { name: 'New loan to HB' })).toHaveAttribute('href', '/approvals/q1')
  })

  it('Subsidiaries: ▽ and ranges, its foot the total of the companies shown', async () => {
    await draw(FINANCE())
    const subs = section('Subsidiaries')
    expect(subs.querySelector('.st-box table')).not.toBeNull()
    expect(columnKeys(subs)).toEqual(['company', 'savings', 'loans', 'net', 'position'])
    const foot = subs.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('All subsidiaries')
    expect(foot).toHaveTextContent('RM 1,500,000.00')
    expect(foot).toHaveTextContent('RM 1,998,000.00')
    expect(foot).toHaveTextContent('(498,000.00)')

    fireEvent.click(filterOf(subs, 'Net'))
    expect(within(screen.getByRole('dialog', { name: 'Filter Net' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(filterOf(subs, 'Position'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter Position' })).getByRole('checkbox', { name: 'debtor' }))
    expect(subs.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(foot).toHaveTextContent('1 of 2 subsidiaries')
    expect(foot).toHaveTextContent('+520,000.00')
  })

  // 2026-10-12: a company is overdue when one of its loans has an instalment
  // past its day unpaid — the live book, as the Overdue page reads it — not
  // the records Detect overdue used to write (dashboard_summary.has_overdue).
  it('Subsidiaries: a company reads overdue from its loans’ plans', async () => {
    database({
      ...SUMMARY,
      // The summary's ids are the companies' own; its flag says the opposite of the loans.
      subsidiaries: SUMMARY.subsidiaries.map((s) => ({ ...s, id: s.short_code === 'HC' ? 'co-hc' : 'co-hb', has_overdue: s.short_code === 'HC' })),
    })
    await draw(FINANCE())
    const subs = section('Subsidiaries')
    const rowOf = (name: string) => within(subs).getByText(name).closest('tr') as HTMLElement
    expect(within(rowOf('HOUZS Bedding')).getByText('overdue').closest('.chip')).toHaveClass('danger')
    expect(within(rowOf('HOUZS Century')).queryByText('overdue')).toBeNull()
  })

  it('the instalments behind and coming up: sheet tables; a row opens its deal, which goes back to the Overview', async () => {
    await draw(FINANCE())
    const behind = section('Overdue instalments')
    expect(behind.querySelector('.st-box table')).not.toBeNull()
    expect(columnKeys(behind)).toEqual(['due', 'counterparty', 'direction', 'amount', 'open'])
    fireEvent.click(filterOf(behind, 'Due'))
    expect(within(screen.getByRole('dialog', { name: 'Filter Due' })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    const late = within(behind).getByText('HOUZS Bedding').closest('tr') as HTMLElement
    // A phone keeps who and how much; the day and the direction are the small print.
    expect(phoneKeys(behind)).toEqual(['counterparty', 'amount'])
    expect(late.querySelector('.q-sub')).toHaveTextContent('15 Sep 2026 · ↓ collect')
    fireEvent.doubleClick(within(late).getByText('4,120.00'))
    expect(mocks.push).toHaveBeenCalledWith('/fund-out/l1?from=overview')

    const coming = section('Coming up · next 14 days')
    expect(coming.querySelector('.st-box table')).not.toBeNull()
    expect(within(coming).getByRole('button', { name: 'Filter Amount' })).toBeInTheDocument()
    const pay = within(coming).getByText('HOUZS Century').closest('tr') as HTMLElement
    fireEvent.contextMenu(pay)
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.firstChild?.textContent)).toEqual(['Open', 'Open in new tab'])
    // The Net is of the instalments shown: only what we collect, once the pay side is filtered out.
    fireEvent.click(filterOf(coming, 'Direction'))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Filter Direction' })).getByRole('checkbox', { name: '↑ pay' }))
    expect(coming.querySelector('tfoot')).toHaveTextContent('Net')
    expect(coming.querySelector('tfoot')).toHaveTextContent('RM 4,120.00')
  })
})

describe('the treasury Overview’s fold, alerts, KPI rows and phone head', () => {
  it('the pool breakdown holds three titled tables with their own headers; a negative balance is red', async () => {
    await draw(FINANCE())
    const fold = document.querySelector('details.fin-fold') as HTMLElement
    expect(Array.from(fold.querySelectorAll('h2, h3')).map((h) => h.textContent)).toEqual(['Source', 'By fund source type', 'Dept pool by department'])
    const heads = Array.from(fold.querySelectorAll('table')).map((t) => Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent))
    expect(heads).toEqual([['Source', 'Amount'], ['Type', 'Count', 'Amount'], ['Department', 'Balance']])
    // Capitalised by CSS.
    expect(within(fold).getByText('subsidiary deposit')).toHaveClass('capitalize')
    expect(within(fold).getByText('RM (1,186.88)')).toHaveClass('text-danger')
  })

  it('Alerts is a table: Type and Message', async () => {
    await draw(FINANCE())
    const alerts = section('Alerts')
    expect(alerts.querySelector('ul')).toBeNull()
    expect(Array.from(alerts.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual(['Type', 'Message'])
    // The overdue alert is the book's (2026-10-12): HB's loan has September behind.
    expect(within(alerts).queryByText('Overdue: 2 records pending')).toBeNull()
    const row = within(alerts).getByText('Overdue: 1 loan with an instalment past its day').closest('tr') as HTMLElement
    expect(within(row).getByText('warning').closest('.chip')).toHaveClass('alert')
    expect(within(alerts).getByText('1 fund source(s) maturing in 30 days').closest('tr')).not.toBeNull()
  })

  it('the KPI rows are plain cards — no bar, no icon — and Marketing NP is green when it is a profit', async () => {
    await draw(FINANCE())
    for (const name of ['Billing & dept pool', 'Director salary']) {
      expect(section(name).querySelector('.stat-card, .stat-card-icon')).toBeNull()
    }
    expect(kpi('Billing float')).toHaveAttribute('data-tone', 'primary')
    expect(kpi('Billing float')).toHaveTextContent('RM 14,801.53')
    expect(kpi('Billing float')).toHaveTextContent('Unpaid invoices (draft + issued)')
    expect(kpi('Dept pool total')).not.toHaveAttribute('data-tone')
    expect(kpi('Marketing NP this month')).toHaveAttribute('data-tone', 'ledger')
    expect(kpi('Marketing NP this month')).toHaveTextContent('RM 18,240.00')
    expect(kpi('Marketing NP this month')).toHaveTextContent('Revenue RM 64,000.00 − Staff RM 32,960.00 − Expenses RM 12,800.00')
    expect(kpi('Director Pool')).toHaveAttribute('data-tone', 'primary')
    expect(kpi('Director Pool')).toHaveTextContent('1 draft payout pending')
    expect(kpi('Venture Pool')).not.toHaveAttribute('data-tone')
    expect(kpi('Director Invoice')).toHaveTextContent('RM 42,920.00')
  })

  it('Marketing NP is red at a loss', async () => {
    database({ ...SUMMARY, marketing_np_this_month: { ...SUMMARY.marketing_np_this_month, net_profit: -500 } })
    await draw(FINANCE())
    expect(kpi('Marketing NP this month')).toHaveAttribute('data-tone', 'danger')
  })

  it('on a phone the head keeps only Record payment', async () => {
    await draw(FINANCE())
    const daily = screen.getByRole('link', { name: 'Daily Bank' })
    expect(daily.closest('.hidden')).toHaveClass('md:inline-flex')
    expect(screen.getByRole('link', { name: 'Record payment' }).closest('.hidden')).toBeNull()
  })

  it('keeps Daily Bank on a phone when it is the head’s only action', async () => {
    await draw({ id: 'd', role: 'staff', permissions: ['treasury'], actions: { 'treasury.view': 'all' }, sensitive: [] })
    expect(screen.queryByRole('link', { name: 'Record payment' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Daily Bank' }).closest('.hidden')).toBeNull()
  })
})

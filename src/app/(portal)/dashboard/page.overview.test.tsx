import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { inTimeZoneAsync } from '@/test/time-zone'
import { withActions } from '@/test/with-actions'

// 2026-10-14 — the Finance revamp v2 (`.design/fin-r2/handoff`): Finance's view
// opens on its own Overview (D01) — the greeting, Create payment / Create
// invoice, one line of what waits, eight quick actions with counts, a card per
// category in the sidebar's order — and HR's view on Finance's layout (H01–H02).

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), hiring: vi.fn(), members: vi.fn(), subs: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAuth: mocks.requireAuth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/approval-amounts', () => ({ resolveLiveApprovalAmounts: async () => new Map() }))
vi.mock('@/lib/hiring/board', () => ({ loadHiringBoard: mocks.hiring }))
vi.mock('@/lib/member/server', () => ({ adminMemberAction: mocks.members }))
vi.mock('../revenue/_lib/sub-departments', () => ({ listSubDepartments: mocks.subs }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import DashboardPage from './page'

type Row = Record<string, unknown>
const TABLES: Record<string, Row[]> = {}

/** The treasury dashboard's summary, for the Principal's own view (which keeps it). */
const SUMMARY = {
  role: 'principal',
  total_pool: 250000, fund_sources_total: 250000, loans_outstanding: 0,
  weighted_cost_rate: null, current_base_rate: null, net_spread: null,
  monthly_interest_income: 0, monthly_interest_expense: 0, net_interest_income: 0,
  pending_approvals_count: 0, pending_approvals: [], subsidiaries: [], alerts: [],
  dept_pool_total: 0, billing_float: 0,
  marketing_np_this_month: { period_month: '2026-10-01', revenue: 0, staff_cost: 0, expenses: 0, net_profit: 0 },
  salary_pool_total: null, payouts_pending: null, hv_fund_balance: null, invoice_pool_balance: null, total_advance: null, total_saving: null,
  pool_breakdown: { fund_sources: 0, dept_pool: 0, venture_pool: 0, total: 0 },
  fund_source_breakdown: [], dept_pool_breakdown: [],
}

/** A Supabase stand-in: rows by table, filtered by eq / in / like / neq; counts when asked for the head. */
function database() {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    let head = false
    const q = {
      select: (_c?: string, opts?: { count?: string; head?: boolean }) => {
        head = !!opts?.head
        return q
      },
      eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
      neq: (col: string, v: unknown) => (filters.push((r) => r[col] !== v), q),
      in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), q),
      like: (col: string, pat: string) => (filters.push((r) => String(r[col] ?? '').startsWith(pat.replace(/%$/, ''))), q),
      order: () => q,
      limit: () => q,
      range: () => q,
      gte: () => q,
      lte: () => q,
      lt: () => q,
      is: () => q,
      not: () => q,
      maybeSingle: () => q,
      then: (resolve: (v: unknown) => unknown) => {
        const rows = (TABLES[table] ?? []).filter((r) => filters.every((f) => f(r)))
        return Promise.resolve(resolve(head ? { data: null, count: rows.length, error: null } : { data: rows, error: null }))
      },
    }
    return q
  }
  mocks.rpc.mockImplementation(async (fn: string) =>
    fn === 'hr_dashboard_summary'
      ? { data: { staff: { total_count: 63 }, payroll: { run: null, rows_count: 0, draft_count: 0 }, director: { status: 'not_calculated' } }, error: null }
      : fn === 'dashboard_summary'
        ? { data: SUMMARY, error: null }
        : { data: null, error: null },
  )
  mocks.createClient.mockResolvedValue({ from, rpc: mocks.rpc })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(TABLES)) delete TABLES[k]
  TABLES.payment_vouchers = [
    { direction: 'debit', status: 'pending_approval', reference_type: null },
    { direction: 'debit', status: 'pending_approval', reference_type: null },
    { direction: 'debit', status: 'pending_approval', reference_type: 'payroll_disbursement' },
    { direction: 'debit', status: 'draft', reference_type: null },
    { direction: 'debit', status: 'paid', reference_type: null },
  ]
  TABLES.invoices = [
    { status: 'issued', reference_no: null },
    { status: 'issued', reference_no: 'ALC-202610' },
    { status: 'paid', reference_no: null },
  ]
  TABLES.alloc_txns = [
    { period_month: '2026-10-01', billed_ref: null },
    { period_month: '2026-10-01', billed_ref: 'ALC-202610' },
    { period_month: '2026-10-01', billed_ref: 'ALC-202610-2' },
  ]
  database()
  mocks.hiring.mockResolvedValue({ ok: true, board: { requests: [{ status: 'submitted' }, { status: 'submitted' }, { status: 'filled' }], talents: [{}, {}, {}] } })
  mocks.members.mockResolvedValue({ ok: true, data: { requests: [{ status: 'submitted' }, { status: 'approved' }] } })
  mocks.subs.mockResolvedValue([{ slug: 'fair', name: 'Fair', isHome: true }])
  vi.useFakeTimers({ now: new Date('2026-10-14T07:00:00Z'), toFake: ['Date'] }) // 15:00 in the office
})
afterEach(() => vi.useRealTimers())

const drawn = () => inTimeZoneAsync('UTC', () => DashboardPage())

/** A quick action by its label — its badge comes first in the link's name, so it is found by its words inside the grid. */
const tile = (label: string) => {
  const grid = document.querySelector('[class*="quick"]') as HTMLElement
  return within(grid).getByText(label).closest('a') as HTMLElement
}

const FINANCE = ['billing', 'categories', 'claims', 'dashboard', 'dept_pool', 'dept_reports', 'meeting_rooms', 'reconciliation', 'reports', 'treasury', 'venture_pool']

describe("Finance's Overview (D01)", () => {
  it('greets by the first name on the office clock, with the two actions', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', name: 'Aina Rahman', role: 'finance', permissions: FINANCE }))
    render(await drawn())
    expect(screen.getByText('Wed 14 Oct 2026 · Q4 2026')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good afternoon, Aina.')
    expect(screen.getByRole('link', { name: 'Create payment' })).toHaveAttribute('href', '/payments?new=1')
    expect(screen.getByRole('link', { name: 'Create invoice' })).toHaveAttribute('href', '/statements?new=1')
  })

  it('says what waits — payroll left out, read by department — and badges the tiles with it', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', name: 'Aina Rahman', role: 'finance', permissions: FINANCE }))
    render(await drawn())
    // To bill = no batch yet, or a batch with no live invoice left (the allocator's own rule): the first and the third.
    expect(screen.getByText('2 vouchers waiting for approval · 2 invoices outstanding · 2 allocations to bill.')).toBeInTheDocument()
    expect(within(tile('Payment')).getByText('3')).toBeInTheDocument() // 2 pending + 1 draft
    expect(within(tile('Invoice')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Billing')).getByText('2')).toBeInTheDocument()
    expect(tile('Receive').querySelector('[class*="badge"]')).toBeNull()
  })

  it('lists the eight quick actions in the design’s order', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', name: 'Aina Rahman', role: 'finance', permissions: FINANCE }))
    const { container } = render(await drawn())
    const tiles = [...container.querySelectorAll('[class*="tileLabel"]')].map((t) => t.textContent)
    expect(tiles).toEqual(['Payment', 'Receive', 'Invoice', 'Billing', 'Daily Bank', 'Fund IN', 'Fund OUT', 'Ledger'])
  })

  it('draws a card per category in the sidebar’s order, counting its pages', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', name: 'Aina Rahman', role: 'finance', permissions: FINANCE }))
    const { container } = render(await drawn())
    const heads = [...container.querySelectorAll('[class*="catHead"]')].map((h) => h.textContent)
    // Department: Dept Pool, the five departments, Venture Pool — no Claims since 2026-10-15.
    expect(heads).toEqual(['I.Daily7 pages', 'II.Fund5 pages', 'III.Report11 pages', 'IV.Department7 pages'])
  })

  it('reads by person for whoever holds Payroll payouts in their own view (finance@): payroll counted', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', name: 'Finance Manager', role: 'finance', permissions: [...FINANCE, 'payroll_payouts'] }))
    render(await drawn())
    expect(screen.getByText(/^3 vouchers waiting for approval/)).toBeInTheDocument()
  })

  it('leaves out what the account does not read: no billing, no invoice or allocation words', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'c', name: 'ONG MEI SHUANG', role: 'finance', permissions: ['treasury'] }))
    render(await drawn())
    expect(screen.getByText('2 vouchers waiting for approval.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create invoice' })).toBeNull()
  })

  it('keeps the Principal’s own view on the treasury dashboard', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'p', name: 'Principal', role: 'principal', permissions: ['treasury', 'approvals', 'override'] }))
    render(await drawn())
    expect(screen.queryByText(/^Good afternoon, Principal\.$/)).toBeNull()
  })
})

describe("HR's Overview (H01–H02)", () => {
  const HR = ['claims', 'claims_approve', 'dashboard', 'director_pool', 'director_salary', 'documentation', 'guest_link', 'hiring', 'hr_costing', 'meeting_rooms', 'meeting_rooms_manage', 'member_memos_manage', 'member_requests_manage', 'revenue', 'salary_individual', 'team']

  it('greets, says where the month stands, and opens Import payroll on the month', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'h', name: 'Principal', role: 'hr', permissions: HR }))
    render(await drawn())
    expect(screen.getByText('Wed 14 Oct 2026 · Q4 2026 · HR view')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good afternoon, Principal.')
    expect(screen.getByText('October payroll is not imported yet · 2 hiring requests waiting · director salary not calculated.')).toBeInTheDocument()
    // The head's button and the quick action both open the month.
    const imports = screen.getAllByRole('link', { name: 'Import payroll' })
    expect(imports).toHaveLength(2)
    for (const a of imports) expect(a).toHaveAttribute('href', '/hr-costing/payroll/2026-10-01')
    expect(screen.getByRole('link', { name: 'Calculate director salary' })).toHaveAttribute('href', '/director-salary')
  })

  it('badges Hiring requests and Member services, and notes the rows with news', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'h', name: 'Principal', role: 'hr', permissions: HR }))
    render(await drawn())
    expect(within(tile('Hiring requests')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Member services')).getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2 waiting')).toBeInTheDocument()
    expect(screen.getByText('Oct · not imported')).toBeInTheDocument()
    expect(screen.getByText('63 active')).toBeInTheDocument()
    expect(screen.getByText('1 new')).toBeInTheDocument()
    expect(screen.getByText('Not calculated')).toBeInTheDocument()
    expect(tile('Comm Cal')).toHaveAttribute('href', '/revenue/fair')
  })

  it('carries none of the old tables (the user: 照设计拿掉)', async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'h', name: 'Principal', role: 'hr', permissions: HR }))
    render(await drawn())
    expect(screen.queryByText(/Staff master/)).toBeNull()
    expect(screen.queryByText(/This month · payroll/)).toBeNull()
    expect(document.querySelector('table')).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { inTimeZoneAsync } from '@/test/time-zone'
import { withActions } from '@/test/with-actions'

// 2026-10-08: the Overview is drawn on the server, which keeps UTC. From
// midnight until 08:00 in the office its header said "As of" yesterday, the
// requests sent after midnight were dated the day before, and on the 1st HR's
// Overview was still last month.

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAuth: mocks.requireAuth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/approval-amounts', () => ({ resolveLiveApprovalAmounts: async () => new Map() }))

import DashboardPage from './page'

const SUMMARY = {
  role: 'finance',
  total_pool: 250000, fund_sources_total: 250000, loans_outstanding: 0,
  weighted_cost_rate: null, current_base_rate: null, net_spread: null,
  monthly_interest_income: 0, monthly_interest_expense: 0, net_interest_income: 0,
  pending_approvals_count: 0, pending_approvals: [], subsidiaries: [], alerts: [],
  dept_pool_total: 0, billing_float: 0,
  marketing_np_this_month: { period_month: '2026-11-01', revenue: 0, staff_cost: 0, expenses: 0, net_profit: 0 },
  salary_pool_total: null, payouts_pending: null, hv_fund_balance: null, invoice_pool_balance: null, total_advance: null, total_saving: null,
  pool_breakdown: { fund_sources: 0, dept_pool: 0, venture_pool: 0, total: 0 },
  fund_source_breakdown: [], dept_pool_breakdown: [],
}

// Finance's own request, sent at 00:20 on 1 Nov in the office (16:20 UTC on 31 Oct).
const SENT_AFTER_MIDNIGHT = {
  id: 'q1', request_type: 'new_loan', description: 'New loan to 2990', amount: 40000,
  reference_id: 'loan1', reference_table: 'loans', created_at: '2026-10-31T16:20:00Z',
}

function database() {
  const from = (table: string) => {
    let pendingQueue = false
    const q = {
      select: () => q, order: () => q, limit: () => q, in: () => q, maybeSingle: () => q,
      eq: (column: string, value: unknown) => {
        if (column === 'status' && value === 'pending') pendingQueue = true
        return q
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve({ data: table === 'approval_requests' && pendingQueue ? [SENT_AFTER_MIDNIGHT] : [], error: null })),
    }
    return q
  }
  mocks.rpc.mockImplementation(async (fn: string) =>
    fn === 'dashboard_summary' ? { data: SUMMARY, error: null } : { data: null, error: null },
  )
  mocks.createClient.mockResolvedValue({ from, rpc: mocks.rpc })
}

beforeEach(() => {
  vi.clearAllMocks()
  database()
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

const drawnByTheServer = () => inTimeZoneAsync('UTC', () => DashboardPage())

describe('the Overview, on the office clock', () => {
  it("is 'as of' the office's today, and dates a request by the office's day", async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'f', role: 'finance', permissions: ['treasury'] }))
    render(await drawnByTheServer())
    expect(screen.getByText(/OVERVIEW · TREASURY · NOVEMBER 2026/)).toBeInTheDocument()
    expect(screen.getByText(/As of 1 November 2026/)).toBeInTheDocument()
    const row = screen.getByText('New loan to 2990').closest('tr') as HTMLElement
    expect(within(row).getByText('1 Nov')).toBeInTheDocument()
  })

  it("asks HR's summary for the office's month and names it", async () => {
    mocks.requireAuth.mockResolvedValue(withActions({ id: 'h', role: 'hr', permissions: ['hr_costing'] }))
    render(await drawnByTheServer())
    expect(mocks.rpc).toHaveBeenCalledWith('hr_dashboard_summary', { p_period: '2026-11-01' })
    expect(screen.getAllByText(/November 2026/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/October 2026/)).toBeNull()
  })
})

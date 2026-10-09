import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — the single-month statements per the user's Claude Design
// handoff (Phase 4 of the Finance revamp), for whoever reads the reports
// company-wide: the month in the eyebrow, Single month / Monthly in the head
// with Excel and PDF, the cards, and the statement's controls — period,
// compare, find, segment, detail level — on one row over it. A department
// manager keeps the page as it was (the rail).

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), buildPnl: vi.fn(), buildCashFlow: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async () => ({ data: ['1010'], error: null }),
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'single']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      return q
    },
  }),
}))
vi.mock('@/lib/gl-reports', () => ({
  applyGlRefs: (l: unknown) => l,
  buildPnl: mocks.buildPnl,
  buildCashFlow: mocks.buildCashFlow,
  fetchAllJournalLines: async () => [],
  fetchCoaAccounts: async () => [],
  fetchGlRefs: async () => new Map(),
  monthPeriod: (ym: string) => ({ from: `${ym}-01`, to: `${ym}-28` }),
}))
vi.mock('@/lib/gl-report-blocks', async (orig) => ({ ...(await orig<object>()), pnlBlocks: () => [], cashFlowBlocks: () => [] }))
vi.mock('@/lib/cash-flow-sections', () => ({ buildCashFlowSideSections: () => null }))
vi.mock('@/lib/consolidation', () => ({ fetchInterBillingElimination: async () => null, eliminateInterBilling: (l: unknown) => l }))
vi.mock('@/lib/report-layouts', () => ({ readReportLayout: async () => null }))
vi.mock('@/lib/inter-billing-cash-flow', () => ({ fetchInterBillingCashFlow: async () => null, interBillTransferAccount: {}, payrollCustodyAccount: {} }))
vi.mock('@/lib/dept-receipt-payment', () => ({ fetchDeptOutstanding: async () => [] }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/reports', useSearchParams: () => new URLSearchParams() }))

import IncomeStatementPage from './page'
import CashFlowPage from '../cash-flow/page'
import ReceiptPaymentPage from '../receipt-payment/page'

const sect = (current: number) => ({ key: 'x', label: 'x', current, previous: 0, nodes: [] })
const card = (name: string) => screen.getByRole('group', { name })
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(FINANCE)
  mocks.buildPnl.mockReturnValue({
    revenue: sect(40000), cost: sect(20000), otherIncome: sect(100), expense: sect(5000),
    grossProfit: { current: 20000, previous: 0 }, netIncome: { current: 15100, previous: 0 },
  })
  mocks.buildCashFlow.mockReturnValue({
    operating: sect(0), investing: sect(0), financing: sect(0), inflow: sect(30000), outflow: sect(-20000),
    inflowLeaves: [], outflowLeaves: [],
    netChange: { current: 10000, previous: 0 }, openingCash: { current: 105000, previous: 0 }, closingCash: { current: 115000, previous: 0 }, check: { current: 0, previous: 0 },
  })
})

describe('the single-month P&L, company-wide', () => {
  it('heads with the month, the two views and the exports', async () => {
    render(await IncomeStatementPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · P&L · OCTOBER 2026')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('P&L')
    expect(screen.getByRole('link', { name: 'Single month · P&L' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Monthly P&L' })).toHaveAttribute('href', '/reports/monthly-pnl?period=2026-10')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/income-statement/export?format=xlsx&period=2026-10')
  })

  it('shows the month in four cards and the controls on one row', async () => {
    render(await IncomeStatementPage({ searchParams: Promise.resolve({}) }))
    expect(card('Revenue · Oct (to date)')).toHaveTextContent('RM 40,000.00')
    expect(card('Expenses · Oct (to date)')).toHaveTextContent('RM 25,000.00')
    expect(card('Net profit · Oct')).toHaveAttribute('data-tone', 'primary')
    expect(card('Net profit · Oct')).toHaveTextContent('RM 15,100.00')
    expect(card('Net margin · Oct')).toHaveTextContent('37.8%')
    const row = screen.getByRole('group', { name: 'Report controls' })
    expect(within(row).getByLabelText('Period')).toHaveValue('2026-10')
    expect(within(row).getByRole('combobox', { name: 'Compare' })).toHaveValue('')
    expect(within(row).getByRole('combobox', { name: 'Segment' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'L2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the rail for a department manager', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'm', role: 'dept_manager', permissions: ['dept_reports'] }))
    render(await IncomeStatementPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · P&L STATEMENT · OCTOBER 2026')
    expect(screen.queryByRole('group', { name: 'Report controls' })).toBeNull()
  })
})

describe('the single-month Cash Flow and Receipt & Payment, company-wide', () => {
  it('shows the cash of the month', async () => {
    render(await CashFlowPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · CASH FLOW · OCTOBER 2026')
    expect(screen.getByRole('link', { name: 'Single month' })).toHaveAttribute('aria-current', 'page')
    expect(card('Opening cash')).toHaveTextContent('RM 105,000.00')
    expect(card('Money in')).toHaveTextContent('RM 30,000.00')
    expect(card('Money out')).toHaveTextContent('RM (20,000.00)')
    expect(card('Net change')).toHaveTextContent('RM 10,000.00')
    expect(card('Closing cash')).toHaveAttribute('data-tone', 'primary')
  })

  it('shows receipts, payments and the net', async () => {
    render(await ReceiptPaymentPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · RECEIPT & PAYMENT · OCTOBER 2026')
    expect(card('Receipts')).toHaveTextContent('RM 30,000.00')
    expect(card('Payments')).toHaveTextContent('RM (20,000.00)')
    expect(card('Net')).toHaveTextContent('RM 10,000.00')
    expect(screen.getByRole('group', { name: 'Report controls' })).toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — the single-month statements per the user's Claude Design
// handoff (Phase 4 of the Finance revamp), for whoever reads the reports
// company-wide: the month in the eyebrow, Single month / Monthly in the head
// with Excel and PDF, the cards, and the statement's controls — period,
// compare, find, segment, detail level — on one row over it.
// 2026-10-10 — the handoff's table: the month (peach) over its RM and %, the
// month "vs" a month to compare, opened at L3; Cash Flow opens at L3 too, and
// Receipt & Payment reads each line as a % of the receipts.
// 2026-10-17 — nobody else: a reader short of Reports · View at All is
// refused (the Dept Manager's own-segment page went with the kind).

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  buildPnl: vi.fn(),
  buildCashFlow: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
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
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn() }), usePathname: () => '/reports', useSearchParams: () => new URLSearchParams() }))

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
    expect(within(row).getByRole('button', { name: 'L3' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('draws the month over its RM and %', async () => {
    render(await IncomeStatementPage({ searchParams: Promise.resolve({}) }))
    const month = Array.from(document.querySelectorAll('.sheet-rpt thead tr:first-child th')).slice(1)
    expect(month.map((th) => th.textContent)).toEqual(['Oct 2026'])
    expect(month[0]).toHaveClass('is-now')
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:nth-child(2) th')).map((th) => th.textContent)).toEqual(['RM', '%'])
  })

  it('adds the month compared, with its own %', async () => {
    render(await IncomeStatementPage({ searchParams: Promise.resolve({ compare: '2026-09' }) }))
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:first-child th')).slice(1).map((th) => th.textContent)).toEqual(['Oct 2026', 'Sep 2026 · compare'])
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:nth-child(2) th')).map((th) => th.textContent)).toEqual(['RM', '%', 'RM', '%'])
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
    const row = screen.getByRole('group', { name: 'Report controls' })
    expect(within(row).getByRole('button', { name: 'L3' })).toHaveAttribute('aria-pressed', 'true')
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:nth-child(2) th')).map((th) => th.textContent)).toEqual(['RM'])
  })

  it('shows receipts, payments and the net', async () => {
    render(await ReceiptPaymentPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · RECEIPT & PAYMENT · OCTOBER 2026')
    expect(card('Receipts')).toHaveTextContent('RM 30,000.00')
    expect(card('Payments')).toHaveTextContent('RM (20,000.00)')
    expect(card('Net')).toHaveTextContent('RM 10,000.00')
    expect(screen.getByRole('group', { name: 'Report controls' })).toBeInTheDocument()
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:nth-child(2) th')).map((th) => th.textContent)).toEqual(['RM', '%'])
  })
})

describe('the single-month statements, a reader short of Reports · View at All', () => {
  // Department reports alone, or Reports at Dept only.
  const SHORT = {
    'Department reports alone': withActions({ id: 's', role: 'staff', permissions: ['dept_reports'] }),
    'Reports at Dept': { id: 's', role: 'staff', permissions: ['reports', 'dept_reports'], actions: { 'reports.view': 'dept', 'dept_reports.view': 'all' } },
  }
  const PAGES = { 'P&L': IncomeStatementPage, 'Cash Flow': CashFlowPage, 'Receipt & Payment': ReceiptPaymentPage }

  for (const [who, reader] of Object.entries(SHORT)) {
    for (const [name, Page] of Object.entries(PAGES)) {
      it(`finds no ${name} page for ${who}`, async () => {
        mocks.requirePermission.mockResolvedValue(reader)
        await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
        expect(mocks.buildPnl).not.toHaveBeenCalled()
        expect(mocks.buildCashFlow).not.toHaveBeenCalled()
      })
    }
  }
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { inTimeZoneAsync } from '@/test/time-zone'

// 2026-10-08: a report opened without a period opened on the SERVER's month.
// Vercel keeps UTC, so on the 1st, until 08:00 in the office, every report
// (and its Excel / PDF) opened on the month before; the ledger's "this month to
// today" and Debtor Aging's "as of" were a day behind every night.

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  buildPnlAccounts: vi.fn(),
  fetchLedger: vi.fn(),
  fetchTrialBalance: vi.fn(),
  matrixNowKey: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireActionOn: mocks.requirePermission, requireAnyActionOn: mocks.requirePermission, requirePayrollPayoutsActionOn: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/gl-reports', async (original) => ({
  ...(await original<typeof import('@/lib/gl-reports')>()),
  fetchAllJournalLines: async () => [],
  fetchCoaAccounts: async () => [],
}))
vi.mock('@/lib/consolidation', () => ({ fetchInterBillingElimination: async () => null, eliminateInterBilling: (lines: unknown) => lines }))
vi.mock('@/lib/report-layouts', () => ({ readReportLayout: async () => null }))
vi.mock('@/lib/pnl-custom', () => ({
  buildPnlAccounts: mocks.buildPnlAccounts,
  buildCustomPnlRows: () => [],
  defaultPnlLayout: () => ({ categories: [] }),
}))
vi.mock('@/lib/cfo-reports', async (original) => ({
  ...(await original<typeof import('@/lib/cfo-reports')>()),
  fetchLedger: mocks.fetchLedger,
  fetchTrialBalance: mocks.fetchTrialBalance,
}))
vi.mock('@/lib/export/response', () => ({
  exportXlsxResponse: () => new Response('xlsx'),
  exportPdfResponse: async () => new Response('pdf'),
}))
vi.mock('@/lib/export/monthly-matrix-export', () => ({ buildMatrixXlsx: () => Buffer.from('') }))
vi.mock('./ledger/export/_format/xlsx', () => ({ buildLedgerXlsx: () => Buffer.from('') }))
vi.mock('./trial-balance/export/_format/xlsx', () => ({ buildTrialBalanceXlsx: () => Buffer.from('') }))
vi.mock('@/lib/paginate', () => ({ fetchAllRows: async () => [] }))
vi.mock('@/lib/debtor-aging-data', () => ({ fetchPaidByInvoice: async () => new Map() }))
vi.mock('./_components/MonthlyMatrix', () => ({
  default: (p: { nowKey: string }) => {
    mocks.matrixNowKey(p.nowKey)
    return <p data-testid="matrix">{p.nowKey}</p>
  },
}))
vi.mock('./_components/MonthlyReportControls', () => ({ default: () => null }))
vi.mock('./_components/ReportSearchProvider', () => ({ ReportSearchProvider: (p: { children: React.ReactNode }) => <>{p.children}</> }))
vi.mock('./_components/ReportViewToggle', () => ({ default: () => null }))
vi.mock('./debtor-aging/_components/AgingByCustomer', () => ({ default: () => null }))

import MonthlyPnlPage from './monthly-pnl/page'
import { GET as exportMonthlyPnl } from './monthly-pnl/export/route'
import { GET as exportLedger } from './ledger/export/route'
import DebtorAgingPage from './debtor-aging/page'
import TrialBalancePage from './trial-balance/page'
import { GET as exportTrialBalance } from './trial-balance/export/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] })
  mocks.buildPnlAccounts.mockReturnValue({ accounts: [], columns: [], salesByColumn: {} })
  mocks.fetchLedger.mockResolvedValue({ code: '3000', from: '', to: '', lines: [] })
  mocks.fetchTrialBalance.mockImplementation(async (_db: unknown, args: { asOf: string; showZeroBalance: boolean }) => ({
    asOf: args.asOf,
    rows: [],
    totals: { debit: 0, credit: 0 },
    reconciles: true,
    showZeroBalance: args.showZeroBalance,
  }))
  vi.useFakeTimers({ now: new Date('2026-10-31T16:30:00Z'), toFake: ['Date'] }) // 00:30 on 1 Nov in the office
})
afterEach(() => vi.useRealTimers())

const asTheServer = <T,>(fn: () => Promise<T>) => inTimeZoneAsync('UTC', fn)

describe("reports open on the office's month", () => {
  it('Monthly P&L: November, not October, at half past midnight on the 1st', async () => {
    render(await asTheServer(() => MonthlyPnlPage({ searchParams: Promise.resolve({}) })))
    expect(mocks.buildPnlAccounts).toHaveBeenCalledWith([], [], expect.objectContaining({ year: 2026, throughMonth: 11 }))
    expect(screen.getByTestId('matrix')).toHaveTextContent('2026-11')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', expect.stringContaining('period=2026-11'))
  })

  it('Monthly P&L export: the same month when the link names none', async () => {
    await asTheServer(() => exportMonthlyPnl(new Request('https://portal.test/reports/monthly-pnl/export?format=xlsx')))
    expect(mocks.buildPnlAccounts).toHaveBeenCalledWith([], [], expect.objectContaining({ year: 2026, throughMonth: 11 }))
  })

  it("Ledger export: from the office month's 1st to the office's today", async () => {
    await asTheServer(() => exportLedger(new Request('https://portal.test/reports/ledger/export?code=3000')))
    expect(mocks.fetchLedger).toHaveBeenCalledWith(expect.anything(), { code: '3000', from: '2026-11-01', to: '2026-11-01' })
  })

  it("Trial Balance and its export: as at the office's today when no day is named", async () => {
    render(await asTheServer(() => TrialBalancePage({ searchParams: Promise.resolve({}) })))
    expect(mocks.fetchTrialBalance).toHaveBeenLastCalledWith(expect.anything(), { asOf: '2026-11-01', showZeroBalance: false })
    expect(screen.getAllByText(/1 November 2026/).length).toBeGreaterThan(0)
    await asTheServer(() => exportTrialBalance(new Request('https://portal.test/reports/trial-balance/export?format=xlsx')))
    expect(mocks.fetchTrialBalance).toHaveBeenLastCalledWith(expect.anything(), { asOf: '2026-11-01', showZeroBalance: false })
  })

  it("Debtor Aging: as of the office's today", async () => {
    render(await asTheServer(() => DebtorAgingPage({ searchParams: Promise.resolve({}) })))
    expect(screen.getByText(/as of 1 Nov 2026/)).toBeInTheDocument()
  })

  it("the CFO reports' month helpers, given no date, bound the office's month", async () => {
    const { startOfMonth, endOfMonth } = await import('@/lib/cfo-reports')
    await asTheServer(async () => {
      expect([startOfMonth(), endOfMonth()]).toEqual(['2026-11-01', '2026-11-30'])
      expect([startOfMonth('2026-02-14'), endOfMonth('2026-02-14')]).toEqual(['2026-02-01', '2026-02-28'])
    })
  })
})

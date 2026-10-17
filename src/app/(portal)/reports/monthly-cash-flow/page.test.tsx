import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — the month-by-month Cash Flow and Receipt & Payment per the
// user's Claude Design handoff (Phase 4 of the Finance revamp), for whoever
// reads the reports company-wide: the two views in the head, the cards, one
// control row, the matrix cut to From (an opening reads on its first month,
// a closing or a balance on its last).
// 2026-10-17 — nobody else: a reader short of Reports · View at All is
// refused (the Dept Manager's own-segment page went with the kind).

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  sides: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/gl-reports', () => ({ fetchAllJournalLines: async () => [], fetchCoaAccounts: async () => [] }))
vi.mock('@/lib/report-layouts', () => ({ readReportLayout: async () => null }))
vi.mock('@/lib/inter-billing-cash-flow', () => ({
  fetchInterBillingCashFlow: async () => null,
  interBillTransferAccount: { code: 'IB' },
  payrollCustodyAccount: { code: 'PC' },
}))
vi.mock('@/lib/cash-flow-custom', () => ({
  buildMonthlyCashFlowSides: mocks.sides,
  buildSideMatrixRows: (_side: unknown, _layout: unknown, _n: number, dir: string, label: string, totals: number[]) => [
    { key: `${dir}:cat`, label: `${dir} category`, depth: 0, kind: 'category', isParent: true, values: totals },
    { key: `${dir}:TOTAL`, label, depth: 0, kind: 'subtotal', values: totals },
  ],
}))
vi.mock('@/lib/monthly-rnp', () => ({
  fetchRnpInvoiceEvents: async () => [],
  buildRnpMatrixRows: () => [{ key: 'AR_OUTSTANDING', label: 'Outstanding', depth: 0, kind: 'subtotal', values: [900, 900, 700, 500] }],
}))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn() }), usePathname: () => '/reports/monthly-cash-flow', useSearchParams: () => new URLSearchParams() }))

import MonthlyCashFlowPage from './page'
import MonthlyReceiptPaymentPage from '../monthly-receipt-payment/page'

const COLUMNS = [
  { key: 'acc', label: 'Accumulated' },
  { key: '2026-10', label: 'Oct 2026' },
  { key: '2026-09', label: 'Sep 2026' },
  { key: '2026-08', label: 'Aug 2026' },
]
const card = (name: string) => screen.getByRole('group', { name })
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(FINANCE)
  mocks.createClient.mockResolvedValue({
    rpc: async () => ({ data: ['1010'], error: null }),
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      return q
    },
  })
  mocks.sides.mockReturnValue({
    columns: COLUMNS,
    inflow: [],
    outflow: [],
    inflowTotalByCol: [60000, 30000, 20000, 10000],
    outflowTotalByCol: [-45000, -20000, -15000, -10000],
    netChangeByCol: [15000, 10000, 5000, 0],
    openingByCol: [100000, 105000, 100000, 100000],
    closingByCol: [115000, 115000, 105000, 100000],
  })
})

describe('the month-by-month Cash Flow, company-wide', () => {
  it('heads with its views and shows opening, in, out, net and closing', async () => {
    render(await MonthlyCashFlowPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · CASH FLOW · JAN – OCT 2026')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cash Flow')
    expect(screen.getByRole('link', { name: 'Month by month' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Single month' })).toHaveAttribute('href', '/reports/cash-flow?period=2026-10')
    expect(card('Opening cash')).toHaveTextContent('RM 100,000.00')
    expect(card('Money in')).toHaveTextContent('RM 60,000.00')
    expect(card('Money out')).toHaveTextContent('RM (45,000.00)')
    expect(card('Net change')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Closing cash')).toHaveAttribute('data-tone', 'primary')
    expect(card('Closing cash')).toHaveTextContent('RM 115,000.00')
    // The handoff opens every report at L3 (2026-10-10).
    expect(within(screen.getByRole('group', { name: 'Report controls' })).getByRole('button', { name: 'L3' })).toHaveAttribute('aria-pressed', 'true')
    const titles = Array.from(document.querySelectorAll('.sheet-rpt tbody tr[data-kind="title"]')).map((tr) => tr.textContent)
    expect(titles).toEqual(['Money in', 'Money out'])
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:nth-child(2) th')).map((th) => th.textContent)).toEqual(['RM', 'RM', 'RM', 'RM'])
  })

  it('opens From on its own opening cash', async () => {
    render(await MonthlyCashFlowPage({ searchParams: Promise.resolve({ from: '2026-09' }) }))
    expect(card('Opening cash')).toHaveTextContent('RM 100,000.00')
    expect(card('Money in')).toHaveTextContent('RM 50,000.00')
    expect(card('Closing cash')).toHaveTextContent('RM 115,000.00')
  })
})

describe('the month-by-month Receipt & Payment, company-wide', () => {
  it('shows receipts, payments, the net and what is still unpaid', async () => {
    render(await MonthlyReceiptPaymentPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · RECEIPT & PAYMENT · JAN – OCT 2026')
    expect(screen.getByRole('link', { name: 'Month by month' })).toHaveAttribute('href', '/reports/monthly-receipt-payment?period=2026-10')
    expect(card('Receipts')).toHaveTextContent('RM 60,000.00')
    expect(card('Payments')).toHaveTextContent('RM (45,000.00)')
    expect(card('Net')).toHaveAttribute('data-tone', 'primary')
    expect(card('Net')).toHaveTextContent('RM 15,000.00')
    expect(card('Outstanding at month end')).toHaveTextContent('RM 900.00')
    // Each line as a % of the month's receipts (2026-10-10, the handoff).
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:nth-child(2) th')).map((th) => th.textContent).slice(0, 2)).toEqual(['RM', '%'])
  })
})

describe('the month-by-month Cash Flow and Receipt & Payment, a reader short of Reports · View at All', () => {
  it.each([
    ['Cash Flow', MonthlyCashFlowPage],
    ['Receipt & Payment', MonthlyReceiptPaymentPage],
  ])('finds no %s page, and reads nothing', async (_name, Page) => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 's', role: 'staff', permissions: ['dept_reports'] }))
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.sides).not.toHaveBeenCalled()
  })
})

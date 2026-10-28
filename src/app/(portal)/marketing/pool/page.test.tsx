import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-28 — the user, of Finance's Marketing - Cash Flow under Dept Pool: "我要exactly 给他们看这个part"; then "照这样
// 做：Marketing view 加一行，打开就是 Finance 那页 Marketing 的 P&L / Cash Flow，只有 Marketing，Excel/PDF 也给". The
// very page, for Marketing alone, read through the service role (the ledger opens to the treasury only).

const mocks = vi.hoisted(() => ({
  requireActionOn: vi.fn(),
  adminClient: vi.fn(),
  sessionClient: vi.fn(),
  buildPnlAccounts: vi.fn(),
  buildCustomPnlRows: vi.fn(),
  sides: vi.fn(),
  bridge: vi.fn(),
  openMarketingPoolRow: vi.fn(async () => ({ ok: true, lines: {} })),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/admin', () => ({ adminClient: mocks.adminClient }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.sessionClient }))
vi.mock('./actions', () => ({ openMarketingPoolRow: mocks.openMarketingPoolRow }))
vi.mock('@/lib/gl-reports', () => ({ fetchAllJournalLines: async () => [], fetchCoaAccounts: async () => [] }))
vi.mock('@/lib/consolidation', () => ({ fetchInterBillingElimination: vi.fn(), eliminateInterBilling: (l: unknown) => l }))
vi.mock('@/lib/report-layouts', () => ({ readReportLayout: async () => null }))
vi.mock('@/lib/pnl-custom', () => ({
  buildPnlAccounts: mocks.buildPnlAccounts,
  buildCustomPnlRows: mocks.buildCustomPnlRows,
  defaultPnlLayout: () => ({ categories: [] }),
}))
vi.mock('@/lib/inter-billing-cash-flow', () => ({
  fetchInterBillingCashFlow: mocks.bridge,
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
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketing/pool',
  useSearchParams: () => new URLSearchParams(),
}))

import MarketingPoolPage from './page'

const COLUMNS = [
  { key: 'acc', label: 'Accumulated' },
  { key: '2026-10', label: 'Oct 2026' },
  { key: '2026-09', label: 'Sep 2026' },
]
const ACCOUNTS = [
  { code: '5012', name: 'Revenue - Lead Gen', defaultCategory: 'revenue', values: [46000, 23000, 23000], ancestry: [] },
  { code: '9094', name: 'Office Rental', defaultCategory: 'expense', values: [-9300, -4555, -4745], ancestry: [] },
]
const ROWS = [
  { key: 'revenue:5012', label: 'Revenue - Lead Gen', code: '5012', depth: 1, kind: 'account', values: ACCOUNTS[0].values },
  { key: 'cat:revenue', label: 'Revenue', depth: 0, kind: 'subtotal', tone: 'auto', values: ACCOUNTS[0].values },
  { key: 'expense:9094', label: 'Office Rental', code: '9094', depth: 1, kind: 'account', values: ACCOUNTS[1].values },
  { key: 'cat:expense', label: 'Expenses', depth: 0, kind: 'subtotal', tone: 'auto', values: ACCOUNTS[1].values },
  { key: 'NET_INCOME', label: 'Net Income / (Loss)', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: [36700, 18445, 18255] },
]

const page = (sp: Record<string, string> = {}) => MarketingPoolPage({ searchParams: Promise.resolve(sp) })
const views = () => screen.getByRole('group', { name: 'Statement' })
const ADMIN = { rpc: async () => ({ data: ['3000'], error: null }) }
const MANAGER = withActions({ id: 'sj', role: 'staff', permissions: ['marketing', 'marketing_pool'] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue(MANAGER)
  mocks.adminClient.mockReturnValue(ADMIN)
  mocks.bridge.mockResolvedValue({ lines: [] })
  mocks.buildPnlAccounts.mockReturnValue({ columns: COLUMNS, accounts: ACCOUNTS, salesByColumn: [46000, 23000, 23000] })
  mocks.buildCustomPnlRows.mockReturnValue(ROWS)
  mocks.sides.mockReturnValue({
    columns: COLUMNS,
    inflow: [],
    outflow: [],
    inflowTotalByCol: [110513.22, 40422.2, 70091.02],
    outflowTotalByCol: [-136569.97, -68716.92, -67853.05],
    netChangeByCol: [-26056.75, -28294.72, 2237.97],
    openingByCol: [-35683.85, -33445.88, -35683.85],
    closingByCol: [-61740.6, -61740.6, -33445.88],
  })
})

describe('Marketing’s own pool', () => {
  it('asks for its own box, on its own page', async () => {
    render(await page())
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/marketing/pool', 'marketing_pool', 'view')
  })

  it('is Finance’s Marketing page: the Cash Flow first, the P&L a click away on this page', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DEPARTMENTS · MARKETING · JAN – OCT 2026')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marketing - Cash Flow')
    expect(within(views()).getByRole('link', { name: 'Cash Flow' })).toHaveAttribute('aria-current', 'page')
    expect(within(views()).getByRole('link', { name: 'P&L' })).toHaveAttribute('href', '/marketing/pool?view=pnl')
  })

  it('reads Marketing’s segment alone, through the service role — never the session’s client', async () => {
    render(await page())
    expect(mocks.adminClient).toHaveBeenCalled()
    expect(mocks.sessionClient).not.toHaveBeenCalled()
    expect(mocks.sides.mock.calls[0][3]).toMatchObject({ year: 2026, throughMonth: 10, segment: ['marketing'] })
  })

  it('takes no segment from the address', async () => {
    render(await page({ view: 'pnl', segment: 'hr', seg: 'hr' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marketing - Profit & Loss')
    expect(mocks.buildPnlAccounts.mock.calls[0][2]).toMatchObject({ segment: ['marketing'] })
  })

  it('keeps the period across the switch, and its files follow the statement and the period', async () => {
    render(await page({ view: 'pnl', period: '2026-09', from: '2026-04' }))
    expect(within(views()).getByRole('link', { name: 'Cash Flow' })).toHaveAttribute('href', '/marketing/pool?period=2026-09&from=2026-04')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/marketing/pool/export?view=pnl&format=xlsx&period=2026-09&from=2026-04')
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/marketing/pool/export?view=pnl&format=pdf&period=2026-09&from=2026-04')
  })

  it('draws no files without the Export the View carries', async () => {
    const actions = Object.fromEntries(Object.entries(MANAGER.actions).filter(([cell]) => cell !== 'marketing_pool.export'))
    mocks.requireActionOn.mockResolvedValue({ ...MANAGER, actions })
    render(await page())
    expect(screen.queryByRole('link', { name: 'Excel' })).toBeNull()
  })
})

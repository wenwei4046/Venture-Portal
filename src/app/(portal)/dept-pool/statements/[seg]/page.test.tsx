import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — the user: 我要把每个 department 的 cash flow, P&L 放过来.
// Dept Pool lists Venture, Marketing, Finance, HR, Director Office, IT and
// Revenue Department; each opens its own page with a P&L | Cash Flow switch,
// month by month From – To — the very figures Reports shows with that
// segment picked, read through the same loader.

const fx = vi.hoisted(() => ({
  REGISTRY: [
    { id: 'hr', name: 'HR', segmentKey: 'hr', poolGlCode: '1050', billingModeKey: 'hr_attribution', isInternal: false },
    { id: 'mk', name: 'Marketing', segmentKey: 'marketing', poolGlCode: '1030', billingModeKey: 'marketing_project', isInternal: false },
    { id: 'it', name: 'IT', segmentKey: 'it', poolGlCode: '1100', billingModeKey: 'it_attribution', isInternal: false },
    { id: 'rd', name: 'Revenue Department', segmentKey: 'revenue_department', poolGlCode: '1090', billingModeKey: 'revenue_department_attribution', isInternal: false },
  ],
}))
const mocks = vi.hoisted(() => ({
  requireAction: vi.fn(),
  createClient: vi.fn(),
  buildPnlAccounts: vi.fn(),
  buildCustomPnlRows: vi.fn(),
  sides: vi.fn(),
  elim: vi.fn(),
  bridge: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('@/lib/auth', () => ({ requireAction: mocks.requireAction }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/gl-reports', () => ({ fetchAllJournalLines: async () => [], fetchCoaAccounts: async () => [] }))
vi.mock('@/lib/consolidation', () => ({ fetchInterBillingElimination: mocks.elim, eliminateInterBilling: (l: unknown) => l }))
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
vi.mock('@/lib/dept-registry', async (orig) => ({ ...(await orig<object>()), primedRegistryRows: () => fx.REGISTRY }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dept-pool/statements/marketing',
  useSearchParams: () => new URLSearchParams(),
}))

import DeptStatementPage from './page'

// Accumulated, then Oct … Jul (latest first), as the builders lay them out.
const COLUMNS = [
  { key: 'acc', label: 'Accumulated' },
  { key: '2026-10', label: 'Oct 2026' },
  { key: '2026-09', label: 'Sep 2026' },
  { key: '2026-08', label: 'Aug 2026' },
  { key: '2026-07', label: 'Jul 2026' },
]
const ACCOUNTS = [
  { code: '4000', name: 'Service fees', defaultCategory: 'revenue', values: [100000, 40000, 30000, 20000, 10000], ancestry: [] },
  { code: '6000', name: 'Office rental', defaultCategory: 'expense', values: [-20000, -5000, -5000, -5000, -5000], ancestry: [] },
]
const ROWS = [
  { key: '4000', label: '4000 Service fees', code: '4000', depth: 1, kind: 'account', values: ACCOUNTS[0].values },
  { key: 'NET_INCOME', label: 'Net Income / (Loss)', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: [80000, 35000, 25000, 15000, 5000] },
]

const page = (seg: string, sp: Record<string, string> = {}) =>
  DeptStatementPage({ params: Promise.resolve({ seg }), searchParams: Promise.resolve(sp) })
const card = (name: string) => screen.getByRole('group', { name })
const views = () => screen.getByRole('group', { name: 'Statement' })
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports', 'dept_pool'] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAction.mockResolvedValue(FINANCE)
  mocks.createClient.mockResolvedValue({ rpc: async () => ({ data: ['3000'], error: null }) })
  mocks.elim.mockResolvedValue(null)
  mocks.bridge.mockResolvedValue({ lines: [] })
  mocks.buildPnlAccounts.mockReturnValue({ columns: COLUMNS, accounts: ACCOUNTS, salesByColumn: [100000, 40000, 30000, 20000, 10000] })
  mocks.buildCustomPnlRows.mockReturnValue(ROWS)
  mocks.sides.mockReturnValue({
    columns: COLUMNS,
    inflow: [],
    outflow: [],
    inflowTotalByCol: [60000, 30000, 20000, 10000, 0],
    outflowTotalByCol: [-45000, -20000, -15000, -10000, 0],
    netChangeByCol: [15000, 10000, 5000, 0, 0],
    openingByCol: [100000, 105000, 100000, 100000, 100000],
    closingByCol: [115000, 115000, 105000, 100000, 100000],
  })
})

describe('a department’s own P&L under Dept Pool', () => {
  it('heads with the department and its period, the P&L picked', async () => {
    render(await page('marketing'))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DEPARTMENTS · MARKETING · JAN – OCT 2026')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marketing')
    expect(within(views()).getByRole('link', { name: 'P&L' })).toHaveAttribute('aria-current', 'page')
    expect(within(views()).getByRole('link', { name: 'Cash Flow' })).toHaveAttribute('href', '/dept-pool/statements/marketing?view=cash-flow')
  })

  it('reads the department’s P&L — the one Reports shows with it picked', async () => {
    render(await page('marketing'))
    expect(mocks.requireAction).toHaveBeenCalledWith('reports', 'view')
    expect(mocks.buildPnlAccounts).toHaveBeenCalledWith([], [], { year: 2026, throughMonth: 10, segment: ['marketing'] })
    // One segment is never the consolidated view: nothing is eliminated.
    expect(mocks.elim).not.toHaveBeenCalled()
    expect(card('Revenue · Oct (to date)')).toHaveTextContent('RM 40,000.00')
    expect(card('Net profit · accumulated')).toHaveTextContent('RM 80,000.00')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('MARKETING · JAN – OCT 2026')
  })

  it('has the period to choose but no Segment — the page is the department', async () => {
    render(await page('marketing'))
    const controls = screen.getByRole('group', { name: 'Report controls' })
    expect(within(controls).getByRole('combobox', { name: 'From' })).toHaveValue('2026-01')
    expect(within(controls).getByRole('combobox', { name: 'To' })).toHaveValue('2026-10')
    expect(within(controls).queryByRole('combobox', { name: 'Segment' })).toBeNull()
  })

  it('cuts the months to From and exports the department', async () => {
    render(await page('marketing', { period: '2026-09', from: '2026-03' }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('DEPARTMENTS · MARKETING · MAR – SEP 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/monthly-pnl/export?format=xlsx&period=2026-09&segment=marketing&from=2026-03')
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/reports/monthly-pnl/export?format=pdf&period=2026-09&segment=marketing&from=2026-03')
  })

  it('keeps the period across the switch', async () => {
    render(await page('hr', { period: '2026-09', from: '2026-03' }))
    expect(within(views()).getByRole('link', { name: 'Cash Flow' })).toHaveAttribute('href', '/dept-pool/statements/hr?view=cash-flow&period=2026-09&from=2026-03')
  })

  it('reads Venture as corporate with treasury, as Reports does', async () => {
    render(await page('venture'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Venture')
    expect(mocks.buildPnlAccounts).toHaveBeenCalledWith([], [], expect.objectContaining({ segment: ['corporate', 'treasury'] }))
  })

  it('opens a department added since, from the registry', async () => {
    render(await page('revenue-department'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Revenue Department')
    expect(mocks.buildPnlAccounts).toHaveBeenCalledWith([], [], expect.objectContaining({ segment: ['revenue_department'] }))
  })
})

describe('a department’s own Cash Flow under Dept Pool', () => {
  it('switches to the Cash Flow, with the bridge that ties it to the pool', async () => {
    render(await page('marketing', { view: 'cash-flow' }))
    expect(within(views()).getByRole('link', { name: 'Cash Flow' })).toHaveAttribute('aria-current', 'page')
    expect(within(views()).getByRole('link', { name: 'P&L' })).toHaveAttribute('href', '/dept-pool/statements/marketing')
    expect(mocks.sides).toHaveBeenCalledWith([], [{ code: 'IB' }, { code: 'PC' }], new Set(['3000']), { year: 2026, throughMonth: 10, segment: ['marketing'] })
    expect(mocks.bridge).toHaveBeenCalled()
    expect(mocks.buildPnlAccounts).not.toHaveBeenCalled()
    expect(card('Opening cash')).toHaveTextContent('RM 100,000.00')
    expect(card('Closing cash')).toHaveTextContent('RM 115,000.00')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('MARKETING · JAN – OCT 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/monthly-cash-flow/export?format=xlsx&period=2026-10&segment=marketing')
  })
})

describe('who and what the page is for', () => {
  it('is no page for a department it does not list', async () => {
    await expect(page('director')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.buildPnlAccounts).not.toHaveBeenCalled()
  })

  it('is no page for somebody who reads only their own department’s pool', async () => {
    mocks.requireAction.mockResolvedValue(withActions({ id: 'm', role: 'dept_manager', permissions: ['dept_reports', 'dept_pool'] }))
    await expect(page('marketing')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.buildPnlAccounts).not.toHaveBeenCalled()
  })
})

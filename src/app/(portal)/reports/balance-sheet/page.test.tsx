import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-09 — the Balance Sheet and the Trial Balance per the user's Claude
// Design handoff (Phase 4 of the Finance revamp): the date in the eyebrow,
// Excel and PDF in the head, the cards (assets, liabilities, equity and the
// check; debit, credit and the difference), the Balance Sheet's controls on
// one row with "As at", the Trial Balance's accounts in a table closing on
// its totals.

const mocks = vi.hoisted(() => ({ buildBalanceSheet: vi.fn(), fetchTrialBalance: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: async () => ({ role: 'finance', permissions: ['reports'] }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const rows = [
        { code: '1000', name: 'Current assets', parent_code: null },
        { code: '1010', name: 'Cash — Hong Leong', parent_code: '1000' },
        { code: '1020', name: 'Cash — Alliance', parent_code: '1000' },
        { code: '2100', name: 'Fund sources', parent_code: null },
      ]
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res)
      return q
    },
  }),
}))
vi.mock('@/lib/gl-reports', () => ({
  applyGlRefs: (l: unknown) => l,
  buildBalanceSheet: mocks.buildBalanceSheet,
  fetchAllJournalLines: async () => [],
  fetchCoaAccounts: async () => [],
  fetchGlRefs: async () => new Map(),
  monthPeriod: (ym: string) => ({ from: `${ym}-01`, to: `${ym}-31` }),
}))
vi.mock('@/lib/gl-report-blocks', async (orig) => ({ ...(await orig<object>()), balanceSheetBlocks: () => [] }))
vi.mock('@/lib/cfo-reports', async (orig) => ({ ...(await orig<object>()), fetchTrialBalance: mocks.fetchTrialBalance }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10', officeToday: () => '2026-10-09' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/reports', useSearchParams: () => new URLSearchParams() }))

import BalanceSheetPage from './page'
import TrialBalancePage from '../trial-balance/page'

const sect = (current: number) => ({ key: 'x', label: 'x', current, previous: 0, nodes: [] })
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildBalanceSheet.mockReturnValue({
    fixedAssets: sect(0), assets: sect(6800000), liabilities: sect(4500000), equity: sect(1000000),
    earnings: { current: 1300000, previous: 0 },
    totalAssets: { current: 6800000, previous: 0 }, totalLiabEquity: { current: 6800000, previous: 0 }, check: { current: 0, previous: 0 },
  })
  mocks.fetchTrialBalance.mockResolvedValue({
    rows: [
      { code: '1010', name: 'Cash — Hong Leong', type: 'asset', debit: 1500000, credit: 0 },
      { code: '1020', name: 'Cash — Alliance', type: 'asset', debit: 595750, credit: 0 },
      { code: '2100', name: 'Fund sources', type: 'liability', debit: 0, credit: 2095750 },
    ],
    totals: { debit: 2095750, credit: 2095750 },
    reconciles: true,
  })
})

describe('the Balance Sheet on the sheet', () => {
  it('heads with the date, shows four cards and the controls with As at', async () => {
    render(await BalanceSheetPage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · BALANCE SHEET · AS AT 31 OCT 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/balance-sheet/export?format=xlsx&period=2026-10')
    expect(card('Total assets')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total assets')).toHaveTextContent('RM 6,800,000.00')
    expect(card('Total liabilities')).toHaveTextContent('RM 4,500,000.00')
    expect(card('Equity')).toHaveTextContent('RM 2,300,000.00')
    expect(card('Check')).toHaveTextContent('Balanced')
    expect(within(screen.getByRole('group', { name: 'Report controls' })).getByLabelText('As at')).toHaveValue('2026-10')
    expect(screen.queryByText("Segment only · won't balance")).toBeNull()
  })

  // 2026-10-12: one segment's slice is not expected to balance (equity and
  // liabilities mostly sit in the corporate segment) — a chip says so, the
  // sentence went with the page's other descriptions.
  it('says in a chip that one segment alone will not balance', async () => {
    render(await BalanceSheetPage({ searchParams: Promise.resolve({ segment: 'corporate' }) }))
    expect(document.querySelector('.page-head .chip')).toHaveTextContent("Segment only · won't balance")
    expect(screen.queryByText(/expected to be off/)).toBeNull()
  })
})

describe('the Trial Balance on the sheet', () => {
  it('shows debit, credit and the difference, and the accounts closing on their totals', async () => {
    render(await TrialBalancePage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · TRIAL BALANCE · AS AT 9 OCTOBER 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/trial-balance/export?format=xlsx&as_of=2026-10-09')
    expect(card('Total debit')).toHaveTextContent('RM 2,095,750.00')
    expect(card('Total debit')).toHaveTextContent('3 accounts')
    expect(card('Total credit')).toHaveTextContent('RM 2,095,750.00')
    expect(card('Difference')).toHaveAttribute('data-tone', 'primary')
    expect(card('Difference')).toHaveTextContent('RM 0.00')
    const table = screen.getByRole('heading', { level: 2, name: 'Trial balance' }).closest('section') as HTMLElement
    expect(within(table).getByRole('link', { name: '1010 · Cash — Hong Leong' })).toHaveAttribute('href', '/reports/ledger?code=1010')
    expect(table.querySelector('tfoot')).toHaveTextContent('Total')
  })

  it('groups the accounts by type under their parents, with levels and Find', async () => {
    render(await TrialBalancePage({ searchParams: Promise.resolve({}) }))
    const table = screen.getByRole('heading', { level: 2, name: 'Trial balance' }).closest('section') as HTMLElement
    const row = (text: string) => within(table).getByText(text).closest('tr') as HTMLElement
    expect(row('Assets')).toHaveClass('tb-block')
    expect(row('Total assets')).toHaveTextContent('2,095,750.00')
    expect(row('Total liabilities')).toHaveTextContent('2,095,750.00')
    expect(row('Current assets')).toBeInTheDocument()
    expect(row('Subtotal')).toHaveTextContent('2,095,750.00')

    const controls = within(table).getByRole('group', { name: 'Report controls' })
    expect(within(controls).getByLabelText('As at')).toHaveValue('2026-10-09')
    expect(within(controls).getByRole('button', { name: 'L3' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.change(within(controls).getByRole('searchbox', { name: 'Find account' }), { target: { value: 'alliance' } })
    expect(within(controls).getByText('1 match')).toBeInTheDocument()
    expect(within(table).getByRole('link', { name: '1020 · Cash — Alliance' }).closest('tr')).toHaveClass('search-row-hit')

    fireEvent.change(within(controls).getByRole('searchbox', { name: 'Find account' }), { target: { value: '' } })
    fireEvent.click(within(controls).getByRole('button', { name: 'L1' }))
    expect(within(table).queryByRole('link', { name: '1010 · Cash — Hong Leong' })).toBeNull()
    expect(within(table).queryByText('Current assets')).toBeNull()
    expect(row('Total assets')).toBeInTheDocument()

    fireEvent.click(within(controls).getByRole('button', { name: 'L2' }))
    expect(row('Current assets')).toHaveTextContent('2,095,750.00')
    expect(within(table).queryByRole('link', { name: '1010 · Cash — Hong Leong' })).toBeNull()
  })

  // 2026-10-10 — the handoff puts Segment on the control row.
  it('reads one segment, and exports it', async () => {
    render(await TrialBalancePage({ searchParams: Promise.resolve({ segment: 'corporate' }) }))
    expect(mocks.fetchTrialBalance).toHaveBeenCalledWith(expect.anything(), { asOf: '2026-10-09', showZeroBalance: false, segment: ['corporate', 'treasury'] })
    const table = screen.getByRole('heading', { level: 2, name: 'Trial balance' }).closest('section') as HTMLElement
    const controls = within(table).getByRole('group', { name: 'Report controls' })
    expect(within(controls).getByRole('combobox', { name: 'Segment' })).toHaveValue('corporate')
    expect(table.querySelector('.sect-head .count')).toHaveTextContent('VENTURE (OFFICE) · AS AT 9 OCTOBER 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/trial-balance/export?format=xlsx&as_of=2026-10-09&segment=corporate')
  })

  it('reads every segment by default', async () => {
    render(await TrialBalancePage({ searchParams: Promise.resolve({}) }))
    expect(mocks.fetchTrialBalance).toHaveBeenCalledWith(expect.anything(), { asOf: '2026-10-09', showZeroBalance: false, segment: undefined })
    const controls = screen.getByRole('group', { name: 'Report controls' })
    expect(within(controls).getByRole('combobox', { name: 'Segment' })).toHaveValue('')
  })
})

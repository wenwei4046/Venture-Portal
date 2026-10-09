import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// 2026-10-09 — the Balance Sheet and the Trial Balance per the user's Claude
// Design handoff (Phase 4 of the Finance revamp): the date in the eyebrow,
// Excel and PDF in the head, the cards (assets, liabilities, equity and the
// check; debit, credit and the difference), the Balance Sheet's controls on
// one row with "As at", the Trial Balance's accounts in a table closing on
// its totals.

const mocks = vi.hoisted(() => ({ buildBalanceSheet: vi.fn(), fetchTrialBalance: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: async () => ({ role: 'finance', permissions: ['reports'] }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
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
      { code: '1010', name: 'Cash — Hong Leong', debit: 2095750, credit: 0 },
      { code: '2100', name: 'Fund sources', debit: 0, credit: 2095750 },
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
  })
})

describe('the Trial Balance on the sheet', () => {
  it('shows debit, credit and the difference, and the accounts closing on their totals', async () => {
    render(await TrialBalancePage({ searchParams: Promise.resolve({}) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · TRIAL BALANCE · AS AT 9 OCTOBER 2026')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/trial-balance/export?format=xlsx&as_of=2026-10-09')
    expect(card('Total debit')).toHaveTextContent('RM 2,095,750.00')
    expect(card('Total debit')).toHaveTextContent('2 accounts')
    expect(card('Total credit')).toHaveTextContent('RM 2,095,750.00')
    expect(card('Difference')).toHaveAttribute('data-tone', 'primary')
    expect(card('Difference')).toHaveTextContent('RM 0.00')
    const table = screen.getByRole('heading', { level: 2, name: 'Trial balance' }).closest('section') as HTMLElement
    expect(within(table).getByRole('link', { name: '1010 · Cash — Hong Leong' })).toHaveAttribute('href', '/reports/ledger?code=1010')
    expect(table.querySelector('tfoot')).toHaveTextContent('Total')
  })
})

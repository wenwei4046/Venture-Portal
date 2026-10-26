import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — the Monthly P&L per the user's Claude Design handoff (Phase 4
// of the Finance revamp), for whoever reads the reports company-wide: the
// period in the eyebrow, Single month · P&L / Monthly P&L in the head with
// Edit layout, Excel and PDF; four cards; Period From – To, Find account,
// Segment and Detail level on one row; the consolidated note; the matrix cut
// to From with its months separated.
// 2026-10-17 — nobody else: a reader short of Reports · View at All is
// refused (the Dept Manager's own-segment page went with the kind).

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  buildPnlAccounts: vi.fn(),
  buildCustomPnlRows: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  openReportRow: vi.fn(async () => ({ ok: true, lines: [] })),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('../drill-actions', () => ({ openReportRow: mocks.openReportRow }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/gl-reports', () => ({ fetchAllJournalLines: async () => [], fetchCoaAccounts: async () => [] }))
vi.mock('@/lib/consolidation', () => ({ fetchInterBillingElimination: async () => null, eliminateInterBilling: (l: unknown) => l }))
vi.mock('@/lib/report-layouts', () => ({ readReportLayout: async () => null }))
vi.mock('@/lib/pnl-custom', () => ({
  buildPnlAccounts: mocks.buildPnlAccounts,
  buildCustomPnlRows: mocks.buildCustomPnlRows,
  defaultPnlLayout: () => ({ categories: [] }),
}))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn() }), usePathname: () => '/reports/monthly-pnl', useSearchParams: () => new URLSearchParams() }))

import MonthlyPnlPage from './page'

// Accumulated, then Oct … Jul (latest first), as the builder lays them out.
const COLUMNS = [
  { key: 'acc', label: 'Accumulated' },
  { key: '2026-10', label: 'Oct 2026' },
  { key: '2026-09', label: 'Sep 2026' },
  { key: '2026-08', label: 'Aug 2026' },
  { key: '2026-07', label: 'Jul 2026' },
]
const ACCOUNTS = [
  { code: '4000', name: 'Service fees', defaultCategory: 'revenue', values: [100000, 40000, 30000, 20000, 10000], ancestry: [] },
  { code: '5000', name: 'Staff cost', defaultCategory: 'cost', values: [-50000, -20000, -15000, -10000, -5000], ancestry: [] },
  { code: '6000', name: 'Office rental', defaultCategory: 'expense', values: [-20000, -5000, -5000, -5000, -5000], ancestry: [] },
  { code: '7000', name: 'Bank interest', defaultCategory: 'other_income', values: [400, 100, 100, 100, 100], ancestry: [] },
]
const ROWS = [
  { key: '4000', label: '4000 Service fees', code: '4000', depth: 1, kind: 'account', values: ACCOUNTS[0].values },
  { key: 'cat:revenue', label: 'Revenue', depth: 0, kind: 'subtotal', tone: 'auto', values: ACCOUNTS[0].values },
  { key: 'NET_INCOME', label: 'Net Income / (Loss)', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: [30400, 15100, 10100, 5100, 100] },
]

const page = (sp: Record<string, string> = {}) => MonthlyPnlPage({ searchParams: Promise.resolve(sp) })
const card = (name: string) => screen.getByRole('group', { name })
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['reports', 'dept_reports'] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(FINANCE)
  mocks.createClient.mockResolvedValue({})
  mocks.buildPnlAccounts.mockReturnValue({ columns: COLUMNS, accounts: ACCOUNTS, salesByColumn: [100000, 40000, 30000, 20000, 10000] })
  mocks.buildCustomPnlRows.mockReturnValue(ROWS)
})

describe('the Monthly P&L, company-wide', () => {
  it('heads with the period, the two views, Edit layout, Excel and PDF', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · P&L · JAN – OCT 2026')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('P&L')
    expect(screen.getByRole('link', { name: 'Monthly P&L' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Single month · P&L' })).toHaveAttribute('href', '/reports/income-statement?period=2026-10')
    expect(screen.getByRole('link', { name: 'Edit layout' })).toHaveAttribute('href', '/reports/monthly-pnl/layout')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/monthly-pnl/export?format=xlsx&period=2026-10')
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/reports/monthly-pnl/export?format=pdf&period=2026-10')
  })

  it('shows the month and the accumulated in four cards', async () => {
    render(await page())
    expect(card('Revenue · Oct (to date)')).toHaveTextContent('RM 40,000.00')
    expect(card('Revenue · Oct (to date)')).toHaveTextContent('Accumulated RM 100,000.00')
    expect(card('Expenses · Oct (to date)')).toHaveTextContent('RM 25,000.00')
    expect(card('Expenses · Oct (to date)')).toHaveTextContent('Accumulated RM 70,000.00')
    expect(card('Net profit · accumulated')).toHaveAttribute('data-tone', 'primary')
    expect(card('Net profit · accumulated')).toHaveTextContent('RM 30,400.00')
    expect(card('Net margin · accumulated')).toHaveTextContent('30.4%')
  })

  // 2026-10-12 — the consolidated note is gone (the user: descriptions make
  // the view messy); the Segment choice already reads "All segments
  // (consolidated)".
  it('puts the period, find, segment and level on one row, with no consolidated note', async () => {
    render(await page())
    const row = screen.getByRole('group', { name: 'Report controls' })
    expect(within(row).getByRole('combobox', { name: 'From' })).toHaveValue('2026-01')
    expect(within(row).getByRole('combobox', { name: 'To' })).toHaveValue('2026-10')
    expect(within(row).getByRole('combobox', { name: 'Segment' })).toHaveValue('')
    expect(within(row).getByRole('searchbox', { name: 'Find account by code or name' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'L3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/Consolidated view eliminates inter-billing/)).toBeNull()
  })

  // 2026-10-10 — the handoff's table: Accumulated a shade darker, the current
  // month peach, RM and % under each; the category titled in blue over its
  // accounts and closed on "Total …".
  it('draws the handoff’s table', async () => {
    render(await page())
    const heads = Array.from(document.querySelectorAll('.sheet-rpt thead tr:first-child th')).slice(1)
    expect(heads.map((th) => th.textContent)).toEqual(['Accumulated', 'Oct 2026', 'Sep 2026', 'Aug 2026', 'Jul 2026'])
    expect(heads[0]).toHaveClass('is-acc')
    expect(heads[1]).toHaveClass('is-now')
    expect(Array.from(document.querySelectorAll('.sheet-rpt thead tr:nth-child(2) th')).map((th) => th.textContent).slice(0, 4)).toEqual(['RM', '%', 'RM', '%'])
    const kinds = Array.from(document.querySelectorAll('.sheet-rpt tbody tr')).map((tr) => [(tr as HTMLElement).dataset.kind, tr.querySelector('td')?.textContent])
    // 2026-10-24 — an account opens (▸) onto its months, then a month onto its lines.
    expect(kinds).toEqual([
      ['title', 'Revenue'],
      ['group', '▸4000 Service fees'],
      ['total', 'Total Revenue'],
      ['total', 'Net Income / (Loss)'],
    ])
  })

  it('reads an opened account’s lines through its own action, over the months shown', async () => {
    render(await page({ segment: 'marketing' }))
    fireEvent.click(screen.getByRole('button', { name: /4000 Service fees/ }))
    expect(mocks.openReportRow).toHaveBeenCalledWith('monthly-pnl', {
      report: 'pnl', segment: 'marketing', from: '2026-07', to: '2026-10', rows: [{ code: '4000', side: null }],
    })
  })

  it('cuts the matrix to From, Accumulated over the months kept', async () => {
    render(await page({ from: '2026-09', period: '2026-10' }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · P&L · SEP – OCT 2026')
    const heads = Array.from(document.querySelectorAll('thead tr:first-child th')).map((th) => th.textContent)
    expect(heads.slice(1)).toEqual(['Accumulated', 'Oct 2026', 'Sep 2026'])
    expect(card('Revenue · Oct (to date)')).toHaveTextContent('Accumulated RM 70,000.00')
    expect(card('Net profit · accumulated')).toHaveTextContent('RM 25,200.00')
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/monthly-pnl/export?format=xlsx&period=2026-10&from=2026-09')
  })
})

describe('the Monthly P&L, a reader short of Reports · View at All', () => {
  it('is not found, and nothing is read', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 's', role: 'staff', permissions: ['dept_reports'] }))
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.buildPnlAccounts).not.toHaveBeenCalled()
  })
})

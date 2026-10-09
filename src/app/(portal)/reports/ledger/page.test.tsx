import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// 2026-10-09 — the General Ledger per the user's Claude Design handoff
// (Phase 4 of the Finance revamp): the period in the eyebrow, a line of what
// the page is, Select accounts… / Excel / PDF in the head (the exports for
// whatever is picked — all accounts when none is), then one table per account
// under its own heading: an Opening balance row, the lines (the journal type
// a chip, the department named), and a Closing balance row.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), fetchLedgers: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/cfo-reports', () => ({ fetchLedgers: mocks.fetchLedgers }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import LedgerPage from './page'

const line = (entryDate: string, journalType: string, ref: string, segment: string, description: string, debit: number, credit: number, runningBalance: number) => ({
  entryDate, entryNo: ref, description, accountDesc: '1010 · Cash at Bank — Hong Leong', journalType, ref, segment, debit, credit, runningBalance,
})
const LEDGERS = [
  {
    code: '1010', accountName: 'Cash at Bank — Hong Leong', accountType: 'asset', from: '2026-10-01', to: '2026-10-31',
    openingBalance: 1240500, closingBalance: 1279500, periodTotals: { debit: 54000, credit: 15000 },
    lines: [
      { entryDate: '', entryNo: '', description: 'BALANCE B/F', accountDesc: '', journalType: '', ref: '', segment: '', debit: 0, credit: 0, runningBalance: 1240500 },
      line('2026-10-01', 'OR', 'HV-OR-202610-0009', 'hr', 'HR shared service — Q3', 54000, 0, 1294500),
      line('2026-10-03', 'PV', 'HV-PV-202610-0038', 'corporate', 'Office renovation deposit', 0, 15000, 1279500),
    ],
  },
  {
    code: '5027', accountName: 'Interest Income - Loans', accountType: 'revenue', from: '2026-10-01', to: '2026-10-31',
    openingBalance: -298460, closingBalance: -306623.33, periodTotals: { debit: 0, credit: 8163.33 },
    lines: [
      { entryDate: '', entryNo: '', description: 'BALANCE B/F', accountDesc: '', journalType: '', ref: '', segment: '', debit: 0, credit: 0, runningBalance: -298460 },
      line('2026-10-06', 'JV', 'HV-JV-2610-024', 'treasury', 'HC term loan interest accrual — Oct', 0, 8163.33, -306623.33),
    ],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['reports'] })
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) q[m] = () => q
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
  mocks.createClient.mockResolvedValue({ from: () => q })
  mocks.fetchLedgers.mockResolvedValue(LEDGERS)
})

const page = (sp: Record<string, string> = {}) => LedgerPage({ searchParams: Promise.resolve({ from: '2026-10-01', to: '2026-10-31', ...sp }) })
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement

describe('the General Ledger on the sheet', () => {
  it('heads with the period, what it is, and Select accounts / Excel / PDF for all accounts', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · GENERAL LEDGER · 01 – 31 OCTOBER 2026')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ledger')
    expect(screen.getByText('Per-account journal lines with running balance over a period. Pick accounts, or leave empty for all.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select accounts…' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/ledger/export?format=xlsx&from=2026-10-01&to=2026-10-31')
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/reports/ledger/export?format=pdf&from=2026-10-01&to=2026-10-31')
  })

  it('exports the accounts picked', async () => {
    render(await page({ codes: '1010,5027' }))
    expect(screen.getByRole('link', { name: 'Excel' })).toHaveAttribute('href', '/reports/ledger/export?format=xlsx&codes=1010%2C5027&from=2026-10-01&to=2026-10-31')
  })

  it('draws one table per account: opening, the lines, closing', async () => {
    render(await page())
    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual(['1010 · Cash at Bank — Hong Leong', '5027 · Interest Income - Loans'])
    const cash = section('1010 · Cash at Bank — Hong Leong')
    expect(within(cash).getByText('2 LINES')).toBeInTheDocument()
    const rows = cash.querySelectorAll('tbody tr:not(.lt-detail)')
    expect(rows[0]).toHaveTextContent('Opening balance')
    expect(rows[0]).toHaveTextContent('1 Oct 2026')
    expect(rows[0]).toHaveTextContent('1,240,500.00 Dr')
    const hr = within(cash).getByText('HR shared service — Q3').closest('tr') as HTMLElement
    expect(within(hr).getByText('OR').closest('.chip')).toBeInTheDocument()
    expect(hr).toHaveTextContent('HV-OR-202610-0009')
    expect(hr).toHaveTextContent('HR')
    expect(within(cash).getByText('Office renovation deposit').closest('tr')).toHaveTextContent('Venture')
    const foot = cash.querySelector('tfoot') as HTMLElement
    expect(foot).toHaveTextContent('Closing balance')
    expect(foot).toHaveTextContent('54,000.00')
    expect(foot).toHaveTextContent('15,000.00')
    expect(foot).toHaveTextContent('1,279,500.00 Dr')
    expect(section('5027 · Interest Income - Loans').querySelector('tfoot')).toHaveTextContent('306,623.33 Cr')
  })
})

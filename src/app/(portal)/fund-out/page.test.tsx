import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Fund OUT per the user's Claude Design handoff (Phase 3 of the
// Finance revamp): five cards — what is lent out, the weighted rate, the
// spread over the cost of funds, what matures within 30 days, what is
// overdue — and the status tabs counted, an Overdue tab among them (an active
// loan with an open record on the Overdue page).

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/office-time', () => ({ officeToday: () => '2026-10-09', officeTime: (at?: string) => dayjs(at), officeMonth: () => '2026-10' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('./_components/LoansTable', () => ({
  default: (p: { rows: Array<{ companyName: string; overdue?: boolean }> }) => (
    <pre data-testid="table">{p.rows.map((r) => `${r.companyName}${r.overdue ? '!' : ''}`).join(',')}</pre>
  ),
}))
vi.mock('./_components/ExportCSVButton', () => ({ default: () => <button type="button">Export CSV</button> }))

import FundOutPage from './page'

const loan = (id: string, company_id: string, status: string, principal: number, effective_rate: number, over: Record<string, unknown> = {}) => ({
  id, company_id, status, principal, effective_rate, base_rate: 0.005, risk_premium: effective_rate - 0.005, tenure_months: 12,
  disbursement_date: '2026-01-05', repayment_terms: 'EMI 分期', created_at: '2026-01-02T03:00:00Z', ...over,
})
const LOANS = [
  loan('l1', 'co-car', 'active', 100000, 0.02),
  loan('l2', 'co-hk', 'active', 50000, 0.04, { disbursement_date: '2025-10-20' }), // matures 20 Oct 2026
  loan('l3', 'co-car', 'pending_approval', 30000, 0.02),
  loan('l4', 'co-hk', 'fully_repaid', 20000, 0.02),
]

function database() {
  const tables: Record<string, unknown[]> = {
    loans: LOANS,
    companies: [{ id: 'co-car', name: 'Carres', short_code: 'CAR' }, { id: 'co-hk', name: 'Hookka', short_code: 'HK' }],
    loan_outstanding: [
      { loan_id: 'l1', outstanding: 80000, total_principal_paid: 20000, total_interest_paid: 4000 },
      { loan_id: 'l2', outstanding: 40000, total_principal_paid: 10000, total_interest_paid: 2000 },
    ],
    overdue_records: [{ loan_id: 'l2' }],
    fund_sources: [{ amount: 200000, cost_rate: 0.01 }],
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: tables[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
  })
}

const card = (name: string) => screen.getByRole('group', { name })
const page = (status?: string) => FundOutPage({ searchParams: Promise.resolve({ status }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  database()
})

describe('Fund OUT on the sheet', () => {
  it('sums the book in five cards', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · CAPITAL OUT')
    expect(card('Total outstanding')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total outstanding')).toHaveTextContent('RM 120,000.00')
    expect(card('Total outstanding')).toHaveTextContent('2 active · 1 overdue · 1 repaid · 1 pending approval')
    // (80k × 2% + 40k × 4%) ÷ 120k = 2.667%; income 1,600 + 1,600.
    expect(card('Weighted effective rate')).toHaveTextContent('2.667% /mo')
    expect(card('Weighted effective rate')).toHaveTextContent('Monthly interest income RM 3,200.00')
    expect(card('Net spread')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Net spread')).toHaveTextContent('1.667% /mo')
    expect(card('Net spread')).toHaveTextContent('Over 1.000% cost of funds')
    expect(card('Maturing in 30 days')).toHaveAttribute('data-tone', 'wait')
    expect(card('Maturing in 30 days')).toHaveTextContent('1')
    expect(card('Maturing in 30 days')).toHaveTextContent('RM 40,000.00')
    // The Overdue card is the way to the Overdue page.
    const overdue = screen.getByRole('link', { name: 'Overdue' })
    expect(overdue).toHaveAttribute('href', '/overdue')
    expect(overdue).toHaveAttribute('data-tone', 'danger')
    expect(overdue).toHaveTextContent('RM 40,000.00')
    expect(overdue).toHaveTextContent('1 loan · see Overdue')
    expect(screen.getByRole('link', { name: 'Record new loan' })).toHaveAttribute('href', '/fund-out/new')
  })

  it('counts the tabs, Overdue among them, and lists the overdue loans on it', async () => {
    render(await page('overdue'))
    const count = (name: RegExp) => screen.getByRole('button', { name }).querySelector('[data-tab-count]')?.textContent
    expect(count(/^Pending/)).toBe('1')
    expect(count(/^Active/)).toBe('2')
    expect(count(/^Overdue/)).toBe('1')
    expect(count(/^Repaid/)).toBe('1')
    expect(count(/^All/)).toBe('4')
    expect(screen.getByTestId('table')).toHaveTextContent('Hookka!')
    expect(screen.getByTestId('table')).not.toHaveTextContent('Carres')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('1 OVERDUE')
  })
})

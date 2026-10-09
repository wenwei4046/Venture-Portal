import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Fund IN per the user's Claude Design handoff (Phase 3 of the
// Finance revamp): five cards — the paid capital, its weighted cost, what is
// still owed, what matures within 30 days, what awaits the Principal — and
// the status tabs counted.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/office-time', () => ({ officeToday: () => '2026-10-09', officeTime: (at?: string) => dayjs(at), officeMonth: () => '2026-10' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('./_components/FundSourcesTable', () => ({
  default: (p: { rows: Array<{ fromLabel: string }> }) => <pre data-testid="table">{p.rows.map((r) => r.fromLabel).join(',')}</pre>,
}))

import FundInPage from './page'

const source = (id: string, status: string, amount: number, cost_rate: number, over: Record<string, unknown> = {}) => ({
  id, source_type: 'subsidiary', from_company_id: 'co-hc', from_director_id: null, from_department_id: null, from_freetext_name: null,
  amount, cost_rate, lock_in_months: 12, effective_date: '2026-01-15', maturity_date: '2027-01-15', status, notes: null, ...over,
})
const SOURCES = [
  source('a', 'active', 300000, 0.005),
  source('b', 'active', 100000, 0.01, { maturity_date: '2026-10-30' }),
  source('c', 'pending_approval', 50000, 0.01),
  source('d', 'repaid', 45000, 0.02),
  source('e', 'matured', 20000, 0.01),
]

function database() {
  const tables: Record<string, unknown[]> = {
    fund_sources: SOURCES,
    companies: [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
    directors: [],
    departments: [],
    fund_source_outstanding: [{ fund_source_id: 'a', outstanding: 250000 }, { fund_source_id: 'b', outstanding: 100000 }],
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
const page = (status?: string) => FundInPage({ searchParams: Promise.resolve({ status }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  database()
})

describe('Fund IN on the sheet', () => {
  it('sums the capital in five cards', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · CAPITAL IN')
    expect(card('Total paid capital')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total paid capital')).toHaveTextContent('RM 400,000.00')
    expect(card('Total paid capital')).toHaveTextContent('2 active · 1 matured · 1 repaid · 0 cancelled')
    expect(card('Weighted average cost')).toHaveTextContent('0.625% /mo') // (300k × 0.5% + 100k × 1%) ÷ 400k
    expect(card('Outstanding')).toHaveTextContent('RM 350,000.00')
    expect(card('Maturing in 30 days')).toHaveAttribute('data-tone', 'wait')
    expect(card('Maturing in 30 days')).toHaveTextContent('1')
    expect(card('Maturing in 30 days')).toHaveTextContent('RM 100,000.00')
    expect(card('Pending approval')).toHaveTextContent('1')
    expect(card('Pending approval')).toHaveTextContent('Awaiting Principal')
    expect(screen.getByRole('link', { name: 'Record new fund source' })).toHaveAttribute('href', '/fund-in/new')
  })

  it('counts each status on its tab and lists the one asked for', async () => {
    render(await page('pending_approval'))
    const count = (name: RegExp) => screen.getByRole('button', { name }).querySelector('[data-tab-count]')?.textContent
    expect(count(/^Pending/)).toBe('1')
    expect(count(/^Active/)).toBe('2')
    expect(count(/^Matured/)).toBe('1')
    expect(count(/^Repaid/)).toBe('1')
    expect(count(/^All/)).toBe('5')
    expect(screen.getByTestId('table')).toHaveTextContent('HOUZS Century (HC)')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('1 PENDING')
  })
})

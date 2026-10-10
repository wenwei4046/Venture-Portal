import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Settings per the user's Claude Design handoff (Phase 4 of the
// Finance revamp), for the tabs Finance sees: Chart of Accounts (active and
// inactive accounts as cards) and Departments (how many, how many cost
// centers, how many bill salary back), each headed as its own page; and Base
// Rate History with the current rate, its parts and the change in cards. The
// Principal's own tabs keep the Settings head.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/settings' }))
vi.mock('@/lib/department-mode-server', () => ({
  loadDepartmentModes: async () => [
    { id: 'd1', name: 'Marketing', segmentKey: 'marketing', isInternal: false, costModel: 'centralized', openSplitPeople: 0, canSwitch: false },
    { id: 'd2', name: 'Finance', segmentKey: 'finance', isInternal: false, costModel: 'cost_center', openSplitPeople: 0, canSwitch: false },
  ],
}))
// 2026-10-10 — the two sections draw the page head themselves (their head
// buttons hold their state); the page hands them the title block and what
// goes under it.
type SectionProps = { head?: ReactNode; intro?: ReactNode; canSetDefault?: boolean }
vi.mock('./_components/AccountsSection', () => ({
  default: (p: SectionProps) => (
    <div data-testid="accounts">
      <div className="page-head">{p.head}</div>
      {p.intro}
    </div>
  ),
}))
vi.mock('./_components/DepartmentsSection', () => ({
  default: (p: SectionProps) => (
    <div data-testid="departments" data-can-set-default={String(!!p.canSetDefault)}>
      <div className="page-head">{p.head}</div>
      {p.intro}
    </div>
  ),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
vi.mock('./_components/TreasuryConfigSection', () => ({ default: () => <div data-testid="treasury" /> }))
vi.mock('./_components/BaseRateSimulator', () => ({ default: () => null }))
vi.mock('../reports/base-rate/_components/BaseRateTrendChart', () => ({ default: () => null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const data: Record<string, unknown[]> = {
        chart_of_accounts: [
          { code: '1010', name: 'Cash — Hong Leong', type: 'asset', cash_flow_category: 'operating', parent_code: '1000', is_active: true, sort_order: 1 },
          { code: '1040', name: 'Cash — RHB (closed)', type: 'asset', cash_flow_category: 'operating', parent_code: '1000', is_active: false, sort_order: 2 },
          { code: '4101', name: 'Loan interest', type: 'revenue', cash_flow_category: 'operating', parent_code: null, is_active: true, sort_order: 1 },
        ],
        departments: [
          { id: 'd1', name: 'Marketing', is_internal: false, created_at: null, segment_key: 'marketing', pool_gl_code: '3120', billing_mode_key: 'service_fee', own_share_billback: true },
          { id: 'd2', name: 'Finance', is_internal: false, created_at: null, segment_key: 'finance', pool_gl_code: '3140', billing_mode_key: null, own_share_billback: false },
          { id: 'd3', name: 'Venture Office', is_internal: true, created_at: null, segment_key: null, pool_gl_code: null, billing_mode_key: null, own_share_billback: false },
        ],
        base_rate_history: [
          { id: 'h1', quarter: '2026 Q4', weighted_cost: 0.0061, op_margin: 0.0025, base_rate: 0.0086, approved_at: '2026-10-01T02:00:00Z' },
          { id: 'h2', quarter: '2026 Q3', weighted_cost: 0.0059, op_margin: 0.0025, base_rate: 0.0084, approved_at: '2026-07-02T02:00:00Z' },
        ],
      }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit', 'range']) q[m] = () => q
      q.maybeSingle = async () => ({ data: null, error: null })
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: data[table] ?? [], error: null }).then(res)
      return q
    },
  }),
}))

import SettingsPage from './page'
import BaseRateHistoryPage from '../reports/base-rate/page'

const card = (name: string) => screen.getByRole('group', { name })
const FINANCE = withActions({ id: 'f', role: 'finance', permissions: ['categories', 'reports'] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(FINANCE)
})

describe('Settings for Finance', () => {
  it('heads the accounts as the Chart of Accounts, with active and inactive cards', async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: 'accounts' }) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('ADMIN · CONFIGURATION · ACCOUNTS')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chart of Accounts')
    expect(card('Active accounts')).toHaveAttribute('data-tone', 'primary')
    expect(card('Active accounts')).toHaveTextContent('2')
    expect(card('Active accounts')).toHaveTextContent('2 account types')
    expect(card('Inactive')).toHaveTextContent('1')
    expect(screen.getByTestId('accounts')).toBeInTheDocument()
  })

  it('heads the departments, with how many, the cost centers and the bill-backs', async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: 'departments' }) }))
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('ADMIN · CONFIGURATION · DEPARTMENTS')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Departments')
    expect(screen.getByText('Finance can add departments; editing segment, pool GL and billing mode is Principal-only.')).toBeInTheDocument()
    expect(card('Departments')).toHaveTextContent('2')
    expect(card('Departments')).toHaveTextContent('1 cost center')
    expect(card('Bill back salary')).toHaveTextContent('1')
  })

  it('keeps the Settings head on the Principal’s own tabs', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['categories', 'settings', 'reports'] }))
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: 'treasury' }) }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings')
  })

  // 2026-10-10 — the handoff has no Accounts | Departments strip: Finance's
  // two tabs are the sidebar's Settings children. The Principal's strip, which
  // reaches all ten tabs, stays.
  it('draws no tab strip for Finance', async () => {
    for (const tab of ['accounts', 'departments']) {
      const { unmount } = render(await SettingsPage({ searchParams: Promise.resolve({ tab }) }))
      expect(document.querySelector('[data-tab-key]')).toBeNull()
      expect(document.querySelectorAll('.page-head')).toHaveLength(1)
      unmount()
    }
  })

  it('keeps the strip for the Principal, under the head', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'p', role: 'principal', permissions: ['categories', 'settings', 'reports'] }))
    const { unmount } = render(await SettingsPage({ searchParams: Promise.resolve({ tab: 'accounts' }) }))
    expect(document.querySelector('[data-tab-key="treasury"]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chart of Accounts')
    unmount()
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: 'treasury' }) }))
    expect(document.querySelector('[data-tab-key="accounts"]')).not.toBeNull()
  })

  it('lets whoever runs the chart of accounts set the Departments table’s default', async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: 'departments' }) }))
    expect(screen.getByTestId('departments')).toHaveAttribute('data-can-set-default', 'true')
  })
})

describe('Base Rate History on the sheet', () => {
  it('shows the current rate, its parts and the change in cards', async () => {
    render(await BaseRateHistoryPage())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('REPORTS · BASE RATE HISTORY')
    expect(card('Current base rate')).toHaveAttribute('data-tone', 'primary')
    expect(card('Current base rate')).toHaveTextContent('0.860%/mo')
    expect(card('Current base rate')).toHaveTextContent('2026 Q4 · approved 1 Oct 2026')
    expect(card('Weighted cost')).toHaveTextContent('0.610%')
    expect(card('Op margin')).toHaveTextContent('0.250%')
    expect(card('Change vs last quarter')).toHaveTextContent('+0.020%')
    expect(card('Change vs last quarter')).toHaveTextContent('vs 2026 Q3')
    expect(screen.getByRole('link', { name: 'Export Excel' })).toHaveAttribute('href', '/reports/base-rate/export?format=xlsx')
    expect(screen.getByRole('heading', { level: 2, name: 'History' })).toBeInTheDocument()
  })

  // 2026-10-10 — the history as the handoff's sheet table, the rate at the
  // figures' own weight (the prototype's accent tone draws it in black).
  it('lists the history as a sheet table, with a range on the dates and the rates', async () => {
    render(await BaseRateHistoryPage())
    const history = screen.getByRole('heading', { level: 2, name: 'History' }).closest('section') as HTMLElement
    expect(within(history).getByRole('table').closest('.st-box')).not.toBeNull()
    for (const name of ['Approved', 'Base rate', 'Wtd cost', 'Margin']) {
      fireEvent.click(within(history).getByRole('button', { name: `Filter ${name}` }))
      expect(within(screen.getByRole('dialog', { name: `Filter ${name}` })).getByRole('button', { name: 'Range' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    }
    const q4 = within(history).getByText('2026 Q4').closest('tr') as HTMLElement
    expect(q4).toHaveTextContent('0.610%')
    expect(q4).toHaveTextContent('0.250%')
    expect(q4).toHaveTextContent('1 Oct 2026')
    const rate = within(q4).getByText('0.860%')
    expect(rate.closest('td')).toHaveClass('num')
    expect(rate.closest('.font-semibold')).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — Overdue & Netting per the user's Claude Design handoff (Phase 3
// of the Finance revamp): two tabs — Fund OUT, what they owe us (the overdue
// records Detect overdue writes), and Fund IN, what we owe (installments of a
// fund source whose day has passed unpaid, from its repayment plan) — four
// cards each, the overdue by month with status chips, and the netting &
// penalty log.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/lib/treasury-terms-data', async (orig) => ({ ...(await orig<object>()), fetchTermsHistory: async () => new Map() }))
vi.mock('./actions', () => ({ markOverduePaid: vi.fn(), detectOverdue: vi.fn(), escalateOverdue: vi.fn() }))
vi.mock('./_components/EscalateButton', () => ({ default: () => <button type="button">Escalate</button> }))

import OverduePage from './page'

const record = (id: string, loan_id: string, period_month: string, overdue_days: number, overdue_stage: string | null, penalty_amount: number, status = 'pending') => ({
  id, loan_id, period_month, overdue_days, overdue_stage, is_overdue: true, penalty_rate: 0.01, penalty_amount, status, created_at: `${period_month}T02:00:00Z`,
})

function database() {
  const tables: Record<string, unknown[]> = {
    overdue_records: [
      record('o1', 'l1', '2026-09-01', 47, 'escalation', 3672.4),
      record('o2', 'l2', '2026-09-01', 12, 'late_1', 214.6),
      record('o3', 'l3', '2026-10-01', 4, 'grace', 0),
      record('o4', 'l4', '2026-08-01', 9, null, 412.3, 'paid'),
    ],
    loans: [
      { id: 'l1', company_id: 'co-hd', principal: 400000, effective_rate: 0.02, status: 'active' },
      { id: 'l2', company_id: 'co-hk', principal: 20000, effective_rate: 0.02, status: 'active' },
      { id: 'l3', company_id: 'co-ht', principal: 8000, effective_rate: 0.02, status: 'active' },
      { id: 'l4', company_id: 'co-hb', principal: 8000, effective_rate: 0.02, status: 'active' },
    ],
    companies: [
      { id: 'co-hd', name: 'HOUZS Design', short_code: 'HD' }, { id: 'co-hk', name: 'HOUZS Kitchen', short_code: 'HK' },
      { id: 'co-ht', name: 'HOUZS Trading', short_code: 'HT' }, { id: 'co-hb', name: 'HOUZS Bedding', short_code: 'HB' },
    ],
    loan_outstanding: [{ loan_id: 'l1', outstanding: 312500 }, { loan_id: 'l2', outstanding: 18250 }, { loan_id: 'l3', outstanding: 6400 }],
    repayments: [{ loan_id: 'l4', amount: 24800, payment_type: 'netting', payment_date: '2026-10-03' }],
    // A director's 12,000 over 3 months from August; nothing paid since.
    fund_sources: [
      {
        id: 'fs1', status: 'active', amount: 12000, cost_rate: 0.01, lock_in_months: 3, compound_interest: false, effective_date: '2026-07-15',
        repayment_start_month: null, terms_effective_from: null, from_company_id: null, from_department_id: null, from_freetext_name: 'Tan S.H.',
      },
    ],
    fund_source_repayments: [{ fund_source_id: 'fs1', amount: 4000, payment_date: '2026-08-15', payment_type: 'principal' }, { fund_source_id: 'fs1', amount: 120, payment_date: '2026-08-15', payment_type: 'interest' }],
    departments: [],
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: tables[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'order', 'range']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
  })
}

const page = (tab?: string) => OverduePage({ searchParams: Promise.resolve({ tab }) })
const card = (name: string) => screen.getByRole('group', { name })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  database()
})

describe('Overdue & Netting on the sheet', () => {
  it('shows what they owe us: four cards, the overdue by month with chips, the log', async () => {
    render(await page())
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('TREASURY · OVERDUE & NETTING')
    expect(screen.getByRole('button', { name: /^Fund OUT · they owe us/ }).querySelector('[data-tab-count]')).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /^Fund IN · we owe/ }).querySelector('[data-tab-count]')).toHaveTextContent('1')
    expect(card('Overdue outstanding')).toHaveAttribute('data-tone', 'primary')
    expect(card('Overdue outstanding')).toHaveTextContent('RM 337,150.00')
    expect(card('Overdue outstanding')).toHaveTextContent('3 companies')
    expect(card('Penalty accrued')).toHaveAttribute('data-tone', 'danger')
    expect(card('Penalty accrued')).toHaveTextContent('RM 3,887.00')
    expect(card('Longest overdue')).toHaveTextContent('47 days')
    expect(card('Longest overdue')).toHaveTextContent('HOUZS Design')
    expect(card('Netted this month')).toHaveTextContent('RM 24,800.00')
    expect(card('Netted this month')).toHaveTextContent('1 netting')

    expect(Array.from(document.querySelectorAll('.sect-head h2')).map((h) => h.textContent)).toEqual(['October 2026', 'September 2026', 'Netting & penalty log'])
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    const hd = within(september).getByText('HOUZS Design').closest('tr') as HTMLElement
    expect(within(hd).getByText('escalated').closest('.chip')).toHaveClass('danger')
    expect(within(hd).getByRole('button', { name: 'Escalate' })).toBeInTheDocument()
    expect(within(within(september).getByText('HOUZS Kitchen').closest('tr') as HTMLElement).getByText('overdue').closest('.chip')).toHaveClass('alert')
    const log = screen.getByRole('heading', { name: 'Netting & penalty log' }).closest('section') as HTMLElement
    expect(within(log).getByText('HOUZS Bedding')).toBeInTheDocument()
    expect(within(log).getByText('paid').closest('.chip')).toHaveClass('ledger')
  })

  it('shows what we owe: a fund source’s installments passed unpaid', async () => {
    render(await page('in'))
    expect(card('Overdue outstanding')).toHaveTextContent('RM 4,120.00') // the September installment: 4,000 + 120
    expect(card('Overdue outstanding')).toHaveTextContent('1 fund source · we owe')
    expect(card('Penalty accrued')).toHaveTextContent('No penalty on fund sources')
    expect(card('Longest overdue')).toHaveTextContent('24 days')
    const september = screen.getByRole('heading', { name: 'September 2026' }).closest('section') as HTMLElement
    const row = within(september).getByText('Tan S.H.').closest('tr') as HTMLElement
    expect(row).toHaveTextContent('RM 4,120.00')
    expect(row).toHaveTextContent('Instalment 2 of 3')
    expect(within(row).getByRole('link', { name: 'Record payment' })).toHaveAttribute('href', '/fund-in/fs1')
  })
})

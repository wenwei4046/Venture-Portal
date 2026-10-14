import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { withActions } from '@/test/with-actions'
import type { FundRecord } from '@/lib/fund-hub'

// Fund OUT's page (2026-10-15, the Finance revamp v2 — D12): it reads every
// loan — its borrower, what is still owed, whether an instalment is past its
// day unpaid (OVERDUE IS READ LIVE, its repayment plan), who made and approved
// it, a pending one's request and whether this reader decides it — and hands
// them to the hub with the card asked for (?status=, the old tabs' words too)
// and the head the reader may use: Create fund out, Loan aging, Export CSV.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), hub: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/office-time', () => ({ officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('./actions', () => ({ cancelPendingLoan: vi.fn() }))
vi.mock('./_components/ExportCSVButton', () => ({ default: () => <button type="button">Export CSV</button> }))
vi.mock('@/components/treasury/FundHub', () => ({
  default: (p: { records: FundRecord[]; head: ReactNode; initialCard: string; can: unknown; month: string; side: string }) => {
    mocks.hub(p)
    return <div data-testid="head">{p.head}</div>
  },
}))

import FundOutPage from './page'

const loan = (id: string, company_id: string, status: string, principal: number, effective_rate: number, over: Record<string, unknown> = {}) => ({
  id, company_id, status, principal, effective_rate, tenure_months: 12, disbursement_date: '2026-01-05', repayment_terms: 'EMI 分期 · 资金来源: HC',
  compound_interest: false, min_pay_interest: false, created_by: 'u-fin', created_at: '2026-01-02T03:00:00Z', approved_by: 'u-pr', approved_at: '2026-01-05T03:00:00Z', ...over,
})
// l1 repays from November (nothing due yet); l2 from August, on the 20th — August and September unpaid: 2 x 6,166.67.
const LOANS = [
  loan('l1', 'co-car', 'active', 100000, 0.02, { repayment_start_month: '2026-11-01' }),
  loan('l2', 'co-hk', 'active', 50000, 0.04, { disbursement_date: '2025-10-20', repayment_start_month: '2026-08-01' }),
  loan('l3', 'co-car', 'pending_approval', 30000, 0.02, { approved_by: null, approved_at: null }),
  loan('l4', 'co-hk', 'fully_repaid', 20000, 0.02),
]

function database() {
  const tables: Record<string, unknown[]> = {
    loans: LOANS,
    companies: [{ id: 'co-car', name: 'Carres', short_code: 'CAR' }, { id: 'co-hk', name: 'Hookka', short_code: 'HK' }],
    loan_outstanding: [
      { loan_id: 'l1', outstanding: 80000, total_principal_paid: 20000 },
      { loan_id: 'l2', outstanding: 40000, total_principal_paid: 10000 },
    ],
    repayments: [],
    approval_requests: [
      { id: 'req-3', reference_id: 'l3', request_type: 'new_loan', submitted_by: 'u-fin' },
      { id: 'req-c', reference_id: 'l1', request_type: 'loan_cancel', submitted_by: 'u-fin' },
    ],
    users: [{ id: 'u-fin', name: 'Aina' }, { id: 'u-pr', name: 'Principal' }],
  }
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const result = { data: tables[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in', 'range', 'is', 'not']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return q
    },
  })
}

const page = (status?: string) => FundOutPage({ searchParams: Promise.resolve({ status }) })
const props = () => mocks.hub.mock.calls.at(-1)![0] as { records: FundRecord[]; initialCard: string; can: Record<string, boolean>; month: string; side: string }
const rec = (id: string) => props().records.find((r) => r.id === id)!

const FINANCE = withActions({ id: 'u-fin', role: 'finance', permissions: ['treasury', 'reports'] })
const PRINCIPAL = withActions({ id: 'u-pr', role: 'principal', permissions: ['treasury', 'override', 'approvals', 'reports'] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(FINANCE)
  database()
})

describe('Fund OUT', () => {
  it('hands the hub every loan as a deal: its borrower, what is owed, the live overdue, the trail’s names', async () => {
    render(await page())
    expect(props().side).toBe('out')
    expect(props().month).toBe('2026-10')
    expect(props().records.map((r) => [r.id, r.party, r.status, r.amount, r.outstanding])).toEqual([
      ['l1', 'Carres (CAR)', 'active', 100000, 80000],
      ['l2', 'Hookka (HK)', 'active', 50000, 40000],
      ['l3', 'Carres (CAR)', 'pending_approval', 30000, null],
      ['l4', 'Hookka (HK)', 'repaid', 20000, null],
    ])
    expect(rec('l1').overdue).toBeNull()
    expect(rec('l2').overdue).toEqual({ amount: 12333.34, since: '2026-08-20', days: 50 })
    expect(rec('l1')).toMatchObject({ createdBy: 'Aina', approvedBy: 'Principal', fundingSource: 'HC', repaid: 20000, maturity: '2027-01-05', months: 12, cancelPending: true })
    expect(rec('l3').approval).toEqual({ id: 'req-3', submittedBy: 'u-fin' })
  })

  it('lets the Principal decide a pending loan — Finance, who raised it, may not', async () => {
    render(await page())
    expect(rec('l3').decidable).toBe(false)
    mocks.requirePermission.mockResolvedValue(PRINCIPAL)
    render(await page())
    expect(rec('l3').decidable).toBe(true)
  })

  it('opens on the card asked for, the old tabs’ words too', async () => {
    render(await page('overdue'))
    expect(props().initialCard).toBe('overdue')
    render(await page('fully_repaid'))
    expect(props().initialCard).toBe('repaid')
    render(await page('nonsense'))
    expect(props().initialCard).toBe('all')
  })

  it('heads it with the design’s two buttons and our Export CSV, each for whoever may', async () => {
    render(await page())
    expect(screen.getByRole('link', { name: 'Create fund out' })).toHaveAttribute('href', '/fund-out/new')
    expect(screen.getByRole('link', { name: 'Loan aging' })).toHaveAttribute('href', '/reports/loan-aging')
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
    expect(props().can).toEqual({ edit: true, void: true, amend: false })
  })

  it('leaves out what the reader may not use', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'u-v', role: 'staff', permissions: [] }))
    render(await page())
    expect(screen.queryByRole('link', { name: 'Create fund out' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Loan aging' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { withActions } from '@/test/with-actions'
import type { FundRecord } from '@/lib/fund-hub'

// Fund OUT's page (2026-10-15, the Finance revamp v2 — D12): it reads every
// loan — its borrower, what is still owed, whether an instalment is past its
// day unpaid (OVERDUE IS READ LIVE, its repayment plan), who made and approved
// it, a pending one's request and whether this reader decides it — and hands
// them to the hub with the card asked for (?status=, the old tabs' words too)
// and what the reader may use: Create fund out, Loan aging, Export CSV.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), hub: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/office-time', () => ({ officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('./_components/FundOutHub', () => ({
  default: (p: Record<string, unknown>) => {
    mocks.hub(p)
    return null
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
  loan('l5', 'co-2990', 'cancelled', 10000, 0.02),
]

function database() {
  const tables: Record<string, unknown[]> = {
    loans: LOANS,
    companies: [{ id: 'co-car', name: 'Carres', short_code: 'CAR' }, { id: 'co-hk', name: 'Hookka', short_code: 'HK' }, { id: 'co-2990', name: '2990', short_code: '2990' }],
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

type HubProps = { records: FundRecord[]; initialCard: string; can: Record<string, boolean>; month: string; today: string; canCreate: boolean; canLoanAging: boolean; canExport: boolean; canSetDefault: boolean }
const page = (status?: string) => FundOutPage({ searchParams: Promise.resolve({ status }) })
const props = () => mocks.hub.mock.calls.at(-1)![0] as HubProps
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
    expect(props().month).toBe('2026-10')
    expect(props().today).toBe('2026-10-09')
    expect(props().records.map((r) => [r.id, r.party, r.status, r.amount, r.outstanding])).toEqual([
      ['l1', 'Carres (CAR)', 'active', 100000, 80000],
      ['l2', 'Hookka (HK)', 'active', 50000, 40000],
      ['l3', 'Carres (CAR)', 'pending_approval', 30000, null],
      ['l4', 'Hookka (HK)', 'repaid', 20000, null],
      // A company named by its code is named once.
      ['l5', '2990', 'cancelled', 10000, null],
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

  it('offers each head button and step to whoever may use it', async () => {
    render(await page())
    expect(props()).toMatchObject({ canCreate: true, canLoanAging: true, canExport: true, canSetDefault: true })
    expect(props().can).toEqual({ edit: true, void: true, amend: false })
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'u-v', role: 'staff', permissions: [] }))
    render(await page())
    expect(props()).toMatchObject({ canCreate: false, canLoanAging: false, canExport: false })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { withActions } from '@/test/with-actions'
import type { FundRecord } from '@/lib/fund-hub'

// Fund IN's page (2026-10-15, the Finance revamp v2 — D12): it reads every
// fund source — who it came from (a company, a department, a director, free
// text first), what is still owed back, the bank it came into and the account
// it is booked to, who made, approved and closed it, a pending one's request
// and whether this reader decides it, a cancellation filed — and hands them to
// the hub with the card asked for and *Record fund in* for whoever may.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), hub: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/office-time', () => ({ officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('./_components/FundInHub', () => ({
  default: (p: Record<string, unknown>) => {
    mocks.hub(p)
    return null
  },
}))

import FundInPage from './page'

const source = (id: string, status: string, amount: number, cost_rate: number, over: Record<string, unknown> = {}) => ({
  id, source_type: 'subsidiary', from_company_id: 'co-hc', from_director_id: null, from_department_id: null, from_freetext_name: null,
  amount, cost_rate, lock_in_months: 12, effective_date: '2026-01-15', maturity_date: '2027-01-15', status, notes: null,
  compound_interest: false, min_pay_interest: true, bank_account_id: 'bk-1', account_code: '4054', created_by: 'u-fin', created_at: '2026-01-14T02:00:00Z',
  repaid_at: null, repaid_by: null, ...over,
})
const SOURCES = [
  source('a', 'active', 300000, 0.005),
  source('b', 'active', 70000, 0.01, { source_type: 'director_loan', from_company_id: null, from_director_id: 'd-loo', from_freetext_name: 'Loo K.W. (personal)' }),
  source('c', 'pending_approval', 50000, 0.01, { source_type: 'department_pool', from_company_id: null, from_department_id: 'dep-mkt' }),
  source('d', 'repaid', 45000, 0.02, { repaid_at: '2026-09-01T01:00:00Z', repaid_by: 'u-fin' }),
  source('e', 'active', 10000, 0.02, { source_type: 'director_loan', from_company_id: null, from_director_id: 'd-tan' }),
]

function database() {
  const tables: Record<string, unknown[]> = {
    fund_sources: SOURCES,
    companies: [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
    directors: [{ id: 'd-loo', name: 'Loo', code: 'LOO' }, { id: 'd-tan', name: 'Tan S.H.', code: 'TAN' }],
    departments: [{ id: 'dep-mkt', name: 'Marketing' }],
    fund_source_outstanding: [{ fund_source_id: 'a', outstanding: 250000 }, { fund_source_id: 'b', outstanding: 70000 }],
    bank_accounts: [{ id: 'bk-1', bank_name: 'Hong Leong Bank', account_number: '23600599248' }],
    chart_of_accounts: [{ code: '4054', name: 'Amount Due to Subsidiaries' }],
    approval_requests: [
      { id: 'req-c', reference_id: 'c', request_type: 'new_fund_source', status: 'pending', submitted_by: 'u-fin', approved_by: null, approved_at: null },
      { id: 'req-a', reference_id: 'a', request_type: 'new_fund_source', status: 'approved', submitted_by: 'u-fin', approved_by: 'u-pr', approved_at: '2026-01-15T03:00:00Z' },
      { id: 'req-x', reference_id: 'e', request_type: 'tier_change', status: 'pending', submitted_by: 'u-fin', approved_by: null, approved_at: null },
    ],
    users: [{ id: 'u-fin', name: 'Aina' }, { id: 'u-pr', name: 'Principal' }],
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

type HubProps = { records: FundRecord[]; initialCard: string; can: Record<string, boolean>; today: string; month: string; canCreate: boolean }
const page = (status?: string) => FundInPage({ searchParams: Promise.resolve({ status }) })
const props = () => mocks.hub.mock.calls.at(-1)![0] as HubProps
const rec = (id: string) => props().records.find((r) => r.id === id)!

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ id: 'u-fin', role: 'finance', permissions: ['treasury'] }))
  database()
})

describe('Fund IN', () => {
  it('hands the hub every fund source: who, its type, what is owed back, where it came in and is booked', async () => {
    render(await page())
    expect(props().today).toBe('2026-10-09')
    expect(props().month).toBe('2026-10')
    expect(props().records.map((r) => [r.id, r.party, r.typeLabel, r.outstanding])).toEqual([
      ['a', 'HOUZS Century (HC)', 'Subsidiary', 250000],
      // Free text before the director the row also names (Item 4).
      ['b', 'Loo K.W. (personal)', 'Director loan', 70000],
      ['c', 'Marketing', 'Dept pool', null],
      ['d', 'HOUZS Century (HC)', 'Subsidiary', null],
      ['e', 'Tan S.H. (TAN)', 'Director loan', 10000],
    ])
    expect(rec('a')).toMatchObject({
      bank: { name: 'Hong Leong Bank', number: '23600599248' },
      account: { code: '4054', name: 'Amount Due to Subsidiaries' },
      approvedBy: 'Principal',
      approvedAt: '2026-01-15T03:00:00Z',
      createdBy: 'Aina',
      minPayInterest: true,
      repaid: 50000,
    })
    expect(rec('c').approval).toEqual({ id: 'req-c', submittedBy: 'u-fin' })
    expect(rec('d')).toMatchObject({ repaidBy: 'Aina', repaidAt: '2026-09-01T01:00:00Z' })
    // A cancellation filed on an active source (cancelFundSource files it as a tier_change).
    expect(rec('e').cancelPending).toBe(true)
    expect(rec('a').cancelPending).toBe(false)
  })

  it('lets only someone else’s Approve decide a pending source', async () => {
    render(await page())
    expect(rec('c').decidable).toBe(false)
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'u-pr', role: 'principal', permissions: ['treasury', 'override', 'approvals'] }))
    render(await page())
    expect(rec('c').decidable).toBe(true)
  })

  it('opens on the card asked for', async () => {
    render(await page('director_loan'))
    expect(props().initialCard).toBe('director_loan')
    render(await page('matured'))
    expect(props().initialCard).toBe('all')
  })

  it('offers Record fund in and the steps to whoever may', async () => {
    render(await page())
    expect(props().canCreate).toBe(true)
    expect(props().can).toEqual({ edit: true, void: true, amend: false })
    mocks.requirePermission.mockResolvedValue(withActions({ id: 'u-v', role: 'staff', permissions: [] }))
    render(await page())
    expect(props().canCreate).toBe(false)
  })
})

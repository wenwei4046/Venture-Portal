import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-12 (user: expected repayment 和 repayment start date 应该要一样):
// editing a pending fund source, its Expected repayment — the repayment start —
// opens on the date the schedule goes by: unset, the month after the effective
// date on its day (no longer the effective date itself).

const mocks = vi.hoisted(() => ({ requireAnyActionOn: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAnyActionOn: mocks.requireAnyActionOn }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock('./_components/EditFundSourceForm', () => ({
  default: (p: { initial: { repayment_date: string } }) => <p data-testid="edit">expected repayment {p.initial.repayment_date}</p>,
}))
vi.mock('./_components/AmendFundSourceForm', () => ({ default: () => <p>amend</p> }))

import EditFundSourcePage from './page'

const PENDING = {
  id: 'fs-new', status: 'pending_approval', source_type: 'subsidiary', amount: 30000, cost_rate: 0.02, lock_in_months: 3, effective_date: '2026-09-14',
  repayment_date: null as string | null, repayment_start_month: null as string | null, from_company_id: 'co-car', notes: null, account_code: null, bank_account_id: null,
}

function database(source = PENDING) {
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q
      q.single = async () => ({ data: table === 'fund_sources' ? source : table === 'companies' ? { name: 'Carres', short_code: 'CAR' } : null, error: null })
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      return q
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAnyActionOn.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
})

describe('editing a pending fund source', () => {
  it('opens its Expected repayment on the month after the effective date while none is set', async () => {
    database()
    render(await EditFundSourcePage({ params: Promise.resolve({ id: 'fs-new' }) }))
    expect(screen.getByTestId('edit')).toHaveTextContent('expected repayment 2026-10-14')
  })

  it('opens on the date set', async () => {
    database({ ...PENDING, repayment_date: '2026-10-07', repayment_start_month: '2026-10-01' })
    render(await EditFundSourcePage({ params: Promise.resolve({ id: 'fs-new' }) }))
    expect(screen.getByTestId('edit')).toHaveTextContent('expected repayment 2026-10-07')
  })
})

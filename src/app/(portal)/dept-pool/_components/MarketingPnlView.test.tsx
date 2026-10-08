import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('./PnlCharts', () => ({ default: () => null }))

import MarketingPnlView from './MarketingPnlView'

const base = { direction: 'debit', status: 'paid', voucher_type: 'expense', reference_type: null as string | null, payment_date: '2026-10-02', created_at: '2026-10-02T03:00:00+00:00' }
const VOUCHERS = [
  { ...base, id: 'v-dc', voucher_no: 'HV-PV-202610-0437', amount: 3500, payee_name: 'Dream Crafter', description: 'Video edit' },
  { ...base, id: 'v-kwsp', voucher_no: 'HV-PV-202609-0286', amount: 1600, payee_name: 'KWSP', description: 'KWSP — Sep 2026 payroll (Marketing · 4 staff)', reference_type: 'payroll_statutory', payment_date: '2026-09-15', created_at: '2026-09-15T02:00:00+00:00' },
  { ...base, id: 'v-socso', voucher_no: 'HV-PV-202609-0288', amount: 95.6, payee_name: 'PERKESO (SOCSO)', description: 'SOCSO — Sep 2026 payroll (Marketing · 4 staff)', reference_type: 'payroll_statutory', payment_date: '2026-09-15', created_at: '2026-09-15T02:00:00+00:00' },
  { ...base, id: 'v-aina', voucher_no: 'HV-PV-202609-0290', amount: 3200.5, payee_name: 'Aina binti Example', description: 'Payroll disbursement Aug 2026 — Aina binti Example', reference_type: 'payroll_disbursement', voucher_type: 'other', payment_date: '2026-09-09', created_at: '2026-09-05T03:00:00+00:00' },
]

function database() {
  const from = vi.fn((table: string) => {
    const q = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, gte: () => q, lt: () => q, lte: () => q, or: () => q, order: () => q, limit: () => q,
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: table === 'payment_vouchers' ? VOUCHERS : [], error: null })),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const payees = () => Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td')[3].textContent)

beforeEach(() => vi.clearAllMocks())

// 2026-10-05: the Marketing pool's voucher history, for an account without Payroll payouts.
describe('the Marketing pool voucher history', () => {
  it('names every payee for an account that may see payroll', async () => {
    database()
    render(await MarketingPnlView({ deptId: 'mkt', period: '2026-09-01', seesPayroll: true }))
    expect(payees()).toEqual(['Dream Crafter', 'KWSP', 'PERKESO (SOCSO)', 'Aina binti Example'])
  })

  it('shows payroll as one total per batch — statutory per body, salary per batch — for an account that may not', async () => {
    database()
    const { container } = render(await MarketingPnlView({ deptId: 'mkt', period: '2026-09-01', seesPayroll: false }))
    expect(payees()).toEqual(['Dream Crafter', 'KWSP Sep 2026', 'SOCSO Sep 2026', 'Payroll disbursement Aug 2026'])
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    expect(rows[1]).toHaveTextContent('1 张 · 1 paid · 只显示总数')
    expect(rows[1]).toHaveTextContent('—') // no voucher number to open
    expect(rows[1].querySelector('svg')).not.toBeNull()
    for (const secret of ['Aina', 'HV-PV-202609-0290', 'HV-PV-202609-0286', '4 staff']) {
      expect(container.innerHTML).not.toContain(secret)
    }
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

import HistoryTable from './HistoryTable'

const POOL_ROWS = [
  { id: 'p1', transaction_type: 'expense_out', amount: 165.14, description: 'PV HV-PV-202610-0452: Office Rack for Product Display', created_at: '2026-10-04T13:23:40+00:00', period_month: '2026-10-01' },
  { id: 'p2', transaction_type: 'expense_out', amount: 4100.25, description: 'PV HV-PV-202609-0287: Payroll disbursement Aug 2026 — Bala Sample (HR)', created_at: '2026-09-09T05:00:00+00:00', period_month: '2026-08-01' },
  { id: 'p3', transaction_type: 'expense_out', amount: 3200.5, description: 'PV HV-PV-202609-0286: Payroll disbursement Aug 2026 — Aina binti Example (HR)', created_at: '2026-09-09T04:00:00+00:00', period_month: '2026-08-01' },
  { id: 'p4', transaction_type: 'np_in', amount: 20944.56, description: 'PV HV-PV-202607-0100: payroll fund → HR custody', created_at: '2026-07-20T02:00:00+00:00', period_month: null },
  { id: 'p5', transaction_type: 'void_in', amount: 2937.45, description: 'VOID HV-PV-202607-0115: reverse expense_out', created_at: '2026-07-21T02:00:00+00:00', period_month: null },
]
const VOUCHERS = [
  { voucher_no: 'HV-PV-202610-0452', reference_type: null, description: 'Office Rack for Product Display', status: 'paid', amount: 165.14, payment_date: '2026-10-02', created_at: '2026-10-02T03:09:07+00:00' },
  { voucher_no: 'HV-PV-202609-0287', reference_type: 'payroll_disbursement', description: 'Payroll disbursement Aug 2026 — Bala Sample', status: 'paid', amount: 4100.25, payment_date: '2026-09-09', created_at: '2026-09-05T03:00:00+00:00' },
  { voucher_no: 'HV-PV-202609-0286', reference_type: 'payroll_disbursement', description: 'Payroll disbursement Aug 2026 — Aina binti Example', status: 'paid', amount: 3200.5, payment_date: '2026-09-09', created_at: '2026-09-05T03:00:00+00:00' },
  { voucher_no: 'HV-PV-202607-0100', reference_type: 'payroll_payment_request', description: 'Payroll bank transfer — Jun 2026 (partial)', status: 'paid', amount: 20944.56, payment_date: '2026-07-20', created_at: '2026-07-20T01:00:00+00:00' },
]

function database() {
  const asked: Record<string, unknown[]> = {}
  const from = vi.fn((table: string) => {
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      in: (column: string, values: unknown[]) => { asked[`${table}.${column}`] = values; return q },
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: table === 'dept_pools' ? POOL_ROWS : table === 'payment_vouchers' ? VOUCHERS : [], error: null })),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
  return { from, asked }
}

const descriptions = () => Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td')[3].textContent)

beforeEach(() => vi.clearAllMocks())

// 2026-10-05 (user: "department pool 她还是要看到的 … 不给她看 detail / history 罢了").
describe('a department pool’s History', () => {
  it('lists every row for an account that may see payroll', async () => {
    const { from } = database()
    render(await HistoryTable({ deptId: 'hr', seesPayroll: true }))
    expect(descriptions()).toEqual(POOL_ROWS.map((r) => r.description))
    expect(from).not.toHaveBeenCalledWith('payment_vouchers')
  })

  it('folds the rows payroll vouchers wrote into one line per batch per day for an account that may not', async () => {
    const { asked } = database()
    const { container } = render(await HistoryTable({ deptId: 'hr', seesPayroll: false }))
    expect(descriptions()).toEqual([
      'PV HV-PV-202610-0452: Office Rack for Product Display',
      'Payroll disbursement Aug 2026 · 2 笔 · 只显示总数',
      'Payroll bank transfer Jun 2026 · 1 笔 · 只显示总数',
      'VOID HV-PV-202607-0115: reverse expense_out',
    ])
    // The vouchers were looked up by the numbers the rows carry — nothing more.
    expect(asked['payment_vouchers.voucher_no']).toEqual(['HV-PV-202610-0452', 'HV-PV-202609-0287', 'HV-PV-202609-0286', 'HV-PV-202607-0100'])
    const rows = Array.from(document.querySelectorAll('tbody tr'))
    expect(rows[1]).toHaveTextContent('9 Sep 2026')
    expect(rows[1]).toHaveTextContent('RM (7,300.75)')
    expect(rows[1].querySelector('svg')).not.toBeNull() // the lock
    for (const secret of ['Aina', 'Bala', 'HV-PV-202609-028', '4,100.25', '3,200.50']) {
      expect(container.innerHTML).not.toContain(secret)
    }
  })
})

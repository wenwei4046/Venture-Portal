import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  fetchAllRows: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/paginate', () => ({ fetchAllRows: mocks.fetchAllRows }))
vi.mock('@/lib/receipt-extras', async (original) => ({
  ...(await original<typeof import('@/lib/receipt-extras')>()),
  fetchReceiptExtras: vi.fn(async () => []),
}))
vi.mock('@/lib/payment-extras', () => ({ fetchPaymentExtras: vi.fn(async () => []) }))
vi.mock('./PaymentTabs', () => ({ default: () => null }))
vi.mock('./PaymentFilters', () => ({ default: () => null }))
vi.mock('./BackToTop', () => ({ default: () => null }))
// The table is a client component: its props are exactly what the server sends
// to the browser, so they are printed and read here as the browser would get them.
vi.mock('./VouchersTable', () => ({
  default: (props: { rows: unknown[] }) => <pre data-testid="sent">{JSON.stringify(props.rows)}</pre>,
}))

import VoucherLedger from './VoucherLedger'

const base = {
  direction: 'debit', voucher_type: 'expense', status: 'paid', reference_type: null as string | null,
  payment_date: '2026-10-05', created_at: '2026-10-01T03:00:00+00:00', target_pool: null, source_pool: null,
  fund_source_id: null, loan_id: null,
}
const VOUCHERS = [
  { ...base, id: 'v-tnb', voucher_no: 'HV-PV-202610-0450', amount: 1200, payee_name: 'TNB', description: 'September bill' },
  { ...base, id: 'v-aina', voucher_no: 'HV-PV-202610-0451', amount: 3200.5, payee_name: 'Aina binti Example', description: 'Payroll disbursement Sep 2026 — Aina binti Example', reference_type: 'payroll_disbursement', voucher_type: 'other' },
  { ...base, id: 'v-bala', voucher_no: 'HV-PV-202610-0452', amount: 4100.25, payee_name: 'Bala Sample', description: 'Payroll disbursement Sep 2026 — Bala Sample', reference_type: 'payroll_disbursement', voucher_type: 'other' },
  { ...base, id: 'v-kwsp', voucher_no: 'HV-PV-202610-0453', amount: 1014, payee_name: 'KWSP', description: 'KWSP — Sep 2026 payroll (Zeta · 1 staff)', reference_type: 'payroll_statutory' },
  { ...base, id: 'v-fund', voucher_no: 'HV-PV-202610-0454', amount: 4225, payee_name: 'HR custody', description: 'Payroll bank transfer — Sep 2026 (Zeta)', reference_type: 'payroll_payment_request', voucher_type: 'payroll_bank_transfer', status: 'pending_approval' },
]

function database() {
  const from = vi.fn((table: string) => {
    const result = table === 'payroll_payment_requests' ? { count: 2, data: null, error: null } : { data: [], error: null }
    const q = {
      select: () => q, eq: () => q, order: () => q, range: () => q,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
  mocks.fetchAllRows.mockResolvedValue(VOUCHERS)
  return { from }
}

const sent = () => JSON.parse(screen.getByTestId('sent').textContent ?? '[]') as Array<{
  id: string
  payee_name: string
  description: string | null
  amount: number
  status: string
  batchKey?: string
  locked?: boolean
}>

beforeEach(() => vi.clearAllMocks())

// 2026-10-02 (user: "我现在有 finance executive 了，我不希望他看到 payroll detail，
// 也就是每个人的 payout").
describe('Payments, for an account with Payroll payouts', () => {
  it('lists every voucher as before, the salary ones under their batch', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(sent().map((r) => r.id)).toEqual(['v-tnb', 'v-aina', 'v-bala', 'v-kwsp', 'v-fund'])
    expect(sent().find((r) => r.id === 'v-aina')?.batchKey).toBe('Payroll disbursement Sep 2026')
    expect(sent().some((r) => r.locked)).toBe(false)
    expect(screen.getByRole('link', { name: /Payroll Requests/ })).toHaveTextContent('2')
    expect(screen.getByText('5 of 5 vouchers')).toBeVisible()
  })
})

describe('Payments, for a treasury account without Payroll payouts', () => {
  beforeEach(() => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
  })

  it('sends the browser no payroll voucher — only one total per batch', async () => {
    database()
    const { container } = render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(sent().filter((r) => !r.locked).map((r) => r.id)).toEqual(['v-tnb'])
    expect(sent().filter((r) => r.locked).map((r) => [r.payee_name, r.description, r.amount, r.status])).toEqual([
      ['KWSP Sep 2026', '1 张 · 1 paid · 只显示总数', 1014, 'paid'],
      ['Payroll bank transfer Sep 2026', '1 张 · 1 pending approval · 只显示总数', 4225, 'pending_approval'],
      ['Payroll disbursement Sep 2026', '2 张 · 2 paid · 只显示总数', 7300.75, 'paid'],
    ])
    // Not a person, not a voucher number of theirs, not a department that is one person.
    for (const secret of ['Aina', 'Bala', 'HV-PV-202610-0451', 'HV-PV-202610-0452', 'Zeta', 'HR custody', '3,200.50', '4,100.25']) {
      expect(container.innerHTML).not.toContain(secret)
    }
  })

  it('still totals every voucher in the summary, and counts the folded ones', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(screen.getByText('RM 9,514.75')).toBeVisible() // paid: 1,200 + 3,200.50 + 4,100.25 + 1,014
    expect(screen.getByText('RM 4,225.00')).toBeVisible() // pending: the funding transfer
    expect(screen.getByText('5 of 5 vouchers')).toBeVisible()
  })

  it('has no way into Payroll Requests, and does not ask how many are waiting', async () => {
    const { from } = database()
    render(await VoucherLedger({ direction: 'debit', params: {} }))
    expect(screen.queryByRole('link', { name: /Payroll Requests/ })).toBeNull()
    expect(from).not.toHaveBeenCalledWith('payroll_payment_requests')
  })

  it('a search for a person finds nothing: a batch answers to its own name only', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: { q: 'aina' } }))
    expect(screen.queryByTestId('sent')).toBeNull()
    expect(screen.getByText('0 of 5 vouchers')).toBeVisible()
  })

  it('…and a search for the batch finds the batch', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: { q: 'payroll disbursement' } }))
    expect(sent().map((r) => [r.payee_name, r.locked])).toEqual([['Payroll disbursement Sep 2026', true]])
  })

  it('a pool or an amount filter leaves the batches out rather than read inside them', async () => {
    database()
    render(await VoucherLedger({ direction: 'debit', params: { min: '4000' } }))
    expect(screen.queryByTestId('sent')).toBeNull() // TNB is under 4,000 and no batch is offered
    expect(screen.getByText('0 of 5 vouchers')).toBeVisible()
  })
})

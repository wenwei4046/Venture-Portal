import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createClient: vi.fn(),
  fetchAllRows: vi.fn(),
  exportXlsxResponse: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/paginate', () => ({ fetchAllRows: mocks.fetchAllRows }))
vi.mock('@/lib/export/response', () => ({ exportXlsxResponse: mocks.exportXlsxResponse, exportPdfResponse: vi.fn() }))
vi.mock('@/lib/receipt-extras', async (original) => ({
  ...(await original<typeof import('@/lib/receipt-extras')>()),
  fetchReceiptExtras: vi.fn(async () => []),
}))
vi.mock('@/lib/payment-extras', () => ({ fetchPaymentExtras: vi.fn(async () => []) }))
// The sheet is whatever rows the route hands the builder.
vi.mock('./_format/xlsx', () => ({ buildVouchersXlsx: (rows: unknown[]) => rows }))
vi.mock('./_format/pdf', () => ({ VouchersPdf: () => null }))

import { GET } from './route'

const base = {
  direction: 'debit', voucher_type: 'expense', status: 'paid', reference_type: null as string | null,
  payment_date: '2026-10-05', created_at: '2026-10-01T03:00:00+00:00', target_pool: null, source_pool: null,
}
const VOUCHERS = [
  { ...base, id: 'v-tnb', voucher_no: 'HV-PV-202610-0450', amount: 1200, payee_name: 'TNB', payment_date: '2026-10-06' },
  { ...base, id: 'v-aina', voucher_no: 'HV-PV-202610-0451', amount: 3200.5, payee_name: 'Aina binti Example', description: 'Payroll disbursement Sep 2026 — Aina binti Example', reference_type: 'payroll_disbursement', voucher_type: 'other' },
  { ...base, id: 'v-bala', voucher_no: 'HV-PV-202610-0452', amount: 4100.25, payee_name: 'Bala Sample', description: 'Payroll disbursement Sep 2026 — Bala Sample', reference_type: 'payroll_disbursement', voucher_type: 'other' },
  { ...base, id: 'v-kwsp', voucher_no: 'HV-PV-202610-0453', amount: 1014, payee_name: 'KWSP', description: 'KWSP — Sep 2026 payroll (Zeta · 1 staff)', reference_type: 'payroll_statutory', payment_date: '2026-10-04' },
]

type Row = { voucher_no: string | null; date: string; type: string; status: string; payee_name: string; amount: number }
const sheet = () => mocks.exportXlsxResponse.mock.calls[0][0].buffer as Row[]
const get = (query = '') => GET(new Request(`http://localhost/payments/export?format=xlsx&direction=debit${query}`))

beforeEach(() => {
  vi.clearAllMocks()
  const q = { select: () => q, order: () => q, then: (resolve: (v: { data: unknown[] }) => unknown) => Promise.resolve(resolve({ data: [] })) }
  mocks.createClient.mockResolvedValue({ from: () => q })
  mocks.fetchAllRows.mockResolvedValue(VOUCHERS)
  mocks.exportXlsxResponse.mockReturnValue(new Response('xlsx'))
})

// 2026-10-02 (user: "我不希望他看到 payroll detail，也就是每个人的 payout").
describe('the Payments export', () => {
  it('lists every voucher for an account with Payroll payouts', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
    await get()
    expect(sheet().map((r) => r.payee_name)).toEqual(['TNB', 'Aina binti Example', 'Bala Sample', 'KWSP'])
  })

  it('carries payroll as one total per batch for a treasury account without it', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
    await get()
    expect(sheet().map((r) => [r.voucher_no, r.date, r.type, r.status, r.payee_name, r.amount])).toEqual([
      ['HV-PV-202610-0450', '06/10/2026', 'expense', 'paid', 'TNB', 1200],
      [null, '05/10/2026', 'payroll', '2 paid', 'Payroll disbursement Sep 2026 (2 vouchers, total only)', 7300.75],
      [null, '04/10/2026', 'payroll', '1 paid', 'KWSP Sep 2026 (1 voucher, total only)', 1014],
    ])
    for (const secret of ['Aina', 'Bala', 'Zeta', 'HV-PV-202610-0451', 'HV-PV-202610-0452']) {
      expect(JSON.stringify(sheet())).not.toContain(secret)
    }
  })

  it('…and a search for a person brings back no batch', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
    await get('&q=aina')
    expect(sheet()).toEqual([])
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createClient: vi.fn(),
  notFound: vi.fn(),
  getVoucherDetailContext: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requireAuth: mocks.requireAuth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('@/lib/voucher-detail', async (original) => ({
  ...(await original<typeof import('@/lib/voucher-detail')>()),
  getVoucherDetailContext: mocks.getVoucherDetailContext,
}))
vi.mock('@/components/voucher/AttachmentList', () => ({ default: () => null }))
vi.mock('./_components/ApprovalActions', () => ({ default: () => <div data-testid="approval-actions" /> }))

import ApprovalDetailPage from './page'

const TITLE = 'HV-PV-202610-0451: Aina binti Example — RM 3,200.50'

function database(referenceType: string | null) {
  const approval = {
    id: 'appr', request_type: 'payment_voucher', reference_id: 'voucher', reference_table: 'payment_vouchers',
    submitted_by: 'hr-user', description: TITLE, amount: 3200.5, status: 'pending',
    created_at: '2026-10-02T04:47:41+00:00', approved_at: null, approved_by: null, notes: null,
  }
  const from = vi.fn((table: string) => {
    const q = {
      select: () => q, eq: () => q,
      single: async () => ({ data: table === 'approval_requests' ? approval : { name: 'HR' }, error: null }),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
  mocks.getVoucherDetailContext.mockResolvedValue({
    voucher: {
      id: 'voucher', voucher_no: 'HV-PV-202610-0451', voucher_type: 'other', status: 'pending_approval', direction: 'debit',
      amount: 3200.5, currency: 'MYR', payee_name: 'Aina binti Example', payee_company_id: null, bank_account_id: null,
      reference_type: referenceType, reference_id: null, description: 'Payroll disbursement Sep 2026 — Aina binti Example', notes: null,
      payment_method: 'bank_transfer', payment_date: '2026-10-05', source_pool: null, target_pool: null, approved_at: null,
      executed_at: null, created_at: '2026-10-02T04:47:41+00:00', updated_at: '2026-10-02T04:47:41+00:00', created_by: 'hr-user',
      approved_by: null, payment_reference: null,
    },
    sources: [], attachments: [], bank: null, payeeCompany: null, createdByName: 'HR', approvedByName: null, categoryLabel: null,
  })
  return { from }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.notFound.mockImplementation(() => { throw new Error('NOT_FOUND') })
})

// 2026-10-02 (user: "我不希望他看到 payroll detail，也就是每个人的 payout"): the request
// for a salary voucher is titled with who is paid what.
describe('the approval of a payroll voucher', () => {
  it.each(['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'])(
    'does not open for a treasury account without Payroll payouts (%s)',
    async (referenceType) => {
      mocks.requireAuth.mockResolvedValue({ id: 'executive', role: 'finance', permissions: ['treasury'] })
      database(referenceType)
      await expect(ApprovalDetailPage({ params: Promise.resolve({ id: 'appr' }) })).rejects.toThrow('NOT_FOUND')
    },
  )

  it('opens for the Principal, who decides it', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'principal', role: 'principal', permissions: ['approvals', 'treasury', 'payroll_payouts', 'hr_costing'] })
    database('payroll_disbursement')
    render(await ApprovalDetailPage({ params: Promise.resolve({ id: 'appr' }) }))
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
  })

  it('opens for a finance account that was given Payroll payouts', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'manager', role: 'finance', permissions: ['treasury', 'payroll_payouts'] })
    database('payroll_disbursement')
    render(await ApprovalDetailPage({ params: Promise.resolve({ id: 'appr' }) }))
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
  })
})

describe('the approval of any other voucher', () => {
  it('opens for a treasury account as before', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'executive', role: 'finance', permissions: ['treasury'] })
    database(null)
    render(await ApprovalDetailPage({ params: Promise.resolve({ id: 'appr' }) }))
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
  })
})

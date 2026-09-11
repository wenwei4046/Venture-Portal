import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
import { reversePaidPayment } from './actions'

describe('paid salary PV reversal protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: 'finance', role: 'finance' })
  })
  it.each([4302.70, 4253.45])('rejects the generic other-type salary PV before reversing any money (%s)', async amount => {
    const rpc = vi.fn()
    const update = vi.fn()
    const from = vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update,
      single: vi.fn().mockResolvedValue({ data: {
        id: 'salary-pv', voucher_no: 'TEST-SALARY', direction: 'debit', voucher_type: 'other', status: 'paid',
        amount, reference_type: 'payroll_disbursement', bank_account_id: 'bank', loan_id: null,
        fund_source_id: null, invoice_id: null, payment_method: 'bank_transfer', payment_date: '2026-09-30',
      }, error: null }),
    }))
    mocks.createClient.mockResolvedValue({ from, rpc })
    const form = new FormData(); form.set('id', 'salary-pv')
    await expect(reversePaidPayment(form)).rejects.toThrow('Payroll / salary payments must be reversed through the payroll flow')
    expect(from).toHaveBeenCalledExactlyOnceWith('payment_vouchers')
    expect(rpc).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

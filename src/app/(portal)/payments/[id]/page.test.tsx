import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('../actions', () => ({ submitForApproval: vi.fn(), approveVoucher: vi.fn(), voidVoucher: vi.fn(), voidPaidReceipt: vi.fn(), reversePaidPayment: vi.fn(), returnVoucherToDraft: vi.fn() }))
vi.mock('./_components/VoucherActions', () => ({ default: () => <div data-testid="voucher-actions" /> }))
vi.mock('./_components/CopyVoucherButton', () => ({ default: () => <div data-testid="copy-voucher" /> }))
vi.mock('./_components/ReassignGlAccountButton', () => ({ default: () => <div data-testid="reassign-gl" /> }))
vi.mock('./_components/AttachmentUploader', () => ({ default: () => <div data-testid="attachment-uploader" /> }))
vi.mock('@/components/voucher/AttachmentList', () => ({ default: () => <div data-testid="attachment-list" /> }))
import PaymentDetailPage from './page'

function database(referenceType = 'payroll_statutory') {
  const voucher = { id: 'stat', voucher_no: 'TEST-STAT-PV', reference_type: referenceType, status: 'pending_approval', amount: 100.10, direction: 'debit', voucher_type: 'salary_payout', payee_name: 'KWSP', payee_company_id: null, bank_account_id: null, source_pool: null, target_pool: null, created_by: 'creator', approved_by: null, approved_at: null, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', executed_at: null, payment_method: 'bank_transfer', description: 'Statutory fixture', notes: null }
  const filters: string[][] = []
  const from = vi.fn((table: string) => {
    let allowedReferences: string[] | null = null
    const result = { data: table === 'payroll_statutory_voucher_lines' ? [{ id: 'line', scope: 'staff', payroll_row_id: 'row', employee_name: 'Recorded Employee', employee_code: 'TEST001', department_name: 'Original Department', period_month: '2026-08-01', scheme: 'KWSP', amount: '100.10' }] : [], error: null }
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      in: vi.fn((column: string, values: string[]) => { if (column === 'reference_type') { allowedReferences = values; filters.push(values) } return query }),
      single: vi.fn(() => Promise.resolve({ data: table === 'payment_vouchers' ? (allowedReferences && !allowedReferences.includes(referenceType) ? null : voucher) : { name: 'Creator' }, error: null })),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ from })
  return { from, filters }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.notFound.mockImplementation(() => { throw new Error('NOT_FOUND') })
})

describe('HR payroll voucher detail access', () => {
  it('shows stored statutory coverage and printing to HR without treasury actions or upload tools', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'hr', permissions: ['hr_costing'] })
    const { from, filters } = database()
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(mocks.requirePermission).toHaveBeenCalledWith('treasury', 'hr_costing')
    expect(filters).toEqual([['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request']])
    const table = screen.getByRole('table', { name: 'Statutory contributions covered by this voucher' })
    expect(table).toHaveTextContent('Recorded Employee')
    expect(table).toHaveTextContent('Original Department')
    expect(within(table).getByRole('row', { name: /Total contribution/ })).toHaveTextContent('100.10')
    expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/payments/voucher-doc?id=stat')
    expect(screen.getByRole('link', { name: /Back to HR Payment/ })).toHaveAttribute('href', '/hr-costing/payment')
    for (const testId of ['voucher-actions', 'copy-voucher', 'reassign-gl', 'attachment-uploader', 'attachment-list']) expect(screen.queryByTestId(testId)).not.toBeInTheDocument()
    expect(from).not.toHaveBeenCalledWith('payment_attachments')
  })

  it('rejects unrelated treasury records before reading their related details', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'hr', permissions: ['hr_costing'] })
    const { from } = database('ordinary_payment')
    await expect(PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) })).rejects.toThrow('NOT_FOUND')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('preserves treasury access and its existing action controls', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['treasury'] })
    const { filters } = database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(filters).toEqual([])
    expect(screen.getByTestId('voucher-actions')).toBeInTheDocument()
    expect(screen.getByTestId('copy-voucher')).toBeInTheDocument()
    expect(screen.getByTestId('attachment-uploader')).toBeInTheDocument()
  })
})

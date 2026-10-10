import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requirePermission: vi.fn(), notFound: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission, requireAction: mocks.requirePermission, requireAnyAction: mocks.requirePermission, requirePayrollPayoutsAction: mocks.requirePermission }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock('../../actions', () => ({ updatePaymentVoucher: vi.fn() }))
import EditPaymentPage from './page'

function database(options: { covered?: boolean; error?: boolean; status?: string; reference?: string; rows?: Record<string, unknown[]> } = {}) {
  const voucher = { id: 'salary', voucher_no: 'TEST-SALARY', reference_type: options.reference ?? 'payroll_disbursement', status: options.status ?? 'pending_approval', amount: 8556.15, payee_name: 'Recorded Employee', direction: 'debit', voucher_type: 'salary_payout', payment_method: 'bank_transfer', payment_date: '2026-09-15', description: 'Recorded salary', bank_account_id: null }
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: voucher, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: options.rows?.[table] ?? (table === 'payroll_voucher_lines' && options.covered !== false ? [{ id: 'salary-line' }] : []),
        error: table === 'payroll_voucher_lines' && options.error ? { message: 'private error' } : null,
      })),
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ from })
  return from
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue({ id: 'finance', permissions: ['treasury', 'payroll_payouts'] })
  mocks.notFound.mockImplementation(() => { throw new Error('NOT_FOUND') })
  mocks.redirect.mockImplementation(() => { throw new Error('NEXT_REDIRECT') })
})

describe('salary PV edit route', () => {
  it('uses stored salary coverage to offer only the metadata editor', async () => {
    const from = database()
    render(await EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) }))
    expect(screen.getByRole('form', { name: 'Edit salary PV date and notes' })).toBeVisible()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(from).toHaveBeenCalledWith('payroll_voucher_lines')
    expect(from).not.toHaveBeenCalledWith('hr_staff_costs')
  })

  it('retains the ordinary editor when a legacy salary PV has no recorded lines', async () => {
    database({ covered: false })
    render(await EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) }))
    expect(screen.queryByRole('form', { name: 'Edit salary PV date and notes' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })

  it('fails closed if salary snapshots cannot be verified', async () => {
    const from = database({ error: true })
    await expect(EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) })).rejects.toThrow('Unable to verify the recorded salary payment details')
    expect(from).not.toHaveBeenCalledWith('payment_voucher_sources')
  })

  it('redirects an approved salary PV before loading edit options', async () => {
    const from = database({ status: 'approved' })
    await expect(EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(from).toHaveBeenCalledTimes(1)
  })

  // 2026-10-02: what one person is paid does not open without Payroll payouts.
  it('does not open a payroll voucher for a treasury account without Payroll payouts', async () => {
    mocks.requirePermission.mockResolvedValue({ id: 'executive', permissions: ['treasury'] })
    const from = database()
    await expect(EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) })).rejects.toThrow('NOT_FOUND')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('…and still opens an ordinary one for that account', async () => {
    mocks.requirePermission.mockResolvedValue({ id: 'executive', permissions: ['treasury'] })
    database({ reference: 'ordinary_payment' })
    render(await EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) }))
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })
})

// 2026-10-05 (user: a draft drawn on the Revenue Department pool opened with its pool
// blank — "只要我 Edit draft PV, 它就强制要再 select"): the pool list is Create payment's.
describe('the pools an ordinary draft can be edited onto', () => {
  const revenueDraft = (departments: unknown[]) => database({
    reference: 'ordinary_payment',
    status: 'draft',
    rows: {
      departments,
      payment_voucher_sources: [{ pool: 'dept_pool_revenue_department', amount: 103.7, account_code: '9099', override_account_type: null, override_gl_account_code: null, override_reason: null }],
    },
  })
  const revenueDepartment = { id: 'd-rev', name: 'Revenue Department', segment_key: 'revenue_department', pool_gl_code: '3041', billing_mode_key: 'revenue_department', is_internal: false }

  it('offers the departments the registry knows, and opens on the pool the draft was saved with', async () => {
    revenueDraft([revenueDepartment, { id: 'd-it', name: 'IT', segment_key: 'it', pool_gl_code: '3042', billing_mode_key: 'it', is_internal: false }])
    render(await EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) }))
    const poolSelect = screen.getByDisplayValue('Revenue Department Dept Pool') as HTMLSelectElement
    expect(poolSelect.value).toBe('dept_pool_revenue_department')
    const labels = Array.from(poolSelect.options).map((o) => o.textContent)
    expect(labels).toContain('IT Dept Pool')
    expect(labels).toContain('Venture Pool')
    expect(labels.indexOf('Revenue Department Dept Pool')).toBeGreaterThan(labels.indexOf('Invoice Payout Pool')) // the core pools first
  })

  it('still shows a saved pool the registry no longer names, rather than a blank to be re-picked', async () => {
    revenueDraft([])
    render(await EditPaymentPage({ params: Promise.resolve({ id: 'salary' }) }))
    const poolSelect = screen.getByDisplayValue('dept pool revenue department') as HTMLSelectElement
    expect(poolSelect.value).toBe('dept_pool_revenue_department')
  })
})

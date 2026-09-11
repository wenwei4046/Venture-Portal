import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), requirePermission: vi.fn(), notFound: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock('../../actions', () => ({ updatePaymentVoucher: vi.fn() }))
import EditPaymentPage from './page'

function database(options: { covered?: boolean; error?: boolean; status?: string; reference?: string } = {}) {
  const voucher = { id: 'salary', voucher_no: 'TEST-SALARY', reference_type: options.reference ?? 'payroll_disbursement', status: options.status ?? 'pending_approval', amount: 8556.15, payee_name: 'Recorded Employee', direction: 'debit', voucher_type: 'salary_payout', payment_method: 'bank_transfer', payment_date: '2026-09-15', description: 'Recorded salary', bank_account_id: null }
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: voucher, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: table === 'payroll_voucher_lines' && options.covered !== false ? [{ id: 'salary-line' }] : [],
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
  mocks.requirePermission.mockResolvedValue({ id: 'finance' })
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
})

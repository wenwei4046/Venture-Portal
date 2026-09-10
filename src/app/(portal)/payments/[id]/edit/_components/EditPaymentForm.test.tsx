import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ updatePaymentVoucher: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../actions', () => ({ updatePaymentVoucher: mocks.updatePaymentVoucher }))
import EditPaymentForm from './EditPaymentForm'

describe('statutory voucher editor', () => {
  it('shows fixed financial details and submits only payment date and notes', async () => {
    render(<EditPaymentForm statutoryDetailsLocked voucher={{ id: 'pv', voucher_no: 'TEST-PV', voucher_type: 'salary_payout', direction: 'debit', amount: 600.60, payee_name: 'KWSP', payee_company_id: null, bank_account_id: 'bank', description: 'Recorded employee contributions', notes: null, payment_method: 'bank_transfer', payment_date: '2026-09-15', target_pool: null, fund_source_id: null, loan_id: null, repayment_breakdown: null }} initialSources={[{ pool: 'dept_pool_hr', amount: '600.60', account_code: '4020' }]} initialCreditAccountCode={null} companies={[]} bankAccounts={[{ id: 'bank', bank_name: 'Test Bank', account_number: '1234', current_balance: 0 }]} glAccounts={[]} />)
    expect(screen.getByText('KWSP')).toBeVisible()
    expect(screen.getByText('RM 600.60')).toBeVisible()
    expect(screen.getByText('Test Bank · 1234')).toBeVisible()
    expect(screen.getByRole('table', { name: 'Recorded source accounts' })).toHaveTextContent('4020')
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-09-16' } })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Confirmed payment date' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Edit statutory PV date and notes' }))
    await waitFor(() => expect(mocks.updatePaymentVoucher).toHaveBeenCalledTimes(1))
    const submitted = mocks.updatePaymentVoucher.mock.calls[0][0] as FormData
    expect(Object.fromEntries(submitted.entries())).toEqual({ id: 'pv', payment_date: '2026-09-16', notes: 'Confirmed payment date' })
  })
})

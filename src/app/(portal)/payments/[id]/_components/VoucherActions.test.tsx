import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import VoucherActions from './VoucherActions'

const props = () => ({ voucherId: 'salary', amount: 4302.70, bankBalance: 10000, bankName: 'Alliance',
  isPrincipal: false, isFinance: true, submitForApproval: vi.fn(), approveVoucher: vi.fn(), voidVoucher: vi.fn(),
  direction: 'debit', voucherType: 'other', reversePaidPayment: undefined })
describe('salary PV actions without generic paid reversal', () => {
  it('shows the existing completed-state wording without a reverse button', () => {
    render(<VoucherActions {...props()} status="paid" />)
    expect(screen.getByText(/No further actions available/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Reverse payment/ })).not.toBeInTheDocument()
  })
  it('retains the normal pending salary PV void action', () => {
    render(<VoucherActions {...props()} status="pending_approval" />)
    expect(screen.getByRole('button', { name: 'Void this voucher' })).toBeEnabled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import VoucherActions from './VoucherActions'

const props = () => ({ voucherId: 'salary', amount: 4302.70, bankBalance: 10000, bankName: 'Alliance',
  isPrincipal: false, isFinance: true, submitForApproval: vi.fn(), approveVoucher: vi.fn(), voidVoucher: vi.fn(),
  direction: 'debit', voucherType: 'other', reversePaidPayment: undefined })
describe('salary PV actions without generic paid reversal', () => {
  it('says the voucher is paid, without a reverse button', () => {
    render(<VoucherActions {...props()} status="paid" />)
    // The wording moved into the voucher page's panel on 2026-10-02; what this
    // pins is unchanged — a paid salary PV says it is paid and offers nothing.
    expect(screen.getByText(/已付款/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Reverse payment/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
  it('retains the normal pending salary PV void action', () => {
    render(<VoucherActions {...props()} status="pending_approval" />)
    expect(screen.getByRole('button', { name: 'Void this voucher' })).toBeEnabled()
  })
})

// 2026-10-02: the actions moved from the foot of the page into its panel. What
// each state offers is the same as before.
describe('what each state offers', () => {
  const names = () => [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].map((el) => el.textContent)

  it('a draft: submit, edit, void', () => {
    render(<VoucherActions {...props()} status="draft" />)
    expect(names()).toEqual(['Submit for approval', 'Void', 'Edit'])
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/payments/salary/edit')
  })

  it('pending, to Finance: edit, back to draft, void — and no Approve', () => {
    render(<VoucherActions {...props()} status="pending_approval" returnToDraft={vi.fn()} />)
    expect(screen.getByText(/等 Principal 批准/)).toBeVisible()
    expect(names()).toEqual(['退回 Draft', 'Void this voucher', 'Edit'])
  })

  it('pending, to the Principal: the bank balance, Approve, and a confirmation before it pays', () => {
    render(<VoucherActions {...props()} status="pending_approval" isPrincipal returnToDraft={vi.fn()} />)
    expect(screen.getByText(/Alliance balance/)).toHaveTextContent('RM 10,000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByText(/pays this voucher immediately/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Approve & Pay' })).toBeEnabled()
  })

  it('…who cannot approve what the bank cannot pay', () => {
    render(<VoucherActions {...props()} status="pending_approval" isPrincipal bankBalance={100} />)
    expect(screen.getByRole('button', { name: 'Insufficient balance' })).toBeDisabled()
    expect(screen.getByText(/insufficient for RM 4,302.70 payment/)).toBeVisible()
  })

  it('a paid receipt can be voided, after asking', () => {
    const voidPaidReceipt = vi.fn(async () => undefined)
    render(<VoucherActions {...props()} status="paid" direction="credit" voidPaidReceipt={voidPaidReceipt} />)
    expect(screen.getByText(/已入账/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Void receipt/ }))
    expect(voidPaidReceipt).not.toHaveBeenCalled()
    expect(screen.getByText(/确认作废这张已付收据/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(voidPaidReceipt).toHaveBeenCalledTimes(1)
  })

  it('a voided voucher offers nothing', () => {
    render(<VoucherActions {...props()} status="voided" />)
    expect(screen.getByText(/已作废/)).toBeVisible()
    expect(names()).toEqual([])
  })
})

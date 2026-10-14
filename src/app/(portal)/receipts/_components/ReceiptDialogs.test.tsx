import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { VoucherFormOptions } from '../../payments/_lib/create-payment-options'
import type { ReceivableLoans } from '../../payments/_lib/receivable-loans'

// Receipt's dialogs (2026-10-14, the Finance revamp v2 — D09, the prototype's
// `or-form`): Create receipt — the design's six fields and the Category the
// system books on; Loan repayment received — the loan, its parts, the bank.

const mocks = vi.hoisted(() => ({ receipt: vi.fn(), loan: vi.fn(), openReceipt: vi.fn(), openLoan: vi.fn(), flash: vi.fn() }))
vi.mock('../../payments/actions', () => ({ createReceiptFromDialog: mocks.receipt }))
vi.mock('../../fund-out/actions', () => ({ recordLoanRepaymentFromDialog: mocks.loan }))
vi.mock('../actions', () => ({ openCreateReceipt: mocks.openReceipt, openLoanRepayment: mocks.openLoan }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))

import CreateReceiptDialog from './CreateReceiptDialog'
import LoanRepaymentDialog from './LoanRepaymentDialog'

const RECEIPT_OPTIONS: VoucherFormOptions = {
  prefix: 'HV-OR-202610',
  today: '2026-10-14',
  companies: [{ id: 'hc', name: 'HOUZS Century', short_code: 'HC' }],
  banks: [{ id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 0 }],
  accounts: [
    { code: '3031', name: 'AR - HOUZS Century', type: 'asset' },
    { code: '5010', name: 'Service Fee Income', type: 'revenue' },
  ],
  pools: [
    { value: 'venture_pool', label: 'Venture Pool' },
    { value: 'dept_pool_marketing', label: 'Marketing Dept Pool' },
  ],
}
const LOANS: ReceivableLoans & { today: string } = {
  today: '2026-10-14',
  banks: RECEIPT_OPTIONS.banks,
  loans: [
    {
      id: 'loan-1',
      label: 'HC · RM 300,000.00 @ 2.000%/mo · 欠 250,000.00',
      outstanding: 250000,
      borrower: 'HOUZS Century',
      principal: 300000,
      ratePct: 2,
      date: '2026-03-12',
      source: 'CONTS',
      periods: { total: 6, remaining: 5 },
      suspenseCode: '3061',
      suspenseName: 'Interest in Suspense - HC',
      suspenseBalance: 30000,
    },
  ],
}

const dialog = () => screen.getByRole('dialog')
const sent = (fn: ReturnType<typeof vi.fn>): FormData => fn.mock.calls[0][0] as FormData

beforeEach(() => {
  vi.clearAllMocks()
  mocks.openReceipt.mockResolvedValue({ ok: true, options: RECEIPT_OPTIONS })
  mocks.openLoan.mockResolvedValue({ ok: true, options: LOANS })
  mocks.receipt.mockResolvedValue({ ok: true, id: 'or-new', voucherNo: 'HV-OR-202610-0523', submitted: false })
  mocks.loan.mockResolvedValue({ ok: true, total: 56000 })
})

describe('Create receipt', () => {
  const draw = () => {
    const onClose = vi.fn()
    render(<CreateReceiptDialog open onClose={onClose} prefix="HV-OR-202610" today="2026-10-14" />)
    return { onClose }
  }

  it('says Create receipt · Official receipt · HV-OR-202610, its fields in the design’s order with the Category beside the pool, Cancel and Save receipt', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Official receipt · HV-OR-202610')).toBeInTheDocument()
    expect(Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)).toEqual([
      'Received from',
      'Description',
      'Into bank',
      'Credited to pool',
      'Category',
      'Amount RM',
      'Received date',
    ])
    expect(screen.getByPlaceholderText('Payer name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('What was received?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save receipt' })).toHaveAttribute('data-off', 'true')
    expect(screen.getByText('Received from, an amount, a category and a description are needed.')).toBeInTheDocument()
  })

  it('Save receipt sends the receipt the form page sent and says it was received', async () => {
    const { onClose } = draw()
    await act(async () => undefined)
    const payer = screen.getByLabelText('Received from')
    fireEvent.focus(payer)
    fireEvent.change(payer, { target: { value: 'houzs' } })
    fireEvent.mouseDown(within(screen.getByRole('listbox')).getByRole('option', { name: /HOUZS Century/ }))
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Rental Oct' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '3031' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '25768.10' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }))
    })
    expect(Object.fromEntries(sent(mocks.receipt).entries())).toMatchObject({
      direction: 'credit',
      voucher_type: 'receive_payment',
      payee_name: 'HOUZS Century',
      payee_company_id: 'hc',
      bank_account_id: 'bank-hl',
      amount: '25768.10',
      payment_date: '2026-10-14',
      payment_method: 'bank_transfer',
      description: 'Rental Oct',
      target_pool: 'venture_pool',
      account_code: '3031',
      attachment_count: '0',
    })
    expect(mocks.flash).toHaveBeenCalledWith('HV-OR-202610-0523 received — bank and GL updated')
    expect(onClose).toHaveBeenCalled()
  })

  it('Cancel closes without a word sent', async () => {
    const { onClose } = draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(mocks.receipt).not.toHaveBeenCalled()
  })

  it('the method, files and notes open from the small buttons', async () => {
    draw()
    await act(async () => undefined)
    for (const name of ['Method', 'Attachments', 'Notes']) fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.getByLabelText('Method')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add files' })).toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
  })
})

describe('Loan repayment received', () => {
  const draw = () => {
    const onClose = vi.fn()
    render(<LoanRepaymentDialog open onClose={onClose} today="2026-10-14" />)
    return { onClose }
  }

  it('asks for the loan — a borrower may owe on several — then its parts; the amount is their sum', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Loan repayment received')).toBeInTheDocument()
    expect(screen.getByText('The loan it repays and an amount are needed.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Received from'), { target: { value: 'loan-1' } })
    expect(screen.getByText('Owed RM 250,000.00 · 5 of 6 left · 2%/mo')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Principal RM'), { target: { value: '50000' } })
    fireEvent.change(screen.getByLabelText('Interest RM'), { target: { value: '6000' } })
    expect(screen.getByLabelText('Amount RM')).toHaveValue('56,000.00')
    // Interest held in suspense is cleared by default.
    expect((screen.getByLabelText('Interest credited to') as HTMLSelectElement).value).toBe('3061')
  })

  it('more principal than is owed waits', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('Received from'), { target: { value: 'loan-1' } })
    fireEvent.change(screen.getByLabelText('Principal RM'), { target: { value: '260000' } })
    expect(screen.getByText('The principal RM 260,000.00 is more than the loan still owes (RM 250,000.00).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save receipt' })).toHaveAttribute('data-off', 'true')
  })

  it('Save receipt records the parts on the loan — the description as its notes — and says so', async () => {
    const { onClose } = draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('Received from'), { target: { value: 'loan-1' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'HC instalment Oct' } })
    fireEvent.change(screen.getByLabelText('Principal RM'), { target: { value: '50000' } })
    fireEvent.change(screen.getByLabelText('Interest RM'), { target: { value: '6000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save receipt' }))
    })
    expect(Object.fromEntries(sent(mocks.loan).entries())).toMatchObject({
      loan_id: 'loan-1',
      payment_date: '2026-10-14',
      bank_account_id: 'bank-hl',
      repayment_principal: '50000.00',
      repayment_interest: '6000.00',
      repayment_penalty: '0.00',
      interest_account_code: '3061',
      notes: 'HC instalment Oct',
    })
    expect(mocks.flash).toHaveBeenCalledWith('HOUZS Century · RM 56,000.00 received — bank and GL updated')
    expect(onClose).toHaveBeenCalled()
  })
})

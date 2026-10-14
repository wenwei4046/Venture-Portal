import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { CreatePaymentOptions } from '../_lib/create-payment-options'

// Create payment (2026-10-14, the Finance revamp v2 — D07 / D08): the
// prototype's seven fields and two buttons; the rest of today's form behind
// the small buttons; what is sent is what the form page sent.

const mocks = vi.hoisted(() => ({ create: vi.fn(), open: vi.fn(), flash: vi.fn() }))
vi.mock('../actions', () => ({ createPaymentFromDialog: mocks.create }))
vi.mock('../create-actions', () => ({ openCreatePayment: mocks.open }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))

import CreatePaymentDialog, { neededSentence, poolName } from './CreatePaymentDialog'

const OPTIONS: CreatePaymentOptions = {
  prefix: 'HV-PV-202610',
  today: '2026-10-14',
  companies: [
    { id: 'hc', name: 'HOUZS Century', short_code: 'HC' },
    { id: 'conts', name: 'The Cont', short_code: 'CONTS' },
  ],
  banks: [
    { id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 100000 },
    { id: 'bank-al', bank_name: 'Alliance Bank', account_number: '987-654-3210', current_balance: 5000 },
  ],
  accounts: [
    { code: '9087', name: 'Website & Software', type: 'expense' },
    { code: '6000', name: 'Interest Expense - Fund Sources', type: 'expense' },
    { code: '9096', name: 'Penalty Expense', type: 'expense' },
    { code: '4054', name: 'Fund Source - HC', type: 'liability' },
  ],
  pools: [
    { value: 'venture_pool', label: 'Venture Pool' },
    { value: 'dept_pool_marketing', label: 'Marketing Dept Pool' },
  ],
  fundSources: [
    {
      id: 'fs-hc',
      label: 'HC · RM 300,000.00 @ 2.0%/mo',
      source_type: 'subsidiary',
      from_company_id: 'hc',
      from_director_id: null,
      original_amount: 300000,
      cost_rate: 0.02,
      lock_in_months: 6,
      outstanding: 250000,
      monthly_payment: 56000,
      monthly_principal: 50000,
      monthly_interest: 6000,
      total_periods: 6,
      periods_paid: 1,
      remaining_periods: 5,
      lender: 'HOUZS Century',
      account_code: '4054',
      effective_date: '2026-03-12',
    },
  ],
}

const draw = (over: Partial<Parameters<typeof CreatePaymentDialog>[0]> = {}) => {
  const onClose = vi.fn()
  render(<CreatePaymentDialog open onClose={onClose} prefix="HV-PV-202610" today="2026-10-14" initial={OPTIONS} {...over} />)
  return { onClose }
}
const dialog = () => screen.getByRole('dialog')
const sent = (): FormData => mocks.create.mock.calls[0][0] as FormData
const fill = () => {
  fireEvent.change(screen.getByLabelText('Pay to'), { target: { value: 'Tan Yong Hong' } })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: '9087' } })
  fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '447.68' } })
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: "Claude - Oct'26" } })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0521', submitted: false })
  mocks.open.mockResolvedValue({ ok: true, options: OPTIONS })
})

describe('the dialog, as the design draws it', () => {
  it('says Create payment · New payment voucher · HV-PV-202610, the seven fields in its order, its two buttons', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Create payment')).toBeInTheDocument()
    expect(within(dialog()).getByText('New payment voucher · HV-PV-202610')).toBeInTheDocument()
    const labels = Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)
    expect(labels).toEqual(['Pay to', 'Category', 'Pool', 'From bank', 'Amount RM', 'Description', 'Payment date'])
    expect(screen.getByPlaceholderText('Payee name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('What is this for?')).toBeInTheDocument()
    expect((screen.getByLabelText('Pool') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Venture')
    expect((screen.getByLabelText('From bank') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Hong Leong Bank — 123-456-7890')
    expect(screen.getByRole('button', { name: 'Payment date: Wed, 14 Oct 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toHaveAttribute('data-off', 'true')
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
  })

  it('says what is still needed — the prototype’s sentence', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByText('Pay to, an amount, a category and a description are needed before you can save.')).toBeInTheDocument()
    expect(neededSentence(['Pay to', 'an amount'])).toBe('Pay to and an amount are needed before you can save.')
    expect(neededSentence(['a description'])).toBe('A description is needed before you can save.')
    expect(neededSentence([])).toBeNull()
  })

  it('names the pools as the design does', () => {
    expect(poolName('Venture Pool')).toBe('Venture')
    expect(poolName('Marketing Dept Pool')).toBe('Marketing')
    expect(poolName('Revenue Department Dept Pool')).toBe('Revenue Department')
  })

  it('reads its lists when opened without them', async () => {
    draw({ initial: null })
    await act(async () => undefined)
    expect(mocks.open).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('From bank') as HTMLSelectElement).value).toBe('bank-hl')
  })
})

describe('saving', () => {
  it('Save draft sends the voucher the form page sent — one pool, its line — and says what it made', async () => {
    const { onClose } = draw()
    await act(async () => undefined)
    fill()
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toHaveAttribute('data-off')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    const form = sent()
    expect(Object.fromEntries(form.entries())).toMatchObject({
      direction: 'debit',
      voucher_type: 'expense',
      payee_name: 'Tan Yong Hong',
      payee_company_id: '',
      bank_account_id: 'bank-hl',
      amount: '447.68',
      payment_date: '2026-10-14',
      payment_method: 'bank_transfer',
      description: "Claude - Oct'26",
      source_rows_count: '1',
      'source_rows[0][pool]': 'venture_pool',
      'source_rows[0][amount]': '447.68',
      'source_rows[0][account_code]': '9087',
      attachment_count: '0',
    })
    expect(form.has('submit')).toBe(false)
    expect(mocks.flash).toHaveBeenCalledWith('HV-PV-202610-0521 saved as draft')
    expect(onClose).toHaveBeenCalled()
  })

  it('Submit for approval sends it on, and says it waits for the Principal', async () => {
    mocks.create.mockResolvedValue({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0521', submitted: true })
    draw()
    await act(async () => undefined)
    fill()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(sent().get('submit')).toBe('1')
    expect(mocks.flash).toHaveBeenCalledWith('HV-PV-202610-0521 submitted — waiting for Principal')
  })

  it('sends nothing while something is missing', async () => {
    draw()
    await act(async () => undefined)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }))
    })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('a refusal stays in the dialog, in words', async () => {
    mocks.create.mockResolvedValue({ ok: false, reason: 'Bank account is required for debit (outgoing) vouchers' })
    const { onClose } = draw()
    await act(async () => undefined)
    fill()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Bank account is required for debit (outgoing) vouchers')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('what today’s form also does', () => {
  it('Pay to offers the companies it matches; picking one links the voucher to it', async () => {
    draw()
    await act(async () => undefined)
    const input = screen.getByLabelText('Pay to')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'houzs' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /HOUZS Century/ }))
    expect(input).toHaveValue('HOUZS Century')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '9087' } })
    fireEvent.change(screen.getByLabelText('Amount RM'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'x' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    expect(sent().get('payee_company_id')).toBe('hc')
  })

  it('Split pools: a line each, which must add up to the amount', async () => {
    draw()
    await act(async () => undefined)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Split pools' }))
    expect(screen.getByRole('button', { name: 'Split pools' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('447.68')
    fireEvent.change(screen.getByLabelText('Line 1 amount'), { target: { value: '400' } })
    fireEvent.change(screen.getByLabelText('Line 2 pool'), { target: { value: 'dept_pool_marketing' } })
    fireEvent.change(screen.getByLabelText('Line 2 category'), { target: { value: '9087' } })
    fireEvent.change(screen.getByLabelText('Line 2 amount'), { target: { value: '40' } })
    expect(screen.getByText('The lines add up to RM 440.00 — the amount is RM 447.68.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Line 2 amount'), { target: { value: '47.68' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    const form = sent()
    expect(form.get('source_rows_count')).toBe('2')
    expect(form.get('source_rows[1][pool]')).toBe('dept_pool_marketing')
    expect(form.get('source_rows[1][amount]')).toBe('47.68')
  })

  it('Loan repayment: the loan picks the lender and the month’s split; a line each, on its own account', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Loan repayment' }))
    fireEvent.change(screen.getByLabelText('Repay'), { target: { value: 'fs-hc' } })
    expect(screen.getByLabelText('Pay to')).toHaveValue('HOUZS Century')
    expect(screen.getByLabelText('Amount RM')).toHaveValue('56,000.00')
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('50000.00')
    expect((screen.getByLabelText('Line 1 category') as HTMLSelectElement).value).toBe('4054')
    expect((screen.getByLabelText('Line 2 category') as HTMLSelectElement).value).toBe('6000')
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'HC instalment 2/6' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    const form = sent()
    expect(Object.fromEntries(form.entries())).toMatchObject({
      fund_source_id: 'fs-hc',
      repayment_principal: '50000.00',
      repayment_interest: '6000.00',
      repayment_penalty: '0.00',
      amount: '56000.00',
      payee_company_id: 'hc',
      source_rows_count: '2',
    })
  })

  it('Internal transfer, the method, notes', async () => {
    draw()
    await act(async () => undefined)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Internal transfer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Method' }))
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'cheque' } })
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Alliance for payroll' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    expect(Object.fromEntries(sent().entries())).toMatchObject({ voucher_type: 'internal_transfer', payment_method: 'cheque', notes: 'Alliance for payroll' })
  })

  it('GL override: the type, the GL and the reason go with the line — all three, or it waits', async () => {
    draw()
    await act(async () => undefined)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'GL override' }))
    expect((screen.getByLabelText('Override type') as HTMLSelectElement).value).toBe('expense')
    expect((screen.getByLabelText('Override GL account') as HTMLSelectElement).value).toBe('9087')
    expect(screen.getByText('An override needs its type, its GL account and a reason.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Override type'), { target: { value: 'liability' } })
    fireEvent.change(screen.getByLabelText('Override GL account'), { target: { value: '4054' } })
    fireEvent.change(screen.getByLabelText('Override reason'), { target: { value: 'Owed to HC, not spent' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    expect(Object.fromEntries(sent().entries())).toMatchObject({
      'source_rows[0][override_account_type]': 'liability',
      'source_rows[0][override_gl_account_code]': '4054',
      'source_rows[0][override_reason]': 'Owed to HC, not spent',
    })
  })

  it('Attachments: the files go with the voucher; too much for one save is said', async () => {
    draw()
    await act(async () => undefined)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Attachments' }))
    const input = dialog().querySelector('input[type="file"]') as HTMLInputElement
    const slip = new File(['x'], 'slip.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [slip] } })
    expect(screen.getByText('slip.pdf')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    })
    expect(sent().get('attachment_count')).toBe('1')
    expect((sent().get('attachment_0') as File).name).toBe('slip.pdf')
  })

  it('the calendar picks the payment date', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Payment date: Wed, 14 Oct 2026' }))
    const cal = screen.getByRole('group', { name: 'Calendar' })
    expect(within(cal).getByText('October 2026')).toBeInTheDocument()
    fireEvent.click(within(cal).getByRole('button', { name: 'Previous month' }))
    expect(within(cal).getByText('September 2026')).toBeInTheDocument()
    fireEvent.click(within(cal).getByRole('button', { name: '30 September 2026' }))
    expect(screen.queryByRole('group', { name: 'Calendar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Payment date: Wed, 30 Sep 2026' })).toBeInTheDocument()
  })
})

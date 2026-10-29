import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/storage/stage', () => import('@/test/stage-in-place'))
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { CreatePaymentOptions } from '../_lib/create-payment-options'

// Create payment (2026-10-14, the Finance revamp v2 — D07 / D08; 2026-10-22,
// the user: "split pool 这个按钮我不想要，我想maintain之前的add description/line,
// attachment 就default 要有" → "每行一个，GL override 拿掉"): Pay to, the
// date, the bank and the voucher's description; then its lines — each its own
// words, pool, category and amount, + Add line, their total the voucher's —
// and the attachments, always there. What is sent is what the form page sent,
// each line's words with it.

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
  fireEvent.change(screen.getByLabelText('Line 1 category'), { target: { value: '9087' } })
  fireEvent.change(screen.getByLabelText('Line 1 amount'), { target: { value: '447.68' } })
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: "Claude - Oct'26" } })
}
const save = async (name = 'Save draft') => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0521', submitted: false })
  mocks.open.mockResolvedValue({ ok: true, options: OPTIONS })
})

describe('the dialog', () => {
  it('says Create payment · New payment voucher · HV-PV-202610, its fields in order — a line ready, the attachments there — and its two buttons', async () => {
    draw()
    await act(async () => undefined)
    expect(within(dialog()).getByText('Create payment')).toBeInTheDocument()
    expect(within(dialog()).getByText('New payment voucher · HV-PV-202610')).toBeInTheDocument()
    const labels = Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)
    expect(labels).toEqual(['Pay to', 'Payment date', 'From bank', 'Description', 'Lines', 'Attachments'])
    expect(screen.getByPlaceholderText('Payee name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('What is this for?')).toBeInTheDocument()
    expect(screen.getByLabelText('Line 1 description')).toHaveAttribute('placeholder', 'What this line is for')
    expect((screen.getByLabelText('Line 1 pool') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Venture')
    expect(screen.getByRole('button', { name: '+ Add line' })).toBeInTheDocument()
    expect(dialog().querySelector('input[type="file"]')).not.toBeNull()
    expect((screen.getByLabelText('From bank') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Hong Leong Bank — 123-456-7890')
    expect(screen.getByRole('button', { name: 'Payment date: Wed, 14 Oct 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save draft' })).toHaveAttribute('data-off', 'true')
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toHaveAttribute('data-off', 'true')
  })

  it('keeps under the fields only Loan repayment, Internal transfer, Method and Notes — no Split pools, no GL override', async () => {
    draw()
    await act(async () => undefined)
    const more = within(screen.getByRole('group', { name: 'More' })).getAllByRole('button').map((b) => b.textContent)
    expect(more).toEqual(['Loan repayment', 'Internal transfer', 'Method', 'Notes'])
    expect(screen.queryByText(/override/i)).toBeNull()
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

  it('a payment begun elsewhere starts its line on the amount and the voucher on its words', async () => {
    draw({ preset: { title: 'Refund', payee: 'HOUZS Century', companyId: 'hc', amount: 120, description: 'Refund of HV-INV-202610-0003' } })
    await act(async () => undefined)
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('120.00')
    expect(screen.getByLabelText('Description')).toHaveValue('Refund of HV-INV-202610-0003')
    expect(screen.getByText('RM 120.00')).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('Save draft sends the voucher the form page sent — its one line, no words of its own — and says what it made', async () => {
    const { onClose } = draw()
    await act(async () => undefined)
    fill()
    expect(screen.getByRole('button', { name: 'Save draft' })).not.toHaveAttribute('data-off')
    await save()
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
    expect(form.has('source_rows[0][description]')).toBe(false)
    expect(form.has('submit')).toBe(false)
    expect(mocks.flash).toHaveBeenCalledWith('HV-PV-202610-0521 saved as draft')
    expect(onClose).toHaveBeenCalled()
  })

  it('Submit for approval sends it on, and says it waits for the Principal', async () => {
    mocks.create.mockResolvedValue({ ok: true, id: 'pv-new', voucherNo: 'HV-PV-202610-0521', submitted: true })
    draw()
    await act(async () => undefined)
    fill()
    await save('Submit for approval')
    expect(sent().get('submit')).toBe('1')
    expect(mocks.flash).toHaveBeenCalledWith('HV-PV-202610-0521 submitted — waiting for Principal')
  })

  it('sends nothing while something is missing', async () => {
    draw()
    await act(async () => undefined)
    await save('Submit for approval')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('a refusal stays in the dialog, in words', async () => {
    mocks.create.mockResolvedValue({ ok: false, reason: 'Bank account is required for debit (outgoing) vouchers' })
    const { onClose } = draw()
    await act(async () => undefined)
    fill()
    await save()
    expect(screen.getByRole('alert')).toHaveTextContent('Bank account is required for debit (outgoing) vouchers')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('the lines', () => {
  it('each its own words, pool, category and amount; + Add line; their total is the voucher’s amount', async () => {
    draw()
    await act(async () => undefined)
    fill()
    fireEvent.change(screen.getByLabelText('Line 1 description'), { target: { value: 'Claude Team plan' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    fireEvent.change(screen.getByLabelText('Line 2 description'), { target: { value: 'Roadshow flyers' } })
    fireEvent.change(screen.getByLabelText('Line 2 pool'), { target: { value: 'dept_pool_marketing' } })
    expect(screen.getByText('Each line’s pool, category, amount is needed before you can save.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Line 2 category'), { target: { value: '9087' } })
    fireEvent.change(screen.getByLabelText('Line 2 amount'), { target: { value: '52.32' } })
    expect(screen.getByText('RM 500.00')).toBeInTheDocument()
    await save()
    expect(Object.fromEntries(sent().entries())).toMatchObject({
      amount: '500.00',
      source_rows_count: '2',
      'source_rows[0][description]': 'Claude Team plan',
      'source_rows[0][amount]': '447.68',
      'source_rows[1][description]': 'Roadshow flyers',
      'source_rows[1][pool]': 'dept_pool_marketing',
      'source_rows[1][account_code]': '9087',
      'source_rows[1][amount]': '52.32',
    })
  })

  it('a line comes off with its ×; the last one stays', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.queryByRole('button', { name: 'Remove line 1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    fireEvent.change(screen.getByLabelText('Line 2 amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }))
    expect(screen.queryByLabelText('Line 2 amount')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove line 1' })).toBeNull()
  })

  it('Loan repayment: the loan picks the lender and the month’s split — a line each, on its own account, its words kept', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Loan repayment' }))
    fireEvent.change(screen.getByLabelText('Repay'), { target: { value: 'fs-hc' } })
    expect(screen.getByLabelText('Pay to')).toHaveValue('HOUZS Century')
    expect(screen.getByText('RM 56,000.00')).toBeInTheDocument()
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('50000.00')
    expect((screen.getByLabelText('Line 1 category') as HTMLSelectElement).value).toBe('4054')
    expect((screen.getByLabelText('Line 2 category') as HTMLSelectElement).value).toBe('6000')
    fireEvent.change(screen.getByLabelText('Line 2 description'), { target: { value: 'October interest' } })
    fireEvent.change(screen.getByLabelText('Interest RM'), { target: { value: '6100' } })
    expect(screen.getByLabelText('Line 2 description')).toHaveValue('October interest')
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'HC instalment 2/6' } })
    await save()
    expect(Object.fromEntries(sent().entries())).toMatchObject({
      fund_source_id: 'fs-hc',
      repayment_principal: '50000.00',
      repayment_interest: '6100.00',
      repayment_penalty: '0.00',
      amount: '56100.00',
      payee_company_id: 'hc',
      source_rows_count: '2',
      'source_rows[1][description]': 'October interest',
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
    await save()
    expect(Object.fromEntries(sent().entries())).toMatchObject({ voucher_type: 'internal_transfer', payment_method: 'cheque', notes: 'Alliance for payroll' })
  })

  it('Attachments: the files go with the voucher; too much for one save is said', async () => {
    draw()
    await act(async () => undefined)
    fill()
    const input = dialog().querySelector('input[type="file"]') as HTMLInputElement
    const slip = new File(['x'], 'slip.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [slip] } })
    expect(screen.getByText('slip.pdf')).toBeInTheDocument()
    await save()
    expect(sent().get('attachment_count')).toBe('1')
    expect((sent().get('attachment_0') as File).name).toBe('slip.pdf')
  })

  // 2026-10-23: each file goes ahead of the save (lib/storage/stage.ts), so a file may be up to 100 MB — no longer
  // 4 MB for them all. One past it is named before anything is sent.
  it('Attachments: a file past 100 MB is named, and nothing is sent', async () => {
    draw()
    await act(async () => undefined)
    fill()
    const input = dialog().querySelector('input[type="file"]') as HTMLInputElement
    const scan = new File(['x'], 'scan.pdf', { type: 'application/pdf' })
    Object.defineProperty(scan, 'size', { value: 150 * 1024 * 1024 })
    const statement = new File(['x'], 'statement.pdf', { type: 'application/pdf' })
    Object.defineProperty(statement, 'size', { value: 60 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [statement] } })
    expect(screen.queryByText(/a file can be up to 100 MB/)).not.toBeInTheDocument()
    fireEvent.change(input, { target: { files: [scan] } })
    expect(screen.getByText('scan.pdf is 150.0 MB — a file can be up to 100 MB.')).toBeInTheDocument()
    await save()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('Pay to offers the companies it matches; picking one links the voucher to it', async () => {
    draw()
    await act(async () => undefined)
    const input = screen.getByLabelText('Pay to')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'houzs' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: /HOUZS Century/ }))
    expect(input).toHaveValue('HOUZS Century')
    fireEvent.change(screen.getByLabelText('Line 1 category'), { target: { value: '9087' } })
    fireEvent.change(screen.getByLabelText('Line 1 amount'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'x' } })
    await save()
    expect(sent().get('payee_company_id')).toBe('hc')
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

// Payment request's Create PV (2026-10-29, PR ②): this same window, filled in from the staff requests it pays — a line
// per item on the department's pool, the category Finance's — saved through Payment request's own action with the
// requests and each Yes share's category (its request's line's).
describe('from staff requests', () => {
  const requests = {
    requestIds: ['r1', 'r2'],
    payee: 'KHO WEI JIE',
    payInto: 'Pay into Hong Leong Bank 12345674821 · salary account',
    description: '2 requests · KHO WEI JIE',
    lines: [
      { requestId: 'r1', description: 'Claude · Oct', pool: 'dept_pool_marketing', amount: 453.79 },
      { requestId: 'r2', description: 'Jian Ying', pool: 'dept_pool_marketing', amount: 325.79 },
    ],
    notes: 'From Payment request · PRQ-2610-0001, PRQ-2610-0002',
    billBack: [{ shareId: 's1', requestId: 'r2' }],
    files: [{ id: 'f1', name: 'Receipt-2932.pdf', size: 1200 }],
  }

  it('starts on the requests and saves through the action it is handed, with the requests and each bill back’s category', async () => {
    const create = vi.fn().mockResolvedValue({ ok: true, id: 'pv-9', voucherNo: 'HV-PV-202610-0700', submitted: false })
    draw({ preset: { title: 'Create PV', payee: requests.payee, description: requests.description, requests }, create })
    await act(async () => undefined)
    expect(within(dialog()).getByText('Create PV')).toBeInTheDocument()
    expect(screen.getByLabelText('Pay to')).toHaveValue('KHO WEI JIE')
    expect(dialog()).toHaveTextContent('Pay into Hong Leong Bank 12345674821 · salary account')
    expect([screen.getByLabelText('Line 1 description'), screen.getByLabelText('Line 2 amount')].map((i) => (i as HTMLInputElement).value)).toEqual(['Claude · Oct', '325.79'])
    expect(dialog()).toHaveTextContent('Receipt-2932.pdf')
    expect(screen.getByLabelText('Notes')).toHaveValue('From Payment request · PRQ-2610-0001, PRQ-2610-0002')
    fireEvent.change(screen.getByLabelText('Line 1 category'), { target: { value: '9087' } })
    fireEvent.change(screen.getByLabelText('Line 2 category'), { target: { value: '6000' } })
    await save()
    const form = create.mock.calls[0][0] as FormData
    expect(JSON.parse(form.get('payment_request_ids') as string)).toEqual(['r1', 'r2'])
    expect(JSON.parse(form.get('payment_request_bill') as string)).toEqual([{ share: 's1', category: '6000' }])
    expect(form.get('notes')).toBe('From Payment request · PRQ-2610-0001, PRQ-2610-0002')
    expect(form.get('source_rows[1][pool]')).toBe('dept_pool_marketing')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('a request billed back keeps a line on the voucher — its invoice takes that line’s category', async () => {
    const create = vi.fn()
    draw({ preset: { payee: requests.payee, description: requests.description, requests }, create })
    await act(async () => undefined)
    fireEvent.change(screen.getByLabelText('Line 1 category'), { target: { value: '9087' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }))
    expect(dialog()).toHaveTextContent('Keep a line of each request billed back — its invoice takes that line’s category.')
    await save()
    expect(create).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { toHubInvoice, type InvoiceContext, type InvoiceRowIn } from '../_lib/invoice-model'

// Settle (2026-10-14, the Finance revamp v2 — D10, the prototype's `settle`
// sheet): one receipt for one payer's invoices, at what each still owes. One
// invoice may be settled for part of it (Service Billing's part payment, kept).

const mocks = vi.hoisted(() => ({ settle: vi.fn() }))
vi.mock('../invoice-actions', () => ({ hubSettleInvoices: mocks.settle }))

import SettleDialog from './SettleDialog'

const ctx: InvoiceContext = {
  companies: new Map([['co-hc', { name: 'HOUZS Century', code: 'HC' }]]),
  departments: new Map(),
  accounts: new Map(),
  extraModes: [],
  lines: new Map(),
  receipts: new Map([['a', [{ voucher_no: 'HV-OR-202610-0030', payment_date: '2026-10-08', amount: 204 }]]]),
  settlements: new Map(),
  creditNotes: new Map(),
}
const row = (id: string, no: string, total: number): InvoiceRowIn => ({
  id,
  invoice_no: no,
  company_id: 'co-hc',
  period_month: '2026-10-01',
  billing_mode: 'hr_attribution',
  total_amount: total,
  status: 'issued',
  billable_to_type: 'subsidiary',
  billable_to_department_id: null,
  billable_to_freetext_name: null,
  billable_to_freetext_address: null,
  billable_to_freetext_address_parts: null,
  billable_to_freetext_phone: null,
  billable_to_freetext_email: null,
  description: null,
  invoice_date: '2026-10-07',
  due_date: null,
  reference_no: null,
  category_code: null,
})
const A = toHubInvoice(row('a', 'HV-INV-202610-0013', 2204), ctx)
const B = toHubInvoice(row('b', 'HV-INV-202610-0009', 2000), ctx)
const BANKS = [
  { id: 'b1', label: 'Hong Leong Bank — 123-456-7890' },
  { id: 'b2', label: 'Alliance Bank — 987-654-3210' },
]
const dialog = () => document.querySelector('[data-fin-dialog] [role="dialog"]') as HTMLElement
const flush = () => act(async () => {})

function draw(invoices = [A, B]) {
  const onSettled = vi.fn()
  const onClose = vi.fn()
  render(<SettleDialog invoices={invoices} banks={BANKS} today="2026-10-14" onClose={onClose} onSettled={onSettled} />)
  return { onSettled, onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settle.mockResolvedValue({ ok: true, value: { voucherNo: 'HV-OR-202610-0031', settledCount: 2, total: 4000, isPartial: false } })
})

describe('settling', () => {
  it('lists what each still owes and the total, into the primary bank, today', () => {
    draw()
    expect(dialog()).toHaveTextContent('Settle 2 invoices')
    expect(dialog()).toHaveTextContent('HOUZS Century (HC) · one receipt')
    expect(dialog()).toHaveTextContent('HV-INV-202610-00132,000.00')
    expect(dialog()).toHaveTextContent('HV-INV-202610-00092,000.00')
    expect(dialog()).toHaveTextContent('TotalRM 4,000.00')
    expect(within(dialog()).getByLabelText('Into bank')).toHaveValue('b1')
    expect(dialog()).toHaveTextContent('Wed, 14 Oct 2026')
  })

  it('settles them on one receipt, in full, and says so in the design’s words', async () => {
    const { onSettled } = draw()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Settle & create receipt' }))
    await flush()
    expect(mocks.settle).toHaveBeenCalledWith({ invoiceIds: ['a', 'b'], bankAccountId: 'b1', paymentDate: '2026-10-14', partialAmount: undefined })
    expect(onSettled).toHaveBeenCalledWith('2 invoices settled · receipt created')
  })

  it('one invoice may be settled for part of what it owes; more than it owes waits', async () => {
    mocks.settle.mockResolvedValue({ ok: true, value: { voucherNo: 'HV-OR-202610-0032', settledCount: 1, total: 500, isPartial: true } })
    const { onSettled } = draw([A])
    const amount = within(dialog()).getByLabelText('Amount received RM')
    expect(amount).toHaveValue('2000.00')
    fireEvent.change(amount, { target: { value: '2500' } })
    expect(dialog()).toHaveTextContent('That is more than the RM 2,000.00 it still owes.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Settle & create receipt' }))
    await flush()
    expect(mocks.settle).not.toHaveBeenCalled()
    fireEvent.change(amount, { target: { value: '500' } })
    expect(dialog()).toHaveTextContent('Less than RM 2,000.00 is a part payment — the invoice stays open for the rest.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Settle & create receipt' }))
    await flush()
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ invoiceIds: ['a'], partialAmount: 500 }))
    expect(onSettled).toHaveBeenCalledWith('Receipt HV-OR-202610-0032 — part payment RM 500.00; RM 1,500.00 still to collect')
  })

  it('a refusal is said in the dialog, in words', async () => {
    mocks.settle.mockResolvedValue({ ok: false, reason: 'Invoice HV-INV-202610-0013 is not issued' })
    const { onSettled } = draw()
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Settle & create receipt' }))
    await flush()
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Invoice HV-INV-202610-0013 is not issued')
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('opens on the bank and day again each time, whatever was picked before', async () => {
    const onSettled = vi.fn()
    const { rerender } = render(<SettleDialog invoices={[A]} banks={BANKS} today="2026-10-14" onClose={vi.fn()} onSettled={onSettled} />)
    fireEvent.change(within(dialog()).getByLabelText('Into bank'), { target: { value: 'b2' } })
    rerender(<SettleDialog invoices={[]} banks={BANKS} today="2026-10-14" onClose={vi.fn()} onSettled={onSettled} />)
    rerender(<SettleDialog invoices={[A]} banks={BANKS} today="2026-10-14" onClose={vi.fn()} onSettled={onSettled} />)
    await flush()
    expect(screen.getAllByLabelText('Into bank').at(-1)).toHaveValue('b1')
  })
})

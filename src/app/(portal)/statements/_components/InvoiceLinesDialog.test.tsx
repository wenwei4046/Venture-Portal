import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InvoiceEditInitial } from '../_lib/invoice-model'

// Multi-line invoice and Edit (2026-10-14, the Finance revamp v2 — D10's
// inv-form with its lines): one invoice, its lines a description and an
// amount each, one category or one a line; a staff recharge to a company
// filled from HR's allocation; the same dialog edits a draft whole, and an
// issued invoice with a reason — once money came in, its amounts, its party
// and its month stay.

const mocks = vi.hoisted(() => ({ createLines: vi.fn(), update: vi.fn(), hr: vi.fn(), create: vi.fn() }))
vi.mock('../invoice-actions', () => ({
  hubCreateInvoice: mocks.create,
  hubCreateLinesInvoice: mocks.createLines,
  hubUpdateInvoice: mocks.update,
  hubHrFigures: mocks.hr,
}))

import InvoiceLinesDialog, { type InvoiceEditing } from './InvoiceLinesDialog'

const companies = [
  { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' },
  { id: 'co-conts', name: 'The Cont', short_code: 'CONTS' },
]
const categories = [
  { code: '5050', label: 'Salary Income', type: 'revenue' as const, parent_code: null },
  { code: '5018', label: 'General Marketing', type: 'revenue' as const, parent_code: null },
]
const STAFF = [{ companyId: 'co-conts', shortCode: 'CONTS', name: 'The Cont', amount: 1352.45, salary: 933.2, allowance: 279.96, epf: 121.32, socso: 16.13, eis: 1.84 }]

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})
function draw(editing: InvoiceEditing | null = null) {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(
    <InvoiceLinesDialog
      open
      onClose={onClose}
      onDone={onDone}
      period="2026-09-01"
      today="2026-10-14"
      companies={companies}
      departments={[]}
      categories={categories}
      extraModes={[]}
      editing={editing}
    />,
  )
  return { onDone, onClose }
}
const dialog = () => screen.getByRole('dialog')
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const hint = () => within(dialog()).getAllByText((_, el) => el?.tagName === 'P').map((p) => p.textContent)
const press = (name: string) => fireEvent.click(within(dialog()).getByRole('button', { name }))
// A typed party's address, in its six parts (2026-10-20): line 1 typed, then State → City → Postcode from the list.
const part = (key: 'line1' | 'state' | 'city' | 'postcode', value: string) =>
  fireEvent.change(document.getElementById(`il-address-${key}`) as HTMLElement, { target: { value } })
const listReady = () => waitFor(() => expect(document.getElementById('il-address-state')).not.toBeDisabled())
const PENANG = { line1: 'No 83, Jalan Jambu 3', line2: '', postcode: '11060', city: 'Paya Terubong', state: 'Pulau Pinang', country: 'Malaysia' }

const INITIAL: InvoiceEditInitial = {
  total_amount: 63440,
  category_code: null,
  description: 'Director Remuneration & Operation Management Fees',
  invoice_date: '2026-10-12',
  due_date: '2026-10-15',
  reference_no: null,
  billing_mode: 'venture_attribution',
  billable_to_type: 'subsidiary',
  company_id: 'co-hc',
  billable_to_department_id: null,
  billable_to_freetext_name: null,
  billable_to_freetext_address: null,
  billable_to_freetext_address_parts: null,
  billable_to_freetext_phone: null,
  billable_to_freetext_email: null,
  period_month: '2026-10-01',
}
const LINES = [
  { description: 'Director Remuneration', amount: 50000, category_code: '5050' },
  { description: 'Operation Management Fees', amount: 13440, category_code: '5050' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createLines.mockResolvedValue({ ok: true, value: 'HV-INV-202609-0070' })
  mocks.update.mockResolvedValue({ ok: true, value: null })
  mocks.hr.mockResolvedValue({ ok: true, value: { staff: STAFF, directors: [] } })
})

describe('Multi-line invoice', () => {
  it('the design’s words: two lines to start, the total in the note, Cancel / Save draft', () => {
    draw()
    expect(dialog()).toHaveTextContent('Multi-line invoice')
    expect(dialog()).toHaveTextContent('Saved as draft · approve to issue')
    expect(Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)).toEqual(['Bill to', 'Description', 'Category', 'Billing mode', 'Lines', 'Invoice date', 'Due date'])
    expect(screen.getByLabelText('Line 2 description')).toBeInTheDocument()
    set('Line 1 amount', '1200')
    set('Line 2 amount', '300.5')
    expect(hint()).toContain('Total RM 1,500.50 · saved as a draft.')
    expect(within(dialog()).getByRole('button', { name: /^Invoice date/ })).toHaveTextContent('Wed, 14 Oct 2026')
  })

  it('with two lines each needs its description; the lines take the category; it is written on the hub’s month', async () => {
    const { onDone, onClose } = draw()
    set('Bill to', 'freetext')
    set('Name', 'Rygis Private Gym')
    await listReady()
    part('line1', 'No 83, Jalan Jambu 3')
    part('state', 'Pulau Pinang')
    part('city', 'Paya Terubong')
    set('Description', 'Marketing service — Sep')
    set('Category', '5018')
    set('Line 1 description', 'Ads management')
    set('Line 1 amount', '1000')
    set('Line 2 amount', '500')
    press('Save draft')
    expect(hint()).toContain('Each line’s description is needed before you can save.')
    set('Line 2 description', 'Video shooting')
    press('Save draft')
    // The save reads the list first, to check the address.
    await waitFor(() => expect(mocks.createLines).toHaveBeenCalled())
    expect(mocks.createLines).toHaveBeenCalledWith({
      billKind: 'freetext',
      companyId: undefined,
      deptId: undefined,
      name: 'Rygis Private Gym',
      address: 'No 83, Jalan Jambu 3, 11060 Paya Terubong, Pulau Pinang, Malaysia',
      addressParts: PENANG,
      phone: '',
      email: '',
      mode: 'marketing_project',
      period: '2026-09',
      invoiceDate: '2026-10-14',
      dueDate: '2026-11-13',
      description: 'Marketing service — Sep',
      reference: '',
      lines: [
        { description: 'Ads management', amount: 1000, categoryCode: '5018' },
        { description: 'Video shooting', amount: 500, categoryCode: '5018' },
      ],
    })
    expect(onDone).toHaveBeenCalledWith('HV-INV-202609-0070 saved as draft')
    expect(onClose).toHaveBeenCalled()
  })

  it('Category per line puts a category on each line, starting from the one above', async () => {
    draw()
    set('Bill to', 'co:co-hc')
    set('Category', '5050')
    press('Category per line')
    expect(screen.queryByLabelText('Category')).toBeNull()
    expect(screen.getByLabelText('Line 1 category')).toHaveValue('5050')
    set('Line 2 category', '5018')
    set('Line 1 description', 'Salary')
    set('Line 1 amount', '100')
    set('Line 2 description', 'Ads')
    set('Line 2 amount', '50')
    press('Save draft')
    await flush()
    expect(mocks.createLines.mock.calls[0][0].lines.map((l: { categoryCode: string }) => l.categoryCode)).toEqual(['5050', '5018'])
  })

  it('a shared-services recharge to a company: HR’s five lines and its summary', async () => {
    draw()
    set('Billing mode', 'hr_attribution')
    set('Bill to', 'co:co-conts')
    await flush()
    expect(mocks.hr).toHaveBeenCalledWith('2026-09', 'hr_attribution')
    expect([1, 2, 3, 4, 5].map((n) => (screen.getByLabelText(`Line ${n} description`) as HTMLInputElement).value)).toEqual([
      "Salary - Sep'26 (HR)",
      "Allowance - Sep'26 (HR)",
      "EPF - Sep'26 (HR)",
      "SOCSO - Sep'26 (HR)",
      "EIS - Sep'26 (HR)",
    ])
    expect(screen.getByLabelText('Description')).toHaveValue("Salary - HR - Sep'26")
    expect(hint()).toContain('From the HR staff billing allocation, September 2026.')
    expect(hint()).toContain('Total RM 1,352.45 · saved as a draft.')
  })
})

describe('Edit', () => {
  const issued: InvoiceEditing = { id: 'inv-24', no: 'HV-INV-202610-0024', status: 'issued', settled: false, initial: INITIAL, lines: LINES }

  it('a draft: its fields and lines, rewritten whole', async () => {
    const { onDone } = draw({ ...issued, status: 'draft', no: null })
    expect(dialog()).toHaveTextContent('Edit invoice')
    expect(dialog()).toHaveTextContent('Edit invoiceDraft')
    expect(screen.getByLabelText('Bill to')).toHaveValue('co:co-hc')
    expect(screen.getByLabelText('Category')).toHaveValue('5050')
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('50000.00')
    expect(screen.queryByLabelText('Reason')).toBeNull()
    set('Line 2 amount', '15000')
    press('Save changes')
    await flush()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inv-24',
        issued: false,
        period: '2026-10',
        invoiceDate: '2026-10-12',
        dueDate: '2026-10-15',
        lines: [
          { description: 'Director Remuneration', amount: 50000, categoryCode: '5050' },
          { description: 'Operation Management Fees', amount: 15000, categoryCode: '5050' },
        ],
      }),
    )
    expect(onDone).toHaveBeenCalledWith('Draft saved')
  })

  it('an issued one needs a reason; its entry is corrected in place', async () => {
    mocks.update.mockResolvedValue({ ok: true, value: 'JE-202610-0901' })
    const { onDone } = draw(issued)
    expect(dialog()).toHaveTextContent('HV-INV-202610-0024 · issued')
    expect(hint()).toContain('The entry posted at issue is corrected in place, under the same number; the reason goes on the audit trail.')
    press('Save changes')
    expect(hint()).toContain('A reason is needed before you can save.')
    set('Reason', 'Fee agreed at 13,440')
    press('Save changes')
    await flush()
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ issued: true, reason: 'Fee agreed at 13,440' }))
    expect(onDone).toHaveBeenCalledWith('HV-INV-202610-0024 changed — JE-202610-0901 corrected')
  })

  it('money came in: its amounts, who it bills and its month stay as they are', () => {
    draw({ ...issued, status: 'paid', settled: true })
    expect(screen.getByLabelText('Bill to')).toBeDisabled()
    expect(screen.getByLabelText('Line 1 amount')).toHaveAttribute('readonly')
    expect(within(dialog()).getByRole('button', { name: '+ Add line' })).toBeDisabled()
    expect(within(dialog()).getByRole('button', { name: 'Remove line 1' })).toBeDisabled()
    expect(within(dialog()).getByRole('button', { name: 'Period' })).toBeDisabled()
    expect(hint()[0]).toMatch(/^Money has come in against it/)
    // The words are still the reader's to change.
    expect(screen.getByLabelText('Line 1 description')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Description')).not.toBeDisabled()
  })

  it('a simple invoice is its one line: the total and the header’s category', () => {
    draw({ ...issued, status: 'draft', initial: { ...INITIAL, category_code: '5018', total_amount: 780.25 }, lines: [] })
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('780.25')
    expect(screen.getByLabelText('Category')).toHaveValue('5018')
    expect(screen.queryByLabelText('Line 2 amount')).toBeNull()
  })

  // 2026-10-20: the address in its six parts.
  const typed: InvoiceEditInitial = {
    ...INITIAL,
    billable_to_type: 'freetext',
    company_id: null,
    billable_to_freetext_name: 'Rygis Private Gym',
    billable_to_freetext_address: '12 Jalan Ipoh, KL',
  }

  it('billed before the parts: its one-box address shows On file, and goes back as it was until the parts are picked', async () => {
    draw({ ...issued, status: 'draft', no: null, initial: typed })
    expect(within(dialog()).getByText('On file')).toBeInTheDocument()
    expect(within(dialog()).getByText('12 Jalan Ipoh, KL')).toBeInTheDocument()
    expect(document.getElementById('il-address-line1')).toHaveValue('')
    press('Save changes')
    await waitFor(() => expect(mocks.update).toHaveBeenCalled())
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ billKind: 'freetext', address: '12 Jalan Ipoh, KL', addressParts: null }))
  })

  it('billed with the parts: each in its field, sent back whole', async () => {
    draw({ ...issued, status: 'draft', no: null, initial: { ...typed, billable_to_freetext_address: 'No 83, Jalan Jambu 3, 11060 Paya Terubong, Pulau Pinang, Malaysia', billable_to_freetext_address_parts: PENANG } })
    expect(within(dialog()).queryByText('On file')).toBeNull()
    await listReady()
    expect(document.getElementById('il-address-line1')).toHaveValue('No 83, Jalan Jambu 3')
    expect(document.getElementById('il-address-state')).toHaveValue('Pulau Pinang')
    expect(document.getElementById('il-address-city')).toHaveValue('Paya Terubong')
    expect(document.getElementById('il-address-postcode')).toHaveValue('11060')
    part('state', 'Johor')
    press('Save changes')
    // A new state starts its city and postcode again: refused, in words, and nothing is sent.
    await waitFor(() => expect(hint()).toContain('Pick the city, postcode.'))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('a due date left out stays out — the field says so', () => {
    draw({ ...issued, status: 'draft', initial: { ...INITIAL, due_date: null } })
    expect(within(dialog()).getByRole('button', { name: /^Due date/ })).toHaveTextContent('No due date')
  })
})

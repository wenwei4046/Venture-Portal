import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { InvoiceEditInitial } from '../_lib/invoice-model'

// Create invoice and Edit (2026-10-30 — one window where Single invoice and
// Multi-line invoice were two): Bill to beside the Invoice date (today, or a
// month gone by's last day, moving with the Period until one is picked), the
// Description, the Billing mode (none until picked), the lines — each its
// account, its words and its amount — and the Due date (none until picked);
// a lone line's blank words are the Description; HR's staff cost or director
// CTC fills a recharge's lines; Several companies writes an invoice each, HR's
// figure itemised on an account for each kind of line. The same window edits
// a draft whole, and an issued invoice with a reason — once money came in, its
// amounts, its party and its month stay.

const mocks = vi.hoisted(() => ({ createLines: vi.fn(), update: vi.fn(), hr: vi.fn() }))
vi.mock('../invoice-actions', () => ({
  hubCreateLinesInvoice: mocks.createLines,
  hubUpdateInvoice: mocks.update,
  hubHrFigures: mocks.hr,
}))

import InvoiceLinesDialog, { type InvoiceEditing } from './InvoiceLinesDialog'

const companies = [
  { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' },
  { id: 'co-2990', name: '2990', short_code: '2990' },
  { id: 'co-conts', name: 'The Cont', short_code: 'CONTS' },
]
const departments = [{ id: 'd-mkt', name: 'Marketing' }]
const categories = [
  { code: '5050', label: 'Salary Income', type: 'revenue' as const, parent_code: null },
  { code: '5018', label: 'General Marketing', type: 'revenue' as const, parent_code: null },
  { code: '5013', label: 'Video Shooting', type: 'revenue' as const, parent_code: null },
  { code: '7012', label: 'Rental Income', type: 'other_income' as const, parent_code: null },
  { code: '9087', label: 'Website & Software', type: 'expense' as const, parent_code: null },
]
const STAFF = [{ companyId: 'co-conts', shortCode: 'CONTS', name: 'The Cont', amount: 1352.45, salary: 933.2, allowance: 279.96, epf: 121.32, socso: 16.13, eis: 1.84 }]
// HR's Sep'26 director CTC per subsidiary (get_director_ctc_by_company).
const DIRECTORS = [
  { companyId: 'co-hc', shortCode: 'HC', name: 'HOUZS Century', totalCtc: 25768.1, basic: 22800, kpi: 0, allowance: 0, epf: 2736, socso: 208.3, eis: 23.8 },
  { companyId: 'co-2990', shortCode: '2990', name: '2990', totalCtc: 9642.13, basic: 2500, kpi: 0, allowance: 6769.38, epf: 325, socso: 42.85, eis: 4.9 },
]

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})
function draw(editing: InvoiceEditing | null = null, period = '2026-09-01') {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(
    <InvoiceLinesDialog
      open
      onClose={onClose}
      onDone={onDone}
      period={period}
      today="2026-10-14"
      companies={companies}
      departments={departments}
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
const words = (n: number) => (screen.getByLabelText(`Line ${n} description`) as HTMLInputElement).value
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
  mocks.hr.mockImplementation(async (_month: string, mode: string) => ({
    ok: true,
    value: mode === 'director_attribution' ? { staff: [], directors: DIRECTORS } : { staff: mode === 'hr_attribution' ? STAFF : [], directors: [] },
  }))
})

describe('Create invoice', () => {
  it('Bill to beside the Invoice date, the Description, the Billing mode, one line, the Due date; nothing picked for you', () => {
    draw()
    expect(dialog()).toHaveTextContent('Create invoice')
    expect(dialog()).toHaveTextContent('Saved as draft · approve to issue')
    expect(Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)).toEqual(['Bill to', 'Invoice date', 'Description', 'Billing mode', 'Lines', 'Due date'])
    // The two side by side: one row of their own, the Description under it.
    const row = screen.getByLabelText('Bill to').parentElement?.parentElement
    expect(row).toContainElement(within(dialog()).getByRole('button', { name: /^Invoice date/ }))
    expect(row).not.toContainElement(screen.getByLabelText('Description'))
    // The hub is on September, a month gone by: its last day. No due date until one is picked.
    expect(within(dialog()).getByRole('button', { name: /^Invoice date/ })).toHaveTextContent('Wed, 30 Sep 2026')
    expect(within(dialog()).getByRole('button', { name: /^Due date/ })).toHaveTextContent('No due date')
    expect(screen.getByLabelText('Billing mode')).toHaveValue('')
    // One line to start: its account, its words (the Description's while it is the only one), its amount.
    expect(screen.getByLabelText('Line 1 account')).toHaveValue('')
    expect(screen.getByLabelText('Line 1 description')).toHaveAttribute('placeholder', 'Same as the description')
    expect(screen.queryByLabelText('Line 2 description')).toBeNull()
    expect(within(dialog()).getByRole('group', { name: 'More' })).toHaveTextContent('Several companiesPeriodReference no')
    expect(hint()).toContain('Total RM 0.00 · saved as a draft.')
    expect(within(dialog()).getByRole('button', { name: 'Save draft' })).toHaveAttribute('data-off', 'true')
  })

  it('on a desktop it is the wide window (680px), so a line’s description reads as it is typed', () => {
    draw()
    expect(dialog()).toHaveAttribute('data-wide')
  })

  it('Bill to holds the companies, the department pools, a director or someone else', () => {
    draw()
    const groups = Array.from(screen.getByLabelText('Bill to').querySelectorAll('optgroup')).map((g) => [g.label, Array.from(g.querySelectorAll('option')).map((o) => o.textContent)])
    expect(groups).toEqual([
      ['Companies', ['HOUZS Century (HC)', '2990 (2990)', 'The Cont (CONTS)']],
      ['Department pools', ['Marketing']],
      ['By name', ['A director…', 'Someone else…']],
    ])
  })

  it('a press on Save draft while something is missing says what', () => {
    draw()
    press('Save draft')
    expect(hint()).toContain('Bill to, a description, a billing mode and a line with an amount are needed before you can save.')
    expect(mocks.createLines).not.toHaveBeenCalled()
  })

  it('one line is a single invoice: its words left blank, it takes the Description; written on the hub’s month', async () => {
    const { onDone, onClose } = draw()
    set('Bill to', 'dept:d-mkt')
    set('Description', "Office Rental - Nov'26")
    set('Billing mode', 'venture_attribution')
    set('Line 1 amount', '2800')
    press('Save draft')
    expect(hint()).toContain('Each line’s account is needed before you can save.')
    set('Line 1 account', '7012')
    press('Save draft')
    await flush()
    expect(mocks.createLines).toHaveBeenCalledWith({
      billKind: 'dept_pool',
      companyId: undefined,
      deptId: 'd-mkt',
      name: undefined,
      mode: 'venture_attribution',
      period: '2026-09',
      invoiceDate: '2026-09-30',
      dueDate: '',
      description: "Office Rental - Nov'26",
      reference: '',
      lines: [{ description: "Office Rental - Nov'26", amount: 2800, categoryCode: '7012' }],
    })
    expect(onDone).toHaveBeenCalledWith('HV-INV-202609-0070 saved as draft')
    expect(onClose).toHaveBeenCalled()
  })

  it('with two lines each needs its account and its words; someone else is billed with the address the invoice prints', async () => {
    draw()
    set('Bill to', 'freetext')
    set('Name', 'Rygis Private Gym')
    await listReady()
    part('line1', 'No 83, Jalan Jambu 3')
    part('state', 'Pulau Pinang')
    part('city', 'Paya Terubong')
    set('Description', 'Marketing service — Sep')
    set('Billing mode', 'marketing_project')
    set('Line 1 description', 'Ads management')
    set('Line 1 amount', '1000')
    press('+ Add line')
    expect(screen.getByLabelText('Line 1 description')).toHaveAttribute('placeholder', 'Line 1')
    set('Line 2 amount', '500')
    press('Save draft')
    expect(hint()).toContain('Each line’s account and each line’s description are needed before you can save.')
    set('Line 1 account', '5018')
    set('Line 2 account', '5013')
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
      invoiceDate: '2026-09-30',
      dueDate: '',
      description: 'Marketing service — Sep',
      reference: '',
      lines: [
        { description: 'Ads management', amount: 1000, categoryCode: '5018' },
        { description: 'Video shooting', amount: 500, categoryCode: '5013' },
      ],
    })
  })

  it('the Invoice date is today in this month: a month gone by starts at its last day, as a payroll bill back keyed the month after', () => {
    draw(null, '2026-10-01')
    const date = () => within(dialog()).getByRole('button', { name: /^Invoice date/ })
    expect(date()).toHaveTextContent('Wed, 14 Oct 2026')
    press('Period')
    set('Period', '2026-09')
    expect(date()).toHaveTextContent('Wed, 30 Sep 2026')
    set('Period', '2026-11')
    expect(date()).toHaveTextContent('Wed, 14 Oct 2026')
    // Period put away: the hub's month again, and its date.
    set('Period', '2026-09')
    press('Period')
    expect(date()).toHaveTextContent('Wed, 14 Oct 2026')
  })

  it('Period moves the month, and the date with it until one is picked; Reference no is sent', async () => {
    draw()
    const date = () => within(dialog()).getByRole('button', { name: /^Invoice date/ })
    press('Period')
    set('Period', '2026-08')
    expect(date()).toHaveTextContent('Mon, 31 Aug 2026')
    fireEvent.click(date())
    fireEvent.click(within(dialog()).getByRole('button', { name: '20 August 2026' }))
    set('Period', '2026-07')
    expect(date()).toHaveTextContent('Thu, 20 Aug 2026')
    press('Reference no')
    set('Reference no', 'PO-881')
    set('Bill to', 'co:co-hc')
    set('Description', 'Rental')
    set('Billing mode', 'venture_attribution')
    set('Line 1 account', '7012')
    set('Line 1 amount', '100')
    press('Save draft')
    await flush()
    expect(mocks.createLines).toHaveBeenLastCalledWith(expect.objectContaining({ period: '2026-07', invoiceDate: '2026-08-20', reference: 'PO-881' }))
  })

  it('a refusal is said in words, and the window stays', async () => {
    mocks.createLines.mockResolvedValue({ ok: false, reason: 'Period 2026-09 is closed' })
    const { onClose } = draw()
    set('Bill to', 'co:co-hc')
    set('Description', 'Rental')
    set('Billing mode', 'venture_attribution')
    set('Line 1 account', '7012')
    set('Line 1 amount', '100')
    press('Save draft')
    await flush()
    expect(hint()).toContain('Period 2026-09 is closed')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('HR’s figures', () => {
  it('a shared-services recharge to a company: HR’s five lines, each account to pick; a company HR has nothing for loses them', async () => {
    draw()
    set('Billing mode', 'hr_attribution')
    set('Bill to', 'co:co-conts')
    await flush()
    expect(mocks.hr).toHaveBeenCalledWith('2026-09', 'hr_attribution')
    expect([1, 2, 3, 4, 5].map(words)).toEqual(["Salary - Sep'26 (HR)", "Allowance - Sep'26 (HR)", "EPF - Sep'26 (HR)", "SOCSO - Sep'26 (HR)", "EIS - Sep'26 (HR)"])
    expect(screen.getByLabelText('Line 1 account')).toHaveValue('')
    expect(screen.getByLabelText('Description')).toHaveValue("Salary - HR - Sep'26")
    expect(hint()).toContain('From the HR staff billing allocation, September 2026.')
    expect(hint()).toContain('Total RM 1,352.45 · saved as a draft.')
    press('Save draft')
    expect(hint()).toContain('Each line’s account is needed before you can save.')
    set('Bill to', 'co:co-hc')
    await flush()
    expect(screen.queryByLabelText('Line 2 description')).toBeNull()
    expect(words(1)).toBe('')
    expect(hint()).toContain('No HR staff billing allocation for HOUZS Century (HC) in September 2026 — enter the lines.')
  })

  // 2026-10-30 (user: "往后 director 的我也要 split category").
  it('a director recharge to a company: HR’s CTC as its lines, each on the account picked for it', async () => {
    draw()
    set('Billing mode', 'director_attribution')
    set('Bill to', 'co:co-hc')
    await flush()
    expect(mocks.hr).toHaveBeenCalledWith('2026-09', 'director_attribution')
    expect([1, 2, 3, 4].map(words)).toEqual(["Salary - Sep'26", "EPF - Sep'26", "SOCSO - Sep'26", "EIS - Sep'26"])
    expect(screen.getByLabelText('Description')).toHaveValue('Director salary CTC — September 2026')
    expect(hint()).toContain('From the director CTC, September 2026.')
    expect(hint()).toContain('Total RM 25,768.10 · saved as a draft.')
    set('Line 1 account', '5050')
    for (const n of [2, 3, 4]) set(`Line ${n} account`, '5018')
    press('Save draft')
    await flush()
    expect(mocks.createLines.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        billKind: 'subsidiary',
        companyId: 'co-hc',
        mode: 'director_attribution',
        lines: [
          { description: "Salary - Sep'26", amount: 22800, categoryCode: '5050' },
          { description: "EPF - Sep'26", amount: 2736, categoryCode: '5018' },
          { description: "SOCSO - Sep'26", amount: 208.3, categoryCode: '5018' },
          { description: "EIS - Sep'26", amount: 23.8, categoryCode: '5018' },
        ],
      }),
    )
  })
})

describe('Several companies', () => {
  it('typed amounts: an invoice each, one line in the invoice’s words, on the one account', async () => {
    const { onDone } = draw()
    set('Billing mode', 'venture_attribution')
    press('Several companies')
    expect(screen.queryByLabelText('Line 1 description')).toBeNull()
    set('Company 1', 'co-hc')
    set('Company 1 amount', '300')
    press('+ Add company')
    set('Company 2', 'co-2990')
    set('Company 2 amount', '150')
    set('Description', 'Claude AI Claim - YH')
    set('Account', '9087')
    expect(hint()).toContain('Total RM 450.00 · one invoice for each company, saved as drafts.')
    press('Save draft')
    await flush()
    expect(mocks.createLines.mock.calls.map((c) => [c[0].billKind, c[0].companyId, c[0].lines])).toEqual([
      ['subsidiary', 'co-hc', [{ description: 'Claude AI Claim - YH', amount: 300, categoryCode: '9087' }]],
      ['subsidiary', 'co-2990', [{ description: 'Claude AI Claim - YH', amount: 150, categoryCode: '9087' }]],
    ])
    expect(onDone).toHaveBeenCalledWith('2 invoices saved as drafts')
  })

  // 2026-10-30 (user: "往后 director 的我也要 split category").
  it('HR’s director CTC: an account for each kind of line, every company itemised on them; one Finance changed as one line on Salary’s', async () => {
    const { onDone } = draw()
    set('Billing mode', 'director_attribution')
    press('Several companies')
    await flush()
    expect(screen.getByLabelText('Company 1')).toHaveValue('co-hc')
    expect(screen.getByLabelText('Company 1 amount')).toHaveValue('25768.10')
    expect(screen.getByLabelText('Company 2')).toHaveValue('co-2990')
    expect(dialog()).toHaveTextContent('RM 35,410.23')
    expect(screen.getByLabelText('Description')).toHaveValue('Director salary CTC — September 2026')
    expect(hint()).toContain('From the director CTC, September 2026.')
    expect(within(dialog()).getAllByRole('combobox', { name: / account$/ }).map((s) => s.getAttribute('aria-label'))).toEqual([
      'Salary account',
      'Allowance account',
      'EPF account',
      'SOCSO account',
      'EIS account',
    ])
    expect(hint()).toContain('Each company’s invoice is itemised as HR keyed it, each line on its account. A changed amount goes out as one line, on Salary’s account.')
    press('Save draft')
    expect(hint()).toContain('An account for each line is needed before you can save.')
    set('Salary account', '5050')
    set('Allowance account', '5050')
    for (const k of ['EPF', 'SOCSO', 'EIS']) set(`${k} account`, '5018')
    set('Company 1 amount', '25000')
    press('Save draft')
    await flush()
    expect(mocks.createLines).toHaveBeenCalledTimes(2)
    expect(mocks.createLines.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        billKind: 'subsidiary',
        companyId: 'co-hc',
        mode: 'director_attribution',
        lines: [{ description: 'Director salary CTC — September 2026', amount: 25000, categoryCode: '5050' }],
      }),
    )
    expect(mocks.createLines.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        companyId: 'co-2990',
        period: '2026-09',
        description: 'Director salary CTC — September 2026',
        lines: [
          { description: "Salary - Sep'26", amount: 2500, categoryCode: '5050' },
          { description: "Allowance - Sep'26", amount: 6769.38, categoryCode: '5050' },
          { description: "EPF - Sep'26", amount: 325, categoryCode: '5018' },
          { description: "SOCSO - Sep'26", amount: 42.85, categoryCode: '5018' },
          { description: "EIS - Sep'26", amount: 4.9, categoryCode: '5018' },
        ],
      }),
    )
    expect(onDone).toHaveBeenCalledWith('2 invoices saved as drafts')
  })

  it('some in, some refused: names what failed, and the window only closes now', async () => {
    mocks.createLines.mockResolvedValueOnce({ ok: true, value: 'HV-INV-202609-0071' }).mockResolvedValueOnce({ ok: false, reason: 'Period 2026-09 is closed' })
    const { onDone } = draw()
    set('Billing mode', 'venture_attribution')
    press('Several companies')
    set('Company 1', 'co-hc')
    set('Company 1 amount', '300')
    press('+ Add company')
    set('Company 2', 'co-2990')
    set('Company 2 amount', '150')
    set('Description', 'Rental — Sep')
    set('Account', '7012')
    press('Save draft')
    await flush()
    expect(onDone).toHaveBeenCalledWith('1 of 2 invoices saved as drafts')
    expect(hint()).toContain('Created 1 of 2 — 2990 (2990): Period 2026-09 is closed')
    expect(within(dialog()).queryByRole('button', { name: 'Save draft' })).toBeNull()
    expect(within(dialog()).getAllByRole('button').at(-1)).toHaveTextContent(/^Close$/)
  })

  it('back to one party: the first company, its amount as the one line', () => {
    draw()
    set('Billing mode', 'venture_attribution')
    press('Several companies')
    set('Company 1', 'co-hc')
    set('Company 1 amount', '300')
    set('Account', '7012')
    press('Several companies')
    expect(screen.getByLabelText('Bill to')).toHaveValue('co:co-hc')
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('300')
    expect(screen.getByLabelText('Line 1 account')).toHaveValue('7012')
  })
})

describe('Edit', () => {
  const issued: InvoiceEditing = { id: 'inv-24', no: 'HV-INV-202610-0024', status: 'issued', settled: false, initial: INITIAL, lines: LINES }

  it('a draft: its fields and lines, each its account, rewritten whole', async () => {
    const { onDone } = draw({ ...issued, status: 'draft', no: null })
    expect(dialog()).toHaveTextContent('Edit invoice')
    expect(dialog()).toHaveTextContent('Edit invoiceDraft')
    expect(screen.getByLabelText('Bill to')).toHaveValue('co:co-hc')
    expect(screen.getByLabelText('Billing mode')).toHaveValue('venture_attribution')
    expect(screen.getByLabelText('Line 1 account')).toHaveValue('5050')
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('50000.00')
    expect(screen.queryByLabelText('Reason')).toBeNull()
    // One invoice is edited: no Several companies.
    expect(within(dialog()).getByRole('group', { name: 'More' })).toHaveTextContent(/^PeriodReference no$/)
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

  it('a simple invoice is its one line: the total and the header’s account, its words the Description’s', async () => {
    draw({ ...issued, status: 'draft', initial: { ...INITIAL, category_code: '5018', total_amount: 780.25 }, lines: [] })
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('780.25')
    expect(screen.getByLabelText('Line 1 account')).toHaveValue('5018')
    expect(screen.queryByLabelText('Line 2 amount')).toBeNull()
    press('Save changes')
    await flush()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ description: 'Director Remuneration & Operation Management Fees', amount: 780.25, categoryCode: '5018' }] }),
    )
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

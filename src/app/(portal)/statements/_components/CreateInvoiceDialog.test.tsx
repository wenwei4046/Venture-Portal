import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// Create invoice (2026-10-14, the Finance revamp v2 — D10's inv-form): the
// design's seven fields and two buttons, the old Create Invoice's batch behind
// the small buttons (several companies, a split across billing modes, the
// month, a reference), HR's figures filling a recharge, and what it writes.

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createLines: vi.fn(),
  hr: vi.fn(),
  update: vi.fn(),
}))
vi.mock('../invoice-actions', () => ({
  hubCreateInvoice: mocks.create,
  hubCreateLinesInvoice: mocks.createLines,
  hubHrFigures: mocks.hr,
  hubUpdateInvoice: mocks.update,
}))

import CreateInvoiceDialog from './CreateInvoiceDialog'

const companies = [
  { id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' },
  { id: 'co-2990', name: '2990', short_code: '2990' },
  { id: 'co-conts', name: 'The Cont', short_code: 'CONTS' },
]
const departments = [{ id: 'd-mkt', name: 'Marketing' }]
const categories = [
  { code: '5050', label: 'Salary Income', type: 'revenue' as const, parent_code: null },
  { code: '9091', label: 'Water & Electricity', type: 'expense' as const, parent_code: null },
]
// HR's Sep'26 director CTC per subsidiary (get_director_ctc_by_company).
const DIRECTORS = [
  { companyId: 'co-hc', shortCode: 'HC', name: 'HOUZS Century', totalCtc: 25768.1, basic: 22800, kpi: 0, allowance: 0, epf: 2736, socso: 208.3, eis: 23.8 },
  { companyId: 'co-2990', shortCode: '2990', name: '2990', totalCtc: 9642.13, basic: 2500, kpi: 0, allowance: 6769.38, epf: 325, socso: 42.85, eis: 4.9 },
]
const STAFF = [{ companyId: 'co-conts', shortCode: 'CONTS', name: 'The Cont', amount: 1352.45, salary: 933.2, allowance: 279.96, epf: 121.32, socso: 16.13, eis: 1.84 }]

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0))
})

function draw(period = '2026-09-01') {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(
    <CreateInvoiceDialog
      open
      onClose={onClose}
      onDone={onDone}
      period={period}
      today="2026-10-14"
      companies={companies}
      departments={departments}
      categories={categories}
      extraModes={[]}
    />,
  )
  return { onDone, onClose }
}
const dialog = () => screen.getByRole('dialog')
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Save draft' }))
const hint = () => within(dialog()).getAllByText((_, el) => el?.tagName === 'P').map((p) => p.textContent)
// A typed party's address, in its six parts (2026-10-20): line 1 typed, then State → City → Postcode from the list.
const part = (key: 'line1' | 'state' | 'city' | 'postcode', value: string) =>
  fireEvent.change(document.getElementById(`ci-address-${key}`) as HTMLElement, { target: { value } })
const listReady = () => waitFor(() => expect(document.getElementById('ci-address-state')).not.toBeDisabled())
const PENANG = { line1: 'No 83, Jalan Jambu 3', line2: '', postcode: '11060', city: 'Paya Terubong', state: 'Pulau Pinang', country: 'Malaysia' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ ok: true, value: 'HV-INV-202609-0061' })
  mocks.createLines.mockResolvedValue({ ok: true, value: 'HV-INV-202609-0062' })
  mocks.hr.mockImplementation(async (_month: string, mode: string) => ({
    ok: true,
    value: mode === 'director_attribution' ? { staff: [], directors: DIRECTORS } : { staff: mode === 'hr_attribution' ? STAFF : [], directors: [] },
  }))
})

describe('the design’s form', () => {
  it('Create invoice · Saved as draft · approve to issue: Bill to, Description, Category, Billing mode, Amount RM, the two dates, Cancel / Save draft', () => {
    draw()
    expect(dialog()).toHaveTextContent('Create invoice')
    expect(dialog()).toHaveTextContent('Saved as draft · approve to issue')
    const labels = Array.from(dialog().querySelectorAll('label')).map((l) => l.textContent)
    expect(labels).toEqual(['Bill to', 'Description', 'Category', 'Billing mode', 'Amount RM', 'Invoice date', 'Due date'])
    expect(screen.getByLabelText('Description')).toHaveAttribute('placeholder', 'e.g. HR shared service — Oct')
    expect(screen.getByLabelText('Billing mode')).toHaveValue('hr_attribution')
    expect(hint()).toContain('Saved as a draft. Approving issues it and posts it to the GL.')
    expect(within(dialog()).getAllByRole('button').slice(-2).map((b) => b.textContent)).toEqual(['Cancel', 'Save draft'])
    expect(within(dialog()).getByRole('button', { name: 'Save draft' })).toHaveAttribute('data-off', 'true')
    // The month's last day while it follows the month; thirty days from today.
    expect(within(dialog()).getByRole('button', { name: /^Invoice date/ })).toHaveTextContent('Wed, 30 Sep 2026')
    expect(within(dialog()).getByRole('button', { name: /^Due date/ })).toHaveTextContent('Fri, 13 Nov 2026')
    expect(within(dialog()).getByRole('group', { name: 'More' })).toHaveTextContent('Several companiesSplit billing modesPeriodReference no')
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
    save()
    expect(hint()).toContain('Bill to, a description, a category and an amount are needed before you can save.')
    expect(mocks.create).not.toHaveBeenCalled()
  })
})

describe('one invoice', () => {
  it('writes the draft on the hub’s month, says its number and closes', async () => {
    const { onDone, onClose } = draw()
    pick('Bill to', 'dept:d-mkt')
    type('Description', 'Office rental — Sep')
    pick('Category', '9091')
    pick('Billing mode', 'venture_attribution')
    type('Amount RM', '780.25')
    save()
    await flush()
    expect(mocks.create).toHaveBeenCalledWith({
      billKind: 'dept_pool',
      companyId: undefined,
      deptId: 'd-mkt',
      name: undefined,
      mode: 'venture_attribution',
      category: '9091',
      amount: 780.25,
      period: '2026-09',
      invoiceDate: '2026-09-30',
      dueDate: '2026-11-13',
      description: 'Office rental — Sep',
      reference: '',
    })
    expect(onDone).toHaveBeenCalledWith('HV-INV-202609-0061 saved as draft')
    expect(onClose).toHaveBeenCalled()
  })

  it('someone else is billed by name, with the address, phone and email the invoice prints', async () => {
    draw()
    pick('Bill to', 'freetext')
    type('Name', 'Rygis Private Gym')
    await listReady()
    part('line1', 'No 83, Jalan Jambu 3')
    part('state', 'Pulau Pinang')
    part('city', 'Paya Terubong')
    // Paya Terubong has one postcode: picked with it.
    expect(document.getElementById('ci-address-postcode')).toHaveValue('11060')
    type('Phone', '012-345 6789')
    type('Email', 'ops@rygis.my')
    type('Description', 'Marketing service')
    pick('Category', '5050')
    pick('Billing mode', 'marketing_project')
    type('Amount RM', '1000')
    save()
    // The save reads the list first, to check the address.
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        billKind: 'freetext',
        name: 'Rygis Private Gym',
        address: 'No 83, Jalan Jambu 3, 11060 Paya Terubong, Pulau Pinang, Malaysia',
        addressParts: PENANG,
        phone: '012-345 6789',
        email: 'ops@rygis.my',
        amount: 1000,
      }),
    )
  })

  it('an address half picked is refused in words, and nothing is sent', async () => {
    draw()
    pick('Bill to', 'freetext')
    type('Name', 'Rygis Private Gym')
    await listReady()
    part('line1', 'No 83, Jalan Jambu 3')
    part('state', 'Pulau Pinang')
    type('Description', 'Marketing service')
    pick('Category', '5050')
    type('Amount RM', '1000')
    save()
    await waitFor(() => expect(hint()).toContain('Pick the city, postcode.'))
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('someone else with no address at all is billed without one', async () => {
    draw()
    pick('Bill to', 'freetext')
    type('Name', 'Rygis Private Gym')
    type('Description', 'Marketing service')
    pick('Category', '5050')
    type('Amount RM', '1000')
    save()
    await flush()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ billKind: 'freetext', address: '', addressParts: null }))
  })

  it('Period moves the month and the invoice date with it; Reference no is sent; hidden again, neither is', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Period' }))
    pick('Period', '2026-08')
    expect(within(dialog()).getByRole('button', { name: /^Invoice date/ })).toHaveTextContent('Mon, 31 Aug 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Reference no' }))
    type('Reference no', 'PO-881')
    pick('Bill to', 'co:co-hc')
    type('Description', 'Rental')
    pick('Category', '9091')
    pick('Billing mode', 'venture_attribution')
    type('Amount RM', '100')
    save()
    await flush()
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ period: '2026-08', invoiceDate: '2026-08-31', reference: 'PO-881' }))
  })

  it('a refusal is said in words, and the dialog stays', async () => {
    mocks.create.mockResolvedValue({ ok: false, reason: 'Period 2026-09 is closed' })
    const { onClose } = draw()
    pick('Bill to', 'co:co-hc')
    type('Description', 'Rental')
    pick('Category', '9091')
    pick('Billing mode', 'venture_attribution')
    type('Amount RM', '100')
    save()
    await flush()
    expect(hint()).toContain('Period 2026-09 is closed')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('HR’s figures', () => {
  it('a staff recharge on one company fills the amount and the description; a typed amount is kept', async () => {
    draw()
    pick('Bill to', 'co:co-conts')
    await flush()
    expect(mocks.hr).toHaveBeenCalledWith('2026-09', 'hr_attribution')
    expect(screen.getByLabelText('Amount RM')).toHaveValue('1352.45')
    expect(screen.getByLabelText('Description')).toHaveValue('HR staff cost allocation — September 2026')
    expect(hint()).toContain('From the HR staff billing allocation, September 2026.')
    // Another company HR has nothing for: HR's amount goes, and it says so.
    pick('Bill to', 'co:co-hc')
    await flush()
    expect(screen.getByLabelText('Amount RM')).toHaveValue('')
    expect(hint()).toContain('No HR staff billing allocation for HOUZS Century (HC) in September 2026 — enter the amount.')
    type('Amount RM', '500')
    pick('Bill to', 'co:co-conts')
    await flush()
    expect(screen.getByLabelText('Amount RM')).toHaveValue('500')
  })

  it('a director recharge rewrites HR’s description with its own', async () => {
    draw()
    pick('Bill to', 'co:co-conts')
    await flush()
    pick('Billing mode', 'director_attribution')
    await flush()
    expect(screen.getByLabelText('Description')).toHaveValue('HR staff cost allocation — September 2026')
    pick('Bill to', 'co:co-hc')
    await flush()
    expect(screen.getByLabelText('Amount RM')).toHaveValue('25768.10')
    expect(screen.getByLabelText('Description')).toHaveValue('Director salary CTC — September 2026')
  })

  // 2026-10-06 (user: "director 要 bill back 的我要拆 detail 可以吗？" → "可以").
  it('several companies take HR’s director CTC; each goes out itemised, one Finance changed as one line', async () => {
    const { onDone } = draw()
    pick('Billing mode', 'director_attribution')
    fireEvent.click(screen.getByRole('button', { name: 'Several companies' }))
    await flush()
    expect(screen.getByLabelText('Company 1')).toHaveValue('co-hc')
    expect(screen.getByLabelText('Company 1 amount')).toHaveValue('25768.10')
    expect(screen.getByLabelText('Company 2')).toHaveValue('co-2990')
    expect(dialog()).toHaveTextContent('RM 35,410.23')
    expect(hint()).toContain('From the director CTC, September 2026. Itemised as HR keyed it; a changed amount goes out as one line.')
    pick('Category', '5050')
    type('Company 1 amount', '25000')
    save()
    await flush()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ billKind: 'subsidiary', companyId: 'co-hc', amount: 25000, mode: 'director_attribution', category: '5050' }))
    expect(mocks.createLines).toHaveBeenCalledWith(
      expect.objectContaining({
        billKind: 'subsidiary',
        companyId: 'co-2990',
        mode: 'director_attribution',
        period: '2026-09',
        description: 'Director salary CTC — September 2026',
        lines: [
          { description: "Salary - Sep'26", amount: 2500, categoryCode: '5050' },
          { description: "Allowance - Sep'26", amount: 6769.38, categoryCode: '5050' },
          { description: "EPF - Sep'26", amount: 325, categoryCode: '5050' },
          { description: "SOCSO - Sep'26", amount: 42.85, categoryCode: '5050' },
          { description: "EIS - Sep'26", amount: 4.9, categoryCode: '5050' },
        ],
      }),
    )
    expect(onDone).toHaveBeenCalledWith('2 invoices saved as drafts')
  })
})

describe('a split across billing modes', () => {
  it('one party: the lines add up to the amount, each its own invoice', async () => {
    draw()
    pick('Bill to', 'co:co-hc')
    type('Description', 'Shared services — Sep')
    pick('Category', '5050')
    type('Amount RM', '1000')
    fireEvent.click(screen.getByRole('button', { name: 'Split billing modes' }))
    expect(screen.queryByLabelText('Category')).toBeNull()
    expect(screen.getByLabelText('Line 1 billing mode')).toHaveValue('hr_attribution')
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('1000.00')
    type('Line 1 amount', '600')
    pick('Line 2 billing mode', 'finance_attribution')
    pick('Line 2 category', '5050')
    type('Line 2 amount', '300')
    save()
    expect(hint()).toContain('The lines add up to RM 900.00 — the amount is RM 1,000.00.')
    type('Line 2 amount', '400')
    save()
    await flush()
    expect(mocks.create.mock.calls.map((c) => [c[0].mode, c[0].amount])).toEqual([
      ['hr_attribution', 600],
      ['finance_attribution', 400],
    ])
  })

  it('several companies: the lines are each company’s proportions', async () => {
    mocks.hr.mockResolvedValue({ ok: true, value: { staff: [], directors: [] } })
    draw()
    pick('Billing mode', 'venture_attribution')
    fireEvent.click(screen.getByRole('button', { name: 'Several companies' }))
    pick('Company 1', 'co-hc')
    type('Company 1 amount', '300')
    fireEvent.click(screen.getByRole('button', { name: '+ Add company' }))
    pick('Company 2', 'co-2990')
    type('Company 2 amount', '150')
    type('Description', 'Rental — Sep')
    fireEvent.click(screen.getByRole('button', { name: 'Split billing modes' }))
    pick('Line 1 category', '9091')
    type('Line 1 share', '2')
    pick('Line 2 billing mode', 'hr_attribution')
    pick('Line 2 category', '9091')
    type('Line 2 share', '1')
    expect(hint()).toContain('Each company’s amount is split in these proportions — one invoice for each company and line.')
    save()
    await flush()
    expect(mocks.create.mock.calls.map((c) => [c[0].companyId, c[0].mode, c[0].amount])).toEqual([
      ['co-hc', 'venture_attribution', 200],
      ['co-hc', 'hr_attribution', 100],
      ['co-2990', 'venture_attribution', 100],
      ['co-2990', 'hr_attribution', 50],
    ])
  })

  it('some in, some refused: names what failed, and the dialog only closes now', async () => {
    mocks.create.mockResolvedValueOnce({ ok: true, value: 'HV-INV-202609-0063' }).mockResolvedValueOnce({ ok: false, reason: 'Unsupported billing mode: x' })
    const { onDone } = draw()
    pick('Bill to', 'co:co-hc')
    type('Description', 'Split')
    pick('Category', '5050')
    type('Amount RM', '10')
    fireEvent.click(screen.getByRole('button', { name: 'Split billing modes' }))
    type('Line 1 amount', '6')
    pick('Line 2 billing mode', 'finance_attribution')
    pick('Line 2 category', '5050')
    type('Line 2 amount', '4')
    save()
    await flush()
    expect(onDone).toHaveBeenCalledWith('1 of 2 invoices saved as drafts')
    expect(hint()).toContain('Created 1 of 2 — HOUZS Century (HC) · Finance attribution: Unsupported billing mode: x')
    expect(within(dialog()).queryByRole('button', { name: 'Save draft' })).toBeNull()
    expect(within(dialog()).getAllByRole('button').at(-1)).toHaveTextContent(/^Close$/)
  })
})

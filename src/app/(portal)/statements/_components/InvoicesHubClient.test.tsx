import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { toHubInvoice, type HubCreditNote, type InvoiceContext, type InvoiceHubData, type InvoiceRowIn } from '../_lib/invoice-model'
import { invoiceSteps, type InvoiceCan } from './InvoiceDrawer'

// Invoice's hub (2026-10-14, the Finance revamp v2 — D10): the head's three
// menus, the month's total with its month pill, a card a list, the table with
// Select and the dark bar that settles one payer's invoices, the drawer an
// invoice opens with the system's own steps, and the lists that are not the
// table's. What the old Service Billing list did is held here too: one
// receipt per payer, the part payment, another month's invoices on the same
// receipt, Void / Print selected, Approve all, Copy, the right-click menu.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  flash: vi.fn(),
  approve: vi.fn(),
  approveMonth: vi.fn(),
  del: vi.fn(),
  voidInv: vi.fn(),
  settle: vi.fn(),
  copy: vi.fn(),
  cnApprove: vi.fn(),
  cnVoid: vi.fn(),
  cnDelete: vi.fn(),
  dialog: vi.fn(),
}))
const { marker } = vi.hoisted(() => ({
  marker: (name: string) =>
    function Marker(props: Record<string, unknown>) {
      mocks.dialog(name, props)
      return <div data-testid={`dialog-${name}`} />
    },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }
      return q
    },
  }),
}))
vi.mock('../invoice-actions', () => ({
  hubApproveInvoice: mocks.approve,
  hubApproveMonth: mocks.approveMonth,
  hubDeleteDraft: mocks.del,
  hubVoidInvoices: mocks.voidInv,
  hubSettleInvoices: mocks.settle,
  hubCopyInvoice: mocks.copy,
  hubApproveCreditNote: mocks.cnApprove,
  hubVoidCreditNote: mocks.cnVoid,
  hubDeleteCreditNote: mocks.cnDelete,
}))
vi.mock('./CreateInvoiceDialog', () => ({ default: marker('single') }))
vi.mock('./InvoiceLinesDialog', () => ({ default: marker('lines') }))
vi.mock('./CreditNoteDialog', () => ({ default: marker('credit_note') }))
vi.mock('./ChangeAccountDialog', () => ({ default: marker('reassign') }))
vi.mock('./GenerateDialogs', () => ({
  MarketingDialog: marker('marketing'),
  PayrollInvoicesDialog: marker('consolidated'),
  ReconcileDialog: marker('reconcile'),
  OwnShareDialog: marker('own-share'),
}))
vi.mock('@/components/department/DepartmentModeSwitch', () => ({ default: () => <div data-testid="mode-switch" /> }))

import InvoicesHubClient from './InvoicesHubClient'

const ctx: InvoiceContext = {
  companies: new Map([
    ['co-hc', { name: 'HOUZS Century', code: 'HC' }],
    ['co-hm', { name: 'HOUZS Mattress', code: 'HM' }],
  ]),
  departments: new Map([['d-mkt', 'Marketing']]),
  accounts: new Map([['5020', 'Salary Income']]),
  extraModes: [],
  lines: new Map(),
  receipts: new Map(),
  settlements: new Map(),
  creditNotes: new Map(),
}
const row = (over: Partial<InvoiceRowIn> & { id: string; invoice_no: string }): InvoiceRowIn => ({
  company_id: 'co-hc',
  period_month: '2026-10-01',
  billing_mode: 'hr_attribution',
  total_amount: 1000,
  status: 'issued',
  billable_to_type: 'subsidiary',
  billable_to_department_id: null,
  billable_to_freetext_name: null,
  billable_to_freetext_address: null,
  billable_to_freetext_phone: null,
  billable_to_freetext_email: null,
  description: 'HR shared service — Oct',
  invoice_date: '2026-10-07',
  due_date: '2026-11-06',
  reference_no: null,
  category_code: '5020',
  ...over,
})
const CN: HubCreditNote = {
  id: 'cn1',
  no: 'HV-CN-202610-0002',
  invoiceId: 'hc1',
  invoiceNo: 'HV-INV-202610-0013',
  party: 'HOUZS Century (HC)',
  amount: 220.4,
  reason: 'Overbilled 1 staff',
  status: 'draft',
  category: '5020 · Salary Income',
  createdAt: '2026-10-10T00:00:00Z',
}

function hub(over: Partial<InvoiceHubData> = {}): InvoiceHubData {
  return {
    period: '2026-10-01',
    invoices: [
      toHubInvoice(row({ id: 'hc1', invoice_no: 'HV-INV-202610-0013', total_amount: 2204 }), ctx),
      toHubInvoice(row({ id: 'hc2', invoice_no: 'HV-INV-202610-0009', total_amount: 2000, billing_mode: 'marketing_project', description: 'Marketing retainer — Oct' }), ctx),
      toHubInvoice(row({ id: 'hm1', invoice_no: 'HV-INV-202610-0012', company_id: 'co-hm', total_amount: 1653 }), ctx),
      toHubInvoice(row({ id: 'pd1', invoice_no: 'HV-INV-202610-0003', status: 'paid', total_amount: 1250 }), ctx),
      toHubInvoice(row({ id: 'dr1', invoice_no: 'HV-INV-202610-0017', status: 'draft', total_amount: 500 }), ctx),
      toHubInvoice(row({ id: 'dp1', invoice_no: 'HV-INV-202610-0006', company_id: null, billable_to_type: 'dept_pool', billable_to_department_id: 'd-mkt', total_amount: 780.25 }), ctx),
    ],
    otherOpen: [toHubInvoice(row({ id: 'old1', invoice_no: 'HV-INV-202609-0040', period_month: '2026-09-01', total_amount: 300 }), ctx, true)],
    creditNotes: [CN],
    contracts: [{ id: 'ct1', description: 'Marketing retainer — Q4', amount: 6000, status: 'active', start: '2026-10-01', end: '2026-12-31', company: 'HOUZS Century (HC)', invoice: { id: 'hc2', no: 'HV-INV-202610-0009' } }],
    nonBillable: [
      { id: 'vp1', at: '2026-10-06T02:00:00Z', type: 'expense_out', amount: 2899.75, description: 'AI tools Sep26 claim', source: 'Payment voucher', out: true },
      { id: 'vp2', at: '2026-10-05T02:00:00Z', type: 'profit_in', amount: 21.5, description: 'Settle HV-INV-202609-0017', source: 'Payment voucher', out: false },
    ],
    banks: [{ id: 'b1', label: 'Hong Leong Bank — 123-456-7890' }],
    basis: { status: 'Pending', note: 'HR pending · Director salary pending · 1 marketing contract', summary: 'Nothing from payroll yet', lines: [], director: null, allocation: [] },
    department: null,
    companies: [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
    departments: [{ id: 'd-mkt', name: 'Marketing' }],
    categories: [{ code: '5020', label: 'Salary Income', type: 'revenue', parent_code: null }],
    extraModes: [],
    ...over,
  }
}
const ALL: InvoiceCan = { create: true, edit: true, void: true, approveCn: true, voucher: true, listExport: true, docExport: true }
const NONE: InvoiceCan = { create: false, edit: false, void: false, approveCn: false, voucher: false, listExport: false, docExport: false }

function draw({ can = ALL, data = hub(), card = 'all', openNew = false }: { can?: InvoiceCan; data?: InvoiceHubData; card?: 'all' | 'issued' | 'paid' | 'draft' | 'voided' | 'cn' | 'mkt' | 'nonbill'; openNew?: boolean } = {}) {
  return render(<InvoicesHubClient hub={data} can={can} canSetDefault={false} today="2026-10-14" thisMonth="2026-10" initialCard={card} openNew={openNew} />)
}
const rows = () => screen.getAllByRole('row').slice(1)
const rowOf = (name: string, amount: string) => rows().find((r) => r.textContent?.includes(name) && r.textContent.includes(amount))!
/** The dialog opened last — one closing still plays out before it goes. */
const dialog = () => {
  const all = document.querySelectorAll<HTMLElement>('[data-fin-dialog] [role="dialog"]')
  return all[all.length - 1] ?? null
}
const drawer = () => document.querySelector('[data-fin-drawer] [role="dialog"]') as HTMLElement
const flush = () => act(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/statements')
  for (const fn of [mocks.approve, mocks.approveMonth, mocks.del, mocks.copy, mocks.cnApprove, mocks.cnVoid, mocks.cnDelete]) fn.mockResolvedValue({ ok: true, value: null })
  mocks.voidInv.mockResolvedValue({ ok: true, value: ['HV-INV-202610-0013'] })
  mocks.settle.mockResolvedValue({ ok: true, value: { voucherNo: 'HV-OR-202610-0031', settledCount: 2, total: 4204, isPartial: false } })
})

describe('the head and the cards', () => {
  it('reads the design’s words: I. DAILY · INVOICES, the three menus, the month’s total and its pill', () => {
    draw()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Invoices')
    expect(screen.getByText('Daily · Invoices')).toBeInTheDocument()
    for (const b of ['Create invoice ▾', 'Payroll ▾', 'Export ▾']) expect(screen.getByRole('button', { name: b })).toBeInTheDocument()
    // Issued and paid count; the draft does not.
    expect(screen.getByText('Invoiced · 5 invoices')).toBeInTheDocument()
    expect(screen.getByText('RM 7,887.25')).toBeInTheDocument()
    expect(screen.getByText('October 2026')).toBeInTheDocument()
  })

  it('cards each list with its count and figure — credit notes taken off, the projects, what left the pool', () => {
    draw()
    const card = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) })
    expect(card('All invoices')).toHaveTextContent('6 invoicesRM 8,387.25')
    expect(card('Issued')).toHaveTextContent('4 invoicesRM 6,637.25')
    expect(card('Draft')).toHaveTextContent('1 invoiceRM 500.00')
    expect(card('Credit notes')).toHaveTextContent('1 credit note−RM 220.40')
    expect(card('Marketing projects')).toHaveTextContent('1 project · 1 activeRM 6,000.00')
    expect(card('Non-billable')).toHaveTextContent('2 transactionsRM 2,899.75')
  })

  it('without Billing · Create there is no Create invoice, and Payroll ▾ holds the basis alone; without an export no Export ▾', () => {
    draw({ can: NONE })
    expect(screen.queryByRole('button', { name: 'Create invoice ▾' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Export ▾' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Payroll ▾' }))
    expect(within(dialog()).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Payroll basisPending · HR pending · Director salary pending · 1 marketing contract'])
  })

  it('Create invoice ▾ opens the invoice dialogs on the page’s month', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice ▾' }))
    expect(within(dialog()).getByText('From 1 active marketing project')).toBeInTheDocument()
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /Single invoice/ }))
    expect(screen.getByTestId('dialog-single')).toBeInTheDocument()
    expect(mocks.dialog).toHaveBeenLastCalledWith('single', expect.objectContaining({ period: '2026-10-01', open: true, today: '2026-10-14' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice ▾' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /Multi-line invoice/ }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('lines', expect.objectContaining({ period: '2026-10-01', open: true }))
    expect(mocks.dialog.mock.lastCall?.[1].editing).toBeUndefined()
  })

  it('the generators open on the page’s month — Marketing from Create invoice ▾, the three payroll ones from Payroll ▾', () => {
    draw()
    const pick = (menu: string, item: RegExp) => {
      fireEvent.click(screen.getByRole('button', { name: menu }))
      fireEvent.click(within(dialog()).getByRole('menuitem', { name: item }))
    }
    pick('Create invoice ▾', /Generate Marketing invoices/)
    expect(mocks.dialog).toHaveBeenLastCalledWith('marketing', expect.objectContaining({ period: '2026-10-01', open: true }))
    pick('Payroll ▾', /Generate payroll invoices/)
    expect(mocks.dialog).toHaveBeenLastCalledWith('consolidated', expect.objectContaining({ period: '2026-10-01', open: true }))
    pick('Payroll ▾', /Reconcile payroll/)
    expect(mocks.dialog).toHaveBeenLastCalledWith('reconcile', expect.objectContaining({ period: '2026-10-01', open: true }))
    pick('Payroll ▾', /Own-share/)
    expect(mocks.dialog).toHaveBeenLastCalledWith('own-share', expect.objectContaining({ period: '2026-10-01', open: true }))
  })

  it('Export ▾ names the files of the month on show', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }))
    expect(within(dialog()).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Excelinvoices-202610.xlsx',
      'PDF · listOne PDF with the list',
      'PDF · per invoiceEach invoice on its own page',
    ])
  })

  it('the month pill steps a month, and its label opens the year’s months', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(mocks.push).toHaveBeenLastCalledWith('/statements?period=2026-09-01')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(mocks.push).toHaveBeenLastCalledWith('/statements?period=2026-11-01')
    fireEvent.click(screen.getByRole('button', { name: 'October 2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mar' }))
    expect(mocks.push).toHaveBeenLastCalledWith('/statements?period=2026-03-01')
  })
})

describe('the list', () => {
  it('reads Name · Description · Amount, newest first as the server sent them, and searches number, company, mode', () => {
    draw()
    expect(rows()).toHaveLength(6)
    expect(rows()[0]).toHaveTextContent('HOUZS Century (HC)HR shared service — OctRM 2,204.00')
    fireEvent.change(screen.getByPlaceholderText('Search invoice # / company / mode…'), { target: { value: 'marketing project' } })
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('1 · Oct 2026')).toBeInTheDocument()
  })

  it('a card is its list: Paid, Draft', () => {
    draw({ card: 'paid' })
    expect(rows()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /^Draft/ }))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('RM 500.00')
  })

  it('a right-click offers Open, a new tab, the PDF and what the invoice can do', () => {
    draw()
    fireEvent.contextMenu(rowOf('HOUZS Century', '2,204.00'))
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent)
    expect(items).toEqual(['Open', 'Open in new tab', 'PDF', 'Settle', 'Edit', '+ Credit note', 'Change account', 'Copy as new draft', 'Void invoice'])
  })
})

describe('the drawer', () => {
  it('an issued invoice: the hero, Balance · Billing · Line items · Receipts, and Settle · Edit · ⋯', () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    const d = drawer()
    expect(d).toHaveTextContent('Invoice · HR attribution')
    expect(d).toHaveTextContent('issued')
    expect(d).toHaveTextContent('Settle collects the remaining RM 2,204.00. Same-company invoices can be settled together on one receipt.')
    for (const g of ['Balance', 'Billing', 'Line items', 'Receipts']) expect(within(d).getByText(g)).toBeInTheDocument()
    expect(d).toHaveTextContent('Due06 Nov 202623 days left')
    expect(d).toHaveTextContent('No money received against this invoice yet.')
    expect(within(d).getByRole('link', { name: 'View full page ↗' })).toHaveAttribute('href', '/invoices/hc1')
    expect(within(d).getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/billing/invoice-doc?id=hc1')
    expect(within(d).getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'Settle', 'Edit', '⋯'])
  })

  it('Edit opens the invoice in the lines dialog — its fields, its lines, whether money came in', () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Edit' }))
    expect(mocks.dialog).toHaveBeenLastCalledWith(
      'lines',
      expect.objectContaining({
        open: true,
        editing: expect.objectContaining({ id: 'hc1', status: 'issued', settled: false, initial: expect.objectContaining({ billing_mode: 'hr_attribution' }) }),
      }),
    )
    // Saved: the hub's toast says so and reads the list again.
    const { onDone, onClose } = mocks.dialog.mock.lastCall?.[1] as { onDone: (m: string) => void; onClose: () => void }
    act(() => onDone('HV-INV-202610-0001 changed — JE-202610-0901 corrected'))
    expect(mocks.flash).toHaveBeenCalledWith('HV-INV-202610-0001 changed — JE-202610-0901 corrected')
    expect(mocks.refresh).toHaveBeenCalled()
    act(() => onClose())
    expect(mocks.dialog).toHaveBeenLastCalledWith('lines', expect.objectContaining({ open: false }))
  })

  it('Settle opens the settle dialog for it; a department pool’s settles on the voucher page', () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Settle' }))
    expect(dialog()).toHaveTextContent('Settle 1 invoice')
    expect(dialog()).toHaveTextContent('HOUZS Century (HC) · one receipt')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(rowOf('Marketing', '780.25'))
    expect(drawer()).toHaveTextContent('by netting, on the voucher page')
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Settle' }))
    expect(mocks.push).toHaveBeenCalledWith('/payments/new?invoice_id=dp1&return_to=/statements')
  })

  it('a draft: Approve & issue posts it and says so', async () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '500.00'))
    expect(within(drawer()).getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'Approve & issue', 'Edit', '⋯'])
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Approve & issue' }))
    await flush()
    expect(mocks.approve).toHaveBeenCalledWith('dr1')
    expect(mocks.flash).toHaveBeenCalledWith('Approved & issued — posted to the GL')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('a refusal is said in the drawer, in words', async () => {
    mocks.approve.mockResolvedValue({ ok: false, reason: 'The period 2026-10 is closed.' })
    draw()
    fireEvent.click(rowOf('HOUZS Century', '500.00'))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Approve & issue' }))
    await flush()
    expect(within(drawer()).getByRole('alert')).toHaveTextContent('The period 2026-10 is closed.')
  })

  it('⋯ on a draft deletes it after asking', async () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '500.00'))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /Delete draft/ }))
    expect(dialog()).toHaveTextContent('Delete this draft?')
    expect(dialog()).toHaveTextContent('HV-INV-202610-0017 has not been issued. Deleting removes it.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }))
    await flush()
    expect(mocks.del).toHaveBeenCalledWith('dr1')
    expect(mocks.flash).toHaveBeenCalledWith('Draft deleted')
  })

  it('a paid invoice: Refund through a voucher, + Credit note, ⋯ (Change account, Edit, Copy)', () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '1,250.00'))
    expect(within(drawer()).getAllByRole('button').map((b) => b.textContent)).toEqual(['×', 'Refund', '+ Credit note', '⋯'])
    expect(drawer()).toHaveTextContent('Paid. Refund it if something was billed wrong.')
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Refund' }))
    expect(mocks.push).toHaveBeenCalledWith('/payments/new?mode=refund&invoice_id=pd1&return_to=/statements')
  })

  it('⋯ › + Credit note and Change account open their dialogs on the invoice — what it owes, what it posted to', () => {
    draw({ data: hub({ invoices: [toHubInvoice(row({ id: 'hc1', invoice_no: 'HV-INV-202610-0013', total_amount: 2204 }), { ...ctx, creditNotes: new Map([['hc1', [{ id: 'c1', no: 'HV-CN-202610-0002', amount: 220.4, reason: 'Overbilled', status: 'draft' }]]]) })] }) })
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /\+ Credit note/ }))
    expect(mocks.dialog).toHaveBeenLastCalledWith(
      'credit_note',
      expect.objectContaining({
        open: true,
        invoice: { id: 'hc1', no: 'HV-INV-202610-0013', party: 'HOUZS Century (HC)', total: 2204, received: 0, credited: 220.4, mode: 'hr_attribution', category: '5020' },
      }),
    )
    fireEvent.click(within(drawer()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /Change account/ }))
    expect(mocks.dialog).toHaveBeenLastCalledWith('reassign', expect.objectContaining({ open: true, invoice: expect.objectContaining({ id: 'hc1', category: '5020' }) }))
  })

  // CN v2 (2026-08-19): a credit note nets what an ISSUED invoice still owes — the system refuses one on a
  // paid invoice (refund it) and on a consolidated payroll invoice; the design's button stays, shut, saying why.
  it('a credit note the system would refuse is drawn shut, with why', () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '1,250.00'))
    const cn = within(drawer()).getByRole('button', { name: '+ Credit note' })
    expect(cn).toBeDisabled()
    expect(cn).toHaveAttribute('title', 'A credit note nets what is still owed — a paid invoice is refunded instead')
    const inv = toHubInvoice(row({ id: 'pc1', invoice_no: 'HV-INV-202610-0020', billing_mode: 'payroll_consolidated' }), ctx)
    const { more } = invoiceSteps(inv, ALL)
    expect(more.find((s) => s.key === 'credit_note')?.off).toBe('A consolidated payroll invoice settles in full — no credit note')
  })

  it('Void asks for a reason before it voids', async () => {
    draw()
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /Void invoice/ }))
    expect(dialog()).toHaveTextContent('Void HV-INV-202610-0013?')
    expect(dialog()).toHaveTextContent('The invoice and its GL entry are reversed. HOUZS Century (HC) will no longer owe RM 2,204.00.')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Void invoice' }))
    await flush()
    expect(mocks.voidInv).not.toHaveBeenCalled()
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Give a reason for voiding')
    fireEvent.change(within(dialog()).getByLabelText('Reason'), { target: { value: 'wrong amount — reissued' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Void invoice' }))
    await flush()
    expect(mocks.voidInv).toHaveBeenCalledWith(['hc1'], 'wrong amount — reissued')
    expect(mocks.flash).toHaveBeenCalledWith('HV-INV-202610-0013 voided')
  })

  it('Copy lands a new draft in this month and says so', async () => {
    draw({ data: hub({ period: '2026-09-01' }) })
    fireEvent.click(rowOf('HOUZS Century', '1,250.00'))
    fireEvent.click(within(drawer()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /Copy as new draft/ }))
    expect(dialog()).toHaveTextContent('A new draft in October 2026, with the same lines')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Copy as new draft' }))
    await flush()
    expect(mocks.copy).toHaveBeenCalledWith('pd1')
    expect(mocks.flash).toHaveBeenCalledWith('Copied as a new draft')
    expect(mocks.push).toHaveBeenCalledWith('/statements?period=2026-10-01')
  })
})

describe('Select: one payer’s invoices on one receipt', () => {
  it('ticks issued invoices; a paid one cannot be, and says why', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(rowOf('HOUZS Century', '1,250.00'))
    expect(mocks.flash).toHaveBeenCalledWith('Only issued invoices can be settled')
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    fireEvent.click(rowOf('HOUZS Century', '2,000.00'))
    const bar = screen.getByRole('region', { name: 'What is ticked' })
    expect(bar).toHaveTextContent('2 selected · RM 4,204.00')
    expect(bar).toHaveTextContent('HOUZS Century (HC)')
    fireEvent.click(within(bar).getByRole('button', { name: 'Settle 2 →' }))
    expect(dialog()).toHaveTextContent('Settle 2 invoices')
    expect(dialog()).toHaveTextContent('HV-INV-202610-00132,204.00')
    expect(dialog()).toHaveTextContent('TotalRM 4,204.00')
    // Several invoices settle in full: no amount to type.
    expect(within(dialog()).queryByLabelText('Amount received RM')).toBeNull()
  })

  it('will not put two companies on one receipt', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    fireEvent.click(rowOf('HOUZS Mattress', '1,653.00'))
    const bar = screen.getByRole('region', { name: 'What is ticked' })
    expect(bar).toHaveTextContent('Different companies can’t be combined')
    fireEvent.click(within(bar).getByRole('button', { name: 'Settle 2 →' }))
    expect(mocks.flash).toHaveBeenCalledWith('One receipt can only settle one company’s invoices')
    expect(dialog()).toBeNull()
  })

  it('the head’s box ticks every row that can be; ⋯ voids what may be voided', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select every row that can be' }))
    const bar = screen.getByRole('region', { name: 'What is ticked' })
    // Four issued invoices, the department pool's among them (voidable, not settleable).
    expect(bar).toHaveTextContent('4 selected')
    fireEvent.click(within(bar).getByRole('button', { name: 'More' }))
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: /Void selected · 4/ }))
    fireEvent.change(within(dialog()).getByLabelText('Reason'), { target: { value: 'reissued' } })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Void 4 invoices' }))
    await flush()
    expect(mocks.voidInv).toHaveBeenCalledWith(expect.arrayContaining(['hc1', 'hc2', 'hm1', 'dp1']), 'reissued')
  })

  it('other months’ open invoices join while selecting, for one receipt across months', () => {
    draw()
    expect(screen.queryByRole('button', { name: /Other months/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: /Other months/ }))
    expect(rows()).toHaveLength(7)
    expect(screen.getByText('7 · Oct 2026 + other months')).toBeInTheDocument()
    fireEvent.click(rowOf('HOUZS Century', '300.00'))
    fireEvent.click(rowOf('HOUZS Century', '2,204.00'))
    expect(screen.getByRole('region', { name: 'What is ticked' })).toHaveTextContent('2 selected · RM 2,504.00')
  })
})

describe('the lists that are not the table’s', () => {
  it('credit notes: a row a note, Approve asks first and posts it', async () => {
    draw({ card: 'cn' })
    expect(screen.getByText('HV-CN-202610-0002')).toBeInTheDocument()
    expect(screen.getByText('HOUZS Century (HC) · Overbilled 1 staff · draft')).toBeInTheDocument()
    expect(screen.getByText('−220.40')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(dialog()).toHaveTextContent('Approve HV-CN-202610-0002?')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Approve' }))
    await flush()
    expect(mocks.cnApprove).toHaveBeenCalledWith('cn1')
    expect(mocks.flash).toHaveBeenCalledWith('HV-CN-202610-0002 approved — posted to the GL')
  })

  it('a credit note’s row opens what it can do — its invoice among them', () => {
    draw({ card: 'cn' })
    fireEvent.click(screen.getByText('HV-CN-202610-0002'))
    expect(within(dialog()).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Open HV-INV-202610-0013', 'PDF', 'Approve', 'Delete draft'])
    fireEvent.click(within(dialog()).getByRole('menuitem', { name: 'Open HV-INV-202610-0013' }))
    expect(drawer()).toHaveTextContent('HV-INV-202610-0013')
  })

  it('marketing projects: Invoice opens the month’s invoice; + New contract', () => {
    draw({ card: 'mkt' })
    expect(screen.getByText('HOUZS Century (HC) · 01 Oct – 31 Dec 2026 · active')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ New contract' })).toHaveAttribute('href', '/billing/contracts/new')
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }))
    expect(drawer()).toHaveTextContent('HV-INV-202610-0009')
  })

  it('non-billable: what left the pool plain, what came in green with a +', () => {
    draw({ card: 'nonbill' })
    expect(screen.getByText('2,899.75')).toBeInTheDocument()
    expect(screen.getByText('+21.50')).toHaveAttribute('data-tone', 'ledger')
    expect(screen.getByText('06 Oct 2026 · expense out · Payment voucher')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '+ Add non-billable expense' })).toHaveAttribute('href', '/payments/new?preset=non_billable')
  })
})

describe('arriving', () => {
  it('?new=1 (the Overview’s Create invoice) opens Create invoice', () => {
    window.history.replaceState(null, '', '/statements?new=1')
    draw({ openNew: true })
    expect(screen.getByTestId('dialog-single')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('back from a department pool’s settle (?receipt=) says the receipt was written', () => {
    window.history.replaceState(null, '', '/statements?receipt=HV-OR-202610-0040')
    draw()
    expect(mocks.flash).toHaveBeenCalledWith('Receipt HV-OR-202610-0040 written — the invoice is settled')
    expect(window.location.search).toBe('')
  })

  it('back from a refund it says the refund’s voucher, not a receipt (2026-10-15)', () => {
    window.history.replaceState(null, '', '/statements?receipt=HV-PV-202610-0612')
    draw()
    expect(mocks.flash).toHaveBeenCalledWith('Refund voucher HV-PV-202610-0612 written')
  })

  it('the card is kept in the address', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Issued/ }))
    expect(window.location.search).toBe('?status=issued')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { toHubInvoice, type HubCreditNote, type InvoiceContext, type InvoiceHubData, type InvoiceRowIn } from '@/app/(portal)/statements/_lib/invoice-model'
import type { InvoiceCan } from '@/app/(portal)/statements/_components/InvoiceDrawer'
import type { InvoicePageData } from '@/app/(portal)/invoices/[id]/_lib/invoice-page'

// Daily › Invoice in the Finance phone app (2026-10-15, M10–M11): the hub's
// stacked cards under the month pill, a list with Select — one payer's issued
// invoices ticked, the dark bar settles them — the credit notes, projects and
// non-billable lines, and an invoice: the drawer's parts and what the full page
// adds (its trail, its audit log), with the drawer's own steps.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(), openPage: vi.fn(), approve: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/daily/invoices',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/statements/page-actions', () => ({ openInvoicePage: mocks.openPage }))
vi.mock('@/app/(portal)/statements/invoice-actions', () => ({
  hubApproveInvoice: mocks.approve,
  hubApproveMonth: vi.fn(),
  hubDeleteDraft: vi.fn(),
  hubVoidInvoices: vi.fn(),
  hubSettleInvoices: vi.fn(),
  hubCopyInvoice: vi.fn(),
  hubApproveCreditNote: vi.fn(),
  hubVoidCreditNote: vi.fn(),
  hubDeleteCreditNote: vi.fn(),
}))
vi.mock('@/app/(portal)/statements/_components/CreateInvoiceDialog', () => ({ default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-invoice" /> : null) }))
vi.mock('@/app/(portal)/statements/_components/InvoiceLinesDialog', () => ({ default: () => null }))
vi.mock('@/app/(portal)/statements/_components/CreditNoteDialog', () => ({ default: () => null }))
vi.mock('@/app/(portal)/statements/_components/ChangeAccountDialog', () => ({ default: () => null }))
vi.mock('@/app/(portal)/statements/_components/SettleDialog', () => ({
  default: ({ invoices }: { invoices: Array<{ no: string | null }> }) => (invoices.length > 0 ? <div data-testid="settle">{invoices.map((i) => i.no).join(',')}</div> : null),
}))
vi.mock('@/app/(portal)/statements/_components/GenerateDialogs', () => ({ MarketingDialog: () => null, PayrollInvoicesDialog: () => null, ReconcileDialog: () => null, OwnShareDialog: () => null }))
vi.mock('@/components/department/DepartmentModeSwitch', () => ({ default: () => <div data-testid="mode-switch" /> }))

import FinAppFrame from './FinAppFrame'
import InvoiceApp from './InvoiceApp'
import { resetNav } from './nav'

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
const HUB: InvoiceHubData = {
  period: '2026-10-01',
  invoices: [
    toHubInvoice(row({ id: 'hc1', invoice_no: 'HV-INV-202610-0013', total_amount: 2204 }), ctx),
    toHubInvoice(row({ id: 'hc2', invoice_no: 'HV-INV-202610-0009', total_amount: 2000, description: 'Marketing retainer — Oct' }), ctx),
    toHubInvoice(row({ id: 'hm1', invoice_no: 'HV-INV-202610-0012', company_id: 'co-hm', total_amount: 1653 }), ctx),
    toHubInvoice(row({ id: 'pd1', invoice_no: 'HV-INV-202610-0003', status: 'paid', total_amount: 1250 }), ctx),
    toHubInvoice(row({ id: 'dr1', invoice_no: 'HV-INV-202610-0017', status: 'draft', total_amount: 500 }), ctx),
  ],
  otherOpen: [],
  creditNotes: [CN],
  contracts: [{ id: 'ct1', description: 'Marketing retainer — Q4', amount: 6000, status: 'active', start: '2026-10-01', end: '2026-12-31', company: 'HOUZS Century (HC)', invoice: null }],
  nonBillable: [{ id: 'vp1', at: '2026-10-06T02:00:00Z', type: 'expense_out', amount: 2899.75, description: 'AI tools Sep26 claim', source: 'Payment voucher', out: true }],
  banks: [{ id: 'b1', label: 'Hong Leong Bank — 123-456-7890' }],
  basis: { status: 'Pending', note: 'HR pending', summary: 'Nothing from payroll yet', lines: [], director: null, allocation: [] },
  department: null,
  companies: [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }],
  departments: [{ id: 'd-mkt', name: 'Marketing' }],
  categories: [{ code: '5020', label: 'Salary Income', type: 'revenue', parent_code: null }],
  extraModes: [],
}
const ALL: InvoiceCan = { create: true, edit: true, void: true, approveCn: true, voucher: true, listExport: true, docExport: true }

const PAGE: InvoicePageData = {
  invoice: HUB.invoices[0],
  createdBy: 'Aina',
  createdAt: '07 Oct 2026 · 10:00',
  trail: [
    { label: 'Created', by: 'Aina', when: '07 Oct 2026 · 10:00', state: 'done' },
    { label: 'Issued', by: 'Carrie', when: '07 Oct 2026 · 11:00', state: 'done' },
    { label: 'Paid', by: null, when: null, state: 'todo' },
  ],
  audit: [{ at: '07 Oct 2026 · 11:00', who: 'Carrie', what: 'Approved & issued — posted to the GL' }],
  said: null,
  address: null,
  contact: '',
  offMonth: false,
  banks: [],
  companies: [],
  departments: [],
  categories: [],
  extraModes: [],
}

const draw = (search = '') =>
  render(
    <FinAppFrame platform="android" rows={['payments', 'receipts', 'invoices', 'billing']}>
      <InvoiceApp hub={HUB} can={ALL} search={search} today="2026-10-15" thisMonth="2026-10" record={null} refused={null} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/daily/invoices')
  mocks.openPage.mockResolvedValue({ ok: true, page: PAGE })
})
afterEach(() => vi.clearAllMocks())

describe('Daily › Invoice on the phone', () => {
  it('opens on the hub: the month’s invoiced total under its pill, a card a list, the design’s three menus', () => {
    draw()
    expect(screen.getByRole('link', { name: 'Invoice' })).toHaveAttribute('aria-current', 'page')
    // Issued and paid count, never a draft (the design's `live`).
    expect(screen.getByText('RM 7,107.00')).toBeInTheDocument()
    expect(screen.getByText('Invoiced · 4 invoices')).toBeInTheDocument()
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Credit notes 1 credit note −RM 220\.40$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create invoice ▾' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Payroll ▾' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export ▾' })).toBeInTheDocument()
  })

  it('another month is the server’s to read: the address names it, the list stays a list', () => {
    window.history.replaceState(null, '', '/fin-app/daily/invoices?f=all')
    draw('f=all')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/daily/invoices?m=2026-09&f=all', { scroll: false })
  })

  it('Select on Issued ticks one payer’s invoices, and the dark bar settles them on one receipt', () => {
    window.history.replaceState(null, '', '/fin-app/daily/invoices?f=issued')
    draw('f=issued')
    fireEvent.click(screen.getByRole('button', { name: 'Select to settle' }))
    fireEvent.click(screen.getByRole('button', { name: /^HOUZS Century .*RM 2,204\.00/ }))
    fireEvent.click(screen.getByRole('button', { name: /^HOUZS Century .*RM 2,000\.00/ }))
    expect(screen.getByText('2 selected · RM 4,204.00')).toBeInTheDocument()
    // Print and Void selected — ours — wait in the head's ⋯.
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settle 2 →' }))
    expect(screen.getByTestId('settle')).toHaveTextContent('HV-INV-202610-0013,HV-INV-202610-0009')
  })

  it('two payers cannot share a receipt: the bar says so and settles nothing', () => {
    window.history.replaceState(null, '', '/fin-app/daily/invoices?f=issued')
    draw('f=issued')
    fireEvent.click(screen.getByRole('button', { name: 'Select to settle' }))
    fireEvent.click(screen.getByRole('button', { name: /^HOUZS Century .*RM 2,204\.00/ }))
    fireEvent.click(screen.getByRole('button', { name: /^HOUZS Mattress .*RM 1,653\.00/ }))
    expect(screen.getByText('Different companies can’t be combined')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Settle 2 →' }))
    expect(mocks.flash).toHaveBeenCalledWith('One receipt can only settle one company’s invoices')
    expect(screen.queryByTestId('settle')).not.toBeInTheDocument()
  })

  it('a row opens the invoice — the drawer’s groups at once, then the full page’s trail and audit log', async () => {
    window.history.replaceState(null, '', '/fin-app/daily/invoices?f=all')
    draw('f=all')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^HOUZS Century .*RM 2,204\.00/ }))
    })
    expect(window.location.search).toBe('?id=hc1&from=all')
    expect(mocks.openPage).toHaveBeenCalledWith('hc1')
    expect(screen.getByText('Balance')).toBeInTheDocument()
    expect(screen.getByText('Trail')).toBeInTheDocument()
    expect(screen.getByText('Approved & issued — posted to the GL')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/billing/invoice-doc?id=hc1')
    // Issued: Settle · Edit · ⋯ (+ Credit note, Change account, Copy, Void).
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: '+ Credit note' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: /Void invoice/ })).toBeInTheDocument()
  })

  it('a paid invoice’s credit note is drawn shut, and pressed says why', async () => {
    window.history.replaceState(null, '', '/fin-app/daily/invoices?id=pd1&from=paid')
    mocks.openPage.mockResolvedValue({ ok: true, page: { ...PAGE, invoice: HUB.invoices[3] } })
    await act(async () => {
      draw('id=pd1&from=paid')
    })
    fireEvent.click(screen.getByRole('button', { name: '+ Credit note' }))
    expect(mocks.flash).toHaveBeenCalledWith('A credit note nets what is still owed — a paid invoice is refunded instead')
  })

  it('the credit notes, projects and non-billable lines are lists of their own', () => {
    window.history.replaceState(null, '', '/fin-app/daily/invoices?f=cn')
    draw('f=cn')
    expect(screen.getByText('HV-CN-202610-0002')).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('a project without this month’s invoice says how to raise one', () => {
    window.history.replaceState(null, '', '/fin-app/daily/invoices?f=mkt')
    draw('f=mkt')
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }))
    expect(mocks.flash).toHaveBeenCalledWith('No invoice for this project in October 2026 yet — Create invoice ▾ › Generate Marketing invoices raises them.')
  })

  it('Create invoice ▾ opens the desktop’s own window', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Create invoice ▾' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Single invoice' }))
    expect(screen.getByTestId('create-invoice')).toBeInTheDocument()
  })
})

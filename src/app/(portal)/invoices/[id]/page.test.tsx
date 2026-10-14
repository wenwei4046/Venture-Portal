import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import dayjs from 'dayjs'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — an invoice's own page (the user's Claude Design handoff): the
// number as the title with its status chip and the billing mode in the
// eyebrow, four cards — the total, what is received, what remains, when it is
// due — its details in groups, the description, the invoice items (billable)
// apart from the contra items (its credit notes) and the receipts, and what
// Finance can do to it in its present status.

type DialogProps = { open?: boolean; editing?: { no: string | null; status: string; settled: boolean } | null; invoice?: { no: string | null; received?: number; credited?: number } }
const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), push: vi.fn(), refresh: vi.fn(),
  approveInvoice: vi.fn(), deleteDraftInvoice: vi.fn(), voidIssuedInvoices: vi.fn(), copyInvoice: vi.fn(), settleInvoicesConsolidated: vi.fn(),
  dialog: (name: string) =>
    function Dialog(p: DialogProps) {
      const inv = p.editing ?? p.invoice
      return (
        <div data-testid={name} data-open={String(!!p.open)} data-status={p.editing?.status ?? ''} data-settled={String(!!p.editing?.settled)} data-received={String(p.invoice?.received ?? '')} data-credited={String(p.invoice?.credited ?? '')}>
          {inv?.no}
        </div>
      )
    },
}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/dept-registry', () => ({ extraBillingModeOptions: () => [], primedRegistryRows: () => [] }))
vi.mock('@/lib/office-time', () => ({ officeToday: () => '2026-10-09', officeTime: (at?: string) => dayjs(at) }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('@/app/(portal)/billing/actions', () => ({
  approveInvoice: mocks.approveInvoice, deleteDraftInvoice: mocks.deleteDraftInvoice, voidIssuedInvoices: mocks.voidIssuedInvoices,
  copyInvoice: mocks.copyInvoice, settleInvoicesConsolidated: mocks.settleInvoicesConsolidated,
}))
vi.mock('@/app/(portal)/statements/_components/InvoiceLinesDialog', () => ({ default: mocks.dialog('dialog-edit') }))
vi.mock('@/app/(portal)/statements/_components/CreditNoteDialog', () => ({ default: mocks.dialog('dialog-cn') }))
vi.mock('@/app/(portal)/statements/_components/ChangeAccountDialog', () => ({ default: mocks.dialog('dialog-gl') }))

import InvoicePage from './page'

// October's HR recharge to HOUZS Century: issued, part-paid, one credit note.
const ISSUED = {
  id: 'i13', invoice_no: 'HV-INV-202610-0013' as string | null, company_id: 'co-hc' as string | null, period_month: '2026-10-01', billing_mode: 'hr_attribution', total_amount: 2204,
  status: 'issued', billable_to_type: 'subsidiary', billable_to_department_id: null as string | null, billable_to_freetext_name: null as string | null,
  billable_to_freetext_address: null as string | null, billable_to_freetext_phone: null as string | null, billable_to_freetext_email: null as string | null,
  description: 'HR shared service — Oct', invoice_date: '2026-10-07', due_date: '2026-11-06', reference_no: null as string | null, category_code: '5020',
  created_at: '2026-10-07T02:00:00Z', settlement_voucher_id: null as string | null,
}
const LINES = [
  { id: 'l1', line_no: 1, description: 'Salary recharge', amount: 1807.28, category_code: '5020' },
  { id: 'l2', line_no: 2, description: 'Statutory recharge (EPF / SOCSO / EIS)', amount: 396.72, category_code: '5021' },
]
const RECEIPTS = [{ id: 'v30', voucher_no: 'HV-OR-202610-0030', payment_date: '2026-10-08', amount: 500 }]
const CNS = [{ id: 'cn2', credit_note_no: 'HV-CN-202610-0002', amount: 100, reason: 'Overbilled 1 staff — left in Sep', status: 'approved', created_at: '2026-10-08T03:00:00Z' }]

type Inv = typeof ISSUED
type Batch = { id: string; voucher_no: string; payment_date: string; amount: number }
function database(inv: Inv | null, over: { lines?: typeof LINES; receipts?: typeof RECEIPTS; cns?: typeof CNS; batch?: Batch | null } = {}) {
  const { lines = LINES, receipts = RECEIPTS, cns = CNS, batch = null } = over
  const from = vi.fn((table: string) => {
    const list: unknown[] =
      table === 'invoice_lines' ? lines
      : table === 'payment_vouchers' ? receipts
      : table === 'credit_notes' ? cns
      : table === 'companies' ? [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC' }, { id: 'co-hm', name: 'HOUZS Mattress', short_code: 'HM' }]
      : table === 'departments' ? [{ id: 'd-mkt', name: 'Marketing' }]
      : table === 'chart_of_accounts' ? [{ code: '5020', name: 'Salary Income', type: 'revenue', parent_code: '5000' }, { code: '5021', name: 'Statutory Income', type: 'revenue', parent_code: '5000' }]
      : table === 'bank_accounts' ? [{ id: 'b1', bank_name: 'Hong Leong Bank', account_number: '1234567890', is_primary: true }]
      : []
    const result = { data: list, error: null }
    const q = {
      select: () => q, eq: () => q, neq: () => q, order: () => q, in: () => q,
      single: async () => (table === 'invoices' ? { data: inv, error: inv ? null : { message: 'no rows' } } : { data: list[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: table === 'payment_vouchers' ? batch : list[0] ?? null, error: null }),
      then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  mocks.createClient.mockResolvedValue({ from })
}

const page = (id = 'i13') => InvoicePage({ params: Promise.resolve({ id }) })
const card = (name: string) => screen.getByRole('group', { name })
const head = (title: string) => screen.getByRole('heading', { name: title }).closest('.sect-head') as HTMLElement
const tableOf = (title: string) => head(title).nextElementSibling?.querySelector('table') as HTMLTableElement
const headers = (table: HTMLTableElement) => Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['billing', 'treasury'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
})

describe('an invoice’s own page', () => {
  it('heads with the number, its status and mode, the way back; four cards; the details; the description', async () => {
    database(ISSUED)
    render(await page())
    expect(screen.getByRole('link', { name: '← Back to Service Billing' })).toHaveAttribute('href', '/statements?period=2026-10')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HV-INV-202610-0013')
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent('INVOICE · HR ATTRIBUTION')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('issued')
    expect(document.querySelector('.page-head .chip')).toHaveClass('alert')
    expect(document.querySelector('.page-head p')).toHaveTextContent('HOUZS Century (HC) · Subsidiary')
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/billing/invoice-doc?id=i13')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()

    expect(card('Total amount')).toHaveAttribute('data-tone', 'primary')
    expect(card('Total amount')).toHaveTextContent('RM 2,204.00')
    expect(card('Total amount')).toHaveTextContent('2 lines')
    expect(card('Received')).toHaveAttribute('data-tone', 'ledger')
    expect(card('Received')).toHaveTextContent('RM 500.00')
    expect(card('Received')).toHaveTextContent('HV-OR-202610-0030')
    expect(card('Remaining')).toHaveAttribute('data-tone', 'wait')
    expect(card('Remaining')).toHaveTextContent('RM 1,604.00') // 2,204 − 500 received − 100 credited
    expect(card('Remaining')).toHaveTextContent('To settle')
    expect(card('Due')).toHaveTextContent('6 Nov 2026')
    expect(card('Due')).toHaveTextContent('28 days left')

    const details = screen.getByRole('region', { name: 'Details' })
    for (const text of ['HOUZS Century (HC) · Subsidiary', 'HR attribution', 'Salary Income · 5020', '—', '7 Oct 2026', '6 Nov 2026', 'October 2026']) {
      expect(within(details).getAllByText(text).length, text).toBeGreaterThan(0)
    }
    expect(screen.getByRole('region', { name: 'Description' })).toHaveTextContent('HR shared service — Oct')
  })

  it('keeps the invoice items (billable) apart from the contra items (its credit notes) and the receipts', async () => {
    database(ISSUED)
    render(await page())
    const items = tableOf('Invoice items')
    expect(headers(items)).toEqual(['Description', 'Category', 'Amount'])
    const salary = within(items).getByText('Salary recharge').closest('tr') as HTMLElement
    expect(salary).toHaveTextContent('5020 · Salary Income')
    expect(salary).toHaveTextContent('RM 1,807.28')
    expect(items.querySelector('tfoot')).toHaveTextContent('Total')
    expect(items.querySelector('tfoot')).toHaveTextContent('RM 2,204.00')
    expect(head('Invoice items').querySelector('.count')).toHaveTextContent('2 LINES · BILLABLE')

    const contra = tableOf('Contra items')
    expect(headers(contra)).toEqual(['CN #', 'Status', 'Reason', 'Amount'])
    const cn = within(contra).getByText('HV-CN-202610-0002').closest('tr') as HTMLElement
    expect(within(cn).getByText('approved').closest('.chip')).toHaveClass('ledger')
    expect(cn).toHaveTextContent('RM (100.00)')
    expect(contra.querySelector('tfoot')).toHaveTextContent('RM (100.00)')
    expect(head('Contra items').querySelector('.count')).toHaveTextContent('1 CREDIT NOTE')

    const receipts = tableOf('Receipts')
    expect(headers(receipts)).toEqual(['Receipt #', 'Date', 'Amount'])
    const or = within(receipts).getByText('HV-OR-202610-0030').closest('tr') as HTMLElement
    expect(or).toHaveTextContent('8 Oct 2026')
    expect(or).toHaveTextContent('RM 500.00')
  })

  it('settles an issued invoice in place, for what remains, or for part of it', async () => {
    database(ISSUED)
    mocks.settleInvoicesConsolidated.mockResolvedValue({ voucherId: 'v42', voucherNo: 'HV-OR-202610-0042', settledCount: 0, total: 1000, isPartial: true })
    render(await page())
    fireEvent.click(screen.getByRole('button', { name: 'Settle' }))
    expect(screen.getByLabelText('Bank account')).toHaveValue('b1')
    expect(screen.getByLabelText('Payment date')).toHaveValue('2026-10-09')
    expect(screen.getByLabelText('Amount received')).toHaveValue('1604.00')
    fireEvent.change(screen.getByLabelText('Amount received'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record receipt' }))
    expect(screen.getByText('More than the RM 1,604.00 still to collect.')).toBeInTheDocument()
    expect(mocks.settleInvoicesConsolidated).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Amount received'), { target: { value: '1000' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Record receipt' })) })
    expect(mocks.settleInvoicesConsolidated).toHaveBeenCalledWith({ invoiceIds: ['i13'], bankAccountId: 'b1', paymentDate: '2026-10-09', partialAmount: 1000 })
    expect(await screen.findByText(/HV-OR-202610-0042/)).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('offers an issued invoice Edit, a credit note and Change account — Void only while nothing has touched it', async () => {
    database(ISSUED)
    const { unmount } = render(await page())
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const edit = screen.getByTestId('dialog-edit')
    expect(edit).toHaveTextContent('HV-INV-202610-0013')
    expect(edit.dataset).toMatchObject({ open: 'true', status: 'issued', settled: 'true' })
    fireEvent.click(screen.getByRole('button', { name: '+ Credit note' }))
    expect(screen.getByTestId('dialog-cn')).toHaveTextContent('HV-INV-202610-0013')
    // What a credit note may still take: received, and the credit notes not voided.
    expect(screen.getByTestId('dialog-cn').dataset).toMatchObject({ received: '500', credited: '100' })
    fireEvent.click(screen.getByRole('button', { name: 'Change account' }))
    expect(screen.getByTestId('dialog-gl')).toBeInTheDocument()
    unmount()

    // Untouched: no receipt, no credit note — it can be voided, with a reason.
    database(ISSUED, { receipts: [], cns: [] })
    mocks.voidIssuedInvoices.mockResolvedValue({ voided: ['i13'] })
    render(await page())
    expect(card('Received')).not.toHaveAttribute('data-tone')
    expect(card('Received')).toHaveTextContent('Nothing received')
    fireEvent.click(screen.getByRole('button', { name: 'Void' }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Billed twice' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm void' })) })
    expect(mocks.voidIssuedInvoices).toHaveBeenCalledWith({ ids: ['i13'], reason: 'Billed twice' })
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('a draft is approved, edited or deleted; a paid one refunded', async () => {
    database({ ...ISSUED, status: 'draft', invoice_no: null }, { receipts: [], cns: [] })
    mocks.approveInvoice.mockResolvedValue(undefined)
    mocks.deleteDraftInvoice.mockResolvedValue(undefined)
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const { unmount } = render(await page())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Draft')
    expect(document.querySelector('.page-head .chip')).toHaveTextContent('draft')
    expect(card('Due')).toHaveTextContent('Draft')
    expect(screen.queryByRole('button', { name: 'Settle' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Receipts' })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve & issue' })) })
    expect((mocks.approveInvoice.mock.calls[0][0] as FormData).get('id')).toBe('i13')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })) })
    expect(confirm).toHaveBeenCalled()
    expect((mocks.deleteDraftInvoice.mock.calls[0][0] as FormData).get('id')).toBe('i13')
    expect(mocks.push).toHaveBeenCalledWith('/statements?period=2026-10')
    vi.unstubAllGlobals()
    unmount()

    database({ ...ISSUED, status: 'paid', settlement_voucher_id: 'v99' }, { receipts: [], cns: [], batch: { id: 'v99', voucher_no: 'HV-OR-202610-0041', payment_date: '2026-10-09', amount: 5000 } })
    render(await page())
    expect(document.querySelector('.page-head .chip')).toHaveClass('ledger')
    expect(card('Received')).toHaveTextContent('RM 2,204.00')
    expect(card('Received')).toHaveTextContent('HV-OR-202610-0041')
    expect(card('Remaining')).toHaveTextContent('RM 0.00')
    expect(card('Remaining')).toHaveTextContent('Settled')
    expect(card('Due')).toHaveTextContent('Paid')
    const or = within(tableOf('Receipts')).getByText('HV-OR-202610-0041').closest('tr') as HTMLElement
    expect(or).toHaveTextContent('RM 2,204.00')
    expect(or).toHaveTextContent('consolidated receipt · RM 5,000.00 in all')
    expect(screen.getByRole('link', { name: 'Refund' })).toHaveAttribute('href', '/payments/new?mode=refund&invoice_id=i13&return_to=/invoices/i13')
    // A credit note nets what is still owed (CN v2): a paid invoice is refunded — the button says why it is shut.
    expect(screen.getByRole('button', { name: '+ Credit note' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '+ Credit note' })).toHaveAttribute('title', 'A credit note nets what is still owed — a paid invoice is refunded instead')
  })

  it('names a department pool and a free-text party with its contact; a pool settles on the voucher page', async () => {
    database({ ...ISSUED, company_id: null, billable_to_type: 'dept_pool', billable_to_department_id: 'd-mkt' })
    const { unmount } = render(await page())
    expect(document.querySelector('.page-head p')).toHaveTextContent('Marketing · Dept pool')
    expect(screen.getByRole('link', { name: 'Settle' })).toHaveAttribute('href', '/payments/new?invoice_id=i13&return_to=/invoices/i13')
    unmount()
    database({
      ...ISSUED, company_id: null, billable_to_type: 'freetext', billable_to_freetext_name: 'Rygis Private Gym',
      billable_to_freetext_address: 'Lot 12, Jalan Kenari 5, Puchong', billable_to_freetext_phone: '012-338 9021', billable_to_freetext_email: 'hello@rygis.my',
    })
    render(await page())
    expect(document.querySelector('.page-head p')).toHaveTextContent('Rygis Private Gym · Free text')
    const details = screen.getByRole('region', { name: 'Details' })
    expect(details).toHaveTextContent('Lot 12, Jalan Kenari 5, Puchong')
    expect(details).toHaveTextContent('012-338 9021 · hello@rygis.my')
  })

  it('shows a reader without Billing actions the invoice but no actions, and 404s one that is not there', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['billing'], actions: {} })
    database(ISSUED)
    render(await page())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HV-INV-202610-0013')
    expect(screen.queryByRole('heading', { name: 'Actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    database(null)
    await expect(page('nope')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// An invoice's full page (2026-10-15, the Finance revamp v2 — D06 for the
// Invoice drawer's *View full page ↗*): *← Invoices* and the crumb; *Invoice ·
// {billing mode}*, the number with its status, Amount · To · Created by, PDF
// and Copy; the numbered cards — Line items, Receipts, its credit notes, the
// description when it says more than its lines, the Trail, the Audit log —
// beside the dark panel: the amount, Balance, Billing, and the drawer's steps.

type DialogProps = {
  open?: boolean
  editing?: { no: string | null; status: string; settled: boolean } | null
  invoice?: { no: string | null; received?: number; credited?: number }
  invoices?: Array<{ id: string; remaining: number }>
}
const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn(), push: vi.fn(), refresh: vi.fn(), flash: vi.fn(),
  approve: vi.fn(), del: vi.fn(), voidIt: vi.fn(), copy: vi.fn(),
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
vi.mock('@/components/hrv/toast', () => ({ flash: mocks.flash }))
vi.mock('@/lib/dept-registry', () => ({ extraBillingModeOptions: () => [], primedRegistryRows: () => [] }))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeToday: () => '2026-10-09', officeMonth: () => '2026-10' }))
vi.mock('@/components/layout/ReturnLink', () => ({ default: (p: { href: string; className?: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))
vi.mock('@/app/(portal)/statements/invoice-actions', () => ({
  hubApproveInvoice: mocks.approve, hubDeleteDraft: mocks.del, hubVoidInvoices: mocks.voidIt, hubCopyInvoice: mocks.copy,
}))
vi.mock('@/app/(portal)/statements/_components/InvoiceLinesDialog', () => ({ default: mocks.dialog('dialog-edit') }))
vi.mock('@/app/(portal)/statements/_components/CreditNoteDialog', () => ({ default: mocks.dialog('dialog-cn') }))
vi.mock('@/app/(portal)/statements/_components/ChangeAccountDialog', () => ({ default: mocks.dialog('dialog-gl') }))
vi.mock('@/app/(portal)/statements/_components/SettleDialog', () => ({
  default: (p: DialogProps) => <div data-testid="dialog-settle" data-open={String((p.invoices ?? []).length > 0)}>{(p.invoices ?? []).map((i) => `${i.id}:${i.remaining}`).join(',')}</div>,
}))

import InvoicePage from './page'

// October's HR recharge to HOUZS Century: issued, part-paid, one credit note.
const ISSUED = {
  id: 'i13', invoice_no: 'HV-INV-202610-0013' as string | null, company_id: 'co-hc' as string | null, period_month: '2026-10-01', billing_mode: 'hr_attribution', total_amount: 2204,
  status: 'issued', billable_to_type: 'subsidiary', billable_to_department_id: null as string | null, billable_to_freetext_name: null as string | null,
  billable_to_freetext_address: null as string | null, billable_to_freetext_phone: null as string | null, billable_to_freetext_email: null as string | null,
  description: 'HR shared service — Oct', invoice_date: '2026-10-07', due_date: '2026-11-06', reference_no: null as string | null, category_code: '5020',
  created_by: 'u-aina', created_at: '2026-10-07T02:00:00Z', settlement_voucher_id: null as string | null, contract_id: null,
}
const LINES = [
  { description: 'Salary recharge', amount: 1807.28, category_code: '5020' },
  { description: 'Statutory recharge (EPF / SOCSO / EIS)', amount: 396.72, category_code: '5021' },
]
const RECEIPTS = [{ voucher_no: 'HV-OR-202610-0030', payment_date: '2026-10-08', amount: 500 }]
const CNS = [{ id: 'cn2', credit_note_no: 'HV-CN-202610-0002', amount: 100, reason: 'Overbilled 1 staff — left in Sep', status: 'approved', created_at: '2026-10-08T03:00:00Z' }]
const change = (id: number, at: string, table: string, op: string, new_row: object | null, changed: string[] | null, old_row: object | null = null, actor = 'Carrie') => ({
  id, occurred_at: at, actor_id: 'u-x', actor_name: actor, table_name: table, op, old_row, new_row, changed,
})
const AUDIT: Record<string, unknown[]> = {
  'invoices:i13': [
    change(1, '2026-10-07T02:00:00Z', 'invoices', 'INSERT', { invoice_no: 'HV-INV-202610-0013', total_amount: 2204, status: 'draft' }, null, null, 'Aina'),
    change(2, '2026-10-07T03:00:00Z', 'invoices', 'UPDATE', { status: 'issued' }, ['status'], { status: 'draft' }),
  ],
  'credit_notes:cn2': [change(3, '2026-10-08T03:30:00Z', 'credit_notes', 'UPDATE', { credit_note_no: 'HV-CN-202610-0002', amount: 100, status: 'approved' }, ['status'], { status: 'draft' }, 'Principal')],
}

type Inv = typeof ISSUED
type Batch = { voucher_no: string; payment_date: string; amount: number }
function database(inv: Inv | null, over: { lines?: typeof LINES; receipts?: typeof RECEIPTS; cns?: typeof CNS; batch?: Batch | null } = {}) {
  const { lines = LINES, receipts = RECEIPTS, cns = CNS, batch = null } = over
  const from = vi.fn((table: string) => {
    const list: unknown[] =
      table === 'invoice_lines' ? lines
      : table === 'payment_vouchers' ? receipts
      : table === 'credit_notes' ? cns
      : table === 'companies' ? [{ id: 'co-hc', name: 'HOUZS Century', short_code: 'HC', is_active: true }, { id: 'co-hm', name: 'HOUZS Mattress', short_code: 'HM', is_active: true }]
      : table === 'departments' ? [{ id: 'd-mkt', name: 'Marketing', is_internal: false }]
      : table === 'chart_of_accounts' ? [{ code: '5020', name: 'Salary Income', type: 'revenue', parent_code: '5000' }, { code: '5021', name: 'Statutory Income', type: 'revenue', parent_code: '5000' }]
      : table === 'bank_accounts' ? [{ id: 'b1', bank_name: 'Hong Leong Bank', account_number: '1234567890', is_primary: true }]
      : []
    const result = { data: list, error: null }
    const q = {
      select: () => q, eq: () => q, neq: () => q, order: () => q, in: () => q,
      single: async () => (table === 'invoices' ? { data: inv, error: inv ? null : { message: 'no rows' } } : { data: list[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: table === 'payment_vouchers' ? batch : table === 'users' ? { name: 'Aina' } : (list[0] ?? null), error: null }),
      then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    }
    return q
  })
  const rpc = vi.fn(async (_name: string, args: { p_tables: string[]; p_row: string }) => ({ data: AUDIT[`${args.p_tables[0]}:${args.p_row}`] ?? [], error: null }))
  mocks.createClient.mockResolvedValue({ from, rpc })
  return { rpc }
}

const page = (id = 'i13') => InvoicePage({ params: Promise.resolve({ id }) })
const cardTitles = () => Array.from(document.querySelectorAll('section[aria-label]')).map((c) => c.getAttribute('aria-label'))
const cardOf = (title: string) => screen.getByRole('region', { name: title })
const panel = () => document.querySelector('aside') as HTMLElement
const rowOf = (within: HTMLElement, text: string) => (Array.from(within.querySelectorAll('div')).find((d) => d.children.length >= 2 && d.firstElementChild?.textContent === text) as HTMLElement) ?? null

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['billing', 'treasury'] }))
  mocks.notFound.mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
  window.history.replaceState(null, '', '/invoices/i13')
})

describe('an invoice’s full page', () => {
  it('heads as D06 does: the way back, the crumb, the number with its status, three facts, PDF and Copy', async () => {
    database(ISSUED)
    render(await page())
    expect(screen.getByRole('link', { name: '← Invoices' })).toHaveAttribute('href', '/statements?period=2026-10-01')
    expect(screen.getByText('Daily · Invoices · HV-INV-202610-0013')).toBeInTheDocument()
    expect(screen.getByText('Invoice · HR attribution')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HV-INV-202610-0013')
    const pill = screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement
    expect(pill).toHaveAttribute('data-tone', 'alert')
    expect(pill).toHaveTextContent('issued')
    for (const fact of ['RM 2,204.00', 'HOUZS Century (HC) · Subsidiary', 'Aina · 07 Oct 2026 · 10:00']) expect(screen.getAllByText(fact).length, fact).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'PDF' })).toHaveAttribute('href', '/billing/invoice-doc?id=i13')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('lays its cards out: the lines with their total, the receipts in green, the credit notes; no description its lines already say', async () => {
    database(ISSUED)
    const { unmount } = render(await page())
    expect(cardTitles()).toEqual(['Line items', 'Receipts', 'Credit notes', 'Description', 'Trail', 'Audit log'])
    const items = cardOf('Line items')
    expect(items).toHaveTextContent('2 lines')
    expect(rowOf(items, 'Salary recharge')).toHaveTextContent('5020 · Salary Income')
    expect(rowOf(items, 'Salary recharge')).toHaveTextContent('RM 1,807.28')
    expect(rowOf(items, 'Total')).toHaveTextContent('RM 2,204.00')
    const receipts = cardOf('Receipts')
    expect(rowOf(receipts, 'HV-OR-202610-0030')).toHaveTextContent('08 Oct 2026')
    expect(within(receipts).getByText('+RM 500.00')).toHaveAttribute('data-tone', 'ledger')
    const cns = cardOf('Credit notes')
    expect(rowOf(cns, 'HV-CN-202610-0002')).toHaveTextContent('approved · Overbilled 1 staff — left in Sep')
    expect(rowOf(cns, 'HV-CN-202610-0002')).toHaveTextContent('−RM 100.00')
    expect(rowOf(cns, 'Approved')).toHaveTextContent('−RM 100.00')
    expect(cardOf('Description')).toHaveTextContent('HR shared service — Oct')
    unmount()

    // A simple invoice's one line is its description: no card says it again.
    database(ISSUED, { lines: [], cns: [] })
    render(await page())
    expect(cardTitles()).toEqual(['Line items', 'Receipts', 'Trail', 'Audit log'])
    expect(rowOf(cardOf('Line items'), 'HR shared service — Oct')).toHaveTextContent('5020 · Salary Income')
  })

  it('says the trail and the audit log from the invoice’s and its credit notes’ changes', async () => {
    const { rpc } = database(ISSUED)
    render(await page())
    expect(rpc).toHaveBeenCalledWith('audit_changes', { p_tables: ['invoices'], p_row: 'i13', p_limit: 60 })
    expect(rpc).toHaveBeenCalledWith('audit_changes', { p_tables: ['credit_notes'], p_row: 'cn2', p_limit: 5 })
    const trail = cardOf('Trail')
    expect(trail).toHaveTextContent('2 / 3 steps')
    expect(trail).toHaveTextContent('Created')
    expect(trail).toHaveTextContent('Aina07 Oct 2026 · 10:00')
    expect(trail).toHaveTextContent('IssuedCarrie07 Oct 2026 · 11:00')
    const audit = cardOf('Audit log')
    expect(audit).toHaveTextContent('3 EVENTS')
    const lines = Array.from(audit.querySelectorAll('div')).filter((d) => d.children.length === 3 && d !== audit).map((d) => d.lastElementChild?.textContent)
    expect(lines).toEqual(['What changed', 'Credit note HV-CN-202610-0002 approved — RM 100.00 off', 'Approved & issued — posted to the GL', 'Created HV-INV-202610-0013 · RM 2,204.00'])
  })

  it('puts the balance and the billing in the dark panel', async () => {
    database(ISSUED)
    render(await page())
    const p = panel()
    expect(p).toHaveTextContent('Invoice')
    expect(p).toHaveTextContent('RM 2,204.00')
    expect(rowOf(p, 'Received')).toHaveTextContent('RM 500.00')
    expect(rowOf(p, 'Remaining')).toHaveTextContent('RM 1,604.00') // 2,204 − 500 received − 100 credited
    expect(rowOf(p, 'Due')).toHaveTextContent('06 Nov 2026')
    expect(rowOf(p, 'Due')).toHaveTextContent('28 days left')
    expect(rowOf(p, 'Billed to')).toHaveTextContent('HOUZS Century (HC)Subsidiary')
    expect(rowOf(p, 'Billing mode')).toHaveTextContent('HR attribution')
    expect(rowOf(p, 'GL category')).toHaveTextContent('Salary Income5020')
    expect(rowOf(p, 'Invoice date')).toHaveTextContent('07 Oct 2026')
    expect(rowOf(p, 'Period')).toBeNull()
  })

  it('takes an issued invoice’s steps from the panel: Settle, Edit, and the ⋯ — no Void once money came in', async () => {
    database(ISSUED)
    render(await page())
    const p = panel()
    expect(within(p).getAllByRole('button').map((b) => b.textContent)).toEqual(['Settle', 'Edit', '⋯'])
    fireEvent.click(within(p).getByRole('button', { name: 'Settle' }))
    expect(screen.getByTestId('dialog-settle')).toHaveAttribute('data-open', 'true')
    expect(screen.getByTestId('dialog-settle')).toHaveTextContent('i13:1604')
    fireEvent.click(within(p).getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('dialog-edit').dataset).toMatchObject({ open: 'true', status: 'issued', settled: 'true' })
    fireEvent.click(within(p).getByRole('button', { name: 'More' }))
    const menu = screen.getByRole('dialog', { name: 'HV-INV-202610-0013' })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['+ Credit note', 'Change accountSalary Income · 5020'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: '+ Credit note' }))
    // What a credit note may still take: received, and the credit notes not voided.
    expect(screen.getByTestId('dialog-cn').dataset).toMatchObject({ open: 'true', received: '500', credited: '100' })
  })

  it('voids an untouched issued invoice with a reason, asked first', async () => {
    database(ISSUED, { receipts: [], cns: [] })
    mocks.voidIt.mockResolvedValue({ ok: true, value: ['HV-INV-202610-0013'] })
    render(await page())
    fireEvent.click(within(panel()).getByRole('button', { name: 'More' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'HV-INV-202610-0013' })).getByRole('menuitem', { name: 'Void invoice' }))
    const ask = screen.getByRole('dialog', { name: 'Void HV-INV-202610-0013?' })
    expect(ask).toHaveTextContent('HOUZS Century (HC) will no longer owe RM 2,204.00.')
    expect(within(ask).getByRole('button', { name: 'Void invoice' })).toBeInTheDocument()
    fireEvent.change(within(ask).getByLabelText('Reason'), { target: { value: 'Billed twice' } })
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: 'Void invoice' })) })
    expect(mocks.voidIt).toHaveBeenCalledWith(['i13'], 'Billed twice')
    expect(mocks.flash).toHaveBeenCalledWith('HV-INV-202610-0013 voided')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('a draft is approved from the panel, or deleted from its ⋯ — back to the list; a refusal said in words', async () => {
    database({ ...ISSUED, status: 'draft' }, { receipts: [], cns: [] })
    mocks.approve.mockResolvedValueOnce({ ok: false, reason: 'October is closed' }).mockResolvedValueOnce({ ok: true, value: null })
    mocks.del.mockResolvedValue({ ok: true, value: null })
    render(await page())
    expect(cardTitles()).toEqual(['Line items', 'Receipts', 'Description', 'Trail', 'Audit log'])
    const p = panel()
    expect(rowOf(p, 'Due')).toHaveTextContent('Draft')
    await act(async () => { fireEvent.click(within(p).getByRole('button', { name: 'Approve & issue' })) })
    expect(mocks.approve).toHaveBeenCalledWith('i13')
    expect(within(p).getByRole('alert')).toHaveTextContent('October is closed')
    await act(async () => { fireEvent.click(within(p).getByRole('button', { name: 'Approve & issue' })) })
    expect(mocks.flash).toHaveBeenCalledWith('Approved & issued — posted to the GL')
    expect(mocks.refresh).toHaveBeenCalled()

    fireEvent.click(within(p).getByRole('button', { name: 'More' }))
    const menu = screen.getByRole('dialog', { name: 'HV-INV-202610-0013' })
    // Copy is at the head, not in the ⋯.
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Delete draft'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete draft' }))
    const ask = screen.getByRole('dialog', { name: 'Delete this draft?' })
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: 'Delete' })) })
    expect(mocks.del).toHaveBeenCalledWith('i13')
    expect(mocks.push).toHaveBeenCalledWith('/statements?period=2026-10-01')
  })

  it('a paid one on a consolidated receipt: its part of it, Refund on the voucher page, + Credit note shut saying why', async () => {
    database({ ...ISSUED, status: 'paid', settlement_voucher_id: 'v99' }, { receipts: [], cns: [], batch: { voucher_no: 'HV-OR-202610-0041', payment_date: '2026-10-09', amount: 5000 } })
    render(await page())
    const pill = screen.getByRole('heading', { level: 1 }).nextElementSibling as HTMLElement
    expect(pill).toHaveAttribute('data-tone', 'ledger')
    const or = rowOf(cardOf('Receipts'), 'HV-OR-202610-0041')
    expect(or).toHaveTextContent('09 Oct 2026 · one receipt for RM 5,000.00 in all')
    expect(or).toHaveTextContent('+RM 2,204.00')
    const p = panel()
    expect(rowOf(p, 'Received')).toHaveTextContent('RM 2,204.00')
    expect(rowOf(p, 'Remaining')).toHaveTextContent('RM 0.00')
    expect(rowOf(p, 'Due')).toHaveTextContent('Paid')
    fireEvent.click(within(p).getByRole('button', { name: 'Refund' }))
    expect(mocks.push).toHaveBeenCalledWith('/payments/new?mode=refund&invoice_id=i13&return_to=/invoices/i13')
    const cn = within(p).getByRole('button', { name: '+ Credit note' })
    expect(cn).toBeDisabled()
    expect(cn).toHaveAttribute('title', 'A credit note nets what is still owed — a paid invoice is refunded instead')
    // Before the audit trail: issued on its invoice date, paid on its last receipt.
    expect(cardOf('Trail')).toHaveTextContent('Paid—09 Oct 2026')
  })

  it('a department pool settles on the voucher page; a free-text party shows its contact; back from it, says what was written', async () => {
    database({ ...ISSUED, company_id: null, billable_to_type: 'dept_pool', billable_to_department_id: 'd-mkt' })
    const { unmount } = render(await page())
    expect(screen.getAllByText('Marketing · Dept pool').length).toBeGreaterThan(0)
    fireEvent.click(within(panel()).getByRole('button', { name: 'Settle' }))
    expect(mocks.push).toHaveBeenCalledWith('/payments/new?invoice_id=i13&return_to=/invoices/i13')
    unmount()

    window.history.replaceState(null, '', '/invoices/i13?receipt=HV-OR-202610-0050')
    database({
      ...ISSUED, company_id: null, billable_to_type: 'freetext', billable_to_freetext_name: 'Rygis Private Gym', invoice_date: '2026-09-30',
      billable_to_freetext_address: 'Lot 12, Jalan Kenari 5, Puchong', billable_to_freetext_phone: '012-338 9021', billable_to_freetext_email: 'hello@rygis.my',
    })
    render(await page())
    const p = panel()
    expect(rowOf(p, 'Billed to')).toHaveTextContent('Rygis Private GymFree text')
    expect(rowOf(p, 'Address')).toHaveTextContent('Lot 12, Jalan Kenari 5, Puchong')
    expect(rowOf(p, 'Contact')).toHaveTextContent('012-338 9021 · hello@rygis.my')
    // Dated in September, billed in October: the period says so.
    expect(rowOf(p, 'Period')).toHaveTextContent('October 2026')
    expect(mocks.flash).toHaveBeenCalledWith('Receipt HV-OR-202610-0050 written — the invoice is settled')
    expect(window.location.search).toBe('')
  })

  it('copies it as a new draft, asked first, and opens the copy', async () => {
    database(ISSUED)
    mocks.copy.mockResolvedValue({ ok: true, value: { id: 'i99', no: 'HV-INV-202610-0099' } })
    render(await page())
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    const ask = screen.getByRole('dialog', { name: 'Copy HV-INV-202610-0013?' })
    expect(ask).toHaveTextContent('A new draft in October 2026, with the same lines — change what you need, then issue it.')
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: 'Copy as new draft' })) })
    expect(mocks.copy).toHaveBeenCalledWith('i13')
    expect(mocks.flash).toHaveBeenCalledWith('Copied as HV-INV-202610-0099 — a new draft')
    expect(mocks.push).toHaveBeenCalledWith('/invoices/i99')
  })

  it('shows a reader without Billing actions the invoice but no steps and no Copy, and 404s one that is not there', async () => {
    mocks.requirePermission.mockResolvedValue({ role: 'finance', permissions: ['billing'], actions: {} })
    database(ISSUED)
    render(await page())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HV-INV-202610-0013')
    expect(within(panel()).queryAllByRole('button')).toEqual([])
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'PDF' })).toBeNull()
    database(null)
    await expect(page('nope')).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

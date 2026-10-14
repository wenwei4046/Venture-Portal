import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { render, screen, within } from '@testing-library/react'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../actions', () => ({ submitForApproval: vi.fn(), approveVoucher: vi.fn(), voidVoucher: vi.fn(), voidPaidReceipt: vi.fn(), reversePaidPayment: vi.fn(), returnVoucherToDraft: vi.fn(), copyPaymentVoucher: vi.fn(), getAttachmentSignedUrl: vi.fn(), uploadVoucherAttachment: vi.fn(), deleteVoucherAttachment: vi.fn() }))
vi.mock('./_components/VoucherActions', () => ({ default: (props: { reversePaidPayment?: unknown }) => <div data-testid="voucher-actions" data-can-reverse={Boolean(props.reversePaidPayment)} /> }))
vi.mock('./_components/CopyVoucherButton', () => ({ default: () => <div data-testid="copy-voucher" /> }))
vi.mock('./_components/ReassignGlAccountButton', () => ({ default: () => <div data-testid="reassign-gl" /> }))
vi.mock('./_components/AttachmentUploader', () => ({ default: (p: { canUpload: boolean; late?: boolean }) => <div data-testid="attachment-uploader" data-can-upload={String(p.canUpload)} data-late={String(!!p.late)} /> }))
vi.mock('../_components/AmendDateButton', () => ({ default: (p: { id: string; currentDate: string }) => <div data-testid="amend-date">{p.id} {p.currentDate}</div> }))
// The list a receipt belongs to (2026-10-10): the bars read it on the Finance view.
vi.mock('@/components/layout/nav-owner', () => ({ NavOwner: (p: { href: string; title: string }) => <div data-testid="nav-owner" data-href={p.href} data-title={p.title} /> }))
vi.mock('@/components/voucher/AttachmentList', () => ({ default: (p: { canDelete?: boolean; lateAfter?: string | null }) => <div data-testid="attachment-list" data-can-delete={String(!!p.canDelete)} data-late-after={p.lateAfter ?? ''} /> }))
import PaymentDetailPage from './page'

function database(referenceType = 'payroll_statutory', salaryLines: Record<string, unknown>[] = [], salaryError: object | null = null, invoices: Record<string, unknown>[] = [], attachments: Record<string, unknown>[] = [], more: { sources?: Record<string, unknown>[]; bank?: Record<string, unknown> } = {}) {
  const voucher: Record<string, unknown> & { status: string } = { id: 'stat', voucher_no: 'TEST-STAT-PV', reference_type: referenceType, status: 'pending_approval', amount: 100.10, direction: 'debit', voucher_type: 'salary_payout', payee_name: 'KWSP', payee_company_id: null, bank_account_id: null, source_pool: null, target_pool: null, created_by: 'creator', approved_by: null, approved_at: null, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', executed_at: null, payment_method: 'bank_transfer', description: 'Statutory fixture', notes: null }
  const filters: string[][] = []
  const from = vi.fn((table: string) => {
    let allowedReferences: string[] | null = null
    const result = { data: table === 'users' ? [{ id: 'creator', name: 'Creator' }] : table === 'payroll_statutory_voucher_lines' ? [{ id: 'line', scope: 'staff', payroll_row_id: 'row', employee_name: 'Recorded Employee', employee_code: 'TEST001', department_name: 'Original Department', period_month: '2026-08-01', scheme: 'KWSP', amount: '100.10' }] : table === 'payroll_voucher_lines' ? salaryLines : table === 'invoices' ? invoices : table === 'payment_attachments' ? attachments : table === 'payment_voucher_sources' ? (more.sources ?? []) : [], error: table === 'payroll_voucher_lines' ? salaryError : null }
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      in: vi.fn((column: string, values: string[]) => { if (column === 'reference_type') { allowedReferences = values; filters.push(values) } return query }),
      single: vi.fn(() => Promise.resolve({ data: table === 'payment_vouchers' ? (allowedReferences && !allowedReferences.includes(referenceType) ? null : voucher) : table === 'bank_accounts' && more.bank ? more.bank : { name: 'Creator' }, error: null })),
      // The pending approval's submitter — who may decide it (2026-10-09).
      maybeSingle: vi.fn(() => Promise.resolve({ data: table === 'approval_requests' ? { request_type: 'payment_voucher', submitted_by: 'creator' } : table === 'payment_vouchers' ? (allowedReferences && !allowedReferences.includes(referenceType) ? null : voucher) : table === 'bank_accounts' ? (more.bank ?? null) : null, error: null })),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ from, rpc: vi.fn((fn: string, args?: { p_line_ids?: string[] }) => Promise.resolve(fn === 'payroll_line_accounts'
      ? { data: salaryLines.filter(l => (args?.p_line_ids ?? []).includes(String(l.id))).map(l => ({ id: l.id, bank_account_no: l.bank_account_no ?? null })), error: null }
      : { data: [], error: null })) })
  return { from, filters, voucher }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.notFound.mockImplementation(() => { throw new Error('NOT_FOUND') })
})

describe('HR payroll voucher detail access', () => {
  it('shows stored statutory coverage and printing to HR without treasury actions or upload tools', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    const { from, filters } = database()
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(mocks.requirePermission).toHaveBeenCalledWith('treasury', 'hr_costing')
    expect(filters).toEqual([['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request']])
    const table = screen.getByRole('table', { name: 'Statutory contributions covered by this voucher' })
    expect(table).toHaveTextContent('Recorded Employee')
    expect(table).toHaveTextContent('Original Department')
    expect(within(table).getByRole('row', { name: /Total contribution/ })).toHaveTextContent('100.10')
    expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/payments/voucher-doc?id=stat')
    expect(screen.getByRole('link', { name: /Back to HR Payment/ })).toHaveAttribute('href', '/hr-costing/payment')
    for (const testId of ['voucher-actions', 'copy-voucher', 'reassign-gl', 'attachment-uploader', 'attachment-list']) expect(screen.queryByTestId(testId)).not.toBeInTheDocument()
    expect(from).not.toHaveBeenCalledWith('payment_attachments')
  })

  it('rejects unrelated treasury records before reading their related details', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    const { from } = database('ordinary_payment')
    await expect(PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) })).rejects.toThrow('NOT_FOUND')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('shows net basic and commission with their recorded receiving accounts as one person', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    const person = { scope: 'staff', payroll_row_id: 'salary-row', employee_name: 'Salary Employee', employee_code: 'SAL001', department_name: 'Original Revenue' }
    const { from } = database('payroll_disbursement', [
      { ...person, id: 'basic', salary_component: 'basic', recipient_account: 'account_1', bank_name: 'Recorded Maybank', bank_account_no: '0012345678', net: 4302.70 },
      { ...person, id: 'commission', salary_component: 'commission', recipient_account: 'account_2', bank_name: 'Recorded CIMB', bank_account_no: '0098765432', net: 4253.45 },
    ])
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'salary' }) }))
    const table = screen.getByRole('table', { name: 'Salary payments on this voucher' })
    const basic = within(table).getByRole('row', { name: /Basic salary \(net\)/ })
    expect(basic).toHaveTextContent('Account 1')
    expect(basic).toHaveTextContent('Recorded Maybank')
    expect(basic).toHaveTextContent('0012345678')
    expect(basic).toHaveTextContent('4,302.70')
    const commission = within(table).getByRole('row', { name: /Commission/ })
    expect(commission).toHaveTextContent('Account 2')
    expect(commission).toHaveTextContent('Recorded CIMB')
    expect(commission).toHaveTextContent('0098765432')
    expect(commission).toHaveTextContent('4,253.45')
    expect(screen.getByText('1 PERSON · 2 PAYMENTS')).toBeVisible()
    expect(within(table).getByRole('row', { name: /Total/ })).toHaveTextContent('8,556.15')
    expect(from).not.toHaveBeenCalledWith('hr_staff_costs')
  })

  it('shows •••• for the account numbers to a viewer whose title does not tick Bank accounts (PR4)', async () => {
    mocks.requirePermission.mockResolvedValue({ ...withActions({ role: 'hr', permissions: ['hr_costing'] }), sensitive: ['salary'] })
    const person = { scope: 'staff', payroll_row_id: 'salary-row', employee_name: 'Salary Employee', employee_code: 'SAL001', department_name: 'Original Revenue' }
    database('payroll_disbursement', [
      { ...person, id: 'basic', salary_component: 'basic', recipient_account: 'account_1', bank_name: 'Recorded Maybank', bank_account_no: '0012345678', net: 4302.70 },
    ])
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'salary' }) }))
    const table = screen.getByRole('table', { name: 'Salary payments on this voucher' })
    expect(table).toHaveTextContent('Recorded Maybank')
    expect(table).toHaveTextContent('••••')
    expect(table).not.toHaveTextContent('0012345678')
  })

  it('labels an old net line without inventing a receiving account', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    database('payroll_disbursement', [{ id: 'legacy', scope: 'staff', payroll_row_id: 'legacy-row', employee_name: 'Legacy Employee', department_name: 'Revenue', net: 1000, salary_component: 'net', recipient_account: null, bank_name: null, bank_account_no: null }])
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'salary' }) }))
    const table = screen.getByRole('table', { name: 'Salary payments on this voucher' })
    expect(table).toHaveTextContent('Net salary')
    expect(table).toHaveTextContent('Bank details not recorded')
    expect(table).not.toHaveTextContent('Account 1')
    expect(table).not.toHaveTextContent('Account 2')
  })

  it('does not hide a failed salary snapshot query behind an empty table', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    database('payroll_disbursement', [], { message: 'private database detail' })
    await expect(PaymentDetailPage({ params: Promise.resolve({ id: 'salary' }) })).rejects.toThrow('Unable to load the recorded salary payment details')
  })
})

// 2026-10-14 — the Finance revamp v2 (D06 of `.design/fin-r2/handoff`): a payment
// voucher, for the treasury's readers, is the design's full page. What the old
// page held is still held: the number in the figures' face, the office's clock,
// the panel's When & where and Booking, the trail, the steps this reader may
// take (and no generic reversal of a salary voucher), the files, the payroll
// right, a paid voucher's date corrected in place.
describe('a payment voucher’s full page (D06)', () => {
  const asFinance = (extra: string[] = []) => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', ...extra] }))
  const panel = () => document.querySelector('aside') as HTMLElement
  const cardTitles = () => Array.from(document.querySelectorAll('section')).map((c) => c.getAttribute('aria-label'))
  const source = { pool: 'venture_pool', amount: 100.10, account_code: '9091', chart_of_accounts: { name: 'Water & Electricity' } }
  const bank = { bank_name: 'Hong Leong Bank', account_number: '2190-0033-12', current_balance: 9000 }

  it('heads it with the way back, the crumb, the number in the figures’ face and its status', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByRole('link', { name: '← Payments' })).toHaveAttribute('href', '/payments')
    expect(screen.getByText('Daily · Payments · TEST-STAT-PV')).toBeInTheDocument()
    const number = screen.getByRole('heading', { level: 1, name: 'TEST-STAT-PV' })
    expect(number.parentElement).toHaveTextContent('Pending approval')
    expect(screen.queryByTestId('nav-owner')).toBeNull()
  })

  it('states four facts — the created time on the office’s clock', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment') // created 2026-09-11T00:00Z — 08:00 in Kuala Lumpur
    voucher.payment_date = '2026-09-12'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByText('Amount').nextElementSibling).toHaveTextContent('RM 100.10')
    expect(screen.getByText('To').nextElementSibling).toHaveTextContent('KWSP')
    expect(screen.getAllByText('Payment date')[0].nextElementSibling).toHaveTextContent('12 Sep 2026')
    expect(screen.getByText('Created by').nextElementSibling).toHaveTextContent('Creator · 11 Sep 2026 · 08:00')
  })

  it('keeps when, where and the booking in the dark panel, with the steps', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [], { sources: [source], bank })
    Object.assign(voucher, { bank_account_id: 'bank-1', payment_date: '2026-09-12' })
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const side = panel()
    expect(side).toHaveTextContent('RM 100.10')
    expect(side).toHaveTextContent('Pay to KWSP')
    expect(side).toHaveTextContent('When & where')
    expect(side).toHaveTextContent('Payment date12 Sep 2026')
    expect(side).toHaveTextContent('From bankHong Leong Bank2190-0033-12')
    expect(side).toHaveTextContent('Booking')
    expect(side).toHaveTextContent('AccountWater & Electricity9091')
    expect(side).toHaveTextContent('PoolVenture Pool')
    // Its maker, pending: Edit and Return to draft, Void under ⋯ (voucher-steps.tsx).
    expect(within(side).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/payments/stat/edit')
    expect(within(side).getByRole('button', { name: 'Return to draft' })).toBeInTheDocument()
  })

  it('says — when no payment date was set', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(panel()).toHaveTextContent('Payment date—')
  })

  it('lays its cards in the design’s order, every word English', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [], { sources: [source], bank })
    Object.assign(voucher, { bank_account_id: 'bank-1', notes: 'Paid before the 15th', payment_date: '2026-09-12' })
    const { container } = render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(cardTitles()).toEqual(['Pay to', 'Deducted from', 'Attachments', 'Trail', 'Audit log'])
    expect(container.textContent).not.toMatch(/[㐀-鿿]/)
    const payTo = document.querySelector('section') as HTMLElement
    for (const label of ['Description', 'Method', 'Notes']) expect(within(payTo).getByText(label)).toBeInTheDocument()
    expect(screen.getByText('No attachments yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add attachments' })).toBeInTheDocument()
  })

  it('a payment waiting for approval has got as far as Submitted', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const trail = screen.getByRole('region', { name: 'Trail' })
    const labels = Array.from(trail.querySelectorAll('[data-state]')).map((st) => [st.children[1]?.textContent, st.getAttribute('data-state')])
    expect(labels).toEqual([
      ['Created', 'done'],
      ['Submitted', 'done'],
      ['Approved', 'todo'],
      ['Paid', 'todo'],
    ])
    expect(trail).toHaveTextContent('Waiting for Principal')
  })

  it('a voided voucher ends in Voided, takes no file and offers nothing', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    voucher.status = 'voided'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const trail = screen.getByRole('region', { name: 'Trail' })
    expect(Array.from(trail.querySelectorAll('[data-state]')).map((st) => st.getAttribute('data-state'))).toEqual(['done', 'bad'])
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
    expect(within(panel()).queryAllByRole('button')).toHaveLength(0)
  })

  it('a paid payment offers Reverse payment — never on a salary voucher, which goes back from HR Payment', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    Object.assign(voucher, { status: 'paid', payment_date: '2026-10-01', approved_at: '2026-10-01T03:00:00Z', executed_at: '2026-10-01T03:00:00Z' })
    const paid = render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(within(panel()).getByRole('button', { name: 'Reverse payment' })).toBeInTheDocument()
    paid.unmount()

    asFinance(['payroll_payouts'])
    const salary = database('payroll_disbursement')
    Object.assign(salary.voucher, { status: 'paid', payment_date: '2026-10-01', approved_at: '2026-10-01T03:00:00Z', executed_at: '2026-10-01T03:00:00Z' })
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.queryByRole('button', { name: 'Reverse payment' })).toBeNull()
  })

  it('Print opens the voucher’s document; Copy is offered to whoever raises vouchers', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByRole('link', { name: 'Print' })).toHaveAttribute('href', '/payments/voucher-doc?id=stat')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('the payroll cards are English too', async () => {
    asFinance(['payroll_payouts'])
    database('payroll_statutory')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(cardTitles()).toContain('Statutory contributions')
    const card = screen.getByRole('region', { name: 'Statutory contributions' })
    expect(card).toHaveTextContent('Recorded Employee')
    expect(card).toHaveTextContent('Total contribution')
    expect(card).toHaveTextContent('RM 100.10')
    expect(document.body.textContent).not.toMatch(/[㐀-鿿]/)
  })

  it('a salary voucher lists whom it pays, the accounts as the reader may see them', async () => {
    mocks.requirePermission.mockResolvedValue({ ...withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }), sensitive: ['salary'] })
    const person = { scope: 'staff', payroll_row_id: 'salary-row', employee_name: 'Salary Employee', employee_code: 'SAL001', department_name: 'Original Revenue' }
    database('payroll_disbursement', [{ ...person, id: 'basic', salary_component: 'basic', recipient_account: 'account_1', bank_name: 'Recorded Maybank', bank_account_no: '0012345678', net: 4302.70 }])
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'salary' }) }))
    const card = screen.getByRole('region', { name: 'People on this voucher' })
    expect(card).toHaveTextContent('Salary Employee')
    expect(card).toHaveTextContent('Recorded Maybank · ••••')
    expect(card).not.toHaveTextContent('0012345678')
    expect(card).toHaveTextContent('1 person · 1 payment')
  })
})

// The receipt keeps its page (the handoff's README: "the Receipt full page on desktop is not redesigned").
describe('a receipt keeps its page', () => {
  const asFinance = () => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  const stepLabels = () => Array.from(document.querySelectorAll('.trail-step')).map((li) => li.firstElementChild?.textContent)
  const panel = () => document.querySelector('aside.deal-side') as HTMLElement
  const cardTitles = () => Array.from(document.querySelectorAll('section h2')).map((h) => h.textContent?.replace(/^\d+/, ''))
  const source = { pool: 'venture_pool', amount: 100.10, account_code: '9091', chart_of_accounts: { name: 'Water & Electricity' } }
  const bank = { bank_name: 'Hong Leong Bank', account_number: '2190-0033-12', current_balance: 9000 }

  it('a receipt has no approval to show, and names the invoices it settled', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [{ invoice_no: 'HV-INV-202609-0039' }, { invoice_no: 'HV-INV-202609-0041' }])
    Object.assign(voucher, {
      direction: 'credit', status: 'paid', payee_name: 'Hookka', payment_date: '2026-09-29',
      approved_at: '2026-09-29T03:54:53Z', approved_by: 'creator', executed_at: '2026-09-29T03:54:53Z',
    })
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(stepLabels()).toEqual(['Created', 'Received'])
    const side = panel()
    expect(side).toHaveTextContent('+RM 100.10')
    expect(side).toHaveTextContent('Received from Hookka')
    expect(side).toHaveTextContent('Received date29 Sep 2026')
    expect(side).toHaveTextContent('Settles invoiceHV-INV-202609-0039 + 1 more')
    const head = screen.getByRole('heading', { level: 1 }).parentElement
    expect(head).toHaveTextContent('paid')
    expect(head).not.toHaveTextContent('已收')
  })

  it('…in English, going back to Receipt', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [{ invoice_no: 'HV-INV-202609-0039' }], [], { sources: [{ ...source, account_code: '5010', chart_of_accounts: { name: 'Service Fee Income' } }], bank })
    Object.assign(voucher, { direction: 'credit', status: 'paid', payee_name: 'Hookka', bank_account_id: 'bank-1', target_pool: 'venture_pool', payment_date: '2026-09-29', executed_at: '2026-09-29T03:54:53Z' })
    const { container } = render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(cardTitles()).toEqual(['Received from', 'Credited to', 'Attachments', 'Trail'])
    expect(container.textContent).not.toMatch(/[㐀-鿿]/)
    expect(screen.getByRole('link', { name: '← Back to Receipt' })).toHaveAttribute('href', '/receipts')
    // …and is Receipt's on the phone's top bar, the tab bar and the sidebar.
    expect(screen.getByTestId('nav-owner')).toHaveAttribute('data-href', '/receipts')
    expect(screen.getByTestId('nav-owner')).toHaveAttribute('data-title', 'Receipt')
    const side = panel()
    expect(side.querySelector('.deal-side-muted')).toHaveTextContent(/^Receipt$/)
    expect(side).toHaveTextContent('Into bankHong Leong Bank2190-0033-12')
    expect(side).toHaveTextContent('Credited to poolVenture Pool')
    expect(side).toHaveTextContent('Settles invoiceHV-INV-202609-0039')
    expect(screen.getByText('Add a late attachment')).toBeInTheDocument()
  })

  it('a receipt is paid the moment it is made, so nothing on it counts as late', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [{ id: 'f1', file_name: 'receipt.pdf', file_type: 'application/pdf', file_size: 1000, storage_path: 'x/receipt.pdf', description: null, uploaded_at: '2026-09-29T04:00:00Z', uploaded_by: 'creator' }])
    Object.assign(voucher, { direction: 'credit', status: 'paid', approved_at: '2026-09-29T03:54:53Z', executed_at: '2026-09-29T03:54:53Z' })
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByTestId('attachment-uploader').dataset.canUpload).toBe('true')
    expect(screen.getByTestId('attachment-list').dataset.lateAfter).toBe('')
  })
})

describe('HR’s page keeps its words', () => {
  it('in its own language, its own trail', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    database('payroll_statutory')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const titles = Array.from(document.querySelectorAll('section h2')).map((h) => h.textContent?.replace(/^\d+/, ''))
    expect(titles[0]).toBe('付给谁Pay to')
    expect(Array.from(document.querySelectorAll('.trail-step')).map((li) => li.firstElementChild?.textContent)).toEqual(['建立', '送批', '批准', '付款'])
    expect(screen.getByText(/Creator 建立 · 11 Sep 2026 · 08:00/)).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveClass('pay-no')
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveTextContent('等批准 · pending approval')
  })
})

// 2026-10-02: a paid voucher's date is corrected in place, from the panel.
describe('Change date on the voucher page', () => {
  const asFinance = () => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  const paid = { status: 'paid', payment_date: '2026-10-01', approved_at: '2026-10-01T03:00:00Z', executed_at: '2026-10-01T03:00:00Z' }

  it('is offered beside the date of a paid voucher', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    Object.assign(voucher, paid)
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByTestId('amend-date')).toHaveTextContent('stat 2026-10-01')
  })

  it('not while it can still be edited, not on a payroll voucher, and not to HR', async () => {
    asFinance()
    database('ordinary_payment') // pending approval
    const pending = render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.queryByTestId('amend-date')).toBeNull()
    pending.unmount()

    // A payroll voucher opens only with Payroll payouts; even then its date is HR's.
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }))
    const payroll = database('payroll_disbursement')
    Object.assign(payroll.voucher, paid)
    const salary = render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.queryByTestId('amend-date')).toBeNull()
    salary.unmount()

    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    const statutory = database('payroll_statutory')
    Object.assign(statutory.voucher, paid)
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.queryByTestId('amend-date')).toBeNull()
  })
})

// 2026-10-02 (user: "我不希望他看到 payroll detail，也就是每个人的 payout").
describe('a payroll voucher, for a treasury account without Payroll payouts', () => {
  const asExecutive = () => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))

  it.each(['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'])(
    'does not open a %s voucher, and reads nothing more about it',
    async (referenceType) => {
      asExecutive()
      const { from } = database(referenceType)
      await expect(PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) })).rejects.toThrow('NOT_FOUND')
      expect(from).toHaveBeenCalledTimes(1) // the voucher, and no line, attachment or name after it
    },
  )

  it('opens any other voucher as before', async () => {
    asExecutive()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'TEST-STAT-PV' })).toBeVisible()
  })

  it('opens payroll for the same account once it is given Payroll payouts', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }))
    database('payroll_statutory')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByRole('region', { name: 'Statutory contributions' })).toHaveTextContent('Recorded Employee')
  })
})

// 2026-10-05 (user: two paid PVs had been made without their receipts — "做第 2 条").
describe('files on a payment voucher', () => {
  const asFinance = () => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  const file = (uploaded_at: string) => ({ id: 'f-' + uploaded_at, file_name: 'receipt.pdf', file_type: 'application/pdf', file_size: 1000, uploaded_at })

  it('a paid voucher still takes a file, a late one; nothing can be removed', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [file('2026-10-05T02:00:00Z')])
    Object.assign(voucher, { status: 'paid', approved_at: '2026-10-04T13:23:40Z', executed_at: '2026-10-04T13:23:40Z' })
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByRole('button', { name: '+ Add a late attachment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /receipt\.pdf/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('while it is still being made, files come and go', async () => {
    asFinance()
    database('ordinary_payment', [], null, [], [file('2026-09-11T01:00:00Z')]) // pending approval
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByRole('button', { name: '+ Add attachments' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})

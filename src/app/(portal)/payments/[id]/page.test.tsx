import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { render, screen, within } from '@testing-library/react'
vi.mock('server-only', () => ({}))
const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('../actions', () => ({ submitForApproval: vi.fn(), approveVoucher: vi.fn(), voidVoucher: vi.fn(), voidPaidReceipt: vi.fn(), reversePaidPayment: vi.fn(), returnVoucherToDraft: vi.fn() }))
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
    const result = { data: table === 'payroll_statutory_voucher_lines' ? [{ id: 'line', scope: 'staff', payroll_row_id: 'row', employee_name: 'Recorded Employee', employee_code: 'TEST001', department_name: 'Original Department', period_month: '2026-08-01', scheme: 'KWSP', amount: '100.10' }] : table === 'payroll_voucher_lines' ? salaryLines : table === 'invoices' ? invoices : table === 'payment_attachments' ? attachments : table === 'payment_voucher_sources' ? (more.sources ?? []) : [], error: table === 'payroll_voucher_lines' ? salaryError : null }
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      in: vi.fn((column: string, values: string[]) => { if (column === 'reference_type') { allowedReferences = values; filters.push(values) } return query }),
      single: vi.fn(() => Promise.resolve({ data: table === 'payment_vouchers' ? (allowedReferences && !allowedReferences.includes(referenceType) ? null : voucher) : table === 'bank_accounts' && more.bank ? more.bank : { name: 'Creator' }, error: null })),
      // The pending approval's submitter — who may decide it (2026-10-09).
      maybeSingle: vi.fn(() => Promise.resolve({ data: table === 'approval_requests' ? { request_type: 'payment_voucher', submitted_by: 'creator' } : null, error: null })),
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

  it('preserves treasury access and its existing action controls', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
    const { filters } = database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(filters).toEqual([])
    expect(screen.getByTestId('voucher-actions')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-actions')).toHaveAttribute('data-can-reverse', 'true')
    expect(screen.getByTestId('copy-voucher')).toBeInTheDocument()
    expect(screen.getByTestId('attachment-uploader')).toBeInTheDocument()
  })

  it('does not expose generic financial reversal for a paid salary PV', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }))
    const { voucher } = database('payroll_disbursement')
    voucher.status = 'paid'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByTestId('voucher-actions')).toHaveAttribute('data-can-reverse', 'false')
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

// 2026-10-02 (user: "这个 pv 点开看 detail 也是很乱 / receipt 也是字体你看怪怪的").
describe('the voucher page, laid out like the deal forms', () => {
  const asFinance = () => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  const stepLabels = () => Array.from(document.querySelectorAll('.trail-step')).map((li) => li.firstElementChild?.textContent)
  const panel = () => document.querySelector('aside.deal-side') as HTMLElement

  // 2026-10-10 — the handoff (audit 2026-10-09 l, item 8): on the Finance view
  // the page is English throughout — the chip says the status alone, the
  // number is set in the figures' mono.
  it('sets the number in the figures’ face, with its status beside it', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const number = screen.getByRole('heading', { level: 1, name: 'TEST-STAT-PV' })
    expect(number).toHaveClass('title-number') // not the Georgia page title, whose figures are old-style
    expect(number).toHaveClass('pay-no')
    expect(number.parentElement).toHaveTextContent('pending approval')
    expect(number.parentElement).not.toHaveTextContent('等批准')
  })

  it('prints times as the office reads them, not as the server keeps them', async () => {
    asFinance()
    database('ordinary_payment') // created 2026-09-11T00:00Z — 08:00 in Kuala Lumpur
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByText(/Created by Creator · 11 Sep 2026 · 08:00/)).toBeVisible()
  })

  it('keeps what the voucher is in one panel: amount, payee, date, method — and the actions', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    voucher.payment_date = '2026-09-12'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const side = panel()
    expect(side).toHaveTextContent('RM 100.10')
    expect(side).toHaveTextContent('Pay to KWSP')
    expect(side).toHaveTextContent('Payment date12 Sep 2026')
    expect(side).toHaveTextContent('MethodBank transfer')
    expect(within(side).getByTestId('voucher-actions')).toBeInTheDocument()
  })

  // 2026-10-09 (the Finance revamp): the panel's rows sit under When & where
  // and Booking, and a pending voucher's chip is the blue wait.
  it('groups the panel under When & where and Booking, and waits in blue', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    voucher.payment_date = '2026-09-12'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const side = panel()
    const heads = Array.from(side.querySelectorAll('.deal-side-sec')).map((h) => h.textContent)
    expect(heads).toEqual(['When & where', 'Booking'])
    const number = screen.getByRole('heading', { level: 1, name: 'TEST-STAT-PV' })
    expect(number.parentElement?.querySelector('.chip')).toHaveClass('wait')
  })

  it('says so when no payment date was set', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(panel()).toHaveTextContent('Payment dateNot set')
  })

  it('a payment waiting for approval has got as far as Submitted', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(stepLabels()).toEqual(['Created', 'Submitted', 'Approved', 'Paid'])
    const [made, sent, approve, pay] = Array.from(document.querySelectorAll('.trail-step'))
    expect(made).toHaveClass('done', 'joined')
    expect(sent).toHaveClass('done')
    expect(sent).not.toHaveClass('joined') // nothing beyond it has happened
    expect(approve).not.toHaveClass('done')
    expect(approve).toHaveTextContent('Waiting for Principal')
    expect(pay).not.toHaveClass('done')
  })

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

  it('a voided voucher ends in Voided', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    voucher.status = 'voided'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(stepLabels()).toEqual(['Created', 'Voided'])
    expect(document.querySelectorAll('.trail-step')[1]).toHaveClass('bad')
  })
})

// 2026-10-10 — the handoff (audit 2026-10-09 l, items 8 and 10): the voucher
// page in English on the Finance view, its words taken from the builders
// (pagePaymentDetail / pageReceiptDetail). HR opens a payroll voucher here too,
// from HR Payment — HR's page keeps its words.
describe('the voucher page in the handoff’s English', () => {
  const asFinance = () => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  const panel = () => document.querySelector('aside.deal-side') as HTMLElement
  const cardTitles = () => Array.from(document.querySelectorAll('section h2')).map((h) => h.textContent?.replace(/^\d+/, ''))
  const source = { pool: 'venture_pool', amount: 100.10, account_code: '9091', chart_of_accounts: { name: 'Water & Electricity' } }
  const bank = { bank_name: 'Hong Leong Bank', account_number: '2190-0033-12', current_balance: 9000 }

  it('has no Chinese anywhere on a payment', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [], { sources: [source], bank })
    Object.assign(voucher, { bank_account_id: 'bank-1', notes: 'Paid before the 15th', payment_date: '2026-09-12' })
    const { container } = render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(cardTitles()).toEqual(['Pay to', 'Deducted from', 'Attachments', 'Trail'])
    expect(container.textContent).not.toMatch(/[㐀-鿿]/)
    const payTo = document.querySelector('section') as HTMLElement
    for (const label of ['Description', 'Method', 'Notes']) expect(within(payTo).getByText(label)).toBeInTheDocument()
    expect(screen.getByText('No attachments yet.')).toBeInTheDocument()
    expect(screen.getByText('Add attachments')).toBeInTheDocument()
    expect(panel().querySelector('.deal-side-muted')).toHaveTextContent(/^Payment voucher$/)
  })

  it('…nor on a receipt, which goes back to Receipt', async () => {
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

  it('names the bank with its account number under it, and the account with its GL code', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [], { sources: [source], bank })
    voucher.bank_account_id = 'bank-1'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const side = panel()
    expect(side).toHaveTextContent('From bankHong Leong Bank2190-0033-12')
    expect(side).toHaveTextContent('AccountWater & Electricity9091')
    expect(side).toHaveTextContent('PoolVenture Pool')
    expect(within(side).getByText('2190-0033-12')).toHaveClass('pay-side-sub')
    expect(within(side).getByText('9091')).toHaveClass('pay-side-sub')
  })

  it('a payment still goes back to Payments', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByRole('link', { name: '← Back to Payments' })).toHaveAttribute('href', '/payments')
    expect(screen.queryByTestId('nav-owner')).toBeNull()
  })

  it('the payroll cards are English too', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury', 'payroll_payouts'] }))
    database('payroll_statutory')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(cardTitles()).toContain('Statutory contributions on this voucher')
    expect(document.body.textContent).not.toMatch(/[㐀-鿿]/)
  })

  it('HR’s page keeps its words', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'hr', permissions: ['hr_costing'] }))
    database('payroll_statutory')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(cardTitles()[0]).toBe('付给谁Pay to')
    expect(Array.from(document.querySelectorAll('.trail-step')).map((li) => li.firstElementChild?.textContent)).toEqual(['建立', '送批', '批准', '付款'])
    expect(screen.getByText(/Creator 建立 · 11 Sep 2026 · 08:00/)).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveClass('pay-no')
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveTextContent('等批准 · pending approval')
  })
})

// 2026-10-02: a paid voucher's date is corrected in place, from the panel.
describe('改日期 on the voucher page', () => {
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
    expect(screen.getByRole('table', { name: 'Statutory contributions covered by this voucher' })).toHaveTextContent('Recorded Employee')
  })
})

// 2026-10-05 (user: two paid PVs had been made without their receipts — "做第 2 条").
describe('attachments on a voucher that is already decided', () => {
  const asFinance = () => mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
  const file = (uploaded_at: string) => ({ id: 'f-' + uploaded_at, file_name: 'receipt.pdf', file_type: 'application/pdf', file_size: 1000, storage_path: 'x/receipt.pdf', description: null, uploaded_at, uploaded_by: 'creator' })

  it('a paid voucher still takes a file, and says it is a late one; nothing can be removed', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [file('2026-10-05T02:00:00Z')])
    Object.assign(voucher, { status: 'paid', approved_at: '2026-10-04T13:23:40Z', executed_at: '2026-10-04T13:23:40Z' })
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const uploader = screen.getByTestId('attachment-uploader')
    expect(uploader.dataset.canUpload).toBe('true')
    expect(uploader.dataset.late).toBe('true')
    // The handoff's words on the Finance view (2026-10-10).
    expect(screen.getByText('Add a late attachment')).toBeInTheDocument()
    const list = screen.getByTestId('attachment-list')
    expect(list.dataset.canDelete).toBe('false')
    expect(list.dataset.lateAfter).toBe('2026-10-04T13:23:40Z') // the list marks what came after this
  })

  it('while it is still being made, files come and go as before', async () => {
    asFinance()
    database('ordinary_payment', [], null, [], [file('2026-09-11T01:00:00Z')]) // pending approval
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const uploader = screen.getByTestId('attachment-uploader')
    expect(uploader.dataset.canUpload).toBe('true')
    expect(uploader.dataset.late).toBe('false')
    expect(screen.getByText('Add attachments')).toBeInTheDocument()
    expect(screen.getByTestId('attachment-list').dataset.canDelete).toBe('true')
  })

  it('a receipt is paid the moment it is made, so nothing on it counts as late', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment', [], null, [], [file('2026-09-29T04:00:00Z')])
    Object.assign(voucher, { direction: 'credit', status: 'paid', approved_at: '2026-09-29T03:54:53Z', executed_at: '2026-09-29T03:54:53Z' })
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByTestId('attachment-uploader').dataset.canUpload).toBe('true')
    expect(screen.getByTestId('attachment-list').dataset.lateAfter).toBe('')
  })

  it('a voided voucher is closed', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    voucher.status = 'voided'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByTestId('attachment-uploader').dataset.canUpload).toBe('false')
  })
})

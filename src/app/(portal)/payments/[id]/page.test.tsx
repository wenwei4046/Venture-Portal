import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withActions } from '@/test/with-actions'
import { render, screen, within } from '@testing-library/react'
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
vi.mock('@/components/voucher/AttachmentList', () => ({ default: (p: { canDelete?: boolean; lateAfter?: string | null }) => <div data-testid="attachment-list" data-can-delete={String(!!p.canDelete)} data-late-after={p.lateAfter ?? ''} /> }))
import PaymentDetailPage from './page'

function database(referenceType = 'payroll_statutory', salaryLines: Record<string, unknown>[] = [], salaryError: object | null = null, invoices: Record<string, unknown>[] = [], attachments: Record<string, unknown>[] = []) {
  const voucher: Record<string, unknown> & { status: string } = { id: 'stat', voucher_no: 'TEST-STAT-PV', reference_type: referenceType, status: 'pending_approval', amount: 100.10, direction: 'debit', voucher_type: 'salary_payout', payee_name: 'KWSP', payee_company_id: null, bank_account_id: null, source_pool: null, target_pool: null, created_by: 'creator', approved_by: null, approved_at: null, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z', executed_at: null, payment_method: 'bank_transfer', description: 'Statutory fixture', notes: null }
  const filters: string[][] = []
  const from = vi.fn((table: string) => {
    let allowedReferences: string[] | null = null
    const result = { data: table === 'payroll_statutory_voucher_lines' ? [{ id: 'line', scope: 'staff', payroll_row_id: 'row', employee_name: 'Recorded Employee', employee_code: 'TEST001', department_name: 'Original Department', period_month: '2026-08-01', scheme: 'KWSP', amount: '100.10' }] : table === 'payroll_voucher_lines' ? salaryLines : table === 'invoices' ? invoices : table === 'payment_attachments' ? attachments : [], error: table === 'payroll_voucher_lines' ? salaryError : null }
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      in: vi.fn((column: string, values: string[]) => { if (column === 'reference_type') { allowedReferences = values; filters.push(values) } return query }),
      single: vi.fn(() => Promise.resolve({ data: table === 'payment_vouchers' ? (allowedReferences && !allowedReferences.includes(referenceType) ? null : voucher) : { name: 'Creator' }, error: null })),
      // The pending approval's submitter — who may decide it (2026-10-09).
      maybeSingle: vi.fn(() => Promise.resolve({ data: table === 'approval_requests' ? { request_type: 'payment_voucher', submitted_by: 'creator' } : null, error: null })),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
    }
    return query
  })
  mocks.createClient.mockResolvedValue({ from, rpc: vi.fn().mockResolvedValue({ data: [], error: null }) })
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

  it('sets the number in the figures’ face, with its status beside it', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const number = screen.getByRole('heading', { level: 1, name: 'TEST-STAT-PV' })
    expect(number).toHaveClass('title-number') // not the Georgia page title, whose figures are old-style
    expect(number.parentElement).toHaveTextContent('等批准 · pending approval')
  })

  it('prints times as the office reads them, not as the server keeps them', async () => {
    asFinance()
    database('ordinary_payment') // created 2026-09-11T00:00Z — 08:00 in Kuala Lumpur
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(screen.getByText(/Creator 建立 · 11 Sep 2026 · 08:00/)).toBeVisible()
  })

  it('keeps what the voucher is in one panel: amount, payee, date, method — and the actions', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    voucher.payment_date = '2026-09-12'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    const side = panel()
    expect(side).toHaveTextContent('RM 100.10')
    expect(side).toHaveTextContent('付给 KWSP')
    expect(side).toHaveTextContent('付款日期12 Sep 2026')
    expect(side).toHaveTextContent('方式bank transfer')
    expect(within(side).getByTestId('voucher-actions')).toBeInTheDocument()
  })

  it('says so when no payment date was set', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(panel()).toHaveTextContent('付款日期还没定')
  })

  it('a payment waiting for approval has got as far as 送批', async () => {
    asFinance()
    database('ordinary_payment')
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(stepLabels()).toEqual(['建立', '送批', '批准', '付款'])
    const [made, sent, approve, pay] = Array.from(document.querySelectorAll('.trail-step'))
    expect(made).toHaveClass('done', 'joined')
    expect(sent).toHaveClass('done')
    expect(sent).not.toHaveClass('joined') // nothing beyond it has happened
    expect(approve).not.toHaveClass('done')
    expect(approve).toHaveTextContent('等 Principal')
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
    expect(stepLabels()).toEqual(['建立', '已入账'])
    const side = panel()
    expect(side).toHaveTextContent('+RM 100.10')
    expect(side).toHaveTextContent('收自 Hookka')
    expect(side).toHaveTextContent('收款日期29 Sep 2026')
    expect(side).toHaveTextContent('结哪张发票HV-INV-202609-0039 等 2 张')
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveTextContent('已收 · paid')
  })

  it('a voided voucher ends in 作废', async () => {
    asFinance()
    const { voucher } = database('ordinary_payment')
    voucher.status = 'voided'
    render(await PaymentDetailPage({ params: Promise.resolve({ id: 'stat' }) }))
    expect(stepLabels()).toEqual(['建立', '作废'])
    expect(document.querySelectorAll('.trail-step')[1]).toHaveClass('bad')
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
    expect(screen.getByText('补附件 · Add attachments')).toBeInTheDocument()
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
    expect(screen.getByText('加附件 · Add attachments')).toBeInTheDocument()
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

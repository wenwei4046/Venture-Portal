import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/storage/stage', () => import('@/test/stage-in-place'))
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ClaimQueueRow } from '@/lib/claim-requests'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import type { PaymentRequestsRead } from '../_lib/requests-read'
import { parseRequest, type PaymentRequest } from '@/lib/payment-requests/model'
import { claimRow, payrollRow, requestDepartments, sortRequests, staffRequestRow } from '../_lib/requests-model'

// Payments › Payment request (2026-10-29, PR ①): Payment voucher's hub with what is sent to be paid — the cards pick
// the list (All, Payroll, every department), a row opens its drawer, a right-click its menu; a member's claim goes
// back to HR only with a reason, and only for an account that may send back.

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), flash: vi.fn(), returnClaim: vi.fn(), openInvoice: vi.fn(), raise: vi.fn(),
  reject: vi.fn(), billBack: vi.fn(), forPv: vi.fn(), createPv: vi.fn(), openCreate: vi.fn(), openFile: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }
      return q
    },
  }),
}))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('../actions', () => ({
  returnMemberClaim: mocks.returnClaim, openMemberClaimInvoice: mocks.openInvoice,
  rejectPaymentRequest: mocks.reject, answerBillBack: mocks.billBack, openRequestsForPv: mocks.forPv,
}))
vi.mock('../../actions', () => ({ createPaymentForRequests: mocks.createPv, createPaymentFromDialog: vi.fn() }))
vi.mock('../../create-actions', () => ({ openCreatePayment: mocks.openCreate }))
vi.mock('@/lib/payment-requests/actions', () => ({ openRequestFile: mocks.openFile }))
vi.mock('@/app/(portal)/payments/claim-requests/actions', () => ({ raiseClaimVoucher: mocks.raise }))
vi.mock('@/app/(portal)/payments/payroll-requests/actions', () => ({ generatePvFromRequestInWords: vi.fn(), sendBackPayrollInWords: vi.fn() }))
vi.mock('@/app/(portal)/payments/dept-requests/actions', () => ({ generateDeptRequestPvInWords: vi.fn() }))
vi.mock('../../_components/VoucherDrawer', () => ({ VoucherDrawer: ({ id }: { id: string | null }) => (id ? <div data-testid="voucher">{id}</div> : null) }))

import RequestsHub from './RequestsHub'

const DEPTS = requestDepartments([
  { id: 'hr', name: 'HR', segmentKey: 'hr', isInternal: false },
  { id: 'mk', name: 'Marketing', segmentKey: 'marketing', isInternal: false },
  { id: 'rev', name: 'Revenue Department', segmentKey: 'revenue_department', isInternal: false },
])
const claim = (over: Partial<ClaimQueueRow>): ClaimQueueRow => ({
  claimId: '11111111-1111-4111-8111-111111111111',
  claimType: 'benefit',
  claimantName: 'LUCAS',
  department: 'Revenue Department',
  amount: 100,
  description: 'Outstation · Johor',
  sourcePool: 'venture_pool',
  requestNo: 'RQ-2610-008',
  approvedByName: 'LI SEAN',
  approvedAt: '2026-10-26T02:00:00Z',
  voucherId: null,
  voucherNo: null,
  voucherStatus: null,
  ...over,
})
const PAYROLL: PayrollRequestLine = {
  id: 'p1', label: 'October 2026', sub: 'Batch #1 · HR 5', value: '98,450.20', amount: 98450.2, committed: 0, remaining: 98450.2,
  isDirector: false, batchId: 'b1', period: '2026-10-01', requested: 'HR Manager · 29 Oct 10:00',
  pools: [{ pool_key: 'dept_pool_hr', dept_name: 'HR', label: 'HR', required: 98450.2, pool_balance: 120000, committed: 0, remaining: 98450.2 }],
  pendingPvs: [], canSendBack: true,
}

const data = (over: Partial<PaymentRequestsRead> = {}): PaymentRequestsRead => ({
  rows: sortRequests([
    claimRow(claim({}), DEPTS),
    claimRow(claim({ claimId: '22222222-2222-4222-8222-222222222222', claimantName: 'AMIR', amount: 50, requestNo: 'RQ-2610-002', voucherId: 'v-7', voucherNo: 'HV-PV-202610-0007', voucherStatus: 'pending_approval' }), DEPTS),
    payrollRow(PAYROLL, { requested_at: '2026-10-29T02:00:00Z', requested_by_name: 'HR Manager' }),
  ]),
  departments: DEPTS,
  banks: [{ id: 'b-hl', bank_name: 'Hong Leong Bank', current_balance: 50000, gl_account_code: '3000' }],
  seesPayroll: true,
  today: '2026-10-29',
  can: { pay: true, sendBack: true },
  canSetDefault: true,
  ...over,
})
const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))
const draw = async (over: Partial<PaymentRequestsRead> = {}) => {
  render(<RequestsHub data={data(over)} />)
  await act(async () => undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/payments/requests')
})

describe('the hub', () => {
  it('says Daily · Payments › Payment request, what waits for Finance, and a card for All, Payroll and every department', async () => {
    await draw()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Payment request')
    expect(screen.getByText('Waiting for you · 2 requests')).toBeInTheDocument()
    expect(screen.getByText('RM 98,550.20')).toBeInTheDocument()
    for (const card of [/^All requests/, /^Payroll/, /^HR/, /^Marketing/, /^Revenue Department/]) expect(screen.getByRole('button', { name: card })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All requests/ })).toHaveAttribute('aria-pressed', 'true')
    expect(names()).toHaveLength(3)
  })

  it('a department’s card lists its own, and the URL keeps it', async () => {
    await draw()
    fireEvent.click(screen.getByRole('button', { name: /^Revenue Department/ }))
    expect(names().map((cells) => cells.find((c) => c === 'LUCAS' || c === 'AMIR'))).toEqual(['LUCAS', 'AMIR'])
    expect(window.location.search).toBe('?card=dept%3Arev')
    fireEvent.click(screen.getByRole('button', { name: /^HR/ }))
    expect(screen.getByText('No requests here.')).toBeInTheDocument()
  })

  it('without Payroll payouts, no Payroll card', async () => {
    await draw({ seesPayroll: false, rows: data().rows.filter((r) => r.source !== 'payroll') })
    expect(screen.queryByRole('button', { name: /^Payroll/ })).toBeNull()
  })
})

describe('a row’s menu and drawer', () => {
  it('a claim waiting for a PV: Create PV and Return to HR…; one with a PV: Open voucher', async () => {
    await draw()
    fireEvent.contextMenu(screen.getByText('LUCAS'))
    expect(screen.getByRole('menuitem', { name: 'Create PV' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Return to HR…' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.contextMenu(screen.getByText('AMIR'))
    expect(screen.queryByRole('menuitem', { name: 'Create PV' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open voucher' }))
    expect(screen.getByTestId('voucher')).toHaveTextContent('v-7')
  })

  it('a payroll: Generate PV… and Send back to HR…', async () => {
    await draw()
    fireEvent.contextMenu(screen.getByText('HR Manager'))
    expect(screen.getByRole('menuitem', { name: 'Generate PV…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Send back to HR…' })).toBeInTheDocument()
  })

  it('an account that may not send back is offered neither Return nor Send back', async () => {
    await draw({ can: { pay: true, sendBack: false } })
    fireEvent.contextMenu(screen.getByText('LUCAS'))
    expect(screen.queryByRole('menuitem', { name: 'Return to HR…' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByText('LUCAS'))
    expect(screen.queryByRole('button', { name: 'Return to HR…' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Create PV' })).toBeInTheDocument()
  })

  it('the drawer: the claim, its invoice, and Return to HR — only with a reason', async () => {
    mocks.returnClaim.mockResolvedValue({ ok: true })
    await draw()
    fireEvent.click(screen.getByText('LUCAS'))
    expect(screen.getByRole('dialog', { name: /LUCAS/ })).toHaveTextContent('Member claim · approved by HR')
    expect(screen.getByRole('dialog', { name: /LUCAS/ })).toHaveTextContent('HR · LI SEAN')
    fireEvent.click(screen.getByRole('button', { name: 'Return to HR…' }))
    const sheet = screen.getByRole('dialog', { name: /Return LUCAS to HR/ })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Return to HR' }))
    expect(mocks.returnClaim).not.toHaveBeenCalled()
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Say why the claim goes back to HR.')
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: 'The invoice is for 2 nights' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Return to HR' }))
    })
    expect(mocks.returnClaim).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'The invoice is for 2 nights')
    expect(mocks.flash).toHaveBeenCalledWith('Returned to HR')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('the invoice opens in a new tab, or says why not', async () => {
    mocks.openInvoice.mockResolvedValueOnce({ ok: false, reason: 'This claim has no invoice — an outstation claim by road is paid by its rate.' })
    await draw()
    fireEvent.click(screen.getByText('LUCAS'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /The member’s invoice/ }))
    })
    expect(mocks.openInvoice).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(screen.getByRole('dialog', { name: /LUCAS/ })).toHaveTextContent('This claim has no invoice')
  })
})

// PR ② (2026-10-29): the staff's own requests from the Claim page, under their department — each share's Bill back?
// answered in the drawer, Reject… with a reason the requester reads, and Create PV in today's Create payment window,
// the same person's open requests in it.
describe('a staff request', () => {
  const staff = (over: Record<string, unknown> = {}): PaymentRequest =>
    parseRequest({
      id: '33333333-3333-4333-8333-333333333333', requestNo: 'PRQ-2610-0002', status: 'with_finance', kind: 'claim', mine: false,
      requesterName: 'KHO WEI JIE', departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing', billingMode: 'marketing_project',
      payToSalary: true, payeeName: 'KHO WEI JIE', payeeBank: 'Hong Leong Bank', payeeAccount: '•••• 4821', description: 'Claude · Oct',
      total: 453.79, submittedAt: '2026-10-29T02:00:00Z', createdAt: '2026-10-29T01:00:00Z', updatedAt: '2026-10-29T02:00:00Z',
      items: [{ id: 'i1', description: 'Claude · Oct', amount: 453.79 }], shares: [],
      files: [{ id: 'f1', kind: 'receipt', name: 'Receipt-2932.pdf', contentType: 'application/pdf', size: 1200 }],
      ...over,
    }) as PaymentRequest
  const LI = staff({
    id: '44444444-4444-4444-8444-444444444444', requestNo: 'PRQ-2610-0001', requesterName: 'LI SEAN', departmentId: 'hr', departmentName: 'HR',
    pool: 'dept_pool_hr', payToSalary: false, payeeName: 'LI SEAN', payeeBank: 'Public Bank', payeeAccount: '•••• 0210', description: 'Canva team plan · Oct',
    total: 250, items: [{ id: 'i9', description: 'Canva team plan · Oct', amount: 250 }],
    shares: [{ id: '55555555-5555-4555-8555-555555555555', party: 'department', departmentId: 'mk', departmentName: 'Marketing', amount: 80, billBack: null }],
  })
  const withStaff = (...requests: PaymentRequest[]) => ({ rows: sortRequests([...data().rows, ...requests.map((r) => staffRequestRow(r, DEPTS))]) })

  it('sits under its department’s card; its drawer shows what it was for, the receipts and who is paid', async () => {
    await draw(withStaff(staff()))
    fireEvent.click(screen.getByRole('button', { name: /^Marketing/ }))
    expect(names().map((cells) => cells.find((c) => c === 'KHO WEI JIE'))).toEqual(['KHO WEI JIE'])
    fireEvent.click(screen.getByText('KHO WEI JIE'))
    const drawer = screen.getByRole('dialog', { name: /KHO WEI JIE/ })
    expect(drawer).toHaveTextContent('Claim · I paid')
    expect(drawer).toHaveTextContent('Receipt-2932.pdf')
    expect(drawer).toHaveTextContent('Salary account · Hong Leong Bank •••• 4821')
    expect(within(drawer).getByRole('button', { name: 'Create PV' })).toBeEnabled()
  })

  it('a share waits for Bill back? — answered in the drawer — before its PV', async () => {
    mocks.billBack.mockResolvedValue({ ok: true })
    await draw(withStaff(LI))
    fireEvent.click(screen.getByText('LI SEAN'))
    const drawer = screen.getByRole('dialog', { name: /LI SEAN/ })
    expect(drawer).toHaveTextContent('Bill back: Not answered')
    expect(within(drawer).getByRole('button', { name: 'Create PV' })).toBeDisabled()
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Bill back · Yes' }))
    })
    expect(mocks.billBack).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555', true)
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('Reject… asks a reason the requester reads, then sends it back', async () => {
    mocks.reject.mockResolvedValue({ ok: true })
    await draw(withStaff(staff()))
    fireEvent.contextMenu(screen.getByText('KHO WEI JIE'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reject…' }))
    const sheet = screen.getByRole('dialog', { name: /Reject PRQ-2610-0002/ })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reject' }))
    expect(mocks.reject).not.toHaveBeenCalled()
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: 'The receipt is for September' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Reject' }))
    })
    expect(mocks.reject).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333', 'The receipt is for September')
    expect(mocks.flash).toHaveBeenCalledWith('Rejected — back with the requester')
  })

  it('Create PV puts the same person’s open requests into one PV — today’s Create payment, filled in', async () => {
    const second = staff({ id: '66666666-6666-4666-8666-666666666666', requestNo: 'PRQ-2610-0003', description: 'Jian Ying', total: 325.79,
      submittedAt: '2026-10-29T03:00:00Z', items: [{ id: 'i2', description: 'Jian Ying', amount: 325.79 }], files: [] })
    mocks.forPv.mockResolvedValue({ ok: true, requests: [staff(), second] })
    mocks.openCreate.mockResolvedValue({
      ok: true,
      options: {
        prefix: 'HV-PV-202610', today: '2026-10-29', companies: [], fundSources: [],
        banks: [{ id: 'bank-hl', bank_name: 'Hong Leong Bank', account_number: '123-456-7890', current_balance: 100000 }],
        accounts: [{ code: '9087', name: 'Website & Software', type: 'expense' }],
        pools: [{ value: 'venture_pool', label: 'Venture Pool' }, { value: 'dept_pool_marketing', label: 'Marketing Dept Pool' }],
      },
    })
    await draw(withStaff(staff(), second))
    fireEvent.contextMenu(screen.getAllByText('KHO WEI JIE')[0])
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Create PV' }))
    })
    expect(mocks.forPv).toHaveBeenCalledWith(['33333333-3333-4333-8333-333333333333', '66666666-6666-4666-8666-666666666666'])
    const pv = screen.getByRole('dialog', { name: 'Create PV' })
    expect(within(pv).getByLabelText('Line 1 description')).toHaveValue('Claude · Oct')
    expect(within(pv).getByLabelText('Line 2 description')).toHaveValue('Jian Ying')
    expect(within(pv).getByLabelText('Line 2 amount')).toHaveValue('325.79')
    expect(pv).toHaveTextContent('Pay into Hong Leong Bank •••• 4821 · salary account')
    expect(pv).toHaveTextContent('Receipt-2932.pdf')
    expect(pv).toHaveTextContent('From the request')
    expect(within(pv).getByLabelText('Notes')).toHaveValue('From Payment request · PRQ-2610-0002, PRQ-2610-0003')
  })

  // 2026-10-29 — the user ("可以"): one of the same person's requests still waiting for its Bill back? answer stays with
  // Finance for a PV of its own; the answered ones go in.
  it('Create PV leaves out the same person’s request whose Bill back? is not answered — said, never stopped', async () => {
    const waiting = staff({ id: '77777777-7777-4777-8777-777777777777', requestNo: 'PRQ-2610-0005', description: 'Canva', total: 300,
      submittedAt: '2026-10-29T04:00:00Z', items: [{ id: 'i7', description: 'Canva', amount: 300 }],
      shares: [{ id: '88888888-8888-4888-8888-888888888888', party: 'company', companyId: 'dc', companyName: 'Dream Crafter', amount: 100, billBack: null }] })
    mocks.forPv.mockResolvedValue({ ok: true, requests: [staff()] })
    mocks.openCreate.mockResolvedValue({ ok: false, reason: 'not read in this test' })
    await draw(withStaff(staff(), waiting))
    fireEvent.contextMenu(screen.getByText('Claude · Oct'))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Create PV' }))
    })
    expect(mocks.forPv).toHaveBeenCalledWith(['33333333-3333-4333-8333-333333333333'])
    expect(screen.getByRole('dialog', { name: 'Create PV' })).toBeInTheDocument()
    expect(mocks.flash).toHaveBeenCalledWith('PRQ-2610-0005 stays with Finance — Bill back? not answered yet')
    // The unanswered one itself asks for its answer first.
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.contextMenu(screen.getByText('Canva'))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Create PV' }))
    })
    expect(mocks.forPv).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: /KHO WEI JIE · Canva/ })).toHaveTextContent('Answer Bill back? for PRQ-2610-0005 first.')
  })
})

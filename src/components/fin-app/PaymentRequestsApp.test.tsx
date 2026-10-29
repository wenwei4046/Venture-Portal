import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ClaimQueueRow } from '@/lib/claim-requests'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import { parseRequest, type PaymentRequest } from '@/lib/payment-requests/model'
import type { PaymentRequestsRead } from '@/app/(portal)/payments/requests/_lib/requests-read'
import { claimRow, payrollRow, requestDepartments, sortRequests, staffRequestRow, statutoryRow } from '@/app/(portal)/payments/requests/_lib/requests-model'

// Payments › Payment request in the Finance phone app (2026-10-29, PR ⑥): the hub's cards open a list; Select ticks the
// staff requests waiting for their PV (payroll and a Revenue claim say why not) and the dark bar holds Reject and Create
// PV; a row opens the request's own screen — the desktop drawer's body, its steps on the bar; a statutory voucher opens
// in the app's Payments.

const mocks = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), flash: vi.fn(), forPv: vi.fn(), forPvs: vi.fn(), rejectMany: vi.fn(), openCreate: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/payment-requests',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/payments/requests/actions', () => ({
  returnMemberClaim: vi.fn(), openMemberClaimInvoice: vi.fn(), rejectPaymentRequest: vi.fn(), openRequestsForPv: mocks.forPv,
  rejectPaymentRequests: mocks.rejectMany, openRequestsForPvs: mocks.forPvs,
}))
vi.mock('@/app/(portal)/payments/actions', () => ({ createPaymentForRequests: vi.fn(), createPaymentFromDialog: vi.fn(), submitPaymentsTogether: vi.fn() }))
vi.mock('@/app/(portal)/payments/create-actions', () => ({ openCreatePayment: mocks.openCreate }))
vi.mock('@/lib/payment-requests/actions', () => ({ openRequestFile: vi.fn() }))
vi.mock('@/app/(portal)/payments/claim-requests/actions', () => ({ raiseClaimVoucher: vi.fn() }))
vi.mock('@/app/(portal)/payments/payroll-requests/actions', () => ({ generatePvFromRequestInWords: vi.fn(), sendBackPayrollInWords: vi.fn() }))

import FinAppFrame from './FinAppFrame'
import PaymentRequestsApp from './PaymentRequestsApp'
import { resetNav } from './nav'

const DEPTS = requestDepartments([
  { id: 'hr', name: 'HR', segmentKey: 'hr', isInternal: false },
  { id: 'mk', name: 'Marketing', segmentKey: 'marketing', isInternal: false },
  { id: 'rev', name: 'Revenue Department', segmentKey: 'revenue_department', isInternal: false },
])
const staff = (over: Record<string, unknown> = {}): PaymentRequest =>
  parseRequest({
    id: '33333333-3333-4333-8333-333333333333', requestNo: 'PRQ-2610-0002', status: 'with_finance', kind: 'claim', mine: false,
    requesterName: 'KHO WEI JIE', departmentId: 'mk', departmentName: 'Marketing', pool: 'dept_pool_marketing', payToSalary: true,
    payeeName: 'KHO WEI JIE', payeeBank: 'Hong Leong Bank', payeeAccount: '•••• 4821', description: 'Claude · Oct', total: 453.79,
    submittedAt: '2026-10-29T02:00:00Z', items: [{ id: 'i1', description: 'Claude · Oct', amount: 453.79 }], shares: [],
    files: [{ id: 'f1', kind: 'receipt', name: 'Receipt-2932.pdf', contentType: 'application/pdf', size: 1200 }],
    ...over,
  }) as PaymentRequest
const KHO2 = staff({ id: '66666666-6666-4666-8666-666666666666', requestNo: 'PRQ-2610-0003', description: 'ChatGPT · Oct', total: 99.9, submittedAt: '2026-10-29T03:00:00Z', items: [{ id: 'i2', description: 'ChatGPT · Oct', amount: 99.9 }] })
const SIA = staff({ id: '77777777-7777-4777-8777-777777777777', requestNo: 'PRQ-2610-0004', requesterName: 'SIA JOSIAH', payeeName: 'SIA JOSIAH', payeeAccount: '•••• 3307', description: 'Notion', total: 324.91, items: [{ id: 'i3', description: 'Notion', amount: 324.91 }] })
const CLAIM: ClaimQueueRow = {
  claimId: '11111111-1111-4111-8111-111111111111', claimType: 'benefit', claimantName: 'LUCAS', department: 'Revenue Department', amount: 100,
  description: 'Outstation · Johor', sourcePool: 'venture_pool', requestNo: 'RQ-2610-008', approvedByName: 'LI SEAN', approvedAt: '2026-10-26T02:00:00Z',
  voucherId: null, voucherNo: null, voucherStatus: null,
}
const PAYROLL: PayrollRequestLine = {
  id: 'p1', label: 'October 2026', sub: 'Batch #1 · 5 departments', value: '98,450.20', amount: 98450.2, committed: 0, remaining: 98450.2, isDirector: false,
  batchId: 'b1', period: '2026-10-01', requested: 'HR Manager · 29 Oct 10:00', pools: [], pendingPvs: [], canSendBack: true,
}
const data = (over: Partial<PaymentRequestsRead> = {}): PaymentRequestsRead => ({
  rows: sortRequests([
    payrollRow(PAYROLL, { requested_at: '2026-10-29T02:00:00Z', requested_by_name: 'HR Manager' }),
    claimRow(CLAIM, DEPTS),
    ...[staff(), KHO2, SIA].map((r) => staffRequestRow(r, DEPTS)),
    statutoryRow('2026-10-01', { id: 'pv-k', voucher_no: 'HV-PV-202610-0612', payee_name: 'KWSP', amount: 18250.4, status: 'paid', payment_date: '2026-10-15' }),
  ]),
  departments: DEPTS,
  banks: [{ id: 'b-hl', bank_name: 'Hong Leong Bank', current_balance: 50000, gl_account_code: '3000' }],
  seesPayroll: true,
  today: '2026-10-29',
  can: { pay: true, sendBack: true },
  canSetDefault: true,
  ...over,
})
const draw = async (search = '', over: Partial<PaymentRequestsRead> = {}) => {
  // The address the browser shows is the screen's truth (nav.ts useStep).
  window.history.replaceState(null, '', `/fin-app/page/payment-requests${search ? `?${search}` : ''}`)
  render(
    <FinAppFrame platform="android" rows={['payments', 'payment-requests']}>
      <PaymentRequestsApp data={data(over)} search={search} />
    </FinAppFrame>,
  )
  await act(async () => undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/payment-requests')
})

describe('the phone’s Payment request', () => {
  it('opens on what waits for Finance and a card for All, Payroll, Statutory and every department', async () => {
    await draw()
    expect(screen.getByText('Waiting for you · 5 requests')).toBeInTheDocument()
    for (const card of [/^All requests/, /^Payroll/, /^Statutory/, /^Marketing/, /^Revenue Department/]) expect(screen.getByRole('button', { name: card })).toBeInTheDocument()
  })

  it('a card’s list; Select ticks the staff requests — payroll says why not — and the dark bar holds Reject and Create PV', async () => {
    mocks.forPvs.mockResolvedValue({ ok: true, groups: [[staff(), KHO2], [SIA]], canBillBack: true })
    mocks.openCreate.mockResolvedValue({ ok: false, reason: 'not read in this test' })
    await draw('f=all')
    expect(screen.getAllByText(/2 → 1 PV/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: /HR Manager/ }))
    expect(mocks.flash).toHaveBeenLastCalledWith('Payroll is funded one by one — open it to Generate PV.')
    fireEvent.click(screen.getByRole('button', { name: /^KHO WEI JIE Claude · Oct/ }))
    fireEvent.click(screen.getByRole('button', { name: /^SIA JOSIAH/ }))
    expect(screen.getByText('2 selected · RM 778.70')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create PV →' }))
    })
    expect(mocks.forPvs).toHaveBeenCalledWith([[staff().id, KHO2.id], [SIA.id]])
    expect(screen.getByRole('dialog', { name: 'Create payments' })).toBeInTheDocument()
  })

  it('Reject on the dark bar: one reason for all', async () => {
    mocks.rejectMany.mockResolvedValue({ ok: true, rejected: 2, failed: [] })
    await draw('f=dept%3Amk')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: /^KHO WEI JIE Claude · Oct/ }))
    fireEvent.click(screen.getByRole('button', { name: /^SIA JOSIAH/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const sheet = screen.getByRole('dialog', { name: 'Reject 2 requests?' })
    fireEvent.change(within(sheet).getByLabelText('Reason'), { target: { value: 'Attach the receipts' } })
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Reject 2' }))
    })
    expect(mocks.rejectMany).toHaveBeenCalledWith([staff().id, SIA.id], 'Attach the receipts')
    expect(mocks.flash).toHaveBeenCalledWith('2 requests rejected — back with their requesters')
  })

  it('a request’s own screen: the drawer’s body, Reject… and Create PV on the bar', async () => {
    await draw(`f=dept%3Amk&id=request%3A${SIA.id}`)
    expect(screen.getByText('Pay to SIA JOSIAH')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create PV' })).toBeInTheDocument()
  })

  it('a payroll’s screen: Send back to HR… and Generate PV; a Revenue claim’s: Return to HR… and Create PV', async () => {
    await draw('f=payroll&id=payroll%3Ap1')
    expect(screen.getByRole('button', { name: 'Send back to HR…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate PV' })).toBeInTheDocument()
  })

  it('a statutory voucher opens in the app’s Payments', async () => {
    await draw('f=statutory')
    fireEvent.click(screen.getByRole('button', { name: /^KWSP/ }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/payments?id=pv-k')
  })

  it('without Treasury · Create or Void / Approve: no Select', async () => {
    await draw('f=all', { can: { pay: false, sendBack: false } })
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
  })
})

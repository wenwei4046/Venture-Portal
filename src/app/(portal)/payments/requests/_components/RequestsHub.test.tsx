import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ClaimQueueRow } from '@/lib/claim-requests'
import type { PayrollRequestLine } from '@/lib/fin-app/payroll-requests-model'
import type { PaymentRequestsRead } from '../_lib/requests-read'
import { claimRow, payrollRow, requestDepartments, sortRequests } from '../_lib/requests-model'

// Payments › Payment request (2026-10-29, PR ①): Payment voucher's hub with what is sent to be paid — the cards pick
// the list (All, Payroll, every department), a row opens its drawer, a right-click its menu; a member's claim goes
// back to HR only with a reason, and only for an account that may send back.

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), flash: vi.fn(), returnClaim: vi.fn(), openInvoice: vi.fn(), raise: vi.fn() }))
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
vi.mock('../actions', () => ({ returnMemberClaim: mocks.returnClaim, openMemberClaimInvoice: mocks.openInvoice }))
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

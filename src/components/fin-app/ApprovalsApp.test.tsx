import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ApprovalHubModel, ApprovalRecordModel, ApprovalRow } from '@/lib/fin-app/approval-model'

// Daily › Approvals in the Finance phone app (2026-10-15, part 5): the hub's
// cards open their lists; Select ticks what is this reader's to decide and the
// dark bar approves it (the head's ⋯ rejects it, a reason asked); a request
// opens as its record, decided from its bar; a combined approval of vouchers is
// decided voucher by voucher. Every decision is the desktop queue's own action.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  flash: vi.fn(),
  openRequest: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  partial: vi.fn(),
  signed: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/approvals',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('@/app/(portal)/approvals/page-actions', () => ({ openApprovalRequest: mocks.openRequest }))
vi.mock('@/app/(portal)/approvals/actions', () => ({
  approveRequestsBulk: mocks.approve,
  rejectRequestsBulk: mocks.reject,
  approveRequestGroupPartial: mocks.partial,
}))
vi.mock('@/app/(portal)/payments/actions', () => ({ getAttachmentSignedUrl: mocks.signed }))

import FinAppFrame from './FinAppFrame'
import ApprovalsApp from './ApprovalsApp'
import { resetNav } from './nav'

const row = (over: Partial<ApprovalRow> & { key: string }): ApprovalRow => ({
  kind: 'single',
  id: over.key,
  groupId: null,
  title: 'Office rental',
  desc: 'Payment voucher · Carrie · 10 Oct',
  amount: 1000,
  hasAmount: true,
  items: 1,
  why: null,
  executive: false,
  hasVoucher: true,
  splittable: false,
  members: [],
  decision: null,
  types: ['payment_voucher'],
  no: null,
  ...over,
})

const PAYROLL = row({
  key: 'g:g-pay',
  kind: 'group',
  id: null,
  groupId: 'g-pay',
  title: 'Payroll disbursement Sep 2026',
  desc: 'Combined · 2 · Payment voucher × 2 · Carrie · 14 Oct',
  amount: 6000,
  splittable: true,
  members: [
    { id: 'p1', label: 'Payroll disbursement Sep 2026 — Aina', sub: 'HV-PV-202610-0480 · Payment voucher', amount: 3200, isVoucher: true, open: { hub: 'payments', id: 'v-p1' }, decision: null },
    { id: 'p2', label: 'Payroll disbursement Sep 2026 — Bala', sub: 'HV-PV-202610-0481 · Payment voucher', amount: 2800, isVoucher: true, open: { hub: 'payments', id: 'v-p2' }, decision: null },
  ],
})

const HUB: ApprovalHubModel = {
  hero: { value: 'RM 32,000.00', label: 'Pending · to approve', chip: { text: 'Oldest waiting · 5 days', tone: 'alert' } },
  cards: [
    { key: 'pending', tone: 'pending_approval', icon: 'calendar', label: 'Pending', sub: '3 items · 1 combined', value: 'RM 32,000.00' },
    { key: 'exec', tone: 'draft', icon: 'staff', label: 'Submitted by the executive', sub: '1 of the 3', value: 'RM 1,000.00' },
    { key: 'decided', tone: 'paid', icon: 'approve', label: 'Decided · 30 days', sub: '1 approved · 0 rejected', value: '1' },
  ],
  pending: [
    row({ key: 'a1', no: 'HV-PV-202610-0471', executive: true }),
    row({ key: 'a2', title: 'Loan to Carres', desc: 'New loan · Joan · 12 Oct', amount: 25000, why: 'You raised it — somebody else decides it', hasVoucher: false, types: ['new_loan'] }),
    PAYROLL,
  ],
  decided: [row({ key: 'd1', title: 'Workspace', desc: 'Approved · Payment voucher · Carrie · 13 Oct', amount: 1386, decision: 'approved' })],
  decidedCount: 1,
}

const RECORD: ApprovalRecordModel = {
  id: 'a1',
  status: 'pending',
  type: 'payment_voucher',
  typeLabel: 'Payment voucher',
  title: 'Office rental',
  no: 'HV-PV-202610-0471',
  amount: 1000,
  submittedBy: 'Carrie',
  submittedAt: '14 Oct 2026 · 09:30',
  decidedAt: null,
  notes: null,
  may: true,
  why: null,
  groupId: null,
  loan: null,
  voucher: {
    id: 'v1',
    no: 'HV-PV-202610-0471',
    credit: false,
    amount: 1000,
    payee: 'Landlord Sdn Bhd',
    payeeCompany: null,
    bank: { name: 'Hong Leong', number: '23600599248', balance: 90000 },
    short: false,
    pool: 'Venture Pool',
    description: 'Office rental Oct',
    sources: [{ pool: 'Venture Pool', account: '6200 · Rent', amount: 1000 }],
    files: [{ id: 'f1', name: 'invoice.pdf', size: 204800 }],
    upstream: null,
  },
  open: null,
}

const draw = (search = '', record: ApprovalRecordModel | null = null) =>
  render(
    <FinAppFrame platform="android" rows={['approvals', 'payments']}>
      <ApprovalsApp hub={HUB} search={search} record={record} refused={null} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/approvals')
  mocks.openRequest.mockResolvedValue({ ok: true, record: RECORD })
  mocks.approve.mockResolvedValue({ approved: 1, failed: [] })
  mocks.reject.mockResolvedValue({ rejected: 1, failed: [] })
  mocks.partial.mockResolvedValue({ ok: true })
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('Approvals on the phone', () => {
  it('opens on the hub: what waits in total, the oldest wait, a card per list', () => {
    draw()
    // The total twice: the hero's and the Pending card's (the card's list is all of it).
    expect(screen.getAllByText('RM 32,000.00')).toHaveLength(2)
    expect(screen.getByText('Pending · to approve')).toBeInTheDocument()
    expect(screen.getByText('Oldest waiting · 5 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pending 3 items · 1 combined RM 32,000\.00$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Submitted by the executive 1 of the 3 RM 1,000\.00$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Decided · 30 days 1 approved · 0 rejected 1$/ })).toBeInTheDocument()
  })

  it('Select ticks only what is yours to decide; the dark bar approves it with the desktop’s own action', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Pending/ }))
    expect(window.location.search).toBe('?f=pending')
    fireEvent.click(screen.getByRole('button', { name: 'Select to decide' }))
    // Not this reader's to decide: it says why and is not ticked.
    fireEvent.click(screen.getByRole('button', { name: /Loan to Carres/ }))
    expect(mocks.flash).toHaveBeenCalledWith('You raised it — somebody else decides it')
    fireEvent.click(screen.getByRole('button', { name: /Office rental/ }))
    fireEvent.click(screen.getByRole('button', { name: /Payroll disbursement Sep 2026/ }))
    expect(screen.getByText('2 selected · RM 7,000.00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2 →' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/This authorises every selected request for execution/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Allow dept-pool overdraw/ }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Notes' }), { target: { value: 'October run' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve 2' }))
    })
    expect(mocks.approve).toHaveBeenCalledWith({ ids: ['a1'], groupIds: ['g-pay'], notes: 'October run', allowOverdraw: true })
    expect(mocks.flash).toHaveBeenCalledWith('Approved · 2 requests')
    expect(mocks.refresh).toHaveBeenCalled()
    // Decided here, they leave the list before the server's next read.
    expect(screen.queryByRole('button', { name: /Office rental/ })).not.toBeInTheDocument()
  })

  it('the head’s ⋯ rejects what is ticked — a reason is asked first', async () => {
    window.history.replaceState(null, '', '/fin-app/page/approvals?f=pending')
    draw('f=pending')
    fireEvent.click(screen.getByRole('button', { name: 'Select to decide' }))
    fireEvent.click(screen.getByRole('button', { name: /Office rental/ }))
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reject 1…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject 1 request?' })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, reject 1' }))
    })
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please give a reason')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Rejection reason' }), { target: { value: 'Wrong month' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, reject 1' }))
    })
    expect(mocks.reject).toHaveBeenCalledWith({ ids: ['a1'], groupIds: [], notes: 'Wrong month' })
  })

  it('a request opens as its record: the voucher’s facts, its files, Approve and Reject in its bar', async () => {
    window.history.replaceState(null, '', '/fin-app/page/approvals?f=pending')
    draw('f=pending')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Office rental/ }))
    })
    expect(mocks.openRequest).toHaveBeenCalledWith('a1')
    expect(window.location.search).toBe('?id=a1&from=pending')
    expect(screen.getByText('Pay to Landlord Sdn Bhd')).toBeInTheDocument()
    expect(screen.getByText('Acct 23600599248 · Balance RM 90,000.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invoice\.pdf/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve this request?' })
    expect(within(dialog).getByText(/Approving authorises the payment for execution and records your decision/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    })
    expect(mocks.approve).toHaveBeenCalledWith({ ids: ['a1'], groupIds: [], notes: undefined, allowOverdraw: false })
    expect(mocks.flash).toHaveBeenCalledWith('Approved · HV-PV-202610-0471')
    // Back to its list, the request gone from it.
    expect(window.location.search).toBe('?f=pending')
  })

  it('a refusal stays in the sheet, in words', async () => {
    mocks.approve.mockResolvedValue({ approved: 0, failed: [{ id: '', description: 'Approval', error: 'Period Oct 2026 is closed. Contact Principal to reopen.' }] })
    window.history.replaceState(null, '', '/fin-app/page/approvals?id=a1')
    await act(async () => {
      draw('id=a1', RECORD)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Approval — Period Oct 2026 is closed. Contact Principal to reopen.')
    expect(mocks.flash).not.toHaveBeenCalled()
  })

  it('the bank short of the voucher: Approve pale, saying why', async () => {
    window.history.replaceState(null, '', '/fin-app/page/approvals?id=a1')
    await act(async () => {
      draw('id=a1', { ...RECORD, voucher: { ...RECORD.voucher!, short: true, bank: { name: 'Hong Leong', number: '23600599248', balance: 500 } } })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient bank balance — this voucher needs RM 1,000.00 but Hong Leong holds only RM 500.00.')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(mocks.flash).toHaveBeenCalledWith('Approve disabled: bank balance is below the voucher amount')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a combined approval of vouchers: each approved unless unticked, decided in one go', async () => {
    window.history.replaceState(null, '', '/fin-app/page/approvals?f=pending')
    draw('f=pending')
    fireEvent.click(screen.getByRole('button', { name: /Payroll disbursement Sep 2026/ }))
    expect(window.location.search).toBe('?g=g-pay&from=pending')
    expect(screen.getByRole('button', { name: 'Approve all 2' })).toBeInTheDocument()
    // Unticking Bala: the bar says what will happen.
    fireEvent.click(screen.getByRole('button', { name: /— Bala/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve 1, reject 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve 1, reject 1?' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Rejection reason' }), { target: { value: 'Left in September' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, decide' }))
    })
    expect(mocks.partial).toHaveBeenCalledWith({ groupId: 'g-pay', approveApprovalIds: ['p1'], rejectApprovalIds: ['p2'], approveNotes: '', rejectReason: 'Left in September' })
    expect(mocks.flash).toHaveBeenCalledWith('Approved 1 · rejected 1')
  })

  it('a member of a combined approval opens its voucher in the app', () => {
    window.history.replaceState(null, '', '/fin-app/page/approvals?g=g-pay&from=pending')
    draw('g=g-pay&from=pending')
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0])
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/payments?id=v-p1')
  })

  it('the decided list holds what its card counts, each opening its record', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Decided · 30 days/ }))
    expect(screen.getByText('1 decision')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select to decide' })).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Workspace/ }))
    })
    expect(mocks.openRequest).toHaveBeenCalledWith('d1')
  })
})

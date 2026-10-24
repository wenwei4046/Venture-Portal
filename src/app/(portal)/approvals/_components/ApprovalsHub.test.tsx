import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ApprovalRecordModel } from '@/lib/fin-app/approval-model'
import type { ApprovalHub, HubRow } from '../_lib/hub-model'

// Approvals on the computer as Finance's hub (2026-10-17 — the user, on the Principal's own view taking Finance's
// view: "make sure the approve tab is fullfill as well, cause usually i use that"): the total over a card per list,
// the table, Select and the dark bar, the drawer a row opens, a combined approval decided voucher by voucher, the
// row's right-click menu. Every decision is the queue's own Server Action, as the phone's.

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  flash: vi.fn(),
  openRequest: vi.fn(),
  batch: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  partial: vi.fn(),
  signed: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }) }
      return q
    },
  }),
}))
vi.mock('@/components/hrv/toast', async (orig) => ({ ...(await orig<object>()), flash: mocks.flash }))
vi.mock('../page-actions', () => ({ openApprovalRequest: mocks.openRequest }))
vi.mock('../actions', () => ({
  approveRequestsBulk: mocks.approve,
  rejectRequestsBulk: mocks.reject,
  approveRequestGroupPartial: mocks.partial,
  getBatchVoucherDetails: mocks.batch,
}))
vi.mock('@/app/(portal)/payments/actions', () => ({ getAttachmentSignedUrl: mocks.signed }))

import ApprovalsHub from './ApprovalsHub'

const row = (over: Partial<HubRow> & { key: string }): HubRow => ({
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
  sentBy: 'Carrie',
  on: '10 Oct',
  name: 'Landlord Sdn Bhd',
  type: 'Payment voucher',
  at: '2026-10-10T02:00:00Z',
  pool: 'Venture Pool',
  category: 'Office Rental',
  payBy: 'Bank transfer · Maybank',
  files: 0,
  ...over,
})

const RENT = row({
  key: 'a1',
  no: 'HV-PV-202610-0471',
  executive: true,
  members: [{ id: 'a1', label: 'Office rental', sub: 'HV-PV-202610-0471', amount: 1000, isVoucher: true, open: { hub: 'payments', id: 'v1' }, decision: null }],
})
const LOAN = row({ key: 'a2', name: 'Carres', title: 'Loan to Carres', type: 'New loan', amount: 25000, why: 'You raised it — somebody else decides it', hasVoucher: false, types: ['new_loan'], pool: '', category: '', payBy: '' })
const PAYROLL = row({
  key: 'g:g-pay',
  kind: 'group',
  id: null,
  groupId: 'g-pay',
  name: 'Aina + 1 more',
  title: 'Payroll disbursement Sep 2026',
  type: 'Payment voucher × 2',
  amount: 6000,
  splittable: true,
  members: [
    { id: 'p1', label: 'Payroll disbursement Sep 2026 — Aina', sub: 'HV-PV-202610-0480', amount: 3200, isVoucher: true, open: { hub: 'payments', id: 'v-p1' }, decision: null },
    { id: 'p2', label: 'Payroll disbursement Sep 2026 — Bala', sub: 'HV-PV-202610-0481', amount: 2800, isVoucher: true, open: { hub: 'payments', id: 'v-p2' }, decision: null },
  ],
})
const WORKSPACE = row({ key: 'd1', name: 'Google Asia Pacific', title: 'Workspace', amount: 1386, decision: 'approved', at: '2026-10-13T03:00:00Z' })
const HOSTEL = row({ key: 'd2', name: 'Hostel Sdn Bhd', title: 'Hostel', amount: 3450, decision: 'rejected', at: '2026-10-12T03:00:00Z' })

const HUB: ApprovalHub = {
  hero: { value: 'RM 32,000.00', label: 'Pending · to approve', chip: { text: 'Oldest waiting · 5 days', tone: 'alert' } },
  cards: [
    { key: 'pending', tone: 'pending_approval', icon: 'calendar', label: 'Pending', sub: '3 items · 1 combined', value: 'RM 32,000.00' },
    { key: 'exec', tone: 'draft', icon: 'staff', label: 'Submitted by the executive', sub: '1 of the 3', value: 'RM 1,000.00' },
    { key: 'decided', tone: 'paid', icon: 'approve', label: 'Decided · 30 days', sub: '1 approved · 1 rejected', value: '2' },
  ],
  pending: [RENT, LOAN, PAYROLL],
  decided: [WORKSPACE, HOSTEL],
  decidedCount: 2,
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
  terms: null,
  open: null,
}

const draw = (over: Partial<Parameters<typeof ApprovalsHub>[0]> = {}) => render(<ApprovalsHub hub={HUB} initialCard="pending" canSetDefault={false} {...over} />)
const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell').find((c) => c.getAttribute('data-kind') === 'name')?.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/approvals')
  mocks.openRequest.mockResolvedValue({ ok: true, record: RECORD })
  mocks.batch.mockResolvedValue([
    { approvalId: 'p1', voucherId: 'v-p1', voucherNo: 'HV-PV-202610-0480', voucherType: 'payment', amount: 3200, direction: 'debit', payeeName: 'Aina Rahman', description: 'Payroll net Sep 2026', sources: [{ pool: 'venture_pool', amount: 3200 }], attachments: [{ id: 'f9', fileName: 'payslip.pdf', fileType: 'application/pdf', uploadedAt: '2026-10-10' }] },
    { approvalId: 'p2', voucherId: 'v-p2', voucherNo: 'HV-PV-202610-0481', voucherType: 'payment', amount: 2800, direction: 'debit', payeeName: 'Bala Kumar', description: 'Payroll net Sep 2026', sources: [{ pool: 'venture_pool', amount: 2800 }], attachments: [] },
  ])
  mocks.approve.mockResolvedValue({ approved: 1, failed: [] })
  mocks.reject.mockResolvedValue({ rejected: 1, failed: [] })
  mocks.partial.mockResolvedValue({ ok: true })
})

describe('the hub', () => {
  it('opens on what waits in total, the oldest wait, and a card per list over the table of what waits', async () => {
    draw()
    await act(async () => undefined)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Approvals')
    expect(screen.getByText('Pending · to approve')).toBeInTheDocument()
    expect(screen.getByText('Oldest waiting · 5 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pending 3 items · 1 combined RM 32,000\.00$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Submitted by the executive 1 of the 3 RM 1,000\.00$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Decided · 30 days 1 approved · 1 rejected 2$/ })).toBeInTheDocument()
    expect(names()).toEqual(['Landlord Sdn Bhd', 'Carres', 'Aina + 1 more'])
    // A combined approval's request is its kind.
    expect(within(screen.getAllByRole('row')[3]).getByText('Payment voucher × 2')).toBeInTheDocument()
  })

  it('a card picks its list at once and the address keeps it; the decided list has no Select', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: /^Submitted by the executive/ }))
    expect(window.location.search).toBe('?card=exec')
    expect(names()).toEqual(['Landlord Sdn Bhd'])
    fireEvent.click(screen.getByRole('button', { name: /^Decided · 30 days/ }))
    expect(window.location.search).toBe('?card=decided')
    expect(names()).toEqual(['Google Asia Pacific', 'Hostel Sdn Bhd'])
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Pending/ }))
    expect(window.location.search).toBe('')
  })

  it('opens on the card the address named', async () => {
    draw({ initialCard: 'decided' })
    await act(async () => undefined)
    expect(names()).toEqual(['Google Asia Pacific', 'Hostel Sdn Bhd'])
  })

  it('the search finds by who is paid, the request, the number, who sent it', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.change(screen.getByPlaceholderText('Search ref #, payee, request, who…'), { target: { value: '0471' } })
    expect(names()).toEqual(['Landlord Sdn Bhd'])
    fireEvent.change(screen.getByPlaceholderText('Search ref #, payee, request, who…'), { target: { value: 'payroll' } })
    expect(names()).toEqual(['Aina + 1 more'])
  })
})

describe('Select and the dark bar', () => {
  it('ticks only what is yours to decide and approves it with the queue’s own action; decided, it leaves the list', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('row', { name: /Carres/ }))
    expect(mocks.flash).toHaveBeenCalledWith('You raised it — somebody else decides it')
    fireEvent.click(screen.getByRole('row', { name: /Landlord Sdn Bhd/ }))
    fireEvent.click(screen.getByRole('row', { name: /Aina \+ 1 more/ }))
    expect(screen.getByText('2 selected · RM 7,000.00')).toBeInTheDocument()
    expect(screen.getByText('1 combined request — decided whole')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2 →' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve 2 requests?' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Allow dept-pool overdraw/ }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Notes' }), { target: { value: 'October run' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve 2' }))
    })
    expect(mocks.approve).toHaveBeenCalledWith({ ids: ['a1'], groupIds: ['g-pay'], notes: 'October run', allowOverdraw: true })
    expect(mocks.flash).toHaveBeenCalledWith('Approved · 2 requests')
    expect(mocks.refresh).toHaveBeenCalled()
    expect(names()).toEqual(['Carres'])
    expect(screen.queryByText(/selected ·/)).toBeNull()
  })

  it('Reject… asks a reason before it sends', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('row', { name: /Landlord Sdn Bhd/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject…' }))
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
})

describe('the drawer', () => {
  it('a request opens as its page shows it, decided from its bar', async () => {
    draw()
    await act(async () => {
      fireEvent.click(screen.getByRole('row', { name: /Landlord Sdn Bhd/ }))
    })
    expect(mocks.openRequest).toHaveBeenCalledWith('a1')
    const drawer = screen.getByRole('dialog', { name: 'HV-PV-202610-0471' })
    expect(within(drawer).getByText('Pay to Landlord Sdn Bhd')).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: 'View full page ↗' })).toHaveAttribute('href', '/approvals/a1')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve this request?' })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    })
    expect(mocks.approve).toHaveBeenCalledWith({ ids: ['a1'], groupIds: [], notes: undefined, allowOverdraw: false })
    expect(mocks.flash).toHaveBeenCalledWith('Approved · HV-PV-202610-0471')
    expect(names()).toEqual(['Carres', 'Aina + 1 more'])
  })

  it('its ⋯ opens the voucher behind it', async () => {
    draw()
    await act(async () => {
      fireEvent.click(screen.getByRole('row', { name: /Landlord Sdn Bhd/ }))
    })
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Open the voucher' }))
    expect(mocks.push).toHaveBeenCalledWith('/payments/v1')
  })

  it('a combined approval of vouchers: who each pays, each approved unless turned to Reject, decided in one go', async () => {
    draw()
    await act(async () => {
      fireEvent.click(screen.getByRole('row', { name: /Aina \+ 1 more/ }))
    })
    expect(mocks.batch).toHaveBeenCalledWith('g-pay')
    const drawer = screen.getByRole('dialog', { name: 'Combined · 2' })
    expect(within(drawer).getByText('Aina Rahman')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /payslip\.pdf/ })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Approve all 2' })).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Approve HV-PV-202610-0481' }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Approve 1, reject 1' }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve 1, reject 1?' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Rejection reason' }), { target: { value: 'Left in September' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, decide' }))
    })
    expect(mocks.partial).toHaveBeenCalledWith({ groupId: 'g-pay', approveApprovalIds: ['p1'], rejectApprovalIds: ['p2'], approveNotes: '', rejectReason: 'Left in September' })
    expect(mocks.flash).toHaveBeenCalledWith('Approved 1 · rejected 1')
    expect(names()).toEqual(['Landlord Sdn Bhd', 'Carres'])
  })

  it('opens at once on the combined approval the address named (?group_id=, Payroll’s "Open Approvals →")', async () => {
    window.history.replaceState(null, '', '/approvals?group_id=g-pay')
    draw({ initialOpen: 'g:g-pay' })
    await act(async () => undefined)
    expect(mocks.batch).toHaveBeenCalledWith('g-pay')
    expect(screen.getByRole('dialog', { name: 'Combined · 2' })).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('a decided request has no bar to decide it again', async () => {
    mocks.openRequest.mockResolvedValue({ ok: true, record: { ...RECORD, id: 'd1', status: 'approved', may: true } })
    draw({ initialCard: 'decided' })
    await act(async () => {
      fireEvent.click(screen.getByRole('row', { name: /Google Asia Pacific/ }))
    })
    expect(mocks.openRequest).toHaveBeenCalledWith('d1')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })
})

describe('the row’s right-click menu', () => {
  it('opens it, its full page, its voucher, or ticks it to decide', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    draw()
    await act(async () => undefined)
    fireEvent.contextMenu(screen.getByRole('row', { name: /Landlord Sdn Bhd/ }))
    const menu = screen.getByRole('menu', { name: /HV-PV-202610-0471 · Waiting/ })
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Open', 'Open full page in new tab', 'Open the voucher', 'Tick to decide'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Open the voucher' }))
    expect(open).toHaveBeenCalledWith('/payments/v1', '_blank', 'noopener,noreferrer')
    fireEvent.contextMenu(screen.getByRole('row', { name: /Landlord Sdn Bhd/ }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Tick to decide' }))
    expect(screen.getByText('1 selected · RM 1,000.00')).toBeInTheDocument()
    open.mockRestore()
  })

  it('offers no tick on what is not yours to decide', async () => {
    draw()
    await act(async () => undefined)
    fireEvent.contextMenu(screen.getByRole('row', { name: /Carres/ }))
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Tick to decide' })).toBeNull()
  })
})

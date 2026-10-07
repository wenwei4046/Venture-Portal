import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { buildQueueRows, type ApprovalRequestRow } from '@/lib/approval-queue'

// 2026-10-07 — the pending queue as a table (user approved the Approvals
// sample: "英文 排队用表格不错，但把 description 和 pv no 分开"; on the phone
// "我注重是看 amount，description 这些，而且这个是 principal 会 approve 吧").

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  approveRequestsBulk: vi.fn(),
  rejectRequestsBulk: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))
vi.mock('../actions', () => ({
  approveRequestsBulk: mocks.approveRequestsBulk,
  rejectRequestsBulk: mocks.rejectRequestsBulk,
}))
vi.mock('./BatchDetailsModal', () => ({
  default: (p: { groupId: string; open: boolean; actionable?: boolean; contextItems?: unknown[] }) => (
    <div data-testid="batch-modal" data-group={p.groupId} data-open={String(p.open)} data-actionable={String(!!p.actionable)}>
      {JSON.stringify(p.contextItems ?? [])}
    </div>
  ),
}))

import PendingApprovals, { type PendingRow } from './PendingApprovals'

const at = (day: number, hour = 10, minute = 0) => new Date(2026, 9, day, hour, minute, 0).toISOString()
const request = (over: Partial<ApprovalRequestRow> & { id: string }): ApprovalRequestRow => ({
  request_type: 'payment_voucher',
  description: null,
  amount: null,
  reference_id: null,
  reference_table: 'payment_vouchers',
  submitted_by: 'fm',
  group_id: null,
  created_at: at(2),
  approved_at: null,
  status: 'pending',
  ...over,
})
const names: Record<string, string> = { fm: 'Finance Manager', ex: 'ONG MEI SHUANG' }
const queue = buildQueueRows(
  [
    request({ id: 'a', description: 'HV-PV-202610-0449: Loan Repayment - 5rd Installment', amount: 11800, reference_id: 'v449', created_at: at(2, 10, 12) }),
    request({ id: 'b', description: "HV-PV-202610-0471: Office Rental- E2803A - Oct'26", amount: 6000, reference_id: 'v471', submitted_by: 'ex', created_at: at(6, 11, 20) }),
    request({ id: 'c', description: 'HV-PV-202610-0475: Loan disbursement to 2990', amount: 40000, reference_id: 'v475', group_id: 'grp', created_at: at(7, 9, 31) }),
    request({ id: 'd', request_type: 'new_loan', description: 'New loan to 2990', amount: 40000, reference_id: 'loan1', reference_table: 'loans', group_id: 'grp', created_at: at(7, 9, 31) }),
  ],
  { amountOf: (r) => (r.amount === null ? null : Number(r.amount)), nameOf: (id) => names[id] ?? 'Unknown' },
)
const rows: PendingRow[] = queue.map((r) => ({ ...r, pool: r.key === 'b' ? 'Venture Pool' : 'Director Pool', category: r.key === 'b' ? 'Office Rental' : 'Loan' }))

function desktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}
const bodyRows = () => Array.from(document.querySelectorAll('tbody tr:not(.lt-detail)')) as HTMLElement[]
const cells = (tr: HTMLElement) => Array.from(tr.querySelectorAll('td:not(.lt-toggle)')).map((td) => td.textContent?.trim())
const tick = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }))
const bar = () => document.querySelector('.bulk-bar') as HTMLElement | null
const settle = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  vi.clearAllMocks()
  desktop(true)
  mocks.approveRequestsBulk.mockResolvedValue({ approved: 3, failed: [] })
  mocks.rejectRequestsBulk.mockResolvedValue({ rejected: 1, failed: [] })
})

describe('the pending queue', () => {
  it('is a table: number and text apart, the type as a tag, who sent it and when, the amount', () => {
    render(<PendingApprovals rows={rows} />)
    expect(Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent?.replace(/[↕▲▼]/g, '').trim())).toEqual([
      '', 'Voucher #', 'Description', 'Type', 'By', 'Submitted', 'Amount', '', '',
    ])
    const [, no, description, type, by, submitted, amount, open] = cells(bodyRows()[0])
    expect([no, type, by, submitted, amount, open]).toEqual(['HV-PV-202610-0449', 'Payment voucher', 'Finance Manager', '2 Oct 10:12', 'RM 11,800.00', 'Open →'])
    expect(description).toMatch(/^Loan Repayment - 5rd Installment/)
    // The phone's small print sits in the description cell, hidden on the desktop.
    expect(bodyRows()[0].querySelector('.q-sub')).toHaveClass('md:hidden')
    expect(within(bodyRows()[0]).getByRole('link', { name: 'HV-PV-202610-0449' })).toHaveAttribute('href', '/approvals/a')
    expect(within(bodyRows()[0]).getByRole('link', { name: 'Open →' })).toHaveAttribute('href', '/approvals/a')
    expect(document.querySelector('.sect-head')).toHaveTextContent('Pending')
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('3 ITEMS')
    expect(document.querySelector('tfoot')).toHaveTextContent('3 items waiting')
    expect(document.querySelector('tfoot')).toHaveTextContent('RM 57,800.00')
  })

  it('folds a combined approval into one row, tagged, that opens its details rather than a page', () => {
    render(<PendingApprovals rows={rows} />)
    const combo = bodyRows()[2]
    expect(combo).toHaveTextContent('HV-PV-202610-0475')
    expect(within(combo).getByText('Combined · 2')).toBeInTheDocument()
    expect(combo).toHaveTextContent('Loan disbursement to 2990 — approved together with New loan to 2990')
    expect(within(combo).getByText('New loan + PV')).toBeInTheDocument()
    expect(combo).toHaveTextContent('RM 40,000.00')
    expect(within(combo).queryByRole('link', { name: 'Open →' })).toBeNull()
    fireEvent.click(within(combo).getByRole('button', { name: 'Open →' }))
    const modal = screen.getByTestId('batch-modal')
    expect(modal).toHaveAttribute('data-group', 'grp')
    expect(modal).toHaveAttribute('data-open', 'true')
    expect(modal).toHaveAttribute('data-actionable', 'false') // a loan rides along: whole or nothing
    expect(modal).toHaveTextContent('New loan to 2990')
  })

  it('counts what is ticked in the section head, colours the row, and offers the bar', () => {
    render(<PendingApprovals rows={rows} />)
    expect(bar()).toBeNull()
    tick(/Select HV-PV-202610-0471/)
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('3 ITEMS · 1 SELECTED')
    expect(bodyRows()[1]).toHaveClass('st-selected')
    expect(bodyRows()[0]).not.toHaveClass('st-selected')
    expect(bar()).toHaveTextContent('1 selected')
    expect(bar()).toHaveTextContent('RM 6,000.00')
    expect(within(bar()!).getByRole('button', { name: 'Approve 1 →' })).toBeInTheDocument()
    expect(within(bar()!).getByRole('button', { name: 'Reject…' })).toBeInTheDocument()
  })

  it('select-all takes the combined row too, and approving sends singles and groups apart', async () => {
    render(<PendingApprovals rows={rows} />)
    tick(/Select all 3/)
    expect(bar()).toHaveTextContent('3 selected')
    expect(bar()).toHaveTextContent('RM 57,800.00')
    fireEvent.click(screen.getByRole('button', { name: 'Approve 3 →' }))
    expect(bar()).toHaveTextContent('Approve 3 requests?')
    fireEvent.change(screen.getByPlaceholderText(/Notes for the audit trail/), { target: { value: 'Batch of the week' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Allow dept-pool overdraw/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve 3' }))
    await settle()
    expect(mocks.approveRequestsBulk).toHaveBeenCalledWith({ ids: ['a', 'b'], groupIds: ['grp'], notes: 'Batch of the week', allowOverdraw: true })
    expect(screen.getByText('Approved 3 requests.')).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalled()
    expect(bar()).toBeNull()
  })

  it('rejecting what is ticked needs a reason, then runs the sweep with it', async () => {
    render(<PendingApprovals rows={rows} />)
    tick(/Select HV-PV-202610-0449/)
    fireEvent.click(screen.getByRole('button', { name: 'Reject…' }))
    expect(bar()).toHaveTextContent('Reject 1 request?')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reject 1' }))
    expect(mocks.rejectRequestsBulk).not.toHaveBeenCalled()
    expect(bar()).toHaveTextContent('Please give a reason')
    fireEvent.change(screen.getByPlaceholderText(/Rejection reason/), { target: { value: 'Wrong month' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, reject 1' }))
    await settle()
    expect(mocks.rejectRequestsBulk).toHaveBeenCalledWith({ ids: ['a'], groupIds: [], notes: 'Wrong month' })
    expect(screen.getByText('Rejected 1 request.')).toBeInTheDocument()
  })

  it('on a phone, a row is the description with its small print and the amount; the arrow opens the rest', () => {
    desktop(false)
    render(<PendingApprovals rows={rows} />)
    const first = bodyRows()[0]
    // The small print under the description: the number, then who and when.
    const description = first.querySelectorAll('td')[2]
    expect(description).toHaveTextContent('HV-PV-202610-0449')
    expect(description).toHaveTextContent('Finance Manager')
    expect(description).toHaveTextContent('2 Oct')
    fireEvent.click(within(first).getByRole('button', { name: '展开明细' }))
    const panel = document.querySelector('tr.lt-detail') as HTMLElement
    for (const term of ['Type', 'Pool', 'Category', 'Submitted']) expect(within(panel).getByText(term)).toBeInTheDocument()
    expect(panel).toHaveTextContent('Director Pool')
    expect(panel).toHaveTextContent('Loan')
    fireEvent.click(within(panel).getByText('Open the voucher →'))
    expect(mocks.push).toHaveBeenCalledWith('/approvals/a')
  })

  it('says so when nothing is waiting', () => {
    render(<PendingApprovals rows={[]} />)
    expect(screen.getByText('All caught up.')).toBeInTheDocument()
    expect(document.querySelector('.sect-head .count')).toHaveTextContent('0 ITEMS')
  })
})

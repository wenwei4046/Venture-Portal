import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminMemberData } from '@/lib/member/server'
import type { RequestFacts } from '@/lib/member/member-services'

// Member services › Request reviews (2026-10-10, the HR revamp): the list
// beside the open request; Accept puts an applicant on the waiting list with
// or without a note; returning or rejecting says why; a claim is decided once,
// into payroll or as a payment; the history says who.

const action = vi.hoisted(() => vi.fn())
vi.mock('@/app/(member)/member/actions', () => ({ adminMemberAction: action }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))

import RequestReviews from './RequestReviews'

const FAIR = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const base: AdminMemberData = {
  canManageRequests: true, canPublishMemos: true, canConfigureProducts: false,
  departments: [{ id: FAIR, name: 'Fair', capacity: 28, occupied: 28, reserved: 0 }],
  memos: [], products: [], candidates: [], titles: [], uplines: [], events: [],
  requests: [
    { id: 'wait', kind: 'waiting', title: 'Siti Aisyah · Waiting List', status: 'submitted', createdAt: '2026-10-08T00:00:00Z', requestNo: 'RQ-2610-021',
      detail: { subDepartmentId: FAIR, department: 'Fair', newPerson: 'Siti Aisyah', contact: '019-880 3312', start: '2026-11-02', signature: 'Siti Aisyah' } },
    { id: 'claim', kind: 'claim', title: 'Outstation claim · Kuantan', status: 'submitted', createdAt: '2026-10-07T00:00:00Z', requestNo: 'RQ-2610-020', claimId: 'c1',
      detail: { subDepartmentId: FAIR, category: 'Outstation 住宿', amount: 480, location: 'Kuantan', start: '2026-10-02', end: '2026-10-05' } },
    { id: 'amelia', kind: 'waiting', title: 'x', status: 'waiting', createdAt: '2026-09-09T00:00:00Z', requestNo: 'RQ-2609-012',
      detail: { subDepartmentId: FAIR, department: 'Fair', newPerson: 'Amelia Tan' } },
  ],
}
const facts: Record<string, RequestFacts> = {
  wait: { submittedBy: 'KAR JUN', original: null, successor: null, target: null, acceptedAt: null, events: [{ to: 'submitted', at: '2026-10-08T02:00:00Z', note: null, by: 'KAR JUN' }] },
  claim: { submittedBy: 'ADRIAN', original: null, successor: null, target: null, acceptedAt: null, events: [] },
  amelia: { submittedBy: 'CHEA HUAN', original: null, successor: null, target: null, acceptedAt: '2026-09-10T02:00:00Z', events: [] },
}

function show(over: Partial<AdminMemberData> = {}, initial: string | null = null) {
  return render(<RequestReviews data={{ ...base, ...over }} facts={facts} initialRequestId={initial} />)
}
const detail = () => screen.getByRole('region', { name: 'Request' })

beforeEach(() => {
  action.mockReset().mockResolvedValue({ ok: true, data: {} })
  flash.mockReset()
})
afterEach(cleanup)

describe('RequestReviews', () => {
  it('lists every request with its kind, number and status, and opens the first', () => {
    show()
    const rows = within(screen.getByRole('heading', { name: 'Requests' }).closest('section')!).getAllByRole('button', { pressed: undefined })
    expect(rows.some(b => b.textContent?.includes('Siti Aisyah · Waiting List'))).toBe(true)
    expect(screen.getByText('Waiting list · RQ-2610-021')).toBeInTheDocument()
    expect(detail()).toHaveTextContent('Accept onto the waiting list')
    expect(detail()).toHaveTextContent('Submitted by')
    expect(detail()).toHaveTextContent('KAR JUN')
  })

  it('filters by kind', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(screen.queryByText('Waiting list · RQ-2610-021')).toBeNull()
    expect(screen.getByText('Claim · RQ-2610-020')).toBeInTheDocument()
  })

  it('accepts an applicant without a note — the record says why', async () => {
    show()
    await act(async () => {
      fireEvent.click(within(detail()).getByRole('button', { name: 'Accept' }))
    })
    expect(action).toHaveBeenCalledWith({ action: 'qualify', requestId: 'wait', note: 'Accepted onto the waiting list.' })
    expect(flash).toHaveBeenCalledWith('Siti Aisyah accepted onto Fair’s waiting list')
  })

  it('asks for a note before returning or rejecting', async () => {
    show()
    await act(async () => {
      fireEvent.click(within(detail()).getByRole('button', { name: 'Reject' }))
    })
    expect(action).not.toHaveBeenCalled()
    expect(within(detail()).getByRole('alert')).toHaveTextContent('Write a review note first — it goes on the record.')
    fireEvent.change(within(detail()).getByPlaceholderText(/Explain requests/), { target: { value: 'Not eligible yet' } })
    await act(async () => {
      fireEvent.click(within(detail()).getByRole('button', { name: 'Reject' }))
    })
    expect(action).toHaveBeenCalledWith({ action: 'reject', requestId: 'wait', note: 'Not eligible yet' })
  })

  it('decides a claim once — into payroll without a note', async () => {
    show({}, 'claim')
    expect(detail()).toHaveTextContent('Decide the claim')
    expect(detail()).toHaveTextContent('RM 480.00')
    await act(async () => {
      fireEvent.click(within(detail()).getByRole('button', { name: 'Approve · add to payroll' }))
    })
    expect(action).toHaveBeenCalledWith({ action: 'approve', route: 'payroll', requestId: 'claim', note: '' })
    expect(flash).toHaveBeenCalledWith('Claim approved — added to payroll')
  })

  it('says where an approved claim’s money comes from', () => {
    show({ requests: [{ ...base.requests[1], status: 'approved', payout: { route: 'payment', payrollMonth: null, voucherNo: null, voucherStatus: null } }] }, 'claim')
    expect(detail()).toHaveTextContent('Payment requested — waiting for Finance')
    expect(within(detail()).queryByRole('button', { name: 'Approve · add to payroll' })).toBeNull()
  })

  it('sends an accepted applicant to Sales Groups', () => {
    show({}, 'amelia')
    expect(detail()).toHaveTextContent('On the waiting list')
    expect(within(detail()).getByRole('link', { name: 'Open the waiting list →' })).toHaveAttribute('href', '/revenue/fair/hierarchy?tab=waiting')
  })

  it('shows the refusal and keeps the request open', async () => {
    action.mockResolvedValue({ ok: false, error: 'This action requires an open request and an explanation' })
    show()
    fireEvent.change(within(detail()).getByPlaceholderText(/Explain requests/), { target: { value: 'More detail' } })
    await act(async () => {
      fireEvent.click(within(detail()).getByRole('button', { name: 'Request more information' }))
    })
    expect(within(detail()).getByRole('alert')).toHaveTextContent('This action requires an open request and an explanation')
    expect(flash).not.toHaveBeenCalled()
  })
})

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminMemberData } from '@/lib/member/server'
import type { RequestFacts } from '@/lib/member/member-services'
import type { MemberRequest } from '@/lib/member/types'

// Member services › Request reviews (2026-10-10, the HR revamp): the list
// beside the open request; Accept puts an applicant on the waiting list with
// or without a note; returning or rejecting says why; a claim is decided once,
// into payroll or as a payment; the history says who.

const action = vi.hoisted(() => vi.fn())
vi.mock('@/app/(member)/member/actions', () => ({ adminMemberAction: action }))
const flash = vi.fn()
vi.mock('@/components/hrv/toast', () => ({ flash: (m: string) => flash(m) }))
const replacement = vi.hoisted(() => ({ schedule: vi.fn(), unschedule: vi.fn() }))
vi.mock('../replacement-actions', () => ({ scheduleReplacement: replacement.schedule, unscheduleReplacement: replacement.unschedule }))

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
  replacement.schedule.mockReset().mockResolvedValue({ ok: true, ran: false })
  replacement.unschedule.mockReset().mockResolvedValue({ ok: true })
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

  describe('a replacement (HR revamp 4b)', () => {
    const KAR = '727f336a-e761-4cec-8ef0-390e7626348d'
    const ADRIAN = '61b4c495-6b7d-442d-a391-31fe4cbe2d6a'
    const ZACK = 'e35753f5-e58d-48e8-909a-19e26ab7ef2e'
    const REV = 'dep-revenue'
    const repl = (over: Record<string, unknown> = {}, status = 'submitted'): MemberRequest => ({
      id: 'repl', kind: 'replacement', title: 'x', status, createdAt: '2026-10-09T00:00:00Z', requestNo: 'RQ-2610-022',
      detail: { subDepartmentId: FAIR, department: 'Fair', originalStaffId: KAR, destination: 'resignation', replacementSource: 'new', newPerson: 'ADRIAN', effective: '2099-12-31', reason: 'Leaving', ...over },
    })
    const people = {
      candidates: [
        { id: KAR, name: 'KAR JUN', departmentId: REV, titleId: 't-ta' },
        { id: ADRIAN, name: 'ADRIAN', departmentId: REV, titleId: 't-srs' },
        { id: ZACK, name: 'ZACK', departmentId: REV, titleId: 't-rs' },
      ],
      titles: [
        { id: 't-ta', name: 'Team Assistant', departmentId: REV, subDepartmentIds: [] },
        { id: 't-srs', name: 'Senior Revenue Specialist', departmentId: REV, subDepartmentIds: [] },
        { id: 't-rs', name: 'Revenue Specialist', departmentId: REV, subDepartmentIds: [] },
      ],
    }
    const replFacts = (over: Partial<RequestFacts> = {}): Record<string, RequestFacts> => ({
      ...facts, repl: { submittedBy: 'STANLEY', original: 'KAR JUN', successor: null, target: null, acceptedAt: null, events: [], ...over },
    })
    const showRepl = (request: MemberRequest, f = replFacts()) =>
      render(<RequestReviews data={{ ...base, ...people, requests: [request] }} facts={f} initialRequestId="repl" />)
    const seat = (name: string) => within(detail()).getByRole('radio', { name: new RegExp(`^${name}`) })

    it('starts on the person the member named and their date, and schedules who takes the seat', async () => {
      showRepl(repl())
      expect(detail()).toHaveTextContent('Approve and choose the replacement')
      expect(detail()).toHaveTextContent('KAR JUN is deactivated and the new person is added.')
      expect(seat('ADRIAN')).toHaveAttribute('aria-checked', 'true')
      expect(seat('ADRIAN')).toHaveTextContent('Senior Revenue Specialist')
      expect(within(detail()).queryByRole('radio', { name: /^KAR JUN/ })).toBeNull()
      expect(detail()).toHaveTextContent('Scheduled — the system replaces them on 31 Dec 2099.')
      fireEvent.click(seat('ZACK'))
      expect(seat('ZACK')).toHaveAttribute('aria-checked', 'true')
      fireEvent.change(within(detail()).getByLabelText('Effective date'), { target: { value: '2099-11-30' } })
      await act(async () => {
        fireEvent.click(within(detail()).getByRole('button', { name: 'Approve · replace on 30 Nov 2099' }))
      })
      expect(replacement.schedule).toHaveBeenCalledWith({ requestId: 'repl', successorId: ZACK, effective: '2099-11-30', note: '' })
      expect(flash).toHaveBeenCalledWith('Scheduled for 30 Nov 2099 — the system replaces them then')
    })

    it('releases the seat, and replaces at once when the date has come', async () => {
      replacement.schedule.mockResolvedValue({ ok: true, ran: true })
      showRepl(repl({ effective: '2020-01-02' }))
      expect(detail()).toHaveTextContent('That date has come, so the change happens as soon as you approve.')
      fireEvent.click(seat('No replacement · release the seat'))
      await act(async () => {
        fireEvent.click(within(detail()).getByRole('button', { name: 'Approve · replace on 2 Jan 2020' }))
      })
      expect(replacement.schedule).toHaveBeenCalledWith({ requestId: 'repl', successorId: null, effective: '2020-01-02', note: '' })
      expect(flash).toHaveBeenCalledWith('Replaced — KAR JUN deactivated')
    })

    it('shows the database’s refusal in its own words', async () => {
      replacement.schedule.mockResolvedValue({ ok: false, reason: 'Fair is full: 28 places, and this replacement would make 29.' })
      showRepl(repl())
      await act(async () => {
        fireEvent.click(within(detail()).getByRole('button', { name: 'Approve · replace on 31 Dec 2099' }))
      })
      expect(within(detail()).getByRole('alert')).toHaveTextContent('Fair is full: 28 places, and this replacement would make 29.')
      expect(flash).not.toHaveBeenCalled()
    })

    it('says what a scheduled one will do, shows the hourly run’s refusal, and takes it off the schedule', async () => {
      showRepl(
        { ...repl({}, 'scheduled'), note: 'Could not run on 11 Oct 2026: Fair is full: 28 places, and this replacement would make 29.' },
        replFacts({ successor: 'ADRIAN', effectiveOn: '2099-12-31', events: [{ to: 'scheduled', at: '2026-10-10T05:00:00Z', note: null, by: 'HR' }] }),
      )
      expect(detail()).toHaveTextContent('On 31 Dec 2099 the system deactivates KAR JUN and adds ADRIAN to Fair.')
      expect(within(detail()).getByRole('alert')).toHaveTextContent('Could not run on 11 Oct 2026: Fair is full')
      expect(detail()).toHaveTextContent('Approved · replaced by ADRIAN on 31 Dec 2099')
      expect(within(detail()).queryByRole('radio')).toBeNull()
      await act(async () => {
        fireEvent.click(within(detail()).getByRole('button', { name: 'Take off the schedule →' }))
      })
      expect(replacement.unschedule).toHaveBeenCalledWith('repl')
      expect(flash).toHaveBeenCalledWith('Taken off the schedule — back to Pending review')
    })

    it('says why a scheduled one could not be taken off the schedule', async () => {
      replacement.unschedule.mockResolvedValue({ ok: false, reason: 'Only a scheduled replacement can be taken off the schedule' })
      showRepl(repl({}, 'scheduled'), replFacts({ successor: 'ADRIAN', effectiveOn: '2099-12-31' }))
      await act(async () => {
        fireEvent.click(within(detail()).getByRole('button', { name: 'Take off the schedule →' }))
      })
      expect(within(detail()).getByRole('alert')).toHaveTextContent('Only a scheduled replacement can be taken off the schedule')
      expect(flash).not.toHaveBeenCalled()
    })

    it('sends a completed one to the record it changed', () => {
      showRepl(repl({}, 'executed'))
      expect(detail()).toHaveTextContent('Replaced automatically. See People Management for the deactivated record.')
      expect(within(detail()).getByRole('link', { name: 'Open People Management →' })).toHaveAttribute('href', '/team/people')
      cleanup()
      showRepl(repl({ destination: 'member_exit' }, 'executed'))
      expect(within(detail()).getByRole('link', { name: 'Open Sales Groups →' })).toHaveAttribute('href', '/revenue/fair/hierarchy')
    })
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

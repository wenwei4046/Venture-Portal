import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIRING_BOARD } from '@/test/hiring-board'
import type { ReviewFilter } from '@/lib/hiring/view'

const actions = vi.hoisted(() => ({
  acknowledgeHiringRequest: vi.fn(),
  requestHiringInfo: vi.fn(),
  declineHiringRequest: vi.fn(),
  hiringFileLink: vi.fn(),
}))
const { push, flash } = vi.hoisted(() => ({ push: vi.fn(), flash: vi.fn() }))
vi.mock('@/lib/hiring/actions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/hrv/toast', () => ({ flash }))

import RequestInbox from './RequestInbox'

function Inbox({ canApprove = true, board = HIRING_BOARD }: { canApprove?: boolean; board?: typeof HIRING_BOARD }) {
  const [filter, setFilter] = useState<ReviewFilter>('pending')
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <RequestInbox board={board} filter={filter} onFilter={setFilter} selected={selected} onSelect={setSelected}
      onNewRequest={() => {}} canCreate canApprove={canApprove} />
  )
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true })
  push.mockReset()
  flash.mockReset()
})
afterEach(cleanup)

// The handoff's review inbox (Revenue App.dc.html rvVals): Pending, Info
// requested, Declined; Acknowledge needs an owner, the other two a note.
describe('Hiring › Requests — the review inbox', () => {
  it('lists the pending requests and opens the first', () => {
    render(<Inbox />)
    const filters = within(screen.getByRole('group', { name: 'Which requests' })).getAllByRole('button')
    expect(filters.map(b => b.textContent)).toEqual(['Pending 2', 'Info requested 0', 'Declined 0'])
    expect(screen.getByText('From Kar Jun · Revenue · submitted 9 Oct 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Account Executive'))
    expect(screen.getByText('From Jason Ong · Finance · submitted 6 Oct 2026')).toBeInTheDocument()
  })

  it('Acknowledge asks for an owner first, then hands the request to them', async () => {
    render(<Inbox />)
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    expect(screen.getByText('Pick the owner first.')).toBeInTheDocument()
    expect(actions.acknowledgeHiringRequest).not.toHaveBeenCalled()

    const owner = screen.getByText('Owner').closest('label')!.querySelector('select')!
    expect([...owner.options].map(o => o.text)).toEqual(['Choose…', 'Grace Lim', 'Nurul Huda'])
    fireEvent.change(owner, { target: { value: 'nurul' } })
    fireEvent.change(screen.getByPlaceholderText('Add a note'), { target: { value: 'Posting on JobStreet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(actions.acknowledgeHiringRequest).toHaveBeenCalledWith('HR-205', 'nurul', 'Posting on JobStreet'))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('HR-205 acknowledged · Nurul Huda owns it'))
  })

  it('Request more info and Decline each need a note', async () => {
    render(<Inbox />)
    fireEvent.click(screen.getByRole('button', { name: 'Request more info' }))
    expect(screen.getByText('Write what you need from the requester.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.getByText('Give a reason for declining.')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Add a note'), { target: { value: 'Budget is frozen' } })
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(actions.declineHiringRequest).toHaveBeenCalledWith('HR-205', 'Budget is frozen'))
  })

  it('says why the database refused', async () => {
    actions.requestHiringInfo.mockResolvedValue({ ok: false, reason: 'Only a pending request can ask for more information' })
    render(<Inbox />)
    fireEvent.change(screen.getByPlaceholderText('Add a note'), { target: { value: 'Which outlet?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request more info' }))
    expect(await screen.findByText('Only a pending request can ask for more information')).toBeInTheDocument()
  })

  it('a declined request may be reconsidered, not declined again', () => {
    const board = { ...HIRING_BOARD, requests: HIRING_BOARD.requests.map(r => (r.id === 'HR-204' ? { ...r, status: 'declined' as const } : r)) }
    render(<Inbox board={board} />)
    fireEvent.click(screen.getByRole('button', { name: /^Declined/ }))
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Request more info' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled()
  })

  it('without Hiring · Approve there is nothing to decide, only the full page', () => {
    render(<Inbox canApprove={false} />)
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open full page' }))
    expect(push).toHaveBeenCalledWith('/hiring/requests/HR-205')
  })

  it('an empty filter says so', () => {
    render(<Inbox />)
    fireEvent.click(screen.getByRole('button', { name: /^Info requested/ }))
    expect(screen.getByText('Nothing waiting.')).toBeInTheDocument()
    expect(screen.getByText('Pick a request on the left.')).toBeInTheDocument()
  })
})

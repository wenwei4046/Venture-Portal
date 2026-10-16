import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { protoRooms } from '@/components/member/app/fixtures/proto-rooms'

// Profile › Admin › Meeting Rooms in the Finance phone app (2026-10-15, part
// E3): the Revenue app's Book a room (the user: "Book a Room 点进去的设计是一样的")
// under the portal's own actions — the week read with the page, a booking as
// the account (source 'portal', a Revenue sub-department as itself), a cancel
// in two taps, View as a person reading only.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), read: vi.fn(), book: vi.fn(), cancel: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/rooms',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
// Book a room's state reads `ask` / `settleRead` from the Revenue app's source, whose module names the member's own actions.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/rooms/actions', () => ({ readRoomsWeek: mocks.read, bookRoom: mocks.book, cancelBooking: mocks.cancel }))

import FinAppFrame from './FinAppFrame'
import RoomsApp, { PORTAL_ROOMS } from './RoomsApp'
import { resetNav } from './nav'

type Props = Partial<Parameters<typeof RoomsApp>[0]>
const draw = (over: Props = {}) =>
  render(
    <FinAppFrame platform="android" rows={[]}>
      <RoomsApp today="2026-10-10" initial={protoRooms()} message={null} canBook readOnly={false} {...over} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/rooms')
})
afterEach(() => vi.clearAllMocks())

describe('Meeting Rooms on the phone — the Revenue app’s Book a room', () => {
  it('opens on the week read with the page, in the Revenue app’s own frame, reading nothing more', () => {
    const { container } = draw()
    expect(container.querySelector('[data-revenue-app]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Meeting rooms' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Meeting Room 1' })).getByText('Fair weekly sync')).toBeInTheDocument()
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('a meeting of one’s own cancels in two taps through the portal’s action, and the week is read again', async () => {
    mocks.cancel.mockResolvedValue({ ok: true, title: 'Client · Mid Valley booth', room: 'Meeting Room 4' })
    const again = protoRooms()
    mocks.read.mockResolvedValue({ ok: true, range: again.range, people: again.people })
    draw()
    fireEvent.click(screen.getByRole('button', { name: /Client · Mid Valley booth/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel meeting' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tap again to cancel' }))
    })
    expect(mocks.cancel).toHaveBeenCalledWith('BK-306')
    expect(mocks.read).toHaveBeenCalledWith('2026-10-10', '2026-10-16')
  })

  it('somebody else’s meeting says who may cancel it', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /Fair weekly sync/ }))
    expect(await screen.findByText('Only Chea Huan can cancel this meeting.')).toBeInTheDocument()
  })

  it('books as the account under the portal’s action — a Revenue sub-department as itself, source portal', async () => {
    mocks.book.mockResolvedValue({ ok: true, id: 'b-1', ref: 'BK-410', room: 'Meeting Room 1', time: '09:00–10:00', pax: 2 })
    const done = await PORTAL_ROOMS.bookRoom!({ room: 'r1', day: '2026-10-10', from: 540, to: 600, title: 'Sync', department: null, subDepartment: 'fair', internal: ['karjun'], pax: 2 })
    expect(done).toEqual({ ok: true, data: { id: 'b-1', ref: 'BK-410' } })
    expect(mocks.book).toHaveBeenCalledWith({
      id: null, room: 'r1', day: '2026-10-10', from: 540, to: 600, title: 'Sync', department: null, subDepartment: 'fair',
      bookedBy: null, internal: ['karjun'], guests: [], pax: 2, source: 'portal',
    })
    mocks.book.mockResolvedValue({ ok: false, reason: 'Someone just took that slot. Pick another time.' })
    expect(await PORTAL_ROOMS.bookRoom!({ room: 'r1', day: '2026-10-10', from: 540, to: 600, title: 'Sync', department: 'dept-hr', subDepartment: null, internal: [], pax: 1 })).toEqual({
      ok: false,
      error: 'Someone just took that slot. Pick another time.',
    })
  })

  it('the week and a cancel answer in the shape the page reads', async () => {
    const week = protoRooms()
    mocks.read.mockResolvedValue({ ok: true, range: week.range, people: week.people })
    expect(await PORTAL_ROOMS.rooms!('2026-10-10', '2026-10-16')).toEqual({ ok: true, data: { range: week.range, people: week.people } })
    mocks.read.mockResolvedValue({ ok: false, reason: 'The schedule could not be read. Please try again.' })
    expect(await PORTAL_ROOMS.rooms!('2026-10-10', '2026-10-16')).toEqual({ ok: false, error: 'The schedule could not be read. Please try again.' })
    mocks.cancel.mockResolvedValue({ ok: false, reason: 'Only Chea Huan can cancel this meeting.' })
    expect(await PORTAL_ROOMS.cancelBooking!('BK-301')).toEqual({ ok: false, error: 'Only Chea Huan can cancel this meeting.' })
  })

  it('a schedule the page could not read says why', async () => {
    mocks.read.mockResolvedValue({ ok: false, reason: 'The meeting rooms need Meeting rooms · View.' })
    draw({ initial: null, message: 'The meeting rooms need Meeting rooms · View.' })
    expect(await screen.findByRole('alert')).toHaveTextContent('The meeting rooms need Meeting rooms · View.')
  })

  it('View as a person reads only; without Create there is no + Book', () => {
    const { unmount } = draw({ readOnly: true })
    fireEvent.click(screen.getByRole('button', { name: '+ Book' }))
    expect(screen.getByRole('button', { name: 'Read-only while viewing as' })).toBeDisabled()
    unmount()
    draw({ canBook: false })
    expect(screen.queryByRole('button', { name: '+ Book' })).toBeNull()
  })

  it('‹ Profile goes back to Profile', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Profile' }))
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/profile')
  })
})

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room, RoomsPeople, RoomsRange } from '@/lib/rooms/model'

const actions = vi.hoisted(() => ({ readRoomsDay: vi.fn(), bookRoom: vi.fn(), cancelBooking: vi.fn(), saveRoom: vi.fn(), deleteRoom: vi.fn() }))
vi.mock('@/lib/rooms/actions', () => actions)
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))
vi.mock('@/components/hrv/toast', () => ({ flash: vi.fn() }))

import MeetingRoomsView from './MeetingRoomsView'

// Admin › Meeting Rooms after the parity audit (2026-10-11): ‹ › Today name the
// asked day at once and never dim (the prototype's), a read for a day already
// left is dropped, an account without the Rooms tab is not sent to it, and the
// Book drawer keeps its colleague box under the label when nobody is listed.

const ROOM: Room = { id: 'r1', name: 'Meeting Room 1', seats: 8, location: 'Level 3', facilities: '', bookable: true, guestBookable: false }
const range = (day: string, rooms: Room[] = [ROOM]): RoomsRange => ({ from: day, to: day, today: '2026-10-10', rooms, bookings: [] })
const people: RoomsPeople = {
  me: { staffId: 'grace', name: 'Grace Lim', departmentId: 'd-hr', department: 'HR', subDepartmentId: null },
  account: 'Grace Lim',
  canBook: true,
  canManage: true,
  people: [{ id: 'grace', name: 'Grace Lim', departmentId: 'd-hr', department: 'HR', title: null }],
  departments: [{ id: 'd-hr', name: 'HR' }],
  subDepartments: [],
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => (resolve = r))
  return { promise, resolve }
}

const view = (over: { rooms?: Room[]; canManage?: boolean } = {}) =>
  render(
    <MeetingRoomsView
      initial={range('2026-10-10', over.rooms)}
      people={people}
      rooms={over.rooms ?? [ROOM]}
      canBook
      canManage={over.canManage ?? true}
    />,
  )

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset()
  window.history.replaceState(null, '', '/admin/rooms')
})
afterEach(cleanup)

describe('Meeting Rooms › the day', () => {
  it('names the asked day at once, steps from it, and never dims while a day is read', async () => {
    const reads: Record<string, ReturnType<typeof deferred<{ ok: true; range: RoomsRange }>>> = {}
    actions.readRoomsDay.mockImplementation((day: string) => {
      reads[day] = deferred()
      return reads[day].promise
    })
    view()
    expect(screen.getByText('Sat, 10 Oct 2026 · today')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'The day after' }))
    expect(screen.getByText('Sun, 11 Oct 2026')).toBeInTheDocument()
    for (const name of ['The day before', 'The day after', 'Today']) expect(screen.getByRole('button', { name })).toBeEnabled()

    // A second press steps from the day asked for, not the day still on screen.
    fireEvent.click(screen.getByRole('button', { name: 'The day after' }))
    expect(screen.getByText('Mon, 12 Oct 2026')).toBeInTheDocument()
    expect(actions.readRoomsDay.mock.calls.map(c => c[0])).toEqual(['2026-10-11', '2026-10-12'])

    // The first read comes back late: it is dropped, the toolbar stays on the 12th.
    await act(async () => reads['2026-10-11'].resolve({ ok: true, range: range('2026-10-11') }))
    expect(screen.getByText('Mon, 12 Oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('grid')).toHaveAttribute('aria-label', 'Meeting rooms on Sat, 10 Oct 2026')

    await act(async () => reads['2026-10-12'].resolve({ ok: true, range: range('2026-10-12') }))
    expect(screen.getByRole('grid')).toHaveAttribute('aria-label', 'Meeting rooms on Mon, 12 Oct 2026')
    expect(screen.getByText('Mon, 12 Oct 2026')).toBeInTheDocument()
  })

  it('goes back to the day on screen when a read is refused', async () => {
    actions.readRoomsDay.mockResolvedValue({ ok: false, reason: 'Meeting rooms are not open to your account.' })
    view()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'The day after' }))
    })
    expect(screen.getByText('Sat, 10 Oct 2026 · today')).toBeInTheDocument()
  })
})

describe('Meeting Rooms › no rooms yet', () => {
  it('sends whoever manages the rooms to the Rooms tab, and tells everyone else who adds them', () => {
    view({ rooms: [] })
    expect(screen.getByText('No meeting rooms yet. They are added on the Rooms tab.')).toBeInTheDocument()
    cleanup()
    view({ rooms: [], canManage: false })
    expect(screen.getByText('No meeting rooms yet. HR adds them.')).toBeInTheDocument()
    expect(screen.queryByText(/Rooms tab/)).toBeNull()
  })
})

describe('Meeting Rooms › Book a room', () => {
  it('keeps the colleague box in its place when nobody is listed under Attending', () => {
    view()
    fireEvent.click(screen.getByRole('button', { name: '+ Book a room' }))
    const drawer = screen.getByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Remove Grace Lim' }))
    const box = within(drawer).getByPlaceholderText('Add a colleague — type a name')
    // The (empty) row of chips stands between the label and the box, as the prototype's does.
    const row = box.previousElementSibling as HTMLElement
    expect(row.tagName).toBe('DIV')
    expect(row.childElementCount).toBe(0)
    expect(row.previousElementSibling?.textContent).toBe('Attending · internal')
  })
})

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking, Room, RoomsPeople, RoomsRange } from '@/lib/rooms/model'

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

// The user, 2026-10-11: the day's label opens the month and a day is picked
// straight from it; ‹ › still step a day at a time.
describe('Meeting Rooms › the day picker', () => {
  const picker = () => screen.getByRole('dialog', { name: 'Pick a day' })
  const label = () => screen.getByRole('button', { name: /^Sat, 10 Oct 2026/, expanded: false })

  it('opens the month of the day shown and goes to the day picked there, across months too', async () => {
    actions.readRoomsDay.mockImplementation(async (day: string) => ({ ok: true, range: range(day) }))
    view()
    fireEvent.click(label())
    const card = picker()
    expect(within(card).getByText('October 2026')).toBeInTheDocument()
    const ten = within(card).getByRole('button', { name: 'Sat, 10 Oct 2026 · today' })
    expect(ten).toHaveAttribute('aria-pressed', 'true')
    expect(ten).toHaveAttribute('aria-current', 'date')
    // Six weeks, Monday first: 28 Sep to 8 Nov.
    const days = within(within(card).getByRole('group', { name: 'October 2026' })).getAllByRole('button')
    expect(days).toHaveLength(42)
    expect([days[0].getAttribute('aria-label'), days[41].getAttribute('aria-label')]).toEqual(['Mon, 28 Sep 2026', 'Sun, 8 Nov 2026'])

    // The card's ‹ › turn only its month.
    fireEvent.click(within(card).getByRole('button', { name: 'The month after' }))
    expect(within(card).getByText('November 2026')).toBeInTheDocument()
    expect(actions.readRoomsDay).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Tue, 3 Nov 2026' }))
    })
    expect(screen.queryByRole('dialog', { name: 'Pick a day' })).toBeNull()
    expect(actions.readRoomsDay.mock.calls.map(c => c[0])).toEqual(['2026-11-03'])
    expect(screen.getByText('Tue, 3 Nov 2026')).toBeInTheDocument()
    expect(window.location.search).toBe('?day=2026-11-03')
    // ‹ › still step one day from there.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'The day after' }))
    })
    expect(actions.readRoomsDay.mock.calls.map(c => c[0])).toEqual(['2026-11-03', '2026-11-04'])
  })

  it('closes without reading when the day shown is picked, on Escape and on a press outside — the label keeps the focus', () => {
    view()
    fireEvent.click(label())
    fireEvent.click(within(picker()).getByRole('button', { name: 'Sat, 10 Oct 2026 · today' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.readRoomsDay).not.toHaveBeenCalled()
    expect(label()).toHaveFocus()

    fireEvent.click(label())
    fireEvent.keyDown(within(picker()).getByRole('button', { name: 'The month after' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(label()).toHaveFocus()

    fireEvent.click(label())
    fireEvent.click(document.querySelector('[class*="pickCatch"]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves a day or a week with the arrow keys, turning the month when the keys leave it', () => {
    view()
    fireEvent.click(label())
    const ten = within(picker()).getByRole('button', { name: 'Sat, 10 Oct 2026 · today' })
    expect(ten).toHaveFocus()
    fireEvent.keyDown(ten, { key: 'ArrowRight' })
    expect(within(picker()).getByRole('button', { name: 'Sun, 11 Oct 2026' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toHaveAttribute('aria-label', 'Sun, 1 Nov 2026')
    expect(within(picker()).getByText('November 2026')).toBeInTheDocument()
  })
})

// The user, 2026-10-11: the half hour under the pointer lights up, so you see
// which bar the pointer is on — free ones only, from today on, for whoever books.
describe('Meeting Rooms › the half hour under the pointer', () => {
  const meeting = (over: Partial<Booking> = {}): Booking => ({
    id: 'b1', ref: 'BK-301', room: 'r1', roomName: 'Meeting Room 1', day: '2026-10-10', from: 540, to: 600, title: 'Fair weekly sync',
    source: 'portal', departmentId: 'd-hr', department: 'HR', subDepartment: null, bookedBy: 'Grace Lim', bookedByStaff: 'grace',
    onBehalfBy: null, mine: true, canChange: true, internal: [], guests: [], pax: 4, guestCompany: null, guestDepartment: null, guestCode: null,
    cancelled: false, events: [], ...over,
  })
  const ROOM2: Room = { ...ROOM, id: 'r2', name: 'Meeting Room 2' }
  const show = (day: string, canBook = true) =>
    render(
      <MeetingRoomsView
        initial={{ ...range(day, [ROOM, ROOM2]), bookings: [meeting({ day }), meeting({ id: 'b2', day, from: 600, to: 660, cancelled: true })] }}
        people={people}
        rooms={[ROOM, ROOM2]}
        canBook={canBook}
        canManage
      />,
    )
  const slots = (column: HTMLElement) => Array.from(column.querySelectorAll('[data-time]')).map(el => el.getAttribute('data-time'))

  it('draws every free half hour of each room with its time, none under a live meeting', () => {
    show('2026-10-10')
    const [one, two] = screen.getAllByRole('gridcell')
    expect(slots(one)).toHaveLength(22)
    expect(slots(one)).not.toContain('+ 09:00')
    expect(slots(one)).not.toContain('+ 09:30')
    // The cancelled meeting leaves its half hours free.
    expect(slots(one)).toEqual(expect.arrayContaining(['+ 08:00', '+ 08:30', '+ 10:00', '+ 10:30', '+ 19:30']))
    expect(slots(two)).toHaveLength(24)
    expect(one.querySelector('[data-time="+ 10:00"]')).toHaveStyle({ top: '104px', height: '26px' })
  })

  it('lights nothing on a day already past, nor for an account that cannot book — and a press opens nothing there', () => {
    show('2026-10-09')
    const past = screen.getAllByRole('gridcell')[0]
    expect(slots(past)).toEqual([])
    expect(past).toHaveAttribute('data-readonly', 'true')
    fireEvent.click(past)
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()
    show('2026-10-10', false)
    expect(slots(screen.getAllByRole('gridcell')[0])).toEqual([])
  })

  it('opens Book at the half hour pressed — the lit 19:30 books 19:30 to 20:00', () => {
    show('2026-10-10')
    const column = screen.getAllByRole('gridcell')[1]
    vi.spyOn(column, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 624, left: 0, right: 0, bottom: 624, width: 200, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(column, { clientY: 610 })
    const drawer = screen.getByRole('dialog')
    expect((within(drawer).getByLabelText('Room') as HTMLSelectElement).value).toBe('r2')
    expect((within(drawer).getByLabelText('From') as HTMLSelectElement).value).toBe('1170')
    expect((within(drawer).getByLabelText('To') as HTMLSelectElement).value).toBe('1200')
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

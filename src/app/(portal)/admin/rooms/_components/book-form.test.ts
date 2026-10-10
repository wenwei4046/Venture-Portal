import { describe, expect, it } from 'vitest'
import { blankForm, formOf, formProblem, withBookedBy } from './book-form'
import type { Booking, RoomsPeople } from '@/lib/rooms/model'

// The Book a room drawer's form (2026-10-11 — the prototype's `bkForm`).

const people: RoomsPeople = {
  me: { staffId: 'grace', name: 'Grace Lim', departmentId: 'hr', department: 'HR', subDepartmentId: null },
  account: 'HR',
  canBook: true,
  canManage: true,
  people: [
    { id: 'grace', name: 'Grace Lim', departmentId: 'hr', department: 'HR', title: 'HR Manager' },
    { id: 'jason', name: 'Jason Ong', departmentId: 'fin', department: 'Finance', title: 'Finance Manager' },
  ],
  departments: [{ id: 'fin', name: 'Finance' }, { id: 'hr', name: 'HR' }],
  subDepartments: [],
}
const range = { from: '2026-10-12', rooms: [{ id: 'r1', name: 'Meeting Room 1', seats: 8, location: 'Level 3', facilities: '', bookable: true, guestBookable: false }] }

describe('a new booking', () => {
  it('starts on the day shown, 09:00–10:00 in the first room, booked by and attended by whoever books', () => {
    expect(blankForm(range, people)).toMatchObject({ id: null, room: 'r1', day: '2026-10-12', from: 540, to: 600, bookedBy: 'grace', department: 'hr', internal: ['grace'] })
  })

  it('starts at the half hour pressed, in that room, never later than an hour before closing', () => {
    expect(blankForm(range, people, 'r9', 870)).toMatchObject({ room: 'r9', from: 870, to: 930 })
    expect(blankForm(range, people, 'r1', 1200)).toMatchObject({ from: 1140, to: 1200 })
  })

  it('an account with no staff record books as itself, with nobody attending yet', () => {
    expect(blankForm(range, { me: null })).toMatchObject({ bookedBy: '', department: '', internal: [] })
  })
})

describe('the form', () => {
  it('picking who it is for puts them among the attendees and takes their department', () => {
    const f = withBookedBy(blankForm(range, people), 'jason', people)
    expect(f).toMatchObject({ bookedBy: 'jason', department: 'fin', internal: ['jason', 'grace'] })
    expect(withBookedBy(f, 'grace', people).internal).toEqual(['jason', 'grace'])
  })

  it('asks for a title, an end after the start and somebody attending — in that order', () => {
    const f = blankForm(range, people)
    expect(formProblem(f)).toBe('Add a meeting title.')
    expect(formProblem({ ...f, title: 'Sync', to: 540 })).toBe('End time must be after the start.')
    expect(formProblem({ ...f, title: 'Sync', internal: [], guests: [{ name: ' ', company: '' }] })).toBe('Add who is attending.')
    expect(formProblem({ ...f, title: 'Sync', internal: [], guests: [{ name: 'Aaron', company: 'MVEC' }] })).toBeNull()
  })

  it('opens a booking for Edit as it stands; a guest-link one keeps its guests out of the form', () => {
    const b = { id: 'b1', source: 'guest', title: 'Kickoff', room: 'r3', day: '2026-10-12', from: 1020, to: 1080, bookedByStaff: null, departmentId: null, internal: [], guests: [], pax: 5 } as unknown as Booking
    expect(formOf(b)).toMatchObject({ id: 'b1', guest: true, title: 'Kickoff', room: 'r3', from: 1020, to: 1080, paxSet: 5 })
    expect(formProblem({ ...formOf(b) })).toBeNull()
  })
})

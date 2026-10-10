import { DAY_END, DAY_START, namedCount, type Booking, type RoomsPeople, type RoomsRange } from '@/lib/rooms/model'

/**
 * The Book a room drawer's form (2026-10-11 — the prototype's `bkForm`): a new
 * booking starts on the day shown, the room and half hour pressed (09:00–10:00
 * from the button), booked by whoever is booking, from their department, with
 * them attending.
 */
export interface BookForm {
  /** The booking being changed; null = a new one. */
  id: string | null
  /** A guest-link booking changed by the admin: only room, day, time, title and headcount move. */
  guest: boolean
  title: string
  room: string
  day: string
  from: number
  to: number
  /** A staff id, or '' = the account booking (an account with no staff record). */
  bookedBy: string
  /** A department id, or ''. */
  department: string
  internal: string[]
  guests: Array<{ name: string; company: string }>
  /** The headcount set by − / +; null = the named attendees. */
  paxSet: number | null
  q: string
  err: string
}

export function blankForm(range: Pick<RoomsRange, 'from' | 'rooms'>, people: Pick<RoomsPeople, 'me'>, room?: string | null, from?: number | null): BookForm {
  const start = from == null ? 540 : Math.max(DAY_START, Math.min(from, DAY_END - 60))
  return {
    id: null,
    guest: false,
    title: '',
    room: room ?? range.rooms[0]?.id ?? '',
    day: range.from,
    from: start,
    to: start + 60,
    bookedBy: people.me?.staffId ?? '',
    department: people.me?.departmentId ?? '',
    internal: people.me ? [people.me.staffId] : [],
    guests: [],
    paxSet: null,
    q: '',
    err: '',
  }
}

/** A booking opened for Edit. */
export function formOf(b: Booking, _people?: Pick<RoomsPeople, 'me'>): BookForm {
  return {
    id: b.id,
    guest: b.source === 'guest',
    title: b.title,
    room: b.room,
    day: b.day,
    from: b.from,
    to: b.to,
    bookedBy: b.bookedByStaff ?? '',
    department: b.departmentId ?? '',
    internal: b.internal.map(a => a.id),
    guests: b.guests.map(g => ({ ...g })),
    paxSet: b.pax,
    q: '',
    err: '',
  }
}

/**
 * Picking who it is booked by also puts them among the attendees and takes
 * their department (the prototype's `onBy`).
 */
export function withBookedBy(form: BookForm, staffId: string, people: Pick<RoomsPeople, 'people'>): BookForm {
  const person = people.people.find(p => p.id === staffId)
  return {
    ...form,
    bookedBy: staffId,
    department: person?.departmentId ?? form.department,
    internal: !staffId || form.internal.includes(staffId) ? form.internal : [staffId, ...form.internal],
    err: '',
  }
}

/** What the drawer checks before asking the database (the prototype's `saveBk`). */
export function formProblem(form: BookForm): string | null {
  if (!form.title.trim()) return 'Add a meeting title.'
  if (form.to <= form.from) return 'End time must be after the start.'
  if (!form.guest && namedCount(form.internal, form.guests) === 0) return 'Add who is attending.'
  return null
}

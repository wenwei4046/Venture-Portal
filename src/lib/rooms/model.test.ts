import { describe, expect, it } from 'vitest'
import {
  blockBox, blockWho, bookingBadge, bookingFromRow, clashLine, clashOf, dayChip, dayHref, dayLabel, dayOfSearch, departmentBadge, eventDate, guestBadge, halfHours,
  hm, hourLabels, isDay, meetingCount, paxSummary, peopleFromRow, rangeFromRow, shiftDay, shortDayLabel, slotAt, upcomingLine, withFrom,
  type Booking,
} from './model'

// Meeting rooms (2026-10-11, the HR revamp's second package — README §14).

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', ref: 'BK-301', room: 'r1', roomName: 'Meeting Room 1', day: '2026-10-12', from: 540, to: 600, title: 'Fair weekly sync',
  source: 'portal', departmentId: 'd1', department: 'Revenue Department', subDepartment: null, bookedBy: 'Chea Huan', bookedByStaff: 's1',
  mine: false, canChange: false, internal: [], guests: [], pax: 6, guestCompany: null, guestDepartment: null, guestCode: null,
  cancelled: false, events: [], ...over,
})

describe('departments and subsidiaries', () => {
  it('gives HQ the handoff’s codes and tones, and the rest of the real list its own', () => {
    expect(departmentBadge('Revenue Department')).toEqual({ label: 'Revenue', code: 'RV', tone: 'slate' })
    expect(departmentBadge('HR')).toEqual({ label: 'HR', code: 'HR', tone: 'clay' })
    expect(departmentBadge('Finance')).toEqual({ label: 'Finance', code: 'FIN', tone: 'gold' })
    expect(departmentBadge('Marketing')).toEqual({ label: 'Marketing', code: 'MKT', tone: 'walnut' })
    expect(departmentBadge('Director Office').code).toBe('DO')
    expect(departmentBadge('Director').code).toBe('DIR')
    expect(departmentBadge('Venture Office').code).toBe('VO')
    expect(departmentBadge('IT')).toEqual({ label: 'IT', code: 'IT', tone: 'slate' })
    expect(departmentBadge('Logistics')).toEqual({ label: 'Logistics', code: 'LOG', tone: 'walnut' })
    expect(departmentBadge(null)).toEqual({ label: '—', code: '—', tone: 'walnut' })
  })

  it('draws a guest-link booking in olive with its subsidiary’s code (GST without one)', () => {
    expect(guestBadge('HOUZS Interior Sdn Bhd', 'HIN')).toEqual({ label: 'HOUZS Interior Sdn Bhd', code: 'HIN', tone: 'olive' })
    expect(guestBadge('Akemi', '')).toEqual({ label: 'Akemi', code: 'GST', tone: 'olive' })
    expect(bookingBadge(booking({ source: 'guest', guestCompany: 'HOUZS Interior Sdn Bhd', guestCode: 'HIN' })).code).toBe('HIN')
    expect(bookingBadge(booking({ source: 'app', subDepartment: 'Fair' })).label).toBe('Revenue · Fair')
  })

  it('writes a block’s last line the prototype’s way', () => {
    expect(blockWho(booking())).toBe('RV · Chea Huan · 6 pax')
    expect(blockWho(booking({ department: null, bookedBy: 'Principal', pax: 3 }))).toBe('Principal · 3 pax')
  })
})

describe('the day’s half hours', () => {
  it('runs 08:00 to 20:00', () => {
    expect(hm(540)).toBe('09:00')
    expect(hm(1050)).toBe('17:30')
    const times = halfHours()
    expect(times).toHaveLength(25)
    expect([times[0].label, times[24].label]).toEqual(['08:00', '20:00'])
    expect(hourLabels()).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'])
  })

  it('books the half hour under the pointer, never later than an hour before closing', () => {
    expect(slotAt(0, 624)).toBe(480)
    expect(slotAt(52, 624)).toBe(540)
    expect(slotAt(77, 624)).toBe(540)
    expect(slotAt(78, 624)).toBe(570)
    expect(slotAt(620, 624)).toBe(1140)
  })

  it('places a block 52px an hour, 1px in and 3px short', () => {
    expect(blockBox(540, 600)).toEqual({ top: 53, height: 49 })
    expect(blockBox(630, 690)).toEqual({ top: 131, height: 49 })
  })

  it('moves the end with the start when it would no longer come after it', () => {
    expect(withFrom(600, 660)).toEqual({ from: 600, to: 660 })
    expect(withFrom(700, 660)).toEqual({ from: 700, to: 760 })
    expect(withFrom(1170, 1080)).toEqual({ from: 1170, to: 1200 })
  })
})

describe('days', () => {
  it('reads and steps days', () => {
    expect(isDay('2026-10-10')).toBe(true)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('10/10/2026')).toBe(false)
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('reads the day an address asks for and writes the address of a day, keeping the tab', () => {
    expect(dayOfSearch('?tab=rooms&day=2026-10-12', '2026-10-11')).toBe('2026-10-12')
    expect(dayOfSearch('?day=2026-02-30', '2026-10-11')).toBe('2026-10-11')
    expect(dayOfSearch('', '2026-10-11')).toBe('2026-10-11')
    expect(dayHref('/admin/rooms', '?tab=rooms', '2026-10-12', '2026-10-11')).toBe('/admin/rooms?tab=rooms&day=2026-10-12')
    expect(dayHref('/admin/rooms', '?day=2026-10-12', '2026-10-11', '2026-10-11')).toBe('/admin/rooms')
  })

  it('labels them as the prototype does, months in three letters', () => {
    expect(dayLabel('2026-10-10')).toBe('Sat, 10 Oct 2026')
    expect(dayLabel('2026-09-10')).toBe('Thu, 10 Sep 2026')
    expect(shortDayLabel('2026-10-12')).toBe('Mon, 12 Oct')
    expect(dayChip('2026-10-11')).toEqual({ weekday: 'Sun', date: '11' })
    expect(eventDate('2026-10-09T17:30:00Z')).toBe('10 Oct 2026')
  })
})

describe('seats and clashes', () => {
  it('never counts fewer than the named, and says when the room is too small', () => {
    expect(paxSummary(2, null, { name: 'Meeting Room 1', seats: 8 })).toEqual({ total: 2, line: '2 named · Meeting Room 1 seats 8', over: false })
    expect(paxSummary(2, 5, { name: 'Meeting Room 1', seats: 8 }).line).toBe('2 named + 3 more · Meeting Room 1 seats 8')
    expect(paxSummary(3, 1, null)).toEqual({ total: 3, line: '3 named', over: false })
    expect(paxSummary(1, 9, { name: 'Meeting Room 4', seats: 4 })).toEqual({ total: 9, line: '1 named + 8 more · Meeting Room 4 seats 4 · too many', over: true })
  })

  it('finds the booking a slot runs into — not itself, not another room or day, not a cancelled one', () => {
    const list = [booking(), booking({ id: 'b2', from: 600, to: 690, title: 'Supplier review' }), booking({ id: 'b3', from: 720, to: 780, cancelled: true })]
    expect(clashOf(list, { room: 'r1', day: '2026-10-12', from: 570, to: 630 })?.id).toBe('b1')
    expect(clashOf(list, { room: 'r1', day: '2026-10-12', from: 690, to: 720 })).toBeNull()
    expect(clashOf(list, { room: 'r1', day: '2026-10-12', from: 720, to: 780 })).toBeNull()
    expect(clashOf(list, { id: 'b1', room: 'r1', day: '2026-10-12', from: 540, to: 570 })).toBeNull()
    expect(clashOf(list, { room: 'r2', day: '2026-10-12', from: 540, to: 600 })).toBeNull()
    expect(clashLine('Meeting Room 1', list[0])).toBe('Meeting Room 1 is taken 09:00–10:00 by “Fair weekly sync”.')
  })

  it('counts meetings and bookings ahead in words', () => {
    expect([meetingCount(0), meetingCount(1), meetingCount(7)]).toEqual(['No meetings', '1 meeting', '7 meetings'])
    expect([upcomingLine(0), upcomingLine(1), upcomingLine(3)]).toEqual(['No upcoming bookings', '1 upcoming booking', '3 upcoming bookings'])
  })
})

describe('reading the database’s answer', () => {
  it('takes a range, keeping only well-formed rows', () => {
    const range = rangeFromRow({
      from: '2026-10-12', to: '2026-10-12', today: '2026-10-11',
      rooms: [{ id: 'r1', name: 'Meeting Room 1', seats: 8, location: 'Level 3', facilities: 'TV', bookable: true, guestBookable: false }, null],
      bookings: [{ id: 'b1', ref: 'BK-301', room: 'r1', day: '2026-10-12', from: 540, to: 600, title: 'Sync', source: 'nonsense', pax: 2, internal: [{ id: 's1', name: 'Grace', department: 'HR' }], guests: [{ name: 'Aaron', company: 'MVEC' }], events: [{ what: 'Booked', at: '2026-10-11T01:00:00Z', who: 'Grace', note: '' }] }, { nope: 1 }],
    })!
    expect(range.rooms.map(r => r.name)).toEqual(['Meeting Room 1'])
    expect(range.bookings).toHaveLength(1)
    expect(range.bookings[0]).toMatchObject({ source: 'portal', mine: false, canChange: false, internal: [{ name: 'Grace' }], guests: [{ name: 'Aaron', company: 'MVEC' }] })
    expect(bookingFromRow(null)).toBeNull()
  })

  it('takes who may be picked, and who is asking', () => {
    const people = peopleFromRow({ me: null, account: 'Principal', canBook: true, canManage: true, people: [{ id: 's1', name: 'Grace Lim', department: 'HR' }], departments: [{ id: 'd1', name: 'HR' }], subDepartments: [] })!
    expect(people).toMatchObject({ me: null, account: 'Principal', canBook: true, canManage: true })
    expect(people.people[0]).toEqual({ id: 's1', name: 'Grace Lim', departmentId: null, department: 'HR', title: null })
    expect(peopleFromRow({ me: { staffId: 's1', name: 'Grace Lim', departmentId: 'd1' } })!.me?.staffId).toBe('s1')
  })
})

import { describe, expect, it } from 'vitest'
import {
  availabilityBars, bookedFacts, bookingPreview, busyAt, calBlocks, dayChip, freeLine, fullDay, guestDataFromRow, guestDays, guestUrl, isGuestCode,
  longDay, missingLine, paxNote, pickSlot, selectionLine, shortDay, shortRoomName, takenDepartment, takenFacts, takenFromRows,
  type GuestTaken,
} from './model'

// The guest link's page (2026-10-11, the HR revamp's second package — README §16).

const meeting = (over: Partial<GuestTaken> = {}): GuestTaken => ({
  id: 'b1', ref: null, room: 'r1', day: '2026-10-10', from: 540, to: 600, title: 'Fair weekly sync', guest: false, code: '', company: null,
  subsidiary: null, department: 'Revenue Department', subDepartment: null, by: 'Chea Huan', pax: 6, ...over,
})
const room = { id: 'r1', name: 'Meeting Room 1', seats: 8, location: 'Level 3', facilities: 'TV, whiteboard' }

describe('reading the link', () => {
  it('is closed unless the database says it is on', () => {
    expect(guestDataFromRow({ on: false })).toEqual({ on: false })
    expect(guestDataFromRow(null)).toEqual({ on: false })
    const d = guestDataFromRow({ on: true, booking: true, hiring: false, days: 40, today: '2026-10-10', rooms: [room, { nope: 1 }], allRooms: [room],
      subs: [{ id: 's1', code: 'HIN', name: 'HOUZS Interior', departments: ['Design', '', 7] }] })
    expect(d).toMatchObject({ on: true, days: 21, rooms: [{ name: 'Meeting Room 1' }], subs: [{ code: 'HIN', departments: ['Design'] }] })
  })

  it('keeps only well-formed meetings', () => {
    expect(takenFromRows([meeting(), { id: 'x' }, null]).map(b => b.id)).toEqual(['b1'])
  })

  it('knows a code when it sees one', () => {
    expect(isGuestCode('hv-7Q2KABCD')).toBe(true)
    expect(isGuestCode('hv-7Q2K')).toBe(false)
    expect(isGuestCode('hv-7Q2KABC0')).toBe(false)
    expect(guestUrl('https://venture.example/', 'hv-7Q2KABCD')).toBe('https://venture.example/g/hv-7Q2KABCD')
  })
})

describe('days', () => {
  it('runs from today for the days ahead, never more than 21', () => {
    expect(guestDays('2026-10-10', 3)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12'])
    expect(guestDays('2026-10-10', 99)).toHaveLength(21)
    expect(guestDays('2026-10-10', 0)).toHaveLength(7)
  })

  it('writes them the prototype’s way, months in three letters', () => {
    expect(dayChip('2026-10-10', '2026-10-10')).toEqual({ wd: 'Today', n: '10' })
    expect(dayChip('2026-10-12', '2026-10-10')).toEqual({ wd: 'Mon', n: '12' })
    expect(shortDay('2026-10-10')).toBe('Sat 10 Oct')
    expect(shortDay('2026-09-10')).toBe('Thu 10 Sep')
    expect(fullDay('2026-10-10')).toBe('Sat, 10 Oct 2026')
    expect(longDay('2026-10-10')).toBe('Saturday 10 Oct')
  })
})

describe('half hours', () => {
  const taken = [meeting(), meeting({ id: 'b2', from: 720, to: 780 })]

  it('blocks what a meeting covers, the one being changed aside', () => {
    expect(busyAt(taken, 'r1', 540, null)).toBe(true)
    expect(busyAt(taken, 'r1', 600, null)).toBe(false)
    expect(busyAt(taken, 'r1', 540, 'b1')).toBe(false)
    expect(busyAt(taken, 'r2', 540, null)).toBe(false)
  })

  it('a tap starts, a later tap stretches — not across a meeting', () => {
    const none = { room: null, start: null, end: null }
    const a = pickSlot(none, 'r1', 600, taken, null)!
    expect(a).toEqual({ pick: { room: 'r1', start: 600, end: 630 }, err: '' })
    expect(pickSlot(a.pick, 'r1', 660, taken, null)).toEqual({ pick: { room: 'r1', start: 600, end: 690 }, err: '' })
    expect(pickSlot(a.pick, 'r1', 780, taken, null)).toEqual({ pick: a.pick, err: 'That range runs into another booking.' })
    expect(pickSlot(a.pick, 'r1', 540, taken, null)).toBeNull()
    expect(pickSlot({ room: 'r1', start: 600, end: 690 }, 'r1', 630, taken, null)?.pick).toEqual({ room: 'r1', start: 630, end: 660 })
    expect(pickSlot(a.pick, 'r2', 660, taken, null)?.pick).toEqual({ room: 'r2', start: 660, end: 690 })
  })

  it('says how much is free and draws the day’s bar', () => {
    expect(freeLine(taken, 'r1', null)).toBe('10 h free')
    expect(freeLine([meeting({ from: 480, to: 1200 })], 'r1', null)).toBe('Fully booked')
    expect(freeLine([meeting({ from: 480, to: 510 })], 'r1', null)).toBe('11.5 h free')
    expect(availabilityBars(taken, 'r1', { room: 'r1', start: 600, end: 660 })).toEqual([
      { left: '8.333333333333332%', width: '8.333333333333332%', picked: false },
      { left: '33.33333333333333%', width: '8.333333333333332%', picked: false },
      { left: '16.666666666666664%', width: '8.333333333333332%', picked: true },
    ])
  })
})

describe('the words on the form', () => {
  it('asks for what is missing, in order', () => {
    expect(missingLine({ company: '', department: '', departmentNeeded: true, name: ' ', slot: false, title: '' }))
      .toBe('Add company, department, your name, a time slot, a meeting title.')
    expect(missingLine({ company: 's1', department: '', departmentNeeded: false, name: 'Wong', slot: true, title: 'Sync' })).toBeNull()
  })

  it('counts the people against the room', () => {
    expect(paxNote(null, 2)).toEqual({ line: 'Including you and any visitors', over: false })
    expect(paxNote(room, 8)).toEqual({ line: 'Meeting Room 1 seats 8', over: false })
    expect(paxNote(room, 9)).toEqual({ line: 'Too many for Meeting Room 1 (8 seats)', over: true })
  })

  it('reads the picked slot back', () => {
    expect(selectionLine(room, '2026-10-10', { room: 'r1', start: 540, end: 630 })).toBe('Meeting Room 1 · Sat 10 Oct · 09:00–10:30')
    expect(selectionLine(room, '2026-10-10', { room: 'r1', start: null, end: null })).toBe('')
  })

  it('fills the desktop preview as the form fills', () => {
    const empty = bookingPreview({ company: '', department: '', name: '', room: null, day: '2026-10-10', pick: { room: null, start: null, end: null }, title: '', pax: 2 })
    expect([empty.done, empty.pct]).toEqual(['1 of 8 filled', '13%'])
    expect(empty.groups[0].rows[0]).toEqual({ l: 'Company', v: 'Not filled yet', filled: false })
    const full = bookingPreview({ company: 'HOUZS Interior', department: 'Design', name: 'Wong', room, day: '2026-10-10', pick: { room: 'r1', start: 540, end: 600 }, title: 'Sync', pax: 4 })
    expect(full.done).toBe('8 of 8 filled')
    expect(full.groups[1].rows.map(r => r.v)).toEqual(['Meeting Room 1', 'Sat, 10 Oct 2026', '09:00 – 10:00'])
    expect(full.groups[2].rows[1].v).toBe('4 pax · room seats 8')
  })
})

describe('the schedule', () => {
  it('places meetings 64px an hour; HQ in its department’s code, a subsidiary in its own', () => {
    const blocks = calBlocks([meeting(), meeting({ id: 'g', from: 1020, to: 1050, guest: true, code: 'HIN', title: '' })], 'r1')
    expect(blocks[0]).toMatchObject({ title: 'Fair weekly sync', time: '09:00 RV', clamp: 3, centred: false, top: 65, height: 62, guest: false })
    expect(blocks[1]).toMatchObject({ title: 'Booked', time: '17:00', clamp: 1, centred: true, guest: true })
    expect(calBlocks([meeting({ from: 540, to: 690 })], 'r1')[0].clamp).toBe(5)
    expect(shortRoomName('Meeting Room 3')).toBe('Room 3')
  })

  it('says whose a meeting is', () => {
    expect(takenDepartment(meeting({ subDepartment: 'Fair' }))).toBe('RV · Revenue · Fair')
    expect(takenDepartment(meeting({ guest: true, code: 'HIN', department: 'Project' }))).toBe('HIN · Project')
    expect(takenDepartment(meeting({ department: null }))).toBe('—')
    expect(takenFacts(meeting(), 'Meeting Room 1')).toEqual([
      { l: 'Room', v: 'Meeting Room 1' }, { l: 'Company', v: 'HOUZS Venture' }, { l: 'Department', v: 'RV · Revenue' },
      { l: 'Booked by', v: 'Chea Huan' }, { l: 'People', v: '6 pax' },
    ])
  })

  it('reads a finished booking back', () => {
    expect(bookedFacts({ id: 'b', ref: 'BK-G302', room: 'r1', roomName: 'Meeting Room 1', day: '2026-10-10', from: 600, to: 660, title: 'Sync', pax: 5,
      company: 'HOUZS Interior', department: null, name: 'Wong Mei Yee' }).map(f => f.v))
      .toEqual(['Meeting Room 1', 'Sat 10 Oct · 10:00–11:00', 'Sync', '5 pax', 'Wong Mei Yee · HOUZS Interior'])
  })
})

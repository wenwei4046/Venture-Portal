import { describe, expect, it } from 'vitest'
import {
  attachable, availabilityBars, bookedFacts, bookingPreview, busyAt, calBlocks, dayChip, freeLine, fullDay, guestDataFromRow, guestDays, guestRefusal, guestUrl, isGuestCode, SLOT_TAKEN,
  hireAnswers, hireFormFromRows, hireGroups, hireMissing, hirePlaceholder, hirePreview, hireValue, isChips, spansRow,
  longDay, missingLine, paxNote, pickSlot, selectionLine, shortDay, shortRoomName, takenDepartment, takenFacts, takenFromRows,
  type GuestTaken,
} from './model'

// The guest link's page (2026-10-11, the HR revamp's second package — README §16).

const meeting = (over: Partial<GuestTaken> = {}): GuestTaken => ({
  id: 'b1', ref: null, room: 'r1', day: '2026-10-10', from: 540, to: 600, title: 'Fair weekly sync', guest: false, code: '', company: null,
  subsidiary: null, department: 'Revenue Department', subDepartment: null, by: 'Chea Huan', onBehalfBy: null, pax: 6, ...over,
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
    expect(takenFacts(meeting({ onBehalfBy: 'Grace Lim' }), 'Meeting Room 1')[3]).toEqual({ l: 'Booked by', v: 'Grace Lim (for Chea Huan)' })
    expect(takenFromRows([{ id: 'b1', room: 'r1', day: '2026-10-10', by: 'Chea Huan', onBehalfBy: 'Grace Lim' }])[0].onBehalfBy).toBe('Grace Lim')
  })

  it('reads a finished booking back', () => {
    expect(bookedFacts({ id: 'b', ref: 'BK-G302', room: 'r1', roomName: 'Meeting Room 1', day: '2026-10-10', from: 600, to: 660, title: 'Sync', pax: 5,
      company: 'HOUZS Interior', department: null, name: 'Wong Mei Yee' }).map(f => f.v))
      .toEqual(['Meeting Room 1', 'Sat 10 Oct · 10:00–11:00', 'Sync', '5 pax', 'Wong Mei Yee · HOUZS Interior'])
  })
})

describe('request manpower', () => {
  const form = hireFormFromRows([
    { id: 'position', label: 'Position', type: 'text', options: '', required: true },
    { id: 'dept', label: 'Department', type: 'select', options: 'Revenue · Fair, Revenue · IR, HR, Finance, Marketing, IT, Director Office', required: true },
    { id: 'headcount', label: 'Headcount', type: 'number', options: '', required: true },
    { id: 'budget', label: 'Budget (RM / month)', type: 'range', options: '', required: true },
    { id: 'gender', label: 'Gender', type: 'select', options: 'Any, Male, Female', required: false },
    { id: 'shift', label: 'Shift', type: 'select', options: 'Day, Night', required: false },
    { id: 'jd', label: 'Job description', type: 'longtext', options: '', required: true },
    { id: 'Bad id', label: 'x', type: 'text' },
    { id: 'colour', label: 'Colour', type: 'date' },
  ])
  const subs = [{ id: 's1', code: 'HIN', name: 'HOUZS Interior', departments: [] }]

  it('reads Hiring › Form settings, keeping only fields it can ask', () => {
    expect(form.map(f => f.id)).toEqual(['position', 'dept', 'headcount', 'budget', 'gender', 'shift', 'jd'])
    expect(form[1].options[0]).toEqual({ v: 'Revenue · Fair', label: 'Revenue · Fair' })
  })

  it('asks it in the prototype’s four steps', () => {
    const groups = hireGroups(form, subs)
    expect(groups.map(g => [g.title, g.fields.map(f => f.id)])).toEqual([
      ['About you', ['_co', '_name']],
      ['The role', ['position', 'dept', 'headcount', 'budget', 'shift']],
      ['Candidate requirements', ['gender']],
      ['Job description', ['jd', '_file']],
    ])
    expect(groups[0].fields[0].options).toEqual([{ v: 's1', label: 'HOUZS Interior' }])
    expect(hireGroups(form.filter(f => f.id !== 'gender'), subs).map(g => g.key)).toEqual(['you', 'role', 'desc'])
  })

  // 2026-10-12, the user: Book a meeting room was linked to Subsidiaries & departments, Request manpower was not.
  it('asks the picked company’s own departments — never Form settings’ HQ list', () => {
    const two = [
      { id: 'car', code: 'CAR', name: 'Carres', departments: ['Marketing', 'Operation', 'Business Development', 'Sales', 'Management'] },
      { id: 'new', code: '', name: 'New subsidiary', departments: [] },
    ]
    const deptOf = (co: string) => hireGroups(form, two, co)[1].fields.find(f => f.id === 'dept')!
    const car = deptOf('car')
    expect([car.label, car.type, car.required, car.options.map(o => o.v)]).toEqual(['Department', 'select', true, two[0].departments])
    expect([isChips(car), hirePlaceholder(car), hireValue(car, { dept: 'Sales' }, null)]).toEqual([false, 'Choose…', 'Sales'])
    expect(deptOf('').options).toEqual([])
    const typed = deptOf('new')
    expect([typed.type, typed.options, typed.required, hirePlaceholder(typed)]).toEqual(['text', [], true, 'e.g. Operations'])
    expect(hireGroups(form, two, 'car')[1].fields.map(f => f.id)).toEqual(['position', 'dept', 'headcount', 'budget', 'shift'])
  })

  it('draws short choices as pills, long ones as a dropdown', () => {
    const [dept, gender] = [form[1], form[4]]
    expect([isChips(dept), isChips(gender), spansRow(gender), spansRow(form[6])]).toEqual([false, true, false, true])
    expect(hirePlaceholder(form[0])).toBe('e.g. Warehouse Assistant')
    expect(hirePlaceholder(dept)).toBe('Choose…')
  })

  it('says what is missing, then reads the answers back as HR will see them', () => {
    const groups = hireGroups(form, subs)
    expect(hireMissing(groups[0].fields, {}, null)).toBe('Fill in Company, Your name.')
    expect(hireMissing(groups[1].fields, { position: 'Driver', dept: 'HR', headcount: '1', budget: '–' }, null)).toBe('Fill in Budget (RM / month).')
    const answers = { _co: 's1', _name: 'Wong', position: 'Driver', budget: '2500–3000', headcount: '2' }
    expect(hireValue(groups[0].fields[0], answers, null)).toBe('HOUZS Interior')
    const pv = hirePreview(groups, answers, 'jd.pdf')
    expect(pv.groups[1].rows.find(r => r.l === 'Budget (RM / month)')).toEqual({ l: 'Budget (RM / month)', v: 'RM 2500 – 3000', filled: true })
    expect(pv.groups[3].rows.at(-1)).toEqual({ l: 'Attachment', v: 'jd.pdf', filled: true })
    expect(pv.done).toBe('6 of 10 filled')
    expect(hireAnswers({ ...answers, _file: 'x', notes: '  ' })).toEqual({ position: 'Driver', budget: '2500–3000', headcount: '2' })
  })

  it('attaches a PDF, Word file or photo up to 100 MB', () => {
    expect(attachable('JD.PDF', 1000)).toEqual({ ext: 'pdf' })
    expect(attachable('jd.exe', 1000)).toEqual({ reason: 'Attach a PDF, a Word file or a photo.' })
    expect(attachable('jd.pdf', 100 * 1024 * 1024)).toEqual({ ext: 'pdf' })
    expect(attachable('jd.pdf', 100 * 1024 * 1024 + 1)).toEqual({ reason: 'Attach a file up to 100 MB.' })
  })
})

// The security review's N3 (2026-10-11): a stranger reads only the refusals written for them.
describe('what a guest reads of a failed call', () => {
  const FALLBACK = 'The room could not be booked. Please try again.'

  it('passes the guest functions’ own refusals on, word for word', () => {
    expect(guestRefusal({ code: 'P0001', message: 'Pick a day in the next 14 days.' }, FALLBACK)).toBe('Pick a day in the next 14 days.')
    expect(guestRefusal({ code: 'P0001', message: ' Too many requests from the guest link just now. Try again later. ' }, FALLBACK))
      .toBe('Too many requests from the guest link just now. Try again later.')
    expect(guestRefusal({ code: '42501', message: 'This link is closed.' }, FALLBACK)).toBe('This link is closed.')
    expect(guestRefusal({ code: '22023', message: 'Say which company is asking' }, FALLBACK)).toBe('Say which company is asking')
  })

  it('says a clash as the page does', () => {
    expect(guestRefusal({ code: '23P01', message: 'conflicting key value violates exclusion constraint "meeting_room_bookings_no_overlap"' }, FALLBACK))
      .toBe(SLOT_TAKEN)
  })

  it('keeps everything else to the fallback sentence', () => {
    for (const error of [
      { code: '22P02', message: 'invalid input syntax for type uuid: "x"' },
      { code: '23514', message: 'new row for relation "meeting_room_bookings" violates check constraint "meeting_room_bookings_half_hours"' },
      { code: '42883', message: 'function public.guest_link_book(text) does not exist' },
      { code: 'PGRST202', message: 'Could not find the function public.guest_link_book in the schema cache' },
      { code: '42501', message: 'permission denied for function guest_link_book' },
      { code: '', message: 'TypeError: fetch failed' },
      { code: 'P0001', message: '   ' },
      { message: 'no code at all' },
    ]) expect(guestRefusal(error, FALLBACK)).toBe(FALLBACK)
    expect(guestRefusal(null, FALLBACK)).toBe(FALLBACK)
  })
})

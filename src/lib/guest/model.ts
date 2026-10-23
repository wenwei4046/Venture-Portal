import { departmentBadge, hm, isDay, shiftDay } from '@/lib/rooms/model'

/**
 * The guest link (2026-10-11, the HR revamp's second package — README §15–16,
 * mig 20261011091000): what the public page /g/<code> and Admin › Guest Link
 * read, and the page's arithmetic — the days a guest may pick, which half
 * hours are free, the availability bar, the schedule's blocks, the words of
 * each line — as `Guest Booking.dc.html` has them. Pure, so it is tested.
 */

/** The guest page's day: 08:00–20:00, half hours, 64px an hour on its schedule. */
export const G_START = 480
export const G_END = 1200
export const G_HOUR_PX = 64

export interface GuestRoom {
  id: string
  name: string
  seats: number
  location: string
  facilities: string
}

export interface GuestSub {
  id: string
  code: string
  name: string
  departments: string[]
}

export interface GuestOpen {
  on: true
  booking: boolean
  hiring: boolean
  days: number
  today: string
  /** The rooms guests may book. */
  rooms: GuestRoom[]
  /** Every bookable room — the schedule's columns. */
  allRooms: GuestRoom[]
  subs: GuestSub[]
  /** Request manpower: Hiring › Form settings' fields (none while the part is closed). */
  hireForm: HireField[]
}

export type GuestData = { on: false } | GuestOpen

/** A meeting on the day asked — a guest-link one (`guest`) is a guest's to change. */
export interface GuestTaken {
  id: string
  ref: string | null
  room: string
  day: string
  from: number
  to: number
  title: string
  guest: boolean
  code: string
  company: string | null
  subsidiary: string | null
  department: string | null
  subDepartment: string | null
  by: string
  /** Who made an HQ meeting booked for somebody else (`by`) — "Grace (for Chea Huan)" (mig 20261011150100). */
  onBehalfBy: string | null
  pax: number
}

/** What a booking (or a change) came back as. */
export interface GuestBooked {
  id: string
  ref: string
  room: string
  roomName: string
  day: string
  from: number
  to: number
  title: string
  pax: number
  company: string
  department: string | null
  name: string
}

// ── Reading the database's answers ────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

function roomOf(v: unknown): GuestRoom | null {
  const r = obj(v)
  if (!r || !str(r.id) || !str(r.name)) return null
  return { id: str(r.id), name: str(r.name), seats: num(r.seats), location: str(r.location), facilities: str(r.facilities) }
}

function subOf(v: unknown): GuestSub | null {
  const s = obj(v)
  if (!s || !str(s.id) || !str(s.name)) return null
  const departments = Array.isArray(s.departments) ? s.departments.filter((d): d is string => typeof d === 'string' && d.trim() !== '') : []
  return { id: str(s.id), code: str(s.code), name: str(s.name), departments }
}

const listOf = <T>(v: unknown, f: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : [])

/** The link's subsidiaries, as listed. */
export function subsFromRows(v: unknown): GuestSub[] {
  return listOf(v, subOf)
}

export function guestDataFromRow(v: unknown): GuestData {
  const d = obj(v)
  if (!d || d.on !== true || !isDay(d.today)) return { on: false }
  return {
    on: true,
    booking: d.booking === true,
    hiring: d.hiring === true,
    days: Math.max(1, Math.min(num(d.days) || 7, 21)),
    today: d.today,
    rooms: listOf(d.rooms, roomOf),
    allRooms: listOf(d.allRooms, roomOf),
    subs: listOf(d.subs, subOf),
    hireForm: hireFormFromRows(d.hireForm),
  }
}

export function takenFromRows(v: unknown): GuestTaken[] {
  return listOf(v, x => {
    const b = obj(x)
    if (!b || !str(b.id) || !str(b.room) || !isDay(b.day)) return null
    return {
      id: str(b.id),
      ref: strOrNull(b.ref),
      room: str(b.room),
      day: b.day,
      from: num(b.from),
      to: num(b.to),
      title: str(b.title),
      guest: b.guest === true,
      code: str(b.code),
      company: strOrNull(b.company),
      subsidiary: strOrNull(b.subsidiary),
      department: strOrNull(b.department),
      subDepartment: strOrNull(b.subDepartment),
      by: str(b.by),
      onBehalfBy: strOrNull(b.onBehalfBy),
      pax: num(b.pax),
    }
  })
}

export function bookedFromRow(v: unknown): GuestBooked | null {
  const b = obj(v)
  if (!b || !str(b.id) || !str(b.ref) || !isDay(b.day)) return null
  return {
    id: str(b.id),
    ref: str(b.ref),
    room: str(b.room),
    roomName: str(b.roomName),
    day: b.day,
    from: num(b.from),
    to: num(b.to),
    title: str(b.title),
    pax: num(b.pax),
    company: str(b.company),
    department: strOrNull(b.department),
    name: str(b.name),
  }
}

// ── Days, in the page's words ─────────────────────────────────────────────

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function partsOf(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

/** "Sat 10 Oct" — en-GB's order, a three-letter month. */
export function shortDay(day: string): string {
  const { m, d, dow } = partsOf(day)
  return `${WD[dow]} ${d} ${MON[m - 1]}`
}

/** "Sat, 10 Oct 2026". */
export function fullDay(day: string): string {
  const { y, m, d, dow } = partsOf(day)
  return `${WD[dow]}, ${d} ${MON[m - 1]} ${y}`
}

/** "Saturday 10 Oct". */
export function longDay(day: string): string {
  const { m, d, dow } = partsOf(day)
  return `${WD_LONG[dow]} ${d} ${MON[m - 1]}`
}

/** The days a guest may pick: today and the next ones, at most 21. */
export function guestDays(today: string, days: number): string[] {
  const n = Math.max(1, Math.min(Math.floor(days) || 7, 21))
  return Array.from({ length: n }, (_, i) => shiftDay(today, i))
}

/** A day chip: "Today" / "Mon" over the date. */
export function dayChip(day: string, today: string): { wd: string; n: string } {
  const { d, dow } = partsOf(day)
  return { wd: day === today ? 'Today' : WD[dow], n: String(d) }
}

// ── Slots ─────────────────────────────────────────────────────────────────

/** Every half hour a meeting may start at. */
export function guestSlots(): number[] {
  const out: number[] = []
  for (let m = G_START; m < G_END; m += 30) out.push(m)
  return out
}

/** Whether the half hour at `m` runs into a meeting in this room (the one being changed aside). */
export function busyAt(taken: readonly GuestTaken[], room: string, m: number, exceptId: string | null): boolean {
  return taken.some(b => b.room === room && b.id !== exceptId && b.from < m + 30 && m < b.to)
}

export interface SlotPick {
  room: string | null
  start: number | null
  end: number | null
}

/**
 * A tap on a half hour: the first tap starts a selection, a later one extends
 * it to that slot — refused in words when the stretch runs into a meeting. A
 * booked half hour does nothing (null).
 */
export function pickSlot(sel: SlotPick, room: string, m: number, taken: readonly GuestTaken[], exceptId: string | null): { pick: SlotPick; err: string } | null {
  if (busyAt(taken, room, m, exceptId)) return null
  const s = sel.room === room ? sel : { room, start: null, end: null }
  if (s.start == null || s.end == null || m < s.start || (s.end - s.start > 30 && m < s.end)) {
    return { pick: { room, start: m, end: m + 30 }, err: '' }
  }
  for (let x = s.start; x <= m; x += 30) {
    if (busyAt(taken, room, x, exceptId)) return { pick: sel, err: 'That range runs into another booking.' }
  }
  return { pick: { room, start: s.start, end: m + 30 }, err: '' }
}

/** "6.5 h free" / "Fully booked". */
export function freeLine(taken: readonly GuestTaken[], room: string, exceptId: string | null): string {
  const free = guestSlots().filter(m => !busyAt(taken, room, m, exceptId)).length
  return free ? `${free / 2} h free` : 'Fully booked'
}

/** The room card's 08–20 bar: each meeting, and the picked stretch in orange. */
export function availabilityBars(taken: readonly GuestTaken[], room: string, pick: SlotPick | null): Array<{ left: string; width: string; picked: boolean }> {
  const span = G_END - G_START
  const pct = (v: number) => `${(v / span) * 100}%`
  const bars = taken.filter(b => b.room === room).map(b => ({ left: pct(b.from - G_START), width: pct(b.to - b.from), picked: false }))
  if (pick && pick.room === room && pick.start != null && pick.end != null) {
    bars.push({ left: pct(pick.start - G_START), width: pct(pick.end - pick.start), picked: true })
  }
  return bars
}

/** "Meeting Room 1 seats 8" / "Too many for Meeting Room 1 (8 seats)" / before a room: "Including you and any visitors". */
export function paxNote(room: GuestRoom | null, pax: number): { line: string; over: boolean } {
  if (!room) return { line: 'Including you and any visitors', over: false }
  const over = room.seats > 0 && pax > room.seats
  if (over) return { line: `Too many for ${room.name} (${room.seats} seats)`, over }
  return { line: room.seats > 0 ? `${room.name} seats ${room.seats}` : room.name, over }
}

/** What is still missing, as the page says it: "Add company, your name." */
export function missingLine(f: { company: string; department: string; departmentNeeded: boolean; name: string; slot: boolean; title: string }): string | null {
  const miss = [
    !f.company && 'company',
    f.departmentNeeded && !f.department && 'department',
    !f.name.trim() && 'your name',
    !f.slot && 'a time slot',
    !f.title.trim() && 'a meeting title',
  ].filter((x): x is string => !!x)
  return miss.length ? `Add ${miss.join(', ')}.` : null
}

/** "Meeting Room 1 · Sat 10 Oct · 09:00–10:00" — the picked slot, under the rooms. */
export function selectionLine(room: GuestRoom | null, day: string, pick: SlotPick): string {
  if (!room || pick.start == null || pick.end == null) return ''
  return `${room.name} · ${shortDay(day)} · ${hm(pick.start)}–${hm(pick.end)}`
}

// ── The schedule ──────────────────────────────────────────────────────────

/** A meeting's code: its subsidiary's, or HQ's department (RV, HR, FIN …). */
export function takenCode(b: Pick<GuestTaken, 'guest' | 'code' | 'department'>): string {
  if (b.guest) return b.code
  return b.department ? departmentBadge(b.department).code : ''
}

/** "Department" as the schedule's window shows it: "HIN · Project", "RV · Revenue · Fair". */
export function takenDepartment(b: GuestTaken): string {
  const code = takenCode(b)
  const name = b.guest ? b.department ?? '' : b.department ? departmentBadge(b.department).label + (b.subDepartment ? ` · ${b.subDepartment}` : '') : ''
  return (code ? `${code} · ` : '') + (name || '—')
}

/** "Room 1" — the schedule's narrow column heads. */
export function shortRoomName(name: string): string {
  return name.replace('Meeting Room', 'Room')
}

export interface CalBlock {
  id: string
  title: string
  time: string
  clamp: number
  centred: boolean
  top: number
  height: number
  guest: boolean
}

/** One room's meetings on the schedule: 64px an hour, 1px in, 2px short; long titles wrap to 3 or 5 lines. */
export function calBlocks(taken: readonly GuestTaken[], room: string): CalBlock[] {
  return taken.filter(b => b.room === room).map(b => {
    const dur = b.to - b.from
    const code = takenCode(b)
    return {
      id: b.id,
      title: b.title || 'Booked',
      time: hm(b.from) + (code && dur > 30 ? ` ${code}` : ''),
      clamp: dur <= 30 ? 1 : dur <= 60 ? 3 : 5,
      centred: dur <= 30,
      top: ((b.from - G_START) / 60) * G_HOUR_PX + 1,
      height: (dur / 60) * G_HOUR_PX - 2,
      guest: b.guest,
    }
  })
}

/** The schedule window's facts. */
export function takenFacts(b: GuestTaken, roomName: string): Array<{ l: string; v: string }> {
  return [
    { l: 'Room', v: roomName },
    { l: 'Company', v: b.company || 'HOUZS Venture' },
    { l: 'Department', v: takenDepartment(b) },
    { l: 'Booked by', v: b.by ? (b.onBehalfBy ? `${b.onBehalfBy} (for ${b.by})` : b.by) : '—' },
    { l: 'People', v: `${b.pax || 0} pax` },
  ]
}

// ── The finished booking, and the desktop preview ─────────────────────────

export function bookedFacts(b: GuestBooked): Array<{ l: string; v: string }> {
  return [
    { l: 'Room', v: b.roomName },
    { l: 'When', v: `${shortDay(b.day)} · ${hm(b.from)}–${hm(b.to)}` },
    { l: 'Meeting', v: b.title },
    { l: 'People', v: `${b.pax} pax` },
    { l: 'Booked by', v: [b.name, b.company, b.department].filter(Boolean).join(' · ') },
  ]
}

export interface PreviewRow {
  l: string
  v: string
  filled: boolean
}

const pvRow = (l: string, v: string): PreviewRow => ({ l, v: v || 'Not filled yet', filled: !!v })

/** The desktop's Preview: Who, When, Meeting — and how much of it is filled. */
export function bookingPreview(f: {
  company: string
  department: string
  name: string
  room: GuestRoom | null
  day: string
  pick: SlotPick
  title: string
  pax: number
}): { groups: Array<{ title: string; rows: PreviewRow[] }>; done: string; pct: string } {
  const slot = !!f.room && f.pick.start != null && f.pick.end != null
  const groups = [
    { title: 'Who', rows: [pvRow('Company', f.company), pvRow('Department', f.department), pvRow('Name', f.name.trim())] },
    {
      title: 'When',
      rows: [
        pvRow('Room', f.room ? f.room.name : ''),
        pvRow('Date', slot ? fullDay(f.day) : ''),
        pvRow('Time', slot ? `${hm(f.pick.start!)} – ${hm(f.pick.end!)}` : ''),
      ],
    },
    {
      title: 'Meeting',
      rows: [pvRow('Title', f.title.trim()), pvRow('People', `${f.pax} pax${f.room && f.room.seats ? ` · room seats ${f.room.seats}` : ''}`)],
    },
  ]
  const all = groups.flatMap(g => g.rows)
  const n = all.filter(r => r.filled).length
  return { groups, done: `${n} of ${all.length} filled`, pct: `${Math.round((n / Math.max(1, all.length)) * 100)}%` }
}

/** The link guests open, on this site. */
export function guestUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/g/${code}`
}

/** A guest link code as the database makes them (hv- and eight of 32 letters and digits). */
export function isGuestCode(v: unknown): v is string {
  return typeof v === 'string' && /^hv-[A-HJ-NP-Z2-9]{8}$/.test(v)
}

/** The database's last word on a clash (the bookings' exclusion constraint), in the page's words. */
export const SLOT_TAKEN = 'Someone just took that slot. Pick another time.'

/**
 * The SQLSTATEs the guest functions refuse with, in words written for the
 * guest: RAISE EXCEPTION's own (P0001), the closed link and somebody else's
 * booking (42501), and the Hiring module's refusals (22023).
 */
const GUEST_REFUSALS: ReadonlySet<string> = new Set(['P0001', '42501', '22023'])

/**
 * What a stranger on /g/<code> may read of a failed call (2026-10-11, the
 * security review's N3): the guest functions' own refusals, word for word, and
 * a clash (23P01) as the page says it. Anything else — a constraint's name,
 * "invalid input syntax for type uuid", Postgres's own "permission denied for
 * function …", a network failure — is the action's fallback sentence: the
 * database's own text never reaches somebody with no account.
 */
export function guestRefusal(error: { code?: string | null; message?: string | null } | null | undefined, fallback: string): string {
  if (!error) return fallback
  if (error.code === '23P01') return SLOT_TAKEN
  const message = typeof error.message === 'string' ? error.message.trim() : ''
  if (!message || typeof error.code !== 'string' || !GUEST_REFUSALS.has(error.code)) return fallback
  return /^permission denied\b/i.test(message) ? fallback : message
}

// ── Request manpower (the step-by-step form) ──────────────────────────────

/** One of Hiring › Form settings' fields, as the guest page asks it. */
export interface HireField {
  id: string
  label: string
  type: 'text' | 'number' | 'longtext' | 'select' | 'range' | 'file'
  /** A select's choices: the value kept, the words shown. */
  options: Array<{ v: string; label: string }>
  required: boolean
}

export interface HireGroup {
  key: 'you' | 'role' | 'req' | 'desc'
  title: string
  desc: string
  fields: HireField[]
}

const HIRE_KINDS = new Set(['text', 'number', 'longtext', 'select', 'range'])
const ROLE_IDS = ['position', 'dept', 'headcount', 'budget', 'start', 'emp', 'reason']
const REQ_IDS = ['age', 'gender', 'race']

/** The form as the database hands it (Hiring › Form settings). */
export function hireFormFromRows(v: unknown): HireField[] {
  return listOf(v, x => {
    const f = obj(x)
    if (!f || !/^[a-z][a-z0-9_]{0,40}$/.test(str(f.id)) || !str(f.label) || !HIRE_KINDS.has(str(f.type))) return null
    const options = str(f.options).split(',').map(o => o.trim()).filter(Boolean).map(o => ({ v: o, label: o }))
    return { id: str(f.id), label: str(f.label), type: str(f.type) as HireField['type'], options, required: f.required === true }
  })
}

/**
 * The role's Department is the picked company's own (2026-10-12, the user: Book a
 * meeting room was linked to Admin › Guest Link › Subsidiaries & departments,
 * Request manpower was not — "they use the same table"): Hiring › Form settings'
 * choices are HQ's, so a Carres guest was offered Finance and IT. A company with
 * none listed takes the guest's own words — Department is a core field, always
 * asked. guest_link_hire holds the same rule (mig 20261012220000).
 */
export function companyDepartment(f: HireField, sub: GuestSub | null): HireField {
  if (sub && !sub.departments.length) return { ...f, type: 'text', options: [] }
  return { ...f, type: 'select', options: (sub?.departments ?? []).map(d => ({ v: d, label: d })) }
}

/** About you, The role, Candidate requirements, Job description — the prototype's four steps (empty ones left out). `co` is the company picked. */
export function hireGroups(form: readonly HireField[], subs: readonly GuestSub[], co = ''): HireGroup[] {
  const you: HireField[] = [
    { id: '_co', label: 'Company', type: 'select', options: subs.map(s => ({ v: s.id, label: s.name })), required: true },
    { id: '_name', label: 'Your name', type: 'text', options: [], required: true },
  ]
  const sub = subs.find(s => s.id === co) ?? null
  const role = form
    .filter(f => ROLE_IDS.includes(f.id) || (!REQ_IDS.includes(f.id) && f.type !== 'longtext'))
    .map(f => (f.id === 'dept' ? companyDepartment(f, sub) : f))
  const req = form.filter(f => REQ_IDS.includes(f.id))
  const desc: HireField[] = [
    ...form.filter(f => f.type === 'longtext'),
    { id: '_file', label: 'Attach a job description', type: 'file', options: [], required: false },
  ]
  const groups: HireGroup[] = [
    { key: 'you', title: 'About you', desc: 'So HR knows who to reply to.', fields: you },
    { key: 'role', title: 'The role', desc: '', fields: role },
    { key: 'req', title: 'Candidate requirements', desc: 'Leave as Any if it does not matter.', fields: req },
    { key: 'desc', title: 'Job description', desc: 'Type it, attach a file, or both.', fields: desc },
  ]
  return groups.filter(g => g.fields.length)
}

/** A short choice (five or fewer, not the company or its department — a dropdown, as Book a meeting room's) is a row of pills. */
export function isChips(f: HireField): boolean {
  return f.type === 'select' && f.options.length <= 5 && f.id !== '_co' && f.id !== 'dept'
}

/** Long text, the file, and a row of more than three pills take the whole width. */
export function spansRow(f: HireField): boolean {
  return f.type === 'longtext' || f.type === 'file' || (isChips(f) && f.options.length > 3)
}

const HIRE_PLACEHOLDER: Record<string, string> = {
  position: 'e.g. Warehouse Assistant',
  budget: 'e.g. 2,500 – 3,000',
  jd: 'What will they do day to day?',
  notes: 'Anything HR should know — shifts, driving licence, languages',
}

export function hirePlaceholder(f: HireField): string {
  if (f.id === 'dept') return f.type === 'select' ? 'Choose…' : 'e.g. Operations'
  return HIRE_PLACEHOLDER[f.id] ?? (f.type === 'select' ? 'Choose…' : '')
}

/** Whether a field is answered — a range needs one end, the file a file. */
export function hireFilled(f: HireField, answers: Readonly<Record<string, string>>, file: string | null): boolean {
  if (f.type === 'file') return !!file
  return String(answers[f.id] ?? '').replace('–', '').trim() !== ''
}

/** "Fill in Position, Headcount." — the required fields here still empty. */
export function hireMissing(fields: readonly HireField[], answers: Readonly<Record<string, string>>, file: string | null): string | null {
  const miss = fields.filter(f => f.required && !hireFilled(f, answers, file)).map(f => f.label)
  return miss.length ? `Fill in ${miss.join(', ')}.` : null
}

/** A field's answer in words ("—" when empty): the company's name, the file's name. */
export function hireValue(f: HireField, answers: Readonly<Record<string, string>>, file: string | null): string {
  if (f.type === 'file') return file || '—'
  const v = String(answers[f.id] ?? '').replace(/^–$/, '')
  if (!v) return '—'
  if (f.type === 'select') return f.options.find(o => o.v === v)?.label ?? v
  return v
}

/** What HR will see, filled in as the guest goes — the desktop's Preview. */
export function hirePreview(groups: readonly HireGroup[], answers: Readonly<Record<string, string>>, file: string | null) {
  const out = groups.map(g => ({
    title: g.title,
    rows: g.fields.map(f => {
      const v = hireValue(f, answers, file)
      const shown = v === '—' ? '' : f.id === 'budget' ? `RM ${v.replace('–', ' – ')}` : v
      return { l: f.type === 'file' ? 'Attachment' : f.label, v: shown || 'Not filled yet', filled: !!shown }
    }),
  }))
  const all = out.flatMap(g => g.rows)
  const n = all.filter(r => r.filled).length
  return { groups: out, done: `${n} of ${all.length} filled`, pct: `${Math.round((n / Math.max(1, all.length)) * 100)}%` }
}

/** The answers the Hiring module keeps: the form's own fields, not the page's (_co, _name, _file). */
export function hireAnswers(answers: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(answers).filter(([k, v]) => !k.startsWith('_') && String(v ?? '').trim() !== ''))
}

/** A file a guest may attach: PDF, Word or a photo, up to 100 MB (the bucket's own limits, mig 20261024006700). */
export function attachable(name: string, size: number): { ext: string } | { reason: string } {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  if (!['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) return { reason: 'Attach a PDF, a Word file or a photo.' }
  if (size > 100 * 1024 * 1024) return { reason: 'Attach a file up to 100 MB.' }
  return { ext }
}

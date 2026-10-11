/**
 * Meeting rooms (2026-10-11, the HR revamp's second package — README §14,
 * `Revenue App.dc.html` lines 890–938 and the drawers at 1284–1332): what the
 * pages draw, worked out from what the database answers. Pure — the portal's
 * Admin › Meeting Rooms, the Guest Link page, the HR app and the Revenue app
 * all read bookings through these.
 *
 * A day runs 08:00–20:00 in half hours (minutes from midnight, 480–1200), a
 * booking is drawn 52px an hour on the portal's grid. HQ departments and the
 * guest link's subsidiaries each have a three-letter code and a tone.
 */

/** The schedule's day: 08:00 to 20:00, in half hours. */
export const DAY_START = 480
export const DAY_END = 1200
export const SLOT = 30
/** The portal grid's height of one hour. */
export const HOUR_PX = 52

export type RoomsSource = 'portal' | 'app' | 'hr_app' | 'guest'

export interface Room {
  id: string
  name: string
  seats: number
  location: string
  facilities: string
  bookable: boolean
  guestBookable: boolean
  /** Live bookings from today on (the Rooms tab only). */
  upcoming?: number
}

export interface Attendee {
  id: string
  name: string
  department: string | null
}

export interface OutsideGuest {
  name: string
  company: string
}

export interface BookingEvent {
  what: string
  at: string
  who: string
  note: string
}

export interface Booking {
  id: string
  ref: string
  room: string
  roomName: string
  day: string
  from: number
  to: number
  title: string
  source: RoomsSource
  departmentId: string | null
  department: string | null
  subDepartment: string | null
  bookedBy: string
  bookedByStaff: string | null
  /** Who made it, when it is for somebody else (Booked by) — drawn "Grace (for Chea Huan)" (mig 20261011150000). */
  onBehalfBy: string | null
  /** The account that placed it, or the person it is for, is the reader. */
  mine: boolean
  /** The reader may change or cancel it: theirs, or a guest-link booking for Meeting rooms · Edit. */
  canChange: boolean
  internal: Attendee[]
  guests: OutsideGuest[]
  pax: number
  guestCompany: string | null
  guestDepartment: string | null
  guestCode: string | null
  cancelled: boolean
  events: BookingEvent[]
}

export interface RoomsRange {
  from: string
  to: string
  today: string
  /** The rooms open for booking, in their order. */
  rooms: Room[]
  bookings: Booking[]
}

export interface RoomsPerson {
  id: string
  name: string
  departmentId: string | null
  department: string | null
  title: string | null
}

export interface RoomsPeople {
  me: { staffId: string; name: string; departmentId: string | null; department: string | null; subDepartmentId: string | null } | null
  /** The signed-in account's own name (an account with no staff record books as itself). */
  account: string
  canBook: boolean
  canManage: boolean
  people: RoomsPerson[]
  departments: Array<{ id: string; name: string }>
  subDepartments: Array<{ id: string; name: string; departmentId: string | null }>
}

// ── Reading what the database answered ────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const SOURCES: readonly RoomsSource[] = ['portal', 'app', 'hr_app', 'guest']

export function roomFromRow(v: unknown): Room | null {
  if (!isObj(v) || !v.id) return null
  return {
    id: str(v.id),
    name: str(v.name),
    seats: num(v.seats),
    location: str(v.location),
    facilities: str(v.facilities),
    bookable: v.bookable !== false,
    guestBookable: v.guestBookable === true,
    ...(v.upcoming !== undefined ? { upcoming: num(v.upcoming) } : {}),
  }
}

export function bookingFromRow(v: unknown): Booking | null {
  if (!isObj(v) || !v.id) return null
  const source = SOURCES.includes(v.source as RoomsSource) ? (v.source as RoomsSource) : 'portal'
  return {
    id: str(v.id),
    ref: str(v.ref),
    room: str(v.room),
    roomName: str(v.roomName),
    day: str(v.day).slice(0, 10),
    from: num(v.from),
    to: num(v.to),
    title: str(v.title),
    source,
    departmentId: strOrNull(v.departmentId),
    department: strOrNull(v.department),
    subDepartment: strOrNull(v.subDepartment),
    bookedBy: str(v.bookedBy),
    bookedByStaff: strOrNull(v.bookedByStaff),
    onBehalfBy: strOrNull(v.onBehalfBy),
    mine: v.mine === true,
    canChange: v.canChange === true,
    internal: list(v.internal).filter(isObj).map(a => ({ id: str(a.id), name: str(a.name), department: strOrNull(a.department) })),
    guests: list(v.guests).filter(isObj).map(g => ({ name: str(g.name), company: str(g.company) })),
    pax: num(v.pax),
    guestCompany: strOrNull(v.guestCompany),
    guestDepartment: strOrNull(v.guestDepartment),
    guestCode: strOrNull(v.guestCode),
    cancelled: v.cancelled === true,
    events: list(v.events).filter(isObj).map(e => ({ what: str(e.what), at: str(e.at), who: str(e.who), note: str(e.note) })),
  }
}

export function rangeFromRow(v: unknown): RoomsRange | null {
  if (!isObj(v)) return null
  return {
    from: str(v.from).slice(0, 10),
    to: str(v.to).slice(0, 10),
    today: str(v.today).slice(0, 10),
    rooms: list(v.rooms).map(roomFromRow).filter((r): r is Room => !!r),
    bookings: list(v.bookings).map(bookingFromRow).filter((b): b is Booking => !!b),
  }
}

export function roomsFromRow(v: unknown): Room[] {
  return list(v).map(roomFromRow).filter((r): r is Room => !!r)
}

export function peopleFromRow(v: unknown): RoomsPeople | null {
  if (!isObj(v)) return null
  const me = isObj(v.me) && v.me.staffId
    ? {
        staffId: str(v.me.staffId),
        name: str(v.me.name),
        departmentId: strOrNull(v.me.departmentId),
        department: strOrNull(v.me.department),
        subDepartmentId: strOrNull(v.me.subDepartmentId),
      }
    : null
  return {
    me,
    account: str(v.account),
    canBook: v.canBook === true,
    canManage: v.canManage === true,
    people: list(v.people).filter(isObj).map(p => ({
      id: str(p.id),
      name: str(p.name),
      departmentId: strOrNull(p.departmentId),
      department: strOrNull(p.department),
      title: strOrNull(p.title),
    })),
    departments: list(v.departments).filter(isObj).map(d => ({ id: str(d.id), name: str(d.name) })),
    subDepartments: list(v.subDepartments).filter(isObj).map(d => ({ id: str(d.id), name: str(d.name), departmentId: strOrNull(d.departmentId) })),
  }
}

// ── Departments: a short name, a code and a tone ─────────────────────────

/** The sidebar's five tones (README §1): a light tile and a deep bar. */
export const TONES = {
  walnut: { light: 'rgb(239 228 217)', deep: 'rgb(75 48 36)' },
  clay: { light: 'rgb(249 231 216)', deep: 'rgb(163 78 37)' },
  gold: { light: 'rgb(246 237 213)', deep: 'rgb(125 91 32)' },
  olive: { light: 'rgb(238 240 226)', deep: 'rgb(88 98 68)' },
  slate: { light: 'rgb(230 237 241)', deep: 'rgb(78 101 116)' },
} as const
export type Tone = keyof typeof TONES

export interface Badge {
  /** How the department reads on the page ("Revenue", "HR", "Finance"). */
  label: string
  code: string
  tone: Tone
}

/**
 * HQ's departments (README §14: Revenue RV slate, HR clay, Finance FIN gold;
 * the rest of the real list from the same palette). The guest link's
 * subsidiaries are olive and carry their own codes.
 */
const HQ: ReadonlyArray<{ match: RegExp; label: string | null; code: string; tone: Tone }> = [
  { match: /^revenue/i, label: 'Revenue', code: 'RV', tone: 'slate' },
  { match: /^hr$|^human/i, label: 'HR', code: 'HR', tone: 'clay' },
  { match: /^finance/i, label: 'Finance', code: 'FIN', tone: 'gold' },
  { match: /^marketing/i, label: null, code: 'MKT', tone: 'walnut' },
  { match: /^it$/i, label: null, code: 'IT', tone: 'slate' },
  { match: /^director office/i, label: null, code: 'DO', tone: 'walnut' },
  { match: /^director/i, label: null, code: 'DIR', tone: 'walnut' },
  { match: /^venture office/i, label: null, code: 'VO', tone: 'gold' },
]

/** Where an HQ department stands in a legend: the handoff's Revenue, HR, Finance first, then the rest. */
export function departmentRank(name: string | null | undefined): number {
  const i = HQ.findIndex(h => h.match.test((name ?? '').trim()))
  return i < 0 ? HQ.length : i
}

/** An HQ department's label, code and tone. A name nobody listed gets its first three letters. */
export function departmentBadge(name: string | null | undefined): Badge {
  const n = (name ?? '').trim()
  const hit = HQ.find(h => h.match.test(n))
  if (hit) return { label: hit.label ?? n, code: hit.code, tone: hit.tone }
  const code = n.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '—'
  return { label: n || '—', code, tone: 'walnut' }
}

/** A subsidiary from the guest link: its own code (or GST), olive. */
export function guestBadge(company: string | null | undefined, code: string | null | undefined): Badge {
  return { label: (company ?? '').trim() || 'Guest', code: (code ?? '').trim() || 'GST', tone: 'olive' }
}

/** The badge a booking is drawn with. */
export function bookingBadge(b: Pick<Booking, 'source' | 'department' | 'guestCompany' | 'guestCode' | 'subDepartment'>): Badge {
  if (b.source === 'guest') return guestBadge(b.guestCompany, b.guestCode)
  const badge = departmentBadge(b.department)
  return b.subDepartment ? { ...badge, label: `${badge.label} · ${b.subDepartment}` } : badge
}

// ── Time ──────────────────────────────────────────────────────────────────

/** 540 → "09:00". */
export function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Every half hour of the day, 08:00 to 20:00 (the From / To lists). */
export function halfHours(): Array<{ value: number; label: string }> {
  const out: Array<{ value: number; label: string }> = []
  for (let m = DAY_START; m <= DAY_END; m += SLOT) out.push({ value: m, label: hm(m) })
  return out
}

/** The hour lines on the grid's left: 08:00 … 19:00. */
export function hourLabels(): string[] {
  return Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => hm(DAY_START + i * 60))
}

/**
 * Where a press on an empty column lands: the half hour under the pointer —
 * the one the pointer lights (2026-10-11), so 19:30 is the last, as the HR
 * app's. It used to stop at 19:00 (the prototype's `Math.min(m, H1·60 − 60)`),
 * which opened 19:00 under a lit 19:30.
 */
export function slotAt(offsetY: number, columnHeight: number): number {
  const span = DAY_END - DAY_START
  const raw = DAY_START + Math.floor((((offsetY / Math.max(1, columnHeight)) * span) / SLOT)) * SLOT
  return Math.max(DAY_START, Math.min(raw, DAY_END - SLOT))
}

/**
 * The half hours of a room's day no live meeting takes — where pointing lights
 * a slot and pressing opens Book. Meetings run in whole half hours.
 */
export function freeHalfHours(bookings: readonly Booking[], room: string, day: string): number[] {
  const taken = bookings.filter(b => !b.cancelled && b.room === room && b.day === day)
  const out: number[] = []
  for (let m = DAY_START; m < DAY_END; m += SLOT) {
    if (!taken.some(b => b.from < m + SLOT && m < b.to)) out.push(m)
  }
  return out
}

/** A booking's box on the portal grid (1px in from the line above, 3px short of the next). */
export function blockBox(from: number, to: number, hourPx = HOUR_PX): { top: number; height: number } {
  return { top: ((from - DAY_START) / 60) * hourPx + 1, height: ((to - from) / 60) * hourPx - 3 }
}

/** The drawer's From change: the end moves with it when it would no longer be after the start. */
export function withFrom(from: number, to: number): { from: number; to: number } {
  return { from, to: to <= from ? Math.min(from + 60, DAY_END) : to }
}

// ── Days ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parts = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const { y, m, d } = parts(v)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** "2026-10-10" + 1 → "2026-10-11". */
export function shiftDay(day: string, n: number): string {
  const { y, m, d } = parts(day)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** The day an address asks for: its `?day=` when that is a day, else today. */
export function dayOfSearch(search: string, today: string): string {
  const day = new URLSearchParams(search).get('day')
  return isDay(day) ? day : today
}

/** The address showing a day: `?day=` beside the rest of the query, none for today. */
export function dayHref(pathname: string, search: string, day: string, today: string): string {
  const params = new URLSearchParams(search)
  if (day === today) params.delete('day')
  else params.set('day', day)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** "Sat, 10 Oct 2026" (en-GB's order, a three-letter month). */
export function dayLabel(day: string): string {
  const { y, m, d, dow } = parts(day)
  return `${WEEKDAYS[dow]}, ${d} ${MONTHS[m - 1]} ${y}`
}

/** "Sat, 10 Oct" — the guest page and the phone apps. */
export function shortDayLabel(day: string): string {
  const { m, d, dow } = parts(day)
  return `${WEEKDAYS[dow]}, ${d} ${MONTHS[m - 1]}`
}

// ── The day picker's month ────────────────────────────────────────────────

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10-11" → "2026-10". */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

/** "2026-12" + 1 → "2027-01". */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

/** "October 2026" — a period, written in full (DESIGN.md › Date format). */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/**
 * The picker's six weeks, Monday first (as the portal's other month calendar,
 * Repayment Schedule's): the 42 days from the Monday on or before the 1st, so
 * the card keeps its height from month to month.
 */
export function monthWeeks(month: string): string[] {
  const first = `${month}-01`
  const start = shiftDay(first, -((parts(first).dow + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => shiftDay(start, i))
}

/** "Sat" and "10" for a day chip. */
export function dayChip(day: string): { weekday: string; date: string } {
  const { d, dow } = parts(day)
  return { weekday: WEEKDAYS[dow], date: String(d) }
}

/** "10 Oct 2026" — a trail's date. */
export function eventDate(at: string): string {
  const t = new Date(at)
  if (Number.isNaN(t.getTime())) return at
  // The office's day (UTC+8).
  const office = new Date(t.getTime() + 8 * 3600 * 1000)
  return `${office.getUTCDate()} ${MONTHS[office.getUTCMonth()]} ${office.getUTCFullYear()}`
}

// ── People and seats ──────────────────────────────────────────────────────

/** How many are named: colleagues plus outside guests with a name. */
export function namedCount(internal: readonly unknown[], guests: ReadonlyArray<{ name: string }>): number {
  return internal.length + guests.filter(g => g.name.trim() !== '').length
}

/**
 * The Total pax box: the headcount (never under the named), the line under it
 * ("3 named + 2 more · Meeting Room 1 seats 8 · too many"), whether it is over.
 */
export function paxSummary(named: number, set: number | null, room: Pick<Room, 'name' | 'seats'> | null): {
  total: number
  line: string
  over: boolean
} {
  const total = Math.max(named, set ?? 0)
  const seats = room?.seats ?? 0
  const over = seats > 0 && total > seats
  const more = total > named ? ` + ${total - named} more` : ''
  const cap = seats > 0 && room ? ` · ${room.name} seats ${seats}${over ? ' · too many' : ''}` : ''
  return { total, line: `${named} named${more}${cap}`, over }
}

/**
 * Who booked it, as every schedule draws it (the user, 2026-10-11 — review L3):
 * "Chea Huan", or "Grace (for Chea Huan)" when Grace made it for him.
 */
export function bookerName(b: Pick<Booking, 'bookedBy' | 'onBehalfBy'>): string {
  return b.onBehalfBy ? `${b.onBehalfBy} (for ${b.bookedBy})` : b.bookedBy
}

/** Who may cancel it, by name: the person it is for, and whoever made it for them. */
export function whoMayCancel(b: Pick<Booking, 'bookedBy' | 'onBehalfBy'>): string {
  return b.onBehalfBy ? `${b.onBehalfBy} or ${b.bookedBy}` : b.bookedBy
}

/** "RV · Chea Huan · 6 pax" — a block's last line. */
export function blockWho(b: Booking): string {
  const { code } = bookingBadge(b)
  return `${code === '—' ? '' : `${code} · `}${bookerName(b)} · ${b.pax} pax`
}

/** The live booking of this room that this slot runs into, if any. */
export function clashOf(
  bookings: readonly Booking[],
  want: { id?: string | null; room: string; day: string; from: number; to: number },
): Booking | null {
  return (
    bookings.find(b => !b.cancelled && b.id !== want.id && b.room === want.room && b.day === want.day && b.from < want.to && want.from < b.to) ?? null
  )
}

/** "Meeting Room 1 is taken 09:00–10:00 by “Fair weekly sync”." */
export function clashLine(roomName: string, clash: Pick<Booking, 'from' | 'to' | 'title'>): string {
  return `${roomName} is taken ${hm(clash.from)}–${hm(clash.to)} by “${clash.title}”.`
}

/** "7 meetings" / "1 meeting" / "No meetings". */
export function meetingCount(n: number): string {
  return n === 0 ? 'No meetings' : `${n} ${n === 1 ? 'meeting' : 'meetings'}`
}

/** "2 upcoming bookings" / "1 upcoming booking" / "No upcoming bookings". */
export function upcomingLine(n: number): string {
  return n ? `${n} upcoming booking${n === 1 ? '' : 's'}` : 'No upcoming bookings'
}

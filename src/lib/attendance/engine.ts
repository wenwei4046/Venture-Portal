import type {
  AttAssignment,
  AttConfig,
  AttLeaveType,
  AttLedger,
  AttMonth,
  AttPerson,
  AttPolicy,
  AttSchedule,
  LeaveGroup,
  ScheduleDay,
} from './types'

/**
 * What a day IS for a person (2026-10-15, HR › Attendance): worked out from
 * the facts — who clocks and on which schedule (Settings › Who clocks, by
 * person → title → company, effective-dated), the holidays and whole days, the
 * approved leave, the punches, and HR's corrections, which win over everything.
 * Pure: the pages, Month close and the register all reckon through here
 * ("TS reckons, SQL writes atomically").
 *
 * Codes (the prototype's legend): P present · L late · A absent · I incomplete
 * (IN, no OUT) · a leave code (AL, SL…) · `AL?` leave waiting · H public
 * holiday · CH company holiday · SO special off · W weekend / off / rest day ·
 * `·` not in yet (today) · '' not counted (before the assignment, the future,
 * or a person who does not clock).
 */

// ── Dates (strings, no time zones) ──────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number]
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (iso: string) => {
  const [y, m, d] = parts(iso)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
export const addDays = (iso: string, n: number) => {
  const [y, m, d] = parts(iso)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}
export const daysInMonth = (month: string) => {
  const [y, m] = parts(month)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export const monthDays = (month: string) => {
  const [y, m] = parts(month)
  return Array.from({ length: daysInMonth(month) }, (_, i) => isoOf(y, m, i + 1))
}
export const firstOfMonth = (iso: string) => iso.slice(0, 8) + '01'
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
export const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const monAbbr = (iso: string) => MON[parts(iso)[1] - 1]
export const monthName = (iso: string) => MONTH[parts(iso)[1] - 1]
export const wd3 = (iso: string) => WD3[weekday(iso)]
/** "Wed 14 Oct" */
export const shortDay = (iso: string) => `${wd3(iso)} ${parts(iso)[2]} ${monAbbr(iso)}`
/** "14 Oct" */
export const dayMon = (iso: string) => `${parts(iso)[2]} ${monAbbr(iso)}`
/** "1 Nov 2026" */
export const dayMonYear = (iso: string) => `${parts(iso)[2]} ${monAbbr(iso)} ${parts(iso)[0]}`
/** "Wednesday 14 October" */
export const longDay = (iso: string) => `${WDL[weekday(iso)]} ${parts(iso)[2]} ${MONTH[parts(iso)[1] - 1]}`
/** "October 2026" */
export const monthLabel = (month: string) => `${monthName(month)} ${parts(month)[0]}`

// ── Initials and the tone a name gets (the prototype's tint()) ──────────────

export type Tone = 'clay' | 'slate' | 'olive' | 'gold' | 'walnut'
const TINTS: Tone[] = ['clay', 'slate', 'olive', 'gold', 'walnut']
export function tint(name: string): { tone: Tone; ini: string } {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { tone: TINTS[h % TINTS.length], ini: name.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('') }
}
/** The avatar colours of a tone: tile and ink. */
export const toneVars = (t: Tone) => ({ avBg: `rgb(var(--tone-${t}))`, avFg: `rgb(var(--tone-${t}-deep))` })

// ── Who clocks, on what ─────────────────────────────────────────────────────

const LEVEL_RANK = { person: 3, title: 2, company: 1 } as const

/** The assignment in force for a person on a day: person over title over company, the latest `from` within each. */
export function assignmentFor(person: AttPerson, day: string, assignments: readonly AttAssignment[]): AttAssignment | null {
  let best: AttAssignment | null = null
  for (const a of assignments) {
    if (a.from > day) continue
    const hits = a.level === 'company' || (a.level === 'title' && a.titleId === person.titleId) || (a.level === 'person' && a.staffId === person.id)
    if (!hits) continue
    if (!best || LEVEL_RANK[a.level] > LEVEL_RANK[best.level] || (a.level === best.level && a.from > best.from)) best = a
  }
  return best
}

export function policyOn(day: string, policies: readonly AttPolicy[]): AttPolicy | null {
  let p: AttPolicy | null = null
  for (const x of policies) if (x.from <= day && (!p || x.from > p.from)) p = x
  // Before the first version applies, the first version's values are the ones shown.
  return p ?? policies[0] ?? null
}

/** Mon..Sun rows → the row for a date. */
export function scheduleDay(schedule: AttSchedule | null | undefined, day: string): ScheduleDay | null {
  if (!schedule || schedule.days.length !== 7) return null
  return schedule.days[(weekday(day) + 6) % 7] ?? null
}

/** A holiday's states cover a location's state. */
export function statesCover(states: string, state: string | null | undefined): boolean {
  if (!states || states === 'All') return true
  if (states === 'All except Sarawak') return state !== 'Sarawak'
  return !state || states === state
}

// ── The day ─────────────────────────────────────────────────────────────────

export interface DayInfo {
  code: string
  in: string | null
  out: string | null
  lateMin: number
  /** Minutes worked less the break, when both ends are known. */
  workedMin: number | null
  tracked: boolean
  assignment: AttAssignment | null
  schedule: AttSchedule | null
  sday: ScheduleDay | null
  /** HR changed it (Records / the calendar). */
  edited: boolean
  note: string | null
  holiday: string | null
  /** The punch flags: outside every fence, from a computer. */
  flags: string[]
  place: string | null
  punchIds: { in: string | null; out: string | null }
}

export interface Ctx {
  config: AttConfig
  month: AttMonth
  today: string
  now: string
}

/** Indexes over a month, built once. */
export function indexMonth(month: AttMonth) {
  const key = (s: string, d: string) => `${s}|${d}`
  const marks = new Map(month.marks.map(m => [key(m.staffId, m.day), m]))
  const overrides = new Map(month.overrides.map(o => [o.day, o]))
  const punches = new Map<string, AttMonth['punches']>()
  for (const p of month.punches) {
    if (p.invalid) continue
    const k = key(p.staffId, p.day)
    punches.set(k, [...(punches.get(k) ?? []), p])
  }
  const decisions = new Map(month.decisions.map(d => [key(d.staffId, d.day), d]))
  return { key, marks, overrides, punches, decisions }
}

export type MonthIndex = ReturnType<typeof indexMonth>

const LEAVE_CODES = (config: AttConfig) => new Set(config.leaveTypes.map(t => t.code))

export function dayInfo(person: AttPerson, day: string, ctx: Ctx, idx: MonthIndex = indexMonth(ctx.month)): DayInfo {
  const { config, today, now } = ctx
  const assignment = assignmentFor(person, day, config.assignments)
  const schedule = assignment?.scheduleId ? config.schedules.find(s => s.id === assignment.scheduleId) ?? null : null
  const location = assignment?.locationId ? config.locations.find(l => l.id === assignment.locationId) ?? null : null
  const sday = scheduleDay(schedule, day)
  const base: DayInfo = {
    code: '', in: null, out: null, lateMin: 0, workedMin: null, tracked: false, assignment, schedule, sday, edited: false,
    note: null, holiday: null, flags: [], place: null, punchIds: { in: null, out: null },
  }
  if (!assignment || assignment.mode === 'off') return base
  base.tracked = true
  const policy = policyOn(day, config.policies)
  const grace = policy?.graceMin ?? 5
  const brk = sday?.break ?? 0
  const worked = (a: string | null, b: string | null) => (a && b ? Math.max(0, toMin(b) - toMin(a) - brk) : null)

  // HR's correction wins.
  const mark = idx.marks.get(idx.key(person.id, day))
  if (mark) {
    return { ...base, code: mark.code, in: mark.in, out: mark.out, edited: true, note: mark.note, workedMin: worked(mark.in, mark.out),
      lateMin: mark.code === 'L' && mark.in && sday?.start ? Math.max(0, toMin(mark.in) - toMin(sday.start)) : 0 }
  }
  // Leave: approved first, then waiting.
  const leave = ctx.month.leave.filter(l => l.staffId === person.id && l.from <= day && l.to >= day)
  const lt = (code: string) => config.leaveTypes.find(t => t.code === code)
  const offDay = sday ? sday.type !== 'work' : false
  const override = idx.overrides.get(day)
  const hol = config.holidays.find(h => h.day === day && statesCover(h.states, location?.state))
  const approved = leave.find(l => l.status === 'approved')
  if (approved && !(lt(approved.code)?.counts !== 'calendar' && (offDay || hol))) return { ...base, code: approved.code }
  // Whole days and holidays.
  if (override && override.code !== 'WD') return { ...base, code: override.code, holiday: override.name || null }
  if (hol && !override) return { ...base, code: 'H', holiday: hol.name }
  if (offDay && override?.code !== 'WD') return { ...base, code: 'W' }
  const pending = leave.find(l => l.status === 'pending')
  if (pending) return { ...base, code: `${pending.code}?` }
  if (day > today) return base
  if (!sday && !schedule) {
    // Clocking with no schedule: punches still tell presence.
  }
  if (assignment.mode === 'no_clock') return { ...base, code: 'P', in: sday?.start ?? null, out: sday?.end ?? null, workedMin: worked(sday?.start ?? null, sday?.end ?? null) }

  const ps = idx.punches.get(idx.key(person.id, day)) ?? []
  const ins = ps.filter(p => p.dir === 'in')
  const outs = ps.filter(p => p.dir === 'out')
  const first = ins[0] ?? null
  const last = outs[outs.length - 1] ?? null
  const flags: string[] = []
  if (first && first.inside === false) flags.push('Outside fence')
  if (first && first.source === 'web') flags.push('From a computer')
  const loc = first?.locationId ? config.locations.find(l => l.id === first.locationId) : null
  const place = first ? (assignment.anywhere && !loc ? (first.distance != null ? `${first.distance} m` : 'Anywhere')
    : loc ? (first.inside === false ? `${(Number(first.distance ?? 0) / 1000).toFixed(1)} km from ${loc.name}` : `${loc.name} · ${first.distance ?? 0} m`) : null) : null
  if (!first) {
    if (day < today) return { ...base, code: 'A', flags }
    return { ...base, code: '·', flags }
  }
  const startMin = sday?.start ? toMin(sday.start) : null
  const lateMin = startMin !== null ? Math.max(0, toMin(first.time) - startMin) : 0
  const late = startMin !== null && toMin(first.time) > startMin + grace
  const code = !last && day < today ? 'I' : late ? 'L' : 'P'
  void now
  return { ...base, code, in: first.time, out: last?.time ?? null, lateMin: late ? lateMin : 0, workedMin: worked(first.time, last?.time ?? null),
    flags, place, punchIds: { in: first.id, out: last?.id ?? null } }
}

// ── Month tallies ───────────────────────────────────────────────────────────

export function tally(codes: readonly string[], leaveCodes: ReadonlySet<string>) {
  let inD = 0, late = 0, leave = 0, abs = 0
  for (const c of codes) {
    if (c === 'P' || c === 'L' || c === 'I') inD++
    if (c === 'L') late++
    if (leaveCodes.has(c)) leave++
    if (c === 'A') abs++
  }
  return { inD, late, leave, abs }
}

/** The people a month counts: those who clock (or keep fixed hours) on any day of it. */
export function trackedPeople(ctx: Ctx, days: readonly string[]): AttPerson[] {
  return ctx.config.people.filter(p => days.some(d => {
    const a = assignmentFor(p, d, ctx.config.assignments)
    return !!a && a.mode !== 'off'
  }))
}

export function monthGrid(ctx: Ctx) {
  const idx = indexMonth(ctx.month)
  const days = monthDays(ctx.month.month)
  const leaveCodes = LEAVE_CODES(ctx.config)
  const people = trackedPeople(ctx, days)
  return {
    days,
    leaveCodes,
    rows: people.map(p => {
      const cells = days.map(d => dayInfo(p, d, ctx, idx))
      return { person: p, cells, t: tally(cells.map(c => c.code), leaveCodes) }
    }),
  }
}

// ── Month close: what must be decided ───────────────────────────────────────

export interface DayToDecide {
  person: AttPerson
  day: string
  code: 'A' | 'I'
  info: DayInfo
  decision: string | null
}

export function daysToDecide(ctx: Ctx): DayToDecide[] {
  const idx = indexMonth(ctx.month)
  const out: DayToDecide[] = []
  const g = monthGrid(ctx)
  for (const r of g.rows) {
    r.cells.forEach((c, i) => {
      if (c.code !== 'A' && c.code !== 'I') return
      const day = g.days[i]
      out.push({ person: r.person, day, code: c.code, info: c, decision: idx.decisions.get(idx.key(r.person.id, day))?.decision ?? null })
    })
  }
  return out
}

/** The register frozen on close: one row per person. */
export function registerOf(ctx: Ctx) {
  const idx = indexMonth(ctx.month)
  const g = monthGrid(ctx)
  return g.rows.map(r => {
    let unpaid = 0
    let workedMin = 0
    r.cells.forEach((c, i) => {
      if (c.workedMin) workedMin += c.workedMin
      const d = idx.decisions.get(idx.key(r.person.id, g.days[i]))
      if (d?.decision === 'Unpaid') unpaid++
      if (c.code === 'UL') unpaid++
    })
    return { staffId: r.person.id, name: r.person.name, code: r.person.code, days: r.t.inD, late: r.t.late, leave: r.t.leave, absent: r.t.abs, unpaid, hours: Math.round(workedMin / 6) / 10 }
  })
}

// ── Leave: entitlement, accrual, balance ────────────────────────────────────

/** Whole years of service on a date (0 without a hire date). */
export function yearsOfService(hireDate: string | null, on: string): number {
  if (!hireDate || hireDate > on) return 0
  const [hy, hm, hd] = parts(hireDate)
  const [y, m, d] = parts(on)
  let yrs = y - hy
  if (m < hm || (m === hm && d < hd)) yrs--
  return Math.max(0, yrs)
}

/** Years of service with one decimal (the lists' "6 y", "0.6 y"). */
export function serviceYears(hireDate: string | null, on: string): number | null {
  if (!hireDate || hireDate > on) return null
  const ms = Date.parse(on) - Date.parse(hireDate)
  return Math.round((ms / (365.25 * 86400000)) * 10) / 10
}

export function groupFor(person: AttPerson, groups: readonly LeaveGroup[]): number {
  return groups.findIndex(g =>
    (g.titles.includes('all') || (!!person.titleId && g.titles.includes(person.titleId))) &&
    (g.levels.includes('all') || (person.level != null && g.levels.includes(String(person.level)))))
}

export function daysForGroup(g: LeaveGroup, yrs: number): number {
  return [...g.steps].sort((a, b) => a.yrs - b.yrs).filter(s => yrs >= s.yrs).reduce((_, s) => s.days, g.base)
}

/** A person's yearly entitlement of a leave type (null = not covered by any group). */
export function entitlement(person: AttPerson, type: AttLeaveType, on: string): number | null {
  const gi = groupFor(person, type.groups)
  if (gi < 0) return null
  return daysForGroup(type.groups[gi], yearsOfService(person.hireDate, on))
}

/** Completed months of a year by a date (from the hire month when hired that year). */
export function completedMonths(year: number, on: string, hireDate: string | null): number {
  const [y, m] = parts(on)
  const done = y > year ? 12 : y < year ? 0 : m - 1
  if (hireDate && Number(hireDate.slice(0, 4)) === year) return Math.max(0, done - (Number(hireDate.slice(5, 7)) - 1))
  if (hireDate && Number(hireDate.slice(0, 4)) > year) return 0
  return done
}

/** Working days (Mon–Fri) from a to b, inclusive, clipped to one year. */
export function workingDays(from: string, to: string, year?: number): number {
  let n = 0
  let d = from
  while (d <= to) {
    if (!year || Number(d.slice(0, 4)) === year) {
      const w = weekday(d)
      if (w !== 0 && w !== 6) n++
    }
    d = addDays(d, 1)
  }
  return n
}

export interface LedgerRow {
  id: string
  ref: string | null
  date: string
  dateLabel: string
  entry: string
  days: number
  /** Shown as "(2)" and not counted in the running balance. */
  pending: boolean
  by: string
  kind: 'opening' | 'accrual' | 'grant' | 'use' | 'pending' | 'adjust' | 'mark'
  left: number | null
  source: 'request' | 'ledger' | 'mark' | 'system'
}

export interface Balance {
  code: string
  name: string
  /** null = no balance (unpaid) or not covered. */
  left: number | null
  of: number | null
  used: number
  pending: number
  entitlement: number | null
  earned: number | null
  opening: number
  rows: LedgerRow[]
  covered: boolean
}

/** The balance of one leave type for one person in a year, with its ledger. */
export function balanceOf(person: AttPerson, type: AttLeaveType, config: AttConfig, ledger: AttLedger, today: string): Balance {
  const year = ledger.year
  const drawn = type.drawsFrom ? config.leaveTypes.find(t => t.code === type.drawsFrom) ?? null : null
  const src = drawn ?? type
  const on = today.slice(0, 4) === String(year) ? today : isoOf(year, 12, 31)
  const ent = src.unpaid ? null : entitlement(person, src, on)
  const rows: LedgerRow[] = []
  const codes = new Set([src.code, ...config.leaveTypes.filter(t => t.drawsFrom === src.code).map(t => t.code)])
  let earned: number | null = null
  if (!src.unpaid && ent != null) {
    if (src.accrues) {
      const months = completedMonths(year, on, person.hireDate)
      earned = Math.floor(((ent * months) / 12) * 2) / 2
      if (months > 0) rows.push({ id: 'accrual', ref: null, date: isoOf(year, 1, 1), dateLabel: `1 Jan – ${months === 12 ? '31 Dec' : `${daysInMonth(isoOf(year, months, 1))} ${MON[months - 1]}`}`,
        entry: `Accrual · ${months} month${months === 1 ? '' : 's'} × ${(ent / 12).toFixed(2)}`, days: earned, pending: false, by: 'System', kind: 'accrual', left: null, source: 'system' })
    } else {
      earned = ent
      rows.push({ id: 'grant', ref: null, date: isoOf(year, 1, 1), dateLabel: '1 Jan', entry: `Entitlement · ${year}`, days: ent, pending: false, by: 'System', kind: 'grant', left: null, source: 'system' })
    }
  }
  let opening = 0
  for (const e of ledger.entries.filter(x => x.staffId === person.id && x.code === src.code)) {
    if (e.kind === 'opening') opening += Number(e.days)
    rows.push({ id: e.id, ref: e.ref, date: e.date, dateLabel: dayMon(e.date), entry: e.kind === 'opening' ? `Opening · ${e.note}` : `Adjustment · ${e.note}`,
      days: Number(e.days), pending: false, by: e.by, kind: e.kind, left: null, source: 'ledger' })
  }
  let used = 0
  let pending = 0
  for (const r of ledger.leave.filter(x => x.staffId === person.id && codes.has(x.code))) {
    const n = r.days != null && r.from.slice(0, 4) === r.to.slice(0, 4) ? Number(r.days) : workingDays(r.from, r.to, year)
    const label = r.from === r.to ? dayMon(r.from) : `${dayMon(r.from)} – ${dayMon(r.to)}`
    if (r.status === 'pending') {
      pending += n
      rows.push({ id: r.id, ref: r.ref, date: r.from, dateLabel: label, entry: 'Pending · not deducted yet', days: -n, pending: true, by: 'Waiting', kind: 'pending', left: null, source: 'request' })
    } else {
      used += n
      const approvers = r.steps.filter(s => s.state === 'approved').map(s => s.decidedBy ?? s.approver)
      rows.push({ id: r.id, ref: r.ref, date: r.from, dateLabel: label, entry: r.onBehalf && r.steps.length === 1 && r.steps[0].onBehalf ? 'Taken · booked by HR' : `Taken · approved request${r.code !== src.code ? ` (${r.code})` : ''}`,
        days: -n, pending: false, by: approvers[approvers.length - 1] ?? r.by, kind: 'use', left: null, source: 'request' })
    }
  }
  for (const m of ledger.marks.filter(x => x.staffId === person.id && codes.has(x.code))) {
    used += 1
    rows.push({ id: `mark:${m.day}`, ref: null, date: m.day, dateLabel: dayMon(m.day), entry: `Set in Records · ${m.note}`, days: -1, pending: false, by: m.by, kind: 'mark', left: null, source: 'mark' })
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'opening' ? -1 : b.kind === 'opening' ? 1 : 0))
  if (src.unpaid) {
    return { code: type.code, name: type.name, left: null, of: null, used, pending, entitlement: null, earned: null, opening: 0, rows: rows.map(r => ({ ...r, left: null })), covered: true }
  }
  let run = 0
  for (const r of rows) {
    if (!r.pending) run += r.days
    r.left = r.pending ? null : Math.round(run * 100) / 100
  }
  const adjust = rows.filter(r => r.kind === 'adjust').reduce((a, r) => a + r.days, 0)
  const total = (earned ?? 0) + opening + adjust
  const left = Math.round((total - used - pending) * 100) / 100
  return { code: type.code, name: type.name, left: ent == null ? null : left, of: ent == null ? null : Math.round(total * 100) / 100, used, pending,
    entitlement: ent, earned, opening, rows, covered: ent != null }
}

/** Is a code a leave type's? */
export const isLeaveCode = (code: string, config: AttConfig) => config.leaveTypes.some(t => t.code === code)

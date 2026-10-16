import type { AttAssignment, AttLocation, AttPolicy } from '@/lib/attendance/types'
import { dur, hm, secOf } from './format'
import type { MeToday } from './types'

/**
 * Me's Today card and the punch (2026-10-17, the handoff's hub card, camera and toast): what the card says at this
 * second, where the phone is against the fences, and the toast a punch leaves. Pure — the clock ticks in the page.
 */

export interface TodayCard {
  /** "TODAY · {chip}": Work day · Late · Clocked in · Done, or what the day is when there is nothing to punch. */
  chip: string
  /** "Not in yet · starts 09:00", "IN 08:57 · worked 1 h 12 m", "IN 08:57 · OUT 18:03". */
  line: string
  /** What the button does; null hides it (the day is done, or this person does not punch today). */
  punch: 'in' | 'out' | null
  in: string | null
  out: string | null
}

/**
 * Past midnight, before the policy's cutover, the work day is still yesterday's: its clock runs on past 24:00
 * (02:30 is 26:30 of the work day). `calendarDay` is the office's date now.
 */
export const workClock = (t: Pick<MeToday, 'workDay'> | null, nowSec: number, calendarDay?: string) =>
  t && calendarDay && t.workDay && t.workDay < calendarDay ? nowSec + 86400 : nowSec

/** The card at `nowSec` (seconds of the office's day, the server's clock). Null: no People record — no Me. */
export function todayCard(t: MeToday | null, clockSec: number, calendarDay?: string): TodayCard | null {
  if (!t || !t.me) return null
  const nowSec = workClock(t, clockSec, calendarDay)
  const ins = t.punches.filter(p => p.dir === 'in')
  const outs = t.punches.filter(p => p.dir === 'out')
  const first = ins[0]?.time ?? null
  const last = outs.length ? outs[outs.length - 1].time : null
  const base = { in: first, out: last }
  if (!t.mode || t.mode === 'off') return { ...base, chip: 'Not clocking', line: 'HR has not set you to clock in', punch: null }
  const start = t.day?.type === 'work' ? t.day.start ?? null : null
  const end = t.day?.type === 'work' ? t.day.end ?? null : null
  if (t.mode === 'no_clock') {
    return { ...base, chip: 'Fixed hours', line: start && end && t.dayType === 'work' && !t.holiday ? `${start}–${end} · no punch needed` : 'No punch needed', punch: null }
  }
  if (!first) {
    if (t.onLeave) return { ...base, chip: 'On leave', line: `${t.onLeaveName ?? t.onLeave} · today`, punch: null }
    if (t.holiday) return { ...base, chip: 'Holiday', line: `${t.holiday} · not a work day`, punch: 'in' }
    if (t.dayType !== 'work') return { ...base, chip: t.dayType === 'rest' ? 'Rest day' : 'Off day', line: 'Not a work day', punch: 'in' }
    if (!start) return { ...base, chip: 'Work day', line: 'Not in yet', punch: 'in' }
    const late = nowSec > secOf(start) + (t.grace ?? 5) * 60
    return late
      ? { ...base, chip: 'Late', line: `Not in · ${Math.floor((nowSec - secOf(start)) / 60)} min past ${start}`, punch: 'in' }
      : { ...base, chip: 'Work day', line: `Not in yet · starts ${start}`, punch: 'in' }
  }
  if (!last) {
    let worked = nowSec - secOf(first)
    // Past midnight, before the cutover, it is still yesterday's work day.
    if (worked < 0) worked += 86400
    void end
    return { ...base, chip: 'Clocked in', line: `IN ${first} · worked ${dur(worked)}`, punch: 'out' }
  }
  return { ...base, chip: 'Done', line: `IN ${first} · OUT ${last}`, punch: null }
}

/** The desktop top bar's button: today's state and what pressing does ("Not in yet · Clock in"); "Me" when there is nothing to punch. */
export function topLabel(c: TodayCard | null): string {
  if (!c) return 'Me'
  if (c.punch === 'in') return `${c.chip === 'Work day' ? 'Not in yet' : c.chip} · Clock in`
  if (c.punch === 'out') return `IN ${c.in} · Clock out`
  if (c.chip === 'Done') return c.line
  return 'Me'
}

// ── Where the phone is ──────────────────────────────────────────────────────

/** Metres between two points — att_punch's own sum (the haversine on a 6,371 km earth), rounded. */
export function metres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (x: number) => (x * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(a)))
}

export interface Fence {
  loc: AttLocation
  distance: number
  inside: boolean
}

/** The nearest fence, as att_punch will find it: only fences with a point on the map. */
export function nearestFence(lat: number, lng: number, locations: readonly AttLocation[]): Fence | null {
  let best: Fence | null = null
  for (const loc of locations) {
    if (loc.lat == null || loc.lng == null) continue
    const d = metres(lat, lng, loc.lat, loc.lng)
    if (!best || d < best.distance) best = { loc, distance: d, inside: d <= loc.radius }
  }
  return best
}

/** "Jalan Puchong" out of a full address: its first part with a word in it. */
export function streetOf(address: string): string {
  return address.split(',').map(s => s.trim()).find(s => /[a-z]/i.test(s)) ?? ''
}

const away = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)

export type Position = { state: 'finding' } | { state: 'off' } | { state: 'here'; lat: number; lng: number; accuracy: number }

export interface Place {
  /** The camera's location pill. */
  line: string
  tone: 'ok' | 'flag' | 'quiet'
  /** Outside every fence where the policy flags: the shutter waits for a reason. */
  needReason: boolean
  /** Outside every fence where the policy refuses: no punch. */
  refused: boolean
  /** The toast's place: "HQ", "outside fence". */
  short: string
}

/** Where the phone stands against the fences, in the camera's words. */
export function placeOf(pos: Position, locations: readonly AttLocation[], assignment: AttAssignment | null, policy: AttPolicy | null): Place {
  if (pos.state === 'finding') return { line: 'Finding where you are…', tone: 'quiet', needReason: false, refused: false, short: 'no location' }
  if (pos.state === 'off') return { line: 'Location is off · the punch goes in without a place', tone: 'quiet', needReason: false, refused: false, short: 'no location' }
  const f = nearestFence(pos.lat, pos.lng, locations)
  if (assignment?.anywhere) {
    return { line: f ? `Anywhere · ${away(f.distance)} from ${f.loc.name}` : 'Anywhere · no fence for you', tone: 'ok', needReason: false, refused: false, short: f?.inside ? f.loc.name : 'anywhere' }
  }
  if (!f) return { line: 'No fence set by HR yet', tone: 'ok', needReason: false, refused: false, short: 'no fence' }
  if (f.inside) {
    const street = streetOf(f.loc.address)
    return { line: `${f.loc.name}${street ? ` · ${street}` : ''} · ${f.distance} m · inside the ${f.loc.radius} m fence`, tone: 'ok', needReason: false, refused: false, short: f.loc.name }
  }
  if (policy?.fenceMode === 'refuse') {
    return { line: `Outside every fence · nearest ${f.loc.name}, ${away(f.distance)}. Punches are taken only inside a fence.`, tone: 'flag', needReason: false, refused: true, short: 'outside fence' }
  }
  return { line: `Outside every fence · nearest ${f.loc.name}, ${away(f.distance)}. You can still punch; HR sees a flag.`, tone: 'flag', needReason: true, refused: false, short: 'outside fence' }
}

/** The toast a punch leaves: "IN 08:57 · HQ · on time", "IN 09:12 · HQ · late 12 min", "OUT 17:40 · HQ · early out". */
export function punchToast(dir: 'in' | 'out', clockSec: number, place: string, t: MeToday | null, calendarDay?: string): string {
  const nowSec = workClock(t, clockSec, calendarDay)
  const work = t?.day?.type === 'work' && t.dayType === 'work' && !t.holiday
  const start = work ? t?.day?.start ?? null : null
  const end = work ? t?.day?.end ?? null : null
  let status = 'on time'
  if (dir === 'in' && start && nowSec - secOf(start) > (t?.grace ?? 5) * 60) status = `late ${Math.floor((nowSec - secOf(start)) / 60)} min`
  if (dir === 'out' && end && nowSec < secOf(end)) status = 'early out'
  return `${dir.toUpperCase()} ${hm(clockSec)} · ${place} · ${status}`
}

/** Clocking out before the schedule's end: the camera's warning line. */
export function earlyOutWarning(dir: 'in' | 'out', clockSec: number, t: MeToday | null, calendarDay?: string): string | null {
  const nowSec = workClock(t, clockSec, calendarDay)
  const end = t?.day?.type === 'work' && t.dayType === 'work' && !t.holiday ? t.day.end ?? null : null
  return dir === 'out' && end && nowSec < secOf(end) ? `Before ${end} — this records an early out.` : null
}

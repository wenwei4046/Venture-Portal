// A subsidiary's own key dates (2026-10-25, mig 20261025235500 — the user's answer 14: "Key dates are each company's
// own"; asked who keeps them and whether one may repeat: "Marketing 全员，可每年重复"): kept by everybody in Marketing on
// the subsidiary's page, once or every year from their day on; drawn as ⚑ beside HR's holidays there and on the PIC's
// calendar. Pure.

import { longDay, type MktHoliday } from './board'

export interface MktKeyDate {
  /** '' where it is not sent (the PIC's calendar). */
  id: string
  /** Its day — and, when it repeats, the first of its years. */
  day: string
  name: string
  /** The words on its flag — none: its name, which the flag clips. */
  short: string | null
  yearly: boolean
}

/** A ⚑ on a day: one of the subsidiary's own key dates, or one of HR's holidays. */
export interface KeyFlag {
  day: string
  name: string
  short: string
  /** Its own key date's id — null for a holiday, or where none is sent (the PIC's calendar). */
  id: string | null
  own: boolean
}

export const KEY_NAME_MAX = 80
export const KEY_SHORT_MAX = 16
const FIRST_DAY = '2000-01-01'
const LAST_DAY = '2100-12-31'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** A real day ("2026-02-30" is not one). */
const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** mkt_key_dates(sub) and the PIC's calendar's keyDates: each with a day and a name — anything else left out. */
export function keyDatesFromRow(v: unknown): MktKeyDate[] {
  return (Array.isArray(v) ? v : []).flatMap(r => {
    if (!isObj(r) || !isDay(r.day) || typeof r.name !== 'string' || !r.name.trim()) return []
    const short = typeof r.short === 'string' && r.short.trim() ? r.short.trim() : null
    return [{ id: typeof r.id === 'string' ? r.id : '', day: r.day, name: r.name.trim(), short, yearly: r.yearly === true }]
  })
}

const leapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
/** Its day in another year — a 29 Feb on 28 Feb in a year without one. */
function sameDayIn(day: string, year: number): string {
  const md = day.slice(5)
  return `${year}-${md === '02-29' && !leapYear(year) ? '02-28' : md}`
}

/** The days a key date falls on from `from` to `to`: its own day — and, every year, the same day each year after it. */
export function keyDateDays(k: Pick<MktKeyDate, 'day' | 'yearly'>, from: string, to: string): string[] {
  if (!k.yearly) return k.day >= from && k.day <= to ? [k.day] : []
  const out: string[] = []
  for (let y = Math.max(+k.day.slice(0, 4), +from.slice(0, 4)); y <= +to.slice(0, 4); y++) {
    const d = sameDayIn(k.day, y)
    if (d >= k.day && d >= from && d <= to) out.push(d)
  }
  return out
}

/** A holiday's flag: its first word ("Christmas Day" → Christmas), as it always was. */
const holidayShort = (name: string) => name.split(/\s+/)[0].slice(0, 12) || name

/** Every ⚑ from `from` to `to`, by day — the subsidiary's own first, then HR's holidays; a holiday it keeps itself on
 * the same day (by name) shows once, as its own. */
export function keyFlags(own: readonly MktKeyDate[], holidays: readonly MktHoliday[], from: string, to: string): KeyFlag[] {
  const mine: KeyFlag[] = own.flatMap(k =>
    keyDateDays(k, from, to).map(day => ({ day, name: k.name, short: k.short ?? k.name, id: k.id || null, own: true })))
  const named = new Set(mine.map(f => `${f.day}|${f.name.toLowerCase()}`))
  const hr: KeyFlag[] = holidays
    .filter(h => h.day >= from && h.day <= to && !named.has(`${h.day}|${h.name.toLowerCase()}`))
    .map(h => ({ day: h.day, name: h.name, short: holidayShort(h.name), id: null, own: false }))
  return [...mine, ...hr].sort((a, b) => a.day.localeCompare(b.day) || Number(b.own) - Number(a.own) || a.name.localeCompare(b.name))
}

// ── The list on the subsidiary's page ────────────────────────────────────────────────────────────────────────────

export interface KeyDateRow {
  key: MktKeyDate
  /** The next day it falls on from today — null once a one-off has passed. */
  next: string | null
  /** "Wed 11 Nov 2026", its next day's (a passed one's own). */
  when: string
  /** "Every year" — its first year when that is still to come ("Every year from 2027"). */
  repeat: string | null
}

/** Its next day from today: a one-off's own until it passes; every year's this year's or next year's — never before
 * its first. */
export function nextKeyDay(k: Pick<MktKeyDate, 'day' | 'yearly'>, today: string): string | null {
  if (!k.yearly) return k.day >= today ? k.day : null
  if (k.day >= today) return k.day
  const y = +today.slice(0, 4)
  const d = sameDayIn(k.day, y)
  return d >= today ? d : sameDayIn(k.day, y + 1)
}

const dayWords = (d: string) => `${longDay(d)} ${d.slice(0, 4)}`

/** The subsidiary's key dates: those still to come by their next day, then the ones passed, the latest first. */
export function keyDateRows(keys: readonly MktKeyDate[], today: string): KeyDateRow[] {
  const rows = keys.map((key): KeyDateRow => {
    const next = nextKeyDay(key, today)
    const later = key.yearly && key.day.slice(0, 4) > today.slice(0, 4)
    return { key, next, when: dayWords(next ?? key.day), repeat: key.yearly ? (later ? `Every year from ${key.day.slice(0, 4)}` : 'Every year') : null }
  })
  const ahead = rows.filter(r => r.next).sort((a, b) => (a.next as string).localeCompare(b.next as string) || a.key.name.localeCompare(b.key.name))
  const past = rows.filter(r => !r.next).sort((a, b) => b.key.day.localeCompare(a.key.day) || a.key.name.localeCompare(b.key.name))
  return [...ahead, ...past]
}

// ── Adding and changing one ────────────────────────────────────────────────────────────────────────────────────

export interface KeyDraft {
  day: string
  name: string
  short: string
  yearly: boolean
}

export const blankKey = (day: string): KeyDraft => ({ day, name: '', short: '', yearly: false })
export const keyDraftOf = (k: MktKeyDate): KeyDraft => ({ day: k.day, name: k.name, short: k.short ?? '', yearly: k.yearly })

/** What stops it being saved, in the database's words. */
export function keyProblems(d: KeyDraft): string[] {
  const out: string[] = []
  if (!isDay(d.day) || d.day < FIRST_DAY || d.day > LAST_DAY) out.push('Pick the key date’s day.')
  const name = d.name.trim()
  if (!name) out.push('Name the key date.')
  else if (name.length > KEY_NAME_MAX) out.push(`A key date’s name is ${KEY_NAME_MAX} characters at most.`)
  if (d.short.trim().length > KEY_SHORT_MAX) out.push(`The words on its flag are ${KEY_SHORT_MAX} characters at most.`)
  return out
}

export type KeyPatch = Partial<{ day: string; name: string; short: string; yearly: boolean }>

/** What is sent: a new one in full; else only what changed — null when nothing did. */
export function keyPatch(was: KeyDraft | null, now: KeyDraft): KeyPatch | null {
  const clean = { day: now.day, name: now.name.trim(), short: now.short.trim(), yearly: now.yearly }
  if (!was) return clean
  const out: KeyPatch = {}
  if (clean.day !== was.day) out.day = clean.day
  if (clean.name !== was.name.trim()) out.name = clean.name
  if (clean.short !== was.short.trim()) out.short = clean.short
  if (clean.yearly !== was.yearly) out.yearly = clean.yearly
  return Object.keys(out).length ? out : null
}

/** A patch as the server takes it: the four keys, each of its own kind — anything else left out; null when empty. */
export function keyPatchOf(v: unknown): KeyPatch | null {
  if (!isObj(v)) return null
  const out: KeyPatch = {}
  if (typeof v.day === 'string') out.day = v.day.slice(0, 10)
  if (typeof v.name === 'string') out.name = v.name.slice(0, 200)
  if (typeof v.short === 'string') out.short = v.short.slice(0, 100)
  if (typeof v.yearly === 'boolean') out.yearly = v.yearly
  return Object.keys(out).length ? out : null
}

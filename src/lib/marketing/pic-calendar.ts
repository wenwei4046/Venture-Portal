// The PIC's own calendar (⑤-2, `PIC Calendar.dc.html`): what mkt_pic_calendar answers the stranger holding a
// subsidiary's calendar link — the dates of the work sent to that PIC, their approvals, the minutes waiting for them,
// the campaigns, the subsidiary's own key dates and HR's holidays — and, from it, the items, the list's days, the month's
// weeks with their campaign bars, the campaigns running, the banner and the legend. Pure.

import { ACCEPT_HOURS, addDays, daysBetween, mondayOf, MONTH_SHORT, shortDay, WEEKDAYS, weekdayOf, workingHours, type MktDateKind } from './board'
import { addMonths, monthOf } from './calendar'
import { keyDatesFromRow, keyFlags, type KeyFlag, type MktKeyDate } from './key-dates'

const DATE_KINDS: readonly MktDateKind[] = ['post', 'shoot', 'meeting', 'ads_live', 'ads_end', 'report']

export interface PicCalDate {
  day: string
  kind: MktDateKind
  /** The canvas field it is ("Post day"). */
  field: string
  /** The task it is of, and its product project. */
  title: string
  product: string
  /** The PIC's own link of its project — null: none to open. */
  code: string | null
  done: boolean
  /** A post marked posted: when, and the post. */
  posted: { at: string | null; link: string } | null
}

export interface PicCalApproval {
  /** Its deadline: the stage's due day. */
  day: string
  title: string
  product: string
  stage: string
  code: string | null
  /** Waiting for this PIC now — else their level is still ahead. */
  waiting: boolean
}

export interface PicCalendar {
  today: string
  from: string
  to: string
  sub: { name: string; dot: string }
  /** The PIC it is shared with. */
  pic: string
  dates: PicCalDate[]
  approvals: PicCalApproval[]
  /** A product's intake minutes waiting for them. */
  minutes: { title: string; code: string | null; sentAt: string | null }[]
  campaigns: { title: string; from: string; until: string; code: string | null }[]
  holidays: { day: string; name: string }[]
  /** The subsidiary's own key dates that may fall in the window (2026-10-25) — once, or every year. */
  keyDates: MktKeyDate[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const dayOrNull = (v: unknown) => (typeof v === 'string' && DAY_RE.test(v) ? v : null)
const codeOrNull = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : null)
const rows = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : [])

/** The calendar link's address, as the subsidiary's page shows and copies it. */
export const calendarUrl = (origin: string, code: string) => `${origin.replace(/\/$/, '')}/cal/${code}`

/** WhatsApp's words with the link. */
export const calendarMessage = (pic: string, sub: string, url: string) =>
  `Hi ${pic || 'there'}, ${sub}’s marketing calendar — what is coming up, and what waits for your approval: ${url}`

/** mkt_pic_calendar(code): the calendar, or null — the link is closed. */
export function picCalendarFromRow(v: unknown): PicCalendar | null {
  if (!isObj(v)) return null
  const today = dayOrNull(v.today), from = dayOrNull(v.from), to = dayOrNull(v.to)
  if (!today || !from || !to) return null
  const sub = isObj(v.sub) ? v.sub : {}
  const subName = str(sub.name)
  // A product project is named "<subsidiary> · <product> · <month>" (mkt_product_start); the whole page is the
  // subsidiary's, so its name goes from the front.
  const own = (t: unknown) => (subName && str(t).startsWith(`${subName} · `) ? str(t).slice(subName.length + 3) : str(t))
  return {
    today, from, to,
    sub: { name: subName, dot: /^(oklch|rgb)\([0-9. /]+\)$/.test(str(sub.dot)) ? str(sub.dot) : 'oklch(0.62 0.02 60)' },
    pic: str(v.pic),
    dates: rows(v.dates).flatMap(d => {
      const day = dayOrNull(d.day)
      const kind = DATE_KINDS.find(k => k === d.kind)
      if (!day || !kind) return []
      const posted = isObj(d.posted) && /^https?:\/\//i.test(str(d.posted.link)) ? { at: str(d.posted.at) || null, link: str(d.posted.link) } : null
      return [{ day, kind, field: str(d.field), title: own(d.title), product: own(d.product), code: codeOrNull(d.code), done: d.done === true, posted }]
    }),
    approvals: rows(v.approvals).flatMap(a => {
      const day = dayOrNull(a.day)
      return day ? [{ day, title: own(a.title), product: own(a.product), stage: str(a.stage), code: codeOrNull(a.code), waiting: a.waiting === true }] : []
    }),
    minutes: rows(v.minutes).map(m => ({ title: own(m.title), code: codeOrNull(m.code), sentAt: str(m.sentAt) || null })),
    campaigns: rows(v.campaigns).flatMap(c => {
      const a = dayOrNull(c.from), b = dayOrNull(c.until)
      return a && b && a <= b ? [{ title: own(c.title), from: a, until: b, code: codeOrNull(c.code) }] : []
    }),
    holidays: rows(v.holidays).flatMap(h => (dayOrNull(h.day) ? [{ day: str(h.day), name: str(h.name) }] : [])),
    keyDates: keyDatesFromRow(v.keyDates),
  }
}

// ── The items ──────────────────────────────────────────────────────────────────────────────────────────────

export type PicCalKind = MktDateKind | 'approve'
export type PicCalTone = 'plain' | 'live' | 'approve'

/** Each kind as the handoff's legend draws it — its words, its letter, its colour. */
export const PIC_CAL_KINDS: Readonly<Record<PicCalKind, { label: string; glyph: string; tone: PicCalTone }>> = {
  post: { label: 'Post', glyph: 'P', tone: 'plain' },
  ads_live: { label: 'Go live', glyph: '▶', tone: 'live' },
  shoot: { label: 'Shoot day', glyph: 'S', tone: 'plain' },
  approve: { label: 'Your approval', glyph: '!', tone: 'approve' },
  meeting: { label: 'Meeting', glyph: 'M', tone: 'plain' },
  ads_end: { label: 'Ads end', glyph: '■', tone: 'live' },
  report: { label: 'Report', glyph: 'R', tone: 'live' },
}
/** A field named as its kind says nothing more ("Post day" on a post). */
const KIND_FIELDS: Readonly<Record<MktDateKind, string>> = {
  post: 'Post day', shoot: 'Shoot day', meeting: 'Meeting', ads_live: 'Ads go-live', ads_end: 'Ads end', report: 'Report day',
}

export interface PicCalItem {
  key: string
  day: string
  kind: PicCalKind
  /** Its words on the card: "Post", "Your approval due tomorrow", "Overdue — please review" … */
  label: string
  glyph: string
  tone: PicCalTone
  title: string
  note: string | null
  /** Its tracking page — the PIC's own link of its project. */
  href: string | null
  /** A post marked posted: the post. */
  postLink: string | null
  /** Waiting for their approval now, and since over 4 working hours. */
  waiting: boolean
  overdue: boolean
  /** Waiting, or due by tomorrow: ringed, first of its day. */
  urgent: boolean
}

export const picLinkHref = (code: string | null) => (code ? `/t/${code}` : null)
const join = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(' · ') || null

/** Everything on the calendar, each on its day — an approval waiting since a day gone by, on today. `now` (the
 * browser's, after the page is in) says whether the minutes have waited 4 working hours — the user's answer 2. */
export function calendarItems(c: PicCalendar, now: Date | null = null): PicCalItem[] {
  const off = new Set(c.holidays.map(h => h.day))
  const dates = c.dates.map((d, i): PicCalItem => {
    const k = PIC_CAL_KINDS[d.kind]
    const state = d.kind === 'post' ? (d.posted ? 'Posted' : d.done ? 'Scheduled' : null) : null
    const field = d.field && d.field !== KIND_FIELDS[d.kind] && d.field !== k.label ? d.field : null
    return {
      key: `d${i}`, day: d.day, kind: d.kind, label: k.label, glyph: k.glyph, tone: k.tone, title: d.title,
      note: join(state, field, d.product !== d.title && d.product), href: picLinkHref(d.code), postLink: d.posted?.link ?? null,
      waiting: false, overdue: false, urgent: false,
    }
  })
  const approvals = c.approvals.map((a, i): PicCalItem => {
    const due = daysBetween(c.today, a.day)
    const label = a.waiting ? 'Waiting for your approval'
      : due === 0 ? 'Your approval due today' : due === 1 ? 'Your approval due tomorrow' : 'Your approval deadline'
    return {
      key: `a${i}`, day: a.waiting && due < 0 ? c.today : a.day, kind: 'approve', label, glyph: '!', tone: 'approve', title: a.title,
      note: join(a.stage, a.product !== a.title && a.product, a.waiting && due < 0 && `Was due ${shortDay(a.day)}`), href: picLinkHref(a.code),
      postLink: null, waiting: a.waiting, overdue: false, urgent: a.waiting || (due >= 0 && due <= 1),
    }
  })
  const minutes = c.minutes.map((m, i): PicCalItem => {
    const overdue = !!now && !!m.sentAt && workingHours(m.sentAt, now, off) >= ACCEPT_HOURS
    return {
      key: `m${i}`, day: c.today, kind: 'approve', label: overdue ? 'Overdue — please review' : 'Waiting for your approval', glyph: '!',
      tone: 'approve', title: m.title, note: 'Meeting minutes', href: picLinkHref(m.code), postLink: null, waiting: true, overdue, urgent: true,
    }
  })
  return [...minutes, ...approvals, ...dates]
}

/** A day's items: waiting and due first, then approvals, then the rest as they came. */
const dayOrder = (a: PicCalItem, b: PicCalItem) =>
  Number(b.urgent) - Number(a.urgent) || Number(b.kind === 'approve') - Number(a.kind === 'approve')
const itemsOn = (items: readonly PicCalItem[], day: string) => items.filter(i => i.day === day).sort(dayOrder)

export type PicKeyDate = KeyFlag
/** Its ⚑ over the window: the subsidiary's own key dates first, then HR's holidays. */
const flagsOf = (c: PicCalendar): PicKeyDate[] => keyFlags(c.keyDates, c.holidays, c.from, c.to)
const flagsOn = (flags: readonly PicKeyDate[], day: string): PicKeyDate[] => flags.filter(f => f.day === day)

// ── The list: what is coming up ─────────────────────────────────────────────────────────────────────────────

/** How far ahead the list looks. */
export const LIST_DAYS = 60

export interface PicListDay {
  day: string
  /** "Today", else "Mon". */
  wd: string
  n: number
  mon: string
  today: boolean
  flags: PicKeyDate[]
  items: PicCalItem[]
}

/** The days from today with something on them — the key dates too while they are on. */
export function listDays(c: PicCalendar, items: readonly PicCalItem[], keyOn: boolean): PicListDay[] {
  const end = addDays(c.today, LIST_DAYS)
  const days = new Set(items.filter(i => i.day >= c.today && i.day <= end).map(i => i.day))
  const flags = keyOn ? flagsOf(c) : []
  for (const f of flags) if (f.day >= c.today && f.day <= end) days.add(f.day)
  return [...days].sort().map(day => ({
    day, wd: day === c.today ? 'Today' : WEEKDAYS[weekdayOf(day)], n: +day.slice(8, 10), mon: MONTH_SHORT[+day.slice(5, 7) - 1],
    today: day === c.today, flags: flagsOn(flags, day), items: itemsOn(items, day),
  }))
}

/** A run in short words: "9 Nov", "9 – 12 Nov", "28 Nov – 3 Dec", "28 Dec 2026 – 3 Jan 2027". */
export function rangeWords(from: string, until: string): string {
  if (from === until) return shortDay(from)
  if (from.slice(0, 4) !== until.slice(0, 4)) return `${shortDay(from)} ${from.slice(0, 4)} – ${shortDay(until)} ${until.slice(0, 4)}`
  if (from.slice(0, 7) !== until.slice(0, 7)) return `${shortDay(from)} – ${shortDay(until)}`
  return `${+from.slice(8, 10)} – ${shortDay(until)}`
}

export interface PicCampaignRow {
  key: string
  title: string
  /** "9 – 12 Nov · running", "1 – 31 Dec · starts soon" */
  range: string
  /** How far through it is, 0–100. */
  pct: number
  href: string | null
  tone: 0 | 1
}

/** The campaigns running, and those starting within 30 days. */
export function campaignsRunning(c: PicCalendar): PicCampaignRow[] {
  const soon = addDays(c.today, 30)
  return c.campaigns.flatMap((x, i) => {
    if (x.until < c.today || x.from > soon) return []
    const started = x.from <= c.today
    const pct = started ? Math.min(100, Math.round(((daysBetween(x.from, c.today) + 1) / (daysBetween(x.from, x.until) + 1)) * 100)) : 0
    return [{ key: `c${i}`, title: x.title, range: `${rangeWords(x.from, x.until)} · ${started ? 'running' : 'starts soon'}`, pct, href: picLinkHref(x.code), tone: (i % 2) as 0 | 1 }]
  })
}

// ── The month ───────────────────────────────────────────────────────────────────────────────────────────────

/** The months the calendar holds — the first of each, from last month to three ahead. */
export function calendarMonths(c: PicCalendar): string[] {
  const out: string[] = []
  for (let m = monthOf(c.from); m <= monthOf(c.to) && out.length < 12; m = addMonths(m, 1)) out.push(m)
  return out
}

export interface PicMonthDay {
  day: string
  n: number
  /** Not of the month shown. */
  out: boolean
  today: boolean
  flags: PicKeyDate[]
  items: PicCalItem[]
}

export interface PicBar {
  key: string
  label: string
  /** Where it starts in the week and how far it runs, in % of the week; its row under the day numbers. */
  left: number
  width: number
  row: number
  /** It starts or ends in this week (its corner rounded). */
  start: boolean
  end: boolean
  href: string | null
  tone: 0 | 1
}

export interface PicWeek {
  days: PicMonthDay[]
  bars: PicBar[]
}

/** The weeks of a month, Monday first, each with the campaigns running through it as bars. */
export function monthWeeks(c: PicCalendar, items: readonly PicCalItem[], month: string, keyOn: boolean): PicWeek[] {
  const first = monthOf(month)
  const start = mondayOf(first)
  const weeks = Math.ceil(daysBetween(start, addMonths(first, 1)) / 7)
  const flags = keyOn ? flagsOf(c) : []
  return Array.from({ length: weeks }, (_, w) => {
    const ws = addDays(start, w * 7)
    const we = addDays(ws, 6)
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(ws, i)
      return { day, n: +day.slice(8, 10), out: day.slice(0, 7) !== first.slice(0, 7), today: day === c.today, flags: flagsOn(flags, day), items: itemsOn(items, day) }
    })
    const bars = c.campaigns.flatMap((x, i) => (x.from <= we && x.until >= ws ? [{ x, i }] : [])).map(({ x, i }, row): PicBar => {
      const a = x.from > ws ? x.from : ws
      const b = x.until < we ? x.until : we
      return {
        key: `c${i}-${ws}`, label: `${x.title} · ${rangeWords(x.from, x.until)}`, left: (daysBetween(ws, a) / 7) * 100,
        width: ((daysBetween(a, b) + 1) / 7) * 100, row, start: x.from >= ws, end: x.until <= we, href: picLinkHref(x.code), tone: (i % 2) as 0 | 1,
      }
    })
    return { days, bars }
  })
}

// ── The banner and the legend ───────────────────────────────────────────────────────────────────────────────

export interface PicCalBanner {
  tone: 'waiting' | 'red'
  title: string
  text: string
  href: string | null
}

/** What waits for them — the overdue first, the rest counted — else an approval due today or tomorrow. */
export function picCalBanner(c: PicCalendar, items: readonly PicCalItem[]): PicCalBanner | null {
  const waiting = items.filter(i => i.waiting)
  if (waiting.length) {
    const first = waiting.find(i => i.overdue) ?? waiting[0]
    const more = waiting.length - 1
    return {
      tone: first.overdue ? 'red' : 'waiting', title: first.overdue ? 'Overdue — please review' : 'Waiting for your approval',
      text: `${join(first.title, first.note) ?? first.title}${more ? ` · ${more} more waiting` : ''}`, href: first.href,
    }
  }
  const due = items.filter(i => i.kind === 'approve' && i.urgent).sort((a, b) => a.day.localeCompare(b.day))[0]
  if (!due) return null
  return { tone: 'waiting', title: due.label, text: `${due.title} · ${shortDay(due.day)}`, href: due.href }
}

export interface PicLegend { kind: PicCalKind | 'key'; glyph: string; label: string; tone: PicCalTone | 'key' }

/** The handoff's legend — post, go live, shoot, your approval — with any other kind on the calendar, and the key date. */
export function legendOf(items: readonly PicCalItem[]): PicLegend[] {
  const on = new Set<PicCalKind>(items.map(i => i.kind))
  const kinds = (Object.keys(PIC_CAL_KINDS) as PicCalKind[]).filter((k, i) => i < 4 || on.has(k))
  return [...kinds.map((k): PicLegend => ({ kind: k, ...PIC_CAL_KINDS[k] })), { kind: 'key', glyph: '⚑', label: 'Key date', tone: 'key' }]
}

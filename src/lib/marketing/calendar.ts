// Marketing's Calendar (`Calendar.dc.html`): the team's dates across every subsidiary — 📣 posts, ⏱ stage due dates
// (⚡ a Quick Task's, 🔁 a recurring series' next runs) and 🗓️ shoots & meetings — in a Month, Week or List; layers
// switched on and off, subsidiaries picked, "Only mine". A stage's date is red once it has passed undone; a run not
// opened yet is a draft. Posts and meetings come from the posting plans and the minutes (later modules): the layers
// are drawn, empty, until then. Pure.

import { reportDays, reportRange } from './ads'
import {
  addDays, addMonths, daysBetween, indexBoard, isSeries, longDay, mondayOf, MONTH_NAMES, MONTH_SHORT, weekdayOf, type MktBoard, type MktGroup, type MktDateKind, type MktProject, type MktSub, type MktTaskDate,
} from './board'

export { addMonths }

export type CalKind = 'post' | 'due' | 'meet' | 'ads'
export type CalTone = 'draft' | 'waiting' | 'done' | 'red' | 'meet'
export type CalView = 'month' | 'week' | 'list'

export interface CalEvent {
  id: string
  kind: CalKind
  day: string
  title: string
  sub: MktSub | null
  trackId: string | null
  /** "Stage 2 · Design", "Run 3 opens · Plan", "Reels", "10:00 · Shoot". */
  line2: string
  /** The staff on it (their People ids) — "Only mine" asks these. */
  people: string[]
  who: string
  tone: CalTone
  label: string
  icon: string
  kindLabel: string
  time: string | null
  quick: boolean
  recur: boolean
  /** The stage's group (a People title) — a subsidiary's page colours and filters by it (④-2). */
  team?: MktGroup | null
  /** A post marked posted: its link (④-2c). */
  postLink?: string | null
}

export const LAYERS: readonly { key: CalKind; icon: string; label: string }[] = [
  { key: 'post', icon: '📣', label: 'Posts' },
  { key: 'due', icon: '⏱', label: 'Stage due dates' },
  { key: 'meet', icon: '🗓️', label: 'Shoots & meetings' },
  // A task's ads and reports days (④-2c — the user's answer 16 keeps them as kinds; the handoff's three layers have none).
  { key: 'ads', icon: '📈', label: 'Ads & reports' },
]

export const LEGEND: readonly { tone: CalTone; label: string }[] = [
  { tone: 'draft', label: 'Draft' },
  { tone: 'waiting', label: 'In progress / due' },
  { tone: 'done', label: 'Posted / completed' },
  { tone: 'red', label: 'Overdue' },
  { tone: 'meet', label: 'Meeting / shoot' },
]

/** Every dated thing on the board, in day order. */
export function calendarEvents(board: MktBoard): CalEvent[] {
  const ix = indexBoard(board)
  const first = (id: string | null) => (id ? ix.person(id)?.first || ix.person(id)?.full || '—' : '—')
  const out: CalEvent[] = []
  for (const p of board.projects) {
    if (p.status === 'cancelled') continue
    const sub = ix.sub(p.sub) ?? null
    const quick = p.kind === 'quick' || (p.kind === 'recurring' && !!p.series)
    // A series' stages are the pattern its runs copy, not dates of their own.
    for (const s of isSeries(p) ? [] : ix.stagesOf(p.id)) {
      if (!s.dueOn) continue
      const done = s.status === 'done' || p.status === 'done' || s.idx < p.cur
      const who = first(s.owner)
      const tone: CalTone = done ? 'done' : board.today && s.dueOn < board.today ? 'red' : 'waiting'
      out.push({
        id: `s:${p.id}:${s.idx}`,
        kind: 'due',
        day: s.dueOn,
        title: p.title,
        sub,
        trackId: p.trackId,
        line2: `Stage ${s.idx + 1} · ${s.name}`,
        people: s.owner ? [s.owner] : [],
        who,
        tone,
        label: done ? 'Completed' : tone === 'red' ? `Overdue · ${who}` : `Due · ${who}`,
        icon: quick ? '⚡' : '⏱',
        kindLabel: p.kind === 'product' ? 'Project · stage due' : p.kind === 'deliverable' ? 'Deliverable · stage due'
          : p.kind === 'quick' ? 'Quick Task · stage due' : 'Recurring task · stage due',
        time: null,
        quick,
        recur: false,
        team: s.dept || null,
      })
    }
    // A recurring series: the runs it will open, after the one already open.
    if (isSeries(p) && p.recur && p.recur.status !== 'ended') {
      const s0 = ix.stagesOf(p.id)[0]
      const opened = new Set(board.projects.filter(x => x.series === p.id).map(x => x.run))
      p.recur.runs.forEach((d, k) => {
        if (opened.has(k + 1) || (board.today && d < board.today)) return
        const who = first(s0?.owner ?? null)
        out.push({
          id: `r:${p.id}:${k}`,
          kind: 'due',
          day: d,
          title: p.title,
          sub,
          trackId: p.trackId,
          line2: `Run ${k + 1} opens · ${s0?.name || 'Stage 1'}`,
          people: s0?.owner ? [s0.owner] : [],
          who,
          tone: 'draft',
          label: p.recur?.status === 'paused' ? 'Paused' : `Scheduled · ${who}`,
          icon: '🔁',
          kindLabel: 'Recurring task · next run',
          time: null,
          quick: false,
          recur: true,
          team: s0?.dept || null,
        })
      })
    }
  }
  // A task's dates marked for the calendar (④-2c — answers 15, 16): its posts, its shoots and meetings, its ads and reports.
  const byId = new Map(board.projects.map(p => [p.id, p]))
  for (const d of board.dates) {
    const p = byId.get(d.project)
    if (!p || p.status === 'cancelled') continue
    const s = ix.stagesOf(p.id).find(x => x.idx === d.stage) ?? null
    const owner = s?.owner ?? p.owner
    const who = first(owner)
    const k = DATE_KIND[d.kind]
    const post = d.kind === 'post' ? postState(p, d, board.today) : null
    const past = !!board.today && d.day < board.today
    const tone: CalTone = post ? post.tone : k.layer === 'meet' ? 'meet' : p.status === 'done' || past ? 'done' : 'waiting'
    out.push({
      id: `d:${p.id}:${d.stage}:${d.field}`,
      kind: k.layer,
      day: d.day,
      title: p.title,
      sub: ix.sub(p.sub) ?? null,
      trackId: p.trackId,
      line2: post ? `${d.field} · ${post.label}` : s ? `${d.field} · ${s.name}` : d.field,
      people: owner ? [owner] : [],
      who,
      tone,
      label: post ? post.label : k.label,
      icon: k.icon,
      kindLabel: k.label,
      time: null,
      quick: p.kind === 'quick',
      recur: false,
      team: s?.dept || null,
      ...(d.posted ? { postLink: d.posted.link } : {}),
    })
  }
  // Each Ads report's Report days (⑤-3c — the day after each period's last, to its last report): published, due, overdue.
  for (const a of board.ads) {
    const p = byId.get(a.project)
    if (!p || p.status === 'cancelled' || !board.today) continue
    const sent = new Set(a.published)
    // Its owner — else (the Principal made it) whoever's stage it is at, as a subsidiary's projects table says.
    const stages = ix.stagesOf(p.id)
    const owner = p.owner ?? (stages.find(s => s.idx === p.cur) ?? stages[0])?.owner ?? null
    const who = first(owner)
    for (const r of reportDays(a.every, a.startsOn, a.lastNo, board.today)) {
      const published = sent.has(r.no)
      const tone: CalTone = published ? 'done' : r.day < board.today ? 'red' : 'waiting'
      out.push({
        id: `a:${p.id}:${r.no}`,
        kind: 'ads',
        day: r.day,
        title: p.title,
        sub: ix.sub(p.sub) ?? null,
        trackId: p.trackId,
        line2: `Report #${r.no} · ${reportRange(r)}`,
        people: owner ? [owner] : [],
        who,
        tone,
        label: published ? 'Published' : tone === 'red' ? `Overdue · ${who}` : `Due · ${who}`,
        icon: DATE_KIND.report.icon,
        kindLabel: DATE_KIND.report.label,
        time: null,
        quick: p.kind === 'quick',
        recur: false,
        team: null,
      })
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id))
}

/** Where each kind of a task's date goes: its layer, its glyph, its name (answer 16's kinds). */
export const DATE_KIND: Record<MktDateKind, { layer: CalKind; icon: string; label: string }> = {
  post: { layer: 'post', icon: '📣', label: 'Post day' },
  shoot: { layer: 'meet', icon: '🎬', label: 'Shoot day' },
  meeting: { layer: 'meet', icon: '🗓️', label: 'Meeting' },
  ads_live: { layer: 'ads', icon: '📈', label: 'Ads go-live' },
  ads_end: { layer: 'ads', icon: '🛑', label: 'Ads end' },
  report: { layer: 'ads', icon: '📊', label: 'Report day' },
}

/** A post's state (answer 15 — the handoff's postStatus): Posted with its link, Scheduled once its task is done, Draft
 * while its deliverable is not planned, Overdue once its day has passed, else In production. */
export function postState(p: Pick<MktProject, 'status'>, d: Pick<MktTaskDate, 'day' | 'posted'>, today: string): { label: string; tone: CalTone } {
  if (d.posted) return { label: 'Posted', tone: 'done' }
  if (p.status === 'done') return { label: 'Scheduled', tone: 'done' }
  if (p.status === 'planning') return { label: 'Draft', tone: 'draft' }
  if (today && d.day < today) return { label: 'Overdue', tone: 'red' }
  return { label: 'In production', tone: 'waiting' }
}

export interface CalFilter {
  layers: Record<CalKind, boolean>
  /** Subsidiary ids; none = all. */
  subs: string[]
  /** One person's dates only (their People id) — "Only mine" is the viewer's. */
  who: string | null
}

export const ALL_LAYERS: Record<CalKind, boolean> = { post: true, due: true, meet: true, ads: true }

export function passes(e: CalEvent, f: CalFilter): boolean {
  return f.layers[e.kind] && (!f.subs.length || (!!e.sub && f.subs.includes(e.sub.id))) && (!f.who || e.people.includes(f.who))
}

/** The month a day is in: its first day. */
export const monthOf = (d: string) => `${d.slice(0, 7)}-01`
export const monthLabel = (d: string) => `${MONTH_NAMES[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
const daysIn = (month: string) => daysBetween(month, addMonths(month, 1))

export interface MonthCell {
  day: string
  n: number
  out: boolean
  today: boolean
  events: CalEvent[]
}

/** The weeks that hold a month, Monday first. */
export function monthCells(month: string, events: CalEvent[], today: string): MonthCell[] {
  const first = monthOf(month)
  const off = weekdayOf(first)
  const weeks = Math.ceil((off + daysIn(first)) / 7)
  const byDay = groupByDay(events)
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = addDays(first, i - off)
    return { day, n: +day.slice(8, 10), out: day.slice(0, 7) !== first.slice(0, 7), today: day === today, events: byDay.get(day) ?? [] }
  })
}

/** The seven days of the week a day is in, Monday first. */
export function weekCells(day: string, events: CalEvent[], today: string): MonthCell[] {
  const mon = mondayOf(day)
  const byDay = groupByDay(events)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i)
    return { day: d, n: +d.slice(8, 10), out: false, today: d === today, events: byDay.get(d) ?? [] }
  })
}

export const weekLabel = (day: string) => {
  const mon = mondayOf(day)
  const sun = addDays(mon, 6)
  return `${+mon.slice(8, 10)} ${MONTH_SHORT[+mon.slice(5, 7) - 1]} – ${+sun.slice(8, 10)} ${MONTH_SHORT[+sun.slice(5, 7) - 1]} ${sun.slice(0, 4)}`
}

export interface ListDay {
  day: string
  wd: string
  label: string
  today: boolean
  events: CalEvent[]
}

/** The month's days that hold something, in order. */
export function listDays(month: string, events: CalEvent[], today: string): ListDay[] {
  const ym = monthOf(month).slice(0, 7)
  return [...groupByDay(events.filter(e => e.day.slice(0, 7) === ym)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, evs]) => ({ day, wd: longDay(day).slice(0, 3), label: `${+day.slice(8, 10)} ${MONTH_SHORT[+day.slice(5, 7) - 1]}`, today: day === today, events: evs }))
}

function groupByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const m = new Map<string, CalEvent[]>()
  for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e])
  return m
}

/** The detail panel's rows. */
export function eventRows(e: CalEvent, nameOf: (id: string) => string): { k: string; v: string }[] {
  const rows = [
    { k: 'Subsidiary', v: e.sub?.name ?? '—' },
    { k: 'Date', v: longDay(e.day) + (e.time ? ` · ${e.time}` : '') },
  ]
  if (e.kind === 'due') rows.push({ k: 'Stage', v: e.line2 }, { k: 'Assignee', v: e.who })
  if (e.kind === 'post') rows.push({ k: 'Type', v: e.line2 }, { k: 'Now with', v: e.who }, ...(e.postLink ? [{ k: 'Posted', v: e.postLink }] : []))
  // An Ads report's Report day (its id a:…) says its report; a task's date its field — never a second *Date* (⑤-3c: the
  // panel keyed two rows the same).
  if (e.kind === 'ads') rows.push({ k: e.id.startsWith('a:') ? 'Report' : 'Field', v: e.line2 }, { k: 'Owner', v: e.who })
  if (e.kind === 'meet') rows.push({ k: 'Attendees', v: e.people.map(nameOf).join(', ') || '—' })
  return rows
}

/** The window the page reads around a day: four months back, eight ahead (the database answers at most 400 days). */
export function readWindow(day: string): { from: string; to: string } {
  const m = monthOf(day)
  return { from: addMonths(m, -4), to: addDays(addMonths(m, 9), -1) }
}

export const isView = (v: unknown): v is CalView => v === 'month' || v === 'week' || v === 'list'

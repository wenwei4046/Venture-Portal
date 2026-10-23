// Marketing's Calendar (`Calendar.dc.html`): the team's dates across every subsidiary — 📣 posts, ⏱ stage due dates
// (⚡ a Quick Task's, 🔁 a recurring series' next runs) and 🗓️ shoots & meetings — in a Month, Week or List; layers
// switched on and off, subsidiaries picked, "Only mine". A stage's date is red once it has passed undone; a run not
// opened yet is a draft. Posts and meetings come from the posting plans and the minutes (later modules): the layers
// are drawn, empty, until then. Pure.

import {
  addDays, daysBetween, indexBoard, isSeries, longDay, mondayOf, MONTH_NAMES, MONTH_SHORT, weekdayOf, type MktBoard, type MktDept, type MktSub,
} from './board'

export type CalKind = 'post' | 'due' | 'meet'
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
  /** The stage's team — a subsidiary's page colours and filters by it (④-2). */
  team?: MktDept | null
}

export const LAYERS: readonly { key: CalKind; icon: string; label: string }[] = [
  { key: 'post', icon: '📣', label: 'Posts' },
  { key: 'due', icon: '⏱', label: 'Stage due dates' },
  { key: 'meet', icon: '🗓️', label: 'Shoots & meetings' },
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
        kindLabel: p.kind === 'product' ? 'Project · stage due' : p.kind === 'quick' ? 'Quick Task · stage due' : 'Recurring task · stage due',
        time: null,
        quick,
        recur: false,
        team: s.dept,
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
          team: s0?.dept ?? null,
        })
      })
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id))
}

export interface CalFilter {
  layers: Record<CalKind, boolean>
  /** Subsidiary ids; none = all. */
  subs: string[]
  /** One person's dates only (their People id) — "Only mine" is the viewer's. */
  who: string | null
}

export const ALL_LAYERS: Record<CalKind, boolean> = { post: true, due: true, meet: true }

export function passes(e: CalEvent, f: CalFilter): boolean {
  return f.layers[e.kind] && (!f.subs.length || (!!e.sub && f.subs.includes(e.sub.id))) && (!f.who || e.people.includes(f.who))
}

/** The month a day is in: its first day. */
export const monthOf = (d: string) => `${d.slice(0, 7)}-01`
export const monthLabel = (d: string) => `${MONTH_NAMES[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`
export function addMonths(d: string, n: number): string {
  const y = +d.slice(0, 4)
  const m = +d.slice(5, 7) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`
}
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
  if (e.kind === 'post') rows.push({ k: 'Type', v: e.line2 }, { k: 'Now with', v: e.who })
  if (e.kind === 'meet') rows.push({ k: 'Attendees', v: e.people.map(nameOf).join(', ') || '—' })
  return rows
}

/** The window the page reads around a day: four months back, eight ahead (the database answers at most 400 days). */
export function readWindow(day: string): { from: string; to: string } {
  const m = monthOf(day)
  return { from: addMonths(m, -4), to: addDays(addMonths(m, 9), -1) }
}

export const isView = (v: unknown): v is CalView => v === 'month' || v === 'week' || v === 'list'

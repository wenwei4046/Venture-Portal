// A subsidiary's page (`Subsidiary Page.dc.html`, ④-2): where its work stands (the stat cards), its dates by Month,
// Week or Timeline — stage due dates and the runs to come, coloured by group (a People title), red once passed undone, HR's holidays as
// key dates — its projects with how far each has come, and the newest lines of their trails. All from the board
// (mkt_board) and its feed (mkt_sub_feed). Its campaigns (④-2b — the user's answer 13: a product project with a run
// period): the card of those running, the timeline's own rows with their overlaps, the days they run. Pure.

import { officeTime } from '@/lib/office-time'
import {
  addDays, daysBetween, indexBoard, mondayOf, MONTH_NAMES, MONTH_SHORT, periodWords, shortDay, type MktBoard, type MktGroup, type MktProjectKind,
  type MktTaskDate,
} from './board'
import { sameGroup } from './groups'
import type { CalEvent, CalTone } from './calendar'
import { productEventText } from './project'
import { projectRows, type ProjectRow } from './projects'
import { eventFromRow, eventText, type MktTaskPage, type TaskEvent } from './task'

// ── The stat cards ───────────────────────────────────────────────────────────────
export interface SubStat {
  key: 'campaigns' | 'posts' | 'shoots' | 'ads' | 'overdue'
  emoji: string
  label: string
  value: number
  sub: string
  red: boolean
}

/** The handoff's five cards (⑧-1): its campaigns running today (the next one's day when none is), its posts this month
 * (how many posted), its shoots this month, its ads live today, its stages overdue. */
export function subStats(board: MktBoard, sub: string, events: readonly CalEvent[]): SubStat[] {
  const overdue = events.filter(e => e.kind === 'due' && !e.recur && e.tone === 'red').length
  const month = board.today.slice(0, 7)
  const camps = subCampaigns(board, sub)
  const live = camps.filter(c => c.live).length
  const next = camps.find(c => c.from > board.today)
  const mine = new Set(board.projects.filter(p => p.sub === sub && p.status !== 'cancelled').map(p => p.id))
  const dates = board.dates.filter(d => mine.has(d.project))
  const posts = dates.filter(d => d.kind === 'post' && d.day.slice(0, 7) === month)
  const posted = posts.filter(d => d.posted).length
  return [
    { key: 'campaigns', emoji: '📢', label: 'Campaigns running', value: live, sub: !live && next ? `next ${shortDay(next.from)}` : '', red: false },
    { key: 'posts', emoji: '🖼️', label: 'Posts', value: posts.length, sub: posts.length ? `${posted} posted` : '', red: false },
    { key: 'shoots', emoji: '🎥', label: 'Shoots', value: dates.filter(d => d.kind === 'shoot' && d.day.slice(0, 7) === month).length, sub: '', red: false },
    { key: 'ads', emoji: '📣', label: 'Ads live', value: adsLive(dates, board.today), sub: '', red: false },
    { key: 'overdue', emoji: '🔴', label: 'Overdue', value: overdue, sub: overdue ? 'needs action' : '', red: overdue > 0 },
  ]
}

/** The tasks whose ads run today: an Ads go-live on or before today, and no Ads end from it until yesterday. */
export function adsLive(dates: readonly MktTaskDate[], today: string): number {
  const by = new Map<string, MktTaskDate[]>()
  for (const d of dates) if (d.kind === 'ads_live' || d.kind === 'ads_end') by.set(d.project, [...(by.get(d.project) ?? []), d])
  let n = 0
  for (const list of by.values()) {
    const went = list.filter(d => d.kind === 'ads_live' && d.day <= today).map(d => d.day).sort().at(-1)
    if (went && !list.some(d => d.kind === 'ads_end' && d.day >= went && d.day < today)) n++
  }
  return n
}

// ── The filter (the handoff's Type · Department · Status) ────────────────────────
export type SubType = 'campaign' | 'post' | 'meet' | 'ads' | 'due' | 'run'
export const SUB_TYPES: readonly { key: SubType; label: string; icon: string }[] = [
  { key: 'campaign', label: 'Campaign', icon: '📢' },
  // A task's dates (⑧-1 — answer 16).
  { key: 'post', label: 'Post', icon: '📣' },
  { key: 'meet', label: 'Shoot / meeting', icon: '🎬' },
  { key: 'ads', label: 'Ads & reports', icon: '📈' },
  { key: 'due', label: 'Stage due date', icon: '⏱' },
  { key: 'run', label: 'Recurring run', icon: '🔁' },
]
export const SUB_STATUSES: readonly { key: Exclude<CalTone, 'meet'>; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done', label: 'Approved / Done' },
  { key: 'red', label: 'Overdue' },
]
export interface SubFilter {
  types: SubType[]
  /** Groups — People titles (2026-10-24). */
  teams: MktGroup[]
  statuses: CalTone[]
}
export const NO_FILTER: SubFilter = { types: [], teams: [], statuses: [] }
export const filterCount = (f: SubFilter) => f.types.length + f.teams.length + f.statuses.length

export function passesSub(e: CalEvent, f: SubFilter): boolean {
  const type: SubType = e.kind === 'due' ? (e.recur ? 'run' : 'due') : e.kind
  return (!f.types.length || f.types.includes(type))
    && (!f.teams.length || f.teams.some(g => sameGroup(g, e.team)))
    && (!f.statuses.length || f.statuses.includes(e.tone))
}

/** A campaign through the filter: by type and status (ran = done, else waiting); a group asked hides it — a campaign is a
 * project, not one group's work. */
export function passesCampaign(c: SubCampaign, f: SubFilter): boolean {
  return (!f.types.length || f.types.includes('campaign')) && !f.teams.length && (!f.statuses.length || f.statuses.includes(c.ran ? 'done' : 'waiting'))
}

// ── Campaigns (④-2b — the user's answer 13) ──────────────────────────────────────
export interface SubCampaign {
  id: string
  trackId: string
  title: string
  /** Its title without the subsidiary's name before it. */
  short: string
  from: string
  until: string
  /** Running today. */
  live: boolean
  /** Its run is over. */
  ran: boolean
}

/** The subsidiary's campaigns (a product project with a run period, not cancelled), by their first day. */
export function subCampaigns(board: MktBoard, sub: string): SubCampaign[] {
  const name = board.subs.find(x => x.id === sub)?.name ?? ''
  const out: SubCampaign[] = []
  for (const p of board.projects) {
    if (p.sub !== sub || !p.campaign || p.status === 'cancelled' || p.parent) continue
    const { from, until } = p.campaign
    const short = name && p.title.startsWith(`${name} · `) ? p.title.slice(name.length + 3) : p.title
    out.push({ id: p.id, trackId: p.trackId, title: p.title, short, from, until, live: board.today >= from && board.today <= until, ran: board.today > until })
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.title.localeCompare(b.title))
}

/** "9 – 12 Nov", "28 Nov – 3 Dec", "9 Nov": a span within the timeline's weeks, no year. */
export const spanWords = (from: string, until: string) =>
  from === until ? shortDay(from) : from.slice(0, 7) === until.slice(0, 7) ? `${+from.slice(8, 10)} – ${shortDay(until)}` : `${shortDay(from)} – ${shortDay(until)}`

/** The campaigns running on a day (the Month's and the Week's). */
export const campaignsOn = (list: readonly SubCampaign[], day: string) => list.filter(c => c.from <= day && c.until >= day)

export interface CampaignOverlap { a: SubCampaign; b: SubCampaign; from: string; until: string }

/** Each two campaigns that run on the same days, and those days. */
export function campaignOverlaps(list: readonly SubCampaign[]): CampaignOverlap[] {
  const out: CampaignOverlap[] = []
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const from = list[i].from > list[j].from ? list[i].from : list[j].from
    const until = list[i].until < list[j].until ? list[i].until : list[j].until
    if (from <= until) out.push({ a: list[i], b: list[j], from, until })
  }
  return out
}

/** Under the timeline (the handoff's): "No campaign overlaps", or "1 overlap: Truck event overlaps Showroom Weekends (9 – 12 Nov)". */
export function overlapNote(ov: readonly CampaignOverlap[]): string {
  if (!ov.length) return 'No campaign overlaps'
  return `${ov.length} overlap${ov.length === 1 ? '' : 's'}: ${ov.map(o => `${o.a.short} overlaps ${o.b.short} (${spanWords(o.from, o.until)})`).join(', ')}`
}

// ── Key dates: HR's holidays, flagged ────────────────────────────────────────────
export interface KeyDate { day: string; name: string; short: string }

export function keyDates(board: MktBoard): KeyDate[] {
  return board.holidays
    .map(h => ({ day: h.day, name: h.name, short: h.name.split(/\s+/)[0].slice(0, 12) || h.name }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

// ── The projects table ───────────────────────────────────────────────────────────
export interface SubProjectRow extends ProjectRow {
  /** The group of the stage it is at (else its first) — a People title. */
  team: MktGroup | null
  /** Its stages done, of all of them. */
  done: number
  total: number
  /** Its owner's first name — else whoever's stage it is at; '—' for nobody. */
  owner: string
}

export function subProjects(board: MktBoard, sub: string): SubProjectRow[] {
  const ix = indexBoard(board)
  const byId = new Map(board.projects.map(p => [p.id, p]))
  return projectRows(board).filter(r => r.sub?.id === sub).map(r => {
    const p = byId.get(r.id)
    const stages = ix.stagesOf(r.id)
    const cur = stages.find(s => s.idx === p?.cur) ?? stages[0] ?? null
    const done = p?.status === 'done' ? stages.length : stages.filter(s => s.status === 'done' || (p ? s.idx < p.cur : false)).length
    // Its owner on Marketing's roster — else (the Principal made it) whoever's stage it is at.
    const owner = ix.person(p?.owner ?? null) ?? ix.person(cur?.owner ?? null)
    return { ...r, team: cur?.dept || null, done, total: stages.length, owner: owner?.first || owner?.full || '—' }
  })
}

// ── The timeline ─────────────────────────────────────────────────────────────────
export interface TimelineWindow { start: string; days: number }

/** Ten weeks from the Monday two weeks back. */
export const timelineWindow = (today: string): TimelineWindow => ({ start: addDays(mondayOf(today), -14), days: 70 })

const pct = (w: TimelineWindow, day: string) => (daysBetween(w.start, day) / w.days) * 100

export interface TimelineBar {
  id: string
  trackId: string
  title: string
  team: MktGroup | null
  tone: ProjectRow['tone']
  left: number
  width: number
  range: string
  /** What the bar says: its span, or its due day when the span does not fit. */
  label: string
}

/** Each project with a span (its start and its due day) that touches the window, clipped to it. */
export function timelineBars(board: MktBoard, rows: readonly SubProjectRow[], w: TimelineWindow): TimelineBar[] {
  const byId = new Map(board.projects.map(p => [p.id, p]))
  const end = addDays(w.start, w.days - 1)
  const out: TimelineBar[] = []
  for (const r of rows) {
    const p = byId.get(r.id)
    const made = p?.createdAt ? officeTime(p.createdAt) : null
    const from = p?.startsOn ?? (made?.isValid() ? made.format('YYYY-MM-DD') : null)
    const to = p?.dueOn ?? r.due
    if (!from || !to || to < w.start || from > end) continue
    const a = from < w.start ? w.start : from
    const b = to > end ? end : to
    const width = ((daysBetween(a, b) + 1) / w.days) * 100
    const range = `${shortDay(from)} – ${shortDay(to)}`
    out.push({
      id: r.id, trackId: r.trackId, title: r.title, team: r.team, tone: r.tone,
      left: pct(w, a), width, range, label: width >= 16 ? range : shortDay(to),
    })
  }
  return out
}

export interface TimelineCampaign extends SubCampaign {
  left: number
  width: number
  /** "9 – 12 Nov 2026" */
  range: string
  /** What its bar says: "Truck event · 9 – 12 Nov". */
  label: string
}

/** Each campaign whose run touches the window, clipped to it (the timeline's 📢 Campaigns). */
export function timelineCampaigns(list: readonly SubCampaign[], w: TimelineWindow): TimelineCampaign[] {
  const end = addDays(w.start, w.days - 1)
  return list.filter(c => c.until >= w.start && c.from <= end).map(c => {
    const a = c.from < w.start ? w.start : c.from
    const b = c.until > end ? end : c.until
    return { ...c, left: pct(w, a), width: ((daysBetween(a, b) + 1) / w.days) * 100, range: periodWords(c.from, c.until), label: `${c.short} · ${spanWords(c.from, c.until)}` }
  })
}

/** The days two campaigns share, on the timeline's ⚠️ Overlaps row — clipped to the window. */
export function timelineOverlaps(ov: readonly CampaignOverlap[], w: TimelineWindow): { key: string; left: number; width: number; title: string }[] {
  const end = addDays(w.start, w.days - 1)
  return ov.filter(o => o.until >= w.start && o.from <= end).map(o => {
    const a = o.from < w.start ? w.start : o.from
    const b = o.until > end ? end : o.until
    return { key: `${o.a.id}:${o.b.id}`, left: pct(w, a), width: ((daysBetween(a, b) + 1) / w.days) * 100, title: `${o.a.short} overlaps ${o.b.short} · ${spanWords(o.from, o.until)}` }
  })
}

/** The timeline's head: each month's name where it starts, each Monday's day. */
export function timelineHeads(w: TimelineWindow): { months: { name: string; left: number }[]; weeks: { n: number; left: number }[] } {
  const months: { name: string; left: number }[] = []
  const weeks: { n: number; left: number }[] = []
  for (let i = 0; i < w.days; i++) {
    const d = addDays(w.start, i)
    if (i === 0 || d.slice(8, 10) === '01') months.push({ name: i === 0 && d.slice(8, 10) !== '01' ? MONTH_SHORT[+d.slice(5, 7) - 1] : MONTH_NAMES[+d.slice(5, 7) - 1], left: (i / w.days) * 100 })
    if (i % 7 === 0) weeks.push({ n: +d.slice(8, 10), left: (i / w.days) * 100 })
  }
  return { months, weeks }
}

export const timelineLeft = (w: TimelineWindow, day: string) => ((daysBetween(w.start, day) + 0.5) / w.days) * 100
export const timelineTitle = (w: TimelineWindow) => {
  const end = addDays(w.start, w.days - 1)
  return `${MONTH_SHORT[+w.start.slice(5, 7) - 1]} – ${MONTH_SHORT[+end.slice(5, 7) - 1]} ${end.slice(0, 4)}`
}

// ── ⚡ Recent activity ───────────────────────────────────────────────────────────
export interface SubFeedEvent extends TaskEvent {
  project: { id: string; track: string; title: string; kind: MktProjectKind }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** mkt_sub_feed(sub, limit). */
export function subFeedFromRow(v: unknown): SubFeedEvent[] {
  return (Array.isArray(v) ? v : []).filter(isObj).map(e => {
    const p = isObj(e.project) ? e.project : {}
    return {
      ...eventFromRow(e),
      project: { id: str(p.id), track: str(p.track), title: str(p.title), kind: p.kind === 'product' ? 'product' : p.kind === 'recurring' ? 'recurring' : 'quick' },
    }
  })
}

const FEED_EMOJI: Record<string, string> = {
  created: '✨', opened: '📬', accepted: '👍', picked: '🔓', submitted: '📤', approved: '✅', changes: '↩️', completed: '🏁',
  closed: '🏁', nudged: '👋', paused: '⏸', resumed: '▶', ended: '⏹', 'link sent': '🔗', resent: '🔗', 'pic approved': '🔗',
  'pic changes': '🔗', signed: '✍️', 'minutes completed': '📝', 'edited after approval': '✏️', 'started before approval': '⚡',
  attached: '📚', detached: '📚', replaced: '🔁',
  'work started': '▶', 'run made': '🔁', 'run day': '📅', 'amount set': '💰', 'billing confirmed': '💰', 'billing withdrawn': '💰', stopped: '⏹',
  'campaign period': '📢',
}

/** "just now", "12 min ago", "3h ago", "yesterday", else the day — `now` an instant (ms). */
export function agoLabel(at: string, now: number, today: string): string {
  const t = Date.parse(at)
  if (!Number.isFinite(t)) return ''
  const mins = Math.floor((now - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const day = officeTime(at).format('YYYY-MM-DD')
  if (day === today) return `${Math.floor(mins / 60)}h ago`
  if (daysBetween(day, today) === 1) return 'yesterday'
  return shortDay(day)
}

/** What only a product project's trail says (its minutes and its PIC's link); its stages read as a task's do. */
const PRODUCT_ACTIONS = new Set(['created', 'signed', 'link sent', 'minutes completed', 'edited after approval', 'started before approval', 'resent', 'pic approved', 'pic changes',
  // Its work, its months, its billing (never a figure), its owner replaced, its campaign period — the product page's own words.
  'work started', 'run made', 'run day', 'closed', 'amount set', 'billing confirmed', 'billing withdrawn', 'stopped', 'replaced', 'campaign period'])

/** A feed line: what happened on which project, in the trail's own words. */
export function feedLine(e: SubFeedEvent): { key: string; emoji: string; text: string; href: string } {
  // A product project's "created" line names its product as its page does — the event carries it.
  const product = typeof e.data?.product === 'string' ? { name: e.data.product, version: Number(e.data.version) || 1 } : null
  const text = e.project.kind === 'product' && PRODUCT_ACTIONS.has(e.action)
    ? productEventText(e, product)
    : eventText(e, { project: { title: e.project.title } as MktTaskPage['project'], stages: [] })
  return { key: String(e.id), emoji: FEED_EMOJI[e.action] ?? '•', text, href: `/marketing/projects/${encodeURIComponent(e.project.track)}` }
}

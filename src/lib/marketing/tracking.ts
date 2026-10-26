// The Tracking Dashboard (`Tracking Dashboard.dc.html`, the manager's): every ongoing task — its current stage, who
// has it, how long it has sat there — read two ways: by people (what each person is on now, their load against their
// capacity, how often they finish on time) and by workflow (each task in its stage's column, the slowest stage
// flagged). Five counts on top: Ongoing, Needs you (overdue or waiting for an OK), Overdue, At risk, On track.
//
// A task's state, the first that holds:
//   red      its stage's date has passed; a delivery came back 3 times or more; or its stage has waited 4 working
//            hours for its owner to Accept (2026-10-24 — the user: "4 个工作小时")
//   waiting  the stage waits for an approval (a person, or the PIC through the link)
//   risk     due today; or the stages left need more working days than remain before the project's own date
//   ok       moving as planned
// Working days are Monday to Friday, less HR's holidays that Selangor keeps (Attendance › Holidays); working hours
// those days' 09:00–13:00 and 14:00–18:00, office time (board.ts › workingHours). Pure.

import {
  ACCEPT_HOURS, addDays, approverNow, daysBetween, indexBoard, isSeries, runsStages, shortDay, weekdayOf, workingHours, type MktBoard,
  type MktProjectKind, type MktSub,
} from './board'

export type TrackTone = 'red' | 'waiting' | 'risk' | 'ok'
export type TrackStatus = 'All' | 'attention' | 'red' | 'risk' | 'ok'
export type TrackPeriod = { kind: 'week' | 'month' } | { kind: 'custom'; from: string; to: string }

export interface TrackTask {
  projectId: string
  trackId: string
  title: string
  sub: MktSub | null
  flow: string
  flowName: string
  flowIcon: string
  cur: number
  stages: string[]
  stageName: string
  owner: string | null
  ownerName: string
  /** Who it waits on now — its stage's owner, or its approver; null while the PIC has it. Nudge goes to them. */
  waitsOn: string | null
  tone: TrackTone
  why: string
  due: string | null
  /** Days on this stage, to a tenth. */
  days: number
}

const RANK: Record<TrackTone, number> = { red: 0, waiting: 1, risk: 2, ok: 3 }
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** The working days after `from`, up to and including `to` (Monday to Friday, less the holidays). */
export function workingDays(from: string, to: string, holidays: ReadonlySet<string>): number {
  let n = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (weekdayOf(d) < 5 && !holidays.has(d)) n += 1
  return n
}

/** "3 hours", "2 days" — how long something has waited. */
function waited(since: string | null, now: Date): string {
  if (!since) return ''
  const h = Math.max(0, (now.getTime() - Date.parse(since)) / 36e5)
  return h < 24 ? plural(Math.max(1, Math.floor(h)), 'hour') : plural(Math.floor(h / 24), 'day')
}

const FLOW: Record<MktProjectKind, { icon: string; name: string }> = {
  product: { icon: '📦', name: 'Product projects' },
  quick: { icon: '⚡', name: 'Quick tasks' },
  recurring: { icon: '🔁', name: 'Recurring tasks' },
  deliverable: { icon: '📦', name: 'Deliverables' },
}

export function trackTasks(board: MktBoard, now: Date): TrackTask[] {
  const ix = indexBoard(board)
  const holidays = new Set(board.holidays.map(h => h.day))
  const first = (id: string | null | undefined) => ix.person(id)?.first || ix.person(id)?.full || '—'
  const today = board.today
  const out: TrackTask[] = []
  for (const p of board.projects) {
    if (!runsStages(p) || isSeries(p)) continue
    const stages = ix.stagesOf(p.id)
    const s = stages.find(x => x.idx === p.cur)
    if (!s) continue
    const since = s.enteredAt ?? p.updatedAt
    const days = since ? Math.max(0, Math.round(((now.getTime() - Date.parse(since)) / 864e5) * 10) / 10) : 0
    const returns = Math.max(0, ...ix.subtasksOf(p.id, s.idx).map(t => t.returns))
    const appr = approverNow(s)
    let tone: TrackTone = 'ok'
    let why = ''
    const late = s.dueOn && today ? daysBetween(s.dueOn, today) : 0
    if (late > 0) {
      tone = 'red'
      why = `${s.name} overdue ${plural(late, 'day')}`
    } else if (returns >= 3) {
      tone = 'red'
      why = `Delivery returned ${plural(returns, 'time')}`
    } else if (s.status === 'todo' && s.enteredAt && workingHours(s.enteredAt, now, holidays) >= ACCEPT_HOURS) {
      tone = 'red'
      why = `Not accepted · ${plural(Math.floor(workingHours(s.enteredAt, now, holidays)), 'working hour')}`
    } else if (appr) {
      tone = 'waiting'
      const wait = waited(s.submittedAt, now)
      why = appr.kind === 'pic'
        ? `Waiting for PIC${p.pic ? ` (${p.pic})` : ''}${wait ? ` · ${wait}` : ''}`
        : `Waiting for ${first(appr.staff)}’s approval${wait ? ` · ${wait}` : ''}`
    } else if (s.dueOn && s.dueOn === today) {
      tone = 'risk'
      why = 'Due today'
    } else if (p.dueOn && today) {
      const need = stages.filter(x => x.idx >= s.idx && x.status !== 'done').reduce((n, x) => n + x.sla, 0)
      const left = workingDays(today, p.dueOn, holidays)
      if (need > left) {
        tone = 'risk'
        why = `${plural(need, 'SLA day')} left, ${plural(left, 'working day')} to deadline`
      }
    }
    // A deliverable runs on its action's workflow — its lane is that workflow's (②b-2a).
    const onWorkflow = p.kind === 'product' || p.kind === 'deliverable'
    const flow = onWorkflow ? `wf:${p.workflow ?? ''}` : p.kind
    out.push({
      projectId: p.id,
      trackId: p.trackId,
      title: p.title,
      sub: ix.sub(p.sub) ?? null,
      flow,
      flowName: onWorkflow ? p.workflow || FLOW[p.kind].name : FLOW[p.kind].name,
      flowIcon: FLOW[p.kind].icon,
      cur: s.idx,
      stages: stages.map(x => x.name),
      stageName: s.name,
      owner: s.owner,
      ownerName: first(s.owner),
      waitsOn: appr ? (appr.kind === 'person' ? appr.staff : null) : s.owner,
      tone,
      why,
      due: s.dueOn,
      days,
    })
  }
  return out.sort((a, b) => RANK[a.tone] - RANK[b.tone] || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
}

export interface TrackFilter {
  period: TrackPeriod
  sub: string
  flow: string
  person: string
  status: TrackStatus
}

export const NO_FILTER: TrackFilter = { period: { kind: 'month' }, sub: 'All', flow: 'All', person: 'All', status: 'All' }

/** The days a period covers — the stages finished in it make a person's on-time and days-per-stage figures. */
export function periodRange(period: TrackPeriod, today: string): { from: string; to: string } {
  if (period.kind === 'custom') return { from: period.from, to: period.to }
  if (period.kind === 'week') {
    const mon = addDays(today, -weekdayOf(today))
    return { from: mon, to: addDays(mon, 6) }
  }
  const from = `${today.slice(0, 7)}-01`
  const next = +today.slice(5, 7) === 12 ? `${+today.slice(0, 4) + 1}-01-01` : `${today.slice(0, 5)}${String(+today.slice(5, 7) + 1).padStart(2, '0')}-01`
  return { from, to: addDays(next, -1) }
}

const statusPasses = (t: TrackTask, s: TrackStatus) =>
  s === 'All' || (s === 'attention' ? t.tone === 'red' || t.tone === 'waiting' : t.tone === s)

/** The tasks the counts are made of: every filter but the status card's. Every ongoing task is the period's. */
export function countPool(tasks: TrackTask[], f: TrackFilter): TrackTask[] {
  return tasks.filter(t =>
    (f.sub === 'All' || t.sub?.id === f.sub) && (f.flow === 'All' || t.flow === f.flow) && (f.person === 'All' || t.owner === f.person))
}

export function filterTasks(tasks: TrackTask[], f: TrackFilter): TrackTask[] {
  return countPool(tasks, f).filter(t => statusPasses(t, f.status))
}

export function trackCounts(pool: TrackTask[]): Record<TrackStatus, number> {
  return {
    All: pool.length,
    attention: pool.filter(t => t.tone === 'red' || t.tone === 'waiting').length,
    red: pool.filter(t => t.tone === 'red').length,
    risk: pool.filter(t => t.tone === 'risk').length,
    ok: pool.filter(t => t.tone === 'ok').length,
  }
}

export interface PersonCard {
  id: string
  name: string
  role: string
  team: string | null
  capacity: number
  red: number
  waiting: number
  /** Every task of theirs in the pool (the load), red first. */
  load: TrackTask[]
  /** Those the filters show. */
  shown: TrackTask[]
  loadLabel: string
  loadTone: 'over' | 'full' | 'free' | 'some'
  onTime: number | null
  avgDays: number | null
}

export function peopleCards(board: MktBoard, pool: TrackTask[], shown: TrackTask[], f: TrackFilter): PersonCard[] {
  const r = board.today ? periodRange(f.period, board.today) : null
  const done = board.stages.filter(s => {
    const day = s.doneAt?.slice(0, 10)
    return s.status === 'done' && !!day && !!s.owner && (!r || (day >= r.from && day <= r.to))
  })
  return board.team
    .filter(p => f.person === 'All' || p.id === f.person)
    .map(p => {
      const load = pool.filter(t => t.owner === p.id).sort((a, b) => RANK[a.tone] - RANK[b.tone])
      const mine = shown.filter(t => t.owner === p.id)
      const finished = done.filter(s => s.owner === p.id)
      const dated = finished.filter(s => s.dueOn)
      const spans = finished.filter(s => s.enteredAt).map(s => (Date.parse(s.doneAt as string) - Date.parse(s.enteredAt as string)) / 864e5)
      const n = load.length
      const cap = p.capacity
      return {
        id: p.id,
        name: p.first || p.full,
        role: p.role || p.title || '',
        team: p.team,
        capacity: cap,
        red: load.filter(t => t.tone === 'red').length,
        waiting: load.filter(t => t.tone === 'waiting' || t.tone === 'risk').length,
        load,
        shown: mine,
        loadLabel: n > cap ? 'Over capacity' : n === cap ? 'Full' : n === 0 ? 'Free' : `${n} of ${cap} slots`,
        loadTone: n > cap ? 'over' : n === cap ? 'full' : n === 0 ? 'free' : 'some',
        onTime: dated.length ? Math.round((dated.filter(s => (s.doneAt as string).slice(0, 10) <= (s.dueOn as string)).length / dated.length) * 100) : null,
        avgDays: spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null,
      } satisfies PersonCard
    })
    .filter(c => f.status === 'All' || c.shown.length > 0)
    .sort((a, b) => b.red - a.red || b.load.length - a.load.length || a.name.localeCompare(b.name))
}

export interface FlowLane {
  key: string
  name: string
  icon: string
  count: number
  red: number
  /** Average way through, 0–100. */
  pct: number
  columns: { name: string; tasks: TrackTask[]; avg: number; slow: boolean }[]
}

export function flowLanes(tasks: TrackTask[]): FlowLane[] {
  const groups = new Map<string, TrackTask[]>()
  for (const t of tasks) groups.set(t.flow, [...(groups.get(t.flow) ?? []), t])
  return [...groups.entries()].map(([key, list]) => {
    const width = Math.max(...list.map(t => t.stages.length))
    const names = Array.from({ length: width }, (_, i) => {
      const seen = new Map<string, number>()
      for (const t of list) if (t.stages[i]) seen.set(t.stages[i], (seen.get(t.stages[i]) ?? 0) + 1)
      return [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `Stage ${i + 1}`
    })
    const avgs = names.map((_, i) => {
      const xs = list.filter(t => t.cur === i)
      return xs.length ? xs.reduce((a, t) => a + t.days, 0) / xs.length : 0
    })
    const slowest = avgs.indexOf(Math.max(...avgs))
    return {
      key,
      name: list[0].flowName,
      icon: list[0].flowIcon,
      count: list.length,
      red: list.filter(t => t.tone === 'red').length,
      pct: Math.round((list.reduce((a, t) => a + (t.cur + 0.5) / Math.max(1, t.stages.length), 0) / list.length) * 100),
      columns: names.map((name, i) => ({
        name,
        tasks: list.filter(t => t.cur === i).sort((a, b) => RANK[a.tone] - RANK[b.tone]),
        avg: Math.round(avgs[i] * 10) / 10,
        slow: i === slowest && avgs[i] >= 2,
      })),
    }
  }).sort((a, b) => b.count - a.count)
}

/** The workflows the filter lists. */
export function flowOptions(tasks: TrackTask[]): { key: string; name: string }[] {
  const m = new Map<string, string>()
  for (const t of tasks) if (!m.has(t.flow)) m.set(t.flow, t.flowName)
  return [...m.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export const dueLabel = (d: string | null) => (d ? `Due ${shortDay(d)}` : 'No date')
